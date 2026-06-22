# Fix notes — feedback pass (2026-06-22)

Working list from a round of hands-on feedback. Each item has the symptom, the
root cause, and the fix. Hard Constraints (AGENTS.md) checked per item.

## 1. Quick Yes/No focus feedback ✅

**Symptom:** On the home "Yes / No" panel you can't clearly tell which tile your
gaze has landed on / armed, unlike the home tiles ("the other sticky").

**Cause:** `QuickYesNo`'s `AnswerTile` only read `focused` + `dwellProgress`. It
ignored the `armed` state (first blink landed, second confirms) and had no
focus-arrival flash or "blink again" prompt that `HomeTile`/`ActionTile` show.

**Fix:** `AnswerTile` now mirrors the home tiles — accent halo + scale on focus, a
white focus-arrival flash (`focusArriveLight`), a stronger ring + `armPulse`
"Blink again to confirm ✓" label when armed, and a steady "Blink twice to choose"
hint when focused. Zero-hands preserved (still gaze/scan via `useInteractiveTarget`).

## 2. AI reply suggestions — already working ✅ (verified)

**Question:** "Is the AI suggestion even there for the responses? I provided the
API key."

**Answer:** Yes. `POST /api/suggestions` ranks the patient's frozen
`FIXED_PHRASES` against the incoming message via OpenAI (`gpt-4o-mini`).
`OPENAI_API_KEY` is present in `apps/dashboard/.env.local`. The model only emits
indices into the curated list, so no generated content can reach the patient
(Hard Constraint #3 — AI Content Gate).

**How to see it:** When a caregiver message that is *not* a Yes/No question is on
the patient screen, the app prefetches the ranked order. Tap **Reply** and the
phrase board opens in "Suggested · in your words" mode with the best matches
first. (Opening the board from idle, or for a Yes/No message, shows the full
board — by design.) No code change required.

## 3. Off-camera / offline messages are never read out ✅

**Symptom:** A message sent while the patient device is closed, offline, or
off-camera is "just not being read." Messages only arrived over the live
WebSocket, so anything sent while the device wasn't connected was lost to the
patient (it was still stored, and the dashboard still showed "Sent").

**Fix:** New device-token endpoint `GET /api/messages/pending` returns every
family→patient message still unread (`is_read = false`), oldest first, with the
resolved sender name. On session start *and* on every socket (re)connect the
patient app fetches pending messages and enqueues any it doesn't already have.
They flow through the same read-aloud queue, so nothing is missed. Marking a
message read (when it reaches the screen) drops it from future pending fetches.

## 4. Each message should show the sender's name ✅

**Symptom:** The patient sees the message text but not who it's from.

**Fix:** The `NEW_MESSAGE` socket payload and the pending endpoint now carry a
resolved `senderName` (persona name when sent as a persona, else the family
member's name). The patient read screen shows a "From {name}" chip and the
Yes/No screen shows "{name} asks". Display-only — no constraint impact.

## 5. Sidebar unreachable after visiting Voice Library ✅

**Symptom:** "After I go to voice library, sidebar not working."

**Cause:** The dashboard sidebar (`<aside>`) was a normal flex child, not pinned.
The content pages use `min-h-screen`; the Voice Library page is the tallest, so
the window scrolls and the (non-sticky) sidebar scrolls out of reach.

**Fix:** Sidebar is now `sticky top-0 h-screen self-start` with its own
`overflow-y-auto`, so it stays pinned and clickable on every page regardless of
content height.

## 6. Photo/video attachment should be a file, not a link ✅

**Symptom:** Compose only accepted an external media *URL*.

**Fix:** New endpoint `POST /api/messages/upload` (caregiver session auth) accepts
a multipart file, validates type (image/* or video/*) and size (≤25 MB), writes
it to `apps/dashboard/public/uploads/<uuid>.<ext>`, and returns an absolute URL +
detected `mediaType`. The compose form now has a file picker with an inline
preview and remove; the resolved URL is sent through the existing
`mediaUrl`/`mediaType` message fields (so the patient renderer is unchanged).

**Caveat (production):** local-disk storage is fine for dev/single-node. For a
multi-node / serverless deploy this should move to object storage (S3/R2/GCS)
with the same return contract.
