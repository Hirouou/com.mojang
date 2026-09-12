# IRON RAIN — NORTH STAR / VISÃO DE LONGO PRAZO

Este documento define a direção estratégica do projeto. Ele não substitui os workstreams; serve para impedir que o projeto vire uma coleção de pequenos ajustes sem convergir para um jogo maior.

## Fantasia central
Iron Rain deve evoluir para uma guerra persistente, longa e viva, em que jogadores dos dois lados participam de um conflito maior do que qualquer tripulação individual. O jogador não é o herói onisciente do mapa: ele é um membro de uma máquina de guerra, depende de informação, logística, aliados, observadores, rádio e reconhecimento.

O M-47 Mamute é o centro da experiência de tripulação, não o limite do jogo. O objetivo de longo prazo é que o jogador possa operar, manter, reabastecer, reparar, abandonar temporariamente e retornar ao Mamute dentro de um mundo coerente, mantendo a identidade atual do projeto.

## Princípios obrigatórios

### 1. Pensar grande, construir por fatias integradas
Não tratar o estado atual como teto técnico ou de design. Cada sistema deve ser implementado de forma modular e extensível para alimentar versões futuras maiores.

Ao mesmo tempo, não tentar construir tudo de uma vez. Criar vertical slices jogáveis que já façam sentido hoje e possam crescer sem descarte total amanhã.

### 2. Guerra persistente e de longa duração
A guerra deve, no futuro, durar muitas sessões — idealmente dias ou semanas — com território, bases, desgaste, reforços, logística e inteligência persistentes.

Objetivo futuro:
- jogadores em ambas as facções;
- muitos Mamutes e outras unidades no mesmo conflito;
- frentes que avançam e recuam mesmo quando uma tripulação específica não está presente;
- estado de campanha persistido entre sessões;
- vitória/derrota como resultado de uma campanha, não de uma partida de dez minutos.

### 3. Guerra de informação, não mapa onisciente
Informação é um recurso de gameplay.

O mapa estratégico deve mostrar apenas o que a facção consegue saber através de fontes como:
- estações e redes de rádio;
- soldados/unidades com rádio;
- observadores;
- reconhecimento aéreo;
- contato visual/materialização local;
- relatórios de unidades e bases.

Informação pode ficar desatualizada, incompleta ou perder contato. Se a facção não conhece a posição de um Mamute inimigo, ela não deve receber esse dado magicamente. O mesmo vale para o inimigo sobre o jogador.

### 4. O Mamute deve virar uma máquina física e social
Curto prazo: máximo de 3 jogadores por Mamute.

A tripulação deve conseguir se ver em primeira pessoa e, progressivamente, dividir tarefas reais de jogo:
- navegação/condução;
- observação e rádio;
- artilharia;
- carregamento e munição;
- manutenção e reparo;
- resposta a incêndio/danos;
- logística e reabastecimento.

Nenhuma função precisa ser rigidamente presa a uma classe. A identidade vem do espaço físico e dos postos do Mamute.

### 5. Mundo 3D local + simulação distante
Para escalar sem destruir performance, usar duas escalas complementares:

- **bolha local 3D:** interior do Mamute, exterior imediato, base próxima, soldados, veículos, objetos e interações físicas;
- **simulação distante:** frentes, forças, logística, reconhecimento, eventos e combate abstrato fora da bolha relevante ao jogador.

Quando a tripulação chega a uma base/front importante, o mundo deve materializar o detalhe necessário. Quando se afasta, sistemas voltam à simulação estratégica.

Esse princípio é central para permitir uma guerra enorme mantendo PC e mobile viáveis.

### 6. Logística deve existir fisicamente
Reabastecimento não deve ser apenas clicar em “+ munição”. A direção desejada é transformar logística em gameplay progressivamente físico.

Vertical slices futuros:
1. Mamute precisa estar em uma base/depot válido para reabastecer;
2. munição/peças passam a existir como estoque da base;
3. tripulante pode sair do Mamute em primeira pessoa;
4. pegar/transportar uma caixa ou carga representativa;
5. levar até uma escotilha/baia de munição do Mamute;
6. estoque interno do Mamute é atualizado fisicamente;
7. posteriormente entram carregamento, combustível/energia, peças de reparo, comboios e interrupção de rotas logísticas.

Não implementar economia de compra de munição agora. Primeiro construir a cadeia de reabastecimento e disponibilidade.

### 7. Bases devem virar lugares, não só ícones
Bases importantes devem evoluir para espaços 3D locais com funções concretas:
- depósito de munição;
- manutenção/reparo;
- rádio/inteligência;
- spawn/retorno de tripulação;
- abastecimento;
- garagem/baia do Mamute;
- pontos de defesa e ataque.

O mapa estratégico e o espaço 3D precisam representar o mesmo estado de guerra.

### 8. IA de guerra precisa agir como uma organização
IA aliada e inimiga deve evoluir além de “unidades que atiram”.

Direção de longo prazo:
- esquadras com moral, supressão, retirada e reagrupamento;
- comandantes/objetivos estratégicos;
- necessidade de suprimento;
- reforços limitados;
- defesa de rotas e bases;
- ataques e contra-ataques;
- reconhecimento e reação a informação disponível;
- comportamento diferente quando uma frente está isolada ou sem rádio/logística;
- decisões que produzam uma guerra dinâmica e legível ao jogador.

A IA nunca deve receber conhecimento global que a facção não possuiria.

### 9. Visual: identidade, não realismo
Não perseguir fotorealismo.

North star visual:
- low-poly/retro 3D deliberado;
- texturas pixeladas/PS1-like quando apropriado;
- interior militar-industrial gasto, escuro e claustrofóbico;
- silhuetas e leitura fortes;
- luz quente/vermelha interna contra exterior frio;
- objetos físicos: válvulas, manivelas, alavancas, medidores, caixas, tubos, suportes e munição;
- poucos hologramas/HUDs flutuantes;
- otimização PC + mobile como requisito de design.

A qualidade deve vir de composição, iluminação, som, animação, leitura e interação — não de densidade absurda de polígonos.

### 10. Áudio deve vender escala e espaço
Interior e exterior devem soar como ambientes diferentes.

Evolução desejada:
- motor e vibração internos;
- passos metálicos e mecanismos;
- rádio e alarmes localizados;
- disparos com pressão/cauda interna;
- vento, tiros distantes, artilharia, veículos e combate do lado de fora;
- abafamento/oclusão ao fechar escotilhas;
- transição sonora ao sair/entrar do Mamute;
- bases e fronts com paisagens sonoras próprias.

### 11. Melhorias do Mamute devem ser sistêmicas
Futuramente o Mamute pode evoluir ao longo de uma campanha, mas upgrades devem alterar decisões reais de gameplay, não apenas números invisíveis.

Possíveis famílias futuras:
- comunicação/reconhecimento;
- proteção e compartimentação;
- motor/mobilidade;
- armazenamento/logística;
- reparo/manutenção;
- instrumentos e ergonomia de tripulação;
- sistemas de observação;
- variantes fictícias de artilharia/ammo gameplay.

Não criar tabelas ou dados reais de armas. Todo balanceamento é fictício e orientado ao jogo.

## Arquitetura de crescimento desejada

### Horizonte A — AGORA
- multiplayer funcional de até 3 jogadores no mesmo Mamute;
- jogadores visíveis uns aos outros em primeira pessoa;
- sincronização básica de posição/rotação/estado essencial;
- interior navegável estável em PC e mobile;
- melhorias visuais/auditivas perceptíveis sem perder a estética atual;
- guerra/IA continua evoluindo em paralelo.

### Horizonte B — TRIPULAÇÃO FÍSICA
- papéis emergentes por postos;
- objetos/controles interativos sincronizados;
- entrar/sair do Mamute;
- exterior local coerente;
- dano/manutenção/munição visíveis fisicamente;
- primeira versão de reabastecimento em base.

### Horizonte C — LOGÍSTICA + INTEL
- bases e depósitos 3D;
- estoque e rotas de suprimento;
- caixas/cargas físicas;
- rádio/reconhecimento com informação parcial e envelhecimento de intel;
- mapa estratégico derivado de conhecimento da facção;
- observadores, aviões de reconhecimento e unidades com rádio alimentando o mapa.

### Horizonte D — GUERRA PERSISTENTE
- campanha persistente;
- facções jogáveis dos dois lados;
- múltiplos Mamutes/unidades;
- território e bases persistentes;
- reforços/logística de campanha;
- servidor autoritativo ou arquitetura equivalente;
- jogadores entrando e saindo sem resetar a guerra.

### Horizonte E — ECOSSISTEMA DE GUERRA
- upgrades de Mamute;
- especialização de bases;
- cadeias logísticas mais profundas;
- sabotagem/partisan/reconhecimento;
- grandes operações coordenadas;
- IA estratégica adaptativa baseada na informação disponível;
- vários tipos de missão emergente sem transformar o jogo em sequência linear de quests.

## Regra de evolução contínua
Em cada ciclo, perguntar:
1. isso deixa o jogo perceptivelmente melhor para o jogador agora, OU fortalece uma fundação necessária para os horizontes acima?
2. essa mudança mantém espaço para multiplayer persistente, facções e mundo 3D local?
3. ela preserva PC + mobile e a estética low-poly?
4. ela evita transformar informação parcial em conhecimento mágico?
5. ela evita criar um beco sem saída arquitetural?

Se a resposta for não, reavaliar a mudança.

## Prioridade estratégica atual
1. Multiplayer 3 jogadores por Mamute, com presença visual real entre tripulantes.
2. Primeira pessoa/interior: visual, navegação, interação e áudio perceptíveis.
3. Arquitetura para sair do Mamute e materializar exterior/base local sem quebrar a simulação atual.
4. Guerra viva: IA, moral, ofensivas, retirada, reforços e fronts.
5. Informação parcial: rádio/reconhecimento/fog-of-war coerentes.
6. Primeira fatia de logística física e reabastecimento.

O objetivo não é “terminar” Iron Rain no estado atual. É construir uma base que possa crescer continuamente até parecer um mundo de guerra persistente e surpreendentemente profundo.