import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { geometryBounds } from './admin.js';

const MAX_MERCATOR_LATITUDE=85.05112878;
const decimal='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const pairPattern=new RegExp(`^(${decimal})\\s*(?:[,;]\\s*|\\s+)(${decimal})$`);
const labeledPattern=new RegExp(`^(经度|纬度)\\s*[:=]?\\s*(${decimal})\\s*[,;\\s]*\\s*(经度|纬度)\\s*[:=]?\\s*(${decimal})$`);
const directionalPattern=new RegExp(`(?:([NSEW])\\s*(${decimal})|(${decimal})\\s*°?\\s*([NSEW]))`,'gi');

// Unlabelled pairs use longitude,latitude. Latitude first is accepted when
// the second number cannot be a latitude. Labels or N/S/E/W remove ambiguity.
export function parseCoordinates(input){
  const text=String(input).normalize('NFKC').trim().replace(/−/g,'-');
  if(!text)return {kind:'none'};
  let longitude,latitude,recognized=false;
  const labeled=text.match(labeledPattern);
  if(labeled){
    recognized=true;
    if(labeled[1]===labeled[3])return {kind:'invalid',message:'请分别输入经度和纬度'};
    const vals={[labeled[1]]:Number(labeled[2]),[labeled[3]]:Number(labeled[4])};longitude=vals['经度'];latitude=vals['纬度'];
  }else{
    const matches=[...text.matchAll(directionalPattern)];
    if(matches.length===2&&text.replace(directionalPattern,'').replace(/[\s,;°]/g,'')===''){
      recognized=true;const values={};
      for(const match of matches){const dir=(match[1]||match[4]).toUpperCase(),num=Number(match[2]||match[3]),axis='EW'.includes(dir)?'lon':'lat';if(axis in values||num<0)return {kind:'invalid',message:'请检查经纬度方向'};values[axis]=('SW'.includes(dir)?-1:1)*num}
      longitude=values.lon;latitude=values.lat;
    }else{
      const pair=text.match(pairPattern);
      if(pair){recognized=true;const a=Number(pair[1]),b=Number(pair[2]);if(Math.abs(a)<=90&&Math.abs(b)>90){latitude=a;longitude=b}else{longitude=a;latitude=b}}
    }
  }
  if(!recognized)return {kind:'none'};
  if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>90)return {kind:'invalid',message:'经度需在 ±180°、纬度需在 ±90° 范围内'};
  if(Math.abs(latitude)>MAX_MERCATOR_LATITUDE)return {kind:'invalid',message:'纬度超出当前地图可显示的范围（约 ±85.05°）'};
  return {kind:'coordinate',coordinates:[longitude,latitude]};
}

// Local province polygons avoid sending a device position to a geocoding service.
export function createProvinceLookup(features){
  const candidates=features.filter(f=>f.properties?.name&&f.geometry&&['Polygon','MultiPolygon'].includes(f.geometry.type)).map(feature=>{
    const bounds=geometryBounds(feature),area=(bounds[2]-bounds[0])*(bounds[3]-bounds[1]);return {feature,bounds,area};
  }).sort((a,b)=>a.area-b.area);
  return (longitude,latitude)=>{
    if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>90)return null;
    for(const {feature,bounds:[w,s,e,n]} of candidates){if(longitude>=w&&longitude<=e&&latitude>=s&&latitude<=n&&booleanPointInPolygon([longitude,latitude],feature))return feature}
    return null;
  };
}
