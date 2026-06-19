# Working in Glance

Glance is a hands-free AAC communication platform for motor-impaired patients. Patients receive messages from family and reply using only gaze and blink — no touch, no keyboard, ever. Family compose messages via a dashboard. Gaze tracking and voice cloning are the two hero features.

If you are an AI agent working in this repo, follow this guidance.

## The Two Flows

**Decide** (`spec` → `plan`): turn ambiguity into reviewed decisions and agent-sized GitHub Issues. Start at `spec` when contracts, invariants, or technical choices need review before code. Start at `plan` when the work just needs splitting into issues. Skip to implementation only when the change is trivial and decision-complete.

**Deliver** (`task-to-pr`): turn one GitHub Issue into a draft PR. Runs `branch` → `implement` → `review` → `pr`, then updates the issue. Use `tdd` when a failing test can describe the behavior first. Use `debug` when something breaks.

Exploration is allowed without creating docs or issues. Do not manufacture fake specs or issues for spikes.

## Hard Constraints — Stop and Ask the Human

Every agent must halt and surface a blocker to the human if a change would:

1. **Zero hands**: introduce any touch, mouse, or keyboard event as the sole interaction path on the patient side.
2. **Camera lifecycle**: leave a `MediaStream` track active outside a `CameraWindow` — every track activation must have a paired `track.stop()` on all exit paths.
3. **AI content gate**: generate, suggest, or fill in message content the patient did not explicitly select — predictive text and keyword expansion may only phrase/extend explicit selections, and must show the expanded result for one blink-confirm before send.
4. **SOS independence**: remove or block the Web Audio API amplitude-threshold path for SOS — SOS must be triggerable without the camera.

These are non-negotiable product constraints, not style preferences.

## Skills

Decide:

- `spec`: write `docs/<feature-slug>/spec.md` and pause for human review.
- `plan`: break a spec or brief into GitHub Issues.

Deliver:

- `task-to-pr`: orchestrate one issue to a draft PR.
- `branch`: create a traceable branch with the issue number.
- `implement`: turn one scoped issue into a verified diff with tests.
- `tdd`: test-first variant of implement.
- `debug`: root-cause a failure, fix it via tdd.
- `review`: pre-merge review for correctness, safety, and real tests.
- `pr`: commit, push, and open a PR.
- `commit`: stage intended changes and write one Conventional Commit.
- `browser-verify`: verify gaze UI in a real browser (requires Chrome DevTools MCP).

Domain:

- `domain-modeling` (`.agents/skills/domain-modeling/`): maintain `CONTEXT.md` glossary and `docs/adr/` decisions.

## Agents

- `code-reviewer` (`.claude/agents/code-reviewer.md`): fresh-context adversarial reviewer used by `implement` and `task-to-pr`.

## Definition of Ready

An issue is agent-ready when a fresh agent could finish it without asking questions:

- Goal stated as an outcome, not an implementation.
- Enough context to execute with no prior session.
- Testable acceptance criteria.
- A concrete, runnable verify step.
- Decision-complete: no open product or design decisions.
- Hard constraints above are not violated by the proposed change.

## GitHub Labels

```bash
gh label create "needs:spec"     --color "1d76db" --description "Real problem, open decisions"
gh label create "needs:human"    --color "d93f0b" --description "Waiting on a human decision"
gh label create "agent:ready"    --color "0e8a16" --description "Meets the definition of ready"
gh label create "agent:working"  --color "fbca04" --description "Claimed by a worker"
gh label create "agent:complete" --color "5319e7" --description "PR open, awaiting human review"
gh label create "blocked"        --color "b60205" --description "Waiting on another issue"
gh label create "risk:low"       --color "c2e0c6" --description "Small blast radius"
gh label create "risk:high"      --color "e99695" --description "Large blast radius; attended only"
gh label create "type:feature"   --color "a2eeef" --description "New behavior"
gh label create "type:bug"       --color "d73a4a" --description "Broken behavior"
gh label create "type:chore"     --color "cfd3d7" --description "Maintenance"
```

State machine: `needs:spec` → (human flips) → `agent:ready` → (work loop claims) → `agent:working` → (PR opens) → `agent:complete` → (human merges) → closed.

Unattended loops claim `risk:low` issues only.

## Guidance

- Read `CONTEXT.md` for domain terminology before writing any code.
- Design docs default to `docs/<design-slug>/design.md`.
- One spec per feature at `docs/<feature-slug>/spec.md`.
- Specs are durable; plans are transport. Issues are the plan.
- Tests are the verification mechanism; review checks they are real.
- If the task, spec, or issue is wrong, stop and update it.

## Out of Scope

Do not build: live video/voice calling, AI-generated full reply suggestions, multi-modal input beyond gaze and scan/blink, clinical/caretaker dashboard distinct from family dashboard, customizable phrase board, multi-language support.
