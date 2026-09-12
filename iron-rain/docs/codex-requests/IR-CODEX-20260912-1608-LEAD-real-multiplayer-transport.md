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

## MISSÃO
Atualização direta do usuário (2026-09-12): auditar e estabilizar a implementação atual, incluindo PC+PC e PC+celular, postos exclusivos simultâneos, reconexão e feedback compartilhado de tiro/recarga/impacto. Não partir do BASE_HEAD antigo nem recriar transporte. Correções mínimas e evidência browser obrigatórias. Responsável atual: CODEX; hotspots previstos: crew-runtime/session/transport, bootstrap e integração em game-v6.js.

Implementar a menor fatia coerente que permita iniciar multiplayer REAL entre dispositivos para um único M-47 Mamute, aproveitando a fundação já existente de presença/replicação/sessão e sem reescrever a cabine.

O alvo do produto é: máximo 3 jogadores no mesmo Mamute (1 host + até 2 convidados), cada um vendo os outros jogadores em primeira pessoa dentro da cabine. Mobile Safari/iPhone e desktop precisam estar no caminho suportado. O projeto é publicado como site estático no GitHub Pages, então transporte/sinalização precisa respeitar essa restrição.

## POR QUE CODEX
A fundação local já está sendo implementada pelos agentes, mas a escolha e validação do transporte real entre dispositivos exige investigação integrada de navegador/rede, teste real da build e uma solução compatível com GitHub Pages/iOS sem contaminar renderer/câmera com lógica de rede.

## CONTEXTO JÁ IMPLEMENTADO — NÃO DUPLICAR
- `modules/cabin-controls.js`: pose compacta e collision-safe da tripulação.
- `modules/crew-presence.js`: valida/interpola até dois remotos e preserva última pose segura.
- `modules/crew-avatar-visual.js`: pool low-poly prealocado para até dois avatares remotos.
- `modules/crew-visual-layer.js`: ponte presença -> avatares.
- `modules/crew-replication.js`: sequenciamento, stale pruning e samples renderer-ready.
- `modules/crew-session.js`: NOVO núcleo transport-agnostic com host autoritativo, handshake, seats 0/1/2, heartbeat e cap rígido de 3 jogadores.
- `modules/crew-broadcast-transport.js`: NOVO transporte QA apenas para duas abas/instâncias no mesmo perfil; NÃO é solução final de internet.
- `tests/crew-session.test.js`: handshake/capacidade/pose/isolamento de sala.

## FAZER
- Reler HEAD e commits recentes antes de tocar código.
- Ler `IRON_RAIN_VISION.md`, `LEAD_SPRINT_20260912.md`, `MULTI_AGENT_CONTROL.md`, `AGENT_LOG.md`, `CODEX_COORDINATION.md`.
- Auditar `crew-session.js` e corrigir qualquer falha protocolar encontrada antes de plugar transporte.
- Escolher e implementar a menor solução REAL de transporte/sinalização que funcione entre dois dispositivos e possa crescer para 3 jogadores.
- Manter a cadeia arquitetural: transport adapter -> `crew-session`/`crew-replication` -> `crew-visual-layer` -> cabine.
- Não permitir que pacote remoto controle câmera/input local.
- Integrar host/join de forma mínima e legível; código de sala curto é aceitável.
- Tentar teste real com duas instâncias/navegadores; se o ambiente permitir, testar mobile viewport e Safari/WebKit-equivalent.
- Preservar o mesmo URL/PWA do usuário.
- Se uma dependência/serviço externo for inevitável, preferir algo sem segredo embutido no cliente e documentar claramente custo, limite, segurança e fallback. Não esconder chave privada no Pages.

## NÃO FAZER
- não editar `iron-rain-frontline`;
- não force-push;
- não reescrever `cabin-view.js`, `cabin-controls.js` ou Three.js inteiro;
- não criar quarto jogador;
- não misturar estado estratégico da guerra com transporte nesta missão;
- não usar o GitHub como transporte em tempo real de gameplay;
- não adicionar autoridade de rede diretamente no renderer;
- não declarar multiplayer pronto sem teste real de duas instâncias.

## CRITÉRIOS DE ACEITE
- host consegue abrir sala;
- um segundo cliente consegue entrar por identificador/código de sala sem intervenção manual de copiar SDP cru;
- caminho suporta terceiro jogador sem alterar protocolo;
- posições/yaw/pitch chegam através de `crew-session`/`crew-replication`;
- nenhum cliente aceita mais de 3 ocupantes no Mamute;
- peer que cai é removido após timeout;
- câmera/input local continuam independentes;
- mobile/desktop não quebram a build single-player quando multiplayer não está sendo usado;
- teste automatizado ou browser evidence do handshake e troca de poses;
- relatar explicitamente o que ainda impede um teste público com amigo, se houver.

## EVIDÊNCIA ESPERADA
- comandos/testes executados;
- evidência de duas instâncias trocando presença/pose;
- arquivos/commits alterados;
- riscos P0/P1/P2/P3;
- instrução curta de teste host/join;
- se bloqueado por infraestrutura externa, recomendação concreta da opção mínima seguinte.
