// Suppress native touch callouts and stationary long-touch clicks without
// interfering with map drags, pinch gestures, or ordinary text entry.
export function disableLongPress(doc){
  let active=null,suppressed=null;
  doc.addEventListener('contextmenu',event=>event.preventDefault());
  doc.addEventListener('selectstart',event=>event.preventDefault());
  doc.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||!event.isPrimary)return;
    suppressed=null;active={id:event.pointerId,target:event.target,x:event.clientX,y:event.clientY,time:event.timeStamp,moved:false};
  },true);
  doc.addEventListener('pointermove',event=>{
    if(active?.id===event.pointerId&&Math.hypot(event.clientX-active.x,event.clientY-active.y)>10)active.moved=true;
  },true);
  doc.addEventListener('pointerup',event=>{
    if(active?.id!==event.pointerId)return;
    if(!active.moved&&event.timeStamp-active.time>=500)suppressed={target:active.target,until:event.timeStamp+1000};
    active=null;
  },true);
  doc.addEventListener('pointercancel',event=>{if(active?.id===event.pointerId)active=null},true);
  doc.addEventListener('click',event=>{
    if(!suppressed||event.detail===0)return;
    const target=suppressed.target,related=target===event.target||target?.contains?.(event.target)||event.target?.contains?.(target);
    if(related&&event.timeStamp<=suppressed.until){event.preventDefault();event.stopImmediatePropagation()}
    suppressed=null;
  },true);
}
