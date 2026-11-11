import test from 'node:test';
import assert from 'node:assert/strict';
import {terrainSourceMaxZoom,setTerrainSourceMaxZoom} from '../src/terrain-source-level.js';

test('按高程源使用对应层级并同步地图序列化配置',()=>{
  assert.equal(terrainSourceMaxZoom('mapterhorn'),12);assert.equal(terrainSourceMaxZoom('aws'),13);
  const source={maxzoom:12,_options:{maxzoom:12}};
  setTerrainSourceMaxZoom(source,'aws');assert.equal(source.maxzoom,13);assert.equal(source._options.maxzoom,13);
  setTerrainSourceMaxZoom(source,'mapterhorn');assert.equal(source.maxzoom,12);assert.equal(source._options.maxzoom,12);
});
