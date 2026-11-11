import { loadTerrainBitmap } from './terrain-data.js';

// Samples the unmodified Terrarium heights, independent of display exaggeration.
export async function sampleElevations(points, {zoom=10, chinaOnly=true, signal, source='mapterhorn'}={}) {
  const z=Math.max(0,Math.min(12,Math.floor(zoom))), n=2**z, groups=new Map();
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
        for(const item of group.items){
          const fx=tile?(tile.dx+item.fx)/tile.scale:item.fx, fy=tile?(tile.dy+item.fy)/tile.scale:item.fy;
          const pixel=ctx.getImageData(Math.max(0,Math.min(canvas.width-1,Math.floor(fx*canvas.width))),Math.max(0,Math.min(canvas.height-1,Math.floor(fy*canvas.height))),1,1).data;
          if(pixel[3]>=128)values[item.index]=pixel[0]*256+pixel[1]+pixel[2]/256-32768;
        }
      } finally {bitmap.close()}
    } catch(error) {if(activeSignal.aborted)throw error;}
  }));
  return values;
}
export function distanceKm(a,b){const rad=Math.PI/180, dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;const t=Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;return 12742*Math.asin(Math.min(1,Math.sqrt(t)))}
