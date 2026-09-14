import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createWarAuthority } from '../server/world.mjs';

test('poll delta reduces repeated bytes and continuous input does not save the world per command', () => {
 let wall=1000000,saves=0;
 const world=createWarAuthority({store:{load:()=>null,save:()=>saves++},now:()=>wall});
 const identity=world.register(),p=world.authenticate(identity.token);world.heartbeat(p,{x:0,z:0,yaw:0,pitch:0});
 const cmd=(type,payload)=>world.command(p,{id:randomUUID(),sequence:p.sequence+1,type,payload});
 cmd('create',{faction:'allies'});cmd('claim',{station:'aim'});
 const before=saves;
 for(let i=0;i<25;i++)cmd('aim-delta',{bearing:.1,elevation:0});
 assert.equal(saves,before);
 const initial=world.snapshot(p),delta=world.snapshot(p,initial.eventHead,initial.strategicRevision);
 const fullBytes=Buffer.byteLength(JSON.stringify(initial)),deltaBytes=Buffer.byteLength(JSON.stringify(delta));
 assert.equal(delta.strategic,undefined);assert.ok(deltaBytes<fullBytes*.3);
 const gzipBytes=gzipSync(JSON.stringify(delta),{level:1}).byteLength;
 assert.ok(gzipBytes<deltaBytes*.5);
 wall+=2100;world.advance();world.advance();
 assert.ok(saves>before);
 assert.ok(world.snapshot(p,0,initial.strategicRevision).strategic);
 console.log(JSON.stringify({fullBytes,deltaBytes,gzipBytes,inputWrites:saves-before}));
});

test('one impact leaves stable hull and engine HP until another attack or completed repair',()=>{
 let wall=1000000;
 const world=createWarAuthority({store:{load:()=>null,save:()=>{}},now:()=>wall});
 const p=world.authenticate(world.register().token);world.heartbeat(p);
 world.command(p,{id:randomUUID(),sequence:1,type:'create',payload:{faction:'allies'}});
 const m=world.state.mamutes[p.mamuteId];m.threatAt=1e9;
 world.damage(m,75,{shotId:'one-hit'});m.engine.fire=1;
 const armor=m.robot.armor,health=m.engine.health;
 for(let i=0;i<80;i++){wall+=100;world.advance();}
 assert.equal(m.robot.armor,armor);assert.equal(m.engine.health,health);assert.equal(m.engine.fire,1);
 assert.equal(world.state.events.filter(e=>e.type==='critical').length,1);
});
