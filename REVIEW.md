# Review Concerns

When reviewing changes in this repo, apply the standard correctness checks plus these Glance-specific concerns.

## Standard

- Correct: does the change do what the task says, including edge cases and failure paths?
- Tests: do they prove the changed behavior, or just exercise code? Tests that never run the changed branch are blockers.
- Contracts: are existing interfaces, data shapes, and security boundaries intact?
- Scope: does the change include anything the task did not ask for?

## Glance-Specific

**Zero-hands invariant** — every patient-side interaction path must be completable by gaze-dwell + blink or scan-mode + blink alone. Any new pointer, keyboard, or touch event that is the sole path to an action on the patient side is a blocker.

**Camera lifecycle** — any code that activates a `MediaStream` track must have a paired `track.stop()` call on every exit path (schedule end, manual override off, component unmount, error). Leaving a track open outside a CameraWindow is a blocker.

**AI content gate** — predictive text and keyword-to-sentence expansion may only phrase or extend what the patient explicitly selected. Any path that generates or fills in content the patient did not choose, or that sends expanded content without a visible blink-confirm step, is a blocker.

**SOS independence** — the Web Audio API amplitude-threshold trigger must remain reachable without the camera being active. Any change that gates SOS behind camera state is a blocker.

**Receiving is always on** — incoming messages must auto-play in the sender's cloned voice regardless of camera schedule. Any change that makes message delivery conditional on camera state is a blocker.

## Style

- Prefer the simplest change that fully solves the problem.
- Flag new dependencies when the project already handles the same need.
- Flag dead code the change leaves behind.
