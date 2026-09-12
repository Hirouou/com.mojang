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
