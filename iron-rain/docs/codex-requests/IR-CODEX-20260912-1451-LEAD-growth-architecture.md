# IR-CODEX-20260912-1451-LEAD-growth-architecture

STATUS: READY
REQUESTER: LEAD / ARCHITECTURE
RETURN_TO: LEAD + FP SYSTEMS + WORLD WAR
PRIORITY: P1
TYPE: CROSS_SYSTEM_ARCHITECTURE_AUDIT
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: ef4eab173655468ac7fec079787133a347eabc41

## MISSÃO
Fazer uma auditoria profunda da build atual e propor a sequência técnica mínima, modular e segura para levar Iron Rain do estado atual ao primeiro vertical slice integrado de: multiplayer de até 3 tripulantes por Mamute + saída em primeira pessoa + exterior/base local + primeira logística física de reabastecimento, sem destruir a simulação estratégica existente.

## CONTEXTO OBRIGATÓRIO
Leia `iron-rain/docs/IRON_RAIN_VISION.md` antes da análise. A meta não é desenhar um jogo novo nem substituir a arquitetura atual. A meta é descobrir como crescer a build real de hoje até a visão maior preservando PC/mobile, estética low-poly e a guerra distante existente.

## FAZER
- atualizar para o HEAD mais recente antes de começar;
- inspecionar `game-v6.js`, `modules/cabin-view.js`, `modules/cabin-controls.js`, `modules/engine-system.js`, `modules/war-simulation.js`, `modules/table-map.js`, `modules/war-audio.js` e quaisquer módulos que realmente participem do fluxo atual;
- identificar estado/funções que hoje representam jogador, Mamute, interior, base, munição, guerra e transições;
- mapear quais sistemas precisam ser separados/normalizados antes do multiplayer;
- propor uma arquitetura de autoridade/sincronização adequada ao estado atual, sem exigir reescrita total;
- propor como representar até 3 avatares visíveis dentro do mesmo Mamute inicialmente;
- propor como transformar interior → exterior local → base → interior em uma máquina de estados coerente e extensível;
- propor como materializar uma bolha 3D local perto de base/Mamute enquanto `war-simulation` continua responsável pelo mundo distante;
- propor a primeira cadeia de reabastecimento sem economia: estoque de base → caixa/carga representativa → transporte pelo jogador → ponto de entrega do Mamute → estoque interno;
- identificar riscos de mobile/performance, colisão, câmera e sincronização;
- indicar os arquivos/módulos que deveriam ser criados ou refatorados, mas NÃO escrever código nesta missão;
- entregar uma ordem de implementação em fatias pequenas que mantenham a build jogável a cada etapa;
- marcar P0/P1/P2/P3 para riscos descobertos.

## NÃO FAZER
- não implementar código;
- não recriar o projeto do zero;
- não propor engine/biblioteca externa obrigatória sem justificar fortemente compatibilidade com a build atual;
- não transformar o mapa em informação onisciente;
- não editar `iron-rain-frontline`;
- não usar force-push;
- não criar dados/tabelas reais de armas.

## CRITÉRIOS DE ACEITE
- plano baseado no código REAL atual, não em arquitetura genérica;
- sequência clara do primeiro multiplayer jogável até logística física;
- pontos exatos de integração com a guerra estratégica atual;
- proposta de como manter PC/mobile viáveis;
- identificação de dependências e riscos antes de qualquer reescrita;
- resultado devolvido neste mesmo arquivo com recomendação final para LEAD.

## DECISÃO DE DIREÇÃO
A prioridade imediata continua sendo multiplayer de 3 jogadores com presença visual em primeira pessoa. Esta missão deve impedir que essa implementação vire um beco sem saída para exterior, bases, logística e guerra persistente.