const OVERVIEW_ZOOM=6;
// Both the page bundle and terrain worker live one directory below the app root.
const moduleUrl=import.meta.url;

export function overviewTile(z,x,y){
  const parentZoom=Math.min(z,OVERVIEW_ZOOM),scale=2**(z-parentZoom);
  return {z:parentZoom,x:Math.floor(x/scale),y:Math.floor(y/scale),scale,dx:x%scale,dy:y%scale};
}
async function fetchOverview(z,x,y,signal){
  const tile=overviewTile(z,x,y);
  const url=new URL(`../terrain-overview/${tile.z}/${tile.x}/${tile.y}.webp`,moduleUrl);
  const response=await fetch(url,{signal});
  if(!response.ok)throw new Error(`本地概览瓦片不可用 (${response.status})`);
  return {bitmap:await createImageBitmap(await response.blob()),tile};
}
async function fetchDetail(z,x,y,signal){
  const controller=new AbortController(),abort=()=>controller.abort();
  const timer=setTimeout(abort,8000);signal.addEventListener('abort',abort,{once:true});
  try{
    if(signal.aborted)throw new DOMException('Aborted','AbortError');
    const response=await fetch(`https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`,{signal:controller.signal});
    if(!response.ok)throw new Error(`Terrain tile ${response.status}`);
    return {bitmap:await createImageBitmap(await response.blob()),tile:null};
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort)}
}

export async function loadTerrainBitmap(z,x,y,chinaOnly,signal){
  if(chinaOnly&&z<=OVERVIEW_ZOOM){
    try{return await fetchOverview(z,x,y,signal)}catch(error){if(signal.aborted)throw error}
  }
  try{
    if(chinaOnly&&typeof navigator!=='undefined'&&navigator.onLine===false)throw new Error('offline');
    return await fetchDetail(z,x,y,signal);
  }catch(error){
    if(signal.aborted)throw error;
    if(chinaOnly&&z>OVERVIEW_ZOOM)return fetchOverview(z,x,y,signal);
    throw error;
  }
}
