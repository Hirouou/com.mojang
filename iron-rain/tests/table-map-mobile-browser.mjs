import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.IRON_RAIN_PLAYWRIGHT || 'playwright');
const browser = await chromium.launch({ headless: true });
try {
 for (const viewport of [{width:844,height:390},{width:390,height:844},{width:667,height:375}]) {
  const page = await browser.newPage({viewport,isMobile:true,hasTouch:true});
  await page.goto('http://localhost:4173/?test=1');
  await page.evaluate(async () => {
   document.querySelector('.server-lobby')?.remove(); document.querySelector('#bootStatus')?.remove();
   const {createTableMap}=await import('./modules/table-map.js');
   document.querySelector('#app').classList.add('inside','input-touch');
   window.mapFixture=createTableMap(document.querySelector('#notebook'));
   window.mapData={world:{w:80000,h:60000},own:{x:8200,y:30000},targets:[],charge:4,elev:45};
   mapFixture.open(mapData);
  });
  await page.locator('[data-map-x]').fill('12500');
  await page.locator('[data-map-y]').fill('27000');
  const form=await page.locator('[data-map-point-form]').boundingBox();
  assert.ok(form.x>=0 && form.y>=0 && form.x+form.width<=viewport.width+1 && form.y+form.height<=viewport.height);
  await page.locator('[data-map-point-form] button').tap();
  const distance=await page.locator('[data-map-distance]').innerText();
  assert.match(distance,/5[.\s]?243/);
  await page.evaluate(()=>{mapFixture.close();mapFixture.open({...mapData,own:{x:8300,y:30000}});});
  assert.equal(await page.locator('[data-map-x]').inputValue(),'12500');
  assert.equal(await page.locator('[data-map-y]').inputValue(),'27000');
  assert.notEqual(await page.locator('[data-map-distance]').innerText(),distance);
  const client=await page.context().newCDPSession(page);
  const panel=await page.locator('#map-page-plot').boundingBox();
  const tx=Math.round(panel.x+panel.width/2),ty=Math.round(panel.y+panel.height-30);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty}]});
  for(let i=1;i<=12;i++){await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx,y:ty-i*10}]});await page.waitForTimeout(20);}
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(300);  const scroll=await page.locator('#map-page-plot').evaluate(el=>({scroll:el.scrollTop,needed:el.scrollHeight>el.clientHeight}));
  assert.ok(!scroll.needed||scroll.scroll>0,'Notebook scroll must accept touch');
  await page.screenshot({path:`test-results/table-map-${viewport.width}.png`});
  console.log(JSON.stringify({viewport,distance,form,scroll,persisted:true}));
  await page.close();
 }
} finally {await browser.close();}




