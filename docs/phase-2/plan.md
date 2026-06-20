# Phase 2 — Plan (GitHub Issues)

This plan contains 7 self-contained, agent-ready issues to implement the interactive modalities and audio-visual core of Glance.

**Dependency order**: Issue 1 (schema) must land first. Issues 2, 6, and 7 can proceed after Issue 1. Issues 3 and 4 are deeply coupled — implement them together or sequentially (3 before 4). Issue 5 depends on Issues 3, 4, and the reply API from Issue 2's backend work.

```
1 (schema)
├── 2 (camera config API + ws routing)
├── 6 (TTS + tone classification)
│   └── 5 (YesNoMode) ← also needs 3 + 4
└── 7 (SOS mic)
3 (camera lifecycle + gaze classifier)
└── 4 (ScanMode + InteractionProvider)
    └── 5 (YesNoMode)
```

---

## Issue 1: Database Schema & Migration Setup
- **Goal**: Update the Drizzle ORM schema to support patient camera schedules, family member voice IDs, and message replies, and generate/apply the migration.
- **Context**: Glance currently has tables for `patients`, `family_members`, and `messages` but lacks fields for scheduling, ElevenLabs configuration, and message replies.
- **Relevant Files**:
  - [schema.ts](file:///Users/kaikameyama/repos/Glance/packages/shared/db/schema.ts)
- **Proposed Approach**:
  1. Add a `camera_override_active` (boolean) column to the `patients` table.
  2. Create a new `cameraSchedules` table with fields: `id` (uuid), `patientId` (uuid references patients), `dayOfWeek` (integer 0-6), `startTime` (text "HH:MM"), `endTime` (text "HH:MM"), `timezone` (text IANA string, default `'UTC'`), and `createdAt` (timestamp).
  3. Add `elevenlabsVoiceId` (text, nullable) to the `familyMembers` table.
  4. Add `toneClass` (text, default "neutral"), `reply` (text, nullable), and `repliedAt` (timestamp, nullable) to the `messages` table. Add a check constraint on `reply` to only allow `'yes'`, `'no'`, or `null`.
  5. Run `pnpm db:generate` in `packages/shared` to produce migrations, and verify that `pnpm db:migrate` applies them successfully.
- **Acceptance Criteria**:
  - Drizzle schema is successfully updated including the `timezone` field on `cameraSchedules`.
  - Migration script is generated and committed in `packages/shared/drizzle/migrations/`.
  - Database schema contains the new columns and table.
  - Build passes in the monorepo.
- **Verify**:
  - Run `pnpm --filter @glance/shared db:generate` followed by `pnpm --filter @glance/shared db:migrate`.
  - Verify that types in `@glance/shared/db` export the updated types including `timezone` on `CameraSchedule`.

---

## Issue 2: CameraWindow Schedule Configuration, Sync & WebSocket Routing
- **Goal**: Implement APIs and UI elements for the caregiver dashboard to set, retrieve, and update the patient's camera schedules and override state; add targeted WebSocket routing to the ws-server so events reach only the intended recipient.
- **Context**: The family member dashboard must allow caregivers to define when the patient's camera is active and sync configuration changes to the patient device via WebSockets. Currently the ws-server broadcasts all events to all connected clients — this must be replaced with identity-based routing before any patient-specific events are used.
- **Dependencies**: Issue 1.
- **Relevant Files**:
  - [page.tsx](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/page.tsx)
  - [types.ts](file:///Users/kaikameyama/repos/Glance/packages/shared/ws/types.ts)
  - [index.ts](file:///Users/kaikameyama/repos/Glance/apps/ws-server/src/index.ts)
- **Proposed Approach**:
  1. **ws-server identity routing**: On WebSocket connect, each client sends a `REGISTER` message: `{ type: 'REGISTER', role: 'patient', patientId }` or `{ type: 'REGISTER', role: 'caregiver', familyMemberId }`. The ws-server maintains an in-memory map (`patientId → Set<WebSocket>`, `familyMemberId → Set<WebSocket>`). Update the `/emit` route to accept a `targetPatientId` or `targetFamilyMemberId` field and route only to matching connections.
  2. Add the `CAMERA_CONFIG_UPDATE` type to `packages/shared/ws/types.ts`, including `timezone` in the `CameraSchedule` type.
  3. Create a Next.js API route `GET/POST /api/patients/[id]/camera-config` in `apps/dashboard` to fetch and update `camera_override_active` and the `camera_schedules` records. Include a timezone selector in the UI so caregivers can specify the patient's local timezone when creating schedules.
  4. When the dashboard API updates the schedules or override, POST a `CAMERA_CONFIG_UPDATE` event to the ws-server `/emit` route with `targetPatientId` set.
  5. Build a settings panel/modal in `apps/dashboard` for managing the schedule.
- **Acceptance Criteria**:
  - Caregiver can toggle the camera override and edit weekly schedules, including setting the patient's timezone.
  - Setting changes are persisted in the database with the `timezone` field populated.
  - WebSocket broadcast of `CAMERA_CONFIG_UPDATE` reaches only the relevant patient connection, not all clients.
- **Verify**:
  - Connect two patient WebSocket clients with different `patientId`s. Send a `CAMERA_CONFIG_UPDATE` for one. Verify only the correct client receives it.
  - Write an integration test for `POST /api/patients/[id]/camera-config` verifying it updates records and calls the WebSocket emitter with `targetPatientId`.

---

## Issue 3: Camera Lifecycle & GazeCursor Directional Classifier (risk:high)
- **Goal**: Build the webcam integration and eye direction classifier on the patient app, adhering strictly to the active schedule and ensuring the camera is turned off when inactive.
- **Context**: GazeCursor is the primary hands-free input. To protect privacy, the webcam MUST be deactivated when the camera window is inactive. Schedules are stored with an IANA timezone and must be evaluated correctly against the patient device's clock. Issue 4 (ScanMode + InteractionProvider) depends on this issue's gaze output — implement sequentially.
- **Dependencies**: Issue 1. Pairs with Issue 4.
- **Relevant Files**:
  - [PatientScreen.tsx](file:///Users/kaikameyama/repos/Glance/apps/patient/src/components/PatientScreen.tsx)
  - New hooks/components: `useGazeTracker.ts`, `CameraManager.tsx`
- **Proposed Approach**:
  1. Write a scheduling helper `isCameraActive(schedules, override, now)` that converts `now` to each schedule's stored IANA timezone before comparing against `startTime`/`endTime`. Export `EAR_THRESHOLD = 0.20` and `GAZE_DWELL_MS = 1500` as tunable constants.
  2. Create a camera hook that requests webcam access (`navigator.mediaDevices.getUserMedia({ video: true })`) only when `isCameraActive` is true.
  3. **Hard Constraint**: Ensure every exit path (schedule end, manual override toggle off, component unmount, error) invokes `track.stop()` on all video tracks.
  4. Dynamically load `@mediapipe/tasks-vision`. While loading, expose `modelReady: false` so the `InteractionProvider` can remain in ScanMode. Once ready and a face is detected, set `modelReady: true`.
  5. Calculate Gaze Direction by comparing the relative horizontal/vertical coordinates of the iris center to the eye corners. Smooth over a 20-frame rolling window. Output states: `up`, `down`, `left`, `right`, `center`.
  6. When no face is detected for > 5 seconds, emit a `faceLost` event so the `InteractionProvider` falls back to ScanMode. Continuously check for face presence; emit `faceFound` when a face is re-detected so the system re-enters GazeCursor Mode automatically.
- **Acceptance Criteria**:
  - Gaze direction classifier correctly identifies looking direction.
  - Video tracks are strictly stopped when the schedule indicates the window is closed.
  - `isCameraActive` correctly handles DST transitions using the IANA timezone.
  - `faceLost` / `faceFound` events drive ScanMode fallback and GazeCursor re-entry.
- **Verify**:
  - Mock MediaStream tracks and test that `track.stop()` is called when schedule changes to inactive.
  - Unit test `isCameraActive` at a DST boundary (e.g., `America/New_York` spring-forward) to confirm no missed window.
  - Verify that visual logs confirm gaze state transitions when simulated eye coordinates shift.

---

## Issue 4: ScanMode & Shared Interaction Focus Manager (risk:high)
- **Goal**: Implement ScanMode auto-highlighting, blink detection, and the unified `<InteractionProvider>` to emit selection events.
- **Context**: When the camera is off, face detection fails, or the MediaPipe model is still loading, the UI must automatically fall back to ScanMode. Blinking triggers selection. This issue depends on the `faceLost`/`faceFound` events and gaze classifier output from Issue 3.
- **Dependencies**: Issue 3.
- **Relevant Files**:
  - [PatientScreen.tsx](file:///Users/kaikameyama/repos/Glance/apps/patient/src/components/PatientScreen.tsx)
  - New hooks/components: `useScanMode.ts`, `InteractionProvider.tsx`
- **Proposed Approach**:
  1. Create `<InteractionProvider>` storing a list of registered interactive targets (buttons, zones). Expose the current mode (`'gaze' | 'scan'`) as context.
  2. Switch to ScanMode when: (a) outside a `CameraWindow`, (b) camera permission denied, (c) MediaPipe model not yet ready (`modelReady === false`), or (d) `faceLost` event received. Re-enter GazeCursor Mode on `faceFound`.
  3. Map Gaze Direction to target bounds: if a target matches the look direction (e.g. Look UP → YES zone) and gaze dwells for `GAZE_DWELL_MS`, emit `SelectEvent`.
  4. Implement `ScanMode` which cycles the active index of registered targets on a `SCAN_CYCLE_MS` interval.
  5. Compute blink detection via Eye Aspect Ratio (EAR) using the exported `EAR_THRESHOLD` constant from Issue 3. If EAR is below threshold for ≥ 2 frames, trigger `SelectEvent` on the highlighted target. Document that `EAR_THRESHOLD` may need per-deployment adjustment.
  6. Add a keyboard spacebar and click listener as a secondary/testing switch to trigger selection on the highlighted target.
- **Acceptance Criteria**:
  - System automatically switches to ScanMode if model is loading, no face is detected, or camera is off.
  - System re-enters GazeCursor Mode automatically when a face is re-detected.
  - ScanMode cycles focus outline correctly.
  - Blink or spacebar press triggers `SelectEvent` on the active target.
- **Verify**:
  - Use `browser-verify` tool to simulate Spacebar presses and verify it triggers click events on highlighted buttons.
  - Simulate `faceLost` then `faceFound` and verify mode transitions without manual intervention.

---

## Issue 5: YesNoMode Screen & Binary Question Response Flow (risk:high)
- **Goal**: Implement the binary question patient UI and integrate the reply persistence and dashboard notification.
- **Context**: When a message is flagged as a Yes/No question, the patient must see a simple two-button display ("YES" / "NO") and be able to reply using only gaze or scan-blink. The patient client authenticates API calls using `X-Device-Token` header, never a query parameter.
- **Dependencies**: Issues 2 (reply API + ws routing), 3 (gaze), 4 (InteractionProvider).
- **Relevant Files**:
  - [PatientScreen.tsx](file:///Users/kaikameyama/repos/Glance/apps/patient/src/components/PatientScreen.tsx)
  - [page.tsx](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/page.tsx)
  - New component: `YesNoScreen.tsx`
- **Proposed Approach**:
  1. In `apps/dashboard`, add an "Ask Yes/No Question" checkbox to the message composer.
  2. Create a Next.js API route `POST /api/messages/[id]/reply` on the dashboard. It must: read `X-Device-Token` from request headers, look up the patient by device token, confirm the patient is the intended recipient of the message, persist the reply, and POST a `NEW_REPLY` event to the ws-server with `targetFamilyMemberId` set to the message sender.
  3. In `apps/patient`, when a message with `isYesNo: true` is received, render the `YesNoScreen` instead of the standard screen.
  4. The `YesNoScreen` registers two large targets: "YES" (top) and "NO" (bottom).
  5. Wire targets to the interaction manager: Gaze UP (or scanning YES target + blink) triggers YES; Gaze DOWN (or scanning NO target + blink) triggers NO.
  6. Upon selection, POST the reply to `POST /api/messages/[id]/reply` with `X-Device-Token` header and exit YesNoMode.
- **Acceptance Criteria**:
  - Patient is presented with giant YES/NO options for binary questions.
  - `POST /api/messages/[id]/reply` returns `401` if `X-Device-Token` is missing or invalid.
  - Selection successfully posts the response and displays it in real-time on the caregiver dashboard.
- **Verify**:
  - Send a Yes/No question from dashboard, verify patient screen changes layout. Select YES (via spacebar in ScanMode) and check that dashboard history updates to show the reply.
  - Send the same request without `X-Device-Token` and verify `401` is returned.

---

## Issue 6: Audio Unlock, Voice Profile Settings, Tone Classification, and ElevenLabs TTS
- **Goal**: Implement the caregiver-operated session start screen (audio unlock), dashboard voice profile configurations, LLM-based message tone classification, and dynamic server-side ElevenLabs TTS streaming.
- **Context**: Browser autoplay policy blocks `AudioContext` and `<audio>` autoplay without a prior user gesture. Since the patient is motor-impaired, a caregiver-operated "Start Session" screen on first load provides the required gesture. The `/api/tts` endpoint authenticates patient requests via `X-Device-Token` header.
- **Dependencies**: Issue 1.
- **Relevant Files**:
  - [page.tsx](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/page.tsx)
  - [schema.ts](file:///Users/kaikameyama/repos/Glance/packages/shared/db/schema.ts)
  - [PatientScreen.tsx](file:///Users/kaikameyama/repos/Glance/apps/patient/src/components/PatientScreen.tsx)
- **Proposed Approach**:
  1. **Audio unlock screen**: On first load of the patient app (before any message display), render a full-screen "Start Session" button. On tap/click, create an `AudioContext`, call `.resume()`, and transition to the main patient UI. The `AudioContext` instance is passed into the app via context. No messages may be displayed until this step is complete.
  2. Add a Profile settings field in the dashboard to let family members save their ElevenLabs `voice_id`.
  3. In `POST /api/messages`, run a prompt against an LLM (OpenAI/Gemini via Vercel AI SDK) to classify the message content into `neutral`, `warm`, or `urgent`. Save to `toneClass`.
  4. Create `GET /api/tts?messageId=<uuid>` on the dashboard. Read `X-Device-Token` from request headers, look up the patient, confirm the patient is the intended recipient of the message, then proxy to ElevenLabs `/v1/text-to-speech/{voice_id}/stream` with style parameters based on `toneClass`.
  5. In the patient app, automatically play incoming message audio using an `<audio>` tag src pointing to the TTS endpoint, passing the device token as `X-Device-Token`. Implement native browser Web Speech API fallback if the endpoint returns an error or `voice_id` is not set.
- **Acceptance Criteria**:
  - Patient app does not display messages until the "Start Session" gesture is completed.
  - Messages have a tone classified and stored in the database.
  - `GET /api/tts` returns `401` if `X-Device-Token` is missing or mismatched.
  - Client plays synthesized audio on message receipt, falling back gracefully to native TTS if voice_id or API credentials are missing.
- **Verify**:
  - Call `GET /api/tts?messageId=<uuid>` with a valid `X-Device-Token` and verify `audio/mpeg` header and non-empty audio buffer.
  - Call without `X-Device-Token` and verify `401`.
  - Verify that on patient app load, the message list does not render until the "Start Session" button is tapped.

---

## Issue 7: SOS Vocalization Listener & Dashboard Integration (risk:high)
- **Goal**: Upgrade the patient Web Audio listener to use the real microphone stream and trigger real-time alarm notifications on the family dashboard.
- **Context**: The SOS alarm must be triggerable by vocalization alone and remain active without the camera. The `POST /api/patients/[id]/sos` endpoint must authenticate via `X-Device-Token` and route the ws-server broadcast only to caregivers linked to that patient.
- **Dependencies**: Issue 1, Issue 2 (ws routing).
- **Relevant Files**:
  - [PatientScreen.tsx](file:///Users/kaikameyama/repos/Glance/apps/patient/src/components/PatientScreen.tsx)
  - [page.tsx](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/page.tsx)
- **Proposed Approach**:
  1. Update `startAudioListener` in the patient client to call `navigator.mediaDevices.getUserMedia({ audio: true })`. Use the `AudioContext` instance created during the "Start Session" step (from Issue 6) — do not create a second context.
  2. Implement an `AnalyserNode` to monitor microphone signal amplitude. If average amplitude exceeds `SOS_THRESHOLD` (exported constant, default: `0.15`) for 1.5s continuously, trigger SOS.
  3. Create `POST /api/patients/[id]/sos` on the dashboard. Read `X-Device-Token`, validate the patient, log the event, then POST a `SOS_TRIGGERED` event to the ws-server `/emit` with `targetPatientId` set (the ws-server will route to all caregivers linked to that patient via its connection map).
  4. On the patient client, play an immediate local warning sound using the unlocked `AudioContext`.
  5. On the dashboard client, listen for `SOS_TRIGGERED` WebSocket events and play an audible alarm and show a prominent alert modal.
- **Acceptance Criteria**:
  - Vocalization above the threshold triggers the alarm.
  - Dwell/blink selection of the physical SOS button also triggers the alarm.
  - `POST /api/patients/[id]/sos` returns `401` on missing or invalid `X-Device-Token`.
  - Alarm notification reaches only caregivers linked to the patient — not other patients or unrelated caregivers.
  - Alarm triggers a red visual takeover and sound on the family dashboard.
- **Verify**:
  - Trigger SOS manually by clicking the button or simulating high amplitude, and verify that the dashboard sounds the alarm.
  - Connect an unrelated caregiver WebSocket and verify they do not receive the `SOS_TRIGGERED` event.
