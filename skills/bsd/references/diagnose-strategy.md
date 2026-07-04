# Diagnose Strategy — BugFix Mode

> Estratégia para diagnóstico de causa raiz de bugs no BSD BugFix pipeline.

## 1. Filosofia

- **Usuário = Reporter, Agente = Investigador** — Nunca pergunte ao usuário "o que causa isso?"
- **Trate o código como estrangeiro** — Leia com atenção, não assuma que conhece
- **3+ hipóteses independentes** — Antes de investigar qualquer hipótese, liste pelo menos 3
- **Evidências sobre intuição** — Conclusões baseadas em leitura real de código, não suposições

## 2. Processo de Diagnóstico

### Passo 1: Entender o Bug
- Leia o bug report (BUG-N.md) com atenção
- Identifique: expected behavior, actual behavior, steps to reproduce, environment
- Se faltar contexto, leia o spec.md e design.md da feature

### Passo 2: Mapear Arquivos Relevantes
- Identifique os arquivos da feature afetada
- Leia os arquivos candidatos para entender o fluxo
- Siga a trilha: UI → Handler → Service → Data Layer

### Passo 3: Gerar Hipóteses
Consulte a checklist de padrões comuns (~80% dos bugs):

| Categoria | O Que Verificar |
|-----------|-----------------|
| Null/undefined | Acesso a propriedade de objeto null/undefined |
| Off-by-one | Loops com index incorreto, array.length sem -1 |
| Async/timing | Missing await, race conditions, promise não resolvida |
| State management | Stale state, missing re-render trigger, useEffect sem dependências |
| Import/module | Caminho de import incorreto, export missing, circular dependency |
| Type/coercion | Type mismatch, truthy/falsy inesperado, NaN |
| Environment | Browser-specific API, Node vs browser, variável de ambiente |
| Data shape | Assumptions sobre formato de API response, missing fields |
| Event handling | Event listener não registrado/removido, bubbling inesperado |
| Error handling | Uncaught exceptions, silent failures, try/catch incompleto |

### Passo 4: Testar Cada Hipótese
- Para cada hipótese, leia o código relevante e verifique
- Elimine hipóteses que não se confirmam com evidências
- Se 2+ horas sem progresso, recomece do zero

### Passo 5: Reportar
Retorne: root_cause, evidence, files_affected, fix_direction, hypotheses_considered

## 3. Formato de Saída

```
## ROOT CAUSE FOUND

### Root Cause
[Descrição clara e concisa]

### Evidence
[Evidências de código]

### Files Affected
- path/file.ts (linha N)

### Fix Direction
[Instrução específica de correção]

### Hypotheses Considered
1. Hipótese A — [Accepted/Rejected] — Motivo
2. Hipótese B — [Accepted/Rejected] — Motivo
3. Hipótese C — [Accepted/Rejected] — Motivo
```

## 4. Quando Escalar

- Após 3 tentativas de diagnóstico sem sucesso
- Se stall detection indicar que bugs não diminuem
- Se o código afetado estiver além da capacidade de análise
