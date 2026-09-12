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

## Verificação antes de editar

Leia também `LEAD_SPRINT_20260912.md` antes de escolher a próxima integração para não duplicar helpers ou regressar prioridades validadas pelo usuário.

Enquanto a missão Codex P0 de multiplayer real estiver `IN_PROGRESS`, leia `CODEX_LIVE_DISPATCH_20260912.md`, não crie transporte/lobby concorrente e prepare somente consumidores/contratos independentes. Quando ela retornar `DONE` ou `BLOCKED`, consuma primeiro a evidência devolvida pelo Codex e siga `POST_CODEX_ROUTING_20260912.md` + `CODEX_LIVE_DISPATCH_20260912.md` para dividir integração de multiplayer, presença visual, mapa/território, múltiplos Mamutes, novos jogadores, IA e artilharia entre os workstreams. O usuário não deve precisar retransmitir a resposta do Codex.

Execute `npm test`. A build deve continuar usando caminhos relativos, sem dependências externas obrigatórias. Para testar navegador, defina `IRON_RAIN_PLAYWRIGHT` para o runtime Playwright disponível e execute `node tests/v7-browser.mjs`.

Trabalhos paralelos devem preservar a entrada modular e evitar reativar gerações antigas do motor. Faça commits pequenos e frequentes, identifique a branch/commit no handoff e confira as mudanças mais recentes antes de editar arquivos compartilhados.

## LEAD gate — 2026-09-12 17:57 BRT

- O request `IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md` está `IN_PROGRESS` e continua dono exclusivo de transporte/sinalização/auditoria multiplayer real. Nenhum Slot cria stack concorrente enquanto esse gate estiver ativo.
- A aceitação P0 continua sendo um checkpoint real de dois dispositivos: PC→PC primeiro, depois PC→mobile, com até 3 jogadores, facção correta, presença visual, posse exclusiva de postos, disconnect/reconnect e um único resultado autoritativo para ações compartilhadas. Teste unitário isolado não encerra P0.
- WORLD WAR pode continuar a preparar o teatro compartilhado/múltiplos Mamutes, mas a sequência recente já produziu roster, fog-of-war de Mamutes e plano de materialização. O próximo ciclo desse workstream deve consumir essas fundações numa fatia integrada/player-facing ou orquestração real; não criar um terceiro helper paralelo sem bloqueio concreto.
- FP VISUALS + AUDIO deve converter fundações já prontas em resultado perceptível: integrar loader mecânico no renderer real, feedback de extintor/reparo/hull-hit, e aguardar evidência de Safari/iPhone antes de tuning subjetivo. Não acumular novos helpers de apresentação sem consumidor.
- ARTILLERY deve preservar AIM físico 3D no mobile e manter somente `CARGA +/-` + `DISPARAR` compactos à direita. COMBAT AI deve consumir logística/território existentes em vez de abrir outro modelo. Desktop permanece protegido em todos os casos.
