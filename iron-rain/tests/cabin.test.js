import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCabinMovement, canOccupyCabin, CABIN_STATIONS, CABIN_OBSTACLES } from '../modules/cabin-controls.js';

test('operator walks in metres and cannot walk through the hull or gun', () => {
  const m = createCabinMovement();
  assert.ok(canOccupyCabin(m.position.x, m.position.z));
  for (let i = 0; i < 300; i++) m.update(1/60, {x:0,y:-1});
  assert.ok(m.position.z > -.82 && m.position.z < -.77, 'aiming cabinet stops the operator before the visible panel');
  assert.ok(m.setPose({x:-1.14,z:-.58}), 'the aisle beside the cabinet is accessible');
  for (let i = 0; i < 300; i++) m.update(1/60, {x:0,y:-1});
  assert.ok(m.position.z > -2.26 && m.position.z < -2.18, 'the aisle reaches the driver dashboard without crossing the seat');
  for (let i = 0; i < 300; i++) m.update(1/60, {x:1,y:0});
  assert.ok(m.position.x < .55, 'solid gun cradle blocks lateral movement');
  assert.ok(canOccupyCabin(m.position.x, m.position.z));
});
test('all solid equipment excludes the operator and invalid test poses preserve position',()=>{
  for(const obstacle of CABIN_OBSTACLES){
    assert.equal(canOccupyCabin((obstacle.minX+obstacle.maxX)/2,(obstacle.minZ+obstacle.maxZ)/2),false);
  }
  const m=createCabinMovement(),before=m.snapshot();
  assert.equal(m.setPose({x:0,z:-1.25}),false,'cannot put camera inside aiming console');
  assert.equal(m.setPose({x:NaN,z:0}),false);
  assert.deepEqual(m.snapshot(),before);
});
test('rear access is a continuous walkable passage to the engine room, with solid side walls',()=>{
  const m=createCabinMovement();
  assert.ok(!CABIN_STATIONS.some(s=>s.id==='hatch'),'automatic door cannot trap player in an interaction station');
  for(let i=0;i<300;i++)m.update(1/60,{x:0,y:1});
  assert.ok(m.position.z>7.7&&m.position.z<8,'walked through the bulkhead into engine room');
  assert.ok(m.setPose({x:0,z:4.5}));
  for(let i=0;i<100;i++)m.update(3,{x:1,y:0});
  assert.ok(m.position.x<.67,'corridor wall resists long frames and lateral motion');
  assert.equal(canOccupyCabin(-1.5,3.67),false,'solid part of rear bulkhead is not walkable');
  assert.ok(m.setPose({x:0,z:6.6}));
  m.lookToward(CABIN_STATIONS.find(s=>s.id==='engine'));
  assert.equal(m.focus()?.id,'engine','engine can be inspected from accessible centre aisle');
  for(let i=0;i<300;i++)m.update(.1,{x:0,y:-1});
  assert.ok(m.position.x<.54,'engine block stops forward movement from centre aisle');
});
test('yaw remains unrestricted through multiple full turns',()=>{
  const m=createCabinMovement();
  m.look(2*Math.PI*3,0);
  assert.ok(Math.abs(m.yaw+6*Math.PI)<1e-12);
  m.update(.1,{x:0,y:-1});
  assert.ok(Math.abs(m.position.x)<1e-10);
  assert.ok(m.position.z<2.4);
});
test('diagonal motion is normalized and stalls do not tunnel through walls', () => {
  const a=createCabinMovement(),b=createCabinMovement();
  a.update(.05,{x:1,y:0});b.update(.05,{x:1,y:-1});
  assert.ok(Math.abs(a.travelled-b.travelled)<1e-9);
  for(let i=0;i<100;i++)b.update(50,{x:1,y:0});
  assert.ok(canOccupyCabin(b.position.x,b.position.z));
});
test('corner sliding follows the dominant movement axis instead of steering sideways',()=>{
  const m=createCabinMovement();
  assert.ok(m.setPose({x:-2.19,z:-1.27}),'corner test starts in the aisle beside the driver seat');
  const input={x:.5144957554,y:-.8574929257};
  m.update(.01766917,input);
  assert.ok(Math.abs(m.position.x+2.19)<1e-9,'blocked corner does not invent lateral X motion');
  assert.ok(m.position.z<-1.29,'dominant forward component still slides along the obstacle');
  assert.ok(canOccupyCabin(m.position.x,m.position.z),'corner slide remains collision-safe');
});
test('station interaction requires physical proximity and looking toward the station',()=>{
  const m=createCabinMovement();
  const aim=CABIN_STATIONS.find(s=>s.id==='aim');
  assert.equal(m.focus(),null,'no operating station from the back of the cabin');
  for(let i=0;i<74;i++)m.update(1/60,{x:0,y:-1});
  m.lookToward(aim);
  assert.equal(m.focus()?.id,'aim');
  const before={...m.position};m.lookToward(aim,.5);
  assert.deepEqual(m.position,before,'looking at a station never teleports');
  m.look(Math.PI,0);assert.notEqual(m.focus()?.id,'aim');
});
test('look pitch clamps and reset clears locomotion',()=>{
  const m=createCabinMovement();m.look(500,500);assert.equal(m.pitch,-1.03);
  m.update(.1,{x:1,y:1});m.reset();
  assert.deepEqual(m.snapshot(),{position:{x:0,z:2.4},yaw:0,pitch:-.08,travelled:0});
});
