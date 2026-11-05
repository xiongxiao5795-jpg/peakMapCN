import booleanIntersects from '@turf/boolean-intersects';
import { polygon } from '@turf/helpers';
import provinces from '../data/china-provinces.json';
import { lightVector, lightFactor, elevationHaze } from './lighting.js';

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
function makeMask(size,z,x,y,parts){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),n=2**z;
  ctx.fillStyle='#fff';
  for(const part of parts){ctx.beginPath();for(const ring of part.coordinates){ring.forEach(([lon,lat],i)=>{const px=((lon+180)/360*n-x)*size,py=(mercatorY(lat)*n-y)*size;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py)});ctx.closePath()}ctx.fill('evenodd')}
  return canvas;
}
const blobData=canvas=>new Promise(resolve=>canvas.toBlob(resolve,'image/png')).then(blob=>blob.arrayBuffer());
async function tile(params,controller,chinaOnly,color){
  const match=params.url.match(/\/(\d+)\/(\d+)\/(\d+)\.webp/);if(!match)throw new Error('Invalid terrain tile URL');
  const [,zs,xs,ys]=match, z=+zs,x=+xs,y=+ys, parts=chinaOnly?tilePolygons(z,x,y):null;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(!color){ctx.fillStyle='rgb(128,0,0)';ctx.fillRect(0,0,512,512)}
  // Never request a remote elevation tile that does not intersect a land polygon.
  if(chinaOnly&&!parts.length)return {data:await blobData(canvas)};
  const response=await fetch(`https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`,{signal:controller.signal});if(!response.ok)throw Error(`Terrain tile ${response.status}`);
  const bitmap=await createImageBitmap(await response.blob()), raw=document.createElement('canvas');raw.width=raw.height=512;const rawctx=raw.getContext('2d',{willReadFrequently:true});rawctx.drawImage(bitmap,0,0,512,512);bitmap.close();
  if(color){
    const image=rawctx.getImageData(0,0,512,512), pixels=image.data, heights=new Float32Array(512*512);
    for(let i=0;i<heights.length;i++){const j=i*4;heights[i]=pixels[j]*256+pixels[j+1]+pixels[j+2]/256-32768}
    const query=new URLSearchParams(params.url.split('?')[1]||'');
    const strength=Math.max(0,Math.min(1,Number(query.get('strength')||0)/100));
    const vector=lightVector(Number(query.get('az')||0),Number(query.get('alt')||0));
    const haze=Math.max(0,Math.min(1,Number(query.get('haze')||0)/100)), altitudeMix=Math.max(0,Math.min(1,Number(query.get('elevation')||0)/100)), tint=query.get('tone')==='moon'?[187,211,245]:[255,229,177];
    const centerLat=tileLat(y+0.5,2**z), metersPerPixel=40075016.686*Math.cos(centerLat*Math.PI/180)/(512*2**z);
    // A visual slope scale makes lighting readable at overview scales; elevations themselves stay unchanged.
    const slopeScale=35/(2*metersPerPixel);
    for(let i=0;i<heights.length;i++){
      const px=i%512,py=Math.floor(i/512),east=(heights[py*512+Math.min(511,px+1)]-heights[py*512+Math.max(0,px-1)])*slopeScale;
      const north=(heights[Math.max(0,py-1)*512+px]-heights[Math.min(511,py+1)*512+px])*slopeScale;
      const shade=lightFactor(east,north,vector,strength),c=elevationColor(heights[i]),j=i*4,alpha=elevationHaze(heights[i],haze,altitudeMix);
      pixels[j]=Math.min(255,c[0]*shade*(1-alpha)+tint[0]*alpha);pixels[j+1]=Math.min(255,c[1]*shade*(1-alpha)+tint[1]*alpha);pixels[j+2]=Math.min(255,c[2]*shade*(1-alpha)+tint[2]*alpha);
    }
    rawctx.putImageData(image,0,0);
  }
  if(chinaOnly){rawctx.globalCompositeOperation='destination-in';rawctx.drawImage(makeMask(512,z,x,y,parts),0,0)}
  ctx.drawImage(raw,0,0);return {data:await blobData(canvas)};
}
export function registerTerrainProtocols(maplibre){
  for(const [scheme,chinaOnly,color] of [['dem-china',true,false],['dem-world',false,false],['relief-china',true,true],['relief-world',false,true]])maplibre.addProtocol(scheme,(params,controller)=>tile(params,controller,chinaOnly,color));
}
export const tileTemplate = (type,chinaOnly,lighting='') => `${type}-${chinaOnly?'china':'world'}://tiles.mapterhorn.com/{z}/{x}/{y}.webp${lighting?'?'+lighting:''}`;
