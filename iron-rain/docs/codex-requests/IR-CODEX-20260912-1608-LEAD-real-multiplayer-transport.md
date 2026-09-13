# IR-CODEX-20260912-1608-LEAD-real-multiplayer-transport

STATUS: IN_PROGRESS
CLAIMED_HEAD: 7d314ed9778e6709e1dda4a9355270560edbfd43
CLAIMED_AT: 2026-09-12T17:36:19-03:00
REQUESTER: LEAD
RETURN_TO: LEAD + FP SYSTEMS
PRIORITY: P0
TYPE: FIX
BRANCH: iron-rain-v6-1-continuation
BASE_HEAD: 4fe094677fce499cefe930987e08eafaf4f777a6

## OWNER CORRECTION — 2026-09-12 21:32 BRT — OVERRIDES HOST LANGUAGE BELOW
Iron Rain is ONLINE-FIRST and SERVER-AUTHORITATIVE. There is no player-host that owns the war. Any older `host creates room`, `1 host + guests`, or `single-player fallback` wording in this request is legacy terminology and MUST NOT define the final architecture.

The persistent theatre is server/backend-owned and continues even if every player leaves a Mamute. ALIADOS and EIXO join the SAME theatre in different faction-bound Mamutes. A Mamute crew is capped at 3 and station ownership remains exclusive, but crew authority is subordinate to server/world authority.

Immediate target after same-Mamute transport is proven: two real devices in OPPOSING factions, each in its own Mamute in the same theatre. One fires at the other. The shared authority resolves the shot/impact/damage exactly once and both clients receive the same result. Neither client may authoritatively decide whether the other was hit.

The transport/session layer should therefore converge toward: client connects -> authenticate/identify -> join persistent theatre -> choose faction -> list/create/join eligible Mamute -> occupy station -> send commands -> receive authoritative world/Mamute events/snapshots. Creating a Mamute must NOT create a new war instance.

## MISSÃO
Atualização direta do usuário (2026-09-12): auditar e estabilizar a implementação atual, incluindo PC+PC e PC+celular, postos exclusivos simultâneos, reconexão e feedback compartilhado de tiro/recarga/impacto. Não partir do BASE_HEAD antigo nem recriar transporte. Correções mínimas e evidência browser obrigatórias. Responsável atual: CODEX; hotspots previstos: crew-runtime/session/transport, bootstrap e integração em game-v6.js.

Implementar a menor fatia coerente que permita multiplayer REAL entre dispositivos para tripulações de M-47 Mamute, aproveitando a fundação já existente de presença/replicação/sessão e sem reescrever a cabine, MAS sem consolidar autoridade final em um navegador.

O primeiro checkpoint continua sendo até 3 jogadores no mesmo Mamute vendo uns aos outros e ocupando postos exclusivos. O checkpoint seguinte, agora obrigatório para a direção do produto, é múltiplos Mamutes de facções opostas na mesma guerra persistente com combate resolvido por authority compartilhada.

Mobile Safari/iPhone e desktop precisam estar no caminho suportado. O cliente continua publicado no GitHub Pages; por isso backend/authority e signaling/transport devem funcionar com cliente estático sem segredo privado embutido.

## POR QUE CODEX
A fundação local já está sendo implementada pelos agentes, mas a escolha e validação do transporte real entre dispositivos e da fronteira com uma authority persistente exige investigação integrada de navegador/rede e uma solução compatível com GitHub Pages/iOS sem contaminar renderer/câmera com lógica de rede.

## CONTEXTO JÁ IMPLEMENTADO — NÃO DUPLICAR
- `modules/cabin-controls.js`: pose compacta e collision-safe da tripulação.
- `modules/crew-presence.js`: valida/interpola até dois remotos e preserva última pose segura.
- `modules/crew-avatar-visual.js`: pool low-poly prealocado para até dois avatares remotos.
- `modules/crew-visual-layer.js`: ponte presença -> avatares.
- `modules/crew-replication.js`: sequenciamento, stale pruning e samples renderer-ready.
- `modules/crew-session.js`: núcleo transport-agnostic atual com handshake, seats 0/1/2, heartbeat e cap rígido de 3 jogadores; qualquer semântica de host nele deve ser considerada transitória/crew-local, não world authority.
- `modules/crew-broadcast-transport.js`: transporte QA apenas para duas abas/instâncias no mesmo perfil; NÃO é solução final de internet.
- `modules/crew-mqtt-transport.js`: adapter público atual sob auditoria; não assumir que broker público resolve authority de gameplay.
- `tests/crew-session.test.js`: handshake/capacidade/pose/isolamento de sala.

## FAZER
- Reler HEAD e commits recentes antes de tocar código.
- Ler `IRON_RAIN_VISION.md`, `LEAD_SPRINT_20260912.md`, `MULTI_AGENT_CONTROL.md`, `ACTIVE_USER_DIRECTIVES_20260912.md`, `AGENT_LOG.md`, `CODEX_COORDINATION.md`.
- Auditar `crew-session.js` e separar claramente crew-local coordination de server/world authority.
- Escolher/validar a menor solução REAL de transporte/sinalização que funcione entre dois dispositivos e cresça para 3 jogadores por Mamute.
- Manter a cadeia arquitetural: transport adapter -> crew/session runtime -> replication/presentation. Não colocar networking no renderer.
- Não permitir pacote remoto controlar câmera/input local.
- Integrar join/create Mamute de forma player-facing; código curto de Mamute pode existir temporariamente, mas não deve representar uma guerra separada.
- Tentar teste real PC→PC e, se possível, PC→mobile/Safari-equivalent.
- Preparar/identificar a seam para servidor autoritativo receber comandos `drive/aim/load/fire/service` e publicar snapshots/eventos de Mamute/theatre.
- Preparar um teste cross-faction mínimo: dois clientes em facções opostas, Mamutes diferentes, mesma theatre id, um disparo/impacto com resultado único autoritativo. Se backend ainda impedir esse teste, declarar exatamente qual infraestrutura falta.
- Preservar o mesmo URL/PWA do usuário.
- Se dependência/serviço externo for inevitável, preferir solução sem segredo no cliente e documentar custo, limite, segurança e fallback.

## NÃO FAZER
- não editar `iron-rain-frontline`;
- não force-push;
- não reescrever `cabin-view.js`, `cabin-controls.js` ou Three.js inteiro;
- não criar quarto jogador dentro do mesmo Mamute;
- não criar guerra nova por sala/Mamute/facção;
- não tratar navegador que criou Mamute como world server;
- não usar GitHub como transporte em tempo real de gameplay;
- não adicionar autoridade de rede diretamente no renderer;
- não declarar multiplayer pronto sem teste real entre dispositivos;
- não declarar persistência pronta sem backend/storage autoritativo.

## CRITÉRIOS DE ACEITE — FASE 1 CREW
- primeiro cliente consegue criar/registrar um Mamute na theatre existente sem virar autoridade global;
- segundo cliente da mesma facção entra nesse Mamute sem copiar SDP cru;
- terceiro jogador funciona; quarto no mesmo Mamute é recusado;
- facção oposta não entra no mesmo Mamute;
- pose/presença atravessa `crew-session`/`crew-replication`;
- estações diferentes funcionam simultaneamente; mesma estação é exclusiva;
- peer que cai libera presença/posto após timeout e pode reconectar sem duplicata;
- câmera/input local continuam independentes;
- feedback compartilhado não duplica resultado por cliente.

## CRITÉRIOS DE ACEITE — FASE 2 SERVER WAR / COMBAT
- clientes ALIADOS e EIXO compartilham a mesma theatre id e podem existir simultaneamente em Mamutes diferentes;
- Mamute A e Mamute B possuem ids/estado persistente independentes da conexão de qualquer jogador;
- comando de fire é aceito/rejeitado por authority compartilhada e consome munição exatamente uma vez;
- impacto/dano contra Mamute inimigo é decidido uma vez pela authority e replicado consistentemente;
- sair de ambos os clientes não apaga/reseta o theatre snapshot;
- reconectar restaura snapshot consistente de guerra/Mamutes;
- se ainda não for possível executar esta fase, o resultado Codex deve apontar o backend/storage/authority mínimo necessário, sem sugerir voltar para player-host.

## EVIDÊNCIA ESPERADA
- comandos/testes executados;
- evidência de duas instâncias/dispositivos trocando presença/pose;
- quando possível, evidência cross-faction Mamute-vs-Mamute na mesma theatre;
- arquivos/commits alterados;
- riscos P0/P1/P2/P3;
- instrução curta de teste entre dispositivos;
- declaração explícita: `player-host authority = NÃO` e qual componente é/será a authority persistente;
- se bloqueado por infraestrutura externa, recomendação concreta da opção mínima seguinte.
