# BSD Review Criteria

## Stance

ADVERSARIAL — assume the implementation has defects until proven otherwise.

## Checklist

### Functional Correctness
- [ ] Each acceptance criterion (WHEN/THEN/SHALL) is satisfied
- [ ] Edge cases are handled
- [ ] Error paths are covered
- [ ] No silent failures

### Code Quality
- [ ] Follows existing code patterns
- [ ] No unnecessary complexity
- [ ] Proper naming and types
- [ ] No debug code or todos left behind

### Security
- [ ] Input validation is present
- [ ] No injection vulnerabilities
- [ ] No exposed secrets
- [ ] Proper auth/authorization if applicable

### Scope
- [ ] No scope creep — only implements the task
- [ ] No "improvements" not in the spec
- [ ] Surgical changes — minimal file touch

## Severity Classification

- **BLOCKER**: Incorrect behavior, security issue, data loss risk → must reject
- **WARNING**: Quality issue, maintainability concern → may approve with note
