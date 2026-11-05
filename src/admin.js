// The index is local and searchable without loading every administrative geometry.
export function buildAdministrativeEntries(index,cityCenters={}){
  const provinces=new Map(index.provinces.map(p=>[p.code,p.name]));
  const cities=new Map(index.cities.map(c=>[c.code,c]));
  const generic=new Set(['市辖区','县','省直辖县级行政区划','自治区直辖县级行政区划']);
  const result=[];
  for(const city of index.cities){
    if(generic.has(city.name))continue;
    const code=city.code+'00',province=provinces.get(city.provinceCode)||'';
    result.push({id:`city-${code}`,name:city.name,category:'admin_city',adcode:code,context:province,fullName:province+city.name,coordinates:cityCenters[code],zoom:5.3,importance:90,description:`${province} · ${city.name}（示例行政区数据）`});
  }
  for(const area of index.areas){
    const city=cities.get(area.cityCode),province=provinces.get(area.provinceCode)||'';
    const parent=city&&!generic.has(city.name)?city.name:province;
    result.push({id:`district-${area.code}`,name:area.name,category:'district',adcode:area.code,context:parent,fullName:province+(parent===province?'':parent)+area.name,zoom:8.5,importance:59,description:`${parent} · ${area.name}（示例行政区数据）`});
  }
  return result;
}
export function searchAdministrative(entries,query){
  const q=query.trim().toLowerCase();
  return q?entries.filter(p=>p.name.toLowerCase().includes(q)||p.fullName.toLowerCase().includes(q)||(p.context+p.name).toLowerCase().includes(q)):[];
}
const responses=new Map();
export async function loadAdministrativeGeometry(code,children=false){
  if(!/^\d{6}$/.test(String(code)))throw new Error('无效的行政区代码');
  const key=`${code}${children?'_full':''}`;
  if(!responses.has(key)){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const promise=fetch(`https://geo.datav.aliyun.com/areas_v3/bound/${key}.json`,{signal:controller.signal})
      .then(response=>{if(!response.ok)throw new Error(`边界数据不可用 (${response.status})`);return response.json()})
      .then(data=>{if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('边界数据格式错误');return data.features.filter(f=>f.geometry&&['Polygon','MultiPolygon'].includes(f.geometry.type)&&f.properties?.adcode)})
      .finally(()=>clearTimeout(timer));
    responses.set(key,promise);promise.catch(()=>responses.delete(key));
  }
  return responses.get(key);
}
export function geometryBounds(feature){
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  function visit(node){if(typeof node[0]==='number'){bounds[0]=Math.min(bounds[0],node[0]);bounds[1]=Math.min(bounds[1],node[1]);bounds[2]=Math.max(bounds[2],node[0]);bounds[3]=Math.max(bounds[3],node[1]);}else for(const part of node)visit(part)}
  visit(feature.geometry.coordinates);return bounds;
}
export function boundsOverlap(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1]}
