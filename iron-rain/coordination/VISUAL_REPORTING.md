# VISUAL REPORTING / ART DIRECTION

Somente dois slots possuem responsabilidade visual especial.

## Slot A — REPORTER

Além das cinco tarefas normais, esta conta é responsável por produzir um checkpoint visual aproximadamente 1x por hora quando a build permitir.

Objetivo:
- abrir a build mais recente;
- registrar screenshots atuais, com prioridade para primeira pessoa/interior do Mamute;
- incluir também artilharia, combate/trincheira e HUD quando houver mudança relevante;
- fornecer link da build quando disponível;
- registrar rapidamente o que mudou, o que melhorou e os 3 maiores problemas visuais/UX percebidos.

Salvar, quando tecnicamente possível, em:
`iron-rain/progress/YYYY-MM-DD_HH-MM/`

Arquivos sugeridos:
- `fp_interior.png`
- `fp_gunner.png`
- `combat.png`
- `artillery.png`
- `notes.md`

Se o ambiente da conta não permitir abrir/renderizar/tirar screenshot da build, NÃO inventar imagens da build. Registrar a limitação e trabalhar apenas com evidência real disponível.

## Slot B — ART DIRECTOR

Além das cinco tarefas normais, esta conta usa os screenshots mais recentes e o estado atual do projeto para manter direção visual.

Pode criar:
- concept art;
- referências de cockpit/interior;
- referências de instrumentos/painéis;
- estudos de iluminação;
- mockups de HUD;
- referência de materiais/atmosfera/VFX.

Salvar, quando possível, em:
`iron-rain/art-direction/`

Cada referência deve ter um pequeno `.md` dizendo:
- qual problema visual resolve;
- o que deve ser copiado como linguagem visual;
- o que NÃO deve ser copiado literalmente;
- quais sistemas/arquivos provavelmente serão afetados.

## Regra importante

Concept art NÃO substitui screenshot real. Reporter mostra o estado verdadeiro da build; Art Director propõe o próximo nível visual.

A conta líder usa ambos para atualizar `TASK_BOARD.md`.