function updateDefenses(dt){const p=objective();for(const pt of state.points){if(pt.owner==='ally')continue;for(const d of pt.defenses){if(!d.alive)continue;d.cool-=dt;d.muzzle=Math.max(0,d.muzzle-dt);if(pt!==p&&state.operation.phase!=='CONSOLIDATE')continue;const t=defenseTarget(d);if(t){d.aim=Math.atan2(t.y-d.y,t.x-d.x);if(d.cool<=0)defenseFire(d,t)}}}}
function stagingFor(u,p){const lanes=[-165,0,165],y=p.y+lanes[u.squad%3];return{x:p.x-380,y}}
function assaultGoal(u,p){const lanes=[-150,0,150],y=p.y+lanes[u.squad%3];return{x:p.x+20,y}}
function defensiveGoal(u,p){const a=(u.squad%3-1)*120;return{x:p.x+rand(-35,35),y:p.y+a+rand(-35,35)}}
function updateUnits(dt){const p=objective(),phase=state.operation.phase;for(const u of state.units){if(!u.alive)continue;u.cool-=dt;u.muzzle=Math.max(0,u.muzzle-dt);u.supp=Math.max(0,u.supp-dt*.08);u.coverBonus=inCover(u)?.26:0;const foe=nearestEnemy(u,u.range);
  if(foe&&(phase==='ASSAULT'||phase==='CONSOLIDATE'||u.team==='enemy'||dist(u,foe)<115)){u.target=foe;u.aim=Math.atan2(foe.y-u.y,foe.x-u.x);if(u.supp>.52&&!u.coverTarget)u.coverTarget=nearestCover(u,foe,210);if(u.coverTarget&&dist(u,u.coverTarget)>12)moveToward(u,u.coverTarget,dt,u.speed*.48);if(u.cool<=0&&dist(u,foe)<u.range)fireBullet(u,foe);continue}else u.target=null;
  if(u.team==='ally'){
    if(!p){u.state='hold';continue}
    if(phase==='RALLY'){u.state='rally';const g=stagingFor(u,p);if(dist(u,g)>18)moveToward(u,g,dt,u.speed*.8)}
    else if(phase==='RECON'){if(u.role==='scout'){u.state='recon';const g={x:p.x-250,y:p.y+(u.squad-1)*145};if(dist(u,g)>16)moveToward(u,g,dt,u.speed*.75)}else{u.state='hold';const g=stagingFor(u,p);if(dist(u,g)>16)moveToward(u,g,dt,u.speed*.45)}}
    else if(phase==='PREP'){u.state='hold';const c=nearestCover(u,p,220)||stagingFor(u,p);if(dist(u,c)>15)moveToward(u,c,dt,u.speed*.35);else u.aim=Math.atan2(p.y-u.y,p.x-u.x)}
    else if(phase==='ASSAULT'){u.state='assault';const g=assaultGoal(u,p);if(u.supp>.62){const c=nearestCover(u,p,210);if(c)moveToward(u,c,dt,u.speed*.5)}else moveToward(u,g,dt,u.speed*(u.squad===1?.82:1))}
    else if(phase==='CONSOLIDATE'){u.state='hold';const g={x:p.x-70+rand(-25,25),y:p.y+(u.squad-1)*90};if(dist(u,g)>18)moveToward(u,g,dt,u.speed*.45)}
    else if(phase==='RETREAT'){u.state='retreat';const prev=state.points[Math.max(0,p.index-1)],g={x:prev.x+120,y:prev.y+(u.squad-1)*110};moveToward(u,g,dt,u.speed*.85)}
  } else {
    let defPoint=state.points.filter(q=>q.owner!=='ally').sort((a,b)=>a.index-b.index)[0]||state.points[state.points.length-1];if(state.counter.active&&state.counter.target&&dist(u,state.counter.target)<520)defPoint=state.counter.target;u.state='defend';const g=defensiveGoal(u,defPoint);if(dist(u,g)>85)moveToward(u,g,dt,u.speed*.42)
  }
 }
 state.units=state.units.filter(u=>u.alive)
}
