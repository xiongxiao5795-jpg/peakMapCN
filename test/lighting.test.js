import test from 'node:test';
import assert from 'node:assert/strict';
import { lightVector, lightFactor, solarBrightness, imageryShadowOpacity, terrainLightIntensity, terrainShade } from '../src/lighting.js';

test('立体光照按地形倍率和太阳方向调整坡面明暗',()=>{
  const east=lightVector(90,35),west=lightVector(270,35);
  assert.equal(terrainLightIntensity(.2,0,east,0,1,0),terrainLightIntensity(.2,0,west,0,1,0));
  assert.ok(terrainLightIntensity(.2,0,west,10,1,0)>terrainLightIntensity(.2,0,east,10,1,0));
  assert.ok(terrainLightIntensity(.2,0,west,10,1,0)>terrainLightIntensity(.2,0,west,10,1,1));
  assert.deepEqual(terrainShade(0.5,0),{color:0,alpha:0});
  assert.ok(terrainShade(1.2,1).color===255&&terrainShade(0.5,1).color===0);
});

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
