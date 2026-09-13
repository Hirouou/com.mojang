import { createServerGameClient } from './modules/server-game-client.js';
import { ballistics, bearingVector, chargeBand, sampleTrajectory, MIN_ELEVATION, MAX_ELEVATION } from './modules/ballistics.js';
import { bindJoystick, bindHandwheel } from './modules/pointer-controls.js';
import { initializeSector, updateWar, applyWarImpact, trenchPath, phaseLabels, getFrontGeometry, assessRoute, checkRouteAmbush } from './modules/war-simulation.js';
import { createTableMap } from './modules/table-map.js';
import { cinematicActive, smooth, cameraAnchor, beginReturn, finishCamera, stepCamera } from './modules/camera-director.js';
import { drawWarInfrastructure, drawWarAtmosphere } from './modules/battlefield-view.js';
import { createWarAudio } from './modules/war-audio.js';
import { loaderAudioCue } from './modules/loader-audio-cue.js';
import { beginLoading, stepLoading, loadingLabel } from './modules/loading-cycle.js';
import { DEFAULT_BINDINGS, eventCode, keyLabel, actionForKey, rebindKey, restoreBindings } from './modules/key-bindings.js';
import { createEngine, damageEngine, engineCanDrive, serviceEngine, updateEngine as stepEngine, engineStatus } from './modules/engine-system.js';
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const app = $('app'), canvas = $('game'), ctx = canvas.getContext('2d');
  const UI = {
    hud:$('hud'), own:$('ownCoord'), opTitle:$('opTitle'), opSub:$('opSub'), wind:$('windText'), ammo:$('ammoText'),
    missionPill:$('missionPill'), missionTitle:$('missionTitle'), missionText:$('missionText'),
    march:$('marchUi'), fireDeck:$('fireDeck'), azValue:$('azValue'), elValue:$('elValue'), range:$('rangeReadout'), charge:$('chargeValue'), chargeRange:$('chargeRange'),
    he:$('heCount'), smoke:$('smokeCount'), frag:$('fragCount'), notebook:$('notebook'), notebookBody:$('notebookBody'), rangeTable:$('rangeTable'),
    help:$('help'), menu:$('menu'), radio:$('radio'), radioLog:$('radioLog'), intelBanner:$('intelBanner'), intelTitle:$('intelTitle'), intelText:$('intelText'), installHint:$('installHint')
  };

  const WORLD = {w:80000,h:60000}; // metres
  const COLORS = {ally:'#71c3ff',enemy:'#ff8278',allyDark:'#27516b',enemyDark:'#733832',dirt:'#806d51',trench:'#514438',lip:'#aa9872',sand:'#b69e72',bunker:'#69685b'};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const rand=(a,b)=>a+Math.random()*(b-a);
  const fmt=n=>String(Math.round(n)).padStart(5,'0');
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const angDiff=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
  const deg=r=>r*180/Math.PI;
  const rad=d=>d*Math.PI/180;
  const bearingTo=(from,to)=>(deg(Math.atan2(to.x-from.x, -(to.y-from.y)))+360)%360;


  let DPR=1, SW=1280, SH=720, last=performance.now();
  let joyId=null, joy={x:0,y:0};
  let panId=null, panStart=null;
  let controls=[];
  let sheetOpen=null;
  let tableMap;
  let uiClock=0;
  let selectedShell='HE';
  let idleAt=performance.now();
  let state;
  const serverRuntime=globalThis.ironRainEntry?.runtime?.isAuthoritativeClient?globalThis.ironRainEntry.runtime:null;
  let serverClient=null;
  let cabin=null,cabinFailed=false,cabinMove={x:0,y:0},toastUntil=0;
  let radioChannel='all',pendingBinding=null,resettingInputs=false;
  let bindings={...DEFAULT_BINDINGS},touchMode=matchMedia('(pointer: coarse)').matches;
  const seenWarEvents=new Set(),heldKeys=new Set(),audio=createWarAudio();
  const stationInfo={aim:['PONTARIA','Gire as manivelas. Ajuste a carga e confira alcance e ápice.'],load:['PAIOL / CULATRA','Selecione o projétil. A carga pode ser ajustada também no painel de pontaria. HE · estruturas / FRG · infantaria / SMK · cobertura.'],map:['MESA DE CARTAS','Informe → coordenadas → régua. Volte à pontaria para ajustar a peça.'],radio:['RÁDIO DE CAMPANHA','Informes dos observadores e da infantaria.'],hatch:['ESCOTILHA','A folha abre ao se aproximar. Pressione Esc para se afastar.']};
  const inside=()=>!!cabin&&state?.view==='cabin'&&!cinematicActive(state)&&!cabinFailed;

  const sectorsData = [
    ['FALCON',17600,12600],['BIRCH',24800,33200],['CINDER',35600,45800],['DAGGER',49300,18800],['ECHO',61100,39100],['FROST',58000,11200],['LINHA 07',8950,30000]
  ];

  function buildSector(name,x,y,idx){
    const assets=[
      {id:`${name}-HMG`,type:'HMG',x:x+370,y:y-120,hp:180,maxHp:180,known:false,alive:true},
      {id:`${name}-MTR`,type:'MORTEIRO',x:x+450,y:y+90,hp:150,maxHp:150,known:false,alive:true},
      {id:`${name}-BAT`,type:'BATERIA',x:x+650,y:y+260,hp:260,maxHp:260,known:false,alive:true},
      {id:`${name}-DEP`,type:'DEPÓSITO',x:x+820,y:y-260,hp:220,maxHp:220,known:false,alive:true}
    ];
    return initializeSector({id:idx,name,x,y,assets,units:[],allyStrength:65+rand(-8,8),enemyStrength:72+rand(-8,8),progress:0,status:'stalemate',lastRadio:0,known:false},idx);
  }

  function newState(){
    const sectors=sectorsData.map((d,i)=>buildSector(...d,i));
    return {
      time:0,paused:false,mode:'artillery',view:'cabin',station:null,
      robot:{x:8200,y:30000,facing:0,turret:0,armor:100,speed:0},
      cam:{x:8650,y:30000,zoom:.78,targetZoom:.78,manualX:0,manualY:0,mode:'follow'},
      bearing:90,elev:45,charge:4,azTarget:90,elTarget:45,ammo:{HE:18,SMOKE:8,FRAG:8},
      wind:{x:rand(-7,7),y:rand(-5,5)},shell:null,impactHold:0,returning:false,
      sectors,knownTargets:[],reports:[],mission:null,nextCommander:5.5,nextDiscovery:42,intel:null,intelQueue:[],intelSerial:0,
      effects:[],tracers:[],smokes:[],craters:[],radio:[],
      base:{x:7750,y:30000},
      strategicTick:0,clean:false,relocation:null,nextRelocation:35,routeCheckedAt:0,loading:null,loadedShell:'HE',launchDelay:0,shotElapsed:99,
      engine:createEngine(),engineLastArmor:100,engineNotice:'',
      warSimulation:{clock:0,accumulator:0,impacts:[],strategicTicks:0,detailedFronts:0,events:[],support:[],serial:0}
    };
  }

  function resize(){
    const r=app.getBoundingClientRect(); DPR=Math.min(2,window.devicePixelRatio||1); SW=Math.max(320,r.width); SH=Math.max(180,r.height);
    canvas.width=Math.round(SW*DPR);canvas.height=Math.round(SH*DPR);canvas.style.width=SW+'px';canvas.style.height=SH+'px';ctx.setTransform(DPR,0,0,DPR,0,0);
    cabin?.resize(SW,SH);
  }
  addEventListener('resize',resize); addEventListener('orientationchange',()=>setTimeout(resize,120));

  function worldToScreen(x,y){return {x:(x-state.cam.x)*state.cam.zoom+SW/2,y:(y-state.cam.y)*state.cam.zoom+SH/2};}
  function screenToWorld(x,y){return {x:(x-SW/2)/state.cam.zoom+state.cam.x,y:(y-SH/2)/state.cam.zoom+state.cam.y};}
  function visible(x,y,pad=100){const p=worldToScreen(x,y);return p.x>-pad&&p.x<SW+pad&&p.y>-pad&&p.y<SH+pad;}

  function setRadioChannel(channel){
    radioChannel=channel;
    document.querySelectorAll('[data-radio-channel]').forEach(b=>{const active=b.dataset.radioChannel===channel;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
    UI.radioLog.querySelectorAll('[data-channel]').forEach(row=>row.hidden=channel!=='all'&&row.dataset.channel!==channel);
  }
  function log(text,type='',meta={}){
    const channel=meta.channel||(type==='command'?'command':type==='intel'||type==='discovery'?'intel':'infantry');
    state.radio.push({text,type,channel,t:state.time});if(state.radio.length>120)state.radio.shift();
    const d=document.createElement(meta.intelId?'button':'div');d.className='radio-msg '+type+(meta.intelId?' radio-report':'');d.dataset.channel=channel;
    if(meta.intelId){d.type='button';d.dataset.intelId=meta.intelId;}
    d.innerHTML=text;d.hidden=radioChannel!=='all'&&radioChannel!==channel;UI.radioLog.appendChild(d);
    // Keep actionable reports even while ordinary field chatter is rotated out.
    while(UI.radioLog.children.length>120){const old=UI.radioLog.querySelector('.radio-msg:not(.radio-report)');if(!old)break;old.remove();}
    UI.radioLog.scrollTop=UI.radioLog.scrollHeight;
    return d;
  }

  function resetGame(){
    state=newState();resetInputs();finishCamera(state,SW);UI.intelBanner.classList.add('hidden');UI.radio.classList.add('hidden');UI.missionPill.classList.add('hidden');app.classList.remove('shot-cinematic'); UI.radioLog.innerHTML=''; selectedShell='HE';
    document.querySelectorAll('.ammo').forEach(b=>b.classList.toggle('active',b.dataset.shell==='HE'));
    cabin?.reset();seenWarEvents.clear();toastUntil=0;$('warToast').classList.add('hidden');setMode('artillery'); closeAllSheets();
    setRadioChannel('all');
    log('<b>COMANDO:</b> M-47 Mamute inserido no teatro. Aguarde sua primeira missão no canal de comando.','command');
    log('<b>INTEL:</b> informes e pedidos de apoio ficam neste rádio. Selecione um informe para visitar sua origem e posição.','intel');
    updateUI();
  }

  function resetInputs(){
    if(resettingInputs)return;resettingInputs=true;
    try{heldKeys.clear();controls.forEach(c=>c.reset());joy={x:0,y:0};cabinMove={x:0,y:0};panId=null;panStart=null;}finally{resettingInputs=false;}
  }
  function setMode(m){
    if(cinematicActive(state))return;
    resetInputs();state.mode=m;state.view=m==='march'?'field':'cabin';state.station=null;cabin?.leaveStation();
    if(m==='artillery'){state.azTarget=state.bearing;state.elTarget=state.elev;}
    syncControls();touchUI();
  }
  function syncControls(){
    const busy=cinematicActive(state);
    const interior=inside(),station=state.station,stationPanel=interior&&['aim','load'].includes(station);
    app.classList.toggle('inside',interior);app.classList.toggle('station-engaged',interior&&!!station);
    $('cabinUi').classList.toggle('hidden',!interior||!!sheetOpen);cabin?.setActive(interior&&!state.paused&&!sheetOpen);
    $('fieldStatus').classList.toggle('hidden',interior||busy||state.mode!=='march');
    $('leaveStationBtn').classList.toggle('hidden',!station);$('stationHeader').classList.toggle('hidden',!station);
    if(stationInfo[station]){$('stationName').textContent=stationInfo[station][0];$('stationDescription').textContent=stationInfo[station][1];}
    app.classList.toggle('shot-cinematic',busy);
    UI.march.classList.toggle('hidden',state.mode!=='march'||busy);
    UI.fireDeck.classList.toggle('hidden',busy||!!sheetOpen||!(stationPanel||(cabinFailed&&state.mode==='artillery')));UI.fireDeck.dataset.station=station||'aim';
    $('returnBtn')?.classList.toggle('hidden',!busy);
    $('cinematicStatus')?.classList.toggle('hidden',!busy);
    if($('flightReadout'))$('flightReadout').textContent=state.shell?`${Math.round(state.shell.z).toLocaleString('pt-BR')} m de altitude`:'Retorno automático ao compartimento';
    $('fireBtn').disabled=busy||!!state.shell||!!state.loading||state.ammo[selectedShell]<=0;
    $('fireBtn').textContent=state.launchDelay>0?'FOGO!':state.shell?'EM VOO':state.loading?'CARREGANDO':'DISPARAR';
    $('loadingText').textContent=loadingLabel(state.loading);
    document.querySelectorAll('.ammo').forEach(b=>b.disabled=!!state.loading);
    UI.intelBanner.classList.toggle('hidden',!busy);
    if(busy&&!state.intel){
      UI.intelTitle.textContent=state.cam.mode==='shell'?'PROJÉTIL EM VOO':state.cam.mode==='impact'?'IMPACTO':'RETORNANDO AO MAMUTE';
      UI.intelText.textContent=state.shell?`ALT ${Math.round(state.shell.z).toLocaleString('pt-BR')} m · ${Math.round(state.shell.t)} s de voo · tempo comprimido`:state.cam.mode==='impact'?'Observando o efeito no terreno':'Controles disponíveis ao chegar à peça';
    }
  }

  function toast(text,source='RÁDIO',seconds=7){$('warToastText').textContent=text;$('warToastSource').textContent=source;$('warToast').classList.remove('hidden');toastUntil=state.time+seconds;audio.radio();}
  function leaveStation(){
    // Clear ownership before control resets; a neutral joystick must never
    // re-enter station teardown and overflow the event-handler stack.
    state.station=null;UI.radio.classList.add('hidden');cabin?.leaveStation();resume();
  }
  function enterStation(id){
    if(!inside()||sheetOpen)return;resetInputs();
    if(id==='drive'){setMode('march');toast('Direção assumida. Confira a rota e avance pelo corredor aliado.','MOTORISTA');return;}
    state.station=id;syncControls();
    if(id==='map')openSheet('notebook');
    if(id==='radio'){openRadio();}
  }
  function requestMap(){
    if(cabinFailed){openSheet('notebook');return;}
    if(state.view==='field')setMode('artillery');
    if(state.station==='map')openSheet('notebook');
    else toast('Caminhe até a mesa de cartas e interaja com ela para traçar a solução.','CADERNETA');
  }

  function touchUI(){idleAt=performance.now();app.classList.remove('ui-idle');}

  function drawTerrain(){
    // procedurally tiled fields so any of the 80x60 km theatre has detail without a global map image
    ctx.fillStyle='#4b5142';ctx.fillRect(0,0,SW,SH);
    const cell=420, left=state.cam.x-SW/(2*state.cam.zoom), top=state.cam.y-SH/(2*state.cam.zoom);
    const x0=Math.floor(left/cell)-1,y0=Math.floor(top/cell)-1,x1=x0+Math.ceil(SW/(cell*state.cam.zoom))+3,y1=y0+Math.ceil(SH/(cell*state.cam.zoom))+3;
    for(let gx=x0;gx<x1;gx++)for(let gy=y0;gy<y1;gy++){
      const hash=Math.abs(Math.sin(gx*12.9898+gy*78.233));const col=hash>.67?'rgba(124,139,83,.13)':hash>.33?'rgba(35,75,43,.10)':'rgba(92,111,67,.10)';
      const p=worldToScreen(gx*cell,gy*cell);ctx.fillStyle=col;ctx.fillRect(p.x,p.y,cell*state.cam.zoom+1,cell*state.cam.zoom+1);
    }
    // dirt service road near the M-47 rear area
    drawRoad([{x:6900,y:30300},{x:7700,y:30000},{x:9000,y:30150},{x:10300,y:29600},{x:11800,y:29800}],130);
    // local detail dots / vegetation based on camera-grid hash
    const s=170;const sx=Math.floor(left/s)-1,sy=Math.floor(top/s)-1,ex=sx+Math.ceil(SW/(s*state.cam.zoom))+3,ey=sy+Math.ceil(SH/(s*state.cam.zoom))+3;
    for(let gx=sx;gx<ex;gx++)for(let gy=sy;gy<ey;gy++){
      const h=Math.sin(gx*31.4+gy*91.7)*43758.5;const f=h-Math.floor(h);if(f<.47)continue;
      const x=gx*s+(f*91)%s,y=gy*s+((f*131)%s);const p=worldToScreen(x,y);const r=(5+f*9)*state.cam.zoom;
      if(r<1)continue;ctx.fillStyle=f>.82?'#323b32':'#424939';ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
    }
  }

  function drawRoad(points,width){ctx.save();ctx.strokeStyle='#806e53';ctx.lineWidth=width*state.cam.zoom;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach((n,i)=>{const p=worldToScreen(n.x,n.y);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.stroke();ctx.strokeStyle='rgba(217,201,163,.22)';ctx.lineWidth=10*state.cam.zoom;ctx.stroke();ctx.restore();}

  function drawLocalDefense(){
    // Rear-area friendly trench and crews around the Mamute. No giant labels; it should read as part of the world.
    const tx=9000,ty=30000;drawTrench(tx,ty,'ally');const z=state.cam.zoom;
    for(let i=0;i<7;i++){const x=tx-15+((i%2)?12:-10),y=ty-190+i*60;if(!visible(x,y,60))continue;const p=worldToScreen(x,y);const duck=.55+.3*Math.sin(state.time*.8+i);const yy=p.y+duck*6*z;ctx.strokeStyle='#111';ctx.lineWidth=3*z;ctx.beginPath();ctx.moveTo(p.x,yy);ctx.lineTo(p.x+15*z,yy);ctx.stroke();ctx.fillStyle=COLORS.ally;ctx.beginPath();ctx.arc(p.x,yy,7*z,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ecd0bd';ctx.beginPath();ctx.arc(p.x,yy-9*z,4*z,0,Math.PI*2);ctx.fill();}
  }

  function drawBase(){
    const b=state.base;if(!visible(b.x,b.y,400))return;const p=worldToScreen(b.x,b.y),z=state.cam.zoom;
    ctx.fillStyle='#676457';ctx.fillRect(p.x-120*z,p.y-85*z,240*z,170*z);ctx.fillStyle='#9d8c69';ctx.fillRect(p.x-120*z,p.y-85*z,240*z,22*z);ctx.fillStyle='#20231f';ctx.fillRect(p.x-65*z,p.y-25*z,60*z,48*z);
    // A small CP mark keeps the structure readable without adding a theatre-wide label.
    ctx.fillStyle='rgba(8,12,9,.72)';ctx.fillRect(p.x-22*z,p.y-17*z,44*z,16*z);ctx.fillStyle='#d8c07e';ctx.font=`700 ${Math.max(8,9*z)}px ui-monospace,monospace`;ctx.textAlign='center';ctx.fillText('CP',p.x,p.y-5*z);ctx.textAlign='start';
  }

  function drawTrench(cx,cy,team){
    const path=trenchPath(cx,cy,team);ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=COLORS.trench;ctx.lineWidth=68*state.cam.zoom;ctx.beginPath();path.forEach((n,i)=>{const p=worldToScreen(n.x,n.y);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.stroke();ctx.strokeStyle=COLORS.lip;ctx.lineWidth=14*state.cam.zoom;ctx.stroke();ctx.restore();
  }



  function drawSector(sec){
    const front=getFrontGeometry(sec);
    if(distance(front.center,state.cam)>3000&&distance(sec,state.cam)>2400)return;
    drawTrench(front.allyTrench.x,front.allyTrench.y,'ally');drawTrench(front.enemyTrench.x,front.enemyTrench.y,'enemy');
    // subtle known friendly CP, no giant sector labels
    const cp=worldToScreen(sec.x-650,sec.y);const z=state.cam.zoom;ctx.fillStyle='#606257';ctx.fillRect(cp.x-55*z,cp.y-38*z,110*z,76*z);ctx.fillStyle='#6fc2ff';ctx.fillRect(cp.x-55*z,cp.y-38*z,110*z,8*z);
    for(const u of sec.units){
      const observation=state.intel?.sector===sec||(['shell','impact'].includes(state.cam.mode)&&distance(u,state.cam)<700);
      if(u.team==='enemy'&&distance(u,state.robot)>700&&!observation)continue;
      const p=worldToScreen(u.x,u.y);if(!visible(u.x,u.y,40))continue;
      if(u.inactive){if(u.downed){ctx.strokeStyle=u.team==='ally'?'#465651':'#694f42';ctx.lineWidth=5*z;ctx.beginPath();ctx.moveTo(p.x-6*z,p.y);ctx.lineTo(p.x+6*z,p.y+4*z);ctx.stroke();}continue;}
      const color=u.team==='ally'?'#75937a':'#9b7d62',dir=u.team==='ally'?1:-1,yy=p.y+u.duck*6*z;
      ctx.fillStyle='rgba(8,13,8,.35)';ctx.beginPath();ctx.ellipse(p.x+2*z,yy+4*z,9*z,5*z,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#182219';ctx.lineWidth=(u.role==='mg'?4:2)*z;ctx.beginPath();ctx.moveTo(p.x,yy);ctx.lineTo(p.x+dir*17*z,yy-2*z);ctx.stroke();
      ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(p.x,yy,6*z,(u.duck>.6?4:8)*z,0,0,Math.PI*2);ctx.fill();
      if(u.duck<.6){ctx.fillStyle='#d0b596';ctx.beginPath();ctx.arc(p.x,yy-7*z,3.5*z,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle=u.team==='ally'?'#435e46':'#6e604b';ctx.beginPath();ctx.arc(p.x,yy-(u.duck>.6?2:10)*z,4.5*z,Math.PI,Math.PI*2);ctx.fill();
      if(u.pop>.1){ctx.fillStyle='#f2d795';ctx.beginPath();ctx.arc(p.x+dir*19*z,yy-2*z,3*z,0,Math.PI*2);ctx.fill();}
      if(u.hitFlash>.01){
        const fade=Math.min(1,u.hitFlash/.3);ctx.strokeStyle=`rgba(255,224,133,${fade})`;ctx.lineWidth=Math.max(1,1.8*z);ctx.beginPath();ctx.arc(p.x,yy-3*z,8*z,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle=`rgba(255,244,183,${fade})`;ctx.fillRect(p.x-2*z,yy-13*z,4*z,4*z);
      }
    }
    if(sec.war&&visible(front.allyLine.x-40,front.allyLine.y-285,50)){
      const p=worldToScreen(front.allyLine.x-40,front.allyLine.y-285);ctx.font='9px ui-monospace,monospace';ctx.fillStyle='#d5d1ad';ctx.fillText(phaseLabels[sec.war.ally.phase],p.x-35,p.y);
    }
    for(const a of sec.assets){if(!a.alive)continue;if(!a.known && distance(a,state.robot)>620 && !(state.intel&&state.intel.target===a&&state.intel.stage==='target'))continue;drawAsset(a);}
  }

  function drawAsset(a){
    const p=worldToScreen(a.x,a.y),z=state.cam.zoom;ctx.fillStyle=COLORS.bunker;ctx.fillRect(p.x-42*z,p.y-26*z,84*z,52*z);ctx.fillStyle=COLORS.sand;ctx.fillRect(p.x-42*z,p.y-26*z,84*z,10*z);ctx.strokeStyle='#151515';ctx.lineWidth=5*z;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-30*z,p.y);ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,.68)';ctx.fillRect(p.x-35*z,p.y-48*z,70*z,17*z);ctx.fillStyle='#ffd0c9';ctx.font=`${Math.max(8,10*z)}px system-ui`;ctx.textAlign='center';ctx.fillText(a.type,p.x,p.y-36*z);ctx.textAlign='start';
    ctx.fillStyle='rgba(255,255,255,.15)';ctx.fillRect(p.x-34*z,p.y+32*z,68*z,5*z);ctx.fillStyle='#ff8378';ctx.fillRect(p.x-34*z,p.y+32*z,68*z*(a.hp/a.maxHp),5*z);
  }

  function drawRobot(r=state.robot,name=state.serverMamute?.name||'M–47',remote=false){
    const p=worldToScreen(r.x,r.y),z=state.cam.zoom,s=43*z;
    if(!visible(r.x,r.y,140))return;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(r.facing);
    ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(-s-3, -s*.68+8*z, s*2+12*z,s*1.4);
    for(const side of [-1,1]){
      ctx.fillStyle='#202821';ctx.fillRect(-s*1.12,side*s*.7-8*z,s*2.24,16*z);
      for(let i=0;i<10;i++){ctx.fillStyle=i%2?'#606354':'#454c41';ctx.fillRect(-s+i*9*z,side*s*.7-7*z,6*z,14*z);}
    }
    ctx.fillStyle='#776b43';ctx.fillRect(-s,-s*.62,s*2,s*1.24);
    ctx.fillStyle='#b3a06b';ctx.fillRect(-s*.86,-s*.48,s*1.72,s*.92);
    ctx.fillStyle='#4f553b';ctx.fillRect(-s*.78,-s*.36,s*.5,s*.72);
    for(let i=0;i<5;i++){ctx.fillStyle='#343e30';ctx.fillRect(-s*.72+i*4*z,-s*.28,2*z,s*.56);}
    ctx.strokeStyle='#e0d39a';ctx.lineWidth=z;ctx.strokeRect(-s*.86,-s*.48,s*1.72,s*.92);
    if(state.mode==='artillery'){ctx.strokeStyle='#6f705c';ctx.lineWidth=7*z;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(-s*.55,side*s*.4);ctx.lineTo(-s*.7,side*s);ctx.lineTo(-s*.3,side*s);ctx.stroke();}}
    ctx.restore();
    const el=rad(state.mode==='artillery'?state.elev:12),length=(78-(r.recoil||0)*13)*z;
    // Top-down rendering has no vertical screen axis for shell altitude. Keep
    // the tube's map-plane projection on the exact same bearing as the shell;
    // elevation only shortens that projection instead of bending it sideways.
    const direction=bearingVector(!remote&&state.mode==='artillery'?state.bearing:deg(r.turret+Math.PI/2));
    const bx=direction.x*length*Math.cos(el), by=direction.y*length*Math.cos(el);
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='#525e40';ctx.beginPath();ctx.ellipse(0,0,23*z,18*z,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#343d2c';ctx.lineCap='round';ctx.lineWidth=14*z;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(bx,by);ctx.stroke();
    ctx.strokeStyle='#c9bc87';ctx.lineWidth=8*z;ctx.beginPath();ctx.moveTo(1,-3*z);ctx.lineTo(bx,by-3*z);ctx.stroke();
    ctx.fillStyle='#111910';ctx.beginPath();ctx.arc(bx,by-3*z,4.5*z,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d5c385';ctx.font=`600 ${9*z}px monospace`;ctx.textAlign='center';ctx.fillText(name,-16*z,29*z);ctx.restore();
    if(remote){ctx.strokeStyle=r.faction===globalThis.ironRainEntry?.faction?'#71c3ff':'#ed8070';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(p.x-25*z,p.y-40*z);ctx.lineTo(p.x+25*z,p.y-40*z);ctx.stroke();}
  }

  function drawPlane(){if(!state.intel||state.intel.source!=='plane')return;const t=state.intel;const x=t.sourcePos.x+(t.elapsed*180)%700-350,y=t.sourcePos.y-260;const p=worldToScreen(x,y),z=state.cam.zoom;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(.06);ctx.fillStyle='#dfe5dc';ctx.beginPath();ctx.moveTo(-24*z,0);ctx.lineTo(18*z,0);ctx.lineTo(34*z,-9*z);ctx.lineTo(38*z,-5*z);ctx.lineTo(24*z,3*z);ctx.lineTo(2*z,4*z);ctx.lineTo(-4*z,20*z);ctx.lineTo(-9*z,20*z);ctx.lineTo(-8*z,3*z);ctx.lineTo(-24*z,7*z);ctx.closePath();ctx.fill();ctx.restore();}
  function drawObserver(){if(!state.intel||state.intel.source==='plane')return;const p=worldToScreen(state.intel.sourcePos.x,state.intel.sourcePos.y),z=state.cam.zoom;ctx.fillStyle='#273a2b';ctx.fillRect(p.x-11*z,p.y-6*z,12*z,17*z);ctx.strokeStyle='#cfbd73';ctx.lineWidth=2*z;ctx.beginPath();ctx.moveTo(p.x-9*z,p.y);ctx.lineTo(p.x-9*z,p.y-28*z);ctx.stroke();ctx.fillStyle=COLORS.ally;ctx.beginPath();ctx.arc(p.x,p.y,7*z,0,Math.PI*2);ctx.fill();}

  function drawTracers(){for(const t of state.tracers){const a=worldToScreen(t.x,t.y),b=worldToScreen(t.x2,t.y2),fade=Math.max(0,Math.min(1,t.life/t.max));ctx.strokeStyle=t.team==='ally'?`rgba(173,225,255,${fade*(t.hit?.95:.72)})`:`rgba(255,176,167,${fade*(t.hit?.98:.72)})`;ctx.lineWidth=t.hit?2.8:1.5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();if(t.hit){ctx.fillStyle=`rgba(255,224,133,${fade})`;ctx.beginPath();ctx.arc(b.x,b.y,3.5,0,Math.PI*2);ctx.fill();}}}
  function drawEffects(){for(const e of state.effects){const p=worldToScreen(e.x,e.y),progress=1-e.life/e.start;if(e.type==='blast'){const r=(e.max||100)*progress*state.cam.zoom;ctx.fillStyle=`rgba(255,164,71,${Math.max(0,e.life/e.start)*.55})`;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();}else if(e.type==='fragments'){const fade=Math.max(0,e.life/e.start),r=e.max*(.12+.88*progress)*state.cam.zoom;ctx.strokeStyle=`rgba(255,218,117,${fade*.85})`;ctx.lineWidth=Math.max(1,1.6*state.cam.zoom);ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();for(let i=0;i<14;i++){const a=i*Math.PI*2/14+.18,inner=r*(.16+.08*Math.sin(i*2.4)),outer=r*(.72+.2*Math.sin(i*4.1+1.3));ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*inner,p.y+Math.sin(a)*inner);ctx.lineTo(p.x+Math.cos(a)*outer,p.y+Math.sin(a)*outer);ctx.stroke();}}else if(e.type==='mark'){ctx.strokeStyle=`rgba(255,221,120,${Math.max(0,e.life/e.start)})`;ctx.setLineDash([7,6]);ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,38*state.cam.zoom,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}}}
  function drawCrater(){for(const c of state.craters){const p=worldToScreen(c.x,c.y);ctx.fillStyle='rgba(40,29,21,.35)';ctx.beginPath();ctx.ellipse(p.x,p.y,c.r*state.cam.zoom*1.3,c.r*state.cam.zoom,0,0,Math.PI*2);ctx.fill();}}
  function drawSmokes(){for(const s of state.smokes){const p=worldToScreen(s.x,s.y);ctx.fillStyle=`rgba(224,229,225,${Math.min(.35,s.life/8*.35)})`;ctx.beginPath();ctx.arc(p.x,p.y,s.r*state.cam.zoom,0,Math.PI*2);ctx.fill();}}
  function drawShell(){if(!state.shell)return;const s=state.shell,p=worldToScreen(s.x,s.y);ctx.fillStyle='#ffe08a';ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.fillText(`ALT ${Math.max(0,Math.round(s.z))} m`,p.x+12,p.y-10);}

  function draw(){
    if(document.querySelector('.strategic-war:not(.hidden)'))return;
    if(inside()&&cabin){try{cabin.render();return;}catch(error){console.error('Cabin render failed:',error);cabinFailed=true;state.view='field';syncControls();}}
    ctx.clearRect(0,0,SW,SH);drawTerrain();drawBase();drawCrater();drawSmokes();
    const view={worldToScreen,visible,zoom:state.cam.zoom,time:state.time,width:SW,height:SH};
    drawWarInfrastructure(ctx,state,view);for(const s of state.sectors)drawSector(s);drawObserver();drawPlane();for(const m of state.serverMamutes||[])if(m.id!==state.serverMamute?.id)drawRobot({...m.robot,faction:m.faction},m.name,true);drawRobot();drawTracers();drawShell();drawEffects();drawWarAtmosphere(ctx,state,view);
    if(state.mode==='march'&&state.relocation){const o=state.relocation,p=worldToScreen(o.x,o.y);if(visible(o.x,o.y,80)){ctx.strokeStyle='#c9bc8d';ctx.lineWidth=2;ctx.strokeRect(p.x-14,p.y-14,28,28);ctx.fillStyle='#e4d8ad';ctx.font='9px monospace';ctx.fillText('POSIÇÃO SOLICITADA',p.x+20,p.y+4);}}
  }



  function chooseUnknownTarget(){
    const queued=new Set(state.intelQueue.map(i=>i.target.id));
    // The first mission deliberately demonstrates the scale: a real long-range call roughly 40 km away.
    if(state.knownTargets.length===0){const s=state.sectors[3],a=s.assets[0];if(a.alive&&!queued.has(a.id))return {s,a};}
    const list=[];for(const s of state.sectors)for(const a of s.assets)if(a.alive&&!queued.has(a.id)&&distance(state.robot,a)<55500)list.push({s,a});
    // Once the available assets have reports, command can renew an old live
    // objective. This never reveals a different target without a transmission.
    if(!list.length)for(const s of state.sectors)for(const a of s.assets)if(a.alive&&a!==state.mission?.target&&distance(state.robot,a)<55500)list.push({s,a});
    return list.length?list[Math.floor(rand(0,list.length))]:null;
  }
  function queueIntel(kind='discovery'){
    const pick=chooseUnknownTarget();if(!pick)return false;
    const source=distance(state.robot,pick.a)>18000?'plane':state.intelSerial%2?'scout':'radio';
    const sourcePos=source==='plane'?{x:pick.s.x-600,y:pick.s.y-700}:{x:pick.s.x-470,y:pick.s.y-90};
    const item={id:'intel-'+(++state.intelSerial),kind,sector:pick.s,target:pick.a,source,sourcePos,created:state.time,opened:false};
    // The transmission includes a coordinate, but the target stays hidden
    // until the operator opens the report and the camera confirms it.
    item.report={id:pick.a.id,type:pick.a.type,x:pick.a.x,y:pick.a.y,reportedAt:state.time,source,sourcePos:{...sourcePos}};
    state.intelQueue.push(item);
    if(state.intelQueue.length>40){const removed=state.intelQueue.shift();UI.radioLog.querySelector(`[data-intel-id="${removed.id}"]`)?.remove();}
    const command=kind==='mission';
    log(`<span class="radio-tag">${command?'ORDEM DO COMANDANTE · ALTA PRIORIDADE':'DESCOBERTA · APOIO VOLUNTÁRIO'}</span><b>${pick.a.type} · ${pick.s.name}</b><span>X${fmt(item.report.x)} Y${fmt(item.report.y)} · ${Math.round(distance(state.robot,item.report)/100)/10} km</span><small class="radio-report-status">VER ORIGEM → POSIÇÃO → MAMUTE</small>`,command?'command':'discovery',{channel:command?'command':'intel',intelId:item.id});
    toast(command?'Nova missão recebida no canal COMANDO.':'Novo informe no canal INFORMAÇÕES. Apoio voluntário.',command?'COMANDANTE':'RÁDIO',5);
    return true;
  }
  function startIntel(item){
    if(state.shell||cinematicActive(state))return;
    const {sector:sec,source,sourcePos}=item;
    UI.radio.classList.add('hidden');state.station=null;cabin?.leaveStation();resetInputs();
    item.opened=true;
    const row=UI.radioLog.querySelector(`[data-intel-id="${item.id}"]`);row?.classList.add('read');
    const status=row?.querySelector('.radio-report-status');if(status)status.textContent='INFORME CONSULTADO · VER NOVAMENTE';
    // Use the transmitted coordinate, not a continuously tracking enemy marker.
    state.intel={...item,target:item.target,stage:'source',elapsed:0};state.cam.mode='intel';
    // Short cut to the reporting team; retain local scale across distant theatres.
    state.cam.x=sourcePos.x;state.cam.y=sourcePos.y;
    UI.intelTitle.textContent=source==='plane'?'RECONHECIMENTO AÉREO':source==='scout'?'PATRULHA DE RECONHECIMENTO':'OBSERVADOR AVANÇADO';
    UI.intelText.textContent=`Origem da transmissão · frente ${sec.name}`;
    syncControls();
  }
  function recordReport(I){
    I.target.known=true;I.sector.known=true;
    if(!state.knownTargets.includes(I.target))state.knownTargets.push(I.target);
    const report={id:I.target.id,type:I.target.type,x:I.target.x,y:I.target.y,reportedAt:state.time,source:I.source,sourcePos:{...I.sourcePos}};
    const index=state.reports.findIndex(r=>r.id===report.id);
    if(index<0)state.reports.push(report);else state.reports[index]=report;
    return report;
  }
  function updateIntel(dt){
    const I=state.intel;if(!I)return;I.elapsed+=dt;
    const target=I.stage==='source'?I.sourcePos:I.target,a=smooth(4,dt);
    state.cam.x=lerp(state.cam.x,target.x,a);state.cam.y=lerp(state.cam.y,target.y,a);
    if(I.stage==='source'&&I.elapsed>=2){
      I.stage='target';I.elapsed=0;recordReport(I);
      UI.intelText.textContent=`${I.target.type} · X${fmt(I.target.x)} Y${fmt(I.target.y)} · referência recebida`;
    }else if(I.stage==='target'&&I.elapsed>=2.5){
      const finished=I;recordReport(finished);if(finished.kind==='mission')createMission(finished.sector,finished.target,finished.source);
      state.intel=null;beginReturn(state);
    }
  }
  function skipCinematic(){
    const intel=state.intel;
    if(intel){recordReport(intel);if(intel.kind==='mission')createMission(intel.sector,intel.target,intel.source);state.intel=null;}
    if(state.shell)state.shell.follow=false;
    resetInputs();finishCamera(state,SW);syncControls();touchUI();
  }

  function createMission(sec,target,source){
    state.mission={sector:sec,target,source,created:state.time,report:state.reports.find(r=>r.id===target.id)};UI.missionPill.classList.remove('hidden');UI.missionTitle.textContent=`${source==='plane'?'RECON':'FO'} • ${target.type}`;UI.missionText.textContent=`X${fmt(target.x)} Y${fmt(target.y)} • ${Math.round(distance(state.robot,target)/100)/10} km`;
    updateNotebook();
  }
  function clearMission(){
    const targetId=state.mission?.target.id;state.mission=null;UI.missionPill.classList.add('hidden');updateNotebook();state.nextCommander=state.time+600;
    for(const item of state.intelQueue)if(item.kind==='mission'&&item.target.id===targetId){const row=UI.radioLog.querySelector(`[data-intel-id="${item.id}"]`);row?.classList.add('completed');const label=row?.querySelector('.radio-tag');if(label)label.textContent='MISSÃO CONCLUÍDA';}
    log('<b>COMANDO:</b> objetivo neutralizado. Próxima missão em dez minutos. Apoios de oportunidade continuam disponíveis.','command');
  }

  function fireShell(){
    if(state.mode!=='artillery'||state.shell||state.loading||state.paused||sheetOpen||cinematicActive(state)||(!cabinFailed&&state.station!=='aim'))return;
    if(state.ammo[selectedShell]<=0){log(`<b>CARREGADOR:</b> ${selectedShell} esgotado.`,'bad');return;}
    if(serverClient){serverClient.fire();return;}
    resetInputs();state.ammo[selectedShell]--;
    const solution=ballistics(state.charge,state.elev);
    state.shell={x:state.robot.x,y:state.robot.y,z:0,origin:{x:state.robot.x,y:state.robot.y},solution,bearing:state.bearing,wind:{...state.wind},type:selectedShell,t:0,follow:true,compression:clamp(solution.tof/7,2,28)};
    state.launchDelay=cabinFailed?0:.75;state.shotElapsed=0;
    state.cam.mode=state.launchDelay?'follow':'shell';state.cam.elapsed=0;state.impactHold=0;state.returning=false;state.robot.recoil=1;
    state.loading=beginLoading(selectedShell,selectedShell);audio.fire();
    log(`<b>MAMUTE:</b> ${selectedShell} · Az ${state.bearing.toFixed(1)}° · El ${state.elev.toFixed(1)}° · C${state.charge} · alcance nominal ${Math.round(solution.range)} m.`);
    touchUI();updateUI();syncControls();
  }
  function applyImpact(x,y,type){
    const result=applyWarImpact(state,x,y,type);
    state.effects.push({type:'blast',x,y,life:type==='SMOKE'?.7:1.1,start:type==='SMOKE'?.7:1.1,max:type==='FRAG'?210:type==='HE'?145:80});
    if(type==='FRAG')state.effects.push({type:'fragments',x,y,life:1.25,start:1.25,max:330});
    if(type!=='SMOKE'){state.craters.push({x,y,r:rand(22,38)});if(state.craters.length>140)state.craters.shift();}
    for(const {asset,sector} of result.destroyed){if(asset.known)log(`<b>OBSERVADOR:</b> ${asset.type} neutralizado em ${sector.name}.`,'good');}
    if(result.friendlyHits||result.robotDamage)log('<b>RÁDIO:</b> fogo amigo! Nossa linha foi atingida. Confira as coordenadas.','bad');
    const observed=distance(state.robot,{x,y})<900||(['shell','impact'].includes(state.cam.mode)&&distance(state.cam,{x,y})<800)||result.affected.some(hit=>hit.sector.known);
    if(type==='FRAG'&&observed&&result.affected.some(hit=>hit.team==='enemy'))log(`<b>FO:</b> fragmentação atingiu a trincheira inimiga — ${result.enemyCasualties?`${result.enemyCasualties} combatente(s) fora de combate`:'infantaria suprimida; baixa não confirmada'}.`,'good');
    if(observed)audio.impact();
    if(x<0||x>WORLD.w||y<0||y>WORLD.h){log('<b>RÁDIO:</b> disparo além dos limites do teatro. Sem observador para corrigir.');return;}
    if(type==='SMOKE')log(`<b>RÁDIO:</b> cortina de fumaça em X${fmt(x)} Y${fmt(y)}; bloqueia linhas de tiro.`);
    if(state.mission){
      const d=Math.hypot(state.mission.target.x-x,state.mission.target.y-y);
      if(!state.mission.target.alive||(type==='SMOKE'&&d<220)){
        log(`<b>FO:</b> ${type==='SMOKE'?'posição coberta. Infantaria aproveitando a cortina.':'objetivo neutralizado. A linha está reagindo ao apoio.'}`,'good');clearMission();
      }else if(d<3000)log(`<b>FO:</b> impacto observado a aproximadamente ${Math.round(d)} m da referência. ${d<140?'Efeito parcial; alvo ainda ativo.':'Confira régua, carga e manivelas.'}`);
      else log('<b>FO:</b> queda fora da nossa área de observação. Sem correção confirmada.');
    }
  }
  function updateShell(dt){
    const s=state.shell;if(!s)return;
    if(state.launchDelay>0){state.launchDelay=Math.max(0,state.launchDelay-dt);if(state.launchDelay===0&&s.follow){state.cam.mode='shell';state.cam.elapsed=0;syncControls();}return;}
    s.t=Math.min(s.solution.tof,s.t+dt*s.compression);
    Object.assign(s,sampleTrajectory(s.solution,s.origin,s.bearing,s.wind,s.t));
    if(s.follow&&state.cam.mode==='shell'){state.cam.x=s.x;state.cam.y=s.y;}
    if(s.t>=s.solution.tof){
      state.lastShot={x:s.x,y:s.y,origin:s.origin,range:s.solution.range,apex:s.solution.apex,tof:s.solution.tof,charge:s.solution.charge,elev:s.solution.elevation};
      applyImpact(s.x,s.y,s.type);state.shell=null;
      if(s.follow&&state.cam.mode==='shell'){state.impactHold=1.65;state.cam.mode='impact';}
    }
  }
  function updateCamera(dt){stepCamera(state,dt,SW);syncControls();}

  function updateRobot(dt){
    state.robot.speed=0;if(state.mode!=='march'||cinematicActive(state)||sheetOpen)return;
    if(!engineCanDrive(state.engine)){
      // A disabled Mamute returns to its local cabin so the crew can fight
      // the fire and repair the engine instead of driving through damage.
      if(state.engineNotice!=='disabled'){state.engineNotice='disabled';toast('Motor avariado. A tração volta após o reparo da tripulação.','MOTOR',8);}
      return;
    }
    const v={x:joy.x+(heldKeys.has('right')?1:0)-(heldKeys.has('left')?1:0),y:joy.y+(heldKeys.has('back')?1:0)-(heldKeys.has('forward')?1:0)},n=Math.max(1,Math.hypot(v.x,v.y));v.x/=n;v.y/=n;
    const sp=38*(state.robot.armor<=0?.2:1);state.robot.speed=Math.hypot(v.x,v.y)*sp;state.robot.x=clamp(state.robot.x+v.x*sp*dt,400,WORLD.w-400);state.robot.y=clamp(state.robot.y+v.y*sp*dt,400,WORLD.h-400);if(Math.hypot(v.x,v.y)>.08)state.robot.facing=Math.atan2(v.y,v.x);state.robot.turret+=angDiff(state.robot.turret,state.robot.facing)*smooth(7,dt);
  }
  function updateGun(dt){if(state.mode!=='artillery'||state.shell||cinematicActive(state)||sheetOpen)return;const bd=((state.azTarget-state.bearing+540)%360)-180;state.bearing=(state.bearing+clamp(bd,-16*dt,16*dt)+360)%360;state.elev+=clamp(state.elTarget-state.elev,-8*dt,8*dt);const direction=bearingVector(state.bearing);state.robot.turret=Math.atan2(direction.y,direction.x);}

  function updateWarMessages(){
    for(const event of state.warSimulation?.events||[]){
      const eventId=String(event.id);if(seenWarEvents.has(eventId))continue;
      const sector=state.sectors.find(s=>s.id===event.sector);
      const observed=sector&&(distance(getFrontGeometry(sector).center,state.robot)<1800||state.intel?.sector===sector||(['shell','impact'].includes(state.cam.mode)&&distance(getFrontGeometry(sector).center,state.cam)<1000));
      if(event.team!=='ally'&&!observed)continue;
      seenWarEvents.add(eventId);if(seenWarEvents.size>120){const first=seenWarEvents.values().next().value;seenWarEvents.delete(first);}
      log(`<b>${event.team==='ally'?'INFANTARIA':'OBSERVADOR'}:</b> ${event.text}`,'war',{channel:event.team==='ally'?'infantry':'intel'});
    }
  }
  function updateRelocation(){
    if(state.time>=state.nextRelocation&&!state.relocation){
      const candidates=state.sectors.filter(sec=>sec.war&&distance(sec,state.robot)<12000&&sec.allyStrength>28).sort((a,b)=>distance(a,state.robot)-distance(b,state.robot));
      const sec=candidates[0];state.nextRelocation=state.time+90;
      if(sec){const f=getFrontGeometry(sec),x=f.allyLine.x-390,y=f.allyLine.y+85;
        if(distance({x,y},state.robot)>110){state.relocation={x,y,sector:sec.id,name:sec.name,status:'checking',checkAt:state.time+7,route:null};log(`<b>LOGÍSTICA:</b> M-47, preparar deslocamento para X${fmt(x)} Y${fmt(y)}. Patrulha verificando o acesso.`,'intel');toast(`Posição solicitada: X${fmt(x)} Y${fmt(y)}. Patrulha em reconhecimento do caminho.`,'LOGÍSTICA');}
      }
    }
    const order=state.relocation;
    if(order&&state.time>=order.checkAt){
      const prior=order.status;order.route=assessRoute(state,state.robot,order);order.status=order.route.safe?'cleared':'contested';order.checkAt=state.time+8;
      if(prior!==order.status){const report=order.route.safe?'Patrulha liberou o corredor. Avance com o Mamute.':'Acesso contestado. Infantaria precisa cobrir o corredor antes do deslocamento.';log(`<b>PATRULHA:</b> ${report}`,'intel');toast(report,'PATRULHA');}
      if(distance(state.robot,order)<85){log('<b>LOGÍSTICA:</b> posição alcançada. Municiamento e reparos entregues.','good');toast('Posição alcançada. Reabastecimento concluído.','LOGÍSTICA');for(const type of ['HE','FRAG','SMOKE'])state.ammo[type]+=type==='HE'?6:3;state.robot.armor=Math.min(100,state.robot.armor+20);state.relocation=null;state.nextRelocation=state.time+100;}
    }
    if(state.mode==='march'&&state.time>=state.routeCheckedAt){
      state.routeCheckedAt=state.time+4;
      const destination=order||{x:state.robot.x+Math.cos(state.robot.facing)*220,y:state.robot.y+Math.sin(state.robot.facing)*220},route=assessRoute(state,state.robot,destination);
      $('routeText').textContent=order?`${order.status==='checking'?'PATRULHA EM VERIFICAÇÃO':route.safe?'CORREDOR LIBERADO':'ACESSO CONTESTADO'} · X${fmt(order.x)} Y${fmt(order.y)} · ${Math.round(distance(state.robot,order))} m`:`${route.safe?'Corredor aliado coberto':'Terreno sem cobertura confirmada'} · blindagem ${Math.round(state.robot.armor)}%`;
      if(state.robot.speed>2){const ambush=checkRouteAmbush(state,route,4);if(ambush)toast('Emboscada no corredor exposto! Recuar para a cobertura da infantaria.','TRIPULAÇÃO');}
    }
  }

  function updatePlayerHits(){
    const hits=state.warSimulation?.playerHits||[];
    while(hits.length){
      const hit=hits.shift(),armor=Math.round(state.robot.armor);
      const weapon={hmg:'HMG',rifle:'FUZIS',tank:'TANQUE',mortar:'MORTEIRO',battery:'BATERIA'}[hit.kind]||'FOGO INIMIGO';
      toast(`${weapon} inimigo atingiu o Mamute · blindagem ${armor}%`,'CONTATO',3.6);
      audio.impact();
      state.effects.push({x:state.robot.x,y:state.robot.y,life:.34,start:.34,max:42,type:'blast'});
    }
  }
  function updateEffects(dt){for(const e of state.effects)e.life-=dt;state.effects=state.effects.filter(e=>e.life>0);for(const s of state.smokes)s.life-=dt;state.smokes=state.smokes.filter(s=>s.life>0);}

  function update(dt){
    if(!state||state.paused)return;state.time+=dt;state.robot.recoil=Math.max(0,(state.robot.recoil||0)-dt*3);
    state.shotElapsed+=dt;
    if(!serverClient&&state.loading){const oldPhase=state.loading.phase;stepLoading(state.loading,dt);const loaderCue=loaderAudioCue(oldPhase,state.loading);if(loaderCue)audio.load(loaderCue);if(state.loading.complete){state.loadedShell=state.loading.to;state.loading=null;}}
    if(!serverClient&&state.mission&&!state.mission.target.alive)clearMission();
    if(!serverClient&&!state.mission&&state.time>=state.nextCommander){state.nextCommander=queueIntel('mission')?Infinity:state.time+30;}
    if(!serverClient&&state.time>=state.nextDiscovery){queueIntel('discovery');state.nextDiscovery=state.time+rand(65,100);}
    if(serverClient){
      const v={x:joy.x+(heldKeys.has('right')?1:0)-(heldKeys.has('left')?1:0),y:joy.y+(heldKeys.has('back')?1:0)-(heldKeys.has('forward')?1:0)};
      serverClient.update(dt,v,state.mode==='march'&&!sheetOpen);
      updateWar(state,dt);updateCamera(dt);updateEffects(dt);
      selectedShell=state.serverSelectedShell||selectedShell;
      $('routeText').textContent=`${state.serverMamute?.name||'MAMUTE'} · blindagem ${Math.round(state.robot.armor)}% · ${engineCanDrive(state.engine)?'tração disponível':'motor avariado'}`;
      app.classList.toggle('hull-critical',state.robot.armor>0&&state.robot.armor<=30);
      if(state.robot.armor>0&&state.robot.armor<=30)audio.alarm?.();
      const loss=$('serverLoss');if(loss){loss.hidden=!state.serverMamute?.destroyed;$('serverRespawn').disabled=state.time<(state.serverMamute?.respawnAt||Infinity);}
    }else{updateRobot(dt);updateGun(dt);updateIntel(dt);updateShell(dt);updateCamera(dt);updateWar(state,dt);updatePlayerHits();updateEffects(dt);updateWarMessages();updateRelocation();}
    const armorBefore=state.engineLastArmor??state.robot.armor;
    const armorLoss=Math.max(0,armorBefore-state.robot.armor);
    if(!serverClient&&armorLoss>0){
      const hit=damageEngine(state.engine,armorLoss);
      if(hit.ignited){state.engineNotice='fire';log('<b>MOTOR:</b> impacto rompeu linhas de combustível. Incêndio no compartimento traseiro.','bad',{channel:'infantry'});toast('INCÊNDIO NO MOTOR · pegue o extintor e avance até a sala de máquinas.','MOTOR',9);audio.impact();}
      else if(hit.disabled&&state.engineNotice!=='disabled'){state.engineNotice='disabled';log('<b>MOTOR:</b> tração perdida após o impacto.','bad',{channel:'infantry'});toast('MOTOR AVARIADO · tração bloqueada.','MOTOR',8);}
    }
    state.engineLastArmor=state.robot.armor;
    const walking=inside()&&enabled()&&!state.station;
    const move={x:walking?clamp(cabinMove.x+(heldKeys.has('right')?1:0)-(heldKeys.has('left')?1:0),-1,1):0,y:walking?clamp(cabinMove.y+(heldKeys.has('back')?1:0)-(heldKeys.has('forward')?1:0),-1,1):0};
    try{cabin?.update(dt,{move,bearing:state.bearing,elevation:state.elev,charge:state.charge,shellType:selectedShell,wind:state.wind,own:state.robot,mission:state.mission?.report,paused:!!sheetOpen||!UI.radio.classList.contains('hidden'),loading:state.loading,recoil:state.robot.recoil,shotElapsed:state.shotElapsed,engine:state.engine,hatchOpen:state.serverMamute?.hatchOpen});}catch(error){console.error('Cabin update failed:',error);cabinFailed=true;state.view='field';syncControls();}
    let cabinPosition=null;try{cabinPosition=cabin?.snapshot?.().position||null;}catch(error){console.error('Cabin snapshot failed:',error);cabinFailed=true;state.view='field';syncControls();}
    const nearEngine=inside()&&cabinPosition&&Math.hypot(cabinPosition.x-.82,cabinPosition.z-6.6)<=1.35;
    const engineEvent=serverClient?null:stepEngine(state.engine,dt,{nearEngine});
    if(engineEvent?.message){
      state.engineNotice=engineEvent.kind;
      log(`<b>MOTOR:</b> ${engineEvent.message}` ,engineEvent.kind==='repaired'?'good':'intel',{channel:'infantry'});
      toast(engineEvent.message,'MOTOR',6);
      audio.load?.();
    }
    audio.update({time:state.time,moving:Math.hypot(move.x,move.y)>.1,inside:inside(),speed:state.robot.speed,paused:state.paused});
    if(inside()&&cabin&&!state.station){const focus=cabin.getFocus();$('cabinPrompt').textContent=focus?`${focus.label} · ${focus.distance.toFixed(1)} m`:touchMode?'Ande pela cabine · arraste para olhar':'Ande pela cabine · clique no cenário para olhar em 360°';$('interactBtn').disabled=!focus;$('interactBtn').textContent=focus?`${touchMode?'':'E · '}${focus.action||focus.label}`:'APROXIME-SE DE UM POSTO';}
    if(state.time>toastUntil)$('warToast').classList.add('hidden');
    uiClock+=dt;if(uiClock>.08){uiClock=0;updateUI();}
    if(performance.now()-idleAt>3500)app.classList.add('ui-idle');
  }

  function updateUI(){
    UI.own.textContent=`X${fmt(state.robot.x)} Y${fmt(state.robot.y)}`;UI.wind.textContent=`VENTO ${state.wind.x>=0?'L':'O'} ${Math.abs(state.wind.x).toFixed(1)} / ${state.wind.y>=0?'S':'N'} ${Math.abs(state.wind.y).toFixed(1)}`;UI.ammo.textContent=`HE ${state.ammo.HE} • SMK ${state.ammo.SMOKE} • FRG ${state.ammo.FRAG}`;
    UI.azValue.textContent=state.bearing.toFixed(1).padStart(5,'0')+'°';UI.elValue.textContent=state.elev.toFixed(1)+'°';UI.charge.textContent=state.charge;UI.he.textContent=state.ammo.HE;UI.smoke.textContent=state.ammo.SMOKE;UI.frag.textContent=state.ammo.FRAG;
    const B=ballistics(state.charge,state.elev);UI.range.innerHTML=`<span>ALCANCE <b>${Math.round(B.range).toLocaleString('pt-BR')} m</b></span><span>ÁPICE <b>${Math.round(B.apex).toLocaleString('pt-BR')} m</b></span>`;const band=chargeBand(state.charge);UI.chargeRange.textContent=`${formatM(band.min)}–${formatM(band.max)}`;
    if(state.mission){UI.opTitle.textContent=`MISSÃO • ${state.mission.target.type}`;UI.opSub.textContent=`alvo ${Math.round(distance(state.robot,state.mission.target))} m • frente ${state.mission.sector.name}`;}else if(state.intel){UI.opTitle.textContent='INTELIGÊNCIA';UI.opSub.textContent=state.intel.stage==='source'?'localizando origem':'confirmando alvo';}else{UI.opTitle.textContent='TEATRO DE OPERAÇÕES';UI.opSub.textContent=`${state.knownTargets.filter(a=>a.alive).length} alvos conhecidos • ${state.sectors.length} frentes ativas`;}
  }
  const formatM=m=>m>=10000?(m/1000).toFixed(1)+' km':m>=1000?(m/1000).toFixed(2)+' km':Math.round(m)+' m';

  function mapSnapshot(){return {world:WORLD,own:{x:state.robot.x,y:state.robot.y},targets:state.reports.map(r=>({...r})),missionId:state.mission?.target.id,time:state.time,charge:state.charge,elev:state.elev};}
  function updateNotebook(){} // The table instrument holds its opening snapshot until the operator reopens it.
  function openSheet(which){
    if(cinematicActive(state))skipCinematic();resetInputs();closeAllSheets();sheetOpen=which;
    UI.radio.classList.add('hidden');cabin?.releasePointer?.();
    state.paused=which!=='notebook';
    if(state.paused)audio.update({time:state.time,moving:false,inside:inside(),speed:0,paused:true});
    UI[which].classList.remove('hidden');if(which==='notebook')tableMap.open(mapSnapshot());
    syncControls();
  }
  function closeAllSheets(){['notebook','help','menu'].forEach(k=>UI[k].classList.add('hidden'));tableMap?.close();sheetOpen=null;pendingBinding=null;}
  function resume(){closeAllSheets();state.paused=false;resetInputs();touchUI();syncControls();}
  function openRadio(){resume();resetInputs();cabin?.releasePointer?.();UI.radio.classList.remove('hidden');setRadioChannel(radioChannel);}
  function closeRadio(){if(state.station==='radio')leaveStation();else{UI.radio.classList.add('hidden');resetInputs();syncControls();}}
  function backToOperator(){
    if(sheetOpen){resume();if(state.station==='map')leaveStation();}
    else if(!UI.radio.classList.contains('hidden'))closeRadio();
    else if(state.station)leaveStation();
    else if(cinematicActive(state))skipCinematic();
    else {cabin?.releasePointer?.();openSheet('menu');}
  }

  function setInputMode(touch){touchMode=touch;app.classList.toggle('input-touch',touch);app.classList.toggle('input-mouse',!touch);if(touch&&document.querySelector('[data-settings-panel="keys"]:not([hidden])'))showSettingsTab('game');}
  function showSettingsTab(tab){
    pendingBinding=null;document.querySelectorAll('[data-settings-tab]').forEach(b=>{const active=b.dataset.settingsTab===tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
    document.querySelectorAll('[data-settings-panel]').forEach(p=>p.hidden=p.dataset.settingsPanel!==tab);updateBindingUI();
  }
  function updateBindingUI(){
    document.querySelectorAll('[data-bind]').forEach(b=>{b.classList.toggle('listening',pendingBinding===b.dataset.bind);b.querySelector('kbd').textContent=pendingBinding===b.dataset.bind?'PRESSIONE…':keyLabel(bindings[b.dataset.bind]);});
    const hint=$('cabinWalkHint')?.querySelector('.pc-only');if(hint)hint.innerHTML=`${['forward','left','back','right'].map(k=>keyLabel(bindings[k])).join(' ')} · CAMINHAR<br>MOUSE · OLHAR / E · INTERAGIR`;
    $('chargeUp').title=keyLabel(bindings.chargeUp)+' · aumentar carga';$('chargeDown').title=keyLabel(bindings.chargeDown)+' · diminuir carga';$('fireBtn').title=keyLabel(bindings.fire)+' · disparar';
  }
  function updateAudioUI(){const levels=audio.getVolumes();for(const key of ['master','effects','ambient']){$(key+'Volume').value=levels[key];$(key+'VolumeValue').textContent=Math.round(levels[key]*100)+'%';}$('audioBtn').textContent=`♪ ÁUDIO · ${levels.muted?'OFF':'ON'}`;}
  function saveSettings(){try{localStorage.setItem('iron-rain-settings',JSON.stringify({bindings,audio:audio.getVolumes()}));}catch{}}
  function loadSettings(){try{const saved=JSON.parse(localStorage.getItem('iron-rain-settings')||'null');bindings=restoreBindings(saved?.bindings);if(saved?.audio){audio.setVolumes(saved.audio);if(saved.audio.muted)audio.toggle();}}catch{}setInputMode(touchMode);updateBindingUI();updateAudioUI();}

  const enabled=()=>!!state&&!state.paused&&!sheetOpen&&UI.radio.classList.contains('hidden')&&!cinematicActive(state)&&!state.launchDelay;
  const joyEl=$('joystick'),joyKnob=$('joyKnob');
  controls.push(bindJoystick(joyEl,joyKnob,{onChange:v=>{joy=v;},onEngage:touchUI,isEnabled:()=>enabled()&&state.mode==='march'}));
  function turnWheel(axis,degrees){if(!enabled()||state.mode!=='artillery'||(!cabinFailed&&state.station!=='aim'))return;if(serverClient){serverClient.turn(axis,degrees);audio.crank();touchUI();return;}if(axis==='azimuth')state.azTarget=(state.azTarget+degrees+360)%360;else state.elTarget=clamp(state.elTarget+degrees,MIN_ELEVATION,MAX_ELEVATION);audio.crank();touchUI();}
  controls.push(bindHandwheel($('azWheel'),$('azArm'),{onDelta:d=>turnWheel('azimuth',d),onEngage:touchUI,isEnabled:()=>enabled()&&state.mode==='artillery'&&(cabinFailed||state.station==='aim'),reduction:1/6.5}));
  controls.push(bindHandwheel($('elWheel'),$('elArm'),{onDelta:d=>turnWheel('elevation',d),onEngage:touchUI,isEnabled:()=>enabled()&&state.mode==='artillery'&&(cabinFailed||state.station==='aim'),reduction:1/8.5}));
  controls.push(bindJoystick($('cabinJoystick'),$('cabinJoyKnob'),{onChange:v=>{cabinMove=v;},onEngage:touchUI,isEnabled:()=>enabled()&&inside()&&!state.station}));
  addEventListener('blur',resetInputs);
  document.addEventListener('visibilitychange',()=>{resetInputs();last=performance.now();if(document.hidden&&state&&cinematicActive(state))skipCinematic();});
  document.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerdown',touchUI,{passive:true});
  document.addEventListener('pointerdown',e=>{setInputMode(e.pointerType==='touch'||e.pointerType==='pen');audio.wake();},{passive:true,capture:true});
  addEventListener('keydown',e=>{
    const code=eventCode(e);
    if(pendingBinding){e.preventDefault();e.stopImmediatePropagation();if(code==='Escape'){pendingBinding=null;$('keymapHint').textContent='Edição cancelada.';}else{const result=rebindKey(bindings,pendingBinding,code);if(result.error)$('keymapHint').textContent=result.error;else{bindings=result.bindings;pendingBinding=null;saveSettings();$('keymapHint').textContent='Tecla salva. E interage; Esc afasta-se.';}}updateBindingUI();return;}
    if(code==='Escape'){if(!e.repeat){e.preventDefault();backToOperator();}return;}
    if(e.target?.matches?.('input,select,textarea,[contenteditable="true"]')||e.ctrlKey||e.altKey||e.metaKey)return;
    if(!enabled())return;
    setInputMode(false);audio.wake();
    if(code==='KeyE'){if(!e.repeat&&inside()&&!state.station){e.preventDefault();cabin?.interact();}return;}
    const action=actionForKey(code,bindings,state.station);
    if(!action)return;e.preventDefault();
    if(action==='fire'){if(!e.repeat)fireShell();return;}
    if(action==='chargeUp'||action==='chargeDown'){if(!e.repeat)changeCharge(action==='chargeUp'?1:-1);return;}
    if(state.station)leaveStation();
    heldKeys.add(action);
  },true);
  addEventListener('keyup',e=>{const code=eventCode(e);for(const action of ['forward','back','left','right'])if(bindings[action]===code)heldKeys.delete(action);});
  $('interactBtn').addEventListener('click',()=>{if(enabled())cabin?.interact();});
  $('leaveStationBtn').addEventListener('click',leaveStation);

  // Local camera pan only; the player never zooms out to become a dot on a world map.
  canvas.addEventListener('pointerdown',e=>{if(state.paused||sheetOpen||panId!==null)return;if(cinematicActive(state)){skipCinematic();return;}e.preventDefault();touchUI();panId=e.pointerId;panStart={x:e.clientX,y:e.clientY,mx:state.cam.manualX,my:state.cam.manualY};try{canvas.setPointerCapture(panId);}catch{}});
  canvas.addEventListener('pointermove',e=>{if(e.pointerId!==panId||!panStart)return;e.preventDefault();const dx=(e.clientX-panStart.x)/state.cam.zoom,dy=(e.clientY-panStart.y)/state.cam.zoom;state.cam.manualX=clamp(panStart.mx-dx,-1400,1400);state.cam.manualY=clamp(panStart.my-dy,-800,800);});
  const endPan=e=>{if(e.pointerId!==panId)return;const id=panId;panId=null;panStart=null;try{canvas.releasePointerCapture(id);}catch{}};
  canvas.addEventListener('pointerup',endPan);canvas.addEventListener('pointercancel',endPan);canvas.addEventListener('lostpointercapture',endPan);addEventListener('pointerup',endPan);

  function changeCharge(delta){if(!enabled()||(!cabinFailed&&state.station!=='aim'))return;if(serverClient){serverClient.command('change-charge',{delta});return;}state.charge=clamp(state.charge+delta,1,7);audio.load();touchUI();updateUI();updateNotebook();}
  $('chargeUp').addEventListener('click',()=>changeCharge(1));$('chargeDown').addEventListener('click',()=>changeCharge(-1));
  document.querySelectorAll('.ammo').forEach(b=>b.addEventListener('click',()=>{if(!enabled()||state.loading||(!cabinFailed&&state.station!=='load'))return;const next=b.dataset.shell;if(serverClient){serverClient.command('select-shell',{shell:next});return;}if(next!==selectedShell){state.loading=beginLoading(state.loadedShell,next);selectedShell=next;const loaderCue=loaderAudioCue(null,state.loading);if(loaderCue)audio.load(loaderCue);}document.querySelectorAll('.ammo').forEach(x=>x.classList.toggle('active',x===b));touchUI();syncControls();}));
  $('deployBtn').addEventListener('click',()=>setMode('artillery'));$('marchBtn').addEventListener('click',()=>cabinFailed?setMode('march'):leaveStation());$('fireBtn').addEventListener('click',fireShell);$('notebookBtn').addEventListener('click',requestMap);
  $('copyCrewCode').onclick=async()=>{const code=globalThis.ironRainEntry?.runtime?.status?.().room||'';try{await navigator.clipboard.writeText(code);$('copyCrewCode').textContent='COPIADO';}catch{$('copyCrewCode').textContent='SELECIONE O CÓDIGO';}};
  $('menuBtn').addEventListener('click',()=>{const crew=globalThis.ironRainEntry?.runtime?.status?.()||{};$('crewInviteName').textContent=`${crew.name||'MAMUTE'} · ${crew.count||1}/3`;$('crewInviteCode').textContent=crew.room||'PARTIDA SOLO';$('copyCrewCode').disabled=!crew.room;if(serverClient)$('restartBtn').textContent='RECONECTAR';openSheet('menu');});$('resumeBtn').addEventListener('click',resume);$('helpBtn').addEventListener('click',()=>openSheet('help'));$('restartBtn').addEventListener('click',()=>{if(serverClient)location.reload();else resetGame();});$('centerBtn').addEventListener('click',()=>{state.cam.manualX=0;state.cam.manualY=0;skipCinematic();resume();});
  $('radioBtn').addEventListener('click',openRadio);$('closeRadio').addEventListener('click',closeRadio);
  document.querySelectorAll('[data-radio-channel]').forEach(b=>b.addEventListener('click',()=>setRadioChannel(b.dataset.radioChannel)));
  UI.radioLog.addEventListener('click',e=>{const row=e.target.closest('[data-intel-id]');if(!row)return;const item=state.intelQueue.find(i=>i.id===row.dataset.intelId);if(item)startIntel(item);});
  $('missionPill').addEventListener('click',requestMap);
  $('mapBtn').addEventListener('click',requestMap);
  $('audioBtn').addEventListener('click',()=>{audio.toggle();updateAudioUI();saveSettings();});
  for(const key of ['master','effects','ambient'])$(key+'Volume').addEventListener('input',e=>{audio.setVolumes({[key]:Number(e.target.value)});updateAudioUI();saveSettings();});
  document.querySelectorAll('[data-bind]').forEach(b=>b.addEventListener('click',()=>{pendingBinding=b.dataset.bind;$('keymapHint').textContent='Pressione a nova tecla. Esc cancela.';updateBindingUI();}));
  document.querySelectorAll('[data-settings-tab]').forEach(b=>b.addEventListener('click',()=>showSettingsTab(b.dataset.settingsTab)));
  $('resetBindings')?.addEventListener('click',()=>{bindings={...DEFAULT_BINDINGS};pendingBinding=null;saveSettings();updateBindingUI();$('keymapHint').textContent='Teclas padrão restauradas.';});
  $('returnBtn')?.addEventListener('click',skipCinematic);

  $('fullscreenBtn').addEventListener('click',async()=>{if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen({navigationUI:'hide'});return}catch{}}UI.installHint.classList.remove('hidden');});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',resume));

  function loop(now){const dt=Math.min(.035,(now-last)/1000||0);last=now;try{update(dt);}catch(error){console.error('Frame update failed:',error);if(state?.view==='cabin'){cabinFailed=true;state.view='field';try{syncControls();}catch{}}}try{draw();}catch(error){console.error('Frame draw failed:',error);if(state?.view==='cabin'){cabinFailed=true;state.view='field';try{syncControls();}catch{}}}requestAnimationFrame(loop);}
  tableMap=createTableMap(UI.notebook,{onClose:()=>state.station==='map'?leaveStation():resume()});
  loadSettings();resize();resetGame();
  if(serverRuntime){
    const loss=document.createElement('section');loss.id='serverLoss';loss.hidden=true;
    loss.innerHTML='<b>MAMUTE DESTRUÍDO</b><p>A tripulação pode retornar à base após 15 segundos.</p><button id="serverRespawn" type="button">RETORNAR COM A TRIPULAÇÃO</button>';document.body.appendChild(loss);
    $('serverRespawn').onclick=()=>serverClient.command('respawn').then(r=>{if(r.ok){leaveStation();cabin?.reset();}});
    serverClient=createServerGameClient({runtime:serverRuntime,getState:()=>state,onError:reason=>toast(`Ação não concluída: ${reason}`,'TRIPULAÇÃO',3),onEffect:effect=>{
      const p=effect.payload||{};
      if(effect.type==='fire'){audio.fire();state.robot.recoil=1;state.shotElapsed=0;}
      else if(effect.type==='impact'||effect.type==='critical'){audio.impact();toast(`IMPACTO · blindagem ${Math.round(p.armor)}%`,'CASCO',4);}
      else if(effect.type==='explosion'){state.effects.push({type:'blast',x:p.x,y:p.y,life:1.1,start:1.1,max:145});audio.impact();}
      else if(effect.type==='reload')audio.load();
      else if(effect.type==='repair'&&p.result?.message)toast(p.result.message,'MOTOR',4);
      else if(effect.type==='respawn'){state.cam.x=state.robot.x;state.cam.y=state.robot.y;}
      dispatchEvent(new CustomEvent('ironrain:shared-crew-effect',{detail:{...effect,remote:true}}));
    }});
  }
  requestAnimationFrame(loop);
  import('./modules/cabin-view.js').then(({createCabinView})=>{
    cabin=createCabinView($('cabinCanvas'),{onStation:enterStation,onWheelDelta:({axis,degrees})=>turnWheel(axis,degrees),onPointerUnlock:()=>{if(state.station)leaveStation();else resetInputs();},onService:({type})=>{if(serverClient){serverClient.command(type==='extinguisher'?'extinguisher':'engine-service');return;}const result=serviceEngine(state.engine,type);if(result?.message){toast(result.message,'MOTOR',5);if(result.kind==='equipped')audio.load?.();}touchUI();updateUI();}});cabin.resize(SW,SH);cabin.reset();syncControls();$('bootStatus').classList.add('hidden');
  }).catch(error=>{
    console.error('Interior 3D indisponível:',error);cabinFailed=true;state.view='field';syncControls();$('bootStatus').classList.add('hidden');toast('Interior 3D indisponível neste navegador. Controles externos disponíveis.','SISTEMAS',20);
  });
  if('serviceWorker' in navigator && !new URLSearchParams(location.search).has('test'))navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline indisponível:',e.message));
  // Explicit diagnostic mode is isolated from the normal game UI and never used by the map.
  if(new URLSearchParams(location.search).has('test'))window.ironRainTest={
    snapshot:()=>structuredClone({time:state.time,mode:state.mode,view:state.view,station:state.station,cabin:cabin?.snapshot(),cabinFailed,loading:state.loading,loadedShell:state.loadedShell,selectedShell,relocation:state.relocation,cam:state.cam,robot:state.robot,bearing:state.bearing,elev:state.elev,azTarget:state.azTarget,elTarget:state.elTarget,charge:state.charge,ammo:state.ammo,shell:state.shell,lastShot:state.lastShot,mission:state.mission?{id:state.mission.target.id,report:state.mission.report}:null,reports:state.reports,details:state.sectors.map(s=>({name:s.name,units:s.units.length,war:s.war,ally:s.allyStrength,enemy:s.enemyStrength})),sheet:sheetOpen,paused:state.paused,nextCommander:state.nextCommander,nextDiscovery:state.nextDiscovery,intelQueue:state.intelQueue.map(i=>({id:i.id,kind:i.kind,opened:i.opened,report:i.report,targetAlive:i.target.alive})),radioChannel,bindings,inputTouch:touchMode,engine:state.engine,engineStatus:engineStatus(state.engine),engineCanDrive:engineCanDrive(state.engine)}),
    scenario:({charge,elev,bearing,wind,nextIntel,nextDiscovery}={})=>{if(charge)state.charge=clamp(charge,1,7);if(elev)state.elev=state.elTarget=clamp(elev,MIN_ELEVATION,MAX_ELEVATION);if(bearing!==undefined)state.bearing=state.azTarget=bearing;if(wind)state.wind=wind;if(nextIntel!==undefined)state.nextCommander=nextIntel;if(nextDiscovery!==undefined)state.nextDiscovery=nextDiscovery;updateUI();},
    setPose:pose=>{leaveStation();const result=cabin?.setPoseForTest(pose);update(.001);draw();return result;},
    completeMission:()=>{if(state.mission)state.mission.target.alive=false;},
    damageMamute:amount=>{const loss=Math.max(0,Number(amount)||0);state.robot.armor=Math.max(0,state.robot.armor-loss);damageEngine(state.engine,loss);state.engineLastArmor=state.robot.armor;},
    setMode:mode=>{if(mode==='march'||mode==='artillery')setMode(mode);updateUI();draw();return state.mode;},
    advance:seconds=>{const step=seconds>30?.1:1/60;for(let t=0;t<seconds;t+=step)update(Math.min(step,seconds-t));draw();}
  };
})();
