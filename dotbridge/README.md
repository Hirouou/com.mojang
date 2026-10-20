# DotBridge 1.1.0

Mod de cliente para **Minecraft Java 1.21.1 / NeoForge 21.1.259 / Linux / Java 21**. O Dot escolhe objetivos curtos; o controlador local ajusta a câmera e executa as entradas autorizadas sem exigir uma decisão de IA por tecla. O serviço de IA mantém seu próprio tempo de resposta.

O projeto continua nesta pasta. `control`, `look`, `camera`, `hotbar`, `attack`, `use` e `stop` permanecem disponíveis. A versão 1.1 acrescenta objetivos com prazo, câmera suave, heartbeat, eventos, percepção visível limitada e operações de inventário por slots. [Contrato completo](API-1.1.md).

## Entrega e instalação

Baixe a [release 1.1.0](https://github.com/Hirouou/com.mojang/releases/tag/dotbridge-v1.1.0) ou use esta cópia do repositório. Python **3.10+**, biblioteca padrão; JDK **21** somente para recompilar.

```bash
python3 install.py
```

O padrão prepara `staging/dotbridge-1.1.0/`, sem tocar no perfil ou na sessão aberta. Para uma primeira instalação, ou atualização após fechar o jogo e guardar o JAR anterior fora de `mods/`:

```bash
python3 install.py --game-dir "/caminho/real/do/perfil/Aetherfall"
```

O instalador verifica o SHA-256, preserva configuração/token e recusa outro `dotbridge*.jar`. Copie apenas o JAR instalável para `mods/`; ZIP e sources JAR ficam fora. Não mantenha duas versões do ID `dotbridge`. [Atualização e reversão detalhadas](ATUALIZACAO-1.1.md). A [release 1.0.0](https://github.com/Hirouou/com.mojang/releases/tag/dotbridge-v1.0.0) continua separada.

No TLauncher, use o perfil **NeoForge de Minecraft 1.21.1**, com Java 21. O manifest do Aetherfall `2026.10.19.185143` declara NeoForge `21.1.259`; as evidências estão em `docs/aetherfall-manifest.json` e `docs/aetherfall-verification.json`. Preserve o pacote existente. O DotBridge não exige servidor modificado nem privilégios administrativos.

## Começar

Abra o mundo e feche os menus antes de controlar o personagem:

```bash
python3 dot health
python3 dot state
python3 dot observe --radius 3
python3 dot camera --mode first_person --wait
python3 dot look -90 15 --wait
python3 dot stop
```

O wrapper usa o caminho/porta de `.dotbridge-local.json`; o cliente lê o token do perfil sem imprimir. Para escolher outro perfil explicitamente, use `python3 client/dotbridge.py --game-dir CAMINHO state`. Argumentos globais precedem o subcomando.

## Durante a espera da IA

Não é necessário manter o personagem imóvel até cada nova resposta: autorize `observe` ou outro objetivo específico e deixe o mod fazer pequenos ajustes. Isso exige um controlador vivo renovando o heartbeat, dentro de um prazo máximo. A observação automática move apenas a câmera; andar, atacar ou minerar precisam de autorização própria.

Exemplo Python, executando dentro de `client/`:

```python
from dotbridge import DotBridge

bridge = DotBridge(game_dir="/caminho/real/do/perfil")
with bridge.session(max_seconds=12, ttl_ms=1500) as session:
    accepted = bridge.goal({"type": "observe", "max_ticks": 200})
    result = session.wait(accepted["action_id"], timeout=11)
    print(result["status"], result.get("reason"))
```

`session.wait()` renova o prazo enquanto espera. Para aguardar uma API de IA, use uma tarefa assíncrona e `session.pump()` no mesmo loop finito; uma chamada bloqueante não mantém a autorização. Não há thread de heartbeat independente. A saída da sessão envia `stop`; se o processo travar, o último heartbeat expira no mod.

```bash
# Simula uma IA lenta; só observa, nunca anda ou ataca.
python3 client/example_wait.py --game-dir CAMINHO --execute --seconds 15 --ai-delay 5

# Consulta IDs reais de slots; sem --execute não transfere itens.
python3 client/example_inventory.py --game-dir CAMINHO
```

Sem `--execute`, os exemplos apenas consultam. Uma CLI `heartbeat` renova uma vez; `goal --wait` não renova continuamente. Para objetivos longos, use a sessão Python em vez de disparar comandos isolados.

## Objetivos e limites

| Tipo | Comportamento autorizado |
| --- | --- |
| `observe` | Câmera suave, pausas curtas e pontos de interesse visíveis; sem caminhar |
| `look_at`, `track` | Olhar para um ponto ou acompanhar uma entidade explícita |
| `move` | Entrada curta, sem navegação autônoma, com bloqueio diante de riscos imediatos |
| `mine` | Manter mira em bloco visível ao alcance e observar separadamente quebra/coleta |
| `interact` | Uma tentativa normal de uso; sem inventar confirmação do resultado |
| `combat` | Alvo explícito, alcance e cooldown normais; sem atacar por simples presença |
| `greet`, `presentation` | Câmera frontal e gestos seguros; restaurar perspectiva anterior |
| `sequence` | Até oito etapas previamente definidas, sem sequências aninhadas |

Cada objetivo aceita `max_ticks` de 1 a 1200, padrão 100. A sequência também tem limite total. Ações antigas continuam limitadas a 1–200 ticks. A 20 ticks/s, 1200 ticks representam aproximadamente um minuto; travamentos alteram essa relação. Heartbeat usa prazo de relógio monotônico, de 500 a 10000 ms. Seu vencimento é tratado no próximo tick disponível.

Pausa, morte, tela incompatível, desconexão, intervenção manual e `stop` interrompem o trabalho. Abrir uma tela de inventário cancela ações no mundo; a API específica de inventário pode operar o menu permitido. Uma retomada exige nova decisão/autorização. Verificações de risco são conservadoras e podem interromper em formas parciais ou obstáculos; não são um planejador de caminhos.

## Percepção e inventário

`observe` usa 96 raios no campo de visão, primeiros impactos, linha de visão de entidades e chunks já carregados. Retorna no máximo 96 blocos e 32 entidades de uma consulta local limitada. Não é uma varredura do cubo nem um mapa completo. Pontos de interesse e o bloco sob a mira incluem IDs reais, nomes, posição, distância e evidências; blocos de mods podem ter interação `unknown`.

Inventário e crafting usam o menu real: `container_id`, `state_id`, `slots[].slot`, item no cursor e pré-condições. O Spatial GUI pode inclinar/mover painéis sem alterar esses IDs. Uma operação aguarda mudanças sincronizadas pelo servidor e estabilização antes de concluir. Falta de confirmação resulta em falha/incerteza, não em repetição automática. Menus modded incompatíveis podem ser recusados. A automação de inventário requer Survival ou Adventure, não Creative.

O crafting usa a grade e o slot de resultado observados: coloque ingredientes por operações confirmadas e retire um resultado observado por vez. Não há resolvedor universal de receitas nem transferência por pixels. [Exemplo de slots](client/example_inventory.py).

## Estado, eventos e desempenho

Snapshots têm `sequence`, `tick`, `captured_at_ms`, `snapshot_age_ms` e resultados por ID. Estados locais: `observing`, `moving`, `mining`, `interacting`, `combat`, `interrupted`. O journal de eventos tem cursor e limite; em `dropped: true`, obtenha novo estado em vez de reconstruir uma sequência incompleta.

Os campos `metrics.fps` e `metrics.client_tick_work_*`, a idade dos dados e `start_delay_ms` permitem investigar atraso. Eles não são um benchmark completo. HTTP do estado em cache, idade do snapshot, tempo até o primeiro tick da ação, custo local e tempo do modelo devem ser medidos separadamente. Resultados antigos de HTTP não representam reação completa da IA.

## Compatibilidade, segurança e validação

A API escuta somente `127.0.0.1:8765`, com token Bearer e proteção de Host/Origin. Não oferece shell, autenticação alternativa ou comandos administrativos. O Dot precisa compartilhar o ambiente de rede e acesso autorizado ao token. Não coloque `config/dotbridge.token` em mensagens, logs ou Git.

A integração opcional de Shoulder Surfing preserva seu F5, rotação independente e retorno à perspectiva. Sodium, ImmediatelyFast, EntityCulling, FerriteCore, ModernFix e Spatial GUI são considerados na integração; a situação **testada** por versão está em [VALIDACAO.md](VALIDACAO.md). Não confunda implementação compatível por API com uma sessão inteira de Aetherfall validada. `docs/runtime-neoforge-21.1.259.json` e `docs/latency-local.json` são evidências históricas da 1.0, salvo indicação explícita de outra versão.

Configuração local, criada no perfil:

```json
{"port":8765,"backgroundControl":true}
```

`backgroundControl` permite simulação com o terminal em foco; não remove o bloqueio por menu de pausa. Cada instância precisa de porta própria. A faixa declarada de NeoForge é `[21.1.259,21.2)`; a compilação fixa `21.1.259`.

Para recompilar/testar com JDK 21:

```bash
./gradlew build
python3 -m unittest discover -s client -p 'test_*.py' -v
python3 -m unittest discover -s tools -p 'test_*.py' -v
python3 tools/package_release.py --jar build/libs/dotbridge-1.1.0.jar --output build/release
```

O empacotador registra o hash do JAR selecionado e distingue evidência anterior de teste do novo binário. [API completa](API-1.1.md), [guia do Dot](COMO_USAR_COM_O_DOT.md) e [plano de atualização](ATUALIZACAO-1.1.md).
