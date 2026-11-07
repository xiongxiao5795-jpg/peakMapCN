const tiers=[0,1,10,20,30,40,50,60,70,80];

// The regular click still opens map settings; holding or dragging opens the
// compact selector, with pointer capture so a drag can end outside the button.
export function createHeightWheel(trigger,{current,select,beforeOpen=()=>{}}){
  const wheel=document.createElement('div');
  wheel.className='height-wheel';wheel.hidden=true;
  wheel.setAttribute('role','group');wheel.setAttribute('aria-label','选择地形高度倍率');
  wheel.innerHTML='<button type="button" class="height-wheel-center" aria-label="取消改变倍率">取消</button>'+tiers.map((tier,index)=>`<button type="button" class="height-wheel-item" data-tier="${tier}" style="--angle:${index*36}deg" aria-label="${tier===0?'平面':`${tier}倍`}">${tier}×</button>`).join('');
  trigger.parentElement.append(wheel);
  let timer,suppressTimer,pointer=null,start=null,dragged=false,opened=false,suppressClick=false,highlight=null;
  const highlightTier=value=>{highlight=value;wheel.querySelectorAll('[data-tier]').forEach(button=>button.classList.toggle('active',Number(button.dataset.tier)===value))};
  const close=()=>{wheel.hidden=true;highlight=null};
  const open=()=>{beforeOpen();opened=true;wheel.hidden=false;highlightTier(current())};
  const update=(x,y)=>{const rect=wheel.getBoundingClientRect(),dx=x-(rect.left+rect.width/2),dy=y-(rect.top+rect.height/2),distance=Math.hypot(dx,dy);if(distance<rect.width*.2){highlightTier(null);return}if(distance>rect.width*.65)return;const angle=(Math.atan2(dx,-dy)*180/Math.PI+360)%360;highlightTier(tiers[Math.round(angle/36)%tiers.length])};
  trigger.addEventListener('pointerdown',event=>{if(event.button!==0)return;clearTimeout(suppressTimer);suppressClick=false;pointer=event.pointerId;start=[event.clientX,event.clientY];dragged=false;opened=false;highlight=null;trigger.setPointerCapture(pointer);timer=setTimeout(open,400)});
  trigger.addEventListener('pointermove',event=>{if(event.pointerId!==pointer)return;const distance=Math.hypot(event.clientX-start[0],event.clientY-start[1]);if(distance>8){dragged=true;if(!opened){clearTimeout(timer);open()}update(event.clientX,event.clientY)}});
  trigger.addEventListener('pointerup',event=>{if(event.pointerId!==pointer)return;clearTimeout(timer);pointer=null;if(opened){suppressClick=true;suppressTimer=setTimeout(()=>suppressClick=false,800);if(dragged){if(highlight!==null)select(highlight);close()}}});
  trigger.addEventListener('pointercancel',()=>{clearTimeout(timer);pointer=null;if(opened)close()});
  trigger.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation()}},true);
  wheel.addEventListener('click',event=>{if(event.target.closest('.height-wheel-center')){close();return}const button=event.target.closest('[data-tier]');if(button){select(Number(button.dataset.tier));close()}});
  document.addEventListener('pointerdown',event=>{if(!wheel.hidden&&!wheel.contains(event.target)&&event.target!==trigger&&!trigger.contains(event.target))close()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!wheel.hidden){close();trigger.focus()}});
  return {close};
}
