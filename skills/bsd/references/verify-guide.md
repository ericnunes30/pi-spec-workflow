# Verify Guide — BugFix Mode

> Guia para verificação de correções de bugs no BSD BugFix pipeline.

## 1. Filosofia

- **Correção cirúrgica** — Apenas os arquivos e linhas necessários
- **Testes como segurança** — Sempre rode os testes antes de commitar
- **Usuário valida** — O usuário testa e confirma que o bug foi resolvido
- **Reverta se falhar** — Se testes falharem, reverta imediatamente

## 2. Checklist de Verificação

### Antes de Corrigir
- [ ] Entendi a causa raiz? (não apenas o sintoma)
- [ ] Sei exatamente quais arquivos mudar?
- [ ] A correção é mínima? (apenas o necessário)

### Depois de Corrigir
- [ ] A correção foi aplicada apenas nos arquivos afetados?
- [ ] Os testes existentes passaram?
- [ ] Nenhum código não relacionado foi modificado?
- [ ] A branch foi criada a partir de main?
- [ ] O commit contém o ID do bug?

### Verificação pelo Usuário
- [ ] Bug não reproduz mais seguindo os steps originais?
- [ ] Funcionalidades relacionadas continuam funcionando?
- [ ] Usuário confirmou que o bug está resolvido?

## 3. Fluxo de Verificação

```
Correção aplicada → Testes passam → Usuário testa → Confirma? → Close bug
                               ↓                    ↓
                          Reverter ← Não         Re-diagnosticar
```

## 4. Critérios de Fechamento

Um bug é marcado como **closed** quando:
1. A correção foi aplicada e commitada
2. Os testes existentes passaram
3. O usuário confirmou verbalmente que o bug não reproduz mais

Um bug é marcado como **verified** quando:
1. A correção foi aplicada
2. Os testes passaram
3. (Aguardando confirmação do usuário)

## 5. Revision Loop

- **Attempt 1:** Diagnóstico inicial + correção
- **Attempt 2:** Se falhou, re-diagnóstico com novas hipóteses + nova correção
- **Attempt 3:** Se falhou novamente, re-diagnóstico com abordagem diferente + nova correção
- **Escalar:** Se 3 tentativas falharem, escalar para o usuário com resumo
