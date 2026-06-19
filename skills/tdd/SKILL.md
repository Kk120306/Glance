---
name: tdd
description: "Test-first variant of implement: understand the desired behavior, write a failing test, make it pass, then simplify."
user-invocable: true
argument-hint: "<issue number or behavior> e.g. '#12' or 'SelectEvent fires on blink'"
---

# Test-Driven Development

Use for behavioral changes where a failing test can describe the desired outcome before implementation.

Read `CONTEXT.md` for domain vocabulary before writing tests. Test names should use canonical terms from the glossary.

## Workflow

### 1. Understand

- Read the request, issue, spec, and relevant code.
- Identify the desired behavior, existing contracts, failure paths, and verification.
- Ask before writing tests when missing information would materially change behavior, scope, safety, or contracts.

### 2. Red

- Write the smallest failing test that proves the desired behavior or reproduces the bug.
- Run it and confirm it fails for the expected reason.

### 3. Green

- Write the minimum implementation needed to pass the test.
- Preserve existing contracts unless the task explicitly changes them.
- Add failure-path tests where they matter.

### 4. Refine

- Simplify code and tests while they stay green.
- Run focused checks first, then the project's wider checks.
- Run Glance safety checks (from `implement`) if the change touches patient-side UI, camera, AI text output, or SOS paths.
- Report the failing-then-passing test and final verification.

## Rules

- Do not write implementation before a failing test for the behavior.
- Tests describe behavior, not implementation details.
- Prefer real boundaries over mocks when practical.
- Skip TDD for documentation, formatting, or non-behavioral scaffolding work.
