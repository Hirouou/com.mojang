import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
let playwright;
try { playwright=require('playwright'); }
catch { playwright=require(process.env.IRON_RAIN_PLAYWRIGHT||'C:/Users/Alan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const {chromium,webkit}=playwright;
const base=process.env.IRON_RAIN_URL||'http://localhost:4173';
const output=new URL('../test-results/',import.meta.url);
await mkdir(output,{recursive:true});
const results=[];

async function snap(page){return page.evaluate(()=>window.ironRainTest.snapshot());}
async function advance(page,seconds){await page.evaluate(t=>window.ironRainTest.advance(t),seconds);}
async function gesture(page,selector,event,x,y,id=1){
  await page.locator(selector).dispatchEvent(event,{pointerId:id,pointerType:'touch',isPrimary:id===1,button:0,buttons:event==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true,cancelable:true});
}
async function wheel(page,selector,turns){
  const r=await page.locator(selector).boundingBox(),cx=r.x+r.width/2,cy=r.y+r.height/2,radius=r.width*.38;
  await gesture(page,selector,'pointerdown',cx+radius,cy,7);
  const steps=Math.abs(turns)*32;
  for(let i=1;i<=steps;i++){const a=i/32*Math.PI*2*Math.sign(turns);await gesture(page,selector,'pointermove',cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,7);}
  await gesture(page,selector,'pointerup',cx+radius,cy,7);
}

for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  try{
    await page.goto(base+'/?test=1');
    await page.waitForFunction(()=>!!window.ironRainTest);
    const initial=await snap(page);
    assert.equal(initial.reports.length,0,'enemy coordinates are unknown initially');
    await page.evaluate(()=>window.ironRainTest.scenario({nextIntel:9999,wind:{x:0,y:0}}));
    const joy=await page.locator('#joystick').boundingBox(),jx=joy.x+joy.width*.83,jy=joy.y+joy.height/2;
    await gesture(page,'#joystick','pointerdown',jx,jy);
    await advance(page,2);
    assert.ok((await snap(page)).robot.x>initial.robot.x+40,'joystick moves Mamute');
    await gesture(page,'#joystick','pointercancel',jx,jy);
    const stopped=(await snap(page)).robot.x;await advance(page,1);
    assert.ok(Math.abs((await snap(page)).robot.x-stopped)<.01,'cancel stops joystick');
    await page.locator('#deployBtn').click();
    const gunStart=await snap(page);
    await wheel(page,'#azWheel',1);await wheel(page,'#elWheel',-.5);await advance(page,5);
    const gunEnd=await snap(page);
    assert.ok(Math.abs(gunEnd.bearing-gunStart.bearing-360/6.5)<.02,'azimuth mechanical reduction works');
    assert.ok(Math.abs(gunEnd.elev-gunStart.elev+180/8.5)<.02,'elevation mechanical reduction works');
    assert.ok(Math.abs(gunEnd.robot.turret-(gunEnd.bearing*Math.PI/180-Math.PI/2))<.001,'drawn barrel shares shot bearing');
    await page.locator('#chargeUp').click();await advance(page,.2);
    assert.equal((await snap(page)).charge,5);
    assert.match(await page.locator('#rangeReadout').innerText(),/m[\s\S]*m/,'both nominal range and apex are in metres');
    await page.screenshot({path:new URL(`${engineName}-artillery.png`,output).pathname.replace(/^\/(\w:)/,'$1')});

    for(const [charge,elev,bearing] of [[1,80,90],[4,30,90],[7,45,90],[7,45,270]]){
      await page.evaluate(values=>window.ironRainTest.scenario(values),{charge,elev,bearing,wind:{x:0,y:0}});
      await advance(page,.1);await page.locator('#fireBtn').click();
      assert.equal((await snap(page)).cam.mode,'shell');
      assert.equal(await page.locator('#fireDeck').isVisible(),false);
      await advance(page,6);
      const stage=await snap(page);assert.ok(['shell','impact'].includes(stage.cam.mode));
      await advance(page,8);
      const end=await snap(page);
      assert.equal(end.cam.mode,'follow','camera returns after impact');
      assert.equal(await page.locator('#fireDeck').isVisible(),true,'fire deck always restores');
      assert.equal(await page.locator('#fireBtn').isEnabled(),true);
      assert.ok(Math.abs(Math.hypot(end.lastShot.x-end.lastShot.origin.x,end.lastShot.y-end.lastShot.origin.y)-end.lastShot.range)<.0001,'rendered shot reaches displayed nominal range');
      if(bearing===270)assert.ok(end.lastShot.x<0,'off-theatre shot is not pinned to border');
    }
    // Interrupted shell continues independently, and cannot hide the panel again.
    await page.locator('#fireBtn').click();await page.locator('#returnBtn').click();
    assert.equal((await snap(page)).cam.mode,'follow');await advance(page,15);
    assert.equal(await page.locator('#fireDeck').isVisible(),true);
    await page.locator('#fireBtn').click();await page.locator('#menuBtn').click();
    assert.equal((await snap(page)).paused,true);await page.locator('#resumeBtn').click();await advance(page,15);
    assert.equal(await page.locator('#fireDeck').isVisible(),true,'menu during flight restores controls');

    // Intel follows source, target and returns; it cannot overlap a shell.
    await page.evaluate(()=>window.ironRainTest.scenario({nextIntel:0}));await advance(page,.2);
    assert.equal((await snap(page)).cam.mode,'intel');
    assert.equal((await snap(page)).reports.length,0,'source view alone does not reveal target');
    await advance(page,2.1);assert.equal((await snap(page)).reports.length,1);
    await advance(page,6);assert.equal((await snap(page)).cam.mode,'follow');
    const beforeMap=await snap(page);
    await page.locator('#mapBtn').click();
    assert.equal(await page.locator('#notebook').isVisible(),true);
    assert.equal((await snap(page)).paused,false,'war continues while consulting paper');
    await advance(page,5);
    assert.ok((await snap(page)).time>=beforeMap.time+5);
    assert.equal((await snap(page)).bearing,beforeMap.bearing,'map never slews gun');
    const notebookText=await page.locator('#notebook').innerText();
    assert.match(notebookText,/ΔX/);assert.match(notebookText,/ΔY/);
    await page.screenshot({path:new URL(`${engineName}-table-map.png`,output).pathname.replace(/^\/(\w:)/,'$1')});
    for(const [width,height] of [[667,375],[844,390],[932,430]]){
      await page.setViewportSize({width,height});await page.waitForTimeout(100);
      const dimensions=await page.evaluate(()=>({w:innerWidth,h:innerHeight,scrollW:document.documentElement.scrollWidth,scrollH:document.documentElement.scrollHeight,overflows:[...document.querySelectorAll('#notebook .sheet-card,#notebook .table-card,#notebook .map-workspace')].filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>({class:e.className,ch:e.clientHeight,sh:e.scrollHeight,cw:e.clientWidth,sw:e.scrollWidth}))}));
      assert.ok(dimensions.scrollW<=width&&dimensions.scrollH<=height,'no document scroll');
      assert.deepEqual(dimensions.overflows,[],'table fits landscape without scroll');
    }
    assert.ok((await snap(page)).details.reduce((n,s)=>n+s.units,0)<=51,'detail population bounded');
    assert.deepEqual(errors,[],'no console/runtime errors');
    results.push({engine:engineName,status:'passed',checks:'boot, fog, joystick cancel, handwheel reduction, physical cannon, four ballistic configurations, camera recovery, skipped flight, menu interruption, reconnaissance, static table, 3 landscape sizes'});
  }catch(error){
    await page.screenshot({path:new URL(`${engineName}-failure.png`,output).pathname.replace(/^\/(\w:)/,'$1')}).catch(()=>{});
    results.push({engine:engineName,status:'failed',error:error.stack,console:errors});
  }finally{await browser.close();}
}
await writeFile(new URL('browser-results.json',output),JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
