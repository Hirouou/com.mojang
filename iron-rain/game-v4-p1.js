'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d'),shell=$('gameShell'),radioLog=$('radioLog');
const WORLD={w:3200,h:1800},COL={ally:'#65b9ff',enemy:'#ef7167',ground:'#4b743f',ground2:'#416a39',road:'#75674f',sand:'#a09166',wall:'#59605a',amber:'#efca69'};
let state,cam,last=performance.now(),screenW=1280,screenH=720,dpr=1,moveDir={x:0,y:0},mapDrag=null,pinch=null,joyPointer=null,selectedShell='HE',repeatTimer=null,repeatLoop=null;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),rand=(a,b)=>a+Math.random()*(b-a),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),fmt=n=>String(Math.round(n)).padStart(4,'0');
const PHASES={RALLY:'REAGRUPANDO',RECON:'RECONHECIMENTO',PREP:'AGUARDANDO FOGO',ASSAULT:'INVESTIDA',CONSOLIDATE:'CONSOLIDANDO',RETREAT:'RECUANDO'};
const UI={robot:$('robotCoord'),objective:$('objectiveHud'),phase:$('phaseHud'),wind:$('windHud'),front:$('frontHud'),speed:$('speedHud'),march:$('marchControls'),arty:$('artilleryControls'),request:$('requestCard'),reqTitle:$('requestTitle'),reqText:$('requestText'),reqHint:$('requestHint'),bearing:$('bearingOut'),elev:$('elevationOut'),charge:$('chargeOut'),he:$('heAmmo'),smoke:$('smokeAmmo'),frag:$('fragAmmo'),helpEx:$('helpExample'),end:$('endOverlay'),endTitle:$('endTitle'),endText:$('endText')};
function resize(){const r=shell.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);screenW=Math.max(320,r.width);screenH=Math.max(180,r.height);canvas.width=Math.round(screenW*dpr);canvas.height=Math.round(screenH*dpr);canvas.style.width=screenW+'px';canvas.style.height=screenH+'px';ctx.setTransform(dpr,0,0,dpr,0,0)}
addEventListener('resize',resize);addEventListener('orientationchange',()=>setTimeout(resize,120));
document.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('selectstart',e=>e.preventDefault());
function roadY(x){return 920+Math.sin(x*.0032)*190+Math.sin(x*.008)*55}
function log(t,type=''){const d=document.createElement('div');d.className='msg '+type;d.innerHTML=t;radioLog.appendChild(d);radioLog.scrollTop=radioLog.scrollHeight;while(radioLog.children.length>50)radioLog.removeChild(radioLog.firstChild)}
function makeCover(x,y,w,h,type='wall'){return{x,y,w,h,type}}
function makeDefense(p,type,ox,oy,i){const S={HMG:{hp:125,range:360,rate:1.05,damage:22,acc:.62},AUTOCANNON:{hp:170,range:420,rate:1.75,damage:48,acc:.58},MORTAR:{hp:110,range:520,rate:5.5,damage:62,acc:.48}}[type];return{point:p,type,x:p.x+ox,y:p.y+oy,hp:S.hp,maxHp:S.hp,range:S.range,rate:S.rate,damage:S.damage,acc:S.acc,cool:rand(.5,S.rate),alive:true,aim:Math.PI,muzzle:0,id:p.name+'-'+i}}
