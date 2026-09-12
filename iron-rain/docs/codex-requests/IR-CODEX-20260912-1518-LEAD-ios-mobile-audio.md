# IR-CODEX-20260912-1518-LEAD-ios-mobile-audio

STATUS: READY
REQUESTER: LEAD
RETURN_TO: LEAD + FP VISUALS + AUDIO
PRIORITY: P1
TYPE: BUG_REPRO
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: fa4c5ac6a9e019915684a6185a33db8042244cc6

## MISSÃO
Reproduzir e diagnosticar ausência total de áudio na build mobile do Iron Rain em iPhone/Safari, usando a build atual da branch ativa. O usuário testou no iPhone, retirou o aparelho do silencioso e elevou os sliders de Volume Geral, Efeitos e Ambiente, mas continua sem ouvir som.

## CONTEXTO DE CAMPO
Relato confirmado pelo usuário em iPhone:
- o jogo ficou sem som mesmo quando `♪ ÁUDIO · ON` estava ativo;
- alternar ON → OFF não produziu qualquer diferença audível;
- o screenshot anterior mostrava OFF apenas porque ele esqueceu de voltar para ON antes de capturar;
- portanto NÃO tratar o caso como simples mute/configuração do usuário;
- aparelho fora do silencioso;
- Volume Geral em 100%;
- Efeitos em 150%;
- Ambiente em 100%.

O sistema atual usa Web Audio em `modules/war-audio.js`. `game-v6.js` chama `audio.wake()` em `pointerdown` e no teclado; o botão `audioBtn` usa `audio.toggle()`. Em iOS, validar explicitamente a exigência de gesto do usuário, estado `suspended/running`, persistência do mute e retorno após background/visibility changes.

## FAZER
- atualizar para o HEAD mais recente antes de começar;
- ler `GITHUB_HANDOFF.md`, `IRON_RAIN_VISION.md`, `MULTI_AGENT_CONTROL.md`, `AGENT_LOG.md` e `CODEX_COORDINATION.md`;
- partir da hipótese de BUG REAL de mobile/iOS, pois o usuário já confirmou teste com áudio em ON;
- testar o fluxo mobile equivalente a iPhone/Safari: abrir build, tocar no jogo, abrir SOM, confirmar ON, mexer sliders, fechar menu, caminhar, operar manivela, recarregar e/ou disparar;
- observar `AudioContext.state` antes/depois do gesto e após retornar de background/menu;
- verificar se `pointerdown`/`click` usado para ligar áudio é aceito como user activation no Safari iOS;
- verificar se `loadSettings()` restaura mute/contexto corretamente e se há condição onde o contexto nunca acorda;
- testar se o contexto chega a `running` mas o grafo continua mudo;
- verificar destino/conexões master/limiter/buses e comportamento de `webkitAudioContext` no iOS;
- registrar reprodução, causa provável/confirmada e correção recomendada;
- se a causa estiver clara e a correção for pequena, segura e diretamente ligada a este bug, pode implementar FIX mínimo, com teste/regressão e handoff. Se não houver ambiente real equivalente, retornar BLOCKED com evidência e diagnóstico estático, sem inventar validação.

## NÃO FAZER
- não mexer em mixagem subjetiva dos efeitos além do necessário para restaurar áudio;
- não reescrever o sistema de áudio;
- não editar `iron-rain-frontline`;
- não usar force-push;
- não alterar gameplay alheio ao bug.

## CRITÉRIOS DE ACEITE
- em mobile, após um gesto explícito do jogador e áudio em ON, `AudioContext` deve ficar `running` quando suportado;
- o jogador deve ouvir pelo menos motor/ambiente e um efeito acionável;
- ON/OFF deve produzir diferença audível real;
- retornar causa, teste, evidência e qualquer commit de correção.

## EVIDÊNCIA ESPERADA
Passos de reprodução, estado do AudioContext, resultado em mobile/Safari ou limitação do ambiente, screenshots/logs quando possível e conclusão clara PASS/FAIL.