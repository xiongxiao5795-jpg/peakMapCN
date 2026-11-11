import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeTerrarium,repairTerrainStripes,terrainEdgeCandidates,terrainEdgeHasCoverage,repairTerrainEdge} from '../src/terrain-integrity.js';

function image(width,height,value=1700){
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<width*height;i++)set(data,i,value);
  return data;
}
function set(data,i,height,alpha=255){const value=Math.round((height+32768)*256),j=i*4;data[j]=value>>16;data[j+1]=(value>>8)&255;data[j+2]=value&255;data[j+3]=alpha}
const height=(data,i)=>decodeTerrarium(data,i*4);

test('修复真实案例中横跨瓦片的异常负高程行',()=>{
  const w=256,h=256,pixels=image(w,h);
  for(let x=0;x<w;x++)set(pixels,209*w+x,-5071);
  assert.equal(repairTerrainStripes(pixels,w,h),w);
  for(let x=0;x<w;x++)assert.equal(height(pixels,209*w+x),1700);
});

test('修复放大后两像素宽的异常行和竖直异常列',()=>{
  const w=64,h=64,pixels=image(w,h);
  for(let x=0;x<w;x++){set(pixels,20*w+x,-5000);set(pixels,21*w+x,-5000)}
  for(let y=0;y<h;y++)set(pixels,y*w+40,8500);
  assert.ok(repairTerrainStripes(pixels,w,h)>=2*w+h-4);
  assert.equal(height(pixels,20*w+3),1700);assert.equal(height(pixels,10*w+40),1700);
});

test('保留真实陡坡、普通局部高峰和透明数据',()=>{
  const w=64,h=64,pixels=image(w,h);
  for(let y=32;y<h;y++)for(let x=0;x<w;x++)set(pixels,y*w+x,4000);
  set(pixels,10*w+10,3000);set(pixels,15*w+15,-5000,0);
  const before=pixels.slice();assert.equal(repairTerrainStripes(pixels,w,h),0);assert.deepEqual(pixels,before);
});

test('修复由一致的相邻高程包围的孤立异常尖刺',()=>{
  const w=32,h=32,pixels=image(w,h);set(pixels,12*w+12,-5000);
  assert.equal(repairTerrainStripes(pixels,w,h),1);assert.equal(height(pixels,12*w+12),1700);
});

test('跨越 RGB 进位的插值按高程编码，不产生虚假断崖',()=>{
  const w=32,h=8,pixels=image(w,h,255.5);
  for(let x=0;x<w;x++){set(pixels,2*w+x,-5000);set(pixels,3*w+x,256.5)}
  assert.equal(repairTerrainStripes(pixels,w,h),w);
  assert.equal(height(pixels,2*w+10),256);
});

test('瓦片边界上的异常列通过邻接瓦片修复，两边不产生断墙',()=>{
  const w=64,h=64,left=image(w,h,1700),right=image(w,h,1800);
  for(let y=0;y<h;y++){set(left,y*w+w-1,-5000);set(right,y*w,-5000)}
  assert.deepEqual(terrainEdgeCandidates(left,w,h),['right']);assert.deepEqual(terrainEdgeCandidates(right,w,h),['left']);
  const originalLeft=left.slice(),originalRight=right.slice();
  assert.equal(repairTerrainEdge(left,originalRight,w,h,'right'),h);
  assert.equal(repairTerrainEdge(right,originalLeft,w,h,'left'),h);
  assert.ok(Math.abs(height(left,15*w+w-1)-1733.333)<0.01);
  assert.ok(Math.abs(height(right,15*w)-1766.666)<0.01);
});

test('两侧瓦片都存在的真实高差不会被误修复',()=>{
  const w=64,h=64,left=image(w,h,1700),right=image(w,h,5000);
  assert.equal(repairTerrainEdge(left,right,w,h,'right'),0);
  assert.equal(height(left,15*w+w-1),1700);
});

test('无法验证的透明邻瓦片不会被当作可靠高程',()=>{
  const w=32,h=32,tile=image(w,h),neighbor=image(w,h);
  for(let y=0;y<h;y++){set(tile,y*w+w-1,-5000);set(neighbor,y*w,1700,0)}
  assert.equal(terrainEdgeHasCoverage(tile,neighbor,w,h,'right'),false);
});
