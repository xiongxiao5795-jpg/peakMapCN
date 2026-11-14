import {hasOverviewTile} from './terrain-data.js';

// Prefer a DEM level already present for every visible terrain tile. When a
// new tile enters the view, preserve the established level for existing peaks.
function visibleDemTiles(tiles,source,deltaZoom){
  const min=source.minzoom??0,max=source.maxzoom??22,visible=[];
  for(const tile of tiles){
    const id=tile?.tileID;if(!id)continue;
    const ideal=Math.max(min,Math.min(max,id.overscaledZ-deltaZoom));
    const sourceId=id.scaledTo(ideal);
    if(source.hasTile&&!source.hasTile(sourceId))continue;
    if(source.__peakmapRegionCoreTile&&!source.__peakmapRegionCoreTile(sourceId))continue;
    visible.push({id,ideal});
  }
  return visible;
}
function isDemLevelLoaded(visible,manager,z){
  return visible.every(({id,ideal})=>!!manager.findTileInCaches(id.scaledTo(Math.min(z,ideal)).key)?.dem);
}
export function terrainBlendProgress(started,now,duration=650){
  const x=Math.max(0,Math.min(1,(now-started)/duration));
  return x*x*(3-2*x);
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

// Request the bundled z6 parents before online detail, so they cannot be
// trapped behind slow network jobs in the DEM worker queue.
export function prioritizeOverviewTerrainTiles(ideal,normal,source,isolated=false){
  const template=source.tiles?.[0]||'';
  if((!template.startsWith('dem-china:')&&!isolated)||template.includes('source=aws'))return normal;
  const overview=[],seen=new Set();
  for(const tile of ideal){
    if(tile.canonical.z<6)continue;
    const parent=tile.scaledTo(6),{z,x,y}=parent.canonical;
    if(!hasOverviewTile(z,x,y)||(source.hasTile&&!source.hasTile(parent))||seen.has(parent.key))continue;
    seen.add(parent.key);overview.push(parent);
  }
  // Existing z0–z6 ancestors must also come before remote tiles.
  const ordered=[...overview,...normal.filter(tile=>tile.canonical.z<=6),...normal.filter(tile=>tile.canonical.z>6)],result=[];
  seen.clear();for(const tile of ordered)if(!seen.has(tile.key)){seen.add(tile.key);result.push(tile)}
  return result;
}

// MapLibre uses its own parent fallback for every terrain tile independently.
// Until the requested level is complete, use the highest common loaded
// parent for the whole view, then switch together. Newly visible tiles may
// temporarily use their own parent without forcing the whole view to downgrade.
export function configureCoherentTerrain(map,{coarsePointer=globalThis.matchMedia?.('(pointer: coarse)').matches===true||/Android/i.test(globalThis.navigator?.userAgent||''),now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  const terrain=map.terrain,manager=terrain?.tileManager;
  if(!manager||manager.__peakCoherent)return;
  if(typeof manager.update!=='function'||typeof manager.getSourceTile!=='function'||typeof manager.findTileInCaches!=='function')return;
  const update=manager.update.bind(manager),getSourceTile=manager.getSourceTile.bind(manager);
  const sourceManager=manager.tileManager;
  if(typeof sourceManager?._addTerrainIdealTiles==='function'&&!sourceManager.__peakOverviewPriority){
    const add=sourceManager._addTerrainIdealTiles.bind(sourceManager);
    sourceManager._addTerrainIdealTiles=ideal=>prioritizeOverviewTerrainTiles(ideal,add(ideal),sourceManager._source,!!map.__peakmapRegionIsolated);
    sourceManager.__peakOverviewPriority=true;
  }
  manager.__peakCoherent=true;manager.__peakSharedZoom=null;
  const duration=650,tileTransitions=new Map();
  const blendForTile=tileID=>manager.__peakTransition||tileTransitions.get(tileID.key)?.transition;
  const blendProgress=t=>t?terrainBlendProgress(t.started,now(),duration):1;
  const transitionProgress=()=>{
    return blendProgress(manager.__peakTransition);
  };
  // The previous texture is looked up separately for each terrain tile. When
  // that tile wasn't present before the pan, it uses the new texture directly.
  if(typeof terrain.getTerrainData==='function'){
    const getTerrainData=terrain.getTerrainData.bind(terrain);
    terrain.getTerrainData=function(tileID){
      const current=getTerrainData(tileID),transition=blendForTile(tileID),mix=blendProgress(transition);
      if(!transition||mix>=1||!current.tile?.dem)return current;
      manager.__peakForcedLevel=transition.from;
      let previous;
      try{previous=getTerrainData(tileID)}finally{manager.__peakForcedLevel=undefined}
      if(previous.tile?.dem){current.__peakPrevious=previous;current.__peakMix=mix}
      return current;
    };
  }
  // Match CPU elevation sampling to the rendered transition so camera and
  // map picking do not jump ahead of the surface while it is blending.
  const coverage=terrain.coverage;
  if(typeof coverage?.getSampler==='function'&&typeof coverage._createElevationSampler==='function'){
    const getSampler=coverage.getSampler.bind(coverage);
    coverage.getSampler=function(tileID){
      const current=getSampler(tileID),transition=blendForTile(tileID);
      if(!current||!transition)return current;
      manager.__peakForcedLevel=transition.from;
      let previous;
      try{previous=coverage._createElevationSampler(tileID)}finally{manager.__peakForcedLevel=undefined}
      if(!previous)return current;
      return (x,y,extent)=>{const mix=blendProgress(transition);return previous(x,y,extent)*(1-mix)+current(x,y,extent)*mix};
    };
  }
  // Avoid repeatedly promoting the entire terrain while the camera is being
  // dragged. Resume refinement shortly after movement ends; a necessary
  // downgrade still happens immediately to avoid mixing incompatible DEMs.
  let settleUntil=0,settleTimer,refinementStarted=null,refinementChanged=null,refinementCandidate=null,refinementTimer=null;
  function wakeForRefinement(delay){
    if(refinementTimer!==null)return;
    refinementTimer=setTimer(()=>{refinementTimer=null;if(map.terrain?.tileManager===manager)map.triggerRepaint?.()},Math.max(1,delay));
  }
  map.on?.('moveend',()=>{
    if(map.terrain?.tileManager!==manager)return;
    settleUntil=now()+500;clearTimer(settleTimer);
    settleTimer=setTimer(()=>{if(map.terrain?.tileManager===manager)map.triggerRepaint?.()},510);
  });
  manager.update=function(...args){
    const changed=update(...args),source=this.tileManager._source;
    const tiles=this.getRenderableTiles(),visible=visibleDemTiles(tiles,source,this.deltaZoom),ideal=visible.length?Math.min(...visible.map(item=>item.ideal)):null;
    let target=ideal;
    if(coarsePointer&&ideal!==null&&typeof source.calculateTileZoom==='function'&&typeof map.getZoom==='function'){
      const scale=Math.log2((map.transform?.tileSize||512)/(this.tileManager.tileSize||512));
      const requested=Math.floor(source.calculateTileZoom(map.getZoom()+scale,1,1,1));
      if(Number.isFinite(requested))target=Math.max(ideal,Math.min(source.maxzoom??22,requested));
    }
    let level=sharedLoadedDemZoom(tiles,this,source,this.deltaZoom);
    // A newly entering tile must not turn the whole existing view flat while
    // its DEM is loading. Tiles with no data remain empty until ready.
    if(level===null&&this.__peakSharedZoom!==null)level=this.__peakSharedZoom;
    const previous=this.__peakSharedZoom,canKeep=previous!==null&&ideal!==null&&previous<=ideal&&isDemLevelLoaded(visible,this,previous);
    // A few newly visible tiles should not force every already-loaded peak
    // back to a much coarser ancestor. Keep the current level at the same
    // camera zoom; missing tiles temporarily use their own loaded parent.
    if(previous!==null&&ideal!==null&&previous<=ideal&&level<previous&&visible.some(({id})=>this.findTileInCaches(id.scaledTo(previous).key)?.dem))level=previous;
    if(canKeep&&level!==previous&&this.__peakTransition&&transitionProgress()<1)level=previous;
    if(canKeep&&level>previous&&(map.isMoving?.()||now()<settleUntil))level=previous;
    // A newly resolved parent can briefly appear to be the target while the
    // terrain renderer is still discovering the next level. Require a quiet
    // interval on touch devices, and wait longer if finer tiles are pending.
    // A completed bundled overview can be shown immediately. The longer
    // settling policy is only needed for online detail above z6.
    const bundledOverview=level<=6&&map.__peakTerrainSource!=='aws'&&((source.tiles?.[0]||'').startsWith('dem-china:')||map.__peakmapRegionIsolated);
    if(coarsePointer&&canKeep&&level>previous&&!bundledOverview){
      const time=now();refinementStarted??=time;
      if(refinementCandidate!==level){refinementCandidate=level;refinementChanged=time}
      const deadline=10000-(time-refinementStarted),quiet=1400-(time-refinementChanged);
      const failed=typeof this.isStillWaitingForDEM==='function'&&visible.some(({id,ideal})=>!this.isStillWaitingForDEM(id)&&!this.findTileInCaches(id.scaledTo(Math.min(target,ideal)).key)?.dem);
      const remaining=Math.min(deadline,level<target&&!failed?deadline:quiet);
      if(remaining>0){level=previous;wakeForRefinement(remaining)}
    }
    const levelChanged=level!==this.__peakSharedZoom;
    if(levelChanged){
      const from=this.__peakSharedZoom;this.__peakSharedZoom=level;this._lastTilesetChange=now();refinementStarted=null;refinementChanged=null;refinementCandidate=null;
      if(refinementTimer!==null){clearTimer(refinementTimer);refinementTimer=null}
      this.__peakTransition=from!==null&&level!==null?{from,started:now()}:null;
    }
    // A tile entering the view may initially use a parent while its own DEM
    // loads. Blend just that tile when the finer data arrives; the other peaks
    // retain their height. Keep CPU picking on the same transition.
    const activeKeys=new Set();let tileChanged=false,blending=false;
    for(const {id} of visible){
      activeKeys.add(id.key);
      const current=this.getSourceTile(id,true),z=current?.tileID?.overscaledZ;
      const state=tileTransitions.get(id.key);
      if(!state){tileTransitions.set(id.key,{z});continue}
      if(levelChanged){state.z=z;state.transition=null;continue}
      if(z!==state.z){
        state.transition=z!==undefined&&state.z!==undefined&&z>state.z?{from:state.z,started:now()}:null;
        state.z=z;tileChanged=true;
      }
      if(state.transition){if(blendProgress(state.transition)>=1)state.transition=null;else blending=true}
    }
    for(const key of tileTransitions.keys())if(!activeKeys.has(key))tileTransitions.delete(key);
    if(blending)map.triggerRepaint?.();
    if(this.__peakTransition){if(transitionProgress()>=1)this.__peakTransition=null;else map.triggerRepaint?.()}
    return changed||levelChanged||tileChanged;
  };
  manager.getSourceTile=function(tileID,searchForDEM){
    const level=this.__peakForcedLevel??this.__peakSharedZoom,source=this.tileManager._source;
    if(searchForDEM&&level===null){
      // During startup a complete shared level may not exist yet. Show any
      // local overview parent already loaded, without mixing in detail tiles.
      for(let z=Math.min(6,source.maxzoom??22,tileID.overscaledZ-this.deltaZoom);z>=(source.minzoom??0);z--){
        const tile=this.findTileInCaches(tileID.scaledTo(z).key);if(tile?.dem)return tile;
      }
      return undefined;
    }
    if(searchForDEM&&level!==null){
      let z=Math.max(source.minzoom??0,Math.min(level,source.maxzoom??22,tileID.overscaledZ-this.deltaZoom));
      for(;z>=(source.minzoom??0);z--){const tile=this.findTileInCaches(tileID.scaledTo(z).key);if(tile?.dem)return tile}
      return undefined;
    }
    return getSourceTile(tileID,searchForDEM);
  };
}
