import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const records=JSON.parse(readFileSync(new URL('../data/geonames-mountains.json',import.meta.url),'utf8'));
test('地名数据具有可追溯标识、有效坐标和可安全显示的中文名称',()=>{
  const ids=new Set();let mountain=0,peak=0;
  for(const record of records){
    assert.match(record.id,/^geonames-\d+$/);
    assert.ok(!ids.has(record.id),record.id);ids.add(record.id);
    assert.match(record.name,/^[\u3400-\u9fff·・]{2,18}$/u);
    assert.ok(record.coordinates[0]>=73&&record.coordinates[0]<=136&&record.coordinates[1]>=3&&record.coordinates[1]<=54,record.id);
    assert.ok(record.zoom>=0&&record.zoom<=13,record.id);
    if(record.elevation!=null)assert.ok(record.elevation>0&&record.elevation<=9000,record.id);
    if(record.category==='mountain')mountain++;else if(record.category==='peak')peak++;else assert.fail(record.id);
  }
  assert.ok(mountain>100);assert.ok(peak>1000);
});
