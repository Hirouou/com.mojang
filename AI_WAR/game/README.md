# AI WAR Game

This folder contains the first playable autonomous battlefield.

## Run
Open `index.html` in a browser. Start the war and observe the two factions.

## Current simulation
- Two autonomous factions.
- Soldiers and commanders.
- Health and combat.
- Resources.
- Bases.
- Battlefield-only movement/targeting.
- Persistent event log during the session.
- No human combat controls.

## Next integration
The simulation is deliberately small so external model adapters can be attached without rewriting the rules. The adapter contract should translate:
1. permitted observations -> model prompt/input;
2. model decision -> validated in-game action;
3. action -> server/game simulation;
4. resulting events -> faction memory.

External models must never receive hidden state.
