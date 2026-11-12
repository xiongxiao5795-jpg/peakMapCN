import mlcontour from 'maplibre-contour';
import { terrainMetrics } from './terrain-metrics.js';
import { sampleElevations, distanceKm } from './elevation-sampling.js';
import { tileTemplate, getTerrainSource } from './terrain.js';
import { geometryBounds, boundsOverlap } from './admin.js';
import { setupRoadOverlay } from './road-overlay.js';
import { setupCenterScale } from './center-scale.js';
import { configureTerrainLod, configureMobileTerrainTextures, limitTerrainSkirts, configureTerrainMesh } from './terrain-lod.js';
import { terrainSourceMaxZoom, setTerrainSourceMaxZoom } from './terrain-source-level.js';
import { processTerrainTile } from './terrain-processing.js';
import { fitOverviewWithFocus } from './overview-viewport.js';
import { overviewAdministrativeLevel } from './overview-administration.js';
import { configureCoherentTerrain } from './terrain-coherence.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { loadLocalAdministrativeBoundaries, loadLocalDistrictBoundaries } from './admin-boundaries.js';

const $=selector=>document.querySelector(selector);
const escapeText=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty={type:'FeatureCollection',features:[]};
const points=[
  {name:'珠峰与喜马拉雅',center:[86.93,27.99],zoom:8.4,bearing:-22,pitch:55,description:'从北侧观察珠穆朗玛峰与喜马拉雅山脉。'},
  {name:'四川盆地',center:[104.7,30.75],zoom:5.3,bearing:0,pitch:35,description:'观察盆地与周围山地的关系。'},
  {name:'横断山脉',center:[99.2,28.4],zoom:6.3,bearing:8,pitch:55,description:'观察山脉与河谷的纵向排列。'},
  {name:'黄土高原',center:[109.5,36.3],zoom:7,bearing:0,pitch:50,description:'观察黄土高原沟谷和地形起伏。'},
  {name:'长江三峡',center:[110.85,31.05],zoom:8,bearing:12,pitch:55,description:'沿长江观察三峡地区的山地与河谷。'}
];
const bookmarkKey='peakmap-bookmarks-v1';
function getBookmarks(){try{const v=JSON.parse(localStorage.getItem(bookmarkKey)||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function saveBookmarks(list){try{localStorage.setItem(bookmarkKey,JSON.stringify(list));return true}catch{return false}}
function captureThumbnail(map){try{const canvas=document.createElement('canvas');canvas.width=144;canvas.height=80;canvas.getContext('2d').drawImage(map.getCanvas(),0,0,144,80);return canvas.toDataURL('image/jpeg',0.55)}catch{return null}}
function stateFor(map){return {center:map.getCenter().toArray(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch(),base:$('#base-map').value,source:getTerrainSource(),mode:$('#terrain-mode').value,exaggeration:Number($('#exaggeration').value),style:$('#visual-style').value,lightingStyle:$('#terrain-lighting-style').value,time:$('#sun-time').value,light:Number($('#light-strength').value),shadow:$('#terrain-shadows').checked,softness:Number($('#terrain-softness').value),fog:Number($('#fog-strength').value),selected:map.__getExplorerSelection?.()||null,isolate:$('#isolate-toggle').checked,contours:$('#contours-toggle')?.checked||false,analysis:$('#analysis-mode')?.value||'none',blend:Number($('#terrain-blend')?.value||0)};}
function setValue(id,value,event='change'){const el=$(`#${id}`);if(value==null||!el)return;if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===String(value)))return;el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}));}
function restore(map,state){
  if(!state||!Array.isArray(state.center)||state.center.length!==2||!state.center.every(Number.isFinite)||Math.abs(state.center[0])>180||Math.abs(state.center[1])>85)return false;
  for(const [id,value,event] of [['base-map',state.base],['terrain-source',state.source],['exaggeration',state.exaggeration,'input'],['terrain-mode',state.mode==='flat'?'flat':'3d'],['visual-style',state.style],['terrain-lighting-style',state.lightingStyle],['terrain-softness',state.softness,'input'],['fog-strength',state.fog,'input'],['sun-time',state.time,'input'],['light-strength',state.light,'input']])setValue(id,value,event);
  const clamp=(n,min,max,fallback)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
  if(typeof state.shadow==='boolean'){$('#terrain-shadows').checked=state.shadow;$('#terrain-shadows').dispatchEvent(new Event('change'))}
  if(state.selected)map.__selectExplorerPlace?.(state.selected);
  if(typeof state.isolate==='boolean'){$('#isolate-toggle').checked=state.isolate;$('#isolate-toggle').dispatchEvent(new Event('change'))}
  if(typeof state.contours==='boolean'&&$('#contours-toggle')){$('#contours-toggle').checked=state.contours;$('#contours-toggle').dispatchEvent(new Event('change'))}
  if(state.analysis)setValue('analysis-mode',state.analysis);if(Number.isFinite(state.blend))setValue('terrain-blend',state.blend,'input');
  map.easeTo({center:state.center,zoom:clamp(state.zoom,1,14,5),bearing:clamp(state.bearing,-360,360,0),pitch:state.mode==='flat'?0:clamp(state.pitch,0,75,55),duration:900});return true;
}
export function sharedViewFromUrl(){try{const value=new URL(location.href).searchParams.get('view');if(!value)return null;const state=JSON.parse(decodeURIComponent(escape(atob(value.replace(/-/g,'+').replace(/_/g,'/')))));return state&&typeof state==='object'?state:null}catch{return null}}
function shareUrl(map){const url=new URL(location.href);const state=stateFor(map);state.center=state.center.map(v=>+v.toFixed(5));for(const key of ['zoom','bearing','pitch'])state[key]=+state[key].toFixed(2);url.searchParams.set('view',btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''));return url.href;}

export function setupExplorer({map,maplibregl,adminAreas,notify,initialView,getSelection,selectPlace,roadAllowed}){
  map.__getExplorerSelection=getSelection;map.__selectExplorerPlace=selectPlace;
  const area=$('.map-area'), drawer=document.createElement('aside');drawer.id='explorer-drawer';drawer.className='explorer-drawer';drawer.hidden=true;drawer.setAttribute('aria-label','地图设置与探索');
  drawer.innerHTML=`<div class="explorer-header"><div><small>EXPLORE THE LAND</small><h2>山河探索</h2></div><button id="drawer-close" aria-label="关闭设置">×</button></div><div class="explorer-scroll"><details open><summary>地图样式与地形</summary><div id="drawer-relief"></div><div class="explorer-row"><label for="terrain-blend">卫星与地形混合</label><output id="terrain-blend-value">0%</output></div><input id="terrain-blend" type="range" min="0" max="100" value="0"><p>仅卫星底图生效；100% 显示地形设色。</p><label class="explorer-row"><span>地形色彩</span><select id="relief-palette"><option value="natural">自然地理</option><option value="sand">山地沙盘</option><option value="ink">水墨</option><option value="high">高海拔浅色</option></select></label></details><details><summary>地理信息与边界</summary><div id="drawer-layers"></div></details><details><summary>光照与天空</summary><div id="drawer-sun"></div><button id="clear-relief-light" class="explorer-button">上午地形光照</button><p>将光照时间设为当地地图所用日期的北京时间 10:00。</p></details><details><summary>地形图层</summary><label class="explorer-row"><span>多方向山体阴影</span><input type="checkbox" id="multi-toggle"></label><p>从四个方向组合坡面明暗，帮助识别山脊和山谷；不表示真实太阳位置。</p><label class="explorer-row"><span>等高线</span><input type="checkbox" id="contours-toggle"></label><label class="explorer-row"><span>坡度与坡向</span><select id="analysis-mode"><option value="none">关闭</option><option value="slope">陡峭程度</option><option value="aspect">山坡朝向</option></select></label><label class="explorer-row" for="analysis-opacity"><span>图层强度</span><output id="analysis-opacity-value">70%</output></label><input id="analysis-opacity" type="range" min="0" max="100" value="70"><p id="analysis-legend">坡度和坡向按原始高程估算，与视觉倍率无关；详细高程及等高线需要联网。</p><button id="point-pick" class="explorer-button">点击地图查询高程</button><button id="profile-pick" class="explorer-button">画两点地形剖面</button><p>开启工具后，在地图上点击；按 Esc 取消。</p></details><details><summary>数据源与历史影像</summary><label class="explorer-row"><span>地形源对比</span><input id="compare-toggle" type="checkbox"></label><p>左侧为当前地形源，右侧为另一数据源；两侧完整显示同一中心与视角。</p><label class="explorer-row"><span>历史卫星影像</span><select id="history-release"><option value="">当前影像</option></select></label><button id="history-load" class="explorer-button">加载历史影像目录</button><p>日期是影像版本发布日期，未必是当地拍摄日期；影像 © Esri；AWS 数据及来源见 <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">数据说明</a>。</p></details><details><summary>山河观察点与收藏</summary><div id="featured-views"></div><div class="explorer-actions"><button id="bookmark-save" class="explorer-button">收藏当前视角</button><button id="share-view" class="explorer-button">复制分享链接</button></div><div id="bookmark-list"></div></details><details><summary>数据与说明</summary><p>地形：Mapterhorn 或 AWS Terrain Tiles（Terrarium）；底图：Esri World Imagery；地名：GeoNames 与精选数据。中国概览已内置，详细地形和卫星影像需联网。高程为模型估算，显示倍率不改变原始海拔。</p><p><a href="https://mapterhorn.com/attribution" target="_blank" rel="noreferrer">地形数据来源与许可 ↗</a></p></details></div>`;
  area.append(drawer);
  const scroll=drawer.querySelector('.explorer-scroll'),groups=[...scroll.children];
  const tabDefinitions=[['map','地图',[0]],['boundaries','边界',[1]],['light','光照',[2]],['analysis','分析',[3]],['data','数据',[4,6]],['saved','收藏',[5]]];
  const tabList=document.createElement('div');tabList.className='explorer-tabs';tabList.setAttribute('role','tablist');tabList.setAttribute('aria-label','探索与设置分类');
  for(const [id,label,indexes] of tabDefinitions){
    const button=document.createElement('button');button.type='button';button.id=`explorer-tab-${id}`;button.setAttribute('role','tab');button.setAttribute('aria-controls',`explorer-panel-${id}`);button.textContent=label;tabList.append(button);
    const panel=document.createElement('section');panel.id=`explorer-panel-${id}`;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);
    for(const index of indexes){groups[index].open=true;panel.append(groups[index])}scroll.append(panel);
  }
  drawer.insertBefore(tabList,scroll);
  function selectDrawerTab(id){
    for(const [name] of tabDefinitions){const selected=name===id,button=$(`#explorer-tab-${name}`),panel=$(`#explorer-panel-${name}`);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;panel.hidden=!selected}
    scroll.scrollTop=0;
  }
  tabList.addEventListener('click',event=>{const tab=event.target.closest('[role="tab"]');if(tab)selectDrawerTab(tab.id.slice('explorer-tab-'.length))});
  tabList.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const buttons=[...tabList.querySelectorAll('[role="tab"]')],current=buttons.indexOf(document.activeElement);if(current<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();buttons[next].click()});
  selectDrawerTab('map');
  $('#drawer-relief').append($('#relief-body'));$('#drawer-layers').append($('#layer-panel'));$('#drawer-sun').append($('#sun-panel'));
  const toggle=$('#layer-toggle');toggle.querySelector('span').textContent='探索与设置';toggle.setAttribute('aria-controls','explorer-drawer');toggle.setAttribute('aria-expanded','false');
  function openDrawer(open){drawer.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){$('#relief-body').hidden=false;$('#layer-panel').hidden=false;$('#sun-panel').hidden=false;$('#search-panel').hidden=true;$('#search-toggle').setAttribute('aria-expanded','false')}}
  toggle.onclick=()=>openDrawer(drawer.hidden);$('#drawer-close').onclick=()=>openDrawer(false);$('#layer-close').onclick=()=>openDrawer(false);$('#sun-close').onclick=()=>openDrawer(false);
  $('#sun-toggle').onclick=()=>{openDrawer(true);selectDrawerTab('light');$('#drawer-sun').closest('details').open=true};
  const reliefButton=$('#relief-toggle');reliefButton.onclick=()=>{openDrawer(true);selectDrawerTab('map');$('#drawer-relief').closest('details').open=true};
  $('#search-toggle').addEventListener('click',()=>openDrawer(false),{capture:true});
  setupCenterScale(map);
  const overviewControl=document.createElement('div');overviewControl.className='overview-control';overviewControl.innerHTML=`<div id="overview-box" class="overview-box" hidden><div class="overview-head"><strong title="拖动移动鸟瞰窗口">鸟瞰地图</strong><select id="overview-range" aria-label="鸟瞰范围"><option value="national">全国</option><option value="regional" selected>周边</option><option value="near">附近</option></select><button id="overview-zoom-in" title="放大鸟瞰">+</button><button id="overview-zoom-out" title="缩小鸟瞰">−</button></div><div id="overview-map"></div><label class="overview-settings">点击后范围 <select id="overview-target-scale"><option value="-1">宽广</option><option value="0" selected>标准</option><option value="1">放大</option></select></label><small>蓝色：选中区域 · 红色：主视图范围</small><button id="overview-resize" type="button" aria-label="拖动调整鸟瞰窗口大小" title="拖动调整窗口大小">↗</button></div><button id="overview-toggle" class="overview-toggle" aria-expanded="false" aria-controls="overview-box">▧ <span>鸟瞰</span></button>`;area.append(overviewControl);
  let mini=null,miniMoving=false,manualZoomOffset=null,manualOverviewCenter=null,miniRevision=0,miniLoading=false,miniCities=[],miniDistricts=[],miniAdminLevel='province',selectedOverviewFeature=null,selectedOverviewCenter=null,overviewFrame=null,divisionTimer=null;
  const nationalBounds=adminAreas.features.reduce((all,feature)=>{const b=geometryBounds(feature);return [Math.min(all[0],b[0]),Math.min(all[1],b[1]),Math.max(all[2],b[2]),Math.max(all[3],b[3])]},[180,90,-180,-90]);
  const overviewBoundsCache=new WeakMap(),overviewBounds=feature=>{if(!overviewBoundsCache.has(feature))overviewBoundsCache.set(feature,geometryBounds(feature));return overviewBoundsCache.get(feature)};
  const pointLabels=(features,center)=>({type:'FeatureCollection',features:features.filter(f=>Array.isArray(f.properties.centroid||f.properties.center)).map(f=>({type:'Feature',geometry:{type:'Point',coordinates:f.properties.centroid||f.properties.center},properties:{name:f.properties.name}})).sort((a,b)=>{if(!center)return 0;const d=p=>Math.hypot((p[0]-center.lng)*Math.cos(center.lat*Math.PI/180),p[1]-center.lat);return d(a.geometry.coordinates)-d(b.geometry.coordinates)}).map((f,rank)=>({...f,properties:{...f.properties,rank}}))});
  async function refreshOverviewDivisions(){
    if(!mini?.getSource('mini-city'))return;const revision=++miniRevision,zoom=mini.getZoom(),level=overviewAdministrativeLevel(map.getZoom(),zoom,selectedOverviewFeature),b=mini.getBounds(),bounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],center=mini.getCenter();miniLoading=true;
    const distance=f=>{const b=overviewBounds(f);return Math.hypot((b[0]+b[2])/2-center.lng,(b[1]+b[3])/2-center.lat)},selectedProvince=String(selectedOverviewFeature?.properties?.adcode||'').slice(0,2);
    const provinces=adminAreas.features.filter(f=>boundsOverlap(overviewBounds(f),bounds)).sort((a,b)=>Number(String(b.properties.adcode).startsWith(selectedProvince)&&!!selectedProvince)-Number(String(a.properties.adcode).startsWith(selectedProvince)&&!!selectedProvince)||distance(a)-distance(b)).slice(0,8);
    let cities=[],districts=[];
    if(level!=='province'){const data=await loadLocalAdministrativeBoundaries().catch(()=>null);if(data)cities=provinces.flatMap(f=>data.byParent.get(String(f.properties.adcode))||[]).filter(f=>boundsOverlap(overviewBounds(f),bounds));}
    if(level==='district'){const groups=await Promise.all(provinces.slice(0,4).map(f=>loadLocalDistrictBoundaries(f.properties.adcode).catch(()=>null)));districts=groups.flatMap(group=>group?[...group.byCode.values()]:[]).filter(f=>boundsOverlap(overviewBounds(f),bounds));}
    if(revision!==miniRevision||!mini)return;miniCities=cities;miniDistricts=districts;miniAdminLevel=level;miniLoading=false;
    mini.getSource('mini-city').setData({type:'FeatureCollection',features:cities});mini.getSource('mini-district').setData({type:'FeatureCollection',features:districts});mini.getSource('mini-city-labels').setData(pointLabels(cities,center));mini.getSource('mini-district-labels').setData(pointLabels(districts,center));
    for(const [id,visible] of [['province-labels',level==='province'||!cities.length],['city-labels',level!=='province'],['district-labels',level==='district'],['mini-city-fill',level!=='province'],['mini-district-fill',level==='district']])mini.setLayoutProperty(id,'visibility',visible?'visible':'none');
  }
  function overviewView(){
    const b=map.getBounds(),bounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
    const include=other=>{bounds[0]=Math.min(bounds[0],other[0]);bounds[1]=Math.min(bounds[1],other[1]);bounds[2]=Math.max(bounds[2],other[2]);bounds[3]=Math.max(bounds[3],other[3])};
    const w=map.getContainer().clientWidth,h=map.getContainer().clientHeight;
    const corners=[[0,0],[w,0],[w,h],[0,h]].map(point=>map.unproject(point).toArray());
    if(corners.every(point=>point.every(Number.isFinite))&&Math.max(...corners.map(p=>p[0]))-Math.min(...corners.map(p=>p[0]))<180)include([Math.min(...corners.map(p=>p[0])),Math.min(...corners.map(p=>p[1])),Math.max(...corners.map(p=>p[0])),Math.max(...corners.map(p=>p[1]))]);
    const mainBounds=[...bounds];
    if(selectedOverviewFeature)include(geometryBounds(selectedOverviewFeature));
    if($('#overview-range').value==='national')include(nationalBounds);
    const container=mini.getContainer(),width=container.clientWidth,height=container.clientHeight;
    const center=manualOverviewCenter?.toArray?.()||selectedOverviewCenter||map.getCenter().toArray();
    const mode=$('#overview-range').value,extraZoom=mode==='near'?0.3:mode==='national'?1.2:0.7;
    const options={width,height,center,extraZoom};
    // The range and selected area determine the automatic starting view, but
    // only the main view limits manual zoom. Otherwise choosing “全国” makes
    // it impossible to zoom in, even when the main view is much smaller.
    return fitOverviewWithFocus(mainBounds,bounds,options,manualZoomOffset);
  }
  function updateOverview(){
    if(!mini?.getSource('viewport')||$('#overview-box').hidden||!mini.getContainer().clientWidth||!mini.getContainer().clientHeight)return;
    const w=map.getContainer().clientWidth,h=map.getContainer().clientHeight;
    const corners=[[0,0],[w,0],[w,h],[0,h]].map(point=>map.unproject(point).toArray());
    const finite=corners.every(point=>point.every(Number.isFinite))&&Math.max(...corners.map(p=>p[0]))-Math.min(...corners.map(p=>p[0]))<180;
    const b=map.getBounds(),fallback=[[b.getWest(),b.getSouth()],[b.getEast(),b.getSouth()],[b.getEast(),b.getNorth()],[b.getWest(),b.getNorth()]];
    const ring=(finite?corners:fallback).map(([lng,lat])=>[Math.max(-180,Math.min(180,lng)),Math.max(-85,Math.min(85,lat))]);ring.push(ring[0]);
    mini.getSource('viewport').setData({type:'Feature',geometry:{type:'Polygon',coordinates:[ring]},properties:{}});
    const view=overviewView();miniMoving=true;mini.jumpTo({center:view.center,zoom:view.zoom});miniMoving=false;
    clearTimeout(divisionTimer);divisionTimer=setTimeout(()=>void refreshOverviewDivisions(),120);
  }
  function fitOverviewSelection(){
    if(!mini?.getSource('overview-selection'))return;
    mini.getSource('overview-selection').setData(selectedOverviewFeature||empty);
    if(!selectedOverviewFeature){selectedOverviewCenter=null;updateOverview();return}
    const [w,s,e,n]=geometryBounds(selectedOverviewFeature);selectedOverviewCenter=[(w+e)/2,(s+n)/2];updateOverview();
  }
  map.on('peak:selection',event=>{selectedOverviewFeature=event.feature||null;selectedOverviewCenter=null;manualOverviewCenter=null;manualZoomOffset=null;if(mini)fitOverviewSelection()});
  function chooseOverviewFeature(feature,layer){
    const code=String(feature.properties.adcode),kind=layer==='mini-district-fill'||feature.properties.level==='district'?'district':layer==='mini-city-fill'?'city':'province';
    selectPlace(`${kind}-${code}`);const [w,s,e,n]=geometryBounds(feature),bounds=[[w,s],[e,n]],camera=map.cameraForBounds(bounds,{pitch:0,bearing:0,padding:35,maxZoom:kind==='province'?7:kind==='city'?10:12});
    if(camera){const center=new maplibregl.LngLatBounds(bounds[0],bounds[1]).getCenter();map.easeTo({center,zoom:Math.max(1,Math.min(13,camera.zoom+Number($('#overview-target-scale').value))),pitch:map.getPitch(),bearing:map.getBearing(),duration:850})}
  }
  function createOverview(){
    const labelLayer=(id,source)=>({id,type:'symbol',source,layout:{'text-field':['get','name'],'text-font':['sans-serif'],'text-size':10,'text-allow-overlap':false,'symbol-sort-key':['get','rank']},paint:{'text-color':'#283b30','text-halo-color':'#edf2e5','text-halo-width':1}});
    mini=new maplibregl.Map({container:'overview-map',interactive:true,attributionControl:false,center:[103.5,35],zoom:2.4,minZoom:-2,style:{version:8,sources:{china:{type:'geojson',data:adminAreas},'mini-province-labels':{type:'geojson',data:pointLabels(adminAreas.features)},'mini-city':{type:'geojson',data:empty},'mini-city-labels':{type:'geojson',data:empty},'mini-district':{type:'geojson',data:empty},'mini-district-labels':{type:'geojson',data:empty},'overview-selection':{type:'geojson',data:empty},viewport:{type:'geojson',data:empty}},layers:[{id:'background',type:'background',paint:{'background-color':'#d3dfd7'}},{id:'mini-province-fill',type:'fill',source:'china',paint:{'fill-color':'#aebfa8','fill-outline-color':'#708b77'}},{id:'mini-city-fill',type:'fill',source:'mini-city',paint:{'fill-color':'#aabda8','fill-outline-color':'#819b86','fill-opacity':0.6}},{id:'mini-district-fill',type:'fill',source:'mini-district',paint:{'fill-color':'#aec2ae','fill-outline-color':'#8aa28d','fill-opacity':0.6}},{id:'overview-selected-fill',type:'fill',source:'overview-selection',paint:{'fill-color':'#4479c4','fill-opacity':0.16}},{id:'overview-selected-line',type:'line',source:'overview-selection',paint:{'line-color':'#204fbd','line-width':2}},{id:'extent',type:'fill',source:'viewport',paint:{'fill-color':'#d54c36','fill-opacity':0.18}},{id:'extent-line',type:'line',source:'viewport',paint:{'line-color':'#bd352b','line-width':1.5}},labelLayer('province-labels','mini-province-labels'),labelLayer('city-labels','mini-city-labels'),labelLayer('district-labels','mini-district-labels')]}});
    if(import.meta.env.DEV)window.__peakOverview=mini;
    mini.on('load',()=>{if(selectedOverviewFeature)fitOverviewSelection();else updateOverview()});mini.on('click',e=>{
      if(miniLoading){notify('正在加载鸟瞰行政区，请稍候');return}
      const coord=e.lngLat.toArray(),find=features=>features.find(feature=>booleanPointInPolygon(coord,feature));
      const district=miniAdminLevel==='district'?find(miniDistricts):null,city=miniAdminLevel!=='province'?find(miniCities):null,province=find(adminAreas.features);
      if(district)chooseOverviewFeature(district,'mini-district-fill');else if(city)chooseOverviewFeature(city,'mini-city-fill');else if(province)chooseOverviewFeature(province,'mini-province-fill');else map.easeTo({center:e.lngLat,pitch:map.getPitch(),duration:500});
    });
    mini.on('move',()=>{if(!miniMoving)manualOverviewCenter=mini.getCenter()});
    mini.on('moveend',()=>{if(!miniMoving){manualOverviewCenter=mini.getCenter();manualZoomOffset=mini.getZoom()-overviewView().fitZoom;clearTimeout(divisionTimer);divisionTimer=setTimeout(()=>void refreshOverviewDivisions(),120)}});mini.scrollZoom.enable();
  }
  const overviewToggle=$('#overview-toggle');overviewToggle.title='点击打开或收起鸟瞰；拖动可移动';let toggleDrag=null,suppressToggleClick=false,suppressToggleTimer;
  function clampOverviewPosition(){
    if(!overviewControl.style.top)return;
    overviewControl.style.left=`${Math.max(0,Math.min(area.clientWidth-overviewControl.offsetWidth,parseFloat(overviewControl.style.left)||0))}px`;
    overviewControl.style.top=`${Math.max(0,Math.min(area.clientHeight-overviewControl.offsetHeight,parseFloat(overviewControl.style.top)||0))}px`;
  }
  overviewToggle.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;clearTimeout(suppressToggleTimer);suppressToggleClick=false;
    const rect=overviewControl.getBoundingClientRect(),parent=area.getBoundingClientRect();
    toggleDrag={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left-parent.left,top:rect.top-parent.top,parent,moved:false};overviewToggle.setPointerCapture(event.pointerId);
  });
  overviewToggle.addEventListener('pointermove',event=>{
    if(toggleDrag?.id!==event.pointerId)return;
    const dx=event.clientX-toggleDrag.x,dy=event.clientY-toggleDrag.y;if(!toggleDrag.moved&&Math.hypot(dx,dy)<7)return;toggleDrag.moved=true;
    overviewControl.style.left=`${Math.max(0,Math.min(toggleDrag.parent.width-overviewControl.offsetWidth,toggleDrag.left+dx))}px`;
    overviewControl.style.top=`${Math.max(0,Math.min(toggleDrag.parent.height-overviewControl.offsetHeight,toggleDrag.top+dy))}px`;overviewControl.style.bottom='auto';event.preventDefault();
  });
  overviewToggle.addEventListener('pointerup',event=>{if(toggleDrag?.id!==event.pointerId)return;if(toggleDrag.moved){suppressToggleClick=true;suppressToggleTimer=setTimeout(()=>suppressToggleClick=false,800)}toggleDrag=null});
  overviewToggle.addEventListener('pointercancel',()=>{toggleDrag=null});
  overviewToggle.addEventListener('click',event=>{if(suppressToggleClick&&event.detail!==0){suppressToggleClick=false;event.preventDefault();event.stopImmediatePropagation()}},true);
  overviewToggle.onclick=()=>{
    const box=$('#overview-box'),buttonTop=overviewToggle.getBoundingClientRect().top;
    box.hidden=!box.hidden;overviewToggle.setAttribute('aria-expanded',String(!box.hidden));
    // A dragged control is positioned by its top edge. Preserve the button's
    // position as the map grows above it or collapses back down into it.
    if(overviewControl.style.top){const shift=buttonTop-overviewToggle.getBoundingClientRect().top;overviewControl.style.top=`${(parseFloat(overviewControl.style.top)||0)+shift}px`}
    clampOverviewPosition();if(!box.hidden){if(!mini)createOverview();else{mini.resize();updateOverview()}}
  };
  $('#overview-range').onchange=()=>{manualZoomOffset=null;manualOverviewCenter=null;updateOverview()};for(const [id,delta] of [['overview-zoom-in',1],['overview-zoom-out',-1]])$(`#${id}`).onclick=()=>{if(mini)mini.easeTo({zoom:Math.max(-2,Math.min(10,mini.getZoom()+delta))})};
  map.on('move',()=>{if(overviewFrame===null)overviewFrame=requestAnimationFrame(()=>{overviewFrame=null;updateOverview()})});
  map.on('moveend',updateOverview);
  const overviewHead=$('.overview-head strong'),overviewBox=$('#overview-box'),overviewMap=$('#overview-map'),resizeHandle=$('#overview-resize');
  let overviewDrag=null,overviewResize=null;
  overviewHead.addEventListener('pointerdown',event=>{if(event.button!==0)return;const r=overviewControl.getBoundingClientRect(),parent=area.getBoundingClientRect();overviewDrag={id:event.pointerId,dx:event.clientX-r.left,dy:event.clientY-r.top,parent};overviewHead.setPointerCapture(event.pointerId);event.preventDefault()});
  overviewHead.addEventListener('pointermove',event=>{if(overviewDrag?.id!==event.pointerId)return;const x=Math.max(0,Math.min(overviewDrag.parent.width-overviewControl.offsetWidth,event.clientX-overviewDrag.parent.left-overviewDrag.dx)),y=Math.max(0,Math.min(overviewDrag.parent.height-overviewControl.offsetHeight,event.clientY-overviewDrag.parent.top-overviewDrag.dy));overviewControl.style.left=`${x}px`;overviewControl.style.top=`${y}px`;overviewControl.style.bottom='auto'});
  const stopOverviewDrag=event=>{if(overviewDrag?.id===event.pointerId)overviewDrag=null};overviewHead.addEventListener('pointerup',stopOverviewDrag);overviewHead.addEventListener('pointercancel',stopOverviewDrag);
  let overviewResizeTimer;
  function resizeOverview(width,height){const buttonTop=overviewToggle.getBoundingClientRect().top;overviewBox.style.width=`${Math.max(190,Math.min(area.clientWidth-12,width))}px`;overviewMap.style.height=`${Math.max(140,Math.min(area.clientHeight-130,height))}px`;if(overviewControl.style.top){const shift=buttonTop-overviewToggle.getBoundingClientRect().top;overviewControl.style.top=`${(parseFloat(overviewControl.style.top)||0)+shift}px`}clampOverviewPosition();clearTimeout(overviewResizeTimer);overviewResizeTimer=setTimeout(()=>{if(mini){mini.resize();if(selectedOverviewFeature)fitOverviewSelection();else updateOverview()}},80)}
  resizeHandle.addEventListener('pointerdown',event=>{if(event.button!==0)return;overviewResize={id:event.pointerId,x:event.clientX,y:event.clientY,width:overviewBox.offsetWidth,height:overviewMap.offsetHeight};resizeHandle.setPointerCapture(event.pointerId);event.preventDefault()});
  resizeHandle.addEventListener('pointermove',event=>{if(overviewResize?.id===event.pointerId)resizeOverview(overviewResize.width+event.clientX-overviewResize.x,overviewResize.height-event.clientY+overviewResize.y)});
  const stopOverviewResize=event=>{if(overviewResize?.id===event.pointerId)overviewResize=null};resizeHandle.addEventListener('pointerup',stopOverviewResize);resizeHandle.addEventListener('pointercancel',stopOverviewResize);
  resizeHandle.addEventListener('keydown',event=>{const delta={ArrowRight:[20,0],ArrowLeft:[-20,0],ArrowDown:[0,-20],ArrowUp:[0,20]}[event.key];if(delta){event.preventDefault();resizeOverview(overviewBox.offsetWidth+delta[0],overviewMap.offsetHeight+delta[1])}});
  window.addEventListener('resize',()=>{if(overviewControl.style.top){overviewControl.style.left=`${Math.max(0,Math.min(area.clientWidth-overviewControl.offsetWidth,parseFloat(overviewControl.style.left)||0))}px`;overviewControl.style.top=`${Math.max(0,Math.min(area.clientHeight-overviewControl.offsetHeight,parseFloat(overviewControl.style.top)||0))}px`}if(mini&&!overviewBox.hidden)resizeOverview(overviewBox.offsetWidth,overviewMap.offsetHeight)});
  // Two independently sized maps show the same center and camera, with one
  // complete viewport per source. Either side can drive the other.
  let compare=null, syncing=false;
  const compareBox=document.createElement('div');compareBox.className='terrain-compare';compareBox.hidden=true;compareBox.innerHTML='<div id="compare-map"></div><div id="compare-labels" class="labels"></div><span id="compare-right-label"></span>';area.append(compareBox);
  const leftBadge=document.createElement('div');leftBadge.className='compare-left-label';leftBadge.hidden=true;area.append(leftBadge);
  const compareLabels=$('#compare-labels'),mainLabels=$('#labels');
  function copyCompareLabels(){if(!compare)return;compareLabels.replaceChildren(...[...mainLabels.children].map(node=>node.cloneNode(true)))}
  new MutationObserver(copyCompareLabels).observe(mainLabels,{childList:true});
  compareLabels.addEventListener('click',event=>{const label=event.target.closest('[data-place-id]');if(label)selectPlace(label.dataset.placeId)});
  const sourceName=name=>name==='aws'?'AWS Terrain Tiles':'Mapterhorn';
  function syncCompare(){if(!compare||syncing)return;for(let i=0;i<Math.min(mainLabels.children.length,compareLabels.children.length);i++)compareLabels.children[i].style.cssText=mainLabels.children[i].style.cssText;syncing=true;try{compare.jumpTo({center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch()});const value=Number($('#exaggeration').value);if(compare.isStyleLoaded()&&compare.getTerrain()&&compare.__exaggeration!==value){compare.__exaggeration=value;compare.setTerrain({source:'dem',exaggeration:value})}}finally{syncing=false}}
  function syncFromCompare(){if(!compare||syncing)return;syncing=true;try{map.jumpTo({center:compare.getCenter(),zoom:compare.getZoom(),bearing:compare.getBearing(),pitch:compare.getPitch()})}finally{syncing=false}}
  function closeCompare(){compare?.remove();compare=null;if(import.meta.env.DEV)window.__peakCompare=null;compareBox.hidden=true;leftBadge.hidden=true;area.classList.remove('comparing');map.resize();}
  function openCompare(){
    compare?.remove();compare=null;compareBox.hidden=false;leftBadge.hidden=false;area.classList.add('comparing');map.resize();
    const current=getTerrainSource(),other=current==='aws'?'mapterhorn':'aws',style=map.getStyle();
    for(const id of ['dem','relief','satellite-shade','explorer-slope','explorer-aspect','explorer-multi']){const source=style.sources[id];if(source?.tiles){source.maxzoom=terrainSourceMaxZoom(other);source.tiles=source.tiles.map(url=>url.replace(/([?&]source=)(aws|mapterhorn)/,`$1${other}`))}}
    if(style.sources['explorer-contours'])style.sources['explorer-contours'].tiles=[contourUrl(other)];
    if($('#terrain-mode').value==='flat')delete style.terrain;else style.terrain={source:'dem',exaggeration:Number($('#exaggeration').value)};
    leftBadge.textContent=`左侧：${sourceName(current)}`;$('#compare-right-label').textContent=`右侧：${sourceName(other)}`;
    compare=new maplibregl.Map({container:'compare-map',attributionControl:false,center:map.getCenter(),zoom:map.getZoom(),bearing:map.getBearing(),pitch:map.getPitch(),minZoom:1,maxZoom:14,maxPitch:$('#terrain-mode').value==='flat'?0:75,style});
    compare.__peakmapRegionIsolated=!!map.__peakmapRegionIsolated;compare.__peakSource=other;compare.__peakTerrainSource=other;
    if(import.meta.env.DEV)window.__peakCompare=compare;copyCompareLabels();
    compare.on('terrain',()=>{configureTerrainMesh(compare);configureCoherentTerrain(compare);limitTerrainSkirts(compare);configureMobileTerrainTextures(compare)});
    compare.on('load',()=>{configureTerrainLod(compare);configureTerrainMesh(compare);configureCoherentTerrain(compare);limitTerrainSkirts(compare);configureMobileTerrainTextures(compare);setupRoadOverlay(compare,{enabled:()=>$('#roads-toggle').checked,exaggeration:()=>Number($('#exaggeration').value),allowed:roadAllowed});syncCompare()});compare.on('move',syncFromCompare);compare.on('error',event=>{if(event.error?.name!=='AbortError'&&!compareBox.dataset.failed){compareBox.dataset.failed='1';notify(`${sourceName(other)} 对比数据加载失败，请检查网络`)}});
  }
  $('#compare-toggle').onchange=e=>{if(e.target.checked){delete compareBox.dataset.failed;openCompare()}else closeCompare()};
  map.on('move',syncCompare);$('#exaggeration').addEventListener('input',syncCompare);
  map.on('peak:terrain-source',()=>{if($('#compare-toggle').checked)openCompare()});
  map.on('peak:terrain-mode',()=>{if($('#compare-toggle').checked)openCompare()});
  map.on('peak:scope-change',()=>{if($('#compare-toggle').checked)openCompare()});
  map.on('peak:lighting',event=>{if(!compare)return;const china=$('#china-only').checked;for(const [id,type] of [['relief','relief'],['satellite-shade','shade']])compare.getSource(id)?.setTiles([tileTemplate(type,china,event.lighting,compare.__peakSource)])});
  for(const id of ['base-map','china-only','roads-toggle','rail-toggle','water-toggle','admin-toggle'])$(`#${id}`).addEventListener('change',()=>{if($('#compare-toggle').checked)setTimeout(openCompare,0)});
  map.addSource('wayback',{type:'raster',tiles:['https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/10/{z}/{y}/{x}'],tileSize:256,maxzoom:19});
  map.addLayer({id:'wayback',type:'raster',source:'wayback',layout:{visibility:'none'},paint:{'raster-fade-duration':150}},'satellite-shade');
  let releases=[];
  $('#history-load').onclick=async()=>{const button=$('#history-load');button.disabled=true;button.textContent='正在加载…';try{const response=await fetch('https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json');if(!response.ok)throw Error('catalog');const data=await response.json();releases=Object.values(data).filter(v=>/^https:\/\/wayback\.maptiles\.arcgis\.com\//.test(v.itemURL||'')&&/\d{4}-\d{2}-\d{2}/.test(v.itemTitle||''));releases.sort((a,b)=>b.itemTitle.localeCompare(a.itemTitle));const select=$('#history-release');select.innerHTML='<option value="">当前影像</option>'+releases.map((v,i)=>`<option value="${i}">${v.itemTitle.match(/\d{4}-\d{2}-\d{2}/)[0]}</option>`).join('');button.textContent=`已加载 ${releases.length} 个版本`;if(!releases.length)throw Error('empty')}catch{button.textContent='重新加载历史影像目录';notify('历史影像目录加载失败，请检查网络')}finally{button.disabled=false}};
  function history(){const value=$('#history-release').value,entry=value===''?null:releases[Number(value)];if(entry){const url=entry.itemURL.replace('{level}','{z}').replace('{row}','{y}').replace('{col}','{x}');map.getSource('wayback').setTiles([url]);if($('#base-map').value!=='satellite')setValue('base-map','satellite');}map.setLayoutProperty('wayback','visibility',entry&&$('#base-map').value==='satellite'?'visible':'none');}
  $('#history-release').onchange=history;$('#base-map').addEventListener('change',history);
  const contours=Object.fromEntries([['mapterhorn','https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],['aws','https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png']].map(([name,url])=>{
    const source=new mlcontour.DemSource({id:`contour-${name}`,url,encoding:'terrarium',maxzoom:12,worker:name!=='aws',cacheSize:35,timeoutMs:10000});
    if(name==='aws')source.manager.getTile=async(url,controller)=>{
      const match=url.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);if(!match)throw new Error('Invalid contour elevation tile');
      const [,z,x,y]=match,{data}=await processTerrainTile({url:`dem-world://tiles.mapterhorn.com/${z}/${x}/${y}.webp?source=aws`},controller,false,false);
      return {data:new Blob([data],{type:'image/png'})};
    };
    source.setupMaplibre(maplibregl);return [name,source];
  }));
  const contourUrl=name=>contours[name].contourProtocolUrl({thresholds:{5:[500,1000],7:[200,1000],9:[100,500],11:[50,200],12:[20,100]},contourLayer:'contours',elevationKey:'ele',levelKey:'level'});
  map.addSource('explorer-contours',{type:'vector',tiles:[contourUrl(getTerrainSource())],maxzoom:12});
  map.addLayer({id:'explorer-contour-lines',type:'line',source:'explorer-contours','source-layer':'contours',minzoom:5,layout:{visibility:'none'},paint:{'line-color':'#fff5c7','line-opacity':0.65,'line-width':['match',['get','level'],1,1.3,0.55]}},'outside-china-mask');
  map.addLayer({id:'explorer-contour-labels',type:'symbol',source:'explorer-contours','source-layer':'contours',minzoom:8,filter:['>', ['get','level'],0],layout:{visibility:'none','symbol-placement':'line','text-field':['concat',['to-string',['get','ele']],' m'],'text-font':['sans-serif'],'text-size':10,'symbol-spacing':350},paint:{'text-color':'#fff6d2','text-halo-color':'#263b2d','text-halo-width':1}},'outside-china-mask');
  $('#contours-toggle').onchange=e=>{for(const id of ['explorer-contour-lines','explorer-contour-labels'])map.setLayoutProperty(id,'visibility',e.target.checked?'visible':'none')};
  for(const mode of ['slope','aspect','multi']){map.addSource(`explorer-${mode}`,{type:'raster',tiles:[tileTemplate(mode,$('#china-only').checked)],tileSize:512,maxzoom:terrainSourceMaxZoom(getTerrainSource())});map.addLayer({id:`explorer-${mode}`,type:'raster',source:`explorer-${mode}`,layout:{visibility:'none'},paint:{'raster-opacity':0.7,'raster-fade-duration':0}},'outside-china-mask')}
  function analysis(){const mode=$('#analysis-mode').value;for(const name of ['slope','aspect']){map.setLayoutProperty(`explorer-${name}`,'visibility',name===mode?'visible':'none');map.setPaintProperty(`explorer-${name}`,'raster-opacity',Number($('#analysis-opacity').value)/100)}$('#analysis-opacity-value').textContent=`${$('#analysis-opacity').value}%`;$('#analysis-legend').textContent=mode==='slope'?'绿：平缓　黄：起伏　红：陡峭。基于原始高程估算。':mode==='aspect'?'颜色表示坡向：红北、黄东、绿南、蓝西；平地透明。基于原始高程估算。':'坡度和坡向按原始高程估算，与视觉倍率无关；详细高程及等高线需要联网。'}
  $('#multi-toggle').onchange=e=>map.setLayoutProperty('explorer-multi','visibility',e.target.checked?'visible':'none');
  $('#analysis-mode').onchange=analysis;$('#analysis-opacity').oninput=analysis;$('#china-only').addEventListener('change',()=>{for(const mode of ['slope','aspect','multi'])map.getSource(`explorer-${mode}`).setTiles([tileTemplate(mode,$('#china-only').checked)])});
  map.on('peak:terrain-source',()=>{map.getSource('explorer-contours').setTiles([contourUrl(getTerrainSource())]);for(const mode of ['slope','aspect','multi']){const source=map.getSource(`explorer-${mode}`);setTerrainSourceMaxZoom(source,getTerrainSource());source.setTiles([tileTemplate(mode,$('#china-only').checked)])}});
  function blend(){const value=Number($('#terrain-blend').value)/100;$('#terrain-blend-value').value=`${Math.round(value*100)}%`;if($('#base-map').value==='satellite'){map.setLayoutProperty('relief','visibility',value?'visible':'none');map.moveLayer('relief','satellite-shade');map.setPaintProperty('relief','raster-opacity',value)}else map.setPaintProperty('relief','raster-opacity',1)}
  $('#terrain-blend').oninput=blend;$('#base-map').addEventListener('change',()=>setTimeout(blend,0));$('#terrain-detail').addEventListener('change',()=>setTimeout(blend,0));
  $('#relief-palette').onchange=e=>{const config={natural:[0,0,0],sand:[-20,-.25,.07],ink:[0,-1,.12],high:[10,-.45,.17]}[e.target.value];map.setPaintProperty('relief','raster-hue-rotate',config[0]);map.setPaintProperty('relief','raster-saturation',config[1]);map.setPaintProperty('relief','raster-brightness-min',config[2]);};
  $('#clear-relief-light').onclick=()=>{const date=$('#sun-time').value.slice(0,10);setValue('sun-time',`${date}T10:00`,'input');setValue('light-strength',85,'input');notify('已切换到上午 10:00 的光照；时间可在上方继续调整')};
  map.addSource('explorer-profile',{type:'geojson',data:empty});map.addLayer({id:'explorer-profile-line',type:'line',source:'explorer-profile',paint:{'line-color':'#e0a42f','line-width':3}},'outside-china-mask');
  let profileMarker=null;
  let tool=null,first=null,revision=0;
  const card=document.createElement('section');card.className='explorer-result';card.hidden=true;area.append(card);
  function stopTool(){map._explorerToolActive=false;tool=null;first=null;revision++;map.getCanvas().style.cursor='';$('#point-pick').classList.remove('active');$('#profile-pick').classList.remove('active')}
  function setTool(name){stopTool();tool=name;map._explorerToolActive=true;map.getCanvas().style.cursor='crosshair';$(`#${name==='point'?'point-pick':'profile-pick'}`).classList.add('active');openDrawer(false);notify(name==='point'?'请点击地图查询高程':'请依次点击剖面的起点和终点')}
  $('#point-pick').onclick=()=>setTool('point');$('#profile-pick').onclick=()=>setTool('profile');
  map.on('click',async event=>{if(!tool)return;event.originalEvent?.stopImmediatePropagation();const position=[event.lngLat.lng,event.lngLat.lat];if(tool==='profile'&&!first){first=position;notify('已选择起点，请点击终点');return}const mode=tool,start=first,token=++revision;card.hidden=false;if(mode==='profile')map.getSource('explorer-profile').setData({type:'Feature',geometry:{type:'LineString',coordinates:[start,position]},properties:{}});card.innerHTML='<button class="result-close" aria-label="关闭">×</button><strong>正在读取高程…</strong>';card.querySelector('button').onclick=()=>{card.hidden=true;stopTool()};
    const sampleMeters=Math.max(150,Math.min(5000,3*40075016.686*Math.cos(position[1]*Math.PI/180)/(512*2**Math.min(12,Math.floor(map.getZoom())))));const latStep=sampleMeters/111320,lonStep=sampleMeters/(111320*Math.max(.1,Math.cos(position[1]*Math.PI/180)));
    const coords=mode==='point'?[position,[position[0]-lonStep,position[1]],[position[0]+lonStep,position[1]],[position[0],position[1]-latStep],[position[0],position[1]+latStep]]:Array.from({length:80},(_,i)=>[start[0]+(position[0]-start[0])*i/79,start[1]+(position[1]-start[1])*i/79]);const sampledSource=getTerrainSource(),values=await sampleElevations(coords,{zoom:map.getZoom(),chinaOnly:$('#china-only').checked,source:sampledSource});if(token!==revision)return;
    if(mode==='point'){const v=values[0];let slopeInfo='';if(values.slice(1).every(Number.isFinite)){const dx=(values[2]-values[1])/(2*sampleMeters),dy=(values[4]-values[3])/(2*sampleMeters),metrics=terrainMetrics(dx,dy),degrees=metrics.slope;const direction=['北','东北','东','东南','南','西南','西','西北'][Math.round((metrics.aspect||0)/45)%8];slopeInfo=`<p>坡度约 ${Math.round(degrees)}°${degrees<2?' · 地势平缓':` · 朝${direction}`}</p>`}card.innerHTML=`<button class="result-close" aria-label="关闭">×</button><strong>当前位置</strong><p>经度 ${position[0].toFixed(5)}° · 纬度 ${position[1].toFixed(5)}°</p><p>${v==null?'当前位置高程暂不可用':`高程模型估算：约 <b>${Math.round(v)} 米</b>`}</p>${slopeInfo}<small>来源：${sampledSource==='aws'?'AWS Terrain Tiles':'Mapterhorn'}；未使用视觉高度倍率。</small>`}
    else{const valid=values.filter(Number.isFinite),dist=distanceKm(start,position);if(!valid.length)card.innerHTML='<button class="result-close" aria-label="关闭">×</button><strong>高程数据不可用</strong><p>请检查网络后重试。</p>';else{const min=Math.min(...valid),max=Math.max(...valid),range=Math.max(1,max-min);let path='',drawing=false;values.forEach((v,i)=>{if(v==null){drawing=false;return}path+=`${drawing?'L':'M'}${(i/79*360).toFixed(1)} ${(95-(v-min)/range*75).toFixed(1)} `;drawing=true});card.innerHTML=`<button class="result-close" aria-label="关闭">×</button><strong>地形剖面 · ${dist.toFixed(1)} km</strong><svg viewBox="0 0 360 105" role="img" aria-label="地形高度剖面"><path d="${path}" fill="none" stroke="#d8bb76" stroke-width="2"/></svg><p>最低约 ${Math.round(min)} 米 · 最高约 ${Math.round(max)} 米</p><small>沿两点直线取样；空缺表示数据不可用。</small>`;}}
    card.querySelector('.result-close').onclick=()=>{card.hidden=true;stopTool();profileMarker?.remove();profileMarker=null;map.getSource('explorer-profile').setData(empty)};
    const svg=card.querySelector('svg');if(svg){svg.addEventListener('pointermove',e=>{const box=svg.getBoundingClientRect(),index=Math.max(0,Math.min(79,Math.round((e.clientX-box.left)/box.width*79)));if(values[index]==null)return;if(!profileMarker)profileMarker=new maplibregl.Marker({color:'#e0a42f'}).setLngLat(coords[index]).addTo(map);else profileMarker.setLngLat(coords[index]);svg.setAttribute('aria-label',`位置 ${Math.round(index/79*100)}%，高程约 ${Math.round(values[index])} 米`)})}
    stopTool();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){stopTool();openDrawer(false)}});
  $('#featured-views').innerHTML=points.map((p,i)=>`<button class="view-choice" data-featured="${i}"><strong>${p.name}</strong><small>${p.description}</small></button>`).join('');
  $('#featured-views').onclick=e=>{const button=e.target.closest('[data-featured]');if(!button)return;const p=points[Number(button.dataset.featured)];map.flyTo({...p,duration:1600,essential:true});openDrawer(false)};
  function drawBookmarks(){const list=getBookmarks();$('#bookmark-list').innerHTML=list.length?list.map((item,i)=>`<div class="bookmark-row"><button data-bookmark="${i}">${item.thumbnail?`<img src="${escapeText(item.thumbnail)}" alt="">`:""}<span>${escapeText(item.name)}</span></button><button data-delete-bookmark="${i}" aria-label="删除 ${escapeText(item.name)}">×</button></div>`).join(''):'<p>还没有收藏的视角。</p>'}
  $('#bookmark-save').onclick=()=>{const name=prompt('给当前视角起个名字','我的山河');if(!name?.trim())return;const list=getBookmarks();list.push({name:name.trim().slice(0,50),state:stateFor(map),thumbnail:captureThumbnail(map)});if(saveBookmarks(list)){drawBookmarks();notify('已收藏当前视角')}else notify('无法保存收藏，请检查浏览器存储设置')};
  $('#bookmark-list').onclick=e=>{const open=e.target.closest('[data-bookmark]'),del=e.target.closest('[data-delete-bookmark]'),list=getBookmarks();if(open){restore(map,list[Number(open.dataset.bookmark)]?.state);openDrawer(false)}if(del){list.splice(Number(del.dataset.deleteBookmark),1);saveBookmarks(list);drawBookmarks()}};drawBookmarks();
  $('#share-view').onclick=async()=>{const url=shareUrl(map);try{await navigator.clipboard.writeText(url);notify('分享链接已复制')}catch{prompt('复制分享链接',url)}};
  if(initialView)restore(map,initialView);
}
