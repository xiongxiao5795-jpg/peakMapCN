// Delay a single tap briefly so a double tap issues only the city request.
export function bindLocationControl(button,locate){
  let holdTimer,tapTimer,pointer=null,start,held=false,suppressClick=false;
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;
    pointer=event.pointerId;start=[event.clientX,event.clientY];held=false;suppressClick=false;
    holdTimer=setTimeout(()=>{held=true;suppressClick=true;clearTimeout(tapTimer);tapTimer=null;locate('district')},500);
  });
  button.addEventListener('pointermove',event=>{if(event.pointerId===pointer&&Math.hypot(event.clientX-start[0],event.clientY-start[1])>10)clearTimeout(holdTimer)});
  const end=()=>{clearTimeout(holdTimer);pointer=null};
  button.addEventListener('pointerup',end);button.addEventListener('pointercancel',()=>{end();held=false;suppressClick=false});
  button.addEventListener('contextmenu',event=>event.preventDefault());
  button.addEventListener('click',event=>{
    if(suppressClick||held){suppressClick=false;held=false;event.preventDefault();return}
    if(event.detail===0){clearTimeout(tapTimer);tapTimer=null;locate('province');return}
    if(tapTimer){clearTimeout(tapTimer);tapTimer=null;locate('city');return}
    tapTimer=setTimeout(()=>{tapTimer=null;locate('province')},320);
  });
}
