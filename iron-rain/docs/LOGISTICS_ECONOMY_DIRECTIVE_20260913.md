# IRON RAIN — PHYSICAL LOGISTICS / WAR ECONOMY DIRECTIVE — 2026-09-13

> ORDEM DIRETA DO OWNER. Obrigatório para WORLD WAR, COMBAT AI, materialização, território, logística, missões, veículos, reforços, mapa e backend persistente.

## Regra central

Nada importante aparece magicamente no front. Todo recurso é escasso, possui origem, estoque e rota física. Se algo foi destruído, reconstruído ou enviado, o jogo precisa conseguir responder: **de qual capital/base saiu, qual estoque foi gasto e por qual estrada/rota chegou**.

## Recursos e estoques

Cada capital/base possui estoques próprios, no mínimo:
- materiais;
- munição;
- combustível;
- veículos disponíveis/produzidos;
- capacidade de reforço humano/tropas quando aplicável.

Estoque zero significa indisponibilidade real. IA e jogador usam as mesmas regras. Nenhuma facção ganha tanque, caminhão, soldado, munição ou construção grátis.

## Retaguarda e início da guerra

A maior parte do material inicial deve nascer na retaguarda profunda / começo do mapa de cada facção, não no front. Capitais avançadas começam com estoques limitados conforme sua importância e desenvolvimento.

Fluxo esperado:
retaguarda produtiva -> caminhão/ferrovia futura/rota logística -> depósitos/capitais intermediárias -> capital avançada -> front.

A perda de uma rota deve secar gradualmente a linha avançada em vez de ser apenas um modificador abstrato.

## Estradas físicas entre capitais — NOVA REGRA P0

O mapa estratégico deve possuir uma **malha de estradas visível e canônica** interligando capitais, depósitos, oficinas e acessos ao front. Essa malha não é decoração: é a própria geometria de deslocamento logístico.

Regras obrigatórias:
- toda capital relevante precisa estar ligada à rede por pelo menos uma estrada válida;
- estradas formam um grafo conectado coerente com o território; não desenhar linhas aleatórias atravessando tudo;
- caminhões e tanques usam os mesmos segmentos físicos/estratégicos de estrada, salvo exceções explicitamente modeladas;
- cada estrada possui duas faixas lógicas: **sentido de ida** e **contramão/retorno**, com offset lateral suficiente para os veículos não ocuparem exatamente a mesma linha;
- tráfego deve respeitar o sentido da faixa escolhida; cruzamentos e nós podem reduzir velocidade e organizar prioridade;
- no mapa, as estradas devem ser desenhadas por baixo dos veículos e por cima do terreno, com leitura clara em mobile;
- quando o jogador se aproxima, a representação materializada precisa continuar seguindo a mesma estrada canônica, sem trocar para uma rota visual inventada;
- destruir/capturar um nó crítico pode cortar a rota; a IA deve recalcular caminho usando apenas estradas ainda válidas.

É proibido representar deslocamento como salto de capital A para capital B. O veículo possui posição/progresso de rota persistente entre os dois pontos.

## Caminhões de carga

Caminhões precisam existir como entidades estratégicas/materializáveis:
- partem de um nó com estoque real;
- carregam materiais, munição e/ou combustível;
- viajam por estradas/rotas válidas;
- podem ser desviados, bloqueados, emboscados ou destruídos;
- ao serem destruídos, a carga é perdida;
- somente ao chegar o destino recebe o estoque;
- rotas cortadas param entrega e construção.

A IA deve criar missões/decisões de comboio com base em déficit real, prioridade do front, ameaça da rota e estoque da origem.

### Capacidade do caminhão de carga

Um caminhão de carga pode transportar **uma das duas classes de carga por viagem**:
1. carga logística normal: materiais/munição/combustível dentro da capacidade definida; ou
2. **um único tanque de guerra transportado**.

Quando carregando um tanque:
- o tanque deixa temporariamente o inventário operacional da origem e passa a pertencer ao caminhão como carga;
- o caminhão não pode simultaneamente carregar material genérico em quantidade relevante;
- se o caminhão for destruído, o tanque transportado também é perdido/destruído;
- ao chegar à capital de destino, o tanque é descarregado fisicamente e passa para o estoque/estacionamento daquela capital;
- somente então o tanque pode receber ordem própria para seguir por estrada até staging/front;
- tanque nunca teleporta da oficina ao front.

## Caminhões de tropas / reforços

Reforços não aparecem na trincheira. Soldados devem sair de uma capital/base com capacidade de mobilização/reforço e viajar ao front, preferencialmente em caminhões de transporte.

- caminhão destruído antes da chegada = reforço perdido ou severamente reduzido;
- rota cortada = reforço não chega;
- capital sem capacidade/estoque humano = sem reforço;
- retirada pode devolver sobreviventes a uma capital de retaguarda em vez de apagá-los.

## Oficinas e produção de veículos — P0

A oficina/garagem industrial é o ponto canônico de produção de **caminhões e tanques**, respeitando capacidades da estrutura e progressão tecnológica/industrial existente.

- produzir caminhão consome materiais e tempo;
- produzir tanque consome mais materiais, tempo e capacidade industrial;
- nenhuma produção é gratuita;
- a oficina possui fila/capacidade limitada; produzir um veículo compete por tempo/recursos com outros pedidos;
- se faltar recurso, produção pausa; não deixa estoque negativo;
- se a oficina for destruída, capturada ou desativada, produção para;
- veículos concluídos aparecem fisicamente na capital/oficina e entram no inventário local;
- a IA decide entre fabricar caminhão ou tanque segundo gargalo real: sem caminhões, logística entra em colapso; sem blindados, o front perde capacidade ofensiva.

Nem toda capital precisa começar com oficina capaz de tanque. A infraestrutura pode exigir reconstrução/upgrade conforme `territory-development.js`.

## Tanques e veículos blindados

Tanques destruídos deixam de existir. Um tanque novo só pode surgir em uma capital/base que possua infraestrutura industrial adequada **e** estoque suficiente.

Nem toda capital pode produzir tanques.

Progressão esperada:
1. capital segura/reconstruída;
2. depósito/garagem;
3. infraestrutura industrial/fábrica;
4. instalação específica de blindados / linha de montagem;
5. materiais + combustível + munição disponíveis;
6. tempo de produção;
7. tanque nasce fisicamente naquele local;
8. tanque viaja pelas estradas até staging/front, ou é transportado por um caminhão de carga até outra capital e descarregado antes de seguir por conta própria.

Se a instalação for destruída ou capturada, produção para. Se faltar material, combustível ou munição, fila pausa. Se a rota ao front estiver cortada, o tanque produzido fica retido/reorientado e não teleporta.

## Caminhões também precisam ser produzidos/substituídos

Caminhão não é infinito. Garagens/instalações adequadas devem produzir ou reparar caminhões usando recursos. Perder muitos comboios precisa impactar a capacidade logística da facção até reposição.

## Destruição universal de veículos — P0

**TODO veículo existente no mundo pode ser destruído.** Não existem caminhões, tanques, veículos de apoio ou transporte invulneráveis por conveniência de simulação.

Cada veículo deve ter, no mínimo:
- estado de integridade/HP ou equivalente canônico;
- facção e ownership;
- posição/segmento de estrada atual;
- estado operacional (`idle`, `loading`, `moving`, `unloading`, `disabled`, `destroyed` ou equivalente);
- carga quando aplicável;
- consequência econômica ao ser destruído.

Quando destruído:
- deixa de contribuir para logística/combat imediatamente;
- sua carga é perdida, salvo mecânica futura explícita de recuperação;
- sua remoção precisa refletir no inventário/estoque estratégico;
- pode gerar destroço visual materializado, mas sem manter uma entidade operacional fantasma;
- IA deve reconhecer a perda e replanejar, sem respawn gratuito de substituição.

## Capitais capturadas

Consumir também `CAPITAL_CAPTURE_DIRECTIVE_20260913.md`.

Depois de neutralizar uma capital inimiga:
- ela não fornece nada imediatamente;
- estruturas destruídas podem precisar ser reconstruídas;
- materiais precisam ser entregues fisicamente;
- somente estruturas realmente reconstruídas voltam a habilitar depósito, reparo, recrutamento, produção de caminhões ou blindados;
- uma capital recém-tomada não vira fábrica de tanques instantaneamente.

## IA estratégica obrigatória — UPGRADE GERAL

A mesma IA base deve servir ALIADOS e EIXO e decidir, usando dados reais:
- onde falta material/munição/fuel;
- qual capital merece prioridade de reconstrução;
- quando despachar comboios;
- quando escoltar comboios;
- quando suspender uma rota perigosa;
- quando recalcular caminho por estradas alternativas;
- quando construir depósito/garagem/fábrica/linha de blindados;
- quando produzir caminhão ou tanque;
- para qual capital transportar um tanque antes de enviá-lo ao front;
- para qual front enviar tanque/reforço;
- quando segurar veículo na retaguarda por falta de combustível/supply;
- quando recuar para preservar força;
- quando concentrar comboio para reduzir viagens pequenas;
- quando fracionar comboio porque a rota está sob ameaça;
- quando escoltar um caminhão carregando tanque por ele representar ativo de alto valor;
- quando evitar uma estrada sob ataque mesmo que seja mais curta.

A IA deve escolher produção pela necessidade real e pelo estoque. Não construir todas as estruturas em todas as capitais automaticamente.

### IA de tráfego e navegação

Todo veículo estratégico/materializado deve receber rota como sequência de nós/segmentos, não apenas destino final.

A IA de tráfego deve:
- escolher faixa compatível com o sentido do deslocamento;
- manter espaçamento para não empilhar caminhões no mesmo ponto;
- reduzir velocidade ao se aproximar de outro veículo, cruzamento ou congestionamento;
- evitar colisão frontal usando faixas opostas;
- recalcular se segmento ficar bloqueado/capturado;
- não teleportar para destravar congestionamento;
- se realmente sem rota, estacionar/aguardar/retornar conforme decisão estratégica.

### IA tática e operacional — melhorar o conjunto, não apenas logística

COMBAT AI, tanques, infantaria e logística devem compartilhar contexto de guerra:
- infantaria não deve atacar sem munição/supply suficiente;
- tanques não devem avançar isolados em rota sem apoio quando ameaça conhecida for alta;
- unidades devem reconhecer retirada, cobertura, fogo inimigo, rota de abastecimento e objetivo do setor;
- IA deve preservar ativos caros quando o ataque não é sustentável;
- contra-ataques devem depender de força, moral, blindados, munição e linha logística reais;
- defesa deve priorizar estradas, capitais, oficinas e nós logísticos de alto valor;
- forças podem tentar interceptar comboios inimigos quando houver intel válida;
- decisões precisam ser simétricas entre facções e determinísticas o suficiente para testes.

Não criar um "AI director" paralelo que invente estados. Reutilizar os estados canônicos de `war-simulation`, `strategic-logistics`, `territory-development`, `strategic-capture-state`, `world-map-intel` e rotas do mapa.

## Presença física no mapa

O owner deve conseguir ver a guerra funcionando quando dirigir pelo mundo:
- estradas desenhadas interligando capitais;
- caminhões realmente andando nessas estradas;
- tráfego de ida e retorno em faixas distintas;
- soldados viajando/marchando ou chegando de transporte;
- caminhões levando carga;
- caminhões transportando um tanque na carroceria/carga quando aplicável;
- caminhões de tropas indo para o front;
- tanques saindo de capitais industriais e viajando para staging/front;
- comboios retornando/reorientando;
- veículos destruídos desaparecendo do estado operacional e deixando consequência visível/econômica;
- capitais com atividade coerente com sua função.

Quando distantes do jogador, essas entidades podem usar representação estratégica barata; quando próximas do Mamute, devem materializar visualmente a partir do MESMO estado, sem duplicar simulação.

## Mapa estratégico / intel

`strategic-war-live-v3.js` continua único renderer.

O mapa deve desenhar a rede de estradas canônica. O mapa pode mostrar tráfego aliado conhecido e logística própria. Comboios/tanques inimigos remotos só aparecem com recon/radio/report válido. Não usar a logística como desculpa para omniscience.

## Integração obrigatória

Reutilizar e ampliar, não substituir:
- `strategic-logistics.js` para rotas/estradas/convoys/estoque transferível/progresso de viagem;
- `territory-development.js` para estruturas, custos e produção de caminhões/tanques;
- `territory-ai.js` para decisões simétricas de construção/necessidade/produção;
- `theatre-sectors.js` / `strategic-hex-map.js` para capitais/setores e nós da malha viária;
- `war-simulation.js` / `war-simulation-core.js` para presença/combat AI;
- `combat-reserves.js` para reforços sem spawn mágico;
- `world-map-intel.js` para visibilidade;
- `strategic-war-live-v3.js` para visualização de estradas e tráfego;
- backend persistente quando disponível para authority global.

## Gates

- preservar boot atual funcional;
- zero spawn mágico de tanque/caminhão/reforço regular no front;
- zero teleporte de caminhão/tanque entre capitais;
- toda viagem logística possui rota, progresso e tempo real de deslocamento;
- estradas canônicas visíveis e usadas pela simulação;
- tráfego usa ida/contramão em faixas separadas;
- zero construção/produção sem estoque/material gasto;
- caminhão e tanque custam recursos e tempo de oficina;
- caminhão carregando tanque transporta no máximo um tanque e a perda do caminhão destrói/perde a carga;
- TODOS os veículos podem ser destruídos;
- zero entrega sem viagem física/estratégica pela rota;
- destruição de veículo/convoy precisa causar perda econômica real;
- IA deve replanejar perdas, rotas e produção sem criar recursos grátis;
- não criar segunda economia, segunda logística, segunda malha de estradas ou segunda IA paralela;
- antes de editar hotspot, refetch HEAD e preservar trabalho concorrente;
- registrar consumo desta diretiva no `AGENT_LOG.md`.