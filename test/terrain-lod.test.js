import test from 'node:test';
import assert from 'node:assert/strict';
import {stableTerrainTileZoom,uniformImageryZoom,terrainBudgetBounds,configureTerrainLod,configureTerrainTextures,limitTerrainSkirts,configureTerrainMesh} from '../src/terrain-lod.js';
import {readFileSync} from 'node:fs';
import {patchMapLibreTerrain} from '../build/patch-maplibre-terrain.js';

test('固定缩放下地形数据统一使用同一细节层级',()=>{
  const near=stableTerrainTileZoom(7,1,0.5,1);
  assert.equal(near,6);
  assert.equal(stableTerrainTileZoom(7,1,0.1,1),near);
  assert.equal(stableTerrainTileZoom(7,8,0.1,1),4);
  const source={};configureTerrainLod({getSource:id=>id==='dem'?source:undefined});
  assert.equal(source.calculateTileZoom(7,1,0.5,1),near+0.7);
  assert.equal(source.calculateTileZoom(7,8,0.5,1),near+0.7);
});

test('隔离行政区和恢复全图时近处与远处均使用相同细节层级',()=>{
  const source={},map={getSource:id=>id==='dem'?source:undefined};configureTerrainLod(map);
  assert.equal(source.calculateTileZoom(9,1,1,1),source.calculateTileZoom(9,8,1,1));
  map.__peakmapRegionIsolated=true;
  assert.equal(source.calculateTileZoom(9,1,1,1),source.calculateTileZoom(9,8,1,1));
  map.__peakmapRegionIsolated=false;
  assert.equal(source.calculateTileZoom(9,1,1,1),source.calculateTileZoom(9,8,1,1));
});

test('近景 AWS 可额外请求一层细节，远景与其他数据源保持原有策略',()=>{
  const source={},map={getSource:id=>id==='dem'?source:undefined};configureTerrainLod(map);
  const normal=source.calculateTileZoom(12.6,1,1,1),distant=source.calculateTileZoom(9,1,1,1);
  map.__peakTerrainSource='aws';
  assert.equal(source.calculateTileZoom(12.6,1,1,1),normal+1);
  assert.equal(source.calculateTileZoom(9,1,1,1),distant);
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

test('选中行政区时按区域而非大面积空白控制瓦片层级',()=>{
  const region=[112.5,22.3,113.2,23],wide=[[100,10],[125,40]],narrow=[[110,20],[115,26]];
  assert.deepEqual(terrainBudgetBounds(wide,region),[[112.5,22.3],[113.2,23]]);
  assert.deepEqual(terrainBudgetBounds(narrow,region),terrainBudgetBounds(wide,region));
  assert.deepEqual(terrainBudgetBounds(wide,null),wide);
  assert.ok(uniformImageryZoom(10,terrainBudgetBounds(wide,region),96)>uniformImageryZoom(10,wide,96));
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
  assert.match(patched,/uniform highp sampler2D u_peak_previous/);
  assert.match(patched,/uniform1f\(p\.mix,s\.__peakMix\?\?1\)/);
  assert.throws(()=>patchMapLibreTerrain('incompatible version'),/no longer matches/);
});

test('减少地形纹理尺寸并在重建后重新应用',()=>{
  let releases=0;const map={terrain:{qualityFactor:2,tileManager:{tileSize:512,releaseAllRTT(){releases++}}},painter:{renderToTexture:{rttSize:1024}}};
  configureTerrainTextures(map);
  assert.equal(map.painter.renderToTexture.rttSize,512);assert.equal(releases,1);
  configureTerrainTextures(map);assert.equal(releases,1);
  map.painter.renderToTexture={rttSize:1024};configureTerrainTextures(map);
  assert.equal(map.painter.renderToTexture.rttSize,512);assert.equal(releases,2);
});

test('接缝遮挡有高度上限，地形重建后仍可重新配置',()=>{
  const map={terrain:{exaggeration:80,getSkirtLength:()=>200000}};
  limitTerrainSkirts(map);assert.equal(map.terrain.getSkirtLength(5),40000);
  limitTerrainSkirts(map);assert.equal(map.terrain.getSkirtLength(5),40000);
  map.terrain={exaggeration:1,getSkirtLength:()=>10000};limitTerrainSkirts(map);
  assert.equal(map.terrain.getSkirtLength(5),2000);
});


test('调整地形网格时清理旧网格，桌面使用稳定的网格密度',()=>{
  let destroyed=0,repaints=0;const map={terrain:{meshSize:192,_meshCache:{old:{destroy(){destroyed++}}},tileManager:{releaseAllRTT(){}}},triggerRepaint(){repaints++}};
  configureTerrainMesh(map,false);assert.equal(map.terrain.meshSize,128);assert.equal(destroyed,1);assert.equal(repaints,1);
  configureTerrainMesh(map,false);assert.equal(repaints,1);configureTerrainMesh(map,true);assert.equal(map.terrain.meshSize,160);
});
