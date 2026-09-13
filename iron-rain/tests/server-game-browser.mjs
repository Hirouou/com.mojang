import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.IRON_RAIN_PLAYWRIGHT || 'playwright');
import { startWarServer } from '../server/http.mjs';
import { ballistics } from '../modules/ballistics.js';
const server=startWarServer({port:0,dbPath:':memory:'});await new Promise(r=>server.server.once('listening',r));
const endpoint=`http://127.0.0.1:${server.server.address().port}`;
const browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});const errors=[];const pages=[];
try{
 for(let i=0;i<3;i++){
  const c=await browser.newContext({viewport:i===2?{width:844,height:390}:{width:800,height:450},isMobile:i===2,hasTouch:i===2});const p=await c.newPage();pages.push(p);p.setDefaultTimeout(25000);console.log("entry",i);
  p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await p.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>raf(t=>setTimeout(()=>fn(t),50));window.sharedEvents=[];addEventListener('ironrain:shared-crew-effect',e=>sharedEvents.push(e.detail.type));});
  await p.goto(`http://localhost:4173/?test=1&server=${endpoint}`);
  await p.locator(`[data-server-faction="${i===1?'axis':'allies'}"]`).click();
  if(i<2)await p.locator('[data-server-create]').click();else{
   const mid=await pages[0].evaluate(()=>ironRainEntry.runtime.snapshot().mamute.id);
   await p.locator(`[data-server-join="${mid}"]`).click();
  }
  await p.waitForFunction(()=>window.ironRainTest?.snapshot().cabin?.renderer.drawCalls>0);console.log('ready',i);
 }
 console.log('three ready');const [a,b,c]=pages;
 const ids=await Promise.all(pages.map(p=>p.evaluate(()=>ironRainEntry.runtime.snapshot().mamute.id)));
 assert.notEqual(ids[0],ids[1]);assert.equal(ids[0],ids[2]);
 const shooter=server.world.state.mamutes[ids[0]],target=server.world.state.mamutes[ids[1]];
 // Test-only battlefield arrangement; aim/fire/damage remain server commands.
 server.world.state.wind={x:0,y:0};Object.assign(shooter.robot,{x:8000,y:8000});Object.assign(target.robot,{x:8000+ballistics(1,70).range,y:8000});
 await a.bringToFront();await a.waitForFunction(()=>ironRainTest.snapshot().robot.x===8000);
 await a.evaluate(()=>ironRainTest.setPose({x:0,z:0,yaw:0,pitch:0}));
 console.log('claiming',await a.evaluate(()=>ironRainTest.snapshot().cabin.focus));await a.locator('#interactBtn').click();await a.waitForFunction(()=>ironRainTest.snapshot().station==='aim');
 for(let i=0;i<3;i++)await a.keyboard.press('q');
 await a.waitForFunction(()=>ironRainTest.snapshot().charge===1);
 await a.evaluate(async()=>{for(let i=0;i<4;i++)await ironRainEntry.runtime.command('aim-delta',{elevation:i===3?1:8});});
 await a.waitForFunction(()=>ironRainTest.snapshot().elev===70);
 await a.bringToFront();console.log('aim ready');const ammo=await a.evaluate(()=>ironRainTest.snapshot().ammo.HE);await a.locator('#fireBtn').click({noWaitAfter:true});
 await b.waitForFunction(()=>ironRainTest.snapshot().robot.armor<90,{},{timeout:18000});
 assert.equal(await a.evaluate(()=>ironRainTest.snapshot().ammo.HE),ammo-1);
 await c.waitForFunction(()=>sharedEvents.includes('fire'));
 await b.waitForFunction(()=>sharedEvents.includes('impact')||sharedEvents.includes('critical'));
 // Peer visibility and shared door, never just membership counters.
 console.log('damage ready');await c.evaluate(()=>ironRainTest.setPose({x:0,z:3.2,yaw:0,pitch:0}));
 await a.waitForFunction(()=>ironRainTest.snapshot().cabin.hatchOpen>.7);
 await a.waitForFunction(()=>ironRainTest.snapshot().cabin.crew.some(v=>v.visible));
 // Menu/map layout on actual mobile viewport; zoom must not resize the canvas.
 await c.bringToFront();await c.locator('#menuBtn').tap();await c.locator('#strategicWarBtn').tap();
 await c.waitForSelector('.strategic-war:not(.hidden)');
 const canvas=c.locator('.strategic-war canvas'),before=await canvas.boundingBox();
 await c.locator('[data-map-in]').tap();const after=await canvas.boundingBox();assert.deepEqual(after,before);
 const tools=await c.locator('.war-map-toolbar').boundingBox();assert.ok(tools.y+tools.height<=before.y+1);
 await c.screenshot({path:'test-results/server-mobile-map.png'});
 await c.locator('.strategic-war [data-close]').tap();await c.locator('#menuBtn').tap();
 assert.ok((await c.locator('#crewInviteCode').innerText()).length>=8);
 await c.screenshot({path:'test-results/server-mobile-menu.png'});
 await b.close();await c.close();await a.bringToFront();const token=await a.evaluate(()=>ironRainEntry.localId);await a.reload();await a.locator('[data-server-resume]').click({noWaitAfter:true});await a.waitForFunction(()=>window.ironRainTest?.snapshot().cabin?.active);assert.equal(await a.evaluate(()=>ironRainEntry.localId),token);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,mamutes:ids,ammo:ammo-1,targetArmor:target.robot.armor,sharedDoor:true,mobileCanvas:after,errors}));
}catch(error){console.error('failed',error);for(let i=0;i<pages.length;i++){console.log('page',i,await pages[i].evaluate(()=>({text:document.body.innerText.slice(-1400),state:window.ironRainTest?.snapshot().station,runtime:window.ironRainEntry?.runtime?.status()})).catch(()=>null));}throw error;}finally{await browser.close();await server.close();}
