# Iron Rain — LEAD active sprint — 2026-09-12

This file is the current short-horizon integration handoff. It does not replace `IRON_RAIN_VISION.md`, `MULTI_AGENT_CONTROL.md`, `ACTIVE_USER_DIRECTIVES_20260912.md` or `AGENT_LOG.md`.

## LEAD GATE — P0 ATÉ CHECKPOINT REAL DE 2 DISPOSITIVOS

A branch ganhou bastante fundação útil, mas a integração P0 ainda não chegou ao caminho principal do jogo: `cabin-view.js` ainda não consome a camada visual de tripulação e `game-v6.js` ainda não importa/monta `crew-runtime.js` + `crew-lobby-ui.js`. Portanto, helpers/testes isolados não contam como avanço perceptível do multiplayer.

A partir deste checkpoint, a regra de ritmo é obrigatória para todos os slots:
- se um workstream completar 2 ciclos sem avanço perceptível/fundacional do seu objetivo e sem bloqueio legítimo, o ciclo seguinte deve ser reorientado para uma fatia integrada de maior impacto;
- P0 multiplayer supera micro-polish desconectado até existir um checkpoint real de dois dispositivos;
- não recriar helpers já existentes; consumir a fundação que já está na branch;
- antes de tocar hotspots compartilhados, reler HEAD/commits e preservar trabalho concorrente;
- não chamar BroadcastChannel de multiplayer público: ele é somente transporte de QA local;
- não declarar persistência global pronta sem backend/storage autoritativo compartilhado.

### Integração P0 obrigatória — ordem atual
1. **Presença visual real:** integrar `createCabinCrewVisualLayer()` em `cabin-view.js`, com no máximo dois remotos e API mínima para renderer-ready samples. Nenhum código de rede no renderer.
2. **Runtime no jogo:** integrar `crew-runtime.js` em `game-v6.js`: pose local -> `runtime.update()` -> `runtime.renderSamples()` -> camada visual. Offline/single-player precisa continuar idêntico.
3. **Lobby real:** montar `crew-lobby-ui.js` como primeiro fluxo do jogador. Escolha obrigatória antes da sessão: `ALIADOS` azul ou `EIXO` verde; CRIAR / ENTRAR / JOGAR SOZINHO / ENTRAR NO MAMUTE sem linguagem de signaling.
4. **Posse de postos:** entrada em `drive/aim/load/map/radio/engine/extinguisher` só ocorre após claim exclusivo; ocupado = não engaja e informa indisponibilidade; release em saída/desconexão.
5. **Transporte cross-device:** substituir transporte QA pelo adapter real retornado/implementado pelo Codex P0, preservando a API do runtime/session.
6. **Checkpoint de aceitação:** dois dispositivos da mesma facção entram no mesmo Mamute, veem um ao outro, usam postos diferentes simultaneamente, não roubam o mesmo posto, recebem o mesmo feedback de impacto e desconectam limpo; terceiro entra; quarto é recusado; facção oposta é recusada no mesmo Mamute.

## DIRETIVA MOBILE — POSTO DE PONTARIA

O touch/mobile deve operar as manivelas físicas 3D. Não criar um segundo fire deck concorrente.

- esconder UI duplicada de azimute/elevação no mobile;
- centro e parte inferior da cena ficam livres para tocar as manivelas 3D;
- manter somente `CARGA` +/- em bloco compacto à direita;
- `DISPARAR` diretamente abaixo;
- `AFASTAR-SE` permanece disponível sem reconstruir painel inferior grande;
- travar free-look no posto de pontaria touch quando necessário para a mão permanecer sobre o mecanismo;
- desktop/mouse não pode regredir;
- `mobile-station-ui.css` é o caminho de integração atual.

## OUTRAS DIRETIVAS QUE NÃO PODEM REGREDIR

### Mamute físico/imersão
- impactos externos devem gerar crack/thump/rattle, shake/luz/poeira dentro do Mamute para toda a tripulação;
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
- `crew-broadcast-transport.js`: QA same-origin apenas;
- `crew-station-authority.js`: posse exclusiva;
- `crew-lobby-ui.js`: lobby/facção player-facing;
- `crew-presence.js`, `crew-avatar-visual.js`, `crew-visual-layer.js`: presença visual remota;
- `cabin-hit-feedback.js`: contrato de feedback interno de impacto;
- `loader-arm.js`: pose/rig do loader; não criar clock paralelo;
- `maintenance-feedback.js` + `maintenance-overlay.js`: feedback de manutenção;
- `theatre-control.js`, `theatre-sectors.js`, `theatre-regions.js`: linha/território coerente;
- `territory-development.js`, `strategic-logistics.js`, `territory-region-control.js`: desenvolvimento/logística física;
- `persistent-war-clock.js`: relógio/catch-up somente, não autoridade persistente completa;
- `world-map-intel.js`: intel estratégica parcial; manter sem onisciência.

## CODEX / BLOQUEIOS ESPECIALIZADOS

- P0 real multiplayer transport/signaling: `docs/codex-requests/IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md`.
- P1 autoridade persistente de guerra: `docs/codex-requests/IR-CODEX-20260912-1620-LEAD-persistent-war-authority.md`.
- QA iPhone/Safari áudio continua necessário; não ajustar mix subjetivamente às cegas.
- Codex indisponível não paralisa os workstreams: integração local, regressões e fundações independentes continuam.

## TESTE / PUBLICAÇÃO

- usar somente a branch ativa `iron-rain-v6-1-continuation`; `iron-rain-frontline` é histórica e não deve ser editada;
- `npm test` antes/depois quando o runtime permitir;
- QA browser via `tests/v7-browser.mjs` quando Playwright estiver disponível;
- não rotular helper isolado como mudança visível;
- manter o MESMO Pages/PWA estável já instalado no iPhone do dono; não criar novo URL de produto;
- qualquer integração visível deve preservar PC + mobile e a estética low-poly/PS1 militar-industrial.
