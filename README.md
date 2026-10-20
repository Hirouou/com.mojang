# Aetherfall 2.0 + DotBridge 1.1.0

DotBridge permite ao Dot controlar **Minecraft Java 1.21.1 / NeoForge 21.1.259 / Linux** por uma API local. Na versão 1.1, o Dot envia um objetivo curto e o mod cuida dos pequenos ajustes de câmera e controle enquanto o controlador continua ativo. Isso reduz decisões por tecla; não acelera o modelo de IA.

| Entrega | Link |
| --- | --- |
| Aetherfall 2.0 original | [ZIP do modpack](https://github.com/Hirouou/com.mojang/releases/download/aetherfall-2.0-2026-10-19/Aetherfall-2.0-Compartilhar-2026-10-19_18-51-43.zip) |
| DotBridge 1.1.0 | [Release separada para Linux](https://github.com/Hirouou/com.mojang/releases/tag/dotbridge-v1.1.0) |
| DotBridge 1.0.0 | [Release anterior, preservada para reversão](https://github.com/Hirouou/com.mojang/releases/tag/dotbridge-v1.0.0) |
| Guia do agente | [INSTRUCOES_PARA_O_DOT.md](INSTRUCOES_PARA_O_DOT.md) |

O manifest do ZIP fornecido declara Aetherfall `2026.10.19.185143`, Minecraft `1.21.1` e NeoForge `21.1.259`. Essa conferência não demonstra compatibilidade de execução com o pacote inteiro. Resultados por versão e limitações ficam em [VALIDACAO.md](dotbridge/VALIDACAO.md); relatórios antigos não validam automaticamente o JAR novo.

## Preparar sem alterar a sessão atual

Java **21** e Python **3.10+**, sem pacotes pip. No mesmo Linux do Minecraft:

```bash
git clone https://github.com/Hirouou/com.mojang.git
cd com.mojang
python3 dotbridge/install.py
```

Sem argumentos, o instalador verifica o JAR e prepara `dotbridge/staging/dotbridge-1.1.0/`. Ele não troca o mod da sessão atual. A atualização do perfil deve ocorrer somente depois de fechar o Minecraft: guarde o JAR antigo **fora de `mods/`**, mantenha configuração/token e então execute:

```bash
python3 dotbridge/install.py --game-dir "/caminho/real/do/perfil/Aetherfall"
```

Não mantenha dois JARs com o ID `dotbridge` em `mods/`. O instalador recusa outro `dotbridge*.jar`. Veja [atualização e reversão](dotbridge/ATUALIZACAO-1.1.md). Use o perfil Java do TLauncher; as outras pastas deste repositório não definem seu diretório de jogo.

## Controle local durante a espera

Após abrir o mundo:

```bash
python3 dotbridge/dot health
python3 dotbridge/dot state
python3 dotbridge/dot observe --radius 3
python3 dotbridge/dot camera --mode first_person --wait
```

Para observar enquanto uma decisão de IA assíncrona demora, o controlador precisa renovar um heartbeat de prazo curto dentro de uma sessão finita. O exemplo abaixo **simula** essa espera; só autoriza observar, sem andar ou atacar:

```bash
python3 dotbridge/client/example_wait.py --game-dir "/caminho/real/do/perfil" --execute --seconds 15 --ai-delay 5
```

A câmera observa pontos de interesse visíveis com movimentos suaves. Movimento, mineração, interação, combate e cumprimento frontal dependem de objetivos explícitos. Ausência de objetivo não autoriza novas ações. Se o controlador travar, morrer ou deixar de renovar a autorização, o mod cancela o trabalho e solta as teclas. `stop` e intervenção manual têm prioridade.

A percepção usa campo de visão, linha de visão e chunks já carregados, com limites de resposta. Inventário/crafting usa IDs reais de slots e confirma alterações recebidas do servidor, em vez de clicar coordenadas dos painéis do Spatial GUI.

## Documentação e código

- [Manual do projeto](dotbridge/README.md): instalação, exemplos e limites.
- [Protocolo 1.1](dotbridge/API-1.1.md): heartbeat, objetivos, eventos, percepção e slots.
- [Guia operacional do Dot](dotbridge/COMO_USAR_COM_O_DOT.md).
- [Validação e medições](dotbridge/VALIDACAO.md): o que foi realmente testado.

A API fica exclusivamente em `127.0.0.1`, autenticada por token local; o cliente o lê sem imprimir. Não coloque tokens, configurações locais ou dados de sessão no Git. O mod não exige administrador, não altera autenticação, não adiciona conteúdo ao mundo e não exige mudanças no servidor. Em servidores, respeite as regras de automação.

A CI compila e testa o projeto e prepara artefatos. Métricas HTTP em cache não medem a resposta completa da IA nem provam impacto nulo em FPS. A licença MIT de `dotbridge/LICENSE` aplica-se ao DotBridge; os demais conteúdos mantêm suas licenças.
