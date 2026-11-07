import booleanIntersects from '@turf/boolean-intersects';
import { polygon } from '@turf/helpers';
import provinces from '../data/china-provinces.json';
import { lightVector, lightFactor, solarBrightness, imageryShadowOpacity } from './lighting.js';
import { sunlightAt } from './sun.js';
import { loadTerrainBitmap, hasOverviewTile } from './terrain-data.js';
import { smoothTerrainHeights } from './terrain-smoothing.js';
import { softenTerrainEdge } from './terrain-edge.js';

// The final unnamed feature is a cartographic South China Sea inset, not land.
export const adminAreas = {...provinces, features: provinces.features.filter(f => f.properties.name)};
const polygons = adminAreas.features.flatMap(feature => {
  const groups = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  return groups.map(coordinates => {
    const outer = coordinates[0];
    const bounds = outer.reduce((b, [x,y]) => [Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)], [180,90,-180,-90]);
    return {coordinates, bounds, feature: polygon(coordinates)};
  });
});
const overlaps = (a,b) => a[0]<=b[2] && a[2]>=b[0] && a[1]<=b[3] && a[3]>=b[1];
const tileLat = (y,n) => Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;
const mercatorY = lat => (1-Math.asinh(Math.tan(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180))/Math.PI)/2;
const coverageCache = new Map();
function tilePolygons(z,x,y){
  const key=`${z}/${x}/${y}`;
  if(coverageCache.has(key))return coverageCache.get(key);
  const n=2**z, bounds=[x/n*360-180,tileLat(y+1,n),(x+1)/n*360-180,tileLat(y,n)];
  const [w,s,e,north]=bounds; const tile=polygon([[[w,s],[e,s],[e,north],[w,north],[w,s]]]);
  const found=polygons.filter(p=>overlaps(bounds,p.bounds)&&booleanIntersects(p.feature,tile));
  if(coverageCache.size>512)coverageCache.clear();
  coverageCache.set(key,found);return found;
}
export const intersectsChinaTile = (z,x,y) => tilePolygons(z,x,y).length > 0;
const stops = [[-12000,[5,14,19]],[-1,[5,14,19]],[0,[9,22,23]],[1,[40,75,44]],[200,[55,92,49]],[700,[94,112,64]],[1500,[139,137,79]],[2500,[171,153,97]],[3500,[184,159,112]],[4500,[167,151,118]],[5500,[199,191,166]],[7000,[236,233,217]],[9000,[252,251,242]]];
function elevationColor(h){let i=1;while(i<stops.length-1&&h>stops[i][0])i++;const [a,ca]=stops[i-1],[b,cb]=stops[i],t=Math.max(0,Math.min(1,(h-a)/(b-a)));return ca.map((v,j)=>Math.round(v+(cb[j]-v)*t));}
function makeMask(size,z,x,y,parts,padding=0){
  const canvas=makeCanvas(size+padding*2);const ctx=canvas.getContext('2d'),n=2**z;
  ctx.translate(padding,padding);
  ctx.fillStyle='#fff';
  for(const part of parts){ctx.beginPath();for(const ring of part.coordinates){ring.forEach(([lon,lat],i)=>{const px=((lon+180)/360*n-x)*size,py=(mercatorY(lat)*n-y)*size;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});ctx.closePath()}ctx.fill('evenodd')}
  return canvas;
}
const makeCanvas=(size)=>{const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(size,size):document.createElement('canvas');canvas.width=canvas.height=size;return canvas};
const blobData=canvas=>('convertToBlob' in canvas?canvas.convertToBlob({type:'image/png'}):new Promise(resolve=>canvas.toBlob(resolve,'image/png'))).then(blob=>blob.arrayBuffer());

// Shading needs values on both sides of a tile boundary. Build a narrow halo
// from the same-level neighbours before smoothing and computing gradients.
// If a neighbour cannot be loaded, extend the closest available edge instead.
async function paddedShadeHeights(raw,size,z,x,y,chinaOnly,controller,smooth){
  if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
  const pad=Math.ceil(size*24/256),width=size+2*pad,canvas=makeCanvas(width),ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(raw,0,0,1,size,0,pad,pad,size);ctx.drawImage(raw,size-1,0,1,size,pad+size,pad,pad,size);
  ctx.drawImage(raw,0,0,size,1,pad,0,size,pad);ctx.drawImage(raw,0,size-1,size,1,pad,pad+size,size,pad);
  for(const [sx,sy,dx,dy] of [[0,0,0,0],[size-1,0,pad+size,0],[0,size-1,0,pad+size],[size-1,size-1,pad+size,pad+size]])ctx.drawImage(raw,sx,sy,1,1,dx,dy,pad,pad);
  ctx.drawImage(raw,pad,pad);
  const n=2**z,jobs=[],neighbors=new AbortController();
  const abortNeighbors=()=>neighbors.abort();
  controller.signal.addEventListener('abort',abortNeighbors,{once:true});
  const neighborTimer=setTimeout(abortNeighbors,2000);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;
    const nx=(x+dx+n)%n,ny=y+dy;
    if(ny<0||ny>=n||(chinaOnly&&(!hasOverviewTile(z,nx,ny)||(z>6&&!intersectsChinaTile(z,nx,ny)))))continue;
    jobs.push((async()=>{
      try{
        const {bitmap,tile}=await loadTerrainBitmap(z,nx,ny,chinaOnly,neighbors.signal);
        try{
          const crop=tile?512/tile.scale:512,sx=tile?tile.dx*crop:0,sy=tile?tile.dy*crop:0;
          ctx.drawImage(bitmap,sx,sy,crop,crop,pad+dx*size,pad+dy*size,size,size);
        }finally{bitmap.close()}
      }catch(error){if(controller.signal.aborted)throw error}
    })());
  }
  try{await Promise.all(jobs)}finally{clearTimeout(neighborTimer);controller.signal.removeEventListener('abort',abortNeighbors)}
  if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
  const pixels=ctx.getImageData(0,0,width,width).data,heights=new Float32Array(width*width),mask=chinaOnly?new Uint8Array(width*width):null;
  for(let i=0;i<heights.length;i++){const j=i*4,valid=pixels[j+3]>=128;heights[i]=valid?pixels[j]*256+pixels[j+1]+pixels[j+2]/256-32768:0;if(mask)mask[i]=valid?1:0}
  return {heights:smoothTerrainHeights(heights,width,width,smooth,mask),width,pad};
}

export async function processImageryTile(params,controller,chinaOnly){
  const match=params.url.match(/\/(\d+)\/(\d+)\/(\d+)\.jpg/);if(!match)throw new Error('Invalid imagery tile URL');
  const [,zs,xs,ys]=match,z=+zs,x=+xs,y=+ys,parts=chinaOnly?tilePolygons(z,x,y):null;
  const canvas=makeCanvas(256),ctx=canvas.getContext('2d');
  if(chinaOnly&&!parts.length)return {data:await blobData(canvas),outside:true};
  for(let attempt=0;attempt<3;attempt++){
    const request=new AbortController(),abort=()=>request.abort(),timer=setTimeout(abort,12000);
    controller.signal.addEventListener('abort',abort,{once:true});
    try{
      if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
      const response=await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,{signal:request.signal});
      if(!response.ok)throw new Error(`Imagery tile ${response.status}`);
      const bitmap=await createImageBitmap(await response.blob());ctx.drawImage(bitmap,0,0,256,256);bitmap.close();break;
    }catch(error){
      if(controller.signal.aborted||attempt===2)throw error;
    }finally{clearTimeout(timer);controller.signal.removeEventListener('abort',abort)}
  }
  if(chinaOnly){ctx.globalCompositeOperation='destination-in';ctx.drawImage(makeMask(256,z,x,y,parts),0,0)}
  return {data:await blobData(canvas)};
}
export async function processTerrainTile(params,controller,chinaOnly,color){
  const match=params.url.match(/\/(\d+)\/(\d+)\/(\d+)\.webp/);if(!match)throw new Error('Invalid terrain tile URL');
  const [,zs,xs,ys]=match, z=+zs,x=+xs,y=+ys, parts=chinaOnly?tilePolygons(z,x,y):null;
  // A 128-pixel translucent shade mask is filtered over satellite imagery;
  // this keeps overlap processing affordable on mobile devices.
  const size=color==='shade'?128:512,canvas=makeCanvas(size);const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!color){ctx.fillStyle='rgb(128,0,0)';ctx.fillRect(0,0,size,size)}
  // Never request a remote elevation tile that does not intersect a land polygon.
  if(chinaOnly&&!parts.length)return {data:await blobData(canvas)};
  const {bitmap,tile}=await loadTerrainBitmap(z,x,y,chinaOnly,controller.signal),raw=makeCanvas(size);const rawctx=raw.getContext('2d',{willReadFrequently:true});
  // Interpolating encoded RGB channels produces false heights at byte boundaries.
  rawctx.imageSmoothingEnabled=false;
  if(tile&&tile.scale>1){const crop=512/tile.scale;rawctx.drawImage(bitmap,tile.dx*crop,tile.dy*crop,crop,crop,0,0,size,size)}
  else rawctx.drawImage(bitmap,0,0,size,size);
  bitmap.close();
  const query=new URLSearchParams(params.url.split('?')[1]||''),smooth=Math.max(0,Math.min(100,Number(query.get('smooth'))||0));
  const landMask=chinaOnly?makeMask(size,z,x,y,parts):null;
  if(color||smooth||chinaOnly){
    const image=rawctx.getImageData(0,0,size,size), pixels=image.data, original=new Float32Array(size*size);
    for(let i=0;i<original.length;i++){const j=i*4;original[i]=pixels[j+3]<128?0:pixels[j]*256+pixels[j+1]+pixels[j+2]/256-32768}
    let mask=null;
    if(landMask&&smooth){const alpha=landMask.getContext('2d',{willReadFrequently:true}).getImageData(0,0,size,size).data;mask=new Uint8Array(size*size);for(let i=0;i<mask.length;i++)mask[i]=alpha[i*4+3]>=128?1:0}
    let heights=smoothTerrainHeights(original,size,size,smooth,mask);
    const shadeData=color==='shade'?await paddedShadeHeights(raw,size,z,x,y,chinaOnly,controller,smooth):null;
    if(chinaOnly&&!color){
      const padding=Math.max(4,Math.min(96,Math.round(2**z)));
      const padded=makeMask(size,z,x,y,parts,padding),alpha=padded.getContext('2d',{willReadFrequently:true}).getImageData(0,0,size+padding*2,size+padding*2).data;
      const paddedMask=new Uint8Array(alpha.length/4);for(let i=0;i<paddedMask.length;i++)paddedMask[i]=alpha[i*4+3]>=128?1:0;
      heights=softenTerrainEdge(heights,paddedMask,size,padding);
    }
    if(!color){
      for(let i=0;i<heights.length;i++){const value=Math.max(0,Math.min(16777215,Math.round((heights[i]+32768)*256))),j=i*4;pixels[j]=value>>16;pixels[j+1]=(value>>8)&255;pixels[j+2]=value&255;pixels[j+3]=255}
    }else{
    const strength=Math.max(0,Math.min(1,Number(query.get('strength')||0)/100));
    const time=query.get('time')||'2026-06-21T12:00', gridSize=8, gridWidth=gridSize+1;
    const solar=new Float32Array(gridWidth*gridWidth*3), worldTiles=2**z;
    for(let gy=0;gy<=gridSize;gy++)for(let gx=0;gx<=gridSize;gx++){
      const lon=(x+gx/gridSize)/worldTiles*360-180, lat=tileLat(y+gy/gridSize,worldTiles);
      const sun=sunlightAt(time,lat,lon), vector=sun?lightVector(sun.azimuth,sun.altitude):[0,0,1],j=(gy*gridWidth+gx)*3;
      solar[j]=vector[0];solar[j+1]=vector[1];solar[j+2]=vector[2];
    }
    const centerLat=tileLat(y+0.5,worldTiles), metersPerPixel=40075016.686*Math.cos(centerLat*Math.PI/180)/(size*worldTiles);
    // Tile-local occlusion produces discontinuities at every tile boundary,
    // especially at 80×. Use slope lighting only until cross-tile shadows exist.
    const slopeScale=28/metersPerPixel;
    for(let i=0;i<heights.length;i++){
      const px=i%size,py=Math.floor(i/size),stride=shadeData?.width||size,offset=shadeData?.pad||0,values=shadeData?.heights||heights;
      const span=color==='shade'?2:4,gx0=px+offset,gy0=py+offset,left=Math.max(0,gx0-span),right=Math.min(stride-1,gx0+span),top=Math.max(0,gy0-span),bottom=Math.min(stride-1,gy0+span);
      const east=(values[gy0*stride+right]-values[gy0*stride+left])*slopeScale/(right-left);
      const north=(values[top*stride+gx0]-values[bottom*stride+gx0])*slopeScale/(bottom-top);
      const fx=px*gridSize/size,fy=py*gridSize/size,gx=Math.floor(fx),gy=Math.floor(fy),tx=fx-gx,ty=fy-gy;
      const a=(gy*gridWidth+gx)*3,b=a+3,c=a+gridWidth*3,d=c+3;
      const blend=k=>(solar[a+k]*(1-tx)+solar[b+k]*tx)*(1-ty)+(solar[c+k]*(1-tx)+solar[d+k]*tx)*ty;
      const vector=[blend(0),blend(1),blend(2)],day=solarBrightness(vector[2]);
      const j=i*4;
      if(color==='shade'){
        pixels[j]=0;pixels[j+1]=0;pixels[j+2]=0;
        pixels[j+3]=Math.round(255*imageryShadowOpacity(day,lightFactor(east,north,vector,1),strength));
      }else{
        const factor=(0.18+0.82*day)*lightFactor(east,north,vector,strength);
        const colorValue=elevationColor(heights[i]);
        pixels[j]=Math.min(255,colorValue[0]*factor);pixels[j+1]=Math.min(255,colorValue[1]*factor);pixels[j+2]=Math.min(255,colorValue[2]*factor*(1+0.20*(1-day)));
      }
    }
    }
    rawctx.putImageData(image,0,0);
  }
  if(chinaOnly&&color){rawctx.globalCompositeOperation='destination-in';rawctx.drawImage(landMask,0,0)}
  ctx.drawImage(raw,0,0);return {data:await blobData(canvas)};
}
