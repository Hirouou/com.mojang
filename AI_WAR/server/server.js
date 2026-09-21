// AI WAR bridge — Node.js standard library only.
const http = require('http');
const fs = require('fs');
const path = require('path');
const URL = require('url');
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8787);
const queues = { blue: [], red: [] };
const lastState = { tick:0, simSeconds:0, units:[], build:[], res:[], events:[] };
const factionOf = f => f === 'blue' ? 0 : f === 'red' ? 1 : null;
function json(res,code,body){const s=JSON.stringify(body);res.writeHead(code,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'});res.end(s);}
function body(req){return new Promise((resolve,reject)=>{let b='';req.on('data',c=>b+=c);req.on('end',()=>{try{resolve(b?JSON.parse(b):{})}catch(e){reject(e)}})});}
function observe(faction){
 const f=factionOf(faction); if(f===null)return null;
 const own=lastState.units.filter(u=>u.hp>0&&u.f===f);
 const enemy=lastState.units.filter(u=>u.hp>0&&u.f!==f).filter(e=>own.some(o=>Math.hypot(o.x-e.x,o.y-e.y)<=300));
 return {tick:lastState.tick,simSeconds:lastState.simSeconds,faction,units:own.concat(enemy),build:lastState.build.filter(b=>b.f===f||own.some(u=>Math.hypot(u.x-b.x,u.y-b.y)<=300)),res:lastState.res.filter(r=>own.some(u=>Math.hypot(u.x-r.x,u.y-r.y)<=300)),events:lastState.events.slice(0,20)};
}
function validate(faction,a){
 const f=factionOf(faction);
 if(f===null||!a||!['move','attack'].includes(a.type))return{ok:false,error:'invalid faction or action type'};
 const u=lastState.units.find(x=>x.id===a.unitId&&x.f===f&&x.hp>0);
 if(!u)return{ok:false,error:'unit is not owned by faction or is dead'};
 if(!Number.isFinite(a.x)||!Number.isFinite(a.y)||a.x<0||a.x>1100||a.y<0||a.y>620)return{ok:false,error:'invalid destination'};
 if(a.type==='attack'){
  const t=lastState.units.find(x=>x.id===a.targetId&&x.f!==f&&x.hp>0);
  if(!t)return{ok:false,error:'target unavailable'};
  if(Math.hypot(u.x-t.x,u.y-t.y)>300)return{ok:false,error:'target not currently visible'};
 }
 return{ok:true};
}
http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type'});return res.end();}
 const u=URL.parse(req.url,true);
 if(req.method==='GET'&&u.pathname==='/api/health')return json(res,200,{ok:true,service:'ai-war-bridge'});
 if(req.method==='GET'&&u.pathname==='/api/observe'){const o=observe(String(u.query.faction||''));return o?json(res,200,o):json(res,400,{error:'faction must be blue or red'});}
 if(req.method==='POST'&&u.pathname==='/api/state'){try{const b=await body(req);if(!Number.isInteger(b.tick)||!Array.isArray(b.units))return json(res,400,{error:'invalid state'});lastState.tick=b.tick;lastState.simSeconds=Number(b.simSeconds)||0;lastState.units=b.units.map(u=>({id:u.id,f:u.f,x:u.x,y:u.y,hp:u.hp,kind:u.kind,res:u.res}));lastState.build=Array.isArray(b.build)?b.build:[];lastState.res=Array.isArray(b.res)?b.res:[];lastState.events=Array.isArray(b.events)?b.events:[];return json(res,200,{ok:true});}catch(e){return json(res,400,{error:'bad JSON'});}}
 if(req.method==='POST'&&u.pathname==='/api/action'){try{const b=await body(req),v=validate(b.faction,b.action);if(!v.ok)return json(res,400,v);if(queues[b.faction].length>=50)return json(res,429,{error:'faction action queue full'});const action={...b.action,issuedAt:Date.now(),faction:b.faction};queues[b.faction].push(action);return json(res,202,{ok:true,action});}catch(e){return json(res,400,{error:'bad JSON'});}}
 if(req.method==='GET'&&u.pathname==='/api/actions'){const f=String(u.query.faction||'');if(!queues[f])return json(res,400,{error:'faction must be blue or red'});return json(res,200,{actions:queues[f].splice(0,20)});}
 if(req.method==='GET'){let p=u.pathname==='/game'||u.pathname==='/game/'?'/game/index.html':u.pathname;const file=path.normalize(path.join(ROOT,p.replace(/^\//,'')));if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile())return json(res,404,{error:'not found'});const ext=path.extname(file);res.writeHead(200,{'Content-Type':ext==='.html'?'text/html':'text/plain'});return fs.createReadStream(file).pipe(res);}
 json(res,404,{error:'not found'});
}).listen(PORT,()=>console.log('AI WAR bridge: http://localhost:'+PORT));
