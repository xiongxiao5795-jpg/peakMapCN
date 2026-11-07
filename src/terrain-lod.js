// Keep terrain near the camera at the same DEM level as the view tilts or
// rotates. Use one coarser level than the nominal center zoom to control tile
// count, and progressively coarsen terrain farther from the camera.
// MapLibre still chooses and loads visible tiles and falls back to parents.
export function stableTerrainTileZoom(centerZoom,distanceToTile,distanceZ,distanceToCenter){
  const reference=Math.max(Number.EPSILON,distanceToCenter*2);
  const farDrop=Math.max(0,Math.log2(Math.max(1,distanceToTile/reference)));
  return centerZoom-1-farDrop;
}

export function configureTerrainLod(map){
  const source=map.getSource('dem');
  if(!source)return;
  source.calculateTileZoom=stableTerrainTileZoom;
  // The terrain manager uses twice the DEM source's visual tile size. Align
  // derived rasters with the same geographic DEM level instead of requesting
  // several times more tiles and mixing unrelated shading resolutions.
  for(const id of ['satellite-shade','relief']){
    const derived=map.getSource(id);
    if(!derived)continue;
    derived.roundZoom=false;
    derived.calculateTileZoom=(zoom,distance,vertical,center)=>stableTerrainTileZoom(
      zoom+Math.log2(derived.tileSize/(source.tileSize*2)),distance,vertical,center
    );
  }
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
