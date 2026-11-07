import overviewIndex from './terrain-overview-index.js';

const OVERVIEW_ZOOM=6,overviewTiles=new Set(overviewIndex);
// Both the page bundle and terrain worker live one directory below the app root.
const moduleUrl=import.meta.url;
// Each worker keeps a small cache of compressed source tiles. Adjacent shading
// tiles reuse the same data for their overlapping border without retaining
// large decoded images or tying another request to an aborted request.
const tileBlobs=new Map(),MAX_CACHED_TILES=24;
async function cachedBlob(url,signal){
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const key=String(url),cached=tileBlobs.get(key);
  if(cached){tileBlobs.delete(key);tileBlobs.set(key,cached);return cached}
  const response=await fetch(url,{signal});
  if(!response.ok)throw new Error(`Terrain tile ${response.status}`);
  const blob=await response.blob();
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  tileBlobs.set(key,blob);while(tileBlobs.size>MAX_CACHED_TILES)tileBlobs.delete(tileBlobs.keys().next().value);
  return blob;
}

export function overviewTile(z,x,y){
  const parentZoom=Math.min(z,OVERVIEW_ZOOM),scale=2**(z-parentZoom);
  return {z:parentZoom,x:Math.floor(x/scale),y:Math.floor(y/scale),scale,dx:x%scale,dy:y%scale};
}
export function hasOverviewTile(z,x,y){const tile=overviewTile(z,x,y);return overviewTiles.has(`${tile.z}/${tile.x}/${tile.y}`)}
async function fetchOverview(z,x,y,signal){
  const tile=overviewTile(z,x,y);
  const url=new URL(`../terrain-overview/${tile.z}/${tile.x}/${tile.y}.webp`,moduleUrl);
  return {bitmap:await createImageBitmap(await cachedBlob(url,signal)),tile};
}
async function fetchDetail(z,x,y,signal){
  const controller=new AbortController(),abort=()=>controller.abort();
  const timer=setTimeout(abort,8000);signal.addEventListener('abort',abort,{once:true});
  try{
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const blob=await cachedBlob(`https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`,controller.signal);
    return {bitmap:await createImageBitmap(blob),tile:null};
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}
}

export async function loadTerrainBitmap(z,x,y,chinaOnly,signal){
  if(chinaOnly&&z<=OVERVIEW_ZOOM){
    try{return await fetchOverview(z,x,y,signal)}catch(error){if(signal.aborted)throw error}
  }
  // When explicitly offline, use the overview consistently. Online failures must
  // not cache an enlarged overview as a successful detail tile: doing so lets
  // adjacent tiles use different data resolutions until the cache is cleared.
  if(chinaOnly&&z>OVERVIEW_ZOOM&&typeof navigator!=='undefined'&&navigator.onLine===false)return fetchOverview(z,x,y,signal);
  return fetchDetail(z,x,y,signal);
}
