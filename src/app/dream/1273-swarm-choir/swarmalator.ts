// ─────────────────────────────────────────────────────────────────────────────
// swarmalator.ts — a real swarmalator model (O'Keeffe, Hong & Strogatz 2017).
//
// Each agent i carries a 2D position xᵢ AND a phase θᵢ. Both evolve under
// coupled ODEs — space and phase steer each other:
//
//   dxᵢ/dt = (1/N) Σⱼ [ (xⱼ−xᵢ)/|xⱼ−xᵢ| · (A + J·cos(θⱼ−θᵢ))
//                       − B·(xⱼ−xᵢ)/|xⱼ−xᵢ|² ]
//   dθᵢ/dt = ωᵢ + (K/N) Σⱼ sin(θⱼ−θᵢ)/|xⱼ−xᵢ|
//
// The two governing knobs J (phase↔space) and K (phase sync) sweep the field
// through the five known collective states. Integrated with forward Euler at a
// small dt; O(N²) each step at N≈420, which stays smooth.
// ─────────────────────────────────────────────────────────────────────────────

export interface SwarmParams {
  J: number; // phase → space coupling  (−1 .. 1+)
  K: number; // phase sync coupling      (−1 .. 1+)
  A: number; // spatial attraction
  B: number; // short-range repulsion
}

export interface OrderParams {
  // Rainbow order parameters S± = <e^{i(φ ± θ)}> where φ is the spatial angle.
  // Their magnitudes reveal correlation between space and phase.
  Splus: number;
  Sminus: number;
  // Kuramoto phase coherence R = |<e^{iθ}>|.
  R: number;
  // Second Kuramoto moment |<e^{i2θ}>| — betrays discrete phase clustering
  // (splintered) versus a continuous rainbow (static phase wave).
  R2: number;
  // Mean phase (radians) for a global colour/pitch anchor.
  meanTheta: number;
  // Mean angular speed of phases — betrays the *active* (rotating) states.
  meanSpeed: number;
}

export class Swarmalator {
  readonly N: number;
  // Flat arrays for cache-friendly O(N²) sweeps.
  x: Float32Array;
  y: Float32Array;
  theta: Float32Array;
  omega: Float32Array; // natural frequencies
  private dx: Float32Array;
  private dy: Float32Array;
  private dtheta: Float32Array;

  // A single injected pointer force (attractor / repulsor).
  pointer = { x: 0, y: 0, active: false, sign: 1, strength: 0 };

  constructor(N: number, chirality = false) {
    this.N = N;
    this.x = new Float32Array(N);
    this.y = new Float32Array(N);
    this.theta = new Float32Array(N);
    this.omega = new Float32Array(N);
    this.dx = new Float32Array(N);
    this.dy = new Float32Array(N);
    this.dtheta = new Float32Array(N);
    this.seed(chirality);
  }

  seed(chirality: boolean) {
    for (let i = 0; i < this.N; i++) {
      // Small random disc so the swarm has to organise itself.
      const r = Math.sqrt(Math.random()) * 0.9;
      const a = Math.random() * Math.PI * 2;
      this.x[i] = r * Math.cos(a);
      this.y[i] = r * Math.sin(a);
      this.theta[i] = Math.random() * Math.PI * 2;
      // Identical-frequency ensemble is the canonical case (states are cleanest).
      // A whisper of spread keeps it alive; chirality gives split populations.
      const base = chirality ? (i % 2 === 0 ? 0.35 : -0.35) : 0;
      this.omega[i] = base + (Math.random() - 0.5) * 0.05;
    }
  }

  /** One forward-Euler step of the coupled ODEs. Returns global order params. */
  step(p: SwarmParams, dt: number): OrderParams {
    const N = this.N;
    const { J, K, A, B } = p;
    const x = this.x, y = this.y, th = this.theta, om = this.omega;
    const dx = this.dx, dy = this.dy, dth = this.dtheta;

    for (let i = 0; i < N; i++) {
      let vx = 0, vy = 0, vt = 0;
      const xi = x[i], yi = y[i], ti = th[i];
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const rx = x[j] - xi;
        const ry = y[j] - yi;
        let d2 = rx * rx + ry * ry;
        if (d2 < 1e-6) d2 = 1e-6;
        const d = Math.sqrt(d2);
        const invd = 1 / d;
        const dtheta = th[j] - ti;
        const cosd = Math.cos(dtheta);
        // Spatial scalar s such that pair force = (xⱼ−xᵢ)·s:
        //   unit·(A + J cosΔθ) − B·(xⱼ−xᵢ)/d²  =  (xⱼ−xᵢ)·[ (A+J cos)/d − B/d² ]
        const spatial = (A + J * cosd) * invd - B / d2;
        vx += rx * spatial;
        vy += ry * spatial;
        vt += Math.sin(dtheta) * invd;
      }
      dx[i] = vx / N;
      dy[i] = vy / N;
      dth[i] = om[i] + (K / N) * vt;
    }

    // Pointer injection: a soft attractor(+) / repulsor(−) that lets you stir.
    if (this.pointer.active && this.pointer.strength > 0) {
      const px = this.pointer.x, py = this.pointer.y;
      const s = this.pointer.sign * this.pointer.strength;
      for (let i = 0; i < N; i++) {
        const rx = px - x[i];
        const ry = py - y[i];
        let d2 = rx * rx + ry * ry;
        if (d2 < 1e-4) d2 = 1e-4;
        const d = Math.sqrt(d2);
        const pull = (s * 0.9) / (d + 0.25);
        dx[i] += (rx / d) * pull;
        dy[i] += (ry / d) * pull;
      }
    }

    // Integrate.
    let speedAcc = 0;
    for (let i = 0; i < N; i++) {
      x[i] += dx[i] * dt;
      y[i] += dy[i] * dt;
      let t = th[i] + dth[i] * dt;
      // wrap to [0, 2π)
      t = t % (Math.PI * 2);
      if (t < 0) t += Math.PI * 2;
      th[i] = t;
      speedAcc += Math.abs(dth[i]);
    }

    return this.measure(speedAcc / N);
  }

  private measure(meanSpeed: number): OrderParams {
    const N = this.N;
    let cSum = 0, sSum = 0; // for R (phase coherence)
    let c2 = 0, s2 = 0;     // for R2 (second moment)
    let pC = 0, pS = 0;     // S+  : <cos(φ+θ)>, <sin(φ+θ)>
    let mC = 0, mS = 0;     // S−  : <cos(φ−θ)>, <sin(φ−θ)>
    for (let i = 0; i < N; i++) {
      const t = this.theta[i];
      cSum += Math.cos(t);
      sSum += Math.sin(t);
      c2 += Math.cos(2 * t); s2 += Math.sin(2 * t);
      const phi = Math.atan2(this.y[i], this.x[i]);
      pC += Math.cos(phi + t); pS += Math.sin(phi + t);
      mC += Math.cos(phi - t); mS += Math.sin(phi - t);
    }
    const R = Math.hypot(cSum, sSum) / N;
    const R2 = Math.hypot(c2, s2) / N;
    const meanTheta = Math.atan2(sSum, cSum);
    const Splus = Math.hypot(pC, pS) / N;
    const Sminus = Math.hypot(mC, mS) / N;
    return { Splus, Sminus, R, R2, meanTheta, meanSpeed };
  }

  /** Spawn a burst of new-ish agents by re-seeding a slice near a point. */
  burst(cx: number, cy: number, count: number) {
    for (let k = 0; k < count; k++) {
      const i = Math.floor(Math.random() * this.N);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.12;
      this.x[i] = cx + r * Math.cos(a);
      this.y[i] = cy + r * Math.sin(a);
      this.theta[i] = Math.random() * Math.PI * 2;
    }
  }
}

// A tiny classifier so the UI can name the state you've steered into.
// Heuristic thresholds on (R, S±, meanSpeed) — not exact phase boundaries,
// but reliable enough to label the five canonical regimes.
export function classifyState(o: OrderParams): string {
  const S = Math.max(o.Splus, o.Sminus);
  // Thresholds calibrated against 1500-step runs of the five presets.
  if (o.R > 0.85 && S < 0.4) return "static sync";
  // Rotation (nonzero mean angular speed) is the signature of the active regime.
  if (o.meanSpeed > 0.045) return "active phase wave";
  if (S > 0.5) {
    // Both static regimes have S high & no rotation; discrete phase clustering
    // (higher second moment) marks the splintered one.
    return o.R2 > 0.06 ? "splintered phase wave" : "static phase wave";
  }
  if (o.R < 0.3) return "static async";
  return "splintered phase wave";
}
