# IRON RAIN — CODEX REQUEST MAILBOX

Este diretório é a caixa postal versionada entre LEAD/Slots A–F e Codex Specialist.

Leia primeiro `../CODEX_COORDINATION.md`.

- Agentes criam um arquivo independente por missão.
- Codex procura arquivos com `STATUS: READY`.
- Codex reivindica mudando para `IN_PROGRESS` no próprio arquivo.
- Codex devolve resultado no mesmo arquivo como `DONE` ou `BLOCKED`.
- O agente indicado em `RETURN_TO` consome o resultado no ciclo seguinte.
- Não usar o usuário como mensageiro.
- Não editar `iron-rain-frontline`.
- Não criar lista central de fila neste README; os próprios arquivos são a fila.
