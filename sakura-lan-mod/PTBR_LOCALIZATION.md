# SAKURA LAN — Plano de localização PT-BR

## Objetivo

Adicionar **Português (Brasil)** ao fluxo de idioma já existente do SAKURA School
Simulator 1.043.04. O PT-BR deve aparecer no mesmo seletor usado pelo jogo,
preservando as opções originais e o comportamento de salvar/restaurar idioma.

## O que foi confirmado no binário 1.043.04

A build possui um sistema de localização próprio, portanto o mod não deve criar
um menu paralelo:

- `Localize`
  - `ChangeLanguage(string)`
  - `SaveCurrentLanguage()`
  - `LoadCurrentLanguage()`
  - `SetCurrentLanguageFromString(string)`
  - `RefreshLocalizeUIs()`
  - `RefreshLocalizeDics()`
  - `RefreshLocalizeStrs()`
- `LocalizeUI`
  - `Refresh()`
  - `GetLanguage()`
- `ButtonSetting.ButtonChangeLanguage()`
- `LanguageType` contém English, Japanese, ChineseS e ChineseT.
- Os grupos de dados incluem Word, Chat, Name, Damage, Die, Shop, Aisatu,
  EventNotice, Cloth, Message, ButtonName e ButtonLabel.

Isso significa que PT-BR deve ser implementado como extensão do pipeline nativo,
não como substituição global de `UnityEngine.UI.Text`.

## Estratégia

1. Interceptar o botão nativo de troca de idioma e incluir `pt-BR` no ciclo.
2. Persistir `pt-BR` junto ao idioma atual, sem alterar saves de gameplay.
3. Quando PT-BR estiver ativo, deixar o pipeline nativo produzir a UI base e
   aplicar o catálogo brasileiro aos mesmos objetos `LocalizeUI`/chaves.
4. Reaplicar após `RefreshLocalizeUIs/Dics/Strs` e após troca de cena.
5. Se uma chave ainda não tiver tradução, usar inglês como fallback; nunca
   mostrar chave vazia ou quebrar a UI.
6. Manter nomes próprios quando a tradução os deixaria artificial.

## Diretriz de texto

O público-alvo inclui crianças e adolescentes. A tradução deve ser clara,
natural e curta, sem acrescentar sexualização, palavrões ou conteúdo adulto.
Quando o original contiver linguagem forte, preferir uma formulação brasileira
mais leve que preserve a função da fala sem torná-la mais explícita.

Exemplos de tom:
- New Game -> Novo jogo
- Load Game -> Continuar
- Settings -> Configurações
- Save -> Salvar
- Back -> Voltar
- Talk -> Conversar
- Attack -> Atacar
- Get in -> Entrar
- Get out -> Sair
- School -> Escola
- Home -> Casa
- Police Station -> Delegacia
- Hospital -> Hospital

## Regra de compatibilidade

Não adicionar um quinto valor diretamente ao enum IL2CPP `LanguageType`:
assets serializados e switches compilados podem assumir os quatro valores
originais. O estado PT-BR deve ser uma extensão do mod ligada ao seletor nativo,
com inglês como idioma-base/fallback. Assim, English/Japanese/Chinese continuam
intactos e o PT-BR pode crescer sem corromper assets serializados.
