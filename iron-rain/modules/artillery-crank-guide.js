import { artilleryNotebookRows } from './artillery-notebook.js';

const finite = (value, name) => {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite`);
  return value;
};

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
    return Object.freeze({
      kind: arc.kind,
      elevation: arc.elevation,
      apex: arc.apex,
      tof: arc.tof,
      delta,
      direction: Math.abs(delta) < 1e-7 ? 'hold' : delta > 0 ? 'up' : 'down',
    });
  }));
}
