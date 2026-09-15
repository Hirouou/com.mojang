const VN_SPRITES={
 morgana:"assets/morgana.webp?v=8",
 bianca:"assets/bianca.webp?v=8",
 yumi:"assets/yumi.webp?v=8",
 cecilia:"assets/cecilia.webp?v=8",
 helena:"assets/helena.webp?v=8"
};
const VN_SPRITE_POS=["0% 0%","100% 0%","0% 100%","100% 100%"];
const VN_UNKNOWN={
 morgana:{label:"🦇 Ir até a biblioteca",hint:"Uma garota de preto chamou sua atenção entre as estantes."},
 bianca:{label:"🏐 Passar pelo ginásio",hint:"Você quase esbarrou numa atleta que nunca viu."},
 yumi:{label:"💻 Usar o laboratório de informática",hint:"Talvez ainda tenha um computador livre."},
 cecilia:{label:"🎭 Dar uma olhada no auditório",hint:"Você ouviu ensaio atrás das cortinas."},
 helena:{label:"👑 Passar pelo diretório estudantil",hint:"Uma garota muito arrumada parece estar organizando o caos do campus."}
};
const VN_FIRST_MEETS={
 morgana:`Você cruza com uma garota vestida de preto entre duas estantes da biblioteca. Ela fecha um livro antigo e mede você dos pés à cabeça.<br><br>“Você está no meu caminho... ou foi coincidência?”`,
 bianca:`Na entrada do ginásio, uma garota de rabo de cavalo quase esbarra em você com uma bolsa esportiva no ombro.<br><br>“Ai! Foi mal... espera, eu já te vi por aqui?”`,
 yumi:`No laboratório, uma garota de óculos e fones ocupa exatamente o computador que você ia usar. Ela ajusta os óculos e te encara por cima da tela.<br><br>“Se você veio usar esse computador... eu cheguei primeiro.”`,
 cecilia:`Você erra uma porta no auditório e cai nos bastidores. Uma loira cheia de acessórios te olha como se sua entrada estivesse no roteiro.<br><br>“Ué, plateia antes do ensaio? Você se perdeu ou veio me admirar?”`,
 helena:`Perto do diretório, uma garota impecavelmente arrumada te intercepta com uma pasta nos braços.<br><br>“Você é calouro? Não... seu rosto não me é familiar. Precisa de orientação?”`
};
const VN_FIRST_CHOICES={
 morgana:[["Pedir desculpa.","sincere"],["Reparar no livro estranho.","curious"],["Brincar que ela parece saída de um romance gótico.","tease"]],
 bianca:[["Dizer que não, mas gostaria.","bold"],["Perguntar se ela treina ali.","curious"],["Fingir que a culpa foi dela.","tease"]],
 yumi:[["Oferecer ajuda.","sincere"],["Perguntar o que ela está programando.","curious"],["Reparar no chaveiro de anime dela.","tease"]],
 cecilia:[["Admitir que ela chamou atenção.","bold"],["Perguntar se vai ter peça.","curious"],["Entrar na brincadeira.","tease"]],
 helena:[["Dizer que talvez precise.","sincere"],["Perguntar quem ela é.","curious"],["Responder com confiança demais.","bold"]]
};
const VN_INTRO={
 morgana:`Ela sustenta seu olhar por mais um segundo, como se estivesse decidindo se você merece a informação.<br><br>“Morgana. Já que você claramente vai continuar aparecendo por aqui.”`,
 bianca:`Ela estende a mão com um sorriso largo, como se o quase-acidente já tivesse virado piada interna.<br><br>“Bianca, aliás. Agora você já me viu por aqui.”`,
 yumi:`Depois de uma pausa longa demais, ela desvia os olhos para o monitor.<br><br>“Yumi.”<br><br>O jeito como fornece o próprio nome faz parecer que isso consumiu uns 30% da bateria social dela.`,
 cecilia:`Ela faz uma reverência tão exagerada que você quase procura uma plateia.<br><br>“Cecília. Guarda o nome; vai aparecer nos créditos.”`,
 helena:`Ela ajeita a pasta contra o peito e finalmente suaviza meio centímetro da expressão.<br><br>“Helena Prado.”<br><br>O jeito como ela diz parece quase uma apresentação oficial.`
};

blankChar=function(){return {aff:0,trust:0,heat:0,seen:0,date:false,kissed:false,commit:false,known:false};};
fresh=function(name){
 const chars={};KEYS.forEach(k=>chars[k]=blankChar());
 return {name:name||"Você",day:1,slot:0,phase:"pick",chars,confidence:5,honesty:5,reputation:0,polyOpen:false,polyTalk:false,flags:{},log:[],sound:true,totalChoices:0};
};
load=function(){
 try{
  const x=JSON.parse(localStorage.getItem(SAVE));
  if(x&&x.chars)KEYS.forEach(k=>{
   const old=x.chars[k]||{},merged=Object.assign(blankChar(),old);
   if(typeof old.known!=="boolean")merged.known=(old.seen||0)>0;
   x.chars[k]=merged;
  });
  return x;
 }catch(e){return null}
};

function vnShowSprite(k,expr=0){
 const av=$("#avatar");
 if(!k){av.style.opacity="0";av.style.backgroundImage="none";return}
 av.dataset.character=k;
 av.style.backgroundImage=`url("${VN_SPRITES[k]}")`;
 av.style.backgroundSize="200% 200%";
 av.style.backgroundPosition=VN_SPRITE_POS[Math.max(0,Math.min(3,expr))];
 av.style.opacity="1";
}
setScene=function(locKey,charKey=null,expr=0){
 const L=LOCS[locKey]||LOCS.patio;$("#loc").textContent=L[0];
 $("#bg").style.background=L[1];
 vnShowSprite(charKey,expr);
};

renderStats=function(){
 let h=`<div class="playerstats"><div class="pstat">Confiança<b>${S.confidence}</b></div><div class="pstat">Honestidade<b>${S.honesty}</b></div><div class="pstat">Reputação<b>${S.reputation}</b></div><div class="pstat">Rota aberta<b>${S.polyOpen?"Poli":"—"}</b></div></div>`;
 KEYS.forEach(k=>{
  const c=S.chars[k],C=CAST[k];
  if(!c.known)h+=`<div class="cstat unknown"><div class="chead"><span>${C.icon}</span><span class="name">???</span><span class="tag">Desconhecida</span></div><div class="unknown-note">Vocês ainda não se apresentaram.</div></div>`;
  else h+=`<div class="cstat"><div class="chead"><span>${C.icon}</span><span class="name">${C.name}</span><span class="tag">${C.arche}</span></div>${meter("Afeição",c.aff)}${meter("Confiança",c.trust)}${meter("Tensão",c.heat)}</div>`;
 });
 h+=`<div class="log">${S.log.length?S.log.map(x=>"• "+x).join("<br>"):"Nenhuma catástrofe registrada ainda."}</div>`;
 $("#statsBody").innerHTML=h;
};

routeHint=function(k){
 const c=S.chars[k];
 if(!c.known)return "Você ainda não sabe quem ela é.";
 if(c.aff<20)return `${CAST[k].arche} • vocês ainda estão se medindo`;
 if(c.aff<45)return `A química já está evidente • ${Math.round(c.aff)} afeição`;
 if(c.aff<70)return `Ela procura desculpas para ficar perto • ${Math.round(c.aff)} afeição`;
 return `Rota avançada • qualquer escolha pode virar compromisso`;
};

pickScreen=function(){
 updateTop();renderStats();
 const seed=S.day*11+S.slot*3;
 const first=(S.day+S.slot)%5,opts=[KEYS[first],KEYS[(first+2)%5],KEYS[(first+4)%5]];
 const generic=pickDet(GENERIC,seed);setScene(generic[0],null);
 let intro=`${generic[1]}<br><br><b>Tempo livre.</b> Você só consegue se dedicar de verdade a uma pessoa — ou a um lugar — neste período.`;
 if(S.day===1&&S.slot===0)intro=`Último semestre. Quarenta e dois dias até a formatura. Seu plano era simples: terminar o TCC, pegar o diploma e sair vivo.<br><br>Às 08:07, você cruza — sem saber — com cinco desconhecidas que vão bagunçar tudo. Você não sabe o nome de nenhuma delas. Escolha onde gastar sua primeira manhã.`;
 const choices=opts.map(k=>{
  const c=S.chars[k],C=CAST[k];
  if(!c.known){const u=VN_UNKNOWN[k];return {label:u.label,hint:u.hint,go:()=>interaction(k)}}
  return {label:`${C.icon} Procurar ${C.name}`,hint:routeHint(k),go:()=>interaction(k)};
 });
 choices.push({label:"📚 Focar no TCC e na própria vida",hint:"+ confiança; reduz chance de parecer desesperado",go:solo});
 setDialogue("Narrador",intro,choices);S.phase="pick";save(true);
};

function vnFirstMeet(k){
 setScene({morgana:"biblioteca",bianca:"ginasio",yumi:"laboratorio",cecilia:"auditorio",helena:"patio"}[k],k,0);
 setDialogue("???",VN_FIRST_MEETS[k],VN_FIRST_CHOICES[k].map(([label,type])=>({label,hint:"Primeira impressão",go:()=>vnApplyFirst(k,type)})));
 S.phase="first-meet";S.current=k;save(true);
}
function vnApplyFirst(k,type){
 const c=S.chars[k],C=CAST[k];let expr=0,lead="";
 if(type==="sincere"){c.aff+=3;c.trust+=6;S.honesty+=2;expr=1;lead="A resposta tira um pouco da tensão do encontro. ";}
 else if(type==="curious"){c.aff+=4;c.trust+=3;S.confidence+=1;expr=0;lead="Sua curiosidade parece ser melhor recebida do que você esperava. ";}
 else if(type==="tease"){c.aff+=4;c.heat+=4;S.confidence+=2;expr=2;lead="A provocação pega de surpresa — e a reação entrega mais do que ela gostaria. ";}
 else if(type==="bold"){c.aff+=3;c.heat+=5;S.confidence+=3;expr=2;lead="Você responde com coragem suficiente para mudar o clima por alguns segundos. ";}
 c.known=true;c.seen=Math.max(1,c.seen);S.totalChoices=(S.totalChoices||0)+1;
 normalize();vnShowSprite(k,expr);pushLog(`Dia ${S.day}: você conheceu ${C.name}.`);
 setDialogue(C.name,lead+VN_INTRO[k],[{label:"Continuar",go:advance}]);renderStats();save(true);
}

interaction=function(k){
 const C=CAST[k],c=S.chars[k];
 if(!c.known){vnFirstMeet(k);return}
 c.seen++;
 const idx=Math.min(BEATS[k].length-1,Math.floor((c.seen-1)/2)),beat=BEATS[k][idx],loc=beat[0];
 setScene(loc,k,0);
 let base=beat[1]+"<br><br>"+pickDet(FLAVOR[k],S.day*17+S.slot*5+c.seen*13);
 if(c.aff>50)base+=`<br><br>A intimidade entre vocês já é difícil de fingir. ${C.name} percebe quando você hesita e parece esperar que você faça alguma coisa com isso.`;
 if(c.trust>60)base+=`<br><br>Mais importante: ela fala com você de um jeito que não usa com o resto do campus.`;
 const choices=[
  {label:boldLabel(k),hint:"+ tensão • + confiança em si • pode reduzir confiança dela se cedo demais",go:()=>applyChoice(k,"bold")},
  {label:sincereLabel(k),hint:"+ confiança • + afeição • melhor para finais sólidos",go:()=>applyChoice(k,"sincere")},
  {label:teaseLabel(k),hint:"+ afeição • + tensão • depende da química",go:()=>applyChoice(k,"tease")}
 ];
 if(c.aff>=45&&c.trust>=35)choices.push({label:"💋 Parar de fingir que isso é só amizade",hint:"Pode liberar beijo/encontro; exige química suficiente",go:()=>applyChoice(k,"kiss")});
 setDialogue(C.name,base,choices);S.phase="scene";S.current=k;save(true);
};

applyChoice=function(k,type){
 const c=S.chars[k],C=CAST[k];let result="",expr=0;
 if(type==="sincere"){
  c.aff+=5;c.trust+=7;S.honesty+=2;S.confidence+=1;expr=1;
  result=`A resposta acerta um lugar menos teatral. ${C.name} fica quieta por alguns segundos — não desconfortável, só sem a proteção habitual. “Tá… isso foi perigosamente decente da sua parte.”`;
 }else if(type==="tease"){
  c.aff+=6;c.heat+=5;S.confidence+=2;expr=2;
  result=`${C.name} tenta não rir e falha. A provocação volta na mesma intensidade, e a conversa entra naquele território em que cada frase parece ter uma segunda interpretação cuidadosamente não confirmada.`;
 }else if(type==="bold"){
  c.heat+=8;S.confidence+=4;c.aff+=3;
  if(c.trust<22){c.trust-=2;expr=3;result=`A ousadia arranca uma reação, mas você percebe que foi um pouco cedo. ${C.name} desvia o assunto e guarda mentalmente a informação de que você tem coragem demais para o próprio bem.`}
  else{c.trust+=2;expr=2;result=`${C.name} congela por meio segundo, depois reage de um jeito que confirma que a provocação foi recebida exatamente como você queria. “Perigoso. Continua.”`}
 }else if(type==="kiss"){
  if(c.aff>=52&&c.trust>=38){c.kissed=true;c.aff+=8;c.heat+=10;c.trust+=4;S.reputation+=2;expr=2;result=`Você para de procurar uma frase perfeita e simplesmente diminui a distância. ${C.name} entende antes do toque.<br><br>O beijo começa curto, experimental, e termina bem menos inocente. Quando vocês se afastam, ela ainda está perto demais para fingir que foi acidente.`;}
  else{c.trust-=7;c.aff-=4;S.reputation-=2;expr=3;result=`Você tenta avançar, mas o timing não existe. ${C.name} recua um passo. Não vira desastre completo, mas o clima quebra — uma lembrança útil de que química não substitui confiança.`;}
 }
 S.totalChoices=(S.totalChoices||0)+1;normalize();vnShowSprite(k,expr);
 pushLog(`Dia ${S.day}: ${C.name} • ${type==="kiss"?"você tentou transformar tensão em beijo":type==="sincere"?"você escolheu sinceridade":type==="tease"?"vocês trocaram provocações":"você foi ousado"}.`);
 setDialogue(C.name,result,[{label:"Continuar",go:advance}]);renderStats();save(true);
};

solo=function(){
 const pool=(typeof VN_SOLO_SCENES!=="undefined"&&VN_SOLO_SCENES.length)?VN_SOLO_SCENES:[["biblioteca","Você escolhe produtividade e consegue avançar no TCC."]];
 const beat=pool[((S.day-1)*3+S.slot)%pool.length];
 S.confidence=clamp(S.confidence+3);
 S.reputation=Math.max(-20,S.reputation-1);
 S.totalChoices=(S.totalChoices||0)+1;
 pushLog(`Dia ${S.day}: você escolheu cuidar da própria vida.`);
 setScene(beat[0],null);
 setDialogue("Narrador",`${beat[1]}<br><br><b>Resultado:</b> você ganha um pouco de confiança e mantém o semestre sob controle. Nem toda escolha importante precisa virar romance.`,[
  {label:"Continuar",go:advance}
 ]);
 S.phase="scene";renderStats();save(true);
};

const vnBaseRenderStats=renderStats;
renderStats=function(){
 vnBaseRenderStats();
 const body=$("#statsBody");
 if(!body)return;
 const known=KEYS.filter(k=>S.chars[k].known).length;
 const progress=Math.round(((S.day-1)*3+S.slot)/(42*3)*100);
 const summary=document.createElement("div");
 summary.className="campaign-progress";
 summary.innerHTML=`<div><b>Dia ${S.day}/42</b><span>${SLOTS[S.slot]} • ${Math.max(0,Math.min(100,progress))}% da campanha</span></div><div><b>${known}/5</b><span>pessoas conhecidas • ${S.totalChoices||0} escolhas feitas</span></div>`;
 body.prepend(summary);
};
