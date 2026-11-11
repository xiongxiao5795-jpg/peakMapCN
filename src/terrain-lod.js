// Calculate the DEM level from the current zoom and optionally the distance.
export function stableTerrainTileZoom(centerZoom,distanceToTile,distanceZ,distanceToCenter,uniform=false){
  if(uniform)return centerZoom-1;
  const reference=Math.max(Number.EPSILON,distanceToCenter*2);
  const farDrop=Math.max(0,Math.log2(Math.max(1,distanceToTile/reference)));
  return centerZoom-1-farDrop;
}

// Choose one satellite level for the entire view. Bound the projected tile
// rectangle so a low-angle view cannot overwhelm mobile memory and networking.
export function uniformImageryZoom(zoom,bounds,budget=192){
  const [[west,south],[east,north]]=bounds;
  const mercatorY=lat=>{const r=Math.max(-85.051129,Math.min(85.051129,lat))*Math.PI/180;return (1-Math.asinh(Math.tan(r))/Math.PI)/2};
  const width=Math.min(1,Math.abs(east-west)/360),height=Math.abs(mercatorY(north)-mercatorY(south));
  let level=Math.max(0,Math.min(19,Math.floor(zoom)));
  while(level>0&&(Math.ceil(width*2**level)+1)*(Math.ceil(height*2**level)+1)>budget)level--;
  return level;
}

export function configureTerrainLod(map){
  const source=map.getSource('dem');
  if(!source)return;
  // The entire viewport must use the same target DEM level. Adjacent parent
  // and child datasets can differ by hundreds of metres and form walls.
  const coarse=globalThis.matchMedia?.('(pointer: coarse)').matches===true;
  const bias=coarse?0.35:0.7,budget=coarse?96:256;let terrainKey='',terrainLimit=Infinity;
  source.calculateTileZoom=(zoom,distance,vertical,center)=>{
    // At close views, request up to one extra AWS level. Exaggerated mountain
    // elevations can keep the camera from reaching the nominal zoom limit.
    const detail=map.__peakTerrainSource==='aws'?Math.max(0,Math.min(1,zoom-11.5)):0;
    const candidate=stableTerrainTileZoom(zoom,distance,vertical,center,true)+bias+detail;
    if(!['getBounds','getCenter','getContainer','getZoom','getPitch','getBearing'].every(name=>typeof map[name]==='function'))return candidate;
    const position=map.getCenter(),container=map.getContainer();
    const key=[candidate,position.lng,position.lat,map.getZoom(),map.getPitch(),map.getBearing(),container.clientWidth,container.clientHeight].join(',');
    if(key!==terrainKey){terrainKey=key;terrainLimit=uniformImageryZoom(candidate,map.getBounds().toArray(),budget)+0.999999}
    return Math.min(candidate,terrainLimit);
  };
  const imagery=map.getSource('satellite');
  if(imagery){
    const budget=globalThis.matchMedia?.('(pointer: coarse)').matches?192:384;
    let key='',level=0;
    imagery.roundZoom=false;
    imagery.calculateTileZoom=zoom=>{
      const center=map.getCenter(),container=map.getContainer();
      const next=[zoom,center.lng,center.lat,map.getPitch(),map.getBearing(),container.clientWidth,container.clientHeight].join(',');
      if(next!==key){key=next;level=uniformImageryZoom(zoom,map.getBounds().toArray(),budget)}
      return level;
    };
  }
  // The terrain manager uses twice the DEM source's visual tile size. Align
  // derived rasters with the same geographic DEM level instead of requesting
  // several times more tiles and mixing unrelated shading resolutions.
  for(const id of ['satellite-shade','relief']){
    const derived=map.getSource(id);
    if(!derived)continue;
    derived.roundZoom=false;
    derived.calculateTileZoom=(zoom,distance,vertical,center)=>source.calculateTileZoom(
      zoom+Math.log2(derived.tileSize/(source.tileSize*2)),distance,vertical,center
    );
  }
}

// MapLibre defaults to 128 subdivisions per tile. A denser mesh makes the
// DEM's actual ridges less faceted; it cannot invent missing DEM resolution.
// Both values stay below the 16-bit mesh-index limit, including skirts.
export function configureTerrainMesh(map,coarsePointer=globalThis.matchMedia?.('(pointer: coarse)').matches===true){
  const terrain=map.terrain;if(!terrain||typeof terrain.meshSize!=='number')return;
  const size=coarsePointer?160:192;if(terrain.meshSize===size)return;
  for(const mesh of Object.values(terrain._meshCache||{}))mesh.destroy();
  terrain._meshCache={};terrain.meshSize=size;terrain.tileManager?.releaseAllRTT?.();map.triggerRepaint?.();
}

// MapLibre 6.16 offers only full-length or disabled skirts. Cap their length
// to cover most exaggerated DEM seams without the default huge outer walls.
// Reapply after setTerrain(), which creates a new Terrain instance.
export function limitTerrainSkirts(map){
  const terrain=map.terrain;
  if(!terrain||typeof terrain.getSkirtLength!=='function'||terrain.__peakmapSkirtsLimited)return;
  const original=terrain.getSkirtLength.bind(terrain);
  terrain.getSkirtLength=zoom=>Math.min(original(zoom),Math.max(2000,500*terrain.exaggeration));
  terrain.__peakmapSkirtsLimited=true;
}

// The stable mesh can keep more tiles in view at high pitch. On touch devices,
// use a smaller render-to-texture target to bound GPU memory; DEM precision is
// unaffected. MapLibre recreates both objects whenever terrain is reset.
export function configureMobileTerrainTextures(map,coarsePointer=globalThis.matchMedia?.('(pointer: coarse)').matches===true){
  const terrain=map.terrain,target=map.painter?.renderToTexture;
  if(!coarsePointer||!terrain||!target)return;
  const size=terrain.tileManager.tileSize;
  if(target.rttSize===size)return;
  terrain.tileManager.releaseAllRTT();
  terrain.qualityFactor=1;
  target.rttSize=size;
}
