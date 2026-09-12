export const FACTIONS = Object.freeze({
  ALLIES: 'allies',
  AXIS: 'axis',
});

export const FACTION_INFO = Object.freeze({
  [FACTIONS.ALLIES]: Object.freeze({ id: FACTIONS.ALLIES, label: 'ALIADOS', short: 'ALIADOS', color: '#4f79a8', cssClass: 'faction-allies' }),
  [FACTIONS.AXIS]: Object.freeze({ id: FACTIONS.AXIS, label: 'EIXO', short: 'EIXO', color: '#667a55', cssClass: 'faction-axis' }),
});

export function normalizeFaction(value, fallback = null) {
  const clean = String(value ?? '').trim().toLowerCase();
  if (clean === FACTIONS.ALLIES || clean === 'ally' || clean === 'allied' || clean === 'aliados') return FACTIONS.ALLIES;
  if (clean === FACTIONS.AXIS || clean === 'eixo') return FACTIONS.AXIS;
  return fallback;
}

export function opposingFaction(faction) {
  const clean = normalizeFaction(faction);
  if (clean === FACTIONS.ALLIES) return FACTIONS.AXIS;
  if (clean === FACTIONS.AXIS) return FACTIONS.ALLIES;
  return null;
}

export function factionInfo(faction) {
  const clean = normalizeFaction(faction);
  return clean ? FACTION_INFO[clean] : null;
}
