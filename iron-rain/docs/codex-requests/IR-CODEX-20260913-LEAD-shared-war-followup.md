# Consolidação do servidor já publicado
STATUS: IN_PROGRESS
PRIORITY: P1
CLAIMED_HEAD: a5a4fdd
CLAIMED_AT: 2026-09-13
OWNER_ADDENDUM: após publicação confirmada, integrar reconhecimento real de soldados/aviões ao zoom do mapa, avanço territorial real, defesa antiaérea e combates aéreos.
REQUESTER: OWNER (pedidos de integração, mobile, logística e continuidade)
RETURN_TO: LEAD
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: 96e3ba2fa1cf2a7038aaeb541cdf01457c68c7ba

## Missão delimitada
Auditar e corrigir os payloads/replicação do servidor existente, preservando a versão pública. Não criar nova autoridade ou redesenhar gameplay. O checkpoint anterior já publicou o fluxo principal; esta missão trata os limites explicitados, não deve repetir do zero.

## Passos
1. Fetch, commits recentes, ler CONTINUE_FROM_HERE_20260913.md e server/README.md. Confirmar /health e cabine no URL público. Registrar CLAIMED_HEAD/CLAIMED_AT e IN_PROGRESS neste arquivo.
2. Medir tamanho/frequência de /poll para três clientes. Identificar dados estratégicos redundantes e informação inimiga que deveria depender de intel. Usar módulos world-map-intel/local-missions existentes; filtrar no servidor sem quebrar mapa/rotas/nomes de Mamutes visíveis. Não duplicar sistemas.
3. Separar cadência de poses/combate da atualização estratégica pesada ou usar deltas versionados, mantendo estados críticos e eventos completos. Cobrir reconnect, snapshot inicial e gap de eventos. Não reduzir silenciosamente precisão de tiro/tempo.
4. Testar dois Mamutes opostos e passageiro: tiro/munição/dano únicos, motor/porta/extintor compartilhados, postos exclusivos, desconectar criador e reconectar. Testar PC e mobile emulado; se não houver aparelho físico, registrar claramente.
5. Validar caminhões em dois clientes por transição de segmento e chegada, com mesmos IDs/rotas/carga; posição contínua e entrega única. Corrigir apenas falhas reproduzidas, preservando exportState/restore.
6. npm test Node 24, teste browser integrado, capturas da UI real. Se aprovado, publicação linear normal, verificar Pages e URL real. Registrar tudo AQUI + AGENT_LOG. Não terminar com relato que exige usuário retransmitir mensagens.

## Aceite/evidências
Valores antes/depois de bytes por poll, cenários de intel bloqueado/liberado, dois clientes com mesmos IDs/HP/eventos/rotas, recuperação após desconexão. Todos os testes aprovados, zero exceções na cabine/mapa e resultado do deploy público. Documentar limitações reais.

## Fora desta missão
VPS/compra/contas, reescrita artística da cabine, novo renderer, novas armas/regras. Melhorias visuais de estradas/construções já solicitadas pelo owner devem virar fatia P2 separada após essa consolidação, com referência existente e sem mudar autoridade. Não afirmar que esta missão garante que outros agentes nunca errem.

Reserva: CODEX integra world/intel/UI; colaboração interna delimitada em server/frontline.mjs e server/air-war.mjs com testes. Não publicar outra autoridade concorrente.

## Correção incremental — interação PC, 13/09
- Owner ampliou o escopo: restaurar controles 2D mobile com alcance, coordenadas persistentes/acessíveis, eliminar fila de comandos, tiro visível e dano único; depois arte industrial PS1/PS2, exterior restrito de base com abastecimento físico, regiões carregadas localmente e simulação real compartilhada. Estes pedidos substituem as restrições artísticas/mobile anteriores; não remover primeira pessoa ou autoridade dedicada.
- Concluído neste checkpoint: pré-reivindicar posto antes de alterar câmera/captura do mouse. Claim pendente não ejeta operador livre. Mesa abre ao conceder posse.
- Evidência: tests/pc-delayed-interaction.mjs com 900ms de atraso em /command; captura preservada durante espera, mesa aberta após resposta. npm test: 719/719 (inclui 8 testes do bridge de front ainda não integrado nesta publicação).
- Arquivos desta correção: modules/cabin-view.js, modules/crew-cabin-bridge.js, bootstrap.js, sw.js, tests/pc-delayed-interaction.mjs. Build 20260913-pc-interaction / cache v7.34. Publicação em andamento; demais itens continuam IN_PROGRESS.

## Correção incremental — pontaria e mesa mobile
- Controles 2D restaurados: azimute/elevação nas laterais, carga/disparo no centro, alcance/ápice abaixo. Retrato liberado; nenhuma manivela fora da tela nos cinco tamanhos 320×568 a 844×390.
- Mesa mantém coordenada manual após fechar; recalcula régua com origem atual. Campos X/Y e confirmação no topo da caderneta mobile, conteúdo restante rola por toque sem barras.
- Testes reais Chromium touch: tests/mobile-aim-browser.mjs (altera pontaria/carga na autoridade), tests/table-map-mobile-browser.mjs (3 layouts, confirmação, persistência e gesto de rolagem). Screenshots em test-results/mobile-aim-*.png e table-map-*.png (artefatos locais ignorados). Suíte atual 739/739, inclui trabalho de servidor ainda não entregue neste lote.
- Build 20260913-mobile-aim-table / cache v7.35. Próximo lote: rede, economia, dano único, trajetórias e integração de frentes/aviação.

## Entrega incremental — rede, feedback e apresentação (2026-09-13)
- PC 13eb418 publicado via Pages 34781228310; mobile bdaa68d publicado via Pages 34781845017. Ambos preservam o endereço público.
- Build 20260913-war-feedback / cache v7.36: comandos contínuos agrupados, posições interpoladas, snapshots estratégicos versionados + gzip, economia com cache por tick. Benchmark de 30s simulados: 13.884ms -> 1.162ms, estados finais idênticos; amostra inicial de poll 132.885B completo / 2.962B delta / 1.047B comprimido. Não representam todos os tamanhos de batalha.
- Trajetórias replicadas visíveis e câmera acompanha somente disparo do próprio operador. Dano de impacto discreto; incêndio não drena mais casco/motor a cada tick. Motor ainda precisa de reparo para tração.
- Frentes ligadas à captura e consumo finito; morteiros fixos, aviação/AA autoritativas; observações de rádios e aeronaves expiram. Visão local por hexágonos, estradas em coordenadas mundiais e interpolação visual de comboios.
- Arte industrial da cabine, tripulantes e motorista sentado, armários com munição finita visível; lobby e menu mobile reorganizados com rolagem nativa e convite.
- Validação: npm test 766/766; testes browser reais de lobby/menu em quatro viewports, munição 18->17->0->18 sem crescimento de geometria. Browser de três clientes será registrado ao concluir a publicação. Emulação Chromium, sem afirmar teste em aparelho físico.
- P0: interações PC/mobile corrigidas nas entregas anteriores. P1 pendente: validar exterior completo e estreitar payload regional/informação inimiga. P2: calibrar desempenho em aparelhos reais e túnel temporário. P3: refinamento artístico contínuo.
- Backend da estação/reabastecimento está coberto por testes; UI exterior ainda fora desta build. Não declarar funcionalidade acessível antes da integração seguinte.
- Arquivos/commit: consultar o commit desta seção; alterações limitadas aos módulos de cliente, servidor, estilos, cache e respectivos testes. Nenhuma dependência paga, autoridade adicional ou branch histórica alterada.
- Recomendação: seguir o checkpoint seguinte; manter DB e URL do túnel, não resetar a guerra nem converter servidor em host de jogador.
