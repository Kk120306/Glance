// ── Camera lifecycle helper ─────────────────────────────────────────────────
// Hard Constraint (Camera Lifecycle): every getUserMedia activation must have a
// paired track.stop() on ALL exit paths — no stray active tracks may outlive the
// CameraWindow. Centralizing the stop routine here makes that guarantee a single,
// testable primitive every call site reuses.

/**
 * Stop every track on a MediaStream (video and audio). Idempotent and null-safe:
 * a missing stream or an already-stopped track is a no-op, so it is safe to call
 * on every cleanup path (unmount, schedule close, permission denial, error).
 */
export function stopAllTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}
