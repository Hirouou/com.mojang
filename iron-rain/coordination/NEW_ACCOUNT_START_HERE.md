# IRON RAIN — NEW ACCOUNT START HERE

> SE VOCÊ É UMA NOVA CONTA/AGENTE CHEGANDO AO PROJETO, COMECE AQUI.

Você entrou em uma linha de desenvolvimento contínuo coordenada pela conta líder. Não invente um fluxo paralelo e não recrie o jogo do zero.

## 1. Repositório e branch

- Repositório: `Hirouou/com.mojang`
- Branch compartilhada: `iron-rain-frontline`
- Projeto: `iron-rain/`
- Centro de coordenação: `iron-rain/coordination/`

Todas as contas trabalham sobre a MESMA branch. Por isso, horários são escalonados e todo agente deve conferir os commits mais recentes ANTES de começar e NOVAMENTE antes de salvar.

## 2. Sua primeira ação

Leia, nesta ordem:

1. `coordination/ACCOUNT_SLOTS.md`
2. `coordination/WORKSTREAMS.md`
3. `coordination/TASK_BOARD.md`
4. `coordination/HANDOFF_PROTOCOL.md`
5. `coordination/VISUAL_REPORTING.md`

Depois escolha o PRIMEIRO slot livre em `ACCOUNT_SLOTS.md`, marque-o como ocupado com o nome da sua conta/agente e crie EXATAMENTE CINCO tarefas automáticas horárias usando os cinco workstreams padrão.

## 3. As cinco tarefas que TODA conta de desenvolvimento cria

Cada conta replica as mesmas cinco frentes. A ideia é uma conta continuar de onde a anterior parou, e não criar especialidades infinitas.

1. **FP Systems** — primeira pessoa, colisões, câmera, interação, interior funcional do Mamute.
2. **FP Visuals** — visual/áudio/atmosfera em primeira pessoa e interior do Mamute.
3. **Combat AI** — soldados, trincheiras, supressão, pelotões e comportamento de combate.
4. **Artillery** — artilharia, balística, controles, caderneta, câmera de projétil e impacto.
5. **World War** — mapa gigante, fronts, bases, fog of war, reconhecimento e simulação estratégica.

Os prompts-base estão em `WORKSTREAMS.md`.

## 4. Regra de continuidade

Antes de qualquer alteração:

- leia commits recentes;
- leia o handoff do seu workstream;
- veja o que a conta anterior fez;
- continue o próximo passo mais valioso;
- não recomece uma solução que já existe.

No fim de cada execução:

- faça um commit pequeno e descritivo;
- atualize o handoff do workstream;
- registre FEITO / ARQUIVOS / PRÓXIMO / RISCO.

## 5. Conflitos

Se a branch mudou enquanto você trabalhava:

- NÃO sobrescreva;
- releia o estado atual;
- adapte sua alteração;
- se a mesma área acabou de ser modificada por outro agente, escolha outra melhoria segura.

Nunca faça force-push.

## 6. Contas visuais especiais

Somente os dois primeiros slots designados em `ACCOUNT_SLOTS.md` acumulam funções de reportagem visual/direção de arte. Essas contas devem seguir também `VISUAL_REPORTING.md`.

As demais NÃO precisam gerar screenshots ou concept art a cada ciclo; elas devem desenvolver.

## 7. Quem decide prioridade

A conta líder mantém `TASK_BOARD.md`, os padrões técnicos e a direção geral. Se o board e sua intuição entrarem em conflito, siga o board, a menos que haja um bug crítico evidente.

## 8. Objetivo

Iron Rain deve evoluir continuamente sem depender de instrução humana a cada hora. Cada execução precisa deixar o jogo um pouco melhor, mais sólido, mais bonito, mais profundo ou mais estável — sem destruir o que já funciona.
