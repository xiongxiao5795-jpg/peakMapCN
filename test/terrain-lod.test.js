import test from 'node:test';
import assert from 'node:assert/strict';
import {stableTerrainTileZoom,uniformImageryZoom,configureTerrainLod,configureMobileTerrainTextures,limitTerrainSkirts} from '../src/terrain-lod.js';
import {readFileSync} from 'node:fs';
import {patchMapLibreTerrain} from '../build/patch-maplibre-terrain.js';

test('固定缩放下近处地形级别不随视角变化，远处逐步降低细节',()=>{
  const near=stableTerrainTileZoom(7,1,0.5,1);
  assert.equal(near,6);
  assert.equal(stableTerrainTileZoom(7,1,0.1,1),near);
  assert.equal(stableTerrainTileZoom(7,8,0.1,1),4);
  const source={};configureTerrainLod({getSource:id=>id==='dem'?source:undefined});
  assert.equal(source.calculateTileZoom,stableTerrainTileZoom);
});

test('影像整个视野共用级别，并限制大视野瓦片数量',()=>{
  const local=[[104.9,22.9],[108.3,24.9]],wide=[[95.6,22.3],[117.6,40.7]];
  assert.equal(uniformImageryZoom(9,local,384),9);
  const desktop=uniformImageryZoom(9,wide,384),mobile=uniformImageryZoom(9,wide,192);
  assert.ok(desktop<9);assert.ok(mobile<=desktop);
  const dem={tileSize:256},satellite={tileSize:256};
  const map={getSource:id=>({dem,satellite})[id],getCenter:()=>({lng:106,lat:24}),getContainer:()=>({clientWidth:1000,clientHeight:700}),getPitch:()=>70,getBearing:()=>0,getBounds:()=>({toArray:()=>wide})};
  configureTerrainLod(map);
  assert.equal(satellite.calculateTileZoom(9,1,1,1),satellite.calculateTileZoom(9,100,1,1));
});

test('光影与设色使用地形的数据层级，不因纹理尺寸不同而多请求层级',()=>{
  for(const demSize of [128,256,512]){
    const dem={tileSize:demSize},shade={tileSize:256},relief={tileSize:demSize};
    configureTerrainLod({getSource:id=>({dem,'satellite-shade':shade,relief})[id]});
    const args=[1,0.5,1],terrainZoom=8+Math.log2(512/(2*demSize));
    const expected=dem.calculateTileZoom(terrainZoom,...args);
    assert.equal(shade.calculateTileZoom(8+Math.log2(512/shade.tileSize),...args),expected);
    assert.equal(relief.calculateTileZoom(8+Math.log2(512/relief.tileSize),...args),expected);
    assert.equal(shade.roundZoom,false);assert.equal(relief.roundZoom,false);
  }
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
