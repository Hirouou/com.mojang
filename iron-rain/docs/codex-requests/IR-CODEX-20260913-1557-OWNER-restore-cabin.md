# IR-CODEX-20260913-1557-OWNER-restore-cabin

STATUS: IN_PROGRESS
REQUESTER: OWNER (pedido direto, prioridade sobre fila anterior)
RETURN_TO: LEAD
PRIORITY: P0
TYPE: FIX
BRANCH: iron-rain-v6-1-continuation
CLAIMED_HEAD: 99607a3
CLAIMED_AT: 2026-09-13T15:57:56-03:00

## MISSÃO
Restaurar imediatamente a primeira pessoa no Mamute, caminhada, postos e fluxo de tripulação existente. Corrigir a tela verde/fallback externo pela causa, testar no navegador e publicar no mesmo Pages. Depois melhorar o interior 3D conforme referência industrial low-poly do usuário.

## CONTROLE EXCLUSIVO SOLICITADO PELO OWNER
O usuário pediu explicitamente interromper outros agentes/células que interfiram. LEAD e Slots: suspendam alterações e publicações concorrentes durante esta recuperação. Não removam a cabine, controles, multiplayer ou sincronização. Não executem workflows que reescrevam código automaticamente. Codex assume esta recuperação; comunicar somente pelo GitHub.

## ACEITE E EVIDÊNCIA
- Entrada mostra interior 3D real; movimento e interação funcionam, sem exceções de atualização.
- Preservar fluxo de tripulação e verificar sincronização existente, relatando limites reais.
- Publicar e verificar mesmo URL https://hirouou.github.io/com.mojang/.
- Screenshots reais desktop/mobile, testes de regressão e logs.
- Sem force-push, sem editar branch histórica ou expandir features.

## CHECKPOINT
- Causa reproduzida: projeções congeladas de capitais inseridas em war.bases mutáveis; syncCombatSustainment tenta escrever supply e aborta frame. Hotfix recente converte qualquer erro de frame em cabinFailed permanente.
- Workflows automáticos de reescrita runtime-recovery/cabin-hotfix/green-screen-emergency desativados. Publicação Pages normal preservada.
- Trabalho anterior de servidor preservado em stash codex-server-authority-wip-paused-for-green-screen-20260913, sem aplicar nesta recuperação.
