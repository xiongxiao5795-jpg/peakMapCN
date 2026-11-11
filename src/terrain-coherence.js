// Pick one DEM level that is already present for every visible terrain tile.
// Mixing a loaded child with a neighbour's coarser parent creates a vertical
// wall when their elevations differ, especially with exaggerated mountains.
function visibleDemTiles(tiles,source,deltaZoom){
  const min=source.minzoom??0,max=source.maxzoom??22,visible=[];
  for(const tile of tiles){
    const id=tile?.tileID;if(!id)continue;
    const ideal=Math.max(min,Math.min(max,id.overscaledZ-deltaZoom));
    const sourceId=id.scaledTo(ideal);
    if(source.hasTile&&!source.hasTile(sourceId))continue;
    visible.push({id,ideal});
  }
  return visible;
}
function isDemLevelLoaded(visible,manager,z){
  return visible.every(({id,ideal})=>!!manager.findTileInCaches(id.scaledTo(Math.min(z,ideal)).key)?.dem);
}
export function sharedLoadedDemZoom(tiles,manager,source,deltaZoom=1){
  const min=source.minzoom??0,visible=visibleDemTiles(tiles,source,deltaZoom);
  if(!visible.length)return null;
  const highest=Math.min(...visible.map(item=>item.ideal));
  for(let z=highest;z>=min;z--){
    if(isDemLevelLoaded(visible,manager,z))return z;
  }
  return null;
}

// MapLibre uses its own parent fallback for every terrain tile independently.
// Until the requested level is complete, use the highest common loaded
// parent for the whole view, then switch together. Until any common level is
// ready, keep the whole surface flat instead of exposing partial tall walls.
export function configureCoherentTerrain(map){
  const terrain=map.terrain,manager=terrain?.tileManager;
  if(!manager||manager.__peakCoherent)return;
  if(typeof manager.update!=='function'||typeof manager.getSourceTile!=='function'||typeof manager.findTileInCaches!=='function')return;
  const update=manager.update.bind(manager),getSourceTile=manager.getSourceTile.bind(manager);
  manager.__peakCoherent=true;manager.__peakSharedZoom=null;
  // Avoid repeatedly promoting the entire terrain while the camera is being
  // dragged. Resume refinement shortly after movement ends; a necessary
  // downgrade still happens immediately to avoid mixing incompatible DEMs.
  let settleUntil=0,settleTimer;
  map.on?.('moveend',()=>{
    if(map.terrain?.tileManager!==manager)return;
    settleUntil=performance.now()+500;clearTimeout(settleTimer);
    settleTimer=setTimeout(()=>{if(map.terrain?.tileManager===manager)map.triggerRepaint?.()},510);
  });
  manager.update=function(...args){
    const changed=update(...args),source=this.tileManager._source;
    const tiles=this.getRenderableTiles();let level=sharedLoadedDemZoom(tiles,this,source,this.deltaZoom);
    if(level!==null&&this.__peakSharedZoom!==null&&level>this.__peakSharedZoom&&(map.isMoving?.()||performance.now()<settleUntil)&&isDemLevelLoaded(visibleDemTiles(tiles,source,this.deltaZoom),this,this.__peakSharedZoom))level=this.__peakSharedZoom;
    const levelChanged=level!==this.__peakSharedZoom;
    if(levelChanged){this.__peakSharedZoom=level;this._lastTilesetChange=performance.now()}
    return changed||levelChanged;
  };
  manager.getSourceTile=function(tileID,searchForDEM){
    const level=this.__peakSharedZoom,source=this.tileManager._source;
    if(searchForDEM&&level===null)return undefined;
    if(searchForDEM&&level!==null){
      const z=Math.max(source.minzoom??0,Math.min(level,source.maxzoom??22,tileID.overscaledZ-this.deltaZoom));
      const tile=this.findTileInCaches(tileID.scaledTo(z).key);
      return tile?.dem?tile:undefined;
    }
    return getSourceTile(tileID,searchForDEM);
  };
}
