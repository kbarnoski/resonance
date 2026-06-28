// Inlined AudioWorklet source (delivered to the browser as a Blob URL — no extra
// files outside this folder). Two processors live here:
//
//   "gpu-pickup"  — a ring-buffer player. The main thread reads displacement
//                   samples back from the GPU plate simulation each animation
//                   frame and posts blocks of pickup samples here; this processor
//                   resamples that stream to the audio sample rate and feeds the
//                   speaker cone. The speaker therefore literally follows the
//                   GPU-simulated plate's pickup point.
//
//   "cpu-plate"   — a full finite-difference thin-plate simulation that runs
//                   ENTIRELY inside the audio thread at the audio sample rate.
//                   Used automatically when WebGPU is unavailable, so the audio
//                   is STILL real plate physics. It also posts its displacement
//                   field back to the main thread for the visualiser.
//
// Both implement the damped stiff Kirchhoff–Love plate with a non-linear
// tension-modulation term (von Kármán style): the effective stiffness/tension
// is scaled by (1 + beta * E) where E is a running energy estimate, so a hard
// strike blooms sharp and glides downward in pitch as it rings.

export const WORKLET_SRC = /* js */ `
// ----- shared helpers -------------------------------------------------------
function softClip(x) {
  // tanh-ish soft clip, cheap & monotonic
  if (x > 3) return 1;
  if (x < -3) return -1;
  return x * (27 + x * x) / (27 + 9 * x * x);
}

// ============================================================================
// GPU pickup player: drains a ring buffer of pickup samples handed in from the
// main thread (the real GPU plate displacement at the pickup cell) and resamples
// it to the audio rate.
// ============================================================================
class GpuPickupProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(1 << 16); // power-of-two ring
    this.mask = this.ring.length - 1;
    this.writePos = 0;
    this.readPos = 0;     // fractional read position
    // ratio = how many ring samples to advance per output sample.
    // Updated live by the main thread from measured GPU sample throughput.
    this.ratio = 1.0;
    this.targetRatio = 1.0;
    // DC blocker + smoothing state
    this.dcX = 0; this.dcY = 0;
    this.gain = 0.9;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === "samples") {
        const s = d.data;
        for (let i = 0; i < s.length; i++) {
          this.ring[this.writePos & this.mask] = s[i];
          this.writePos++;
        }
      } else if (d.type === "ratio") {
        this.targetRatio = d.value;
      } else if (d.type === "gain") {
        this.gain = d.value;
      }
    };
  }

  available() {
    return this.writePos - this.readPos;
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    const n = ch0.length;

    // glide the resample ratio so changes are click-free
    for (let i = 0; i < n; i++) {
      this.ratio += (this.targetRatio - this.ratio) * 0.0008;

      // keep the read head a little behind the write head to avoid underrun;
      // if we run dry, output silence (plate at rest).
      let avail = this.writePos - this.readPos;
      let v = 0;
      if (avail > 2) {
        const rp = this.readPos;
        const i0 = Math.floor(rp);
        const frac = rp - i0;
        const a = this.ring[i0 & this.mask];
        const b = this.ring[(i0 + 1) & this.mask];
        v = a + (b - a) * frac;       // linear interpolation resample
        this.readPos += this.ratio;
      } else {
        // underrun: hold near zero, let read head catch the write head slowly
        this.readPos = this.writePos - 1;
      }

      // drift correction: gently pull read head toward a healthy backlog
      avail = this.writePos - this.readPos;
      if (avail > 8192) this.readPos += (avail - 4096) * 0.00005;

      // DC blocker
      const x = v;
      const y = x - this.dcX + 0.9985 * this.dcY;
      this.dcX = x; this.dcY = y;

      ch0[i] = softClip(y * this.gain);
    }
    if (out.length > 1) out[1].set(ch0);
    return true;
  }
}

// ============================================================================
// CPU finite-difference plate (fallback audio source). Real physics, audio rate.
//   u_tt = -kappa^2 * biharmonic(u) - 2*s0*u_t + s1*lap(u_t) + excitation
// with non-linear tension modulation: kappa^2 -> kappa^2 * (1 + beta*E).
// Explicit scheme on an NxN grid with clamped (simply-supported-ish) edges.
// ============================================================================
class CpuPlateProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.N = o.N || 34;
    const N = this.N;
    this.u = new Float32Array(N * N);      // current
    this.u1 = new Float32Array(N * N);     // previous
    this.un = new Float32Array(N * N);     // next (scratch)
    this.lap = new Float32Array(N * N);    // laplacian scratch
    this.lapV = new Float32Array(N * N);   // laplacian of velocity scratch

    // base physical params per plate; can be retuned by message
    this.kappa = o.kappa || 0.16;          // stiffness -> fundamental
    this.s0 = o.s0 || 0.00003;             // per-step freq-indep damping
    this.s1 = o.s1 || 0.0005;              // freq-dep damping (lap-of-velocity)
    this.beta = o.beta || 0.6;             // non-linear tension modulation
    this.dt = 1 / sampleRate;

    // pickup near (but off) centre so it sees many modes
    this.pickup = (Math.floor(N * 0.62) * N + Math.floor(N * 0.41));
    this.energy = 0;
    this.gain = o.gain || 1.0;
    this.dcX = 0; this.dcY = 0;

    // visual downsample throttle
    this.frame = 0;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === "strike") this.strike(d.x, d.y, d.force);
      else if (d.type === "tune") {
        if (d.kappa != null) this.kappa = d.kappa;
        if (d.s0 != null) this.s0 = d.s0;
        if (d.s1 != null) this.s1 = d.s1;
        if (d.beta != null) this.beta = d.beta;
      } else if (d.type === "gain") {
        this.gain = d.value;
      }
    };
  }

  strike(nx, ny, force) {
    const N = this.N;
    const cx = Math.max(2, Math.min(N - 3, Math.floor(nx * N)));
    const cy = Math.max(2, Math.min(N - 3, Math.floor(ny * N)));
    const r = 2.4;
    const amp = 0.9 * Math.max(0.05, Math.min(1, force));
    for (let j = -3; j <= 3; j++) {
      for (let i = -3; i <= 3; i++) {
        const x = cx + i, y = cy + j;
        if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) continue;
        const d2 = i * i + j * j;
        const g = Math.exp(-d2 / (r * r));
        // velocity impulse: push current up relative to previous
        this.u[y * N + x] += amp * g;
        this.u1[y * N + x] -= amp * g * 0.25;
      }
    }
  }

  computeLap(src, dst) {
    const N = this.N;
    for (let y = 1; y < N - 1; y++) {
      const row = y * N;
      for (let x = 1; x < N - 1; x++) {
        const i = row + x;
        dst[i] = src[i - 1] + src[i + 1] + src[i - N] + src[i + N] - 4 * src[i];
      }
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    const ch0 = out[0];
    const n = ch0.length;
    const N = this.N;
    const u = this.u, u1 = this.u1, un = this.un, lap = this.lap, lapV = this.lapV;

    for (let s = 0; s < n; s++) {
      // running energy estimate (mean square displacement) for tension mod.
      // Clamp k2 below the explicit-scheme stability limit so a hard strike can
      // never make the simulation diverge.
      let k2 = this.kappa * this.kappa * (1 + this.beta * this.energy);
      if (k2 > 0.052) k2 = 0.052;

      // laplacian of u, then biharmonic = lap(lap(u))
      this.computeLap(u, lap);
      // velocity ~ (u - u1)/dt ; we use (u-u1) and fold dt into s1 scaling
      // laplacian of velocity proxy:
      for (let i = 0; i < N * N; i++) lapV[i] = 0;
      this.computeLap2Vel(lapV);

      // biharmonic stored back into a temp by reusing lap -> compute lap of lap
      // (do it inline to avoid another big buffer)
      let acc = 0; // energy accumulator
      for (let y = 2; y < N - 2; y++) {
        const row = y * N;
        for (let x = 2; x < N - 2; x++) {
          const i = row + x;
          const bih = lap[i - 1] + lap[i + 1] + lap[i - N] + lap[i + N] - 4 * lap[i];
          const vel = u[i] - u1[i];
          // explicit update
          let next =
            2 * u[i] - u1[i]
            - k2 * bih
            - this.s0 * vel
            + this.s1 * lapV[i];
          un[i] = next;
          acc += u[i] * u[i];
        }
      }
      // edges -> clamp to zero (simply supported-ish)
      for (let x = 0; x < N; x++) { un[x] = 0; un[(N - 1) * N + x] = 0; un[N + x] = 0; un[(N - 2) * N + x] = 0; }
      for (let y = 0; y < N; y++) { un[y * N] = 0; un[y * N + N - 1] = 0; un[y * N + 1] = 0; un[y * N + N - 2] = 0; }

      // rotate buffers
      const tmp = this.u1; this.u1 = this.u; this.u = this.un; this.un = tmp;

      // update energy estimate slowly (normalised by grid)
      const meanSq = acc / (N * N);
      this.energy += (Math.min(meanSq * 6, 1.2) - this.energy) * 0.02;
      // safety clamp on runaway
      if (this.energy > 1.2) this.energy = 1.2;

      // read pickup, dc-block, soft clip
      let v = this.u[this.pickup] * 40;
      const yv = v - this.dcX + 0.9985 * this.dcY;
      this.dcX = v; this.dcY = yv;
      ch0[s] = softClip(yv * this.gain);
    }
    if (out.length > 1) out[1].set(ch0);

    // post a downsampled field for the visualiser ~ every block
    this.frame++;
    if ((this.frame & 1) === 0) {
      this.port.postMessage({ type: "field", data: this.u.slice(0), N: this.N, energy: this.energy });
    }
    return true;
  }

  // laplacian of velocity proxy (u - u1), written to this.lapV
  computeLap2Vel(dst) {
    const N = this.N;
    const u = this.u, u1 = this.u1;
    for (let y = 1; y < N - 1; y++) {
      const row = y * N;
      for (let x = 1; x < N - 1; x++) {
        const i = row + x;
        const c = u[i] - u1[i];
        const l = u[i - 1] - u1[i - 1];
        const r = u[i + 1] - u1[i + 1];
        const up = u[i - N] - u1[i - N];
        const dn = u[i + N] - u1[i + N];
        dst[i] = l + r + up + dn - 4 * c;
      }
    }
  }
}

registerProcessor("gpu-pickup", GpuPickupProcessor);
registerProcessor("cpu-plate", CpuPlateProcessor);
`;
