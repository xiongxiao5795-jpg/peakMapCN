import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothTerrainHeights} from '../src/terrain-smoothing.js';

test('柔和地形降低孤立尖峰，保持边缘且不修改原始高程',()=>{
  const size=25,source=new Float32Array(size*size).fill(100);source[12*size+12]=1000;const original=source.slice();
  const smoothed=smoothTerrainHeights(source,size,size,70);
  assert.ok(smoothed[12*size+12]<1000&&smoothed[12*size+12]>100);
  assert.equal(smoothed[0],source[0]);assert.deepEqual(source,original);
  assert.equal(smoothTerrainHeights(source,size,size,0),source);
});
test('边界附近平滑不会把范围外的海平面混入陆地',()=>{
  const size=25,source=new Float32Array(size*size),mask=new Uint8Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<12;x++){source[y*size+x]=3000;mask[y*size+x]=1}
  const smoothed=smoothTerrainHeights(source,size,size,100,mask);
  assert.equal(smoothed[12*size+11],3000);assert.equal(smoothed[12*size+12],0);
});
