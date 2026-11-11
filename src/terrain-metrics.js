// Derivatives are heights in metres per horizontal metre; downhill aspect is
// clockwise from north. A nearly flat surface has no meaningful aspect.
export function terrainMetrics(eastGradient,northGradient){
  if(!Number.isFinite(eastGradient)||!Number.isFinite(northGradient))return null;
  const slope=Math.atan(Math.hypot(eastGradient,northGradient))*180/Math.PI;
  const aspect=(Math.atan2(-eastGradient,-northGradient)*180/Math.PI+360)%360;
  return {slope,aspect:slope<2?null:aspect};
}
