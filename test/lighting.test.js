import test from 'node:test';
import assert from 'node:assert/strict';
import { lightVector, lightFactor, solarBrightness, castShadowAt, imageryShadowOpacity, softenShadowMask } from '../src/lighting.js';

test('太阳方向改变相反坡面的受光',()=>{
  const east=lightVector(90,35),west=lightVector(270,35);
  assert.ok(lightFactor(1,0,west,1)>lightFactor(1,0,east,1));
  assert.ok(lightFactor(-1,0,east,1)>lightFactor(-1,0,west,1));
});
test('太阳低于地平线为夜间，高于地平线为日间',()=>{
  assert.equal(solarBrightness(-0.2),0);assert.equal(solarBrightness(0.3),1);
  assert.ok(solarBrightness(0)>0&&solarBrightness(0)<1);
});
test('山体会遮挡其背向太阳的邻近地表',()=>{
  const size=16,heights=new Float32Array(size*size);heights[8*size+10]=300;
  assert.equal(castShadowAt(heights,size,8,8,lightVector(90,20),100),true);
  assert.equal(castShadowAt(heights,size,8,8,lightVector(270,20),100),false);
  assert.equal(castShadowAt(heights,size,8,8,lightVector(90,-5),100),false);
});
test('投影使用画面高度倍率并随太阳方向反转',()=>{
  const size=24,heights=new Float32Array(size*size);heights[12*size+15]=20;
  assert.equal(castShadowAt(heights,size,12,12,lightVector(90,35),100,1),false);
  assert.equal(castShadowAt(heights,size,12,12,lightVector(90,35),100,80),true);
  assert.equal(castShadowAt(heights,size,12,12,lightVector(270,35),100,80),false);
});
test('卫星图层的日夜和山体阴影可随强度调节',()=>{
  assert.equal(imageryShadowOpacity(1,1,false,1),0);
  assert.ok(imageryShadowOpacity(0,1,false,1)>0.59&&imageryShadowOpacity(0,1,false,1)<0.61);
  assert.ok(imageryShadowOpacity(1,1,true,1)>0.5);
  assert.equal(imageryShadowOpacity(0,0.5,true,0),0);
  assert.ok(imageryShadowOpacity(1,0.7,false,0.5)<imageryShadowOpacity(1,0.7,false,1));
  assert.ok(imageryShadowOpacity(1,1,0.5,1)<imageryShadowOpacity(1,1,true,1));
});
test('遮挡阴影边缘平滑而不是突兀方块',()=>{
  const mask=new Float32Array(25);mask[12]=1;const soft=softenShadowMask(mask,5,5);
  assert.ok(soft[12]>soft[11]&&soft[11]>0);assert.equal(soft[0],0);
});
