import { adminAreas, intersectsChinaTile, processTerrainTile, processImageryTile } from './terrain-processing.js';
export { adminAreas, intersectsChinaTile };

// Processing DEM images off the UI thread keeps map gestures responsive.
function makeWorkerPool(workerCount=2) {
  if(typeof Worker==='undefined'||typeof OffscreenCanvas==='undefined')return null;
  const queue=[], workers=[];let nextId=0;
  function dispatch(){
    for(const slot of workers){
      if(slot.job)continue;
      const job=queue.shift();if(!job)break;
      if(job.signal.aborted){job.reject(new DOMException('Aborted','AbortError'));continue;}
      slot.job=job;slot.worker.postMessage({id:job.id,url:job.url,chinaOnly:job.chinaOnly,color:job.color,kind:job.kind});
    }
  }
  try {
    for(let i=0;i<workerCount;i++){
      const slot={worker:new Worker(new URL('./terrain-worker.js',import.meta.url),{type:'module'}),job:null};
      slot.worker.onmessage=event=>{
        const job=slot.job;slot.job=null;
        if(job){job.signal.removeEventListener('abort',job.abort);if(event.data.error){const error=new Error(event.data.error.message);error.name=event.data.error.name;job.reject(error)}else job.resolve({data:event.data.data,outside:event.data.outside})}
        dispatch();
      };
      slot.worker.onerror=event=>{if(slot.job){slot.job.reject(new Error(event.message));slot.job=null}dispatch()};
      workers.push(slot);
    }
  } catch {for(const slot of workers)slot.worker.terminate();return null}
  return (params,controller,chinaOnly,color,kind)=>new Promise((resolve,reject)=>{
    const signal=controller.signal,job={id:++nextId,url:params.url,chinaOnly,color,kind,signal,resolve,reject};
    job.abort=()=>{const index=queue.indexOf(job);if(index>=0){queue.splice(index,1);reject(new DOMException('Aborted','AbortError'))}else{const slot=workers.find(item=>item.job===job);slot?.worker.postMessage({id:job.id,cancel:true})}};
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return}
    signal.addEventListener('abort',job.abort,{once:true});
    // Keep the terrain mesh and imagery responsive before derived shading jobs.
    const priority=item=>item.kind==='terrain'&&!item.color?0:item.kind==='imagery'?1:2;
    const index=queue.findIndex(item=>priority(item)>priority(job));if(index<0)queue.push(job);else queue.splice(index,0,job);dispatch();
  });
}
export function registerTerrainProtocols(maplibre,{onImagerySuccess=()=>{},onImageryFailure=()=>{}}={}){
  const workerRequest=makeWorkerPool(),imageryRequest=makeWorkerPool(1);
  for(const [scheme,chinaOnly,color,kind] of [['dem-china',true,false,'terrain'],['dem-world',false,false,'terrain'],['relief-china',true,true,'terrain'],['relief-world',false,true,'terrain'],['shade-china',true,true,'shade'],['shade-world',false,true,'shade'],['imagery-china',true,false,'imagery'],['imagery-world',false,false,'imagery']]){
    maplibre.addProtocol(scheme,async(params,controller)=>{
      try{
        const pool=kind==='imagery'?imageryRequest:workerRequest;
        const result=pool?await pool(params,controller,chinaOnly,color,kind):kind==='imagery'?await processImageryTile(params,controller,chinaOnly):await processTerrainTile(params,controller,chinaOnly,kind==='shade'?'shade':color);
        if(kind==='imagery'&&!result.outside&&!controller.signal.aborted)onImagerySuccess();
        return {data:result.data};
      }catch(error){
        if(kind==='imagery'&&!controller.signal.aborted){
          onImageryFailure();const failure=new Error('卫星影像不可用',{cause:error});failure.name='ImageryUnavailableError';throw failure;
        }
        throw error;
      }
    });
  }
}
export const tileTemplate=(type,chinaOnly,lighting='')=>`${type}-${chinaOnly?'china':'world'}://tiles.mapterhorn.com/{z}/{x}/{y}.webp${lighting?'?'+lighting:''}`;
export const imageryTemplate=chinaOnly=>`imagery-${chinaOnly?'china':'world'}://imagery/{z}/{x}/{y}.jpg`;
