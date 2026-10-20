# Iron Rain — jogar no computador

Jogo de guerra em primeira pessoa com o M–47 Mamute. Esta versão roda inteiramente no computador, sem conta, túnel ou servidor externo. A cabine, a artilharia, as facções e a simulação persistente continuam usando as mesmas regras do jogo.

## Abrir

1. Instale **Node.js 24 ou mais recente**, disponível em https://nodejs.org/.
2. No Windows, abra `ABRIR-IRON-RAIN.cmd` nesta pasta. Em outros sistemas, execute `npm start` nesta pasta e abra **http://localhost:4173/**.
3. Escolha **ALIADOS** ou **EIXO**, uma base e crie seu Mamute. Você pode jogar sozinho.

Não há pacotes para instalar. Não abra `index.html` diretamente. Mantenha a janela do jogo local aberta enquanto joga. Use **Ctrl+C** nessa janela para salvar e encerrar.

## Controles

Na cabine, use **WASD** para caminhar, **mouse** para olhar, **E** para interagir com um posto e **Esc** para afastar-se. No celular emulado ou tela sensível ao toque, use o joystick e os controles da tela. O menu do jogo dá acesso ao mapa da guerra e ao código da tripulação.

## Voltar à partida

A guerra é salva automaticamente em `server/data/local-war.sqlite`. Ao abrir de novo no mesmo navegador e endereço, use **VOLTAR AO MEU MAMUTE**. Não limpe os dados do navegador se quiser manter sua identidade. `localhost` e `127.0.0.1` têm armazenamentos de navegador separados: prefira sempre o endereço acima.

O relógio da guerra avança enquanto o processo local está aberto, mesmo sem uma aba de jogo. Ao reabrir, a simulação recupera gradualmente o tempo decorrido desde o último salvamento; fechar o processo não funciona como pausa da campanha. O arquivo antigo `server/data/war.sqlite`, quando existir, permanece separado. Para um backup, encerre o jogo com Ctrl+C e copie o banco local. Bancos e identidades são privados e não devem ir para o GitHub.

## Se não abrir

- Confira se a versão do Node é 24 ou mais recente: `node --version`.
- Se a porta 4173 estiver ocupada, encerre a outra instância do Iron Rain ou escolha outra porta: `PORT=4174 npm start` no macOS/Linux; `$env:PORT=4174; npm start` no PowerShell. Abra o endereço mostrado no terminal.
- Se o menu mostrar reconexão, mantenha ou reabra a janela de `npm start`. O cliente tenta se reconectar e preserva o Mamute existente.

## Desenvolvimento

`npm test` executa os testes automatizados. `npm run test:local-browser` verifica o fluxo local real em Chromium, incluindo cabine, mapa e retomada após reiniciar o processo. Esse teste precisa de Playwright instalado; `IRON_RAIN_PLAYWRIGHT` pode apontar para o pacote e `IRON_RAIN_CHROMIUM` para o executável do navegador.

`WAR_DB` permite escolher outro banco; não aponte duas instâncias para o mesmo arquivo. `npm run server` continua disponível para desenvolver a API separadamente. A configuração de hospedagem futura está em `server/README.md`; ela não é necessária para jogar localmente.
