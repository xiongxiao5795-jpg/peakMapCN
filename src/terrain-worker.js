import { processTerrainTile, processImageryTile } from './terrain-processing.js';
const controllers=new Map();
let activeRegion=null;
self.onmessage=async event=>{
  const message=event.data;
  if(message.cancel){controllers.get(message.id)?.abort();return;}
  if(message.regionChanged)activeRegion=message.region;
  const region=activeRegion;
  const controller=new AbortController();controllers.set(message.id,controller);
  try {
    const result=message.kind==='imagery'?await processImageryTile({url:message.url},controller,message.chinaOnly,region):await processTerrainTile({url:message.url},controller,message.chinaOnly,message.kind==='shade'?'shade':message.color,region);
    self.postMessage({id:message.id,data:result.data,outside:result.outside},[result.data]);
  } catch(error) {
    self.postMessage({id:message.id,error:{name:error.name,message:error.message}});
  } finally {controllers.delete(message.id)}
};
