import { createFrontAnchors, territoryAt } from './theatre-control.js';

const FRONT_NAMES = Object.freeze(['FROST', 'FALCON', 'DAGGER', 'LINHA 07', 'BIRCH', 'ECHO', 'CINDER']);

/**
 * Coherent front seeds for the current theatre. Tactical fighting happens along
 * one control line; support targets sit progressively deeper in enemy territory.
 */
export function createTheatreSectorSeeds({ count = 7 } = {}) {
  const anchors = createFrontAnchors({ count });
  return Object.freeze(anchors.map((anchor, index) => {
    const name = FRONT_NAMES[index % FRONT_NAMES.length];
    const id = `${name.replace(/\s+/g, '-').toLowerCase()}-${index}`;
    const x = anchor.x, y = anchor.y;
    const assets = [
      { id: `${id}-HMG`, type: 'HMG', x: x + 520, y: y - 120, hp: 180, maxHp: 180 },
      { id: `${id}-MTR`, type: 'MORTEIRO', x: x + 1_400, y: y + 110, hp: 150, maxHp: 150 },
      { id: `${id}-BAT`, type: 'BATERIA', x: x + 5_800, y: y + 260, hp: 260, maxHp: 260 },
      { id: `${id}-DEP`, type: 'DEPÓSITO', x: x + 8_600, y: y - 260, hp: 220, maxHp: 220 },
    ].map(asset => Object.freeze({ ...asset, known: false, alive: true, team: 'enemy' }));
    return Object.freeze({
      id,
      name,
      x,
      y,
      control: 'contested',
      allyStrength: 64 + (index % 3) * 4,
      enemyStrength: 68 + ((index + 1) % 3) * 4,
      progress: 0,
      status: 'stalemate',
      assets: Object.freeze(assets),
      // Sanity markers used by tests/integration: rear assets must really be in
      // enemy territory rather than behind the allied side of another front.
      assetTerritory: Object.freeze(assets.map(asset => territoryAt(asset))),
    });
  }));
}
