---
name: implement
description: "Turn one scoped GitHub Issue into a verified diff: code, tests, verification, report. Use directly when the workspace is prepared and no PR is expected; use task-to-pr when an issue should become a PR."
user-invocable: true
argument-hint: "<issue number or description> e.g. '#12' or 'Task 2 from select-event spec'"
---

# Implement

Turn one issue into a verified diff. Read the issue, the spec when one exists, `CONTEXT.md`, and the relevant code. Mark the issue in-progress. Ask when requirements are unclear, when the task is too large, or when anything affects behavior or safety. State low-risk assumptions and keep going.

## Contract

- One task at a time. Make the smallest complete change that fully does it.
- Don't touch unrelated code.
- Don't change function signatures, return shapes, or other contracts unless the task says to.
- Add or update tests whenever behavior changes, a bug is fixed, or a real edge case is introduced. Tests must prove the new behavior.
- When correctness depends on a framework's current behavior, check the docs for the version the project uses.
- Run focused checks first, then the project's wider checks. Fix what they catch without growing scope.
- Run `review` on the final diff for non-trivial changes, with `code-reviewer` subagent when available. Fix valid in-scope findings and rerun checks.

## Glance Safety Checks

Before finalizing any diff, verify each applicable check. If a check fails, fix before committing or stop and surface a `needs:human` blocker.

**Patient-side UI change?**
- Confirm every new interactive target is reachable via `SelectEvent` (gaze-dwell + blink or scan-mode + blink). No pointer, keyboard, or touch event may be the sole path.

**Camera or MediaPipe change?**
- Confirm every path that calls `getUserMedia` or activates a track has a paired `track.stop()` on all exit paths: schedule end, override off, component unmount, error.

**AI text output change?**
- Confirm predictive/expanded text is shown to the patient for explicit blink-confirm before any send action. No AI-generated content reaches the send path without patient selection.

**SOS-related change?**
- Confirm the Web Audio API amplitude-threshold trigger remains reachable independent of camera state.

## Report

State what changed, checks run with results, acceptance criteria status, review findings fixed, and anything not verified. Comment evidence on the issue and mark it ready for review.
