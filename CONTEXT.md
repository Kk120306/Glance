# Glance Domain Glossary

Canonical vocabulary for all code, specs, issues, and agent prompts. No implementation details live here — this is a glossary only.

## Core Concepts

**SelectEvent** — the single shared event emitted when any input modality (gaze-dwell, blink, scan-timer) confirms a selection target. The UI layer never inspects which modality fired it.

**GazeCursor** — a directional classifier producing one of five directions (left / right / up / down / center) derived from iris landmark position relative to eye corner landmarks. Smoothed over a rolling window of ~20–30 frames. Not a screen-coordinate cursor; absolute-position regression is out of scope.

**ScanMode** — the fallback input mode: the UI auto-highlights interactive targets in sequence on a configurable timer; a blink confirms whichever is currently highlighted. No direction detection is required.

**CameraWindow** — a scheduled or manually overridden time span during which the webcam may be activated. Outside a window, `track.stop()` must have been called on the `MediaStream`. Only *replying* requires an active CameraWindow; receiving is always camera-independent.

**VoiceProfile** — an ElevenLabs voice clone associated with a Caregiver, used to deliver incoming messages in the sender's voice with tone-appropriate style parameters.

**ToneClass** — a small enumerated set of tones (e.g. neutral / warm / urgent) classified from the message text by GPT, used to select ElevenLabs style parameters at playback time.

**SOSEvent** — a distress signal triggered by either: (a) sustained vocalization above a per-patient calibrated amplitude threshold (derived from ambient noise floor during setup) via the Web Audio API (primary, camera-independent), or (b) gaze/scan selection of the visible SOS target when the camera is already active (secondary).

**YesNoMode** — a special receive state entered when an incoming message is flagged as a binary question. The screen shows exactly two large targets ("look up = yes" / "look down = no"). Exits on selection or timeout.

## Entities

**Patient** — the motor-impaired user of the patient-side client. Never required to use hands.

**Caregiver** — a family member or professional healthcare provider who composes messages via the dashboard and has an associated VoiceProfile.

**BlobAgent** — an animated character (~15–20% of viewport height) that floats in a fixed position (typically bottom-center), reads messages aloud, shows emotional expression based on message tone, and guides patient interactions. Animates with ambient breathing/floating motion but does not reposition across the screen.

**Message** — a unit of communication with a sender, recipient, content, optional yes/no flag, and read status.
