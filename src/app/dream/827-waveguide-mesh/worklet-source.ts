// ── Waveguide Mesh · AudioWorklet source ───────────────────────────────────
// Exported as a string so it loads via Blob URL (no /public file needed).
//
// This processor runs a REAL 2-D finite-difference wave-equation membrane at
// the audio sample rate. Each audio sample advances the whole grid one FDTD
// step:
//
//     u_next = 2u - u_prev + C^2 * laplacian(u)   (then * damping)
//
// with fixed (clamped) boundaries — the rim of a drumhead. A strike injects a
// localized Gaussian bump of energy into u; that energy physically spreads,
// reflects off the four edges and interferes with itself, producing the
// membrane's natural modal ringing. The AUDIO is simply the displacement read
// at a fixed pickup node each sample — the membrane's own vibration IS the
// timbre. (Van Duyne & Smith, "Physical Modeling with the 2-D Digital
// Waveguide Mesh", ICMC 1993.)
//
// Pitch: each note sets the wave-speed coefficient C (membrane tension), so a
// higher MIDI note tightens the head and rings higher. Velocity scales the
// strike amplitude. Chords = multiple simultaneous strikes summed into u.
//
// The processor also posts a downsampled snapshot of the displacement field to
// the main thread ~45x/second so the canvas shows the SAME wave you hear.
//
// SAFETY: C kept inside the CFL stability bound; per-sample output soft-clipped;
// the main chain adds lowpass + compressor as a limiter.

export const WORKLET_SOURCE = `
"use strict";

// Grid size for the audio-rate mesh. Must stay small enough to run N*N FDTD
// updates per sample in real time. 28x28 = 784 nodes/sample is comfortable.
const NX = 28;
const NY = 28;
const N = NX * NY;

function idx(x, y) { return y * NX + x; }

class WaveguideMeshProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Three buffers: previous, current, next displacement.
    this.uPrev = new Float32Array(N);
    this.uCur = new Float32Array(N);
    this.uNext = new Float32Array(N);

    // Wave-speed coefficient C (Courant number). CFL stability for 2-D: C <= 1/sqrt(2).
    // We target a base around 0.50 and modulate per strike toward the pitch.
    this.C = 0.5;
    this.targetC = 0.5;

    // Global energy decay per sample. Close to 1 = long ring. Higher notes ring
    // a touch shorter so chords stay articulate.
    this.damping = 0.99985;

    // Pickup node (slightly off-center so we hear asymmetric modes, like a real
    // drum mic). Plus a second pickup mixed in for a richer, less "nodal" tone.
    this.pickA = idx(Math.floor(NX * 0.62), Math.floor(NY * 0.41));
    this.pickB = idx(Math.floor(NX * 0.33), Math.floor(NY * 0.58));

    // DC blocker (membrane integrates energy; remove slow drift).
    this.dcX = 0;
    this.dcY = 0;

    // Output level smoothing / safety.
    this.out = 0;

    // Visual snapshot throttling.
    this.frameSamples = Math.max(1, Math.floor(sampleRate / 45));
    this.frameCount = 0;

    // Idle auto-strike so the membrane is alive even before the user plays.
    this.idleEnabled = true;
    this.idleSamples = Math.floor(sampleRate * 3.2);
    this.idleCount = Math.floor(sampleRate * 1.0);

    // Running RMS for a level meter (optional).
    this.rms = 0;

    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'strike') {
        this.strike(m.x, m.y, m.amp, m.c, m.damping);
        this.idleCount = 0; // reset idle timer when the user plays
      } else if (m.type === 'idle') {
        this.idleEnabled = !!m.on;
      } else if (m.type === 'release') {
        // Notes ring out naturally; nothing forced on release.
      }
    };
  }

  // Inject a localized Gaussian impulse of energy at fractional position (fx,fy)
  // in [0,1]. Setting C re-tunes the membrane tension for this and subsequent
  // strikes (so the note you hold sets the pitch).
  strike(fx, fy, amp, c, damping) {
    if (typeof c === 'number') {
      // Clamp to CFL stability bound (just under 1/sqrt(2)).
      this.targetC = Math.max(0.18, Math.min(0.69, c));
    }
    if (typeof damping === 'number') {
      this.damping = Math.max(0.9990, Math.min(0.99996, damping));
    }
    const cx = fx * (NX - 1);
    const cy = fy * (NY - 1);
    const sigma = 1.6;
    const s2 = 2 * sigma * sigma;
    const A = amp * 7.0;
    const r = 4;
    for (let dy = -r; dy <= r; dy++) {
      const y = Math.round(cy) + dy;
      if (y < 1 || y >= NY - 1) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx) + dx;
        if (x < 1 || x >= NX - 1) continue;
        const ex = (x - cx), ey = (y - cy);
        const g = A * Math.exp(-(ex * ex + ey * ey) / s2);
        const i = idx(x, y);
        // Push current displacement up; leave uPrev a touch lower so the bump
        // has outward velocity (it bursts open, like a real strike).
        this.uCur[i] += g;
        this.uPrev[i] += g * 0.6;
      }
    }
  }

  process(inputs, outputs, parameters) {
    const out = outputs[0];
    const ch0 = out[0];
    const ch1 = out.length > 1 ? out[1] : null;
    const blockLen = ch0.length;

    const uPrev = this.uPrev;
    const uCur = this.uCur;
    const uNext = this.uNext;

    for (let s = 0; s < blockLen; s++) {
      // Idle auto-strike to keep the surface alive on load.
      if (this.idleEnabled) {
        this.idleCount++;
        if (this.idleCount >= this.idleSamples) {
          this.idleCount = 0;
          const fx = 0.3 + Math.random() * 0.4;
          const fy = 0.3 + Math.random() * 0.4;
          this.strike(fx, fy, 0.18, this.targetC, this.damping);
        }
      }

      // Glide C toward target tension for smooth pitch changes.
      this.C += (this.targetC - this.C) * 0.0008;
      const c2 = this.C * this.C;
      const damp = this.damping;

      // FDTD wave-equation update over interior nodes (fixed boundary = rim).
      for (let y = 1; y < NY - 1; y++) {
        const yb = y * NX;
        for (let x = 1; x < NX - 1; x++) {
          const i = yb + x;
          const lap =
            uCur[i - 1] + uCur[i + 1] + uCur[i - NX] + uCur[i + NX] - 4 * uCur[i];
          let v = 2 * uCur[i] - uPrev[i] + c2 * lap;
          v *= damp;
          uNext[i] = v;
        }
      }

      // Rotate buffers (swap references; copy via the typed arrays we own).
      // We rotate by copying because we keep three named arrays.
      for (let i = 0; i < N; i++) {
        uPrev[i] = uCur[i];
        uCur[i] = uNext[i];
      }

      // Read the displacement at the pickup nodes → audio sample.
      let raw = 0.7 * uCur[this.pickA] + 0.5 * uCur[this.pickB];

      // DC block.
      const dcOut = raw - this.dcX + 0.999 * this.dcY;
      this.dcX = raw;
      this.dcY = dcOut;
      raw = dcOut;

      // Gentle make-up gain + soft clip for safety.
      let y = raw * 0.55;
      if (y > 1) y = 1; else if (y < -1) y = -1;
      // tanh-ish soft saturation for warmth without harsh clipping
      y = y - (y * y * y) / 3;

      this.out = y;
      ch0[s] = y;
      if (ch1) ch1[s] = y;

      // Running RMS.
      this.rms += (y * y - this.rms) * 0.0005;
    }

    // Post a downsampled field snapshot for the visualizer.
    this.frameCount += blockLen;
    if (this.frameCount >= this.frameSamples) {
      this.frameCount = 0;
      // Send a copy of the current displacement field + meta.
      const snap = new Float32Array(N);
      snap.set(uCur);
      this.port.postMessage(
        { type: 'field', nx: NX, ny: NY, level: Math.sqrt(this.rms), data: snap.buffer },
        [snap.buffer]
      );
    }

    return true;
  }
}

registerProcessor('waveguide-mesh-processor', WaveguideMeshProcessor);
`;
