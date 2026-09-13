import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerritoryNode, setTerritoryControl, canStartProject, startTerritoryProject, stepTerritoryDevelopment, receiveTerritoryDelivery, territorySnapshot, damageCapitalCore, consumeCapitalAmmo, queryCapitalFacility } from '../modules/territory-development.js';
import { planTerritoryProject, projectSupplyRequest, chooseTerritoryProject, territoryOperationalEffects } from '../modules/territory-ai.js';
import { createLogisticsNode, createSupplyRoute, createStrategicLogistics, LOGISTICS_ASSET_KEYS } from '../modules/strategic-logistics.js';
import { CAPITAL_HEAVY_KIT_KEYS, buildCapitalLayout } from '../modules/capital-city-layout.js';

const secureNode = (id='CAP', owner='ally') => {
  const node = createTerritoryNode({ id, owner, stock: { materials: 1000, ammo: 500, fuel: 300 } });
  node.contested = false;
  node.securedFor = 2000;
  node.structures.push('outpost','depot','mortar');
  return node;
};

function logisticsNetwork() {
  return createStrategicLogistics({
    nodes: [
      createLogisticsNode({ id:'HQ', team:'ally', stock:{materials:500,ammo:300,fuel:200}, assets:{trucks:3,artilleryKits:1,heavyMortarKits:1,cannonKits:1,aaKits:1} }),
      createLogisticsNode({ id:'CAP', team:'ally' }),
    ],
    routes: [createSupplyRoute({id:'R1',team:'ally',from:'HQ',to:'CAP',distance:100})],
  });
}

test('heavy project requires delivered kit and consumes it only when project starts', () => {
  const node = secureNode();
  assert.equal(canStartProject(node,'fieldArtillery').reason,'heavy-kit-not-delivered');
  node.assets.artilleryKits = 1;
  const before = { ...node.stock };
  const started = startTerritoryProject(node,'fieldArtillery');
  assert.equal(started.ok,true);
  assert.equal(started.consumedKit,'artilleryKits');
  assert.equal(node.assets.artilleryKits,0);
  assert.ok(node.stock.materials < before.materials);
});

test('heavy kit physically arrives in a dedicated truck convoy', () => {
  const logistics = logisticsNetwork();
  const sent = logistics.dispatch({team:'ally',from:'HQ',to:'CAP',assets:{trucks:1,artilleryKits:1},kind:'heavy-kit',speed:10});
  assert.equal(sent.ok,true);
  assert.equal(logistics.getNode('HQ').assets.artilleryKits,0);
  assert.equal(logistics.getNode('CAP').assets.artilleryKits || 0,0);
  const events = logistics.step(10);
  assert.equal(events.at(-1)?.type,'convoy-arrived');
  assert.equal(logistics.getNode('CAP').assets.artilleryKits,1);
  assert.equal(logistics.getNode('CAP').assets.trucks,1);
});

test('heavy transport rejects non-dedicated manifests', () => {
  const logistics = logisticsNetwork();
  assert.equal(logistics.dispatch({team:'ally',from:'HQ',to:'CAP',assets:{artilleryKits:1}}).reason,'heavy-kit-requires-one-truck');
  assert.equal(logistics.dispatch({team:'ally',from:'HQ',to:'CAP',assets:{trucks:1,artilleryKits:1,cannonKits:1}}).reason,'heavy-kit-dedicated-transport-required');
  assert.equal(logistics.dispatch({team:'ally',from:'HQ',to:'CAP',cargo:{materials:1},assets:{trucks:1,artilleryKits:1}}).reason,'heavy-kit-dedicated-transport-required');
  assert.equal(logistics.dispatch({team:'ally',from:'HQ',to:'CAP',assets:{trucks:1,troops:1,artilleryKits:1}}).reason,'heavy-kit-dedicated-transport-required');
});

test('destroyed heavy-kit convoy never delivers the kit', () => {
  const logistics = logisticsNetwork();
  const sent = logistics.dispatch({team:'ally',from:'HQ',to:'CAP',assets:{trucks:1,artilleryKits:1},kind:'heavy-kit',speed:10});
  const events = logistics.step(1,{damageByConvoy:{[sent.convoyId]:150}});
  assert.equal(events[0].type,'convoy-destroyed');
  assert.equal(events[0].lostAssets.artilleryKits,1);
  assert.equal(logistics.getNode('CAP').assets.artilleryKits || 0,0);
});

test('snapshots preserve every heavy logistics asset key', () => {
  const logistics = logisticsNetwork();
  const snap = logistics.snapshot().nodes.find(node=>node.id==='HQ');
  for (const key of CAPITAL_HEAVY_KIT_KEYS) assert.ok(Object.hasOwn(snap.assets,key));
  for (const key of CAPITAL_HEAVY_KIT_KEYS) assert.ok(LOGISTICS_ASSET_KEYS.includes(key));
});

test('AI plans missing physical kit but cannot start structure without resources', () => {
  const node = secureNode('AI');
  node.stock = { materials:0, ammo:0, fuel:0 };
  const context={routeOpen:true,frontPressure:.9,infantryThreat:.9,armorThreat:.7,airThreat:.7,routeThreat:.8};
  const plan = planTerritoryProject(node,context);
  assert.ok(plan);
  assert.equal(chooseTerritoryProject(node,context),null);
  const request = projectSupplyRequest(node,plan.type);
  assert.ok(request);
});

test('no structure appears while the sector is disputed', () => {
  const node = secureNode('DISPUTED');
  node.assets.artilleryKits = 1;
  startTerritoryProject(node,'fieldArtillery');
  const before = node.projectProgress;
  const result = stepTerritoryDevelopment(node,60,{routeOpen:true,contested:true});
  assert.equal(result.paused,true);
  assert.equal(node.projectProgress,before);
  assert.ok(!node.structures.includes('fieldArtillery'));
});

test('capital core damage is persistent and never changes territorial owner', () => {
  const node = secureNode('CORE','enemy');
  const damaged = damageCapitalCore(node,500);
  assert.equal(damaged.status,'damaged');
  assert.equal(node.owner,'enemy');
  damageCapitalCore(node,600);
  assert.equal(node.core.status,'neutralized');
  assert.equal(node.owner,'enemy');
  assert.equal(territorySnapshot(node).core.status,'neutralized');
  assert.equal(canStartProject(node,'resourceWarehouse').reason,'capital-core-neutralized');
});

test('control changes do not duplicate stock or heal the capital core', () => {
  const node = secureNode('CAPTURE','ally');
  node.stock.ammo = 77;
  damageCapitalCore(node,700);
  const hp = node.core.hp;
  setTerritoryControl(node,'enemy',{contested:true});
  assert.equal(node.stock.ammo,77);
  assert.equal(node.core.hp,hp);
  assert.equal(node.owner,'enemy');
});

test('ammo depot facility API consumes real capital ammunition', () => {
  const node = secureNode('MAMUTE');
  node.structures.push('ammoDepot');
  node.stock.ammo = 12;
  const layout = buildCapitalLayout({id:node.id,x:100,y:100,structures:node.structures});
  const ammo = layout.structures.find(item=>item.type==='ammoDepot');
  const found = queryCapitalFacility(node,{center:{x:100,y:100},position:{x:ammo.x,y:ammo.y},type:'ammoDepot',maxDistance:20});
  assert.equal(found?.facility.type,'ammoDepot');
  const issue = consumeCapitalAmmo(node,8);
  assert.deepEqual(issue,{ok:true,reason:'ammo-issued',transferred:8,remaining:4});
  assert.equal(consumeCapitalAmmo(node,10).transferred,4);
  assert.equal(consumeCapitalAmmo(node,1).reason,'ammo-stock-empty');
});

test('operational effects reflect built medical, ammo, repair, artillery, AA and defenses', () => {
  const node = secureNode('FX');
  node.structures.push('infirmary','ammoDepot','garage','fieldArtillery','antiAir','fixedCannon','bunker','pillbox','wall','barbedWire','resourceWarehouse');
  const fx = territoryOperationalEffects(node);
  assert.ok(fx.recoverySupport>0 && fx.ammoSupport>0 && fx.repairSupport>0 && fx.indirectFire>0 && fx.airDefense>0 && fx.antiArmor>0 && fx.defensiveCover>0 && fx.supplyCapacity>1);
});

test('delivery credits heavy kit inventory to territory only after arrival handoff', () => {
  const node = secureNode('DELIVERY');
  node.assets.artilleryKits = 0;
  assert.equal(receiveTerritoryDelivery(node,{team:'ally',assets:{artilleryKits:1}}),true);
  assert.equal(node.assets.artilleryKits,1);
});

test('capture displaces heavy kits instead of converting them to the new faction', async () => {
  const { applyAuthoritativeSectorControl } = await import('../modules/strategic-capture-state.js');
  const id='KIT-CAP';
  const territoryNode=createTerritoryNode({id,owner:'enemy',assets:{trucks:1,artilleryKits:1}}); territoryNode.contested=false;
  const logistics=createStrategicLogistics({nodes:[createLogisticsNode({id,team:'enemy',assets:{trucks:1,artilleryKits:1}})]});
  const record={sector:{id,owner:'enemy',controlProgress:1}};
  const result=applyAuthoritativeSectorControl({record,territoryNode,logistics,owner:'ally',contested:true});
  assert.equal(result.displacedAssets.artilleryKits,1);
  assert.equal(logistics.getNode(id).assets.artilleryKits,0);
  assert.equal(territoryNode.assets.artilleryKits,0);
});

test('allied and enemy AI use the same capital construction doctrine', () => {
  const context={routeOpen:true,frontPressure:.82,infantryThreat:.75,armorThreat:.68,airThreat:.5,routeThreat:.7,armorDemand:.6,logisticsNeed:.5};
  const ally=secureNode('ALLY-AI','ally');
  const enemy=secureNode('ENEMY-AI','enemy');
  ally.stock={materials:0,ammo:0,fuel:0}; enemy.stock={materials:0,ammo:0,fuel:0};
  assert.equal(planTerritoryProject(ally,context)?.type,planTerritoryProject(enemy,context)?.type);
});
