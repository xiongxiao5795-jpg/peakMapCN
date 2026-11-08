// Delay a single tap briefly so a double tap issues only the city request.
export function bindLocationControl(button,locate){
  let tapTimer;
  button.addEventListener('click',event=>{
    if(event.detail===0){clearTimeout(tapTimer);tapTimer=null;locate('province');return}
    if(tapTimer){clearTimeout(tapTimer);tapTimer=null;locate('city');return}
    tapTimer=setTimeout(()=>{tapTimer=null;locate('province')},320);
  });
}
