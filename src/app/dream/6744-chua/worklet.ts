// ════════════════════════════════════════════════════════════════════════════
// AudioWorklet processor source, as a plain string.
//
// THE POINT OF THE PROTOTYPE: this code runs on the audio RENDER thread. It
// integrates Chua's circuit once PER AUDIO SAMPLE (RK4), and the resulting
// trajectory IS the waveform — x → left, y → right — DC-blocked and soft-clipped
// so it is always safe to listen to. Raising `alpha` walks the period-doubling
// route to chaos, which you hear as pure tone → subharmonics → broadband band.
//
// It also (a) estimates the largest Lyapunov exponent live via a shadow
// trajectory with periodic renormalisation, and (b) posts a downsampled ring
// buffer of (x,y,z) up to the main thread for the DOM phase-space plot. No
// SharedArrayBuffer (COOP/COEP not available) — just port.postMessage.
//
// Kept as a template-literal string so TypeScript never type-checks the
// worklet-global identifiers (sampleRate, registerProcessor, AudioWorkletProcessor).
// ════════════════════════════════════════════════════════════════════════════

export const PROCESSOR_NAME = "chua-processor";

export const PROCESSOR_SOURCE = /* js */ `
class ChuaProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'alpha', defaultValue: 15.6, minValue: 0.1, maxValue: 30, automationRate: 'k-rate' },
      { name: 'beta',  defaultValue: 28,   minValue: 1,   maxValue: 60, automationRate: 'k-rate' },
      { name: 'm0',    defaultValue: -1.143, minValue: -2, maxValue: -0.3, automationRate: 'k-rate' },
      { name: 'm1',    defaultValue: -0.714, minValue: -2, maxValue: -0.1, automationRate: 'k-rate' },
      { name: 'dt',    defaultValue: 0.0038, minValue: 0.0004, maxValue: 0.02, automationRate: 'k-rate' },
      { name: 'gain',  defaultValue: 0.7,  minValue: 0,   maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    // Main trajectory (kept away from the origin so it settles onto the attractor).
    this.s = { x: 0.15, y: 0.02, z: 0.0 };
    // Shadow trajectory for the Lyapunov estimate.
    this.d0 = 1e-7;
    this.sh = { x: 0.15 + this.d0, y: 0.02, z: 0.0 };
    this.lyapSum = 0;
    this.lyapCount = 0;
    // DC-block state (one-pole high-pass) per channel.
    this.dcxIn = 0; this.dcxOut = 0;
    this.dcyIn = 0; this.dcyOut = 0;
    // Downsampled snapshot ring buffer for the visual.
    this.snapEvery = 48;        // capture 1 of every N samples
    this.snapCounter = 0;
    this.snapCap = 220;         // points per posted batch
    this.snap = new Float32Array(this.snapCap * 3);
    this.snapLen = 0;
    this.frozen = false;        // A/B freeze-orbit toggle
    this.frozenState = null;

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'freeze') {
        this.frozen = !!d.value;
        if (this.frozen) {
          this.frozenState = { x: this.s.x, y: this.s.y, z: this.s.z };
        }
      } else if (d.type === 'reseed') {
        this.s = { x: d.x || 0.15, y: d.y || 0.02, z: d.z || 0.0 };
        this.sh = { x: this.s.x + this.d0, y: this.s.y, z: this.s.z };
        this.lyapSum = 0; this.lyapCount = 0;
      }
    };
  }

  deriv(x, y, z, alpha, beta, m0, m1) {
    const fx = m1 * x + 0.5 * (m0 - m1) * (Math.abs(x + 1) - Math.abs(x - 1));
    return [alpha * (y - x - fx), x - y + z, -beta * y];
  }

  rk4(s, dt, alpha, beta, m0, m1) {
    const k1 = this.deriv(s.x, s.y, s.z, alpha, beta, m0, m1);
    const k2 = this.deriv(s.x + 0.5*dt*k1[0], s.y + 0.5*dt*k1[1], s.z + 0.5*dt*k1[2], alpha, beta, m0, m1);
    const k3 = this.deriv(s.x + 0.5*dt*k2[0], s.y + 0.5*dt*k2[1], s.z + 0.5*dt*k2[2], alpha, beta, m0, m1);
    const k4 = this.deriv(s.x + dt*k3[0], s.y + dt*k3[1], s.z + dt*k3[2], alpha, beta, m0, m1);
    s.x += (dt/6)*(k1[0] + 2*k2[0] + 2*k3[0] + k4[0]);
    s.y += (dt/6)*(k1[1] + 2*k2[1] + 2*k3[1] + k4[1]);
    s.z += (dt/6)*(k1[2] + 2*k2[2] + 2*k3[2] + k4[2]);
  }

  process(_inputs, outputs, params) {
    const out = outputs[0];
    if (!out || out.length < 1) return true;
    const L = out[0];
    const R = out.length > 1 ? out[1] : out[0];
    const n = L.length;

    const alpha = params.alpha[0];
    const beta = params.beta[0];
    const m0 = params.m0[0];
    const m1 = params.m1[0];
    const dt = params.dt[0];
    const gain = params.gain[0];

    // channel output scaling (x has larger swing than y).
    const sx = 0.42;
    const sy = 0.9;

    for (let i = 0; i < n; i++) {
      if (this.frozen && this.frozenState) {
        // Hold the orbit: keep integrating but around the frozen snapshot so the
        // A/B compare freezes the current regime's sound/shape.
        this.rk4(this.s, dt, alpha, beta, m0, m1);
      } else {
        this.rk4(this.s, dt, alpha, beta, m0, m1);
        // Advance the shadow trajectory in lock-step for the Lyapunov estimate.
        this.rk4(this.sh, dt, alpha, beta, m0, m1);
      }

      const x = this.s.x;
      const y = this.s.y;
      const z = this.s.z;

      // DC block (one-pole high-pass, R=0.995) then soft-clip.
      this.dcxOut = x - this.dcxIn + 0.995 * this.dcxOut; this.dcxIn = x;
      this.dcyOut = y - this.dcyIn + 0.995 * this.dcyOut; this.dcyIn = y;
      let l = Math.tanh(this.dcxOut * sx) * gain;
      let r = Math.tanh(this.dcyOut * sy) * gain;
      // Final safety hard-limit.
      if (l > 1) l = 1; else if (l < -1) l = -1;
      if (r > 1) r = 1; else if (r < -1) r = -1;
      L[i] = l;
      R[i] = r;

      // Lyapunov: renormalise the shadow every 32 samples, accumulate log-growth.
      if (!this.frozen && (this.snapCounter & 31) === 0) {
        const ex = this.sh.x - this.s.x;
        const ey = this.sh.y - this.s.y;
        const ez = this.sh.z - this.s.z;
        const d = Math.sqrt(ex*ex + ey*ey + ez*ez);
        if (d > 0) {
          this.lyapSum += Math.log(d / this.d0);
          this.lyapCount++;
          const scale = this.d0 / d;
          this.sh.x = this.s.x + ex * scale;
          this.sh.y = this.s.y + ey * scale;
          this.sh.z = this.s.z + ez * scale;
        }
      }

      // Downsample snapshot capture.
      if (this.snapCounter % this.snapEvery === 0 && this.snapLen < this.snapCap) {
        const b = this.snapLen * 3;
        this.snap[b] = x; this.snap[b+1] = y; this.snap[b+2] = z;
        this.snapLen++;
      }
      this.snapCounter++;

      if (this.snapLen >= this.snapCap) {
        // Largest-Lyapunov estimate in units of 1/(dimensionless time).
        const renormDt = 32 * dt;
        const lyap = this.lyapCount > 0 ? (this.lyapSum / (this.lyapCount * renormDt)) : 0;
        const batch = this.snap.slice(0, this.snapLen * 3);
        this.port.postMessage(
          { type: 'snap', data: batch, count: this.snapLen, lyap: lyap },
          [batch.buffer]
        );
        this.snapLen = 0;
        // gentle decay so the estimate tracks parameter changes
        this.lyapSum *= 0.5; this.lyapCount = Math.floor(this.lyapCount * 0.5);
      }

      // NaN guard — if the integrator ever blows up, re-seed onto the attractor.
      if (!Number.isFinite(this.s.x) || Math.abs(this.s.x) > 1e3) {
        this.s = { x: 0.15, y: 0.02, z: 0.0 };
        this.sh = { x: 0.15 + this.d0, y: 0.02, z: 0.0 };
        this.dcxIn = this.dcxOut = this.dcyIn = this.dcyOut = 0;
      }
    }
    return true;
  }
}

registerProcessor('${PROCESSOR_NAME}', ChuaProcessor);
`;
