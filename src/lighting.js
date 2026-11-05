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
export function imageryShadowOpacity(day, slopeLight, shadowed, strength) {
  // Night retains ambient light so the underlying landscape stays legible.
  const coverage=Math.max(0,Math.min(1,Number(shadowed)));
  const illumination=0.4*(1-day)+day*slopeLight*(1-coverage*0.52);
  return Math.max(0,Math.min(0.88,(1-Math.min(1,illumination))*strength));
}
// Feather the coarse occlusion mask to avoid hard square shadows.
export function softenShadowMask(mask,width,height){
  const result=new Float32Array(mask.length),weights=[1,2,1];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let value=0;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const yy=Math.max(0,Math.min(height-1,y+dy)),xx=Math.max(0,Math.min(width-1,x+dx));
      value+=mask[yy*width+xx]*weights[dy+1]*weights[dx+1];
    }
    result[y*width+x]=value/16;
  }
  return result;
}
// A short, tile-local horizon test. It does not claim to be a global shadow simulation.
export function castShadowAt(heights,size,x,y,vector,metersPerPixel) {
  const horizontal=Math.hypot(vector[0],vector[1]);
  if(vector[2]<=0||horizontal<1e-5)return false;
  const rise=vector[2]/horizontal*metersPerPixel,dx=vector[0]/horizontal,dy=-vector[1]/horizontal,origin=heights[y*size+x];
  for(const distance of [2,4,8,12,16,24,32,48,64]){
    const sx=Math.round(x+dx*distance),sy=Math.round(y+dy*distance);
    if(sx<0||sy<0||sx>=size||sy>=size)break;
    if(heights[sy*size+sx]>origin+distance*rise+5)return true;
  }
  return false;
}
