import assert from 'node:assert/strict';
import { createRegionTerritoryNodes, syncTerritoryNodeToRegion } from '../modules/territory-region-control.js';

const regions = [
  Object.freeze({ id: 'ally-rear', control: 'ally' }),
  Object.freeze({ id: 'front', control: 'contested' }),
  Object.freeze({ id: 'enemy-rear', control: 'enemy' }),
];

const nodes = createRegionTerritoryNodes(regions);
assert.equal(nodes.length, 3);
assert.deepEqual(nodes.map(node => [node.id, node.owner, node.contested]), [
  ['ally-rear', 'ally', false],
  ['front', null, true],
  ['enemy-rear', 'enemy', false],
]);

const node = nodes[0];
syncTerritoryNodeToRegion(node, Object.freeze({ id: node.id, control: 'ally' }), { dt: 30 });
assert.equal(node.securedFor, 30);
assert.equal(node.owner, 'ally');
assert.equal(node.contested, false);

syncTerritoryNodeToRegion(node, Object.freeze({ id: node.id, control: 'contested' }), { dt: 30 });
assert.equal(node.owner, 'ally', 'a contested frontline preserves the last owner until capture resolves');
assert.equal(node.contested, true);
assert.equal(node.securedFor, 30, 'contested time must not count toward secure development');

node.activeProject = 'outpost';
node.projectProgress = 12;
syncTerritoryNodeToRegion(node, Object.freeze({ id: node.id, control: 'enemy' }), { dt: 15 });
assert.equal(node.owner, 'enemy');
assert.equal(node.contested, false);
assert.equal(node.securedFor, 15, 'capture resets secure time before accruing the new owner interval');
assert.equal(node.activeProject, null, 'capture cancels construction owned by the previous side');
assert.equal(node.projectProgress, 0);

assert.equal(syncTerritoryNodeToRegion(node, { id: node.id, control: 'unknown' }), null);
assert.equal(syncTerritoryNodeToRegion(null, { id: 'x', control: 'ally' }), null);

console.log('territory-region-control: ok');
