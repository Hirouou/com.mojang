function fireShell(){
 if(state.gameOver||state.shell||state.mode!=='artillery')return;
 if(state.ammo[selectedShell]<=0){log(`<b>CARREGADOR:</b> sem munição ${selectedShell}.`,'bad');return;}
 const p=getShotParams();state.ammo[selectedShell]--;state.shots++;
 const rad=p.bearing*Math.PI/180,el=p.elev*Math.PI/180;
 const muzzle=[0,49,63,76,87,97][p.charge];
 state.shell={x:state.robot.x,y:state.robot.y,z:2,vx:Math.sin(rad)*muzzle,vy:-Math.cos(rad)*muzzle,vz:Math.sin(el)*muzzle,forward:Math.cos(el),type:selectedShell,t:0};
 const horiz=Math.cos(el)*muzzle;state.shell.vx=Math.sin(rad)*horiz;state.shell.vy=-Math.cos(rad)*horiz;
 log(`<b>MAMUTE-47:</b> tiro ${selectedShell}. Az ${String(p.bearing).padStart(3,'0')}°, El ${p.elev}°, carga ${p.charge}.`);
 updateUI();
}
function impactShell(s){
 const x=s.x,y=s.y;state.shell=null;cam.x=x;cam.y=y;
 if(s.type==='SMOKE'){state.smokes.push({x,y,r:110,life:24});state.explosions.push({type:'blast',x,y,r:20,max:70,life:.7});log(`<b>OBSERVADOR:</b> cortina de fumaça em X${fmt(x)} Y${fmt(y)}.`,'good');return;}
 const radius=s.type==='CLUSTER'?120:92;let ek=0,fk=0;
 for(const u of state.units){const d=Math.hypot(u.x-x,u.y-y);if(d<radius){const dmg=(1-d/radius)*(s.type==='CLUSTER'?140:190);u.hp-=dmg;if(u.hp<=0&&u.alive){u.alive=false;if(u.team==='enemy'){ek++;state.kills++;}else{fk++;state.friendly++;}}else u.supp=clamp(u.supp+.8,0,1);}}
 for(const p of state.points){const d=Math.hypot(p.x-x,p.y-y);if(d<radius+30&&p.fort>0){const before=p.fort;p.fort=Math.max(0,p.fort-(s.type==='HE'?60:25));if(before>0&&p.fort===0)log(`<b>OBSERVADOR:</b> fortificação de ${p.name} destruída. A infantaria pode avançar.`, 'good');}}
 state.explosions.push({type:'blast',x,y,r:18,max:radius,life:.8});
 const score=ek*10-fk*14;state.impactScore+=score;
 if(fk>0)log(`<b>FOGO AMIGO:</b> impacto matou ${fk} aliado(s) e ${ek} inimigo(s). A batalha continua.`,'bad');
 else if(ek>0)log(`<b>OBSERVADOR:</b> bom impacto. ${ek} inimigo(s) neutralizado(s).`,'good');
 else log(`<b>OBSERVADOR:</b> impacto sem baixas confirmadas.`);
}
function updateShell(dt){if(!state.shell)return;const s=state.shell;s.t+=dt;const timeScale=4.15;s.vx+=state.wind.x*dt*.9;s.vy+=state.wind.y*dt*.9;s.vz-=9.81*timeScale*dt;s.x+=s.vx*timeScale*dt;s.y+=s.vy*timeScale*dt;s.z+=s.vz*timeScale*dt;cam.x=s.x;cam.y=s.y;if(s.z<=0||s.x<0||s.y<0||s.x>WORLD.w||s.y>WORLD.h){impactShell(s)}}
function updateEffects(dt){state.explosions.forEach(e=>e.life-=dt);state.explosions=state.explosions.filter(e=>e.life>0);state.smokes.forEach(s=>s.life-=dt);state.smokes=state.smokes.filter(s=>s.life>0)}
function battleStatus(){const allyPts=state.points.filter(p=>p.owner==='ally').length,enemyPts=state.points.filter(p=>p.owner==='enemy').length;if(allyPts===state.points.length&&!state.gameOver){state.gameOver=true;log('<b>COMANDO:</b> todos os setores dominados. A linha inimiga colapsou. Vitória.','good');}if(enemyPts===state.points.length&&state.robot.x>1500&&!state.gameOver){state.gameOver=true;log('<b>COMANDO:</b> perdemos todos os setores com o Mamute isolado no front. Retirada.','bad');}}
function update(dt){if(state.gameOver)return;state.time+=dt;updateRobot(dt);updateUnits(dt);updatePoints(dt);spawnLogic(dt);updateShell(dt);updateEffects(dt);battleStatus();updateUI();}
function worldToScreen(x,y){return{x:(x-cam.x)*cam.zoom+canvas.width/2,y:(y-cam.y)*cam.zoom+canvas.height/2}}
function screenToWorld(x,y){return{x:(x-canvas.width/2)/cam.zoom+cam.x,y:(y-canvas.height/2)/cam.zoom+cam.y}}
