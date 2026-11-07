import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCoordinates,createProvinceLookup,selectLocationRegion} from '../src/location.js';

const coordinate=input=>parseCoordinates(input).coordinates;
test('识别经纬度，方向标记与中文标签，并拒绝无效输入',()=>{
  assert.deepEqual(coordinate('116.4074, 39.9042'),[116.4074,39.9042]);
  assert.deepEqual(coordinate('39.9042，116.4074'),[116.4074,39.9042]);
  assert.deepEqual(coordinate('经度: 80.2 纬度: 30.3'),[80.2,30.3]);
  assert.deepEqual(coordinate('纬度:30.3, 经度:80.2'),[80.2,30.3]);
  assert.deepEqual(coordinate('N 30.5, E 102.1'),[102.1,30.5]);
  assert.deepEqual(coordinate('30.5°S 120.2°W'),[-120.2,-30.5]);
  assert.deepEqual(coordinate('80, 30'),[80,30]);
  assert.equal(parseCoordinates('181,30').kind,'invalid');
  assert.equal(parseCoordinates('0,89').kind,'invalid');
  assert.equal(parseCoordinates('N30 N40').kind,'invalid');
  assert.equal(parseCoordinates('林芝市').kind,'none');
});
test('本地边界识别省份、直辖市和境外位置',()=>{
  const collection=JSON.parse(readFileSync(new URL('../data/china-provinces.json',import.meta.url),'utf8'));
  const find=createProvinceLookup(collection.features);
  for(const [lon,lat,name] of [[116.4074,39.9042,'北京市'],[121.4737,31.2304,'上海市'],[104.0657,30.6595,'四川省'],[114.1694,22.3193,'香港特别行政区'],[113.5439,22.1987,'澳门特别行政区'],[121.5654,25.033,'台湾省']])assert.equal(find(lon,lat)?.properties.name,name);
  assert.equal(find(139.6917,35.6895),null);assert.equal(find(-73.98,40.75),null);assert.equal(find(NaN,30),null);
});

test('定位按市、区县边界逐级选择，并在缺少数据时退回上一级',()=>{
  const provinces=JSON.parse(readFileSync(new URL('../data/china-provinces.json',import.meta.url),'utf8')).features;
  const cities=JSON.parse(readFileSync(new URL('../data/admin-city-boundaries.json',import.meta.url),'utf8')).features;
  const districts=JSON.parse(readFileSync(new URL('../data/admin-districts/51.json',import.meta.url),'utf8')).features;
  const province=provinces.find(f=>f.properties.name==='四川省'),chengduCities=cities.filter(f=>String(f.properties.parent?.adcode)==='510000'&&f.properties.level==='city');
  assert.equal(selectLocationRegion(province,104.0657,30.6595,'city',chengduCities).feature.properties.name,'成都市');
  assert.equal(selectLocationRegion(province,104.0657,30.6595,'district',chengduCities,districts).feature.properties.name,'青羊区');
  assert.equal(selectLocationRegion(province,104.0657,30.6595,'district',chengduCities,[]).level,'city');
  const beijing=provinces.find(f=>f.properties.name==='北京市');
  assert.equal(selectLocationRegion(beijing,116.4074,39.9042,'city').level,'city');
});
