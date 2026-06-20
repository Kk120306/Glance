# Phase 3 — Advanced Interactive Controls & Proactive Communication Spec

## What

Phase 3 introduces advanced interactive controls, proactive patient communication, and caregiver-driven calibration tools to Glance. This includes:
1. **Joystick-Steered Relative Gaze Cursor**: Resolves eye strain by converting discrete gaze look directions into a continuous joystick-like steering mechanic for a glowing visual cursor with a center-halt capability and visual dwell progress.
2. **Patient-Initiated Fixed Phrase Board**: Empowers patients to proactively send essential requests (e.g. "Water please", "In pain") using only gaze/scan. These requests play audio locally (TTS), are logged in the database, and trigger visual/audible dashboard notifications for caregivers in real time.
3. **Interactive Calibration & Tuning Tool**: A caregiver-driven calibration panel running directly on the patient device to measure and tune the patient's Eye Aspect Ratio (EAR) blink threshold and gaze activation parameters, saving settings to persistent local storage.

---

## Requirements

### 1. Joystick-Steered Relative Gaze Cursor
- **Steering Control**:
  - The cursor (a glowing dot) is rendered inside the viewport at a high z-index (`9999`) using a React Portal.
  - Starting Position: Center of the screen (`window.innerWidth / 2`, `window.innerHeight / 2`).
  - Gaze mapping behaves like a joystick:
    - `up`: Moves cursor up (decrements Y).
    - `down`: Moves cursor down (increments Y).
    - `left`: Moves cursor left (decrements X).
    - `right`: Moves cursor right (increments X).
    - `center`: Halts cursor movement (holds current position).
  - Steering Speed: Default to `480` pixels per second (smooth, configurable).
  - Bounds Clamping: Cursor coordinates are strictly clamped to `[0, window.innerWidth]` and `[0, window.innerHeight]`.
  - Recenter trigger: Cursor automatically resets to the center of the viewport whenever the active screen changes (e.g., entering or exiting the YesNo screen, opening or closing the phrase board).
- **Performance**:
  - Cursor position updates must run at 60fps in a `requestAnimationFrame` loop, modifying the DOM node's inline styles directly to avoid React re-render overhead.
- **Visual Design**:
  - Central solid dot: 16px diameter.
  - Outer progress ring: 36px diameter.
  - Outer ring fills up (0% to 100%) dynamically to reflect the current target dwell progress.
  - Active hover glow: The cursor color changes (e.g., bright green glow) when hovering over any interactive target.
- **Target Focus & Dwell**:
  - The `InteractionProvider` computes bounding box intersection checks using `getBoundingClientRect()` of all registered interactive targets.
  - If the cursor enters a target's bounding box, that target is marked as **focused** (sets `focusedTargetId`).
  - Dwell progress accumulates while the cursor remains inside the focused target's bounding box.
  - If the dwell reaches `GAZE_DWELL_MS` (default 1500ms), a `SelectEvent` is triggered, executing the target's `onSelect` handler, and the cursor immediately auto-centers.
  - Moving the cursor out of the target clears the focus and resets the dwell progress.
- **Modality Integration**:
  - Gaze Mode: Relative cursor is visible and joystick steering is active.
  - Scan Mode: Relative cursor is completely hidden. The system automatically cycles the visual highlight on interactive targets, selecting on blink/Spacebar as before.

### 2. Patient-Initiated Fixed Phrase Board
- **Speak Button**:
  - A permanent "Speak" or "Phrases" button is added to the patient UI in the bottom-left corner (opposite to the SOS button in the bottom-right).
  - Styled to match the design system, min size 80×80 px, registered as an interactive target in both gaze and scan modalities.
- **Phrase Grid View**:
  - Selecting "Speak" toggles a fullscreen overlay containing a grid of 6 fixed phrase buttons:
    1. "Need assistance"
    2. "Water please"
    3. "In pain"
    4. "Too cold"
    5. "Too warm"
    6. "Thank you"
  - A large "Close" button is placed at the center or bottom of the grid to allow exiting back to the main message screen.
  - When the grid opens, the relative cursor automatically resets to the center.
- **Selection Dispatch**:
  - Selecting any phrase button triggers a `SelectEvent`.
  - **Local TTS**: The patient client immediately vocalizes the phrase using the Web Speech API (`speechSynthesis`) so any nearby caregivers can hear it.
  - **Database Persistence**: The patient client sends a `POST /api/messages/patient` call carrying the message content and authenticated via `X-Device-Token`.
  - **WebSocket Broadcast**: The dashboard API persists the message in the DB (setting `senderPatientId`) and broadcasts a `NEW_MESSAGE` socket message to all caregiver connections linked to the patient.
  - **Caregiver Alert**: The caregiver dashboard plays an alert sound (e.g., discrete double-chime) and shows a prominent, dismissible desktop notification or toast showing the patient's request.

### 3. Interactive Calibration & Tuning Tool
- **Accessing Calibration**:
  - **Auto-runs once on every startup**: when a session is activated and a camera stream becomes available, the calibration wizard launches automatically (once per page load). It is also re-launchable on demand from the gaze panel's "Calibrate" button.
  - **No required human input**: the entire flow is autonomous — it waits for a face, samples, computes, recenters, saves, and closes itself. The only control is an optional "Skip" button, kept purely as a no-lockup safety valve; the flow never depends on it. If no face is detected within a timeout, it skips automatically so startup is never blocked.
- **Calibration Steps**:
  - **Step 1: Eyes Open Baseline**: Prompts the caregiver to have the patient look normally at the screen for 3 seconds. The system records raw Eye Aspect Ratio (EAR) values and averages them to establish `openEAR`.
  - **Step 2: Eyes Closed Baseline**: Prompts the caregiver to have the patient close their eyes for 3 seconds. The system records EAR values and averages them to establish `closedEAR`.
  - **Calculation**:
    - `EAR_THRESHOLD` is computed as `(openEAR + closedEAR) / 2`.
    - Recommended threshold is presented visually.
  - **Step 3: Gaze Drift Visualizer**:
    - Displays a live baseline-relative dot grid, showing where the raw gaze offset is currently mapped relative to the activation thresholds.
    - **Auto-recenters** the neutral baseline (`recenter()`) on entry to offset any head-pose shift, then auto-advances to save — no caregiver click needed.
  - **Auto-advance**: all steps progress on visible timers (wait-for-face → 3s open → 3s closed → result display → drift/recenter → save+close). The computed threshold is only persisted when the reading is sane (`openEAR > closedEAR`); otherwise the wizard closes without overwriting the previous value.
- **Persistence**:
  - Calibration settings (`EAR_THRESHOLD`) are saved to `localStorage` on the patient device.
  - The patient application checks `localStorage` at startup; if present, it overrides the default `EAR_THRESHOLD` constant.

---

## Design

### Database Schema Updates

We modify `packages/shared/db/schema.ts` to allow patients to be the senders of messages:

```ts
// packages/shared/db/schema.ts
import { pgTable, uuid, text, boolean, timestamp, integer, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id').references(() => familyMembers.id), // Nullable
    senderPatientId: uuid('sender_patient_id').references(() => patients.id), // New: links to patient
    recipientId: uuid('recipient_id').notNull().references(() => patients.id),
    content: text('content').notNull(),
    isYesNo: boolean('is_yes_no').notNull().default(false),
    isRead: boolean('is_read').notNull().default(false),
    toneClass: text('tone_class').notNull().default('neutral'),
    reply: text('reply'),
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('content_length', sql`char_length(${table.content}) BETWEEN 1 AND 1000`),
    check('valid_reply', sql`${table.reply} IN ('yes', 'no') OR ${table.reply} IS NULL`),
    // Invariant: exactly one sender (family member OR patient) must be populated
    check('valid_sender', sql`(${table.senderId} IS NOT NULL AND ${table.senderPatientId} IS NULL) OR (${table.senderId} IS NULL AND ${table.senderPatientId} IS NOT NULL)`),
  ],
)
```

### Real-Time Event Flow

We introduce a new real-time socket payload type when a patient initiates a message:

```ts
// packages/shared/ws/types.ts
export type ServerToClientMessage =
  | { type: 'NEW_MESSAGE'; payload: Message }
  | { type: 'MESSAGE_READ'; payload: { id: string } }
  | { type: 'CAMERA_CONFIG_UPDATE'; payload: { cameraOverrideActive: boolean; schedules: CameraSchedule[] } }
  | { type: 'SOS_TRIGGERED'; payload: { patientId: string; timestamp: string } }
  | { type: 'NEW_REPLY'; payload: { messageId: string; reply: 'yes' | 'no'; repliedAt: string } }
```

When a patient posts a phrase:
1. Patient client sends `POST /api/messages/patient` with `{ content: 'Water please' }` and header `X-Device-Token`.
2. Dashboard API verifies token, inserts message with `senderPatientId: patient.id` and `recipientId: patient.id`.
3. Dashboard API posts to ws-server `/emit` with `targetFamilyMemberId` (to notify linked caregivers).
4. Caregiver dashboard hears `NEW_MESSAGE` with `senderPatientId` set, plays alert chime, and displays the patient-initiated message at the top of the history.

---

## Decisions

**Decision #1 — Unified Message Table for Patient-Initiated Phrases**
- **Choice**: Keep all patient-sent phrases in the `messages` table by making `senderId` nullable and introducing `senderPatientId`.
- **Why**: Keeps message history queries single-table, simple, and clean. No need to join or merge separate logs for family-to-patient vs patient-to-family messages.
- **Reversibility**: High.

**Decision #2 — Web Speech API for Local Patient-Side Playback**
- **Choice**: Use the browser's local SpeechSynthesis API directly on the patient client for phrase vocalization.
- **Why**: Zero network lag (instant feedback to the patient and nearby caregiver), offline capability, and free (no ElevenLabs character cost). ElevenLabs remains dedicated to cloning the family members' voices for incoming messages.
- **Reversibility**: High.

**Decision #3 — Local Storage Calibration Persistence**
- **Choice**: Persist the customized `EAR_THRESHOLD` to the patient browser's `localStorage`.
- **Why**: Avoids database schema and network bloat for local hardware tuning properties. Calibration is specific to the particular webcam, device distance, and lighting environment.
- **Reversibility**: High.

---

## Invariants

- **SOS Independence**: The background Web Audio SOS vocalization listener must run independently of whether the cursor is in steering mode, centering mode, or if the caregiver is running a calibration sweep.
- **Zero Hands**: Calibration pages must be caregiver-facing but once started must execute autonomously (using clear timers/visual cues) or be closeable/controllable without lockups.
- **Clamped Boundaries**: The cursor coordinates must never drift beyond the patient viewport bounds.

---

## Testing Strategy

- **Unit Tests** (automated, run via `pnpm test`):
  - Cursor movement equations — `steerCursor()`: given `(x, y)` and direction `up` over `dt`, Y is decremented by `480 * dt` and clamped to 0; `left` at the edge stays at 0. (`apps/patient/__tests__/gazeCursorPhysics.test.ts`)
  - Target intersection — `pointInRect()`: a point inside a simulated rectangle returns true, outside returns false. (same file)
  - End-to-end cursor contract: steer onto a target, halt at center, dwell-fire, recenter, and "sail-through under continuous steering does not fire". (same file)
  - Calibration math + persistence — `computeEarThreshold()` midpoint, `isValidEarThreshold()` range checks, and `loadStoredEarThreshold()` / `saveEarThreshold()` localStorage round-trip. (`apps/patient/__tests__/calibration.test.ts`)
  - Cursor smoothing realism (`gazeCursorSimulation.test.ts`) and gaze classification (`gazeUtils.test.ts`).
- **Type-level / schema checks**:
  - The `valid_sender` XOR constraint is enforced in `schema.ts` and the generated migration `0002_thin_madame_web.sql`. The DB-level "both senders populated throws" check requires a live Postgres and is exercised by applying the migration (`pnpm db:migrate`), not by the unit suite.
- **Integration / Manual Verification** (require a running stack or DB):
  - `POST /api/messages/patient`: `401` on missing/invalid `X-Device-Token`; `201` with a valid token, creating a row with `senderPatientId` set and `senderId` null. (Verified by curl against a running dashboard; the dashboard app has no in-repo test runner.)
  - Patient client: the relative cursor appears when the camera is active; look right to steer onto the SOS or Speak buttons, then center to halt; dwell ring fills and fires; the cursor recenters on each screen change (YesNo, phrase board open/close).
  - Phrase board: selecting a phrase vocalizes it via local `speechSynthesis` and POSTs to the server; the caregiver dashboard chimes (double-chime), shows a dismissible toast, and renders the message with a "Patient" badge.
  - EAR calibration: run the wizard, confirm the 3-second timers auto-advance, the computed threshold is saved under `localStorage['glance_ear_threshold']`, and the override takes effect on reload.

## Implementation Notes & Deviations

- **Cursor rendering**: the steered cursor is rendered as a `position: fixed; z-index: 9999; pointer-events: none` element inside the `InteractionProvider` tree rather than via `ReactDOM.createPortal(document.body)`. The two are functionally equivalent here (fixed positioning escapes layout flow); the inline approach avoids an SSR portal guard. Position and the dwell ring are written imperatively in the rAF loop (no React re-render per frame).
- **Recenter trigger**: implemented via a `targetsVersion` counter bumped on every target register/unregister; a flag is consumed on the next rAF frame to recenter the cursor and clear focus/dwell. This realizes the spec's "recenter when the active screen changes" alongside the post-selection recenter.
- **Patient-message WebSocket fan-out**: with no family↔patient join table, the new-message broadcast reuses the SOS pattern — emit `NEW_MESSAGE` to each caregiver (`targetFamilyMemberId`) who has previously messaged the patient. No ws-server routing change was needed.
- **TTS for patient messages**: `GET /api/tts` returns `503` for a message with no `senderId` (patient-initiated). Patient phrases are vocalized locally via the Web Speech API (Decision #2), never through ElevenLabs.
