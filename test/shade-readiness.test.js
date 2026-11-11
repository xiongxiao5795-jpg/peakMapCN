import test from 'node:test';
import assert from 'node:assert/strict';
import {bindShadeReadiness} from '../src/shade-readiness.js';

test('首次加载光影后，视野变化不会反复隐藏整层',()=>{
  const listeners={},changes=[];let loaded=false,clears=0,repaints=0;
  const map={on:(name,fn)=>listeners[name]=fn,getLayer:()=>({}),getSource:()=>({}),isSourceLoaded:()=>loaded,setPaintProperty:(id,key,value)=>changes.push([id,key,value]),terrain:{tileManager:{releaseAllRTT:()=>clears++}},triggerRepaint:()=>repaints++};
  bindShadeReadiness(map);
  listeners.sourcedata({sourceId:'satellite-shade'});assert.deepEqual(changes,[]);
  loaded=true;listeners.sourcedata({sourceId:'satellite-shade'});assert.deepEqual(changes.at(-1),['satellite-shade','raster-opacity',1]);
  loaded=false;listeners.sourcedata({sourceId:'satellite-shade'});assert.equal(changes.length,1);
  loaded=true;listeners.sourcedata({sourceId:'satellite-shade'});assert.equal(changes.length,1);
  assert.equal(clears,1);assert.equal(repaints,1);
});

test('光影瓦片失败时保持一致并安排重试，成功后恢复显示',()=>{
  const listeners={},changes=[],timers=[];let states=[{state:'errored'}],retries=0;
  const source={tiles:['shade://tile'],setTiles:tiles=>{assert.deepEqual(tiles,['shade://tile']);retries++}};
  const map={on:(name,fn)=>listeners[name]=fn,getLayer:()=>({}),getSource:()=>source,isSourceLoaded:()=>true,getLayoutProperty:()=>undefined,setPaintProperty:(id,key,value)=>changes.push(value),style:{tileManagers:{'satellite-shade':{_inViewTiles:{getAllTiles:()=>states}}}},triggerRepaint:()=>{}};
  bindShadeReadiness(map,{setTimer:fn=>{timers.push(fn);return 1},clearTimer:()=>{}});
  listeners.sourcedata({sourceId:'satellite-shade'});assert.deepEqual(changes,[]);assert.equal(timers.length,1);
  timers[0]();assert.equal(retries,1);
  states=[{state:'loaded'}];listeners.sourcedata({sourceId:'satellite-shade'});assert.deepEqual(changes,[1]);
});
