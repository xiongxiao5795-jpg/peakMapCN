import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedLoadedDemZoom,configureCoherentTerrain,terrainBlendProgress} from '../src/terrain-coherence.js';

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

test('新旧高程层级渐变，采样与绘制使用同一进度',()=>{
  assert.equal(terrainBlendProgress(100,100),0);assert.equal(terrainBlendProgress(100,425),0.5);assert.equal(terrainBlendProgress(100,750),1);
  const tiles=[{tileID:id(8,40,40)},{tileID:id(8,42,40)}],parent={dem:{},tileID:id(6,10,10)},first={dem:{},tileID:id(7,20,20)},second={dem:{},tileID:id(7,21,20)};
  const loaded=new Map([[parent.tileID.key,parent],[first.tileID.key,first]]),source={minzoom:0,maxzoom:12,hasTile:()=>true};
  const manager={deltaZoom:1,tileManager:{_source:source},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>undefined};
  const coverage={getSampler:id=>()=>manager.getSourceTile(id,true)===parent?100:200,_createElevationSampler(id){const value=manager.getSourceTile(id,true)===parent?100:200;return ()=>value}};
  const terrain={tileManager:manager,coverage,getTerrainData:id=>({tile:manager.getSourceTile(id,true)})};configureCoherentTerrain({terrain});manager.update();
  loaded.set(second.tileID.key,second);manager.update();const data=terrain.getTerrainData(tiles[0].tileID),sample=coverage.getSampler(tiles[0].tileID);
  assert.equal(data.tile,first);assert.equal(data.__peakPrevious.tile,parent);assert.ok(data.__peakMix>=0&&data.__peakMix<1);assert.ok(sample(0,0,1)>=100&&sample(0,0,1)<200);
  manager.__peakTransition.started-=1000;assert.equal(sample(0,0,1),200);
});

test('平移进入未加载区域时不将已显示的全部山体变平',()=>{
  const tiles=[{tileID:id(8,40,40)}],parent={dem:{},tileID:id(6,10,10)},loaded=new Map([[parent.tileID.key,parent]]),source={minzoom:0,maxzoom:12,hasTile:()=>true};
  const manager={deltaZoom:1,tileManager:{_source:source},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>undefined};
  configureCoherentTerrain({terrain:{tileManager:manager}});manager.update();tiles.push({tileID:id(8,60,40)});manager.update();
  assert.equal(manager.__peakSharedZoom,6);assert.equal(manager.getSourceTile(tiles[0].tileID,true),parent);assert.equal(manager.getSourceTile(tiles[1].tileID,true),undefined);
});

test('触屏设备等待目标高程层级，跳过逐级加载的中间层',()=>{
  const tiles=[{tileID:id(10,160,160)},{tileID:id(10,168,160)}],source={minzoom:0,maxzoom:12,hasTile:()=>true};
  const loaded=new Map([['6/10/10',{dem:{}}]]);let time=1000,wake=null;
  const manager={deltaZoom:1,tileManager:{_source:source},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>undefined};
  configureCoherentTerrain({terrain:{tileManager:manager}},{coarsePointer:true,now:()=>time,setTimer:fn=>(wake=fn,1),clearTimer:()=>{wake=null}});
  manager.update();assert.equal(manager.__peakSharedZoom,6);
  for(const key of ['7/20/20','7/21/20'])loaded.set(key,{dem:{}});
  manager.update();assert.equal(manager.__peakSharedZoom,6);assert.ok(wake);
  for(const key of ['8/40/40','8/42/40'])loaded.set(key,{dem:{}});
  time+=1200;manager.update();assert.equal(manager.__peakSharedZoom,6);
  for(const key of ['9/80/80','9/84/80'])loaded.set(key,{dem:{}});
  time+=300;manager.update();assert.equal(manager.__peakSharedZoom,6);
  time+=1401;manager.update();assert.equal(manager.__peakSharedZoom,9);assert.equal(manager.__peakTransition.from,6);assert.equal(wake,null);
});

test('触屏设备等待超时后使用已完整加载的层级',()=>{
  const tiles=[{tileID:id(10,160,160)},{tileID:id(10,168,160)}],source={minzoom:0,maxzoom:12,hasTile:()=>true};
  const loaded=new Map([['6/10/10',{dem:{}}]]);let time=1000;
  const manager={deltaZoom:1,tileManager:{_source:source},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>undefined};
  configureCoherentTerrain({terrain:{tileManager:manager}},{coarsePointer:true,now:()=>time,setTimer:()=>1,clearTimer:()=>{}});manager.update();
  for(const key of ['7/20/20','7/21/20'])loaded.set(key,{dem:{}});
  manager.update();assert.equal(manager.__peakSharedZoom,6);time+=10001;manager.update();assert.equal(manager.__peakSharedZoom,7);
});

test('手机地形网格仍在建立时等待相机请求的最终层级',()=>{
  const tiles=[{tileID:id(9,80,80)},{tileID:id(9,84,80)}],source={minzoom:0,maxzoom:12,hasTile:()=>true,calculateTileZoom:()=>9};
  const loaded=new Map([['6/10/10',{dem:{}}]]);let time=1000;
  const manager={deltaZoom:1,tileManager:{_source:source,tileSize:512},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>undefined};
  const map={terrain:{tileManager:manager},getZoom:()=>10};configureCoherentTerrain(map,{coarsePointer:true,now:()=>time,setTimer:()=>1,clearTimer:()=>{}});manager.update();
  for(const key of ['8/40/40','8/42/40'])loaded.set(key,{dem:{}});
  manager.update();time+=2000;manager.update();assert.equal(manager.__peakSharedZoom,6);
  tiles[0].tileID=id(10,160,160);tiles[1].tileID=id(10,168,160);
  for(const key of ['9/80/80','9/84/80'])loaded.set(key,{dem:{}});
  manager.update();time+=1401;manager.update();assert.equal(manager.__peakSharedZoom,9);
});

test('目标高程明确加载失败时不等待完整超时',()=>{
  const tiles=[{tileID:id(10,160,160)},{tileID:id(10,168,160)}],source={minzoom:0,maxzoom:12,hasTile:()=>true};
  const loaded=new Map([['6/10/10',{dem:{}}]]);let time=1000;
  const manager={deltaZoom:1,tileManager:{_source:source},update:()=>false,getRenderableTiles:()=>tiles,findTileInCaches:key=>loaded.get(key),getSourceTile:()=>undefined,isStillWaitingForDEM:()=>false};
  configureCoherentTerrain({terrain:{tileManager:manager}},{coarsePointer:true,now:()=>time,setTimer:()=>1,clearTimer:()=>{}});manager.update();
  for(const key of ['7/20/20','7/21/20'])loaded.set(key,{dem:{}});
  manager.update();assert.equal(manager.__peakSharedZoom,6);time+=1401;manager.update();assert.equal(manager.__peakSharedZoom,7);
});
