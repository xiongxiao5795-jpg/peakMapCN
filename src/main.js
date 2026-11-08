import { configureTerrainLod, configureMobileTerrainTextures, limitTerrainSkirts } from './terrain-lod.js';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
maplibregl.setWorkerUrl(workerUrl);
import 'maplibre-gl/dist/maplibre-gl.css';
import { createIcons, Search, Mountain, Layers2, Compass, Plus, Minus, RotateCcw, LocateFixed, ChevronDown, ArrowUpRight, X, Info, Menu, MapPin, MousePointer2 } from 'lucide';
import { places as curatedPlaces, categories as curatedCategories } from '../data/places.js';
import geoNames from '../data/geonames-mountains.json';
import adminIndex from '../data/admin-index.json';
import cityCenters from '../data/admin-city-centers.json';
import { buildAdministrativeEntries, searchAdministrative, geometryBounds } from './admin.js';
import { createAdministrativeLayers } from './admin-layers.js';
import { celestialLightAt, celestialPositionsAt, skyPosition, beijingTimeNow } from './sun.js';
import { adminAreas, registerTerrainProtocols, tileTemplate, imageryTemplate, setTerrainRegion } from './terrain.js';
import { outsideRegionGeometry } from './tile-coverage.js';
import { configureScopedTileFilter } from './scoped-tile-filter.js';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { addReferenceLayers, setReferenceVisibility } from './reference-layers.js';
import { createImageryHealth } from './imagery-health.js';
import { parseCoordinates, createProvinceLookup, selectLocationRegion } from './location.js';
import { loadLocalAdministrativeBoundaries, loadLocalDistrictBoundaries } from './admin-boundaries.js';
import { bindLocationControl } from './location-control.js';
import { disableLongPress } from './disable-long-press.js';
import { createHeightWheel } from './height-wheel.js';
import './style.css';

const categories = {...curatedCategories, peak:'山峰 / 山体', province:'省级行政区',admin_city:'地市级行政区',district:'区县级行政区'};
const administrativeEntries=buildAdministrativeEntries(adminIndex,cityCenters);
// Use one administrative record for curated city labels so selecting one highlights its boundary.
const cityRecords=new Map(administrativeEntries.filter(p=>p.category==='admin_city').map(p=>[p.name,p]));
const mapCuratedPlaces=curatedPlaces.filter(p=>{
  if(p.id==='beijing')return false; // Beijing is shown as a province-level municipality.
  const city=p.category==='city'&&cityRecords.get(`${p.name}市`);
  if(!city)return true;
  city.zoom=Math.min(city.zoom,p.zoom);city.importance=Math.max(city.importance,p.importance);
  return false;
});
const baseName = name => name.replace(/(?:山脉|山脈|山系)$/,'');
const geoPlaces=geoNames.filter(p=>!curatedPlaces.some(c=>baseName(c.name)===baseName(p.name)&&Math.abs(c.coordinates[0]-p.coordinates[0])<0.5&&Math.abs(c.coordinates[1]-p.coordinates[1])<0.5)).map(p=>({...p,description:`GeoNames 地名数据（${({MT:'山体',PK:'山峰',MTS:'山脉或山群',RDGE:'山脊'})[p.geonames_type]}），位置及海拔需要进一步核验。`}));
const places = [...mapCuratedPlaces, ...geoPlaces, ...adminAreas.features.filter(f=>Array.isArray(f.properties.centroid || f.properties.center)).map(f=>({id:`province-${f.properties.adcode}`,name:f.properties.name,category:'province',coordinates:f.properties.centroid || f.properties.center,zoom:3.3,importance:58,description:`${f.properties.name}（示例行政区数据）`})), ...administrativeEntries];
const labelsByImportance=[...places].sort((a,b)=>b.importance-a.importance);
// Give the administrative level appropriate to the current view first choice of space.
const labelOrders=[
  {province:140,admin_city:70,district:55},
  {province:75,admin_city:140,district:55},
  {province:60,admin_city:85,district:140}
].map(priorities=>[...labelsByImportance].sort((a,b)=>(priorities[b.category]??b.importance)-(priorities[a.category]??a.importance)));
const labelsForZoom=zoom=>labelOrders[zoom<5.3?0:zoom<8.5?1:2];
const icons = { Search, Mountain, Layers2, Compass, Plus, Minus, RotateCcw, LocateFixed, ChevronDown, ArrowUpRight, X, Info, Menu, MapPin, MousePointer2 };
document.querySelector('#app').innerHTML = `
<header class="topbar"><a class="brand" href="#" aria-label="山河志首页"><span class="brand-mark"><i data-lucide="mountain"></i></span><span><b>山河志</b><small>SHAN HE ZHI</small></span></a><span class="top-divider"></span><span class="top-title">中国自然地理图鉴 <em> / </em> 地形探索</span><div class="top-right"><button id="reset-panels" class="reset-panels" title="收起并整理控件">整理控件</button><label class="layout-select"><span>布局</span><select id="layout-mode" aria-label="屏幕布局"><option value="auto">自动</option><option value="landscape">横屏</option><option value="portrait">竖屏</option></select></label></div></header>
<main class="workspace">
<section class="map-area" aria-label="中国三维地形地图"><div id="map"></div><div id="labels" class="labels"></div><div class="map-top"><div class="map-heading"><div><span class="overline">TERRAIN EXPLORER <b> / </b> CHINA</span><h2>山河之间 <span>·</span> 自然有迹</h2><p>移动、缩放地图，发现中国的地形之美</p></div></div><div class="map-actions"><button class="layer-trigger" id="sun-toggle" aria-expanded="false" aria-controls="sun-panel"><span class="sun-icon">☼</span><span id="light-summary">光照 · 计算中</span><i data-lucide="chevron-down"></i></button><button class="layer-trigger" id="layer-toggle" aria-label="图层设置"><i data-lucide="layers-2"></i><span>图层</span><i data-lucide="chevron-down"></i></button></div></div>
<div class="layer-panel" id="layer-panel" hidden><div class="panel-title"><div><small>MAP SETTINGS</small><h3>地图设置</h3></div><button class="small-close" id="layer-close" aria-label="关闭设置"><i data-lucide="x"></i></button></div><label class="switch-row featured-switch"><span>仅显示中国范围</span><input id="china-only" type="checkbox" checked><span class="switch"></span></label><label class="switch-row featured-switch"><span>省、市、区县边界</span><input id="admin-toggle" type="checkbox" checked><span class="switch"></span></label><label class="switch-row featured-switch"><span>仅显示选中行政区</span><input id="isolate-toggle" type="checkbox"><span class="switch"></span></label><p class="isolation-hint">开启后选择省、市或区县</p><div class="location-setting"><span>当前位置</span><button id="locate-district" type="button">定位到区县</button></div><div class="panel-separator"></div><div class="panel-label">参考图层</div><label class="switch-row"><span>道路</span><input id="roads-toggle" type="checkbox"><span class="switch"></span></label><label class="switch-row"><span>铁路</span><input id="rail-toggle" type="checkbox"><span class="switch"></span></label><label class="switch-row"><span>江河湖泊</span><input id="water-toggle" type="checkbox" checked><span class="switch"></span></label><div class="panel-separator"></div><div class="panel-label">显示地理名称</div><div id="layer-options"></div></div><div class="sun-panel" id="sun-panel" hidden><div class="panel-title"><div><small>SUN & MOON</small><h3>日照与天空</h3></div><button class="small-close" id="sun-close" aria-label="关闭光照设置"><i data-lucide="x"></i></button></div><div class="sky-display" id="sky-display" aria-label="天空方位示意"><div class="sky-caption"><span>天空全景示意</span><span id="sky-status">正在计算日月位置</span></div><div class="sky-dome" id="sky-dome"><div class="sky-center"></div><div class="sky-horizon"></div><div class="sky-body sky-sun" id="sky-sun" hidden><span class="sky-orb">☀</span><small>太阳</small></div><div class="sky-body sky-moon" id="sky-moon" hidden><span class="sky-orb">☾</span><small>月亮</small></div></div><div class="sky-axis"><span>后方</span><span>地图朝向</span><span>后方</span></div><div class="sky-time-heading"><span>北京时间 <strong id="sky-time-value">--:--</strong></span><button id="sky-now" type="button">回到当前</button></div><input type="range" id="sky-time-range" min="0" max="1439" step="1" value="720" aria-label="调整当天时间"><div class="sky-time-scale"><span>00:00</span><span>12:00</span><span>23:59</span></div></div><label class="sun-label" for="sun-time">日期与时间 <span>北京时间 UTC+8</span></label><input type="datetime-local" id="sun-time" step="60"><div class="clock-row"><span id="clock-status">默认中午 12:00</span></div><div class="sun-result" id="sun-result"></div><label class="light-strength" for="light-strength"><span>光影强度</span><strong id="light-strength-value">100%</strong></label><input id="light-strength" type="range" min="0" max="100" value="100" aria-label="光影强度"><p>以各地经纬度计算日夜和坡面照明；暂不模拟山体投影。</p></div>
<div class="navigation-controls"><div class="map-controls"><button id="north" title="重置方向" aria-label="重置方向"><i data-lucide="compass"></i></button><div class="control-separator"></div><button id="zoom-in" title="放大" aria-label="放大"><i data-lucide="plus"></i></button><button id="zoom-out" title="缩小" aria-label="缩小"><i data-lucide="minus"></i></button><div class="control-separator"></div><button id="reset" title="返回全国视角" aria-label="返回全国视角"><i data-lucide="rotate-ccw"></i></button></div><button id="locate" class="locate-button" type="button" aria-label="定位当前位置：单击省，双击市；区县定位在图层设置中" title="单击定位省份，双击定位城市；区县定位在图层设置中"><i data-lucide="locate-fixed"></i></button></div>
<div class="relief-control"><button id="relief-toggle" class="relief-toggle" aria-expanded="false" aria-controls="relief-body"><span>地图 <strong id="relief-summary">卫星 · 立体 40×</strong><small class="height-wheel-hint">上滑选择立体倍率</small></span><i data-lucide="chevron-down"></i></button><div id="relief-body" hidden><div class="mode-heading">地图模式</div><label class="mode-setting" for="base-map"><span>底图</span><select id="base-map"><option value="satellite" selected>卫星影像（联网）</option><option value="terrain">地形设色</option></select></label><label class="mode-setting" for="visual-style"><span>视觉预设</span><select id="visual-style"><option value="auto">自然（自动）</option><option value="sandtable">沙盘</option><option value="scenic">山间远景</option><option value="custom">自定义</option></select></label><label class="mode-setting" for="terrain-mode"><span>地形</span><select id="terrain-mode"><option value="3d">立体</option><option value="flat">平面</option></select></label><div class="relief-head"><span><b>地形高度倍率</b><small>VERTICAL EXAGGERATION</small></span><strong id="exaggeration-value">40×</strong></div><input id="exaggeration" type="range" min="1" max="80" step="1" value="40" aria-label="地形高度倍率"><div class="relief-scale"><span>真实 1×</span><span>强烈 80×</span></div><div class="relief-presets"><button data-exaggeration="1">真实</button><button data-exaggeration="20">适中</button><button class="active" data-exaggeration="40">突出</button><button data-exaggeration="80">强烈</button></div><p id="height-mode-hint">仅放大视觉落差，标注海拔不变</p><label class="detail-setting" for="terrain-softness"><span>山体柔和度</span><strong id="terrain-softness-value">0%</strong></label><input id="terrain-softness" type="range" min="0" max="100" step="5" value="0" aria-label="山体柔和度"><p>仅柔化显示地形，不改变标注海拔</p><label class="detail-setting" for="fog-strength"><span>远景薄雾</span><strong id="fog-strength-value">35%</strong></label><input id="fog-strength" type="range" min="0" max="100" step="5" value="35" aria-label="远景薄雾"><p>低角度下柔化远山，0% 关闭薄雾</p><label class="detail-setting" for="terrain-detail"><span>鸟瞰地形细节</span><select id="terrain-detail" aria-label="鸟瞰地形细节"><option value="512">标准</option><option value="256" selected>增强</option><option value="128">精细</option></select></label><p id="terrain-detail-info">增强：加载更多高程数据</p></div></div><div class="map-bottom"><div class="map-meta"><span class="meta-icon">✳</span><div><small>YOUR PERSPECTIVE</small><b id="coordinates">中国 · 全国视角</b></div></div><div class="legend"><span>海拔</span><div class="gradient"></div><div class="legend-values"><span>低</span><span>高</span></div></div></div><div class="gesture-tip"><i data-lucide="mouse-pointer-2"></i><span>拖动探索 <b>·</b> 双指上下倾斜 <b>·</b> 双指捏合缩放</span><button id="tip-close" aria-label="关闭提示"><i data-lucide="x"></i></button></div><div class="map-attribution">地形数据 © <a href="https://mapterhorn.com/attribution" target="_blank" rel="noreferrer">Mapterhorn</a> · 地名 © <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames · CC BY 4.0</a> · 区县边界 © <a href="https://datav.aliyun.com/portal/school/atlas/area_selector" target="_blank" rel="noreferrer">DataV</a> · 行政区 © <a href="https://github.com/Supeset/China-GeoData" target="_blank" rel="noreferrer">China-GeoData</a> · <span id="reference-attribution">瓦片 © <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · © <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · 数据 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap 贡献者</a></span><span id="imagery-attribution"> · 影像 © Esri, Maxar, Earthstar Geographics, GIS User Community</span> · 非标准地图</div><div id="map-status" class="map-status">正在加载地形数据…</div><button id="search-toggle" class="search-toggle" type="button" aria-label="搜索地理名称" aria-expanded="false" aria-controls="search-panel"><i data-lucide="search"></i></button><div id="search-panel" class="search-popover" role="search" hidden><div class="search-wrap"><i data-lucide="search"></i><input id="search" autocomplete="off" enterkeyhint="search" placeholder="地名或经度,纬度" aria-label="搜索地理名称"><button id="search-close" type="button" aria-label="关闭搜索"><i data-lucide="x"></i></button><div id="search-results" class="search-results" hidden></div></div></div>
<div class="detail-card" id="detail" hidden></div></section></main>`;
createIcons({icons});
disableLongPress(document);

// The same Terrarium source drives both the terrain mesh and its color relief.
let onSatelliteUnavailable=()=>{};
const imageryHealth=createImageryHealth(()=>onSatelliteUnavailable());
let imageryRetryTimer;
registerTerrainProtocols(maplibregl,{onImagerySuccess:()=>imageryHealth.success(),onImageryFailure:()=>{
  imageryHealth.failure();
  if(!imageryRetryTimer)imageryRetryTimer=setTimeout(()=>{imageryRetryTimer=null;if($('#base-map').value==='satellite')map.getSource('satellite')?.setTiles([imageryTemplate($('#china-only').checked)])},20000);
}});
const initialTime=`${beijingTimeNow().slice(0,10)}T12:00`;
const initialLighting=`time=${encodeURIComponent(initialTime)}&strength=100&smooth=0`;
const DEFAULT_PITCH=60;
const map = new maplibregl.Map({container:'map', style:{version:8,sources:{dem:{type:'raster-dem',tiles:[tileTemplate('dem',true,'smooth=0')],encoding:'terrarium',tileSize:256,maxzoom:12,attribution:'<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'},relief:{type:'raster',tiles:[tileTemplate('relief',true,initialLighting)],tileSize:256,maxzoom:12},admin:{type:'geojson',data:adminAreas},'admin-cities':{type:'geojson',data:{type:'FeatureCollection',features:[]}},'admin-districts':{type:'geojson',data:{type:'FeatureCollection',features:[]}},selection:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers:[{id:'background',type:'background',paint:{'background-color':'#071015'}},{id:'relief',type:'raster',source:'relief',layout:{visibility:'none'},paint:{'raster-fade-duration':150}},{id:'admin-hit',type:'fill',source:'admin',paint:{'fill-color':'#ffffff','fill-opacity':0.001}},{id:'admin-line',type:'line',source:'admin',paint:{'line-color':'#f4eedc','line-width':1.8,'line-opacity':0.86}},{id:'city-hit',type:'fill',source:'admin-cities',minzoom:6,paint:{'fill-color':'#ffffff','fill-opacity':0.001}},{id:'city-line',type:'line',source:'admin-cities',minzoom:6,paint:{'line-color':'#e9cf8e','line-width':1.1,'line-opacity':0.76}},{id:'district-hit',type:'fill',source:'admin-districts',minzoom:8.5,paint:{'fill-color':'#ffffff','fill-opacity':0.001}},{id:'district-line',type:'line',source:'admin-districts',minzoom:8.5,paint:{'line-color':'#a8c1c3','line-width':0.75,'line-opacity':0.75}},{id:'selected-area',type:'fill',source:'selection',paint:{'fill-color':'#f0bd50','fill-opacity':0.28}},{id:'selected-halo',type:'line',source:'selection',paint:{'line-color':'#0a1714','line-width':5,'line-opacity':0.85}},{id:'selected-outline',type:'line',source:'selection',paint:{'line-color':'#ffffff','line-width':3,'line-opacity':1,'line-dasharray':[3,2]}}],terrain:{source:'dem',exaggeration:40}},center:[103.5,35.1],zoom:3.3,pitch:DEFAULT_PITCH,bearing:0,maxPitch:75,minZoom:1,maxZoom:13,attributionControl:false,canvasContextAttributes:{antialias:true},terrainSkirtLength:'auto',centerClampedToGround:false});
const nationalBounds=adminAreas.features.reduce((bounds,feature)=>{const [w,s,e,n]=geometryBounds(feature);return [Math.min(bounds[0],w),Math.min(bounds[1],s),Math.max(bounds[2],e),Math.max(bounds[3],n)]},[180,90,-180,-90]);
const $=s=>document.querySelector(s); const enabled=new Set(Object.keys(categories)); const placesById=new Map(places.map(p=>[p.id,p])); const provinceById=new Map(adminAreas.features.map(f=>[`province-${f.properties.adcode}`,f])); let selected=null,selectedRegion=null,isolatedFeature=null; let lastFailure=0;let selectionRevision=0;let administrativeLayers;
if(import.meta.env.DEV)window.__peakMap=map;
let statusTimer;
function showMapStatus(message){const status=$('#map-status');status.textContent=message;status.hidden=false;clearTimeout(statusTimer);statusTimer=setTimeout(()=>status.hidden=true,8000)}
function selectBaseMap(mode){
  const satellite=mode==='satellite';$('#base-map').value=mode;imageryHealth.reset();
  if(!satellite){clearTimeout(imageryRetryTimer);imageryRetryTimer=null}
  for(const id of ['satellite','satellite-shade'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',satellite?'visible':'none');
  if(map.getLayer('relief'))map.setLayoutProperty('relief','visibility',satellite?'none':'visible');
  $('#imagery-attribution').hidden=!satellite;updateReliefSummary();
}
onSatelliteUnavailable=()=>{if($('#base-map').value==='satellite')showMapStatus('部分卫星影像加载较慢，请稍候或检查网络')};
window.addEventListener('online',()=>{const china=$('#china-only').checked;map.getSource('dem')?.setTiles([tileTemplate('dem',china,`smooth=${$('#terrain-softness').value}`)]);map.getSource('relief')?.setTiles([tileTemplate('relief',china,currentLighting)]);map.getSource('satellite-shade')?.setTiles([tileTemplate('shade',china,currentLighting)]);if($('#base-map').value==='satellite'){map.getSource('satellite')?.setTiles([imageryTemplate(china)]);showMapStatus('网络已恢复，正在重新加载卫星影像')}});
map.on('terrain',()=>{limitTerrainSkirts(map);configureMobileTerrainTextures(map)});
map.on('load',()=>{configureTerrainLod(map);limitTerrainSkirts(map);configureMobileTerrainTextures(map);addReferenceLayers(map,$('#china-only').checked,initialLighting);map.addSource('outside-region',{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id:'outside-region-mask',type:'fill',source:'outside-region',layout:{visibility:'none'},paint:{'fill-color':'#071015','fill-opacity':1}},'selected-area');configureTerrainLod(map);for(const group of ['roads','rail','water'])setReferenceVisibility(map,group,$(`#${group}-toggle`).checked);$('#map-status').hidden=true;updateSun();renderLabels();administrativeLayers.schedule();});
map.on('error',e=>{if(e.error?.name==='AbortError'||e.error?.name==='ImageryUnavailableError'||e.sourceId==='satellite')return;if(Date.now()-lastFailure>10000){lastFailure=Date.now();showMapStatus('部分地图数据加载失败，请检查网络连接')}});
const labelLayer=$('#labels');
function renderLabels(){ if(!map.getLayer('relief'))return; const zoom=map.getZoom(), bounds=map.getBounds(), boxes=[]; labelLayer.innerHTML='';labelLayer.classList.toggle('has-selection',!!selected);const chosen=selected&&placesById.get(selected),visibleOrder=labelsForZoom(zoom);const ordered=chosen?[chosen,...visibleOrder.filter(p=>p.id!==selected)]:visibleOrder;for(const p of ordered){if(!p.coordinates||!enabled.has(p.category)||(zoom<p.zoom&&p.id!==selected)||!bounds.contains(p.coordinates))continue;if(isolatedFeature&&p.id!==selected&&!booleanPointInPolygon(p.coordinates,isolatedFeature))continue;const pos=map.project(p.coordinates);if(pos.x<45||pos.y<75||pos.x>map.getContainer().clientWidth-45||pos.y>map.getContainer().clientHeight-75)continue;const node=document.createElement('button');node.className=`map-label ${p.category} ${p.id===selected?'selected':''}`;node.dataset.placeId=p.id;node._coordinates=p.coordinates;node.innerHTML=`${p.category==='peak'?'<span class="label-peak">▲</span>':''}<span>${p.name}</span>${p.category==='peak'&&zoom>5&&p.elevation!=null?`<small>${p.elevation} m</small>`:''}`; node.style.left=`${pos.x}px`;node.style.top=`${pos.y}px`;node.setAttribute('aria-label',`${p.name}，${categories[p.category]}`);node.setAttribute('aria-pressed',String(p.id===selected));labelLayer.appendChild(node);let rect;const offsets=p.category==='admin_city'||p.category==='district'?[0,-25,25,-50,50]:[0];for(const offset of offsets){node._labelOffsetY=offset;node.style.top=`${pos.y+offset}px`;rect=node.getBoundingClientRect();if(pos.y+offset<75||pos.y+offset>map.getContainer().clientHeight-75){rect=null;continue;}if(!boxes.some(b=>rect.left<b.right+8&&rect.right>b.left-8&&rect.top<b.bottom+5&&rect.bottom>b.top-5))break;rect=null;}if(!rect){node.remove();continue;}boxes.push(rect);node.addEventListener('click',()=>showPlace(p,false));}}
let scheduled=false;function scheduleLabels(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{renderLabels();scheduled=false;});}}
// Reposition existing labels during gestures; rebuild only after movement ends.
function updateLabelPositions(){for(const node of labelLayer.children){const pos=map.project(node._coordinates);node.style.left=`${pos.x}px`;node.style.top=`${pos.y+(node._labelOffsetY||0)}px`;}}
map.on('move',()=>{updateLabelPositions();renderSky();const c=map.getCenter();$('#coordinates').textContent=`${Math.abs(c.lat).toFixed(1)}° ${c.lat>=0?'N':'S'}  /  ${Math.abs(c.lng).toFixed(1)}° ${c.lng>=0?'E':'W'}`;}); map.on('idle',scheduleLabels);map.on('resize',()=>{scheduleLabels();renderSky()});map.on('moveend',()=>{scheduleLabels();updateSun();administrativeLayers?.schedule()});
administrativeLayers=createAdministrativeLayers(map,adminAreas,administrativeEntries,scheduleLabels);
function syncIsolation(){
  const next=$('#isolate-toggle').checked?selectedRegion:null;
  $('.isolation-hint').textContent=next?`当前仅显示：${next.properties.name}`:$('#isolate-toggle').checked?'请选择省、市或区县':'开启后选择省、市或区县';
  if(next===isolatedFeature)return;
  isolatedFeature=next;setTerrainRegion(next);
  const outside=next?{type:'Feature',properties:{},geometry:outsideRegionGeometry(next)}:{type:'FeatureCollection',features:[]};
  map.getSource('outside-region')?.setData(outside);
  if(map.getLayer('outside-region-mask'))map.setLayoutProperty('outside-region-mask','visibility',next?'visible':'none');
  if(map.getLayer('selected-area'))map.setPaintProperty('selected-area','fill-opacity',next?0:0.28);
  const china=$('#china-only').checked;
  configureScopedTileFilter(map,next);
  // Reference vectors are a TileJSON source, so clear their cached tiles to
  // re-evaluate the source filter without replacing its original URL.
  map.style?.tileManagers?.reference?.clearTiles();
  map.getSource('dem')?.setTiles([tileTemplate('dem',china,`smooth=${$('#terrain-softness').value}`)]);
  map.getSource('relief')?.setTiles([tileTemplate('relief',china,currentLighting)]);
  map.getSource('satellite')?.setTiles([imageryTemplate(china)]);
  map.getSource('satellite-shade')?.setTiles([tileTemplate('shade',china,currentLighting)]);
  administrativeLayers?.setScope(next);
  for(const marker of [deviceMarker,coordinateMarker])if(marker)marker.getElement().style.display=next&&!booleanPointInPolygon(marker.getLngLat().toArray(),next)?'none':'';
  map.terrain?.tileManager.releaseAllRTT();map.triggerRepaint();scheduleLabels();
}
$('#isolate-toggle').onchange=()=>{syncIsolation();if($('#isolate-toggle').checked&&!selectedRegion)showMapStatus('请选择省、市或区县，选中后仅显示该区域')};
function clearSelection(){selectionRevision++;selected=null;selectedRegion=null;syncIsolation();$('#detail').hidden=true;map.getSource('selection')?.setData({type:'FeatureCollection',features:[]});scheduleLabels();}
async function showPlace(p,fly=true){
  if(p?.id==='beijing')p=placesById.get('province-110000')||p;
  if(!p)return;if(selected===p.id){clearSelection();return}
  const revision=++selectionRevision;selected=p.id;selectedRegion=null;syncIsolation();let region=provinceById.get(p.id);
  map.getSource('selection')?.setData({type:'FeatureCollection',features:[]});$('#detail').hidden=false;
  if(p.adcode){
    $('#detail').innerHTML=`<button class="detail-close" aria-label="取消选中"><i data-lucide="x"></i></button><h3>${p.name}</h3><p>正在加载行政区边界…</p>`;createIcons({icons});$('#detail .detail-close').onclick=clearSelection;
    try{region=await administrativeLayers.loadOne(p)}catch(error){if(revision!==selectionRevision)return;$('#detail').innerHTML=`<button class="detail-close" aria-label="取消选中"><i data-lucide="x"></i></button><h3>${p.name}</h3><p>未能找到该区域的边界，请检查网络或稍后重试。</p><button class="detail-retry">重新加载</button>`;createIcons({icons});$('#detail .detail-close').onclick=clearSelection;$('#detail .detail-retry').onclick=()=>{selected=null;showPlace(p,fly)};scheduleLabels();return}
  }
  if(revision!==selectionRevision)return;
  map.getSource('selection')?.setData(region||{type:'FeatureCollection',features:[]});
  selectedRegion=region||null;syncIsolation();
  if(fly&&region&&p.adcode){const [w,s,e,n]=geometryBounds(region),height=map.getContainer().clientHeight;map.fitBounds([[w,s],[e,n]],{padding:{top:Math.min(100,height*0.18),bottom:Math.min(130,height*0.2),left:35,right:35},maxZoom:p.category==='district'?11:8.5,pitch:$('#terrain-mode').value==='flat'?0:45,duration:1000})}
  else if(fly&&p.coordinates)map.flyTo({center:p.coordinates,zoom:Math.max(p.category==='peak'?7:5.3,p.zoom+0.3),pitch:$('#terrain-mode').value==='flat'?0:55,duration:1000,essential:true});
  const position=p.coordinates?`${Math.abs(p.coordinates[1]).toFixed(2)}° N &nbsp; ${Math.abs(p.coordinates[0]).toFixed(2)}° E`:'';
  $('#detail').innerHTML=`<button class="detail-close" aria-label="取消选中"><i data-lucide="x"></i></button><span class="detail-tag">${categories[p.category]}</span><h3>${p.name}</h3>${p.context?`<small>${p.context}</small>`:''}${p.elevation?`<div class="elevation"><span>海拔</span><b>${p.elevation.toLocaleString()} <small>m</small></b></div>`:''}<div class="detail-more">${p.en?`<small>${p.en}</small>`:''}<p>${p.description}</p>${p.id.startsWith('geonames-')?`<a class="data-source" href="https://www.geonames.org/${p.id.slice(9)}/" target="_blank" rel="noreferrer">查看 GeoNames 来源 ↗</a>`:''}<div class="detail-foot"><i data-lucide="map-pin"></i> ${position}</div></div>`;
  createIcons({icons});$('#detail .detail-close').onclick=clearSelection;scheduleLabels();
}
map.on('click',event=>{if(isolatedFeature&&!booleanPointInPolygon([event.lngLat.lng,event.lngLat.lat],isolatedFeature))return;const rect=map.getContainer().getBoundingClientRect(),x=rect.left+event.point.x,y=rect.top+event.point.y;for(const node of labelLayer.children){const box=node.getBoundingClientRect();if(x>=box.left&&x<=box.right&&y>=box.top&&y<=box.bottom){showPlace(placesById.get(node.dataset.placeId),false);return}}for(const id of ['district-hit','city-hit','admin-hit']){if(!map.getLayer(id))continue;const feature=map.queryRenderedFeatures(event.point,{layers:[id]})[0];if(!feature)continue;const p=id==='admin-hit'?placesById.get(`province-${feature.properties.adcode}`):administrativeLayers.recordForFeature(feature);if(p){showPlace(p,false);return}}});
function setSunOpen(open){$('#sun-panel').hidden=!open;$('#sun-toggle').setAttribute('aria-expanded',String(open))}
$('#layer-toggle').onclick=()=>{$('#layer-panel').hidden=!$('#layer-panel').hidden;setSunOpen(false);$('#relief-body').hidden=true;$('#relief-toggle').setAttribute('aria-expanded','false')};$('#layer-close').onclick=()=>$('#layer-panel').hidden=true;
$('#sun-toggle').onclick=()=>{setSunOpen($('#sun-panel').hidden);$('#layer-panel').hidden=true;$('#relief-body').hidden=true;$('#relief-toggle').setAttribute('aria-expanded','false')};$('#sun-close').onclick=()=>setSunOpen(false);
$('#relief-toggle').onclick=()=>{heightWheel.close();const open=$('#relief-body').hidden;$('#relief-body').hidden=!open;$('#relief-toggle').setAttribute('aria-expanded',String(open));if(open){setSunOpen(false);$('#layer-panel').hidden=true}};
$('#china-only').onchange=e=>{const china=e.target.checked;map.getSource('dem').setTiles([tileTemplate('dem',china,`smooth=${$('#terrain-softness').value}`)]);map.getSource('relief').setTiles([tileTemplate('relief',china,currentLighting)]);map.getSource('satellite')?.setTiles([imageryTemplate(china)]);map.getSource('satellite-shade')?.setTiles([tileTemplate('shade',china,currentLighting)]);if(map.getLayer('outside-china-mask'))map.setLayoutProperty('outside-china-mask','visibility',china?'visible':'none');};
$('#admin-toggle').onchange=e=>{for(const layer of ['admin-line','city-line','district-line'])map.setLayoutProperty(layer,'visibility',e.target.checked?'visible':'none')};
const detailDescriptions={'512':'标准：加载较快，适合普通设备','256':'增强：加载更多高程数据','128':'精细：请求和内存占用显著增加'};
$('#terrain-detail').onchange=e=>{
  const tileSize=Number(e.target.value),china=$('#china-only').checked,exaggeration=Number($('#exaggeration').value);
  const info=$('#terrain-detail-info');info.textContent=detailDescriptions[tileSize];updateReliefSummary();
  // A smaller visual tile size asks MapLibre for deeper source tiles and a denser terrain mesh at the same camera zoom.
  map.setTerrain(null);map.removeLayer('relief');map.removeSource('dem');map.removeSource('relief');
  map.addSource('dem',{type:'raster-dem',tiles:[tileTemplate('dem',china,`smooth=${$('#terrain-softness').value}`)],encoding:'terrarium',tileSize,maxzoom:12,attribution:'<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'});
  map.addSource('relief',{type:'raster',tiles:[tileTemplate('relief',china,currentLighting)],tileSize,maxzoom:12});configureTerrainLod(map);configureScopedTileFilter(map,isolatedFeature);
  map.addLayer({id:'relief',type:'raster',source:'relief',layout:{visibility:$('#base-map').value==='satellite'?'none':'visible'},paint:{'raster-fade-duration':150}},map.getLayer('satellite')?'satellite':'admin-hit');
  if($('#terrain-mode').value==='3d')map.setTerrain({source:'dem',exaggeration});applyVisualPreset($('#visual-style').value);updateSun();
  scheduleLabels();
};
$('#layer-options').innerHTML=Object.entries(categories).map(([key,name])=>`<label class="switch-row"><span>${name}</span><input type="checkbox" data-category="${key}" checked><span class="switch"></span></label>`).join('');
document.querySelectorAll('[data-category]').forEach(input=>input.onchange=()=>{input.checked?enabled.add(input.dataset.category):enabled.delete(input.dataset.category);scheduleLabels()});
function updateReliefSummary(){const base=$('#base-map').value==='satellite'?'卫星':'地形',mode=$('#terrain-mode').value==='3d'?`立体 ${$('#exaggeration').value}×`:'平面';$('#relief-summary').textContent=`${base} · ${mode}`;}
function setExaggeration(value){value=Number(value);$('#exaggeration').value=value;$('#exaggeration-value').textContent=`${value}×`;updateReliefSummary();document.querySelectorAll('[data-exaggeration]').forEach(button=>button.classList.toggle('active',Number(button.dataset.exaggeration)===value));if($('#terrain-mode').value==='3d')map.setTerrain({source:'dem',exaggeration:value});updateSun();scheduleLabels();}
$('#exaggeration').oninput=e=>setExaggeration(e.target.value);document.querySelectorAll('[data-exaggeration]').forEach(button=>button.onclick=()=>setExaggeration(button.dataset.exaggeration));
let softnessTimer,atmosphereKey='';
function setSoftness(value,custom=true){
  $('#terrain-softness').value=value;$('#terrain-softness-value').textContent=`${value}%`;
  if(custom)$('#visual-style').value='custom';
  clearTimeout(softnessTimer);softnessTimer=setTimeout(()=>{const china=$('#china-only').checked;map.getSource('dem')?.setTiles([tileTemplate('dem',china,`smooth=${value}`)]);updateSun()},300);
}
function updateAtmosphere(){
  if(!map.getLayer('background'))return;
  const fog=Number($('#fog-strength').value)/100,night=!!skyPositions&&!skyPositions.sun.visible,key=`${fog}:${night}`;
  if(key===atmosphereKey)return;atmosphereKey=key;
  const sky=night?'#192637':'#bbdce9',horizon=night?'#273844':'#eaf2e9',fogColor=night?'#293b43':'#d8e6de';
  map.setSky({'sky-color':['interpolate',['linear'],['zoom'],3.8,'#071015',6.5,sky],
    'horizon-color':['interpolate',['linear'],['zoom'],3.8,'#071015',6.5,horizon],
    'fog-color':['interpolate',['linear'],['zoom'],3.8,'#071015',6.5,fogColor],
    'fog-ground-blend':['interpolate',['linear'],['zoom'],3.8,1,6.5,1-fog*0.55,9,1-fog*0.55],
    'horizon-fog-blend':0.8,'sky-horizon-blend':0.6,'atmosphere-blend':0.85});
}
function setFog(value,custom=true){$('#fog-strength').value=value;$('#fog-strength-value').textContent=`${value}%`;if(custom)$('#visual-style').value='custom';updateAtmosphere()}
$('#terrain-softness').oninput=e=>setSoftness(Number(e.target.value));
$('#fog-strength').oninput=e=>setFog(Number(e.target.value));
const visualPresets={auto:{softness:0,fog:35,saturation:0.08,contrast:0.03,hue:0,brightness:0},sandtable:{softness:75,fog:10,saturation:-0.3,contrast:0.08,hue:-14,brightness:0.04},scenic:{softness:60,fog:70,saturation:0.38,contrast:0.03,hue:12,brightness:0.05}};
function applyVisualPreset(name){const p=visualPresets[name];if(!p)return;setSoftness(p.softness,false);setFog(p.fog,false);for(const layer of ['satellite','relief'])if(map.getLayer(layer)){map.setPaintProperty(layer,'raster-saturation',p.saturation);map.setPaintProperty(layer,'raster-contrast',p.contrast);map.setPaintProperty(layer,'raster-hue-rotate',p.hue);map.setPaintProperty(layer,'raster-brightness-min',p.brightness)}}
$('#visual-style').onchange=e=>applyVisualPreset(e.target.value);

function updateReferenceAttribution(){$('#reference-attribution').hidden=!['roads','rail','water'].some(group=>$(`#${group}-toggle`).checked)}
for(const group of ['roads','rail','water'])$(`#${group}-toggle`).onchange=e=>{setReferenceVisibility(map,group,e.target.checked);updateReferenceAttribution()};
$('#base-map').onchange=e=>selectBaseMap(e.target.value);
let previousPitch=DEFAULT_PITCH;
$('#terrain-mode').onchange=e=>{const flat=e.target.value==='flat';$('#height-mode-hint').textContent=flat?'平面模式下高度倍率暂不生效':'仅放大视觉落差，标注海拔不变';if(flat){previousPitch=map.getPitch();map.setTerrain(null);map.setMaxPitch(0)}else{map.setMaxPitch(75);map.setTerrain({source:'dem',exaggeration:Number($('#exaggeration').value)});map.easeTo({pitch:previousPitch,duration:300})}updateReliefSummary();scheduleLabels()};
const heightWheel=createHeightWheel($('#relief-toggle'),{
  beforeOpen:()=>{$('#relief-body').hidden=true;$('#relief-toggle').setAttribute('aria-expanded','false')},
  current:()=>$('#terrain-mode').value==='flat'?0:Number($('#exaggeration').value),
  select:value=>{
    const mode=$('#terrain-mode');
    if(value===0){if(mode.value!=='flat'){mode.value='flat';mode.dispatchEvent(new Event('change'))}}
    else{setExaggeration(value);if(mode.value==='flat'){mode.value='3d';mode.dispatchEvent(new Event('change'))}}
  }
});
$('#relief-toggle').title='点击打开地图设置；上滑选择立体倍率';
$('#zoom-in').onclick=()=>map.zoomIn();$('#zoom-out').onclick=()=>map.zoomOut();$('#north').onclick=()=>map.easeTo({bearing:0,pitch:$('#terrain-mode').value==='flat'?0:DEFAULT_PITCH});
function showNationalView(duration=1200){const width=map.getContainer().clientWidth,height=map.getContainer().clientHeight;map.fitBounds([[nationalBounds[0],nationalBounds[1]],[nationalBounds[2],nationalBounds[3]]],{padding:{top:Math.round(height*0.12),bottom:Math.round(height*0.15),left:Math.round(width*0.1),right:Math.round(width*0.1)},maxZoom:3.8,pitch:$('#terrain-mode').value==='flat'?0:DEFAULT_PITCH,bearing:0,duration});clearSelection()}
$('#reset').onclick=()=>showNationalView();$('#tip-close').onclick=()=>$('.gesture-tip').hidden=true;
const orientation = window.matchMedia('(orientation: portrait)');
function applyLayout(){
  const selected=$('#layout-mode').value;
  document.body.dataset.layout=selected==='auto'?(orientation.matches?'portrait':'landscape'):selected;
  setSearchOpen(false);
  requestAnimationFrame(()=>{map.resize();renderSky()});
}
$('#layout-mode').addEventListener('change',applyLayout);orientation.addEventListener('change',applyLayout);applyLayout();
function syncVisibleViewport(){const h=Math.min(window.innerHeight,window.visualViewport?.height||window.innerHeight);document.documentElement.style.setProperty('--visible-height',`${h}px`);requestAnimationFrame(()=>map.resize())}
window.visualViewport?.addEventListener('resize',syncVisibleViewport);window.addEventListener('resize',syncVisibleViewport);syncVisibleViewport();
// Keep both bottom control groups just above the wrapped attribution, whose
// height changes with screen width, language, and enabled data layers.
const attribution=$('.map-attribution');
function positionBottomControls(){document.documentElement.style.setProperty('--controls-bottom',`${Math.ceil(attribution.getBoundingClientRect().height)+12}px`)}
if(typeof ResizeObserver!=='undefined')new ResizeObserver(positionBottomControls).observe(attribution);
window.addEventListener('resize',positionBottomControls);positionBottomControls();
function setSearchOpen(open){
  const panel=$('#search-panel'),button=$('#search-toggle'),input=$('#search'),results=$('#search-results');
  panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
  if(open){cancelAutomaticLocation();setSunOpen(false);$('#layer-panel').hidden=true;$('#relief-body').hidden=true;$('#relief-toggle').setAttribute('aria-expanded','false');requestAnimationFrame(()=>{if(!panel.hidden)input.focus()})}
  else{results.hidden=true;input.value='';input.blur()}
}
$('#search-toggle').onclick=()=>setSearchOpen($('#search-panel').hidden);
$('#search-close').onclick=()=>{setSearchOpen(false);$('#search-toggle').focus()};
function setupSearch(input,results){
  input.addEventListener('input',()=>{
    const q=input.value.trim().toLowerCase(),parsed=parseCoordinates(q);results.hidden=!q;
    if(parsed.kind==='coordinate'){
      const [lon,lat]=parsed.coordinates;results.innerHTML=`<button data-coordinate><span>定位坐标</span><small>经度 ${lon}° · 纬度 ${lat}°</small></button>`;
      results.querySelector('[data-coordinate]').onclick=()=>{setSearchOpen(false);showCoordinate(parsed.coordinates)};return;
    }
    if(parsed.kind==='invalid'){results.innerHTML=`<div class="no-results">${parsed.message}</div>`;return}
    const found=q?[...searchAdministrative(administrativeEntries,q),...labelsByImportance.filter(p=>!p.adcode&&(p.name.toLowerCase().includes(q)||(p.en||'').toLowerCase().includes(q)))].sort((a,b)=>Number(b.name.toLowerCase()===q)-Number(a.name.toLowerCase()===q)).slice(0,30):[];
    results.innerHTML=found.length?found.map(p=>`<button data-result="${p.id}"><span>${p.name}${p.context?` <small>${p.context}</small>`:''}</span><small>${categories[p.category]}</small></button>`).join(''):'<div class="no-results">没有找到相关地名</div>';
    results.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{const place=placesById.get(b.dataset.result);setSearchOpen(false);showPlace(place)});
  });
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){const first=results.querySelector('[data-result], [data-coordinate]');if(first){event.preventDefault();first.click()}}});
}
setupSearch($('#search'),$('#search-results'));
document.addEventListener('click',e=>{if(!e.target.closest('#search-panel')&&!e.target.closest('#search-toggle')&&!$('#search-panel').hidden)setSearchOpen(false)});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setSearchOpen(true)}if(e.key==='Escape'){setSearchOpen(false);$('#layer-panel').hidden=true;setSunOpen(false)}});

const findProvince=createProvinceLookup(adminAreas.features);
let deviceMarker=null,coordinateMarker=null,locationRequestId=0,autoLocationPending=false;
function markerAt(previous,coordinates,label,kind){
  previous?.remove();
  const element=document.createElement('div');element.className=`location-marker ${kind}`;element.title=label;element.setAttribute('aria-label',label);
  if(kind==='device-marker')element.innerHTML='<svg viewBox="0 0 32 42" aria-hidden="true"><path d="M16 1C8.3 1 2 7.1 2 14.8c0 10 14 25.2 14 25.2s14-15.2 14-25.2C30 7.1 23.7 1 16 1Z" fill="#1689ed" stroke="white" stroke-width="2"/><circle cx="16" cy="14.5" r="5.2" fill="white"/></svg>';
  return new maplibregl.Marker({element,anchor:kind==='device-marker'?'bottom':'center'}).setLngLat(coordinates).addTo(map);
}
function cancelAutomaticLocation(){
  if(!autoLocationPending)return;
  autoLocationPending=false;locationRequestId++;$('#locate').disabled=false;$('#locate').removeAttribute('aria-busy');$('#locate-district').disabled=false;
}
map.on('movestart',event=>{if(event.originalEvent)cancelAutomaticLocation()});
map.on('click',event=>{if(event.originalEvent)cancelAutomaticLocation()});
document.addEventListener('pointerdown',event=>{if(event.target.closest('.map-controls, #search-toggle'))cancelAutomaticLocation()});

function showCoordinate(coordinates){
  cancelAutomaticLocation();clearSelection();
  if(!findProvince(...coordinates)&&$('#china-only').checked){$('#china-only').checked=false;$('#china-only').dispatchEvent(new Event('change',{bubbles:true}));showMapStatus('目标超出当前中国范围，已显示全球地图')}
  coordinateMarker=markerAt(coordinateMarker,coordinates,'搜索的坐标','coordinate-marker');
  // A moderate overhead view keeps even exaggerated high mountain terrain in
  // view while the target's detailed DEM tiles are still loading.
  map.easeTo({center:coordinates,zoom:6,pitch:0,duration:900});
}

function requestCurrentLocation(automatic=false,level='province'){
  const requestId=++locationRequestId;autoLocationPending=automatic;
  const button=$('#locate'),districtButton=$('#locate-district');button.disabled=true;districtButton.disabled=!automatic;button.setAttribute('aria-busy','true');
  const finish=()=>{if(requestId!==locationRequestId)return false;autoLocationPending=false;button.disabled=false;districtButton.disabled=false;button.removeAttribute('aria-busy');return true};
  const fallback=message=>{if(!finish())return;deviceMarker?.remove();deviceMarker=null;showNationalView(automatic?0:800);showMapStatus(message)};
  if(!window.isSecureContext||!navigator.geolocation){
    fallback('浏览器定位需要 HTTPS 或本机 localhost，已显示全国视图');
    if(!automatic&&import.meta.env.DEV&&location.protocol==='http:'&&location.port==='4173'){
      const status=$('#map-status'),link=document.createElement('a');
      link.href=`https://${location.hostname}:4174/`;link.textContent='打开局域网 HTTPS 地图';
      status.append(' · ',link,'（首次需确认开发证书）');clearTimeout(statusTimer);statusTimer=setTimeout(()=>status.hidden=true,20000);
    }
    return;
  }
  navigator.geolocation.getCurrentPosition(async position=>{
    const {longitude,latitude}=position.coords,province=findProvince(longitude,latitude);
    if(!province){fallback('当前位置不在示例中国范围内，已显示全国视图');return}
    let cities=[],districts=[];
    if(level!=='province'){
      const code=String(province.properties.adcode);
      const [cityData,districtData]=await Promise.all([
        loadLocalAdministrativeBoundaries().catch(()=>null),
        level==='district'?loadLocalDistrictBoundaries(code).catch(()=>null):null
      ]);
      cities=(cityData?.byParent.get(code)||[]).filter(feature=>feature.properties.level==='city');
      districts=districtData?[...districtData.byCode.values()]:[];
    }
    const region=selectLocationRegion(province,longitude,latitude,level,cities,districts);
    if(!finish())return;
    clearSelection();deviceMarker=markerAt(deviceMarker,[longitude,latitude],'当前位置','device-marker');
    const [w,s,e,n]=geometryBounds(region.feature),width=map.getContainer().clientWidth,height=map.getContainer().clientHeight;
    map.fitBounds([[w,s],[e,n]],{padding:{top:Math.min(70,height*0.12),bottom:Math.min(90,height*0.16),left:Math.min(55,width*0.1),right:Math.min(55,width*0.1)},maxZoom:{province:6,city:10,district:12}[region.level],pitch:$('#terrain-mode').value==='flat'?0:automatic?DEFAULT_PITCH:map.getPitch(),bearing:0,duration:automatic?0:900});
    const prefix=region.level!==level?`${level==='district'?'区县':'市级'}边界不可用，`:'';
    showMapStatus(`${prefix}已定位到${region.feature.properties.name}`);
  },error=>fallback(error.code===1?'定位权限被拒绝，请在浏览器网站设置中允许定位；已显示全国视图':'定位失败，请检查设备定位与网络；已显示全国视图'),{enableHighAccuracy:false,timeout:12000,maximumAge:300000});
}
bindLocationControl($('#locate'),level=>requestCurrentLocation(false,level));
$('#locate-district').onclick=()=>{$('#layer-panel').hidden=true;requestCurrentLocation(false,'district')};
map.on('load',()=>requestCurrentLocation(true));

// Start at noon for visibility; the current-time button enables the live clock.
let followClock = false, timeWasChosen = false, currentLighting = initialLighting, lightingTimer, skyPositions = null;
$('#sun-time').value=initialTime;
function renderSky(){
  if(!skyPositions)return;
  for(const [id,body] of [['sun',skyPositions.sun],['moon',skyPositions.moon]]){
    const element=$(`#sky-${id}`);element.hidden=!body.visible;
    if(body.visible){const position=skyPosition(body.azimuth,body.altitude,map.getBearing());element.style.left=`${Math.max(4,Math.min(96,position.x))}%`;element.style.top=`${Math.max(10,Math.min(85,position.y))}%`;element.title=`${id==='sun'?'太阳':'月亮'}：方位 ${Math.round(body.azimuth)}°，高度 ${Math.round(body.altitude)}°`;}
  }
  $('#sky-display').classList.toggle('night',!skyPositions.sun.visible);
  $('#sky-status').textContent=[skyPositions.sun.visible?'太阳可见':'太阳在地平线下',skyPositions.moon.visible?'月亮可见':'月亮在地平线下'].join(' · ');
}
function updateSun(){
  if(followClock)$('#sun-time').value=beijingTimeNow();
  $('#clock-status').textContent=followClock?'跟随当前时间':timeWasChosen?'自选时间':'默认中午 12:00';
  const value=$('#sun-time').value;if(!value)return;
  const [hour,minute]=value.slice(11,16).split(':').map(Number);$('#sky-time-range').value=hour*60+minute;$('#sky-time-value').textContent=value.slice(11,16);
  if(!map.getLayer('relief'))return;
  const c=map.getCenter(),light=celestialLightAt(value,c.lat,c.lng);if(!light)return;
  skyPositions=celestialPositionsAt(value,c.lat,c.lng);renderSky();updateAtmosphere();
  const strength=Number($('#light-strength').value),lighting=`time=${encodeURIComponent(value)}&strength=${strength}&smooth=${$('#terrain-softness').value}`;
  if(lighting!==currentLighting){currentLighting=lighting;clearTimeout(lightingTimer);lightingTimer=setTimeout(()=>{const china=$('#china-only').checked,source=map.getSource('relief');if(source)source.setTiles([tileTemplate('relief',china,currentLighting)]);map.getSource('satellite-shade')?.setTiles([tileTemplate('shade',china,currentLighting)]);},250)}
  const isMoon=light.body==='moon',name=isMoon?'月亮':'太阳',phase=isMoon?` · 月面照明 ${Math.round(light.fraction*100)}%`:'';
  $('#sun-result').textContent=`${name}${light.visible?'':'在地平线下'} · 方位 ${Math.round(light.azimuth)}° · 高度 ${Math.round(light.altitude)}°${phase}`;
  $('#sun-toggle .sun-icon').textContent=isMoon?'☾':'☼';
  $('#light-summary').textContent=`${isMoon?'夜间':'日照'} · ${value.slice(11,16)}`;
}
$('#sky-time-range').addEventListener('input',event=>{const minutes=Number(event.target.value),date=$('#sun-time').value.slice(0,10)||beijingTimeNow().slice(0,10);followClock=false;timeWasChosen=true;$('#sun-time').value=`${date}T${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;updateSun()});
function restoreCurrentTime(){followClock=true;updateSun()}
$('#sun-time').addEventListener('input',()=>{followClock=false;timeWasChosen=true;updateSun()});$('#sky-now').addEventListener('click',restoreCurrentTime);
$('#light-strength').addEventListener('input',event=>{$('#light-strength-value').textContent=`${event.target.value}%`;updateSun()});
$('#reset-panels').onclick=()=>{setSunOpen(false);$('#layer-panel').hidden=true;$('#relief-body').hidden=true;$('#relief-toggle').setAttribute('aria-expanded','false');heightWheel.close();setSearchOpen(false);document.activeElement?.blur?.()};
setInterval(()=>{if(followClock)updateSun()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&followClock)updateSun()});

// Browsers expose trackpad scrolling as wheel events, not finger counts. Pinch is ctrl+wheel.
map.scrollZoom.disable();const canvas=map.getCanvas();canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey||e.metaKey){map.zoomTo(map.getZoom()-e.deltaY*0.012,{duration:0,around:map.unproject([e.offsetX,e.offsetY])});}else if(e.deltaMode===0&&Math.abs(e.deltaY)<50){if(Math.abs(e.deltaX)>Math.abs(e.deltaY))map.setBearing(map.getBearing()-e.deltaX*0.16);else map.setPitch(Math.max(0,Math.min(75,map.getPitch()+e.deltaY*0.22)));}else{map.zoomTo(map.getZoom()-Math.sign(e.deltaY)*0.35,{duration:150,around:map.unproject([e.offsetX,e.offsetY])});}},{passive:false});
let threeX=null;canvas.addEventListener('touchstart',e=>{if(e.touches.length===3)threeX=[...e.touches].reduce((sum,t)=>sum+t.clientX,0)/3;},{passive:true});canvas.addEventListener('touchmove',e=>{if(e.touches.length===3&&threeX!==null){e.preventDefault();const x=[...e.touches].reduce((sum,t)=>sum+t.clientX,0)/3;map.setBearing(map.getBearing()+(x-threeX)*0.35);threeX=x;}},{passive:false});canvas.addEventListener('touchend',()=>{threeX=null},{passive:true});
