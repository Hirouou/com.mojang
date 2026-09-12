import { notebookSolutions } from './ballistics.js';

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
