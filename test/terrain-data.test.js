import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,statSync} from 'node:fs';
import {overviewTile,loadTerrainBitmap} from '../src/terrain-data.js';
import overviewIndex from '../src/terrain-overview-index.js';

test('全国概览数据不超过 22 MB，包含原有全部概览瓦片',()=>{
  const root=new URL('../public/terrain-overview/',import.meta.url);let bytes=0,count=0;const paths=[];
  function visit(dir,prefix=''){for(const item of readdirSync(dir,{withFileTypes:true})){const url=new URL(`${item.name}${item.isDirectory()?'/':''}`,dir);if(item.isDirectory())visit(url,`${prefix}${item.name}/`);else if(item.name.endsWith('.webp')){bytes+=statSync(url).size;count++;paths.push(`${prefix}${item.name.slice(0,-5)}`)}}}
  visit(root);assert.equal(count,118);assert.ok(bytes<=22_000_000,`概览数据超出上限：${bytes}`);assert.deepEqual(paths.sort(),[...overviewIndex].sort());
});

test('明确离线时使用正确的概览父瓦片',async()=>{
  assert.deepEqual(overviewTile(8,201,102),{z:6,x:50,y:25,scale:4,dx:1,dy:2});
  const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),calls=[];
  try{
    Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});
    globalThis.fetch=async url=>{calls.push(String(url));if(String(url).startsWith('https:'))throw new Error('offline');return {ok:true,blob:async()=>new Blob(['overview'])}};
    globalThis.createImageBitmap=async blob=>({size:blob.size});
    const result=await loadTerrainBitmap(8,201,102,true,new AbortController().signal);
    assert.equal(result.tile.z,6);assert.equal(result.tile.dx,1);assert.match(calls[0],/terrain-overview\/6\/50\/25\.webp$/);
  }finally{globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator}
});

test('在线细节请求失败不会把概览伪装成已加载的细节瓦片',async()=>{
  const oldFetch=globalThis.fetch,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let calls=0;
  try{
    Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
    globalThis.fetch=async()=>{calls++;throw new Error('temporary failure')};
    await assert.rejects(loadTerrainBitmap(8,201,102,true,new AbortController().signal),/temporary failure/);
    assert.equal(calls,1);
  }finally{globalThis.fetch=oldFetch;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator}
});

test('不请求概览包中不存在的低级瓦片',async()=>{
  const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap,calls=[];
  try{
    globalThis.fetch=async url=>{calls.push(String(url));return {ok:true,blob:async()=>new Blob(['detail'])}};
    globalThis.createImageBitmap=async()=>({width:512,height:512});
    await loadTerrainBitmap(2,3,0,true,new AbortController().signal);
    assert.deepEqual(calls,['https://tiles.mapterhorn.com/2/3/0.webp']);
  }finally{globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap}
});

test('选择 AWS 时明确请求 AWS 原始高程，不会悄悄替换为 Mapterhorn 离线概览',async()=>{
  const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),calls=[];
  try{
    Object.defineProperty(globalThis,'navigator',{value:{onLine:false},configurable:true});
    globalThis.fetch=async url=>{calls.push(String(url));return {ok:true,blob:async()=>new Blob(['aws'])}};
    globalThis.createImageBitmap=async()=>({width:256,height:256});
    const result=await loadTerrainBitmap(7,101,50,true,new AbortController().signal,'aws');
    assert.equal(result.tile,null);assert.equal(result.bitmap.width,256);
    assert.match(calls[0],/^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\/terrarium\/7\/101\/50\.png$/);
  }finally{globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator}
});
