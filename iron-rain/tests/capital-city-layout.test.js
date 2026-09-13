import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapitalLayout, capitalPlacementAllowed, capitalRoadSpeedMultiplier, distanceToCapitalRoad } from '../modules/capital-city-layout.js';

const base={id:'CAP-TEST',x:12000,y:9000,roadBearings:[0,.93],structures:['depot','ammoDepot','garage','bunker','fieldArtillery'],density:20};

test('capital layout is deterministic for the same capital seed',()=>{
  const a=buildCapitalLayout(base),b=buildCapitalLayout(base);
  assert.deepEqual(a,b);
  assert.ok(a.roads.length>=2);
  assert.equal(a.structures[0].type,'capitalHQ');
});

test('capital lots never occupy the protected road corridor',()=>{
  const layout=buildCapitalLayout(base);
  for(const lot of layout.lots){
    assert.ok(capitalPlacementAllowed(layout,lot),`lot ${lot.id} overlapped a road/core exclusion`);
    assert.ok(distanceToCapitalRoad(layout,lot)>layout.rules.primaryWidth*.35);
  }
});

test('Mamute gains speed only on the capital road or shoulder',()=>{
  const layout=buildCapitalLayout(base),road=layout.roads[0],onRoad=road.points[Math.floor(road.points.length/2)];
  assert.equal(capitalRoadSpeedMultiplier(layout,onRoad),layout.rules.roadSpeedMultiplier);
  assert.equal(capitalRoadSpeedMultiplier(layout,{x:layout.center.x+layout.radius*1.8,y:layout.center.y+layout.radius*1.8}),1);
});
