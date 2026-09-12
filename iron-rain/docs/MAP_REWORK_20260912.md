# IRON RAIN — MAP REWORK DIRECTIVE — 2026-09-12

> ORDEM DO OWNER. Todos os workstreams que tocarem mapa, território, IA, logística, rádio, missões ou materialização devem ler este documento antes de alterar esses sistemas.

## Referência visual compartilhada
A liderança criou uma referência visual no chat e traduziu o alvo para um mockup versionado em `docs/MAP_REFERENCE_20260912.svg` para que todas as contas consigam trabalhar sobre a mesma direção visual.

A intenção NÃO é copiar outro jogo. É usar uma linguagem de mapa militar legível:
- mapa com sensação de território real, não uma grade vazia;
- regiões hexagonais grandes claramente encaixadas, sem sobreposição;
- interior de cada grande região dividido em setores menores capturáveis;
- ALIADOS azuis à esquerda/oeste, EIXO verdes à direita/leste;
- corredor NEUTRO cinza entre os lados e frente DISPUTADA âmbar onde houver contato;
- fronteira contínua e legível;
- estradas/rotas logísticas sutis;
- terreno/contorno visual suficiente para o canvas parecer um mapa;
- painel lateral de setor selecionado com controle, estruturas, obras e recursos apenas quando a facção puder saber;
- posição do Mamute destacada com `VOCÊ ESTÁ AQUI` e nome da grande região + setor;
- mapa de mesa interno precisa mostrar a MESMA localização estratégica (região/setor), ligando carta local e mapa mundial.

## Bugs observados pelo owner na build publicada
1. quase todo o mapa nasceu EIXO por a linha inicial estar deslocada demais para oeste;
2. hexágonos pareciam sobrepostos porque o renderer escalava X/Y de forma diferente e usava o raio pela largura apenas;
3. excesso de pontos sem hierarquia visual fazia os setores parecerem ruído;
4. faltava área neutra real;
5. o jogador não conseguia saber em qual grande hex/setor o Mamute estava;
6. o mapa estratégico e o mapa de mesa pareciam dois sistemas sem ligação visual/espacial;
7. aparência geral era de debug grid, não de mapa de guerra.

## Baseline integrado pela liderança
O baseline ativo passa a usar:
- `theatre-control.js`: linha inicial aproximadamente central;
- `strategic-hex-map.js`: corredor coerente NEUTRO + DISPUTADO;
- `strategic-war-live-v3.js`: escala uniforme, mapa visual refeito, frente contínua, localização do Mamute, seleção de setor e bridge para a mesa de cartas;
- `strategic-war-live.js`: façade que aponta para v3;
- `sw.js`: cache da nova build no MESMO Pages/PWA.

## Regra de continuidade
Não recriar um quarto renderer/mapa paralelo. Melhorias seguintes devem consumir `strategic-war-live-v3.js` ou substituir explicitamente o baseline, preservando:
- frente coerente;
- neutralidade;
- fog/intel não onisciente;
- IA simétrica;
- logística física;
- posição do Mamute ligada ao mapa local;
- PC + mobile.

## Próxima fatia esperada dos workstreams
- WORLD WAR: tornar captura de setores capaz de curvar a fronteira e materializar fronts reais sem bolsões mágicos.
- COMBAT AI: escolher ataque/defesa/retirada usando setor, suprimento, defesa e intel válidos.
- ARTILLERY: manter o mapa de mesa local e mostrar região/setor estratégico atual sem transformar a mesa em GPS onisciente.
- FP SYSTEMS: manter coordenadas do Mamute atualizadas para o bridge estratégico.
- FP VISUALS: melhorar ícones/linhas/contraste sem criar HUD sci-fi excessivo.

## REPORTING GATE — regra do owner
Para execuções automáticas que já fazem alterações e publicação: NÃO mandar atualização intermediária ao owner enquanto o workflow Pages/PWA estiver `queued`, `pending` ou `in_progress`. Só reportar o pacote de mudanças quando a publicação do commit correspondente terminar, informando sucesso/falha e o que ficou realmente testável. Exceção: bloqueio crítico que exija ação manual imediata do owner.
