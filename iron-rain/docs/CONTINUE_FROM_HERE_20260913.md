# Continuação obrigatória — pedido direto do owner, 13/09/2026

## Estado real e proteção da versão jogável
- Branch única: `iron-rain-v6-1-continuation`. Nunca editar `iron-rain-frontline`, nunca force-push.
- Primeira pessoa restaurada em `182a9df`. Pages verificado: cabine, WASD, pontaria e Esc funcionam. NÃO remover cabine ou converter o jogo em controles exclusivamente externos para contornar erros.
- Causa corrigida: objetos congelados de `strategicCapitals` não podem entrar em `sector.war.bases`, que recebe mutações de combate/supply. Renderer `capital-city-view.js` já consome o snapshot separado.
- Entrega seguinte neste mesmo commit: mobile usa manivelas físicas 3D, sem mostradores HTML duplicados; carga/disparo compactos à direita, sair acessível. Corrigido heartbeat da tripulação com pose null antes de entrar na cabine.
- 704 testes unitários passam; navegador desktop e mobile emulado: caminhada, posto/saída e arraste TOUCH real via CDP na manivela, sem erros de console. Teste: `tests/first-person-recovery-browser.mjs`.
- Três contextos de navegador conectaram pelo MQTT público e exibiram dois colegas em cada cabine. Isso NÃO comprova servidor persistente nem dois aparelhos físicos. O erro de pose null encontrado durante esse teste foi corrigido e coberto por regressão.
- **ATENÇÃO: bootstrap.js ainda usa crew-runtime + MQTT e salas com host. A guerra autoritativa persistente NÃO está integrada ao cliente publicado.** Testar jogadores entrando separados em Mamutes diferentes não testa o mesmo mundo ainda. Não alegar que funciona sem prova.
- O owner pediu finalizar agora por falta de tokens. Visual 3D foi explicitamente adiado. Não iniciar trabalho extra neste turno.

## Próximos passos, nesta ordem
1. LEAD: atualizar branch, reler este documento e protocolos, assumir uma missão delimitada. Restaurar coordenação após este checkpoint; manter suspensos os workflows automáticos `iron-rain-runtime-recovery-hotfix.yml`, `iron-rain-cabin-hotfix.yml`, `iron-rain-green-screen-emergency.yml`, que reescrevem código. Publicação normal `iron-rain-pages.yml` permanece ativa.
2. P0 SERVER/INTEGRAÇÃO: auditar backend existente e escolher UMA autoridade de mundo. Servidor mantém tick, tempo, facções, IDs/posições/vida dos Mamutes, projéteis e território; cliente só manda intenções. GitHub Pages hospeda apenas frontend. Publicar/configurar endpoint HTTPS/WSS real antes de declarar guerra persistente pronta. Nunca simular isso com BroadcastChannel, MQTT entre hosts ou relógio independente por aba.
3. P0 ENTRADA: cada jogador entra no mesmo mundo, escolhe facção e cria/seleciona Mamute sem código de sala obrigatório. Cada Mamute tem ID/nome único; até três ocupantes com identidade reconectável. Desconexão do criador não encerra mundo/Mamute. Reconectar restaura o mesmo veículo e estado. Preservar avatars, caminhada, manivelas, rádio, carga e munições atuais.
4. P0 COMBATE COMPARTILHADO: servidor aceita uma vez cada comando de tiro, valida dono do posto/carga/munição/alcance, resolve trajetória e dano em coordenadas do mesmo mundo. Replicar posições dos demais Mamutes, incluindo aliados; friendly fire conforme regra explícita. Clientes não aplicam dano duplicado. Replicar impacto, som interno, tremor, incêndio e alarme crítico para toda tripulação; motorista não é expulso por avaria. Destruição e respawn ficam na mesma autoridade.
5. ACEITE OBRIGATÓRIO ANTES DE PUBLISH: dois aparelhos/contextos independentes, facções opostas, sem mesma sala/código; criar dois Mamutes; colocar em alcance; atirar nas coordenadas reais do outro; confirmar mesma perda de HP e evento único nos dois clientes, inclusive passageiro em primeira pessoa. Desconectar criador, aguardar tick continuar e reconectar. Repetir PC/PC e PC/celular. Guardar logs de IDs, seq, HP antes/depois e screenshots reais. Falha significa P0 pendente, não DONE por testes de helpers.
6. P1 LOGÍSTICA: somente após P0, ligar caminhões ao estoque/rotas autoritativos existentes. Coordenadas/velocidade devem vir do tick do servidor, com interpolação visual entre snapshots; não recriar IDs ou reposicionar comboio a cada refresh/materialização. Verificar dois clientes vendo a mesma rota/carga e entrega única. Não criar terceiro modelo de logística.
7. P2 VISUAL: apenas depois, melhorar cabine conforme referência industrial low-poly (metal gasto, iluminação vermelha, corredor/motor), sem alterar controles ou colisão silenciosamente.

## Rotina de cada agente
Fetch/fast-forward e commits recentes antes de editar; reivindicar solicitação READY no próprio arquivo; evitar hotspots de missão IN_PROGRESS. Testar integração real, depois `npm test`; incrementar CLIENT_BUILD/EXPECTED_CACHE_SUFFIX e sw.js juntos quando publicar. Push normal, esperar Pages success, abrir URL público e validar cabine e fluxo alterado. Registrar resultado, evidências, problemas P0–P3, commits e próximos passos no mesmo request e AGENT_LOG. Não pedir ao owner para retransmitir tarefas.

## Trabalho não publicado
Há rascunho de backend preservado APENAS no computador do Codex, stash `codex-server-authority-wip-paused-for-green-screen-20260913`. Não presumir que existe no GitHub nem aplicar cegamente sobre centenas de commits posteriores. Não usar esse rascunho como prova de backend implantado.

URL de produção: https://hirouou.github.io/com.mojang/
