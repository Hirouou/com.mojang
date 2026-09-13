# Iron Rain — P0 pontaria manual de precisão — 2026-09-13

Diretiva do owner para ARTILLERY / FP SYSTEMS. Consumir junto de `ACTIVE_USER_DIRECTIVES_20260912.md`.

## Regra de operação

A mesa de navegação trabalha em metros e entrega ao jogador distância e azimute, por exemplo `27.828 m / 125,3°`. O posto de pontaria deve falar a mesma linguagem. Não exigir conversão mental para km e não criar tabela balística paralela.

No painel físico do posto de pontaria, manter visíveis:
- `AZIMUTE` em graus;
- `ELEVAÇÃO` em graus;
- `CARGA / TIPO`;
- `ALCANCE` estimado em **metros**, calculado em tempo real pela mesma `modules/ballistics.js` usada pelo projétil.

Ao girar a manivela de elevação ou mudar a carga, `ALCANCE` precisa atualizar imediatamente. A leitura é nominal em ar parado: serve para copiar a distância medida na mesa para a peça sem automatizar a pontaria.

## Manivelas físicas mobile

Azimute e elevação continuam exclusivamente nas manivelas físicas 3D no AIM touch. Não reintroduzir sliders/rodas 2D inferiores. `CARGA +/-` e `DISPARAR` continuam compactos à direita.

As manivelas precisam de redução mecânica significativamente maior no touch para permitir ajuste fino. O objetivo de aceite é o jogador conseguir buscar valores decimais de azimute, como `125,3°`, e fazer microajustes de alcance de poucos metros perto da solução sem saltos de centenas de metros. A sensação deve ser pesada e mecânica. Preservar mouse/desktop e não aplicar auto-aim/snap para o alvo.

A implementação deve ajustar a razão de entrada da manivela, não adicionar dispersão ou esconder arredondamento grosseiro. O renderer pode continuar animando várias voltas físicas para uma pequena alteração da peça.

## Regra canônica de erro

Em ar parado, com azimute, carga e elevação corretos, o impacto nominal deve coincidir com a solução de `ballistics.js`. Não adicionar RNG de dispersão, bloom, erro secreto de arma ou desvio artificial.

**Vento é o único fator externo de desvio do projétil.** A trajetória deve continuar usando o vento físico canônico já aplicado em `sampleTrajectory()`; qualquer futura compensação continua manual pelo jogador.

Não transformar o readout de alcance em previsão de ponto de impacto com vento, GPS inimigo ou correção automática. O jogador mede na mesa, regula a máquina e compensa vento manualmente.

## Aceite mínimo

1. Mesa mostra distância em metros e azimute.
2. AIM mostra `ALCANCE` em metros derivado de `ballistics(charge, elevation).range`.
3. Girar a manivela de elevação altera esse alcance continuamente em passos finos.
4. Girar azimute permite acertar décimos de grau sem brigar com sensibilidade excessiva.
5. Sem vento + solução correta = impacto nominal correto; vento ligado = único desvio externo.
6. Mobile continua com centro livre e controles físicos 3D; desktop não regride.
