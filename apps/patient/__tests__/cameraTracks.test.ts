import { describe, it, expect, vi } from 'vitest'
import { stopAllTracks } from '../src/utils/cameraTracks'

function fakeTrack(kind: 'video' | 'audio') {
  return { kind, stop: vi.fn() }
}

/** Minimal MediaStream stand-in exposing the one method the helper calls. */
function fakeStream(tracks: ReturnType<typeof fakeTrack>[]) {
  return { getTracks: () => tracks } as unknown as MediaStream
}

describe('stopAllTracks', () => {
  it('no-ops on a null or undefined stream', () => {
    expect(() => stopAllTracks(null)).not.toThrow()
    expect(() => stopAllTracks(undefined)).not.toThrow()
  })

  it('stops every track on the stream (video and audio)', () => {
    const video = fakeTrack('video')
    const audio = fakeTrack('audio')
    stopAllTracks(fakeStream([video, audio]))
    expect(video.stop).toHaveBeenCalledTimes(1)
    expect(audio.stop).toHaveBeenCalledTimes(1)
  })

  it('stops a multi-track stream completely (no stray active tracks)', () => {
    const tracks = [fakeTrack('video'), fakeTrack('video'), fakeTrack('audio')]
    stopAllTracks(fakeStream(tracks))
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — calling twice does not throw and re-issues stop', () => {
    const track = fakeTrack('video')
    const stream = fakeStream([track])
    stopAllTracks(stream)
    expect(() => stopAllTracks(stream)).not.toThrow()
    expect(track.stop).toHaveBeenCalledTimes(2)
  })
})
