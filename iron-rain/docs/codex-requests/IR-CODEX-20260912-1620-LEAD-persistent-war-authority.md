# IR-CODEX-20260912-1620-LEAD-persistent-war-authority

STATUS: READY
REQUESTER: LEAD
RETURN_TO: LEAD
PRIORITY: P1
TYPE: INVESTIGATION
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: 51422fac0f474512cc87a8c35cce85dbf33435c2

## MISSÃO
Definir e, se couber sem bloquear o P0 de transporte multiplayer, preparar a menor arquitetura viável para que a guerra compartilhada do Iron Rain continue avançando mesmo quando um jogador sai do Mamute ou nenhum cliente específico permanece como host da tripulação.

## VISÃO ATUALIZADA DO USUÁRIO
O mapa estratégico deve funcionar em regiões hexagonais grandes, cada região contendo vários setores menores capturáveis. Um hex só é completamente dominado depois que seus setores internos forem dominados. O mapa começa dividido aproximadamente entre as duas facções, com uma fronteira coerente; forças regulares não devem aparecer magicamente atrás da linha inimiga, salvo infiltração/partisans/recon explícitos. Ambas as facções usam as MESMAS regras de IA, construção, logística, alcance e escassez.

O mapa-múndi deve permitir escolher fronts para apoiar, mas informação remota depende de rádio/recon. Missões de campo chegam principalmente perto do jogador; ordens estratégicas remotas podem chegar por rádio. Munição e materiais são finitos: um Mamute não recarrega numa base vazia e uma base não constrói sem caminhões/rotas entregando recursos.

## CONTEXTO NOVO JÁ IMPLEMENTADO
- `modules/theatre-control.js`: linha territorial contínua; aliado a oeste, inimigo a leste, zona contestada na fronteira.
- `modules/theatre-sectors.js`: fronts táticos coerentes derivados da mesma linha.
- `modules/strategic-hex-map.js`: mapa estratégico em hexes; cada hex tem 7 setores; captura completa só quando todos os setores pertencem à facção; deployment regular atrás das linhas é bloqueado, com exceção explícita para partisan/recon.
- `modules/world-map-intel.js`: visibilidade estratégica baseada em rádio/reports, sem minimapa inimigo onisciente.
- `modules/local-missions.js`: missões comuns por proximidade; ordens remotas só por rádio/contexto.
- `modules/territory-development.js`: território seguro + entregas físicas + projetos + fábricas; construção não acontece sem materiais entregues.
- `modules/territory-ai.js`: planejador genérico para qualquer facção, sem bônus lado-específico; testes exigem simetria ally/enemy.
- `modules/strategic-logistics.js`: rede de rotas/nós/convoys; rota cortada bloqueia comboio e recursos não teleportam.
- `modules/mamute-logistics.js`: munição embarcada finita e reabastecimento apenas por ponto físico amigável com estoque real.
- `modules/persistent-war-clock.js`: catch-up estratégico por wall-clock, separado de requestAnimationFrame/performance.now().
- `modules/crew-session.js`: host autoritativo APENAS para a tripulação do Mamute, máximo 3 jogadores; não deve virar autoridade da guerra global.
- `modules/crew-station-authority.js`: impede dois tripulantes de operarem o mesmo posto físico.
- `modules/mamute-command-authority.js`: valida comandos de drive/aim/fire/load/service contra posse do posto, permitindo motorista e artilheiro simultâneos sem roubarem controles.

## POR QUE CODEX
A decisão de autoridade persistente depende do transporte/backend que será escolhido no P0 `IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md`. Precisamos evitar amarrar a guerra ao navegador do host e evitar escolher infraestrutura incompatível com GitHub Pages/iPhone.

## FAZER
- Consumir primeiro o resultado do pedido P0 de transporte, se já estiver DONE.
- Propor o menor backend/authority compatível com o transporte escolhido.
- Separar claramente: sessão de tripulação/Mamute vs estado persistente do teatro.
- O estado persistente deve suportar: relógio de guerra, hexes/setores, linha territorial, controle de território, bases/estruturas, estoques, rotas/convoys/logística, forças/IA, rádio/intel e Mamutes persistentes.
- Definir snapshot + eventos/commands suficientes para reconectar sem depender do `performance.now()` de um cliente.
- Definir estratégia de catch-up/offline tick: guerra deve avançar por tempo autoritativo, com limites para não simular milhões de frames.
- Preservar SIMETRIA de facções: mesmas regras e capacidades básicas; diferença vem da situação/logística/território, não de cheats por lado.
- Preservar SCARCITY: disparos consomem munição embarcada, bases consomem estoque, construção consome materiais, convoys podem ser bloqueados/destruídos.
- Considerar host migration apenas para tripulação se necessário; não usar o host da tripulação como servidor permanente da guerra.
- Se houver opção simples e comprovável de implementação no ambiente atual, preparar adaptadores isolados; caso contrário, entregar plano técnico objetivo com riscos/custos.

## NÃO FAZER
- não editar `iron-rain-frontline`;
- não transformar `cabin-view.js`/`cabin-controls.js` em networking;
- não acoplar mundo persistente a um único telefone/PC;
- não criar economia mágica: materiais/munição precisam viajar por rotas/convoys;
- não expor posição inimiga global/omnisciente ao jogador;
- não criar regras diferentes para IA aliada e inimiga;
- não reescrever `war-simulation.js` inteiro.

## CRITÉRIOS DE ACEITE
- Existe uma fronteira explícita entre autoridade de tripulação e autoridade de mundo.
- Sair de um jogador não é condição para parar o relógio da guerra.
- Reconexão consegue reconstruir um snapshot consistente do teatro.
- A arquitetura comporta hexes com sub-setores, fronteira contínua, rádio/intel parcial e logística física supply-gated.
- O mesmo motor de IA/desenvolvimento funciona para ally e enemy.
- Há um caminho incremental da build atual para o mundo persistente sem refactor gigante.

## EVIDÊNCIA ESPERADA
- diagrama textual/contratos de mensagens e armazenamento;
- arquivos/adaptadores se implementados;
- riscos de iPhone/GitHub Pages/backend;
- recomendação clara da próxima implementação após o multiplayer P0.
