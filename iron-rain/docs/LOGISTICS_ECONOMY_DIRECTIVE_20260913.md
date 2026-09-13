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

## Caminhões de tropas / reforços

Reforços não aparecem na trincheira. Soldados devem sair de uma capital/base com capacidade de mobilização/reforço e viajar ao front, preferencialmente em caminhões de transporte.

- caminhão destruído antes da chegada = reforço perdido ou severamente reduzido;
- rota cortada = reforço não chega;
- capital sem capacidade/estoque humano = sem reforço;
- retirada pode devolver sobreviventes a uma capital de retaguarda em vez de apagá-los.

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
8. tanque viaja pelas estradas até staging/front.

Se a instalação for destruída ou capturada, produção para. Se faltar material, combustível ou munição, fila pausa. Se a rota ao front estiver cortada, o tanque produzido fica retido/reorientado e não teleporta.

## Caminhões também precisam ser produzidos/substituídos

Caminhão não é infinito. Garagens/instalações adequadas devem produzir ou reparar caminhões usando recursos. Perder muitos comboios precisa impactar a capacidade logística da facção até reposição.

## Capitais capturadas

Consumir também `CAPITAL_CAPTURE_DIRECTIVE_20260913.md`.

Depois de neutralizar uma capital inimiga:
- ela não fornece nada imediatamente;
- estruturas destruídas podem precisar ser reconstruídas;
- materiais precisam ser entregues fisicamente;
- somente estruturas realmente reconstruídas voltam a habilitar depósito, reparo, recrutamento, produção de caminhões ou blindados;
- uma capital recém-tomada não vira fábrica de tanques instantaneamente.

## IA estratégica obrigatória

A mesma IA base deve servir ALIADOS e EIXO e decidir, usando dados reais:
- onde falta material/munição/fuel;
- qual capital merece prioridade de reconstrução;
- quando despachar comboios;
- quando escoltar comboios;
- quando suspender rota perigosa;
- quando construir depósito/garagem/fábrica/linha de blindados;
- quando produzir caminhão ou tanque;
- para qual front enviar tanque/reforço;
- quando segurar veículo na retaguarda por falta de combustível/supply;
- quando recuar para preservar força.

A IA deve escolher produção pela necessidade real e pelo estoque. Não construir todas as estruturas em todas as capitais automaticamente.

## Presença física no mapa

O owner deve conseguir ver a guerra funcionando quando dirigir pelo mundo:
- soldados viajando/marchando ou chegando de transporte;
- caminhões levando carga;
- caminhões de tropas indo para o front;
- tanques saindo de capitais industriais e viajando para staging/front;
- comboios retornando/reorientando;
- capitais com atividade coerente com sua função.

Quando distantes do jogador, essas entidades podem usar representação estratégica barata; quando próximas do Mamute, devem materializar visualmente a partir do MESMO estado, sem duplicar simulação.

## Mapa estratégico / intel

`strategic-war-live-v3.js` continua único renderer.

O mapa pode mostrar tráfego aliado conhecido e logística própria. Comboios/tanques inimigos remotos só aparecem com recon/radio/report válido. Não usar a logística como desculpa para omniscience.

## Integração obrigatória

Reutilizar e ampliar, não substituir:
- `strategic-logistics.js` para rotas/convoys/estoque transferível;
- `territory-development.js` para estruturas, custos e produção;
- `territory-ai.js` para decisões simétricas de construção/necessidade;
- `theatre-sectors.js` / `strategic-hex-map.js` para capitais/setores;
- `war-simulation.js` / `war-simulation-core.js` para presença/combat AI;
- `combat-reserves.js` para reforços sem spawn mágico;
- `world-map-intel.js` para visibilidade;
- `strategic-war-live-v3.js` para visualização;
- backend persistente quando disponível para authority global.

## Gates

- preservar boot atual funcional;
- zero spawn mágico de tanque/caminhão/reforço regular no front;
- zero construção sem estoque/material entregue;
- zero entrega sem viagem física/estratégica pela rota;
- destruição de veículo/convoy precisa causar perda econômica real;
- não criar segunda economia, segunda logística ou segunda IA paralela;
- antes de editar hotspot, refetch HEAD e preservar trabalho concorrente;
- registrar consumo desta diretiva no `AGENT_LOG.md`.