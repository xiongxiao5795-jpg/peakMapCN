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
