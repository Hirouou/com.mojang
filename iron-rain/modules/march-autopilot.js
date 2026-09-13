const WORLD = Object.freeze({ w: 80000, h: 60000 });
export const AUTO_ADVANCE_BASE_SPEED = 38;
export const AUTO_ADVANCE_ARRIVAL_RADIUS = 85;

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
const valid=p=>p&&Number.isFinite(Number(p.x))&&Number.isFinite(Number(p.y));
const point=p=>Object.freeze({x:clamp(Number(p.x),0,WORLD.w),y:clamp(Number(p.y),0,WORLD.h)});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let target=null, route=[], index=0, status='idle', reason='', serial=0, planned=false, lastPublish=-Infinity;

function now(state){return Number(state?.time)||Number(globalThis.performance?.now?.()||0)/1000||0;}
function snap(state=null){const robot=valid(state?.robot)?state.robot:null,next=route[index]||target;return Object.freeze({active:!!target,status,reason,serial,target:target?Object.freeze({...target}):null,waypoint:next?Object.freeze({...next}):null,waypointIndex:index,waypointCount:route.length,distance:robot&&target?Math.round(dist(robot,target)):null});}
function publish(state=null,force=false){const t=now(state);if(!force&&t-lastPublish<.45)return;lastPublish=t;const detail=snap(state);globalThis.ironRainAutoAdvance=detail;try{globalThis.dispatchEvent?.(new CustomEvent('ironrain:auto-advance-state',{detail}));}catch{}}
function normalizeRoute(input,finalTarget){const out=[];for(const item of Array.isArray(input)?input:[]){if(!valid(item))continue;const p=point(item);if(!out.length||dist(out.at(-1),p)>30)out.push(p);}if(!out.length||dist(out.at(-1),finalTarget)>30)out.push(finalTarget);return out;}

export function requestAutoAdvance(value,{waypoints=[]}={}){if(!valid(value))return Object.freeze({ok:false,reason:'invalid-target'});target=point(value);route=normalizeRoute(waypoints,target);index=0;status='routing';reason='';serial++;planned=route.length>1;lastPublish=-Infinity;publish(null,true);return Object.freeze({ok:true,target:{...target},serial});}
export function cancelAutoAdvance(nextReason='manual'){const active=!!target;target=null;route=[];index=0;planned=false;status=nextReason==='arrived'?'arrived':'idle';reason=String(nextReason||'manual');serial++;lastPublish=-Infinity;publish(null,true);return Object.freeze({ok:active,reason});}
export function autoAdvanceSnapshot(state=null){return snap(state);}

function resolveRoute(state){if(planned||!target)return;planned=true;const planner=globalThis.ironRainStrategicMap?.movementPath;if(typeof planner!=='function')return;try{const result=planner({x:state.robot.x,y:state.robot.y},target);const list=Array.isArray(result)?result:result?.waypoints;if(list?.length){route=normalizeRoute(list,target);index=0;}}catch{}}
function engineReady(engine){return !!(engine&&Number.isFinite(engine.health)&&Number.isFinite(engine.fire)&&engine.health>=20&&engine.fire<=0);}
function roadMultiplier(state){for(const fn of [state?.warSimulation?.roadSpeedMultiplier,globalThis.ironRainStrategicMap?.roadSpeedMultiplier]){if(typeof fn!=='function')continue;try{const value=Number(fn({x:state.robot.x,y:state.robot.y}));if(Number.isFinite(value))return clamp(value,1,1.7);}catch{}}return 1;}

export function stepMarchAutopilot(state,dt){if(!target||!state?.robot||!Number.isFinite(dt)||dt<=0)return false;if(state.paused){status='paused';reason='game-paused';publish(state);return false;}if((Number(state.robot.armor)||0)<=0){cancelAutoAdvance('mamute-destroyed');return false;}if(!engineReady(state.engine)){state.robot.speed=0;status='paused';reason='engine-disabled';publish(state);return false;}resolveRoute(state);while(index<route.length-1&&dist(state.robot,route[index])<=105)index++;const next=route[index]||target,finalDistance=dist(state.robot,target);if(finalDistance<=AUTO_ADVANCE_ARRIVAL_RADIUS){const arrived={...target};target=null;route=[];index=0;planned=false;status='arrived';reason='arrived';state.robot.speed=0;serial++;publish(state,true);try{globalThis.dispatchEvent?.(new CustomEvent('ironrain:auto-advance-arrived',{detail:{target:arrived,position:{x:state.robot.x,y:state.robot.y}}}));}catch{}return true;}const dx=next.x-state.robot.x,dy=next.y-state.robot.y,d=Math.hypot(dx,dy);if(d<1e-6)return true;state.mode='march';state.view='field';state.station=null;const nx=dx/d,ny=dy/d,mult=roadMultiplier(state),speed=AUTO_ADVANCE_BASE_SPEED*mult,approach=Math.max(9,Math.min(speed,d*.45)),step=Math.min(d,approach*dt);state.robot.x=clamp(state.robot.x+nx*step,400,WORLD.w-400);state.robot.y=clamp(state.robot.y+ny*step,400,WORLD.h-400);state.robot.speed=step/Math.max(dt,.001);const facing=Math.atan2(ny,nx);state.robot.facing=facing;const turret=Number.isFinite(state.robot.turret)?state.robot.turret:facing,delta=Math.atan2(Math.sin(facing-turret),Math.cos(facing-turret));state.robot.turret=turret+delta*(1-Math.exp(-4.5*dt));status=mult>1.02?'road':'moving';reason=mult>1.02?'road-bonus':'';publish(state);return true;}

if(typeof globalThis?.addEventListener==='function'){
  globalThis.addEventListener('ironrain:auto-advance-request',event=>{const detail=event?.detail||{};requestAutoAdvance(detail.target||detail,{waypoints:detail.route||detail.waypoints||[]});});
  globalThis.addEventListener('ironrain:auto-advance-cancel',event=>cancelAutoAdvance(event?.detail?.reason||'manual'));
}
