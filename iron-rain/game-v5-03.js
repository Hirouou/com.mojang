  function fireShell(){
    if(state.gameOver || state.paused || state.mode!=='artillery' || state.shell) return;
    if(state.ammo[selectedShell] <= 0){ log(`<b>CARREGADOR:</b> sem munição ${selectedShell}.`, 'bad'); return; }
    state.ammo[selectedShell]--;
    const speedByCharge = [0, 132, 168, 202, 236, 270];
    const bearing = state.bearing * Math.PI/180;
    const elev = state.elev * Math.PI/180;
    const muzzle = speedByCharge[state.charge];
    const horiz = Math.cos(elev) * muzzle;
    state.shell = {
      x:state.robot.x, y:state.robot.y, z:2,
      vx:Math.sin(bearing) * horiz,
      vy:-Math.cos(bearing) * horiz,
      vz:Math.sin(elev) * muzzle,
      type:selectedShell, t:0
    };
    state.camera.followShell = true;
    state.camera.lockTime = 0;
    log(`<b>MAMUTE-47:</b> tiro ${selectedShell}. Az ${String(state.bearing).padStart(3,'0')}°, El ${state.elev}°, carga ${state.charge}.`);
    updateUI();
  }

  function updateShell(dt){
    if(!state.shell) return;
    const s = state.shell;
    s.t += dt;
    const TS = 4.45;
    s.vx += state.wind.x * dt * 0.7;
    s.vy += state.wind.y * dt * 0.7;
    s.vz -= 9.81 * TS * dt;
    s.x += s.vx * TS * dt;
    s.y += s.vy * TS * dt;
    s.z += s.vz * TS * dt;
    state.camera.x = s.x;
    state.camera.y = s.y;
    state.camera.lockTime = 1.1;
    if(s.z <= 0 || s.x<0 || s.x>WORLD.w || s.y<0 || s.y>WORLD.h){
      const ix = clamp(s.x, 0, WORLD.w), iy = clamp(s.y, 0, WORLD.h);
      const type = s.type;
      state.shell = null;
      state.camera.followShell = false;
      if(type === 'SMOKE'){
        state.smokes.push({x:ix,y:iy,r:135,life:26});
        state.effects.push({type:'blast',x:ix,y:iy,life:0.65,max:62});
        log(`<b>OBSERVADOR:</b> fumaça estabelecida em X${fmt(ix)} Y${fmt(iy)}.`, 'good');
      } else {
        damageAtImpact(ix, iy, type);
      }
      checkRequestResolution(ix, iy, type);
    }
  }

  function checkRequestResolution(ix, iy, type){
    const req = state.operation.request;
    if(!req) return;
    const d = Math.hypot(ix-req.target.x, iy-req.target.y);
    if(type === 'SMOKE' && d < 120){
      log('<b>OBSERVADOR:</b> fumaça na área da missão. Preparando avanço sob cobertura.', 'good');
      clearRequest();
      state.operation.phase = 'suppression';
      state.operation.timer = 0;
      return;
    }
    if(d < 90 || !req.target.alive){
      log('<b>OBSERVADOR:</b> alvo da missão neutralizado ou suprimido. Tropa pronta para a investida.', 'good');
      clearRequest();
      state.operation.phase = 'suppression';
      state.operation.timer = 0;
    }
  }

  function friendlyAlive(){ return state.units.filter(u=>u.alive && u.team==='ally').length; }
  function enemyAlive(){ return state.units.filter(u=>u.alive && u.team==='enemy').length; }

  function replenishIfNeeded(laneIdx){
    const allies = laneUnits('ally', laneIdx);
    if(allies.length >= 5) return;
    const base = {x:state.lanes[laneIdx].allyTrench.x-300, y:state.lanes[laneIdx].y};
    const role = Math.random()<0.18 ? 'mg' : Math.random()<0.12 ? 'scout' : 'rifle';
    state.units.push(makeUnit('ally', role, laneIdx, base, Math.floor(rand(0,6))));
    log(`<b>COMANDO:</b> reforços chegando à frente ${state.lanes[laneIdx].name}.`, 'good');
  }

  function chooseMissionTarget(laneIdx){
    const emps = laneEmplacements(laneIdx);
    if(!emps.length) return null;
    emps.sort((a,b)=>{
      const pa = a.type==='HMG'?0:a.type==='MG'?1:2;
      const pb = b.type==='HMG'?0:b.type==='MG'?1:2;
      return pa-pb;
    });
    return emps[0];
  }

  function designateAssaultWave(laneIdx){
    const allies = laneUnits('ally', laneIdx).filter(u=>u.role!=='mg').sort((a,b)=>a.priority-b.priority || a.hp-b.hp);
    allies.forEach(u=>u.assault=false);
    for(let i=0;i<Math.min(4, allies.length); i++) allies[i].assault = true;
  }

  function checkLaneSecured(laneIdx){
    const lane = state.lanes[laneIdx];
    if(lane.secured) return true;
    const active = laneEmplacements(laneIdx).length;
    const enemies = laneUnits('enemy', laneIdx).length;
    const attackersNear = laneUnits('ally', laneIdx).filter(u=>u.assault && u.alive && u.x > lane.enemyTrench.x - 120).length;
    if(active === 0 && (enemies <= 2 || attackersNear >= 2)){
      lane.secured = true;
      lane.control = 'ally';
      log(`<b>COMANDO:</b> trincheira ${lane.name} tomada. Consolidando posição.`, 'good');
      return true;
    }
    return false;
  }

  function updateOperation(dt){
    const op = state.operation;
    op.timer += dt; op.phaseAge += dt;
    const laneIdx = nextObjectiveLane();
    if(laneIdx === -1){
      state.victory = true; state.gameOver = true;
      UI.endTitle.textContent = 'VITÓRIA';
      UI.endText.textContent = 'As trincheiras inimigas foram rompidas. A frente colapsou.';
      UI.end.classList.remove('hidden');
      return;
    }
    op.laneIdx = laneIdx;
    const lane = state.lanes[laneIdx];
    replenishIfNeeded(laneIdx);

    switch(op.phase){
      case 'regroup':
        op.message = 'Reagrupando pelotões na trincheira';
        if(op.timer > 8){ op.phase = 'recon'; op.timer = 0; log(`<b>COMANDO:</b> reconhecimento iniciado na frente ${lane.name}.`); }
        break;
      case 'recon':
        op.message = 'Observadores avançando';
        if(op.timer > 7){
          const target = chooseMissionTarget(laneIdx);
          if(target){
            op.phase = 'awaiting_fire'; op.timer = 0; op.phaseAge = 0;
            requestFire(target, `${lane.name} bloqueado • ${target.label} em <b>X${fmt(target.x)} Y${fmt(target.y)}</b>`);
          } else { op.phase = 'suppression'; op.timer = 0; }
        }
        break;
      case 'awaiting_fire':
        op.message = 'Aguardando fogo do Mamute';
        if(op.phaseAge > 18 && op.request){
          log('<b>OBSERVADOR:</b> a frente continua segurando posição e aguardando o disparo.', 'request');
          op.phaseAge = 0;
        }
        break;
      case 'suppression':
        op.message = 'Metralhadoras amigas suprimindo a trincheira';
        if(op.timer < 0.2) designateAssaultWave(laneIdx);
        for(const u of laneUnits('ally', laneIdx).filter(u=>u.role==='mg')){
          const target = chooseMissionTarget(laneIdx) || laneUnits('enemy', laneIdx)[0];
          if(target && u.cool<=0) fireUnit(u,target);
        }
        if(op.timer > 5.8){ op.phase = 'assault'; op.timer = 0; log(`<b>COMANDO:</b> investida iniciada na frente ${lane.name}.`, 'good'); }
        break;
      case 'assault': {
        op.message = 'Pelotões em investida';
        const emps = laneEmplacements(laneIdx).length;
        const assaultAlive = laneUnits('ally', laneIdx).filter(u=>u.assault && u.alive).length;
        if(checkLaneSecured(laneIdx)){
          op.phase = 'consolidate'; op.timer = 0; break;
        }
        if((assaultAlive <= 1 && op.timer > 8) || (emps >= 2 && op.timer > 14)){
          op.phase = 'retreat'; op.timer = 0; log(`<b>COMANDO:</b> investida abortada na frente ${lane.name}. Recuando para reorganizar.`, 'bad');
        }
        break;
      }
      case 'retreat':
        op.message = 'Recuando e recolhendo sobreviventes';
        if(op.timer > 7){ op.phase = 'regroup'; op.timer = 0; }
        break;
      case 'consolidate':
        op.message = 'Consolidando a trincheira conquistada';
        if(op.timer > 7){ op.phase = 'regroup'; op.timer = 0; }
        break;
    }

    if(friendlyAlive() <= 3 && !state.gameOver){
      state.gameOver = true;
      UI.endTitle.textContent = 'DERROTA';
      UI.endText.textContent = 'O Mamute ficou sem infantaria suficiente para continuar a operação.';
      UI.end.classList.remove('hidden');
    }
  }

  function updateRobot(dt){
    if(state.mode !== 'march' || state.shell) return;
    const sp = 98;
    state.robot.speed = Math.hypot(state.move.x, state.move.y) * sp;
    state.robot.x = clamp(state.robot.x + state.move.x * sp * dt, 180, 980);
    state.robot.y = clamp(state.robot.y + state.move.y * sp * dt, 220, WORLD.h-220);
    if(Math.hypot(state.move.x,state.move.y) > 0.1){
      state.robot.facing = Math.atan2(state.move.y, state.move.x);
    }
    const turretTarget = state.mode==='march' ? state.robot.facing : (state.bearing*Math.PI/180 - Math.PI/2);
    state.robot.turret += angleDiff(state.robot.turret, turretTarget) * 0.18;
    if(!state.camera.followShell && !mapPointer && !radarOpen && UI.helpModal.classList.contains('hidden') && UI.menuModal.classList.contains('hidden')){
      state.camera.x = lerp(state.camera.x, state.robot.x + 540, 0.025);
      state.camera.y = lerp(state.camera.y, state.robot.y, 0.045);
    }
  }

  function updateCamera(dt){
    state.camera.zoom = lerp(state.camera.zoom, state.camera.targetZoom, 0.12);
    state.camera.x = clamp(state.camera.x, screenW/(2*state.camera.zoom), WORLD.w - screenW/(2*state.camera.zoom));
    state.camera.y = clamp(state.camera.y, screenH/(2*state.camera.zoom), WORLD.h - screenH/(2*state.camera.zoom));
  }

  function update(dt){
    if(!state || state.paused || state.gameOver) return;
    state.time += dt;
    state.wind = state.wind || {x:rand(-1.6,1.6), y:rand(-1.0,1.0)};
    if((state.time|0) % 18 === 0 && !state.windShifted){
      state.wind = {x:rand(-2.6,2.6), y:rand(-1.8,1.8)};
      state.windShifted = true;
    }
    if((state.time|0) % 18 !== 0) state.windShifted = false;

    updateRobot(dt);
    updateOperation(dt);
    updateUnits(dt);
    updateEmplacements(dt);
    updateShell(dt);
    updateEffects(dt);
    updateCamera(dt);
    updateUI();
  }
