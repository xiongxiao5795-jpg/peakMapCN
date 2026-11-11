// Drag only the heading area so buttons and scrolling keep their normal action.
export function makeFloatingPanel(panel,container){
  let drag=null;
  panel.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('button,a,input,select')||!event.target.closest('h3,.detail-tag'))return;
    const r=panel.getBoundingClientRect(),parent=container.getBoundingClientRect();drag={id:event.pointerId,dx:event.clientX-r.left,dy:event.clientY-r.top,parent};panel.setPointerCapture(event.pointerId);event.preventDefault();
  });
  panel.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;const w=panel.offsetWidth,h=panel.offsetHeight;
    const x=Math.max(0,Math.min(drag.parent.width-w,event.clientX-drag.parent.left-drag.dx)),y=Math.max(0,Math.min(drag.parent.height-h,event.clientY-drag.parent.top-drag.dy));
    panel.style.left=`${x}px`;panel.style.top=`${y}px`;panel.style.right='auto';panel.style.bottom='auto';
  });
  const stop=event=>{if(drag?.id===event.pointerId)drag=null};panel.addEventListener('pointerup',stop);panel.addEventListener('pointercancel',stop);
  window.addEventListener('resize',()=>{
    if(!panel.style.left||panel.hidden)return;
    panel.style.left=`${Math.max(0,Math.min(container.clientWidth-panel.offsetWidth,parseFloat(panel.style.left)||0))}px`;
    panel.style.top=`${Math.max(0,Math.min(container.clientHeight-panel.offsetHeight,parseFloat(panel.style.top)||0))}px`;
  });
}
