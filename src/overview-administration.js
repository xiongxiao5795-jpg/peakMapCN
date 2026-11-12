// The overview is physically smaller than the main viewport, so its zoom is
// normally several levels lower even when the main map shows a city closely.
export function overviewAdministrativeLevel(mainZoom,overviewZoom,selectedFeature){
  const code=String(selectedFeature?.properties?.adcode||'');
  const selectedCity=/^\d{6}$/.test(code)&&code.slice(2)!=='0000';
  if(overviewZoom>=7.1||mainZoom>=8.5||(selectedCity&&mainZoom>=6))return 'district';
  if(overviewZoom>=4.8||mainZoom>=5.3)return 'city';
  return 'province';
}
