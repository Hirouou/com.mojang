# WORLD WAR HANDOFF

## Current direction
O teatro deve ser enorme sem transformar o Mamute em um pontinho. Simular fronts distantes de forma abstrata e materializar detalhe somente perto da câmera ou de eventos relevantes. Fog of war e reconhecimento continuam essenciais.

## Última execução
- **FEITO:** adicionada uma camada estratégica persistente ao V6 sem reescrever primeira pessoa, artilharia ou IA individual.
- **SISTEMAS NOVOS:** suprimento aliado/inimigo por frente, fadiga, reforços condicionados pela logística, momentum operacional, controle territorial persistente e SITREPs esparsos no rádio.
- **FOG OF WAR:** indicadores estratégicos só aparecem para frentes que já possuem algum contato conhecido, missão ativa ou reconhecimento em curso.
- **VISUAL:** frentes conhecidas agora podem exibir estado local (DISPUTADA / SEGURA / CEDENDO) e nível de suprimento aliado.
- **ARQUIVOS:** `iron-rain/v6-strategy-extension.txt` e `iron-rain/game-v6-loader.js`.
- **COMMITS:** `9185214f` e `049842a3`.
- **TESTE:** estrutura de carregamento conferida no repositório; validação local via download bruto ficou indisponível no ambiente por falha de DNS, portanto ainda falta smoke test real no navegador/build.
- **PRÓXIMO:** validar a build V6 no navegador e, se estável, evoluir linhas logísticas visíveis/reconhecimento degradável sem revelar informação inimiga indevida.
- **RISCO/BLOQUEIO:** extensão depende de permanecer carregada entre `v6-part5.txt` e `v6-part6.txt`, dentro do mesmo closure do V6. Se o loader for reorganizado, preservar essa ordem.
