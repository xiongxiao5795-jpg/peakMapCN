import { loadAdministrativeGeometry, geometryBounds, boundsOverlap } from './admin.js';
import { loadLocalAdministrativeBoundaries, loadLocalDistrictBoundaries } from './admin-boundaries.js';

// Only load visible parent divisions; cache responses and never alter the camera or terrain source.
export function createAdministrativeLayers(map,provinces,entries,onRecordsChanged){
  const entryByCode=new Map(entries.map(p=>[p.adcode,p])),featuresByCode=new Map();
  const cityGroups=new Map(),districtGroups=new Map(),boundsCache=new WeakMap();
  let revision=0,timer,citySignature='',districtSignature='';
  const boundsOf=feature=>{if(!boundsCache.has(feature))boundsCache.set(feature,geometryBounds(feature));return boundsCache.get(feature)};
  const viewport=()=>{const b=map.getBounds();return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]};
  function remember(feature){
    const code=String(feature.properties.adcode),record=entryByCode.get(code);
    featuresByCode.set(code,feature);
    if(record){const p=feature.properties;record.coordinates=p.center||p.centroid;}
  }
  async function loadOne(record){
    if(featuresByCode.has(record.adcode))return featuresByCode.get(record.adcode);
    // Use bundled boundaries before trying the online service.
    const local=await loadLocalAdministrativeBoundaries().catch(()=>null);
    let feature=local?.byCode.get(record.adcode);
    if(!feature&&record.category==='district'){
      const districts=await loadLocalDistrictBoundaries(record.adcode).catch(()=>null);
      feature=districts?.byCode.get(record.adcode);
    }
    if(!feature){
      try{const features=await loadAdministrativeGeometry(record.adcode);feature=features.find(f=>String(f.properties.adcode)===record.adcode)}
      catch(error){
        if(record.category!=='district')throw error;
        const parent=record.adcode.slice(0,4)+'00';
        const siblings=await loadAdministrativeGeometry(parent,true);feature=siblings.find(f=>String(f.properties.adcode)===record.adcode);
      }
    }
    if(!feature)throw new Error('没有可用边界');remember(feature);return feature;
  }
  async function loadGroup(cache,code){
    if(cache.has(code))return cache.get(code);
    const local=cache===cityGroups?await loadLocalAdministrativeBoundaries().catch(()=>null):await loadLocalDistrictBoundaries(code).catch(()=>null);
    // A locally indexed province may legitimately have no counties for a city.
    const features=local?(local.byParent.get(code)||(cache===districtGroups?[]:null)):null;
    const resolved=features??await loadAdministrativeGeometry(code,true);for(const feature of resolved)remember(feature);
    cache.set(code,resolved);return resolved;
  }
  function selectVisible(features,area,max){
    const center=map.getCenter();return features.filter(f=>boundsOverlap(boundsOf(f),area)).sort((a,b)=>{
      const aa=boundsOf(a),bb=boundsOf(b),da=Math.hypot((aa[0]+aa[2])/2-center.lng,(aa[1]+aa[3])/2-center.lat),db=Math.hypot((bb[0]+bb[2])/2-center.lng,(bb[1]+bb[3])/2-center.lat);return da-db;
    }).slice(0,max);
  }
  function apply(sourceId,features,signature,level){
    if(level==='city'&&signature===citySignature||level==='district'&&signature===districtSignature)return;
    if(level==='city')citySignature=signature;else districtSignature=signature;
    map.getSource(sourceId)?.setData({type:'FeatureCollection',features});onRecordsChanged();
  }
  async function refresh(){
    const current=++revision,zoom=map.getZoom(),area=viewport();
    if(zoom<6){apply('admin-cities',[],'','city');apply('admin-districts',[],'','district');return}
    const parents=selectVisible(provinces.features,area,8);
    const groups=await Promise.allSettled(parents.map(f=>loadGroup(cityGroups,String(f.properties.adcode))));
    if(current!==revision)return;
    const all=groups.flatMap(x=>x.status==='fulfilled'?x.value:[]);
    const cityFeatures=all.filter(f=>entryByCode.get(String(f.properties.adcode))?.category==='admin_city');
    const directDistricts=all.filter(f=>entryByCode.get(String(f.properties.adcode))?.category==='district');
    const loadedParents=parents.filter((_,i)=>groups[i].status==='fulfilled').map(f=>f.properties.adcode).join(',');
    apply('admin-cities',cityFeatures,loadedParents,'city');
    if(zoom<8.5){apply('admin-districts',[],'','district');return}
    const cityParents=selectVisible(cityFeatures,area,12);
    const [childGroups,provinceGroups]=await Promise.all([
      Promise.allSettled(cityParents.map(f=>loadGroup(districtGroups,String(f.properties.adcode)))),
      Promise.all(parents.map(async f=>{
        const code=String(f.properties.adcode),districts=await loadLocalDistrictBoundaries(code).catch(()=>null);
        return districts?.byParent.get(code)||[];
      }))
    ]);
    if(current!==revision)return;
    const allDistricts=[...directDistricts,...provinceGroups.flat(),...childGroups.flatMap(x=>x.status==='fulfilled'?x.value:[])];
    const districtFeatures=[...new Map(allDistricts.map(f=>[String(f.properties.adcode),f])).values()];
    for(const feature of districtFeatures)remember(feature);
    const loadedCities=cityParents.filter((_,i)=>childGroups[i].status==='fulfilled').map(f=>f.properties.adcode).join(',');
    apply('admin-districts',districtFeatures,loadedParents+'|'+loadedCities,'district');
  }
  function schedule(){revision++;clearTimeout(timer);timer=setTimeout(()=>void refresh(),200)}
  return {schedule,loadOne,recordForFeature:feature=>entryByCode.get(String(feature.properties.adcode))};
}
