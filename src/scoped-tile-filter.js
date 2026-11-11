import {createTileCoverage} from './tile-coverage.js';

// MapLibre 6.16 asks each source whether a tile exists before scheduling it.
// Reject bounding-box misses cheaply here; workers clip intersecting tiles to
// the exact polygon. Preserve the source's own bounds when isolation is off.
export function configureScopedTileFilter(map,region){
  const coverage=region?createTileCoverage([region]):null;
  for(const id of ['dem','relief','satellite','satellite-shade','reference','explorer-slope','explorer-aspect','explorer-multi']){
    const source=map.getSource(id);
    if(!source||typeof source.hasTile!=='function')continue;
    if(!source.__peakmapOriginalHasTile)source.__peakmapOriginalHasTile=source.hasTile;
    source.hasTile=function(tile){
      if(!source.__peakmapOriginalHasTile.call(this,tile))return false;
      const {z,x,y}=tile.canonical;
      if(!coverage)return true;
      if(id!=='dem')return coverage.mayIntersect(z,x,y);
      // Keep neighbouring elevation tiles for mesh stitching and for slopes
      // that reach into the selected region from just beyond its boundary.
      const n=2**z;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const ny=y+dy;if(ny<0||ny>=n)continue;
        if(coverage.mayIntersect(z,(x+dx+n)%n,ny))return true;
      }
      return false;
    };
  }
}
