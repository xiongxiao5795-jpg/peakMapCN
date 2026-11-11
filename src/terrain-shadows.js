// Cast rays toward the sun over a padded, same-resolution DEM. Grid nodes are
// aligned in world space, including one shared node on each tile edge.
export const SHADOW_GRID_SIZE=128;
export const SHADOW_RADIUS=32;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

export function terrainShadowAt({heights,valid,width,x,y,sun,metresPerPixel,radius}){
  const horizontal=Math.hypot(sun[0],sun[1]);
  if(sun[2]<=0||horizontal<1e-6||!Number.isFinite(metresPerPixel)||metresPerPixel<=0)return 0;
  const index=Math.round(y)*width+Math.round(x);
  if(!valid[index])return 0;
  const base=heights[index],dx=sun[0]/horizontal,dy=-sun[1]/horizontal,tanAltitude=sun[2]/horizontal;
  let obstruction=0;
  // At most 16 probes; the same physical sample positions are used by both
  // neighbours at their shared edge, including diagonal rays.
  const count=16;
  for(let step=1;step<=count;step++){
    const distance=radius*step/count,sx=Math.round(x+dx*distance),sy=Math.round(y+dy*distance);
    if(sx<0||sy<0||sx>=width||sy>=width)break;
    const si=sy*width+sx;if(!valid[si])break;
    const excess=heights[si]-base-distance*metresPerPixel*tanAltitude;
    if(excess>0)obstruction=Math.max(obstruction,clamp(excess/Math.max(2,metresPerPixel*.25),0,1));
    if(obstruction>=1)break;
  }
  // Reduce hard flicker as the sun crosses the horizon.
  return obstruction*clamp(sun[2]/0.04,0,1);
}

export function buildShadowGrid({heights,valid,width,pad,size,sunAt,metresAt}){
  const n=SHADOW_GRID_SIZE,scale=size/n,result=new Float32Array((n+1)*(n+1));
  for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){
    const px=x*scale,py=y*scale;
    result[y*(n+1)+x]=terrainShadowAt({heights,valid,width,x:pad+px,y:pad+py,sun:sunAt(px,py),metresPerPixel:metresAt(py),radius:SHADOW_RADIUS*scale});
  }
  return result;
}

export function sampleShadowGrid(grid,x,y,size){
  const n=SHADOW_GRID_SIZE,fx=clamp(x/size*n,0,n),fy=clamp(y/size*n,0,n),ix=Math.min(n-1,Math.floor(fx)),iy=Math.min(n-1,Math.floor(fy)),tx=fx-ix,ty=fy-iy;
  const a=iy*(n+1)+ix,b=a+1,c=a+n+1,d=c+1;
  return (grid[a]*(1-tx)+grid[b]*tx)*(1-ty)+(grid[c]*(1-tx)+grid[d]*tx)*ty;
}
