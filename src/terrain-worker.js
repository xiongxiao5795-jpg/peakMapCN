import { processTerrainTile, processImageryTile } from './terrain-processing.js';
const controllers=new Map();
self.onmessage=async event=>{
  const message=event.data;
  if(message.cancel){controllers.get(message.id)?.abort();return;}
  const controller=new AbortController();controllers.set(message.id,controller);
  try {
    const result=message.kind==='imagery'?await processImageryTile({url:message.url},controller,message.chinaOnly):await processTerrainTile({url:message.url},controller,message.chinaOnly,message.kind==='shade'?'shade':message.color);
    self.postMessage({id:message.id,data:result.data,outside:result.outside},[result.data]);
  } catch(error) {
    self.postMessage({id:message.id,error:{name:error.name,message:error.message}});
  } finally {controllers.delete(message.id)}
};
