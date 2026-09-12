import { ballistics, bearingVector, chargeBand, sampleTrajectory, MIN_ELEVATION, MAX_ELEVATION } from './modules/ballistics.js';
import { bindJoystick, bindHandwheel } from './modules/pointer-controls.js';
import { initializeSector, updateWar, applyWarImpact, trenchPath, phaseLabels } from './modules/war-simulation.js';
import { createTableMap } from './modules/table-map.js';
import { cinematicActive, smooth, cameraAnchor, beginReturn, finishCamera, stepCamera } from './modules/camera-director.js';
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
      time:0,paused:false,mode:'march',
      robot:{x:8200,y:30000,facing:0,turret:0,armor:100,speed:0},
      cam:{x:8650,y:30000,zoom:.78,targetZoom:.78,manualX:0,manualY:0,mode:'follow'},
      bearing:90,elev:45,charge:4,azTarget:90,elTarget:45,ammo:{HE:18,SMOKE:8,FRAG:8},
      wind:{x:rand(-7,7),y:rand(-5,5)},shell:null,impactHold:0,returning:false,
      sectors,knownTargets:[],reports:[],mission:null,nextIntel:5.5,intel:null,intelQueue:[],
      effects:[],tracers:[],smokes:[],craters:[],radio:[],
      base:{x:7750,y:30000},
      strategicTick:0,clean:false
    };
  }

  function resize(){
    const r=app.getBoundingClientRect(); DPR=Math.min(2,window.devicePixelRatio||1); SW=Math.max(320,r.width); SH=Math.max(180,r.height);
    canvas.width=Math.round(SW*DPR);canvas.height=Math.round(SH*DPR);canvas.style.width=SW+'px';canvas.style.height=SH+'px';ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  addEventListener('resize',resize); addEventListener('orientationchange',()=>setTimeout(resize,120));

  function worldToScreen(x,y){return {x:(x-state.cam.x)*state.cam.zoom+SW/2,y:(y-state.cam.y)*state.cam.zoom+SH/2};}
  function screenToWorld(x,y){return {x:(x-SW/2)/state.cam.zoom+state.cam.x,y:(y-SH/2)/state.cam.zoom+state.cam.y};}
  function visible(x,y,pad=100){const p=worldToScreen(x,y);return p.x>-pad&&p.x<SW+pad&&p.y>-pad&&p.y<SH+pad;}

  function log(text,type=''){
    state.radio.push({text,type,t:state.time}); if(state.radio.length>80)state.radio.shift();
    const d=document.createElement('div');d.className='radio-msg '+type;d.innerHTML=text;UI.radioLog.appendChild(d);UI.radioLog.scrollTop=UI.radioLog.scrollHeight;
    while(UI.radioLog.children.length>60)UI.radioLog.removeChild(UI.radioLog.firstChild);
  }

  function resetGame(){
    state=newState();resetInputs();finishCamera(state,SW);UI.intelBanner.classList.add('hidden');UI.radio.classList.add('hidden');UI.missionPill.classList.add('hidden');app.classList.remove('shot-cinematic'); UI.radioLog.innerHTML=''; selectedShell='HE';
    document.querySelectorAll('.ammo').forEach(b=>b.classList.toggle('active',b.dataset.shell==='HE'));
    setMode('march'); closeAllSheets();
    log('<b>COMANDO:</b> M-47 Mamute inserido no teatro. Mantemos informação parcial do inimigo.','good');
    log('<b>INTEL:</b> observadores e reconhecimento aéreo enviarão coordenadas conforme descobrirem alvos.');
    updateUI();
  }

  function resetInputs(){controls.forEach(c=>c.reset());joy={x:0,y:0};panId=null;panStart=null;}
  function setMode(m){
    if(cinematicActive(state))return;
    resetInputs();state.mode=m;
    if(m==='artillery'){state.azTarget=state.bearing;state.elTarget=state.elev;}
    syncControls();touchUI();
  }
  function syncControls(){
    const busy=cinematicActive(state);
    app.classList.toggle('shot-cinematic',busy);
    UI.march.classList.toggle('hidden',state.mode!=='march'||busy);
    UI.fireDeck.classList.toggle('hidden',state.mode!=='artillery'||busy);
    $('returnBtn')?.classList.toggle('hidden',!busy);
    $('cinematicStatus')?.classList.toggle('hidden',!busy);
    if($('flightReadout'))$('flightReadout').textContent=state.shell?`${Math.round(state.shell.z).toLocaleString('pt-BR')} m de altitude`:'Câmera local · retorno automático';
    $('fireBtn').disabled=busy||!!state.shell||state.ammo[selectedShell]<=0;
    $('fireBtn').textContent=state.shell?'EM VOO':'DISPARAR';
    UI.intelBanner.classList.toggle('hidden',!busy);
    if(busy&&!state.intel){
      UI.intelTitle.textContent=state.cam.mode==='shell'?'PROJÉTIL EM VOO':state.cam.mode==='impact'?'IMPACTO':'RETORNANDO AO MAMUTE';
      UI.intelText.textContent=state.shell?`ALT ${Math.round(state.shell.z).toLocaleString('pt-BR')} m · ${Math.round(state.shell.t)} s de voo · tempo comprimido`:state.cam.mode==='impact'?'Observando o efeito no terreno':'Controles disponíveis ao chegar à peça';
    }
  }

  function touchUI(){idleAt=performance.now();app.classList.remove('ui-idle');}

  function drawTerrain(){
    // procedurally tiled fields so any of the 80x60 km theatre has detail without a global map image
    ctx.fillStyle='#526f43';ctx.fillRect(0,0,SW,SH);
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
      if(r<1)continue;ctx.fillStyle=f>.82?'#324c2e':'#3c5d35';ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
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
    if(distance(sec,state.cam)>2400)return;
    drawTrench(sec.x-320,sec.y,'ally');drawTrench(sec.x+320,sec.y,'enemy');
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
    }
    if(sec.war&&visible(sec.x-360,sec.y-285,50)){
      const p=worldToScreen(sec.x-360,sec.y-285);ctx.font='9px ui-monospace,monospace';ctx.fillStyle='#d5d1ad';ctx.fillText(phaseLabels[sec.war.ally.phase],p.x-35,p.y);
    }
    for(const a of sec.assets){if(!a.alive)continue;if(!a.known && distance(a,state.robot)>620 && !(state.intel&&state.intel.target===a&&state.intel.stage==='target'))continue;drawAsset(a);}
  }

  function drawAsset(a){
    const p=worldToScreen(a.x,a.y),z=state.cam.zoom;ctx.fillStyle=COLORS.bunker;ctx.fillRect(p.x-42*z,p.y-26*z,84*z,52*z);ctx.fillStyle=COLORS.sand;ctx.fillRect(p.x-42*z,p.y-26*z,84*z,10*z);ctx.strokeStyle='#151515';ctx.lineWidth=5*z;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-30*z,p.y);ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,.68)';ctx.fillRect(p.x-35*z,p.y-48*z,70*z,17*z);ctx.fillStyle='#ffd0c9';ctx.font=`${Math.max(8,10*z)}px system-ui`;ctx.textAlign='center';ctx.fillText(a.type,p.x,p.y-36*z);ctx.textAlign='start';
    ctx.fillStyle='rgba(255,255,255,.15)';ctx.fillRect(p.x-34*z,p.y+32*z,68*z,5*z);ctx.fillStyle='#ff8378';ctx.fillRect(p.x-34*z,p.y+32*z,68*z*(a.hp/a.maxHp),5*z);
  }

  function drawRobot(){
    const r=state.robot,p=worldToScreen(r.x,r.y),z=state.cam.zoom,s=43*z;
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
    const direction=bearingVector(state.mode==='artillery'?state.bearing:deg(r.turret+Math.PI/2));
    const bx=direction.x*length*Math.cos(el), by=direction.y*length*Math.cos(el);
    ctx.save();ctx.translate(p.x,p.y);
    ctx.fillStyle='#525e40';ctx.beginPath();ctx.ellipse(0,0,23*z,18*z,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#343d2c';ctx.lineCap='round';ctx.lineWidth=14*z;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(bx,by);ctx.stroke();
    ctx.strokeStyle='#c9bc87';ctx.lineWidth=8*z;ctx.beginPath();ctx.moveTo(1,-3*z);ctx.lineTo(bx,by-3*z);ctx.stroke();
    ctx.fillStyle='#111910';ctx.beginPath();ctx.arc(bx,by-3*z,4.5*z,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d5c385';ctx.font=`600 ${9*z}px monospace`;ctx.textAlign='center';ctx.fillText('M–47',-16*z,29*z);ctx.restore();
  }

  function drawPlane(){if(!state.intel||state.intel.source!=='plane')return;const t=state.intel;const x=t.sourcePos.x+(t.elapsed*180)%700-350,y=t.sourcePos.y-260;const p=worldToScreen(x,y),z=state.cam.zoom;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(.06);ctx.fillStyle='#dfe5dc';ctx.beginPath();ctx.moveTo(-24*z,0);ctx.lineTo(18*z,0);ctx.lineTo(34*z,-9*z);ctx.lineTo(38*z,-5*z);ctx.lineTo(24*z,3*z);ctx.lineTo(2*z,4*z);ctx.lineTo(-4*z,20*z);ctx.lineTo(-9*z,20*z);ctx.lineTo(-8*z,3*z);ctx.lineTo(-24*z,7*z);ctx.closePath();ctx.fill();ctx.restore();}
  function drawObserver(){if(!state.intel||state.intel.source==='plane')return;const p=worldToScreen(state.intel.sourcePos.x,state.intel.sourcePos.y),z=state.cam.zoom;ctx.fillStyle='#273a2b';ctx.fillRect(p.x-11*z,p.y-6*z,12*z,17*z);ctx.strokeStyle='#cfbd73';ctx.lineWidth=2*z;ctx.beginPath();ctx.moveTo(p.x-9*z,p.y);ctx.lineTo(p.x-9*z,p.y-28*z);ctx.stroke();ctx.fillStyle=COLORS.ally;ctx.beginPath();ctx.arc(p.x,p.y,7*z,0,Math.PI*2);ctx.fill();}

  function drawTracers(){for(const t of state.tracers){const a=worldToScreen(t.x,t.y),b=worldToScreen(t.x2,t.y2);ctx.strokeStyle=t.team==='ally'?`rgba(173,225,255,${t.life/t.max})`:`rgba(255,176,167,${t.life/t.max})`;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
  function drawEffects(){for(const e of state.effects){const p=worldToScreen(e.x,e.y),progress=1-e.life/e.start;if(e.type==='blast'){const r=(e.max||100)*progress*state.cam.zoom;ctx.fillStyle=`rgba(255,164,71,${Math.max(0,e.life/e.start)*.55})`;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();}else if(e.type==='fragments'){const fade=Math.max(0,e.life/e.start),r=e.max*(.12+.88*progress)*state.cam.zoom;ctx.strokeStyle=`rgba(255,218,117,${fade*.85})`;ctx.lineWidth=Math.max(1,1.6*state.cam.zoom);ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();for(let i=0;i<14;i++){const a=i*Math.PI*2/14+.18,inner=r*(.16+.08*Math.sin(i*2.4)),outer=r*(.72+.2*Math.sin(i*4.1+1.3));ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*inner,p.y+Math.sin(a)*inner);ctx.lineTo(p.x+Math.cos(a)*outer,p.y+Math.sin(a)*outer);ctx.stroke();}}else if(e.type==='mark'){ctx.strokeStyle=`rgba(255,221,120,${Math.max(0,e.life/e.start)})`;ctx.setLineDash([7,6]);ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,38*state.cam.zoom,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}}}
  function drawCrater(){for(const c of state.craters){const p=worldToScreen(c.x,c.y);ctx.fillStyle='rgba(40,29,21,.35)';ctx.beginPath();ctx.ellipse(p.x,p.y,c.r*state.cam.zoom*1.3,c.r*state.cam.zoom,0,0,Math.PI*2);ctx.fill();}}
  function drawSmokes(){for(const s of state.smokes){const p=worldToScreen(s.x,s.y);ctx.fillStyle=`rgba(224,229,225,${Math.min(.35,s.life/8*.35)})`;ctx.beginPath();ctx.arc(p.x,p.y,s.r*state.cam.zoom,0,Math.PI*2);ctx.fill();}}
  function drawShell(){if(!state.shell)return;const s=state.shell,p=worldToScreen(s.x,s.y);ctx.fillStyle='#ffe08a';ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='10px system-ui';ctx.fillText(`ALT ${Math.max(0,Math.round(s.z))} m`,p.x+12,p.y-10);}

  function draw(){ctx.clearRect(0,0,SW,SH);drawTerrain();drawBase();drawCrater();drawSmokes();for(const s of state.sectors)drawSector(s);drawObserver();drawPlane();drawRobot();drawTracers();drawShell();drawEffects();}



  function chooseUnknownTarget(){
    // The first mission deliberately demonstrates the scale: a real long-range call roughly 40 km away.
    if(state.knownTargets.length===0){const s=state.sectors[3],a=s.assets[0];if(a.alive&&!a.known)return {s,a};}
    const list=[];for(const s of state.sectors)for(const a of s.assets)if(a.alive&&!a.known&&distance(state.robot,a)<55500)list.push({s,a});return list.length?list[Math.floor(rand(0,list.length))]:null;
  }
  function scheduleIntel(){
    if(state.shell||cinematicActive(state)||sheetOpen)return false;
    const pick=chooseUnknownTarget();if(!pick)return false;
    const d=distance(state.robot,pick.a);
    startIntel(pick.s,pick.a,d>18000?'plane':state.reports.length%2?'scout':'radio');return true;
  }
  function startIntel(sec,target,source){
    resetInputs();
    const sourcePos=source==='plane'?{x:sec.x-600,y:sec.y-700}:{x:sec.x-470,y:sec.y-90};
    state.intel={sector:sec,target,source,sourcePos,stage:'source',elapsed:0};state.cam.mode='intel';
    // Short cut to the reporting team; retain local scale across distant theatres.
    state.cam.x=sourcePos.x;state.cam.y=sourcePos.y;
    UI.intelTitle.textContent=source==='plane'?'RECONHECIMENTO AÉREO':source==='scout'?'PATRULHA DE RECONHECIMENTO':'OBSERVADOR AVANÇADO';
    UI.intelText.textContent=`Origem da transmissão · frente ${sec.name}`;
    log(`<b>${source==='plane'?'RECON':source==='scout'?'SCOUT':'OBSERVADOR'}:</b> contato visual na frente ${sec.name}.`,'intel');syncControls();
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
      createMission(I.sector,I.target,I.source);state.intel=null;beginReturn(state);state.nextIntel=state.time+65;
    }
  }
  function skipCinematic(){
    if(state.intel){const I=state.intel;recordReport(I);createMission(I.sector,I.target,I.source);state.intel=null;state.nextIntel=state.time+65;}
    if(state.shell)state.shell.follow=false;
    resetInputs();finishCamera(state,SW);syncControls();touchUI();
  }

  function createMission(sec,target,source){
    state.mission={sector:sec,target,source,created:state.time,report:state.reports.find(r=>r.id===target.id)};UI.missionPill.classList.remove('hidden');UI.missionTitle.textContent=`${source==='plane'?'RECON':'FO'} • ${target.type}`;UI.missionText.textContent=`X${fmt(target.x)} Y${fmt(target.y)} • ${Math.round(distance(state.robot,target)/100)/10} km`;
    log(`<b>MISSÃO DE FOGO:</b> ${target.type} em X${fmt(target.x)} Y${fmt(target.y)}.`, 'intel');updateNotebook();
  }
  function clearMission(){state.mission=null;UI.missionPill.classList.add('hidden');updateNotebook();state.nextIntel=state.time+rand(8,15);}

  function fireShell(){
    if(state.mode!=='artillery'||state.shell||state.paused||sheetOpen||cinematicActive(state))return;
    if(state.ammo[selectedShell]<=0){log(`<b>CARREGADOR:</b> ${selectedShell} esgotado.`,'bad');return;}
    resetInputs();state.ammo[selectedShell]--;
    const solution=ballistics(state.charge,state.elev);
    state.shell={x:state.robot.x,y:state.robot.y,z:0,origin:{x:state.robot.x,y:state.robot.y},solution,bearing:state.bearing,wind:{...state.wind},type:selectedShell,t:0,follow:true,compression:clamp(solution.tof/7,2,28)};
    state.cam.mode='shell';state.cam.elapsed=0;state.impactHold=0;state.returning=false;state.robot.recoil=1;
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
    if(type==='FRAG'&&result.affected.some(hit=>hit.team==='enemy'))log(`<b>FO:</b> fragmentação atingiu a trincheira inimiga — ${result.enemyCasualties?`${result.enemyCasualties} combatente(s) fora de combate`:'infantaria suprimida; baixa não confirmada'}.`,'good');
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

  function updateRobot(dt){if(state.mode!=='march'||cinematicActive(state)||sheetOpen)return;const sp=38;state.robot.speed=Math.hypot(joy.x,joy.y)*sp;state.robot.x=clamp(state.robot.x+joy.x*sp*dt,400,WORLD.w-400);state.robot.y=clamp(state.robot.y+joy.y*sp*dt,400,WORLD.h-400);if(Math.hypot(joy.x,joy.y)>.08)state.robot.facing=Math.atan2(joy.y,joy.x);if(state.mode==='march')state.robot.turret+=angDiff(state.robot.turret,state.robot.facing)*.12;}
  function updateGun(dt){if(state.mode!=='artillery'||cinematicActive(state)||sheetOpen)return;const bd=((state.azTarget-state.bearing+540)%360)-180;state.bearing=(state.bearing+clamp(bd,-16*dt,16*dt)+360)%360;state.elev+=clamp(state.elTarget-state.elev,-8*dt,8*dt);const direction=bearingVector(state.bearing);state.robot.turret=Math.atan2(direction.y,direction.x);}

  function updateEffects(dt){for(const e of state.effects)e.life-=dt;state.effects=state.effects.filter(e=>e.life>0);for(const s of state.smokes)s.life-=dt;state.smokes=state.smokes.filter(s=>s.life>0);}

  function update(dt){
    if(!state||state.paused)return;state.time+=dt;state.robot.recoil=Math.max(0,(state.robot.recoil||0)-dt*3);
    if(state.time>=state.nextIntel&&!state.intel&&!sheetOpen&&!state.shell&&!cinematicActive(state)){if(scheduleIntel())state.nextIntel=state.time+65;}
    updateRobot(dt);updateGun(dt);updateIntel(dt);updateShell(dt);updateCamera(dt);updateWar(state,dt);updateEffects(dt);uiClock+=dt;if(uiClock>.08){uiClock=0;updateUI();}
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
    state.paused=which!=='notebook';
    UI[which].classList.remove('hidden');if(which==='notebook')tableMap.open(mapSnapshot());
  }
  function closeAllSheets(){['notebook','help','menu'].forEach(k=>UI[k].classList.add('hidden'));tableMap?.close();sheetOpen=null;}
  function resume(){closeAllSheets();state.paused=false;resetInputs();touchUI();syncControls();}

  const enabled=()=>!!state&&!state.paused&&!sheetOpen&&!cinematicActive(state);
  const joyEl=$('joystick'),joyKnob=$('joyKnob');
  controls.push(bindJoystick(joyEl,joyKnob,{onChange:v=>{joy=v;},onEngage:touchUI,isEnabled:()=>enabled()&&state.mode==='march'}));
  controls.push(bindHandwheel($('azWheel'),$('azArm'),{onDelta:d=>{state.azTarget=(state.azTarget+d+360)%360;},onEngage:touchUI,isEnabled:()=>enabled()&&state.mode==='artillery',reduction:1/6.5}));
  controls.push(bindHandwheel($('elWheel'),$('elArm'),{onDelta:d=>{state.elTarget=clamp(state.elTarget+d,MIN_ELEVATION,MAX_ELEVATION);},onEngage:touchUI,isEnabled:()=>enabled()&&state.mode==='artillery',reduction:1/8.5}));
  addEventListener('blur',resetInputs);
  document.addEventListener('visibilitychange',()=>{resetInputs();last=performance.now();if(document.hidden&&state&&cinematicActive(state))skipCinematic();});
  document.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('pointerdown',touchUI,{passive:true});

  // Local camera pan only; the player never zooms out to become a dot on a world map.
  canvas.addEventListener('pointerdown',e=>{if(state.paused||sheetOpen||panId!==null)return;if(cinematicActive(state)){skipCinematic();return;}e.preventDefault();touchUI();panId=e.pointerId;panStart={x:e.clientX,y:e.clientY,mx:state.cam.manualX,my:state.cam.manualY};try{canvas.setPointerCapture(panId);}catch{}});
  canvas.addEventListener('pointermove',e=>{if(e.pointerId!==panId||!panStart)return;e.preventDefault();const dx=(e.clientX-panStart.x)/state.cam.zoom,dy=(e.clientY-panStart.y)/state.cam.zoom;state.cam.manualX=clamp(panStart.mx-dx,-1400,1400);state.cam.manualY=clamp(panStart.my-dy,-800,800);});
  const endPan=e=>{if(e.pointerId!==panId)return;const id=panId;panId=null;panStart=null;try{canvas.releasePointerCapture(id);}catch{}};
  canvas.addEventListener('pointerup',endPan);canvas.addEventListener('pointercancel',endPan);canvas.addEventListener('lostpointercapture',endPan);addEventListener('pointerup',endPan);

  $('chargeUp').addEventListener('click',()=>{state.charge=clamp(state.charge+1,1,7);touchUI();updateNotebook();});$('chargeDown').addEventListener('click',()=>{state.charge=clamp(state.charge-1,1,7);touchUI();updateNotebook();});
  document.querySelectorAll('.ammo').forEach(b=>b.addEventListener('click',()=>{selectedShell=b.dataset.shell;document.querySelectorAll('.ammo').forEach(x=>x.classList.toggle('active',x===b));touchUI();}));
  $('deployBtn').addEventListener('click',()=>setMode('artillery'));$('marchBtn').addEventListener('click',()=>setMode('march'));$('fireBtn').addEventListener('click',fireShell);$('notebookBtn').addEventListener('click',()=>openSheet('notebook'));
  $('menuBtn').addEventListener('click',()=>openSheet('menu'));$('resumeBtn').addEventListener('click',resume);$('helpBtn').addEventListener('click',()=>openSheet('help'));$('restartBtn').addEventListener('click',()=>{resetGame();});$('centerBtn').addEventListener('click',()=>{state.cam.manualX=0;state.cam.manualY=0;skipCinematic();resume();});
  $('radioBtn').addEventListener('click',()=>{resume();UI.radio.classList.remove('hidden');});$('closeRadio').addEventListener('click',()=>UI.radio.classList.add('hidden'));
  $('missionPill').addEventListener('click',()=>openSheet('notebook'));
  $('mapBtn').addEventListener('click',()=>openSheet('notebook'));
  $('returnBtn')?.addEventListener('click',skipCinematic);

  $('fullscreenBtn').addEventListener('click',async()=>{if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen({navigationUI:'hide'});return}catch{}}UI.installHint.classList.remove('hidden');});
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',resume));

  function loop(now){const dt=Math.min(.035,(now-last)/1000||0);last=now;update(dt);draw();requestAnimationFrame(loop);}
  tableMap=createTableMap(UI.notebook,{onClose:resume});
  resize();resetGame();requestAnimationFrame(loop);
  if('serviceWorker' in navigator && !new URLSearchParams(location.search).has('test'))navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline indisponível:',e.message));
  // Explicit diagnostic mode is isolated from the normal game UI and never used by the map.
  if(new URLSearchParams(location.search).has('test'))window.ironRainTest={
    snapshot:()=>structuredClone({time:state.time,mode:state.mode,cam:state.cam,robot:state.robot,bearing:state.bearing,elev:state.elev,azTarget:state.azTarget,elTarget:state.elTarget,charge:state.charge,ammo:state.ammo,shell:state.shell,lastShot:state.lastShot,mission:state.mission?{id:state.mission.target.id,report:state.mission.report}:null,reports:state.reports,details:state.sectors.map(s=>({name:s.name,units:s.units.length,war:s.war,ally:s.allyStrength,enemy:s.enemyStrength})),sheet:sheetOpen,paused:state.paused}),
    scenario:({charge,elev,bearing,wind,nextIntel}={})=>{if(charge)state.charge=clamp(charge,1,7);if(elev)state.elev=state.elTarget=clamp(elev,MIN_ELEVATION,MAX_ELEVATION);if(bearing!==undefined)state.bearing=state.azTarget=bearing;if(wind)state.wind=wind;if(nextIntel!==undefined)state.nextIntel=nextIntel;updateUI();},
    advance:seconds=>{for(let t=0;t<seconds;t+=1/60)update(Math.min(1/60,seconds-t));draw();}
  };
})();
