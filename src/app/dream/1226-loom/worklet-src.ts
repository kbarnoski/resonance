// ─────────────────────────────────────────────────────────────────────────────
// worklet-src.ts — AudioWorkletProcessor source, inlined as a string so it can
// be turned into a Blob URL and loaded via audioCtx.audioWorklet.addModule().
// (Same blob-URL-worklet idiom used by dream/475-resonant-room.)
//
// The processor holds the CURRENT 128-sample wavetable (pushed from the main
// thread every animation frame — the live moving physical shape of the ring).
// Each voice is a phase accumulator that scans around that table at the note's
// pitch frequency (phase 0..1 → linearly interpolated lookup), so the timbre
// morphs continuously as the ring wobbles. Bounded polyphony with voice-steal.
// ─────────────────────────────────────────────────────────────────────────────

export const LOOM_WORKLET_SRC = /* js */ `
class LoomProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._N = 128;
    this._table = new Float32Array(this._N);
    this._SR = sampleRate;
    this._master = 0.0001;
    this._masterTarget = 0.9;

    this._MAX = 12;
    this._voices = [];
    for (let i = 0; i < this._MAX; i++) {
      this._voices.push({
        active: false, freq: 220, phase: 0, env: 0,
        attacking: false, attackInc: 0, decay: 0.9999, id: -1,
      });
    }

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'table') {
        this._table.set(d.table);
      } else if (d.type === 'noteOn') {
        this._noteOn(d.freq);
      } else if (d.type === 'master') {
        this._masterTarget = d.value;
      }
    };
  }

  _noteOn(freq) {
    let v = null;
    for (let i = 0; i < this._voices.length; i++) {
      if (!this._voices[i].active) { v = this._voices[i]; break; }
    }
    if (!v) {
      // steal the quietest voice
      v = this._voices[0];
      for (let i = 1; i < this._voices.length; i++) {
        if (this._voices[i].env < v.env) v = this._voices[i];
      }
    }
    v.active = true;
    v.freq = freq;
    v.phase = 0;
    v.env = 0;
    v.attacking = true;
    v.attackInc = 1 / (this._SR * 0.006); // ~6ms attack
    v.decay = Math.exp(-1 / (this._SR * 2.6)); // ~2.6s pluck decay
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    const chR = out[1] || out[0];
    const N = this._N;
    const table = this._table;
    const len = chL.length;

    for (let s = 0; s < len; s++) {
      this._master += (this._masterTarget - this._master) * 0.0005;
      let acc = 0;
      for (let vi = 0; vi < this._voices.length; vi++) {
        const v = this._voices[vi];
        if (!v.active) continue;

        const p = v.phase * N;
        const i0 = p | 0;
        const frac = p - i0;
        const i1 = i0 + 1 >= N ? 0 : i0 + 1;
        const sVal = table[i0] * (1 - frac) + table[i1] * frac;

        if (v.attacking) {
          v.env += v.attackInc;
          if (v.env >= 1) { v.env = 1; v.attacking = false; }
        } else {
          v.env *= v.decay;
          if (v.env < 0.0006) { v.active = false; continue; }
        }

        acc += sVal * v.env;
        v.phase += v.freq / this._SR;
        if (v.phase >= 1) v.phase -= 1;
      }

      acc *= 0.22 * this._master;
      const y = Math.tanh(acc * 1.2); // gentle soft-clip safety
      chL[s] = y;
      if (chR !== chL) chR[s] = y;
    }
    return true;
  }
}
registerProcessor('loom-processor', LoomProcessor);
`;
