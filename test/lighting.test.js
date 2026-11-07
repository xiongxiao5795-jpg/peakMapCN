import test from 'node:test';
import assert from 'node:assert/strict';
import { lightVector, lightFactor, solarBrightness, imageryShadowOpacity } from '../src/lighting.js';

test('太阳方向改变相反坡面的受光',()=>{
  const east=lightVector(90,35),west=lightVector(270,35);
  assert.ok(lightFactor(1,0,west,1)>lightFactor(1,0,east,1));
  assert.ok(lightFactor(-1,0,east,1)>lightFactor(-1,0,west,1));
});
test('太阳低于地平线为夜间，高于地平线为日间',()=>{
  assert.equal(solarBrightness(-0.2),0);assert.equal(solarBrightness(0.3),1);
  assert.ok(solarBrightness(0)>0&&solarBrightness(0)<1);
});
test('卫星图层的日夜和坡面明暗可随强度调节',()=>{
  assert.equal(imageryShadowOpacity(1,1,1),0);
  assert.ok(imageryShadowOpacity(0,1,1)>0.59&&imageryShadowOpacity(0,1,1)<0.61);
  assert.equal(imageryShadowOpacity(0,0.5,0),0);
  assert.ok(imageryShadowOpacity(1,0.7,0.5)<imageryShadowOpacity(1,0.7,1));
});
