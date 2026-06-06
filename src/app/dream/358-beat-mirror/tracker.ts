// tracker.ts — 358-beat-mirror
// Subsystem (a): the real-time beat-tracking / tempo-induction pipeline.
//
// Per frame, from an AnalyserNode time-domain PCM block:
//   1. ONSET STRENGTH (spectral flux). Take a windowed magnitude spectrum via a
//      small radix-2 FFT, compare to the previous frame, half-wave rectify the
//      positive changes and sum them — the classic spectral-flux onset function.
//   2. ROLLING ONSET ENVELOPE. Push each flux value into a ring buffer sampled
//      at the frame rate; lightly smooth and mean-subtract it.
//   3. TEMPO via AUTOCORRELATION. Autocorrelate the onset envelope over the lag
//      range corresponding to 60–180 BPM; the dominant peak (with octave
//      checking) gives the period; confidence = peak height vs. local baseline.
//   4. BEAT PHASE. Align a predicted beat grid to recent onset peaks by scoring
//      candidate phases against the envelope (a lightweight cumulative-score in
//      the spirit of OBTAIN), then predict the next beat time.
//
// References: M. Goto & Y. Muraoka, "A Real-time Beat Tracking System for Audio
// Signals" (ICMC 1995); "OBTAIN: Real-Time Beat Tracking in Audio Signals"
// (arXiv:1704.02216).

const MIN_BPM = 60
const MAX_BPM = 180
// Onset envelope sample rate. The page calls update() once per animation frame;
// we resample to a fixed rate so autocorrelation lags map cleanly to BPM.
const ENV_HZ = 100
const ENV_SECONDS = 6
const ENV_LEN = ENV_HZ * ENV_SECONDS // 600 samples

export interface TrackerReadout {
  bpm: number
  confidence: number // 0..1
  /** Phase within the current beat, 0 at the beat, ramps to 1. */
  beatPhase: number
  /** Becomes true on the frame a predicted beat fires. */
  beatNow: boolean
  /** Current (smoothed) onset-strength value, normalized 0..1-ish. */
  onsetNow: number
  /** Most-recent slice of the onset envelope for the scope, oldest→newest. */
  envelope: Float32Array
  /** Predicted-beat tick positions within the envelope window (sample idx). */
  beatTicks: number[]
  /** Detected onset-peak positions within the envelope window (sample idx). */
  onsetMarks: number[]
}

// In-place iterative radix-2 FFT (real input via interleaved arrays).
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let curR = 1
      let curI = 0
      for (let k = 0; k < len / 2; k++) {
        const aR = re[i + k]
        const aI = im[i + k]
        const bR = re[i + k + len / 2]
        const bI = im[i + k + len / 2]
        const tR = bR * curR - bI * curI
        const tI = bR * curI + bI * curR
        re[i + k] = aR + tR
        im[i + k] = aI + tI
        re[i + k + len / 2] = aR - tR
        im[i + k + len / 2] = aI - tI
        const nR = curR * wr - curI * wi
        curI = curR * wi + curI * wr
        curR = nR
      }
    }
  }
}

export class BeatTracker {
  private fftSize: number
  private prevMag: Float32Array
  private re: Float32Array
  private im: Float32Array
  private win: Float32Array

  // Onset envelope ring buffer at ENV_HZ.
  private env = new Float32Array(ENV_LEN)
  private envWrite = 0
  private lastEnvTime = 0
  private pendingFlux = 0
  private pendingCount = 0

  // Beat-phase state (absolute audio-context time domain).
  private periodS = 0.5 // current beat period (s); seed at 120 BPM
  private nextBeatTime = 0
  private smoothedBpm = 0
  private smoothedConf = 0
  private beatTickTimes: number[] = [] // absolute times of recent predicted beats
  private onsetTimes: number[] = [] // absolute times of recent detected onsets
  private lastOnsetAt = -1
  private fluxAvg = 0

  constructor(fftSize = 1024) {
    this.fftSize = fftSize
    this.prevMag = new Float32Array(fftSize / 2)
    this.re = new Float32Array(fftSize)
    this.im = new Float32Array(fftSize)
    this.win = new Float32Array(fftSize)
    for (let i = 0; i < fftSize; i++) {
      this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (fftSize - 1)) // Hann
    }
  }

  /** Feed one analyser time-domain block. `now` is AudioContext currentTime (s). */
  update(pcm: Float32Array, now: number): TrackerReadout {
    if (this.lastEnvTime === 0) this.lastEnvTime = now
    if (this.nextBeatTime === 0) this.nextBeatTime = now + this.periodS

    // --- 1. spectral flux ---------------------------------------------------
    const flux = this.computeFlux(pcm)
    this.pendingFlux += flux
    this.pendingCount += 1

    // --- 2. resample into the onset envelope at ENV_HZ ----------------------
    let beatNow = false
    const step = 1 / ENV_HZ
    while (now - this.lastEnvTime >= step) {
      this.lastEnvTime += step
      const v = this.pendingCount > 0 ? this.pendingFlux / this.pendingCount : 0
      this.pendingFlux = 0
      this.pendingCount = 0
      this.env[this.envWrite] = v
      this.envWrite = (this.envWrite + 1) % ENV_LEN

      // detect an onset peak (adaptive threshold) at the env timestamp
      this.fluxAvg = this.fluxAvg * 0.96 + v * 0.04
      if (
        v > this.fluxAvg * 1.6 &&
        v > 0.012 &&
        this.lastEnvTime - this.lastOnsetAt > 0.11
      ) {
        this.lastOnsetAt = this.lastEnvTime
        this.onsetTimes.push(this.lastEnvTime)
        if (this.onsetTimes.length > 64) this.onsetTimes.shift()
      }
    }

    // --- 3 & 4. periodically re-estimate tempo + phase ----------------------
    // (cheap: autocorrelation over 600 samples once per frame is fine)
    this.estimateTempoAndPhase(now)

    // advance the predicted beat grid
    while (now >= this.nextBeatTime) {
      beatNow = true
      this.beatTickTimes.push(this.nextBeatTime)
      if (this.beatTickTimes.length > 32) this.beatTickTimes.shift()
      this.nextBeatTime += this.periodS
    }

    const beatPhase = clamp01(1 - (this.nextBeatTime - now) / this.periodS)

    return {
      bpm: this.smoothedBpm,
      confidence: this.smoothedConf,
      beatPhase,
      beatNow,
      onsetNow: clamp01(flux * 6),
      envelope: this.snapshotEnvelope(),
      beatTicks: this.windowIndices(this.beatTickTimes, now),
      onsetMarks: this.windowIndices(this.onsetTimes, now),
    }
  }

  private computeFlux(pcm: Float32Array): number {
    const n = this.fftSize
    const re = this.re
    const im = this.im
    const len = Math.min(n, pcm.length)
    for (let i = 0; i < n; i++) {
      re[i] = i < len ? pcm[i] * this.win[i] : 0
      im[i] = 0
    }
    fft(re, im)
    const half = n / 2
    let flux = 0
    const prev = this.prevMag
    for (let k = 0; k < half; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k])
      const diff = mag - prev[k]
      if (diff > 0) flux += diff // half-wave rectified
      prev[k] = mag
    }
    return flux / half
  }

  // Read the ring buffer out oldest→newest.
  private snapshotEnvelope(): Float32Array {
    const out = new Float32Array(ENV_LEN)
    for (let i = 0; i < ENV_LEN; i++) {
      out[i] = this.env[(this.envWrite + i) % ENV_LEN]
    }
    return out
  }

  // Map absolute beat/onset times into sample indices of the current window.
  private windowIndices(times: number[], now: number): number[] {
    const startTime = now - ENV_SECONDS
    const out: number[] = []
    for (const t of times) {
      if (t < startTime || t > now) continue
      out.push(Math.round((t - startTime) * ENV_HZ))
    }
    return out
  }

  private estimateTempoAndPhase(now: number) {
    const env = this.snapshotEnvelope()
    // mean-subtract + light smoothing
    let mean = 0
    for (let i = 0; i < ENV_LEN; i++) mean += env[i]
    mean /= ENV_LEN
    const sig = new Float32Array(ENV_LEN)
    for (let i = 0; i < ENV_LEN; i++) {
      const a = i > 0 ? env[i - 1] : env[i]
      const c = i < ENV_LEN - 1 ? env[i + 1] : env[i]
      sig[i] = (a + 2 * env[i] + c) / 4 - mean
    }

    const minLag = Math.round((60 / MAX_BPM) * ENV_HZ) // ~33
    const maxLag = Math.round((60 / MIN_BPM) * ENV_HZ) // 100
    let bestLag = 0
    let bestScore = -Infinity
    let sumScore = 0
    let countScore = 0
    for (let lag = minLag; lag <= maxLag; lag++) {
      let acc = 0
      for (let i = lag; i < ENV_LEN; i++) acc += sig[i] * sig[i - lag]
      // weak preference for tempi near 120 BPM (perceptual prior, à la Goto)
      const bpm = (60 * ENV_HZ) / lag
      const prior = Math.exp(-Math.pow((Math.log2(bpm / 120)) / 0.9, 2))
      const score = acc * (0.6 + 0.4 * prior)
      sumScore += score
      countScore++
      if (score > bestScore) {
        bestScore = score
        bestLag = lag
      }
    }
    if (bestLag === 0) return

    // octave check: if half-tempo (2*lag) scores comparably, the listener may
    // prefer it; keep the stronger of {lag, lag/2 capped to range}.
    const baseline = sumScore / Math.max(1, countScore)
    const conf = clamp01((bestScore - baseline) / (Math.abs(bestScore) + 1e-6) * 1.4)

    let lag = bestLag
    const half = Math.round(lag / 2)
    if (half >= minLag) {
      let accHalf = 0
      for (let i = half; i < ENV_LEN; i++) accHalf += sig[i] * sig[i - half]
      if (accHalf > bestScore * 0.92) lag = half
    }

    const periodS = lag / ENV_HZ
    const bpm = 60 / periodS

    // smooth the readout
    this.smoothedBpm =
      this.smoothedBpm === 0 ? bpm : this.smoothedBpm * 0.9 + bpm * 0.1
    this.smoothedConf = this.smoothedConf * 0.85 + conf * 0.15

    // --- phase: find the beat offset that best lines predicted beats up with
    // recent onset peaks in the envelope. Score candidate phases by summing the
    // envelope at predicted beat positions (cumulative-score, OBTAIN-style). ---
    if (conf > 0.06) {
      const lagI = lag
      let bestPhase = 0
      let bestPhaseScore = -Infinity
      for (let p = 0; p < lagI; p++) {
        let s = 0
        for (let i = ENV_LEN - 1 - p; i >= 0; i -= lagI) s += sig[i]
        if (s > bestPhaseScore) {
          bestPhaseScore = s
          bestPhase = p
        }
      }
      // bestPhase = samples back from the newest env sample that a beat lands on.
      // Convert to an absolute next-beat time and gently nudge nextBeatTime.
      const lastBeatTime = now - bestPhase / ENV_HZ
      let target = lastBeatTime + periodS
      while (target < now) target += periodS
      // critically-damped correction toward the target grid
      const corr = 0.12
      const drift = target - this.nextBeatTime
      // unwrap drift into nearest period
      let d = drift % periodS
      if (d > periodS / 2) d -= periodS
      if (d < -periodS / 2) d += periodS
      this.nextBeatTime += d * corr
    }
    this.periodS = periodS
  }

  dispose() {
    // No retained resources beyond plain arrays; nothing external to free.
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}
