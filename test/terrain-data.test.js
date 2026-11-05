import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,statSync} from 'node:fs';
import {overviewTile,loadTerrainBitmap} from '../src/terrain-data.js';

test('全国概览数据不超过 22 MB，包含原有全部概览瓦片',()=>{
  const root=new URL('../public/terrain-overview/',import.meta.url);let bytes=0,count=0;
  function visit(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const url=new URL(`${item.name}${item.isDirectory()?'/':''}`,dir);if(item.isDirectory())visit(url);else if(item.name.endsWith('.webp')){bytes+=statSync(url).size;count++}}}
  visit(root);assert.equal(count,118);assert.ok(bytes<=22_000_000,`概览数据超出上限：${bytes}`);
});

test('细节请求失败时退回正确的概览父瓦片',async()=>{
  assert.deepEqual(overviewTile(8,201,102),{z:6,x:50,y:25,scale:4,dx:1,dy:2});
  const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap,calls=[];
  try{
    globalThis.fetch=async url=>{calls.push(String(url));if(String(url).startsWith('https:'))throw new Error('offline');return {ok:true,blob:async()=>new Blob(['overview'])}};
    globalThis.createImageBitmap=async blob=>({size:blob.size});
    const result=await loadTerrainBitmap(8,201,102,true,new AbortController().signal);
    assert.equal(result.tile.z,6);assert.equal(result.tile.dx,1);assert.match(calls[1],/terrain-overview\/6\/50\/25\.webp$/);
  }finally{globalThis.fetch=oldFetch;globalThis.createImageBitmap=oldBitmap}
});
