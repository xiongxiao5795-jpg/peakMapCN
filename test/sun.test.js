import test from 'node:test';
import assert from 'node:assert/strict';
import { sunlightAt } from '../src/sun.js';
test('北京时间计算太阳方向和高度，并识别夜晚', () => {
  const morning = sunlightAt('2026-06-21T10:00', 35.1, 103.5);
  const evening = sunlightAt('2026-06-21T17:00', 35.1, 103.5);
  const night = sunlightAt('2026-06-21T01:00', 35.1, 103.5);
  assert.ok(morning.azimuth > 70 && morning.azimuth < 180);
  assert.ok(evening.azimuth > 180 && evening.azimuth < 300);
  assert.ok(morning.altitude > 0 && morning.altitude < 90);
  assert.ok(night.altitude < 0);
  assert.equal(sunlightAt('', 35.1, 103.5), null);
});

import { celestialLightAt, beijingTimeNow } from '../src/sun.js';
test('日夜分别选取太阳、月亮，并正确处理月落和北京时间', () => {
  const day = celestialLightAt('2026-06-21T10:00', 35.1, 103.5);
  const moonrise = celestialLightAt('2026-06-21T23:00', 35.1, 103.5);
  const moonset = celestialLightAt('2026-06-21T01:00', 35.1, 103.5);
  assert.equal(day.body, 'sun');
  assert.equal(day.visible, true);
  assert.equal(moonrise.body, 'moon');
  assert.equal(moonrise.visible, true);
  assert.ok(moonrise.fraction >= 0 && moonrise.fraction <= 1);
  assert.equal(moonset.body, 'moon');
  assert.equal(moonset.visible, false);
  assert.equal(beijingTimeNow(new Date('2026-01-01T16:30:00Z')), '2026-01-02T00:30');
});

import { celestialPositionsAt, skyPosition } from '../src/sun.js';
test('天空示意同时计算日月，并随地图朝向旋转', () => {
  const positions = celestialPositionsAt('2026-06-21T10:00', 35.1, 103.5);
  assert.ok(Number.isFinite(positions.sun.azimuth));
  assert.ok(Number.isFinite(positions.moon.altitude));
  assert.equal(skyPosition(90, 45, 90).x, 50);
  assert.equal(skyPosition(180, 0, 90).x, 75);
  assert.equal(skyPosition(90, 90, 90).y, 0);
});
