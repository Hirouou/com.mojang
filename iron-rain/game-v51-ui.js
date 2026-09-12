// V5.1 UX layer: compact HUD, mechanical handwheels and automatic camera return.
(() => {
  const azWheel = document.getElementById('azWheel');
  const elWheel = document.getElementById('elWheel');
  const azSpoke = document.getElementById('azSpoke');
  const elSpoke = document.getElementById('elSpoke');
  const chargeMinus = document.getElementById('chargeMinus');
  const chargePlus = document.getElementById('chargePlus');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const installHint = document.getElementById('installHint');

  let azTarget = state.bearing;
  let elTarget = state.elev;
  let azVisual = 0;
  let elVisual = 0;
  let lastActivity = performance.now();
  let previousShell = !!state.shell;
  let impactHoldUntil = 0;
  let cameraReturn = false;

  function normalizeDelta(a){
    while(a > Math.PI) a -= Math.PI * 2;
    while(a < -Math.PI) a += Math.PI * 2;
    return a;
  }
  function touchUI(){ lastActivity = performance.now(); app.classList.remove('hud-idle'); }

  function bindWheel(el, kind){
    if(!el) return;
    let pointer = null;
    let lastAngle = 0;
    const ratio = kind === 'bearing' ? 7.5 : 10.0; // handwheel degrees per gun degree
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); touchUI();
      pointer = e.pointerId; el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      lastAngle = Math.atan2(e.clientY-(r.top+r.height/2), e.clientX-(r.left+r.width/2));
    });
    el.addEventListener('pointermove', e => {
      if(e.pointerId !== pointer) return;
      e.preventDefault(); e.stopPropagation(); touchUI();
      const r = el.getBoundingClientRect();
      const a = Math.atan2(e.clientY-(r.top+r.height/2), e.clientX-(r.left+r.width/2));
      const deltaRad = normalizeDelta(a-lastAngle); lastAngle = a;
      const deltaDeg = deltaRad * 180 / Math.PI;
      if(kind === 'bearing'){
        azVisual += deltaDeg;
        azTarget = (azTarget + deltaDeg/ratio + 3600) % 360;
        if(azSpoke) azSpoke.style.transform = `rotate(${azVisual}deg)`;
      } else {
        elVisual += deltaDeg;
        elTarget = clamp(elTarget + deltaDeg/ratio, 18, 78);
        if(elSpoke) elSpoke.style.transform = `rotate(${elVisual}deg)`;
      }
    });
    const stop = e => { if(pointer === null || (e && e.pointerId !== pointer)) return; pointer = null; };
    el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop);
  }
  bindWheel(azWheel, 'bearing');
  bindWheel(elWheel, 'elev');

  function changeCharge(d){ state.charge = clamp(state.charge + d, 1, 5); touchUI(); updateUI(); }
  chargeMinus?.addEventListener('click', e => { e.stopPropagation(); changeCharge(-1); });
  chargePlus?.addEventListener('click', e => { e.stopPropagation(); changeCharge(1); });

  // The old engine binds these buttons too; closing the menu here makes them useful as menu tools.
  ['centerBtn','zoomInBtn','zoomOutBtn','radioBtn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      touchUI();
      if(!UI.menuModal.classList.contains('hidden')) closeMenu();
    });
  });

  fullscreenBtn?.addEventListener('click', async () => {
    touchUI();
    if(document.fullscreenElement){ try{ await document.exitFullscreen(); }catch{} return; }
    if(document.documentElement.requestFullscreen){
      try{ await document.documentElement.requestFullscreen({navigationUI:'hide'}); return; }catch{}
    }
    if(installHint) installHint.classList.remove('hidden');
  });

  // Make the clean-HUD choice useful immediately.
  document.getElementById('cleanUiBtn')?.addEventListener('click', () => { touchUI(); closeMenu(); });

  // Restart should keep the V5.1 wider tactical view.
  const oldReset = reset;
  reset = function(){
    oldReset();
    state.camera.zoom = 0.32; state.camera.targetZoom = 0.32;
    azTarget = state.bearing; elTarget = state.elev;
    cameraReturn = false; impactHoldUntil = 0; previousShell = false;
  };
  state.camera.zoom = 0.32; state.camera.targetZoom = 0.32;

  // Cancel an automatic return if the player deliberately drags the battlefield.
  canvas.addEventListener('pointerdown', () => { cameraReturn = false; touchUI(); }, true);
  app.addEventListener('pointerdown', touchUI, {passive:true});

  function gunControlTick(dt){
    if(state.mode !== 'artillery'){
      azTarget = state.bearing; elTarget = state.elev; return;
    }
    const bdiff = ((azTarget - state.bearing + 540) % 360) - 180;
    const maxB = 22 * dt;
    state.bearing = (state.bearing + clamp(bdiff, -maxB, maxB) + 360) % 360;
    const ediff = elTarget - state.elev;
    state.elev += clamp(ediff, -12*dt, 12*dt);
    state.robot.turret += angleDiff(state.robot.turret, state.bearing*Math.PI/180 - Math.PI/2) * Math.min(1,dt*6.5);
  }

  function cameraTick(){
    const hasShell = !!state.shell;
    if(hasShell && !previousShell){
      cameraReturn = false;
      app.classList.add('shot-cinematic');
    }
    if(!hasShell && previousShell){
      impactHoldUntil = performance.now() + 1250;
      cameraReturn = false;
    }
    previousShell = hasShell;

    if(!hasShell && impactHoldUntil && performance.now() >= impactHoldUntil){
      cameraReturn = true; impactHoldUntil = 0;
    }
    if(cameraReturn && !state.paused){
      const forwardOffset = Math.min(430, 0.20 * screenW / Math.max(.28,state.camera.zoom));
      const tx = state.robot.x + forwardOffset;
      const ty = state.robot.y;
      state.camera.x = lerp(state.camera.x, tx, 0.085);
      state.camera.y = lerp(state.camera.y, ty, 0.11);
      if(Math.hypot(state.camera.x-tx,state.camera.y-ty) < 12){
        state.camera.x = tx; state.camera.y = ty; cameraReturn = false;
        app.classList.remove('shot-cinematic');
        touchUI();
      }
    }
  }

  let lt = performance.now();
  function uiLoop(now){
    const dt = Math.min(.04,(now-lt)/1000 || 0); lt = now;
    gunControlTick(dt);
    cameraTick();
    if(now-lastActivity > 3600 && !state.paused) app.classList.add('hud-idle');
    if(UI.bearing) UI.bearing.textContent = String(Math.round(state.bearing)).padStart(3,'0')+'°';
    if(UI.elev) UI.elev.textContent = Math.round(state.elev)+'°';
    requestAnimationFrame(uiLoop);
  }
  requestAnimationFrame(uiLoop);
})();
