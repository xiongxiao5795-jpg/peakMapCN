import test from 'node:test';
import assert from 'node:assert/strict';
import {stableTerrainTileZoom,configureTerrainLod,configureMobileTerrainTextures,limitTerrainSkirts} from '../src/terrain-lod.js';
import {readFileSync} from 'node:fs';
import {patchMapLibreTerrain} from '../build/patch-maplibre-terrain.js';

test('固定缩放下近处地形级别不随视角变化，远处逐步降低细节',()=>{
  const near=stableTerrainTileZoom(7,1,0.5,1);
  assert.equal(near,6);
  assert.equal(stableTerrainTileZoom(7,1,0.1,1),near);
  assert.equal(stableTerrainTileZoom(7,8,0.1,1),4);
  const source={};configureTerrainLod({getSource:()=>source});
  assert.equal(source.calculateTileZoom,stableTerrainTileZoom);
});

test('地形绘制与高程数据使用同一个层级规则，依赖升级时必须显式复核',()=>{
  const code=readFileSync(new URL('../node_modules/maplibre-gl/dist/maplibre-gl.mjs',import.meta.url),'utf8');
  const patched=patchMapLibreTerrain(code);
  assert.match(patched,/calculateTileZoom:this\.tileManager\._source\.calculateTileZoom\?/);
  assert.throws(()=>patchMapLibreTerrain('incompatible version'),/no longer matches/);
});

test('触屏设备减少地形纹理尺寸并在重建后重新应用',()=>{
  let releases=0;const map={terrain:{qualityFactor:2,tileManager:{tileSize:512,releaseAllRTT(){releases++}}},painter:{renderToTexture:{rttSize:1024}}};
  configureMobileTerrainTextures(map,true);
  assert.equal(map.painter.renderToTexture.rttSize,512);assert.equal(releases,1);
  configureMobileTerrainTextures(map,true);assert.equal(releases,1);
  map.painter.renderToTexture={rttSize:1024};configureMobileTerrainTextures(map,false);
  assert.equal(map.painter.renderToTexture.rttSize,1024);
});

test('接缝遮挡有高度上限，地形重建后仍可重新配置',()=>{
  const map={terrain:{exaggeration:80,getSkirtLength:()=>200000}};
  limitTerrainSkirts(map);assert.equal(map.terrain.getSkirtLength(5),40000);
  limitTerrainSkirts(map);assert.equal(map.terrain.getSkirtLength(5),40000);
  map.terrain={exaggeration:1,getSkirtLength:()=>10000};limitTerrainSkirts(map);
  assert.equal(map.terrain.getSkirtLength(5),2000);
});
