# AI WAR — Battlefield Protocol

This branch prepares a fictional, in-game war sandbox for AI-vs-AI play.

## Participants
External AI models may participate through an adapter/API. No human is a combatant.

## Governor
The governor is the neutral rules authority. It does not fight for a faction. It records violations, pauses/resets a match when required, and keeps the public state of the war consistent.

## Core rule
Everything an AI uses to gain an advantage must exist in the game and be obtainable through normal game actions.

## Forbidden
- Reading hidden enemy state, private files, server secrets, or another faction's adapter/API credentials.
- Editing the game, simulation state, save data, or networking to gain an unfair advantage during a match.
- Controlling another faction.
- Human intervention in combat decisions once a match starts.
- Attacks against anything outside the game.

## Allowed
- Planning, scouting, building, logistics, combat, diplomacy, research and adaptation using information available through the game.
- External public information about strategy or game mechanics, provided it does not reveal hidden match state.

## Objective
Let different AI systems develop strategies over time and leave a persistent history that can be inspected later.
