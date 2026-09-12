/**
 * Mobile/touch aiming layout.
 *
 * The physical 3D azimuth/elevation handwheels are the primary controls when
 * the operator occupies the aiming station. The legacy DOM handwheels remain
 * available on desktop, but on touch they must not cover the machine itself.
 */
export function installTouchAimLayout(doc = globalThis.document) {
  if (!doc?.head || doc.getElementById('iron-rain-touch-aim-layout')) return false;

  const style = doc.createElement('style');
  style.id = 'iron-rain-touch-aim-layout';
  style.textContent = `
/* Touch aiming: machine first, HUD second. */
.input-touch.inside .fire-deck[data-station="aim"]{
  left:auto!important;
  right:calc(12px + var(--safeR))!important;
  bottom:calc(12px + var(--safeB))!important;
  transform:none!important;
  width:118px!important;
  max-width:118px!important;
  height:auto!important;
  min-height:0!important;
  padding:6px!important;
  display:grid!important;
  grid-template-columns:1fr!important;
  grid-template-rows:auto auto!important;
  gap:6px!important;
  background:rgba(10,16,11,.74)!important;
  border-color:rgba(190,176,125,.34)!important;
  box-shadow:0 5px 18px rgba(0,0,0,.42)!important;
  backdrop-filter:blur(2px)!important;
}
.input-touch.inside .fire-deck[data-station="aim"] .handwheel-box,
.input-touch.inside .fire-deck[data-station="aim"] .ammo-box,
.input-touch.inside .fire-deck[data-station="aim"] .loading-text{
  display:none!important;
}
.input-touch.inside .fire-deck[data-station="aim"] .charge-box{
  display:grid!important;
  width:100%!important;
  min-width:0!important;
  grid-template-columns:1fr 1fr!important;
  grid-template-rows:12px 20px 36px 14px!important;
  gap:2px!important;
  padding:3px!important;
  background:rgba(139,151,108,.045)!important;
}
.input-touch.inside .fire-deck[data-station="aim"] .charge-box label{
  font-size:7px!important;
  letter-spacing:.8px!important;
}
.input-touch.inside .fire-deck[data-station="aim"] .charge-box strong{
  font-size:18px!important;
}
.input-touch.inside .fire-deck[data-station="aim"] .charge-box button{
  min-height:34px!important;
  font-size:20px!important;
  border-color:rgba(225,217,181,.20)!important;
  background:rgba(190,199,151,.06)!important;
}
.input-touch.inside .fire-deck[data-station="aim"] .charge-box #chargeRange{
  font-size:6px!important;
  line-height:8px!important;
  opacity:.78!important;
}
.input-touch.inside .fire-deck[data-station="aim"] .fire-actions{
  display:grid!important;
  grid-template-columns:1fr!important;
  grid-template-rows:44px!important;
  gap:0!important;
  padding:0!important;
}
.input-touch.inside .fire-deck[data-station="aim"] #marchBtn,
.input-touch.inside .fire-deck[data-station="aim"] #notebookBtn{
  display:none!important;
}
.input-touch.inside .fire-deck[data-station="aim"] #fireBtn{
  display:block!important;
  grid-column:1!important;
  grid-row:1!important;
  width:100%!important;
  min-height:44px!important;
  font-size:10px!important;
  letter-spacing:1.3px!important;
}
@media (hover:none) and (pointer:coarse){
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"]{
    left:auto!important;
    right:calc(12px + var(--safeR))!important;
    bottom:calc(12px + var(--safeB))!important;
    transform:none!important;
    width:118px!important;
    max-width:118px!important;
    height:auto!important;
    min-height:0!important;
    padding:6px!important;
    display:grid!important;
    grid-template-columns:1fr!important;
    grid-template-rows:auto auto!important;
    gap:6px!important;
  }
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] .handwheel-box,
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] .ammo-box,
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] .loading-text,
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] #marchBtn,
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] #notebookBtn{
    display:none!important;
  }
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] .charge-box{
    display:grid!important;
  }
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] .fire-actions{
    display:grid!important;
    grid-template-columns:1fr!important;
    grid-template-rows:44px!important;
    padding:0!important;
  }
}
@media (max-height:390px) and (orientation:landscape){
  .input-touch.inside .fire-deck[data-station="aim"],
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"]{
    right:calc(9px + var(--safeR))!important;
    bottom:calc(8px + var(--safeB))!important;
    width:108px!important;
    max-width:108px!important;
    padding:5px!important;
  }
  .input-touch.inside .fire-deck[data-station="aim"] .charge-box,
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] .charge-box{
    grid-template-rows:11px 18px 32px 12px!important;
  }
  .input-touch.inside .fire-deck[data-station="aim"] #fireBtn,
  #app:not(.input-mouse).inside .fire-deck[data-station="aim"] #fireBtn{
    min-height:40px!important;
  }
}
`;
  doc.head.appendChild(style);
  return true;
}
