# IRON RAIN — ART DIRECTION / SLOT B

Este documento orienta melhorias visuais incrementais sobre a build atual. Ele não substitui `modules/cabin-view.js`, `modules/war-audio.js` ou os demais sistemas existentes; serve como referência para evoluí-los sem criar um renderer paralelo.

## Objetivo visual

O interior do Mamute deve parecer uma máquina blindada enorme, funcional e desgastada, mas ainda legível em primeira pessoa. A prioridade é criar profundidade, hierarquia e sensação mecânica usando a geometria low-poly, materiais procedurais e iluminação que já existem.

## 1. Interior do Mamute

- Preservar a leitura estrutural atual: casco rebitado, passagens estreitas, postos funcionais, paiol, rádio, corredor de serviço e sala do motor.
- Reforçar diferenças de função entre áreas sem mudar a planta: frente mais instrumental, centro mais operacional e traseira mais quente/suja/mecânica.
- Evitar preencher corredores com decoração que reduza a área navegável definida em `modules/cabin-controls.js`.
- Toda nova peça visual sólida deve ter colisão correspondente ou ficar claramente fora do volume caminhável.

## 2. Materiais

A paleta atual de aço esverdeado, metal escuro, latão, madeira, borracha, vermelho de emergência e luz quente deve continuar como base.

Próximos incrementos de maior valor:

1. Introduzir variação sutil de painéis: aço pintado, aço exposto nas quinas e sujeira acumulada junto ao piso.
2. Usar latão e cores claras somente como pontos de leitura em controles e instrumentos importantes.
3. Concentrar desgaste em áreas de contato: bordas de escotilhas, alças, pedais, manivelas, trilhos e quinas de bancadas.
4. Evitar ruído visual uniforme; desgaste deve explicar uso e circulação da tripulação.

## 3. Iluminação

A build já usa iluminação ambiente, luminárias quentes, luz exterior fria e flashes ligados ao disparo. A evolução deve ampliar essa separação:

- Interior normal: luz quente localizada, com cantos e teto mais escuros.
- Escotilha/abertura exterior: luz fria e ligeiramente dessaturada para separar dentro/fora.
- Sala do motor: sensação mais quente, com pequenas fontes emissivas e contraste mais alto, sem iluminar todo o corredor.
- Emergência/incêndio: vermelho deve ser pontual e pulsante, nunca transformar a cena inteira em filtro vermelho.
- Disparo: flash muito curto, intenso e localizado, seguido por retorno imediato ao nível normal para preservar leitura.

## 4. Instrumentos e HUD físico

- Priorizar informação diegética no posto correto: elevação/azimute na pontaria, estado do motor na traseira, rádio na estação de comunicações.
- Labels grandes devem servir como orientação inicial; depois, sempre que possível, deixar o próprio formato do instrumento comunicar sua função.
- Manivelas e controles devem mostrar resposta visual imediata ao input antes mesmo de a simulação terminar de reagir.
- Evitar telas digitais modernas; preferir mostradores, placas, ponteiros, escalas simples e lâmpadas de estado.

## 5. Movimento e feedback mecânico

Adicionar feedback sem comprometer conforto:

- Pequeno balanço de câmera durante marcha, sem afetar a precisão ao operar instrumentos.
- Vibração localizada no disparo e em impactos próximos, com amplitude curta.
- Movimento secundário em alças, cabos ou ponteiros deve ser barato e reutilizar objetos já existentes quando possível.
- Não usar camera shake contínuo forte; a navegação interna precisa continuar previsível.

## 6. Áudio

`modules/war-audio.js` já é a base. Direção recomendada:

- Frente: mecanismos, metal, culatra, manivelas e rádio mais presentes.
- Corredor: passos e reverberação curta de casco metálico.
- Sala do motor: grave contínuo, ventilação e vibração; reduzir inteligibilidade do exterior.
- Disparo: ataque seco interno + cauda curta de casco + componente distante exterior.
- Evitar empilhar muitos sons contínuos; usar prioridade e distância para manter clareza.

## 7. Atmosfera e VFX

- Poeira/fumaça devem aparecer em quantidades pequenas e situacionais.
- Após disparo, um resíduo breve de fumaça/poeira no interior pode reforçar massa sem esconder controles.
- Incêndio do motor deve ter luz, fumaça e áudio coerentes com `modules/engine-system.js`, sem criar um estado visual separado da lógica.
- O exterior visível por aberturas deve continuar sem revelar unidades táticas desconhecidas.

## 8. Performance mobile

- Preferir instancing, geometrias compartilhadas e texturas procedurais pequenas, como a build já faz.
- Evitar sombras dinâmicas caras em muitas fontes; usar contraste de material/luz e emissivos simples.
- Qualquer novo VFX deve ter limite explícito de partículas/objetos e vida curta.
- Antes de adicionar detalhe, verificar se ele é legível no tamanho de tela alvo.

## 9. Prioridade visual imediata

Ordem recomendada para os próximos ciclos do Slot B:

1. Melhorar hierarquia de luz entre cabine principal, abertura exterior e sala do motor.
2. Adicionar desgaste localizado nos equipamentos de maior uso.
3. Reforçar feedback visual de manivelas, culatra e disparo.
4. Diferenciar acusticamente cabine, corredor e motor usando o sistema atual.
5. Fazer revisão mobile para reduzir detalhes que custem performance sem melhorar leitura.

## Regra para concepts/mockups

Concept art, mockups ou referências criados pelo Slot B são materiais de direção e devem ser identificados como tal. Nunca apresentar concept como screenshot real da build. Screenshots reais só devem vir de uma execução/renderização real do jogo.
