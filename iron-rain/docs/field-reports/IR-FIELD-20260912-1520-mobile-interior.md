# IRON RAIN — FIELD REPORT / MOBILE INTERIOR BASELINE

Data: 2026-09-12
Origem: teste real do usuário em iPhone, landscape
Branch ativa: `iron-rain-v6-1-continuation`

## Estado observado
O interior do Mamute já comunica bem a identidade low-poly/PS1 industrial e tem espaços reconhecíveis: posto de pontaria, racks de munição, mesa de navegação, área de reparos, corredor e área mecânica. A leitura geral funciona, mas ainda há aparência de protótipo em várias peças e interações.

## Pontos visuais claros nas capturas
- grandes massas pretas/sem detalhe dominam alguns ângulos e escondem leitura de forma;
- objetos e munições parecem em alguns pontos flutuar ou ter apoio/encaixe pouco convincente;
- racks de munição têm boa leitura temática, mas a recarga ainda precisa virar uma sequência mecânica visível;
- mesa de navegação é visualmente forte e reconhecível;
- posto de pontaria existe fisicamente, mas o jogador ainda depende de UI abstrata em vez de manipular a máquina diretamente no mundo;
- estação de reparos é pouco expressiva e precisa de feedback de ação/progresso;
- corredor e compartimentos traseiros têm potencial de atmosfera, porém iluminação e silhuetas ainda podem separar melhor piso, parede, equipamento e passagem;
- prompts centrais e botão grande de interação ocupam área importante no mobile e competem com a cena;
- HUD superior está legível, mas somado a tutorial + joystick + botão de interação reduz bastante a janela visual útil.

## Direção de melhoria imediata
1. Priorizar interação física diegética: manivelas/alavancas clicáveis/arrastáveis em primeira pessoa, com valores mudando no painel existente em tempo real.
2. Substituir recarga visual atual por uma sequência mecânica: braço carregador gira → busca projétil → segura → alinha → introduz na culatra → confirma pronto. Primeira versão pode ser coreografada, sem física complexa.
3. Reparos: mostrar progresso visível no HUD/retículo e feedback do equipamento enquanto a ação ocorre.
4. Extintor: spray/espuma visível e feedback de contato com o incêndio, em vez de apenas clicar e esperar.
5. Corrigir props/munições com aparência de flutuação e reforçar pontos de apoio/encaixe.
6. Melhorar hierarquia de luz sem abandonar a estética: exterior/frio, interior militar escuro, pontos funcionais quentes/vermelhos; evitar aumentar realismo/polígonos por si só.
7. Reduzir poluição de UI mobile quando o jogador já entendeu os controles; prompts devem aparecer por contexto e desaparecer rapidamente.
8. Mapa de mesa: reduzir sensibilidade de pan/ajuste fino no toque e facilitar precisão em iPhone.

## Áudio mobile
BUG confirmado pelo usuário: iPhone permanece totalmente sem áudio mesmo com `ÁUDIO · ON`, aparelho fora do silencioso e sliders altos. ON/OFF não muda nada audivelmente. O pedido P1 `IR-CODEX-20260912-1518-LEAD-ios-mobile-audio.md` contém a reprodução/diagnóstico solicitado. Não classificar como erro de configuração do usuário.

## Critério de comparação para próximos checkpoints
Nos próximos screenshots, comparar especificamente:
- consigo identificar mais rápido cada posto e caminho?
- os objetos parecem realmente presos/encaixados na máquina?
- ações importantes têm movimento/feedback visível?
- diminuiu a área de UI que bloqueia o cenário?
- a cabine parece mais uma máquina funcional e menos um conjunto estático de props?

Preservar a identidade atual: low-poly, pixelado, industrial, gasto, claustrofóbico e otimizado para mobile/PC.