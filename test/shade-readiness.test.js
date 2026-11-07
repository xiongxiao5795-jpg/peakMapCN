import test from 'node:test';
import assert from 'node:assert/strict';
import {bindShadeReadiness} from '../src/shade-readiness.js';

test('光影瓦片未加载完整时不显示局部分区，全部加载后统一显示',()=>{
  const listeners={},changes=[];let loaded=false,clears=0,repaints=0;
  const map={on:(name,fn)=>listeners[name]=fn,getLayer:()=>({}),getSource:()=>({}),isSourceLoaded:()=>loaded,setPaintProperty:(id,key,value)=>changes.push([id,key,value]),terrain:{tileManager:{releaseAllRTT:()=>clears++}},triggerRepaint:()=>repaints++};
  bindShadeReadiness(map);
  listeners.sourcedata({sourceId:'satellite-shade'});assert.deepEqual(changes,[]);
  loaded=true;listeners.sourcedata({sourceId:'satellite-shade'});assert.deepEqual(changes.at(-1),['satellite-shade','raster-opacity',1]);
  listeners.sourcedataloading({sourceId:'satellite'});assert.equal(changes.length,1);
  loaded=false;listeners.sourcedataloading({sourceId:'satellite-shade'});assert.deepEqual(changes.at(-1),['satellite-shade','raster-opacity',0]);
  listeners.sourcedata({sourceId:'satellite-shade'});assert.equal(changes.length,2);
  loaded=true;listeners.sourcedata({sourceId:'satellite-shade'});assert.equal(changes.at(-1)[2],1);
  assert.equal(clears,3);assert.equal(repaints,3);
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
