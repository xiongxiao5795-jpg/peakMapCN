import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedLoadedDemZoom,configureCoherentTerrain} from '../src/terrain-coherence.js';

function id(z,x,y){return {overscaledZ:z,key:`${z}/${x}/${y}`,scaledTo(next){const n=2**(z-next);return id(next,Math.floor(x/n),Math.floor(y/n))}}}

test('邻接高程尚未全部加载时统一使用共同父级，完成后一起升级',()=>{
  const tiles=[{tileID:id(8,40,40)},{tileID:id(8,42,40)}];
  const loaded=new Map([['6/10/10',{dem:{}}],['7/20/20',{dem:{}}]]);
  const manager={findTileInCaches:key=>loaded.get(key)},source={minzoom:0,maxzoom:12,hasTile:()=>true};
  assert.equal(sharedLoadedDemZoom(tiles,manager,source,1),6);
  loaded.set('7/21/20',{dem:{}});assert.equal(sharedLoadedDemZoom(tiles,manager,source,1),7);
  loaded.delete('6/10/10');loaded.delete('7/21/20');assert.equal(sharedLoadedDemZoom(tiles,manager,source,1),null);
});

test('范围外瓦片不阻止区域内地形升级',()=>{
  const tiles=[{tileID:id(8,40,40)},{tileID:id(8,42,40)}],loaded=new Map([['7/20/20',{dem:{}}]]);
  const source={minzoom:0,maxzoom:12,hasTile:tile=>tile.key==='7/20/20'},manager={findTileInCaches:key=>loaded.get(key)};
  assert.equal(sharedLoadedDemZoom(tiles,manager,source,1),7);
});

test('渲染与地面采样共同使用完整父级并在加载完成后切换',()=>{
  const tiles=[{tileID:id(8,40,40)},{tileID:id(8,42,40)}],parent={dem:{},tileID:id(6,10,10)},first={dem:{},tileID:id(7,20,20)},second={dem:{},tileID:id(7,21,20)};
  const loaded=new Map([[parent.tileID.key,parent],[first.tileID.key,first]]),source={minzoom:0,maxzoom:12,hasTile:()=>true};
  const manager={deltaZoom:1,tileManager:{_source:source},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>undefined};
  const map={terrain:{tileManager:manager}};configureCoherentTerrain(map);assert.equal(manager.update(),true);
  assert.equal(manager.getSourceTile(tiles[0].tileID,true),parent);assert.equal(manager.getSourceTile(tiles[1].tileID,true),parent);
  loaded.set(second.tileID.key,second);assert.equal(manager.update(),true);assert.equal(manager.getSourceTile(tiles[0].tileID,true),first);assert.equal(manager.getSourceTile(tiles[1].tileID,true),second);
  loaded.delete(second.tileID.key);assert.equal(manager.getSourceTile(tiles[1].tileID,true),undefined);
});

test('没有完整共同层级时不提前展示局部高地形',()=>{
  const tiles=[{tileID:id(8,40,40)},{tileID:id(8,42,40)}],child={dem:{},tileID:id(7,20,20)},loaded=new Map([[child.tileID.key,child]]),source={minzoom:0,maxzoom:12,hasTile:()=>true};
  const manager={deltaZoom:1,tileManager:{_source:source},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>child};
  configureCoherentTerrain({terrain:{tileManager:manager}});manager.update();
  assert.equal(manager.getSourceTile(tiles[0].tileID,true),undefined);
  assert.equal(manager.getSourceTile(tiles[0].tileID,false),child);
});

test('平移时保持已完整加载的地形层级，停止后再提升细节',()=>{
  const tiles=[{tileID:id(8,40,40)},{tileID:id(8,42,40)}],loaded=new Map([['6/10/10',{dem:{}}],['7/20/20',{dem:{}}]]),source={minzoom:0,maxzoom:12,hasTile:()=>true};
  let moving=false;
  const manager={deltaZoom:1,tileManager:{_source:source},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>undefined};
  configureCoherentTerrain({terrain:{tileManager:manager},isMoving:()=>moving});manager.update();assert.equal(manager.__peakSharedZoom,6);
  moving=true;loaded.set('7/21/20',{dem:{}});manager.update();assert.equal(manager.__peakSharedZoom,6);
  moving=false;manager.update();assert.equal(manager.__peakSharedZoom,7);
});
