import outsideChina from '../data/china-outside-mask.json';
import { imageryTemplate, tileTemplate } from './terrain.js';
import { bindShadeReadiness } from './shade-readiness.js';

export const referenceGroups={
  roads:['road-major-casing','road-major','road-minor'],
  rail:['rail-line'],
  water:['water-area','waterway-line']
};
const major=['motorway','trunk','primary'];
const minor=['secondary','tertiary','minor','street','street_limited','service','track'];
const match=(items)=>['match',['get','class'],items,true,false];
const widths=(start,end)=>['interpolate',['linear'],['zoom'],5,start,12,end];

// Vector overlays and the optional raster image are draped by MapLibre on the terrain.
export function addReferenceLayers(map,chinaOnly,lighting){
  map.addSource('satellite',{type:'raster',tiles:[imageryTemplate(chinaOnly)],tileSize:256,maxzoom:19});
  map.addLayer({id:'satellite',type:'raster',source:'satellite',paint:{'raster-fade-duration':150,'raster-saturation':0.08,'raster-contrast':0.03}},'admin-hit');
  map.addSource('satellite-shade',{type:'raster',tiles:[tileTemplate('shade',chinaOnly,lighting)],tileSize:256,maxzoom:12});
  map.addLayer({id:'satellite-shade',type:'raster',source:'satellite-shade',paint:{'raster-fade-duration':150,'raster-opacity':0,'raster-opacity-transition':{duration:0}}},'admin-hit');
  bindShadeReadiness(map);
  map.addSource('reference',{type:'vector',url:'https://tiles.openfreemap.org/planet',maxzoom:14});
  const before='admin-hit', common={type:'line',source:'reference','source-layer':'transportation',layout:{'line-join':'round','line-cap':'round'}};
  map.addLayer({id:'water-area',type:'fill',source:'reference','source-layer':'water',minzoom:5,paint:{'fill-color':'#609caf','fill-opacity':0.7}},before);
  map.addLayer({id:'waterway-line',type:'line',source:'reference','source-layer':'waterway',minzoom:5,paint:{'line-color':'#82bac7','line-width':widths(0.65,2),'line-opacity':0.85}},before);
  map.addLayer({...common,id:'road-major-casing',minzoom:5,filter:match(major),paint:{'line-color':'#30342c','line-width':widths(1.8,4.5),'line-opacity':0.85}},before);
  map.addLayer({...common,id:'road-major',minzoom:5,filter:match(major),paint:{'line-color':'#f5ca76','line-width':widths(0.75,2.5),'line-opacity':0.95}},before);
  map.addLayer({...common,id:'road-minor',minzoom:8,filter:match(minor),paint:{'line-color':'#f3e0b4','line-width':widths(0.45,1.8),'line-opacity':0.8}},before);
  map.addLayer({...common,id:'rail-line',minzoom:6,filter:match(['rail','transit']),paint:{'line-color':'#e3ac99','line-width':widths(0.8,2),'line-dasharray':[3,2],'line-opacity':0.9}},before);
  // Mask reference overlays outside the current example land boundary in China-only mode.
  map.addSource('outside-china',{type:'geojson',data:{type:'Feature',properties:{},geometry:outsideChina}});
  map.addLayer({id:'outside-china-mask',type:'fill',source:'outside-china',layout:{visibility:chinaOnly?'visible':'none'},paint:{'fill-color':'#071015','fill-opacity':1}},before);
}
export function setReferenceVisibility(map,group,visible){
  for(const id of referenceGroups[group]||[])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none');
}
