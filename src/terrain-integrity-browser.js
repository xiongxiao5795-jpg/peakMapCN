import {loadTerrainBitmap} from './terrain-data.js';
import {repairTerrainStripes,terrainEdgeCandidates,terrainEdgeHasCoverage,repairTerrainEdge} from './terrain-integrity.js';

const canvasFor=size=>{const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(size,size):document.createElement('canvas');canvas.width=canvas.height=size;return canvas};

// Repair suspect edge stripes only when a matching neighbour corroborates the
// error; otherwise keep the original data instead of inventing elevations.
export async function repairAwsTerrain(rawctx,size,z,x,y,chinaOnly,signal){
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const image=rawctx.getImageData(0,0,size,size);let repaired=repairTerrainStripes(image.data,size,size);
  const edges=terrainEdgeCandidates(image.data,size,size);
  if(edges.length){
    const n=2**z,neighbors=new AbortController(),abort=()=>neighbors.abort(),timer=setTimeout(abort,2000);let missingNeighbor=false;
    signal.addEventListener('abort',abort,{once:true});
    try{
      await Promise.all(edges.map(async edge=>{
        const [dx,dy]=({top:[0,-1],bottom:[0,1],left:[-1,0],right:[1,0]})[edge],nx=(x+dx+n)%n,ny=y+dy;
        if(ny<0||ny>=n)return;
        try{
          const {bitmap}=await loadTerrainBitmap(z,nx,ny,chinaOnly,neighbors.signal,'aws');
          try{const canvas=canvasFor(size),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(bitmap,0,0,size,size);const adjacent=ctx.getImageData(0,0,size,size).data;if(!terrainEdgeHasCoverage(image.data,adjacent,size,size,edge)){missingNeighbor=true;return}repaired+=repairTerrainEdge(image.data,adjacent,size,size,edge)}finally{bitmap.close()}
        }catch(error){if(signal.aborted)throw error;missingNeighbor=true}
      }));
    }finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}
    // A suspected corrupt border must not become a giant artificial wall when
    // its neighbour cannot be checked. MapLibre can retain a parent tile.
    if(missingNeighbor)throw new Error('Unable to verify an elevation tile boundary');
  }
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  if(repaired)rawctx.putImageData(image,0,0);
  return repaired;
}
