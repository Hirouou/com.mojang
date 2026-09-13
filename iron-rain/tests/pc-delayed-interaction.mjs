import { createRequire } from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.IRON_RAIN_PLAYWRIGHT);
import { startWarServer } from '../server/http.mjs';
const s=startWarServer({port:0,dbPath:':memory:'});await new Promise(r=>s.server.once('listening',r));
const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1280,height:720}});
p.on('pageerror',console.log);
try{
await p.goto(`http://localhost:4173/?test=1&server=http://127.0.0.1:${s.server.address().port}`);
await p.locator('[data-server-faction="allies"]').click();await p.locator('[data-server-create]').click();await p.waitForFunction(()=>window.ironRainTest?.snapshot().cabin?.active);
await p.evaluate(()=>ironRainTest.setPose({x:-.9,z:.7,yaw:Math.PI/2,pitch:-.5}));
await p.locator('#cabinCanvas').click({position:{x:640,y:360}});
await p.route('**/command',async route=>{ await new Promise(r=>setTimeout(r,900)); await route.continue(); });
await p.keyboard.press('e');
await p.waitForTimeout(250);
if(!await p.evaluate(()=>!!document.pointerLockElement))throw new Error('Pending station claim released pointer lock');
await p.waitForTimeout(2200);
if(await p.locator('#notebook').evaluate(el=>el.classList.contains('hidden')))throw new Error('Map did not open after grant');
console.log(JSON.stringify(await p.evaluate(()=>({snap:ironRainTest.snapshot().cabin,station:ironRainTest.snapshot().station,rt:ironRainEntry.runtime.status(),own:ironRainEntry.runtime.snapshot().mamute.stations,notebook:document.querySelector('#notebook').className}))));
await p.screenshot({path:'test-results/pc-interact.png'});
}finally{await b.close();await s.close();}

