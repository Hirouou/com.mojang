# Instruções para o Dot

Use a ferramenta de terminal no Linux em que o Minecraft roda. Este documento
descreve uma API do jogo, não concede novas ferramentas ou acesso ao computador.

Na versão publicada no repositório, configure uma vez com o Minecraft fechado:

```bash
python3 install.py --game-dir "/caminho/real/do/perfil/Aetherfall"
```

Depois use `python3 dot state`, `python3 dot observe --radius 2`,
`python3 dot camera --wait` e `python3 dot stop`. O wrapper `dot` usa a
configuração local salva e dispensa repetir `--game-dir`. Os exemplos abaixo
também mostram a CLI direta, útil para selecionar outro perfil explicitamente.

1. Descubra o diretório real do perfil NeoForge 1.21.1 no TLauncher e a pasta
   extraída do DotBridge. O token fica em `<diretorio-do-jogo>/config/dotbridge.token`.
   Não copie o token para mensagens ou logs.
2. Execute `python3 client/dotbridge.py health` dentro da pasta do pacote.
3. Execute `python3 client/dotbridge.py --game-dir CAMINHO state`.
   Só envie ações quando `can_control` for true. Um humano ou suas ferramentas
   de interface devem antes abrir o mundo e fechar as telas necessárias.
4. Consulte `observe --radius 2` para terreno próximo; reutilize `state` para
   posição, saúde, inventário, mira e resultado das ações.
5. Escolha uma ação curta, normalmente 3–10 ticks, aguarde com `--wait` e leia
   novamente o estado. Replaneje conforme o resultado; nunca suponha que aceitar
   uma ação equivale a alcançar uma posição ou destruir um bloco.
6. Antes de caminhar, considere blocos, colisões, quedas e líquidos. `collision`
   só indica se há forma de colisão, sem garantir apoio seguro. O mod não calcula
   caminhos nem detecta todos os perigos do Aetherfall.
7. Use `camera --wait` para alternar como F5, ou
   `camera --mode first_person --wait` para voltar à primeira pessoa. O campo
   `camera_perspective` em `state` confirma a perspectiva atual, incluindo
   `shoulder_surfing` no Aetherfall. Use `view_rotation` para a câmera independente;
   `player.rotation` descreve o corpo do jogador. Depois de `look`, aguarde um
   tick/uma nova observação para atualizar a mira. Depois use a mira para
   atacar, minerar, colocar blocos e interagir. Se precisar mudar
   de ferramenta, `hotbar 1` até `hotbar 9` selecionam a barra. Não há comandos
   de administrador nem operações diretas no inventário ou crafting.
8. Interrompa com `stop` antes de devolver o teclado. Se abrir um menu ou perder
   conexão, a ação é cancelada; não continue enviando ações cegamente.

Exemplos, substituindo CAMINHO pelo diretório do jogo:

```bash
python3 client/dotbridge.py --game-dir CAMINHO observe --radius 2
python3 client/dotbridge.py --game-dir CAMINHO look --yaw 0 --pitch 10 --wait
python3 client/dotbridge.py --game-dir CAMINHO camera --wait
python3 client/dotbridge.py --game-dir CAMINHO control --forward 1 --ticks 5 --wait
python3 client/dotbridge.py --game-dir CAMINHO attack --ticks 10 --wait
python3 client/dotbridge.py --game-dir CAMINHO stop
```

`forward=1` vai à frente, `-1` recua; `strafe=1` vai à esquerda, `-1` à direita.
Yaw 0 aponta sul, 90 oeste, -90 leste, 180 norte. Pitch positivo olha para baixo.
Os argumentos globais vêm antes do comando. Quando usar outro número de porta,
inclua `--url http://127.0.0.1:PORTA` antes do comando.

Para muitas decisões, importe `DotBridge` de `client/dotbridge.py` e mantenha o
processo Python aberto. Isso economiza inicializações de terminal, sem mudar o
tempo de resposta do modelo. Não consulte o mundo continuamente sem necessidade:
uma observação relevante e uma ação com duração reduzem chamadas e tokens.

Leia `README.md` para formato da API, limites e tratamento dos erros. Siga as
regras do servidor e preserve as versões do modpack já instalado.
