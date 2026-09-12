  function nearestEnemyFor(u){
    let best = null, bd = u.range;
    const list = state.units.filter(v=>v.alive && v.team !== u.team && v.lane === u.lane);
    for(const v of list){
      const d = dist(u,v);
      const visibilityPenalty = v.crouch > 0.65 ? 70 : 0;
      if(d < bd - visibilityPenalty){ bd = d; best = v; }
    }
    if(u.team==='ally'){
      for(const e of laneEmplacements(u.lane)){
        const d = dist(u,e);
        if(d < bd && (u.role==='mg' || state.operation.phase==='suppression')){ bd = d; best = e; }
      }
    }
    return best;
  }

  function unitHitChance(attacker, target){
    const d = dist(attacker,target);
    let c = attacker.acc * (1 - clamp(d/attacker.range,0,1)*0.45);
    c -= attacker.suppression * 0.22;
    if(target.kind==='unit') c -= target.crouch * 0.18;
    if(target.kind==='emplacement') c += 0.05;
    return clamp(c, 0.06, 0.85);
  }

  function applySuppression(target, amt){
    if(target.kind==='unit') target.suppression = clamp(target.suppression + amt, 0, 1.4);
    else target.suppression = clamp((target.suppression || 0) + amt, 0, 1.3);
  }

  function addTracer(x,y,x2,y2,team,heavy=false){
    state.tracers.push({x,y,x2,y2,life:0.16,max:0.16,team,heavy});
  }

  function damageEntity(entity, dmg){
    entity.hp -= dmg;
    if(entity.hp <= 0){
      entity.alive = false;
      if(entity.kind === 'emplacement'){
        state.effects.push({type:'blast',x:entity.x,y:entity.y,r:18,max:110,life:0.9});
        state.craters.push({x:entity.x,y:entity.y,r:rand(18,28)});
        log(`<b>OBSERVADOR:</b> ${entity.label} destruída em X${fmt(entity.x)} Y${fmt(entity.y)}.`, 'good');
        if(state.operation.request && state.operation.request.target === entity) clearRequest();
      }
    }
  }

  function fireUnit(attacker, target){
    attacker.target = target;
    attacker.pop = attacker.role==='mg' ? 0.55 : 0.35;
    attacker.crouch = Math.max(0, attacker.crouch - 0.9);
    attacker.aim = Math.atan2(target.y - attacker.y, target.x - attacker.x);
    attacker.burstLeft = attacker.role==='mg' ? rand(4,7)|0 : 1;
    attacker.cool = rand(attacker.roleCool[0], attacker.roleCool[1]);
  }

  function tickFire(attacker, dt){
    if(attacker.burstLeft <= 0 || !attacker.target || !attacker.target.alive) return;
    attacker.burstTick = (attacker.burstTick||0) - dt;
    const cadence = attacker.role==='mg' ? 0.10 : 0.01;
    if(attacker.burstTick <= 0){
      attacker.burstTick = cadence;
      attacker.burstLeft--;
      const target = attacker.target;
      const hit = Math.random() < unitHitChance(attacker, target);
      const tx = hit ? target.x + rand(-5,5) : target.x + rand(-26,26);
      const ty = hit ? target.y + rand(-5,5) : target.y + rand(-26,26);
      addTracer(attacker.x, attacker.y, tx, ty, attacker.team, attacker.role==='mg');
      applySuppression(target, attacker.role==='mg' ? 0.22 : 0.12);
      if(hit) damageEntity(target, attacker.role==='mg' ? rand(8,16) : rand(16,28));
    }
  }

  function fireEmplacement(e, dt){
    if(!e.alive) return;
    e.cool -= dt;
    e.muzzle = Math.max(0, e.muzzle - dt*2.2);
    e.suppression = Math.max(0, (e.suppression||0) - dt*0.12);
    const allies = laneUnits('ally', e.lane).filter(u=>u.state !== 'retreating');
    if(!allies.length) return;
    const target = allies.sort((a,b)=>{
      const va = dist(a,e) - a.exposed*30 + a.crouch*40;
      const vb = dist(b,e) - b.exposed*30 + b.crouch*40;
      return va-vb;
    })[0];
    e.aim = Math.atan2(target.y - e.y, target.x - e.x);
    if(e.cool > 0) return;

    if(e.type === 'MORTAR'){
      e.cool = 6.5 + rand(0,2.3);
      e.muzzle = 0.5;
      const focus = {x:target.x + rand(-22,22), y:target.y + rand(-22,22)};
      state.effects.push({type:'incoming',x:focus.x,y:focus.y,t:1.1,lane:e.lane});
      return;
    }

    e.burstLeft = e.burst;
    e.cool = 2.6 + rand(0,1.4);
    e.muzzle = 0.6;
    while(e.burstLeft-- > 0){
      const hit = Math.random() < (e.type==='HMG'?0.40:0.34) * (1-target.crouch*0.35);
      const tx = hit ? target.x + rand(-6,6) : target.x + rand(-30,30);
      const ty = hit ? target.y + rand(-6,6) : target.y + rand(-30,30);
      addTracer(e.x,e.y,tx,ty,'enemy',true);
      applySuppression(target, e.type==='HMG' ? 0.24 : 0.18);
      if(hit) damageEntity(target, e.type==='HMG' ? rand(7,13) : rand(9,16));
    }
  }

  function smokeAt(x,y){
    return state.smokes.some(s=>s.life > 0 && Math.hypot(x-s.x,y-s.y) < s.r);
  }

  function updateUnits(dt){
    assignTrenchSlots();
    for(const u of state.units){
      if(!u.alive) continue;
      u.suppression = Math.max(0, u.suppression - dt*0.11);
      u.pop = Math.max(0, u.pop - dt);
      u.exposed = u.pop > 0 ? 1 : 0;
      u.crouch = lerp(u.crouch, (u.state==='assaulting' ? 0 : (u.suppression>0.35 ? 1 : (u.pop>0?0.12:0.85))), 0.18);
      u.cool -= dt;
      tickFire(u, dt);

      const lane = state.lanes[u.lane];
      const activeEmps = laneEmplacements(u.lane);
      const laneObjective = state.operation.laneIdx === u.lane && !lane.secured;
      const slot = u.slotOccupying || trenchFor(u.team,u.lane).slots[0];

      if(u.team === 'ally'){
        if(lane.secured && u.role!=='scout' && state.operation.phase==='consolidate'){
          const enemySlots = lane.enemyTrench.slots;
          const targetSlot = enemySlots[u.assignedSlot % enemySlots.length];
          moveToward(u, targetSlot, dt, u.speed*0.85);
          holdOrFire(u, dt);
          continue;
        }

        if(state.operation.phase === 'recon' && laneObjective && u.role==='scout'){
          const peek = {x:1320, y:lane.y + (u.assignedSlot-3)*22};
          moveToward(u, peek, dt, u.speed);
          const enemy = nearestEnemyFor(u);
          if(enemy && u.cool<=0 && Math.random()<0.22) fireUnit(u, enemy);
          if(Math.hypot(u.x-peek.x,u.y-peek.y) < 20){ u.state = 'observe'; }
          continue;
        }

        if(state.operation.phase === 'assault' && laneObjective && u.assault){
          u.state = 'assaulting';
          const stage1 = {x:1520, y:lane.y + (u.assignedSlot-3)*20};
          const targetSlot = lane.enemyTrench.slots[u.assignedSlot % lane.enemyTrench.slots.length];
          const goal = activeEmps.length > 0 ? stage1 : targetSlot;
          moveToward(u, goal, dt, u.speed * (u.role==='scout' ? 1.1 : 1));
          const enemy = nearestEnemyFor(u);
          if(enemy && u.cool<=0 && (Math.random()<0.18 || dist(u,enemy)<160)) fireUnit(u, enemy);
          continue;
        }

        if(state.operation.phase === 'retreat' && laneObjective && (u.assault || u.state==='assaulting')){
          u.state = 'retreating';
          moveToward(u, slot, dt, u.speed*1.08);
          continue;
        }

        u.assault = false;
        u.state = 'holding';
        moveToward(u, slot, dt, u.speed*0.9);
        holdOrFire(u, dt);
      } else {
        if(lane.secured){
          u.state = 'fallback';
          const fallback = {x:lane.enemyTrench.x+170, y:lane.y + (u.assignedSlot-3)*25};
          moveToward(u, fallback, dt, u.speed*0.9);
          const ally = nearestEnemyFor(u);
          if(ally && u.cool<=0 && Math.random()<0.25) fireUnit(u, ally);
          continue;
        }
        u.state = 'holding';
        moveToward(u, slot, dt, u.speed*0.88);
        holdOrFire(u, dt);
      }
    }
    state.units = state.units.filter(u=>u.alive);
  }

  function moveToward(u, goal, dt, speed){
    const dx = goal.x - u.x, dy = goal.y - u.y;
    const d = Math.hypot(dx,dy) || 1;
    if(d > 3){
      u.aim = Math.atan2(dy,dx);
      u.x = clamp(u.x + dx/d * speed * dt, 18, WORLD.w-18);
      u.y = clamp(u.y + dy/d * speed * dt, 18, WORLD.h-18);
    }
  }

  function holdOrFire(u, dt){
    const threat = nearestEnemyFor(u);
    if(threat && u.cool<=0){
      const smoked = smokeAt(u.x,u.y) || smokeAt(threat.x, threat.y);
      const urge = u.role==='mg' ? 0.34 : 0.18;
      if((u.suppression < 0.8 || u.role==='mg') && Math.random() < (smoked ? urge*0.45 : urge)) fireUnit(u, threat);
    }
  }

  function updateEmplacements(dt){
    for(const e of state.emplacements) fireEmplacement(e, dt);
  }

  function updateEffects(dt){
    for(const t of state.tracers) t.life -= dt;
    state.tracers = state.tracers.filter(t=>t.life>0);

    for(const s of state.smokes) s.life -= dt;
    state.smokes = state.smokes.filter(s=>s.life>0);

    for(const e of state.effects){
      e.life = (e.life ?? 0.8) - dt;
      if(e.type==='incoming'){
        e.t -= dt;
        if(e.t <= 0 && !e.done){
          e.done = true;
          e.type = 'blast';
          e.life = 0.7;
          e.max = 94;
          state.craters.push({x:e.x,y:e.y,r:rand(14,26)});
          for(const u of laneUnits('ally', e.lane)){
            const d = Math.hypot(u.x-e.x,u.y-e.y);
            if(d < 88){ applySuppression(u,0.55); damageEntity(u, rand(14,44) * (1-d/88)); }
          }
        }
      }
    }
    state.effects = state.effects.filter(e=>e.life>0 || e.type==='incoming');
  }

  function damageAtImpact(x,y,type){
    let killedEnemy = 0, killedAlly = 0;
    const rad = type==='FRAG' ? 120 : 92;
    for(const u of state.units){
      if(!u.alive) continue;
      const d = Math.hypot(u.x-x,u.y-y);
      if(d < rad){
        applySuppression(u, 0.85);
        const dmg = (1-d/rad) * (type==='FRAG' ? 120 : 84);
        const wasAlive = u.alive;
        damageEntity(u, dmg);
        if(wasAlive && !u.alive){ u.team==='enemy' ? killedEnemy++ : killedAlly++; }
      }
    }
    for(const e of state.emplacements){
      if(!e.alive) continue;
      const d = Math.hypot(e.x-x,e.y-y);
      if(d < rad + 25){
        applySuppression(e, 0.75);
        damageEntity(e, (1-d/(rad+25)) * (type==='HE' ? 132 : type==='FRAG' ? 60 : 28));
      }
    }
    state.craters.push({x,y,r:rand(18,34)});
    state.effects.push({type:'blast',x,y,life:0.8,max:type==='FRAG'?rad:rad*0.9});
    if(killedAlly > 0) log(`<b>FOGO AMIGO:</b> impacto atingiu ${killedAlly} aliado(s) e ${killedEnemy} inimigo(s).`, 'bad');
    else if(killedEnemy > 0) log(`<b>OBSERVADOR:</b> bom impacto. ${killedEnemy} inimigo(s) neutralizado(s).`, 'good');
    else log('<b>OBSERVADOR:</b> impacto observado sem baixas confirmadas.');
  }
