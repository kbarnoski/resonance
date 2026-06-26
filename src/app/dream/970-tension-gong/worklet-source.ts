// AudioWorklet source for the Tension-Gong prototype.
//
// This module exports a STRING containing the full source of an
// AudioWorkletProcessor. We turn it into a Blob URL at runtime and load
// it with `audioContext.audioWorklet.addModule(url)`. Worklet code runs
// in a separate global scope (AudioWorkletGlobalScope) with NO module
// imports, so EVERYTHING it needs is inlined here.
//
// ── The synthesis: NON-LINEAR modal synthesis ──────────────────────
// Linear modal synthesis is a fixed bank of decaying sine modes: every
// strike of a given body produces the SAME pitch and the SAME timbre.
// Real struck metal does not behave that way. A hard strike on a gong
// starts SHARP and glides DOWN in pitch as it decays (the "bloom"), the
// spectrum shimmers and then clarifies, and harder strikes are both
// brighter and bend more. Those are three NON-LINEAR effects this
// processor models on top of a modal bank:
//
//   1. TENSION MODULATION. Large-amplitude vibration stretches/stiffens
//      the plate, raising its effective tension and therefore its modal
//      frequencies. We compute a running "energy" = sum of squared modal
//      amplitudes, and set each mode's INSTANTANEOUS frequency to
//          f_i(t) = f0_i * (1 + beta_i * energy)
//      so a loud strike rings sharp and glides back down to f0 as the
//      energy bleeds away. This is the characteristic gong pitch glide.
//
//   2. MODE COUPLING. During the loud opening, energy sloshes from the
//      low driven modes into their spectral neighbours (a quadratic
//      nonlinearity in a real plate). We transfer a small amount of each
//      mode's amplitude to its neighbour proportional to the global
//      energy, so the spectrum shimmers up and then settles/clarifies as
//      the coupling term vanishes with the decay.
//
//   3. STRIKE-VELOCITY DEPENDENCE. A harder strike injects more energy
//      into the HIGH modes (brighter attack) and is given a larger beta
//      excursion (bends pitch more). A soft strike stays near the linear
//      pitch and excites mostly the low modes.
//
// Grounded in: "nlm: Real-Time Non-linear Modal Synthesis in Max",
// arXiv:2603.10240 (March 2026), which models tension modulation, pitch
// glide and mode coupling for real-time physical synthesis. The mapping
// here is a faithful, simplified real-time version of that approach.
//
// Each mode is a two-pole (biquad) resonator whose centre frequency is
// re-derived every control block from the live energy, so the pitch
// glide is produced by the SYNTHESIS itself, not by an LFO or envelope
// drawn on top.

export const WORKLET_SOURCE = String.raw`
const TWO_PI = 6.283185307179586;

// One struck-metal body: an inharmonic bank of two-pole modal
// resonators with non-linear tension modulation + mode coupling.
class Body {
  constructor(sampleRate, spec) {
    this.sr = sampleRate;
    // spec.modes: array of { ratio, gain, decay, beta }
    //   ratio  : f0_i / fundamental (INHARMONIC, clustered metal spectrum)
    //   gain   : radiated weight of the mode
    //   decay  : -60 dB time in seconds (higher modes die faster)
    //   beta   : per-mode tension sensitivity (how much it sharpens)
    const f0 = spec.fundamental;
    this.modes = spec.modes.map((m) => {
      return {
        f0: f0 * m.ratio,    // linear (rest) frequency
        gain: m.gain,
        decay: m.decay,
        beta: m.beta,
        // biquad resonator state (transposed direct form II)
        y1: 0, y2: 0,
        // recomputed coefficients (set in updateCoeffs)
        b0: 0, a1: 0, a2: 0, r: 0,
        // running rms-ish amplitude estimate for energy + visuals
        amp: 0,
        // current instantaneous frequency (for the visual pitch strip)
        fInst: f0 * m.ratio,
      };
    });
    this.energy = 0;     // smoothed global modal energy (drives tension)
    this.coupleAmt = spec.couple; // mode-coupling strength for this body
    this.betaScale = 1;  // set per-strike by velocity
    this.makeCoeffs(0);  // initialise at rest
  }

  // Recompute every resonator's biquad coefficients from the current
  // global energy. freq_i = f0_i * (1 + beta_i * betaScale * energy).
  // A two-pole resonator: pole radius r from the decay time, angle from
  // the (now energy-shifted) frequency.
  makeCoeffs(energy) {
    const sr = this.sr;
    for (let i = 0; i < this.modes.length; i++) {
      const m = this.modes[i];
      const f = m.f0 * (1 + m.beta * this.betaScale * energy);
      m.fInst = f;
      const w = TWO_PI * Math.min(f, sr * 0.45) / sr;
      // pole radius for the requested -60 dB decay time
      const r = Math.exp(-6.9077553 / (m.decay * sr));
      m.r = r;
      m.a1 = -2 * r * Math.cos(w);
      m.a2 = r * r;
      // resonator gain ~ (1 - r) keeps peak roughly normalised
      m.b0 = (1 - r * r) * Math.sin(w);
    }
  }

  // inject a strike: distribute energy across modes weighted by velocity.
  // hard strikes (vel→1) push energy into the high modes and bend more.
  strike(vel) {
    this.betaScale = 0.4 + vel * 2.2;       // harder → bigger pitch bend
    const n = this.modes.length;
    for (let i = 0; i < n; i++) {
      const m = this.modes[i];
      const frac = i / (n - 1);             // 0 low .. 1 high
      // soft strikes excite the low modes; hard strikes light the highs.
      const tilt = (1 - frac) + vel * frac * 2.2;
      const kick = (0.6 + vel * 0.9) * tilt * m.gain;
      // impulse into the resonator state (excites the filter ringing)
      m.y1 += kick;
      m.amp = Math.max(m.amp, Math.abs(kick));
    }
    // give the tension term an immediate jolt so the very first block
    // already rings sharp (the "start sharp, glide down" attack).
    this.energy = Math.max(this.energy, (0.4 + vel) * 0.5);
  }

  // process one control block of len samples into out (added).
  render(out, len) {
    const modes = this.modes;
    const nm = modes.length;

    // ── NON-LINEARITY 1: tension modulation ───────────────────────
    // Re-derive all resonator frequencies from the current energy once
    // per block (sample-accurate enough for a glide, far cheaper than
    // per-sample). Energy is the summed squared modal amplitude.
    let e = 0;
    for (let i = 0; i < nm; i++) e += modes[i].amp * modes[i].amp;
    // smooth toward the instantaneous energy (fast attack, slow release)
    const tgt = Math.min(1.5, e * 6);
    this.energy += (tgt - this.energy) * (tgt > this.energy ? 0.5 : 0.06);
    this.makeCoeffs(this.energy);

    for (let s = 0; s < len; s++) {
      let mix = 0;
      for (let i = 0; i < nm; i++) {
        const m = modes[i];
        // two-pole resonator (impulse already in state from strike()).
        // y[n] = b0*x[n] - a1*y[n-1] - a2*y[n-2], here x[n]=0 between
        // strikes so it free-rings; b0 only matters at the impulse but
        // we keep the recurrence simple and feed the impulse via state.
        const y = -m.a1 * m.y1 - m.a2 * m.y2;
        m.y2 = m.y1;
        m.y1 = y;
        mix += y * m.gain;
      }
      out[s] += mix;
    }

    // ── envelope follow + NON-LINEARITY 2: mode coupling ──────────
    // update per-mode amplitude estimates from the block, then slosh a
    // little energy between neighbours while the body is loud. As the
    // global energy decays the coupling vanishes → spectrum clarifies.
    for (let i = 0; i < nm; i++) {
      const m = modes[i];
      const a = Math.abs(m.y1) * 1.0;
      m.amp += (a - m.amp) * (a > m.amp ? 0.3 : 0.02);
    }
    const c = this.coupleAmt * this.energy;
    if (c > 1e-5) {
      for (let i = 0; i < nm - 1; i++) {
        const a = modes[i];
        const b = modes[i + 1];
        // transfer a little of the lower mode's state into its neighbour
        const t = a.y1 * c;
        b.y1 += t;
        a.y1 -= t * 0.5;
      }
    }
  }
}

class GongProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = (options && options.processorOptions) || {};
    this.bodies = (cfg.bodies || []).map((b) => new Body(sampleRate, b));
    this.active = 0;     // index of the currently selected body
    this.block = 128;    // control-block size (re-derive coeffs each block)
    this.frame = 0;
    this.scratch = new Float32Array(this.block);

    this.port.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === 'strike') {
        const idx = d.body == null ? this.active : d.body;
        const body = this.bodies[idx];
        if (body) body.strike(Math.max(0, Math.min(1, d.vel)));
      } else if (d.type === 'select') {
        this.active = d.body;
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    const chR = out[1] || out[0];
    const n = chL.length; // typically 128
    const bodies = this.bodies;
    const nb = bodies.length;

    // clear scratch, sum every body that still has energy
    const scratch = this.scratch;
    for (let s = 0; s < n; s++) scratch[s] = 0;
    for (let i = 0; i < nb; i++) bodies[i].render(scratch, n);

    for (let s = 0; s < n; s++) {
      // gentle tanh bus saturation — warm, never harsh, click-free
      const v = Math.tanh(scratch[s] * 0.6) * 0.8;
      chL[s] = v;
      chR[s] = v;
    }

    // post per-mode amplitude + instantaneous frequency of the ACTIVE
    // body to the UI ~ every 1024 samples (~60fps) for the visuals.
    this.frame += n;
    if (this.frame >= 1024) {
      this.frame = 0;
      const body = bodies[this.active];
      if (body) {
        const nm = body.modes.length;
        const amps = new Float32Array(nm);
        const freqs = new Float32Array(nm);
        for (let i = 0; i < nm; i++) {
          amps[i] = body.modes[i].amp;
          freqs[i] = body.modes[i].fInst;
        }
        this.port.postMessage({
          type: 'state',
          active: this.active,
          amps,
          freqs,
          energy: body.energy,
        });
      }
    }
    return true;
  }
}

registerProcessor('gong-processor', GongProcessor);
`;
