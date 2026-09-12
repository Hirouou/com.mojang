# Iron Rain — Visual Direction Checkpoint — 2026-09-12 17:36 BRT

## Estado observado

- A diretiva mobile continua correta no caminho ativo: azimute/elevação não devem voltar como UI duplicada; os controles físicos 3D são a superfície principal e o bloco abstrato restante deve ficar restrito a CARGA +/- e DISPARAR à direita.
- O centro e a metade inferior da tela devem permanecer livres para leitura e toque da máquina.
- O braço mecânico de recarga já possui fundação de movimento e dwell de lock; a próxima integração visual deve substituir a apresentação antiga de projétil livre, nunca sobrepor as duas.
- Cues semânticos de áudio por fase do loader já existem como fundação, mas ainda não constituem mudança visual perceptível.
- Feedback visual de reparo/extintor e impacto do casco por dentro continua prioritário depois da integração visual do loader, desde que não concorra com hotspots ativos.
- Estética alvo permanece PS1 industrial: contraste funcional, materiais com diferença perceptível entre metal pintado, aço exposto, borracha/cabos, fuligem/óleo e luz quente interna versus luz fria externa; não aumentar luzes ou geometria decorativa às cegas.

## Próximo ganho visual de maior impacto

1. Integrar o braço mecânico real ao renderer e remover a sensação de munição flutuante/mágica.
2. Em seguida, feedback físico visível de extintor/reparo.
3. Depois, feedback de impacto transmitido ao interior (shake/light/dust/metal) escalonado por intensidade.
4. Só então fazer tuning subjetivo de materiais/iluminação com base em screenshots reais.

## QA pendente

A missão `IR-CODEX-20260912-1436-LEAD-visual-baseline.md` continua `READY`. Até existirem screenshots reais da cabine, não aprovar ajustes subjetivos de exposição, contraste, intensidade de luz ou densidade decorativa.

## Restrições

- Não editar `iron-rain-frontline`.
- Preservar mouse/desktop.
- Não recriar um segundo mobile fire deck.
- Não confundir concept art com screenshot da build.
