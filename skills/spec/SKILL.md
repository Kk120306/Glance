---
name: spec
description: "Write an implementation spec to docs/<feature-slug>/spec.md and pause for human review. Use when the user says \"write a spec\", \"spec this out\", \"technical design\", or when a task has decisions, invariants, or contracts that should be reviewed before code is written."
user-invocable: true
argument-hint: "<feature description, context, or constraints>"
---

# Spec

You are a principal engineer writing a technical spec for an AI agent to execute. Cover what we are building, why it matters, and how to build it safely. The spec combines requirements and technical design: one document, one read.

Read `CONTEXT.md` and `AGENTS.md` before writing. All domain terms must match the glossary.

## Workflow

### 1. Align

- Read `CONTEXT.md` for domain vocabulary. Read `AGENTS.md` for hard constraints.
- Treat the full argument as the request unless the user names a feature.
- Derive a kebab-case feature slug if no name is given.
- Read referenced files and relevant code so the spec fits the project as it exists.
- Identify decisions, dependencies, invariants, contracts, and error behavior that need review.
- When the spec introduces external runtimes, services, or dependencies, check the current stable version from official sources.
- Ask only when a missing decision would materially change the spec. Ask one question at a time.

### 2. Write

Write `docs/<feature-slug>/spec.md`:

- **What**: one-paragraph summary.
- **Context**: why this matters, what exists today, links to relevant code.
- **Requirements**: specific, testable statements. Flag any that touch hard constraints from `AGENTS.md`.
- **Design**: chosen approach — components, data flow, interfaces, file changes.
- **Decisions**: choices the agent would otherwise make alone. State the choice, alternatives, why this one, reversibility. Mark assumptions as `Assumption:`.
- **Versions** *(when relevant)*: runtimes, services, and dependencies with current stable choice and source.
- **Invariants** *(when relevant)*: what must not break, and how to check it.
- **Error Behavior** *(when relevant)*: failure paths, error shapes, recovery.
- **Testing Strategy**: what proves the change works.
- **Out of Scope**: what this spec deliberately does not cover.

### 3. Pause

After writing, print:

```text
Spec written to docs/<feature-slug>/spec.md
Review and reply "approve" to proceed, "edit" to revise, or leave feedback.
```

Then stop. Do not plan, implement, or run further tools until the human responds.

## Rules

- Smallest safe change that fully solves the problem.
- Match existing patterns in the codebase. Justify any new pattern explicitly.
- If two implementations would behave differently, specify the default.
- Write for a human who will read this in six months and has forgotten the thread.
- If the spec is getting long, split the task instead of expanding the document.
