import test from 'node:test';
import assert from 'node:assert/strict';
import {niceScaleDistance} from '../src/center-scale.js';
test('比例尺取不超过当前中心横线距离的整齐刻度',()=>{
  assert.equal(niceScaleDistance(3420),2000);assert.equal(niceScaleDistance(980),500);assert.equal(niceScaleDistance(1.4),1);assert.equal(niceScaleDistance(0),null);assert.equal(niceScaleDistance(NaN),null);
});

import {setupCenterScale} from '../src/center-scale.js';
test('比例尺以主视图中心横线取样并绘制对应长度',async()=>{
  const oldDocument=globalThis.document,events={},samples=[],label={textContent:''},bar={style:{}};
  const el={className:'',hidden:false,setAttribute(){},set innerHTML(value){},querySelector(selector){return selector==='.center-scale-label'?label:bar},remove(){}};
  globalThis.document={createElement:()=>el};
  const map={getContainer:()=>({clientWidth:800,clientHeight:600,append(){}}),unproject:([x,y])=>{samples.push([x,y]);return {x,distanceTo(other){return Math.abs(other.x-this.x)*3}}},on:(event,fn)=>events[event]=fn};
  try{setupCenterScale(map);await new Promise(resolve=>setTimeout(resolve,130));assert.equal(label.textContent,'200 m');assert.ok(Math.abs(parseFloat(bar.style.width)-200/3)<.2);assert.ok(samples.every(([,y])=>y===300));assert.equal(samples[0][0],400)}finally{globalThis.document=oldDocument}
});
