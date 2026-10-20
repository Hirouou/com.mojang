# Atualizar ou reverter o DotBridge 1.1.0

Esta entrega é separada da [1.0.0](https://github.com/Hirouou/com.mojang/releases/tag/dotbridge-v1.0.0). Preparar ou baixar a versão nova não autoriza trocar arquivos de uma sessão em execução. Minecraft 1.21.1, NeoForge 21.1.259 e Java 21 continuam os mesmos.

## Preparar com o jogo ainda aberto

Baixe/extraia a [release 1.1.0](https://github.com/Hirouou/com.mojang/releases/tag/dotbridge-v1.1.0) fora da pasta do perfil. Dentro da distribuição:

```bash
python3 install.py
```

Sem `--game-dir`, o instalador verifica o hash e prepara apenas `staging/dotbridge-1.1.0/`, com JAR e metadados. `--stage-dir PASTA` escolhe outra pasta separada. Nenhum mod/configuração/token da sessão é alterado. A pasta de staging não pode ficar dentro de um perfil ou de `mods/`, `config/`, `versions/` ou `saves/`.

## Trocar depois de fechar o Minecraft

1. Envie `stop` ao controlador antigo e encerre seus loops. Feche o Minecraft por completo.
2. Identifique o diretório real do perfil Java. Guarde o `dotbridge-1.0.0.jar` antigo **fora de `mods/`**, em uma pasta de backup. Mudar apenas a extensão/nome dentro de `mods/` não é uma boa estratégia de reversão.
3. Preserve `config/dotbridge.json` e `config/dotbridge.token`. Não publique seu conteúdo. Não altere os outros mods nem as versões do Aetherfall.
4. Na distribuição 1.1, execute:

   ```bash
   python3 install.py --game-dir "/caminho/real/do/perfil"
   ```

   O instalador recusa outro `dotbridge*.jar`. Não use substituição forçada nem deixe dois JARs com o mesmo ID. Se a instalação for manual, copie somente `dotbridge-1.1.0.jar`, não o ZIP nem o sources JAR.
5. Abra o mesmo perfil e confira `python3 dot health`. A versão deve ser `1.1.0`. Depois confira `state` e teste primeiro apenas observação/câmera em local seguro.

A 1.1 mantém os comandos antigos, mas acrescenta cancelamento por heartbeat/intervenção e risco de movimento. Novos objetivos e inventário exigem autorização explícita de prazo curto. O campo de visão agora limita `observe`; não é mais a lista completa de blocos de um cubo. Atualize também o SDK e leia [API-1.1.md](API-1.1.md).

## Reverter

Pare o controlador, feche o jogo, retire `dotbridge-1.1.0.jar` de `mods/` e restaure o JAR 1.0 guardado ou obtido na release anterior. Deixe apenas uma versão. Preserve o token/configuração e use o cliente da versão correspondente. Reinicie e confira `health` antes de controlar.

A reversão do mod não desfaz ações já confirmadas no mundo ou no inventário. Em operações incertas, consulte o estado real antes de continuar. Não teste troca de versão em mundos importantes sem a política de backup que você já utiliza.

## Validar esta entrega

O JAR, fontes e hashes vêm na release 1.1.0. `BUILD_INFO.json` identifica os bytes; os documentos de validação distinguem testes históricos e atuais. Evidências da 1.0 e números antigos de HTTP não comprovam comportamento da 1.1. Consulte [VALIDACAO.md](VALIDACAO.md) para os resultados efetivamente obtidos e o que permaneceu sem validação.
