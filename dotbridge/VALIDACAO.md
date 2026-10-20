# Validação do DotBridge 1.1.0

Testes em 20 de outubro de 2026, Linux amd64, Java 21, Xorg e Mesa llvmpipe (renderização por CPU). Esta página descreve a versão 1.1.0; [a evidência da 1.0.0](docs/validation-1.0.0.md) é histórica.

## Ambiente e binário

Minecraft Java **1.21.1**, NeoForge **21.1.259**, conforme o [manifesto do Aetherfall](docs/aetherfall-manifest.json). O teste usou uma cópia descartável de mundo Superflat, separada da instância anterior, com porta/token próprios. Os comandos de administrador usados para montar obstáculos, blocos e alvos pertencem apenas à preparação desse mundo de teste. A API do mod não envia esses comandos nem exige permissões de administrador.

Carregados juntos, nas versões extraídas do pacote original: Shoulder Surfing **5.2.0**, Spatial GUI **1.8**, YACL **3.8.2**, Sodium **0.8.13**, ImmediatelyFast **1.6.14**, EntityCulling **1.11.3**, FerriteCore **7.0.3** e ModernFix **5.27.26**. As dependências embutidas desses mods também foram carregadas. Esses JARs externos não são redistribuídos no DotBridge.

A execução foi pelo cliente de desenvolvimento NeoForge. Os 31 arquivos de classes e dois recursos compilados foram comparados byte a byte com as entradas do JAR distribuído; [BUILD_INFO.json](BUILD_INFO.json) e o [relatório de build](docs/build-validation-1.1.0.json) identificam seu SHA-256. Não é uma execução pelo TLauncher.

## Testes automatizados

**244 passaram, sem falhas:** 160 Java, 31 do cliente/exemplos Python e 53 das ferramentas/instalador/empacotador. Incluem validação de objetivos, limites de velocidade/aceleração, watchdog monotônico, eventos paginados, precondições e recuperação de inventário, proteção HTTP/Host/Origin, compatibilidade dos comandos anteriores, staging e proteção do JAR antigo.

## Verificações no jogo

**31 cenários cobertos com sucesso no JAR publicado:** 18 de objetivos/controle, 12 de inventário e um de visibilidade. Essa contagem inclui uma repetição direcionada da coleta, descrita abaixo; não significa que todas as tentativas iniciais passaram.

| Evidência | Resultado |
| --- | --- |
| [Objetivos e controle](docs/runtime-goals-1.1.0.json) | F5 físico e pela API, três vistas, observação durante a espera, mira/mineração, alvo em movimento e perda de alvo, cumprimento seguro/restauração, recusa de cumprimento inseguro, intervenção manual, menu, expiração de heartbeat durante movimento, obstáculo/lava/borda, sequência limitada e saída do mundo |
| Câmera em chão uniforme, sem entidades nem pontos elevados | Um objetivo de 100 ticks moveu a câmera em 74,27°, sem andar nem receber novos objetivos. Máximos observados por eixo: 5°/tick e 0,70001°/tick²; pequenas diferenças de ponto flutuante incluídas |
| [Inventário com Spatial GUI](docs/runtime-inventory-spatial-1.1.0.json) | Cinco cliques por IDs reais, confirmados pelo servidor; um tronco transformado em quatro tábuas. Item/revisão desatualizados recusados com HTTP 409, sem alteração. Ao final, cursor e grade vazios, menu fechado |
| [Visibilidade](docs/runtime-visibility-1.1.0.json) | Minério atrás de uma parede omitido e revelado somente após remover a parede. Entidade atrás da câmera omitida e revelada após virar |

Na [primeira tentativa de mineração](docs/runtime-goals-first-1.1.0.json), a pedra quebrou com confirmação do servidor, mas não houve pacote de coleta nem aumento de inventário durante a janela. O mod informou `broke=true` e `collected=false`, e a expectativa de coleta do teste falhou. A posição final do drop não foi preservada; a causa da ausência de coleta não foi determinada. A [repetição no mesmo JAR](docs/runtime-mining-rerun-1.1.0.json), com uma pedra diretamente acima do jogador parado, confirmou quebra, pickup real de um pedregulho e inventário +1 em 17 ticks. Nenhum item substituto foi criado para satisfazer a confirmação.

O Spatial GUI estava ativo, com os painéis inclinados e deslocados conforme a configuração do pacote. [Captura da receita durante o teste](docs/spatialgui-recipe-1.1.0.png); também foram preservadas as capturas [antes](docs/spatialgui-before-1.1.0.png) e [depois](docs/spatialgui-after-1.1.0.png). IDs, versões e hashes dos mods de compatibilidade estão no [registro de extração](docs/compatibility-mods-1.1.0.json).

## Medições separadas

Valores desta máquina de teste, sem uma chamada real a modelo de IA:

| Medida | Resultado | Escopo |
| --- | --- | --- |
| HTTP `state`, 50 consultas | mediana **0,875 ms**, p95 **3,230 ms** | Ida e volta local de snapshot em cache |
| Idade do snapshot recebida pelo cliente | mediana **23,5 ms**, p95 **47 ms** | Tempo desde captura; diferente do tempo HTTP |
| Aceitação até primeiro tick de execução, 13 objetivos | mediana **17,904 ms**, máximo **40,275 ms** | Começa na aceitação na thread do jogo; exclui HTTP e fila anterior |
| Confirmação dos cinco cliques de inventário | **222–261 ms** | Resultado observado após atualizações do servidor; aceitação HTTP levou 13–29 ms |

O [relatório de objetivos](docs/runtime-goals-1.1.0.json) contém as amostras e definições. O início de ação não é o tempo até terminar a ação nem até uma decisão da IA.

Para FPS, foram medidas janelas de cinco segundos por condição. Com a vista fixa, a mediana foi 46 FPS sem objetivo e 56 FPS com observação de alvo fixo; esse caso **não inclui** a seleção automática de pontos de interesse. No [teste adicional de observação natural](docs/runtime-performance-1.1.0.json), em chão uniforme, as medianas foram **55 FPS sem objetivo e 58 FPS observando**, com variação de câmera de 76,68° horizontal e 16,38° vertical. O jogador permaneceu na mesma posição.

Nessa segunda comparação, o tempo mediano instrumentado do trabalho do DotBridge por tick foi de **49,168 µs para 121,295 µs**; p95 com observação: **231,675 µs**. A métrica cobre os manipuladores Pre/Post de tick do mod, não o frame completo, o servidor, o HTTP nem todas as tarefas agendadas por requisições.

Essas janelas são curtas, usam renderização por CPU, sofrem aquecimento/ruído e, no caso natural, mudam a cena visível. **A diferença de FPS não demonstra ganho causado pelo mod nem mede com confiança seu impacto isolado.** Medições anteriores de outro hash estão identificadas no relatório e não foram misturadas com as da entrega final.

## Limites da evidência

- **Aetherfall completo e TLauncher não foram executados.** Foi testado o conjunto de compatibilidade acima, usando as versões do pacote fornecido.
- Não foram validados servidores externos, anticheats, perda de rede real, todas as criaturas/receitas/blocos de conteúdo do Aetherfall, combate com Better Combat, sessões longas ou desempenho em GPU física.
- A perda de heartbeat e a saída do mundo são cenários separados. Na saída pela interface, a intervenção manual cancela o objetivo antes da desconexão; isso não simula uma falha remota de rede.
- A confirmação de inventário usa revisões/alterações recebidas do servidor, não um ACK de transação específico que o protocolo vanilla não fornece. Resultado incerto exige atualização estável e nova consulta antes de permitir outra tentativa.
- Coleta correlaciona pacote recebido perto do alvo e aumento do inventário; não prova a origem causal de cada item. Não há busca automática de drops fora do alcance de coleta.
- FPS e tempo HTTP desta máquina não são a latência da IA nem garantia de desempenho no computador do Dot. A consulta de estado usa cache; início da ação depende do tick e o modelo tem latência própria.
- A percepção é amostrada e conservadora. Não é um mapa completo. Sem ponto de interesse visível adequado, a observação mantém a vista em vez de inventar alvos.

## Atualização e reversão

A entrega preserva a release **dotbridge-v1.0.0**, o modpack original e a instância anterior. O instalador sem argumentos prepara apenas staging; consulte [ATUALIZACAO-1.1.md](ATUALIZACAO-1.1.md) para trocar uma única versão com o jogo fechado e reverter.
