# Servidor da guerra — operação temporária no PC

O GitHub Pages serve o cliente. A autoridade é `server/http.mjs`, Node 24, rodando no PC do Alan, com SQLite. Cada Mamute tem até três pessoas; todos os Mamutes pertencem ao mesmo teatro. Não existe promoção de navegador a host.

## Estado desta instalação

- Entrada pública: https://hirouou.github.io/com.mojang/
- API local: http://127.0.0.1:8787
- API HTTPS temporária: valor de `server-config.js`.
- Banco: `iron-rain/server/data/war.sqlite`, incluindo arquivos WAL/SHM. Nunca publicar ou apagar para “consertar” um problema.
- Binário do túnel, logs e PIDs: `%LOCALAPPDATA%\IronRainServer`.
- O servidor e o túnel foram iniciados ocultos, fora da sessão do navegador. Fechar uma página ou o Codex não transfere autoridade para jogadores.
- Esta instalação não é um serviço de inicialização automática. Desligar/suspender o PC ou parar o túnel interrompe acesso público. Quick Tunnel é temporário e troca URL quando reiniciado; depois é necessário atualizar `server-config.js`, cache/build e publicar. Não prometer disponibilidade 24/7.

## Rodar em desenvolvimento

1. Usar Node 24: `npm run server` na pasta `iron-rain`. Host padrão é somente loopback.
2. Em outra sessão: `npm start`.
3. Abrir `http://localhost:4173/?test=1&server=http://127.0.0.1:8787`.
4. Criar um Mamute; outro navegador independente pode criar outro ou entrar pelo veículo/código, com a mesma facção. Identidade/token ficam no armazenamento local do navegador. Não limpar esses dados se quiser reconectar como a mesma pessoa.
5. `npm test` e `node tests/server-game-browser.mjs` verificam backend e integração real. Este último usa Chromium/Playwright instalado no ambiente (variável `IRON_RAIN_PLAYWRIGHT` aceita no teste).

## Reiniciar a hospedagem local com segurança

1. Conferir logs e `/health`; nunca abrir uma segunda autoridade no mesmo banco/porta.
2. Identificar o processo usando os PIDs e a linha de comando. Parar somente `node server/http.mjs` desta instalação; não encerrar todos os Node/Chrome do usuário.
3. Fazer backup consistente do SQLite com o servidor parado, incluindo WAL/SHM quando existirem. Preservar IDs, tokens e recibos de comando.
4. Iniciar `node server/http.mjs` com `Start-Process -WindowStyle Hidden`, diretório `iron-rain`, logs em `%LOCALAPPDATA%\IronRainServer`.
5. Se o túnel anterior permanece vivo, a URL continua. Caso contrário, iniciar o binário oficial `cloudflared.exe tunnel --url http://127.0.0.1:8787 --no-autoupdate`, também oculto e com logs. O túnel expõe apenas esta API, sem abrir portas do roteador.
6. Validar `/health` pela URL HTTPS. Se mudou, atualizar `server-config.js` e os marcadores de cache. Revalidar a identidade antes de republish; nunca “migrar” para um banco vazio.
7. Push normal na branch permitida; aguardar workflow Pages e testar o link público em dois contextos/aparelhos. Preservar funcionamento anterior se a nova versão falhar.

## Limites e invariantes

- `/identity` emite identidade opaca. `/poll`, `/command`, `/leave` exigem bearer token. O servidor não retorna hashes de tokens.
- Comandos têm ID e sequência; reenvio do mesmo ID não duplica disparo/munição/dano. Proximidade e dono do posto são validados no servidor.
- Navegador apresenta snapshots e publica intenção/pose; não executa guerra, dano, movimento do veículo, logística ou munição autoritativa.
- SQLite conserva estado e recibos; simulação continua com zero clientes. Ao reiniciar, postos e aceleradores antigos são liberados.
- Não colocar banco, logs, credenciais ou binários no Pages. Workflow exclui `server/` do artefato estático.
- Hospedagem atual é para o teste solicitado entre amigos. Operação pública maior precisa host estável, monitoramento, backups automáticos, proteção adicional contra abuso e avaliação de carga.
