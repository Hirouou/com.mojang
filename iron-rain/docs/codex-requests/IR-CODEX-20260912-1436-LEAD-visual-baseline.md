# IR-CODEX-20260912-1436-LEAD-visual-baseline

STATUS: READY
REQUESTER: LEAD / VISUAL DIRECTION
RETURN_TO: FP VISUALS + AUDIO
PRIORITY: P1
TYPE: VISUAL_QA_SCREENSHOTS
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: aeffd268f22030c3c5280568fb7c26d7bf340672

## MISSÃO
Criar um baseline visual REAL da build atual em navegador para orientar a próxima rodada de direção de arte do interior do M-47 Mamute. Não alterar gameplay.

## CONTEXTO
A inspeção estática de `modules/cabin-view.js` mostra uma cabine low-poly deliberadamente escura, com três luminárias quentes no teto, luz fria próxima da abertura exterior, ACES tone mapping e materiais procedurais. Os agentes já registraram como próxima prioridade a hierarquia de luz entre cabine principal, abertura exterior fria e sala do motor, mas não há screenshots reais disponíveis para a direção visual julgar exposição, leitura espacial e contraste. Concept art não deve substituir evidência da build.

## FAZER
- atualizar para o HEAD mais recente da branch ativa antes de abrir a build;
- abrir a build real em navegador usando o fluxo descrito em `GITHUB_HANDOFF.md`;
- capturar screenshots sem pós-processamento externo, em resolução desktop, de pelo menos: (1) visão inicial/centro da cabine, (2) olhando para a abertura exterior, (3) corredor/escotilha, (4) sala do motor, (5) posto do artilheiro/painel mais importante;
- se o runtime permitir, repetir uma captura representativa em viewport mobile;
- registrar para cada captura se há clipping visual, áreas esmagadas no preto, luz estourada, painel ilegível, falta de separação entre planos ou objeto visual que pareça atravessável mas possua colisão inesperada;
- registrar FPS aproximado/console somente como contexto, sem profiling profundo;
- anexar/registrar caminhos ou links das evidências neste arquivo e marcar PASS/PARTIAL/BLOCKED.

## NÃO FAZER
- não gerar concept art e chamar de screenshot;
- não editar `iron-rain-frontline`;
- não mudar materiais, luzes ou geometria nesta missão;
- não introduzir assets externos;
- não usar force-push.

## CRITÉRIOS DE ACEITE
- conjunto de screenshots reais suficiente para comparar os cinco pontos de vista;
- avaliação objetiva de legibilidade e hierarquia de luz;
- identificação dos 3 problemas visuais de maior impacto, em ordem;
- evidência de mobile se disponível;
- resultado devolvido neste mesmo arquivo.

## DECISÃO DE DIREÇÃO ATÉ O RETORNO
Não aumentar indiscriminadamente a quantidade/intensidade de luz nem adicionar novas peças sólidas à cabine. A próxima mudança visual deve ser escolhida a partir das capturas reais, priorizando leitura espacial e hierarquia de luz com as fontes existentes antes de acrescentar detalhe decorativo.
