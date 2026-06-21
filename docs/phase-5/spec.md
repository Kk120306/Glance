# Phase 5 — Production Hardening: Security, QA & Hard-Constraint Verification Spec

## What

Phases 1–4 built the product surface: messaging, gaze interaction, voice, SOS, the Blob agent, and the multi-patient network. Phase 5 makes that surface **provably safe to ship**. It adds no new user-facing features. Instead it converts the PRD's four non-negotiable Hard Constraints and its "multi-patient scope bugs leak data (High risk)" item from review-time promises into **automated regression tests** that fail the build if a constraint is ever broken.

Phase 5 delivers four things:

1. **A dashboard test harness.** The `@glance/dashboard` app currently ships **zero tests** and has no `test` script, so `turbo run test` skips it entirely. Every caregiver-facing authorization boundary — the highest-risk code in the system — is untested. Phase 5 adds Vitest to the dashboard and brings it into the monorepo test run.

2. **Cross-tenant authorization tests.** Route-level tests prove that a caregiver can never read messages, change camera schedules, rename, or otherwise touch a patient they are not explicitly linked to via `patient_caregivers` — every such attempt must return `403 Forbidden`. Patient-token endpoints (`sos`, `messages/patient`, `reply`) are proven to reject missing/invalid device tokens and cross-patient access.

3. **Hard-constraint regression suite.** The two pieces of safety-critical patient logic that today live inline in `PatientScreen.tsx` — the **SOS amplitude/sustain decision** and the **camera track-stop** routine — are extracted into pure, camera-independent modules and unit-tested. Static source-guard tests lock in all four Hard Constraints so a future change that violates one fails CI.

4. **Green, complete monorepo test run.** `pnpm test`, `pnpm build`, and `pnpm typecheck` all pass across all four packages, with the dashboard now included.

---

## Requirements

### 1. Dashboard Test Harness

- Add `vitest` as a dev dependency to `apps/dashboard` and a `"test": "vitest run"` script so `turbo run test` picks it up.
- Add `apps/dashboard/vitest.config.ts` using the `node` environment (route handlers run server-side) and resolving the `@/` path alias to `src/`.
- Tests must be **hermetic**: no live Postgres, no network, no running Next.js server. Module-construction side effects (`@glance/shared/db` builds a `postgres` pool at import; `@/lib/auth` builds a `pg` pool) must be mocked away with `vi.mock`.

### 2. Cross-Tenant Authorization Tests (the data-leak risk)

For every caregiver-session route, assert the full status ladder:

- **`GET/POST /api/messages`**: `401` no session → `404` no family member → `400` missing `patientId` / invalid body → `403` when `getCaregiverAccess` returns null → success (`200`/`201`) when associated.
- **`GET/POST /api/patients/[id]/camera-config`**: same ladder, `403` when unassociated.
- **`PATCH /api/patients/[id]`**: `403` when unassociated; `400` on empty/oversized name.
- **`GET /api/patients`**: `401`/`404`, and returns only the caller's associated patients.
- **`POST /api/patients/register`**: `201` provisions a patient and links the caller as `primary_caregiver`.
- **`POST /api/patients/link`**: `404` for an unknown device token, `409` when already linked, success otherwise.

For patient-token routes (no caregiver session):

- **`POST /api/patients/[id]/sos`**: `401` missing/invalid `x-device-token`; `403` when the token's patient `id` ≠ the URL `id`.
- **`POST /api/messages/patient`**: `401` missing/invalid token; `400` invalid body.
- **`POST /api/messages/[id]/reply`**: `401` missing/invalid token; `404` unknown message; `403` replying to another patient's message; `400` invalid reply value.

The invariant under test: **a route must never reach its database mutation/read of patient data unless the caller is authorized.** Tests assert both the status code and that the privileged DB call did/didn't happen.

### 3. Hard-Constraint Regression Suite

The four PRD Hard Constraints, each with a regression test:

1. **Zero Hands** — a static guard test scans patient-side interactive components and asserts no interaction path is reachable *only* via keyboard/mouse/touch. (`onClick` is allowed as a co-equal path; gaze/scan via `useInteractiveTarget` must also be wired. No `onKeyDown`/`onMouseMove`/`onTouch*` as a sole input path.)
2. **Camera Lifecycle** — the track-stop routine is extracted to `apps/patient/src/utils/cameraTracks.ts` (`stopAllTracks`) and unit-tested to stop **every** track. A source guard asserts every `getUserMedia` call site in the patient app has a paired `track.stop()` on all exit paths.
3. **AI Content Gate** — a guard test asserts the patient never sends content the patient did not explicitly select. The phrase board exposes a frozen, literal `FIXED_PHRASES` list (no generation), and outbound phrase/message payloads originate only from an explicit selection.
4. **SOS Independence** — the amplitude/sustain decision is extracted to `apps/patient/src/utils/sosAmplitude.ts` and unit-tested to be a pure function of the audio buffer (no camera input). A source guard asserts the microphone SOS listener uses `getUserMedia({ audio: true })` and never depends on the video/camera stream.

### 4. Monorepo Green

- `pnpm test` runs and passes in all four packages (`shared`, `patient`, `ws-server`, `dashboard`).
- `pnpm build` and `pnpm typecheck` pass.
- No regression to the 122 existing tests.

---

## Design

### Dashboard test layout

```
apps/dashboard/
  vitest.config.ts                      # node env, @/ → src alias
  __tests__/
    helpers.ts                          # makeDbMock(), makeRequest(), session/access stubs
    api/
      messages.test.ts                  # GET/POST scoping + validation
      camera-config.test.ts             # GET/POST scoping
      patients.test.ts                  # GET list, PATCH name, register, link
      patient-token-routes.test.ts      # sos, messages/patient, reply (device-token auth)
```

Each suite `vi.mock`s `@glance/shared/db`, `@/lib/auth`, `@/lib/caregiver-auth`, `@/lib/tone-classifier`, and `next/headers`, then imports the real route handler and drives it with a minimal request stub. The DB mock is a chainable builder whose terminal `.where()/.returning()/.then` resolves to a per-test fixture, letting a test assert e.g. "no `db.insert` happened on a 403".

### Extracted patient safety modules

`apps/patient/src/utils/sosAmplitude.ts`:

```ts
/** Mean normalized (0..1) amplitude of an FFT byte buffer. Pure; no camera. */
export function meanAmplitude(data: Uint8Array): number

/** Stateful-but-pure SOS sustain tracker: given the current amplitude, the
 *  threshold, the sustain window, a "now" timestamp, and the prior start time,
 *  returns the next start time and whether SOS should fire. */
export interface SosSustainState { startedAt: number | null }
export function stepSosSustain(
  state: SosSustainState,
  amplitude: number,
  opts: { threshold: number; sustainMs: number; now: number },
): { state: SosSustainState; fire: boolean }
```

`apps/patient/src/utils/cameraTracks.ts`:

```ts
/** Stop every video track on a MediaStream. Idempotent; safe on a null stream. */
export function stopAllTracks(stream: MediaStream | null): void
```

`PatientScreen.tsx` and `useCameraStream.ts` are refactored to call these, with no behavior change.

---

## Decisions

**Decision #1 — Route-level tests over a live test database**
- **Choice**: Mock module boundaries (`db`, `auth`, `caregiver-auth`) and import the real route handlers.
- **Why**: Keeps the suite hermetic and fast (matches the existing `emit.test.ts` / `schema.test.ts` philosophy), runs in any CI without Postgres, and still exercises the actual shipped authorization branches.
- **Reversibility**: High. A future integration tier with Testcontainers Postgres can be added alongside without removing these.

**Decision #2 — Extract safety logic to pure modules rather than test the React component**
- **Choice**: Pull SOS amplitude/sustain and camera track-stop out of `PatientScreen.tsx` into pure utils.
- **Why**: The Web Audio / MediaStream APIs are painful to drive through a rendered component; pure functions make the two camera-independent, safety-critical behaviors directly and exhaustively testable. Mirrors the existing `calibration.ts` / `gazeUtils.ts` extraction pattern.
- **Reversibility**: Medium. Inlining them back is mechanical but would lose the unit tests.

**Decision #3 — Static source-guard tests for constraints not expressible as unit tests**
- **Choice**: For Zero-Hands and the AI Content Gate, read the patient source files at test time and assert structural invariants (presence of `useInteractiveTarget`, frozen `FIXED_PHRASES`, no sole-path keyboard handlers).
- **Why**: These constraints are about *what the code is allowed to contain*, not a single function's output. A guard test is the cheapest durable enforcement and turns the AGENTS.md "Stop and Ask the Human" rules into a failing build.
- **Reversibility**: High.

---

## Invariants

- **No cross-tenant access**: every caregiver route returns `403` when `patient_caregivers` has no matching link, proven by test, with the privileged DB call asserted not to run.
- **SOS Independence preserved**: the extracted SOS decision is a pure function of the audio buffer; the mic listener requests `audio: true` only and never reads the camera stream.
- **Camera Lifecycle preserved**: `stopAllTracks` stops every track; every patient `getUserMedia` site has a paired stop on all exit paths.
- **Zero Hands preserved**: no patient interactive target is reachable solely by keyboard/mouse/touch.
- **AI Content Gate preserved**: outbound patient content derives only from an explicit, frozen selection set.
- **No behavior change**: refactors are pure extractions; all 122 prior tests still pass.

---

## Testing Strategy

- **Dashboard route tests** (`apps/dashboard/__tests__/api/*.test.ts`): the authorization ladders and validation cases enumerated in Requirements §2, each asserting status code and DB-call presence/absence.
- **SOS unit tests** (`apps/patient/__tests__/sosAmplitude.test.ts`): `meanAmplitude` math across silent/loud buffers; `stepSosSustain` fires only after sustained over-threshold input, resets below threshold, and is independent of any camera state.
- **Camera lifecycle unit tests** (`apps/patient/__tests__/cameraTracks.test.ts`): `stopAllTracks` stops all tracks, no-ops on null, is idempotent.
- **Hard-constraint guard tests** (`apps/patient/__tests__/hard-constraints.test.ts`): the four structural source guards.
- **Aggregate verification**: `pnpm test && pnpm build && pnpm typecheck` all green; dashboard now counted in the run.
