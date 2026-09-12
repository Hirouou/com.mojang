import test from 'node:test';
import assert from 'node:assert/strict';
import { stepCamera, cinematicActive, cameraAnchor, finishCamera } from '../modules/camera-director.js';

const make = () => ({ robot:{x:8200,y:30000}, cam:{x:65000,y:17000,zoom:.78,mode:'impact',manualX:0,manualY:0}, impactHold:1.65,returning:false });
for (const fps of [15,30,60,120]) test(`Impact holds, returns, restores local scale at ${fps} fps`, () => {
  const s = make();
  for(let i=0;i<Math.floor(fps*1.5);i++) stepCamera(s,1/fps,844);
  assert.equal(s.cam.mode,'impact');
  for(let i=0;i<fps*4;i++) stepCamera(s,1/fps,844);
  assert.equal(cinematicActive(s),false);
  assert.equal(s.returning,false);
  assert.equal(s.cam.zoom,.78);
  const p=cameraAnchor(s,844);
  assert.ok(Math.hypot(s.cam.x-p.x,s.cam.y-p.y)<1);
});
test('Explicit return recovers camera and offsets from every cutaway state', () => {
  for(const mode of ['intel','shell','impact','return']){
    const s=make();s.cam.mode=mode;s.cam.manualX=900;finishCamera(s,667);
    assert.equal(s.cam.mode,'follow');assert.equal(s.cam.manualX,0);assert.equal(s.impactHold,0);
  }
});
