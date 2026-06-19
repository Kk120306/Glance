# Glance Domain Glossary

Canonical vocabulary for all code, specs, issues, and agent prompts. No implementation details live here — this is a glossary only.

## Core Concepts

**SelectEvent** — the single shared event emitted when any input modality (gaze-dwell, blink, scan-timer) confirms a selection target. The UI layer never inspects which modality fired it.

**GazeCursor** — a directional classifier producing one of five directions (left / right / up / down / center) derived from iris landmark position relative to eye corner landmarks. Smoothed over a rolling window of ~20–30 frames. Not a screen-coordinate cursor; absolute-position regression is out of scope.

**ScanMode** — the fallback input mode: the UI auto-highlights interactive targets in sequence on a configurable timer; a blink confirms whichever is currently highlighted. No direction detection is required.

**CameraWindow** — a scheduled or manually overridden time span during which the webcam may be activated. Outside a window, `track.stop()` must have been called on the `MediaStream`. Only *replying* requires an active CameraWindow; receiving is always camera-independent.

**VoiceProfile** — an ElevenLabs voice clone associated with a FamilyMember, used to deliver incoming messages in the sender's voice with tone-appropriate style parameters.

**ToneClass** — a small enumerated set of tones (e.g. neutral / warm / urgent) classified from the message text by GPT, used to select ElevenLabs style parameters at playback time.

**SOSEvent** — a distress signal triggered by either: (a) sustained vocalization of ≥1–2 s duration above an amplitude threshold via the Web Audio API (primary, camera-independent), or (b) gaze/scan selection of the visible SOS target when the camera is already active (secondary).

**YesNoMode** — a special receive state entered when an incoming message is flagged as a binary question. The screen shows exactly two large targets ("look up = yes" / "look down = no"). Exits on selection or timeout.

## Entities

**Patient** — the motor-impaired user of the patient-side client. Never required to use hands.

**FamilyMember** — a relative or caregiver who composes messages via the family dashboard and has an associated VoiceProfile.

**Message** — a unit of communication with a sender, recipient, content, optional yes/no flag, and read status.
