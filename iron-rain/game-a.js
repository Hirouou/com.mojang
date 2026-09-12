'use strict';
const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
const radio=document.getElementById('radio');
const UI={sector:document.getElementById('sectorChip'),mode:document.getElementById('modeChip'),score:document.getElementById('scoreChip'),coord:document.getElementById('coordHud'),wind:document.getElementById('windHud'),front:document.getElementById('frontHud'),robotCoord:document.getElementById('robotCoord'),armor:document.getElementById('armorStat'),he:document.getElementById('heStat'),smoke:document.getElementById('smokeStat'),frag:document.getElementById('fragStat')};
const WORLD={w:2200,h:1200};
const colors={ally:'#78b7ff',enemy:'#f47f7f',neutral:'#c4c9ce',allyDark:'#315d86',enemyDark:'#8a3939',cover:'#55616a',road:'#454f56'};
let state,cam,drag=null,last=performance.now(),selectedShell='HE',moveDir={x:0,y:0};
const rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const fmt=n=>String(Math.round(n)).padStart(4,'0');
function log(text,type=''){
 const d=document.createElement('div');d.className='msg '+type;d.innerHTML=text;radio.appendChild(d);radio.scrollTop=radio.scrollHeight;
 while(radio.children.length>32)radio.removeChild(radio.firstChild);
}
function logRequest(unit,target,fort=false){
 const d=document.createElement('div');d.className='msg request';
 d.innerHTML=fort?`<b>📡 ${unit.callsign}:</b> avanço bloqueado por posição fortificada. Solicito HE em <b>X${fmt(target.x)} Y${fmt(target.y)}</b>.`:`<b>📡 ${unit.callsign}:</b> Presos por fogo pesado. Solicito HE em <b>X${fmt(target.x)} Y${fmt(target.y)}</b>.`;
 const b=document.createElement('button');b.type='button';b.textContent='CENTRALIZAR COORDENADA';b.addEventListener('click',()=>{cam.x=target.x;cam.y=target.y;});d.appendChild(b);radio.appendChild(d);radio.scrollTop=radio.scrollHeight;
}
function makePoint(x,y,name){return{x,y,name,owner:'neutral',progress:0,r:68,fort:100,lastRequest:0}}
function makeCover(x,y,w,h){return{x,y,w,h}}
function makeUnit(team,x,y,role='rifle'){
 const id=Math.random().toString(36).slice(2,8);return{id,team,x,y,role,hp:100,alive:true,cool:rand(0,.7),supp:0,target:null,goal:null,takeCover:null,callsign:(team==='ally'?'A':'E')+'-'+Math.floor(rand(10,99)),speed:role==='scout'?58:role==='heavy'?36:46,range:role==='heavy'?220:170,acc:role==='heavy'?.58:.46};
}
function reset(){
 state={time:0,mode:'march',armor:100,ammo:{HE:12,SMOKE:5,CLUSTER:4},kills:0,friendly:0,shots:0,impactScore:0,wind:{x:rand(-6,6),y:rand(-4,4)},robot:{x:210,y:600,vx:0,vy:0,r:24},shell:null,explosions:[],smokes:[],points:[makePoint(540,390,'ALFA'),makePoint(1040,690,'BRAVO'),makePoint(1540,420,'CHARLIE'),makePoint(1940,660,'DELTA')],covers:[],units:[],spawnAlly:0,spawnEnemy:0,gameOver:false,radioReqCooldown:0,front:0};
 state.points[0].fort=0;state.points[1].owner='enemy';state.points[1].progress=-100;state.points[2].owner='enemy';state.points[2].progress=-100;state.points[3].owner='enemy';state.points[3].progress=-100;
 for(let i=0;i<28;i++){let x=rand(370,1900),y=rand(150,1050);state.covers.push(makeCover(x,y,rand(45,110),rand(18,38)));}
 for(let i=0;i<12;i++)state.units.push(makeUnit('ally',rand(130,300),rand(420,780),i%5===0?'heavy':i%4===0?'scout':'rifle'));
 for(let i=0;i<16;i++)state.units.push(makeUnit('enemy',rand(1900,2100),rand(250,950),i%5===0?'heavy':i%4===0?'scout':'rifle'));
 cam={x:430,y:600,zoom:.82};selectedShell='HE';moveDir={x:0,y:0};radio.innerHTML='';
 log('<b>COMANDO:</b> Mamute-47 online. Apoie o avanço. Fogo amigo autorizado por risco operacional — não por preferência.','good');
 log('<b>OBSERVAÇÃO:</b> Os pelotões vão lutar sozinhos. Quando travarem numa defesa, podem solicitar coordenadas de fogo.');
 applyMode('march');updateUI();
}
function objectiveFor(u){
 const pts=state.points;
 if(u.team==='ally'){
   const p=pts.find(p=>p.owner!=='ally'); return p||{x:WORLD.w-80,y:600};
 } else {
   const rev=[...pts].reverse();const p=rev.find(p=>p.owner!=='enemy');return p||{x:80,y:600};
 }
}
function nearbyEnemy(u,r){let best=null,bd=r;for(const v of state.units){if(!v.alive||v.team===u.team)continue;const d=dist(u,v);if(d<bd){bd=d;best=v}}return best}
function nearestCover(u,threat){let best=null,score=1e9;for(const c of state.covers){const cx=c.x+c.w/2,cy=c.y+c.h/2,d=Math.hypot(u.x-cx,u.y-cy);if(d<170){const tdist=Math.hypot(threat.x-cx,threat.y-cy);const s=d-tdist*.12;if(s<score){score=s;best={x:cx,y:cy}}}}return best}
function fireBullet(u,v){
 u.cool=u.role==='heavy'?1.2:rand(.55,.95);
 const smokePenalty=state.smokes.some(s=>Math.hypot(u.x-s.x,u.y-s.y)<s.r||Math.hypot(v.x-s.x,v.y-s.y)<s.r)?.35:0;
 const hit=Math.random()<Math.max(.08,u.acc-smokePenalty)*(1-clamp(dist(u,v)/u.range,0,1)*.45)*(1-u.supp*.45);
 state.explosions.push({type:'tracer',x:u.x,y:u.y,x2:v.x,y2:v.y,life:.12});
 if(hit){v.hp-=u.role==='heavy'?rand(34,52):rand(18,32);v.supp=clamp(v.supp+.35,0,1);if(v.hp<=0){v.alive=false;if(u.team==='ally'&&Math.random()<.2)log(`<b>${u.callsign}:</b> alvo abatido, avançando.`,'good');}}
 else v.supp=clamp(v.supp+.12,0,1);
}
function updateUnits(dt){
 for(const u of state.units){if(!u.alive)continue;u.cool-=dt;u.supp=Math.max(0,u.supp-dt*.11);
   const enemy=nearbyEnemy(u,u.range);
   if(enemy){
     u.target=enemy;
     if(u.supp>.48){if(!u.takeCover)u.takeCover=nearestCover(u,enemy);}
     if(u.takeCover){moveToward(u,u.takeCover,dt,u.speed*.65);if(Math.hypot(u.x-u.takeCover.x,u.y-u.takeCover.y)<16)u.takeCover=null;}
     if(u.cool<=0&&dist(u,enemy)<u.range)fireBullet(u,enemy);
   } else {
     u.target=null;const goal=objectiveFor(u);u.goal=goal;
     const gd=Math.hypot(goal.x-u.x,goal.y-u.y);
     const fortified=goal.fort>0&&goal.owner!==u.team&&gd<215;
     if(fortified){
       if(!u.takeCover)u.takeCover=nearestCover(u,goal);
       if(u.takeCover&&Math.hypot(u.x-u.takeCover.x,u.y-u.takeCover.y)>18)moveToward(u,u.takeCover,dt,u.speed*.55);
       u.supp=clamp(u.supp+dt*.035,0,.72);
       if(u.team==='ally'&&state.time-goal.lastRequest>13&&Math.random()<dt*.22){goal.lastRequest=state.time;logRequest(u,{x:goal.x+rand(-18,18),y:goal.y+rand(-18,18)},true);}
     }else{u.takeCover=null;moveToward(u,goal,dt,u.speed*(u.supp>.35?.42:1));}
   }
 }
 state.units=state.units.filter(u=>u.alive);
}
function moveToward(u,g,dt,speed){const dx=g.x-u.x,dy=g.y-u.y,d=Math.hypot(dx,dy)||1;u.x+=dx/d*speed*dt;u.y+=dy/d*speed*dt;u.x=clamp(u.x,20,WORLD.w-20);u.y=clamp(u.y,20,WORLD.h-20)}
function updatePoints(dt){
 for(const p of state.points){let a=0,e=0;for(const u of state.units){if(Math.hypot(u.x-p.x,u.y-p.y)<p.r){u.team==='ally'?a++:e++;}}
   if(a>e){p.progress=clamp(p.progress+(a-e)*dt*6,-100,100);}else if(e>a){p.progress=clamp(p.progress-(e-a)*dt*6,-100,100);}
   const prev=p.owner;if(p.progress>=100)p.owner='ally';else if(p.progress<=-100)p.owner='enemy';else if(Math.abs(p.progress)<10)p.owner='neutral';
   if(prev!==p.owner&&p.owner!=='neutral')log(`<b>COMANDO:</b> Ponto ${p.name} ${p.owner==='ally'?'capturado pelos aliados':'tomado pelo inimigo'}.`,p.owner==='ally'?'good':'bad');
   const nearAllies=state.units.filter(u=>u.team==='ally'&&Math.hypot(u.x-p.x,u.y-p.y)<190);
   const nearEnemies=state.units.filter(u=>u.team==='enemy'&&Math.hypot(u.x-p.x,u.y-p.y)<190);
   if(nearAllies.length>=2&&nearEnemies.length>=2&&state.time-p.lastRequest>18&&Math.random()<dt*.06){p.lastRequest=state.time;const caller=nearAllies[Math.floor(Math.random()*nearAllies.length)];const tx=nearEnemies.reduce((s,u)=>s+u.x,0)/nearEnemies.length+rand(-25,25),ty=nearEnemies.reduce((s,u)=>s+u.y,0)/nearEnemies.length+rand(-25,25);logRequest(caller,{x:tx,y:ty});}
 }
}
function spawnLogic(dt){
 state.spawnAlly-=dt;state.spawnEnemy-=dt;
 if(state.spawnAlly<=0){state.spawnAlly=rand(4.3,6.4);const n=state.points.filter(p=>p.owner==='ally').length;const x=n?state.points[Math.max(0,n-1)].x-110:120;const y=n?state.points[Math.max(0,n-1)].y+rand(-120,120):rand(360,840);state.units.push(makeUnit('ally',clamp(x,80,2050),clamp(y,80,1120),Math.random()<.18?'heavy':'rifle'));}
 if(state.spawnEnemy<=0){state.spawnEnemy=rand(4.0,6.1);const owned=state.points.filter(p=>p.owner==='enemy');const base=owned.length?owned[0]:{x:2080,y:600};state.units.push(makeUnit('enemy',clamp(base.x+120,100,2120),clamp(base.y+rand(-150,150),80,1120),Math.random()<.18?'heavy':'rifle'));}
}
function updateRobot(dt){if(state.mode!=='march'||state.shell)return;const s=82;state.robot.x=clamp(state.robot.x+moveDir.x*s*dt,50,WORLD.w-50);state.robot.y=clamp(state.robot.y+moveDir.y*s*dt,50,WORLD.h-50);
 const enemy=nearbyRobotEnemy(135);if(enemy){state.armor-=dt*rand(.8,1.8);if(state.armor<=0&&!state.gameOver){state.gameOver=true;log('<b>MAMUTE-47:</b> blindagem colapsou. Sistema de artilharia fora de combate.','bad');}}
}
function nearbyRobotEnemy(r){let best=null,bd=r;for(const u of state.units){if(u.team!=='enemy')continue;const d=Math.hypot(u.x-state.robot.x,u.y-state.robot.y);if(d<bd){bd=d;best=u}}return best}
function getShotParams(){return{bearing:+document.getElementById('bearing').value,elev:+document.getElementById('elevation').value,charge:+document.getElementById('charge').value}}
