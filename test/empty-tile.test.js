import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmptyTileFactory} from '../src/empty-tile.js';

test('范围外空瓦片有绘图上下文，复用编码且可安全转移数据',async()=>{
  let encodes=0,demFills=0;
  const makeCanvas=()=>({getContext(){this.context=true;return {fillRect(){demFills++}}}});
  const encode=async canvas=>{assert.equal(canvas.context,true);encodes++;return new Uint8Array([1,2,3]).buffer};
  const empty=createEmptyTileFactory(makeCanvas,encode);
  const [a,b]=await Promise.all([empty(256),empty(256)]);
  assert.equal(encodes,1);assert.notEqual(a.data,b.data);assert.equal(a.outside,true);
  await empty(512,true);assert.equal(encodes,2);assert.equal(demFills,1);
});
