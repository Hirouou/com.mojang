# Dot: usar o Aetherfall com DotBridge 1.1

Execute o cliente no mesmo Linux e ambiente de rede do Minecraft. O perfil conferido usa **Minecraft Java 1.21.1, NeoForge 21.1.259 e Java 21**. Python requer 3.10+. Não presuma que o diretório do jogo é `~/.minecraft` ou a pasta deste repositório.

## Preparar e atualizar

1. Preserve o Aetherfall existente no TLauncher. O [ZIP original](https://github.com/Hirouou/com.mojang/releases/tag/aetherfall-2.0-2026-10-19) contém suas instruções de instalação.
2. Identifique o diretório real do perfil. Não substitua o mod de uma sessão aberta.
3. Na cópia local do repositório, execute `python3 dotbridge/install.py`: isso apenas prepara uma pasta de staging separada.
4. Quando o jogo estiver fechado, guarde o JAR antigo fora de `mods/`, preserve `config/dotbridge.json` e `config/dotbridge.token`, e execute `python3 dotbridge/install.py --game-dir "/caminho/real/do/perfil"`. Nunca deixe duas versões do mesmo ID em `mods/`. [Reversão](dotbridge/ATUALIZACAO-1.1.md).
5. Abra o perfil, entre no mundo e confirme `python3 dotbridge/dot health` e `python3 dotbridge/dot state`. Para ações no mundo, `connected` e `can_control` precisam ser verdadeiros. Ações de inventário têm contexto próprio.

O wrapper salva apenas caminho e porta em `.dotbridge-local.json`. O token fica no perfil e é lido automaticamente. Não imprima, copie para mensagens ou envie esse arquivo ao repositório.

## Regra de execução

Defina um objetivo com alvo, limite de duração e condição de fim. Deixe o mod fazer ajustes pequenos. Continue apenas comportamentos autorizados pelo usuário; não invente novos objetivos porque o modelo está demorando.

Para aguardar uma IA, use um controlador **assíncrono** que continua chamando `session.pump()` e verificando interrupções. Não mantenha uma thread ou processo de heartbeat independente que continue após o controlador morrer. O SDK oferece `bridge.session(max_seconds=..., ttl_ms=...)`; `session.wait()` renova a autorização enquanto aguarda, dentro desse limite. `bridge.wait()` e CLI `--wait` apenas consultam resultados, sem renovar heartbeat.

O exemplo pronto autoriza somente observar e encerra a autorização ao sair:

```bash
python3 dotbridge/client/example_wait.py --game-dir "/caminho/real/do/perfil" --execute --seconds 15 --ai-delay 5
```

A espera da IA nesse exemplo é simulada. Substitua a função de decisão por sua chamada assíncrona e mantenha o loop finito. Sem renovação, a autorização expira; não contorne essa proteção deixando teclas pressionadas.

## Escolher o objetivo certo

| Intenção autorizada | Objetivo local |
| --- | --- |
| Olhar naturalmente o ambiente visível durante a espera | `observe` |
| Olhar para ponto/bloco conhecido | `look_at` com `target` |
| Acompanhar uma criatura visível sem atacar | `track` com `entity_id` |
| Andar brevemente, verificando obstáculos e riscos | `move` com `max_ticks` |
| Minerar um bloco visível ao alcance | `mine` com coordenadas inteiras |
| Enviar uma interação normal ao alvo | `interact`; resultado pode continuar não verificado |
| Atacar somente o alvo explicitamente escolhido | `combat` com `entity_id` |
| Cumprimento frontal com retorno à câmera anterior | `greet`; pode recusar local inseguro |
| Pequena sequência previamente definida | `sequence`, até oito etapas sem aninhamento |

Use os IDs/posições de `observe`, não coordenadas inventadas. `observe` retorna superfícies e criaturas visíveis, não um mapa de cavernas ou minérios escondidos. Uma criatura neutra não é automaticamente inimiga; tipos de mods podem ser `unknown`. O estado normal informa `camera`, `camera_perspective` e `view_rotation`; F5 continua disponível por `camera --wait`.

## Conferir o que aconteceu

Leia `active_action`, `recent_actions`, `local_state`, `interruption_reason` e os eventos. Um HTTP 202 significa aceitação, não sucesso no mundo. Uma ação pode terminar como `completed`, `cancelled` ou `failed`, com motivo e detalhes. Não repita automaticamente uma operação após timeout.

Em mineração, `broke` exige mudança confirmada pelo servidor. `collected` exige pacote de coleta perto do alvo correlacionado com aumento do item no inventário; isso aceita drops com ID diferente do bloco, sem provar causalidade. Sem essas evidências dentro da janela, a coleta continua não verificada. Não declare coleta apenas porque o bloco sumiu.

Para inventário/crafting, consulte `inventory`. Use `container_id`, `state_id`, IDs reais de slots e pré-condições de item/quantidade/cursor; confirme uma operação antes da próxima. Os números dos slots variam por menu e não são pixels do Spatial GUI. Em falha, consulte novamente o cursor e os slots; não repita um clique incerto. Exemplo: `client/example_inventory.py`, dentro de `dotbridge/`.

## Parar e retomar

`python3 dotbridge/dot stop` funciona sem mundo e cancela o controle. Intervenção manual, pausa, morte, menu incompatível, perda de alvo ou heartbeat expirado devem encerrar o objetivo pertinente. Depois de uma interrupção, observe o estado e espere nova autorização antes de retomar. Ao devolver o teclado ao usuário, envie `stop`.

Use `state` para consultas leves e `observe` somente quando precisar de nova percepção. A sequência, tick, horário de captura e idade do snapshot ajudam a evitar decisões sobre dados antigos. HTTP, idade do snapshot, início da ação, FPS e resposta da IA são medidas diferentes.

Consulte [API-1.1.md](dotbridge/API-1.1.md), [manual operacional](dotbridge/COMO_USAR_COM_O_DOT.md) e [validação](dotbridge/VALIDACAO.md). Relatórios da versão 1.0 são históricos; não valide a versão nova por associação.
