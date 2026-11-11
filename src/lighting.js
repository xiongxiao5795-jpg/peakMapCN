// Solar azimuth is clockwise from north; vectors use east/north/up components.
export function lightVector(azimuth, altitude) {
  const az=azimuth*Math.PI/180, alt=altitude*Math.PI/180, horizontal=Math.cos(alt);
  return [Math.sin(az)*horizontal, Math.cos(az)*horizontal, Math.sin(alt)];
}
export function lightFactor(eastSlope, northSlope, vector, strength) {
  if (!strength) return 1;
  const dot=Math.max(0,(-eastSlope*vector[0]-northSlope*vector[1]+vector[2])/Math.hypot(eastSlope,northSlope,1));
  return 1+strength*(Math.min(1.3,Math.max(0.3,0.45+0.9*dot))-1);
}
// Soft dawn/dusk transition based on the local solar elevation.
export function solarBrightness(sunUp) {
  const t=Math.max(0,Math.min(1,(sunUp+0.10)/0.22));
  return t*t*(3-2*t);
}
// Opacity of a black overlay on imagery; strength zero leaves imagery unchanged.
export function imageryShadowOpacity(day, slopeLight, strength) {
  // Night retains ambient light so the underlying landscape stays legible.
  const illumination=0.4*(1-day)+day*slopeLight;
  return Math.max(0,Math.min(0.88,(1-Math.min(1,illumination))*strength));
}

// A terrain-normal lighting model for visual shading. The supplied gradients
// are measured on the original DEM; exaggeration affects only the display.
export function terrainLightIntensity(eastSlope,northSlope,vector,exaggeration,day,shadow){
  const scale=Math.max(0,Math.min(80,Number(exaggeration)||0));
  const nx=-eastSlope*scale,ny=-northSlope*scale,nz=1,norm=Math.hypot(nx,ny,nz);
  const lx=vector[0],ly=vector[1],lz=vector[2],diffuse=Math.max(0,(nx*lx+ny*ly+nz*lz)/norm);
  const hx=lx,hy=ly,hz=lz+1,halfNorm=Math.hypot(hx,hy,hz)||1;
  const specular=0.13*Math.pow(Math.max(0,(nx*hx+ny*hy+nz*hz)/(norm*halfNorm)),24);
  const daylight=(0.48+0.64*diffuse+specular)*(1-0.55*Math.max(0,Math.min(1,shadow)));
  return Math.max(0,Math.min(1.3,0.4*(1-day)+day*daylight));
}

// Return an alpha-composited black or white layer for the calculated light.
export function terrainShade(intensity,strength){
  const value=1+Math.max(0,Math.min(1,strength))*(intensity-1);
  const bright=value>1;
  return {color:bright?255:0,alpha:Math.round(Math.min(0.88,Math.abs(value-1))*255)};
}
