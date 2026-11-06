import test from 'node:test';
import assert from 'node:assert/strict';
import {softenTerrainEdge} from '../src/terrain-edge.js';

test('边界渐变只影响边缘，瓦片边缘使用相邻区域的掩膜',()=>{
  const size=16,padding=4,width=size+padding*2,mask=new Uint8Array(width*width),heights=new Float32Array(size*size).fill(4000);
  // A north/south boundary crosses both the tile and its padding.
  for(let y=0;y<width;y++)for(let x=0;x<width;x++)mask[y*width+x]=x>=padding+4?1:0;
  const result=softenTerrainEdge(heights,mask,size,padding);
  assert.equal(result[8*size+2],0);
  assert.ok(result[8*size+4]>0&&result[8*size+4]<4000);
  assert.equal(result[8*size+12],4000);
  assert.equal(result[12],4000);
  assert.equal(heights[8*size+4],4000);
});
