import test from 'node:test';
import assert from 'node:assert/strict';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import {createTileCoverage,outsideRegionGeometry} from '../src/tile-coverage.js';
import {configureScopedTileFilter} from '../src/scoped-tile-filter.js';

const square=(w,s,e,n)=>[[w,s],[e,s],[e,n],[w,n],[w,s]];
const region={type:'Feature',properties:{adcode:'999999'},geometry:{type:'MultiPolygon',coordinates:[
  [square(100,20,110,30),square(102,22,104,24)],
  [square(120,20,122,22)]
]}};
const tile=(lon,lat,z)=>{const n=2**z,rad=lat*Math.PI/180;return [z,Math.floor((lon+180)/360*n),Math.floor((1-Math.asinh(Math.tan(rad))/Math.PI)/2*n)]};

test('瓦片相交判断保留飞地，排除范围外及行政区内的空洞',()=>{
  const coverage=createTileCoverage([region]);
  assert.equal(coverage(...tile(105,25,10)).length,1);
  assert.equal(coverage(...tile(121,21,10)).length,1);
  assert.equal(coverage(...tile(103,23,10)).length,0);
  assert.equal(coverage(...tile(115,25,10)).length,0);
});

test('构造边缘缓冲时包含相邻瓦片中的独立行政区块',()=>{
  const feature={type:'Feature',properties:{},geometry:{type:'MultiPolygon',coordinates:[
    [square(0.1,0.1,0.2,0.2)], [square(-0.2,0.1,-0.1,0.2)]
  ]}};
  const coverage=createTileCoverage([feature]),[z,x,y]=tile(0.15,0.15,10);
  assert.equal(coverage(z,x,y).length,1);
  assert.equal(coverage.withNeighbors(z,x,y).length,2);
});

test('区外遮罩保留区域内地面并覆盖空洞、区外和岛屿之间',()=>{
  const outside={type:'Feature',properties:{},geometry:outsideRegionGeometry(region)};
  assert.equal(booleanPointInPolygon([105,25],outside),false);
  assert.equal(booleanPointInPolygon([121,21],outside),false);
  assert.equal(booleanPointInPolygon([103,23],outside),true);
  assert.equal(booleanPointInPolygon([115,25],outside),true);
});

test('范围外瓦片在地图引擎调度前排除，关闭后恢复原有数据源限制',()=>{
  const source={hasTile:tile=>tile.canonical.z<12};
  const map={getSource:id=>id==='dem'?source:null};
  const id=(lon,lat,z)=>{const [level,x,y]=tile(lon,lat,z);return {canonical:{z:level,x,y}}};
  configureScopedTileFilter(map,region);
  assert.equal(source.hasTile(id(105,25,10)),true);
  assert.equal(source.hasTile(id(115,25,10)),false);
  assert.equal(source.hasTile(id(105,25,12)),false);
  configureScopedTileFilter(map,null);
  assert.equal(source.hasTile(id(115,25,10)),true);
  assert.equal(source.hasTile(id(105,25,12)),false);
});

test('选区保留相邻高程瓦片供地形接边，显示图层仍按选区过滤',()=>{
  const dem={hasTile:()=>true}, imagery={hasTile:()=>true}, analysis={hasTile:()=>true};
  const map={getSource:id=>({dem,satellite:imagery,'explorer-slope':analysis})[id]};
  const z=10,[,x,y]=tile(100,25,z),neighbor={canonical:{z,x:x-1,y}};
  configureScopedTileFilter(map,region);
  assert.equal(dem.hasTile(neighbor),true);
  assert.equal(imagery.hasTile(neighbor),false);
  assert.equal(analysis.hasTile(neighbor),false);
  assert.equal(dem.hasTile({canonical:{z,x:x-2,y}}),false);
  configureScopedTileFilter(map,null);
  assert.equal(imagery.hasTile(neighbor),true);
  assert.equal(analysis.hasTile(neighbor),true);
});
