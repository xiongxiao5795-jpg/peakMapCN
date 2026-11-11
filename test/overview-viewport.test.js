import test from 'node:test';
import assert from 'node:assert/strict';
import {fitOverviewViewport,fitOverviewWithFocus} from '../src/overview-viewport.js';

const y=lat=>(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2;
function contains(result,bounds,width,height){
  const world=512*2**result.zoom,cx=(result.center[0]+180)/360,cy=y(result.center[1]);
  const [w,s,e,n]=bounds;
  return (w+180)/360>=cx-width/(2*world)-1e-9&&(e+180)/360<=cx+width/(2*world)+1e-9&&y(n)>=cy-height/(2*world)-1e-9&&y(s)<=cy+height/(2*world)+1e-9;
}

test('不同比例、倾斜视野包围框和鸟瞰窗口始终完整包含主视图',()=>{
  for(const bounds of [[72,18,136,55],[98,25,113,38],[110.5,30.8,111.2,31.3]])for(const [width,height] of [[216,135],[360,240],[190,140]]){
    const result=fitOverviewViewport(bounds,{width,height,center:[104,35],zoom:10});
    assert.ok(contains(result,bounds,width,height),JSON.stringify({bounds,width,height,result}));
    assert.ok(result.zoom<result.fitZoom);
  }
});

test('主视图缩放后鸟瞰自动缩放，用户平移时不改变主图',()=>{
  const options={width:216,height:140,center:[120,40]};
  const broad=fitOverviewViewport([98,25,113,38],options),near=fitOverviewViewport([104,30,106,32],options);
  assert.ok(near.zoom>broad.zoom);assert.ok(contains(near,[104,30,106,32],216,140));
  assert.ok(near.center[0]<120);
});

test('全国范围作为初始视野，手动放大时仍完整包含主视图',()=>{
  const main=[110,35,115,40],national=[73,18,135,54],options={width:300,height:200,center:[112,37],extraZoom:1.2};
  const initial=fitOverviewWithFocus(main,national,options);
  const manual=fitOverviewWithFocus(main,national,options,-0.2);
  assert.ok(contains(initial,national,300,200));
  assert.ok(manual.zoom>initial.zoom+1);
  assert.ok(contains(manual,main,300,200));
});
