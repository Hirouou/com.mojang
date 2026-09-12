import { artilleryNotebookRows } from './artillery-notebook.js';

const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
};

const DISPLAY_STEP_DEG = 0.1;
const HOLD_TOLERANCE_DEG = DISPLAY_STEP_DEG / 2;
const holdsAtDisplayedPrecision = delta => Math.abs(delta) < HOLD_TOLERANCE_DEG;

const movementLabel = delta => {
  if (holdsAtDisplayedPrecision(delta)) return 'SEGURE';
  return `${delta > 0 ? '↑' : '↓'} ${Math.abs(delta).toFixed(1)}°`;
};

const ARC_LABELS = Object.freeze({ low: 'BAIXO', high: 'ALTO', single: 'ÚNICO' });
const arcLabel = kind => ARC_LABELS[kind] || String(kind ?? '').toUpperCase();

/**
 * Read-only hand-crank guide for the charge already inserted in the gun.
 *
 * It never picks an arc, changes charge/elevation or mutates the weapon. The arc
 * elevations come from artilleryNotebookRows(), which itself derives exclusively
 * from modules/ballistics.js. This helper only expresses the operator's remaining
 * manual elevation movement from the current sight setting.
 */
export function artilleryCrankGuide(range, currentCharge, currentElevation) {
  const elevation = finite(currentElevation, 'currentElevation');
  const row = artilleryNotebookRows(range, currentCharge).find(entry => entry.current);
  if (!row) return Object.freeze([]);

  return Object.freeze(row.arcs.map(arc => {
    const delta = arc.elevation - elevation;
    const hold = holdsAtDisplayedPrecision(delta);
    const movement = movementLabel(delta);
    const label = arcLabel(arc.kind);
    return Object.freeze({
      kind: arc.kind,
      arcLabel: label,
      elevation: arc.elevation,
      apex: arc.apex,
      tof: arc.tof,
      delta,
      direction: hold ? 'hold' : delta > 0 ? 'up' : 'down',
      movementLabel: movement,
      instructionLabel: `${label} · ${movement}`,
    });
  }));
}

/**
 * Presentation-ready notebook rows with manual crank cues only on the inserted charge.
 *
 * This is intentionally read-only. It preserves every notebook row/arc from the
 * shared ballistics path and only decorates the current charge arcs with their
 * matching manual movement cue. Other charges never receive a cue, so a consumer
 * cannot accidentally present them as commands for the currently loaded round.
 */
export function artilleryCrankNotebookRows(range, currentCharge, currentElevation) {
  const rows = artilleryNotebookRows(range, currentCharge);
  const guide = artilleryCrankGuide(range, currentCharge, currentElevation);
  const cues = new Map(guide.map(item => [item.kind, item]));

  return Object.freeze(rows.map(row => Object.freeze({
    ...row,
    arcs: Object.freeze(row.arcs.map(arc => Object.freeze({
      ...arc,
      crankCue: row.current ? cues.get(arc.kind) || null : null,
    }))),
  })));
}
