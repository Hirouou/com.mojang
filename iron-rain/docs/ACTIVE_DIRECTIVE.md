# IRON RAIN — ACTIVE USER DIRECTIVE

> Esta é a orientação ativa do diretor para TODAS as contas/agentes. Leia junto de `MULTI_AGENT_CONTROL.md`, `IRON_RAIN_VISION.md` e `LEAD_SPRINT_20260912.md` antes de escolher o próximo trabalho. Não recrie helpers já existentes; consuma/integrar o que a branch mais recente já trouxe.

## 1. Multiplayer é P0
- Máximo de 3 pessoas no mesmo Mamute.
- Até 2 tripulantes remotos precisam ficar visíveis em primeira pessoa dentro do Mamute.
- Um jogador pode dirigir enquanto outro mira/atira e o terceiro cuida de carga, rádio, motor etc.
- Dois jogadores NÃO podem usar o mesmo posto físico ao mesmo tempo. Posse do posto é exclusiva, autoritativa e deve ser liberada ao sair/desconectar.
- Menu real de entrada: criar partida, entrar por código curto, jogar sozinho e entrar no Mamute.
- Tripulação do mesmo Mamute pertence a uma única facção.
- BroadcastChannel é QA local; não chamar isso de multiplayer público. Transporte real cross-device continua P0.

## 2. Feedback compartilhado dentro do Mamute
- Impacto recebido do lado de fora deve ser percebido por todos dentro: crack metálico transmitido, baque grave, rattle, luz/poeira/shake conforme intensidade.
- Quem está dirigindo e quem está atirando devem compartilhar o mesmo estado físico do Mamute sem compartilhar câmera/input local.
- Recarga, manutenção, incêndio e danos devem parecer ações mecânicas/físicas, não variáveis abstratas.

## 3. Mobile: controles físicos têm prioridade sobre HUD
- No posto de pontaria em mobile, azimute e elevação são operados diretamente tocando/arrastando as manivelas 3D.
- A antiga UI duplicada de manivelas na parte inferior não deve cobrir o modelo 3D.
- Deixar no canto direito somente um bloco compacto de CARGA (+/−/valor/faixa) e, logo abaixo, DISPARAR.
- `AFASTAR-SE` continua no botão físico/overlay separado no alto da tela; não precisa ocupar o fire deck mobile.
- O centro da tela deve ficar livre para tocar nas peças físicas.
- Implementação atual: `mobile-station-ui.css`; integrar/preservar, não refazer uma segunda solução concorrente.

## 4. Guerra estratégica em grandes regiões hexagonais
- O mapa-múndi deve ser dividido em grandes regiões hexagonais, e cada hex contém vários setores menores capturáveis.
- Um hex só conta como completamente dominado quando todos os seus setores internos forem tomados/controlados.
- O começo da guerra fica aproximadamente dividido entre as duas facções por uma fronteira coerente.
- Não espalhar fronts contraditórios; forças regulares não aparecem magicamente atrás da linha adversária.
- Infiltração atrás das linhas só por comportamento explícito de partisan/recon/raid.
- O jogador poderá consultar o mapa-múndi para escolher qual frente apoiar.

## 5. As duas facções obedecem às mesmas regras
- IA aliada e IA inimiga usam o mesmo motor de decisão, moral, construção, logística, alcance, munição, veículos, fortificação e expansão.
- Nenhum lado recebe economia mágica, spawn gratuito ou regra especial só por ser aliado/inimigo.
- As diferenças emergem de território, estoque, pressão, rotas, perdas e decisões.

## 6. Logística e escassez são parte central da guerra
- Disparos consomem munição embarcada do Mamute.
- Base sem munição NÃO reabastece o Mamute. O jogador precisa ir a outro ponto abastecido ou esperar uma entrega real.
- Construção exige território controlado/seguro + tempo + materiais entregues fisicamente.
- Caminhões/convoys transportam material, munição e combustível por rotas. Rota cortada bloqueia entrega; comboio destruído perde a carga.
- Outposts, depósitos, morteiros, bunkers, garagens, blindados e fábricas surgem por desenvolvimento logístico, não por cronômetro mágico.
- Fábricas produzem material transferível; esse material ainda precisa viajar até os outros postos para permitir construção/expansão.
- Combat AI deve depender do suporte realmente disponível naquele território para munição, reforços, blindados e apoio.

## 7. Rádio, inteligência e missões
- O mapa-múndi NÃO é um radar onisciente do inimigo.
- Situação de fronts distantes aparece com detalhe quando existe rádio/recon/relatório válido.
- Informação inimiga pode ser parcial, antiga, incerta ou perdida.
- Missões comuns surgem principalmente quando o Mamute está próximo daquele teatro/setor.
- Ordens estratégicas remotas podem chegar por rádio.
- Mesmo com missão, alcance físico da arma limita se o Mamute consegue atender o alvo.

## 8. Persistência
- A guerra global não pertence ao navegador/telefone que hospeda a tripulação.
- A guerra deve continuar quando um jogador sai e, no horizonte persistente, continuar por autoridade de mundo própria.
- `persistent-war-clock.js` é somente uma primitiva de relógio/catch-up; não declarar persistência completa sem backend/storage autoritativo.

## Helpers/fundações que já existem — consumir, não duplicar
`crew-replication.js`, `crew-session.js`, `crew-runtime.js`, `crew-station-authority.js`, `mamute-command-authority.js`, `crew-lobby-ui.js`, `crew-visual-layer.js`, `cabin-hit-feedback.js`, `factions.js`, `strategic-hex-map.js`, `theatre-control.js`, `theatre-sectors.js`, `territory-development.js`, `territory-ai.js`, `strategic-logistics.js`, `mamute-logistics.js`, `world-map-intel.js`, `local-missions.js`, `persistent-war-clock.js`, `mobile-station-ui.css`.

## Regra de execução
Antes de qualquer edição, refetch HEAD/commits recentes. Se outro agente acabou de alterar o mesmo hotspot, consuma/teste/integrar o trabalho dele em vez de sobrescrever. Priorizar slices perceptíveis ou fundações diretamente necessárias ao P0/persistência; não gastar ciclos com micro-polish desconectado enquanto multiplayer real ainda não atingiu checkpoint entre dois dispositivos.
