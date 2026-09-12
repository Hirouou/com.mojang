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
