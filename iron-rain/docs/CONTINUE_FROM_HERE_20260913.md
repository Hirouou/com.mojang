# Continuação obrigatória — servidor compartilhado, 13/09/2026

## Estado e arquitetura que devem ser preservados
- Branch única: `iron-rain-v6-1-continuation`. Nunca editar `iron-rain-frontline`, nunca force-push. Fetch, comparar HEAD e ler commits antes de cada claim/push.
- A entrada pública continua https://hirouou.github.io/com.mojang/. Pages entrega somente arquivos estáticos.
- O servidor dedicado Node 24 roda no computador do Alan, autorizado pelo owner. `server/http.mjs` + `server/world.mjs` + `server/store.mjs` mantêm UMA guerra, tick sem jogadores e SQLite. Não converter isso em host de jogador, MQTT autoritativo ou simulação por aba.
- `server-config.js` contém o endpoint HTTPS do túnel temporário. Instruções de operação, processos, logs e preservação do banco: `../server/README.md`. PC ligado e internet são necessários. Não há serviço de autostart instalado; Quick Tunnel pode mudar de endereço quando reiniciado.
- Nunca apagar, publicar ou commitar `server/data/war.sqlite` nem tokens/logs. O workflow exclui `server/` do site.
- `server-crew-runtime.js` trata identidade, presença, comandos serializados/idempotentes, snapshots e eventos. `server-game-client.js` aplica a apresentação. `game-v6.js` NÃO simula novamente movimento/dano/munição/IA em modo servidor.
- Até três tripulantes por Mamute; facções distintas podem criar veículos distintos no mesmo teatro, sem código compartilhado. Código opcional no menu para ingressar depois. Criador desconectado não encerra o veículo. Identidade reconecta pelo armazenamento do mesmo navegador.
- Postos são exclusivos e validados pela autoridade. Manter caminhada primeira pessoa, manivelas físicas mobile, avatares, porta e serviços sincronizados. Avaria impede tração mas não expulsa motorista. Impacto/alarme são eventos compartilhados.
- Nunca misturar objetos congelados de capitais de apresentação com `sector.war.bases` mutáveis: isso causou a tela verde. Não remover a cabine como correção de exceção.
- Mapa de guerra usa pan/zoom do canvas, não resize CSS por gesto. Toolbar e informações ocupam linhas do layout; não reintroduzir botões flutuantes. Menu inicial e convite usam `server-ui.css`.
- Caminhões mantêm rota/progresso/posição entre checkpoints. Offset lateral chega a zero nos entroncamentos; chegada não pula para o início. Não recriar comboios em refresh ou creditar entrega duas vezes.

## Passo a passo para os próximos agentes
1. Ler este arquivo, `GITHUB_HANDOFF.md`, `MULTI_AGENT_CONTROL.md`, `CODEX_COORDINATION.md`, `AGENT_LOG.md` e solicitação READY de maior prioridade. Registrar claim no próprio arquivo. Não disputar hotspots de outro IN_PROGRESS.
2. Verificar `/health` do endpoint e a build pública ANTES de editar. Se servidor não responder, diagnosticar processo/túnel conforme README. Não substituir o jogo por modo externo, offline ou guerra falsa para esconder conexão indisponível.
3. Para alterar backend, usar banco temporário/de memória nos testes. Preservar banco real; reiniciar somente o processo identificado e verificar saúde/reconexão. Túnel só precisa reiniciar se estiver inoperante.
4. Validar três contextos independentes: dois Mamutes opostos + passageiro, disparo por UI, munição uma vez, dano no alvo e som/eventos do passageiro, porta/avatares, reconexão. Executar `tests/server-game-browser.mjs` com Playwright e frontend local (`npm start`). Não tratar counters de sala como prova de combate.
5. Executar `npm test` em Node 24. Testes incluem SQLite, dedupe, capacidade, persistência e continuidade de comboios. Screenshots de mobile devem usar viewport real e toque; conferir ausência de sobreposição e que zoom não altera tamanho CSS do canvas.
6. Publicar pequenos commits lineares, atualizar cache/build juntos, aguardar workflow Publish Iron Rain SUCCESS e verificar link público com primeira pessoa e endpoint real. Não habilitar os workflows de reescrita `iron-rain-runtime-recovery-hotfix`, `iron-rain-cabin-hotfix`, `iron-rain-green-screen-emergency`.
7. No mesmo request registrar resultados reais, testes, limitações P0–P3, evidências e commits. Handoff em AGENT_LOG. Não usar usuário como mensageiro.

## Pendências delimitadas (não declarar concluídas)
- P1: teste em dois aparelhos físicos/Internet móvel; emulação Chromium não comprova iPhone/Safari ou latência celular.
- P1: hospedagem permanente/serviço de inicialização, monitoramento e recuperação do endpoint. Hospedagem atual é temporária no PC autorizado.
- P1: auditoria de payloads estratégicos por intel/facção e redução de largura de banda. Não ampliar revelação inimiga.
- P1: evoluir ponte entre todas as frentes táticas, território, logística e rádio; não alegar que todo escopo histórico da guerra está terminado nesta entrega.
- P2: melhorar estradas/construções visuais e interpolação de tráfego. A correção de continuidade física do comboio não equivale a refazer todas as cidades.
- P2: direção artística completa da cabine foi adiada. Avatares foram refinados sem substituir os controles/rigs.
