import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Structural guards for the four non-negotiable Hard Constraints in AGENTS.md.
 *
 * These are not behavioral unit tests — they read the patient-side source at test
 * time and assert invariants about what the code is *allowed to contain*, turning
 * the "Stop and Ask the Human" product rules into a failing build. A future change
 * that, say, drops the camera-independent SOS path or makes a target keyboard-only
 * will break here.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/** Recursively collect every .ts/.tsx file under the patient app's src. */
function sourceFiles(dir: string = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

function read(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf8')
}

describe('Hard Constraint #1 — Zero Hands', () => {
  const interactiveComponents = [
    'components/PhraseBoard.tsx',
    'components/PatientScreen.tsx',
    'components/QuickYesNo.tsx',
    'components/YesNoScreen.tsx',
    'components/PhraseConfirmScreen.tsx',
  ]

  it('every interactive patient component wires a gaze/scan selection path', () => {
    // A target is selectable by gaze/scan if it registers with the interaction
    // layer — either via the `useInteractiveTarget` convenience hook or the
    // lower-level `registerTarget` it wraps. Both carry an `onSelect` the gaze
    // dwell / scan blink fires, so no surface is mouse/touch-only.
    for (const rel of interactiveComponents) {
      expect(read(rel), `${rel} must offer a gaze/scan path`).toMatch(
        /useInteractiveTarget|registerTarget/,
      )
    }
  })

  it('no patient component registers a keyboard handler as an interaction path', () => {
    // onClick is permitted (gaze/scan dispatches the same callback, so it is a
    // co-equal path, never the sole one). Keyboard handlers are forbidden: the
    // patient never has a keyboard.
    const banned = /onKeyDown|onKeyUp|onKeyPress|addEventListener\(\s*['"]key(down|up|press)['"]/
    for (const file of sourceFiles()) {
      expect(readFileSync(file, 'utf8'), `${file} must not use keyboard input`).not.toMatch(banned)
    }
  })
})

describe('Hard Constraint #2 — Camera Lifecycle', () => {
  it('every getUserMedia call site also stops its tracks', () => {
    for (const file of sourceFiles()) {
      const src = readFileSync(file, 'utf8')
      // Match actual call sites (`.getUserMedia(`), not comments that merely
      // mention the API while explaining they never call it.
      if (!/\.getUserMedia\(/.test(src)) continue
      // The file that activates a track must also release it (via the shared
      // stopAllTracks helper or a direct track.stop()).
      expect(src, `${file} activates a track but never stops it`).toMatch(
        /stopAllTracks|\.stop\(\)/,
      )
    }
  })

  it('the camera hook releases tracks on the deactivate, cleanup, and unmount paths', () => {
    const hook = read('hooks/useCameraStream.ts')
    const stops = hook.match(/stopAllTracks\(/g) ?? []
    // deactivate branch + effect-cleanup return + dedicated unmount effect.
    expect(stops.length).toBeGreaterThanOrEqual(3)
  })
})

describe('Hard Constraint #3 — AI Content Gate', () => {
  const phraseBoard = read('components/PhraseBoard.tsx')

  it('the phrase board exposes a frozen literal set — no generation', () => {
    expect(phraseBoard).toMatch(/FIXED_PHRASES\s*=\s*\[/)
    expect(phraseBoard).toMatch(/\]\s*as const/) // immutable tuple, not generated
  })

  it('the phrase board never calls out to generate content', () => {
    expect(phraseBoard).not.toMatch(/fetch\(|generate|completion|openai|gpt/i)
  })

  it('outbound phrases originate only from an explicit selection callback', () => {
    // Each tile sends its own literal phrase via onSelect={() => onPhrase(phrase)};
    // there is no path that fabricates or auto-fills content the patient did not pick.
    expect(phraseBoard).toMatch(/onPhrase\(phrase\)/)
  })

  it('a selected phrase must pass an explicit confirm step before it sends', () => {
    // Selecting a phrase opens PhraseConfirmScreen; only its confirm callback
    // posts the phrase. The patient sees the expanded result and blink-confirms
    // once before send (AGENTS.md AI Content Gate).
    const screen = read('components/PatientScreen.tsx')
    expect(screen).toMatch(/PhraseConfirmScreen/)
    expect(screen).toMatch(/onConfirm=\{confirmPhrase\}/)
  })

  it('ranked suggestions reorder the curated set — they never generate content', () => {
    // The suggestions fetch sends the patient's own FIXED_PHRASES to be reranked;
    // the board only ever renders entries from that frozen list.
    const screen = read('components/PatientScreen.tsx')
    expect(screen).toMatch(/phrases:\s*FIXED_PHRASES/)
  })
})

describe('Hard Constraint #4 — SOS Independence', () => {
  it('the microphone SOS listener requests audio only — never the camera', () => {
    const screen = read('components/PatientScreen.tsx')
    expect(screen).toMatch(/getUserMedia\(\s*\{\s*audio:\s*true\s*\}\s*\)/)
  })

  it('the SOS decision module is free of any camera/video dependency', () => {
    const sos = read('utils/sosAmplitude.ts')
    expect(sos).not.toMatch(/video|camera|getUserMedia|MediaStream|videoRef|gaze/i)
  })

  it('the SOS listener uses the pure, camera-independent decision function', () => {
    const screen = read('components/PatientScreen.tsx')
    expect(screen).toMatch(/stepSosSustain/)
  })
})
