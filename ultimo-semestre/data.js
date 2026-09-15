const $=q=>document.querySelector(q);
const SAVE="ultimoSemestre18_save_v2";

const CAST={
 morgana:{name:"Morgana",full:"Morgana Vale",age:123,icon:"🦇",color:"#73527e",arche:"Gótica vampira",bg:"radial-gradient(circle at 72% 22%,rgba(132,76,152,.48),transparent 33%),linear-gradient(158deg,#211227,#09090e 72%)"},
 bianca:{name:"Bianca",full:"Bianca Rocha",age:22,icon:"🏐",color:"#d88648",arche:"Atleta solar",bg:"radial-gradient(circle at 70% 20%,rgba(247,165,82,.48),transparent 34%),linear-gradient(158deg,#283747,#0b1017 72%)"},
 yumi:{name:"Yumi",full:"Yumi Aoki",age:21,icon:"💻",color:"#4f8ebd",arche:"Otaku hacker",bg:"radial-gradient(circle at 72% 20%,rgba(76,145,203,.45),transparent 32%),linear-gradient(158deg,#102334,#080b10 72%)"},
 cecilia:{name:"Cecília",full:"Cecília Luz",age:23,icon:"🎭",color:"#c94f7a",arche:"Gyaru do teatro",bg:"radial-gradient(circle at 72% 20%,rgba(226,80,137,.46),transparent 32%),linear-gradient(158deg,#30131f,#0d090d 72%)"},
 helena:{name:"Helena",full:"Helena Prado",age:24,icon:"👑",color:"#8e7acb",arche:"Presidente perfeita",bg:"radial-gradient(circle at 72% 20%,rgba(158,132,222,.46),transparent 34%),linear-gradient(158deg,#1d1831,#090912 72%)"}
};
const KEYS=Object.keys(CAST);
const SLOTS=["Manhã","Tarde","Noite"];

const LOCS={
 patio:["Pátio Central","linear-gradient(158deg,#283b48,#111920 68%,#080a0d)"],
 biblioteca:["Biblioteca","linear-gradient(158deg,#3b302c,#171212 68%,#09080a)"],
 cantina:["Cantina","linear-gradient(158deg,#3b3022,#17120d 68%,#090807)"],
 laboratorio:["Laboratório 404","linear-gradient(158deg,#15323d,#0b181d 68%,#07090b)"],
 ginasio:["Ginásio","linear-gradient(158deg,#443829,#1b160f 68%,#09090a)"],
 auditorio:["Auditório","linear-gradient(158deg,#381724,#170a11 68%,#080609)"],
 jardim:["Jardim Noturno","linear-gradient(158deg,#152a23,#09110e 68%,#050708)"],
 terraco:["Terraço","linear-gradient(158deg,#1a213b,#0b0f1b 68%,#06070a)"],
 rua:["Rua da Faculdade","linear-gradient(158deg,#2e3540,#14181e 68%,#08090b)"],
 festa:["Festa Universitária","linear-gradient(158deg,#46183b,#181023 68%,#08070b)"],
 apartamento:["Apartamento do Protagonista","linear-gradient(158deg,#2c2533,#121016 68%,#08080b)"]
};

const BEATS={
morgana:[
 ["biblioteca","Você a encontra escondida atrás de uma pilha de livros sobre folclore balcânico. Quando pergunta se aquilo é pesquisa, Morgana fecha o volume com força demais. “É checagem de fatos. Humanos inventam cada absurdo sobre nós.”"],
 ["cantina","Morgana examina o cardápio da cantina como se fosse uma ameaça. “Suco de tomate é ofensivo. Não pela piada. Pelo gosto.” Ela empurra seu café para você e tira da bolsa uma garrafa térmica discretamente vermelha."],
 ["auditorio","Um professor afirma que vampiros são metáforas para desejo reprimido. Morgana vira o rosto para você e sussurra: “Tenho cento e vinte e três anos e finalmente descobri que eu sou uma figura de linguagem.”"],
 ["jardim","Na sombra do jardim ela parece menos cansada. Morgana confessa que odeia manhãs não por estética, mas porque luz forte realmente dói. A piada fica menor quando ela admite que viver assim é cansativo."],
 ["biblioteca","Você acha um cartão de empréstimo de 1918 com a assinatura 'M. Vale'. Ela arranca o papel da sua mão. “Falsificação vintage.” A mentira seria melhor se a caligrafia não fosse exatamente a dela."],
 ["terraco","Morgana finalmente diz a idade sem rir: 123. Depois acrescenta: “E se você me chamar de senhora, eu te jogo daqui. Você sobreviveria. Provavelmente.”"],
 ["rua","Um flash de celular pega Morgana em cheio. Ela vacila, segura seu braço e reclama entre os dentes. Pela primeira vez, não transforma o contato em sarcasmo."],
 ["jardim","Ela admite que evita se apaixonar por humanos porque já sabe o final estatístico. “Vocês envelhecem. Eu fico. Péssimo modelo de negócio.”"],
 ["apartamento","Morgana aparece à sua porta depois da meia-noite com um sobretudo preto e uma expressão que tenta ser indiferente. “Eu precisava conversar. E seu prédio tem cortinas aceitáveis.”"],
 ["terraco","Ela encosta a testa na sua e murmura que confiar em alguém depois de um século é mais assustador que qualquer caçador de monstros. O resto da noite pode ser íntimo, se você deixar, mas a porta se fecha antes que a história precise explicar detalhes."]
],
bianca:[
 ["ginasio","Bianca está treinando saques sozinha. Ela erra um, vê você e imediatamente culpa sua presença. “Você bagunçou minha aerodinâmica. Isso é ciência.”"],
 ["cantina","Ela rouba uma batata do seu prato, oferece metade como reparação e chama isso de tratado de paz. Cinco minutos depois já está contando detalhes demais sobre o vestiário e percebe tarde demais."],
 ["ginasio","Bianca pede que você segure o cronômetro. Quando termina, se joga no banco ao seu lado, ofegante e feliz. “Você me dá sorte. Ou eu sou incrível. Vamos dizer cinquenta-cinquenta.”"],
 ["rua","Chove na saída. Bianca insiste em dividir um guarda-chuva pequeno demais e ri cada vez que o ombro de vocês bate. “Isso aqui parece cena barata de romance. Falta a trilha sonora.”"],
 ["ginasio","Ela torce o tornozelo de leve e odeia precisar de ajuda. Quando você a acompanha até a enfermaria, Bianca fica estranhamente quieta e agradece sem piada."],
 ["festa","Bianca dança como se ninguém estivesse olhando, apesar de absolutamente todo mundo estar. Quando te puxa pela mão, deixa claro que sua dignidade não foi convidada."],
 ["patio","Ela admite que recebeu proposta de um time em outra cidade. O sorriso continua lá, mas a ideia de ir embora depois da formatura pesa."],
 ["ginasio","Depois de uma vitória importante, Bianca te abraça forte demais e só percebe a proximidade quando já é tarde. “É… comemoração esportiva. Muito regulamentar.”"],
 ["rua","Vocês ficam sentados na calçada com refrigerante barato. Bianca diz que todo mundo acha que ela é simples porque está sempre sorrindo. “É mais fácil ser a pessoa solar do que explicar quando eu tô com medo.”"],
 ["apartamento","Ela chega depois do treino, toma banho no seu apartamento porque o prédio dela está sem água e sai usando sua camiseta enorme. “Para de olhar assim. Ou olha direito.” A cena pode esquentar, mas o jogo fecha a cortina na hora certa."]
],
yumi:[
 ["laboratorio","Yumi está cercada por três monitores, dois energéticos e zero paciência. Sem tirar os olhos da tela, pergunta: “Você veio ajudar ou ser um NPC decorativo?”"],
 ["cantina","Ela vê o chaveiro de anime na sua mochila e imediatamente muda de personalidade. “Esse arco é objetivamente o melhor. Quem discorda não entende escrita.”"],
 ["laboratorio","Yumi te desafia num jogo de luta. Depois de ganhar por pouco, ela empurra o controle para você. “Melhor de nove. Estatisticamente você pode deixar de ser ruim.”"],
 ["biblioteca","Vocês estudam lado a lado em silêncio confortável. Yumi manda uma mensagem para você apesar de estar a menos de um metro: 'falar em voz alta custa energia social'. Depois envia um sticker obsceno e finge que não foi ela."],
 ["laboratorio","O projeto dela quebra minutos antes de uma apresentação. Você ajuda a rastrear o bug e Yumi, contra todos os protocolos, te abraça. Dois segundos depois te solta como se tivesse cometido um erro de compilação."],
 ["festa","Yumi aparece numa festa usando cosplay casual de uma personagem que você reconhece. “Se você falar o nome em voz alta, eu nego tudo.” Ela claramente esperava que você reconhecesse."],
 ["terraco","Ela admite que online consegue ser qualquer pessoa; presencialmente odeia não ter tempo para editar a própria resposta. “Com você, estranhamente, eu erro em tempo real e continuo viva.”"],
 ["laboratorio","Yumi revela que recebeu uma proposta de emprego no exterior. Ela diz que é óbvio aceitar. O fato de repetir 'óbvio' quatro vezes sugere o contrário."],
 ["apartamento","Noite de jogos. Yumi perde uma aposta e precisa usar uma cantada escolhida por você. Ela fica vermelha, encara a tela e diz: “Eu prefiro formatar meu HD.”"],
 ["apartamento","Depois de uma maratona de anime, ela adormece no seu ombro e acorda às três da manhã. Entre uma provocação e outra, admite que gostaria de ficar. O jogo pula discretamente para o café da manhã."]
],
cecilia:[
 ["auditorio","Cecília ensaia sozinha e transforma sua entrada no auditório em improviso. “Finalmente! Meu interesse romântico chegou no terceiro ato.” Ela faz uma reverência e não explica se está brincando."],
 ["cantina","Ela sabe quem terminou com quem, quem colou na prova e quem está secretamente ficando. “Fofoca é só sociologia com melhores personagens.”"],
 ["auditorio","Cecília te escala para ler falas de uma cena romântica. Ela chega perto demais porque 'o bloqueio de palco exige verdade'. O texto certamente não exigia tanto contato visual."],
 ["festa","Ela surge brilhando em roupa de festa e aponta para você: “Você. Dança. Sem recurso de apelação.” Quando você protesta, ela declara que timidez é uma infração administrativa."],
 ["patio","Cecília deixa escapar que a família considera teatro perda de tempo. Ela faz uma piada logo depois, mas os olhos não acompanham."],
 ["auditorio","O papel principal adoece e ela precisa assumir a peça. Cecília pede ajuda para ensaiar até tarde. O caos vira concentração absoluta quando as cortinas fecham."],
 ["rua","Depois da apresentação, ela tira os saltos e anda descalça segurando-os pela alça. “A glamourização termina exatamente onde começa a bolha no pé.”"],
 ["terraco","Cecília admite que flerta com todo mundo porque é fácil controlar a cena quando ninguém sabe quando você está falando sério. “Com você tá ficando irritantemente difícil.”"],
 ["apartamento","Ela aparece para ajudar no seu TCC e transforma sua sala em camarim improvisado. Entre notas, ela experimenta sua camisa social e pergunta se 'funciona melhor fechada ou perigosamente aberta'."],
 ["auditorio","Na noite final da peça, Cecília te beija nos bastidores se você der espaço. Depois sorri contra sua boca e sussurra: “Finalmente uma cena que não precisava ensaiar.” O resto fica fora de quadro."]
],
helena:[
 ["patio","Helena está organizando três eventos ao mesmo tempo e corrigindo um orçamento pelo celular. “Se veio reclamar, pegue uma senha. Se veio ajudar, eu talvez lembre seu nome.”"],
 ["biblioteca","Você descobre Helena estudando sozinha, de óculos, cercada de café e sem a postura presidencial. Ela fecha um caderno pessoal rápido demais. “Você não viu nada.”"],
 ["cantina","Helena te convida para uma mesa reservada em nome de 'assuntos do diretório'. O assunto dura oito minutos. O café dura uma hora e vinte."],
 ["patio","Um patrocinador trata Helena como se ela fosse apenas sobrenome e aparência. Você vê o sorriso político dela funcionar perfeitamente enquanto os dedos apertam a caneta com força."],
 ["rua","O carro de Helena não liga. Ela poderia chamar um motorista; decide andar com você. “Não faça disso um símbolo de luta de classes.” Cinco minutos depois está rindo de uma barraca de cachorro-quente."],
 ["festa","Helena aparece impecável e é imediatamente cercada por gente importante. Quando consegue escapar, te encontra perto da cozinha e pergunta se vocês podem fingir que são pessoas normais por vinte minutos."],
 ["biblioteca","Ela admite que o futuro inteiro já está planejado pela família: empresa, pós, cidade, apartamento. “É curioso ter tantas opções e nenhuma escolha.”"],
 ["terraco","Helena tira os sapatos, senta no chão e diz que ninguém pode saber. “Tenho uma reputação para manter.” A presidente perfeita passa meia hora reclamando de planilhas."],
 ["apartamento","Ela visita seu apartamento e observa tudo com curiosidade quase infantil, como se fosse um universo estrangeiro. Depois ri de si mesma. “Eu tenho uma adega climatizada e estou fascinada por sua sanduicheira.”"],
 ["festa","Na gala de formatura, Helena decide não obedecer ao roteiro da família. Se você conquistou a confiança dela, a primeira coisa não planejada da noite é te puxar pela gravata para um beijo."]
]
};

const FLAVOR={
morgana:[
 "Ela cruza as pernas e te olha por cima do livro. “Você sempre é tão curioso ou eu tenho o privilégio?”",
 "“Não confunda meu interesse com doçura. Eu ainda posso morder.” A pausa seguinte deixa claro que a frase foi escolhida com cuidado.",
 "Morgana chega perto o suficiente para você sentir o perfume frio de jasmim. “Sua frequência cardíaca é incrivelmente inconveniente.”"
],
bianca:[
 "Bianca encosta o ombro no seu e sorri como quem acabou de inventar uma péssima ideia. “Topa ou arregou?”",
 "“Eu devia parar de falar tudo que penso perto de você.” Ela pensa um segundo. “Não vou.”",
 "Ela prende o cabelo num rabo de cavalo e percebe seu olhar. “Ei. Olho no olho, campeão.” O sorriso contradiz a bronca."
],
yumi:[
 "Yumi ajeita os óculos e desvia o olhar. “Seu buff de charme devia ser nerfado. Tá quebrando meu foco.”",
 "Ela mostra o celular: um meme indecente sobre programadores. “Pesquisa acadêmica.”",
 "“Se você continuar olhando assim eu vou… fechar o notebook.” Ela parece decepcionada com a própria ameaça."
],
cecilia:[
 "Cecília gira uma mecha do cabelo e sorri. “Você fica fofo tentando descobrir quando eu tô falando sério.”",
 "“Química de palco”, ela diz. “Ou química normal. A banca ainda está deliberando.”",
 "Ela se aproxima só para ajeitar sua gola. “Pronto. Agora parece protagonista em vez de figurante gostoso.”"
],
helena:[
 "Helena ergue uma sobrancelha. “Não fique convencido. Eu tolero pouquíssimas pessoas e você apenas subiu de categoria.”",
 "Ela ajeita sua gravata com precisão cirúrgica. “Você é um desastre visual.” A mão demora um segundo a mais do que precisava.",
 "“Existe uma diferença entre confiança e atrevimento.” Ela sorri. “Continue. Quero descobrir onde está.”"
]
};

const GENERIC=[
 ["patio","A universidade parece viver em velocidade dupla: gente correndo para prova e gente sentada no chão fingindo que o semestre não está acabando."],
 ["cantina","A cantina está lotada. Cheiro de café, salgado e decisões financeiras ruins. Seu celular vibra com mensagens demais."],
 ["biblioteca","Na biblioteca, o silêncio só é quebrado por páginas virando e alguém digitando como se o teclado tivesse ofendido sua família."],
 ["rua","A saída da faculdade mistura buzinas, vendedores e grupos decidindo para onde ir antes de inevitavelmente acabarem no mesmo bar barato."],
 ["terraco","O terraço é o raro lugar onde o campus parece distante. Daqui, as preocupações parecem menores. Só parecem."]
];

const MILESTONES={
7:{title:"Festa de Integração",loc:"festa",text:"A primeira grande festa do semestre coloca todo mundo no mesmo espaço. Isso seria normal se cinco mulheres com níveis variados de interesse em você não estivessem comparando notas mentais.",choice:true},
14:{title:"Semana do Caos",loc:"patio",text:"Provas, TCC, treino, ensaio, eleição, projeto. Todo mundo está no limite. É a semana em que romance deixa de ser só flerte e começa a exigir aparecer quando é inconveniente.",choice:true},
21:{title:"A Reunião",loc:"cantina",text:"Cecília, que deveria ser proibida de organizar qualquer coisa, convidou as cinco para a mesma mesa. Em menos de três minutos fica evidente que todas sabem mais sobre sua vida amorosa do que você gostaria.",choice:true},
28:{title:"Viagem Acadêmica",loc:"rua",text:"Uma viagem de fim de semana da universidade mistura hotel, ônibus, palestras inúteis e proximidade perigosa. Você percebe que suas escolhas estão começando a formar uma reputação.",choice:true},
35:{title:"Noite de Formandos",loc:"festa",text:"Faltam sete dias. A universidade organiza uma noite informal para os formandos. O clima é de despedida, coragem líquida e confissões que estavam atrasadas.",choice:true},
41:{title:"Véspera",loc:"terraco",text:"Amanhã é a formatura. Não existe mais 'depois eu resolvo'. Qualquer rota que você queira precisa ser encarada agora.",choice:true}
};
