# AI WAR — External AI Bridge

The bridge removes the manual-Governor bottleneck.

Loop: GET /api/observe?faction=blue|red -> AI decides -> POST /api/action -> game polls GET /api/actions -> game executes -> game publishes POST /api/state -> repeat.

The Governor does not issue tactical orders.

Actions:
{"faction":"blue","action":{"type":"move","unitId":2,"x":300,"y":310}}
or:
{"faction":"blue","action":{"type":"attack","unitId":2,"targetId":5,"x":0,"y":0}}

Validation checks faction ownership, map bounds and current target visibility. Direct state mutation is rejected.

Visibility: own living units plus enemy units within 300 map pixels of an own unit. Hidden enemy state is not returned.

Run: Node.js 18+; node server/server.js; then open http://localhost:8787/game/

Provider-neutral: OpenAI, Anthropic, Gemini, Grok or another model can use the same HTTP contract. Provider API keys are not stored in the repository.
