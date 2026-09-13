import { buildCapitalLayout, CAPITAL_STRUCTURE_CATALOG } from './capital-city-layout.js';

const TAU = Math.PI * 2;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;

function connectedRoadBearings(capital, roads) {
  const bearings = [];
  for (const road of roads || []) {
    const from = road?.from, to = road?.to;
    if (!Number.isFinite(from?.x) || !Number.isFinite(from?.y) || !Number.isFinite(to?.x) || !Number.isFinite(to?.y)) continue;
    if (distance(capital, from) <= 180) bearings.push(Math.atan2(to.y - from.y, to.x - from.x));
    else if (distance(capital, to) <= 180) bearings.push(Math.atan2(from.y - to.y, from.x - to.x));
    if (bearings.length >= 3) break;
  }
  return bearings;
}

function visible(frame, x, y, radius = 80) {
  return !frame.visible || frame.visible(x, y, radius * frame.zoom + 24);
}

function strokeWorldPolyline(ctx, frame, points, color, width) {
  if (!points?.length) return;
  const projected = points.map(point => frame.worldToScreen(point.x, point.y));
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * frame.zoom);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(projected[0].x, projected[0].y);
  for (let index = 1; index < projected.length; index++) ctx.lineTo(projected[index].x, projected[index].y);
  ctx.stroke();
}

function drawCityRoads(ctx, layout, frame, ruined) {
  for (const road of layout.roads || []) {
    const midpoint = road.points?.[Math.floor((road.points.length - 1) * .5)] || layout.center;
    if (!visible(frame, midpoint.x, midpoint.y, layout.radius)) continue;
    const width = finite(road.width, 56);
    strokeWorldPolyline(ctx, frame, road.points, ruined ? 'rgba(69,64,53,.78)' : 'rgba(75,68,53,.92)', width + 24);
    strokeWorldPolyline(ctx, frame, road.points, ruined ? 'rgba(103,92,68,.72)' : 'rgba(139,122,86,.96)', width);
    strokeWorldPolyline(ctx, frame, road.points, 'rgba(65,59,47,.38)', Math.max(2, width * .08));
  }
}

function facilityColor(type, ruined) {
  if (ruined) return '#41463c';
  const className = CAPITAL_STRUCTURE_CATALOG[type]?.className;
  if (className === 'industry') return '#676d5b';
  if (className === 'logistics' || className === 'ammo') return '#716d58';
  if (className === 'fortification' || className === 'weapon') return '#5b6153';
  if (className === 'medical') return '#7a7765';
  return '#686e5e';
}

function drawFacility(ctx, facility, team, frame, ruined = false, civilian = false) {
  if (!visible(frame, facility.x, facility.y, Math.max(facility.width, facility.height))) return;
  const point = frame.worldToScreen(facility.x, facility.y);
  const width = clamp(finite(facility.width, 48) * frame.zoom, 5, 180);
  const height = clamp(finite(facility.height, 38) * frame.zoom, 4, 140);
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(finite(facility.angle));
  ctx.fillStyle = 'rgba(24,29,24,.32)';
  ctx.fillRect(-width * .5 + 4, -height * .5 + 5, width, height);
  ctx.fillStyle = civilian ? (ruined ? '#3c4138' : '#5d6254') : facilityColor(facility.type, ruined);
  ctx.fillRect(-width * .5, -height * .5, width, height);
  ctx.fillStyle = ruined ? '#2e352f' : '#8d8b73';
  ctx.fillRect(-width * .5, -height * .5, width, Math.max(1.5, height * .12));
  if (!civilian && !ruined) {
    ctx.fillStyle = team === 'enemy' ? '#9a8068' : '#839b90';
    ctx.fillRect(-width * .5 + 2, height * .5 - Math.max(2, height * .11), Math.max(4, width * .34), Math.max(2, height * .11));
  }
  if (ruined) {
    ctx.strokeStyle = 'rgba(24,29,24,.72)';
    ctx.lineWidth = Math.max(1, frame.zoom * 2);
    ctx.beginPath();
    ctx.moveTo(-width * .42, -height * .34);
    ctx.lineTo(width * .36, height * .38);
    ctx.moveTo(width * .25, -height * .42);
    ctx.lineTo(-width * .18, height * .2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCapital(ctx, capital, strategicRoads, frame) {
  const roadBearings = connectedRoadBearings(capital, strategicRoads);
  const ruined = capital.alive === false;
  const density = ruined ? 8 : 12 + clamp(Math.floor(finite(capital.level, 1)), 1, 4) * 4;
  const layout = buildCapitalLayout({
    id: capital.strategicSectorId || capital.id,
    x: capital.x,
    y: capital.y,
    roadBearings,
    structures: capital.structures || [],
    density,
  });
  drawCityRoads(ctx, layout, frame, ruined);
  for (const building of (layout.civilian || []).slice(0, 24)) drawFacility(ctx, building, capital.team, frame, ruined, true);
  for (const facility of (layout.structures || []).slice(0, 18)) drawFacility(ctx, facility, capital.team, frame, ruined, false);
}

/**
 * Rendering-only local projection of canonical strategic capitals. It derives streets and
 * facilities from strategicCapitals/strategicRoads and never mutates ownership, logistics,
 * production or intel state.
 */
export function drawCapitalMaterialization(ctx, state, frame) {
  if (!ctx || !state || typeof frame?.worldToScreen !== 'function') return;
  const capitals = state.warSimulation?.strategicCapitals || [];
  const roads = state.warSimulation?.strategicRoads || [];
  for (const capital of capitals.slice(0, 8)) {
    if (!Number.isFinite(capital?.x) || !Number.isFinite(capital?.y)) continue;
    if (!visible(frame, capital.x, capital.y, 1_250)) continue;
    drawCapital(ctx, capital, roads, frame);
  }
}
