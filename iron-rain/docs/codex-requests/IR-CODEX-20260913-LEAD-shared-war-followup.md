# Consolidação do servidor já publicado
STATUS: READY
PRIORITY: P1
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
