// Loaded on demand so the initial page does not parse all administrative geometry.
let localData;
const districtFiles=import.meta.glob('../data/admin-districts/*.json');
const districtData=new Map();
function indexFeatures(collection){
  const byCode=new Map(),byParent=new Map();
  for(const feature of collection.features){
    const code=String(feature.properties.adcode),parent=String(feature.properties.parent.adcode);
    byCode.set(code,feature);
    if(!byParent.has(parent))byParent.set(parent,[]);
    byParent.get(parent).push(feature);
  }
  return {byCode,byParent};
}
export function loadLocalAdministrativeBoundaries(){
  if(!localData){
    localData=import('../data/admin-city-boundaries.json').then(({default:collection})=>indexFeatures(collection))
      .catch(error=>{localData=undefined;throw error});
  }
  return localData;
}

// District boundaries are split by province and loaded only when needed.
export function loadLocalDistrictBoundaries(code){
  const province=String(code).slice(0,2),load=districtFiles[`../data/admin-districts/${province}.json`];
  if(!load)return Promise.resolve(null);
  if(!districtData.has(province)){
    const promise=load().then(({default:collection})=>indexFeatures(collection))
      .catch(error=>{districtData.delete(province);throw error});
    districtData.set(province,promise);
  }
  return districtData.get(province);
}
