# Sakura LAN Mod

Experimental 2-player LAN multiplayer layer for SAKURA School Simulator.

This branch contains only original mod/test code. It does not commit or redistribute the game's APKs/assets.

## Gate before user testing

The build is **not** considered ready until all of these are true:

- Multiplayer entry exists in the in-game menu.
- Host can create a LAN room.
- Client on the same Wi-Fi can discover/join it.
- Each instance spawns and displays the other player's avatar.
- Position/rotation/basic animation are synchronized.
- CI produces an installable Android artifact/patch.
- Evidence includes screenshots from both host and client showing both players in the same session.

## Current work

- UDP LAN discovery + host/client handshake.
- Player-state packets at a 20 Hz target.
- Game-specific access isolated behind `GameBridge`.
- CI analysis of the exact Android package to determine Mono vs IL2CPP and locate Unity metadata.

## Correções da integração 1.043.04

Consulte [STATUS.md](STATUS.md) para alterações e limites atuais do protocolo v2.
Ambos os APKs precisam ser recompilados. A nova integração visual ainda aguarda
validação em Android; não comprova sincronização de todo o mundo ou das interações.
Por solicitação do usuário, esta etapa faz apenas correções com `[skip ci]`;
os próximos testes devem ser autorizados em outra conversa.
