// ── 3192-bow · AudioWorklet processor source ──────────────────────────────
// Exported as a string so it can be loaded from a Blob URL (no /public file is
// permitted under the dream-folder scope fence). This is the sample-rate
// friction loop of the bowed-string waveguide — the same algorithm as the
// BowedString class in string.ts, inlined because a worklet cannot import.
// Keep the two in sync. See string.ts for the full commentary on the model
// (McIntyre, Woodhouse & Schumacher, JASA 1983).

export const WORKLET_SOURCE = `
"use strict";

class DelayLine {
  constructor(maxLen) {
    let n = 4;
    while (n < maxLen) n <<= 1;
    this.buf = new Float32Array(n);
    this.mask = n - 1;
    this.writeIdx = 0;
    this.delay = 2;
  }
  setDelay(d) {
    const max = this.buf.length - 2;
    this.delay = d < 1 ? 1 : d > max ? max : d;
  }
  read() {
    const readPos = this.writeIdx - this.delay + this.buf.length;
    const i0 = Math.floor(readPos);
    const frac = readPos - i0;
    const a = this.buf[i0 & this.mask];
    const b = this.buf[(i0 + 1) & this.mask];
    return a + (b - a) * frac;
  }
  write(x) {
    this.buf[this.writeIdx & this.mask] = x < -3 ? -3 : x > 3 ? 3 : x;
    this.writeIdx = (this.writeIdx + 1) & this.mask;
  }
  clear() { this.buf.fill(0); }
}

function bowFriction(deltaV, slope) {
  const sample = (deltaV + 0.001) * slope;
  let v = Math.abs(sample) + 0.75;
  v = v * v;
  v = v * v;
  v = 1 / v;
  return v > 1 ? 1 : v;
}

class BowedStringProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    this.sr = sampleRate;
    this.bridge = new DelayLine(2048);
    this.neck = new DelayLine(2048);
    this.filtState = 0;
    this.dcX = 0;
    this.dcY = 0;
    this.tMaxVel = 0;
    this.tSlope = 3;
    this.tForce = 0;
    this.cMaxVel = 0;
    this.cSlope = 3;
    this.cForce = 0;
    this.cActive = 0;
    this.outputGain = 2.4;
    this.noiseState = 0x31920b70 >>> 0;
    this.rmsAccum = 0;
    this.rmsCount = 0;
    this.setFrequency(196);

    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === "init") {
        if (m.outputGain) this.outputGain = m.outputGain;
        if (m.freq) this.setFrequency(m.freq);
      } else if (m.type === "params") {
        this.tMaxVel = m.maxVel;
        this.tSlope = m.slope;
        this.tForce = m.force;
        this.cActive = m.active ? 1 : 0;
      } else if (m.type === "freq") {
        this.setFrequency(m.freq);
      }
    };
  }

  setFrequency(freq) {
    const total = this.sr / freq - 2;
    const beta = 0.12;
    this.bridge.setDelay(Math.max(2, total * beta));
    this.neck.setDelay(Math.max(2, total * (1 - beta)));
  }

  noise() {
    let x = this.noiseState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseState = x >>> 0;
    return (this.noiseState / 0xffffffff) * 2 - 1;
  }

  step() {
    this.cMaxVel += 0.002 * (this.tMaxVel - this.cMaxVel);
    this.cSlope += 0.002 * (this.tSlope - this.cSlope);
    this.cForce += 0.002 * (this.tForce - this.cForce);
    const bowVel = this.cMaxVel * this.cActive;
    const force = this.cForce;
    const bridgeGain = Math.min(1.0, 0.88 + force * 0.135);
    const rough = Math.max(0, force - 0.7) * 3.0 * this.cActive;

    const neckOut = this.neck.read();
    this.filtState = 0.7 * neckOut + 0.3 * this.filtState;
    const bridgeRefl = -bridgeGain * this.filtState;
    const nutRefl = -0.997 * this.bridge.read();
    const stringVel = bridgeRefl + nutRefl;

    const deltaV = bowVel - stringVel;
    const coeff = bowFriction(deltaV, this.cSlope);
    const scratch = this.noise() * 0.06 * (1 - coeff) * bowVel;
    let newVel = deltaV * coeff + scratch;
    if (rough > 0) {
      newVel += this.noise() * rough * (0.15 + 0.5 * Math.abs(stringVel));
    }
    if (newVel > 1) newVel = 1;
    else if (newVel < -1) newVel = -1;

    this.neck.write(nutRefl + newVel);
    this.bridge.write(bridgeRefl + newVel);

    const x = bridgeRefl;
    this.dcY = x - this.dcX + 0.995 * this.dcY;
    this.dcX = x;
    return this.dcY;
  }

  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    for (let i = 0; i < out.length; i++) {
      let s = this.step() * this.outputGain;
      if (s > 1) s = 1;
      else if (s < -1) s = -1;
      out[i] = s;
      this.rmsAccum += s * s;
    }
    this.rmsCount += out.length;
    // report level ~30x/sec for the UI meter
    if (this.rmsCount >= this.sr / 30) {
      this.port.postMessage({ rms: Math.sqrt(this.rmsAccum / this.rmsCount) });
      this.rmsAccum = 0;
      this.rmsCount = 0;
    }
    return true;
  }
}

registerProcessor("bowed-string-processor", BowedStringProcessor);
`;
