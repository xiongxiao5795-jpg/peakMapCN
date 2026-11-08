const tiers=[0,1,10,20,30,40,50,60,70,80];

// A click opens settings; an upward swipe opens the compact selector. Pointer
// capture lets the swipe end on the wheel even outside the original button.
export function createHeightWheel(trigger,{current,select,beforeOpen=()=>{}}){
  const wheel=document.createElement('div');
  wheel.className='height-wheel';wheel.hidden=true;
  wheel.setAttribute('role','group');wheel.setAttribute('aria-label','选择地形高度倍率');
  wheel.innerHTML='<button type="button" class="height-wheel-center" aria-label="取消改变倍率">取消</button>'+tiers.map((tier,index)=>`<button type="button" class="height-wheel-item" data-tier="${tier}" style="--angle:${index*36}deg" aria-label="${tier===0?'平面':`${tier}倍`}">${tier}×</button>`).join('');
  trigger.parentElement.append(wheel);
  let suppressTimer,pointer=null,start=null,opened=false,suppressClick=false,highlight=null,hasCandidate=false;
  const highlightTier=value=>{highlight=value;wheel.querySelectorAll('[data-tier]').forEach(button=>button.classList.toggle('active',Number(button.dataset.tier)===value))};
  const close=()=>{wheel.hidden=true;highlight=null};
  const open=()=>{beforeOpen();opened=true;wheel.hidden=false;highlightTier(current())};
  const update=(x,y)=>{const rect=wheel.getBoundingClientRect();if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)return;const dx=x-(rect.left+rect.width/2),dy=y-(rect.top+rect.height/2),distance=Math.hypot(dx,dy);if(distance<rect.width*.2){hasCandidate=true;highlightTier(null);return}if(distance>rect.width*.5)return;hasCandidate=true;const angle=(Math.atan2(dx,-dy)*180/Math.PI+360)%360;highlightTier(tiers[Math.round(angle/36)%tiers.length])};
  trigger.addEventListener('pointerdown',event=>{if(event.button!==0)return;clearTimeout(suppressTimer);suppressClick=false;pointer=event.pointerId;start=[event.clientX,event.clientY];opened=false;hasCandidate=false;highlight=null;trigger.setPointerCapture(pointer)});
  trigger.addEventListener('pointermove',event=>{if(event.pointerId!==pointer)return;const dx=event.clientX-start[0],dy=event.clientY-start[1];if(!opened&&dy<-8&&Math.abs(dy)>Math.abs(dx))open();if(opened)update(event.clientX,event.clientY)});
  trigger.addEventListener('pointerup',event=>{if(event.pointerId!==pointer)return;pointer=null;if(opened){suppressClick=true;suppressTimer=setTimeout(()=>suppressClick=false,800);if(hasCandidate){if(highlight!==null)select(highlight);close()}}});
  trigger.addEventListener('pointercancel',()=>{pointer=null;if(opened)close()});
  trigger.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation()}},true);
  wheel.addEventListener('click',event=>{if(event.target.closest('.height-wheel-center')){close();return}const button=event.target.closest('[data-tier]');if(button){select(Number(button.dataset.tier));close()}});
  document.addEventListener('pointerdown',event=>{if(!wheel.hidden&&!wheel.contains(event.target)&&event.target!==trigger&&!trigger.contains(event.target))close()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!wheel.hidden){close();trigger.focus()}});
  return {close};
}
