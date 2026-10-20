# Evidência histórica: DotBridge 1.0.0

# Validação da entrega

Verificação realizada em **20 de outubro de 2026**, em Linux amd64, Java 21,
Xorg e renderização Mesa llvmpipe.

## Pacote conferido

O ZIP fornecido pelo usuário declara em `manifest.json`:

- Nome: **Aetherfall 2.0**.
- Versão: **2026.10.19.185143**.
- Minecraft: **1.21.1**.
- Carregador primário: **NeoForge 21.1.259**.

A evidência original está em `aetherfall-manifest.json`; URL, tamanho do
arquivo, CRC e SHA-256 do manifest estão em `aetherfall-verification.json`.
A consulta usou intervalos HTTP do ZIP, sem baixar ou instalar o pacote inteiro.
O JAR do Shoulder Surfing usado no teste foi lido do mesmo arquivo fornecido.
Ele não é redistribuído nesta entrega.

## Compilação e testes automáticos

- Compilação Java 21 para **NeoForge 21.1.259**: aprovada.
- **66 testes Java**: 58 de ações/validação e 8 do servidor HTTP com conexões reais.
- **17 testes Python** do SDK/CLI: aprovados.
- **15 testes Python** do verificador de perfis/manifests: aprovados.
- Total: **98 testes automáticos**, sem falhas.

Os testes incluem autenticação, limites, parâmetros malformados, JSON estrito,
Host/Origin, timeout com cancelamento, resultados por ID e comandos de câmera.

## Teste real do jogo

Executamos Minecraft **1.21.1**, NeoForge **21.1.259**, DotBridge **1.0.0** e
**Shoulder Surfing Reloaded 1.21.1-5.2.0**, em um mundo descartável Creative,
Superflat. As **13 verificações** passaram:

1. Versões exatas reconhecidas pelo jogo.
2. Mundo conectado e controle disponível.
3. Campos JSON nulos presentes conforme o contrato.
4. Alternância pela API igual ao F5 físico, incluindo `shoulder_surfing`.
5. Seleção explícita das três perspectivas vanilla.
6. Rotação de câmera mantida após seis ticks em Shoulder Surfing.
7. Movimento de 10 ticks alterando a posição do jogador.
8. Parada cancelando a ação e soltando os controles.
9. Seleção da barra de itens.
10. Leitura de blocos próximos.
11. Ataque e uso com mira para o céu, sem alvo.
12. Menu bloqueando novas ações e cancelando movimento.
13. Desconexão bloqueando movimento e permitindo `stop`.

A sequência observada da câmera pela API e pelo F5 foi idêntica:
`third_person_back → third_person_front → shoulder_surfing → first_person`.
A configuração do Shoulder Surfing pode alterar esse ciclo; o comando usa
o atalho normal para respeitá-la. O relatório detalhado está em
`runtime-neoforge-21.1.259.json`.

Também houve um teste preliminar sem Shoulder Surfing, antes da confirmação do
ZIP, que passou. O teste acima é o relevante para as versões finais.

## Tempo de consulta local

Em 50 consultas a `GET /v1/state`, com mundo aberto, a mediana foi **2,156 ms**
e o percentil 95 foi **7,951 ms** neste ambiente isolado. Isso mede somente a
resposta HTTP de um estado já pronto. Não inclui a execução de ações no tick,
a resposta do GPT nem o custo de rodar todos os mods do Aetherfall.
Os dados estão em `latency-local.json`.

## Limites da verificação

O **modpack inteiro e o TLauncher não foram executados**. A versão do pacote foi
confirmada no manifest, e o teste do jogo usou NeoForge e Shoulder Surfing nas
versões indicadas. Não foram testados servidores externos, combate do Better
Combat, crafting, telas específicas do Aetherfall, mudanças de dimensão ou
sessões longas. Ataque/uso foram verificados sem alvo; isso não valida combate
ou quebra/colocação de todos os blocos de outros mods.

O DotBridge usa entradas e eventos do cliente, não altera arquivos do servidor
nem concede permissões adicionais. O código-fonte e os testes estão incluídos
para permitir ajuste caso outra integração específica do pacote seja necessária.

## Integração no repositório GitHub

A publicação em `Hirouou/com.mojang` acrescentou instalador, atalho `dot` e
empacotamento portátil. A compilação do repositório passou; os **131 testes
automáticos atuais** passaram: 66 Java, 17 do cliente Python, 17 do verificador
de perfis, 18 do instalador e 13 do empacotador. O JAR resultante tem o mesmo
SHA-256 do JAR verificado nos 13 testes dentro do jogo descritos acima.
