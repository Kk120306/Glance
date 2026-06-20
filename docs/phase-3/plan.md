# Phase 3 — Plan (GitHub Issues)

This plan contains 6 self-contained, agent-ready issues to implement the advanced interactive controls, patient-initiated phrase board, and calibration tool for Glance.

## Status (implemented)

All 6 issues are implemented and verified (113 unit tests pass via `pnpm test`; `tsc --noEmit` is clean across all 4 workspaces):

- **Prerequisite** — resolved: the `setDwellDirection` bug is gone; `InteractionProvider` has no stray references.
- **Issue 1** — `schema.ts` updated (nullable `senderId`, new `senderPatientId`, `valid_sender` XOR check); migration `0002_thin_madame_web.sql` generated. `db:migrate` requires a live Postgres (`DATABASE_URL`).
- **Issue 2** — `POST /api/messages/patient` added; dashboard renders the "Patient" badge, plays a double-chime, and shows a dismissible toast on patient-initiated `NEW_MESSAGE`.
- **Issues 3 & 4** — cursor rendering + bounding-box dwell were already present; this pass added the spec-required recenter-on-screen-change (`targetsVersion`).
- **Issue 5** — `SpeakButton` (bottom-left, gaze/scan target) + fullscreen `PhraseBoard`; selection does local TTS + best-effort POST. SOS button is now a gaze target too.
- **Issue 6** — `useGazeTracker` accepts an `earThreshold` override and exposes a live `earRef`; `CalibrationScreen` wizard persists `localStorage['glance_ear_threshold']` via the testable `utils/calibration.ts` helpers. **The wizard auto-runs once at startup (per page load, once a camera stream exists) and is fully autonomous — no required human input; it waits for a face, samples, auto-recenters, saves, and self-closes, with an optional Skip as a no-lockup safety valve.**

See "Implementation Notes & Deviations" in `spec.md` for where the build differs from the original wording (cursor uses a fixed-position element, not a portal; WS fan-out reuses the SOS pattern).

## Prerequisites

✅ Resolved before this pass: the **`setDwellDirection`** references in `InteractionProvider.tsx` (a missing `useState`) were removed when the direction-mapped dwell was replaced by bounding-box intersection.

## Dependency order

- Issue 1 (schema) must land first.
- Issue 2 (APIs and dashboard alerts) depends on Issue 1.
- Issue 3 (cursor rendering) can proceed independently (after the prerequisite fix above).
- Issue 4 (target intersection) depends on Issue 3.
- Issue 5 (phrase board UI) depends on Issues 2 and 4.
- Issue 6 (calibration tool) depends on Issue 4.

```
prerequisite fix (setDwellDirection bug)
│
1 (schema)
└── 2 (patient API & dashboard alerts)
│   └── 5 (phrase board UI) ← also needs 4
3 (complete cursor rendering in InteractionProvider)
└── 4 (bounding-box intersection replaces direction-mapped dwell)
    ├── 5 (phrase board UI)
    └── 6 (calibration tool)
```

---

## Issue 1: Database Schema & Migration Setup

- **Goal**: Update the Drizzle ORM schema to support patient-initiated messages, generate the migrations, and apply them.
- **Context**: Patients must be able to send quick phrases. Currently, `messages.senderId` is a non-nullable foreign key referencing `familyMembers`. We must make it nullable and add `senderPatientId` referencing `patients` to support patient-sent messages.
- **Relevant Files**:
  - [schema.ts](file:///Users/kaikameyama/repos/Glance/packages/shared/db/schema.ts)
  - [route.ts](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/api/messages/route.ts) (consumer of `NewMessage` type)
- **Proposed Approach**:
  1. In `packages/shared/db/schema.ts`, modify `messages.senderId` to remove `.notNull()`.
  2. Add `senderPatientId` as a uuid column referencing `patients.id` (nullable).
  3. Update the table constraints array to include a check constraint: `valid_sender` ensuring either `senderId` or `senderPatientId` is set, but not both.
  4. **Migration safety**: The `valid_sender` check constraint must be added **after** existing rows are valid. Since all existing messages have `senderId` set and `senderPatientId` defaults to `NULL`, this is safe — the XOR constraint `(senderId IS NOT NULL AND senderPatientId IS NULL)` holds for all existing rows. No backfill needed.
  5. Update the existing `POST /api/messages` route (line 53 of `route.ts`) — `senderId` is currently required by the insert. Since `senderId` is now nullable at the schema level, ensure the existing family-member message route still passes `senderId` explicitly (no code change needed, just verify the insert still works with the new schema).
  6. Generate migrations by running `pnpm db:generate` in the root (or `packages/shared` workspace).
  7. Apply migrations by running `pnpm db:migrate` and verify that the database table schema updates successfully.
- **Acceptance Criteria**:
  - Drizzle schema is successfully updated.
  - Migration script is generated and committed in `packages/shared/drizzle/migrations/`.
  - Monorepo builds with zero type errors (`pnpm build`).
  - Existing `POST /api/messages` route still creates family-member messages successfully.
- **Verify**:
  - Run `pnpm --filter @glance/shared db:generate` followed by `pnpm --filter @glance/shared db:migrate`.
  - Run `pnpm build` — zero type errors.
  - Verify that `Message` and `NewMessage` types (auto-inferred by Drizzle) now include optional `senderPatientId`.

---

## Issue 2: Patient-Initiated Message API & Caregiver Alerts

- **Goal**: Implement the endpoint for patient-sent messages, update the messages history queries, and implement caregiver real-time chimes and desktop alerts.
- **Context**: When a patient selects a phrase, the client POSTs it to the dashboard. The dashboard must persist the message, broadcast it to caregiver clients via WebSockets, and trigger an alert.
- **Dependencies**: Issue 1.
- **Relevant Files**:
  - [page.tsx](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/page.tsx) (dashboard message list rendering)
  - `apps/dashboard/src/app/api/messages/patient/route.ts` (**NEW**)
  - [route.ts](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/api/messages/route.ts) (existing messages API)
  - [ws types](file:///Users/kaikameyama/repos/Glance/packages/shared/ws/types.ts)
- **Proposed Approach**:
  1. Create a Next.js API route `POST /api/messages/patient` in `apps/dashboard`.
  2. Read `X-Device-Token` header, validate against `patients` table, retrieve patient record.
  3. Validate body contains `content` (the phrase string, 1–1000 chars).
  4. Insert message with:
     - `senderPatientId` = patient's ID
     - `senderId` = `null` (no family member sender)
     - `recipientId` = patient's ID (the patient is the `recipient` in the schema's FK sense; this maintains the existing constraint that `recipientId` references `patients.id`)
     - `isYesNo` = `false` (patient phrases are never yes/no questions)
     - `toneClass` = `'neutral'` (no LLM classification needed for fixed phrases)
  5. **WebSocket broadcast**: Since there is **no join table** between `familyMembers` and `patients`, and the current system assumes a single-patient setup, broadcast the new message to **all connected caregiver sockets**. Use the ws-server `/emit` route with `targetPatientId` set to the patient's ID. Update the ws-server to also forward `NEW_MESSAGE` events to caregiver connections that are registered for the same patient (not just the patient connection). If this routing change is too complex, an alternative is to emit a separate event to each known caregiver, or simply broadcast to all connections.
  6. Update dashboard `GET /api/messages` query to fetch all messages (no change needed — the existing `select().from(messages)` already returns all rows regardless of sender type).
  7. On the caregiver dashboard (`page.tsx`), update the message log list to check if `msg.senderPatientId` is set. If so, display **"Patient"** as the sender with a distinct visual badge (e.g., a colored pill/tag).
  8. Add a WebSocket event listener on the dashboard page for patient-initiated messages. When a `NEW_MESSAGE` is received where `payload.senderPatientId` is set, play a discrete **double-chime** audio alert and show a dismissible floating toast/alert in the corner.
- **Acceptance Criteria**:
  - `POST /api/messages/patient` returns `401` on missing/invalid token.
  - `POST /api/messages/patient` returns `201` with valid token and body, creating a message row with `senderPatientId` set and `senderId` null.
  - Dashboard plays double-chime alert and displays "Patient" badge in message logs for patient-sent messages.
  - Existing family-member messages continue to render with the sender's name.
- **Verify**:
  - `curl -X POST /api/messages/patient -H "X-Device-Token: <valid>" -H "Content-Type: application/json" -d '{"content":"Water please"}'` → 201.
  - `curl -X POST /api/messages/patient` (no token) → 401.
  - Open caregiver dashboard, verify patient message renders with "Patient" badge.

---

## Issue 3: Complete Relative Gaze Cursor Rendering in InteractionProvider (risk:high)

- **Goal**: Wire up the existing cursor physics code in `InteractionProvider` to render a visible, smoothly-steered floating cursor driven at 60fps.
- **Context**: `InteractionProvider.tsx` **already contains** `steerCursor()`, `pointInRect()`, cursor DOM refs (`cursorRef`, `dotRef`, `ringRef`), `recenterCursorRef`, and the `GAZE_CURSOR_SPEED` / `CURSOR_RING_*` constants. However, **no JSX renders the cursor**, and **no `requestAnimationFrame` loop drives it**. This issue completes the rendering half.
- **Relevant Files**:
  - [InteractionProvider.tsx](file:///Users/kaikameyama/repos/Glance/packages/shared/design/components/InteractionProvider.tsx) — existing file with cursor utilities at lines 31–66 and refs at lines 105–109.
- **Proposed Approach**:
  1. **Render the cursor portal** inside `InteractionProvider`'s JSX return. Use `ReactDOM.createPortal` to render a `<div>` (the cursor container) attached to `document.body` with `z-index: 9999`, `position: fixed`, `pointer-events: none`.
     - Inner structure: a 16px solid dot (`dotRef`) centered, and an SVG ring (`ringRef`) of 36px diameter for dwell progress visualization.
     - Attach `cursorRef` to the outer container.
  2. **Add a `requestAnimationFrame` loop** (as a `useEffect`) that runs only in gaze mode:
     - Maintain cursor position `{x, y}` in a **ref** (not state) to avoid re-renders.
     - Each frame: read `gazeDirectionRef.current`, call the existing `steerCursor()` to compute the next position, and apply it to `cursorRef.current.style.transform` directly.
     - If `recenterCursorRef.current` is `true`, reset position to viewport center and clear the flag.
     - Clean up with `cancelAnimationFrame` on unmount or mode switch.
  3. **Expose cursor position** via a ref (e.g., `cursorPosRef`) so Issue 4 can read it for intersection checks.
  4. **Gaze/Scan toggle**: Show the cursor container only when `mode === 'gaze'`; hide completely in scan mode (`display: none` or unmount the portal).
  5. **No diagonal support**: The cursor only moves in 4 cardinal directions + halt. This is intentional — `gazeDirection` from `useGazeTracker` only emits cardinals.
  6. **Active hover glow**: Add a CSS class or inline style swap on `dotRef` when `focusedTargetId` is non-null (bright green glow). This visual feedback is driven by Issue 4's intersection logic, but the style hook should be wired here.
- **Acceptance Criteria**:
  - A glowing dot + ring cursor is visible on the patient screen when in gaze mode.
  - Cursor moves smoothly at 480 px/s in the direction the patient looks.
  - Cursor halts immediately when direction returns to center.
  - Cursor clamps at viewport edges (never drifts offscreen).
  - Cursor recenters when registered targets change (screen transition).
  - Cursor is completely hidden in scan mode.
- **Verify**:
  - Unit test the existing `steerCursor()` function: given `(x=100, y=100)`, direction `'up'`, `dt=0.5`, verify `y = 100 - 240 = -140 → clamped to 0`.
  - Unit test clamping: cursor at `(0, 0)` with direction `'left'` stays at `(0, 0)`.
  - Manual: open patient app with camera active, verify cursor appears and tracks gaze direction.

---

## Issue 4: Bounding-Box Intersection & Dwell Replacement (risk:high)

- **Goal**: Replace the existing direction-mapped dwell model with bounding-box cursor intersection, so dwell progress is driven by the cursor overlapping a target's DOM rect.
- **Context**: The current gaze dwell logic (lines 185–249 of `InteractionProvider.tsx`) matches targets by their `gazeDirection` property (e.g., "the target assigned to `up` gets selected when the user looks up for 1.5s"). Phase 3 replaces this with a spatial model: the relative cursor moves across the screen, and dwell fires when the cursor **overlaps** a target's bounding box for `GAZE_DWELL_MS`. The existing `pointInRect()` helper (line 64) already supports this check.
- **Dependencies**: Issue 3 (cursor must be rendering and exposing its position ref).
- **Relevant Files**:
  - [InteractionProvider.tsx](file:///Users/kaikameyama/repos/Glance/packages/shared/design/components/InteractionProvider.tsx)
- **Proposed Approach**:
  1. **Remove the old direction-mapped dwell `useEffect`** (lines 185–249). This entire block is replaced by the new intersection logic.
  2. **Add intersection detection to the rAF loop** (created in Issue 3):
     - Each frame, after updating cursor position, iterate over `targetsRef.current`.
     - For each target, call `target.ref.current.getBoundingClientRect()` and check `pointInRect(cursorPos, rect)`.
     - If a hit is found: set `focusedTargetId` to that target's ID, accumulate dwell time. Feed the dwell progress fraction (0–1) to the `ringRef` SVG stroke (e.g., `stroke-dashoffset` based on `CURSOR_RING_CIRCUMFERENCE`).
     - If the cursor leaves the target: clear `focusedTargetId`, reset dwell progress to 0.
  3. **Dwell completion**: When dwell reaches `gazeDwellMs` (default 1500ms), call `target.onSelect()`, auto-center the cursor via `recenterCursorRef.current = true`, and reset dwell.
  4. **Scan mode unchanged**: The existing scan-mode logic (interval cycling + blink/spacebar selection) remains as-is. The `InteractiveTarget.gazeDirection` property becomes **optional/unused** in the new model — targets no longer need a directional assignment. Keep the property in the interface for backward compatibility but don't use it for intersection.
  5. **Expose `dwellProgress` via context**: Update the provider's context value to pass `dwellProgress` (already in state) so consuming components can render progress indicators if needed.
- **Acceptance Criteria**:
  - Moving the relative cursor onto any registered target changes its visual focus state (via `focusedTargetId`).
  - Holding the cursor on the target for 1.5s triggers `onSelect()`.
  - Moving the cursor off resets focus and dwell.
  - Cursor auto-centers after a successful selection.
  - Scan mode works exactly as before (no regression).
  - No cursor or intersection logic runs in scan mode.
- **Verify**:
  - Unit test `pointInRect()`: cursor `(50, 50)` inside rect `{left:0, top:0, right:100, bottom:100}` → `true`; cursor `(150, 50)` → `false`.
  - Integration test: mock two targets with known bounding boxes, simulate cursor movement into target 1, verify `focusedTargetId` updates, simulate dwell timeout, verify `onSelect` fires.
  - Manual: open patient app, steer cursor onto SOS button, verify dwell ring fills and triggers.

---

## Issue 5: Patient-Initiated Phrase Board UI

- **Goal**: Build the "Speak" button in the patient screen, the fullscreen phrase board grid overlay, local SpeechSynthesis vocalization, and API call integration.
- **Context**: The patient screen needs a "Speak" button that loads a grid of 6 requests. Selecting a phrase vocalizes it locally and notifies caregivers.
- **Dependencies**: Issues 2, 4.
- **Relevant Files**:
  - [PatientScreen.tsx](file:///Users/kaikameyama/repos/Glance/apps/patient/src/components/PatientScreen.tsx)
  - `apps/patient/src/components/PhraseBoard.tsx` (**NEW**)
- **Proposed Approach**:
  1. Add a **"Speak" button** in the bottom-left corner of the patient main view (opposite the SOS button in the bottom-right). Styled as a large circular button (min 80×80 px), registered as an interactive target in both gaze and scan modalities.
  2. When "Speak" is selected, transition UI into `PhraseBoard` fullscreen overlay mode. Add a `showPhraseBoard` state to `PatientScreen`.
  3. Render the `PhraseBoard` component as a fullscreen overlay (`position: fixed; inset: 0; z-index: 40`) showing a high-contrast grid containing the 6 phrase buttons:
     1. "Need assistance"
     2. "Water please"
     3. "In pain"
     4. "Too cold"
     5. "Too warm"
     6. "Thank you"
  4. Include a centered "Close" button to allow exiting back to the main message screen.
  5. All 7 buttons (6 phrases + Close) are registered as interactive targets so they work in both gaze cursor mode and scan mode.
  6. Opening and closing the board triggers cursor centering (the `targetsVersion` change in `InteractionProvider` handles this automatically when targets are registered/unregistered).
  7. **Selection dispatch** — selecting a phrase button:
     - Call Web Speech API `window.speechSynthesis.speak()` to speak the phrase text immediately (local TTS, zero-latency feedback).
     - POST the phrase to `/api/messages/patient` with the `X-Device-Token` header.
     - **Error handling**: If the POST fails (network error, 401, 500), log the error to the console but do **not** show an error to the patient (the local TTS already provided immediate feedback). The caregiver will not receive the notification — this is an acceptable degradation for a fixed-phrase vocalization.
     - Close the phrase board and return to main screen.
- **Acceptance Criteria**:
  - Speak button is visible, responsive to gaze/scan, and positioned in the bottom-left.
  - Fullscreen grid renders 6 readable phrase buttons + close button, all interactive-target registered.
  - Selecting a phrase vocalizes it via local SpeechSynthesis and posts to the server.
  - Selecting "Close" returns to the main screen without sending anything.
  - POST failure does not crash or block the UI.
- **Verify**:
  - In scan mode: press Spacebar to cycle to Speak, press Spacebar to open grid, cycle to "Water please", press Spacebar. Verify browser speaks "Water please" and a POST request is sent.
  - In gaze mode: steer cursor onto Speak button, dwell to select, steer onto a phrase, dwell to select. Verify same behavior.
  - Disconnect the dashboard server, select a phrase. Verify TTS still plays and the UI returns to the main screen without errors.

---

## Issue 6: Interactive Calibration Tool on Patient App

- **Goal**: Implement the calibration wizard on the patient client to measure open/closed eye aspect ratios, configure custom `EAR_THRESHOLD` values, visualize gaze baseline offsets, and persist configs to `localStorage`.
- **Context**: Users have different baseline eye openings and blink EAR ranges. The calibration tool allows setting a custom threshold to prevent missing blink actions.
- **Dependencies**: Issue 4.
- **Relevant Files**:
  - [PatientScreen.tsx](file:///Users/kaikameyama/repos/Glance/apps/patient/src/components/PatientScreen.tsx)
  - [useGazeTracker.ts](file:///Users/kaikameyama/repos/Glance/apps/patient/src/hooks/useGazeTracker.ts)
  - [gazeUtils.ts](file:///Users/kaikameyama/repos/Glance/apps/patient/src/utils/gazeUtils.ts) (exports `EAR_THRESHOLD` as a module-level constant)
  - `apps/patient/src/components/CalibrationScreen.tsx` (**NEW**)
- **Proposed Approach**:
  1. **Make `EAR_THRESHOLD` overridable**: The current `EAR_THRESHOLD` is a module-level constant in `gazeUtils.ts` imported directly in `useGazeTracker.ts` (line 10, used at line 170). To support calibration:
     - Add an `earThreshold` option to `useGazeTracker`'s options interface (optional, defaults to `EAR_THRESHOLD`).
     - In `PatientScreen.tsx`, add state `const [earThreshold, setEarThreshold] = useState<number | null>(null)` that reads from `localStorage.getItem('glance_ear_threshold')` on mount.
     - Pass `earThreshold ?? undefined` to `useGazeTracker`.
     - Store the override in a `useRef` inside `useGazeTracker` so the per-frame blink check (line 170) reads from the ref instead of the module constant.
  2. **Calibration button**: Add a caregiver-operated Calibration button in the `GazeTrackingPanel` (or a settings gear overlay). This button is **touch-operated only** (not registered as an interactive target) — it's a caregiver action, not patient-facing. This satisfies the **Zero Hands** hard constraint.
  3. **Render `CalibrationScreen`** which runs a 3-step wizard:
     - **Step 1: Open Eyes**: Large text prompt "Look straight ahead, eyes open." Runs a 3-second countdown timer with a visible progress bar. Collects all frame EAR values and averages them → `openEAR`.
     - **Step 2: Close Eyes**: Prompt "Close your eyes gently." Runs a 3-second countdown. Collects EAR values → `closedEAR`.
     - **Calculation**: `EAR_THRESHOLD = (openEAR + closedEAR) / 2`. Display the computed value visually with a bar chart showing openEAR, closedEAR, and the threshold line.
     - **Step 3: Gaze Drift Visualizer**: Renders a simple crosshair grid showing the live `gazeOffsetRef` coordinates as a moving dot in real time. Shows horizontal and vertical threshold lines. Includes two caregiver-operated buttons:
       - **"Recenter Gaze"** — calls `recenter()` to reset the neutral baseline.
       - **"Done"** — saves the threshold to `localStorage.setItem('glance_ear_threshold', value)` and exits the calibration screen, returning to the main patient view.
  4. **Exit safety (Hard Constraint: Zero Hands)**: The calibration screen includes a **persistent "Exit" touch button** in the top-right corner so a caregiver can abort at any step without lockup. The steps run autonomously with visible timers and auto-advance — no patient input is required during calibration.
  5. Modify `useGazeTracker.ts`:
     - Accept `earThreshold?: number` in options.
     - Store in a ref: `const earThresholdRef = useRef(earThreshold ?? EAR_THRESHOLD)` and update the ref when the prop changes.
     - Use `earThresholdRef.current` at line 170 instead of the imported `EAR_THRESHOLD`.
- **Acceptance Criteria**:
  - Calibration wizard displays clear timers, auto-advances through steps, and computes a threshold.
  - Calculated threshold is stored in `localStorage` under key `glance_ear_threshold`.
  - `useGazeTracker` reads and respects the custom threshold from the prop.
  - Caregiver can exit calibration at any step without the UI locking up.
  - Gaze drift visualizer shows live cursor movement and supports recenter.
  - **Camera lifecycle**: Calibration does not open any new camera tracks — it reuses the existing stream from `useCameraStream`.
- **Verify**:
  - Run the calibration wizard. Verify the 3-second timers display and advance automatically.
  - Check `localStorage.getItem('glance_ear_threshold')` in DevTools — should contain a numeric string.
  - Set a very low threshold (e.g., 0.10) manually in localStorage. Reload the patient app. Verify that blinks require a tighter/longer close to fire, confirming the override is active.
  - Click "Exit" during Step 1 — verify the UI returns to the patient main view without errors.
