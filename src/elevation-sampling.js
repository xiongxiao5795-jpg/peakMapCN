import { loadTerrainBitmap } from './terrain-data.js';
import { decodeTerrarium } from './terrain-integrity.js';
import { repairAwsTerrain } from './terrain-integrity-browser.js';
import { terrainSourceMaxZoom } from './terrain-source-level.js';

// Samples real-height Terrarium data, independent of display exaggeration;
// clearly corrupted AWS stripes receive the same repair as the terrain mesh.
export async function sampleElevations(points, {zoom=10, chinaOnly=true, signal, source='mapterhorn'}={}) {
  const z=Math.max(0,Math.min(terrainSourceMaxZoom(source),Math.floor(zoom))), n=2**z, groups=new Map();
  points.forEach(([lng,lat],index)=>{
    const x=(lng+180)/360*n, phi=Math.max(-85.0511,Math.min(85.0511,lat))*Math.PI/180;
    const y=(1-Math.asinh(Math.tan(phi))/Math.PI)/2*n, tx=((Math.floor(x)%n)+n)%n, ty=Math.max(0,Math.min(n-1,Math.floor(y)));
    const key=`${tx}/${ty}`, group=groups.get(key)||{tx,ty,items:[]};
    group.items.push({index,fx:x-Math.floor(x),fy:y-Math.floor(y)});groups.set(key,group);
  });
  const values=Array(points.length).fill(null), controller=signal?null:new AbortController(), activeSignal=signal||controller.signal;
  await Promise.all([...groups.values()].map(async group=>{
    try {
      const {bitmap,tile}=await loadTerrainBitmap(z,group.tx,group.ty,chinaOnly,activeSignal,source);
      try {
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
        if(source==='aws'&&z>=12)await repairAwsTerrain(ctx,canvas.width,z,group.tx,group.ty,chinaOnly,activeSignal);
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        for(const item of group.items){
          const fx=tile?(tile.dx+item.fx)/tile.scale:item.fx, fy=tile?(tile.dy+item.fy)/tile.scale:item.fy;
          const x=Math.max(0,Math.min(canvas.width-1,Math.floor(fx*canvas.width))),y=Math.max(0,Math.min(canvas.height-1,Math.floor(fy*canvas.height))),index=(y*canvas.width+x)*4;
          if(pixels[index+3]>=128)values[item.index]=decodeTerrarium(pixels,index);
        }
      } finally {bitmap.close()}
    } catch(error) {if(activeSignal.aborted)throw error;}
  }));
  return values;
}
export function distanceKm(a,b){const rad=Math.PI/180, dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;const t=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(t)))}
