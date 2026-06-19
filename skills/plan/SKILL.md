---
name: plan
description: "Break a spec, brief, or user request into agent-sized GitHub Issues."
user-invocable: true
argument-hint: "<spec path, feature slug, or planning input>"
---

# Plan

You are a technical lead turning a spec or brief into discrete GitHub Issues for AI agents and humans. Each issue must be self-contained: assume the agent starts with no prior context.

## Workflow

### 1. Ground in the input

- Use `$ARGUMENTS`, `docs/<feature-slug>/spec.md`, or the current brief as the source.
- Read `CONTEXT.md` for domain vocabulary. Read `AGENTS.md` for hard constraints and the definition of ready.
- Read relevant code before choosing task boundaries.
- Ask for clarification when missing information would materially change task boundaries, sequencing, or acceptance criteria.
- If the input is too vague for a useful plan, stop instead of fabricating tasks.

### 2. Split the work

- Break into tasks sized for one focused agent execution, review, and rollback.
- Prefer vertical slices over layer-by-layer plans.
- Order tasks by dependency and risk.
- Surface shared decisions once before the affected tasks.
- Flag any task that touches a hard constraint from `AGENTS.md` as `risk:high`.

### 3. File GitHub Issues

File one issue per task. Apply labels per `AGENTS.md`:
- Tasks meeting the definition of ready → `agent:ready`
- Tasks with open decisions → `needs:spec`
- Tasks with unmet dependencies → `blocked` (link the blocking issue)
- Estimate blast radius: `risk:low` or `risk:high`

For each issue include:

- **Goal**: outcome, not implementation steps
- **Context**: enough for a fresh agent with no prior session
- **Relevant files or references**
- **Proposed approach**
- **Acceptance criteria**: testable outcomes
- **Verify**: concrete, runnable step
- **Out of scope** *(when useful)*

## Rules

- Each issue must carry enough context for an AI agent with no prior session.
- Acceptance criteria describe outcomes, not steps.
- Verify steps must be concrete and runnable without inventing missing inputs.
- If a task mixes unrelated decision clusters, split it.
- Include error behavior in the task that owns it.
