import { artilleryCrankNotebookRows } from './artillery-crank-guide.js';

const ARC_LABELS = Object.freeze({ low: 'BAIXO', high: 'ALTO', single: 'ÚNICO' });
const arcLabel = kind => ARC_LABELS[kind] || String(kind ?? '').toUpperCase();
const number = value => Math.round(value).toLocaleString('pt-BR');
const crankLabel = cue => {
  if (!cue) return '';
  if (cue.direction === 'hold') return ' · ELEVAÇÃO ALINHADA';
  return ` · MANIVELA ${cue.movementLabel}`;
};

/**
 * Presentation-only rows for the paper CARGAS table.
 *
 * The ballistic values and crank cue still originate from the shared notebook path
 * backed by modules/ballistics.js. Only the inserted charge receives a manual crank
 * cue; other reachable charges remain reference rows and no arc/charge is selected.
 */
export function artilleryChargeTableRows(range, currentCharge, currentElevation) {
  return Object.freeze(artilleryCrankNotebookRows(range, currentCharge, currentElevation).map(row => Object.freeze({
    charge: row.charge,
    min: row.min,
    max: row.max,
    current: row.current,
    reachable: row.arcs.length > 0,
    arcs: Object.freeze(row.arcs.map(arc => Object.freeze({
      kind: arc.kind,
      elevation: arc.elevation,
      apex: arc.apex,
      tof: arc.tof,
      crankCue: arc.crankCue,
      displayLabel: `${arcLabel(arc.kind)} ${arc.elevation.toFixed(1)}° · A ${number(arc.apex)} m · ${arc.tof.toFixed(1)} s${crankLabel(arc.crankCue)}`,
    }))),
  })));
}
