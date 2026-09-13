# Iron Rain — handoff para trabalho paralelo

## Onde está a build

- Repositório: `Hirouou/com.mojang`
- Pasta do jogo: `iron-rain/`
- Branch de continuação: `iron-rain-v6-1-continuation`
- Branch histórica preservada: `iron-rain-frontline`
- Entrada do jogo: `iron-rain/index.html`
- Sprint ativo da liderança: `iron-rain/docs/LEAD_SPRINT_20260912.md`
- Coordenação AO VIVO enquanto o Codex P0 roda: `iron-rain/docs/CODEX_LIVE_DISPATCH_20260912.md`
- Roteamento obrigatório pós-Codex P0: `iron-rain/docs/POST_CODEX_ROUTING_20260912.md`
- Diretiva/mapa visual atual OBRIGATÓRIA: `iron-rain/docs/MAP_REWORK_20260912.md`
- Referência visual compartilhada entre agentes: `iron-rain/docs/MAP_REFERENCE_20260912.svg`
- Publicação Pages: o workflow em `.github/workflows/iron-rain-pages.yml` publica o conteúdo de `iron-rain/` quando o GitHub Pages estiver habilitado no repositório.
- URL esperada depois da primeira execução: `https://hirouou.github.io/com.mojang/`

## Como executar

No computador, dentro de `iron-rain/`, use `npm start` e abra `http://localhost:4173/`. Também é possível executar `ABRIR-IRON-RAIN.cmd`. Não abrir `index.html` por `file://`: os módulos e o service worker precisam de um servidor.

O jogo remoto usa `game-v6.js` como módulo ES e importa os módulos em `iron-rain/modules/`. O loader fragmentado `game-v6-loader.js` e os arquivos `v6-part*.txt` são referências antigas e não participam da build atual.

## Sistemas atuais

- Balística e readout compartilham `modules/ballistics.js`, com cargas que cobrem aproximadamente 1–50 km.
- `modules/cabin-view.js` e `modules/cabin-controls.js` formam o interior 3D low-poly, caminhada WASD/joystick, mouselook 360°, escotilha lateral, corredor e sala do motor.
- `modules/engine-system.js` controla incêndio, extintor, reparo e bloqueio de tração.
- `modules/war-simulation.js` mantém a camada estratégica distante, detalhe tático limitado, infantaria com supressão/baixas, bases, tanques, morteiros, bombardeiros e contato de fogo contra um Mamute exposto em marcha.
- `modules/table-map.js` é um mapa de mesa manual: mostra coordenadas, ΔX, ΔY, distância e azimute sem mover a peça nem revelar ponto de impacto.
- `modules/war-audio.js` gera efeitos procedurais com volume geral, efeitos e ambiente separados.
- O rádio separa COMANDO, INFANTARIA e INFORMAÇÕES; relatórios clicáveis fazem a sequência origem → alvo → Mamute.
- `modules/strategic-war-live.js` aponta para o renderer estratégico ativo. A partir do feedback visual de 18:24, o baseline é `strategic-war-live-v3.js`: mapa com escala uniforme, divisão inicial aproximadamente equilibrada, corredor neutro/disputado, frente contínua, localização do Mamute e ligação visual com a mesa de cartas.

## Verificação antes de editar

Leia também `LEAD_SPRINT_20260912.md` e `MAP_REWORK_20260912.md` antes de escolher a próxima integração para não duplicar helpers, regressar prioridades validadas pelo usuário ou voltar ao mapa de debug anterior.

Enquanto a missão Codex P0 de multiplayer real estiver `IN_PROGRESS`, leia `CODEX_LIVE_DISPATCH_20260912.md`, não crie transporte/lobby concorrente e prepare somente consumidores/contratos independentes. Quando ela retornar `DONE` ou `BLOCKED`, consuma primeiro a evidência devolvida pelo Codex e siga `POST_CODEX_ROUTING_20260912.md` + `CODEX_LIVE_DISPATCH_20260912.md` para dividir integração de multiplayer, presença visual, mapa/território, múltiplos Mamutes, novos jogadores, IA e artilharia entre os workstreams. O usuário não deve precisar retransmitir a resposta do Codex.

Execute `npm test`. A build deve continuar usando caminhos relativos, sem dependências externas obrigatórias. Para testar navegador, defina `IRON_RAIN_PLAYWRIGHT` para o runtime Playwright disponível e execute `node tests/v7-browser.mjs`.

Trabalhos paralelos devem preservar a entrada modular e evitar reativar gerações antigas do motor. Faça commits pequenos e frequentes, identifique a branch/commit no handoff e confira as mudanças mais recentes antes de editar arquivos compartilhados.

## REPORTING GATE — owner 18:24 BRT

Execuções automáticas que fazem alteração + publicação NÃO devem mandar atualização intermediária ao usuário enquanto o workflow Pages/PWA do commit correspondente estiver `queued`, `pending` ou `in_progress`. A atualização ao owner só deve sair quando a publicação terminar, com sucesso/falha e o que ficou realmente disponível na build. Exceção: bloqueio crítico que exija ação manual imediata.

## LEAD gate — 2026-09-12 17:57 BRT

- O request `IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md` está `IN_PROGRESS` e continua dono exclusivo de transporte/sinalização/auditoria multiplayer real. Nenhum Slot cria stack concorrente enquanto esse gate estiver ativo.
- A aceitação P0 continua sendo um checkpoint real de dois dispositivos: PC→PC primeiro, depois PC→mobile, com até 3 jogadores, facção correta, presença visual, posse exclusiva de postos, disconnect/reconnect e um único resultado autoritativo para ações compartilhadas. Teste unitário isolado não encerra P0.
- WORLD WAR deve consumir `strategic-war-live-v3.js`, `MAP_REWORK_20260912.md` e as fundações de roster/fog/materialização numa fatia integrada; não criar novo renderer paralelo sem bloquear/remover explicitamente o anterior.
- FP VISUALS + AUDIO deve converter fundações já prontas em resultado perceptível: integrar loader mecânico no renderer real, feedback de extintor/reparo/hull-hit, e aguardar evidência de Safari/iPhone antes de tuning subjetivo. Não acumular novos helpers de apresentação sem consumidor.
- ARTILLERY deve preservar AIM físico 3D no mobile e manter somente `CARGA +/-` + `DISPARAR` compactos à direita. A mesa de cartas agora precisa manter visível a ligação com região/setor estratégico atual. COMBAT AI deve consumir logística/território existentes em vez de abrir outro modelo. Desktop permanece protegido em todos os casos.

## LEAD audit — 2026-09-12 22:01 BRT

Auditoria feita na branch ativa após reler visão, diretivas, MAP REWORK, referência visual, controle multiagente, log e commits recentes. O request Codex P0 continua `IN_PROGRESS`; portanto transporte/sinalização seguem sob posse exclusiva desse request e nenhum Slot deve abrir stack concorrente.

- **FP SYSTEMS / P0:** a correção recente que faz a cabine falhar fechada quando perde authority de posto é coerente e deve ser preservada. Porém o novo desvio explícito `mode === 'offline'` em `cabin-view.js` NÃO deve crescer como arquitetura de produto: o override atual é ONLINE-FIRST + SERVER-AUTHORITATIVE. "Jogar sozinho" significa tripulação de uma pessoa dentro de um Mamute da guerra compartilhada, não uma guerra/runtime offline separado. Até o retorno Codex, não ampliar esse fork; próximo ciclo deve convergir o caminho solo para a mesma seam de authority ou restringir qualquer fallback offline a QA/teste claramente isolado.
- **FP VISUALS + AUDIO:** já existem consumidores de reload remoto, recoil/impacto compartilhado e manutenção. Não gastar dois ciclos em novos helpers. Próxima entrega deve ser perceptível no renderer: braço mecânico de loader no caminho vivo e/ou spray/foam + reparo visível + hull-hit completo. Áudio iPhone continua NÃO validado até teste real em aparelho.
- **ARTILLERY:** replicação visual de `fire/reload` agora respeita ownership AIM, mas isso ainda NÃO é authority do disparo. Não adicionar outra camada de efeitos. A próxima integração pós-Codex deve fazer uma única cadeia `comando -> authority compartilhada -> gasto de munição -> resultado -> eventos`, mantendo `ballistics.js` único e preservando AIM 3D mobile com apenas CARGA +/- + DISPARAR compactos.
- **WORLD WAR:** `strategic-war-live-v3.js` permanece o único renderer. A frente já deriva pressão territorial viva e a façade ganhou ciclo de snapshot de múltiplos Mamutes; essa seam é aceitável somente como composição/snapshot, nunca como authority local nem fonte de posição inimiga sem intel. Próxima fatia deve atualizar captura/ownership + território + logística atomicamente e preparar snapshot para backend persistente. Não criar outro renderer, outro ownership model ou persistência cliente.
- **COMBAT AI:** reservas já chegaram ao caminho vivo com staging em território amigo/logística canônica. Próximo ciclo precisa fechar decisões de assault/retirada com supply/moral/território existentes; não criar terceiro helper de reservas nem materializar força regular atrás da linha inimiga.
- **RITMO:** qualquer workstream que completar dois ciclos consecutivos somente com teste/helper/polish invisível sem bloqueio legítimo deve, no ciclo seguinte, consumir a fundação numa fatia integrada maior. Teste isolado não conta como avanço do produto se não estiver protegendo correção P0/regressão real.

Nenhuma dessas reorientações autoriza editar `iron-rain-frontline`. Publicação continua exclusivamente no mesmo Pages/PWA estável.

## LEAD audit — 2026-09-13 04:59 BRT

Auditoria de ritmo após reler todas as diretivas obrigatórias, referência visual e commits recentes. WORLD WAR acumulou múltiplos ciclos consecutivos em refinamentos de timestamps/preview/coarse radio intel. Esses ajustes são válidos para fog-of-war, porém atingiram o limite da política de ritmo e deixam de ser prioridade até existir uma fatia integrada de produto.

- **WORLD WAR — REORIENTAÇÃO OBRIGATÓRIA:** próximo trabalho relevante deve integrar a logística física pedida pelo owner usando os sistemas canônicos existentes. Entrega mínima da fatia: rede de estradas ligando capitais/núcleos; rota com progresso real de veículo; faixas/sentidos lógicos ida/volta; caminhão sem teleporte; entrega de estoque somente ao chegar; veículo destrutível com perda econômica; origem em oficina/infraestrutura e custo real. Depois conectar transporte de tanque/descarregamento e decisão da IA. Não abrir novo renderer, nova economia ou segunda logística. `strategic-war-live-v3.js` continua único mapa.
- **COMBAT AI:** o avanço recente de readiness/retirada é fundacional e coerente, mas o próximo salto deve consumir a logística/território canônicos em decisão observável: proteger/interceptar comboio, evitar ofensiva sem supply, ou defender nó/oficina conforme ameaça e intel válida. Não gastar outro par de ciclos apenas calibrando thresholds.
- **ARTILLERY:** o ciclo recente voltou a polish textual da caderneta (`ELEVAÇÃO ALINHADA`). Pela política de ritmo, não priorizar novo texto/helper de apresentação. O próximo trabalho deve atacar o bug real reportado pelo owner nas manivelas físicas 3D mobile ou fechar a cadeia autoritativa de disparo quando a fronteira Codex permitir. Preservar somente CARGA +/- e DISPARAR à direita.
- **FP SYSTEMS:** interação MAPA/CONDUTOR e operação de posto com prompt ausente continuam regressões reais reportadas pelo owner. Corrigir tolerância/hit-testing sem atravessar paredes/máquinas tem prioridade sobre polish interno adicional; preservar desktop e authority exclusiva.
- **FP VISUALS + AUDIO:** manutenção perceptível avançou corretamente com foam/sparks/tool motion. Próximo ciclo deve validar/integrar no espaço 3D vivo ou loader/hull-hit; não criar outro overlay paralelo. iPhone audio só fecha com evidência real.
- **P0 MULTIPLAYER:** permanece dono exclusivo do request Codex enquanto `IN_PROGRESS`; nenhum Slot abre signaling/transporte paralelo. Aceitação continua PC↔PC e PC↔mobile reais, até 3 tripulantes, facção, presença, station ownership e resultado compartilhado.

A referência visual de mapa continua exigindo estradas/rotas sutis e legíveis entre regiões/capitais, sem transformar logística inimiga em informação onisciente. Toda logística nova deve respeitar `CAPITAL_CAPTURE_DIRECTIVE_20260913.md` + `LOGISTICS_ECONOMY_DIRECTIVE_20260913.md`.