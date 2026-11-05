import * as SunCalc from 'suncalc';

// Interpret the chosen wall-clock time as Beijing time, regardless of the device timezone.
function parseBeijingTime(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function sunlightAt(value, latitude, longitude) {
  const date = parseBeijingTime(value);
  return date ? SunCalc.getPosition(date, latitude, longitude) : null;
}
export function celestialPositionsAt(value, latitude, longitude) {
  const date = parseBeijingTime(value);
  if (!date) return null;
  const sun = SunCalc.getPosition(date, latitude, longitude);
  const moon = SunCalc.getMoonPosition(date, latitude, longitude);
  return {sun: {...sun, visible: sun.altitude > 0}, moon: {...moon, visible: moon.altitude > 0, fraction: SunCalc.getMoonIllumination(date).fraction}};
}
export function celestialLightAt(value, latitude, longitude) {
  const positions = celestialPositionsAt(value, latitude, longitude);
  if (!positions) return null;
  return positions.sun.visible ? {body: 'sun', ...positions.sun} : {body: 'moon', ...positions.moon};
}
// A 360° sky strip: the center is the map's forward bearing; the horizon is the bottom.
export function skyPosition(azimuth, altitude, bearing) {
  const relative = ((azimuth - bearing + 540) % 360) - 180;
  return {x: (relative + 180) / 360 * 100, y: 100 - Math.max(0, Math.min(90, altitude)) / 90 * 100};
}
export function beijingTimeNow(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0,16);
}
