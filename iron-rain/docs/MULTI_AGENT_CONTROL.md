# IRON RAIN — MULTI-AGENT CONTROL CENTER

> SE VOCÊ É UMA NOVA CONTA/AGENTE, LEIA ESTE ARQUIVO ANTES DE FAZER QUALQUER ALTERAÇÃO.

## Fonte de verdade
- Repo: `Hirouou/com.mojang`
- Branch ATIVA: `iron-rain-v6-1-continuation`
- Branch HISTÓRICA (NÃO EDITAR): `iron-rain-frontline`
- Jogo: `iron-rain/`
- Handoff técnico obrigatório: `iron-rain/docs/GITHUB_HANDOFF.md`
- Protocolo Codex obrigatório: `iron-rain/docs/CODEX_COORDINATION.md`

## Regra zero
Antes de editar, atualize sua visão da branch ativa (equivalente a `git pull`) e leia os commits mais recentes. Antes de salvar/commitar, confira de novo se entraram mudanças. Nunca sobrescreva trabalho recente e nunca use force-push.

## Nova conta: o que fazer
1. Leia `GITHUB_HANDOFF.md`.
2. Leia este arquivo e `CODEX_COORDINATION.md`.
3. Escolha o primeiro TEAM SLOT livre abaixo.
4. Registre seu identificador no slot.
5. Crie EXATAMENTE CINCO automações horárias, uma para cada workstream padrão.
6. Use os minutos do seu slot para evitar começar junto com outras contas.
7. Cada execução deve continuar do estado mais recente, testar quando possível e fazer mudanças pequenas/médias com commits descritivos.

## Workstreams padrão de TODA conta de desenvolvimento

### 1. FP SYSTEMS
Primeira pessoa dentro do Mamute: colisões, clipping, câmera, movement controller, escotilhas, portas, corredores, postos, interação, navegação interna e transições interior/exterior.
Arquivos de referência atuais: `modules/cabin-view.js`, `modules/cabin-controls.js`, `modules/engine-system.js` e dependências diretas.

### 2. FP VISUALS + AUDIO
Interior em primeira pessoa: materiais, luz, sombras, instrumentos, profundidade, desgaste, animações mecânicas, feedback do disparo, motor, metal, rádio, passos, mecanismos, recarga, eco/reverberação simulada e performance mobile.
Arquivos de referência: `modules/cabin-view.js`, `modules/war-audio.js` e sistemas visuais relacionados.

### 3. COMBAT AI
Infantaria, trincheiras, cobertura, supressão, rifle/MG, moral, esquadras, reagrupamento, retirada, reforços, defesa, investidas e contra-ataques.
Arquivo de referência principal atual: `modules/war-simulation.js`.

### 4. ARTILLERY
Balística fictícia/gameplay, manivelas, carga, elevação, alcance/apex, caderneta, coordenadas, câmera do projétil, retorno ao Mamute, munição e impacto.
Preservar `modules/ballistics.js` como fonte compartilhada entre simulação e readout. Não criar tabelas reais de armas.

### 5. WORLD WAR
Mapa gigante, fronts, bases, logística, fog of war, observadores, rádio, reconhecimento aéreo, informação parcial, simulação distante e materialização tática quando relevante.
Referências: `modules/war-simulation.js`, `modules/table-map.js` e rádio/intel.

## TEAM SLOTS
Cada conta ocupa um slot e cria as cinco tarefas nos minutos indicados.

| Slot | Conta | FP Systems | FP Visuals | Combat AI | Artillery | World War | Extra |
|---|---|---:|---:|---:|---:|---:|---|
| A | ChatGPT-GPT-5.6-Sol | :01 | :13 | :25 | :37 | :49 | Reporter visual |
| B | ChatGPT-GPT-5.6-Sol-B | :03 | :15 | :27 | :39 | :51 | Art director |
| C | ChatGPT-GPT-5.6-Sol-C | :05 | :17 | :29 | :41 | :53 | — |
| D | LIVRE | :07 | :19 | :31 | :43 | :55 | — |
| E | LIVRE | :09 | :21 | :33 | :45 | :57 | — |
| F | LIVRE | :11 | :23 | :35 | :47 | :59 | — |

Se todos estiverem ocupados, registre a necessidade de expansão neste arquivo e espere a liderança reorganizar a grade.

## Continuidade entre contas
Cada agente deve ler o estado mais recente e continuar o próximo problema de maior valor. Não reinvente um sistema já existente.

Em toda execução, além dos commits/log, verifique se existem solicitações Codex `DONE`/`BLOCKED` relevantes ao seu workstream em `iron-rain/docs/codex-requests/`. Se o seu trabalho exigir uma capacidade especializada que o runtime atual não oferece, crie uma solicitação seguindo `CODEX_COORDINATION.md`; não peça ao usuário para retransmitir a tarefa.

Ao terminar um ciclo, registre em `iron-rain/docs/AGENT_LOG.md`:
- `FEITO`
- `ARQUIVOS`
- `TESTE`
- `PRÓXIMO`
- `RISCO`
- `COMMIT`

## Codex Specialist — comunicação somente via GitHub
Codex não ocupa slot e não concorre com os workstreams. Ele é acionado somente por arquivos independentes em `iron-rain/docs/codex-requests/`, conforme `CODEX_COORDINATION.md`.

Agentes e LEAD devem usar esse canal para QA visual real, browser/mobile, reprodução de bugs, profiling, screenshots reais, testes indisponíveis no runtime normal e outras missões especializadas. O resultado volta pelo mesmo arquivo de solicitação. O usuário não é mensageiro entre agentes e Codex.

Não criar pedido Codex para trabalho normal já pertencente a um workstream. Antes de criar pedido, verificar se já existe missão `READY` ou `IN_PROGRESS` equivalente.

## Reporter visual — Slot A
Além das cinco tarefas, produz checkpoint visual quando o ambiente permitir:
- link da build;
- screenshots REAIS da build atual, principalmente primeira pessoa/interior do Mamute;
- comparação com checkpoint anterior;
- 3 maiores problemas visuais/UX.

Não inventar screenshot se não houver ambiente de navegador/renderização disponível.

## Art Director — Slot B
Além das cinco tarefas, cria referências/concepts/mockups para orientar as outras contas, com foco em:
- interior do Mamute;
- instrumentos;
- iluminação;
- materiais;
- HUD;
- VFX/atmosfera.

Concept art é referência; nunca deve ser apresentada como screenshot real da build.

## Liderança
A conta líder não é uma sexta equipe de features. Ela governa:
- prioridades;
- arquitetura;
- QA/regressões;
- coordenação de contas;
- revisão visual;
- conflitos;
- integração e saúde da branch.

A liderança também monitora a fila Codex no GitHub, evita pedidos duplicados, acompanha P0/P1 e garante que resultados `DONE`/`BLOCKED` retornem ao workstream correto sem depender do usuário.

## Testes
Conforme `GITHUB_HANDOFF.md`:
- executar `npm test` antes/depois de mudanças quando o ambiente permitir;
- manter caminhos relativos e entrada modular;
- para navegador, usar o fluxo `tests/v7-browser.mjs` quando Playwright estiver disponível;
- não reativar loaders/fragmentos antigos fora da build atual.
