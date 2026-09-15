let S;

function blankChar(){return {aff:0,trust:0,heat:0,seen:0,date:false,kissed:false,commit:false};}
function fresh(name){
 const chars={}; KEYS.forEach(k=>chars[k]=blankChar());
 return {name:name||"Você",day:1,slot:0,phase:"pick",chars,confidence:5,honesty:5,reputation:0,polyOpen:false,polyTalk:false,flags:{},log:[],sound:true,totalChoices:0};
}
function clamp(v){return Math.max(0,Math.min(100,v))}
function randSeed(n){let x=Math.sin(n*999.91)*43758.5453;return x-Math.floor(x)}
function pickDet(arr,seed){return arr[Math.floor(randSeed(seed)*arr.length)%arr.length]}
function show(id){document.querySelectorAll(".screen").forEach(x=>x.classList.remove("active"));$(id).classList.add("active")}
function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),1200)}
function beep(freq=420,dur=.045){
 if(!S||!S.sound)return;
 try{const A=window.AudioContext||window.webkitAudioContext,a=new A(),o=a.createOscillator(),g=a.createGain();o.frequency.value=freq;o.connect(g);g.connect(a.destination);g.gain.value=.025;o.start();o.stop(a.currentTime+dur);setTimeout(()=>a.close(),150)}catch(e){}
}
function save(silent=false){localStorage.setItem(SAVE,JSON.stringify(S));if(!silent)toast("Jogo salvo")}
function load(){try{return JSON.parse(localStorage.getItem(SAVE))}catch(e){return null}}
function pushLog(t){S.log.unshift(t);S.log=S.log.slice(0,8)}
function setScene(locKey,charKey=null){
 const L=LOCS[locKey]||LOCS.patio;$("#loc").textContent=L[0];
 $("#bg").style.background=charKey?CAST[charKey].bg:L[1];
 const av=$("#avatar");
 if(charKey){av.dataset.icon=CAST[charKey].icon;av.dataset.name=CAST[charKey].name;av.style.background=`linear-gradient(180deg,${CAST[charKey].color}99,${CAST[charKey].color}30),linear-gradient(160deg,#222,#0c0c10)`;av.style.opacity="1"}
 else{av.dataset.icon="🎓";av.dataset.name="";av.style.background="linear-gradient(180deg,#6b657555,#20202a22)";av.style.opacity=".35"}
}
function setDialogue(speaker,text,choices=[]){
 $("#speaker").textContent=speaker;$("#text").innerHTML=text;const c=$("#choices");c.innerHTML="";
 choices.forEach(x=>{const b=document.createElement("button");b.className="choice";b.innerHTML=`<b>${x.label}</b>${x.hint?`<small>${x.hint}</small>`:""}`;b.onclick=()=>{beep(520);x.go()};c.appendChild(b)})
}
function updateTop(){ $("#chapterLabel").textContent=`Dia ${S.day}/42 • ${SLOTS[S.slot]}`; }
function meter(label,val){return `<div class="meter"><span>${label}</span><div class="bar"><div class="fill" style="width:${clamp(val)}%"></div></div><b>${Math.round(clamp(val))}</b></div>`}
function renderStats(){
 let h=`<div class="playerstats">
 <div class="pstat">Confiança<b>${S.confidence}</b></div><div class="pstat">Honestidade<b>${S.honesty}</b></div>
 <div class="pstat">Reputação<b>${S.reputation}</b></div><div class="pstat">Rota aberta<b>${S.polyOpen?"Poli":"—"}</b></div></div>`;
 KEYS.forEach(k=>{const c=S.chars[k],C=CAST[k];h+=`<div class="cstat"><div class="chead"><span>${C.icon}</span><span class="name">${C.name}</span><span class="tag">${C.arche}</span></div>${meter("Afeição",c.aff)}${meter("Confiança",c.trust)}${meter("Tensão",c.heat)}</div>`});
 h+=`<div class="log">${S.log.length?S.log.map(x=>"• "+x).join("<br>"):"Nenhuma catástrofe registrada ainda."}</div>`;
 $("#statsBody").innerHTML=h;
}

function pickScreen(){
 updateTop(); renderStats();
 const seed=S.day*11+S.slot*3;
 const first=(S.day+S.slot)%5, opts=[KEYS[first],KEYS[(first+2)%5],KEYS[(first+4)%5]];
 const generic=pickDet(GENERIC,seed);setScene(generic[0],null);
 let intro=`${generic[1]}<br><br><b>Tempo livre.</b> Você só consegue se dedicar de verdade a uma pessoa neste período.`;
 if(S.day===1&&S.slot===0)intro=`Último semestre. Quarenta e dois dias até a formatura. Seu plano era simples: terminar o TCC, pegar o diploma e sair vivo.<br><br>Às 08:07, o universo apresenta cinco razões para esse plano fracassar. Escolha onde gastar sua primeira manhã.`;
 const choices=opts.map((k,i)=>({label:`${CAST[k].icon} Procurar ${CAST[k].name}`,hint:routeHint(k),go:()=>interaction(k)}));
 choices.push({label:"📚 Focar no TCC e na própria vida",hint:"+ confiança; reduz chance de parecer desesperado",go:solo});
 setDialogue("Narrador",intro,choices);
 S.phase="pick";save(true);
}
function routeHint(k){
 const c=S.chars[k];
 if(c.aff<20)return `${CAST[k].arche} • vocês ainda estão se medindo`;
 if(c.aff<45)return `A química já está evidente • ${Math.round(c.aff)} afeição`;
 if(c.aff<70)return `Ela procura desculpas para ficar perto • ${Math.round(c.aff)} afeição`;
 return `Rota avançada • qualquer escolha pode virar compromisso`;
}
function solo(){
 S.confidence=clamp(S.confidence+3);S.reputation=Math.max(-20,S.reputation-1);pushLog(`Dia ${S.day}: você lembrou que TCC existe.`);
 setScene("biblioteca");setDialogue("Narrador",`Você escolhe produtividade. É chocante.<br><br>Depois de algumas horas, seu TCC melhora o suficiente para você não sentir vergonha física ao abrir o arquivo. Ter uma vida própria também parece te deixar menos ansioso nas conversas — uma descoberta revolucionária.`,[
 {label:"Continuar",go:advance}
 ]);S.phase="scene";save(true)
}
function interaction(k){
 const C=CAST[k],c=S.chars[k]; c.seen++;
 const idx=Math.min(BEATS[k].length-1,Math.floor((c.seen-1)/2));
 const beat=BEATS[k][idx],loc=beat[0];
 setScene(loc,k);
 let base=beat[1]+"<br><br>"+pickDet(FLAVOR[k],S.day*17+S.slot*5+c.seen*13);
 if(c.aff>50)base+=`<br><br>A intimidade entre vocês já é difícil de fingir. ${C.name} percebe quando você hesita e parece esperar que você faça alguma coisa com isso.`;
 if(c.trust>60)base+=`<br><br>Mais importante: ela fala com você de um jeito que não usa com o resto do campus.`;
 const choices=[
  {label:boldLabel(k),hint:"+ tensão • + confiança em si • pode reduzir confiança dela se cedo demais",go:()=>applyChoice(k,"bold")},
  {label:sincereLabel(k),hint:"+ confiança • + afeição • melhor para finais sólidos",go:()=>applyChoice(k,"sincere")},
  {label:teaseLabel(k),hint:"+ afeição • + tensão • depende da química",go:()=>applyChoice(k,"tease")}
 ];
 if(c.aff>=45&&c.trust>=35)choices.push({label:"💋 Parar de fingir que isso é só amizade",hint:"Pode liberar beijo/encontro; exige química suficiente",go:()=>applyChoice(k,"kiss")});
 setDialogue(C.name,base,choices);S.phase="scene";S.current=k;save(true)
}
function boldLabel(k){return {
 morgana:"“Se você continuar falando em morder, uma hora eu vou achar que é convite.”",
 bianca:"“Se quer competir, escolhe uma modalidade em que eu tenha chance de te distrair.”",
 yumi:"“Eu deixo você ganhar uma partida se admitir que veio aqui me ver.”",
 cecilia:"“Você flerta como profissão. Quero saber como é quando leva a sério.”",
 helena:"“Você controla esse campus inteiro. Quero ver se consegue me controlar também.”"
}[k]}
function sincereLabel(k){return {
 morgana:"“Pode zoar o quanto quiser. Eu consigo perceber quando alguma coisa te assusta.”",
 bianca:"“Você não precisa ser a pessoa animada comigo o tempo todo.”",
 yumi:"“Você não precisa editar suas respostas comigo. Pode errar ao vivo.”",
 cecilia:"“Eu gosto de você mesmo quando a plateia some.”",
 helena:"“Você não precisa ser perfeita para eu querer estar aqui.”"
}[k]}
function teaseLabel(k){return {
 morgana:"“Então vampira centenária ainda fica sem graça? Isso eu precisava documentar.”",
 bianca:"“Seu maior talento é transformar tudo em competição, né?”",
 yumi:"“Tsundere detectada. Vou abrir um bug report.”",
 cecilia:"“Você ensaiou essa entrada ou nasceu dramaticamente?”",
 helena:"“Senhora presidente, isso foi quase um sorriso humano. Histórico.”"
}[k]}

function applyChoice(k,type){
 const c=S.chars[k],C=CAST[k];
 let result="";
 if(type==="sincere"){
  c.aff+=5;c.trust+=7;S.honesty+=2;S.confidence+=1;
  result=`A resposta acerta um lugar menos teatral. ${C.name} fica quieta por alguns segundos — não desconfortável, só sem a proteção habitual. “Tá… isso foi perigosamente decente da sua parte.”`;
 }else if(type==="tease"){
  c.aff+=6;c.heat+=5;S.confidence+=2;
  result=`${C.name} tenta não rir e falha. A provocação volta na mesma intensidade, e a conversa entra naquele território em que cada frase parece ter uma segunda interpretação cuidadosamente não confirmada.`;
 }else if(type==="bold"){
  c.heat+=8;S.confidence+=4;c.aff+=3;
  if(c.trust<22){c.trust-=2;result=`A ousadia arranca uma reação, mas você percebe que foi um pouco cedo. ${C.name} ri, desvia o assunto e guarda mentalmente a informação de que você tem coragem demais para o próprio bem.`}
  else{c.trust+=2;result=`${C.name} congela por meio segundo, depois sorri de um jeito que confirma que a provocação foi recebida exatamente como você queria. “Perigoso. Continua.”`}
 }else if(type==="kiss"){
  if(c.aff>=52&&c.trust>=38){
   c.kissed=true;c.aff+=8;c.heat+=10;c.trust+=4;S.reputation+=2;
   result=`Você para de procurar uma frase perfeita e simplesmente diminui a distância. ${C.name} entende antes do toque.<br><br>O beijo começa curto, experimental, e termina bem menos inocente. Quando vocês se afastam, ela ainda está perto demais para fingir que foi acidente.`;
  }else{
   c.trust-=7;c.aff-=4;S.reputation-=2;
   result=`Você tenta avançar, mas o timing não existe. ${C.name} recua um passo. Não vira desastre completo, mas o clima quebra — uma lembrança útil de que química não substitui confiança.`;
  }
 }
 normalize();
 pushLog(`Dia ${S.day}: ${C.name} • ${type==="kiss"?"você tentou transformar tensão em beijo":type==="sincere"?"você escolheu sinceridade":type==="tease"?"vocês trocaram provocações":"você foi ousado"}.`);
 setDialogue(C.name,result,[{label:"Continuar",go:advance}]);
 renderStats();save(true)
}

function normalize(){
 S.confidence=clamp(S.confidence);S.honesty=clamp(S.honesty);
 KEYS.forEach(k=>{let c=S.chars[k];c.aff=clamp(c.aff);c.trust=clamp(c.trust);c.heat=clamp(c.heat)})
}

function advance(){
 if(S.slot<2){S.slot++;S.phase="pick";pickScreen();return}
 if(MILESTONES[S.day]&&!S.flags["ms"+S.day]){milestone(S.day);return}
 S.day++;S.slot=0;
 if(S.day>42){finish();return}
 S.phase="pick";save(true);pickScreen();
}
