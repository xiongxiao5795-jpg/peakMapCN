// With online detail stalled, a mobile viewport must still use the bundled
// overview at the configured 10× rather than waiting on the network.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from '@playwright/test';

const server=await createServer({server:{host:'127.0.0.1',port:0}});
let browser;
try{
  await server.listen();
  const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,permissions:[]});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__peakMap?.getLayer('satellite'),null,{timeout:30000});
  await context.route('https://tiles.mapterhorn.com/**',()=>new Promise(()=>{}));
  await page.evaluate(()=>window.__peakMap.jumpTo({center:[103,29.6],zoom:9,pitch:45,bearing:0}));
  const start=Date.now();
  await page.waitForFunction(()=>{
    const map=window.__peakMap;
    return map.getTerrain()?.exaggeration===10&&map.terrain?.tileManager?.__peakSharedZoom>=6&&map.queryTerrainElevation([103,29.6])>0;
  },null,{timeout:10000});
  const result=await page.evaluate(()=>({exaggeration:window.__peakMap.getTerrain().exaggeration,level:window.__peakMap.terrain.tileManager.__peakSharedZoom,elevation:window.__peakMap.queryTerrainElevation([103,29.6])}));
  assert.equal(result.exaggeration,10);assert.equal(result.level,6);assert.ok(result.elevation>0);assert.deepEqual(errors,[]);
  console.log('远程地形阻塞时，已使用内置概览显示 10× 地形',JSON.stringify({...result,elapsedMs:Date.now()-start}));
}finally{await browser?.close();await server.close()}
