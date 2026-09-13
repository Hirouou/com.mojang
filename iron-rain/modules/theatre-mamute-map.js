const text = value => typeof value === 'string' ? value.trim() : '';

function shouldReplaceIntel(previous, next) {
  if (!previous) return true;
  const previousReportedAt = Number(previous?.reportedAt);
  const nextReportedAt = Number(next?.reportedAt);
  const previousTimed = Number.isFinite(previousReportedAt);
  const nextTimed = Number.isFinite(nextReportedAt);
  if (previousTimed && nextTimed) return nextReportedAt >= previousReportedAt;
  if (previousTimed && !nextTimed) return false;
  return true;
}

/**
 * Builds renderer-safe Mamute contacts for one faction.
 * Friendly Mamutes may use canonical theatre positions; enemy positions are
 * disclosed only through already-earned intel entries and never from the roster.
 */
export function buildTheatreMamuteMapContacts(roster, viewerFaction, intelEntries = []) {
  const faction = text(viewerFaction).toUpperCase();
  if (!faction) return Object.freeze([]);

  const intelById = new Map();
  for (const entry of Array.isArray(intelEntries) ? intelEntries : []) {
    const id = text(entry?.id);
    if (!id) continue;
    const previous = intelById.get(id);
    if (shouldReplaceIntel(previous, entry)) intelById.set(id, entry);
  }

  const contacts = [];
  for (const record of Array.isArray(roster) ? roster : []) {
    const id = text(record?.id);
    const recordFaction = text(record?.faction).toUpperCase();
    if (!id || !recordFaction) continue;

    if (recordFaction === faction) {
      const x = Number(record?.x);
      const y = Number(record?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      contacts.push(Object.freeze({
        id,
        faction: recordFaction,
        relation: 'friendly',
        mode: 'exact',
        label: 'MAMUTE ALIADO',
        uncertainty: 0,
        x,
        y,
      }));
      continue;
    }

    const intel = intelById.get(id);
    if (!intel) continue;
    const mode = text(intel.mode).toLowerCase();
    if (!['exact', 'area', 'lost'].includes(mode)) continue;
    const x = mode === 'lost' ? null : Number(intel.x);
    const y = mode === 'lost' ? null : Number(intel.y);
    if (mode !== 'lost' && (!Number.isFinite(x) || !Number.isFinite(y))) continue;
    const uncertainty = Number(intel.uncertainty);

    contacts.push(Object.freeze({
      id,
      faction: recordFaction,
      relation: 'enemy',
      mode,
      label: text(intel.label) || 'CONTATO INIMIGO',
      uncertainty: Number.isFinite(uncertainty) ? Math.max(0, uncertainty) : 0,
      x,
      y,
    }));
  }

  return Object.freeze(contacts);
}
