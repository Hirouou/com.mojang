# IR-CODEX-20260912-1620-LEAD-persistent-war-authority

STATUS: READY
REQUESTER: LEAD
RETURN_TO: LEAD
PRIORITY: P1
TYPE: INVESTIGATION
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: 926b70c8161c0214082d7746ce0a6e3e59738b9b

## MISSÃO
Definir e, se couber sem bloquear o P0 de transporte multiplayer, preparar a menor arquitetura viável para que a guerra compartilhada do Iron Rain continue avançando mesmo quando um jogador sai do Mamute ou nenhum cliente específico permanece como host da tripulação.

## CONTEXTO NOVO JÁ IMPLEMENTADO
- `modules/theatre-control.js`: linha territorial contínua; aliado a oeste, inimigo a leste, zona contestada na fronteira.
- `modules/territory-development.js`: território seguro + entregas físicas + projetos + fábricas + comboios; construção não acontece sem materiais entregues.
- `modules/crew-session.js`: host autoritativo APENAS para a tripulação do Mamute, máximo 3 jogadores; não deve virar autoridade da guerra global.
- `modules/crew-station-authority.js`: impede dois tripulantes de operarem o mesmo posto físico.

## POR QUE CODEX
A decisão de autoridade persistente depende do transporte/backend que será escolhido no P0 `IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport.md`. Precisamos evitar amarrar a guerra ao navegador do host e evitar escolher infraestrutura incompatível com GitHub Pages/iPhone.

## FAZER
- Consumir primeiro o resultado do pedido P0 de transporte, se já estiver DONE.
- Propor o menor backend/authority compatível com o transporte escolhido.
- Separar claramente: sessão de tripulação/Mamute vs estado persistente do teatro.
- O estado persistente deve suportar: relógio de guerra, linha territorial, controle de território, bases/estruturas, estoques, comboios/logística, forças/IA e Mamutes persistentes.
- Definir snapshot + eventos/commands suficientes para reconectar sem depender do `performance.now()` de um cliente.
- Definir estratégia de catch-up/offline tick: guerra deve avançar por tempo autoritativo, com limites para não simular milhões de frames.
- Considerar host migration apenas para tripulação se necessário; não usar o host da tripulação como servidor permanente da guerra.
- Se houver uma opção simples e comprovável de implementação no ambiente atual, preparar adaptadores isolados; caso contrário, entregar plano técnico objetivo com riscos/custos.

## NÃO FAZER
- não editar `iron-rain-frontline`;
- não transformar `cabin-view.js`/`cabin-controls.js` em networking;
- não acoplar mundo persistente a um único telefone/PC;
- não criar economia mágica: materiais precisam viajar por comboios/rotas;
- não expor posição inimiga global/omnisciente ao jogador;
- não reescrever `war-simulation.js` inteiro.

## CRITÉRIOS DE ACEITE
- Existe uma fronteira explícita entre autoridade de tripulação e autoridade de mundo.
- Sair de um jogador não é condição para parar o relógio da guerra.
- Reconexão consegue reconstruir um snapshot consistente do teatro.
- A arquitetura comporta linha de frente contínua e desenvolvimento/logística supply-gated já adicionados.
- Há um caminho incremental da build atual para o mundo persistente sem refactor gigante.

## EVIDÊNCIA ESPERADA
- diagrama textual/contratos de mensagens e armazenamento;
- arquivos/adaptadores se implementados;
- riscos de iPhone/GitHub Pages/backend;
- recomendação clara da próxima implementação após o multiplayer P0.
