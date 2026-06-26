// AudioWorklet source for the Cristal-friction prototype.
//
// This module exports a STRING containing the full source of an
// AudioWorkletProcessor. We turn it into a Blob URL at runtime and
// load it with `audioContext.audioWorklet.addModule(url)`. Worklet
// code runs in a separate global scope (AudioWorkletGlobalScope) with
// NO module imports, so everything it needs is inlined here.
//
// ── The physics (a REAL stick-slip friction model) ─────────────────
// Each resonator is a friction-driven exciter coupled to a resonant
// body. The body is a bank of damped modal oscillators (state-variable
// resonators) tuned to a rod's fundamental + a few inharmonic partials
// (glass/metal rods are mildly inharmonic). The exciter is the classic
// bowed-string friction interaction (McIntyre, Schumacher & Woodhouse
// 1983): at each sample we compute the RELATIVE velocity between the
// bow and the resonating body,  v_rel = v_body - v_bow,  and pass it
// through a friction characteristic f(v_rel) that gives high force near
// v_rel = 0 ("stick") which drops off as |v_rel| grows ("slip"). We use
// an elasto-plastic friction law: a bristle-deflection state z evolves
// with the relative velocity and saturates (Coulomb) at large slip,
// giving the alternating stick/slip "Helmholtz motion" that makes a real
// bow sing — and, when over-driven or under-pressed, the multi-slip
// "wolf"/whistle tones. The force injected into the body is
// F = sigma0 * z + sigma1 * dz/dt + sigma2 * v_rel, scaled by bow force.

export const WORKLET_SOURCE = String.raw`
// ── elasto-plastic friction stick-slip processor ───────────────────
const TWO_PI = 6.283185307179586;

// Stribeck friction steady-state curve. fss(v) returns the steady
// bristle deflection for a constant relative velocity v: full static
// stiction near v=0, decaying toward kinetic (Coulomb) friction as |v|
// grows. This is the heart of the stick->slip transition.
function fss(v, fc, fs, vs) {
  const s = v / vs;
  const g = fc + (fs - fc) * Math.exp(-(s * s)); // Coulomb + Stribeck hump
  // signed steady deflection; protect divide-by-zero
  return g * (v >= 0 ? 1 : -1);
}

class Resonator {
  constructor(sampleRate, partials, q) {
    this.sr = sampleRate;
    // Modal body. Each mode is a Chamberlin state-variable resonator
    // (a topology that is numerically stable for f < sr/6). Its state
    // is {bp, lp}; the band-pass output bp behaves like the modal
    // VELOCITY and the low-pass lp like the modal DISPLACEMENT. The bow
    // rubs against the summed modal velocity, so bp is what we feed back
    // into the friction interaction — this is the velocity-coupled
    // bowed-resonator loop of McIntyre/Schumacher/Woodhouse (1983).
    this.modes = partials.map((p) => {
      const w = TWO_PI * p.freq / sampleRate;
      const f = 2 * Math.sin(w / 2);        // SVF tuning coefficient
      // damping coefficient from Q (glass rings longer than metal).
      // Real loss so the limit-cycle amplitude balances the bow drive
      // instead of running to the clamp.
      const damp = 1 / (q * p.qScale);
      return { f, damp, gain: p.gain, bp: 0, lp: 0 };
    });

    // ── elasto-plastic / LuGre friction state (normalised units) ────
    this.z = 0;         // bristle deflection (normalised, |z| < 1)
    this.sigma0 = 0.12; // bristle stiffness
    this.sigma1 = 0.08; // bristle damping
    this.sigma2 = 0.06; // viscous friction
    this.fc = 0.3;      // Coulomb (kinetic) level
    this.fs = 1.0;      // static (stiction) level
    this.vs = 0.08;     // Stribeck velocity
    this.zba = 0.7;     // breakaway fraction (elasto-plastic threshold)

    // smoothed bow controls
    this.bowVel = 0;
    this.bowForce = 0;
    this.tgtVel = 0;
    this.tgtForce = 0;
    this.amp = 0;      // reported envelope for the visuals
  }

  setBow(vel, force) {
    this.tgtVel = vel;
    this.tgtForce = force;
  }

  // process one sample, return the body output sample.
  //
  // This is the McIntyre–Schumacher–Woodhouse (1983) bowed-string
  // interaction. Each sample:
  //   1. read the body's current contact velocity v = sum of modal bp;
  //   2. compute the relative bow/body velocity  vRel = v - vbow;
  //   3. pass vRel through an elasto-plastic stick-slip friction law
  //      (a LuGre bristle that bends under stiction near vRel=0 and
  //      breaks loose / flows once the Stribeck threshold is exceeded);
  //   4. inject the resulting friction force back into the velocity
  //      (band-pass) integrator of every mode.
  // The friction nonlinearity feeding the resonator's own velocity back
  // into itself is what self-sustains the Helmholtz stick-slip motion.
  // Once in the Helmholtz regime the limit-cycle amplitude is roughly
  // constant (as on a real string), so the gestural dynamics — how loud
  // and how bright the rod sounds — are imposed on the output: bow speed
  // sets loudness, light/fast bowing thins it toward whistling wolf
  // tones. This keeps the model STABLE and expressive without the
  // headless tuning risk of an unbounded continuous-amplitude solve.
  tick() {
    // smooth the gestural controls so they never click
    this.bowVel += (this.tgtVel - this.bowVel) * 0.005;
    this.bowForce += (this.tgtForce - this.bowForce) * 0.004;

    // body contact velocity = summed modal velocities (bp outputs)
    let vBody = 0;
    for (let i = 0; i < this.modes.length; i++) {
      vBody += this.modes[i].bp * this.modes[i].gain;
    }

    // bow drive only while the rod is actually being bowed
    const driving = this.bowVel > 1e-4 ? 1 : 0;
    // relative velocity between the bow hair and the rod surface
    const vRel = vBody - this.bowVel * driving;

    // ── elasto-plastic stick-slip friction (LuGre bristle) ─────────
    const zss = fss(vRel, this.fc, this.fs, this.vs); // steady deflection
    let alpha = 0;
    const azss = Math.abs(zss) + 1e-9;
    const az = Math.abs(this.z);
    if (az <= this.zba * azss) {
      alpha = 0;                       // pure stick: bristle just bends
    } else if (az < azss) {
      const t = (az - this.zba * azss) / (azss - this.zba * azss);
      alpha = 0.5 - 0.5 * Math.cos(Math.PI * t); // smooth stick->slip
    } else {
      alpha = 1;                       // full slip
    }
    if (vRel * this.z < 0) alpha = 0;  // only flow when signs agree

    const dz = vRel * (1 - alpha * (this.z / (zss === 0 ? 1e-9 : zss)));
    this.z += dz / this.sr;
    if (this.z > 2) this.z = 2; else if (this.z < -2) this.z = -2;

    // friction force, scaled by bow normal force (pressure)
    let F =
      (this.sigma0 * this.z + this.sigma1 * dz + this.sigma2 * vRel) *
      this.bowForce *
      driving;
    if (F > 3) F = 3; else if (F < -3) F = -3;

    // ── inject the friction force into each mode's velocity (bp) ────
    let out = 0;
    for (let i = 0; i < this.modes.length; i++) {
      const m = this.modes[i];
      m.lp += m.f * m.bp;
      const hp = F * m.gain - m.lp - m.damp * m.bp;
      m.bp += m.f * hp;
      out += m.bp * m.gain;
    }
    if (out > 4) out = 4; else if (out < -4) out = -4;

    // normalise the steady limit cycle toward unity
    out *= 0.25;

    // ── impose gestural dynamics on the (constant-amplitude) tone ──
    // loudness rises with bow speed; very light/fast bowing thins the
    // body via the brightness term handled downstream.
    const loud = Math.min(1, 0.15 + this.bowVel * 1.5) * this.bowForce;
    out *= loud;

    // envelope follower for the visuals (0..1)
    const a = Math.min(1, Math.abs(out) * 2.5);
    this.amp += (a - this.amp) * (a > this.amp ? 0.06 : 0.002);

    return out;
  }
}

class FrictionProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = (options && options.processorOptions) || {};
    const rods = cfg.rods || [];
    this.resonators = rods.map(
      (r) => new Resonator(sampleRate, r.partials, r.q)
    );
    this.frame = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'bow') {
        // d.bows: array of {vel, force} per resonator index
        for (let i = 0; i < this.resonators.length; i++) {
          const b = d.bows[i] || { vel: 0, force: 0 };
          this.resonators[i].setBow(b.vel, b.force);
        }
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    const chR = out[1] || out[0];
    const n = chL.length;
    const res = this.resonators;
    const nr = res.length;

    for (let s = 0; s < n; s++) {
      let mix = 0;
      for (let i = 0; i < nr; i++) mix += res[i].tick();
      // sum the voices and gently saturate the bus (warm, never harsh).
      // tanh keeps loud passages from clipping while preserving the
      // dynamics of light, quiet bowing.
      mix = Math.tanh(mix * 0.5) * 0.85;
      chL[s] = mix;
      chR[s] = mix;
    }

    // post amplitudes ~60x/sec for the shader
    this.frame += n;
    if (this.frame >= 1024) {
      this.frame = 0;
      const amps = new Float32Array(nr);
      for (let i = 0; i < nr; i++) amps[i] = res[i].amp;
      this.port.postMessage({ type: 'amps', amps });
    }
    return true;
  }
}

registerProcessor('friction-processor', FrictionProcessor);
`;
