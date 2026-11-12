import test from 'node:test';
import assert from 'node:assert/strict';
import {overviewAdministrativeLevel} from '../src/overview-administration.js';

test('鸟瞰窗口较小时仍按主图行政层级显示名称',()=>{
  assert.equal(overviewAdministrativeLevel(3.3,1.5,null),'province');
  assert.equal(overviewAdministrativeLevel(7,2.8,null),'city');
  assert.equal(overviewAdministrativeLevel(9,4.5,null),'district');
  assert.equal(overviewAdministrativeLevel(3.3,5.5,null),'city');
  assert.equal(overviewAdministrativeLevel(3.3,8,null),'district');
  assert.equal(overviewAdministrativeLevel(6.5,2.8,{properties:{adcode:420500}}),'district');
});
