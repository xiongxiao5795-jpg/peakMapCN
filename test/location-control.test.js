import test from 'node:test';
import assert from 'node:assert/strict';
import {bindLocationControl} from '../src/location-control.js';

test('定位按钮区分单击、双击和长按，长按不会追加单击',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const button=new EventTarget(),calls=[];
  bindLocationControl(button,level=>calls.push(level));
  const fire=(type,extra={})=>button.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),{button:0,pointerId:1,clientX:0,clientY:0,detail:1,...extra}));
  const tap=()=>{fire('pointerdown');fire('pointerup');fire('click')};
  tap();t.mock.timers.tick(320);assert.deepEqual(calls,['province']);
  tap();t.mock.timers.tick(100);tap();t.mock.timers.tick(320);assert.deepEqual(calls,['province','city']);
  fire('pointerdown');t.mock.timers.tick(500);fire('pointerup');fire('click');t.mock.timers.tick(320);
  assert.deepEqual(calls,['province','city','district']);
});
