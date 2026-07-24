// AudioWorklet source for the Khoomei (biphonic / sygyt) prototype.
//
// This module exports a STRING holding the full source of an
// AudioWorkletProcessor. At runtime the page wraps it in a Blob, takes a Blob
// URL and loads it with `audioContext.audioWorklet.addModule(url)` — no network
// fetch, no external file. Worklet code runs in AudioWorkletGlobalScope with no
// module system, so everything it needs is inlined below.
//
// ── The physics: a Kelly–Lochbaum digital-waveguide vocal tract ─────────────
// The tract is an array of N ~= 44 cylindrical sections. Each section i has a
// diameter d[i] and a cross-sectional area A[i] = d[i]^2. Sound travels the
// tube as two counter-propagating sample streams — a rightward wave R[i] and a
// leftward wave L[i]. At every junction between adjacent sections the change of
// area partially reflects and partially transmits the waves; the one-multiply
// Kelly–Lochbaum (1962) scattering junction with reflection coefficient
//   k[i] = (A[i-1] - A[i]) / (A[i-1] + A[i])
// gives the canonical, passive (hence stable) update
//   w        = k[i] * (R[i-1] + L[i])
//   Rout[i]  = R[i-1] - w
//   Lout[i]  = L[i]   + w
// The glottis end (i=0) reflects ~0.75 and injects a sustained DRONE glottal
// pulse train at a continuous f0; the lip end (i=N-1) radiates with reflection
// ~ -0.85. This is exactly the model behind Neil Thapen's *Pink Trombone*.
//
// ── The biphonic (sygyt) trick ──────────────────────────────────────────────
// The tract is a source-FILTER: the glottal drone is rich in harmonics
// (f0, 2f0, 3f0, ...) and the tube's resonances (formants) boost whichever
// harmonics fall near them. If we squeeze ONE section to a near-pinch we create
// a tight front cavity whose quarter-wave resonance is sharp and narrow — it
// isolates and amplifies a single harmonic. Sliding that constriction toward
// the lips shortens the front cavity and raises the resonance, so the boosted
// harmonic climbs the series (5f0 -> 6f0 -> 7f0 ...): a bright whistle rising
// over the steady drone. That is the two-pitch khoomei / sygyt effect, produced
// entirely by the physical tube. See arXiv:2606.04943 (differentiable
// articulatory copy-synthesis of biphonic singing, 2026), which fits exactly
// this KL waveguide to real sygyt recordings.
//
// Control parameters (f0, constriction section index, constriction diameter)
// are lerped per-sample so the whistle GLIDES instead of stepping. The loop is
// passive with per-section damping < 1, so it settles rather than blows up; the
// output is DC-blocked, soft-clipped and gated for click-free starts.

export const WORKLET_SOURCE = String.raw`
const N = 44;
const OVERSAMPLE = 2;                 // sub-steps per audio sample (bandwidth + stability)
const GLOTTAL_REFLECTION = 0.75;
const LIP_REFLECTION = -0.85;
const DAMP = 0.9995;                  // per-section loss keeps the network bounded

class KhoomeiTractProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // travelling waves + junction scratch buffers
    this.R = new Float32Array(N);
    this.L = new Float32Array(N);
    this.jR = new Float32Array(N + 1);
    this.jL = new Float32Array(N + 1);
    // tube geometry
    this.diameter = new Float32Array(N);
    this.A = new Float32Array(N);
    this.k = new Float32Array(N);      // reflection[i], valid for i = 1..N-1

    // control targets + smoothed (glide) values
    this.f0 = 130;        this.f0T = 130;
    this.tongue = 28;     this.tongueT = 28;      // constriction section index (fractional)
    this.constrict = 0.5; this.constrictT = 0.5;  // constriction diameter (small = tight/piercing)
    this.gain = 0;        this.gainT = 0;         // click-free gate

    this.phase = 0;       // glottal phase [0,1)
    this.dcx = 0; this.dcy = 0;                   // DC-block state

    this.port.onmessage = (e) => {
      const d = e.data;
      if (!d || d.type !== 'params') return;
      if (typeof d.f0 === 'number') this.f0T = d.f0;
      if (typeof d.tongue === 'number') this.tongueT = d.tongue;
      if (typeof d.constrict === 'number') this.constrictT = d.constrict;
      if (typeof d.active === 'number') this.gainT = d.active;
    };
  }

  // rebuild diameters -> areas -> reflection coefficients from current controls
  shapeTract() {
    const width = 2.6;                            // constriction well half-width in sections
    for (let i = 0; i < N; i++) {
      let base = 2.6;                             // open tract
      if (i < 4) base = 1.0 + 0.4 * i;            // gentle glottal taper
      const dist = i - this.tongue;
      const well = Math.exp(-(dist * dist) / (2 * width * width));
      let dia = base - (base - this.constrict) * well;
      if (dia < 0.05) dia = 0.05;
      this.diameter[i] = dia;
      this.A[i] = dia * dia;
    }
    for (let i = 1; i < N; i++) {
      const s = this.A[i - 1] + this.A[i];
      this.k[i] = s > 1e-6 ? (this.A[i - 1] - this.A[i]) / s : 0;
    }
  }

  // Rosenberg-style asymmetric glottal pulse — harmonically rich drone source
  glottal(t) {
    const te = 0.62;                              // open quotient
    const tp = te * 0.62;                         // instant of peak flow
    let g;
    if (t < tp) g = 0.5 * (1 - Math.cos(Math.PI * t / tp));
    else if (t < te) g = Math.cos(0.5 * Math.PI * (t - tp) / (te - tp));
    else g = 0;
    return g - 0.28;                              // rough DC removal (dc-block finishes it)
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const chL = out[0];
    const chR = out.length > 1 ? out[1] : null;
    const sr = sampleRate;
    const n = chL.length;
    const glide = 0.0009;                         // per-sample lerp for pitch / constriction
    const gGate = 0.0016;

    for (let s = 0; s < n; s++) {
      // smooth (glide) all controls per-sample so the whistle slides
      this.f0 += (this.f0T - this.f0) * glide;
      this.tongue += (this.tongueT - this.tongue) * glide;
      this.constrict += (this.constrictT - this.constrict) * glide;
      this.gain += (this.gainT - this.gain) * gGate;

      this.shapeTract();

      // sustained glottal drone
      this.phase += this.f0 / sr;
      if (this.phase >= 1) this.phase -= 1;
      const exc = this.glottal(this.phase) * 0.9;

      // run the KL scattering network OVERSAMPLE times per output sample
      let lipOut = 0;
      for (let os = 0; os < OVERSAMPLE; os++) {
        this.jR[0] = this.L[0] * GLOTTAL_REFLECTION + exc;
        this.jL[N] = this.R[N - 1] * LIP_REFLECTION;
        for (let i = 1; i < N; i++) {
          const w = this.k[i] * (this.R[i - 1] + this.L[i]);
          this.jR[i] = this.R[i - 1] - w;
          this.jL[i] = this.L[i] + w;
        }
        for (let i = 0; i < N; i++) {
          this.R[i] = this.jR[i] * DAMP;
          this.L[i] = this.jL[i + 1] * DAMP;
        }
        lipOut += this.R[N - 1];
      }
      lipOut *= 1 / OVERSAMPLE;

      // DC-block (one-pole high-pass)
      const y = lipOut - this.dcx + 0.996 * this.dcy;
      this.dcx = lipOut;
      this.dcy = y;

      // gate + soft clip
      let v = y * 2.2 * this.gain;
      v = Math.tanh(v * 1.4) * 0.62;

      chL[s] = v;
      if (chR) chR[s] = v;
    }
    return true;
  }
}

registerProcessor('khoomei-tract-processor', KhoomeiTractProcessor);
`;
