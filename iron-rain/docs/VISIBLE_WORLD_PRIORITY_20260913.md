# IRON RAIN — VISIBLE WORLD PRIORITY — 2026-09-13

> ESCALATION DO OWNER — 10:36 BRT. Esta diretiva passa a ser obrigatória para WORLD WAR, FP SYSTEMS/MATERIALIZATION, FP VISUALS e COMBAT AI enquanto o mundo local ainda parecer vazio ao dirigir o Mamute.

## Problema observado na build real

Screenshot real do owner em 2026-09-13 mostra a vista local com o M-47 sobre terreno quase vazio: sem malha de estradas legível, sem capital materializada com construções/ruas/defesas e sem tráfego físico contínuo evidente. O owner também relata que caminhões ainda parecem teleportar.

Isso significa que fundações estratégicas existentes NÃO contam como entrega concluída enquanto não aparecerem no mundo local/materializado.

## Regra de prioridade

Até existir uma fatia visível e testável no mesmo Pages/PWA estável, nenhum workstream de WORLD WAR deve priorizar novo helper, texto, threshold, polish de intel ou teste isolado que não proteja diretamente esta integração.

A próxima entrega de produto precisa ligar os sistemas canônicos já existentes ao mundo local.

## Entrega mínima obrigatória

1. **Estradas físicas/visuais no mundo local**
   - usar a mesma malha canônica de rotas já gerada pela logística estratégica;
   - estrada visível próxima ao Mamute, com continuidade até a capital/nó relevante;
   - ida/retorno coerentes com laneDirection/laneOffset existentes;
   - não inventar uma segunda rota só para renderização.

2. **Capital/setor materializado**
   - o ponto do setor precisa virar núcleo físico local quando próximo do jogador;
   - ruas/estradas, estruturas coerentes com `territory-development`, depósito/garagem/fábrica quando realmente existentes, defesa/guarnição conforme estado;
   - estado destruído/reconstruindo precisa produzir leitura visual distinta;
   - mundo local não pode permanecer um campo vazio perto da capital.

3. **Caminhão sem teleporte**
   - consumir diretamente `strategic-logistics.snapshot().convoys[].position` e o progresso real de rota;
   - o mesmo ID de comboio precisa permanecer visível avançando entre frames/ticks;
   - não recriar posição por spawn aleatório nem saltar de nó para nó;
   - quando o comboio entra no raio local, materializar no ponto exato da rota; quando sai, voltar à representação estratégica sem resetar posição;
   - entrega só ocorre no evento de chegada canônico já existente.

4. **Integração visual com a build atual**
   - reutilizar `battlefield-view.js`/pipeline local já existente;
   - reutilizar `strategic-war-live-v3.js` como único mapa estratégico;
   - não criar renderer paralelo, segunda logística ou segunda economia;
   - preservar mobile/desktop, fog of war e informação inimiga válida.

## Aceite visual do owner

A fatia só pode ser chamada de pronta quando uma build real mostrar pelo menos:
- M-47 próximo de uma estrada visível;
- uma capital/setor com construções e atividade coerente ao redor;
- um caminhão identificável atravessando a estrada por vários segundos sem salto de posição;
- o mapa estratégico e o mundo local apontando para a mesma rota/capital/estado;
- screenshot ou vídeo real da build, não mockup.

## Roteamento por workstream

### WORLD WAR
Ligar as rotas/convoys/capitais já existentes à camada local. É o owner principal desta fatia.

### FP SYSTEMS / MATERIALIZATION
Garantir que a capital e a estrada próximas materializem/desmaterializem por distância sem criar estado paralelo e sem bloquear entrada no Mamute.

### FP VISUALS
Dar leitura PS1 industrial/militar às estruturas, estrada, fumaça, danos e veículos usando o renderer local existente. Não priorizar iluminação subjetiva da cabine antes desta fatia se não houver screenshot real correspondente.

### COMBAT AI
Depois que a estrada/capital local estiver conectada, consumir a mesma rota para defesa, escolta/interceptação e presença coerente. Não criar tráfego decorativo independente.

## Ritmo

Se a próxima execução de WORLD WAR não resultar em integração visível ou em um bloqueio técnico concreto e documentado, ela deve ser tratada como falha de prioridade. Teste/helper isolado não satisfaz esta diretiva.

Preservar `iron-rain-frontline` como histórica. Trabalhar somente em `iron-rain-v6-1-continuation`.
