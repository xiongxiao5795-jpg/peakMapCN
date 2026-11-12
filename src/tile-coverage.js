import booleanIntersects from '@turf/boolean-intersects';
import {polygon} from '@turf/helpers';

const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const tileLat=(y,n)=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;

// Reuse the geographic polygons both for quick tile rejection and for the
// pixel-accurate masks. Keep holes and islands instead of using a bounding box.
export function createTileCoverage(features){
  const parts=features.flatMap(feature=>{
    if(!feature?.geometry||!['Polygon','MultiPolygon'].includes(feature.geometry.type))return [];
    const groups=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    return groups.map(coordinates=>{
      const bounds=coordinates[0].reduce((b,[x,y])=>[Math.min(b[0],x),Math.min(b[1],y),Math.max(b[2],x),Math.max(b[3],y)],[180,90,-180,-90]);
      return {coordinates,bounds,feature:polygon(coordinates)};
    });
  });
  const cache=new Map(),boundsCache=new Map();
  const tileBounds=(z,x,y)=>{const n=2**z;return [x/n*360-180,tileLat(y+1,n),(x+1)/n*360-180,tileLat(y,n)]};
  const coverage=(z,x,y)=>{
    const key=`${z}/${x}/${y}`;
    if(cache.has(key))return cache.get(key);
    const bounds=tileBounds(z,x,y);
    const [w,s,e,north]=bounds,tile=polygon([[[w,s],[e,s],[e,north],[w,north],[w,s]]]);
    const found=parts.filter(part=>overlaps(bounds,part.bounds)&&booleanIntersects(part.feature,tile));
    if(cache.size>=512)cache.clear();cache.set(key,found);return found;
  };
  coverage.mayIntersect=(z,x,y)=>{
    const key=`${z}/${x}/${y}`;if(boundsCache.has(key))return boundsCache.get(key);
    const bounds=tileBounds(z,x,y),result=parts.some(part=>overlaps(bounds,part.bounds));
    if(boundsCache.size>=4096)boundsCache.clear();boundsCache.set(key,result);return result;
  };
  // Include polygon components just outside the tile when building padded
  // masks. Otherwise adjacent tiles can disagree about the very same edge.
  coverage.withNeighbors=(z,x,y,radius=1)=>{
    const n=2**z,found=new Set();
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const ny=y+dy;if(ny<0||ny>=n)continue;
      for(const part of coverage(z,(x+dx+n)%n,ny))found.add(part);
    }
    return [...found];
  };
  return coverage;
}

// Invert a region into a mask for vector overlays. Rings inside a region are
// holes in the region and therefore must remain covered in the outside mask.
export function outsideRegionGeometry(feature){
  const groups=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  const world=[[-180,-85],[-180,85],[180,85],[180,-85],[-180,-85]];
  const outside=[world,...groups.map(group=>group[0])];
  return {type:'MultiPolygon',coordinates:[outside,...groups.flatMap(group=>group.slice(1).map(hole=>[hole]))]};
}
