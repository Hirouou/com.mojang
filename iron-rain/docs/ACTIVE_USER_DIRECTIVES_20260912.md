# IRON RAIN — ACTIVE USER DIRECTIVES — 2026-09-12

This file is a cross-agent directive from the project owner. All active agents, automations and Codex work should read it before choosing the next task. It does not replace `IRON_RAIN_VISION.md`, `MULTI_AGENT_CONTROL.md` or the LEAD sprint; it sharpens current priorities.

## P0 — multiplayer / entry flow

- Multiplayer is the current top priority until a real two-device checkpoint exists.
- Maximum 3 players per Mamute: one local player plus at most two remote crew.
- The first player-facing entry flow must ask which side to join before the Mamute/session flow:
  - `ALIADOS` = blue side.
  - `EIXO` = green side.
- Both sides participate in the SAME persistent war. Do not fork separate local wars per faction.
- A Mamute belongs to one faction; opposite-faction players cannot join the same vehicle/session.
- Create/join/play-alone/enter-Mamute must remain understandable to a normal player; never expose technical signaling.
- Two players must not control the same physical station at the same time. Station ownership is exclusive and must release on leave/disconnect.
- Driver/gunner/loader can operate different stations simultaneously and share the same Mamute state.
- The war must continue independently of one crew member leaving. Long-term authority must not live only inside the crew host.

## Mobile first-person interaction — current owner feedback

The physical 3D controls are now the preferred interaction surface on mobile. The old duplicate bottom UI must not cover the actual machinery.

For the AIM station on touch/mobile:
- hide the duplicated UI handwheels for azimuth/elevation;
- the player should touch/drag the actual 3D handwheel/crank in the Mamute;
- preserve a compact `CARGA` +/- control at the right edge because charge is still an abstract setting for now;
- put `DISPARAR` directly under the compact charge control;
- keep the centre/lower scene clear so the physical azimuth/elevation controls stay visible and touchable;
- do not regress desktop/mouse controls;
- keep `AFASTAR-SE` available without rebuilding a large bottom panel.

General direction: less abstract UI, more physical machine operation.

## Shared feedback / immersion

- External hits on the Mamute must produce interior feedback for every crew member: transmitted hull impact, metal rattle/creak, shake/light/dust according to hit strength.
- Reload must stop looking magical. Use the mechanical robotic loader arm: rotate -> acquire selected shell -> clamp -> rotate to breech -> insert -> lock/ready.
- Extinguisher must visibly spray/foam while active.
- Repair must show visible progress and mechanical/audio response.
- Continue removing floating/misaligned props and adding meaningful mechanical animation.
- iPhone/Safari audio silence remains a real bug until verified fixed on-device.

## Persistent war / territory / logistics

- Strategic ownership must form a coherent continuous front. Do not place allied fronts behind an enemy front on the same axis.
- Territory held safely for time can develop, but construction requires physical logistics.
- Secure territory -> supply route -> truck delivery -> stored materials -> construction.
- Cut/unsafe route means no delivery and no construction progress.
- Development can progress through field defenses/outpost -> depot/mortar/bunker -> garage/heavier support -> factory after long secure control.
- Factories produce materials; materials still need transport to other positions. No magical remote upgrades.
- AI should use actual local supply, defenses, reinforcement availability and preparation state.

## Product / deployment rule

- Keep using the SAME stable Pages/PWA URL already installed on the owner's iPhone home screen. Ordinary updates must replace the build behind that address, not create a new user URL.
- Clearly separate foundation from visible/player-testable integration in reports.
