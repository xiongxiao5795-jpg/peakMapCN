import {createTileCoverage} from './tile-coverage.js';

// MapLibre 6.16 asks each source whether a tile exists before scheduling it.
// Reject bounding-box misses cheaply here; workers clip intersecting tiles to
// the exact polygon. Preserve the source's own bounds when isolation is off.
export function configureScopedTileFilter(map,region){
  const coverage=region?createTileCoverage([region]):null;
  for(const id of ['dem','relief','satellite','satellite-shade','reference']){
    const source=map.getSource(id);
    if(!source||typeof source.hasTile!=='function')continue;
    if(!source.__peakmapOriginalHasTile)source.__peakmapOriginalHasTile=source.hasTile;
    source.hasTile=function(tile){
      if(!source.__peakmapOriginalHasTile.call(this,tile))return false;
      const {z,x,y}=tile.canonical;
      return !coverage||coverage.mayIntersect(z,x,y);
    };
  }
}
