import test from 'node:test';
import assert from 'node:assert/strict';
import { lightVector, lightFactor } from '../src/lighting.js';
test('光线方向和强度影响相反朝向山坡的亮度', () => {
  const east = lightVector(90, 35), west = lightVector(270, 35);
  assert.equal(lightFactor(1, 0, east, 0), 1);
  assert.ok(lightFactor(1, 0, west, 1) > lightFactor(1, 0, east, 1));
  assert.ok(lightFactor(-1, 0, east, 1) > lightFactor(-1, 0, west, 1));
});

import { elevationHaze } from '../src/lighting.js';
test('高海拔增强时光雾的不透明度随海拔增加', () => {
  assert.equal(elevationHaze(6000, 0, 1), 0);
  assert.ok(elevationHaze(6000, 1, 1) > elevationHaze(2000, 1, 1));
  assert.ok(elevationHaze(2000, 1, 1) > elevationHaze(0, 1, 1));
  assert.equal(elevationHaze(0, 0.5, 0), elevationHaze(6000, 0.5, 0));
});

import { beamStyleAtZoom } from '../src/lighting.js';
test('放大地图时光束数量和不透明度均逐渐下降', () => {
  const overview=beamStyleAtZoom(3.3), close=beamStyleAtZoom(7), detailed=beamStyleAtZoom(11);
  assert.ok(overview.count > close.count && close.count > detailed.count);
  assert.ok(overview.opacity > close.opacity && close.opacity > detailed.opacity);
  assert.equal(detailed.count, 0);
  assert.equal(detailed.opacity, 0);
});
