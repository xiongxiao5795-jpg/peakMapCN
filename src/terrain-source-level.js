// Mapterhorn's global coverage commonly ends at z12; AWS's z13 tiles add
// detail in the sampled regions. Higher AWS levels need broader data checks.
export const terrainSourceMaxZoom=source=>source==='aws'?13:12;

// MapLibre's raster sources reload their TileJSON options when setTiles is
// called. Keep the active source and its serialized options in agreement.
export function setTerrainSourceMaxZoom(source,name){
  if(!source)return;
  const maxzoom=terrainSourceMaxZoom(name);
  source.maxzoom=maxzoom;
  if(source._options)source._options.maxzoom=maxzoom;
}
