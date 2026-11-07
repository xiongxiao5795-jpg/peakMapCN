// Keep terrain near the camera at the same DEM level as the view tilts or
// rotates. Use one coarser level than the nominal center zoom to control tile
// count, and progressively coarsen terrain farther from the camera.
// MapLibre still chooses and loads visible tiles and falls back to parents.
export function stableTerrainTileZoom(centerZoom,distanceToTile,distanceZ,distanceToCenter){
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
  source.calculateTileZoom=stableTerrainTileZoom;
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
