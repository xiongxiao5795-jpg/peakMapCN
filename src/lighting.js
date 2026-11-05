// The normal is derived from east/north elevation gradients. Azimuth is clockwise from north.
export function lightVector(azimuth, altitude) {
  const az=azimuth*Math.PI/180, alt=altitude*Math.PI/180, horizontal=Math.cos(alt);
  return [Math.sin(az)*horizontal, Math.cos(az)*horizontal, Math.sin(alt)];
}
export function lightFactor(eastSlope, northSlope, vector, strength) {
  if (!strength) return 1;
  const dot = Math.max(0, (-eastSlope*vector[0]-northSlope*vector[1]+vector[2])/Math.hypot(eastSlope,northSlope,1));
  const lit = Math.min(1.3, Math.max(0.25, 0.4+0.9*dot));
  return 1 + strength*(lit-1);
}
// Higher terrain receives more opaque atmospheric haze as altitude influence increases.
export function elevationHaze(height, intensity, altitudeInfluence) {
  const level=Math.max(0,Math.min(1,height/6000));
  const smooth=level*level*(3-2*level);
  const influence=Math.max(0,Math.min(1,altitudeInfluence));
  return Math.max(0,Math.min(1,intensity))*0.46*((1-influence)*0.55+influence*smooth);
}

// As the camera moves closer, fewer translucent bands remain visible.
export function beamStyleAtZoom(zoom) {
  const progress = Math.max(0, Math.min(1, (zoom - 3.3) / 7));
  return { count: Math.max(0, Math.ceil(7 * (1 - progress))), opacity: (1 - progress) ** 1.3 };
}
