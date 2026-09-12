# HANDOFF PROTOCOL

Cada workstream possui um arquivo em `coordination/handoffs/`.

No início de cada execução:
1. leia commits recentes da branch `iron-rain-frontline`;
2. leia `TASK_BOARD.md`;
3. leia o handoff do seu workstream;
4. escolha o próximo passo de maior valor que não conflite com trabalho recém-feito.

No fim de cada execução, atualize o handoff com este formato:

## Última execução
- **FEITO:** resumo objetivo da mudança.
- **ARQUIVOS:** arquivos principais alterados.
- **TESTE:** o que foi validado e o que não foi possível validar.
- **PRÓXIMO:** uma ação concreta para o próximo agente.
- **RISCO/BLOQUEIO:** conflito, regressão possível, dependência ou `nenhum`.
- **COMMIT:** SHA ou mensagem do commit quando disponível.

## Regras
- não apagar histórico útil sem resumir a decisão atual;
- manter o handoff curto e operacional;
- se descobrir regressão crítica, coloque-a no topo do handoff como `⚠ CRÍTICO`;
- se a branch mudar durante a execução, releia antes de fazer commit;
- nunca usar force-push;
- nunca marcar algo como testado se não foi testado.

O objetivo é permitir que outra conta, sem contexto da conversa anterior, continue em poucos minutos.