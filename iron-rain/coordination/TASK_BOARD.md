# IRON RAIN — CENTRAL TASK BOARD

Este arquivo é mantido pela conta líder. Contas de desenvolvimento devem lê-lo no início de cada ciclo.

## Prioridade atual global

### P0 — Primeira pessoa / interior do Mamute
- eliminar clipping e colisões quebradas;
- melhorar navegação interna e câmera;
- melhorar visual interno, iluminação, materiais e instrumentos;
- melhorar áudio/feedback de interior;
- corrigir transições entre postos e interior/exterior;
- manter performance mobile.

### P1 — Estabilidade do loop de artilharia
- garantir controles sempre reaparecendo após disparo;
- câmera do projétil → impacto → retorno ao Mamute;
- carga/elevação realmente alterando alcance;
- readout de alcance/apex coerente com a simulação;
- caderneta clara e prática.

### P1 — Guerra viva
- soldados ocupam trincheiras e cobertura;
- supressão e coordenação de pelotão;
- evitar ondas suicidas de NPCs;
- vários fronts e bases;
- fog of war e reconhecimento;
- simulação distante eficiente.

### P2 — Visual geral e atmosfera
- efeitos de tiro/explosão/fumaça;
- terreno e trincheiras mais legíveis;
- HUD mínima e limpa;
- coerência visual do projeto.

## Regras de priorização

1. Bug que quebra gameplay > feature nova.
2. Primeira pessoa do Mamute tem precedência enquanto estiver claramente inferior ao resto.
3. Não refatore por estética técnica se não houver ganho real.
4. Não remova sistemas que funcionam para substituir por algo incompleto.
5. Pequenos ganhos acumulados são preferíveis a grandes reescritas arriscadas.

## Para a conta líder

A conta líder deve atualizar este board quando:
- um P0 for resolvido;
- surgir regressão crítica;
- a direção do usuário mudar;
- uma área ficar madura o suficiente para descer de prioridade.
