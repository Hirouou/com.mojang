'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const shell = document.getElementById('gameShell');
const radioLog = document.getElementById('radioLog');
const $ = id => document.getElementById(id);

const WORLD = { w: 2200, h: 1200 };
const COLORS = {
  ally:'#65b8ff', enemy:'#ff7268', allyDark:'#254f73', enemyDark:'#7e302e',
  grass:'#4d8a3f', grass2:'#568f44', dirt:'#816d50', road:'#76684f',
  sand:'#9a8a63', wall:'#665f50', neutral:'#d1d0be'
};
const UI = {
  robotCoord:$('robotCoord'), front:$('frontHud'), sector:$('sectorHud'), wind:$('windHud'), armor:$('armorHud'),
  requestCard:$('requestCard'), requestText:$('requestText'), requestAge:$('requestAge'),
  bearing:$('bearing'), elev:$('elevation'), charge:$('charge'), bearingOut:$('bearingOut'), elevOut:$('elevationOut'), chargeOut:$('chargeOut'),
  march:$('marchControls'), arty:$('artilleryControls'), speed:$('speedHud'),
  he:$('heAmmo'), smoke:$('smokeAmmo'), frag:$('fragAmmo'), helpExample:$('helpExample'),
  end:$('endOverlay'), endTitle:$('endTitle'), endText:$('endText')
};

let state, cam, last = performance.now(), selectedShell = 'HE';
let moveDir = {x:0,y:0}, mapDrag = null, joystickPointer = null;
let screenW = 1280, screenH = 720, dpr = 1;

const rand = (a,b)=>a+Math.random()*(b-a);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const dist = (a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const fmt = n=>String(Math.round(n)).padStart(4,'0');
const lerp = (a,b,t)=>a+(b-a)*t;

function resizeCanvas(){
  const r = shell.getBoundingClientRect();
  dpr = Math.min(2, window.devicePixelRatio || 1);
  screenW = Math.max(320, r.width);
  screenH = Math.max(180, r.height);
  canvas.width = Math.round(screenW*dpr);
  canvas.height = Math.round(screenH*dpr);
  canvas.style.width = screenW+'px';
  canvas.style.height = screenH+'px';
  ctx.setTransform(dpr,0,0,dpr,0,0);
}
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', ()=>setTimeout(resizeCanvas,120));

function log(text,type=''){
  const d=document.createElement('div');
  d.className='msg '+type;
  d.innerHTML=text;
  radioLog.appendChild(d);
  radioLog.scrollTop=radioLog.scrollHeight;
  while(radioLog.children.length>38) radioLog.removeChild(radioLog.firstChild);
}

function setRequest(unit,target,fort=false){
  state.latestRequest={unit:unit.callsign,x:target.x,y:target.y,fort,time:state.time};
  UI.requestText.innerHTML=`<b>${unit.callsign}</b> ${fort?'bloqueado por fortificação':'preso por fogo pesado'} • ${fort?'HE sugerido':'suporte solicitado'} em <b>X${fmt(target.x)} Y${fmt(target.y)}</b>`;
  UI.requestCard.classList.remove('hidden');
  log(`<b>📡 ${unit.callsign}:</b> ${fort?'avanço bloqueado por posição fortificada. Solicito HE':'presos por fogo pesado. Solicito apoio'} em <b>X${fmt(target.x)} Y${fmt(target.y)}</b>.`,'request');
  updateHelpExample();
}

function updateHelpExample(){
  if(!state || !state.latestRequest){ UI.helpExample.textContent='Sem pedido ativo. Observe o rádio até uma unidade pedir apoio.'; return; }
  const r=state.robot, q=state.latestRequest, dx=q.x-r.x, dy=q.y-r.y, d=Math.hypot(dx,dy);
  UI.helpExample.innerHTML=`Pedido atual: <b>X${fmt(q.x)} Y${fmt(q.y)}</b><br>Você: <b>X${fmt(r.x)} Y${fmt(r.y)}</b><br>ΔX = <b>${Math.round(dx)}</b> m • ΔY = <b>${Math.round(dy)}</b> m • distância ≈ <b>${Math.round(d)} m</b>.`;
}

function makePoint(x,y,name){return{x,y,name,owner:'neutral',progress:0,r:72,fort:100,lastRequest:-99};}
function makeCover(x,y,w,h,type='wall'){return{x,y,w,h,type};}
function makeUnit(team,x,y,role='rifle'){
  return {team,x,y,role,hp:100,alive:true,cool:rand(0,.7),supp:0,target:null,goal:null,takeCover:null,
    callsign:(team==='ally'?'A':'E')+'-'+Math.floor(rand(10,99)), speed:role==='scout'?62:role==='heavy'?38:48,
    range:role==='heavy'?235:180,acc:role==='heavy'?.61:.49,aim:team==='ally'?Math.PI/2:-Math.PI/2,muzzle:0,step:rand(0,6)};
}

function createScenery(){
  const trees=[], rocks=[], flowers=[];
  for(let i=0;i<75;i++){
    const x=rand(80,WORLD.w-80),y=rand(70,WORLD.h-70);
    if(Math.abs(y-(600+Math.sin(x*.006)*110))>95) trees.push({x,y,r:rand(14,27)});
  }
  for(let i=0;i<48;i++) rocks.push({x:rand(60,WORLD.w-60),y:rand(50,WORLD.h-50),r:rand(5,12)});
  for(let i=0;i<110;i++) flowers.push({x:rand(40,WORLD.w-40),y:rand(40,WORLD.h-40)});
  return {trees,rocks,flowers};
}

function reset(){
  state={
    time:0,paused:false,mode:'march',armor:100,ammo:{HE:12,SMOKE:5,CLUSTER:4},kills:0,friendly:0,shots:0,impactScore:0,
    wind:{x:rand(-6,6),y:rand(-4,4)},robot:{x:210,y:600,r:26,facing:Math.PI/2,turret:Math.PI/2,speed:0},
    shell:null,explosions:[],smokes:[],tracers:[],points:[makePoint(540,390,'ALFA'),makePoint(1040,690,'BRAVO'),makePoint(1540,420,'CHARLIE'),makePoint(1940,660,'DELTA')],
    covers:[],units:[],spawnAlly:1,spawnEnemy:1,gameOver:false,latestRequest:null,scenery:createScenery(),cameraHold:0
  };
  state.points[0].fort=0; state.points[0].owner='neutral'; state.points[0].progress=0;
  for(let i=1;i<state.points.length;i++){state.points[i].owner='enemy';state.points[i].progress=-100;}

  for(let i=0;i<19;i++){
    const x=rand(420,1950),y=rand(170,1030);
    state.covers.push(makeCover(x,y,rand(52,110),rand(18,32),i%4===0?'sandbag':'wall'));
  }
  state.covers.push(makeCover(965,640,120,24,'sandbag'),makeCover(1480,365,105,24,'sandbag'),makeCover(1870,610,120,24,'sandbag'));

  for(let i=0;i<14;i++) state.units.push(makeUnit('ally',rand(110,310),rand(420,790),i%6===0?'heavy':i%4===0?'scout':'rifle'));
  for(let i=0;i<18;i++) state.units.push(makeUnit('enemy',rand(1850,2110),rand(220,980),i%6===0?'heavy':i%4===0?'scout':'rifle'));

  cam={x:430,y:600,zoom:.78,followShell:false};
  selectedShell='HE'; moveDir={x:0,y:0}; radioLog.innerHTML='';
  UI.requestCard.classList.add('hidden'); UI.end.classList.add('hidden');
  log('<b>COMANDO:</b> Mamute-47 operacional. A infantaria vai avançar por conta própria. Você é apoio, não comandante.','good');
  log('<b>OBSERVAÇÃO:</b> Fortificações podem travar o front. Fumaça pode abrir uma janela de avanço; HE pode destruir a posição.');
  applyMode('march');
  updateHelpExample();
  updateUI();
}

function objectiveFor(u){
  if(u.team==='ally') return state.points.find(p=>p.owner!=='ally') || {x:WORLD.w-80,y:600,fort:0,owner:'ally'};
  const rev=[...state.points].reverse();
  return rev.find(p=>p.owner!=='enemy') || {x:80,y:600,fort:0,owner:'enemy'};
}
function nearbyEnemy(u,r){
  let best=null,bd=r;
  for(const v of state.units){if(!v.alive||v.team===u.team)continue;const d=dist(u,v);if(d<bd){bd=d;best=v;}}
  return best;
}
function nearestCover(u,threat){
  let best=null,score=1e9;
  for(const c of state.covers){
    const cx=c.x+c.w/2,cy=c.y+c.h/2,d=Math.hypot(u.x-cx,u.y-cy);
    if(d<175){const td=Math.hypot(threat.x-cx,threat.y-cy),s=d-td*.14;if(s<score){score=s;best={x:cx,y:cy};}}
  }
  return best;
}
function smokeAt(x,y){return state.smokes.some(s=>Math.hypot(x-s.x,y-s.y)<s.r*.9);}
function moveToward(u,g,dt,speed){
  const dx=g.x-u.x,dy=g.y-u.y,d=Math.hypot(dx,dy)||1;
  u.aim=Math.atan2(dy,dx);u.step+=dt*speed*.08;
  u.x=clamp(u.x+dx/d*speed*dt,20,WORLD.w-20);u.y=clamp(u.y+dy/d*speed*dt,20,WORLD.h-20);
}
function fireBullet(u,v){
  u.cool=u.role==='heavy'?1.05:rand(.5,.9);u.aim=Math.atan2(v.y-u.y,v.x-u.x);u.muzzle=.09;
  const smokePenalty=(smokeAt(u.x,u.y)||smokeAt(v.x,v.y))?.36:0;
  const hit=Math.random()<Math.max(.08,u.acc-smokePenalty)*(1-clamp(dist(u,v)/u.range,0,1)*.43)*(1-u.supp*.42);
  const spread=hit?rand(-4,4):rand(-22,22);
  state.tracers.push({x:u.x,y:u.y,x2:v.x+spread,y2:v.y+spread,life:.16,max:.16,team:u.team});
  if(hit){
    v.hp-=u.role==='heavy'?rand(35,53):rand(18,31);v.supp=clamp(v.supp+.34,0,1);
    if(v.hp<=0&&v.alive){v.alive=false;if(u.team==='ally'&&Math.random()<.18)log(`<b>${u.callsign}:</b> alvo abatido. Continuando avanço.`,'good');}
  } else v.supp=clamp(v.supp+.12,0,1);
}

function updateUnits(dt){
  for(const u of state.units){
    if(!u.alive)continue;u.cool-=dt;u.supp=Math.max(0,u.supp-dt*.11);u.muzzle=Math.max(0,u.muzzle-dt);
    const enemy=nearbyEnemy(u,u.range);
    if(enemy){
      u.target=enemy;u.aim=Math.atan2(enemy.y-u.y,enemy.x-u.x);
      if(u.supp>.47&&!u.takeCover)u.takeCover=nearestCover(u,enemy);
      if(u.takeCover){moveToward(u,u.takeCover,dt,u.speed*.62);if(Math.hypot(u.x-u.takeCover.x,u.y-u.takeCover.y)<15)u.takeCover=null;}
      if(u.cool<=0&&dist(u,enemy)<u.range)fireBullet(u,enemy);
    } else {
      u.target=null;const goal=objectiveFor(u);u.goal=goal;const gd=Math.hypot(goal.x-u.x,goal.y-u.y);
      const smoked=smokeAt(goal.x,goal.y);
      const fortified=goal.fort>0&&goal.owner!==u.team&&gd<220&&!smoked;
      if(fortified){
        if(!u.takeCover)u.takeCover=nearestCover(u,goal);
        if(u.takeCover&&Math.hypot(u.x-u.takeCover.x,u.y-u.takeCover.y)>18)moveToward(u,u.takeCover,dt,u.speed*.5);
        else u.aim=Math.atan2(goal.y-u.y,goal.x-u.x);
        u.supp=clamp(u.supp+dt*.035,0,.75);
        if(u.team==='ally'&&state.time-goal.lastRequest>12&&Math.random()<dt*.24){goal.lastRequest=state.time;setRequest(u,{x:goal.x+rand(-15,15),y:goal.y+rand(-15,15)},true);}
      } else {
        u.takeCover=null;moveToward(u,goal,dt,u.speed*(u.supp>.35?.43:(smoked?.78:1)));
      }
    }
  }
  state.units=state.units.filter(u=>u.alive);
}

function updatePoints(dt){
  for(const p of state.points){
    let a=0,e=0;
    for(const u of state.units){if(Math.hypot(u.x-p.x,u.y-p.y)<p.r){u.team==='ally'?a++:e++;}}
    if(a>e)p.progress=clamp(p.progress+(a-e)*dt*6,-100,100);else if(e>a)p.progress=clamp(p.progress-(e-a)*dt*6,-100,100);
    const prev=p.owner;
    if(p.progress>=100)p.owner='ally';else if(p.progress<=-100)p.owner='enemy';else if(Math.abs(p.progress)<10)p.owner='neutral';
    if(prev!==p.owner&&p.owner!=='neutral')log(`<b>COMANDO:</b> ${p.name} ${p.owner==='ally'?'capturado. O front avançou.':'perdido para o inimigo.'}`,p.owner==='ally'?'good':'bad');
    const allies=state.units.filter(u=>u.team==='ally'&&Math.hypot(u.x-p.x,u.y-p.y)<190);
    const enemies=state.units.filter(u=>u.team==='enemy'&&Math.hypot(u.x-p.x,u.y-p.y)<190);
    if(allies.length>=2&&enemies.length>=2&&state.time-p.lastRequest>17&&Math.random()<dt*.07){
      p.lastRequest=state.time;const caller=allies[Math.floor(Math.random()*allies.length)];
      const tx=enemies.reduce((s,u)=>s+u.x,0)/enemies.length+rand(-18,18),ty=enemies.reduce((s,u)=>s+u.y,0)/enemies.length+rand(-18,18);
      setRequest(caller,{x:tx,y:ty},false);
    }
  }
}

function spawnLogic(dt){
  state.spawnAlly-=dt;state.spawnEnemy-=dt;
  if(state.spawnAlly<=0){
    state.spawnAlly=rand(4.2,6.3);const owned=state.points.filter(p=>p.owner==='ally');const base=owned.length?owned[owned.length-1]:{x:170,y:600};
    state.units.push(makeUnit('ally',clamp(base.x-115,80,2050),clamp(base.y+rand(-130,130),80,1120),Math.random()<.17?'heavy':Math.random()<.15?'scout':'rifle'));
  }
  if(state.spawnEnemy<=0){
    state.spawnEnemy=rand(4,6);const owned=state.points.filter(p=>p.owner==='enemy');const base=owned.length?owned[0]:{x:2050,y:600};
    state.units.push(makeUnit('enemy',clamp(base.x+120,100,2120),clamp(base.y+rand(-150,150),80,1120),Math.random()<.17?'heavy':Math.random()<.15?'scout':'rifle'));
  }
}

function nearbyRobotEnemy(r){let best=null,bd=r;for(const u of state.units){if(u.team!=='enemy')continue;const d=Math.hypot(u.x-state.robot.x,u.y-state.robot.y);if(d<bd){bd=d;best=u;}}return best;}
function updateRobot(dt){
  const r=state.robot;
  if(state.mode==='march'&&!state.shell){
    const mag=Math.hypot(moveDir.x,moveDir.y);r.speed=lerp(r.speed,mag*72,Math.min(1,dt*5));
    if(mag>.05){const nx=moveDir.x/mag,ny=moveDir.y/mag;r.facing=Math.atan2(ny,nx);r.x=clamp(r.x+nx*r.speed*dt,45,WORLD.w-45);r.y=clamp(r.y+ny*r.speed*dt,45,WORLD.h-45);}
  } else r.speed=lerp(r.speed,0,Math.min(1,dt*6));
  if(state.mode==='artillery')r.turret=(+UI.bearing.value-90)*Math.PI/180;
  else {const e=nearbyRobotEnemy(310);r.turret=e?Math.atan2(e.y-r.y,e.x-r.x):r.facing;}
  const enemy=nearbyRobotEnemy(145);
  if(enemy){state.armor-=dt*rand(1.2,2.5);if(state.armor<=0&&!state.gameOver)finishBattle(false,'A blindagem do Mamute colapsou sob fogo inimigo.');}
}

function getShotParams(){return{bearing:+UI.bearing.value,elev:+UI.elev.value,charge:+UI.charge.value};}
function fireShell(){
  if(state.gameOver||state.paused||state.shell||state.mode!=='artillery')return;
  if(state.ammo[selectedShell]<=0){log(`<b>CARREGADOR:</b> sem munição ${selectedShell}.`,'bad');return;}
  const p=getShotParams();state.ammo[selectedShell]--;state.shots++;
  const rad=p.bearing*Math.PI/180,el=p.elev*Math.PI/180,muzzle=[0,49,63,76,87,97][p.charge],h=Math.cos(el)*muzzle;
  state.shell={x:state.robot.x,y:state.robot.y,z:4,vx:Math.sin(rad)*h,vy:-Math.cos(rad)*h,vz:Math.sin(el)*muzzle,type:selectedShell,t:0,trail:[]};
  cam.followShell=true;
  state.explosions.push({type:'muzzleBig',x:state.robot.x+Math.sin(rad)*28,y:state.robot.y-Math.cos(rad)*28,life:.25,max:.25});
  log(`<b>MAMUTE-47:</b> ${selectedShell} lançado • Az ${String(p.bearing).padStart(3,'0')}° • El ${p.elev}° • carga ${p.charge}.`);
  updateUI();
}
function impactShell(s){
  const x=s.x,y=s.y;state.shell=null;cam.followShell=false;cam.x=x;cam.y=y;state.cameraHold=1.2;
  if(s.type==='SMOKE'){
    state.smokes.push({x,y,r:112,life:26});state.explosions.push({type:'blast',x,y,r:18,max:72,life:.75,maxLife:.75});
    log(`<b>OBSERVADOR:</b> fumaça estabelecida em X${fmt(x)} Y${fmt(y)}.`,'good');return;
  }
  const radius=s.type==='CLUSTER'?124:94;let ek=0,fk=0;
  for(const u of state.units){
    const d=Math.hypot(u.x-x,u.y-y);if(d<radius){const dmg=(1-d/radius)*(s.type==='CLUSTER'?145:195);u.hp-=dmg;
      if(u.hp<=0&&u.alive){u.alive=false;if(u.team==='enemy'){ek++;state.kills++;}else{fk++;state.friendly++;}}else u.supp=clamp(u.supp+.82,0,1);}
  }
  for(const p of state.points){const d=Math.hypot(p.x-x,p.y-y);if(d<radius+35&&p.fort>0){const before=p.fort;p.fort=Math.max(0,p.fort-(s.type==='HE'?62:28));if(before>0&&p.fort===0)log(`<b>OBSERVADOR:</b> fortificação de ${p.name} destruída. Infantaria avançando.`,'good');}}
  state.explosions.push({type:'blast',x,y,r:20,max:radius,life:.9,maxLife:.9});
  state.impactScore+=ek*10-fk*14;
  if(fk>0)log(`<b>FOGO AMIGO:</b> ${fk} aliado(s) e ${ek} inimigo(s) mortos. A operação continua.`,'bad');
  else if(ek>0)log(`<b>OBSERVADOR:</b> impacto eficaz. ${ek} inimigo(s) neutralizado(s).`,'good');
  else log('<b>OBSERVADOR:</b> impacto sem baixas confirmadas.');
}
function updateShell(dt){
  if(!state.shell)return;const s=state.shell,timeScale=4.15;s.t+=dt;
  s.vx+=state.wind.x*dt*.9;s.vy+=state.wind.y*dt*.9;s.vz-=9.81*timeScale*dt;
  s.x+=s.vx*timeScale*dt;s.y+=s.vy*timeScale*dt;s.z+=s.vz*timeScale*dt;
  if(s.trail.length<20)s.trail.push({x:s.x,y:s.y,z:s.z});else{s.trail.shift();s.trail.push({x:s.x,y:s.y,z:s.z});}
  cam.x=s.x;cam.y=s.y;
  if(s.z<=0||s.x<0||s.y<0||s.x>WORLD.w||s.y>WORLD.h)impactShell(s);
}
function updateEffects(dt){
  state.explosions.forEach(e=>e.life-=dt);state.explosions=state.explosions.filter(e=>e.life>0);
  state.smokes.forEach(s=>s.life-=dt);state.smokes=state.smokes.filter(s=>s.life>0);
  state.tracers.forEach(t=>t.life-=dt);state.tracers=state.tracers.filter(t=>t.life>0);
  if(state.cameraHold>0)state.cameraHold-=dt;
}
function finishBattle(win,text){
  state.gameOver=true;state.paused=true;UI.endTitle.textContent=win?'VITÓRIA NO FRONT':'MAMUTE FORA DE COMBATE';UI.endText.textContent=text;UI.end.classList.remove('hidden');
}
function battleStatus(){
  const allyPts=state.points.filter(p=>p.owner==='ally').length;
  if(allyPts===state.points.length&&!state.gameOver)finishBattle(true,`Todos os setores dominados. ${state.kills} baixas inimigas por artilharia, ${state.friendly} por fogo amigo.`);
}
function update(dt){
  if(!state||state.paused||state.gameOver)return;
  state.time+=dt;updateRobot(dt);updateUnits(dt);updatePoints(dt);spawnLogic(dt);updateShell(dt);updateEffects(dt);battleStatus();updateUI();
}

function worldToScreen(x,y){return{x:(x-cam.x)*cam.zoom+screenW/2,y:(y-cam.y)*cam.zoom+screenH/2};}
function screenToWorld(x,y){return{x:(x-screenW/2)/cam.zoom+cam.x,y:(y-screenH/2)/cam.zoom+cam.y};}
function visible(q,pad=80){return q.x>-pad&&q.y>-pad&&q.x<screenW+pad&&q.y<screenH+pad;}

function drawBackground(){
  ctx.fillStyle=COLORS.grass;ctx.fillRect(0,0,screenW,screenH);
  const step=70;
  const startX=Math.floor((cam.x-screenW/(2*cam.zoom))/step)*step;
  const endX=Math.ceil((cam.x+screenW/(2*cam.zoom))/step)*step;
  const startY=Math.floor((cam.y-screenH/(2*cam.zoom))/step)*step;
  const endY=Math.ceil((cam.y+screenH/(2*cam.zoom))/step)*step;
  ctx.fillStyle='rgba(226,242,167,.13)';
  for(let x=startX;x<=endX;x+=step)for(let y=startY;y<=endY;y+=step){
    const h=Math.abs(Math.sin(x*12.9898+y*78.233));if(h>.26){const q=worldToScreen(x+((h*31)%28),y+((h*57)%24));ctx.fillRect(q.x,q.y,2,7);ctx.fillRect(q.x+5,q.y+3,2,5);}
  }
  ctx.save();ctx.lineCap='round';ctx.strokeStyle=COLORS.dirt;ctx.lineWidth=92*cam.zoom;ctx.beginPath();let p=worldToScreen(-100,600);ctx.moveTo(p.x,p.y);
  for(let x=100;x<=2300;x+=180){const q=worldToScreen(x,600+Math.sin(x*.006)*110);ctx.lineTo(q.x,q.y);}ctx.stroke();
  ctx.strokeStyle='rgba(228,211,171,.12)';ctx.lineWidth=6*cam.zoom;ctx.stroke();ctx.restore();
  ctx.save();ctx.strokeStyle='rgba(118,104,79,.65)';ctx.lineWidth=34*cam.zoom;ctx.lineCap='round';for(const cp of state.points){const a=worldToScreen(cp.x,cp.y),b=worldToScreen(cp.x,600+Math.sin(cp.x*.006)*110);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.restore();
}

function drawScenery(){
  for(const f of state.scenery.flowers){const q=worldToScreen(f.x,f.y);if(!visible(q,10))continue;ctx.fillStyle='rgba(238,244,178,.6)';ctx.fillRect(Math.round(q.x),Math.round(q.y),2,2);}
  for(const r of state.scenery.rocks){const q=worldToScreen(r.x,r.y);if(!visible(q,20))continue;const rr=Math.max(3,r.r*cam.zoom);ctx.fillStyle='#665f50';ctx.beginPath();ctx.ellipse(q.x,q.y,rr,rr*.65,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.ellipse(q.x-rr*.25,q.y-rr*.2,rr*.42,rr*.2,0,0,Math.PI*2);ctx.fill();}
  for(const t of state.scenery.trees){const q=worldToScreen(t.x,t.y);if(!visible(q,40))continue;const rr=Math.max(8,t.r*cam.zoom);ctx.fillStyle='rgba(0,0,0,.18)';ctx.beginPath();ctx.ellipse(q.x+5,q.y+8,rr*1.05,rr*.65,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#285d31';ctx.beginPath();ctx.arc(q.x,q.y,rr,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3f7f3a';ctx.beginPath();ctx.arc(q.x-rr*.25,q.y-rr*.3,rr*.65,0,Math.PI*2);ctx.fill();}
}

function drawGrid(){
  if(cam.zoom<.5)return;
  ctx.save();ctx.strokeStyle='rgba(255,255,255,.065)';ctx.lineWidth=1;ctx.fillStyle='rgba(255,255,255,.33)';ctx.font='9px system-ui';
  for(let x=0;x<=WORLD.w;x+=100){const a=worldToScreen(x,0);if(a.x<-20||a.x>screenW+20)continue;ctx.beginPath();ctx.moveTo(a.x,0);ctx.lineTo(a.x,screenH);ctx.stroke();ctx.fillText(String(x),a.x+3,screenH-8);}
  for(let y=0;y<=WORLD.h;y+=100){const a=worldToScreen(0,y);if(a.y<-20||a.y>screenH+20)continue;ctx.beginPath();ctx.moveTo(0,a.y);ctx.lineTo(screenW,a.y);ctx.stroke();ctx.fillText(String(y),4,a.y-3);}
  ctx.restore();
}

function drawCovers(){
  for(const c of state.covers){const q=worldToScreen(c.x,c.y),w=c.w*cam.zoom,h=c.h*cam.zoom;if(!visible(q,140))continue;
    ctx.save();ctx.translate(q.x,q.y);
    if(c.type==='sandbag'){
      const n=Math.max(3,Math.round(c.w/22));for(let i=0;i<n;i++){ctx.fillStyle=i%2?'#8b7d5e':'#9b8a68';ctx.beginPath();ctx.ellipse((i+.5)*w/n,h/2,w/n*.52,h*.45,0,0,Math.PI*2);ctx.fill();}
    }else{ctx.fillStyle='#5b625c';ctx.fillRect(0,0,w,h);ctx.fillStyle='rgba(255,255,255,.11)';ctx.fillRect(3,3,Math.max(0,w-6),3);ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(6,h-5,Math.max(0,w-8),5);}
    ctx.restore();
  }
}

function drawPoints(){
  for(const p of state.points){const q=worldToScreen(p.x,p.y);if(!visible(q,120))continue;const col=p.owner==='ally'?COLORS.ally:p.owner==='enemy'?COLORS.enemy:COLORS.neutral;
    ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.beginPath();ctx.arc(q.x,q.y,p.r*cam.zoom,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle='rgba(10,14,11,.76)';ctx.fillRect(q.x-34,q.y-47,68,16);ctx.fillStyle=col;ctx.font='700 10px system-ui';ctx.textAlign='center';ctx.fillText(p.name,q.x,q.y-35);
    ctx.fillStyle='rgba(12,15,12,.75)';ctx.fillRect(q.x-30,q.y+31,60,6);ctx.fillStyle=col;ctx.fillRect(q.x-30,q.y+31,60*((p.progress+100)/200),6);
    if(p.fort>0){ctx.fillStyle='#80745a';ctx.fillRect(q.x-22,q.y-8,44,16);ctx.fillStyle='#c3b78d';ctx.fillRect(q.x-17,q.y-4,34,3);ctx.fillStyle='#f1dd9d';ctx.font='700 8px system-ui';ctx.fillText('DEF',q.x,q.y+5);}
    ctx.textAlign='start';
  }
}

function drawSmokes(){
  for(const s of state.smokes){const q=worldToScreen(s.x,s.y),rr=s.r*cam.zoom;if(!visible(q,rr))continue;const a=Math.min(.42,s.life/7*.42);for(let i=0;i<7;i++){ctx.fillStyle=`rgba(214,219,210,${a*(.6+i*.04)})`;ctx.beginPath();ctx.arc(q.x+Math.sin(i*2.1+s.life)*rr*.38,q.y+Math.cos(i*1.7+s.life)*rr*.24,rr*(.3+(i%3)*.08),0,Math.PI*2);ctx.fill();}}
}

function drawUnit(u){
  const q=worldToScreen(u.x,u.y);if(!visible(q,28))return;const s=clamp(cam.zoom,0.65,1.15),team=u.team==='ally'?COLORS.ally:COLORS.enemy,dark=u.team==='ally'?COLORS.allyDark:COLORS.enemyDark;
  ctx.save();ctx.translate(q.x,q.y);ctx.rotate(u.aim);
  ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(0,4,7*s,4*s,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=dark;ctx.fillRect(-4*s,-4*s,9*s,11*s);ctx.fillStyle=team;ctx.fillRect(-5*s,-3*s,10*s,6*s);
  ctx.fillStyle='#cfb38a';ctx.beginPath();ctx.arc(1*s,-6*s,3.5*s,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#1a1c18';ctx.lineWidth=2.2*s;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(2*s,-1*s);ctx.lineTo(13*s,-1*s);ctx.stroke();
  if(u.role==='heavy'){ctx.strokeStyle='#4d4c44';ctx.lineWidth=3*s;ctx.beginPath();ctx.moveTo(3*s,1*s);ctx.lineTo(15*s,1*s);ctx.stroke();}
  if(u.muzzle>0){ctx.fillStyle='#ffe080';ctx.beginPath();ctx.moveTo(14*s,-1*s);ctx.lineTo(20*s,-4*s);ctx.lineTo(18*s,1*s);ctx.closePath();ctx.fill();}
  ctx.restore();
  if(u.supp>.55){ctx.strokeStyle='#f5d778';ctx.lineWidth=1;ctx.beginPath();ctx.arc(q.x,q.y,11,0,Math.PI*2);ctx.stroke();}
}

function drawUnits(){for(const u of state.units)drawUnit(u);}

function drawRobot(){
  const r=state.robot,q=worldToScreen(r.x,r.y);if(!visible(q,80))return;const s=clamp(cam.zoom,0.65,1.2);
  ctx.save();ctx.translate(q.x,q.y);ctx.rotate(r.facing);
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(0,7,30*s,18*s,0,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#594d32';ctx.fillRect(-26*s,-20*s,12*s,40*s);ctx.fillRect(14*s,-20*s,12*s,40*s);
  ctx.fillStyle='#b79555';ctx.fillRect(-18*s,-15*s,36*s,30*s);ctx.fillStyle='#d0b36f';ctx.fillRect(-11*s,-10*s,22*s,20*s);ctx.restore();
  ctx.save();ctx.translate(q.x,q.y);ctx.rotate(r.turret);ctx.fillStyle='#6f603d';ctx.beginPath();ctx.arc(0,0,10*s,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ead18c';ctx.lineWidth=5*s;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(5*s,0);ctx.lineTo(43*s,0);ctx.stroke();ctx.strokeStyle='#8c7648';ctx.lineWidth=2*s;ctx.beginPath();ctx.moveTo(38*s,0);ctx.lineTo(49*s,0);ctx.stroke();ctx.restore();
  ctx.fillStyle='rgba(8,12,9,.74)';ctx.fillRect(q.x-22,q.y-38,44,14);ctx.fillStyle='#f3dc99';ctx.font='700 9px system-ui';ctx.textAlign='center';ctx.fillText('M-47',q.x,q.y-28);ctx.textAlign='start';
}

function drawTracers(){
  for(const t of state.tracers){const a=worldToScreen(t.x,t.y),b=worldToScreen(t.x2,t.y2),alpha=clamp(t.life/t.max,0,1);ctx.strokeStyle=t.team==='ally'?`rgba(180,225,255,${alpha})`:`rgba(255,190,150,${alpha})`;ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
}
function drawExplosions(){
  for(const e of state.explosions){const q=worldToScreen(e.x,e.y);if(e.type==='muzzleBig'){const a=e.life/e.max;ctx.fillStyle=`rgba(255,214,102,${a})`;ctx.beginPath();ctx.arc(q.x,q.y,(1-a)*22+5,0,Math.PI*2);ctx.fill();continue;}
    const t=1-e.life/e.maxLife,rr=e.max*t*cam.zoom;ctx.fillStyle=`rgba(255,112,47,${(1-t)*.55})`;ctx.beginPath();ctx.arc(q.x,q.y,rr,0,Math.PI*2);ctx.fill();ctx.fillStyle=`rgba(255,223,120,${(1-t)*.65})`;ctx.beginPath();ctx.arc(q.x,q.y,rr*.45,0,Math.PI*2);ctx.fill();}
}
function drawShell(){
  if(!state.shell)return;const s=state.shell,q=worldToScreen(s.x,s.y);
  for(let i=0;i<s.trail.length;i++){const t=s.trail[i],p=worldToScreen(t.x,t.y),a=(i+1)/s.trail.length*.18;ctx.fillStyle=`rgba(255,225,135,${a})`;ctx.beginPath();ctx.arc(p.x,p.y,2.5,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#ffe180';ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(9,12,10,.72)';ctx.fillRect(q.x+10,q.y-18,58,16);ctx.fillStyle='#fff';ctx.font='700 9px system-ui';ctx.fillText(`ALT ${Math.max(0,Math.round(s.z))}m`,q.x+14,q.y-7);
}

function drawFrontLine(){
  const allyXs=state.units.filter(u=>u.team==='ally').map(u=>u.x),enemyXs=state.units.filter(u=>u.team==='enemy').map(u=>u.x);if(!allyXs.length||!enemyXs.length)return;
  const ax=Math.max(...allyXs),ex=Math.min(...enemyXs),mid=(ax+ex)/2,p=worldToScreen(mid,0);ctx.save();ctx.strokeStyle='rgba(255,235,180,.18)';ctx.setLineDash([5,8]);ctx.beginPath();ctx.moveTo(p.x,0);ctx.lineTo(p.x,screenH);ctx.stroke();ctx.restore();
}

function drawWorld(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,screenW,screenH);
  drawBackground();drawScenery();drawGrid();drawFrontLine();drawCovers();drawPoints();drawSmokes();drawUnits();drawRobot();drawTracers();drawExplosions();drawShell();
  if(state.paused&&!state.gameOver){ctx.fillStyle='rgba(0,0,0,.08)';ctx.fillRect(0,0,screenW,screenH);}
}

function updateUI(){
  if(!state)return;const r=state.robot,nearest=[...state.points].sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y))[0],allyPts=state.points.filter(p=>p.owner==='ally').length;
  UI.robotCoord.textContent=`MAMUTE X${fmt(r.x)} Y${fmt(r.y)}`;UI.front.textContent=`FRONT ${allyPts}/${state.points.length} • A:${state.units.filter(u=>u.team==='ally').length} E:${state.units.filter(u=>u.team==='enemy').length}`;UI.sector.textContent=`SETOR ${nearest.name}`;
  UI.wind.textContent=`VENTO ${state.wind.x>=0?'L':'O'} ${Math.abs(state.wind.x).toFixed(1)} / ${state.wind.y>=0?'S':'N'} ${Math.abs(state.wind.y).toFixed(1)}`;UI.armor.textContent=`BLINDAGEM ${Math.max(0,Math.round(state.armor))}%`;
  UI.speed.textContent=`${Math.round(r.speed*.7)} km/h`;UI.he.textContent=state.ammo.HE;UI.smoke.textContent=state.ammo.SMOKE;UI.frag.textContent=state.ammo.CLUSTER;
  if(state.latestRequest){UI.requestAge.textContent=Math.max(0,Math.round(state.time-state.latestRequest.time))+'s';}
}
function applyMode(mode){
  if(!state)return;state.mode=mode;moveDir={x:0,y:0};resetJoystick();
  UI.march.classList.toggle('hidden',mode!=='march');UI.arty.classList.toggle('hidden',mode!=='artillery');
}

function resetJoystick(){const k=$('joyKnob');k.style.transform='translate(0px,0px)';joystickPointer=null;moveDir={x:0,y:0};}
function setupJoystick(){
  const joy=$('joystick'),knob=$('joyKnob');
  function move(e){if(e.pointerId!==joystickPointer)return;const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.31,d=Math.hypot(dx,dy)||1,k=Math.min(1,max/d),px=dx*k,py=dy*k;knob.style.transform=`translate(${px}px,${py}px)`;moveDir={x:px/max,y:py/max};}
  joy.addEventListener('pointerdown',e=>{if(state.mode!=='march')return;e.preventDefault();joystickPointer=e.pointerId;joy.setPointerCapture(e.pointerId);move(e);});
  joy.addEventListener('pointermove',move);
  const end=e=>{if(e.pointerId===joystickPointer)resetJoystick();};joy.addEventListener('pointerup',end);joy.addEventListener('pointercancel',end);
}
function openHelp(){state.paused=true;updateHelpExample();$('helpModal').classList.remove('hidden');}
function closeHelp(){if(!state.gameOver)state.paused=false;$('helpModal').classList.add('hidden');last=performance.now();}
function setupControls(){
  setupJoystick();
  $('deployBtn').addEventListener('click',()=>applyMode('artillery'));$('undeployBtn').addEventListener('click',()=>applyMode('march'));$('fireBtn').addEventListener('click',fireShell);
  UI.bearing.addEventListener('input',()=>{UI.bearingOut.textContent=String(UI.bearing.value).padStart(3,'0')+'°';});UI.elev.addEventListener('input',()=>UI.elevOut.textContent=UI.elev.value+'°');UI.charge.addEventListener('input',()=>UI.chargeOut.textContent=UI.charge.value);
  document.querySelectorAll('[data-shell]').forEach(b=>b.addEventListener('click',()=>{selectedShell=b.dataset.shell;document.querySelectorAll('[data-shell]').forEach(x=>x.classList.toggle('active',x===b));}));
  $('centerBtn').addEventListener('click',()=>{cam.x=state.robot.x;cam.y=state.robot.y;cam.followShell=false;});$('zoomIn').addEventListener('click',()=>cam.zoom=clamp(cam.zoom+.1,.48,1.25));$('zoomOut').addEventListener('click',()=>cam.zoom=clamp(cam.zoom-.1,.48,1.25));
  $('helpBtn').addEventListener('click',openHelp);$('closeHelp').addEventListener('click',closeHelp);$('resumeHelp').addEventListener('click',closeHelp);
  $('radioBtn').addEventListener('click',()=>$('radioDrawer').classList.toggle('hidden'));$('closeRadio').addEventListener('click',()=>$('radioDrawer').classList.add('hidden'));
  $('restartBtn').addEventListener('click',reset);
  UI.requestCard.addEventListener('click',()=>{if(!state.latestRequest)return;cam.x=state.latestRequest.x;cam.y=state.latestRequest.y;cam.followShell=false;});UI.requestCard.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();UI.requestCard.click();}});

  canvas.addEventListener('pointerdown',e=>{if(state.shell||state.paused)return;mapDrag={id:e.pointerId,sx:e.clientX,sy:e.clientY,cx:cam.x,cy:cam.y};canvas.setPointerCapture(e.pointerId);});
  canvas.addEventListener('pointermove',e=>{if(!mapDrag||mapDrag.id!==e.pointerId)return;const dx=e.clientX-mapDrag.sx,dy=e.clientY-mapDrag.sy;cam.x=clamp(mapDrag.cx-dx/cam.zoom,0,WORLD.w);cam.y=clamp(mapDrag.cy-dy/cam.zoom,0,WORLD.h);});
  const end=e=>{if(mapDrag&&mapDrag.id===e.pointerId)mapDrag=null;};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
}

function loop(t){
  const dt=Math.min(.04,(t-last)/1000||0);last=t;update(dt);drawWorld();requestAnimationFrame(loop);
}

resizeCanvas();setupControls();reset();requestAnimationFrame(loop);
