# Iron Rain — LEAD active sprint — 2026-09-12

This file is the current short-horizon integration handoff. It does not replace `IRON_RAIN_VISION.md`, `MULTI_AGENT_CONTROL.md`, `ACTIVE_USER_DIRECTIVES_20260912.md`, `MAP_REWORK_20260912.md` or `AGENT_LOG.md`.

## OWNER OVERRIDE — 2026-09-12 21:32 BRT — SERVIDOR PERSISTENTE + OVERNIGHT PUSH

Esta seção tem precedência sobre linguagem antiga de `host`, `single-player` ou sessão que possua a guerra.

### Arquitetura de produto correta
- Iron Rain é ONLINE-FIRST e SERVER-AUTHORITATIVE.
- Não existe jogador-host como autoridade da guerra. O servidor/authority backend mantém a guerra compartilhada e continua avançando mesmo quando todos os jogadores de um Mamute saem.
- ALIADOS e EIXO entram na MESMA guerra persistente, em Mamutes separados por facção.
- Um Mamute é uma entidade persistente/registrada dessa guerra, não uma nova cópia do teatro.
- A tripulação de um Mamute continua limitada a 3 jogadores e com posse exclusiva de postos, mas essa autoridade local de posto não torna nenhum cliente autoridade do mundo.
- Entrar sozinho significa apenas estar sozinho naquele Mamute naquele momento; não existe arquitetura offline paralela.
- O próximo checkpoint obrigatório de combate é cross-faction: jogador A em Mamute ALIADOS e jogador B em Mamute EIXO, ambos na mesma guerra, cada um vendo/afetando o estado autoritativo do outro através do servidor. Um disparo deve ser resolvido uma única vez pela authority compartilhada e replicado para ambos; nenhum cliente decide localmente se acertou.
- Toda linguagem/contrato antigo `host creates room/session` deve ser tratada como legado temporário de transporte e migrada para `server allocates/joins Mamute within persistent theatre`.

### OVERNIGHT EXECUTION GATE — TODAS AS CONTAS
O owner quer acordar e perceber evolução clara. Até novo override, cada execução noturna deve escolher uma FATIA INTEGRADA GRANDE o bastante para produzir uma das duas coisas: mudança visível/player-testable OU avanço estrutural diretamente necessário ao checkpoint de servidor persistente. Micro-helper isolado, teste sem consumidor ou polish invisível não contam como ciclo completo, salvo correção crítica/regressão.

- Antes de editar, reler HEAD/commits recentes e preservar concorrência.
- Depois de uma fundação estar pronta, o ciclo seguinte deve CONSUMI-LA no caminho vivo; não criar helper irmão.
- Cada workstream deve terminar com uma mudança integrada ou um bloqueio concreto, reproduzível e registrado.
- Se um hotspot estiver ocupado por outro agente, escolher uma integração adjacente de alto impacto em vez de esperar.
- Não reduzir escopo para evitar trabalho perceptível. Preferir uma fatia maior, mas coerente/testável.

### COBRANÇA ESPECÍFICA — FP VISUALS + AUDIO
O visual está atrasado em relação às fundações. Até de manhã, ciclos de FP VISUALS + AUDIO devem priorizar mudança que o owner consiga VER/Ouvir no mesmo link estável, não apenas contratos internos.

Prioridade visual, nesta ordem, consumindo sistemas existentes:
1. integrar o braço mecânico de recarga no renderer real e remover a recarga visual antiga/mágica;
2. tornar impactos no casco claramente perceptíveis dentro do Mamute: shake, iluminação/poeira/metal + crack/thump/rattle compartilhados;
3. extintor com spray/foam visível e reparo com feedback mecânico/progresso real no interior;
4. corrigir props flutuantes/desalinhados e melhorar leitura espacial/industrial da cabine sem reescrever Three.js;
5. validar mobile/desktop sem ressuscitar UI duplicada no AIM.

Um ciclo de VISUAL que apenas adiciona teste de apresentação sem alterar o caminho renderizado deve ser tratado como incompleto, a menos que esteja corrigindo regressão P0 que bloqueia a build.

### COBRANÇA POR WORKSTREAM — FATIAS GRANDES
- FP SYSTEMS: fechar presença/posse/reconnect no caminho online canônico e preparar consumo de authority de servidor, sem segunda stack.
- FP VISUALS + AUDIO: resultado perceptível obrigatório conforme lista acima.
- COMBAT AI: integrar reservas/território/logística no fluxo vivo; forças de ambos os lados devem obedecer as mesmas regras e nunca materializar frontline regular atrás da linha inimiga.
- ARTILLERY: uma cadeia única de aim/load/fire autoritativa; tiro gasta munição do Mamute e deve poder produzir resultado replicável contra outro Mamute, sem duplicar fire local/remoto.
- WORLD WAR: uma única guerra persistente com múltiplos Mamutes de ambas as facções, posição em grande hex/setor, frente coerente e estado pronto para snapshot autoritativo; mapa estratégico e mesa de cartas continuam ligados.

## LEAD AUDIT — 2026-09-12 21:02 BRT

A auditoria deste ciclo foi feita na branch ativa `iron-rain-v6-1-continuation`, após reler handoff, visão, diretivas do owner, MAP REWORK, MAP REFERENCE, MULTI_AGENT_CONTROL, AGENT_LOG e commits recentes. `iron-rain-frontline` continua histórica e não deve ser editada.

O checkpoint antigo deste arquivo ficou desatualizado: lobby, runtime, bridge de cabine e presença visual já chegaram ao caminho principal. `bootstrap.js` já monta `crew-lobby-ui.js`, `crew-runtime.js`, transporte real/QA, `crew-cabin-bridge.js` e escolha de facção/spawn; `cabin-view.js` já possui a camada visual de até dois remotos e gate de postos. Não repetir essas integrações como se ainda estivessem ausentes.

O P0, porém, NÃO está concluído: o request Codex `IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md` permanece `IN_PROGRESS` e ainda falta evidência real PC→PC e PC→mobile no mesmo Mamute. Até esse retorno, nenhum Slot cria stack concorrente de transporte/sinalização e ninguém declara multiplayer pronto apenas por testes unitários/browser locais.

## POLÍTICA DE RITMO — GATE OBRIGATÓRIO

- P0 multiplayer real continua acima de micro-polish desconectado até existir checkpoint real de dois dispositivos.
- Se um workstream completar 2 ciclos sem avanço perceptível/fundacional e sem bloqueio legítimo, o ciclo seguinte DEVE consumir a fundação existente numa fatia integrada de maior impacto.
- Helper novo sem consumidor só é aceitável quando remove bloqueio arquitetural explícito; não empilhar adapters/view-models paralelos.
- Antes de tocar hotspot compartilhado, reler HEAD/commits e preservar trabalho concorrente.
- BroadcastChannel continua somente QA same-origin; não chamar isso de multiplayer público.
- Persistência global não está pronta sem backend/storage autoritativo compartilhado.

## P0 MULTIPLAYER — ESTADO ATUAL E PRÓXIMA ACEITAÇÃO

Já integrado no caminho principal:
1. escolha `ALIADOS` azul / `EIXO` verde antes da sessão;
2. criar/entrar/jogar sozinho/entrar no Mamute via lobby player-facing;
3. runtime de tripulação montado no bootstrap;
4. pose local -> runtime -> samples remotos -> cabine;
5. presença visual de até dois remotos no interior;
6. gate de posse exclusiva de postos atravessando a mesma fronteira runtime/cabine;
7. feedback compartilhado de tiro/recarga/impacto/manutenção em integração incremental;
8. spawn em hexágono 100% dominado pela facção, aplicado ao Mamute.

Próxima aceitação P0, sem abrir implementação concorrente enquanto Codex estiver `IN_PROGRESS`:
1. consumir primeiro a evidência/correções devolvidas pelo Codex;
2. validar PC→PC real: mesma facção, mesmo Mamute, presença visual, dois postos diferentes simultâneos, mesmo posto recusado, tiro/impacto compartilhado, leave/disconnect/reconnect;
3. validar PC→mobile/iPhone no mesmo fluxo;
4. terceiro tripulante entra, quarto é recusado;
5. facção oposta não entra no mesmo Mamute;
6. erro de runtime/transporte deve falhar fechado sem deixar avatar fantasma nem posse órfã de posto.

## DIRETIVA MOBILE — POSTO DE PONTARIA

O touch/mobile deve operar as manivelas físicas 3D. Não criar segundo fire deck concorrente.

- esconder UI duplicada de azimute/elevação no mobile;
- centro e parte inferior da cena ficam livres para tocar as manivelas 3D;
- manter somente `CARGA` +/- em bloco compacto à direita;
- `DISPARAR` diretamente abaixo;
- `AFASTAR-SE` permanece disponível sem reconstruir painel inferior grande;
- travar free-look no posto de pontaria touch quando necessário para a mão permanecer sobre o mecanismo;
- desktop/mouse não pode regredir;
- `mobile-station-ui.css` é o caminho de integração atual.

## MAPA / WORLD WAR — BASELINE E GATE

Qualquer Slot que toque mapa, território, IA dependente de território, logística, rádio, missões ou materialização deve reler `MAP_REWORK_20260912.md` + `MAP_REFERENCE_20260912.svg` no mesmo ciclo.

- Renderer canônico: `modules/strategic-war-live-v3.js`, exposto pela façade `modules/strategic-war-live.js`. Não criar v4/renderer paralelo.
- Preservar escala uniforme X/Y, hexágonos encaixados SEM sobreposição, leitura de grandes regiões, ALIADOS oeste, EIXO leste, corredor NEUTRO + DISPUTADO e frente contínua.
- A mudança recente de escala das regiões em `strategic-hex-map.js` é aceitável somente enquanto mantiver encaixe axial correto, hierarquia visual e testes; tamanho maior não autoriza sobreposição.
- Posição do Mamute deve continuar identificando região/setor e a mesa de cartas deve mostrar a mesma localização estratégica.
- Informação inimiga depende de intel válida; ownership territorial nunca vem de um contato de intel.
- Captura conectada + `captureSectorWithFront()` já existem como fundação. O próximo avanço de WORLD WAR deve integrar a linha devolvida no estado vivo e no `drawFront()` do v3; não criar outro helper de frente antes disso.

## REORIENTAÇÃO POR WORKSTREAM — PRÓXIMO CICLO

### FP SYSTEMS — P0
Consumir a robustez recém-adicionada ao `crew-cabin-bridge.js` e preparar o pós-Codex: validar limpeza de presença/posse em erro, leave, disconnect e reconnect. Não criar outro runtime/bridge/lobby. Se Codex retornar neste ciclo, prioridade absoluta é integrar a correção/evidência dele e fechar checkpoint cross-device.

### FP VISUALS + AUDIO
Parar micro-polish de apresentação independente. Próxima fatia deve ser perceptível: integrar o loader mecânico existente ao renderer real OU fechar hull-hit/extintor/reparo compartilhados no interior já renderizado. iPhone/Safari áudio continua bug até evidência em aparelho; não fazer tuning subjetivo às cegas.

### COMBAT AI
A fundação `combatReservePlanCycle()` já passou de helper suficiente. Próxima fatia deve substituir atomicamente no fluxo vivo de `war-simulation-core.js` o modelo legado de reservas, usando IDs/território/logística canônicos. Não criar terceiro helper de reservas e não manter dois modelos ativos.

### ARTILLERY
A cadeia de orientação/cargas já tem view-model suficiente. Próxima fatia deve consumir `artilleryChargeTableRows()` em `table-map.js` como substituição da apresentação anterior, preservando `ballistics.js` como fonte única e a ligação região/setor sem GPS inimigo. No mobile, manter pontaria física 3D como superfície principal.

### WORLD WAR
Prioridade é integração, não nova fundação: `captureSectorWithFront()` + linha estratégica ativa -> `strategicFrontPath()` -> `strategic-war-live-v3.js`. Ownership e linha precisam mudar atomicamente, com fallback canônico e sem bolsões mágicos. Depois conectar pressão/IA/logística ao mesmo estado; não abrir renderer paralelo.

## OUTRAS DIRETIVAS QUE NÃO PODEM REGREDIR

### Mamute físico/imersão
- impactos externos geram crack/thump/rattle, shake/luz/poeira dentro do Mamute para toda a tripulação;
- loader usa braço mecânico articulado: adquirir -> prender -> girar -> levar à culatra -> inserir -> travar;
- extintor precisa spray/foam visível;
- reparo precisa progresso e resposta mecânica/áudio visíveis;
- iPhone/Safari áudio continua bug real até QA em aparelho confirmar.

### Guerra/território/logística
- uma única guerra persistente compartilhada por ALIADOS/EIXO;
- ownership canônico absoluto, não guerra duplicada por perspectiva do cliente;
- front territorial contínuo, sem forças regulares mágicas atrás da linha inimiga;
- hex grande contém setores; hex só fecha quando todos os setores internos pertencem à mesma facção;
- captura move/dobra localmente a linha contínua;
- construção: controle seguro -> rota válida -> entrega física -> estoque local -> construção;
- rota cortada para entrega/construção; comboio destruído não teleporta carga;
- fábricas produzem material transportável, não upgrade remoto mágico;
- IA das duas facções usa as mesmas regras e depende de suprimento/estrutura local real;
- munição do Mamute é finita; base sem estoque não reabastece magicamente;
- mapa estratégico não é tracker inimigo onisciente; intel depende de rádio/recon/relatórios e envelhece.

## FUNDAÇÕES JÁ EXISTENTES — CONSUMIR, NÃO DUPLICAR

- `crew-replication.js`: 1 local + 2 remotos, validação/interpolação;
- `crew-session.js`: handshake, room, faction lock, heartbeat, cap 3, station packets;
- `crew-runtime.js`: fronteira estável de transporte;
- `crew-cabin-bridge.js`: runtime/presença/postos -> cabine, incluindo falha fechada de frame;
- `crew-broadcast-transport.js`: QA same-origin apenas;
- `crew-mqtt-transport.js`: adapter público atual sob auditoria Codex P0;
- `crew-station-authority.js` + `crew-station-gate.js`: posse exclusiva;
- `crew-lobby-ui.js`: lobby/facção player-facing;
- `crew-presence.js`, `crew-avatar-visual.js`, `crew-visual-layer.js`: presença visual remota;
- `cabin-hit-feedback.js`: contrato de feedback interno de impacto;
- `loader-arm.js`: pose/rig do loader; não criar clock paralelo;
- `maintenance-feedback.js` + `maintenance-overlay.js`: feedback de manutenção;
- `theatre-control.js`, `strategic-hex-map.js`, `strategic-front-pressure.js`: linha/território/frente coerentes;
- `territory-development.js`, `strategic-logistics.js`, `territory-region-control.js`: desenvolvimento/logística física;
- `persistent-war-clock.js`: relógio/catch-up somente, não autoridade persistente completa;
- `world-map-intel.js`: intel estratégica parcial; manter sem onisciência.

## CODEX / BLOQUEIOS ESPECIALIZADOS

- P0 real multiplayer transport/signaling: `docs/codex-requests/IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md` — `IN_PROGRESS` na última auditoria deste ciclo.
- P1 autoridade persistente de guerra: `docs/codex-requests/IR-CODEX-20260912-1620-LEAD-persistent-war-authority.md`.
- QA iPhone/Safari áudio continua necessário; não ajustar mix subjetivamente às cegas.
- Codex indisponível não paralisa os workstreams: integração local, regressões e fundações independentes continuam.

## TESTE / PUBLICAÇÃO

- usar somente `iron-rain-v6-1-continuation`; `iron-rain-frontline` é histórica e não deve ser editada;
- `npm test` antes/depois quando o runtime permitir;
- QA browser via `tests/v7-browser.mjs` quando Playwright estiver disponível;
- não rotular helper isolado como mudança visível;
- manter o MESMO Pages/PWA estável já instalado no iPhone do owner; não criar novo URL de produto;
- qualquer integração visível deve preservar PC + mobile e a estética low-poly/PS1 militar-industrial;
- REPORTING GATE: não reportar ao owner enquanto o workflow Pages/PWA do commit correspondente estiver queued/pending/in_progress.
