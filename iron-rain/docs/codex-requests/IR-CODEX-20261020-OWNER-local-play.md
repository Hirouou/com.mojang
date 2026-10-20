# Iron Rain — continuação local

STATUS: DONE
REQUESTER: OWNER (pedido direto nesta sessão)
RETURN_TO: LEAD
PRIORITY: P1
TYPE: FIX
BRANCH: codex/iron-rain-local-development
BASE_HEAD: f3f3f93
CLAIMED_HEAD: f3f3f93
CLAIMED_AT: 2026-10-20

## Missão

Localizar o jogo referido como “Iron War”, continuar suas melhorias e fazê-lo rodar localmente. Hospedagem no computador e servidor externo ficam para depois. Iron Rain foi confirmado na pasta `iron-rain/` da branch `iron-rain-v6-1-continuation`; o projeto AI_WAR é distinto.

## Escopo

- Um comando para cliente e autoridade local existente, SQLite persistente e encerramento seguro.
- Endpoint local automático, sem depender do antigo túnel.
- Entrada compreensível para jogar sozinho e retomar o Mamute.
- Recuperação da conexão com identidade preservada em falhas transitórias.
- Testes unitários e navegador real; entrega em branch de revisão sem deploy público.

As diretrizes de servidor/túnel de setembro são substituídas apenas onde conflitam com este pedido direto. Não alterar simulação, balística, estoques, captura, cabine ou visibilidade de intel.

## Resultado

- `npm start` inicia cliente + autoridade Node/SQLite existente com acesso apenas em loopback por padrão. `/war-api` une o fluxo na mesma origem; banco local separado de `war.sqlite` histórico.
- Endpoint local automático e menu CAMPANHA LOCAL/JOGAR SOZINHO. Endpoint antigo removido. Cópia pública sem servidor configurado orienta a abertura local, sem conectar broker ou simular outra guerra.
- Reconexão automática com espera de 500ms a 5s; falhas transitórias preservam identidade/Mamute. Somente rejeição HTTP 401 renova identidade. Tentativas simultâneas compartilham conexão; respostas tardias não reativam sessão encerrada nem repetem ações.
- README e atalho Windows atualizados; requisito Node >=24 explícito. Build `20261020-local-play`, cache `v7.37`.

## Validação

- Baseline: 766/766 testes. Entrega: **784/784 testes** em Node 24.19.0.
- `npm run test:local-browser` com Chromium real: criação local sem parâmetro de servidor, cabine 3D, disparo consumindo uma munição, mapa, desligar/reabrir processo com mesmo Mamute/identidade/munição, layouts touch 390×844 e 844×390, página pública desconfigurada e cache PWA normal. Zero erros JavaScript; nenhuma requisição externa no fluxo local.
- `tests/server-game-browser.mjs`: três contextos, dois Mamutes opostos e passageiro. Munição 18→17, dano no alvo (90→58), eventos compartilhados, porta/avatares, zoom do mapa sem alterar canvas e reconexão. Zero erros.
- Capturas reais em `test-results/local-*.png` e logs em `/workspace/scratch/iron-rain-*.log` no ambiente desta sessão; artefatos ignorados pelo Git.
- Revisão independente do proxy, encerramento, reconexão e PWA sem bloqueios. Documentado comportamento existente de recuperar tempo da guerra durante encerramento.

## Limites e continuação

Não houve deploy, alteração do banco histórico ou configuração de hospedagem. Testes mobile são emulação Chromium, sem alegar aparelho físico/Safari. Hospedagem permanente, exterior e refinamentos de gameplay permanecem para próximas etapas. Entrega revisável contra `iron-rain-v6-1-continuation`; a branch histórica não foi alterada.
