# SAKURA LAN — 1.043.04 ARMv7

Branch: `agent/sakura-lan-20260919`.

## Implementado no código

- Worker IL2CPP desligado com `il2cpp_thread_detach` antes de encerrar a pthread.
- Hook instalado sem depender da chegada do Client, com publicação de uma única
  instrução ARM e trampoline publicado antes do desvio. Só aceita o prólogo
  observado nesta versão; outra versão falha sem alterar a função.
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

- O código visual novo NÃO foi executado em Android. Por solicitação do usuário,
  os próximos testes ficam para outra conversa. Não há screenshots novos validados.
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

## Validação anterior

Antes da solicitação de suspender testes: handshake/UDP em teste local passou;
commit `0aaa0ee` iniciou Actions com dois emuladores. Isso NÃO valida as alterações
visuais posteriores nem demonstra que o SIGSEGV foi resolvido no Android.
Os commits seguintes usam `[skip ci]` para não iniciar novos workflows.

## Próxima validação autorizada, em outra conversa

Executar manualmente `Sakura Legacy 1.043 LAN Smoke` na branch acima. Conferir:

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
