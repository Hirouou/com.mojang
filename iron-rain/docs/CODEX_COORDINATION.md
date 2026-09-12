# IRON RAIN — CODEX COORDINATION PROTOCOL

Este arquivo define a comunicação GitHub-only entre LEAD, agentes de desenvolvimento e Codex Specialist.

## Princípio

O usuário NÃO é mensageiro entre agentes e Codex.

Quando LEAD ou qualquer Slot A–F precisar de uma capacidade especializada do Codex, a solicitação deve ser publicada no próprio repositório. O Codex lê a solicitação no GitHub, executa a missão e devolve o resultado no GitHub. O solicitante e a liderança consomem o resultado dali.

Nenhuma tarefa do Codex deve depender de o usuário copiar prompt, retransmitir resultado ou avisar manualmente outro agente.

## Branch e escopo

- Repo: `Hirouou/com.mojang`
- Branch ÚNICA ativa: `iron-rain-v6-1-continuation`
- `iron-rain-frontline` é histórica e NUNCA deve ser editada.
- Codex não ocupa TEAM SLOT.
- Codex não inicia features por conta própria.
- Codex só trabalha em uma solicitação explícita registrada conforme este protocolo.

## Caixa postal

Cada solicitação deve ser um arquivo independente em:

`iron-rain/docs/codex-requests/`

Nome recomendado:

`IR-CODEX-YYYYMMDD-HHMM-<slot-ou-lead>-<slug>.md`

Não manter uma lista central mutável de fila. Arquivos independentes reduzem conflito entre múltiplos agentes criando pedidos ao mesmo tempo.

## Quando acionar Codex

Acione apenas quando houver uma vantagem real de ambiente/capacidade, por exemplo:

- abrir e jogar a build real em navegador;
- QA visual/humano;
- teste mobile/landscape/touch;
- reprodução de bug difícil;
- screenshots REAIS da build;
- comparação visual com referência;
- Playwright/browser automation;
- profiling/performance;
- investigação integrada de vários sistemas;
- execução de testes que o runtime dos Slots não consegue executar;
- correção técnica específica quando a missão pedir explicitamente.

Não terceirize desenvolvimento normal que já pertence a FP Systems, FP Visuals + Audio, Combat AI, Artillery ou World War.

## Formato obrigatório de uma solicitação

Todo arquivo novo deve conter no topo:

```md
# IR-CODEX-...

STATUS: READY
REQUESTER: LEAD | SLOT A | SLOT B | SLOT C | SLOT D | SLOT E | SLOT F
RETURN_TO: LEAD | FP SYSTEMS | FP VISUALS + AUDIO | COMBAT AI | ARTILLERY | WORLD WAR
PRIORITY: P0 | P1 | P2 | P3
TYPE: QA | VISUAL_QA | MOBILE_QA | BUG_REPRO | TEST | PROFILING | INVESTIGATION | FIX
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: <sha observado ao criar>

## MISSÃO
<objetivo objetivo>

## POR QUE CODEX
<capacidade necessária que o agente solicitante não consegue executar adequadamente>

## FAZER
- ...

## NÃO FAZER
- não expandir escopo;
- não editar iron-rain-frontline;
- não implementar feature não solicitada;
- não usar force-push.

## CRITÉRIOS DE ACEITE
- ...

## EVIDÊNCIA ESPERADA
- screenshots/logs/passos de reprodução/medidas conforme aplicável.
```

A missão deve ser pequena o suficiente para ter um resultado verificável.

## Estados

- `READY` — disponível para Codex.
- `IN_PROGRESS` — Codex reivindicou a missão.
- `DONE` — concluída e resultado registrado.
- `BLOCKED` — não foi possível concluir; motivo e próximo passo obrigatórios.
- `CANCELLED` — liderança cancelou antes da execução.

Somente o Codex deve mover `READY -> IN_PROGRESS`.

Codex deve reler a branch imediatamente antes de reivindicar a tarefa. Ao reivindicar, deve atualizar o próprio arquivo da solicitação com:

- `STATUS: IN_PROGRESS`
- `CLAIMED_HEAD: <sha>`
- `CLAIMED_AT: <timestamp>`

Se a tarefa já estiver `IN_PROGRESS`, `DONE`, `BLOCKED` ou `CANCELLED`, não executar de novo.

## Execução do Codex

Antes da missão, Codex deve:

1. confirmar `iron-rain-v6-1-continuation`;
2. atualizar para o remoto mais recente;
3. ler `GITHUB_HANDOFF.md`, `MULTI_AGENT_CONTROL.md`, `AGENT_LOG.md` e este arquivo;
4. ler commits recentes;
5. conferir arquivos/commits relacionados ao pedido;
6. reivindicar a tarefa no arquivo antes de começar.

Se `TYPE` for QA, VISUAL_QA, MOBILE_QA, BUG_REPRO, TEST, PROFILING ou INVESTIGATION, não alterar gameplay salvo se a solicitação disser explicitamente que correção também faz parte da missão.

Se `TYPE` for FIX, fazer a menor alteração coerente possível e preservar arquitetura modular/build atual.

## Retorno obrigatório do Codex

Ao terminar, o Codex atualiza O MESMO arquivo da solicitação para `DONE` ou `BLOCKED` e acrescenta:

```md
## RESULTADO CODEX

RESULT_HEAD: <sha mais recente observado>
STATUS: DONE | BLOCKED

### RESULTADO
...

### TESTE
...

### EVIDÊNCIA
...

### PROBLEMAS
- P0 ...
- P1 ...
- P2 ...
- P3 ...

### ARQUIVOS ALTERADOS
...

### COMMITS
...

### RECOMENDAÇÃO
...
```

Se houver correção em código, também registrar handoff curto em `AGENT_LOG.md`.

## Consumo do resultado

Em cada execução, LEAD e Slots A–F devem verificar solicitações relevantes que tenham `RETURN_TO` compatível com seu workstream e estado `DONE` ou `BLOCKED`.

- O agente que pediu a missão é responsável por consumir o resultado no próximo ciclo.
- LEAD acompanha pedidos P0/P1 e conflitos entre solicitações.
- Resultado de Codex não vira automaticamente autorização para refactor amplo.
- Se Codex descobrir um problema fora do escopo, ele registra no resultado; não começa outra feature.

## Duplicação

Antes de criar pedido novo, procure solicitação `READY` ou `IN_PROGRESS` sobre o mesmo problema.

Se já existir, não crie duplicata. Adicione contexto apenas se realmente necessário e sem apagar conteúdo anterior.

Se uma duplicata já tiver sido criada, marque a mais nova como:

`STATUS: CANCELLED`

com `DUPLICATE_OF: <arquivo>`.

## Regra de segurança

O GitHub é o barramento oficial de comunicação entre agentes e Codex. O usuário não deve ser necessário para encaminhar tarefas ou resultados.
