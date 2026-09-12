'use strict';
  const app = document.getElementById('app');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);

  const UI = {
    robotHud:$('robotHud'), robotSub:$('robotSub'), objective:$('objectiveHud'), phase:$('phaseHud'), wind:$('windHud'), troops:$('troopsHud'),
    requestCard:$('requestCard'), requestHead:$('requestHead'), requestText:$('requestText'), requestAge:$('requestAge'),
    bearing:$('bearingVal'), elev:$('elevVal'), charge:$('chargeVal'), he:$('heCount'), smoke:$('smokeCount'), frag:$('fragCount'),
    moveTitle:$('moveTitle'), moveSub:$('moveSub'), helpExample:$('helpExample'),
    radioLog:$('radioLog'), radioDrawer:$('radioDrawer'), helpModal:$('helpModal'), menuModal:$('menuModal'),
    end:$('endOverlay'), endTitle:$('endTitle'), endText:$('endText'), artillery:$('artilleryPanel'), movePanel:$('movePanel')
  };

  const WORLD = {w:3200,h:1800};
  const LANE_YS = [480,900,1320];
  const COLORS = {
    sky:'#718f6d', ground:'#517848', ground2:'#476b40', dirt:'#7f6b50', road:'#8c7a5a', trench:'#514437', trenchLip:'#9b8966', bunker:'#67675a',
    sandbag:'#b59d72', wood:'#7a6745', ally:'#69bbff', allyDark:'#28506c', enemy:'#ff8074', enemyDark:'#7a3631', smoke:'rgba(220,226,225,.26)',
    black:'#111', shell:'#ffe08d', uiShadow:'rgba(0,0,0,.24)'
  };

  const rand = (a,b)=>a+Math.random()*(b-a);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const fmt = n => String(Math.round(n)).padStart(4,'0');
  const lerp = (a,b,t)=>a+(b-a)*t;
  const angleDiff = (a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

  let dpr = 1, screenW = 1280, screenH = 720;
  let state = null;
  let last = performance.now();
  let joyPointer = null, mapPointer = null, holdTimer = null, holdRepeat = null;
  let selectedShell = 'HE';
  let radarOpen = false;

  function resize(){
    const r = app.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    screenW = Math.max(320, r.width);
    screenH = Math.max(180, r.height);
    canvas.width = Math.round(screenW * dpr);
    canvas.height = Math.round(screenH * dpr);
    canvas.style.width = screenW + 'px';
    canvas.style.height = screenH + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', ()=>setTimeout(resize,120));

  function log(text,type=''){
    const d = document.createElement('div');
    d.className = 'msg ' + type;
    d.innerHTML = text;
    UI.radioLog.appendChild(d);
    UI.radioLog.scrollTop = UI.radioLog.scrollHeight;
    while(UI.radioLog.children.length > 46) UI.radioLog.removeChild(UI.radioLog.firstChild);
  }

  function roadY(x){ return 900 + Math.sin(x*0.0035)*90 + Math.sin(x*0.009)*35; }

  function makeLane(idx){
    const y = LANE_YS[idx];
    const name = ['NORTE','CENTRAL','SUL'][idx];
    const allyTrench = makeTrenchSlots(760, y, 'ally');
    const enemyTrench = makeTrenchSlots(2140, y, 'enemy');
    return {idx,name,y,allyTrench,enemyTrench,secured:false,control:'enemy', smokeUntil:0};
  }

  function makeTrenchSlots(x, y, team){
    const slots = [];
    const spread = [-84,-56,-28,0,28,56,84];
    for(let i=0;i<spread.length;i++){
      slots.push({x:x + (team==='ally'?((i%2===0)?-12:12):((i%2===0)?12:-12)), y:y + spread[i], occupant:null});
    }
    return {x,y,slots};
  }

  function makeEmplacement(lane, type, ox, oy){
    const spec = {
      HMG:{hp:180, range:420, rate:0.12, burst:5, dmg:8, label:'HMG'},
      MG:{hp:155, range:380, rate:0.09, burst:7, dmg:6, label:'MG'},
      MORTAR:{hp:130, range:520, rate:7.0, burst:1, dmg:48, label:'MORTAR'}
    }[type];
    return {
      kind:'emplacement', team:'enemy', lane:lane.idx, type, label:spec.label, x:lane.enemyTrench.x + ox, y:lane.y + oy,
      hp:spec.hp, maxHp:spec.hp, range:spec.range, rate:spec.rate, burst:spec.burst, dmg:spec.dmg,
      burstLeft:0, cool:rand(0.4, spec.rate), aim:Math.PI, muzzle:0, alive:true, suppression:0
    };
  }

  function makeUnit(team, role, laneIdx, home, slotIndex){
    const roleSpec = {
      rifle:{speed:40, range:215, acc:0.42, burst:1, cool:[1.35,2.2], hp:100},
      mg:{speed:34, range:250, acc:0.36, burst:6, cool:[0.10,0.16], hp:110},
      scout:{speed:54, range:190, acc:0.38, burst:1, cool:[1.0,1.5], hp:90}
    }[role];
    return {
      kind:'unit', team, role, lane:laneIdx, x:home.x + rand(-20,20), y:home.y + rand(-20,20),
      home, assignedSlot:slotIndex, hp:roleSpec.hp, maxHp:roleSpec.hp, speed:roleSpec.speed, range:roleSpec.range, acc:roleSpec.acc,
      burstPattern:roleSpec.burst, cool:rand(roleSpec.cool[0], roleSpec.cool[1]), roleCool:roleSpec.cool, burstLeft:0,
      target:null, alive:true, suppression:0, exposed:0, pop:0, aim:team==='ally'?0:Math.PI, state:'moveToTrench',
      assault:false, crouch:1, duck:1, slotOccupying:null, step:rand(0,10), priority:role==='mg'?2:role==='scout'?3:1
    };
  }

  function buildState(){
    const lanes = [makeLane(0), makeLane(1), makeLane(2)];
    const state = {
      time:0, paused:false, mode:'march', uiClean:false,
      robot:{x:420,y:900,facing:0,turret:0,speed:0,armor:100},
      camera:{x:1040,y:900,zoom:0.40,targetZoom:0.40,shake:0,followShell:false,lockTime:0},
      move:{x:0,y:0}, shellType:'HE', bearing:90, elev:45, charge:3, ammo:{HE:18,SMOKE:8,FRAG:8}, shell:null,
      tracers:[], effects:[], smokes:[], craters:[], notifications:[],
      lanes, emplacements:[], units:[],
      operation:{laneIdx:1, phase:'regroup', timer:0, request:null, message:'Esquadrões formando linha de ataque', phaseAge:0},
      gameOver:false, victory:false,
      hq:{x:250,y:900,w:200,h:160}, scenery:createScenery(),
      selectedLanePreview:1
    };

    for(const lane of lanes){
      state.emplacements.push(
        makeEmplacement(lane,'HMG', -80, -78),
        makeEmplacement(lane,'MG',   28,   0),
        makeEmplacement(lane,'MORTAR', 62, 86)
      );
    }

    for(let i=0;i<lanes.length;i++){
      const lane = lanes[i];
      const allyBase = {x:lane.allyTrench.x-280, y:lane.y};
      const enemyBase = {x:lane.enemyTrench.x+210, y:lane.y};
      for(let j=0;j<5;j++) state.units.push(makeUnit('ally','rifle',i,allyBase,j%lane.allyTrench.slots.length));
      state.units.push(makeUnit('ally','mg',i,allyBase,5%lane.allyTrench.slots.length));
      state.units.push(makeUnit('ally','scout',i,allyBase,1));

      for(let j=0;j<5;j++) state.units.push(makeUnit('enemy','rifle',i,enemyBase,j%lane.enemyTrench.slots.length));
      state.units.push(makeUnit('enemy','mg',i,enemyBase,5%lane.enemyTrench.slots.length));
      state.units.push(makeUnit('enemy','rifle',i,enemyBase,2));
    }
    return state;
  }

  function createScenery(){
    const trees=[], rocks=[], grass=[];
    for(let i=0;i<180;i++) trees.push({x:rand(60,WORLD.w-60),y:rand(60,WORLD.h-60),r:rand(16,30)});
    for(let i=0;i<80;i++) rocks.push({x:rand(60,WORLD.w-60),y:rand(60,WORLD.h-60),r:rand(4,11)});
    for(let i=0;i<280;i++) grass.push({x:rand(30,WORLD.w-30),y:rand(30,WORLD.h-30),s:rand(1,3)});
    return {trees,rocks,grass};
  }

  function reset(){
    state = buildState();
    selectedShell = 'HE';
    UI.radioLog.innerHTML = '';
    UI.requestCard.classList.add('hidden');
    UI.end.classList.add('hidden');
    UI.radioDrawer.classList.add('hidden');
    UI.helpModal.classList.add('hidden');
    UI.menuModal.classList.add('hidden');
    setMode('march');
    log('<b>COMANDO:</b> Mamute-47 operacional. A frente agora é uma linha de trincheiras. O ataque vai esperar sua preparação de artilharia.', 'good');
    log('<b>OBSERVADOR:</b> HMGs, MGs e morteiros seguram cada setor. Quebre as armas pesadas para abrir corredores de avanço.');
    updateHelpExample();
    updateUI();
  }

  function setMode(mode){
    state.mode = mode;
    if(mode === 'march'){
      UI.movePanel.classList.remove('hidden');
      UI.artillery.classList.add('hidden');
      state.camera.followShell = false;
    }else{
      UI.movePanel.classList.add('hidden');
      UI.artillery.classList.remove('hidden');
    }
    updateUI();
  }

  function nextObjectiveLane(){
    const order = [1,0,2];
    return order.find(i=>!state.lanes[i].secured) ?? -1;
  }

  function trenchFor(team, laneIdx){
    const lane = state.lanes[laneIdx];
    return team==='ally' ? lane.allyTrench : lane.enemyTrench;
  }

  function assignTrenchSlots(){
    for(const lane of state.lanes){
      for(const s of lane.allyTrench.slots) s.occupant = null;
      for(const s of lane.enemyTrench.slots) s.occupant = null;
    }
    for(const u of state.units){
      if(!u.alive) continue;
      const trench = trenchFor(u.team, u.lane);
      const slots = trench.slots;
      const idx = clamp(u.assignedSlot, 0, slots.length-1);
      slots[idx].occupant = u;
      u.slotOccupying = slots[idx];
    }
  }

  function laneEmplacements(laneIdx){
    return state.emplacements.filter(e=>e.alive && e.lane===laneIdx);
  }

  function laneUnits(team, laneIdx){
    return state.units.filter(u=>u.alive && u.team===team && u.lane===laneIdx);
  }

  function standingChance(u){
    return u.role==='mg' ? 0.65 : u.role==='scout' ? 0.45 : 0.35;
  }

  function requestFire(target, text){
    state.operation.request = {target, time:state.time, text};
    UI.requestCard.classList.remove('hidden');
    UI.requestText.innerHTML = text;
    log('<b>📡 MISSÃO DE FOGO:</b> ' + text, 'request');
    updateHelpExample();
  }

  function clearRequest(){
    state.operation.request = null;
    UI.requestCard.classList.add('hidden');
    updateHelpExample();
  }

  function updateHelpExample(){
    if(!state || !state.operation || !state.operation.request){
      UI.helpExample.textContent = 'Sem missão ativa. Quando um observador enviar coordenadas, a investida vai parar e aguardar seu tiro.';
      return;
    }
    const r = state.robot, q = state.operation.request.target;
    const dx = q.x - r.x, dy = q.y - r.y, d = Math.hypot(dx,dy);
    UI.helpExample.innerHTML = `Missão atual: <b>X${fmt(q.x)} Y${fmt(q.y)}</b><br>Você: <b>X${fmt(r.x)} Y${fmt(r.y)}</b><br>ΔX = <b>${Math.round(dx)}</b> m • ΔY = <b>${Math.round(dy)}</b> m • distância ≈ <b>${Math.round(d)} m</b>.`;
  }

  function worldToScreen(x,y){
    return {x:(x - state.camera.x) * state.camera.zoom + screenW/2, y:(y - state.camera.y) * state.camera.zoom + screenH/2};
  }
  function screenToWorld(x,y){
    return {x:(x - screenW/2)/state.camera.zoom + state.camera.x, y:(y - screenH/2)/state.camera.zoom + state.camera.y};
  }
