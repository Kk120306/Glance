# Phase 5 — Plan (GitHub Issues)

Three self-contained, agent-ready issues that harden Glance for production by turning the four Hard Constraints and the multi-patient data-leak risk into automated regression tests, with no new user-facing features.

## Dependency order

- Issue 1 (dashboard test harness + cross-tenant auth tests) is independent and highest priority — it closes the High data-leak risk.
- Issue 2 (hard-constraint regression suite) is independent of Issue 1.
- Issue 3 (wire turbo + full green) depends on Issues 1 and 2.

```
1 (dashboard auth tests) ┐
2 (hard-constraint suite) ┘── 3 (turbo wiring + green verification)
```

---

## Issue 1: Dashboard Test Harness & Cross-Tenant Authorization Tests

- **Goal**: Stand up Vitest in `@glance/dashboard` and prove that no caregiver can access a patient they are not linked to via `patient_caregivers`, and that every route validates its input.
- **Context**: The dashboard ships zero tests and no `test` script, so `turbo run test` skips it. Caregiver authorization is the highest-risk code in the system (PRD: "Multi-patient scope bugs leak data — High").
- **Relevant Files**:
  - `apps/dashboard/package.json`, `apps/dashboard/vitest.config.ts` (**NEW**)
  - `apps/dashboard/__tests__/helpers.ts` (**NEW**)
  - `apps/dashboard/__tests__/api/messages.test.ts`, `camera-config.test.ts`, `patients.test.ts`, `patient-token-routes.test.ts` (**NEW**)
  - Routes under `apps/dashboard/src/app/api/**` (under test, unchanged)
- **Proposed Approach**:
  1. Add `vitest` dev dep and `"test": "vitest run"` to `apps/dashboard/package.json`.
  2. Add `vitest.config.ts` (`environment: 'node'`, `@/` → `src/` alias).
  3. Write `helpers.ts`: a chainable `makeDbMock`, a `makeRequest` request stub, and helpers to mock `@/lib/auth` session state and `@/lib/caregiver-auth` access.
  4. For each route, `vi.mock` the db/auth/caregiver-auth/tone-classifier/`next/headers` boundaries, import the real handler, and assert the status ladder (401 → 404 → 400 → 403 → success) plus that the privileged DB call did not run on a 403.
- **Acceptance Criteria**:
  - `pnpm --filter @glance/dashboard test` passes.
  - Every caregiver route returns `403` when unassociated; patient-token routes reject missing/invalid tokens and cross-patient access.
- **Verify**:
  - `pnpm --filter @glance/dashboard test`
  - `pnpm --filter @glance/dashboard typecheck`

---

## Issue 2: Hard-Constraint Regression Suite

- **Goal**: Extract the two safety-critical patient behaviors into pure modules with unit tests, and add static guards for all four Hard Constraints.
- **Context**: The SOS amplitude decision and camera track-stop routine live inline in `PatientScreen.tsx`/`useCameraStream.ts`, untested. The four Hard Constraints in AGENTS.md are enforced only by human review today.
- **Relevant Files**:
  - `apps/patient/src/utils/sosAmplitude.ts` (**NEW**), `apps/patient/src/utils/cameraTracks.ts` (**NEW**)
  - `apps/patient/src/components/PatientScreen.tsx`, `apps/patient/src/hooks/useCameraStream.ts` (refactor to use the new utils)
  - `apps/patient/__tests__/sosAmplitude.test.ts`, `cameraTracks.test.ts`, `hard-constraints.test.ts` (**NEW**)
- **Proposed Approach**:
  1. Extract `meanAmplitude` + `stepSosSustain` to `sosAmplitude.ts`; refactor the mic listener to use them. Unit-test that SOS fires only on sustained over-threshold audio and is camera-independent.
  2. Extract `stopAllTracks` to `cameraTracks.ts`; refactor `useCameraStream` and the mic cleanup to use it. Unit-test it stops all tracks, no-ops on null, is idempotent.
  3. Add `hard-constraints.test.ts` with four source-guard tests: Zero Hands (no sole-path keyboard/mouse handler; `useInteractiveTarget` wired), Camera Lifecycle (every patient `getUserMedia` paired with a stop), AI Content Gate (`FIXED_PHRASES` frozen literal, no generation), SOS Independence (mic uses `getUserMedia({ audio: true })`).
- **Acceptance Criteria**:
  - New unit + guard tests pass; the refactor changes no runtime behavior (122 prior tests still pass).
- **Verify**:
  - `pnpm --filter @glance/patient test`
  - `pnpm --filter @glance/patient typecheck`

---

## Issue 3: Turbo Wiring & Full-Green Verification

- **Goal**: Bring the dashboard into the monorepo test run and confirm the whole repo is green.
- **Context**: With a `test` script added to the dashboard, `turbo run test` now covers all four packages. Phase 5 is "done" only when the full suite, build, and typecheck pass together.
- **Relevant Files**: `turbo.json`, root `package.json`, `docs/PRD.md` (timeline row).
- **Proposed Approach**:
  1. Confirm `turbo.json`'s `test` task picks up the dashboard (it does once the script exists); adjust `dependsOn`/`outputs` only if needed.
  2. Run `pnpm test`, `pnpm build`, `pnpm typecheck` from the root; fix any fallout.
  3. Add a Phase 5 row to the PRD timeline table and mark the phase status.
- **Acceptance Criteria**:
  - `pnpm test` shows 4 successful packages; `pnpm build` and `pnpm typecheck` pass.
- **Verify**:
  - `pnpm test && pnpm typecheck && pnpm build`
