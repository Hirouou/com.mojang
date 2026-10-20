# API do DotBridge 1.1.0

Contrato para Minecraft Java 1.21.1 / NeoForge 21.1.259. Exemplos abaixo são formatos; use alvos/slots da observação atual. A implementação e a medição efetivamente testadas estão em [VALIDACAO.md](VALIDACAO.md).

## Transporte e autenticação

Base padrão: `http://127.0.0.1:8765`. O servidor escuta somente IPv4 loopback. Todas as rotas, exceto `/health`, exigem `Authorization: Bearer <token>`; POST usa `Content-Type: application/json`. O SDK lê o token de `<game-dir>/config/dotbridge.token` sem imprimi-lo. Não envie tokens em prompts, logs ou URLs.

Host e origem são verificados. Requisições com `Origin` de navegador são recusadas, inclusive para impedir que uma página externa use o serviço local. Corpo JSON tem limite de 8 KiB, campos desconhecidos/duplicados e números inválidos são rejeitados. A fila de tarefas do cliente é limitada. O thread HTTP não lê nem altera o mundo; trabalho de Minecraft vai à thread do cliente.

| Método / rota | Resultado |
| --- | --- |
| `GET /health` | Versões, sem autenticação |
| `GET /v1/state` | Snapshot pronto, sem varrer o mundo |
| `GET /v1/observe?radius=3` | Snapshot + percepção visível limitada; raio 1–8 |
| `POST /v1/heartbeat` | Renova autorização finita do controlador |
| `POST /v1/action` | Comando curto compatível com 1.0 |
| `POST /v1/goal` | Objetivo executado localmente com duração máxima |
| `GET /v1/events?after=0` | Eventos após cursor |
| `GET /v1/inventory` | Menu, slots reais, cursor e estado de recuperação |
| `POST /v1/inventory` | Abrir/fechar inventário ou um clique validado por slot |

Erros usam `{"ok":false,"error":"motivo"}`. Códigos usuais: 400 parâmetros, 401 token, 403 Host/Origin, 405 método, 409 contexto/heartbeat/estado incompatível, 413 tamanho, 415 conteúdo, 429 fila cheia e 503 timeout. Timeout não prova ausência de efeito: consulte estado/eventos antes de repetir.

## Autorização e prioridade

```json
{"ttl_ms":1500}
```

`ttl_ms` aceita 500–10000 ms, padrão 3000. A resposta informa `ttl_ms` e `expires_at_ms`. O servidor aplica o prazo usando relógio monotônico; o horário Unix é informativo. Renove antes de vencer, no próprio loop vivo e finito do controlador.

Heartbeat não inicia movimentos nem escolhe objetivos. `/v1/goal` e operações de inventário exigem autorização válida. O mod cancela e solta entradas no próximo tick disponível quando a autorização expira. Se o jogo inteiro travar, nenhum código na thread do jogo pode agir até ela voltar.

Os comandos antigos continuam aceitando chamadas curtas; sem sessão explícita, recebem uma janela de compatibilidade de até 10 s e continuam sujeitos ao limite de ticks. Depois de heartbeat explícito, o prazo explícito vale também para as ações. Não use a compatibilidade para manter controle indefinido.

Prioridades: intervenção manual/parada de emergência; indisponibilidade do jogo; prazo; objetivo atual. Uma entrada manual detectada cancela o trabalho, e comandos novos precisam esperar a entrada física cessar. Pausa, morte, desconexão, tela incompatível e overlay interrompem ações no mundo. A API dedicada de inventário pode operar telas de contêiner permitidas. `stop` cancela e libera entradas mesmo sem mundo.

## Snapshot e ciclo de vida

Campos comuns:

| Campo | Significado |
| --- | --- |
| `sequence` | Sequência de captura na instância atual, independente do cursor de eventos |
| `tick` | Tick do cliente na captura |
| `captured_at_ms` / `time_ms` | Horário Unix da captura; `time_ms` preserva compatibilidade |
| `snapshot_age_ms` | Idade estimada ao publicar o estado pronto |
| `local_state` | `observing`, `moving`, `mining`, `interacting`, `combat` ou `interrupted` |
| `lease_remaining_ms` | Prazo restante do controlador |
| `interruption_reason` | Motivo da interrupção, quando presente |
| `active_action` | ID, estado, tipo/fase e informações do trabalho atual, ou `null` |
| `recent_actions` | Últimos 32 resultados; localizar pelo ID, não apenas pelo último |
| `camera` | Perspectiva vanilla |
| `camera_perspective` | Perspectiva efetiva, incluindo `shoulder_surfing` |
| `view_rotation` | Rotação efetiva da câmera; pode diferir do corpo |

HTTP 202 retorna `action_id`, `status: accepted`, `accepted_tick` e `accepted_at_ms`. Quando começa, o estado passa a `executing` e informa `started_tick`/`start_delay_ms` quando instrumentados. Resultado terminal: `completed`, `cancelled` ou `failed`, com `reason` e `details`. Alguns comandos instantâneos já terminam antes da primeira consulta. `interrupted` também representa ausência de execução contínua após término normal; consulte o resultado, não só esse nome.

## Objetivos locais

`POST /v1/goal` aceita um objeto com `type` e `max_ticks` de **1 a 1200**, padrão **100**. A 20 ticks/s, 100 ticks são aproximadamente 5 s; tick não é garantia de duração de relógio. O heartbeat limita a execução independentemente desse orçamento.

| `type` | Campos adicionais | Condição de conclusão / limites |
| --- | --- | --- |
| `observe` | `target` opcional | Observar até o prazo, com pequenos movimentos de câmera e pausas; sem caminhar. Sem alvo, escolhe somente pontos de interesse visíveis. Sem ponto apropriado, mantém a vista. |
| `look_at` | `target` obrigatório | Mira suave estabilizada no ponto/entidade; deadline sem estabilização falha. |
| `track` | `target.entity_id` | Acompanha entidade visível até o prazo; perde alvo/morte/alcance interrompem. Sem perseguição automática. |
| `move` | `forward`, `strafe`, `sprint` | Anda até o prazo, verificando obstáculo, fluido, apoio e progresso; risco/falta de progresso falham. Não calcula rota/destino. |
| `mine` | Coordenadas inteiras de bloco | Mudança do bloco confirmada pelo servidor; depois observa coleta por janela curta. Prazo sem quebra confirmada falha. |
| `interact` | `target` obrigatório | Uma tentativa normal de uso com mira/alcance. `input_sent` não é confirmação do efeito; abertura de menu pode cancelar a ação no mundo. |
| `combat` | `target.entity_id` | Ataca somente esse alvo, com mira, alcance e cooldown normais. Morte observada pode concluir; sumiço não prova morte. Prazo sem conclusão falha. |
| `greet` | — | Câmera frontal, três pequenos agachamentos e animações de soquinhos sem ataque; sequência completa em cerca de 46 ticks, se houver orçamento e local seguro. Restaura câmera anterior. |
| `presentation` | `target` opcional | Apresentação frontal até o prazo, com movimentos suaves; checagem conservadora de segurança e retorno à câmera anterior. |
| `sequence` | `steps`: 1–8 objetivos | Etapas na ordem autorizada; sem aninhamento. `max_ticks` externo limita a sequência inteira, além do limite de cada etapa. Falha/interrupção encerra o conjunto. |

`move` usa eixos -1 a 1; padrão `forward=1`, `strafe=0`, `sprint=false`. Positivo em `strafe` significa esquerda. Não há campos de ataque/jump em `move`; os comandos antigos continuam disponíveis para entradas curtas explícitas.

Alvo é **um** destes formatos:

```json
{"entity_id":123}
```

```json
{"x":12,"y":64,"z":-3,"block":true}
```

Com `block:true`, as coordenadas são a origem inteira do bloco. `mine` já exige esse formato. Para ponto conhecido, `block:false` usa as coordenadas diretamente. Posição de ponto expressamente fornecida não é descoberta pelo mod; não a trate como observação de um bloco escondido. Mineração/interação com bloco valida visibilidade e alcance antes da entrada. `track` e `combat` exigem entidade. Tipos/campos não listados são recusados.

Sequência apenas ilustrativa, que autoriza observar e depois cumprimentar:

```json
{"type":"sequence","max_ticks":150,"steps":[{"type":"observe","max_ticks":60},{"type":"greet","max_ticks":80}]}
```

O controlador não cria novas etapas ao esperar a IA. Durante mineração, combate e uso, a mira do objetivo tem prioridade sobre observação ambiental. Um comando explícito novo pode substituir o objetivo anterior; não envie controles concorrentes presumindo que ambos continuarão.

### Quebra e coleta

`mine` não conclui quebra a partir da predição local. Ele espera atualização autoritativa do servidor para o bloco observado. `details.broke` e `server_confirmed` indicam essa evidência, sem afirmar que o Dot causou a mudança (`break_causal_proof:false`). Rejeição/reversão ou falta de confirmação não viram sucesso.

Após a quebra, a janela de coleta dura até **40 ticks**, limitada pelo prazo restante do objetivo. `collected` exige correlação entre pacote de coleta recebido para o jogador perto do bloco observado e aumento correspondente no inventário. Campos relevantes: `server_pickups_near_target`, `inventory_increases`, `collected_item_increases`, `collection_evidence` e `collection_causal_proof:false`. Isso permite observar drops com ID diferente do bloco, mas não identifica a origem causal de cada pilha. Coleta fora da janela ou sem evidência suficiente permanece não verificada. O mod não anda sozinho para buscar o drop.

`completed` com coleta não verificada significa que a parte de quebra terminou e a observação acabou, não que todos os itens foram obtidos. Leia detalhes e motivo.

## Percepção visível

`observe` lança **96 raios**, usa os primeiros impactos no campo de visão da câmera e não percorre o cubo de blocos. `blocks` contém no máximo 96 posições distintas. A consulta local considera no máximo 64 entidades candidatas e retorna até 32 com campo de visão/linha de visão. Não carrega chunks, não revela minérios atrás de paredes e não pretende ser mapa completo.

Consultas HTTP repetidas com o mesmo raio reutilizam a observação por até quatro ticks, preservando a sequência/horário e informando `cached:true` e a idade. Trocar o raio dentro desse orçamento retorna 429. O objetivo local de observação procura novos pontos no máximo uma vez a cada 20 ticks, além das pausas naturais.

Blocos têm `x/y/z`, `position`, `id`, `name`, `hit_position`, `distance`, `face`, `collision`, `category`, `categories`, `interactions` e `interaction_knowledge`. Nomes seguem o idioma do jogo; IDs são a referência estável. Categorias incluem chão, obstáculo, árvore, água/lava. A categoria `edge` é apenas candidata visual baseada em descontinuidade de profundidade entre raios; não demonstra o conteúdo de uma queda oculta. `openings` contém até oito direções sem impacto dentro do alcance amostrado; espaço não carregado nunca é declarado abertura.

`crosshair` inclui bloco/entidade confirmado visível, distância, face e alcance. Um alvo ocluído ou fora do campo de visão não expõe ID/posição. `interactions` de blocos vanilla são possibilidades a confirmar pelo jogo; blocos de mods retornam conhecimento `unknown_modded_block`. Não são permissões adicionais nem previsão de loot.

Entidades têm ID, UUID, tipo, nome, posição, distância, yaw/direção relativa, linha de visão e classificação. `neutral` tem prioridade para entidades com contrato `NeutralMob` e espécies condicionais vanilla; `hostile` não é inferido pela simples presença. Tipos modded sem informação confiável ficam `unknown`. A classificação não dispara ataques. IDs podem mudar após descarregar/reentrar: reobserve antes de retomar um alvo.

A visibilidade usa o FOV renderizado, inclusive os ajustes observados de câmera/zoom. Antes do primeiro frame disponível, `reason: render_view_not_ready` deixa a percepção vazia. Essa percepção é uma amostragem geométrica, não uma leitura perfeita de cada pixel nem garantia de todos os perigos de mods.

## Inventário e crafting por slots

Os menus têm IDs próprios e slots definidos por cada implementação; não existe um número universal de slot para todas as telas. Essa distinção entre menu, slot e sincronização é descrita na [documentação oficial de menus do NeoForge 1.21.1](https://docs.neoforged.net/docs/1.21.1/gui/menus/).

`GET /v1/inventory` retorna `container_id`, `state_id`, `open`, `menu_kind`, `cursor`, `slots`, `slot_count`, `truncated` e dados de recuperação. Cada entrada de slot traz `slot`, `inventory_index`, `role`, `item`, `count`, permissões e `components_hash` quando não vazia. Pilha vazia usa `minecraft:air` e quantidade zero. `state.inventory` é um resumo com índices de inventário; não substitui os IDs de menu desta rota.

Somente Survival/Adventure e contêineres suportados, até 256 slots. Creative e estado pausado/morto/desconectado são recusados. A tela pode estar inclinada/movida pelo Spatial GUI: as operações usam o menu real, sem coordenadas de pixels.

Abrir/fechar inventário do jogador:

```json
{"type":"inventory","operation":"open"}
```

```json
{"type":"inventory","operation":"close"}
```

Fechar é recusado se houver pilha no cursor ou ingredientes na grade, para evitar descarte. O exemplo abaixo é construído dinamicamente de um snapshot atual, não de slots fixos:

```python
snapshot = bridge.inventory()
slot = next(value for value in snapshot["slots"] if value["slot"] == chosen_slot)
cursor = snapshot["cursor"]
command = {
    "type": "inventory", "operation": "click",
    "container_id": snapshot["container_id"], "state_id": snapshot["state_id"],
    "slot": slot["slot"], "button": 0, "click_type": "pickup",
    "expected_item": slot["item"], "expected_count": slot["count"],
    "expected_cursor_item": cursor["item"], "expected_cursor_count": cursor["count"],
}
if "components_hash" in slot:
    command["expected_components_hash"] = slot["components_hash"]
if "components_hash" in cursor:
    command["expected_cursor_components_hash"] = cursor["components_hash"]
accepted = bridge.inventory_action(command)
result = session.wait(accepted["action_id"], timeout=6)
```

`click_type` aceita `pickup`, `quick_move` e `swap`. Botão em pickup/quick_move: 0 ou 1. Em swap: índice de barra 0–8, também exigindo `expected_hotbar_item` e `expected_hotbar_count`. `timeout_ticks` aceita 20–200, padrão 80. IDs, item, contagem e hashes esperados são comparados antes de enviar o pacote; observação vencida falha.

Uma só operação fica pendente. Cliques aguardam revisão e alterações reais recebidas do servidor, com dois ticks de estabilização; não há predição local transformada em sucesso. `details` inclui `confirmation`, `uncertain`, cursor e `changed_slots` antes/depois. Abrir/fechar tela tem confirmação local explícita; mover itens depende do servidor.

Em timeout/cancelamento após envio, `uncertain:true` significa que o efeito ainda pode ocorrer. `recovery_required` bloqueia outro clique até atualizações autoritativas estabilizarem e uma nova consulta de inventário reconhecer a recuperação. Se não chegar atualização suficiente, pode ser necessário reconectar. Nunca repita a operação às cegas nem feche à força uma tela com pilha no cursor.

Crafting é feito por operações confirmadas na grade real e retirada de um `crafting_result` observado. Resultado permite apenas um pickup esquerdo por ação confirmada; a API não monta receitas por nome nem promete compatibilidade com todo menu modded. Exemplo de transferência: [example_inventory.py](client/example_inventory.py).

## Eventos

`GET /v1/events?after=CURSOR` devolve até 64 eventos de um journal de 128, em ordem:

- `events[]`: `sequence`, `tick`, `time_ms`, `type`, `details`;
- `next_after`: próximo cursor a usar;
- `has_more`: consultar novamente para continuar;
- `latest_sequence`: última sequência conhecida;
- `dropped`: o cursor perdeu eventos retidos; ressincronize com estado/inventário.

Tipos incluem `damage`, `inventory_changed`, `movement_blocked`, `target_lost`, `action_accepted`, `action_started`, `action_completed`, `goal_started`, `goal_step_started`, `goal_step_finished`, `block_broken`, `collection_finished`, `interaction_sent`, `combat_attack` e `presentation_gesture`. Use `details` e o resultado terminal para interpretar; nome de evento não prova causalidade. Reiniciar o mod reinicia o cursor.

## Comandos 1.0 preservados

`POST /v1/action` continua aceitando um objeto por requisição:

```json
{"type":"control","forward":1,"strafe":0,"jump":false,"sneak":false,"sprint":false,"attack":false,"use":false,"ticks":5}
```

```json
{"type":"look","yaw":-90,"pitch":15}
```

```json
{"type":"camera","mode":"third_person_front"}
```

Também: `hotbar` com `slot` 1–9, `attack`/`use` com `ticks` 1–200 e `stop`. `camera` aceita `cycle`, `first_person`, `third_person_back`, `third_person_front`; `cycle` usa o atalho normal F5 para respeitar Shoulder Surfing. `look` mantém o comando absoluto compatível; objetivos usam o controlador suave com limites de velocidade/aceleração.

Mineração/ataque antigo por duração não oferece a confirmação detalhada de `mine`/`combat`. O cliente deve consultar o efeito real. Novo comando explícito pode cancelar o trabalho anterior. Os cancelamentos de segurança e a percepção limitada são mudanças intencionais, detalhadas em [ATUALIZACAO-1.1.md](ATUALIZACAO-1.1.md).

## Medir separadamente

`metrics.fps` é FPS observado. `metrics.client_tick_work_us`, `client_tick_work_ewma_us` e `client_tick_work_max_us` medem o trabalho nos eventos Pre/Post de tick, sem incluir toda a renderização, tarefas HTTP enfileiradas fora desses eventos ou o custo total do modpack. `start_delay_ms` mede aceitação na thread do cliente até começar quando disponível, não tempo do modelo.

Meça no cliente a duração HTTP com relógio monotônico; compare com idade/seq/tick da captura. Para impacto em FPS, compare cenários equivalentes com controlador parado e com objetivos, mesmos mods, mundo, câmera e renderização, por janelas adequadas. Não subtraia latência HTTP de FPS nem reutilize uma medição antiga em cache como tempo de reação completo. O exemplo [example_wait.py](client/example_wait.py) separa HTTP/idade e espera simulada da IA. Resultados efetivos permanecem em `VALIDACAO.md`.
