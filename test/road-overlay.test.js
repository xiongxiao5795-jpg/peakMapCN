import test from 'node:test';
import assert from 'node:assert/strict';
import {setupRoadOverlay} from '../src/road-overlay.js';

test('倾斜夸张地形采用屏幕恒宽道路，恢复平面后恢复原图层',async()=>{
  const events={},paints=[],strokes=[],oldDocument=globalThis.document,oldRatio=globalThis.devicePixelRatio;
  const context={setTransform(){},beginPath(){},moveTo(){},lineTo(){},stroke(){strokes.push(this.lineWidth)}};
  const canvas={className:'',setAttribute(){},getContext:()=>context,remove(){}};
  globalThis.document={createElement:()=>canvas};globalThis.devicePixelRatio=1;
  let pitch=45,value=40;
  const map={getContainer:()=>({clientWidth:800,clientHeight:600,appendChild(){}}),getPitch:()=>pitch,getLayer:()=>({}),setPaintProperty:(...args)=>paints.push(args),getSource:()=>({}),getBounds:()=>({contains:()=>true}),getZoom:()=>8,project:([x,y])=>({x:400+x,y:300-y}),querySourceFeatures:()=>[{properties:{class:'primary'},geometry:{type:'LineString',coordinates:[[0,0],[.1,.1]]}}],on:(event,fn)=>{events[event]=fn}};
  try{
    const overlay=setupRoadOverlay(map,{enabled:()=>true,exaggeration:()=>value});await new Promise(resolve=>setTimeout(resolve,150));
    assert.ok(paints.some(([id,,n])=>id==='road-major'&&n===0));assert.ok(strokes.includes(1.45));
    pitch=0;value=0;overlay.schedule();await new Promise(resolve=>setTimeout(resolve,150));
    assert.ok(paints.some(([id,,n])=>id==='road-major'&&n===0.95));assert.equal(canvas.hidden,true);
  }finally{globalThis.document=oldDocument;globalThis.devicePixelRatio=oldRatio}
});
