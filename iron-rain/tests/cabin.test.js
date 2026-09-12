import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCabinMovement, CABIN_BOUNDS, CABIN_OBSTACLES, CABIN_STATIONS, CABIN_SECTIONS, canOccupyCabin, cabinSectionAt, cabinCrewPose, interpolateCabinCrewPose } from '../modules/cabin-controls.js';

const inside = (x,z,b)=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ;

test('operator walks in metres and cannot walk through the hull or gun',()=>{
  const c=createCabinMovement();
  assert.deepEqual(c.position,{x:0,z:2.4});
  for(let i=0;i<300;i++) c.update(1/60,{y:-1});
  assert.ok(c.position.z>=CABIN_BOUNDS.minZ+.2);
  assert.equal(canOccupyCabin(c.position.x,c.position.z),true);
  assert.ok(!CABIN_OBSTACLES.some(b=>inside(c.position.x,c.position.z,b)));
});

test('all solid equipment excludes the operator and invalid test poses preserve position',()=>{
  for(const obstacle of CABIN_OBSTACLES){
    const x=(obstacle.minX+obstacle.maxX)/2,z=(obstacle.minZ+obstacle.maxZ)/2;
    assert.equal(canOccupyCabin(x,z),false,`obstacle centre ${x},${z} must be solid`);
  }
  for(const [x,z] of [[NaN,0],[0,Infinity],[0,0]]){
    if(Number.isFinite(x)&&Number.isFinite(z)&&canOccupyCabin(x,z)) continue;
    assert.equal(canOccupyCabin(x,z),false);
  }
  const c=createCabinMovement(), before={...c.position};
  assert.equal(c.setPose({x:99,z:99}),false);
  assert.deepEqual(c.position,before);
});

test('rear access is a continuous walkable passage to the engine room, with solid side walls',()=>{
  for(let z=3.78;z<=5.2;z+=.08) assert.equal(canOccupyCabin(0,z),true,`centre passage blocked at z=${z}`);
  assert.equal(canOccupyCabin(-1.5,4.5),false);
  assert.equal(canOccupyCabin(1.5,4.5),false);
});

test('physical compartment follows the existing cabin, passage and engine bulkheads',()=>{
  assert.equal(cabinSectionAt(0,2.4),CABIN_SECTIONS.CABIN);
  assert.equal(cabinSectionAt(0,4.5),CABIN_SECTIONS.SERVICE_CORRIDOR);
  assert.equal(cabinSectionAt(0,6.5),CABIN_SECTIONS.ENGINE_ROOM);
  assert.equal(cabinSectionAt(99,99),null);
});

test('yaw remains unrestricted through multiple full turns',()=>{
  const c=createCabinMovement();
  c.look(-Math.PI*5,0);
  assert.ok(c.yaw>Math.PI*4);
});

test('diagonal motion is normalized and stalls do not tunnel through walls',()=>{
  const straight=createCabinMovement(),diagonal=createCabinMovement();
  straight.update(.1,{x:1});
  diagonal.update(.1,{x:1,y:1});
  assert.ok(Math.abs(straight.travelled-diagonal.travelled)<1e-9);
  const c=createCabinMovement();
  c.setPose({x:0,z:5});
  for(let i=0;i<20;i++)c.update(.1,{x:1,y:-1});
  assert.equal(canOccupyCabin(c.position.x,c.position.z),true);
});

test('corner sliding follows the dominant movement axis instead of steering sideways',()=>{
  const c=createCabinMovement();
  c.setPose({x:.25,z:-.9,yaw:0,pitch:0});
  const before={...c.position};
  c.update(.1,{x:.25,y:-1});
  assert.ok(Math.abs(c.position.x-before.x)<.03,'dominant forward input should not be steered hard sideways');
});

test('station interaction requires physical proximity and looking toward the station',()=>{
  const c=createCabinMovement();
  for(const station of CABIN_STATIONS){
    assert.ok(Number.isFinite(station.radius)&&station.radius>0);
  }
  c.setPose({x:0,z:2.4,yaw:0,pitch:0});
  assert.equal(c.focus(),null);
});

test('invalid look targets cannot poison camera or movement state',()=>{
  const c=createCabinMovement(), before=c.snapshot();
  assert.equal(c.lookToward({x:NaN,y:0,z:0}),false);
  assert.equal(c.lookToward(null),false);
  const after=c.snapshot();
  assert.equal(after.yaw,before.yaw);
  assert.equal(after.pitch,before.pitch);
});

test('look pitch clamps and reset clears locomotion',()=>{
  const c=createCabinMovement();
  c.look(0,-99);assert.ok(c.pitch<=.91);
  c.look(0,99);assert.ok(c.pitch>=-1.03);
  c.update(.1,{x:1});assert.ok(c.travelled>0);
  c.reset();
  assert.deepEqual(c.position,{x:0,z:2.4});assert.equal(c.travelled,0);
});

test('crew replication pose is compact, validated and interpolates yaw across wrap',()=>{
  // Keep both samples comfortably clear of the reserve chest collision radius.
  const from=cabinCrewPose({x:-.15,z:2.4,yaw:Math.PI-.1,pitch:-.2});
  const to=cabinCrewPose({x:.15,z:2.4,yaw:-Math.PI+.1,pitch:.2});
  assert.ok(from&&to);
  assert.equal(Object.isFrozen(from),true);
  assert.equal(cabinCrewPose({x:99,z:99,yaw:0,pitch:0}),null);
  const middle=interpolateCabinCrewPose(from,to,.5);
  assert.ok(Math.abs(middle.x)<1e-12&&Math.abs(middle.z-2.4)<1e-12);
  assert.ok(Math.abs(Math.abs(middle.yaw)-Math.PI)<1e-12,'yaw interpolation takes the short path through ±π');
  assert.ok(Math.abs(middle.pitch)<1e-12);
  assert.equal(middle.section,CABIN_SECTIONS.CABIN);
  assert.equal(interpolateCabinCrewPose(from,to,NaN),null);
});
test('replicated crew interpolation cannot tunnel an avatar through solid equipment',()=>{
  // Keep both network endpoints comfortably walkable after the cabin prop/collision
  // pass; their straight midpoint still crosses the navigation desk.
  const from=cabinCrewPose({x:-2.2,z:1.78,yaw:0,pitch:0});
  const to=cabinCrewPose({x:-.8,z:.7,yaw:0,pitch:0});
  assert.ok(from&&to,'network endpoints are individually walkable');
  assert.equal(interpolateCabinCrewPose(from,to,.5),null,'blocked midpoint is rejected instead of clipping through the map desk');
});