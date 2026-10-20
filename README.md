# Aetherfall 2.0 + DotBridge

Arquivos para jogar **Minecraft Java 1.21.1 com NeoForge 21.1.259** no Linux e
permitir que o Dot observe e controle o jogo pelo terminal/Python.

| Download | Conteúdo |
| --- | --- |
| [Aetherfall 2.0 — ZIP original, 859 MiB](https://github.com/Hirouou/com.mojang/releases/download/aetherfall-2.0-2026-10-19/Aetherfall-2.0-Compartilhar-2026-10-19_18-51-43.zip) | Modpack original já publicado neste repositório |
| [DotBridge — pacote pronto para Linux](https://github.com/Hirouou/com.mojang/releases/tag/dotbridge-v1.0.0) | Mod compilado, cliente Python, instalador e instruções |
| [Instruções para o Dot](INSTRUCOES_PARA_O_DOT.md) | Preparação do perfil e comandos de controle |

O `manifest.json` do Aetherfall foi conferido: pacote `2026.10.19.185143`,
Minecraft `1.21.1`, carregador primário `neoforge-21.1.259`.

## Instalação rápida

Prepare o perfil do Aetherfall no TLauncher, com **Java 21**, seguindo o
`LEIA-ME-INSTALACAO.txt` do ZIP original. Identifique a pasta do jogo desse
perfil e feche o Minecraft. Depois, no Linux do Dot:

```bash
git clone https://github.com/Hirouou/com.mojang.git
cd com.mojang
python3 dotbridge/install.py --game-dir "/caminho/da/instancia/Aetherfall"
```

Substitua o caminho pelo diretório real do perfil Java do TLauncher. O
instalador verifica o JAR, copia o mod para `mods/`, prepara a configuração
local e preserva os outros mods, o token e as configurações existentes.
O Python precisa ser **3.10 ou mais recente**; não é necessário instalar pacotes
pip. Quem baixar apenas o ZIP do DotBridge pode executar `python3 install.py
--game-dir CAMINHO` dentro da pasta extraída.

Abra o Minecraft pelo mesmo perfil, entre no mundo e feche os menus. Então:

```bash
python3 dotbridge/dot health
python3 dotbridge/dot state
python3 dotbridge/dot observe --radius 2
python3 dotbridge/dot camera --wait
python3 dotbridge/dot stop
```

`camera` alterna a perspectiva como **F5**, incluindo Shoulder Surfing.
`state` deve indicar `connected: true` e `can_control: true` para enviar ações.
O mod é de cliente e não exige mudanças no servidor ou comandos de administrador.

## Uso pelo Dot

O Dot precisa executar seus comandos no mesmo Linux e ambiente de rede local
do Minecraft. Após instalar, ele pode seguir [este guia](INSTRUCOES_PARA_O_DOT.md)
e o [manual de controle](dotbridge/COMO_USAR_COM_O_DOT.md).
O token é gerado pelo mod em `config/dotbridge.token` e lido automaticamente
pelo cliente. A configuração do caminho fica em `dotbridge/.dotbridge-local.json`,
ignorada pelo Git. Não coloque tokens ou dados de sessão no repositório.

O DotBridge reduz etapas de observação e controle por tela. O tempo de resposta
do serviço GPT continua dependendo do próprio serviço e da ferramenta do Dot.

## Código e validação

O projeto fica em [`dotbridge/`](dotbridge/), com código Java, SDK Python,
testes, verificador de perfis, instalador e instruções completas.
O GitHub Actions compila com Java 21, executa os testes e gera o pacote de
distribuição quando esses arquivos mudam.

Foram realizados 131 testes automáticos do mod, cliente, instalação e pacote, e 13
verificações dentro do Minecraft com NeoForge 21.1.259 e Shoulder Surfing
1.21.1-5.2.0. O modpack inteiro e o TLauncher não foram executados nesse teste.
Veja os detalhes em [VALIDACAO.md](dotbridge/VALIDACAO.md).

A licença MIT em `dotbridge/LICENSE` aplica-se ao DotBridge. Os demais conteúdos
e mods preservam suas próprias licenças.
