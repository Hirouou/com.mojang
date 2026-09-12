/**
 * Low-poly battlefield dressing for the persistent war simulation.
 * Rendering only: it never reveals a target, changes a force, or creates damage.
 * Angles follow Canvas convention (+X = 0); all object dimensions are metres.
 */
export const BATTLEFIELD_PALETTE = Object.freeze({
  ground: '#4b5142', earth: '#665d4c', ally: '#a4b4a2', enemy: '#bd9580',
  concrete: '#737266', shadow: '#242b27', metal: '#5b6555', smoke: '#85847a'
});

const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
const seed = n => { const f = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return f - Math.floor(f); };

function polygon(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.closePath();
  ctx.fill();
}

function line(ctx, points, color, width = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

function sideColor(team) { return team === 'enemy' ? '#b49279' : '#a1b9ad'; }

function observable(state, object, sector) {
  if (object.team !== 'enemy' || object.known) return true;
  if (distance(object, state.robot) <= 850) return true;
  const intel = state.intel;
  if (intel && ((sector && intel.sector === sector) || intel.target === object || distance(object, intel.target) <= 850)) return true;
  return ['shell', 'impact'].includes(state.cam?.mode) && distance(object, state.cam) <= 900;
}

function local(ctx, object, frame, radius, draw) {
  if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) return;
  if (frame.visible && !frame.visible(object.x, object.y, radius * frame.zoom + 32)) return;
  const p = frame.worldToScreen(object.x, object.y);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(frame.zoom, frame.zoom);
  draw();
  ctx.restore();
}

function crate(ctx, x, y, w = 19, h = 14) {
  ctx.fillStyle = '#3b4035'; ctx.fillRect(x + 3, y + 4, w, h);
  ctx.fillStyle = '#79765b'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#9a9070'; ctx.fillRect(x, y, w, 3);
  line(ctx, [[x + 3, y + 3], [x + w - 3, y + h - 3], [x + w - 3, y + 3], [x + 3, y + h - 3]], '#505341', 1.4);
}

function sandbagRow(ctx, x, y, count, vertical = false) {
  ctx.save(); ctx.translate(x, y); if (vertical) ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#373d31'; ctx.fillRect(-2, 4, count * 14 + 3, 10);
  for (let i = 0; i < count; i++) {
    const dx = i * 14, dy = i % 2;
    polygon(ctx, [[dx, dy + 2], [dx + 11, dy], [dx + 14, dy + 3], [dx + 12, dy + 10], [dx + 1, dy + 9]], i % 3 ? '#9a8d6d' : '#80785e');
    line(ctx, [[dx + 2, dy + 3], [dx + 10, dy + 2]], '#b1a07a', 1);
  }
  ctx.restore();
}

function bunker(ctx, x, y, width, height, team, level = 1) {
  ctx.save(); ctx.translate(x, y);
  polygon(ctx, [[-width / 2 + 10, -height / 2 + 7], [width / 2 + 12, -height / 2 + 7], [width / 2 + 12, height / 2 + 14], [-width / 2 + 10, height / 2 + 14]], 'rgba(23,28,24,.42)');
  ctx.fillStyle = '#494d42'; ctx.fillRect(-width / 2, -height / 2 + 9, width, height);
  polygon(ctx, [[-width / 2, -height / 2], [width / 2 - 9, -height / 2], [width / 2, -height / 2 + 9], [width / 2, height / 2], [-width / 2 + 9, height / 2], [-width / 2, height / 2 - 9]], '#777869');
  polygon(ctx, [[-width / 2, -height / 2], [width / 2 - 9, -height / 2], [width / 2 - 17, -height / 2 + 9], [-width / 2 + 9, -height / 2 + 9], [-width / 2 + 9, height / 2 - 9], [-width / 2, height / 2 - 9]], '#92907a');
  line(ctx, [[-width / 2 + 15, height / 2 - 7], [width / 2 - 11, height / 2 - 7]], '#51594c', 3);
  ctx.fillStyle = '#212a24'; ctx.fillRect(-14, height / 2 - 4, 28, 9);
  ctx.fillStyle = '#423f30'; ctx.fillRect(-10, height / 2 - 4, 20, 3);
  ctx.fillStyle = sideColor(team); ctx.fillRect(-width / 2 + 13, -height / 2 + 13, 20, 3);
  for (let i = 0; i < level; i++) {
    ctx.fillStyle = '#d0c29b'; ctx.fillRect(width / 2 - 14 - i * 5, -height / 2 + 12, 2, 5);
  }
  // Roof vent and a projecting communications antenna.
  ctx.fillStyle = '#535a4b'; ctx.fillRect(7, -10, 20, 14);
  for (let i = 0; i < 4; i++) { ctx.fillStyle = '#333d32'; ctx.fillRect(10 + i * 4, -8, 2, 10); }
  line(ctx, [[-width / 2 + 19, 5], [-width / 2 + 15, -30]], '#343d32', 2);
  line(ctx, [[-width / 2 + 25, -24], [-width / 2 + 5, -24]], '#aca68c', 1.5);
  ctx.restore();
}

function tent(ctx, x, y, w, h, team) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(24,31,24,.3)'; ctx.fillRect(-w / 2 + 5, -h / 2 + 7, w + 5, h + 4);
  polygon(ctx, [[-w / 2, -h / 2], [0, -h / 2 - 5], [0, h / 2], [-w / 2, h / 2 + 5]], team === 'enemy' ? '#7b7057' : '#747a5b');
  polygon(ctx, [[0, -h / 2 - 5], [w / 2, -h / 2], [w / 2, h / 2 + 5], [0, h / 2]], team === 'enemy' ? '#5b5744' : '#535f49');
  line(ctx, [[0, -h / 2 - 5], [0, h / 2]], '#9b9778', 2);
  polygon(ctx, [[-11, h / 2 + 2], [0, h / 2 - 10], [11, h / 2 + 2]], '#252f27');
  for (const dy of [-h / 2 + 7, h / 2 - 7]) {
    line(ctx, [[-w / 2, dy], [-w / 2 - 12, dy + 8]], '#b3a685', 1);
    line(ctx, [[w / 2, dy], [w / 2 + 12, dy + 8]], '#b3a685', 1);
  }
  ctx.restore();
}

function watchtower(ctx, x, y, team) {
  ctx.save(); ctx.translate(x, y);
  polygon(ctx, [[-16, 9], [18, 9], [49, 46], [15, 46]], 'rgba(23,29,24,.24)');
  for (const side of [-1, 1]) line(ctx, [[side * 16, 17], [side * 12, -21]], '#434c3f', 4);
  line(ctx, [[-14, 14], [14, -18], [-14, -18], [14, 14]], '#9c957a', 2);
  ctx.fillStyle = '#3a4439'; ctx.fillRect(-21, -25, 42, 28);
  polygon(ctx, [[-25, -30], [20, -30], [26, -21], [-19, -21]], '#89896c');
  ctx.fillStyle = sideColor(team); ctx.fillRect(-16, -18, 11, 2);
  ctx.fillStyle = '#c3ac71'; ctx.fillRect(8, -15, 5, 4);
  ctx.restore();
}

function damageSmoke(ctx, object, time, scale = 1) {
  const health = finite(object.hp, object.maxHp || 100) / Math.max(1, finite(object.maxHp, 100));
  if (health > .55 && object.alive !== false) return;
  const phase = (time * .22 + seed(object.x)) % 1;
  for (let i = 0; i < 4; i++) {
    const t = (phase + i * .23) % 1;
    ellipse(ctx, (t * 25 - 5) * scale, (-t * 58 - 10) * scale, (7 + t * 17) * scale, (8 + t * 20) * scale, `rgba(37,40,35,${(.22 * (1 - t)).toFixed(3)})`);
  }
}

function drawBase(ctx, base, frame) {
  local(ctx, base, frame, 245, () => {
    const level = clamp(Math.floor(finite(base.level, 1)), 1, 4);
    const team = base.team || 'ally';
    if (base.alive === false) {
      polygon(ctx, [[-73, -52], [66, -62], [100, 19], [64, 65], [-70, 48]], '#41463c');
      for (let i = 0; i < 11; i++) {
        const x = seed(i + base.x) * 133 - 66, y = seed(i + base.y) * 93 - 46;
        polygon(ctx, [[x, y], [x + 14, y - 6], [x + 23, y + 8], [x + 3, y + 12]], i % 2 ? '#66695c' : '#323a31');
      }
      damageSmoke(ctx, base, frame.time, 1.7);
      return;
    }
    const edge = 89 + level * 26;
    polygon(ctx, [[-edge, -edge * .67], [edge - 13, -edge * .81], [edge + 18, edge * .59], [edge * .61, edge * .9], [-edge - 15, edge * .56]], 'rgba(102,91,68,.48)');
    // Wheel tracks form a service lane through each compound.
    line(ctx, [[-edge - 23, 66], [14, 67], [edge + 40, 90]], 'rgba(49,47,37,.25)', 8);
    line(ctx, [[-edge - 23, 83], [14, 84], [edge + 40, 107]], 'rgba(49,47,37,.25)', 8);
    sandbagRow(ctx, -edge + 10, -edge * .7, Math.floor(edge / 9));
    sandbagRow(ctx, -edge + 3, -edge * .55, Math.floor(edge / 14), true);
    sandbagRow(ctx, edge - 10, -edge * .55, Math.floor(edge / 14), true);
    if (level === 1) {
      tent(ctx, -22, -8, 87, 89, team);
      bunker(ctx, 73, 2, 58, 43, team);
    } else {
      bunker(ctx, -24, -13, 118, 86, team, level);
      tent(ctx, 101, 8, 50, 64, team);
    }
    crate(ctx, -72, 47); crate(ctx, -49, 51); crate(ctx, -71, 29, 17, 13);
    for (let i = 0; i < level + 1; i++) {
      ellipse(ctx, 20 + i * 13, 47 + (i % 2) * 2, 5, 7, '#3e473a');
      ctx.fillStyle = '#8a8466'; ctx.fillRect(16 + i * 13, 43 + (i % 2) * 2, 8, 2);
    }
    if (level >= 2) {
      bunker(ctx, -83, -107, 60, 41, team, 1);
      watchtower(ctx, edge - 18, -edge * .68 + 18, team);
      // Cable from command bunker to observation post.
      line(ctx, [[5, -20], [edge - 16, -edge * .62]], '#393d31', 1);
    }
    if (level >= 3) {
      tent(ctx, -79, 109, 93, 45, team);
      bunker(ctx, 80, -96, 81, 55, team, 2);
      for (let i = 0; i < 4; i++) crate(ctx, 70 + (i % 2) * 20, 75 + Math.floor(i / 2) * 18, 17, 14);
      sandbagRow(ctx, 1, edge * .76, Math.floor(edge / 14));
    }
    // New extensions are built on a visible foundation, with timber and scaffold.
    const build = finite(base.buildProgress);
    if (build > .01 && level < 4) {
      ctx.save(); ctx.translate(-17, -edge * .93);
      ctx.fillStyle = '#605e4c'; ctx.fillRect(-48, -24, 87, 39);
      const raised = build > 1 ? clamp(build / 100, 0, 1) : build;
      ctx.fillStyle = '#85816a'; ctx.fillRect(-46, -23, 84 * raised, 34);
      for (let i = 0; i < 5; i++) {
        const x = -50 + i * 22;
        line(ctx, [[x, -34], [x, 26]], '#484a3c', 2);
        line(ctx, [[x, -26], [x + 18, 15]], '#afa07a', 1.5);
      }
      line(ctx, [[-54, -28], [48, -28]], '#b7a783', 3);
      line(ctx, [[-54, 17], [48, 17]], '#b7a783', 3);
      const sway = Math.sin(frame.time * 1.4 + base.x) * 3;
      line(ctx, [[43, -28], [43 + sway, -4]], '#282f28', 1);
      ctx.fillStyle = '#aa9e76'; ctx.fillRect(39 + sway, -4, 9, 8);
      ctx.restore();
    }
    damageSmoke(ctx, base, frame.time, 1.4);
  });
}

function drawTank(ctx, tank, frame) {
  local(ctx, tank, frame, 88, () => {
    ctx.rotate(finite(tank.angle));
    const dead = tank.alive === false;
    const enemy = tank.team === 'enemy';
    ctx.fillStyle = 'rgba(20,26,22,.4)'; ctx.fillRect(-34, -15, 86, 49);
    if (!dead && finite(tank.speed, tank.moving ? 1 : 0) > .2) {
      for (let i = 0; i < 3; i++) ellipse(ctx, -52 - i * 18, Math.sin(frame.time * 2 + i) * 6, 14 + i * 8, 10 + i * 4, `rgba(167,153,114,${.11 - i * .025})`);
    }
    for (const side of [-1, 1]) {
      ctx.fillStyle = dead ? '#252b25' : '#29312a'; ctx.fillRect(-41, side * 24 - 8, 82, 15);
      const phase = dead ? 0 : Math.floor(frame.time * (finite(tank.speed) > .2 ? 18 : 0)) % 8;
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = dead ? '#3e443a' : '#667060'; ctx.fillRect(-39 + i * 8 + phase / 3, side * 24 - 6, 4, 11);
      }
    }
    polygon(ctx, [[-37, -20], [29, -20], [41, -11], [41, 11], [29, 20], [-37, 20]], dead ? '#44483b' : enemy ? '#78725c' : '#727b60');
    polygon(ctx, [[-35, -18], [27, -18], [35, -11], [-32, -11]], dead ? '#626251' : '#a09e7b');
    ctx.fillStyle = '#394337'; ctx.fillRect(-29, -10, 16, 20);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#232f26'; ctx.fillRect(-27 + i * 3, -8, 1.5, 16); }
    polygon(ctx, [[-8, -15], [14, -13], [22, -5], [22, 9], [11, 15], [-13, 10], [-17, -5]], dead ? '#373e32' : enemy ? '#5d614e' : '#4e604b');
    polygon(ctx, [[-8, -15], [14, -13], [22, -5], [1, -7], [-13, 10], [-17, -5]], dead ? '#525644' : '#859071');
    line(ctx, [[9, 0], [dead ? 36 : 58, dead ? 9 : 0]], '#28352a', 8);
    line(ctx, [[12, -2], [dead ? 35 : 56, dead ? 7 : -2]], dead ? '#77705a' : '#b0aa83', 4);
    ctx.fillStyle = '#303b2f'; ctx.fillRect(-7, -6, 11, 10);
    if (!dead) {
      ctx.fillStyle = sideColor(tank.team); ctx.fillRect(-30, -20, 9, 3);
      line(ctx, [[-13, -11], [-24, -39]], '#a0a186', 1);
      const flash = finite(tank.flash);
      if (flash > .01) polygon(ctx, [[55, -4], [73, -13], [66, -3], [89, 0], [66, 4], [73, 12], [55, 4]], '#e6ca86');
    }
    ctx.rotate(-finite(tank.angle));
    damageSmoke(ctx, tank, frame.time, 1);
  });
}

function crew(ctx, x, y, team, angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ellipse(ctx, 1, 3, 6, 4, 'rgba(20,29,22,.35)');
  polygon(ctx, [[-5, -3], [3, -5], [7, 2], [3, 6], [-4, 5]], team === 'enemy' ? '#8c7b60' : '#7f8d71');
  ellipse(ctx, 0, -3, 4, 3, team === 'enemy' ? '#515746' : '#445d49');
  ctx.restore();
}

function drawMortar(ctx, mortar, frame) {
  local(ctx, mortar, frame, 64, () => {
    const dead = mortar.alive === false;
    ctx.fillStyle = 'rgba(55,52,39,.4)'; ctx.fillRect(-31, -27, 60, 58);
    sandbagRow(ctx, -34, -34, 5); sandbagRow(ctx, -38, -23, 3, true); sandbagRow(ctx, 28, -23, 3, true);
    ctx.save(); ctx.rotate(finite(mortar.angle, mortar.team === 'enemy' ? Math.PI : 0));
    ellipse(ctx, -1, 3, 15, 10, '#333f33');
    polygon(ctx, [[-12, 7], [13, 7], [4, -9], [-8, -8]], dead ? '#494e40' : '#6d795d');
    line(ctx, [[-2, 4], [dead ? 17 : 14, dead ? 12 : -17]], '#222f24', 9);
    line(ctx, [[-3, 2], [dead ? 16 : 13, dead ? 10 : -18]], '#a49c77', 4);
    line(ctx, [[6, -2], [19, 10]], '#b1a582', 2);
    if (!dead && finite(mortar.flash) > .01) polygon(ctx, [[9, -20], [7, -39], [16, -29], [23, -37], [21, -17]], '#e0c782');
    ctx.restore();
    if (!dead) { crew(ctx, -20, 7, mortar.team, -.7); crew(ctx, 9, 24, mortar.team, .7); }
    crate(ctx, -28, 27, 18, 12); crate(ctx, 27, 20, 14, 18);
    damageSmoke(ctx, mortar, frame.time, .75);
  });
}

function aircraftShape(ctx, color, wingColor) {
  polygon(ctx, [[-69, -7], [-23, -8], [-14, -66], [4, -75], [16, -8], [53, -5], [69, 0], [53, 5], [16, 8], [4, 75], [-14, 66], [-23, 8], [-69, 7], [-80, 29], [-88, 27], [-82, 0], [-88, -27], [-80, -29]], wingColor);
  polygon(ctx, [[-80, -4], [51, -7], [69, 0], [50, 6], [-80, 4]], color);
}

function drawAircraft(ctx, aircraft, frame) {
  local(ctx, aircraft, frame, 260, () => {
    const angle = finite(aircraft.angle);
    ctx.save(); ctx.translate(56, 91); ctx.rotate(angle); ctx.scale(1.04, 1.04);
    aircraftShape(ctx, 'rgba(24,31,26,.14)', 'rgba(24,31,26,.14)'); ctx.restore();
    ctx.rotate(angle);
    aircraftShape(ctx, '#9b9d88', aircraft.team === 'enemy' ? '#686e5e' : '#75836e');
    polygon(ctx, [[-14, -64], [4, -75], [12, -23], [-10, -24]], '#8e9580');
    polygon(ctx, [[-14, 66], [4, 75], [12, 23], [-10, 24]], '#536553');
    polygon(ctx, [[37, -5], [50, -4], [56, 0], [49, 4], [37, 4]], '#344940');
    for (const y of [-33, 33]) {
      ctx.fillStyle = '#4b584c'; ctx.fillRect(-4, y - 6, 27, 12);
      ctx.fillStyle = '#b6b49a'; ctx.fillRect(3, y - 6, 16, 3);
      line(ctx, [[24, y - 17], [24, y + 17]], `rgba(213,208,175,${.21 + Math.sin(frame.time * 58) * .1})`, 2);
    }
    ctx.fillStyle = sideColor(aircraft.team); ctx.fillRect(-5, -52, 9, 3); ctx.fillRect(-5, 49, 9, 3);
    line(ctx, [[-41, -4], [-41, 4]], '#ddd4b0', 2);
  });
}

function drawSupportProjectile(ctx, shot, frame) {
  local(ctx, shot, frame, 100, () => {
    const altitude = finite(shot.z);
    const lift = Math.min(48, Math.max(0, altitude) * .04);
    ellipse(ctx, 3, 5, shot.type === 'bomb' ? 6 : 3, 2, 'rgba(22,30,25,.3)');
    ctx.translate(0, -lift); ctx.rotate(finite(shot.angle));
    if (shot.type === 'bomb') {
      polygon(ctx, [[-8, -3], [5, -4], [10, 0], [5, 4], [-8, 3], [-13, 7], [-13, -7]], '#363e32');
      line(ctx, [[-3, -3], [4, -3]], '#c4b586', 2);
    } else {
      line(ctx, [[-17, 0], [0, 0]], 'rgba(220,194,133,.24)', 2);
      ellipse(ctx, 0, 0, 3, 2, '#e4cc94');
    }
  });
}

/**
 * Draw after terrain/trenches and before impact effects. Expected state schema:
 * sector.war.{bases,vehicles,mortars} and state.warSimulation.support.
 * Options: { worldToScreen(x,y), visible(x,y,pad), zoom, time, width, height }.
 * Unknown enemies stay hidden unless locally observed or in active recon/impact.
 */
export function drawWarInfrastructure(ctx, state, options) {
  if (!ctx || !state || typeof options?.worldToScreen !== 'function') return;
  const frame = { ...options, zoom: Math.max(.01, finite(options.zoom, state.cam?.zoom || 1)), time: finite(options.time, finite(state.time)) };
  ctx.save();
  ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  for (const sector of (state.sectors || [])) {
    const war = sector.war;
    if (!war) continue;
    for (const base of (war.bases || []).slice(0, 8)) if (observable(state, base, sector)) drawBase(ctx, base, frame);
    for (const mortar of (war.mortars || []).slice(0, 8)) if (observable(state, mortar, sector)) drawMortar(ctx, mortar, frame);
    for (const tank of (war.vehicles || []).slice(0, 12)) if (tank.type === 'tank' && observable(state, tank, sector)) drawTank(ctx, tank, frame);
  }
  for (const shot of (state.warSimulation?.support || []).slice(0, 96)) {
    if (finite(shot.life, 1) <= 0 || !observable(state, shot, shot.sector)) continue;
    if (shot.type === 'bomber') drawAircraft(ctx, shot, frame);
    else if (['bomb', 'mortar', 'tank-shell'].includes(shot.type)) drawSupportProjectile(ctx, shot, frame);
  }
  ctx.restore();
}

/** Screen-space overcast/haze and a restrained vignette; draw after the scene. */
export function drawWarAtmosphere(ctx, state, options) {
  if (!ctx || !options) return;
  const width = finite(options.width), height = finite(options.height);
  if (width <= 0 || height <= 0) return;
  const time = finite(options.time, finite(state?.time));
  ctx.save();
  // Desaturated, cold overcast. Keeps silhouettes readable at mobile resolutions.
  ctx.fillStyle = 'rgba(71,77,71,.045)'; ctx.fillRect(0, 0, width, height);
  const drift = (time * 9) % (width + 550);
  const haze = ctx.createLinearGradient(0, 0, width * .8, height);
  haze.addColorStop(0, 'rgba(165,169,147,.105)');
  haze.addColorStop(.4, 'rgba(120,133,118,.015)');
  haze.addColorStop(1, 'rgba(25,37,32,.065)');
  ctx.fillStyle = haze; ctx.fillRect(0, 0, width, height);
  // A handful of wide wisps instead of a per-pixel postprocess.
  for (let i = 0; i < 3; i++) {
    const x = ((drift + i * (width + 550) / 3) % (width + 550)) - 340;
    polygon(ctx, [[x, height * .13], [x + 175, height * .09], [x + 475, height * .72], [x + 288, height * .8]], 'rgba(177,177,151,.019)');
  }
  const vignette = ctx.createRadialGradient(width * .5, height * .46, Math.min(width, height) * .2, width * .5, height * .48, Math.max(width, height) * .65);
  vignette.addColorStop(0, 'rgba(11,18,15,0)'); vignette.addColorStop(1, 'rgba(11,18,15,.22)');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
  // Sparse drifting ash is screen-space and bounded, independent of world scale.
  for (let i = 0; i < 24; i++) {
    const x = (seed(i + 19) * width + time * (4 + seed(i) * 5)) % width;
    const y = (seed(i + 43) * height + time * (2 + seed(i + 1) * 4)) % height;
    ctx.fillStyle = i % 4 ? 'rgba(196,192,163,.11)' : 'rgba(39,46,36,.14)';
    ctx.fillRect(Math.floor(x), Math.floor(y), i % 5 === 0 ? 2 : 1, 1);
  }
  ctx.restore();
}
