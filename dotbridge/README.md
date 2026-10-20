# DotBridge — Minecraft 1.21.1 / NeoForge / Linux

Mod de **cliente** que oferece ao Dot uma API HTTP local para observar o jogo e
enviar ações pelo terminal ou Python, sem depender de capturas de tela.

O pacote inclui o `.jar`, o cliente Python sem dependências, um exemplo e o
código-fonte para recompilar. O mod não contém um modelo de IA: o Dot usa o
terminal do mesmo Linux em que o Minecraft está rodando para decidir as ações.

## Versões e compatibilidade

| Componente | Versão deste projeto |
| --- | --- |
| Minecraft Java | **1.21.1**, exclusivamente |
| NeoForge usado na compilação | **21.1.259** |
| Faixa declarada no mod | `21.1.259 <= NeoForge < 21.2` |
| Java para jogo e compilação | **21**; para compilar, instalar o JDK |
| Python para o Dot | **3.10 ou mais recente**, biblioteca padrão |
| ModDevGradle / Gradle Wrapper | **2.0.148 / 9.2.1** |

O TLauncher precisa iniciar um perfil **NeoForge para Minecraft 1.21.1**.
O mod não usa Fabric, Forge nem NeoForge de outras versões do Minecraft.
Ele não exige instalar nada no servidor nem dá permissões de administrador;
as interações usam os controles normais do cliente. Em multiplayer, use a
automação conforme as regras do servidor.

**Aetherfall 2.0:** conferimos o `manifest.json` do ZIP enviado pelo usuário,
`Aetherfall-2.0-Compartilhar-2026-10-19_18-51-43.zip`. Ele declara versão do
pacote `2026.10.19.185143`, Minecraft **1.21.1** e carregador primário
**`neoforge-21.1.259`**. A compilação usa essa versão exata. A evidência está
em `docs/aetherfall-manifest.json` e `docs/aetherfall-verification.json`.

A conferência do manifest não equivale a testar o jogo com todos os mods do
Aetherfall. O teste de execução usa Minecraft e NeoForge com o DotBridge;
consulte `VALIDACAO.md`. Combate, telas e atalhos específicos de outros mods
podem exigir integrações adicionais. Preserve as versões do pacote; não é
necessário atualizá-lo para instalar o DotBridge. Não redistribuímos o
Aetherfall nem arquivos do jogo.

O ZIP inclui **Shoulder Surfing 1.21.1-5.2.0**. O DotBridge tem integração
opcional com sua API de câmera: `look` atualiza também a rotação da câmera
independente, e `camera` no modo padrão passa pelo atalho normal de perspectiva
para respeitar o ciclo configurado pelo mod. Não é necessário adicionar esse
mod em perfis que não o usam. O campo `camera_perspective` distingue a visão
`shoulder_surfing` da terceira pessoa normal; `view_rotation` informa a rotação
da câmera, que pode diferir de `player.rotation`.

Para conferir outra cópia local do pacote ou perfil sem iniciar o Minecraft:

```bash
python3 tools/check_profile.py /caminho/Aetherfall.zip
python3 tools/check_profile.py /caminho/diretorio-do-jogo
```

O verificador lê somente metadados conhecidos. Se encontrar perfis diferentes,
informa ambiguidade; use `--profile ID_DO_PERFIL` ou passe o JSON exato.

## Instalar no Linux / TLauncher

Com o perfil Aetherfall já preparado e o Minecraft fechado, use o instalador
incluído nesta versão do repositório:

```bash
python3 install.py --game-dir "/caminho/real/da/instancia/Aetherfall"
```

Ele verifica o JAR, copia para `mods/`, cria `config/dotbridge.json` somente
se não existir e salva o caminho/porta em `.dotbridge-local.json`, ignorado
pelo Git. O token continua sendo criado pelo mod ao iniciar o jogo. Depois,
dentro desta pasta, use `python3 dot state`, `python3 dot camera --wait` e
`python3 dot stop`. O wrapper também funciona quando chamado de outro
diretório, usando seu caminho absoluto.

Para instalar manualmente:

1. Feche o Minecraft. Confira o Java 21 selecionado nas configurações do launcher.
2. Abra o **diretório do jogo do perfil** que já usa NeoForge 1.21.1. Pode ser
   `~/.minecraft`, uma pasta de versão ou outra pasta definida pelo launcher.
3. Copie **somente** `dotbridge-1.0.0.jar` para a subpasta `mods/` desse diretório.
   Não copie o ZIP ou o JAR de fontes para `mods/`.
4. Inicie o perfil. O mod gera `config/dotbridge.json` e
   `config/dotbridge.token` dentro desse mesmo diretório.
5. Entre em um mundo ou servidor e feche os menus para permitir ações.

No terminal, dentro da pasta extraída deste pacote, teste:

```bash
python3 client/dotbridge.py health
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" state
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" observe --radius 2
```

Substitua `"$HOME/.minecraft"` pelo diretório real do perfil. O comando `health`
confirma a API; `state` deve mostrar `connected: true` e `can_control: true`
quando o jogador está em um mundo sem menus abertos.

O token é lido automaticamente pelo Python. Ele fica no computador do jogo e
não precisa ser colado em mensagens. Se o Dot usa outro usuário do Linux,
execute-o com acesso autorizado a esse arquivo; não torne o token público.

## Usar com o Dot

Entregue ao Dot o arquivo `COMO_USAR_COM_O_DOT.md` e o caminho desta pasta.
O Dot deve usar o terminal do Linux do Minecraft. Em um contêiner ou máquina
separada, `127.0.0.1` aponta para outro ambiente; este pacote pressupõe que
ambos compartilham o mesmo ambiente de rede local e acesso ao token.

```bash
# Caminhar por 10 ticks, aproximadamente 0,5 s a 20 ticks/s
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" control --forward 1 --ticks 10 --wait

# Olhar para leste e ligeiramente para baixo
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" look --yaw -90 --pitch 15 --wait

# Selecionar o primeiro espaço da barra e atacar/minerar por até 1 s
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" hotbar 1 --wait
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" attack --ticks 20 --wait

# Usar o item ou interagir com o alvo na mira
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" use --ticks 1 --wait

# Alternar a perspectiva como F5, ou escolher a câmera diretamente
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" camera --wait
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" camera --mode third_person_back --wait

# Interromper o controle atual
python3 client/dotbridge.py --game-dir "$HOME/.minecraft" stop
```

Os parâmetros globais (`--game-dir`, `--url`, `--token-file`, `--timeout`)
vêm **antes** do subcomando. Consulte `python3 client/dotbridge.py --help`
e `python3 client/dotbridge.py control --help` para todas as opções.

Importação Python, executando na pasta `client/`:

```python
from dotbridge import DotBridge

bridge = DotBridge(game_dir="~/.minecraft")
observation = bridge.observe(radius=2)
if observation["can_control"]:
    accepted = bridge.control(forward=1, ticks=5)
    result = bridge.wait(accepted["action_id"], timeout=5)
    after = bridge.state()
```

`client/example_loop.py` mostra uma única rodada de observação e decisão.
Por padrão apenas observa; `--execute` permite girar a câmera.

## Resposta e desempenho

O estado é atualizado a cada tick do cliente. Em condições normais, 20 ticks
equivalem a um segundo. `/v1/state` entrega o último estado pronto, sem capturar
a tela; `/v1/observe` lê os blocos e entidades próximos no thread do jogo.
Um comando com vários ticks roda localmente, reduzindo chamadas ao modelo.

Isso reduz o trabalho de visão e controle, mas não acelera o serviço GPT nem
garante um tempo total de resposta. FPS, processamento do modpack, servidor,
rede e ferramenta usada pelo Dot continuam influenciando. Prefira `state`
para verificações frequentes e `observe --radius 2` para decisões locais.
Um raio 8 pode retornar milhares de blocos e consumir muitos tokens do modelo.
O `wait()` do cliente consulta resultados a cada 100 ms por padrão;
ao importar o SDK, pode passar `poll_interval=0.05` para consultar a cada 50 ms.

## Comportamento do controle

- Cada ação com duração aceita **1–200 ticks**; acaba e solta as teclas ao atingir
  o limite. Uma nova ação com duração substitui a anterior, com resultado
  `replaced`. `look`, `hotbar` e `camera` não interrompem o movimento.
- Pausa, desconexão ou abertura de uma tela cancelam o controle. Isso inclui
  inventário, chat e interfaces de outros mods. `stop` funciona mesmo sem mundo.
- Movimento usa `forward` de -1 a 1 e `strafe` de -1 a 1. `forward=1` anda à
  frente; `strafe=1` anda à esquerda. Zero libera aquele eixo. Diagonais seguem
  a física do jogo. `jump`, `sneak` e `sprint` são booleanos.
- `attack` mantém ataque/mineração; `use` mantém o uso do item/interação.
  Ambos usam o alvo da mira, alcance e regras normais. Não ative os dois na
  mesma ação. Se uma interação abrir uma tela, a ação será cancelada.
- O tempo é medido em ticks do cliente. Se o jogo travar, os ticks também
  param; o limite não é um relógio externo que mantém o jogo responsivo.
- Não há navegação automática, crafting, transferência entre inventários,
  login, entrada automática em mundos nem operação de menus. O Dot precisa
  decidir seu caminho e usar suas ferramentas habituais para preparar o jogo.
- Enquanto uma ação roda, o mod assume as teclas envolvidas. Use `stop` antes
  de assumir o teclado manualmente. As ações de câmera são absolutas:
  yaw 0=sul, 90=oeste, -90=leste, 180=norte; pitch positivo olha para baixo.
- `camera` alterna as perspectivas como F5, mesmo se a tecla estiver remapeada.
  Também aceita os modos `first_person`, `third_person_back` e
  `third_person_front`. O estado informa a câmera vanilla em `camera` e a
  perspectiva efetiva em `camera_perspective`. Com Shoulder Surfing, o ciclo e
  a substituição de terceira pessoa seguem a configuração desse mod.

## API HTTP

Endereço padrão: `http://127.0.0.1:8765`. Sem dependência de internet ou API paga.
Todas as rotas, exceto `/health`, exigem `Authorization: Bearer <token>`.

| Método / rota | Resultado |
| --- | --- |
| `GET /health` | Versão do mod, Minecraft e carregador |
| `GET /v1/state` | Estado pronto, jogador, inventário, mira e ações |
| `GET /v1/observe?radius=2` | Estado + blocos em um cubo e até 32 entidades próximas |
| `POST /v1/action` | Aceita uma ação e retorna `action_id` |

Corpos de ação (`Content-Type: application/json`):

```json
{"type":"control","forward":1,"strafe":0,"jump":false,"sprint":false,"sneak":false,"attack":false,"use":false,"ticks":10}
{"type":"look","yaw":-90,"pitch":15}
{"type":"hotbar","slot":1}
{"type":"camera","mode":"cycle"}
{"type":"attack","ticks":20}
{"type":"use","ticks":1}
{"type":"stop"}
```

Envie um objeto por pedido, não o bloco inteiro. Campos desconhecidos são
rejeitados. `control` omite campos para usar zero/false e duração de 1 tick;
`attack` e `use` também têm duração padrão de 1 tick. `look` exige yaw e pitch
finitos, com pitch entre -90 e 90. A barra usa posições 1–9.
`camera` sem `mode` usa `cycle`; os outros três valores são os modos explícitos
listados acima.

Uma resposta HTTP 202 confirma que a ação foi aceita. A conclusão aparece
em `active_action`, `last_action` e `recent_actions` (últimos 32 resultados).
O cliente Python acompanha pelo ID para distinguir conclusão de substituição.
Erros usam `{"ok":false,"error":"..."}`: 400 para parâmetros, 401 para token,
403 para origem/Host, 409 para estado do jogo, 413 para corpo muito grande,
415 para tipo de conteúdo, 429 para fila cheia e 503 para timeout do jogo.

`observe` aceita raio 1–8, omite ar e chunks não carregados e não gera terreno.
Cada bloco contém posição, ID de registro e `collision`. Isso não é uma
garantia de caminho seguro: líquidos, quedas, formas parciais, perigos e regras
de outros mods precisam ser considerados pelo agente. O inventário retorna
apenas espaços ocupados, com índice interno `slot`; os nove primeiros também
incluem `hotbar_slot` em 1–9. O resultado `crosshair` descreve a mira atual;
após girar, espere um tick/uma nova observação se precisar do alvo atualizado.
Com câmera independente em terceira pessoa, também deixe o próximo frame/tick
atualizar a mira antes de atacar ou interagir.

## Configuração

Gerada na pasta do perfil em `config/dotbridge.json`:

```json
{
  "port": 8765,
  "backgroundControl": true
}
```

Altere com o jogo fechado. A porta aceita 1024–65535. Se mudar para 8766,
passe `--url http://127.0.0.1:8766` ao Python. Cada instância precisa de porta
própria. A API escuta **apenas em 127.0.0.1**, não publica acesso na internet.
Não aceita requisições com `Origin` de navegador e não oferece execução de
shell, arquivos arbitrários ou comandos administrativos do jogo.

`backgroundControl: true` desativa a pausa por perda de foco ao iniciar o mod.
O jogo pode assim continuar quando o Dot usa o terminal. O Minecraft pode
salvar essa preferência em `options.txt` ao salvar suas opções. O menu de
pausa continua interrompendo o controle. Com `false`, o mod não altera essa
preferência; ajuste a pausa por perda de foco no próprio Minecraft conforme
necessário.

## Problemas comuns

| Sintoma | Verificação |
| --- | --- |
| Conexão recusada | Minecraft aberto com o mod, porta e log `DotBridge ready` |
| Arquivo de token ausente | `--game-dir` deve apontar para o mesmo perfil onde o JAR foi instalado |
| HTTP 401 | Token e instância correspondem; se o token foi recriado, reinicie o cliente Python |
| HTTP 409 | Entre no mundo, feche menus e tire da pausa |
| HTTP 503 | O thread do jogo não respondeu em 2 s; aguarde carregamento ou reduza carga |
| Mod não carrega | Minecraft 1.21.1, NeoForge na faixa indicada e Java 21 |
| Porta ocupada | Ajuste `port` e a URL no cliente; consulte `logs/latest.log` |
| Token inválido | Feche o jogo e remova só `config/dotbridge.token`; ele será recriado |

## Compilar e testar

Instale **JDK 21**, confirme `java -version` e `javac -version` e execute:

```bash
chmod +x gradlew
./gradlew build
python3 -m unittest discover -s client -p 'test_*.py' -v
python3 -m unittest discover -s tools -p 'test_*.py' -v
```

O wrapper baixa o Gradle e verifica seu SHA-256; a primeira compilação precisa
de acesso aos repositórios Maven/NeoForge e arquivos oficiais do Minecraft.
O JAR de instalação fica em `build/libs/dotbridge-1.0.0.jar`.
O arquivo `VALIDACAO.md` registra o que foi realmente verificado nesta entrega.

Código do DotBridge sob licença MIT. Minecraft, NeoForge e demais nomes mantêm
suas licenças e marcas próprias.
