# Glance: Product Requirements Document

**Version**: 1.0  
**Last Updated**: June 20, 2026  
**Status**: Active Development

---

## Executive Summary

Glance is a hands-free AAC (augmentative & alternative communication) platform designed for motor-impaired patients. It enables patients to receive messages from family members, reply using only gaze and blink (no hands required), and signal distress or request help independently.

The core product vision:
- **Patient**: Receives messages read aloud by an animated AI agent (the "blob"), selects AI-curated reply suggestions via gaze, and triggers SOS via sustained vocalization or a button
- **Caregiver**: Composes text messages, configures camera schedules, manages multiple patients, and receives real-time alerts (SOS, replies, status updates)

---

## Problem Statement

Motor-impaired individuals (locked-in syndrome, severe ALS, cerebral palsy, etc.) cannot use keyboards, mice, or touchscreens. They face two barriers:

1. **Isolation**: No way to send/receive messages in real-time with family
2. **Cost**: Commercial AAC devices cost $5,000–$20,000+ and don't integrate family messaging

Current solutions are expensive, require clinical setup, and don't work on off-the-shelf hardware (laptop + webcam + microphone).

---

## Product Vision

Glance provides an **accessible, affordable, real-time communication channel** between motor-impaired patients and caregivers using:
- **Gaze tracking** (patient eye direction via webcam)
- **Voice cloning** (messages read in caregiver's voice)
- **Vocalization detection** (SOS via sustained sound)
- **Smart UI** (animated agent guides patient through interactions)

**No hands. No keyboard. No mouse. Ever.**

---

## User Stories

### Patient Stories

1. As a patient, I want to **receive messages from my family** via my screen so I can stay connected
2. As a patient, I want **messages read aloud in my caregiver's voice** so it feels personal
3. As a patient, I want to **reply to messages using only my eyes** so I can respond without hands
4. As a patient, I want to **answer yes/no questions** with a simple gaze so I can confirm important decisions
5. As a patient, I want to **request help** (water, pain relief, bathroom) with a single gaze so I can be heard
6. As a patient, I want to **trigger an emergency alert (SOS)** via vocalization so I can call for help anytime, even when the camera is off
7. As a patient, I want the **system to automatically calibrate** to my eye movements so I don't need manual setup
8. As a patient, I want to **see what the AI is suggesting** so I maintain autonomy (no auto-filled messages)
9. As a patient, I want to **reread messages anytime** so I can be sure I understood

### Caregiver Stories

1. As a caregiver, I want to **compose and send text messages** from a simple dashboard so I can communicate without technical barriers
2. As a caregiver, I want **my voice to deliver messages** to my patient so they hear me reading
3. As a caregiver, I want to **manage multiple patients** from one dashboard so I can care for my whole family
4. As a caregiver, I want to **configure when the camera is active** so the patient's privacy/battery are protected
5. As a caregiver, I want to **see when my patient is online/offline** in real-time so I know they're available
6. As a caregiver, I want to **receive alerts when my patient requests help or triggers SOS** so I can respond immediately
7. As a caregiver, I want to **see the patient's replies** so I know what they're communicating
8. As a caregiver, I want to **mark messages as read** so I track engagement

---

## Core Features

### Phase 1: Foundation (Complete ✅)
- Monorepo architecture (`patient` app, `dashboard` app, `ws-server` standalone)
- Postgres database with schema for patients, caregivers, messages
- Real-time WebSocket messaging (socket.io)
- Device-token authentication (patient) + email/password auth (caregiver)
- Tailwind CSS design system with accessibility-first tokens
- Base component library (buttons, inputs, message bubbles)
- Autonomous calibration wizard (Eye Aspect Ratio + SOS threshold calibration)

### Phase 2: Interactive Core (In Progress 🔄)
- **Gaze Tracking**: MediaPipe Face Landmarker detects iris position → classifies direction (up/down/left/right/center)
- **ScanMode Fallback**: Auto-cycling highlight through UI targets when camera unavailable
- **SelectEvent**: Unified event for gaze-dwell or blink confirmation
- **Voice Cloning**: In-app voice recording + ElevenLabs Instant Voice Cloning API + TTS delivery
- **Tone Classification**: OpenAI classifies message tone (neutral/warm/urgent) for Blob expression and TTS styling
- **YesNoMode**: LLM auto-detects binary questions; fullscreen YES/NO targets with gaze selection
- **SOS System**: Dual-path triggering (microphone vocalization above per-patient threshold, or button gaze-dwell)
- **Camera Schedules**: Enforce when camera is allowed to be active (with manual override)
- **Blob Agent** (NEW): Animated character that reads messages, shows expression, guides interactions
- **AI Reply Suggestions**: 20–25 curated phrases ranked by LLM, with regenerate action for patient autonomy

### Phase 3: Advanced UX (Planned ⏳)
- **Joystick-Steered Cursor**: Relative gaze movement (up/down/left/right) instead of discrete directions
  - Visual dwell ring fills as cursor dwells on target
  - Cursor snaps to interactive targets (no free-floating)

### Phase 4: Multi-Patient (Planned ⏳)
- **Explicit Caregiver-Patient Associations**: Many-to-many relationship with role (primary/caregiver)
- **Scoped Dashboard**: `/patients/[id]` routes show only associated patients
- **Sidebar Patient Switcher**: Click to switch between patients; status indicators (online/offline)
- **Patient Registration**: Caregivers create new patients (generates unique setup tokens)
- **Patient Linking**: Caregivers link to existing patients via device token
- **Room-Based WebSockets**: Subscribe to `patient:alerts:<patientId>` for multi-patient alerts

### Phase 5: Production Hardening — Security, QA & Hard-Constraint Verification (Planned ⏳)
- **Dashboard Test Harness**: Vitest in `@glance/dashboard`, brought into `turbo run test` (previously zero coverage)
- **Cross-Tenant Authorization Tests**: Prove every caregiver route returns `403` for patients not linked via `patient_caregivers`; close the High data-leak risk
- **Hard-Constraint Regression Suite**: Extract SOS amplitude + camera track-stop into pure, tested modules; static source guards enforce all four Hard Constraints in CI
- **Green Monorepo**: `pnpm test` / `build` / `typecheck` pass across all four packages with no feature regressions

---

## Key Design Decisions

### 1. The Blob Agent (Visual Focal Point)
**Decision**: Animated character that floats in a fixed position on the patient screen, reads messages aloud, and guides interactions.

**Why**: Motor-impaired patients often struggle with visual attention. A consistent, expressive character provides:
- Clear feedback (listening, speaking, waiting)
- Emotional tone (warm message = happy expression)
- Focus point (patient knows where to look)
- Engagement (animated interaction feels less clinical)

**Design**:
- Glowing blob shape (~15–20% of viewport height) with simple face (eyes, mouth, brows)
- Fixed position (typically bottom-center or bottom-right corner) for consistent findability
- Ambient breathing animation (subtle vertical float) while idle — never repositions
- Mouth moves during speech (sync'd to TTS word timestamps)
- Expression changes based on message tone (warm/neutral/urgent)
- Always visible, never blocks content
- Auto-hides when no message active

---

### 2. AI-Curated Reply Suggestions (Not Free-Form Generation)
**Decision**: Suggest 3–5 phrase templates from a curated library, ranked by message intent/tone. Patient must always confirm before send. Patient can regenerate suggestions to see alternative rankings.

**Why**: AAC devices for non-speaking individuals have legal/ethical constraints:
- ✅ **Allowed**: "Here are 5 options, you pick one, you confirm it before send"
- ❌ **Not Allowed**: "The system auto-generated a reply and sent it"

Patient autonomy must be preserved at every step.

**Implementation**:
- Library of 20–25 fixed phrases (e.g., "Thank you", "I'm tired", "Love you")
- LLM ranks top 3–5 based on incoming message tone/context
- Patient gazes at selection → selection highlights
- Patient can gaze "Regenerate" target → LLM re-ranks same library (no free-form generation)
- Confirmation screen: "Confirm sending '[phrase]'? YES / NO"
- Patient gazes YES → message sends

---

### 3. Gaze-Sticky Button Navigation
**Decision**: Cursor doesn't float freely; it snaps to interactive targets. Patient navigates between targets with eye direction.

**Why**: Free-floating cursors are hard to control with motor impairment. Sticky navigation reduces precision demands:
- Gaze up/down/left/right → cursor jumps to nearest target in that direction
- Gaze center → cursor halts (dwell accumulates)
- No need for fine mouse-like control
- Dwell progress shown as filling ring (visual feedback)

---

### 4. Camera Lifecycle (Hard Constraint)
**Decision**: Every camera activation must have a paired `track.stop()` on all exit paths.

**Why**: Active video tracks drain battery and create privacy risks. Rules:
- Exit CameraWindow → stop camera
- Permission denied → stop camera
- Component unmount → stop camera
- Error → stop camera
- **No stray active tracks**

---

### 5. SOS Independence (Hard Constraint)
**Decision**: SOS must be triggerable without the camera via microphone amplitude listening. Amplitude threshold is calibrated per-patient at startup based on ambient noise floor.

**Why**: Camera might be off, permission denied, or broken. Patients must ALWAYS be able to call for help. Fixed global thresholds fail across different microphones and hospital room noise levels:
- Primary: Sustained vocalization above per-patient calibrated threshold → local alarm + alert caregiver
- Secondary: Gaze-dwell on SOS button (requires camera)

**Calibration**:
- Autonomous calibration wizard (Phase 1) measures ambient noise floor during setup
- SOS threshold computed as: `noise_floor + delta` (where delta accounts for vocalization detection margin)
- Threshold persists in browser storage across sessions

---

### 6. ElevenLabs Voice Cloning (In-App Recording)
**Decision**: Caregivers record their voice directly in the dashboard. Glance automatically calls ElevenLabs Instant Voice Cloning API to generate a voice clone, with zero external account setup required.

**Why**: Patients hear messages in their caregiver's voice (not a robot), creating emotional connection. In-app recording eliminates friction — caregivers don't need to create ElevenLabs accounts or manually copy voice IDs.

**Implementation**:
- Dashboard settings page: "Record your voice" UI with ~30-second recording flow
- Caregiver records 2–3 sentences of natural speech
- On save, Glance backend calls ElevenLabs Instant Voice Cloning API with audio blob
- ElevenLabs returns `voice_id`, stored in caregiver profile automatically
- On message send: include voice ID in payload
- Patient app calls `GET /api/tts?messageId=<uuid>` (token-authenticated)
- TTS endpoint proxies to ElevenLabs with voice_id, returns audio stream + word timings
- Default: ElevenLabs "Bella" voice if caregiver hasn't recorded

---

### 7. Tone Classification (LLM)
**Decision**: On message composition, classify tone into neutral/warm/urgent via LLM API.

**Why**: Blob expression changes based on message tone. "I love you" should feel warm; "EMERGENCY" should feel urgent.

**Implementation**:
- Dashboard backend: call OpenAI/Gemini on message POST
- Classify into: neutral, warm, urgent
- Persist on message
- Patient app: fetch tone, pass to TTS style parameters (ElevenLabs)
- Blob expression: happy (warm), concerned (urgent), neutral (neutral)

---

## Hard Constraints (Non-Negotiable)

1. **Zero Hands**: No touch, mouse, or keyboard as the sole interaction path
2. **Camera Lifecycle**: Every track activation has a paired `track.stop()`
3. **AI Content Gate**: All AI suggestions must be explicitly confirmed by patient before send
4. **SOS Independence**: SOS must be triggerable without camera (microphone fallback)

Violation of any constraint is a blocker.

---

## Implementation Strategy

### Architecture
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Radix UI, Framer Motion (animations)
- **Backend**: Next.js API routes, Drizzle ORM, Postgres
- **Real-Time**: socket.io standalone server
- **AI**: OpenAI API (tone classification, yes/no detection, reply suggestion ranking), ElevenLabs API (voice cloning + TTS)
- **Gaze**: MediaPipe Face Landmarker (webcam-based)

### Deployment
- **Patient App**: Vercel (serverless, runs on any device with browser)
- **Dashboard**: Vercel (serverless)
- **WebSocket Server**: Self-hosted Node.js (AWS EC2 / Railway / similar)
- **Database**: Postgres (AWS RDS / Railway)

### Tech Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind v3.4, Radix UI, Framer Motion |
| Backend | Next.js API routes, Drizzle ORM, Better Auth |
| Database | Postgres 16 |
| Real-Time | socket.io 4.x |
| AI/ML | MediaPipe Face Landmarker, OpenAI/Gemini, ElevenLabs |
| Monorepo | pnpm, Turborepo |
| Testing | Vitest, Playwright |

---

## Success Metrics

### Patient Experience
- [ ] Gaze accuracy ≥95% (correct target selection on first dwell)
- [ ] Patient can operate system with **no hands/keyboard/mouse**
- [ ] Can reply or request help via gaze without time pressure

### Caregiver Experience
- [ ] Can manage **5+ patients** from one dashboard
- [ ] Sees patient online/offline status **in real-time**
- [ ] Receives SOS alert **within 1 second**
- [ ] Can compose/send message **within 2 minutes**
- [ ] Voice cloning setup complete in <2 minutes

### System Quality (Latency)
- [ ] WebSocket roundtrip <500ms
- [ ] SOS alert delivery <1 second
- [ ] TTS playback begins <1 second after message received
- [ ] MediaPipe gaze classification ≥10 fps (smooth tracking)

### System Quality (Coverage & Reliability)
- [ ] Code test coverage ≥80% (critical paths)
- [ ] Zero hard constraint violations
- [ ] Load test: 100+ concurrent messages/min
- [ ] Camera memory: <50MB when active

---

## Timeline & Phases

| Phase | Duration | Deliverable | Status |
|---|---|---|---|
| 1: Foundation | 1 day | Core messaging backbone | ✅ Complete |
| 2: Interactive Core | 2–3 weeks | Gaze, TTS, SOS, Blob Agent | 🔄 In Progress |
| 3: Advanced UX | 1 week | Cursor refinement (joystick steering, dwell ring) | ⏳ Planned |
| 4: Multi-Patient | 1 week | Multi-caregiver support, permission scoping | ⏳ Planned |
| 5: Production Hardening | 1 week | Security/QA: cross-tenant auth tests, hard-constraint regression suite | ⏳ Planned |
| **Total** | **~7–8 weeks** | Production-ready platform | |

---

## Out of Scope (Deferred or Excluded)

- Live video/voice calling between patient and caregiver
- Multi-language support
- AI-generated full message composition (only curated suggestions)
- Separate clinical/caretaker dashboard (one dashboard for all caregiver roles)
- Mobile-responsive design (patient runs on fixed display; dashboard is desktop-first)
- On-device LLM (relies on cloud API calls)
- Encryption at rest (future production hardening)

---

## Risk Management

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| MediaPipe loading slows startup | Medium | UX delay | Pre-load bundle, spinner, ScanMode fallback |
| Gaze unreliable on diverse populations | Medium | Accessibility gap | Calibration wizard, ScanMode always available |
| ElevenLabs API costs scale | Low | Budget overrun | Caching, quota planning, fallback voice |
| Multi-patient scope bugs leak data | High | Privacy violation | Extensive auth tests, room isolation tests |
| Hard constraint broken (AI content gate) | Low | Legal/ethical issue | Mandatory code review, pre-send tests |

---

## Questions for Stakeholders

1. **Tone Classes**: Should we add more tone categories (e.g., curious, playful) or stick with neutral/warm/urgent?
2. **Privacy Model**: Should messages be encrypted at rest? (Deferred to Phase 5 if not in scope)
3. **Analytics**: Should we track patient interaction metrics (dwell times, selection patterns) for research?

---

## Glossary

- **Blob Agent**: Animated character (~15–20% viewport height) in fixed position that reads messages aloud, shows expression based on tone, and guides patient interactions with ambient breathing animation
- **Caregiver**: Family member or professional healthcare provider who composes messages and manages patient communication via the dashboard
- **GazeCursor**: Directional classifier (up/down/left/right/center) from iris landmarks
- **SelectEvent**: Unified event when gaze-dwell or blink confirms a target
- **ScanMode**: Fallback mode when camera unavailable (auto-cycles highlight through targets)
- **CameraWindow**: Scheduled or manually overridden time span when webcam is allowed
- **YesNoMode**: Fullscreen binary question automatically detected by LLM, showing giant YES/NO targets for gaze selection
- **VoiceProfile**: ElevenLabs voice clone generated from caregiver's recorded speech
- **ToneClass**: Emotional classification of message (neutral/warm/urgent) used for Blob expression and TTS styling
- **SOSEvent**: Distress signal triggered by sustained vocalization above per-patient calibrated threshold, or button gaze-dwell
- **AAC**: Augmentative & Alternative Communication (technology for non-speaking individuals)
- **EAR**: Eye Aspect Ratio (used to detect blinks during calibration)

---

## Next Steps

1. **Stakeholder Review**: Confirm this PRD aligns with product vision
2. **Phase 2 Execution**: Implement blob agent + AI suggestions + gaze refinements
3. **Phase 3 Execution**: Polish UX (joystick-steered cursor, dwell ring animations)
4. **Phase 4 Execution**: Multi-patient support
5. **QA & Validation**: Test on real devices with diverse patient populations
6. **Soft Launch**: Deploy to pilot group (1–3 patients + caregivers)
7. **Iterate**: Gather feedback, refine UX, harden security

---

## Document Control

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-06-20 | Claude Code + Product Team | Initial PRD (all 4 phases + blob agent vision) |

---

**Document Status**: 🟢 Active  
**Last Review**: 2026-06-20  
**Next Review**: 2026-07-04 (post-Phase 2)
