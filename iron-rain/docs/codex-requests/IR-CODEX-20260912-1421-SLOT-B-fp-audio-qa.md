# IR-CODEX-20260912-1421-SLOT-B-fp-audio-qa

STATUS: READY
REQUESTER: SLOT B
RETURN_TO: FP VISUALS + AUDIO
PRIORITY: P2
TYPE: QA
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: 457a2ab38ce50a210b06d7a2211b80b1bcb12874

## MISSÃO
Validar em navegador a nova cauda metálica curta dos passos internos e a resposta recente do grave do motor à velocidade, procurando clipping, volume excessivo, spam de vozes ou perda de inteligibilidade dos demais efeitos.

## POR QUE CODEX
O runtime atual do Slot B não consegue clonar/materializar o repositório via github.com, então não consegue executar `npm test`, `tests/v7-browser.mjs` nem escutar a build real. Esta missão exige QA de navegador/áudio real.

## FAZER
- abrir a build atual em navegador pela branch ativa;
- caminhar dentro da cabine e confirmar que cada passo recebe somente uma cauda metálica curta, sem eco longo ou sobreposição perceptível;
- confirmar que movimento fora da cabine não produz o mesmo passo interno;
- dirigir/variar a velocidade do Mamute e confirmar que o grave interno muda de forma gradual sem mascarar rádio, tiro ou mecanismos;
- observar console e performance básica durante caminhada contínua;
- registrar resultado e evidência objetiva neste mesmo arquivo.

## NÃO FAZER
- não expandir escopo;
- não editar iron-rain-frontline;
- não implementar feature não solicitada;
- não usar force-push;
- não alterar gameplay nesta missão de QA.

## CRITÉRIOS DE ACEITE
- passos internos soam metálicos e curtos, sem cauda longa/reverb contínuo;
- não há crescimento perceptível de vozes/CPU após caminhada prolongada;
- áudio externo não recebe o passo interno;
- grave do motor continua reativo à velocidade e os demais efeitos permanecem legíveis;
- nenhum erro novo no console ligado ao Web Audio.

## EVIDÊNCIA ESPERADA
Passos de reprodução, resultado pass/fail por critério, observações de áudio/performance e logs de console se houver falha.
