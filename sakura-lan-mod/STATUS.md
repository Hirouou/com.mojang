# SAKURA LAN — 1.043.04 ARMv7

Branch: `agent/sakura-lan-20260919`.

## Implementado no código

- Worker IL2CPP desligado com `il2cpp_thread_detach` antes de encerrar a pthread.
- Hook instalado sem depender da chegada do Client, com publicação de uma única
  instrução ARM e trampoline publicado antes do desvio. Só aceita o prólogo
  observado nesta versão; outra versão falha sem alterar a função.
- Reserva do trampoline em lacunas reais de `/proc/self/maps`, inclusive menores
  que 1 MiB, sem substituir mapeamentos existentes. Teste cobre lacuna estreita
  e falta de espaço, também em builds Release.
- O patch ARMv7 reserva uma página própria no ELF do jogo, dentro do alcance do
  desvio ARM. Preserva endereços e conteúdo dos segmentos originais; verifica o
  prólogo de 1.043.04 antes de modificar o arquivo. Não depende de lacunas de ASLR.
- Clone criado sob um pai inativo; scripts de gameplay removidos antes da
  ativação, sem duplicar controle, câmera, áudio ou física do player local.
- Referências gerenciadas mantidas por GC handles e limpeza ao trocar de cena.
- Posição/rotação dos players, rejeição de estados UDP atrasados e valores inválidos.
- Protocolo v2 para animação visual: hash de 32 bits, tempo normalizado, velocidade
  e peso de até quatro camadas de Animator. Resolução de overloads por tipo.
- Aparência visual em hierarquias compatíveis: ativação dos nós, escala, primeiro
  material do Renderer e sua cor. Materiais compartilhados não são recoloridos.
- NPCs encontrados pelo componente `CharaMove`: Host publica transform/Animator;
  Client aplica snapshots e suspende scripts locais somente após receber estado
  correspondente do Host. Identificação por caminho da hierarquia, não ponteiros.
- Fila UDP limitada e coalescida; chamadas Unity executadas somente na thread do jogo.
- Nenhum diálogo é enviado.

## Limites reais — não tratar como multiplayer completo

- Ainda não há screenshots validados de dois players no mapa. Instalação do hook
  e handshake não comprovam a execução da clonagem e da sincronização visual.
- NPCs controlados por outras classes ainda precisam de adaptadores verificados.
- Reações de NPCs a ações iniciadas no Client ainda precisam de eventos de
  interação validados e encaminhados ao Host. Só copiar Animator do player não
  replica dano, agarrões, veículos, seleção de alvos ou mudanças de IA.
- Aparências com malhas, prefabs, texturas ou hierarquias diferentes não são
  reconstruídas. Só são usados materiais já carregados; múltiplos slots de
  material, blend shapes e acessórios criados posteriormente ainda não são cobertos.
- Relógio, clima, objetos arbitrários, missões e estado completo do mundo não
  foram integrados. O canal de NPCs não representa sincronização completa do mundo.
- Ambos os APKs precisam ser recompilados com o protocolo v2.

## Validação em 24/09/2026

- `118f0b8`: compilação ARMv7 e handshake Android passaram. No workflow
  [36062734302](https://github.com/Hirouou/com.mojang/actions/runs/36062734302),
  o Host registrou `ARMHOOK READY` e `ARMHOOK worker detached`, sem SIGSEGV.
  O teste visual falhou antes do mapa: um toque no anúncio abriu o Chrome.
- `3c69c37`: remove toques cegos no anúncio e desliga internet externa no emulador,
  preservando UDP em loopback. Exige criação e aplicação do remoto em cada PID.
  O CI principal e o handshake offline passaram. No workflow
  [36063806861](https://github.com/Hirouou/com.mojang/actions/runs/36063806861),
  a captura mostra o Host no mapa; o hook falhou por ausência de qualquer lacuna
  no alcance do desvio. A reserva de página no ELF corrige essa dependência,
  ainda aguardando validação no Android.
- Usam-se dois usuários Android no mesmo emulador. Alternar o usuário pausa a
  renderização do outro jogo; esse teste não substitui dois celulares simultâneos.

## Teste local em 25/09/2026

- Duas AVDs Android 11 independentes executaram simultaneamente o mesmo conjunto
  de APKs ARMv7. Host e Client entraram no mapa por IP direto com UDP 38556
  encaminhado pelo emulador. Os logs confirmaram `NET DIRECT JOIN OK`,
  `ARMHOOK REMOTE CREATED` e `ARMHOOK REMOTE APPLY` nos dois processos.
- As capturas e a inspeção durante o jogo não mostraram o personagem remoto.
  `Transform.GetSiblingIndex/0` aparece como método ausente nos logs. Portanto,
  criação do clone e aplicação de posição ainda não validam o multiplayer visual.
- O usuário observou que o carro rosa dirigido numa instância continuou na
  garagem da outra. Um carro azul apareceu em momentos e posições diferentes nas
  duas instâncias; isso é compatível com simulações locais independentes, não
  com sincronização de veículos ou NPCs.
- Para testes nas AVDs, o script de início bloqueia HTTP/HTTPS de saída dentro
  dos emuladores, mantendo UDP LAN. Ambos entraram no mapa sem anúncio nessa
  configuração. Isso não altera o APK para remover anúncios em celulares reais.
- O menu SAKURA LAN foi ajustado para exibir Host, Client e IP opcional em 720p.
  A versão atualizada foi instalada e conferida nas duas AVDs.

## Critérios para confirmar gameplay

### Crash de entrada em 25/09/2026

- Client (09:30 UTC) e Host (09:34 UTC) sofreram SIGSEGV na thread do bridge,
  durante a inicialização do Unity, após conexão/criação de sala bem-sucedida.
  Os tombstones mostram a mesma passagem por `ndk_translation::DoThunk__setjmp`.
- O timer do bridge começava no carregamento da tela LAN. Nos dois crashes,
  expirou aproximadamente um segundo após abrir o jogo; uma espera longa no
  menu consumia a margem de inicialização. A causa nativa exata ainda não foi
  simbolizada.
- A mitigação inicia o worker uma única vez após `onActivityResumed` da Activity
  original do jogo e conta a margem de 12 segundos a partir desse momento.
  Isso elimina o tempo gasto no menu LAN da contagem, mas ainda depende de uma
  margem temporal; validação local da nova build pendente.
- O workflow agora gera os APKs sem executar o teste inválido com dois usuários
  na mesma AVD. Compilação aprovada não significa gameplay aprovado.

1. Ausência de crash/tombstone após `ARMHOOK READY` e `ARMHOOK worker detached`.
2. Host e Client entram no mapa, criam o remoto e aplicam estados continuamente.
3. Screenshots reais `host-two-players.png` e `client-two-players.png` mostram dois
   personagens no mesmo espaço. Nomes dos arquivos não substituem inspeção visual.
4. Andar, girar, lutar e trocar acessórios em ambos os lados; comparar Animator
   e aparência visíveis. Diálogos devem permanecer locais.
5. Conferir `VISUAL NPC REGISTER`, mesmas posições/animações de NPCs compatíveis,
   troca de cena, referências antigas e restauração dos scripts ao limpar a réplica.
6. Só então integrar as classes reais dos demais NPCs e eventos de interação do
   Client; não inventar offsets nem assumir que toda ação é um Animator.Play.
