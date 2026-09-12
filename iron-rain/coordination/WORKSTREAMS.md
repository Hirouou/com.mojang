# STANDARD WORKSTREAMS

Toda conta de desenvolvimento cria exatamente estas cinco tarefas. Cada tarefa roda 1x por hora no minuto definido pelo slot da conta.

## 1) FP SYSTEMS

Foco exclusivo: primeira pessoa funcional dentro do M-47 Mamute.

Prioridades:
- colisões e clipping;
- character controller/câmera;
- impedir atravessar paredes, instrumentos e escotilhas;
- portas, degraus e espaços apertados;
- interação com painéis, assentos, alavancas e postos;
- transições interior/exterior;
- navegação interna;
- bugs de câmera;
- feedback físico/sensorial associado.

Antes de agir, leia `handoffs/FP_SYSTEMS.md`. Continue o próximo passo de maior valor e atualize o handoff no final.

## 2) FP VISUALS

Foco exclusivo: aparência, áudio e atmosfera da primeira pessoa/interior do Mamute.

Prioridades:
- iluminação e sombras;
- materiais, metal, desgaste, sujeira, cabos, rebites;
- painéis e instrumentos legíveis;
- animações de mecanismos;
- vibração/reação visual ao disparo;
- fumaça, poeira e luz interna;
- motor, rangidos, rádio, passos, mecanismos, recarga, tiro e eco/reverberação simulada;
- performance mobile.

Antes de agir, leia `handoffs/FP_VISUALS.md`. Continue o próximo passo de maior valor e atualize o handoff no final.

## 3) COMBAT AI

Foco exclusivo: combate de infantaria e comportamento tático.

Prioridades:
- soldados ocupando trincheiras e cobertura;
- abaixar/levantar;
- rifleiros com tiros individuais;
- MG com supressão;
- observadores/scouts;
- moral, coesão e retirada;
- reagrupamento e reforços;
- investidas coordenadas;
- defesa e contra-ataque;
- reduzir comportamento de 'correr até morrer'.

Antes de agir, leia `handoffs/COMBAT_AI.md`.

## 4) ARTILLERY

Foco exclusivo: artilharia fictícia/gameplay do Mamute.

Prioridades:
- manivelas de azimute/elevação;
- carga e alcance nominal;
- consistência entre UI e simulação;
- caderneta de tiro e coordenadas do jogo;
- câmera do projétil e retorno ao Mamute;
- tipos de munição e feedback de impacto;
- tiro curto e muito longo em escala do jogo;
- nunca deixar painel desaparecer permanentemente.

Mantenha tudo claramente ficcional/gamey; não transforme o projeto em instrução ou tabela de tiro real.

Antes de agir, leia `handoffs/ARTILLERY.md`.

## 5) WORLD WAR

Foco exclusivo: teatro de guerra gigante e simulação estratégica.

Prioridades:
- múltiplas frentes e bases;
- linhas de trincheira e logística;
- fog of war;
- observadores, rádio e aviões de reconhecimento;
- inteligência parcial/última posição conhecida;
- câmera cinematográfica de reconhecimento;
- simulação distante abstrata;
- materialização tática apenas quando relevante;
- manter a câmera local próxima do Mamute.

Antes de agir, leia `handoffs/WORLD_WAR.md`.

---

# Prompt-base comum para cada automação

Use a descrição do workstream acima e acrescente sempre:

'Você trabalha diretamente na branch compartilhada `iron-rain-frontline`. Antes de começar, confira os commits mais recentes e leia o handoff do seu workstream. Continue de onde o agente anterior parou. Faça uma melhoria concreta e segura por execução, preserve o que funciona, teste o que puder e faça commit pequeno/descritivo. Antes do commit, confira novamente se a branch mudou; se mudou, adapte sua alteração e nunca sobrescreva trabalho novo. Ao terminar, atualize o handoff com FEITO / ARQUIVOS / TESTE / PRÓXIMO / RISCO. Se outra conta acabou de alterar a mesma área, escolha outro próximo passo seguro.'
