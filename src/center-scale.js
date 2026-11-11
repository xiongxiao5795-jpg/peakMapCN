// A readable 1/2/5 distance no larger than the sampled ground distance.
export function niceScaleDistance(metres){
  if(!Number.isFinite(metres)||metres<=0)return null;
  const base=10**Math.floor(Math.log10(metres)),value=metres/base;
  return (value>=5?5:value>=2?2:1)*base;
}
export function setupCenterScale(map){
  const el=document.createElement('div');el.className='center-scale';el.setAttribute('aria-label','地图中心横线的水平比例尺');el.innerHTML='<span class="center-scale-label"></span><span class="center-scale-bar"></span>';map.getContainer().append(el);
  const label=el.querySelector('.center-scale-label'),bar=el.querySelector('.center-scale-bar');let timer=null;
  function update(){
    timer=null;const width=map.getContainer().clientWidth,height=map.getContainer().clientHeight,maxPx=Math.min(140,Math.floor(width/2)-8);
    if(maxPx<20||height<20){el.hidden=true;return}
    try{
      const x=width/2,y=height/2,origin=map.unproject([x,y]),distance=px=>origin.distanceTo(map.unproject([x+px,y]));
      const maxDistance=distance(maxPx),target=niceScaleDistance(maxDistance);if(!target){el.hidden=true;return}
      let lo=0,hi=maxPx;for(let i=0;i<10;i++){const mid=(lo+hi)/2;if(distance(mid)<target)lo=mid;else hi=mid}
      const pixels=(lo+hi)/2;if(!Number.isFinite(pixels)||pixels<1){el.hidden=true;return}
      bar.style.width=`${pixels}px`;label.textContent=target>=1000?`${Number((target/1000).toPrecision(3))} km`:`${Number(target.toPrecision(3))} m`;el.hidden=false;
    }catch{el.hidden=true}
  }
  function schedule(){if(timer===null)timer=setTimeout(update,100)}
  for(const event of ['move','moveend','resize','idle'])map.on(event,schedule);
  map.on('remove',()=>{clearTimeout(timer);el.remove()});schedule();return {update};
}
