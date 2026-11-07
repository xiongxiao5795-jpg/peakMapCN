// MapLibre 6.16 computes its terrain render-to-texture tile LOD independently
// from the DEM source LOD, causing the mesh to jump during camera rotation.
// Its public LOD setting only changes the source. Keep both selectors aligned.
const original='minzoom:this.minzoom,maxzoom:this.maxzoom,reparseOverscaled:!1,terrain:t}))n[i.key]';
const replacement='minzoom:this.minzoom,maxzoom:this.maxzoom,reparseOverscaled:!1,terrain:t,calculateTileZoom:this.tileManager._source.calculateTileZoom?(...e)=>this.tileManager._source.calculateTileZoom(...e)+this.deltaZoom:void 0}))n[i.key]';
export function patchMapLibreTerrain(code){
  const first=code.indexOf(original);
  if(first<0||code.indexOf(original,first+original.length)>=0)throw new Error('MapLibre terrain LOD patch no longer matches the pinned version');
  return code.slice(0,first)+replacement+code.slice(first+original.length);
}
