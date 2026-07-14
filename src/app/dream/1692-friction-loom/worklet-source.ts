// AudioWorklet source for the Friction Loom prototype.
//
// This module exports a STRING containing the full source of an
// AudioWorkletProcessor. At runtime we wrap it in a Blob, take a Blob URL
// and load it with `audioContext.audioWorklet.addModule(url)` — no network
// fetch, no external file. Worklet code runs in AudioWorkletGlobalScope with
// NO module system, so everything it needs is inlined below.
//
// ── The physics (a real stick-slip bowed STRING) ───────────────────
// Each string is a digital waveguide: two velocity-wave delay lines (nut
// segment + bridge segment) forming the string, terminated by a sign-
// inverting nut reflection and a lossy one-pole bridge reflection. At the
// bow contact we run the McIntyre / Schumacher / Woodhouse (1983) bow-string
// interaction every sample:
//   1. read the velocity waves arriving at the bow from each side;
//   2. sum them to get the string velocity under the bow;
//   3. delta = bowVelocity - stringVelocity  (the SLIP velocity);
//   4. pass delta through a friction characteristic bowTable(delta): near
//      delta = 0 the bow GRIPS (reflection ~ 1, "stick"); as |delta| grows
//      the hair SLIPS and the reflection collapses toward 0;
//   5. the scattered velocity delta*bowTable(delta) is added to both
//      outgoing waves.
// The grip/slip alternation is self-sustaining Helmholtz motion: a corner
// circulates the loop, and the bow tops up the energy it loses at the
// bridge. Bow SPEED sets loudness/brightness; bow FORCE widens the grip
// (bowTable slope). Light+fast bowing thins toward a surface-scratch /
// whistling harmonic; heavy grip drives raucous multi-slip over-pressure.
// This is the same friction loop Chris Chafe's physical-model bowed strings
// use. It is bounded: the bridge loss (<1) removes energy every loop and
// bowTable's output is clamped to [0,1], so the limit cycle settles instead
// of exploding, and it decays to silence the instant bowing stops.

export const WORKLET_SOURCE = String.raw`
// integer velocity-wave delay line (a string segment) ───────────────
class Delay {
  constructor(maxLen) {
    this.buf = new Float32Array(maxLen);
    this.len = 1;
    this.ptr = 0;
  }
  setDelay(d) {
    let n = Math.floor(d);
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

// bow friction characteristic (STK-style hyperbolic bow table) ──────
// dv = slip velocity, slope shaped by bow force. Returns a reflection
// coefficient in [0,1]: ~1 near dv=0 (stick), collapsing as |dv| grows
// (slip). Higher force -> smaller slope -> grip persists over a wider dv.
function bowTable(dv, slope) {
  let s = (dv + 0.001) * slope;
  s = Math.abs(s) + 0.75;
  s = s * s;
  s = s * s;          // (|s|+0.75)^4
  s = 1 / s;          // ^-4
  return s > 1 ? 1 : s;
}

class BowedString {
  constructor(sampleRate, freq) {
    this.sr = sampleRate;
    // total loop delay = one period, minus a little for the filter delay.
    const base = sampleRate / freq - 2;
    // bow sits ~0.13 of the way from the nut (a bright bowing point).
    const bridgeLen = base * 0.87;
    const nutLen = base * 0.13;
    const maxLen = Math.ceil(sampleRate / 80) + 8; // headroom down to ~80 Hz
    this.bridgeDelay = new Delay(maxLen);
    this.nutDelay = new Delay(maxLen);
    this.bridgeDelay.setDelay(bridgeLen);
    this.nutDelay.setDelay(nutLen);

    // one-pole lossy bridge reflection (string damping + brightness).
    this.bp = 0;
    this.bridgeCoef = 0.62;   // lowpass amount
    this.loss = 0.9965;       // per-reflection loss (<1 -> bounded, decays)

    // gestural controls (smoothed toward targets)
    this.bowVel = 0;
    this.slope = 3.0;
    this.tgtVel = 0;
    this.tgtSlope = 3.0;

    this.amp = 0; // envelope follower for the visuals (0..1)
  }

  setBow(vel, force) {
    // vel: normalised bow speed; force: normalised bow pressure (0..~1.4)
    this.tgtVel = 0.025 + 0.24 * vel;
    // force -> pressure -> slope. pressure in [0.15,1.15]; slope 5-4p.
    const pressure = 0.2 + 0.95 * force;
    let sl = 5.0 - 4.0 * pressure;
    if (sl < 0.7) sl = 0.7; // keep the table monotonic / stable
    this.tgtSlope = sl;
    // when not bowing, let velocity fall to zero so the string decays.
    if (vel < 1e-4) this.tgtVel = 0;
  }

  bridgeReflect(x) {
    this.bp = this.bp + this.bridgeCoef * (x - this.bp);
    return this.bp * this.loss;
  }

  tick(couple) {
    // smooth the gestural controls so they never click.
    this.bowVel += (this.tgtVel - this.bowVel) * 0.01;
    this.slope += (this.tgtSlope - this.slope) * 0.01;

    // sign-inverting reflections at the two string terminations.
    const bridgeRefl = -this.bridgeReflect(this.bridgeDelay.lastOut());
    const nutRefl = -this.nutDelay.lastOut();

    // string velocity under the bow = sum of the two incoming waves.
    const stringVel = bridgeRefl + nutRefl;

    // McIntyre/Schumacher/Woodhouse bow-string interaction.
    const deltaV = this.bowVel - stringVel;
    let newVel = deltaV * bowTable(deltaV, this.slope);
    if (newVel > 2) newVel = 2; else if (newVel < -2) newVel = -2;

    // scatter the friction velocity back into both travelling waves;
    // the couple term is a whiff of bridge cross-talk (sympathetic ring).
    this.nutDelay.tick(bridgeRefl + newVel);
    this.bridgeDelay.tick(nutRefl + newVel + couple);

    let out = this.bridgeDelay.lastOut();
    if (out > 2) out = 2; else if (out < -2) out = -2;

    // envelope follower (fast attack, slow release) for the canvas.
    const a = Math.abs(out) * 5;
    const target = a > 1 ? 1 : a;
    this.amp += (target - this.amp) * (target > this.amp ? 0.05 : 0.004);

    return out;
  }
}

class FrictionLoomProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const cfg = (options && options.processorOptions) || {};
    const freqs = cfg.freqs || [220, 330, 440];
    this.strings = freqs.map((f) => new BowedString(sampleRate, f));
    this.bus = 0;
    this.couple = cfg.couple != null ? cfg.couple : 0.02;
    this.frame = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'bow') {
        const arr = d.bows || [];
        for (let i = 0; i < this.strings.length; i++) {
          const b = arr[i] || { vel: 0, force: 0 };
          this.strings[i].setBow(b.vel, b.force);
        }
      }
    };
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    const chR = out[1] || out[0];
    const n = chL.length;
    const strings = this.strings;
    const ns = strings.length;
    const k = this.couple;

    for (let s = 0; s < n; s++) {
      // couple with the PREVIOUS sample's bus -> stable sympathetic feed.
      const drive = k * this.bus;
      let mix = 0;
      for (let i = 0; i < ns; i++) mix += strings[i].tick(drive);
      this.bus = mix;
      // sum the voices and gently saturate the bus (warm, never harsh).
      let y = Math.tanh(mix * 0.6) * 0.9;
      chL[s] = y;
      chR[s] = y;
    }

    // post per-string amplitudes ~ every 512 samples for the visuals.
    this.frame += n;
    if (this.frame >= 512) {
      this.frame = 0;
      const amps = new Float32Array(ns);
      for (let i = 0; i < ns; i++) amps[i] = strings[i].amp;
      this.port.postMessage({ type: 'amps', amps });
    }
    return true;
  }
}

registerProcessor('friction-loom-processor', FrictionLoomProcessor);
`;
