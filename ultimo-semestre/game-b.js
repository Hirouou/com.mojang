function milestone(day){
 const m=MILESTONES[day];S.flags["ms"+day]=true;setScene(m.loc);
 if(day===21){
  const suspicion=KEYS.filter(k=>S.chars[k].aff>=32).length;
  let t=m.text+`<br><br>${suspicion>=3?`O silêncio dura quando Cecília pergunta: “Então… só por logística: quantas pessoas nessa mesa acham que estão saindo com ${S.name}?” Excelente pergunta.`:`Por sorte, sua vida amorosa ainda não atingiu massa crítica. A reunião termina em provocações, mas sem tribunal.`}`;
  const cs=[
   {label:"“Eu não quero mentir pra ninguém. Se isso ficar sério, eu converso com todas.”",hint:"Abre a possibilidade da rota secreta consensual",go:()=>{S.polyOpen=true;S.polyTalk=true;S.honesty+=10;KEYS.forEach(k=>S.chars[k].trust+=4);milestoneResult("Você escolhe a resposta mais difícil: honestidade. Ninguém aplaude, mas ninguém levanta da mesa. Morgana chama isso de 'surpreendentemente adulto'. Helena exige que, se um dia isso virar algo real, nenhuma pessoa seja tratada como segredo. Você concorda.")}},
   {label:"“Calma, gente. É só flerte.”",hint:"Mantém rotas individuais; reduz tensão do grupo",go:()=>{S.polyOpen=false;S.honesty+=2;S.reputation-=1;milestoneResult("Você reduz a temperatura da conversa. Algumas acreditam, outras claramente anotam a resposta para uso futuro. A vida segue, mas a porta para uma relação conjunta começa a fechar.")}},
   {label:"Fazer piada e mudar de assunto",hint:"Arriscado • parece fuga",go:()=>{S.honesty-=7;KEYS.forEach(k=>S.chars[k].trust-=3);milestoneResult("A piada morre no centro da mesa. Yumi olha para você como se tivesse acabado de detectar um erro crítico. Você escapa do assunto, mas não do custo.")}}
  ];setDialogue("Cecília",t,cs);
 } else if(day===41){
   preFinalTalk(m);
 } else {
  let choices=[
   {label:"Ficar com quem parece precisar mais de você",hint:"+ confiança para sua maior rota",go:()=>milestoneSupport(day)},
   {label:"Aparecer, ajudar e não tentar transformar tudo em flerte",hint:"+ honestidade • + confiança geral",go:()=>{S.honesty+=5;KEYS.forEach(k=>S.chars[k].trust+=2);milestoneResult("Você passa a noite sendo útil sem cobrar romance em troca. Estranhamente, isso funciona melhor do que qualquer cantada. Quando chega em casa, há mensagens das cinco — cada uma agradecendo de um jeito completamente diferente.")}},
   {label:"Ser o centro da festa",hint:"+ confiança em si • + tensão, mas pode gerar ciúme",go:()=>{S.confidence+=7;S.reputation+=4;KEYS.forEach(k=>{S.chars[k].heat+=3;if(S.chars[k].aff>35)S.chars[k].trust-=1});milestoneResult("Você vira parte da história da noite. Risadas, dança, provocações. Funciona — até funcionar demais. Algumas olhadas atravessadas lembram que atenção é um recurso político.")}}
  ];
  setDialogue("Narrador",`<b>${m.title}</b><br><br>${m.text}`,choices);
 }
 S.phase="milestone";normalize();save(true)
}
function milestoneSupport(day){
 let best=KEYS.slice().sort((a,b)=>(S.chars[b].aff+S.chars[b].trust)-(S.chars[a].aff+S.chars[a].trust))[0];
 let c=S.chars[best],C=CAST[best];c.trust+=8;c.aff+=5;
 milestoneResult(`Você procura ${C.name}. Não faz discurso, não tenta parecer herói. Só aparece. Horas depois, quando o problema diminui, ela encosta em você e diz: “Você tem uma mania irritante de estar aqui quando importa.”`);
}
function milestoneResult(t){normalize();setDialogue("Narrador",t,[{label:"Continuar",go:()=>{S.day++;S.slot=0;if(S.day>42)finish();else pickScreen()}}]);renderStats();save(true)}

function preFinalTalk(m){
 const viable=KEYS.filter(k=>S.chars[k].aff>=55&&S.chars[k].trust>=45);
 let text=`<b>${m.title}</b><br><br>${m.text}<br><br>`;
 if(viable.length===0) text+="Você percebe que flertou muito e construiu pouco. Ainda dá para terminar o semestre com dignidade — talvez.";
 else text+=`As rotas realmente possíveis agora: <b>${viable.map(k=>CAST[k].name).join(", ")}</b>.`;
 const cs=viable.map(k=>({label:`❤️ Conversar seriamente com ${CAST[k].name}`,hint:"Aponta para um final individual",go:()=>commitOne(k)}));
 if(S.polyOpen&&viable.length>=4)cs.push({label:"🔥 Chamar todas para a conversa que ninguém normal teria coragem de marcar",hint:"Rota secreta • requer confiança alta e honestidade",go:polyFinalCheck});
 cs.push({label:"🎓 Não prometer nada antes da formatura",hint:"Final independente",go:()=>{S.flags.independent=true;milestoneResult("Você decide não forçar uma definição. Pela primeira vez no semestre, deixa o futuro esperar vinte e quatro horas.")}});
 setDialogue("Narrador",text,cs);S.phase="milestone";save(true)
}
function commitOne(k){
 KEYS.forEach(x=>S.chars[x].commit=false);S.chars[k].commit=true;const C=CAST[k],c=S.chars[k];
 c.trust+=8;c.aff+=8;
 milestoneResult(`Você procura ${C.name} e, sem piada ou estratégia, diz que quer tentar de verdade depois da formatura. Ela deixa você terminar — milagre estatístico — e responde do jeito dela. O importante é o mesmo: “Sim.”`);
}
function polyFinalCheck(){
 const strong=KEYS.filter(k=>S.chars[k].aff>=62&&S.chars[k].trust>=56);
 const avgTrust=KEYS.reduce((a,k)=>a+S.chars[k].trust,0)/5;
 if(strong.length===5&&S.honesty>=45&&avgTrust>=60){
  S.flags.polySuccess=true;KEYS.forEach(k=>S.chars[k].commit=true);
  milestoneResult(`A conversa dura três horas e é, sem exagero, mais difícil que qualquer prova do curso.<br><br>Helena estabelece limites. Yumi exige comunicação objetiva. Bianca pergunta se pode existir calendário compartilhado. Cecília chama de “temporada dois”. Morgana observa tudo em silêncio antes de dizer: “Eu vivi mais de um século e ainda assim isso é novidade.”<br><br>Ninguém concorda por impulso. Vocês negociam, perguntam, discordam e, no fim, decidem tentar — juntos, conscientemente, sem segredos.`);
 }else{
  S.flags.polyFail=true;S.honesty+=2;
  milestoneResult(`Você tenta abrir a conversa, mas a fundação ainda não aguenta o peso. Algumas têm confiança, outras ainda veem competição. Para sua surpresa, ninguém te destrói — principalmente porque você foi honesto antes. A rota conjunta fecha, mas algumas relações individuais ainda podem sobreviver.`);
 }
}

function finish(){
 normalize();save(true);
 let title="",text="",badges=[];
 const committed=KEYS.filter(k=>S.chars[k].commit);
 if(S.flags.polySuccess){
  title="FINAL: CINCO CORAÇÕES, ZERO SEGREDOS";
  text=`Na formatura, a foto que mais circula não é a do diploma. É a de você cercado por cinco mulheres que, contra toda probabilidade, decidiram que essa ideia absurda merecia uma tentativa.<br><br>
  Bianca cria um calendário compartilhado. Helena cria regras melhores. Yumi automatiza o calendário sem permissão. Cecília transforma qualquer discussão em reunião temática. Morgana se recusa a usar o termo “harém” e ameaça morder quem insistir.<br><br>
  O futuro não é simples, nem garantido. Mas é consensual, estranhamente funcional e absolutamente inesquecível.`;
  badges=["🦇 Morgana","🏐 Bianca","💻 Yumi","🎭 Cecília","👑 Helena","🔥 Final secreto"];
 }else if(committed.length===1){
  const k=committed[0],C=CAST[k],c=S.chars[k];
  title=`FINAL: ${C.name.toUpperCase()}`;
  text=individualEnding(k,c);
  badges=[`${C.icon} ${C.full}`,`❤️ Afeição ${Math.round(c.aff)}`,`🤝 Confiança ${Math.round(c.trust)}`];
 }else{
  const best=KEYS.slice().sort((a,b)=>(S.chars[b].aff+S.chars[b].trust)-(S.chars[a].aff+S.chars[a].trust))[0],c=S.chars[best],C=CAST[best];
  if(c.aff>=68&&c.trust>=55&&!S.flags.independent){
   title=`FINAL SURPRESA: ${C.name.toUpperCase()}`;
   text=`Você chega à cerimônia achando que deixou tudo indefinido. ${C.name} aparentemente discorda. Depois da entrega dos diplomas, ela te puxa para longe do grupo e resume semanas de tensão em uma pergunta: “Você vai continuar me fazendo perder tempo ou vai me chamar para sair direito?”<br><br>Você escolhe a segunda opção.`;
   badges=[`${C.icon} Rota espontânea`,`🎓 Formado`,`✨ Química acumulada`];
  }else{
   title="FINAL: DIPLOMA ANTES DO DRAMA";
   text=`Você se forma sem namoro oficial. Isso não significa que o semestre foi vazio: você fez amizades, provocou pequenos desastres sociais e aprendeu que flerte sem confiança raramente vira alguma coisa duradoura.<br><br>Na saída, seu celular recebe cinco notificações quase ao mesmo tempo. Talvez o pós-créditos ainda tenha trabalho para você.`;
   badges=["🎓 Formado","🧠 Sobreviveu ao TCC","📱 5 notificações"];
  }
 }
 $("#endTitle").textContent=title;$("#endText").innerHTML=text;$("#endBadges").innerHTML=badges.map(b=>`<span class="badge">${b}</span>`).join("");show("#ending");
}
function individualEnding(k,c){
 const t={
 morgana:`Morgana assiste à cerimônia escondida da luz sob um guarda-sol preto absurdamente elegante. Quando vocês ficam sozinhos, ela admite que ainda odeia a matemática de amar alguém mortal. “Mas eu passei um século evitando coisas por saber como terminam. Cansei.”<br><br>Vocês começam devagar. Encontros noturnos, bibliotecas vazias e a regra absoluta de nunca comprar alho para a cozinha dela — não porque faça mal, mas porque ela odeia o cheiro.`,
 bianca:`Bianca recebe o diploma e, dez minutos depois, já está falando sobre a mudança para o novo time. Desta vez, porém, o plano inclui você na conversa. Não como sacrifício, mas como parceria.<br><br>Ela te beija no estacionamento e anuncia: “Namoro à distância é treino de resistência. Eu literalmente tenho vantagem competitiva.”`,
 yumi:`Yumi aceita a proposta no exterior, mas recusa transformar isso em final triste. Vocês passam a noite montando um plano com horários, chamadas e uma quantidade ofensiva de planilhas.<br><br>Antes do embarque, ela te dá um chaveiro de personagem e diz: “Não é romântico. É um token de autenticação.” É extremamente romântico.`,
 cecilia:`Cecília termina a formatura fazendo o que faz melhor: roubando a cena. No palco, improvisa uma frase que definitivamente não estava no roteiro e olha diretamente para você.<br><br>Depois, nos bastidores, diz que quer parar de atuar quando o assunto é vocês dois. O beijo seguinte não recebe aplauso porque, pela primeira vez, ela fechou a porta.`,
 helena:`Helena abandona parte do roteiro planejado pela família e aceita uma pós que ela realmente escolheu. A decisão gera caos suficiente para ocupar três reuniões e um jantar terrível.<br><br>Na festa, ela arruma sua gravata, sorri e avisa: “Não pense que você me ensinou rebeldia.” Você pergunta quem ensinou. Ela te beija em vez de responder.`
 };
 return t[k];
}

$("#newGame").onclick=()=>{S=fresh($("#playerName").value.trim()||"Você");show("#game");pickScreen()};
$("#continueBtn").onclick=()=>{const x=load();if(!x){alert("Nenhum save encontrado.");return}S=x;show("#game");pickScreen()};
$("#statsBtn").onclick=()=>{$("#panel").classList.toggle("open");renderStats()};
$("#saveBtn").onclick=()=>{save();renderStats()};
$("#restartBtn").onclick=()=>{if(confirm("Apagar o save atual e recomeçar?")){localStorage.removeItem(SAVE);location.reload()}};
$("#soundBtn").onclick=()=>{if(!S)return;S.sound=!S.sound;$("#soundBtn").textContent=S.sound?"♫":"×";save(true)};
window.addEventListener("keydown",e=>{if(e.key==="Escape")$("#panel").classList.remove("open")});
$("#continueBtn").style.display=load()?"inline-block":"none";
