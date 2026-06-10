/**
 * fdn-worklet-src.ts
 *
 * Inlined AudioWorklet source for the Feedback Delay Network (FDN) reverb.
 *
 * Architecture: Jot/Stautner-Puckette N=8 FDN
 *   - 8 delay lines whose lengths are TUNED so comb-filter peaks align with
 *     the harmonic series / scale degrees of a chosen key.
 *   - Householder mixing matrix (lossless, unitary): ensures the network
 *     stays energy-preserving at g=1 and decays smoothly below.
 *   - Per-line one-pole lowpass for warmth (HF damps faster than LF).
 *   - Global feedback gain `g` (≤ 0.97) ramped from main thread: ramp up
 *     → room swells; ramp down → room rings out to silence.
 *   - Reports per-line RMS energy at ~40fps for visual sync.
 *
 * References:
 *   Stautner & Puckette (1982): introduced the N×N matrix FDN concept.
 *   Jot & Chaigne, AES 90th Convention (1991): lossless feedback matrix,
 *   per-line attenuation for frequency-dependent decay (the Jot FDN).
 */

export const FDN_WORKLET_SRC = /* js */ `
class FdnProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'g',       defaultValue: 0.0,  minValue: 0.0, maxValue: 0.97, automationRate: 'k-rate' },
      { name: 'wetGain', defaultValue: 0.6,  minValue: 0.0, maxValue: 1.0,  automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    this._N = 8;
    const N = this._N;
    const SR = sampleRate; // AudioWorklet global

    // ── Delay-line storage (ring buffers) ────────────────────────────────
    // Base delay lengths (samples) tuned to C major harmonic series at 44100:
    //   Ratio approach: pick mutually-prime lengths, then nudge so that
    //   f_comb = SR / L_i aligns near {C, E, G, B, D, F, A, C} across octaves.
    //   L_i = SR / target_freq, where target_freqs span the key's scale degrees.
    //
    // Key = C (default); retune via message { type:'retune', delays:Float32Array }
    this._delays = new Int32Array(N);
    this._ptrs   = new Int32Array(N);
    // Allocate one large buffer per line (max 4096 samples ~ 93ms @ 44100)
    const MAX_DELAY = 4096;
    this._bufs = Array.from({ length: N }, () => new Float32Array(MAX_DELAY));
    this._maxDelay = MAX_DELAY;

    // One-pole LP coefficients (per-line warm filter coefficient)
    // b_lp ≈ 0.6–0.85 → progressively warmer for longer lines
    this._lp     = new Float32Array(N);
    this._lpState = new Float32Array(N);

    // Householder mixing matrix: H = I - (2/N) * 11^T
    // For N=8: H_ij = (i==j ? 1 - 2/N : -2/N)
    // Precomputed as flat N×N row-major array
    this._H = new Float32Array(N * N);
    const twoOverN = 2.0 / N;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        this._H[i * N + j] = (i === j) ? (1.0 - twoOverN) : (-twoOverN);
      }
    }

    // Scratch buffer for matrix multiply output
    this._Hout = new Float32Array(N);

    // RMS energy tracking (per-line, for visual)
    this._rmsAcc  = new Float32Array(N);
    this._rmsCount = 0;
    this._rmsInterval = Math.round(SR / 40); // report ~40fps
    this._energy  = new Float32Array(N);     // last reported

    // Set default C-major delays and LP coefficients
    this._applyKey('C');

    // Listen for retune / decay messages
    this.port.onmessage = (e) => {
      const { type } = e.data;
      if (type === 'retune') {
        this._applyKey(e.data.key);
      }
    };
  }

  // ── Key-tuned delay lengths ──────────────────────────────────────────────
  // Scale degree frequencies (Hz) for the 8 delay lines are chosen as the
  // fundamental tonic + its harmonic series up through scale degrees:
  //   Root, M2, M3, P4, P5, M6, M7, Root+octave
  // Each delay length L = SR / freq (clamped to [32, MAX_DELAY]).
  _applyKey(key) {
    const SR = sampleRate;
    const N = this._N;

    // Tonic MIDI note numbers (all in octave 2–3 for long resonant lines)
    const TONICS = {
      'C':  48,  // C3
      'D':  50,
      'E':  52,
      'F':  53,
      'G':  55,
      'A':  57,
      'Bb': 58,
    };
    const tonicMidi = TONICS[key] ?? 48;
    // Major scale intervals in semitones: R M2 M3 P4 P5 M6 M7 R+oct
    const INTERVALS = [0, 2, 4, 5, 7, 9, 11, 12];

    for (let i = 0; i < N; i++) {
      const midi  = tonicMidi + INTERVALS[i];
      const freq  = 440.0 * Math.pow(2.0, (midi - 69) / 12.0);
      // Add a small per-line prime offset to break perfect periodicity
      // (mutually-prime nudge: +[0,1,3,5,7,11,13,17] samples)
      const PRIME_NUDGE = [0, 1, 3, 5, 7, 11, 13, 17];
      const L = Math.round(SR / freq) + PRIME_NUDGE[i];
      this._delays[i] = Math.max(32, Math.min(L, this._maxDelay - 1));
      this._ptrs[i] = 0;
      // Clear buffer on retune to avoid key-clash artifacts
      this._bufs[i].fill(0);
      this._lpState[i] = 0;
      // LP coefficient: longer lines get warmer (lower cutoff)
      // lp_coeff ≈ exp(-2π * fc / SR), fc ~ 4000–8000 Hz
      const fc = 8000.0 - (i / (N - 1)) * 4000.0; // 8000→4000 Hz
      this._lp[i] = Math.exp(-2.0 * Math.PI * fc / SR);
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const outL   = output[0];
    const outR   = output[1] ?? output[0]; // mono or stereo

    const inBus = inputs[0];
    const inCh  = inBus?.[0]; // may be undefined if no input connected

    const g       = parameters.g[0];
    const wetGain = parameters.wetGain[0];
    const N       = this._N;

    for (let n = 0; n < (outL?.length ?? 128); n++) {
      const inputSample = inCh ? (inCh[n] ?? 0) : 0;

      // 1. Read current delay-line tails
      const tails = this._Hout; // reuse scratch for tail read
      for (let i = 0; i < N; i++) {
        const buf = this._bufs[i];
        const len = this._delays[i];
        // Read from tail (ptr points to where we WRITE; read from ptr)
        const readIdx = this._ptrs[i]; // oldest sample
        let s = buf[readIdx];
        // One-pole LP: y[n] = (1-lp)*x[n] + lp*y[n-1]
        const lpC = this._lp[i];
        s = (1.0 - lpC) * s + lpC * this._lpState[i];
        this._lpState[i] = s;
        tails[i] = s;
        // Accumulate squared for RMS
        this._rmsAcc[i] += s * s;
        // Advance write pointer (will write below)
        this._ptrs[i] = (readIdx + 1) % len;
      }

      // 2. Householder mix: Hout[i] = sum_j H[i][j] * tails[j]
      const Hout = this._H;
      for (let i = 0; i < N; i++) {
        let mix = 0.0;
        const row = i * N;
        for (let j = 0; j < N; j++) {
          mix += Hout[row + j] * tails[j];
        }
        // 3. Write back: delay_input = g * Hout[i] + input injection
        const writeVal = g * mix + inputSample * 0.25; // attenuate injection
        const buf = this._bufs[i];
        // Write pointer already advanced; write to prev position
        const writeIdx = (this._ptrs[i] === 0 ? this._delays[i] : this._ptrs[i]) - 1;
        buf[(writeIdx + this._delays[i]) % this._delays[i]] = writeVal;
      }

      // 4. Sum tails for output (wet signal)
      let wet = 0.0;
      for (let i = 0; i < N; i++) wet += tails[i];
      wet = wet * (wetGain / N);

      if (outL) outL[n] = wet;
      if (outR && outR !== outL) outR[n] = wet;
    }

    // 5. RMS reporting
    this._rmsCount += outL?.length ?? 128;
    if (this._rmsCount >= this._rmsInterval) {
      this._rmsCount = 0;
      const invC = 1.0 / this._rmsInterval;
      for (let i = 0; i < N; i++) {
        this._energy[i] = Math.sqrt(this._rmsAcc[i] * invC);
        this._rmsAcc[i] = 0;
      }
      const snap = new Float32Array(this._energy);
      this.port.postMessage({ type: 'energy', energy: snap }, [snap.buffer]);
    }

    return true;
  }
}

registerProcessor('fdn-processor', FdnProcessor);
`;
