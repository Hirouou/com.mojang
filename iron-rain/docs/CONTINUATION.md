# IRON RAIN — continuação V6.1

## Base e snapshot antes da implementação

Pedido: continuar a V6 e acrescentar um mapa de mesa para cálculo manual.
Os documentos do handoff são referências de design; a instrução direta do usuário define o escopo.

- Repositório original: Hirouou/com.mojang, branch iron-rain-frontline.
- Base consultada em 12/09/2026: `11ae76eba1f3c538f9c667345759e8fb4656d35f`.
- O GitHub já contém V6. As seis partes concatenadas equivalem ao game-v6.js do handoff (uma diferença de espaço num comentário).
- Backup integral da pasta publicada, feito antes de editar: `C:/Users/Alan/Projects/iron-rain-continuation/snapshot-before-v6-1-20260912.zip`.
- ZIP original e pasta extraída permanecem preservados fora do repositório.

## Inventário

Entrypoint remoto: index.html → style-v6.css + game-v6-loader.js → v6-part1..6.txt via fetch/new Function.
O motor atual tem aproximadamente 33 KB e 350 linhas, com renderização Canvas 2D, seis frentes, terreno procedural, Mamute, infantaria, rádio, inteligência, balística, câmera, caderneta e controles no mesmo fechamento.

Preservar: coordenadas em metros, teatro 80 × 60 km, renderer procedural/local, posições das seis frentes, veículo e modos marcha/artilharia, munição, rádio, missões, reconhecimento e manivelas. A caderneta evolui para um instrumento de mesa.

Duplicações e falhas identificadas:

- V2–V5.1 e partes antigas continuam na pasta, mas não são ativos. Não concatenar diferentes gerações.
- Fonte V6 fragmentada e loader dinâmico duplicam o motor íntegro fornecido pelo handoff. O novo entrypoint carrega apenas game-v6.js como módulo.
- UI calcula solução fechada; projétil integra Euler a 18× com altura inicial diferente e impacto forçado à borda.
- Faixas das cargas antigas deixam lacunas e usam limites 20–75°, enquanto controles permitem 15–80°.
- Estado da câmera e classe que oculta painel são mantidos por caminhos separados; reconhecimento pode interromper disparo.
- Render de infantaria detalhado condicionado à câmera, mas todas as unidades são criadas desde o início; simulação distante não possui logística ou fases táticas.
- Fumaça não bloqueia tiro; fragmentação quase só altera dano de estruturas; fogo amigo não é aplicado.
- Manivelas e joystick não limpam captura perdida, blur ou mudança de modo.
- Caderneta ainda não é mapa e usa rolagem em telas pequenas.

## Refatoração incremental

1. modules/ballistics.js: solução compartilhada e amostragem analítica, cargas com cobertura contínua.
2. modules/pointer-controls.js: captura/cancelamento e redução mecânica.
3. modules/war-simulation.js: frentes agregadas e detalhe tático limitado.
4. modules/table-map.js: retrato de informações recebidas, régua, quadrantes e cálculo didático, sem acesso a inimigos desconhecidos nem controle da arma.
5. game-v6.js: preserva renderer e orquestração; câmera possui término comum e proteção contra sobreposição.

Validação: testes numéricos e de estados, testes de navegador com dimensões landscape e Pointer Events, inspeção visual e checagem offline/PWA. Emulação não equivale a validação física de Safari no iPhone.
