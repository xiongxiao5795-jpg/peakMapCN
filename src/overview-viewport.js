const MAX_LAT=85.05112878;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const mercatorY=lat=>(1-Math.asinh(Math.tan(clamp(lat,-MAX_LAT,MAX_LAT)*Math.PI/180))/Math.PI)/2;
const latitude=y=>Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI;

// Fit the complete main-map footprint into the small, north-up overview.
// Zoom levels alone are insufficient because the two viewports have different
// sizes and the main map may be tilted. A small screen-space margin makes the
// overview wider when adapting to the main view. Manual interactions on the
// overview are independent until the main view moves again.
export function fitOverviewViewport(bounds,{width,height,center,zoom,extraZoom=0.7,padding=8}={}){
  let [west,south,east,north]=bounds;
  if(east<west)east+=360;
  if(east-west>360){const mid=(west+east)/2;west=mid-180;east=mid+180}
  const x0=(west+180)/360,x1=(east+180)/360,y0=mercatorY(north),y1=mercatorY(south);
  const pad=Math.max(0,Math.min(padding,(width-1)/4,(height-1)/4));
  const dx=Math.max(1e-9,x1-x0),dy=Math.max(1e-9,y1-y0);
  const fit=Math.log2(Math.min((width-2*pad)/(512*dx),(height-2*pad)/(512*dy)));
  const limit=Math.max(-2,Math.min(10,fit-0.02));
  const desired=Number.isFinite(zoom)?zoom:fit-extraZoom;
  const level=clamp(Math.min(desired,limit),-2,10),world=512*2**level;
  const halfX=Math.max(0,(width/2-pad)/world),halfY=Math.max(0,(height/2-pad)/world);
  const midpointX=(x0+x1)/2,midpointY=(y0+y1)/2;
  let preferredX=center?(center[0]+180)/360:midpointX,preferredY=center?mercatorY(center[1]):midpointY;
  preferredX+=Math.round(midpointX-preferredX);
  const minX=x1-halfX,maxX=x0+halfX,minY=y1-halfY,maxY=y0+halfY;
  const cx=minX<=maxX?clamp(preferredX,minX,maxX):midpointX;
  const cy=minY<=maxY?clamp(preferredY,minY,maxY):midpointY;
  return {center:[cx*360-180,latitude(cy)],zoom:level,fitZoom:fit,maxZoom:limit};
}

// National and selected-area bounds set the automatic view, while only the
// main view limits manual zoom.
export function fitOverviewWithFocus(mainBounds,focusBounds,options,manualZoomOffset=null){
  const main=fitOverviewViewport(mainBounds,options);
  const automatic=fitOverviewViewport(focusBounds,options);
  return fitOverviewViewport(mainBounds,{...options,center:manualZoomOffset===null?automatic.center:options.center,zoom:manualZoomOffset===null?automatic.zoom:main.fitZoom+manualZoomOffset});
}
