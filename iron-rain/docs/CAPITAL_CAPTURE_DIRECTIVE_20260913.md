# IRON RAIN — CAPITAL CAPTURE DIRECTIVE — 2026-09-13

> ORDEM DIRETA DO OWNER. Todos os agentes/contas que tocarem WORLD WAR, COMBAT AI, território, materialização local, logística, missões, rádio, mapa, spawn ou visual do mundo devem ler este arquivo no mesmo ciclo.

## Definição dos pontos internos do hex

Cada ponto colorido/verde desenhado dentro de um grande hexágono representa uma **CAPITAL/NÚCLEO FÍSICO DO SETOR**, não um marcador abstrato vazio.

Cada capital precisa existir no mundo local/materializado e conter, no mínimo:
- construções físicas coerentes com o estado/desenvolvimento do setor;
- ruas/estradas locais;
- ligação por estrada/rota com o centro/rotas dos demais pontos do mesmo grande hex, quando a geografia permitir;
- IA/NPCs da facção dona do setor;
- defesas, postos, guarnição e logística de acordo com estoque, segurança e desenvolvimento reais;
- ponto físico de suprimento/armazenamento quando esse setor possuir esse tipo de estrutura.

O mapa estratégico continua sendo `strategic-war-live-v3.js`; NÃO criar renderer paralelo. O mapa apenas representa essas capitais e sua situação. A materialização local deve consumir os mesmos dados canônicos de setor/território/logística.

## Loop de captura obrigatório

Capturar uma capital não é simplesmente entrar em um círculo ou alterar ownership por timer.

Fluxo esperado:
1. A facção atacante avança fisicamente até a capital inimiga.
2. As forças defensoras/estruturas da capital precisam ser neutralizadas/destruídas conforme o combate local.
3. A capital entra em estado destruído/neutralizado, sem produção ou domínio funcional.
4. A facção atacante precisa trazer recursos/materiais/logística física até o local.
5. A capital precisa ser reconstruída/reativada pela facção atacante.
6. Somente depois da reconstrução mínima necessária o setor passa a contar como capital funcional/controlada pela nova facção.
7. O grande hex só conta como totalmente dominado quando TODAS as capitais/setores internos tiverem sido conquistados e reativados pela mesma facção, preservando a regra já existente de domínio completo por setores.

Sem recursos entregues, a capital permanece destruída/contested/neutralizada e não vira magicamente aliada.

## IA obrigatória

A IA precisa operar dentro desse loop e usar as MESMAS regras para ALIADOS e EIXO.

A IA deve ser capaz de:
- guarnecer e patrulhar capitais próprias;
- usar ruas/rotas para deslocamento local;
- defender acessos e estruturas importantes;
- pedir/reforçar capital sob ataque conforme rádio/logística/intel;
- atacar capitais inimigas apenas quando houver rota/front coerente e força disponível;
- destruir/neutralizar defesa e estruturas necessárias para tomar o núcleo;
- escoltar materiais/engenheiros/logística até uma capital tomada;
- reconstruir capital capturada somente quando houver materiais entregues e rota segura o suficiente;
- reparar/desenvolver capital própria usando `territory-development.js` + logística real;
- recuar/reagrupar quando supply/moral/força não sustentarem o ataque;
- não surgir magicamente atrás da linha inimiga; deep raids continuam apenas via partisan/recon/raid explícito.

A IA NÃO pode receber munição, construção, reforço ou materiais gratuitos só por ser NPC. Produção e reconstrução devem consumir os mesmos estoques e rotas físicas do jogador.

## Estradas e ligação entre capitais

As capitais/setores de um grande hex devem formar uma rede territorial legível:
- estradas/rotas ligam capitais entre si e aos corredores logísticos externos;
- rotas cortadas bloqueiam comboios e atrasam reconstrução;
- comboios destruídos perdem a carga;
- factories/depots produzem ou armazenam material, mas nada teleporta entre capitais;
- a captura de uma capital pode abrir/fechar rotas e alterar a pressão/front do grande hex.

## Materialização e performance

Não materializar o mapa mundial inteiro em alta fidelidade simultaneamente. Usar o estado estratégico persistente para todas as capitais e materializar em detalhe as capitais/forças relevantes próximas do Mamute/jogador, preservando performance.

Quando uma capital remota não está materializada, sua batalha/produção/reconstrução pode continuar pela simulação canônica, mas deve obedecer exatamente às mesmas regras de estoque, força, rota, dano, reconstrução e ownership. Ao materializar, o estado local deve refletir o snapshot estratégico real; não criar uma versão paralela independente.

## Visual obrigatório

No mapa, cada ponto-capital deve comunicar melhor seu papel:
- nome/estado da capital ao selecionar;
- facção/controle;
- estado operacional: ativa, sob ataque, destruída, reconstruindo, isolada, sem supply;
- rotas principais ligando capitais;
- obras/defesas/estoques apenas conforme intel válida;
- marcador do Mamute indicando claramente em qual grande hex e qual capital/setor ele está ou de qual está se aproximando.

No mundo local, a capital não pode ser terreno vazio. Deve ter silhueta, ruas, estruturas, defesa, presença de IA e sinais visuais do estado de guerra/destruição/reconstrução.

## Prioridade imediata dos workstreams

- **WORLD WAR:** modelar capital como entidade funcional do setor, conectar ownership + destruição + reconstrução + rotas + logística e refletir isso no `strategic-war-live-v3.js`.
- **COMBAT AI:** integrar ataque/defesa/retirada/reforço/reconstrução de capitais usando território, moral, supply, estoque e rotas canônicas.
- **FP SYSTEMS / MATERIALIZATION:** permitir que a capital próxima seja materializada com ruas, prédios, colisão, postos e IA sem quebrar a cabine/Mamute.
- **FP VISUALS:** criar leitura visual clara para capital funcional, destruída e em reconstrução; melhorar silhueta, iluminação, fumaça/ruína/atividade sem excesso de UI abstrata.
- **ARTILLERY:** continuar usando alcance físico real; uma capital só pode receber apoio se estiver dentro do alcance e houver coordenadas/intel válidas.
- **LOGÍSTICA:** reconstrução exige material entregue fisicamente; base vazia/rota cortada impede reconstrução e reabastecimento.

## Gates

- Preservar o boot atual funcional. Nenhuma melhoria vale reintroduzir o travamento em `ABRINDO COMPARTIMENTO`.
- Não criar segundo mapa, segundo ownership model, segunda economia ou segunda IA paralela.
- Reutilizar `strategic-hex-map.js`, `theatre-control.js`, `theatre-sectors.js`, `territory-development.js`, `territory-ai.js`, `strategic-logistics.js`, `world-map-intel.js`, `local-missions.js` e materialização existente.
- Antes de editar hotspot, refetch HEAD e preservar trabalho concorrente.
- Registrar em `AGENT_LOG.md` quando este arquivo tiver sido consumido.