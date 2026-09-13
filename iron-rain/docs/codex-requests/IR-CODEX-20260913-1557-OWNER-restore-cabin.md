# IR-CODEX-20260913-1557-OWNER-restore-cabin

STATUS: DONE
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

## RESULTADO FINAL — escopo encerrado pelo owner por falta de tokens
- Primeira pessoa corrigida e publicada em `182a9df`; Pages 34776519837 success e teste de navegador público desktop/mobile sem erros. Caminhada, manivelas e Esc verificados.
- Mobile corrigido nesta entrega: sem dials duplicados, controles compactos, arraste físico touch e saída testados. Heartbeat de lobby não lança erro por pose null. 704 testes passam.
- Melhoria visual adiada explicitamente pelo owner; não é declarada concluída.
- Handoff obrigatório: `docs/CONTINUE_FROM_HERE_20260913.md`, com ordem SERVER/entrada/combate compartilhado, critérios de aceite, logística e visual.
- P0 pendente FORA deste fechamento: servidor persistente e dano entre Mamutes de sessões independentes. Transporte atual ainda tem host. P1: teste real de dois aparelhos e logística sem teleporte. P2: visual adiado. P3: nenhum novo conhecido nesta correção.
- Arquivos: war-simulation, cabin-controls, CSS mobile, bootstrap/sw, testes de capital/crew/mobile/browser e documentação. Commit da primeira pessoa: 182a9df; restante neste commit de fechamento.
- Evidências: testes reais em test-results/recovery-public.log, recovery-local.log, recovery-unit.log e screenshots recovery-desktop/mobile, mobile-aim-restored.png no ambiente Codex. Não são prova de aparelho físico.
- Recomendação: seguir o roteiro, não declarar servidor existente até teste ponta a ponta. Comunicação permanece GitHub-only.
- Causa reproduzida: projeções congeladas de capitais inseridas em war.bases mutáveis; syncCombatSustainment tenta escrever supply e aborta frame. Hotfix recente converte qualquer erro de frame em cabinFailed permanente.
- Workflows automáticos de reescrita runtime-recovery/cabin-hotfix/green-screen-emergency desativados. Publicação Pages normal preservada.
- Trabalho anterior de servidor preservado em stash codex-server-authority-wip-paused-for-green-screen-20260913, sem aplicar nesta recuperação.
