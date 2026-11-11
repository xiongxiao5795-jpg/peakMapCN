import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainMetrics } from '../src/terrain-metrics.js';

test('坡度根据真实水平距离计算，坡向指向下坡方向',()=>{
  assert.equal(terrainMetrics(1,0).slope,45);
  assert.equal(terrainMetrics(1,0).aspect,270);
  assert.equal(terrainMetrics(0,-1).aspect,0);
  assert.equal(terrainMetrics(0,1).aspect,180);
  assert.equal(terrainMetrics(0,0).aspect,null);
  assert.equal(terrainMetrics(NaN,0),null);
});
