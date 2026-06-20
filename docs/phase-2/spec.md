# Phase 2 — Interactive Modalities & Audio-Visual Core

## What

Implement the hands-free patient interaction system and audio-visual features of Glance. This includes the dual-input modality (**GazeCursor** direction-tracking and **ScanMode** auto-cycle with blink-detection fallback), **CameraWindow** schedule integration to govern the camera lifecycle, binary **YesNoMode** receive state, ElevenLabs-backed **Voice Cloning & TTS** with LLM-classified **ToneClass**, and the upgrade of the **SOSEvent** listener to use real microphone input.

## Context

Phase 1 established the monorepo, database schema, Better Auth, and basic WebSocket message delivery. Currently, the patient client displays messages statically and is not hands-free. Phase 2 fulfills the product promise of Glance as a hands-free AAC platform by enabling patients to reply to family members and trigger distress signals using only gaze, blink, or vocalization, while preserving security, privacy, and system independence.

Relevant file references:
- Patient Screen: [PatientScreen.tsx](file:///Users/kaikameyama/repos/Glance/apps/patient/src/components/PatientScreen.tsx)
- Database Schema: [schema.ts](file:///Users/kaikameyama/repos/Glance/packages/shared/db/schema.ts)
- Dashboard Home: [page.tsx](file:///Users/kaikameyama/repos/Glance/apps/dashboard/src/app/page.tsx)
- Standalone Socket Server: [index.ts](file:///Users/kaikameyama/repos/Glance/apps/ws-server/src/index.ts)

---

## Requirements

### 1. CameraWindow Schedule & Lifecycle
- **Caregiver UI**: Family members can configure a daily/weekly schedule (e.g., Mon–Fri 09:00–17:00) or toggle a manual camera override from the family dashboard.
- **Strict Camera Control**: The patient-side client may only query and activate the camera (video track) when within an active `CameraWindow` (or if manual override is enabled).
- **Paired Stop Call (Hard Constraint: Camera Lifecycle)**: Whenever the camera is deactivated (due to exiting a window, manual toggle off, component unmounting, page navigation, or error), `track.stop()` must be called on every active video track of the `MediaStream`.

### 2. Hands-Free Patient Input Modalities (Hard Constraint: Zero Hands)
- **GazeCursor Mode (Primary)**:
  - Uses the webcam to capture video frames inside an active `CameraWindow`.
  - Integrates MediaPipe Face Landmarker to extract iris landmarks and eye corner landmarks.
  - Classifies gaze direction into one of five states: `up`, `down`, `left`, `right`, or `center` (iris offset relative to eye corners).
  - Gaze-dwell interaction: Looking at a UI target (like YES, NO, or SOS) continuously for `GAZE_DWELL_MS` (default: 1500ms) triggers a `SelectEvent` on that target.
  - **MediaPipe loading state**: While the `@mediapipe/tasks-vision` bundle is loading (~15–30MB), the system treats the camera as unavailable and operates in ScanMode. Once the model is ready and a face is detected, it transitions to GazeCursor Mode automatically.
  - **Face re-detection re-entry**: If ScanMode fallback is active due to no face detected (> 5s), the system continuously checks for face presence. As soon as a face is detected again, it automatically exits ScanMode and re-enters GazeCursor Mode without requiring any caregiver action.
- **ScanMode (Fallback)**:
  - Automatically active when: (a) outside a `CameraWindow`, (b) camera permission is denied, (c) the MediaPipe model has not finished loading, or (d) no face is detected in the camera frame for > 5 seconds.
  - The UI cycles a visual focus highlight through all available interactive targets sequentially on a timer `SCAN_CYCLE_MS` (default: 1500ms).
  - Selection is triggered by a **blink** (Eye Aspect Ratio / EAR below threshold for ≥ 2 frames) or a keyboard helper switch (e.g., Spacebar/Click, useful for automated testing and fallback).
- **SelectEvent**: The unified event emitted upon any successful dwell or blink/switch confirmation. The UI components must only listen for this event and remain agnostic to the modality that triggered it.

### 3. YesNoMode Receive State
- **Binary Question Flag**: Composing a message from the dashboard includes a checkbox to flag it as `isYesNo: true`.
- **Fullscreen YesNo Screen**: When the patient client receives a Yes/No message, it transitions to `YesNoMode` displaying:
  - The question content centered.
  - A giant green "YES" target at the top of the screen (Look UP / Highlighted Scan).
  - A giant red "NO" target at the bottom of the screen (Look DOWN / Highlighted Scan).
- **Reply Dispatch**:
  - Selecting YES or NO emits a `SelectEvent`.
  - The client POSTs the reply to `POST /api/messages/[id]/reply` using the `X-Device-Token` header for authentication.
  - The dashboard persists the response, updates the message state, and emits a socket message.
  - The YesNo screen exits, returning to waiting state.

### 4. Voice Cloning & TTS (ElevenLabs)
- **Audio Unlock**: On initial load, the patient app must display a caregiver-operated "Start Session" screen (a single full-screen tap target) that, when activated, creates and resumes an `AudioContext`. This one-time gesture permanently unlocks audio playback for the entire session, allowing subsequent TTS and SOS beeps to play without further gestures. This screen must not be skippable and must precede any message display.
- **Voice Configuration**: Caregivers can save an ElevenLabs `voice_id` under their account settings on the family dashboard.
- **ToneClass Classification**:
  - On message composition, the dashboard backend classifies the text content into a `ToneClass` (`neutral`, `warm`, or `urgent`) via LLM API (OpenAI/Gemini).
  - The `tone_class` is persisted on the message.
- **Audio Synthesis API**:
  - A dashboard endpoint `GET /api/tts?messageId=<uuid>` verifies the request by requiring an `X-Device-Token` header containing the patient's device token. The token is looked up in the database to confirm the patient is the intended recipient of the message before proxying to ElevenLabs.
  - Returns the audio stream.
- **Patient Playback (Hard Constraint: Receiving is Always On)**:
  - Incoming messages play automatically using the synthesized audio.
  - Playback must work camera-independently (even outside `CameraWindow` or when webcam is denied).

### 5. SOS Vocalization & Dwell Trigger (Hard Constraint: SOS Independence)
- **Microphone listener**: Web Audio API `AudioContext` and `AnalyserNode` process input from the microphone (`getUserMedia({ audio: true })`).
- **Sustained Vocalization**: If microphone amplitude exceeds `SOS_THRESHOLD` (default: 0.15) continuously for ≥ 1.5 seconds, trigger `SOSEvent`.
- **Secondary Path**: Gaze-dwelling or scan-blink selecting the permanent, fixed SOS button in the bottom corner of the patient UI also triggers `SOSEvent`.
- **Alert Dispatch**:
  - `SOSEvent` immediately sounds a local alarm beep on the patient client.
  - Client POSTs to `POST /api/patients/[id]/sos` using the `X-Device-Token` header.
  - Server broadcasts `SOS_TRIGGERED` via WebSockets to the relevant caregiver connection only.
  - Family dashboard plays an audible alert and displays a high-priority banner.
- **SOS Autonomy**: The microphone-based vocalization listener must run independently of camera status, camera schedules, or camera permissions.

---

## Design

### Database Schema Updates

Modify `packages/shared/db/schema.ts` to support schedules, voice settings, and replies:

```ts
import { pgTable, uuid, text, boolean, timestamp, integer, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// patients table update
export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  deviceToken: uuid('device_token').notNull().unique(),
  cameraOverrideActive: boolean('camera_override_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// New table: camera_schedules
export const cameraSchedules = pgTable('camera_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  dayOfWeek: integer('day_of_week').notNull(), // 0 = Sunday, 6 = Saturday
  startTime: text('start_time').notNull(),    // "HH:MM" 24h format in the patient's local timezone
  endTime: text('end_time').notNull(),        // "HH:MM" 24h format in the patient's local timezone
  timezone: text('timezone').notNull().default('UTC'), // IANA timezone string, e.g. "America/New_York"
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// family_members table update
export const familyMembers = pgTable('family_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  elevenlabsVoiceId: text('elevenlabs_voice_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// messages table update
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: uuid('sender_id').notNull().references(() => familyMembers.id),
    recipientId: uuid('recipient_id').notNull().references(() => patients.id),
    content: text('content').notNull(),
    isYesNo: boolean('is_yes_no').notNull().default(false),
    isRead: boolean('is_read').notNull().default(false),
    toneClass: text('tone_class').notNull().default('neutral'), // neutral, warm, urgent
    reply: text('reply'), // null, 'yes', 'no'
    repliedAt: timestamp('replied_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('content_length', sql`char_length(${table.content}) BETWEEN 1 AND 1000`),
    check('valid_reply', sql`${table.reply} IN ('yes', 'no') OR ${table.reply} IS NULL`),
  ],
)
```

### Device Token Authentication

The patient client is not a Better Auth session — it authenticates using its `deviceToken` (UUID stored on the device). All patient-originated API calls to the dashboard must pass the device token as a custom HTTP header:

```
X-Device-Token: <uuid>
```

**Never** pass the device token as a query parameter — it would be logged in server access logs and visible in browser history. Dashboard API routes that accept patient requests (`POST /api/messages/[id]/reply`, `GET /api/tts`, `POST /api/patients/[id]/sos`) must:
1. Read `X-Device-Token` from the request headers.
2. Look up the matching `patients` row in the database.
3. Confirm the patient is the intended recipient/subject of the requested resource before proceeding.

### Real-Time Architecture

The standalone `ws-server` remains stateless in storage, but must track **connection identity** to support targeted routing. Clients register their identity on connect.

#### Connection Registration

On WebSocket connect, each client immediately sends a `REGISTER` message:
- Patient client: `{ type: 'REGISTER', role: 'patient', patientId: '<uuid>' }`
- Dashboard client: `{ type: 'REGISTER', role: 'caregiver', familyMemberId: '<uuid>' }`

The ws-server maintains an in-memory map of `patientId → Set<WebSocket>` and `familyMemberId → Set<WebSocket>`. The dashboard `/emit` endpoint accepts a `targetPatientId` or `targetFamilyMemberId` field to route to the correct connections rather than broadcasting globally.

#### Event Flow

```
[Patient Client] --POST /api/messages/[id]/reply (X-Device-Token)--> [Dashboard Next.js API]
                                                                            │ Persists reply
                                                                            │ POSTs to ws-server/emit
                                                                            │   { targetFamilyMemberId, event: 'NEW_REPLY' }
                                                                            ▼
                                                                      [ws-server]
                                                                            │ Routes to caregiver connection only
                                                                            ▼
                                                                      [Dashboard Client] (Caregiver UI)
```

Events that must be targeted (not broadcast to all):
- `CAMERA_CONFIG_UPDATE` → patient only (by `patientId`)
- `NEW_REPLY` → caregiver only (by `familyMemberId` of message sender)
- `SOS_TRIGGERED` → all caregivers linked to the patient (by `patientId`)
- `NEW_MESSAGE` → patient only (by `patientId`)

#### Shared WebSocket Event Definitions (`packages/shared/ws/types.ts`)
```ts
export type CameraSchedule = {
  dayOfWeek: number
  startTime: string
  endTime: string
  timezone: string // IANA timezone string
}

export type ServerToClientMessage =
  | { type: 'NEW_MESSAGE'; payload: Message }
  | { type: 'MESSAGE_READ'; payload: { id: string } }
  | { type: 'CAMERA_CONFIG_UPDATE'; payload: { cameraOverrideActive: boolean; schedules: CameraSchedule[] } }
  | { type: 'SOS_TRIGGERED'; payload: { patientId: string; timestamp: string } }
  | { type: 'NEW_REPLY'; payload: { messageId: string; reply: 'yes' | 'no'; repliedAt: string } }
```

### Modality & Focus Manager

To support gaze and scan targets without duplicating selection logic:
1. Create an `<InteractionProvider>` component inside `packages/shared/design`.
2. Interactive targets register themselves with coordinates and registration IDs:
   ```ts
   interface InteractiveTarget {
     id: string
     ref: React.RefObject<HTMLElement>
     onSelect: () => void
   }
   ```
3. In **GazeCursor Mode**, the tracker maps the gaze direction vector (`up`, `down`, `left`, `right`) to select a candidate target bounding box. If the gaze resides within that target for `GAZE_DWELL_MS`, it triggers `onSelect()`.
4. In **ScanMode**, the manager cycles focus through the registered array of `InteractiveTarget`s. When a blink or helper key is detected, it triggers `onSelect()` on the highlighted target.
5. **Mode transitions**: The provider exposes the current mode (`'gaze' | 'scan'`) to consumers. Mode switches are emitted as a context update; UI components should not branch on mode — they register targets and respond to `SelectEvent` identically in both modes.

### MediaPipe Face Landmarker Integration

To run Gaze and Blink tracking locally in the browser:
- Load the MediaPipe vision Tasks-Vision bundle asynchronously inside the client page. Until loading completes, `InteractionProvider` is in ScanMode.
- Track landmarks on the video stream:
  - **Left Eye Corner**: landmarks `33`, `133`.
  - **Right Eye Corner**: landmarks `362`, `263`.
  - **Left Iris Center**: landmark `468`.
  - **Right Iris Center**: landmark `473`.
  - **Eyelid landmarks** for detecting closure (EAR calculation).
- Compute Gaze Direction:
  - Compare the horizontal and vertical coordinates of iris landmarks relative to their respective eye corners.
  - Classify as `up` if iris is above threshold relative to eye corners, etc.
  - Smooth over a 20-frame rolling window (~667ms at 30fps). Combined with `GAZE_DWELL_MS` of 1500ms, the effective response latency is ~2.2s — acceptable, but the threshold values are exported constants and can be tuned.
- Compute Blink:
  - If vertical distance between upper and lower eyelids falls below 20% of horizontal eye length for ≥ 2 frames, trigger a blink event.
  - The EAR threshold is an exported constant (`EAR_THRESHOLD`, default: `0.20`) to allow per-deployment tuning. Different patients, lighting conditions, and camera angles will vary; the default is a starting point, not a calibrated value.

---

## Decisions

**Decision #1 — Client-Side Gaze Tracking via MediaPipe Face Landmarker**
- **Choice**: Use `@mediapipe/tasks-vision` loaded dynamically on the patient client.
- **Alternatives**: WebGazer.js (uses canvas-based regression, needs user calibration, heavy, poor support for categorical directional classification without screen-relative calibration).
- **Why**: MediaPipe does geometric landmarks directly. Direction classification (look up/down/left/right) is highly reliable by comparing iris coordinates to eye-corner coordinates, requiring ZERO patient calibration.
- **Reversibility**: High. The classifier feeds into `SelectEvent`, so eye tracking internals can be replaced without modifying the UI buttons.

**Decision #2 — Tone Classification on Message Send**
- **Choice**: Perform tone classification server-side during the `/api/messages` creation call using Vercel AI SDK (with Gemini/OpenAI) and persist `tone_class`.
- **Alternatives**: Run classification client-side on the patient device (wastes CPU/battery, adds lag to playback) or generate it dynamically on `/api/tts` (adds latency to stream response).
- **Why**: Keeps message creation latency low and ensures the metadata is stored, making it auditable and pre-calculated for the playback endpoint.
- **Reversibility**: High.

**Decision #3 — ElevenLabs Server-Side Proxying**
- **Choice**: Next.js route `/api/tts` acts as an authenticated proxy to ElevenLabs.
- **Why**: Prevents exposing the ElevenLabs API key to the client. Allows caching of generated audio files locally or on S3 to reduce API costs if messages are played multiple times.
- **Reversibility**: High.

**Decision #4 — Schedule Times Stored in Patient's Local Timezone**
- **Choice**: Store `startTime`/`endTime` as `HH:MM` 24h strings alongside an IANA `timezone` string per schedule row. The patient device evaluates `isCameraActive` by converting `now` to the stored timezone before comparing times.
- **Alternatives**: Store UTC offsets (brittle for DST), store UTC timestamps (schedules repeat daily so UTC conversion changes with DST), derive from device clock alone (caregiver and patient may be in different timezones).
- **Why**: IANA timezone strings handle DST correctly and are stable. Caregivers configure schedules in the patient's local timezone; the stored `timezone` field makes this explicit regardless of where the caregiver is located.
- **Reversibility**: High — the timezone field can be updated per schedule row.

**Decision #5 — Audio Unlock via Caregiver-Operated Start Screen**
- **Choice**: On first load, show a full-screen "Start Session" tap target operated by the caregiver (or whoever positions the patient's device). This gesture creates and resumes an `AudioContext`, unlocking all subsequent audio for the session.
- **Alternatives**: Attempt to play audio without gesture (blocked by browsers universally), request unlock on first WebSocket message (unreliable — the patient may not be present yet), no audio unlock (breaks TTS and SOS beep).
- **Why**: Browser autoplay policy requires at least one user gesture before `AudioContext` or `<audio>` autoplay can work. Since the patient is motor-impaired and cannot provide this gesture themselves, a caregiver setup step is the only reliable path. The screen is intentionally minimal so it does not disrupt workflow.
- **Reversibility**: High.

---

## Invariants

- **Camera track closure**: On exiting `CameraWindow` or on unmount, all video `MediaStream` tracks MUST be explicitly stopped via `track.stop()`.
- **Audio Context Resilience**: The microphone-based Web Audio listener for SOS must start/resume automatically and remain active, even when the camera is disabled.
- **Audio Context Unlocked Before Messages**: The `AudioContext` must be in `running` state before any message can be displayed or played. The "Start Session" screen enforces this.
- **Zero-Hands Completability**: No patient-side task or view may be structured in a way that requires pointer or touch coordinates. Every interactive state must register itself as a target within the modality system.
- **AI Content Check**: The patient's response to Yes/No questions must be constrained to the binary selection ("Yes" / "No") made explicitly via gaze/scan. No generative AI replies on the patient side.
- **Device Token in Headers Only**: The patient device token must never appear in a URL query parameter in any API call — always passed via `X-Device-Token` header.
- **Targeted WebSocket Routing**: No event carrying patient-specific or caregiver-specific data may be broadcast to all connected clients. Every emit call must specify a `targetPatientId` or `targetFamilyMemberId`.

---

## Error Behavior

| Scenario | Behavior |
|---|---|
| Camera permission denied | Patient app falls back to `ScanMode` immediately; UI informs caregiver via a small status indicator. |
| MediaPipe model loading (in progress) | ScanMode is active during load. No error shown. GazeCursor activates automatically once model is ready and a face is detected. |
| MediaPipe model fails to load | Falls back to `ScanMode` permanently for the session. Status indicator shown. |
| Face not detected for > 5 seconds | Falls back to `ScanMode`. Continuously checks for face re-detection; re-enters GazeCursor Mode automatically when a face is found. |
| Voice synthesis API error (ElevenLabs key expired or rate limit) | Patient client falls back to Web Speech API (native browser TTS) using a default voice to read the message. |
| Microphone permission denied | SOS button remains interactive via Gaze/Scan; patient UI shows visual warning that vocal SOS is inactive. |
| Dashboard websocket disconnects | Reconnects and re-sends `REGISTER` message. Dashboard queries database for missing patient replies or SOS events during offline period. |
| Patient API call missing or invalid `X-Device-Token` | Dashboard API returns `401`. Patient client logs the error; does not retry automatically. |

---

## Testing Strategy

- **Automated Unit Tests**:
  - Test EAR (Eye Aspect Ratio) calculation logic with mockup landmark coordinate inputs.
  - Test gaze direction classifier logic using coordinates representing look states.
  - Test scheduling logic: function `isCameraWindowActive(schedules, currentTime)` handles boundary times, day rolls, DST transitions (using the stored IANA timezone), and manual overrides.
- **Integration Tests**:
  - Test endpoint `POST /api/messages/[id]/reply` requires a valid `X-Device-Token` header, rejects mismatched tokens, and persists reply content.
  - Test endpoint `GET /api/tts` requires a valid `X-Device-Token`, returns an `audio/mpeg` stream on success, and returns `401` on invalid token.
  - Test ws-server connection registration routes `CAMERA_CONFIG_UPDATE` only to the registered patient connection, not to other connections.
- **Automated Browser-Verify**:
  - Verify that pressing the Spacebar key triggers `SelectEvent` in ScanMode.
  - Verify that clicking on Yes/No zones triggers the state transition.
- **Manual Verification**:
  - Run the patient client and check webcam indicator light. Confirm it turns ON during `CameraWindow` and turns completely OFF outside of it.
  - Verify the microphone amplitude listener triggers a warning log when vocalizing near the mic.
  - Verify that removing the `X-Device-Token` header from a `POST /api/messages/[id]/reply` call returns `401`.
