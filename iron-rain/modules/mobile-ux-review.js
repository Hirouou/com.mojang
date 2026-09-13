const STYLE_ID='iron-rain-mobile-ux-review';

function ensureStyles(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
@media (pointer:coarse),(hover:none),(max-width:900px){
  button,input,select{box-sizing:border-box;max-width:100%}button{min-width:0;white-space:normal;line-height:1.05}
  .crew-lobby-card{width:min(94vw,680px)!important;max-width:94vw!important}.crew-lobby-room,.crew-lobby-actions{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}.crew-lobby button{min-width:0!important;padding-inline:clamp(6px,1.8vw,12px)!important;overflow:hidden;text-overflow:ellipsis}.crew-lobby-members{grid-template-columns:repeat(3,minmax(0,1fr))!important}.crew-lobby-members div{min-width:0!important}
  .crew-spawn{margin:6px 0!important;padding:6px!important}.crew-spawn-list button{min-width:clamp(96px,24vw,126px)!important;min-height:clamp(32px,8dvh,44px)!important;padding:4px 6px!important}.crew-spawn-head b{font-size:clamp(7px,1.7vw,9px)!important}.crew-spawn-head small{font-size:clamp(5px,1.2vw,7px)!important}
  .inside.station-engaged .fire-deck[data-station="aim"]{width:clamp(82px,19vw,104px)!important;max-width:clamp(82px,19vw,104px)!important}.inside.station-engaged .fire-deck[data-station="aim"] #fireBtn{font-size:clamp(7px,1.7vw,9px)!important;min-height:clamp(34px,8dvh,42px)!important}.inside.station-engaged .fire-deck[data-station="aim"] .charge-box button{font-size:clamp(14px,3.4vw,18px)!important;min-height:clamp(26px,7dvh,32px)!important}
}
@media (pointer:coarse) and (orientation:landscape),(max-height:520px) and (orientation:landscape){
  .crew-lobby{padding:max(4px,env(safe-area-inset-top)) max(8px,env(safe-area-inset-right)) max(4px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left))!important}.crew-lobby-card{width:min(92vw,720px)!important;max-width:92vw!important;max-height:calc(100dvh - 8px)!important;padding:clamp(6px,1.1vw,10px)!important}.crew-lobby-card h2{font-size:clamp(14px,3vw,18px)!important;margin:2px 0 4px!important}.crew-lobby-card p{font-size:clamp(6px,1.45vw,8px)!important;margin-bottom:5px!important}.crew-factions button{min-height:clamp(34px,8dvh,42px)!important;padding:4px 8px!important}.crew-factions button b{font-size:clamp(8px,2vw,11px)!important}.crew-factions button small{font-size:clamp(5px,1.15vw,6px)!important}.crew-lobby-room input{height:clamp(27px,7dvh,32px)!important;font-size:clamp(10px,2.4vw,13px)!important;padding:3px 7px!important}.crew-lobby button{min-height:clamp(28px,7dvh,34px)!important;font-size:clamp(6.5px,1.65vw,8px)!important}.crew-lobby-members{margin:4px 0!important}.crew-lobby-members div{min-height:clamp(24px,6dvh,30px)!important;padding:3px 5px!important}.crew-lobby-status{min-height:0!important;padding:4px 6px!important;font-size:clamp(6px,1.5vw,7px)!important}.crew-lobby-actions{margin-top:4px!important}
}
`;
  document.head.appendChild(style);
}

function installMapGestures(root){
  if(root?.dataset.canonicalNavigation==='1')return Object.freeze({center:()=>globalThis.ironRainStrategicMap?.open?.()});
  const map=root?.querySelector('.strategic-war-map'),canvas=map?.querySelector('canvas');
  if(!map||!canvas||map.dataset.irMobileGestures==='1')return null;
  map.dataset.irMobileGestures='1';
  const controls=document.createElement('div');controls.className='ir-map-controls';controls.innerHTML='<button type="button" data-zoom-out aria-label="Diminuir zoom">−</button><button type="button" data-center aria-label="Centralizar mapa">◎</button><button type="button" data-zoom-in aria-label="Aumentar zoom">+</button>';
  const hint=document.createElement('div');hint.className='ir-map-hint';hint.textContent='ARRASTE · PINÇA/± PARA ZOOM · TOQUE PARA SELECIONAR';
  root.append(controls,hint);

  let zoom=1,baseW=0,baseH=0;const pointers=new Map();let drag=null,pinch=null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function rememberBase(){if(zoom===1||!baseW){baseW=Math.max(1,map.clientWidth);baseH=Math.max(1,map.clientHeight);}}
  function applyZoom(next,anchorX=.5,anchorY=.5){
    rememberBase();const old=zoom;zoom=clamp(next,1,2.8);if(Math.abs(old-zoom)<.001)return;
    const beforeX=map.scrollLeft+map.clientWidth*anchorX,beforeY=map.scrollTop+map.clientHeight*anchorY;
    canvas.style.width=`${Math.round(baseW*zoom)}px`;canvas.style.height=`${Math.round(baseH*zoom)}px`;
    dispatchEvent(new Event('resize'));
    requestAnimationFrame(()=>{const ratio=zoom/old;map.scrollLeft=beforeX*ratio-map.clientWidth*anchorX;map.scrollTop=beforeY*ratio-map.clientHeight*anchorY;});
  }
  function center(){applyZoom(1);canvas.style.width='100%';canvas.style.height='100%';map.scrollLeft=0;map.scrollTop=0;zoom=1;requestAnimationFrame(()=>dispatchEvent(new Event('resize')));}
  controls.querySelector('[data-zoom-in]').onclick=()=>applyZoom(zoom+.35);
  controls.querySelector('[data-zoom-out]').onclick=()=>applyZoom(zoom-.35);
  controls.querySelector('[data-center]').onclick=center;

  map.addEventListener('pointerdown',e=>{
    if(e.target.closest?.('.ir-map-controls'))return;
    if(e.__irSynthetic)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:map.scrollLeft,sy:map.scrollTop,moved:false};}
    else if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};drag=null;}
    try{map.setPointerCapture(e.pointerId);}catch{}
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  map.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;const p=pointers.get(e.pointerId);p.x=e.clientX;p.y=e.clientY;
    if(pointers.size===2&&pinch){const [a,b]=[...pointers.values()],dist=Math.max(24,Math.hypot(a.x-b.x,a.y-b.y));applyZoom(pinch.zoom*(dist/pinch.distance),.5,.5);return;}
    if(drag&&drag.id===e.pointerId){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.moved=true;map.scrollLeft=drag.sx-dx;map.scrollTop=drag.sy-dy;}
    e.preventDefault();e.stopImmediatePropagation();
  },true);
  function finish(e){
    if(!pointers.has(e.pointerId))return;const wasTap=drag&&drag.id===e.pointerId&&!drag.moved&&pointers.size===1;const tapX=e.clientX,tapY=e.clientY;
    pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!pointers.size)drag=null;
    try{map.releasePointerCapture(e.pointerId);}catch{}
    e.preventDefault();e.stopImmediatePropagation();
    if(wasTap){const synthetic=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:tapX,clientY:tapY,pointerId:99991,pointerType:'mouse',button:0});Object.defineProperty(synthetic,'__irSynthetic',{value:true});canvas.dispatchEvent(synthetic);}
  }
  map.addEventListener('pointerup',finish,true);map.addEventListener('pointercancel',finish,true);
  addEventListener('orientationchange',()=>setTimeout(center,160));
  return Object.freeze({center,zoomIn:()=>applyZoom(zoom+.35),zoomOut:()=>applyZoom(zoom-.35)});
}

export function installMobileUXReview(root=document){ensureStyles();const strategic=root.querySelector?.('.strategic-war');return strategic?installMapGestures(strategic):null;}

ensureStyles();
