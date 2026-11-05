import test from 'node:test';
import assert from 'node:assert/strict';
import { places, categories } from '../data/places.js';
test('示例地理对象具备唯一标识、有效坐标和可识别分类', () => {
  assert.equal(new Set(places.map(place => place.id)).size, places.length);
  for (const place of places) {
    assert.ok(categories[place.category], place.id);
    assert.ok(place.name && place.description, place.id);
    assert.ok(place.coordinates[0] >= -180 && place.coordinates[0] <= 180, place.id);
    assert.ok(place.coordinates[1] >= -90 && place.coordinates[1] <= 90, place.id);
    assert.ok(place.zoom >= 0 && place.importance > 0, place.id);
  }
});
