import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainShadowAt,buildShadowGrid,SHADOW_GRID_SIZE } from '../src/terrain-shadows.js';

function tile(tileX,{missing=false}={}){
  const size=128,pad=34,width=size+2*pad,heights=new Float32Array(width*width),valid=new Uint8Array(width*width);
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const worldX=tileX*size+x-pad;
    heights[y*width+x]=(worldX>=136&&worldX<=139)?80:0;
    valid[y*width+x]=missing&&worldX>=128?0:1;
  }
  return {size,pad,width,heights,valid};
}

test('山体遮挡发生在背阳侧，太阳落山或缺失高程不产生虚假投影',()=>{
  const data=tile(0),params={...data,x:data.pad+120,y:data.pad+64,metresPerPixel:1,radius:32};
  assert.ok(terrainShadowAt({...params,sun:[1,0,.1]})>.9);
  assert.equal(terrainShadowAt({...params,sun:[-1,0,.1]}),0);
  assert.equal(terrainShadowAt({...params,sun:[1,0,-.1]}),0);
  const incomplete=tile(0,{missing:true});
  assert.equal(terrainShadowAt({...params,...incomplete,sun:[1,0,.1]}),0);
});

test('相邻瓦片对同一条边的投影使用相同的山体高程',()=>{
  const sunAt=()=>[1,0,.1],metresAt=()=>1;
  const a=buildShadowGrid({...tile(0),sunAt,metresAt}),b=buildShadowGrid({...tile(1),sunAt,metresAt}),n=SHADOW_GRID_SIZE;
  for(let y=0;y<=n;y++)assert.equal(a[y*(n+1)+n],b[y*(n+1)]);
  assert.ok(a[64*(n+1)+n]>.9);
});

test('纵向瓦片交界和斜向太阳照射下投影连续',()=>{
  function vertical(tileY){
    const size=128,pad=34,width=size+2*pad,heights=new Float32Array(width*width),valid=new Uint8Array(width*width).fill(1);
    for(let y=0;y<width;y++)for(let x=0;x<width;x++){
      const worldY=tileY*size+y-pad;
      heights[y*width+x]=worldY>=136&&worldY<=140?90:0;
    }
    return {size,pad,width,heights,valid};
  }
  const sunAt=()=>[0.5,-1,.1],metresAt=()=>1,n=SHADOW_GRID_SIZE;
  const top=buildShadowGrid({...vertical(0),sunAt,metresAt}),bottom=buildShadowGrid({...vertical(1),sunAt,metresAt});
  for(let x=0;x<=n;x++)assert.equal(top[n*(n+1)+x],bottom[x]);
  assert.ok(top[n*(n+1)+64]>.9);
});
