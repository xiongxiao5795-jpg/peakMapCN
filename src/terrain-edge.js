// Fade the display mesh to sea level just inside the cut-out. The padded mask
// includes adjacent tiles, so crossing a tile edge does not create a new seam.
export function softenTerrainEdge(heights, mask, size, padding) {
  const width=size+padding*2, distance=new Uint16Array(width*width), limit=padding*3;
  for(let i=0;i<distance.length;i++)distance[i]=mask[i]?limit:0;
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const i=y*width+x;
    if(x)distance[i]=Math.min(distance[i],distance[i-1]+3);
    if(y)distance[i]=Math.min(distance[i],distance[i-width]+3);
    if(x&&y)distance[i]=Math.min(distance[i],distance[i-width-1]+4);
    if(x+1<width&&y)distance[i]=Math.min(distance[i],distance[i-width+1]+4);
  }
  for(let y=width-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const i=y*width+x;
    if(x+1<width)distance[i]=Math.min(distance[i],distance[i+1]+3);
    if(y+1<width)distance[i]=Math.min(distance[i],distance[i+width]+3);
    if(x+1<width&&y+1<width)distance[i]=Math.min(distance[i],distance[i+width+1]+4);
    if(x&&y+1<width)distance[i]=Math.min(distance[i],distance[i+width-1]+4);
  }
  const result=new Float32Array(heights.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=y*size+x, t=Math.min(1,distance[(y+padding)*width+x+padding]/limit);
    result[i]=heights[i]*t*t*(3-2*t);
  }
  return result;
}
