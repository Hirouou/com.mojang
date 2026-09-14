import { nearestStrategicHex } from './tactical-hex-interest.js';

const point = value => Number.isFinite(value?.x) && Number.isFinite(value?.y);
const KIND = Object.freeze({ infantry: 'INFANTARIA', soldier: 'INFANTARIA', tank: 'BLINDADO', armor: 'BLINDADO', convoy: 'COMBOIO', truck: 'CAMINHÃO', mamute: 'MAMUTE', base: 'BASE', structure: 'ESTRUTURA', mortar: 'MORTEIRO', AA: 'ANTIAÉREA', front: 'FRENTE' });
export const reconSourceLabel = source => source === 'plane' ? 'AVIÃO' : 'RÁDIO';
export const reconContactLabel = contact => KIND[contact?.type] || 'CONTATO';

/** Last-known contacts only. Never join report ids to current enemy simulation positions. */
export function earnedReconContacts(recon, { team, now = 0 } = {}) {
  const found = new Map();
  for (const report of (recon?.reports || []).slice(-80)) {
    if (report?.team !== team || !['radio', 'plane'].includes(report.source) || !report.sourceId ||
      !Number.isFinite(report.observedAt) || !Number.isFinite(report.expires) || report.expires <= now || report.observedAt > now + .5) continue;
    for (const contact of (report.contacts || []).slice(0, 24)) {
      if (!point(contact) || !contact.id) continue;
      const old = found.get(contact.id);
      if (old && old.observedAt >= report.observedAt) continue;
      found.set(contact.id, Object.freeze({ id: contact.id, type: contact.type, x: contact.x, y: contact.y,
        count: Number.isFinite(contact.count) ? Math.max(0, Math.round(contact.count)) : null,
        source: report.source, sourceId: report.sourceId, observedAt: report.observedAt, expires: report.expires,
        age: Math.max(0, now - report.observedAt), reportId: report.id }));
    }
  }
  return [...found.values()].sort((a, b) => b.observedAt - a.observedAt);
}

/** Overview groups by region; regional zoom shows observation symbols and source/age. */
export function drawEarnedRecon(ctx, contacts, { toScreen, scale, hexes, width, height } = {}) {
  if (!ctx || typeof toScreen !== 'function') return;
  const detailed = scale * 8400 >= 145;
  const visible = value => { const p = toScreen(value); return p.x >= -40 && p.y >= -40 && p.x <= width + 40 && p.y <= height + 40; };
  ctx.save(); ctx.textAlign = 'left'; ctx.font = '700 9px monospace'; ctx.lineWidth = 1.2;
  if (!detailed) {
    const regions = new Map();
    for (const contact of contacts) {
      const hex = nearestStrategicHex(contact, hexes);
      if (!hex || !visible(hex)) continue;
      const group = regions.get(hex.id) || { hex, count: 0, newest: contact };
      group.count++; regions.set(hex.id, group);
    }
    for (const { hex, count, newest } of regions.values()) {
      const p = toScreen(hex);
      ctx.fillStyle = '#1d1818e8'; ctx.fillRect(p.x - 3, p.y + 12, 51, 15);
      ctx.fillStyle = '#f2b28d'; ctx.fillText(`◇ ${count} · ${Math.floor(newest.age)}s`, p.x, p.y + 23);
    }
  } else {
    for (const contact of contacts.filter(visible).slice(0, 160)) {
      const p = toScreen(contact), fresh = Math.max(.35, 1 - contact.age / Math.max(1, contact.expires - contact.observedAt));
      ctx.globalAlpha = fresh; ctx.strokeStyle = '#ffc29b'; ctx.fillStyle = '#291d1ae0'; ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 6); ctx.lineTo(p.x + 6, p.y); ctx.lineTo(p.x, p.y + 6); ctx.lineTo(p.x - 6, p.y); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ffd7b8';
      ctx.fillText(`${reconContactLabel(contact)}${contact.count > 1 ? ` ×${contact.count}` : ''}`, p.x + 10, p.y - 1);
      ctx.fillStyle = '#d1b7a0'; ctx.fillText(`${reconSourceLabel(contact.source)} · ${Math.floor(contact.age)}s`, p.x + 10, p.y + 11);
    }
  }
  ctx.restore();
}
