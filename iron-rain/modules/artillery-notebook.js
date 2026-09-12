import { CHARGES, chargeBand, notebookSolutions } from './ballistics.js';

const EMPTY_ARCS = Object.freeze([]);

const frozenArc = (arc, index, total) => Object.freeze({
  kind: total > 1 ? (index === 0 ? 'low' : 'high') : 'single',
  elevation: arc.elevation,
  apex: arc.apex,
  tof: arc.tof,
});

/**
 * Read-only view model for the paper firing notebook.
 *
 * It deliberately does not pick a charge or trajectory and never mutates the gun.
 * The underlying values always come from ballistics.js so the notebook cannot drift
 * away from projectile simulation/readout truth.
 */
export function artilleryNotebookRows(range, currentCharge = null) {
  const charge = Number.isInteger(currentCharge) ? currentCharge : null;
  return Object.freeze(notebookSolutions(range).map(solution => Object.freeze({
    charge: solution.charge,
    min: solution.min,
    max: solution.max,
    current: solution.charge === charge,
    arcs: Object.freeze(solution.arcs.map((arc, index) => frozenArc(arc, index, solution.arcs.length))),
  })));
}

/**
 * Full seven-charge table model for the notebook UI.
 *
 * Reachable rows reuse artilleryNotebookRows() so their arcs remain derived from the
 * shared ballistic model. Unreachable rows keep their nominal band visible with an
 * empty immutable arc list. This preserves the existing paper table shape without
 * letting the UI infer or auto-select a firing solution.
 */
export function artilleryNotebookTableRows(range, currentCharge = null) {
  const current = Number.isInteger(currentCharge) ? currentCharge : null;
  const reachable = new Map(artilleryNotebookRows(range, current).map(row => [row.charge, row]));

  return Object.freeze(CHARGES.slice(1).map(charge => {
    const solution = reachable.get(charge.id);
    if (solution) return solution;
    const band = chargeBand(charge.id);
    return Object.freeze({
      charge: charge.id,
      min: band.min,
      max: band.max,
      current: charge.id === current,
      arcs: EMPTY_ARCS,
    });
  }));
}
