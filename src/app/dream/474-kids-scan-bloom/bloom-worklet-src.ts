/**
 * bloom-worklet-src.ts
 *
 * AudioWorklet source for Scanned Synthesis — flower bloom edition.
 * Exported as an inline string → Blob URL → addModule (no public/ file needed).
 *
 * Technique: Max V. Mathews, Bill Verplank, Rob Shaw —
 *   "Scanned Synthesis", Proceedings of the ICMC 2000, Berlin.
 *
 * Differences vs. an open string:
 *   - The wavetable is a CLOSED loop: r[N] where index 0 neighbours index N-1.
 *   - r[i] = radial deviation at angle (i/N)*2π — you see the outline you hear.
 *   - A gentle k-fold (5-petal) bias is added to the rest shape so the
 *     physics keeps a flower-like rest attractor; squeeze excitations travel
 *     around the ring and morph the timbre.
 *
 * Physics per render quantum (128 samples):
 *   accel[i] = Kn*(r[(i-1+N)%N] + r[(i+1)%N] - 2*r[i]) - Kc*r[i] - damp*v[i]
 *   v[i] += accel[i]*dt
 *   r[i] += v[i]*dt
 *   clamp |r[i]| ≤ 1
 *
 * Scan (audio synthesis):
 *   phase accumulator advances scanFreq/sampleRate per sample
 *   output = lerp_circular(r, phase*N)
 *
 * Messages in:  { type:'squeeze', index:number, strength:number }
 * Messages out: { type:'state',   r: Float32Array }  ~33 times/sec
 */

export const BLOOM_WORKLET_SRC = /* js */ `
class BloomProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'scanFreq', defaultValue: 261.63, minValue: 40, maxValue: 1600, automationRate: 'k-rate' },
      { name: 'gain',     defaultValue: 0.55,   minValue: 0,  maxValue: 1.0,  automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    const N = 128;
    this._N    = N;
    this._r    = new Float32Array(N);   // radial deviations (wavetable)
    this._v    = new Float32Array(N);   // velocities
    this._phase = 0;                    // scan phase [0,1)
    this._reportCtr = 0;
    this._reportInterval = 1323;        // ~30ms @ 44100

    // Physics coefficients — small/stable (closed-loop Courant condition)
    this._Kn   = 0.25;    // neighbour spring stiffness
    this._Kc   = 0.002;   // centering force (ring never fully silences)
    this._damp = 0.04;    // velocity damping (bloom "resolves" to hum ~3-5 s)
    this._dt   = 1.0;     // normalised timestep

    // Seed with a quiet 5-fold (5-petal) sinusoid so the bloom is
    // never fully silent and already has a flower-like rest shape.
    for (let i = 0; i < N; i++) {
      const theta = (i / N) * 2 * Math.PI;
      this._r[i] = Math.sin(5 * theta) * 0.06   // 5-petal lobe
                 + Math.sin(theta)      * 0.015;  // gentle fundamental
    }

    this.port.onmessage = (e) => {
      const { type, index, strength } = e.data;
      if (type === 'squeeze') this._applySqueeze(index, strength);
    };
  }

  // Add a smooth Gaussian velocity + displacement bump around index i0
  _applySqueeze(i0, strength) {
    const N = this._N;
    const sigma = N * 0.07;   // ~7% of loop = one petal width
    for (let i = 0; i < N; i++) {
      // Circular distance (wraps around)
      let d = i - i0;
      if (d >  N / 2) d -= N;
      if (d < -N / 2) d += N;
      const g = Math.exp(-(d * d) / (2 * sigma * sigma));
      this._v[i] += strength * g;
      this._r[i] += strength * 0.25 * g;
      if (this._r[i] >  1) this._r[i] =  1;
      if (this._r[i] < -1) this._r[i] = -1;
    }
  }

  // One step of closed-loop mass-spring physics
  _stepPhysics() {
    const N    = this._N;
    const r    = this._r;
    const v    = this._v;
    const Kn   = this._Kn;
    const Kc   = this._Kc;
    const damp = this._damp;
    const dt   = this._dt;

    for (let i = 0; i < N; i++) {
      const prev  = (i - 1 + N) % N;
      const next  = (i + 1)     % N;
      const accel = Kn * (r[prev] + r[next] - 2 * r[i])
                  - Kc * r[i]
                  - damp * v[i];
      v[i] += accel * dt;
      r[i] += v[i]  * dt;
      if (r[i] >  1) { r[i] =  1; v[i] *= -0.15; }
      if (r[i] < -1) { r[i] = -1; v[i] *= -0.15; }
    }
  }

  process(_inputs, outputs, parameters) {
    const out      = outputs[0][0];
    if (!out) return true;

    const N        = this._N;
    const r        = this._r;
    const scanFreq = parameters.scanFreq[0];
    const gain     = parameters.gain[0];
    const dPhase   = scanFreq / sampleRate;

    // One physics step per 128-sample quantum
    this._stepPhysics();

    // Scan the closed loop at audio rate
    for (let n = 0; n < out.length; n++) {
      const pos  = this._phase * N;
      const i0   = Math.floor(pos) % N;
      const i1   = (i0 + 1) % N;
      const frac = pos - Math.floor(pos);
      out[n]     = gain * (r[i0] + frac * (r[i1] - r[i0]));
      this._phase += dPhase;
      if (this._phase >= 1) this._phase -= 1;
    }

    // Report r[] to main thread for visual sync
    this._reportCtr += out.length;
    if (this._reportCtr >= this._reportInterval) {
      this._reportCtr = 0;
      const snap = new Float32Array(r);
      this.port.postMessage({ type: 'state', r: snap }, [snap.buffer]);
    }

    return true;
  }
}

registerProcessor('bloom-processor', BloomProcessor);
`;
