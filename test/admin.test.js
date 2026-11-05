import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {buildAdministrativeEntries,searchAdministrative,boundsOverlap} from '../src/admin.js';
const index=JSON.parse(readFileSync(new URL('../data/admin-index.json',import.meta.url),'utf8'));
const entries=buildAdministrativeEntries(index);
const cityCenters=JSON.parse(readFileSync(new URL('../data/admin-city-centers.json',import.meta.url),'utf8'));
const cityBoundaries=JSON.parse(readFileSync(new URL('../data/admin-city-boundaries.json',import.meta.url),'utf8'));
test('区县边界按省存储并能对应检索索引',()=>{
  const folder=new URL('../data/admin-districts/',import.meta.url),byCode=new Map();
  for(const name of readdirSync(folder).filter(name=>/^\d\d\.json$/.test(name))){
    const collection=JSON.parse(readFileSync(new URL(name,folder),'utf8'));
    for(const feature of collection.features){
      const code=String(feature.properties.adcode);
      assert.equal(code.slice(0,2),name.slice(0,2));
      assert.ok(!byCode.has(code),`重复的区县边界 ${code}`);
      assert.ok(['Polygon','MultiPolygon'].includes(feature.geometry.type));
      assert.ok(feature.properties.parent?.adcode);
      byCode.set(code,feature);
    }
  }
  assert.ok(byCode.size>=2800);
  assert.equal(byCode.get('610116').properties.name,'长安区');
  assert.equal(byCode.get('510107').properties.name,'武侯区');
  assert.equal(byCode.get('540481').properties.originalAdcode,540422);
  assert.equal(byCode.get('540581').properties.originalAdcode,540530);
  assert.ok(entries.filter(p=>p.category==='district').some(p=>p.adcode==='610116'));
});
test('本地地市边界覆盖索引中的所有地市并具备可用于高亮的多边形',()=>{
  const boundaries=new Map(cityBoundaries.features.map(f=>[String(f.properties.adcode),f]));
  for(const city of entries.filter(p=>p.category==='admin_city')){
    const feature=boundaries.get(city.adcode);
    assert.ok(feature,`缺少 ${city.name} 的边界`);
    assert.ok(['Polygon','MultiPolygon'].includes(feature.geometry.type));
    assert.ok(feature.geometry.coordinates.length>0);
  }
  assert.equal(boundaries.get('510100').properties.name,'成都市');
  assert.equal(boundaries.get('540400').properties.name,'林芝市');
});
test('地市级标签在边界联网加载之前就有可用的位置',()=>{
  const cities=buildAdministrativeEntries(index,cityCenters).filter(p=>p.category==='admin_city');
  assert.equal(cities.length,333);
  assert.ok(cities.every(p=>Array.isArray(p.coordinates)&&p.coordinates.length===2&&p.coordinates.every(Number.isFinite)));
  assert.deepEqual(cities.find(p=>p.name==='林芝市').coordinates,[94.362348,29.654693]);
  assert.deepEqual(cities.find(p=>p.name==='成都市').coordinates,[104.065735,30.659462]);
});
test('地市和区县名称可带上级地区检索并区分同名区县',()=>{
  assert.equal(searchAdministrative(entries,'林芝市').find(p=>p.name==='林芝市')?.adcode,'540400');
  assert.equal(searchAdministrative(entries,'西安市长安区').find(p=>p.name==='长安区')?.adcode,'610116');
  assert.ok(searchAdministrative(entries,'长安区').some(p=>p.adcode==='130102'));
  assert.ok(searchAdministrative(entries,'长安区').some(p=>p.adcode==='610116'));
  assert.equal(new Set(entries.map(p=>p.id)).size,entries.length);
});
test('视野范围相交判断涵盖接触和分离',()=>{
  assert.equal(boundsOverlap([0,0,2,2],[2,1,3,3]),true);
  assert.equal(boundsOverlap([0,0,2,2],[3,1,4,3]),false);
});
