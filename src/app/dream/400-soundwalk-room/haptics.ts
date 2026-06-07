/**
 * haptics.ts — Audio-driven vibrotactile haptics (a lightweight Sound2Hap)
 *
 * Sound2Hap (arXiv:2601.12245, CHI 2026) learns a mapping from audio to a
 * vibrotactile signal so that what you FEEL matches what you HEAR. We can't ship a
 * trained model in a sandbox, so we implement the *idea* with signal processing:
 *
 *   1. Each voice already exposes a per-voice AnalyserNode (see synth.ts). We read
 *      that voice's live time-domain frame and compute a simple RMS + onset measure
 *      — its instantaneous loudness envelope.
 *   2. When the walker passes within HAPTIC_RADIUS of a voice, we fire ONE
 *      vibration burst (a "pass event") whose PATTERN is derived from that voice's
 *      character, so a low sub feels like a long slow thud and a bright high partial
 *      feels like a short buzzy flutter:
 *        - pulse length & gap scale inversely with pitch (higher = shorter/buzzier),
 *        - the number of pulses (pattern density) scales with proximity + live RMS
 *          (closer + louder = denser),
 *        - so the burst literally encodes "which voice, how close, how loud".
 *   3. We THROTTLE: a voice can only re-fire after it has left and re-entered the
 *      radius (a per-voice latch) AND a global cooldown, so we never spam
 *      navigator.vibrate() every frame.
 *
 * Graceful degradation: if navigator.vibrate is missing (desktop, iOS Safari), we
 * never call it; the caller shows a notice and the map pulses visually instead.
 */

export const HAPTIC_RADIUS = 1.5 // metres — "brush past" zone around a voice
const GLOBAL_COOLDOWN_MS = 260 // min gap between ANY two vibrate() calls
const PER_VOICE_REARM = 0.1 // gain01 must drop below this for a voice to re-arm

export function vibrationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function"
}

export interface PassEvent {
  voiceIndex: number
  /** 0..1 how close (1 = on top of it) */
  proximity: number
}

/**
 * Derive a vibration pattern (ms on/off list) from a voice's character.
 * @param freq   voice frequency (Hz) — higher → shorter, buzzier pulses
 * @param proximity 0..1 — closer → more pulses (denser)
 * @param rms    0..1 — louder voice → slightly longer pulses
 */
export function patternForVoice(freq: number, proximity: number, rms: number): number[] {
  // Map frequency (≈55..330 Hz here) to a pulse length: low = long thud, high = short tick.
  const fNorm = Math.min(1, Math.max(0, (freq - 55) / (330 - 55)))
  const pulseMs = Math.round(70 - fNorm * 48) // 70ms (low) → 22ms (high)
  const gapMs = Math.round(60 - fNorm * 40) // 60ms → 20ms (higher = tighter flutter)

  // Density: 1–4 pulses by proximity, plus a touch from live loudness.
  const density = Math.max(1, Math.min(4, Math.round(1 + proximity * 2.5 + rms * 1.0)))

  // Overall intensity proxy: closer pulses last a hair longer (we can't set amplitude
  // via the Vibration API, so duration is our only lever).
  const lenScale = 0.75 + proximity * 0.5 + rms * 0.2

  const pattern: number[] = []
  for (let i = 0; i < density; i++) {
    pattern.push(Math.max(8, Math.round(pulseMs * lenScale)))
    if (i < density - 1) pattern.push(gapMs)
  }
  return pattern
}

/**
 * HapticDriver tracks per-voice "armed" latches and the global cooldown, decides
 * when a pass event fires, and (if supported) calls navigator.vibrate.
 *
 * It returns the events it fired so the UI can also pulse the map (the visual
 * fallback when vibration is unsupported uses the same events).
 */
export class HapticDriver {
  readonly supported: boolean
  private armed: boolean[]
  private lastFireMs = 0

  constructor(voiceCount: number) {
    this.supported = vibrationSupported()
    this.armed = new Array(voiceCount).fill(true)
  }

  /**
   * @param perVoice live per-source state from SoundwalkField.step()
   * @param freqs    voice frequencies, same order
   * @param rmsList  per-voice RMS 0..1
   * @param nowMs    performance.now()
   * @returns events fired this frame (for visual pulses)
   */
  update(
    perVoice: { d: number; gain01: number }[],
    freqs: number[],
    rmsList: number[],
    nowMs: number,
  ): PassEvent[] {
    const events: PassEvent[] = []

    for (let i = 0; i < perVoice.length; i++) {
      const { d, gain01 } = perVoice[i]

      // Re-arm a voice once you've moved away (loud → quiet means we left it).
      if (gain01 < PER_VOICE_REARM) this.armed[i] = true

      if (d <= HAPTIC_RADIUS && this.armed[i] && nowMs - this.lastFireMs > GLOBAL_COOLDOWN_MS) {
        const proximity = Math.min(1, Math.max(0, 1 - d / HAPTIC_RADIUS))
        const pattern = patternForVoice(freqs[i], proximity, rmsList[i] ?? 0)

        if (this.supported) {
          try { navigator.vibrate(pattern) } catch { /* ignore */ }
        }

        this.armed[i] = false
        this.lastFireMs = nowMs
        events.push({ voiceIndex: i, proximity })
      }
    }

    return events
  }

  /** Stop any ongoing vibration (cleanup). */
  clear() {
    if (this.supported) {
      try { navigator.vibrate(0) } catch { /* ignore */ }
    }
  }
}

/** Compute RMS (0..1) from an analyser's float time-domain frame. */
export function readRms(analyser: AnalyserNode, buf: Float32Array): number {
  analyser.getFloatTimeDomainData(buf as Float32Array<ArrayBuffer>)
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  const rms = Math.sqrt(sum / buf.length)
  // Light compression so the value is visually/haptically useful.
  return Math.min(1, rms * 3.2)
}
