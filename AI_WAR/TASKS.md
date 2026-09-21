# AI WAR — 5 AI Assignments

A guerra terá **exatamente 5 participantes de IA**.

- **3 IAs de Inteligência da Guerra** — não comandam tropas. Observam os registros autorizados e entregam ao humano relatórios independentes sobre o que está acontecendo.
- **2 IAs Combatentes** — são os únicos agentes que comandam tropas. Existe exatamente **1 IA por time**: BLUE e RED.

## Tarefa 1 — Inteligência de Guerra A
**Função:** observador/analista independente.

- [ ] Receber somente as informações autorizadas pela Governadora.
- [ ] Analisar acontecimentos, recursos, território, construções, batalhas e mudanças estratégicas.
- [ ] Produzir relatórios objetivos para o humano.
- [ ] Não comandar unidades.
- [ ] Não alterar o estado do jogo.
- [ ] Não fornecer vantagem secreta diretamente a uma facção.
- [ ] Registrar fatos separados de interpretações/análises.

## Tarefa 2 — Inteligência de Guerra B
**Função:** segundo observador/analista independente.

- [ ] Receber somente as informações autorizadas pela Governadora.
- [ ] Acompanhar a evolução da guerra de forma independente da Tarefa 1.
- [ ] Produzir relatórios sobre eventos importantes, perdas, recursos, território, construções e evolução das estratégias.
- [ ] Não comandar unidades.
- [ ] Não alterar o estado do jogo.
- [ ] Não acessar informações privadas de nenhuma IA combatente.
- [ ] Manter sua própria linha de análise para comparação posterior.

## Tarefa 3 — Inteligência de Guerra C
**Função:** terceiro observador/analista independente.

- [ ] Receber somente os dados autorizados.
- [ ] Identificar mudanças importantes no curso da guerra.
- [ ] Acompanhar evolução tecnológica, logística, infraestrutura e comportamento estratégico.
- [ ] Produzir relatórios periódicos para o humano.
- [ ] Não comandar unidades.
- [ ] Não alterar o estado do jogo.
- [ ] Não favorecer BLUE ou RED.
- [ ] Ajudar a preservar uma visão histórica da guerra.

## Tarefa 4 — IA Combatente BLUE
**Função:** comandante autônomo da facção BLUE.

- [ ] Ser a única IA responsável pelas decisões da BLUE.
- [ ] Receber apenas a visão permitida da BLUE.
- [ ] Decidir movimentação, combate, exploração, recursos, construção e demais ações disponíveis.
- [ ] Desenvolver e adaptar estratégias ao longo da guerra.
- [ ] Usar somente mecânicas existentes no jogo.
- [ ] Não acessar informações ocultas da RED.
- [ ] Não alterar diretamente o estado do jogo.
- [ ] Registrar decisões estratégicas importantes.
- [ ] Não pode haver outra IA combatente na BLUE.

## Tarefa 5 — IA Combatente RED
**Função:** comandante autônomo da facção RED.

- [ ] Ser a única IA responsável pelas decisões da RED.
- [ ] Receber apenas a visão permitida da RED.
- [ ] Decidir movimentação, combate, exploração, recursos, construção e demais ações disponíveis.
- [ ] Desenvolver e adaptar estratégias ao longo da guerra.
- [ ] Usar somente mecânicas existentes no jogo.
- [ ] Não acessar informações ocultas da BLUE.
- [ ] Não alterar diretamente o estado do jogo.
- [ ] Registrar decisões estratégicas importantes.
- [ ] Não pode haver outra IA combatente na RED.

## Regra de distribuição dos combatentes

Existem somente **2 times**:

- BLUE → 1 IA combatente
- RED → 1 IA combatente

Se uma IA for aceita como combatente em um time, a próxima IA combatente deverá ocupar o outro time.

**Nunca colocar duas IAs combatentes no mesmo time.**

As 3 IAs de inteligência não ocupam times e não participam diretamente do combate.

## Governança

A Governadora Nina mantém a autoridade neutra sobre:

- regras;
- permissões;
- observação;
- validação das ações;
- violações;
- registro oficial;
- distribuição dos times;
- preservação do histórico da guerra.

Nenhuma IA participante pode alterar essas regras por conta própria.

## Objetivo de longo prazo

A guerra deve poder continuar por semanas ou meses.

O sistema deverá preservar:

- decisões das duas facções;
- batalhas;
- perdas;
- recursos;
- território;
- construções;
- tecnologias;
- logística;
- mudanças estratégicas;
- relatórios das três IAs de inteligência;
- eventos importantes da guerra.

O objetivo é que, ao retornar ao projeto depois de um longo período, seja possível reconstruir o que aconteceu e observar como as duas IAs combatentes evoluíram.
