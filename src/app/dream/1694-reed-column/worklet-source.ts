// AudioWorklet source for 1694 · Reed Column (a single-reed / CLARINET model).
//
// This module exports a STRING containing the full source of an
// AudioWorkletProcessor. At runtime the page wraps it in a Blob, takes a Blob
// URL and loads it with `audioContext.audioWorklet.addModule(url)` — no network
// fetch, no external file. Worklet code runs in AudioWorkletGlobalScope with NO
// module system, so everything it needs is inlined below.
//
// ── The physics (a real self-oscillating single-reed woodwind) ─────────────
// The instrument is a 1-D DIGITAL WAVEGUIDE clarinet (Julius O. Smith; Perry
// Cook's STK Clarinet; the reed law of McIntyre / Schumacher / Woodhouse 1983):
//
//   * BORE: one velocity/pressure delay line. Because a clarinet bore is
//     CYLINDRICAL and closed at the reed / open at the bell, its round trip is
//     terminated by a SIGN-INVERTING, lossy reflection at the bell (a one-pole
//     lowpass loss filter, coefficient < 1) and by the reed reflection at the
//     mouthpiece. A cylinder closed at one end supports ODD harmonics
//     (f, 3f, 5f...), which is why the tone is hollow and why it overblows to
//     the THIRD harmonic — a TWELFTH, not an octave.
//
//   * REED (the heart): every sample we form the pressure difference across
//     the reed, dp = reflectedBore - pMouth, and look it up in a nonlinear
//     REED TABLE r = offset + slope*dp (clamped to [-1, 1], STK form). As the
//     blowing pressure rises the reed closes (r falls), and this
//     pressure-controlled nonlinearity is what makes the column SELF-OSCILLATE:
//     the reflected pressure that re-enters the bore is
//         pMouth + dp * reedTable(dp).
//     Below a breath threshold there is no oscillation at all (SILENT — no
//     drone). Above it the column speaks; the pitch is set purely by the bore
//     delay length, NOT by the breath — the breath only supplies energy.
//
//   * OVERBLOW / REGISTER VENT: on a real clarinet the register key opens a
//     small vent that forces a pressure node and promotes the 3rd mode, so the
//     note jumps up a twelfth. We model that vent with hysteresis on the
//     (smoothed) blowing pressure: blow past the overblow threshold and the
//     loop retunes to 1/3 its length (glided, so it does not click), sounding
//     the 3rd harmonic — the signature clarinet twelfth. The reed's own breath
//     is held inside its speaking window so hard blowing OVERBLOWS rather than
//     just choking the reed shut.
//
// Bounded by construction: the bell loss (< 1) removes energy each round trip,
// the reed table output is clamped to [-1, 1], the injected pressure is
// clamped, and the summed output is tanh-saturated — so the limit cycle settles
// instead of exploding and decays to silence the instant the breath drops.

export const WORKLET_SOURCE = String.raw`
// integer delay line (the cylindrical bore) ─────────────────────────────────
class DelayLine {
  constructor(maxLen) {
    this.buf = new Float32Array(maxLen);
    this.len = 1;
    this.ptr = 0;
  }
  setDelay(d) {
    let n = Math.round(d);
    if (n < 1) n = 1;
    if (n >= this.buf.length) n = this.buf.length - 1;
    this.len = n;
  }
  lastOut() {
    return this.buf[this.ptr];
  }
  tick(input) {
    const out = this.buf[this.ptr];
    this.buf[this.ptr] = input;
    this.ptr = this.ptr + 1;
    if (this.ptr >= this.len) this.ptr = 0;
    return out;
  }
}

// STK-style reed table: reflection coefficient as a linear function of the
// pressure difference across the reed, clamped to [-1, 1]. offset ~0.7 (reed
// open at rest); slope < 0 (reed CLOSES as blowing pressure rises).
function reedTable(dp, offset, slope) {
  let r = offset + slope * dp;
  if (r > 1) r = 1; else if (r < -1) r = -1;
  return r;
}

class ReedColumn {
  constructor(sampleRate, freq) {
    this.sr = sampleRate;
    this.comp = 1.0;                       // phase-delay compensation (samples)
    this.maxLen = Math.ceil(0.5 * sampleRate / 60) + 8; // headroom to ~60 Hz
    this.bore = new DelayLine(this.maxLen);
    this.freq = freq;
    this.periodDelay = 0.5 * sampleRate / freq - this.comp;
    this.curDelay = this.periodDelay;
    this.bore.setDelay(this.curDelay);

    // bell termination: one-pole lowpass loss, then sign-inverting reflection.
    this.lp = 0;
    this.lpG = 0.35;      // lowpass amount (bore brightness / bell damping)
    this.reflCoef = 0.95; // < 1 -> lossy, bounded

    // reed nonlinearity coefficients (STK clarinet defaults).
    this.offset = 0.7;
    this.slope = -0.44;

    // control state (smoothed) + register vent.
    this.p = 0; this.tgtP = 0;
    this.over = false;

    // output conditioning + visual envelope.
    this.dcx = 0; this.dcy = 0;
    this.amp = 0;
  }

  setPressure(p) { this.tgtP = p < 0 ? 0 : (p > 1 ? 1 : p); }
  setFreq(f) {
    if (f < 60) f = 60;
    this.freq = f;
    this.periodDelay = 0.5 * this.sr / f - this.comp;
  }

  tick() {
    // smooth the blowing pressure so the breath envelope never clicks.
    this.p += (this.tgtP - this.p) * 0.002;

    // register vent: latch to the 3rd mode above the overblow threshold,
    // release below (hysteresis) -> the clarinet twelfth.
    if (!this.over && this.p > 0.72) this.over = true;
    if (this.over && this.p < 0.5) this.over = false;
    const target = this.over ? this.periodDelay / 3 : this.periodDelay;
    // glide the loop length so the register change is a swoop, not a pop.
    this.curDelay += (target - this.curDelay) * 0.0008;
    this.bore.setDelay(this.curDelay);

    // map the control pressure into the reed's SPEAKING WINDOW
    // (~0.40 onset .. ~0.66 shut). p<=0 -> genuinely no breath -> silence.
    const breath = this.p <= 0 ? 0 : 0.3 + 0.34 * this.p;

    // one round trip: read the bore, filter + invert at the bell.
    const boreOut = this.bore.lastOut();
    this.lp = (1 - this.lpG) * boreOut + this.lpG * this.lp;
    const reflected = -this.reflCoef * this.lp;

    // pressure difference across the reed, then the nonlinear reed lookup.
    const dp = reflected - breath;
    const r = reedTable(dp, this.offset, this.slope);
    let inject = breath + dp * r;   // pressure re-entering the bore
    if (inject > 1) inject = 1; else if (inject < -1) inject = -1;
    this.bore.tick(inject);

    // audible signal = mouthpiece pressure, DC-blocked.
    const y = boreOut - this.dcx + 0.995 * this.dcy;
    this.dcx = boreOut; this.dcy = y;

    // envelope follower (fast attack / slow release) for the canvas meter.
    const a = Math.abs(y);
    this.amp += (a - this.amp) * (a > this.amp ? 0.02 : 0.0006);
    return y;
  }

  // snapshot the bore into N points (the live standing pressure wave in the
  // tube) — read in play order from the current write pointer.
  snapshot(out) {
    const N = out.length;
    const len = this.bore.len;
    const buf = this.bore.buf;
    const start = this.bore.ptr;
    for (let i = 0; i < N; i++) {
      const idx = (start + Math.floor((i / N) * len)) % len;
      out[i] = buf[idx];
    }
  }
}

class ReedColumnProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = (options && options.processorOptions) || {};
    const freq = cfg.freq || 196;
    this.col = new ReedColumn(sampleRate, freq);
    this.frame = 0;
    this.viz = new Float32Array(120);
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'ctl') {
        if (typeof d.pressure === 'number') this.col.setPressure(d.pressure);
        if (typeof d.freq === 'number') this.col.setFreq(d.freq);
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    const chR = out[1] || out[0];
    const n = chL.length;
    const col = this.col;

    for (let s = 0; s < n; s++) {
      const raw = col.tick();
      // warm, bounded saturation — the model can never blow up the master.
      const y = Math.tanh(raw * 1.3) * 0.8;
      chL[s] = y;
      chR[s] = y;
    }

    // post the live standing wave + state ~ every 1024 samples for the visuals.
    this.frame += n;
    if (this.frame >= 1024) {
      this.frame = 0;
      col.snapshot(this.viz);
      this.port.postMessage({
        type: 'viz',
        wave: this.viz.slice(0),
        amp: col.amp,
        over: col.over,
        pressure: col.p,
        freq: col.freq,
      });
    }
    return true;
  }
}

registerProcessor('reed-column-processor', ReedColumnProcessor);
`;
