/** First-person locomotion in the Mamute's physical interior, in metres. */
// The rear hatch leads to a short service corridor.  Keeping it in the same
// local coordinate system makes the transition seamless while preserving the
// close, first-person scale of the Mamute interior.
export const CABIN_BOUNDS = Object.freeze({ minX: -2.45, maxX: 2.45, minZ: -3.15, maxZ: 8.05 });
export const CABIN_OBSTACLES = Object.freeze([
  { minX: -2.48, maxX: -1.14, minZ: -.05, maxZ: 1.55 },
  { minX: .55, maxX: 1.79, minZ: -3.2, maxZ: -.52 },
  { minX: -2.46, maxX: -.92, minZ: -3.17, maxZ: -2.45 },
  { minX: -.89, maxX: .57, minZ: -1.52, maxZ: -1.02 },
  { minX: .31, maxX: .7, minZ: -2.29, maxZ: -1.4 },
  { minX: .92, maxX: 2.22, minZ: -.36, maxZ: .72 },
  { minX: -2.13, maxX: -1.4, minZ: -2.24, maxZ: -1.5 },
  { minX: 1.78, maxX: 2.5, minZ: .72, maxZ: 3.35 },
  { minX: -2.48, maxX: -1.78, minZ: 2.01, maxZ: 3.28 },
  { minX: -1.66, maxX: -.75, minZ: 2.9, maxZ: 3.49 },
  { minX: .42, maxX: 1.55, minZ: 2.46, maxZ: 3.19 },
  { minX: -2.48, maxX: -.78, minZ: 3.56, maxZ: 3.78 },
  { minX: .78, maxX: 2.48, minZ: 3.56, maxZ: 3.78 },
  { minX: -2.48, maxX: -.87, minZ: 3.78, maxZ: 5.2 },
  { minX: .87, maxX: 2.48, minZ: 3.78, maxZ: 5.2 },
  { minX: .74, maxX: 2.48, minZ: 5.65, maxZ: 7.83 },
  { minX: -2.48, maxX: -1.3, minZ: 6.19, maxZ: 7.78 },
]);
export const CABIN_STATIONS = Object.freeze([
  { id: 'aim', label: 'POSTO DE PONTARIA', action: 'Operar manivelas', x: -.21, y: 1.23, z: -1.05, focusX: -.21, focusZ: -.78, radius: 1.48 },
  { id: 'map', label: 'MESA DE NAVEGAÇÃO', action: 'Abrir mapa de mesa', x: -1.6, y: 1.03, z: .7, focusX: -.9, focusZ: .7, radius: 1.58, allowSurfaceReach: true },
  { id: 'load', label: 'PAIOL / CULATRA', action: 'Preparar munição', x: 2.03, y: 1.34, z: 1.7, focusX: 1.55, focusZ: 1.7, radius: 1.48 },
  { id: 'drive', label: 'POSTO DO CONDUTOR', action: 'Assumir marcha', x: -1.57, y: 1.18, z: -2.68, focusX: -.7, focusZ: -2.4, radius: 1.5, allowSurfaceReach: true },
  { id: 'radio', label: 'RÁDIO DE CAMPANHA', action: 'Consultar chamados', x: -2.08, y: 1.4, z: 2.53, focusX: -1.55, focusZ: 2.53, radius: 1.48 },
  { id: 'extinguisher', label: 'EXTINTOR DE BORDO', action: 'Pegar extintor', x: -2.25, y: 1.15, z: 1.88, focusX: -1.55, focusZ: 1.88, radius: 1.2 },
  { id: 'engine', label: 'MOTOR / REFRIGERAÇÃO', action: 'Inspecionar motor', x: .82, y: 1.24, z: 6.6, focusX: .5, focusZ: 6.6, radius: 1.35 },
]);
export const CABIN_SECTIONS = Object.freeze({ CABIN:'cabin', SERVICE_CORRIDOR:'service-corridor', ENGINE_ROOM:'engine-room' });
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const wrapAngle=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const circleHitsBox=(x,z,r,b)=>{const dx=x-clamp(x,b.minX,b.maxX),dz=z-clamp(z,b.minZ,b.maxZ);return dx*dx+dz*dz<r*r;};
const pointInsideBox=(x,z,b)=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
const INTERACTION_REACH_RADIUS=.08;
const INTERACTION_SIGHT_RADIUS=.025;
const FOCUS_FACING_TIE=.08;
const INTERACTION_EYE_HEIGHT=1.58;
export function canOccupyCabin(x,z,radius=.21){if(![x,z,radius].every(Number.isFinite)||radius<0)return false;if(x<CABIN_BOUNDS.minX+radius||x>CABIN_BOUNDS.maxX-radius||z<CABIN_BOUNDS.minZ+radius||z>CABIN_BOUNDS.maxZ-radius)return false;return !CABIN_OBSTACLES.some(b=>circleHitsBox(x,z,radius,b));}
export function canReachCabinPoint(fromX,fromZ,toX,toZ,radius=.21){if(![fromX,fromZ,toX,toZ,radius].every(Number.isFinite)||radius<0)return false;if(!canOccupyCabin(fromX,fromZ,radius)||!canOccupyCabin(toX,toZ,radius))return false;const distance=Math.hypot(toX-fromX,toZ-fromZ),steps=Math.max(1,Math.ceil(distance/.08));for(let i=1;i<steps;i++){const t=i/steps;if(!canOccupyCabin(fromX+(toX-fromX)*t,fromZ+(toZ-fromZ)*t,radius))return false;}return true;}
export function canSeeCabinPoint(fromX,fromZ,toX,toZ,radius=INTERACTION_SIGHT_RADIUS){if(![fromX,fromZ,toX,toZ,radius].every(Number.isFinite)||radius<0)return false;if(!canOccupyCabin(fromX,fromZ,radius)||toX<CABIN_BOUNDS.minX||toX>CABIN_BOUNDS.maxX||toZ<CABIN_BOUNDS.minZ||toZ>CABIN_BOUNDS.maxZ)return false;const distance=Math.hypot(toX-fromX,toZ-fromZ),steps=Math.max(1,Math.ceil(distance/.06));for(let i=1;i<=steps;i++){const t=i/steps,x=fromX+(toX-fromX)*t,z=fromZ+(toZ-fromZ)*t,hit=CABIN_OBSTACLES.find(b=>circleHitsBox(x,z,radius,b));if(hit)return pointInsideBox(toX,toZ,hit);}return true;}
export function cabinSectionAt(x,z){if(!canOccupyCabin(x,z))return null;if(z<3.56)return CABIN_SECTIONS.CABIN;if(z<5.28)return CABIN_SECTIONS.SERVICE_CORRIDOR;return CABIN_SECTIONS.ENGINE_ROOM;}
export function cabinCrewPose({x,z,yaw=0,pitch=0}={}){if(![x,z,yaw,pitch].every(Number.isFinite)||!canOccupyCabin(x,z))return null;return Object.freeze({x,z,yaw:wrapAngle(yaw),pitch:clamp(pitch,-1.03,.91),section:cabinSectionAt(x,z)});}
export function interpolateCabinCrewPose(from,to,alpha=1){const a=cabinCrewPose(from),b=cabinCrewPose(to);if(!a||!b||!Number.isFinite(alpha))return null;const t=clamp(alpha,0,1),yawDelta=wrapAngle(b.yaw-a.yaw);return cabinCrewPose({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:wrapAngle(a.yaw+yawDelta*t),pitch:a.pitch+(b.pitch-a.pitch)*t});}
export function touchAimViewLocked(doc=globalThis.document,media=globalThis.matchMedia){const app=doc?.getElementById?.('app'),deck=doc?.getElementById?.('fireDeck');if(!app?.classList||deck?.dataset?.station!=='aim')return false;if(!app.classList.contains('inside')||!app.classList.contains('station-engaged'))return false;const explicitTouch=app.classList.contains('input-touch');let coarse=false;if(!app.classList.contains('input-mouse')&&typeof media==='function'){try{coarse=Boolean(media('(hover: none) and (pointer: coarse)')?.matches);}catch{}}return explicitTouch||coarse;}
export function createCabinMovement(){const position={x:0,z:2.4};let yaw=0,pitch=-.08,travelled=0;return{position,get yaw(){return yaw;},get pitch(){return pitch;},get travelled(){return travelled;},get section(){return cabinSectionAt(position.x,position.z);},setPose({x=position.x,z=position.z,yaw:nextYaw=yaw,pitch:nextPitch=pitch}={}){if(![x,z,nextYaw,nextPitch].every(Number.isFinite)||!canOccupyCabin(x,z))return false;position.x=x;position.z=z;yaw=wrapAngle(nextYaw);pitch=clamp(nextPitch,-1.03,.91);return true;},look(dx,dy){if(touchAimViewLocked())return false;yaw=wrapAngle(yaw-(Number.isFinite(dx)?dx:0));pitch=clamp(pitch-(Number.isFinite(dy)?dy:0),-1.03,.91);return true;},lookToward(point,blend=1){if(!point||![point.x,point.y,point.z,blend].every(Number.isFinite))return false;const dx=point.x-position.x,dz=point.z-position.z,targetYaw=Math.atan2(-dx,-dz),targetPitch=Math.atan2(point.y-INTERACTION_EYE_HEIGHT,Math.hypot(dx,dz)),delta=Math.atan2(Math.sin(targetYaw-yaw),Math.cos(targetYaw-yaw)),t=clamp(blend,0,1);yaw=wrapAngle(yaw+delta*t);pitch+=(clamp(targetPitch,-1.03,.91)-pitch)*t;return true;},update(dt,move={}){const mx=Number.isFinite(move?.x)?move.x:0,my=Number.isFinite(move?.y)?move.y:0,magnitude=Math.max(1,Math.hypot(mx,my)),frameDt=Number.isFinite(dt)&&dt>0?Math.min(dt,.1):0,distance=frameDt*1.65,dx=(Math.cos(yaw)*mx+Math.sin(yaw)*my)/magnitude*distance,dz=(-Math.sin(yaw)*mx+Math.cos(yaw)*my)/magnitude*distance,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.035));for(let i=0;i<steps;i++){const oldX=position.x,oldZ=position.z,sx=dx/steps,sz=dz/steps,nextX=position.x+sx,nextZ=position.z+sz;if(canOccupyCabin(nextX,nextZ)){position.x=nextX;position.z=nextZ;}else{const canX=canOccupyCabin(nextX,position.z),canZ=canOccupyCabin(position.x,nextZ);if(canX&&canZ){if(Math.abs(sx)>=Math.abs(sz))position.x=nextX;else position.z=nextZ;}else if(canX)position.x=nextX;else if(canZ)position.z=nextZ;}travelled+=Math.hypot(position.x-oldX,position.z-oldZ);}},focus(){const fx=-Math.sin(yaw),fz=-Math.cos(yaw);return CABIN_STATIONS.map(s=>{const targetX=Number.isFinite(s.focusX)?s.focusX:s.x,targetZ=Number.isFinite(s.focusZ)?s.focusZ:s.z,dx=targetX-position.x,dz=targetZ-position.z,distance=Math.hypot(dx,dz),targetFacing=distance<=.05?1:(dx*fx+dz*fz)/distance,stationDx=s.x-position.x,stationDz=s.z-position.z,stationDistance=Math.hypot(stationDx,stationDz),stationFacing=stationDistance<=.05?1:(stationDx*fx+stationDz*fz)/stationDistance,targetReachable=canReachCabinPoint(position.x,position.z,targetX,targetZ,INTERACTION_REACH_RADIUS),stationVisible=canSeeCabinPoint(position.x,position.z,s.x,s.z),surfaceReachable=Boolean(s.allowSurfaceReach)&&stationVisible&&stationDistance<=s.radius,interactionDistance=Math.min(targetReachable?distance:Infinity,surfaceReachable?stationDistance:Infinity),facing=Math.max(targetFacing,stationVisible?stationFacing:-1),targetPitch=Math.atan2((Number.isFinite(s.y)?s.y:INTERACTION_EYE_HEIGHT)-INTERACTION_EYE_HEIGHT,Math.max(stationDistance,.05)),verticalFacing=Math.cos(targetPitch-pitch);return{...s,distance:interactionDistance,facing,verticalFacing,reachable:targetReachable||surfaceReachable};}).filter(s=>s.reachable&&s.distance<=s.radius&&s.facing>.34&&s.verticalFacing>.34).sort((a,b)=>Math.abs(b.facing-a.facing)>FOCUS_FACING_TIE?b.facing-a.facing:a.distance-b.distance)[0]||null;},reset(){position.x=0;position.z=2.4;yaw=0;pitch=-.08;travelled=0;},crewPose(){return cabinCrewPose({x:position.x,z:position.z,yaw,pitch});},snapshot(){return{position:{...position},yaw,pitch,travelled,section:cabinSectionAt(position.x,position.z)};}};}