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
