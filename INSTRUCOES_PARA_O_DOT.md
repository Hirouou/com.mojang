# Dot: preparar e usar o Aetherfall com DotBridge

Você tem acesso ao terminal/Python do Linux em que o Minecraft roda. Use o
DotBridge para obter o estado do jogo e enviar ações. A versão conferida do
pacote é **Aetherfall 2.0 / Minecraft 1.21.1 / NeoForge 21.1.259 / Java 21**.

## Preparar uma vez

1. Use o perfil Aetherfall existente no TLauncher. Se ainda não estiver
   instalado, o [ZIP original está nesta release](https://github.com/Hirouou/com.mojang/releases/tag/aetherfall-2.0-2026-10-19);
   siga o arquivo `LEIA-ME-INSTALACAO.txt` dele. Preserve a versão do jogo e do
   NeoForge. Use a conta e os servidores autorizados pelo usuário.
2. Identifique o **diretório do jogo desse perfil** nas configurações do
   launcher. Não presuma que é `~/.minecraft` nem que é a pasta do repositório.
3. Com o Minecraft fechado, clone o repositório e instale o DotBridge:

   ```bash
   git clone https://github.com/Hirouou/com.mojang.git
   cd com.mojang
   python3 dotbridge/install.py --game-dir "/caminho/real/do/perfil"
   ```

   Se o repositório já estiver clonado, use essa cópia. O instalador verifica
   o hash do JAR e registra o caminho local; não coloca tokens no Git.
   Se existirem vários perfis, use `--profile ID_DO_PERFIL` para selecionar
   os metadados. Se o instalador informar que não encontrou metadados,
   confira a versão no launcher antes de continuar.
4. Abra o perfil, entre em um mundo/servidor e feche as telas de menu. Para
   login, abertura de mundo e menus, use suas ferramentas normais de interface
   ou a ajuda do usuário. A API não opera essas telas.
5. Dentro da pasta `com.mojang`, confira:

   ```bash
   python3 dotbridge/dot health
   python3 dotbridge/dot state
   ```

   Para controlar o jogo, `connected` e `can_control` devem ser `true`.
   O wrapper lê automaticamente o caminho, a porta e o token local.

## Jogar em ciclos curtos

Observe, escolha uma ação, espere seu resultado e confira o estado novamente:

```bash
python3 dotbridge/dot observe --radius 2
python3 dotbridge/dot look --yaw 0 --pitch 10 --wait
python3 dotbridge/dot control --forward 1 --ticks 5 --wait
python3 dotbridge/dot state
```

Comece com ações de **3–10 ticks**. Verifique o terreno, colisões, líquidos e
quedas antes de caminhar. O mod não calcula caminhos; aceitar um comando não
significa alcançar o destino. `state` é leve; use `observe` quando precisar
dos blocos e entidades próximos, sem pedir raios grandes desnecessariamente.

Comandos úteis:

| Objetivo | Comando após `python3 dotbridge/dot` |
| --- | --- |
| Estado, posição, saúde e inventário | `state` |
| Blocos e entidades próximos | `observe --radius 2` |
| Girar a câmera | `look --yaw -90 --pitch 15 --wait` |
| Alternar como **F5** | `camera --wait` |
| Voltar à primeira pessoa | `camera --mode first_person --wait` |
| Selecionar a barra de itens | `hotbar 1 --wait` até `hotbar 9 --wait` |
| Andar à frente por 5 ticks | `control --forward 1 --ticks 5 --wait` |
| Atacar/minerar pela mira | `attack --ticks 10 --wait` |
| Usar/interagir pela mira | `use --ticks 1 --wait` |
| Interromper | `stop` |

`forward=1` vai à frente, `-1` recua. `strafe=1` vai à esquerda e `-1` à direita.
Yaw 0=sul, 90=oeste, -90=leste, 180=norte. Pitch positivo olha para baixo.

No Shoulder Surfing, consulte `camera_perspective` e `view_rotation`: a câmera
pode ter rotação diferente do corpo, descrito em `player.rotation`. A alternância
pela API segue o F5 normal e o ciclo configurado pelo mod. Após `look`, aguarde
o próximo tick/observação para atualizar a mira antes de atacar ou usar um item.

## Tratar interrupções

Se receber HTTP 409, examine `state`, confira menus/pausa e retome somente
quando o jogo permitir controle. Uma ação cancelada ou substituída deve causar
uma nova decisão. Em timeout, consulte o estado antes de repetir uma ação.
Use `stop` antes de devolver o teclado ao usuário.

Não leia nem cole o conteúdo de `dotbridge.token` em mensagens. O cliente
Python faz a autenticação automaticamente. Mantenha a API em `127.0.0.1`.
Se o Dot roda em outro contêiner ou computador, o endereço local aponta para
outro ambiente: execute o cliente no ambiente do Minecraft.

Para loops persistentes, importe `DotBridge` de `dotbridge/client/dotbridge.py`
e reutilize o processo Python. A API e os limites completos estão no
[README do projeto](dotbridge/README.md). Os limites do teste estão em
[VALIDACAO.md](dotbridge/VALIDACAO.md).
