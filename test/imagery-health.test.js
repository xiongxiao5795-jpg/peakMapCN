import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageryHealth } from '../src/imagery-health.js';

test('连续失败才回退，成功及重试可清除故障计数',()=>{
  let time=0,fallbacks=0;const health=createImageryHealth(()=>fallbacks++,{now:()=>time,threshold:3,windowMs:1000});
  health.failure();health.failure();health.success();health.failure();health.failure();assert.equal(fallbacks,0);
  health.failure();assert.equal(fallbacks,1);
  health.failure();time=1100;health.failure();health.failure();assert.equal(fallbacks,1);
  health.reset();health.failure();health.failure();assert.equal(fallbacks,1);
});
