  function draw(){
    ctx.clearRect(0,0,screenW,screenH);
    drawGround();
    drawScenery();
    drawRoads();
    drawTrenches();
    drawHQ();
    drawCraters();
    drawSmokes();
    drawEmplacements();
    drawUnits();
    drawRobot();
    drawTracers();
    drawShell();
    drawEffects();
    drawCompassCue();
  }

  function drawGround(){
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0,0,screenW,screenH);
    for(let i=0;i<32;i++){
      const x = (i*113 + (state.time*6)%113) % (screenW+140) - 70;
      ctx.fillStyle = i%2 ? 'rgba(255,255,255,.02)' : 'rgba(0,0,0,.015)';
      ctx.fillRect(x,0,28,screenH);
    }
  }

  function drawScenery(){
    for(const g of state.scenery.grass){
      const p = worldToScreen(g.x,g.y); if(p.x<-10||p.x>screenW+10||p.y<-10||p.y>screenH+10) continue;
      ctx.strokeStyle = g.s===3 ? 'rgba(206,228,178,.20)' : 'rgba(180,209,161,.16)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x-1,p.y-6*g.s*state.camera.zoom); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x+1,p.y-5*g.s*state.camera.zoom); ctx.stroke();
    }
    for(const r of state.scenery.rocks){
      const p = worldToScreen(r.x,r.y); const rr = r.r*state.camera.zoom; if(p.x<-rr||p.x>screenW+rr||p.y<-rr||p.y>screenH+rr) continue;
      ctx.fillStyle = 'rgba(90,92,86,.65)'; ctx.beginPath(); ctx.ellipse(p.x,p.y,rr*1.3,rr,0,0,Math.PI*2); ctx.fill();
    }
    for(const t of state.scenery.trees){
      const p = worldToScreen(t.x,t.y); const rr=t.r*state.camera.zoom; if(rr<3||p.x<-rr||p.x>screenW+rr||p.y<-rr||p.y>screenH+rr) continue;
      ctx.fillStyle = '#3c5e36'; ctx.beginPath(); ctx.arc(p.x, p.y+rr*0.25, rr*0.55, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#2f4a2c'; ctx.beginPath(); ctx.arc(p.x-rr*0.28,p.y-rr*0.15,rr*0.58,0,Math.PI*2); ctx.arc(p.x+rr*0.22,p.y-rr*0.18,rr*0.62,0,Math.PI*2); ctx.fill();
    }
  }

  function drawRoads(){
    const pts=[];
    for(let x=0;x<=WORLD.w;x+=120) pts.push({x,y:roadY(x)});
    ctx.save();
    ctx.strokeStyle = COLORS.dirt; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineWidth = 170*state.camera.zoom;
    ctx.beginPath();
    for(let i=0;i<pts.length;i++){ const p=worldToScreen(pts[i].x,pts[i].y); if(i===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(215,198,156,.20)'; ctx.lineWidth = 18*state.camera.zoom;
    ctx.beginPath(); for(let i=0;i<pts.length;i++){ const p=worldToScreen(pts[i].x,pts[i].y); if(i===0)ctx.moveTo(p.x,p.y-25*state.camera.zoom); else ctx.lineTo(p.x,p.y-25*state.camera.zoom); } ctx.stroke();
    ctx.restore();
  }

  function drawTrenchSystem(trench, team){
    const x = trench.x, y = trench.y;
    const color = COLORS.trench, lip = COLORS.trenchLip;
    const path = [
      {x:x-120,y:y-120},{x:x-60,y:y-70},{x:x-10,y:y-40},{x:x+55,y:y},{x:x-10,y:y+40},{x:x-60,y:y+70},{x:x-120,y:y+120}
    ];
    ctx.strokeStyle = color; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineWidth = 88*state.camera.zoom;
    ctx.beginPath();
    path.forEach((n,i)=>{ const p=worldToScreen(n.x,n.y); if(i===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
    ctx.stroke();
    ctx.strokeStyle = lip; ctx.lineWidth = 20*state.camera.zoom;
    ctx.beginPath(); path.forEach((n,i)=>{ const p=worldToScreen(n.x,n.y); if(i===0)ctx.moveTo(p.x,p.y-10*state.camera.zoom); else ctx.lineTo(p.x,p.y-10*state.camera.zoom); }); ctx.stroke();
    for(const s of trench.slots){
      const p = worldToScreen(s.x,s.y);
      ctx.fillStyle = team==='ally' ? 'rgba(110,180,255,.15)' : 'rgba(255,130,118,.12)';
      ctx.fillRect(p.x-18*state.camera.zoom,p.y-8*state.camera.zoom,36*state.camera.zoom,16*state.camera.zoom);
    }
  }

  function drawTrenches(){
    for(const lane of state.lanes){
      drawTrenchSystem(lane.allyTrench, 'ally');
      if(!lane.secured) drawTrenchSystem(lane.enemyTrench, 'enemy');
      const a = worldToScreen(lane.allyTrench.x, lane.y-150);
      ctx.fillStyle='rgba(7,11,9,.88)'; ctx.fillRect(a.x-78,a.y-18,156,34); ctx.fillStyle='#69bbff'; ctx.font='900 13px system-ui'; ctx.textAlign='center'; ctx.fillText(lane.name,a.x,a.y+5);
      const b = worldToScreen(lane.enemyTrench.x, lane.y-150);
      if(!lane.secured){ ctx.fillStyle='rgba(7,11,9,.88)'; ctx.fillRect(b.x-88,b.y-18,176,34); ctx.fillStyle='#ff8074'; ctx.fillText('SETOR INIMIGO',b.x,b.y+5); }
    }
    ctx.textAlign='start';
  }

  function drawHQ(){
    const h = state.hq; const p = worldToScreen(h.x,h.y);
    const w = h.w*state.camera.zoom, hh = h.h*state.camera.zoom;
    ctx.fillStyle = '#5b564a'; ctx.fillRect(p.x-w/2,p.y-hh/2,w,hh);
    ctx.fillStyle = '#8f8265'; ctx.fillRect(p.x-w/2,p.y-hh/2,w,20*state.camera.zoom);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(p.x-w/2+14,p.y-12*state.camera.zoom,60*state.camera.zoom,35*state.camera.zoom);
    ctx.fillStyle = '#d8c182'; ctx.font='900 16px system-ui'; ctx.fillText('CENTRO DE OPERAÇÕES', p.x-w/2, p.y-hh/2-10);
  }

  function drawCraters(){
    for(const c of state.craters){ const p=worldToScreen(c.x,c.y), r=c.r*state.camera.zoom; if(r<2||p.x<-r||p.x>screenW+r||p.y<-r||p.y>screenH+r) continue; ctx.fillStyle='rgba(35,26,20,.34)'; ctx.beginPath(); ctx.ellipse(p.x,p.y,r*1.3,r,0,0,Math.PI*2); ctx.fill(); }
  }
  function drawSmokes(){
    for(const s of state.smokes){ const p=worldToScreen(s.x,s.y), r=s.r*state.camera.zoom; if(p.x<-r||p.x>screenW+r||p.y<-r||p.y>screenH+r) continue; const a=Math.min(.34,s.life/8*.34); ctx.fillStyle=`rgba(219,226,223,${a})`; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill(); }
  }

  function drawEmplacements(){
    for(const e of state.emplacements){ if(!e.alive) continue; const p=worldToScreen(e.x,e.y); if(p.x<-80||p.x>screenW+80||p.y<-80||p.y>screenH+80) continue;
      const ww = 84*state.camera.zoom, hh=46*state.camera.zoom;
      ctx.fillStyle=COLORS.bunker; ctx.fillRect(p.x-ww/2,p.y-hh/2,ww,hh);
      ctx.fillStyle=COLORS.sandbag; ctx.fillRect(p.x-ww/2,p.y-hh/2,ww,12*state.camera.zoom);
      ctx.save(); ctx.translate(p.x,p.y+4*state.camera.zoom); ctx.rotate(e.aim); ctx.strokeStyle='#111'; ctx.lineWidth=6*state.camera.zoom; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(28*state.camera.zoom,0); ctx.stroke(); ctx.restore();
      if(e.muzzle>0){ ctx.fillStyle='rgba(255,231,158,.75)'; ctx.beginPath(); ctx.arc(p.x+Math.cos(e.aim)*28*state.camera.zoom, p.y+Math.sin(e.aim)*28*state.camera.zoom, 8*e.muzzle*state.camera.zoom, 0, Math.PI*2); ctx.fill(); }
      ctx.fillStyle='rgba(0,0,0,.8)'; ctx.fillRect(p.x-44*state.camera.zoom,p.y-40*state.camera.zoom,88*state.camera.zoom,16*state.camera.zoom);
      ctx.fillStyle='#fff'; ctx.font=`${Math.max(9, 10*state.camera.zoom+8)}px system-ui`; ctx.textAlign='center'; ctx.fillText(e.label,p.x,p.y-28*state.camera.zoom);
      ctx.fillStyle='rgba(255,255,255,.16)'; ctx.fillRect(p.x-40*state.camera.zoom,p.y+28*state.camera.zoom,80*state.camera.zoom,6*state.camera.zoom);
      ctx.fillStyle='#ff7f74'; ctx.fillRect(p.x-40*state.camera.zoom,p.y+28*state.camera.zoom,80*(e.hp/e.maxHp)*state.camera.zoom,6*state.camera.zoom);
    }
    ctx.textAlign='start';
  }

  function drawUnitBody(u, p){
    const color = u.team==='ally' ? COLORS.ally : COLORS.enemy;
    const bodyY = p.y + u.crouch*7*state.camera.zoom;
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3.8*state.camera.zoom; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo(p.x, bodyY); ctx.lineTo(p.x + Math.cos(u.aim)*14*state.camera.zoom, bodyY + Math.sin(u.aim)*14*state.camera.zoom); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, bodyY, 8*state.camera.zoom, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#f0d0bd'; ctx.beginPath(); ctx.arc(p.x, bodyY-10*state.camera.zoom, 5*state.camera.zoom, 0, Math.PI*2); ctx.fill();
    if(u.pop>0){ ctx.fillStyle='rgba(255,241,171,.82)'; ctx.beginPath(); ctx.arc(p.x + Math.cos(u.aim)*14*state.camera.zoom, bodyY + Math.sin(u.aim)*14*state.camera.zoom, 4*u.pop*state.camera.zoom, 0, Math.PI*2); ctx.fill(); }
  }

  function drawUnits(){
    for(const u of state.units){ if(!u.alive) continue; const p=worldToScreen(u.x,u.y); if(p.x<-35||p.x>screenW+35||p.y<-35||p.y>screenH+35) continue;
      drawUnitBody(u,p);
    }
  }

  function drawRobot(){
    const r = state.robot; const p=worldToScreen(r.x,r.y); const s=34*state.camera.zoom;
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(r.facing); ctx.fillStyle='#755d37'; ctx.fillRect(-s*0.95,-s*0.70,s*1.9,s*1.4); ctx.fillStyle='#d2b264'; ctx.fillRect(-s*0.7,-s*0.5,s*1.4,s); ctx.fillStyle='#5e4727'; ctx.fillRect(-s*1.15,-s*0.85,10*state.camera.zoom,s*1.7); ctx.fillRect(s*0.95,-s*0.85,10*state.camera.zoom,s*1.7); ctx.restore();
    ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(r.turret); ctx.strokeStyle='#f4d88c'; ctx.lineWidth=7*state.camera.zoom; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(46*state.camera.zoom,0); ctx.stroke(); ctx.restore();
    ctx.fillStyle='rgba(0,0,0,.86)'; ctx.fillRect(p.x-62,p.y-60,124,24); ctx.fillStyle='#f7e29a'; ctx.font='900 14px system-ui'; ctx.textAlign='center'; ctx.fillText('M-47', p.x, p.y-43); ctx.textAlign='start';
  }

  function drawTracers(){
    for(const t of state.tracers){ const a=worldToScreen(t.x,t.y), b=worldToScreen(t.x2,t.y2); ctx.strokeStyle = t.team==='ally' ? `rgba(172,222,255,${t.life/t.max})` : `rgba(255,174,165,${t.life/t.max})`; ctx.lineWidth = (t.heavy?2.2:1.5)*state.camera.zoom + 0.5; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }
  }

  function drawShell(){
    if(!state.shell) return; const s=state.shell,p=worldToScreen(s.x,s.y); ctx.fillStyle=COLORS.shell; ctx.beginPath(); ctx.arc(p.x,p.y,6+Math.min(7,s.z*0.03),0,Math.PI*2); ctx.fill(); ctx.fillStyle='rgba(255,224,141,.16)'; ctx.beginPath(); ctx.arc(p.x,p.y,18,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#fff'; ctx.font='12px system-ui'; ctx.fillText('ALT '+Math.max(0,Math.round(s.z))+'m', p.x+12, p.y-10); }

  function drawEffects(){
    for(const e of state.effects){ if(e.type==='blast'){ const p=worldToScreen(e.x,e.y), r=e.max*(1-e.life/0.8)*state.camera.zoom; ctx.fillStyle=`rgba(255,167,79,${Math.max(0,e.life/0.8)*.52})`; ctx.beginPath(); ctx.arc(p.x,p.y,r,0,Math.PI*2); ctx.fill(); } else if(e.type==='incoming'){ const p=worldToScreen(e.x,e.y); const a=Math.max(0,e.t/1.1); ctx.strokeStyle=`rgba(255,121,121,${.32+a*.35})`; ctx.setLineDash([10,8]); ctx.lineWidth=3; ctx.beginPath(); ctx.arc(p.x,p.y,32 + (1-a)*22, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]); } }
  }

  function drawCompassCue(){
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.font = '10px system-ui';
    ctx.fillText('N', screenW/2 - 4, 16 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safeT'))||0));
  }

  function updateUI(){
    UI.robotHud.textContent = 'M-47 MAMUTE';
    UI.robotSub.textContent = `X${fmt(state.robot.x)} Y${fmt(state.robot.y)} • ${Math.max(0,Math.round(state.robot.armor))}%`;
    const lane = state.lanes[state.operation.laneIdx] || state.lanes[0];
    UI.objective.textContent = `${lane.name} • ARMAS ${laneEmplacements(state.operation.laneIdx).length}/3`;
    UI.phase.textContent = state.operation.message.toUpperCase();
    UI.wind.textContent = `VENTO ${state.wind?.x>=0?'L':'O'} ${Math.abs(state.wind?.x||0).toFixed(1)} / ${state.wind?.y>=0?'S':'N'} ${Math.abs(state.wind?.y||0).toFixed(1)}`;
    UI.troops.textContent = `A:${friendlyAlive()} • E:${enemyAlive()}`;
    UI.bearing.textContent = String(state.bearing).padStart(3,'0') + '°';
    UI.elev.textContent = state.elev + '°';
    UI.charge.textContent = state.charge;
    UI.he.textContent = state.ammo.HE; UI.smoke.textContent = state.ammo.SMOKE; UI.frag.textContent = state.ammo.FRAG;
    UI.moveTitle.textContent = state.mode==='march' ? 'MARCHA' : 'ARTILHARIA';
    UI.moveSub.textContent = `Centro de Operações • ${Math.round(state.robot.speed)} km/h`;
    if(state.operation.request){ UI.requestAge.textContent = Math.max(0, Math.floor(state.time - state.operation.request.time)) + 's'; }
  }

  function openHelp(){ state.paused = true; UI.helpModal.classList.remove('hidden'); updateHelpExample(); }
  function closeHelp(){ UI.helpModal.classList.add('hidden'); UI.menuModal.classList.add('hidden'); state.paused = false; }
  function openMenu(){ state.paused = true; UI.menuModal.classList.remove('hidden'); }
  function closeMenu(){ UI.menuModal.classList.add('hidden'); state.paused = false; }
  function toggleClean(){ state.uiClean = !state.uiClean; app.classList.toggle('clean', state.uiClean); }

  const joystick = $('joystick');
  const joyKnob = $('joyKnob');
  function setJoy(dx,dy){
    const len = Math.hypot(dx,dy); const max = 42; const cl = len>max ? max/len : 1; dx*=cl; dy*=cl;
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    state.move.x = clamp(dx/max, -1, 1); state.move.y = clamp(dy/max, -1, 1);
  }
  joystick.addEventListener('pointerdown', e=>{
    e.preventDefault(); joyPointer = e.pointerId; joystick.setPointerCapture(e.pointerId);
    const r=joystick.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2; setJoy(e.clientX-cx, e.clientY-cy);
  });
  joystick.addEventListener('pointermove', e=>{ if(e.pointerId!==joyPointer) return; e.preventDefault(); const r=joystick.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2; setJoy(e.clientX-cx, e.clientY-cy); });
  function resetJoy(e){ if(joyPointer===null || (e && e.pointerId!==joyPointer)) return; joyPointer=null; state.move.x=0; state.move.y=0; joyKnob.style.transform='translate(0,0)'; }
  joystick.addEventListener('pointerup', resetJoy); joystick.addEventListener('pointercancel', resetJoy);

  canvas.addEventListener('pointerdown', e=>{
    if(joyPointer!==null || state.paused) return;
    mapPointer = {id:e.pointerId, x:e.clientX, y:e.clientY, camX:state.camera.x, camY:state.camera.y};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e=>{
    if(!mapPointer || mapPointer.id!==e.pointerId || state.camera.followShell) return;
    const dx=(e.clientX-mapPointer.x)/state.camera.zoom; const dy=(e.clientY-mapPointer.y)/state.camera.zoom;
    state.camera.x = mapPointer.camX - dx; state.camera.y = mapPointer.camY - dy;
  });
  canvas.addEventListener('pointerup', e=>{ if(mapPointer && mapPointer.id===e.pointerId) mapPointer=null; });
  canvas.addEventListener('pointercancel', e=>{ if(mapPointer && mapPointer.id===e.pointerId) mapPointer=null; });

  $('deployBtn').addEventListener('click', ()=>setMode('artillery'));
  $('marchBtn').addEventListener('click', ()=>setMode('march'));
  $('fireBtn').addEventListener('click', fireShell);
  $('centerBtn').addEventListener('click', ()=>{ state.camera.x = state.robot.x + 540; state.camera.y = state.robot.y; });
  $('zoomInBtn').addEventListener('click', ()=> state.camera.targetZoom = clamp(state.camera.targetZoom + 0.08, 0.28, 1.10));
  $('zoomOutBtn').addEventListener('click', ()=> state.camera.targetZoom = clamp(state.camera.targetZoom - 0.08, 0.28, 1.10));
  $('radioBtn').addEventListener('click', ()=>{ radarOpen=!radarOpen; UI.radioDrawer.classList.toggle('hidden', !radarOpen); });
  $('closeRadio').addEventListener('click', ()=>{ radarOpen=false; UI.radioDrawer.classList.add('hidden'); });
  $('menuBtn').addEventListener('click', openMenu);
  $('closeMenu').addEventListener('click', closeMenu);
  $('resumeBtn').addEventListener('click', closeMenu);
  $('restartBtn').addEventListener('click', ()=>{ closeMenu(); reset(); });
  $('endRestart').addEventListener('click', reset);
  $('menuHelpBtn').addEventListener('click', ()=>{ UI.menuModal.classList.add('hidden'); openHelp(); });
  $('cleanUiBtn').addEventListener('click', toggleClean);
  $('closeHelp').addEventListener('click', closeHelp);
  $('resumeHelp').addEventListener('click', closeHelp);
  $('requestCard').addEventListener('click', ()=>{ if(!state.operation.request) return; state.camera.x = state.operation.request.target.x; state.camera.y = state.operation.request.target.y; });

  function adjustParam(kind, delta){
    if(kind==='bearing') state.bearing = (state.bearing + delta + 360) % 360;
    else if(kind==='elev') state.elev = clamp(state.elev + delta, 18, 78);
    else if(kind==='charge') state.charge = clamp(state.charge + delta, 1, 5);
    if(state.mode==='artillery'){ const rad = state.bearing * Math.PI/180 - Math.PI/2; state.robot.turret = rad; }
    updateUI();
  }
  function startRepeat(kind, delta){
    adjustParam(kind, delta);
    clearTimeout(holdTimer); clearInterval(holdRepeat);
    holdTimer = setTimeout(()=>{ holdRepeat = setInterval(()=>adjustParam(kind, delta), 70); }, 280);
  }
  function stopRepeat(){ clearTimeout(holdTimer); clearInterval(holdRepeat); }
  document.querySelectorAll('[data-adjust]').forEach(b=>{
    const [kind,delta] = b.dataset.adjust.split(':');
    const num = Number(delta);
    b.addEventListener('pointerdown', e=>{ e.preventDefault(); startRepeat(kind, num); });
    b.addEventListener('pointerup', stopRepeat); b.addEventListener('pointercancel', stopRepeat); b.addEventListener('pointerleave', stopRepeat);
  });
  document.querySelectorAll('[data-shell]').forEach(b=>b.addEventListener('click', ()=>{
    selectedShell = b.dataset.shell; document.querySelectorAll('[data-shell]').forEach(x=>x.classList.toggle('active', x===b));
  }));

  function loop(t){
    const dt = Math.min(0.033, (t-last)/1000 || 0); last=t;
    update(dt); draw(); requestAnimationFrame(loop);
  }

  resize(); reset(); requestAnimationFrame(loop);
