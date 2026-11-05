import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
maplibregl.setWorkerUrl(workerUrl);
import 'maplibre-gl/dist/maplibre-gl.css';
import { createIcons, Search, Mountain, Layers2, Compass, Plus, Minus, RotateCcw, ChevronDown, ArrowUpRight, X, Info, Menu, MapPin, MousePointer2 } from 'lucide';
import { places as curatedPlaces, categories as curatedCategories } from '../data/places.js';
import { celestialLightAt, celestialPositionsAt, skyPosition, beijingTimeNow } from './sun.js';
import { adminAreas, registerTerrainProtocols, tileTemplate } from './terrain.js';
import { beamStyleAtZoom } from './lighting.js';
import './style.css';

const categories = {...curatedCategories, province:'省级行政区'};
const places = [...curatedPlaces, ...adminAreas.features.filter(f=>Array.isArray(f.properties.centroid || f.properties.center)).map(f=>({id:`province-${f.properties.adcode}`,name:f.properties.name,category:'province',coordinates:f.properties.centroid || f.properties.center,zoom:4.3,importance:58,description:`${f.properties.name}（示例行政区数据）`}))];
const icons = { Search, Mountain, Layers2, Compass, Plus, Minus, RotateCcw, ChevronDown, ArrowUpRight, X, Info, Menu, MapPin, MousePointer2 };
document.querySelector('#app').innerHTML = `
<header class="topbar"><a class="brand" href="#" aria-label="山河志首页"><span class="brand-mark"><i data-lucide="mountain"></i></span><span><b>山河志</b><small>SHAN HE ZHI</small></span></a><span class="top-divider"></span><span class="top-title">中国自然地理图鉴 <em> / </em> 地形探索</span><div class="top-right"><label class="layout-select"><span>布局</span><select id="layout-mode" aria-label="屏幕布局"><option value="auto">自动</option><option value="landscape">横屏</option><option value="portrait">竖屏</option></select></label></div></header>
<main class="workspace"><aside class="sidebar" id="sidebar"><div class="side-scroll"><div class="eyebrow"><span></span> EXPLORE THE LAND</div><h1>看见山河<br><span>读懂地理</span><b>。</b></h1><p class="intro">从起伏的群山到广阔的平原，<br>换个视角，认识脚下的中国。</p><div class="search-wrap"><i data-lucide="search"></i><input id="search" autocomplete="off" placeholder="搜索山脉、山峰、地名" aria-label="搜索地理名称"><kbd>⌘ K</kbd><div id="search-results" class="search-results" hidden></div></div>
<div class="section-heading"><div><small>START EXPLORING</small><h2>从这里出发</h2></div><span>精选地貌</span></div><div class="destinations"><button data-place="tibet"><span class="destination-icon plateau">⌁</span><span><b>青藏高原</b><small>世界屋脊 · 高原</small></span><i data-lucide="arrow-up-right"></i></button><button data-place="sichuan"><span class="destination-icon basin">◒</span><span><b>四川盆地</b><small>群山环抱 · 盆地</small></span><i data-lucide="arrow-up-right"></i></button><button data-place="hengduan"><span class="destination-icon mountain">△</span><span><b>横断山脉</b><small>山高谷深 · 山脉</small></span><i data-lucide="arrow-up-right"></i></button><button data-place="everest"><span class="destination-icon peak">⛰</span><span><b>珠穆朗玛峰</b><small>8848.86 米 · 山峰</small></span><i data-lucide="arrow-up-right"></i></button></div>
<div class="sidebar-bottom"><div class="side-note"><i data-lucide="info"></i><p>地形来自真实高程数据<br><span>向右滑动高度倍率，感受地势起伏</span></p></div></div></div><div class="side-footer"><span>MADE FOR THE CURIOUS</span><span>01 / 03</span></div></aside>
<section class="map-area" aria-label="中国三维地形地图"><div id="map"></div><svg id="light-rays" class="light-rays" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" hidden><defs><linearGradient id="ray-gradient" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff5c8" stop-opacity="0.62"/><stop offset="0.24" stop-color="#ffe7a9" stop-opacity="0.32"/><stop offset="0.72" stop-color="#ffe3a1" stop-opacity="0.12"/><stop offset="1" stop-color="#ffe7ad" stop-opacity="0"/></linearGradient><radialGradient id="ray-glow" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff9de" stop-opacity="0.72"/><stop offset="0.35" stop-color="#ffe2a1" stop-opacity="0.23"/><stop offset="1" stop-color="#ffe2a1" stop-opacity="0"/></radialGradient><filter id="ray-blur"><feGaussianBlur stdDeviation="17"/></filter></defs><ellipse id="ray-source" fill="url(#ray-glow)"/><g id="ray-shapes" fill="url(#ray-gradient)" filter="url(#ray-blur)"></g></svg><div id="labels" class="labels"></div><div class="sky-strip" id="sky-strip" aria-label="天空方位示意"><div class="sky-caption"><span>天空全景示意</span><span id="sky-status">正在计算日月位置</span></div><div class="sky-dome" id="sky-dome"><div class="sky-center"></div><div class="sky-horizon"></div><div class="sky-body sky-sun" id="sky-sun" hidden><span class="sky-orb">☀</span><small>太阳</small></div><div class="sky-body sky-moon" id="sky-moon" hidden><span class="sky-orb">☾</span><small>月亮</small></div></div><div class="sky-axis"><span>后方</span><span>地图朝向</span><span>后方</span></div></div><div class="map-top"><div class="map-heading"><div><span class="overline">TERRAIN EXPLORER <b> / </b> CHINA</span><h2>山河之间 <span>·</span> 自然有迹</h2><p>移动、缩放地图，发现中国的地形之美</p></div></div><div class="map-actions"><button class="layer-trigger" id="sun-toggle" aria-expanded="false" aria-controls="sun-panel"><span class="sun-icon">☼</span><span id="light-summary">光照 · 计算中</span><i data-lucide="chevron-down"></i></button><button class="layer-trigger" id="layer-toggle"><i data-lucide="layers-2"></i><span>地图设置</span><i data-lucide="chevron-down"></i></button></div></div>
<div class="layer-panel" id="layer-panel" hidden><div class="panel-title"><div><small>MAP SETTINGS</small><h3>地图设置</h3></div><button class="small-close" id="layer-close" aria-label="关闭设置"><i data-lucide="x"></i></button></div><label class="switch-row featured-switch"><span>仅显示中国范围</span><input id="china-only" type="checkbox" checked><span class="switch"></span></label><label class="switch-row featured-switch"><span>省级行政区边界</span><input id="admin-toggle" type="checkbox" checked><span class="switch"></span></label><label class="switch-row featured-switch"><span>丁达尔光束</span><input id="rays-layer" type="checkbox" checked><span class="switch"></span></label><div class="panel-separator"></div><div class="panel-label">显示地理名称</div><div id="layer-options"></div></div><div class="sun-panel" id="sun-panel" hidden><div class="panel-title"><div><small>SUN & MOON</small><h3>日月光照</h3></div><button class="small-close" id="sun-close" aria-label="关闭光照设置"><i data-lucide="x"></i></button></div><label class="sun-label" for="sun-time">日期与时间 <span>北京时间 UTC+8</span></label><input type="datetime-local" id="sun-time" step="60"><div class="clock-row"><span id="clock-status">跟随当前时间</span><button id="clock-now" type="button">恢复当前时间</button></div><div class="sun-result" id="sun-result"></div><label class="light-strength" for="light-strength"><span>光影强度</span><strong id="light-strength-value">100%</strong></label><input id="light-strength" type="range" min="0" max="100" value="100" aria-label="光影强度"><div class="sun-section"><label class="switch-row featured-switch"><span>丁达尔光束</span><input id="rays-toggle" type="checkbox" checked><span class="switch"></span></label><label class="light-strength" for="rays-strength"><span>光束与光雾强度</span><strong id="rays-strength-value">65%</strong></label><input id="rays-strength" type="range" min="0" max="100" value="65" aria-label="光束与光雾强度"><label class="light-strength" for="rays-altitude"><span>高海拔光雾增强</span><strong id="rays-altitude-value">80%</strong></label><input id="rays-altitude" type="range" min="0" max="100" value="80" aria-label="高海拔光雾增强"><div class="ray-note" id="ray-note">光雾随海拔增强</div></div><p>按地图中心计算日月位置。光束及光雾为视觉模拟。</p></div>
<div class="map-controls"><button id="north" title="重置方向" aria-label="重置方向"><i data-lucide="compass"></i></button><div class="control-separator"></div><button id="zoom-in" title="放大" aria-label="放大"><i data-lucide="plus"></i></button><button id="zoom-out" title="缩小" aria-label="缩小"><i data-lucide="minus"></i></button><div class="control-separator"></div><button id="reset" title="返回全国视角" aria-label="返回全国视角"><i data-lucide="rotate-ccw"></i></button></div>
<div class="relief-control"><button id="relief-toggle" class="relief-toggle" aria-expanded="false" aria-controls="relief-body"><span>地形 <strong id="relief-summary">80× · 增强</strong></span><i data-lucide="chevron-down"></i></button><div id="relief-body" hidden><div class="relief-head"><span><b>地形高度倍率</b><small>VERTICAL EXAGGERATION</small></span><strong id="exaggeration-value">80×</strong></div><input id="exaggeration" type="range" min="1" max="80" step="1" value="80" aria-label="地形高度倍率"><div class="relief-scale"><span>真实 1×</span><span>增强 80×</span></div><div class="relief-presets"><button data-exaggeration="1">真实</button><button data-exaggeration="10">适中</button><button data-exaggeration="20">突出</button><button class="active" data-exaggeration="80">强烈</button></div><p>仅放大视觉落差，标注海拔不变</p><label class="detail-setting" for="terrain-detail"><span>鸟瞰地形细节</span><select id="terrain-detail" aria-label="鸟瞰地形细节"><option value="512">标准</option><option value="256" selected>增强</option><option value="128">精细</option></select></label><p id="terrain-detail-info">增强：加载更多高程数据</p></div></div><div class="map-bottom"><div class="map-meta"><span class="meta-icon">✳</span><div><small>YOUR PERSPECTIVE</small><b id="coordinates">中国 · 全国视角</b></div></div><div class="legend"><span>海拔</span><div class="gradient"></div><div class="legend-values"><span>低</span><span>高</span></div></div></div><div class="gesture-tip"><i data-lucide="mouse-pointer-2"></i><span>拖动探索 <b>·</b> 双指上下倾斜 <b>·</b> 双指捏合缩放</span><button id="tip-close" aria-label="关闭提示"><i data-lucide="x"></i></button></div><div class="map-attribution">地形数据 © <a href="https://mapterhorn.com/attribution" target="_blank" rel="noreferrer">Mapterhorn</a> · 行政区 © <a href="https://github.com/Supeset/China-GeoData" target="_blank" rel="noreferrer">China-GeoData</a> · 非标准地图</div><div id="map-status" class="map-status">正在加载地形数据…</div><div class="bottom-search search-wrap"><i data-lucide="search"></i><input id="search-bottom" autocomplete="off" placeholder="搜索山峰、山脉或地名" aria-label="搜索地理名称"><div id="search-bottom-results" class="search-results" hidden></div></div>
<div class="detail-card" id="detail" hidden></div></section></main>`;
createIcons({icons});

// The same Terrarium source drives both the terrain mesh and its color relief.
registerTerrainProtocols(maplibregl);
const map = new maplibregl.Map({container:'map', style:{version:8,sources:{dem:{type:'raster-dem',tiles:[tileTemplate('dem',true)],encoding:'terrarium',tileSize:256,maxzoom:12,attribution:'<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'},relief:{type:'raster',tiles:[tileTemplate('relief',true)],tileSize:256,maxzoom:12},admin:{type:'geojson',data:adminAreas}},layers:[{id:'background',type:'background',paint:{'background-color':'#071015'}},{id:'relief',type:'raster',source:'relief',paint:{'raster-fade-duration':0}},{id:'admin-line',type:'line',source:'admin',paint:{'line-color':'#e8dec2','line-width':['interpolate',['linear'],['zoom'],3,0.6,7,1.2],'line-opacity':0.7}}],terrain:{source:'dem',exaggeration:80}},center:[103.5,35.1],zoom:3.3,pitch:53,bearing:0,maxPitch:75,minZoom:2,maxZoom:13,attributionControl:false,canvasContextAttributes:{antialias:true}});
const $=s=>document.querySelector(s); const enabled=new Set(Object.keys(categories)); let selected=null; let lastFailure=0;
map.on('load',()=>{$('#map-status').hidden=true; updateSun(); renderLabels();});
map.on('error',e=>{if(e.error?.name==='AbortError') return; if(Date.now()-lastFailure>10000){lastFailure=Date.now(); const status=$('#map-status'); status.textContent='部分地形加载失败，请检查网络连接';status.hidden=false;setTimeout(()=>status.hidden=true,6000);}});
const labelLayer=$('#labels');
function renderLabels(){ if(!map.loaded())return; const zoom=map.getZoom(), boxes=[]; labelLayer.innerHTML=''; const sorted=[...places].sort((a,b)=>b.importance-a.importance); for(const p of sorted){if(!enabled.has(p.category)||zoom<p.zoom)continue;const pos=map.project(p.coordinates);if(pos.x<45||pos.y<75||pos.x>map.getContainer().clientWidth-45||pos.y>map.getContainer().clientHeight-75)continue;const node=document.createElement('button');node.className=`map-label ${p.category} ${p.id===selected?'selected':''}`;node.innerHTML=`${p.category==='peak'?'<span class="label-peak">▲</span>':''}<span>${p.name}</span>${p.category==='peak'&&zoom>5?`<small>${p.elevation} m</small>`:''}`; node.style.left=`${pos.x}px`;node.style.top=`${pos.y}px`;node.setAttribute('aria-label',`${p.name}，${categories[p.category]}`);labelLayer.appendChild(node);const rect=node.getBoundingClientRect();if(boxes.some(b=>rect.left<b.right+8&&rect.right>b.left-8&&rect.top<b.bottom+5&&rect.bottom>b.top-5)){node.remove();continue;}boxes.push(rect);node.addEventListener('click',()=>showPlace(p,false));}}
let scheduled=false;function scheduleLabels(){if(!scheduled){scheduled=true;requestAnimationFrame(()=>{renderLabels();scheduled=false;});}}
map.on('move',()=>{scheduleLabels();renderSky();const c=map.getCenter();$('#coordinates').textContent=`${Math.abs(c.lat).toFixed(1)}° ${c.lat>=0?'N':'S'}  /  ${Math.abs(c.lng).toFixed(1)}° ${c.lng>=0?'E':'W'}`;}); map.on('idle',scheduleLabels);map.on('resize',()=>{scheduleLabels();renderSky()});map.on('moveend',updateSun);
function showPlace(p,fly=true){selected=p.id;if(fly)map.flyTo({center:p.coordinates,zoom:p.category==='peak'?7:5.3,pitch:55,duration:1800,essential:true});$('#detail').hidden=false;$('#detail').innerHTML=`<button class="detail-close" aria-label="关闭详情"><i data-lucide="x"></i></button><span class="detail-tag">${categories[p.category]} <b> / </b> GEOGRAPHY</span><h3>${p.name}</h3><small>${p.en||'CHINA GEOGRAPHY'}</small>${p.elevation?`<div class="elevation"><span>海拔</span><b>${p.elevation.toLocaleString()} <small>m</small></b></div>`:''}<p>${p.description}</p><div class="detail-foot"><i data-lucide="map-pin"></i> ${Math.abs(p.coordinates[1]).toFixed(2)}° N &nbsp; ${Math.abs(p.coordinates[0]).toFixed(2)}° E</div>`;createIcons({icons});$('#detail .detail-close').onclick=()=>{$('#detail').hidden=true;selected=null;scheduleLabels()};scheduleLabels();}
document.querySelectorAll('[data-place]').forEach(b=>b.addEventListener('click',()=>{showPlace(places.find(p=>p.id===b.dataset.place));$('#sidebar').classList.remove('open')}));
function setSunOpen(open){$('#sun-panel').hidden=!open;$('#sun-toggle').setAttribute('aria-expanded',String(open))}
$('#layer-toggle').onclick=()=>{$('#layer-panel').hidden=!$('#layer-panel').hidden;setSunOpen(false)};$('#layer-close').onclick=()=>$('#layer-panel').hidden=true;
$('#sun-toggle').onclick=()=>{setSunOpen($('#sun-panel').hidden);$('#layer-panel').hidden=true};$('#sun-close').onclick=()=>setSunOpen(false);
$('#relief-toggle').onclick=()=>{const open=$('#relief-body').hidden;$('#relief-body').hidden=!open;$('#relief-toggle').setAttribute('aria-expanded',String(open));};
$('#china-only').onchange=e=>{const china=e.target.checked;map.getSource('dem').setTiles([tileTemplate('dem',china)]);map.getSource('relief').setTiles([tileTemplate('relief',china,currentLighting)]);};
$('#admin-toggle').onchange=e=>map.setLayoutProperty('admin-line','visibility',e.target.checked?'visible':'none');
const detailDescriptions={'512':'标准：加载较快，适合普通设备','256':'增强：加载更多高程数据','128':'精细：请求和内存占用显著增加'};
$('#terrain-detail').onchange=e=>{
  const tileSize=Number(e.target.value),china=$('#china-only').checked,exaggeration=Number($('#exaggeration').value);
  const info=$('#terrain-detail-info');info.textContent=detailDescriptions[tileSize];updateReliefSummary();
  // A smaller visual tile size asks MapLibre for deeper source tiles and a denser terrain mesh at the same camera zoom.
  map.setTerrain(null);map.removeLayer('relief');map.removeSource('dem');map.removeSource('relief');
  map.addSource('dem',{type:'raster-dem',tiles:[tileTemplate('dem',china)],encoding:'terrarium',tileSize,maxzoom:12,attribution:'<a href="https://mapterhorn.com/attribution">© Mapterhorn</a>'});
  map.addSource('relief',{type:'raster',tiles:[tileTemplate('relief',china,currentLighting)],tileSize,maxzoom:12});
  map.addLayer({id:'relief',type:'raster',source:'relief',paint:{'raster-fade-duration':0}},'admin-line');
  map.setTerrain({source:'dem',exaggeration});updateSun();
  scheduleLabels();
};
$('#layer-options').innerHTML=Object.entries(categories).map(([key,name])=>`<label class="switch-row"><span>${name}</span><input type="checkbox" data-category="${key}" checked><span class="switch"></span></label>`).join('');
document.querySelectorAll('[data-category]').forEach(input=>input.onchange=()=>{input.checked?enabled.add(input.dataset.category):enabled.delete(input.dataset.category);scheduleLabels()});
function updateReliefSummary(){$('#relief-summary').textContent=`${$('#exaggeration').value}× · ${$('#terrain-detail').selectedOptions[0].textContent}`;}
function setExaggeration(value){value=Number(value);$('#exaggeration').value=value;$('#exaggeration-value').textContent=`${value}×`;updateReliefSummary();document.querySelectorAll('[data-exaggeration]').forEach(button=>button.classList.toggle('active',Number(button.dataset.exaggeration)===value));map.setTerrain({source:'dem',exaggeration:value});scheduleLabels();}
$('#exaggeration').oninput=e=>setExaggeration(e.target.value);document.querySelectorAll('[data-exaggeration]').forEach(button=>button.onclick=()=>setExaggeration(button.dataset.exaggeration));
$('#zoom-in').onclick=()=>map.zoomIn();$('#zoom-out').onclick=()=>map.zoomOut();$('#north').onclick=()=>map.easeTo({bearing:0,pitch:53});$('#reset').onclick=()=>{map.flyTo({center:[103.5,35.1],zoom:3.3,pitch:53,bearing:0,duration:1500});$('#detail').hidden=true;selected=null};$('#tip-close').onclick=()=>$('.gesture-tip').hidden=true;
const orientation = window.matchMedia('(orientation: portrait)');
function applyLayout(){
  const selected=$('#layout-mode').value;
  document.body.dataset.layout=selected==='auto'?(orientation.matches?'portrait':'landscape'):selected;
  document.querySelectorAll('.search-results').forEach(results=>results.hidden=true);
  requestAnimationFrame(()=>map.resize());
}
$('#layout-mode').addEventListener('change',applyLayout);orientation.addEventListener('change',applyLayout);applyLayout();
function setupSearch(input,results){
  input.addEventListener('input',()=>{const q=input.value.trim().toLowerCase();const found=q?places.filter(p=>p.name.toLowerCase().includes(q)||(p.en||'').toLowerCase().includes(q)):[];results.hidden=!q;results.innerHTML=found.length?found.map(p=>`<button data-result="${p.id}"><span>${p.name}</span><small>${categories[p.category]}</small></button>`).join(''):'<div class="no-results">没有找到相关地名</div>';results.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{showPlace(places.find(p=>p.id===b.dataset.result));results.hidden=true;input.value='';input.blur()})});
}
setupSearch($('#search'),$('#search-results'));setupSearch($('#search-bottom'),$('#search-bottom-results'));
document.addEventListener('click',e=>{if(!e.target.closest('.search-wrap'))document.querySelectorAll('.search-results').forEach(results=>results.hidden=true)});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();(document.body.dataset.layout==='portrait'?$('#search-bottom'):$('#search')).focus()}if(e.key==='Escape'){document.querySelectorAll('.search-results').forEach(results=>results.hidden=true);$('#layer-panel').hidden=true;setSunOpen(false)}});

// Keep the clock live until the user explicitly picks a different time.
let followClock = true, currentLighting = '', lightingTimer, skyPositions = null;
$('#sun-time').value=beijingTimeNow();
function renderRays(){
  const svg=$('#light-rays'), on=$('#rays-toggle').checked;
  const active=skyPositions&&(skyPositions.sun.visible?'sun':skyPositions.moon.visible?'moon':null);
  const detail=beamStyleAtZoom(map.getZoom());
  const show=on&&!!active&&Number($('#rays-strength').value)>0&&detail.count>0;svg.toggleAttribute('hidden',!show);
  $('#ray-note').textContent=!on?'光束图层已关闭':!active?'日月均在地平线下，光束暂不显示':detail.count===0?'放大视角下光束已淡出':'放大时光束渐少、渐淡；高处光雾更明显';
  if(!show)return;
  const mapRect=$('.map-area').getBoundingClientRect(), orb=$(`#sky-${active} .sky-orb`).getBoundingClientRect();
  if(!mapRect.width||!mapRect.height)return;
  const x=Math.max(0,Math.min(1000,1000*(orb.left+orb.width/2-mapRect.left)/mapRect.width));
  const y=Math.max(0,Math.min(1000,1000*(orb.top+orb.height/2-mapRect.top)/mapRect.height));
  svg.style.opacity=String(Number($('#rays-strength').value)/100*detail.opacity);svg.classList.toggle('moonlight',active==='moon');
  const gradient=$('#ray-gradient');gradient.setAttribute('x1',x);gradient.setAttribute('y1',y);gradient.setAttribute('x2',x);gradient.setAttribute('y2','1000');
  const glow=$('#ray-glow');glow.setAttribute('cx',x);glow.setAttribute('cy',y);glow.setAttribute('r','190');
  const source=$('#ray-source');source.setAttribute('cx',x);source.setAttribute('cy',y);source.setAttribute('rx','215');source.setAttribute('ry','55');
  const shape=$('#ray-shapes');shape.innerHTML='';
  const strips=[[-360,72,.50],[-250,100,.45],[-140,78,.58],[-20,95,.62],[95,75,.48],[205,100,.52],[315,76,.42]];
  const order=[3,1,5,0,6,2,4];
  for(const index of order.slice(0,detail.count)){const [offset,width,opacity]=strips[index],drift=125;const ray=document.createElementNS('http://www.w3.org/2000/svg','polygon');ray.setAttribute('points',`${x+offset},${y} ${x+offset+width},${y} ${x+offset+width+drift},1100 ${x+offset+drift},1100`);ray.setAttribute('opacity',opacity);shape.appendChild(ray)}
}
function renderSky(){
  if(!skyPositions)return;
  for(const [id,body] of [['sun',skyPositions.sun],['moon',skyPositions.moon]]){
    const element=$(`#sky-${id}`);element.hidden=!body.visible;
    if(body.visible){const position=skyPosition(body.azimuth,body.altitude,map.getBearing());element.style.left=`${Math.max(4,Math.min(96,position.x))}%`;element.style.top=`${Math.max(10,Math.min(85,position.y))}%`;element.title=`${id==='sun'?'太阳':'月亮'}：方位 ${Math.round(body.azimuth)}°，高度 ${Math.round(body.altitude)}°`;}
  }
  $('#sky-strip').classList.toggle('night',!skyPositions.sun.visible);
  $('#sky-status').textContent=[skyPositions.sun.visible?'太阳可见':'太阳在地平线下',skyPositions.moon.visible?'月亮可见':'月亮在地平线下'].join(' · ');
  renderRays();
}
function updateSun(){
  if(followClock) $('#sun-time').value=beijingTimeNow();
  $('#clock-status').textContent=followClock?'跟随当前时间':'自选时间';
  if(!map.getLayer('relief'))return;
  const c=map.getCenter(),light=celestialLightAt($('#sun-time').value,c.lat,c.lng);if(!light)return;
  skyPositions=celestialPositionsAt($('#sun-time').value,c.lat,c.lng);renderSky();
  const isMoon=light.body==='moon', strength=light.visible?Number($('#light-strength').value):0;
  const haze=$('#rays-toggle').checked&&light.visible?Math.round(Number($('#rays-strength').value)*beamStyleAtZoom(map.getZoom()).opacity):0, elevation=Number($('#rays-altitude').value);
  const lighting=`az=${Math.round(light.azimuth)}&alt=${Math.max(0,Math.min(90,Math.round(light.altitude)))}&strength=${strength}&haze=${haze}&elevation=${elevation}&tone=${isMoon?'moon':'sun'}`;
  if(lighting!==currentLighting){
    currentLighting=lighting;
    clearTimeout(lightingTimer);
    lightingTimer=setTimeout(()=>{const source=map.getSource('relief');if(source)source.setTiles([tileTemplate('relief',$('#china-only').checked,currentLighting)]);},200);
  }
  map.setPaintProperty('relief','raster-opacity',isMoon?(light.visible?0.68:0.42):1);
  map.setPaintProperty('relief','raster-contrast',0.08);
  const name=isMoon?'月亮':'太阳';
  const phase=isMoon?` · 月面照明 ${Math.round(light.fraction*100)}%`:'';
  $('#sun-result').textContent=`${name}${light.visible?'':'在地平线下，仅显示环境光'} · 方位 ${Math.round(light.azimuth)}° · 高度 ${Math.round(light.altitude)}°${phase}`;
  $('#sun-toggle .sun-icon').textContent=isMoon?'☾':'☼';
  $('#light-summary').textContent=`${isMoon?'月光':'日光'} · ${light.visible?Math.round(light.altitude)+'°':'环境光'}`;
}
$('#sun-time').addEventListener('input',()=>{followClock=false;updateSun()});
$('#clock-now').addEventListener('click',()=>{followClock=true;updateSun()});
$('#light-strength').addEventListener('input',e=>{$('#light-strength-value').textContent=`${e.target.value}%`;updateSun()});
for(const [control,other] of [['rays-toggle','rays-layer'],['rays-layer','rays-toggle']])$(`#${control}`).addEventListener('change',e=>{$(`#${other}`).checked=e.target.checked;updateSun()});
for(const [control,output] of [['rays-strength','rays-strength-value'],['rays-altitude','rays-altitude-value']])$(`#${control}`).addEventListener('input',e=>{$(`#${output}`).textContent=`${e.target.value}%`;updateSun()});
setInterval(()=>{if(followClock)updateSun()},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&followClock)updateSun()});

// Browsers expose trackpad scrolling as wheel events, not finger counts. Pinch is ctrl+wheel.
map.scrollZoom.disable();const canvas=map.getCanvas();canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey||e.metaKey){map.zoomTo(map.getZoom()-e.deltaY*0.012,{duration:0,around:map.unproject([e.offsetX,e.offsetY])});}else if(e.deltaMode===0&&Math.abs(e.deltaY)<50){if(Math.abs(e.deltaX)>Math.abs(e.deltaY))map.setBearing(map.getBearing()+e.deltaX*0.16);else map.setPitch(Math.max(0,Math.min(75,map.getPitch()-e.deltaY*0.22)));}else{map.zoomTo(map.getZoom()-Math.sign(e.deltaY)*0.35,{duration:150,around:map.unproject([e.offsetX,e.offsetY])});}},{passive:false});
let threeX=null;canvas.addEventListener('touchstart',e=>{if(e.touches.length===3)threeX=[...e.touches].reduce((sum,t)=>sum+t.clientX,0)/3;},{passive:true});canvas.addEventListener('touchmove',e=>{if(e.touches.length===3&&threeX!==null){e.preventDefault();const x=[...e.touches].reduce((sum,t)=>sum+t.clientX,0)/3;map.setBearing(map.getBearing()+(x-threeX)*0.35);threeX=x;}},{passive:false});canvas.addEventListener('touchend',()=>{threeX=null},{passive:true});
