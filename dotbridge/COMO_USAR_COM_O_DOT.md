# Operação do DotBridge 1.1 pelo Dot

Use o terminal/Python do Linux em que o Minecraft está rodando. O mod dá uma API local; ele não concede novas ferramentas nem acesso a outro computador. Mantenha objetivos pequenos e previamente autorizados.

## Conectar e preparar

Se ainda não há configuração local, prepare primeiro `python3 install.py`. Isso só cria staging. A instalação no perfil exige Minecraft fechado e `--game-dir CAMINHO`; para trocar a 1.0 pela 1.1, guarde o JAR antigo fora de `mods/` antes. [Atualização/reversão](ATUALIZACAO-1.1.md).

Depois que o perfil abrir o mundo:

```bash
python3 dot health
python3 dot state
python3 dot observe --radius 3
```

Verifique versão, `connected`, `can_control`, `sequence` e `snapshot_age_ms`. O wrapper lê o token local sem imprimi-lo. Não copie o token para prompts ou logs.

## Um objetivo durante a espera

Em `client/`, reutilize o cliente Python:

```python
from dotbridge import DotBridge

bridge = DotBridge(game_dir="/caminho/real/do/perfil")
with bridge.session(max_seconds=15, ttl_ms=1500) as session:
    accepted = bridge.goal({"type": "observe", "max_ticks": 200})
    result = session.wait(accepted["action_id"], timeout=12)
    if result["status"] != "completed":
        print("Interrompido:", result.get("reason"))
```

Esse objetivo observa com a câmera. Não autoriza caminhada, combate nem mineração. Para aguardar uma decisão do modelo, mantenha uma tarefa assíncrona e chame `session.pump()` no loop que acompanha essa tarefa. Use `client/example_wait.py` como modelo; a espera de IA dele é simulada. Uma chamada bloqueante ao modelo deixa o heartbeat expirar, como deve ocorrer se o controlador travar. Não crie um renovador separado que sobreviva ao controlador.

`max_seconds` limita a sessão inteira. `max_ticks` limita o objetivo. O heartbeat limita quanto tempo o mod aceita continuar sem ouvir o controlador. A saída do contexto envia `stop`. Uma CLI `--wait` ou `bridge.wait()` não renova autorização; use `session.wait()` quando precisar dela.

## Decidir e confirmar

1. Leia `state` para estado rápido; peça `observe` para nova percepção limitada.
2. Escolha um alvo entre as superfícies/entidades visíveis, com ID/posição real. Não inferir cavernas, minérios ocultos nem agressividade de criaturas desconhecidas.
3. Envie um objetivo com prazo. `move` não calcula caminhos; `combat` exige `entity_id` explícito; `mine` exige coordenadas inteiras de bloco visível ao alcance.
4. Espere o resultado pelo `action_id`, acompanhando eventos/interrupções. Aceitação não confirma o efeito.
5. Confira evidências: bloco mudou? inventário aumentou? item no cursor mudou? A ausência de confirmação exige reobservar, não repetir cegamente.
6. Em pausa, morte, perda de alvo, risco, intervenção manual ou heartbeat vencido, pare. Só retome com nova autorização.

Estados locais em inglês: `observing`, `moving`, `mining`, `interacting`, `combat`, `interrupted`. Resultados terminais: `completed`, `cancelled`, `failed`. `interruption_reason`, `reason` e `details` explicam a diferença.

## Câmera e cumprimento

```bash
python3 dot camera --wait
python3 dot camera --mode first_person --wait
python3 dot camera --mode third_person_back --wait
python3 dot camera --mode third_person_front --wait
python3 dot look -90 15 --wait
```

A alternância usa o F5 normal, incluindo Shoulder Surfing. `camera_perspective` pode ser `shoulder_surfing`; `view_rotation` e `player.rotation` podem diferir. `look` preserva o comando absoluto antigo; os objetivos novos usam transições suaves. Yaw 0=sul, 90=oeste, -90=leste, 180=norte; pitch positivo olha para baixo.

Dentro de uma sessão autorizada, `bridge.goal({"type":"greet","max_ticks":100})` faz câmera frontal, pequenos agachamentos e animações de soquinhos sem injetar ataques, e restaura a perspectiva anterior. O local pode ser recusado por ameaça visível, borda, líquido, falta de chão ou espaço frontal. Não force o cumprimento quando a verificação falhar.

Durante `mine`, `interact` e `combat`, a mira do alvo tem prioridade. Não envie um `look` paralelo esperando que o objetivo continue intacto: uma ação manual/API pode substituí-lo.

## Quebrar e coletar são evidências distintas

`mine` espera mudança do bloco confirmada pelo servidor; a predição local não basta. Após essa confirmação, acompanha por até 40 ticks, dentro do prazo total, pacotes de coleta para o jogador perto do alvo e aumentos correspondentes no inventário. `broke` não prova que foi o Dot quem quebrou; `collected` requer essa correlação, sem provar causalidade. Drops podem ter ID diferente do bloco. Sem evidência suficiente, a coleta permanece não verificada. Consulte `inventory_increases`, `server_pickups_near_target`, `collected_item_increases`, `collection_evidence` e o motivo terminal. Não anuncie coleta concluída só porque o bloco desapareceu.

## Inventário/crafting com Spatial GUI

`inventory` retorna IDs reais do menu, incluindo slots vazios, cursor e estado do contêiner. Eles não são coordenadas de tela nem o mesmo índice simplificado de `state.inventory`.

Use `client/example_inventory.py --game-dir CAMINHO` para consultar. Para transferir, escolha IDs atuais e passe `--from-slot ID --to-slot ID --execute`. O exemplo valida origem, destino e cursor; confirma a retirada antes de enviar a colocação. Ao falhar, ele não repete o clique nem fecha à força uma tela com item no cursor.

Para crafting: coloque ingredientes na grade observada, confirme cada alteração, confira o item real do `crafting_result`, retire um resultado por vez e confirme slots/cursor. Não invente números fixos de slot nem receitas. A API não é um resolvedor universal e recusa Creative/menus incompatíveis. Uma transferência só conclui após revisão do servidor e mudança esperada; em timeout, trate `uncertain` como efeito possivelmente ocorrido e consulte novamente.

## Eventos e métricas

`bridge.events(after=cursor)` devolve `events`, `next_after`, `latest_sequence`, `has_more` e `dropped`. Avance pelo `next_after`; em perda de eventos, obtenha snapshots atuais. Reinício do jogo reinicia os cursores.

Para medir atraso, separe duração HTTP, `snapshot_age_ms`, atraso até `started_tick`/`start_delay_ms`, `metrics.client_tick_work_*`, FPS e espera do modelo. Um estado em cache rápido não mede reação completa. Use os relatórios de [VALIDACAO.md](VALIDACAO.md) como evidência da versão indicada, sem extrapolar para o Aetherfall inteiro.

`python3 dot stop` cancela ações e solta controles, inclusive sem mundo. Use antes de devolver o teclado. Não retome automaticamente após intervenção humana. [API-1.1.md](API-1.1.md) contém schemas e condições de conclusão.
