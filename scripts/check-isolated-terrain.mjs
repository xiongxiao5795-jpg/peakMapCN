// Browser regression check for an actual small administrative area. Uses the
// bundled overview tiles and does not depend on any external terrain service.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const server=await createServer({server:{host:'127.0.0.1',port:0}});
let browser;
try{
  await server.listen();
  const address=server.httpServer.address(),origin=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}),args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  await page.route('**/isolation-check.html',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html>'}));
  await page.goto(`${origin}/isolation-check.html`);
  const samples=await page.evaluate(async()=>{
    const {processTerrainTile}=await import('/src/terrain-processing.js');
    const {loadTerrainBitmap}=await import('/src/terrain-data.js');
    const cases=[{province:'44',code:'440784',point:[112.796341,22.668707],zooms:[6,7,8,9,10,11]},{province:'42',code:'420502',point:[111.318718,30.719864],zooms:[6,8,10]},{province:'62',code:'620802',point:[106.741998,35.510601],zooms:[6,8,10]}],results=[];
    for(const item of cases){
      const data=await (await fetch(`/data/admin-districts/${item.province}.json`)).json();
      const region=data.features.find(feature=>String(feature.properties.adcode)===item.code),point=item.point;
      for(const z of item.zooms){
        const n=2**z,xx=(point[0]+180)/360*n,yy=(1-Math.asinh(Math.tan(point[1]*Math.PI/180))/Math.PI)/2*n,x=Math.floor(xx),y=Math.floor(yy);
        const url=`dem-china://tiles.mapterhorn.com/${z}/${x}/${y}.webp?source=mapterhorn`,values=[];
        for(const scope of [null,region]){
          const {data}=await processTerrainTile({url},new AbortController(),true,false,scope);
          const bitmap=await createImageBitmap(new Blob([data],{type:'image/png'})),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext('2d');
          ctx.drawImage(bitmap,0,0);bitmap.close();
          const p=ctx.getImageData(Math.floor((xx-x)*canvas.width),Math.floor((yy-y)*canvas.height),1,1).data;
          values.push(p[0]*256+p[1]+p[2]/256-32768);
        }
        results.push({name:region.properties.name,z,full:values[0],isolated:values[1]});
      }
    }
    const point=[86.93,27.99],frontier=[];
    for(const z of [6,8,10]){
      const n=2**z,xx=(point[0]+180)/360*n,yy=(1-Math.asinh(Math.tan(point[1]*Math.PI/180))/Math.PI)/2*n,x=Math.floor(xx),y=Math.floor(yy);
      const {bitmap,tile}=await loadTerrainBitmap(z,x,y,true,new AbortController().signal,'mapterhorn'),canvas=new OffscreenCanvas(512,512),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
      if(tile&&tile.scale>1){const crop=bitmap.width/tile.scale;ctx.drawImage(bitmap,tile.dx*crop,tile.dy*crop,crop,crop,0,0,512,512)}else ctx.drawImage(bitmap,0,0,512,512);
      bitmap.close();const px=Math.floor((xx-x)*512),py=Math.floor((yy-y)*512),raw=ctx.getImageData(px,py,1,1).data;
      const {data}=await processTerrainTile({url:`dem-china://tiles.mapterhorn.com/${z}/${x}/${y}.webp?source=mapterhorn`},new AbortController(),true,false,null);
      const rendered=await createImageBitmap(new Blob([data],{type:'image/png'}));ctx.clearRect(0,0,512,512);ctx.drawImage(rendered,0,0);rendered.close();const actual=ctx.getImageData(px,py,1,1).data;
      const height=p=>p[0]*256+p[1]+p[2]/256-32768;
      frontier.push({z,source:height(raw),chinaOnly:height(actual)});
    }
    return {regions:results,frontier};
  });
  for(const sample of samples.regions){
    if(sample.name==='鹤山市')assert.ok(sample.full>200,`The reference point should contain real terrain: ${JSON.stringify(sample)}`);
    assert.ok(Math.abs(sample.full-sample.isolated)<1,`Isolation changed the elevation: ${JSON.stringify(sample)}`);
  }
  for(const sample of samples.frontier){
    assert.ok(sample.source>7000,`The border reference should contain real terrain: ${JSON.stringify(sample)}`);
    assert.ok(Math.abs(sample.source-sample.chinaOnly)<1,`China boundary changed the elevation: ${JSON.stringify(sample)}`);
  }
  console.log('行政区和中国范围边缘高程检查通过',JSON.stringify(samples));
}finally{
  await browser?.close();
  await server.close();
}
