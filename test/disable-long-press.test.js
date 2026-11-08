import test from 'node:test';
import assert from 'node:assert/strict';
import {disableLongPress} from '../src/disable-long-press.js';

test('触屏长按不触发点击或文本选择，移动手势与普通点击仍然可用',()=>{
  const doc=new EventTarget();disableLongPress(doc);let clicks=0;
  doc.addEventListener('click',()=>clicks++);
  function fire(type,time,extra={}){
    const event=new Event(type,{cancelable:true});
    Object.defineProperty(event,'timeStamp',{value:time});
    Object.assign(event,{pointerType:'touch',isPrimary:true,pointerId:1,clientX:0,clientY:0,detail:1,...extra});
    doc.dispatchEvent(event);return event;
  }
  fire('pointerdown',0);fire('pointerup',600);assert.equal(fire('click',610).defaultPrevented,true);assert.equal(clicks,0);
  fire('pointerdown',1000);fire('pointerup',1100);fire('click',1110);assert.equal(clicks,1);
  fire('pointerdown',2000);fire('pointermove',2100,{clientY:-30});fire('pointerup',2700,{clientY:-30});fire('click',2710);assert.equal(clicks,2);
  assert.equal(fire('contextmenu',2800).defaultPrevented,true);
  assert.equal(fire('selectstart',2900).defaultPrevented,true);
});
