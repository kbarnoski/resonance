// 2952-tabla — mesh.ts
// A REAL 2-D digital waveguide mesh membrane (Van Duyne & Smith, "The 2-D
// Digital Waveguide Mesh", ICASSP/WASPAA 1993). A rectilinear grid of 4-port
// scattering junctions joined by bidirectional unit delays is, on the
// homogeneous square mesh, mathematically identical to the explicit
// finite-difference scheme for the 2-D wave equation  u_tt = c^2 ∇²u  at the
// critical Courant number. We use that equivalent form here — it IS the DWM
// scattering update, not additive modal fakery:
//
//     u(n+1) = 2·u(n) − u(n−1) + c²·( uN + uS + uE + uW − 4·u )
//
// with a per-junction c² field (the local "tension" — squared wave speed).
// Pressing the palm raises c² in a region, which raises the local wave speed,
// which raises the pitch of the ringing modes — the tabla 'ga'/'ghe' glide.
// A circular Dirichlet mask makes the square grid a clamped round drumhead.
//
// The SAME algorithm is inlined (untyped) inside worklet.ts, because an
// AudioWorklet runs in a global scope with no module system and cannot import
// this file. Keep the two in sync.

export interface MeshConfig {
  /** grid dimension G (G×G junctions) */
  size: number;
  /** base squared Courant number c² for the relaxed head (0 < baseC2 < 0.5) */
  baseC2: number;
  /** maximum c² that pressing can add on top of baseC2 (kept so total ≤ 0.49) */
  maxTension: number;
  /** per-sample amplitude retention (<1) — the membrane's decay */
  loss: number;
  /** one-pole rate at which local tension eases UP toward the press target */
  tensionEase: number;
  /** per-control-block relaxation of tension back toward zero (glide-down) */
  tensionRelax: number;
}

interface PressState {
  active: boolean;
  cx: number; // grid coords (float)
  cy: number;
  amount: number; // 0..1
  radius: number; // grid cells
}

/** Hard stability ceiling for the explicit scheme (c² ≤ 0.5 in 2-D). */
const C2_CAP = 0.49;

export class MembraneMesh {
  readonly size: number;
  readonly radiusCells: number;
  readonly cx: number;
  readonly cy: number;
  readonly mask: Uint8Array;
  readonly c2: Float32Array;
  readonly tension: Float32Array;
  readonly listenIdx: number;

  private readonly cfg: MeshConfig;
  private field: Float32Array;
  private prev: Float32Array;
  private readonly press: PressState;

  constructor(cfg: MeshConfig) {
    this.cfg = cfg;
    const G = cfg.size;
    this.size = G;
    this.cx = (G - 1) / 2;
    this.cy = (G - 1) / 2;
    // Leave a ≥1.5-cell boundary ring so a junction's 4 neighbours are never
    // out of bounds and the rim is a clean clamped (Dirichlet) circle.
    this.radiusCells = (G - 1) / 2 - 1.5;

    const n = G * G;
    this.field = new Float32Array(n);
    this.prev = new Float32Array(n);
    this.c2 = new Float32Array(n);
    this.tension = new Float32Array(n);
    this.mask = new Uint8Array(n);

    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        const dx = x - this.cx;
        const dy = y - this.cy;
        this.mask[i] = Math.sqrt(dx * dx + dy * dy) <= this.radiusCells ? 1 : 0;
        this.c2[i] = cfg.baseC2;
      }
    }

    // Listening junction: off-centre so we pick up asymmetric modes, like a
    // contact point away from the syahi.
    const lx = Math.round(this.cx + this.radiusCells * 0.42);
    const ly = Math.round(this.cy - this.radiusCells * 0.18);
    this.listenIdx = ly * G + lx;

    this.press = { active: false, cx: 0, cy: 0, amount: 0, radius: 0 };
  }

  /** Inject a raised-Gaussian displacement impulse at disk coord (nx,ny)∈[-1,1].
   *  Adding to BOTH buffers = a velocity-free deformation that then rings. */
  strike(nx: number, ny: number, vel: number, width: number): void {
    const G = this.size;
    const gx = this.cx + nx * this.radiusCells;
    const gy = this.cy + ny * this.radiusCells;
    const w = Math.max(0.8, width);
    const rad = Math.ceil(w * 2.4);
    const gxi = Math.round(gx);
    const gyi = Math.round(gy);
    for (let y = -rad; y <= rad; y++) {
      const py = gyi + y;
      if (py < 0 || py >= G) continue;
      for (let x = -rad; x <= rad; x++) {
        const px = gxi + x;
        if (px < 0 || px >= G) continue;
        const i = py * G + px;
        if (!this.mask[i]) continue;
        const ddx = px - gx;
        const ddy = py - gy;
        const bump = Math.exp(-(ddx * ddx + ddy * ddy) / (w * w)) * vel;
        this.field[i] += bump;
        this.prev[i] += bump;
      }
    }
  }

  /** Set the palm-press region (disk coords). amount∈[0,1] scales added tension. */
  setPress(nx: number, ny: number, amount: number, radiusFrac: number): void {
    this.press.active = true;
    this.press.cx = this.cx + nx * this.radiusCells;
    this.press.cy = this.cy + ny * this.radiusCells;
    this.press.amount = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    this.press.radius = Math.max(2, radiusFrac * this.radiusCells);
  }

  releasePress(): void {
    this.press.active = false;
  }

  /** Once per audio block: relax tension, ease the press region up, rebuild c². */
  updateControl(): void {
    const { tension, c2, mask, cfg } = this;
    const n = c2.length;
    const relax = cfg.tensionRelax;
    for (let i = 0; i < n; i++) tension[i] *= relax;

    const p = this.press;
    if (p.active && p.amount > 0) {
      const G = this.size;
      const rad = Math.ceil(p.radius * 2.5);
      const inv = 1 / (p.radius * p.radius);
      const target = p.amount * cfg.maxTension;
      const cxi = Math.round(p.cx);
      const cyi = Math.round(p.cy);
      const y0 = Math.max(0, cyi - rad);
      const y1 = Math.min(G - 1, cyi + rad);
      const x0 = Math.max(0, cxi - rad);
      const x1 = Math.min(G - 1, cxi + rad);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * G + x;
          if (!mask[i]) continue;
          const dx = x - p.cx;
          const dy = y - p.cy;
          const t = target * Math.exp(-(dx * dx + dy * dy) * inv);
          if (t > tension[i]) tension[i] += (t - tension[i]) * cfg.tensionEase;
        }
      }
    }

    const base = cfg.baseC2;
    for (let i = 0; i < n; i++) {
      const v = base + tension[i];
      c2[i] = v > C2_CAP ? C2_CAP : v;
    }
  }

  /** Advance the mesh one sample; returns displacement at the listening junction. */
  step(): number {
    const { field, prev, c2, mask, size: G } = this;
    const loss = this.cfg.loss;
    const last = G - 1;
    for (let y = 1; y < last; y++) {
      const row = y * G;
      for (let x = 1; x < last; x++) {
        const i = row + x;
        if (!mask[i]) {
          prev[i] = 0;
          continue;
        }
        const u = field[i];
        const lap = field[i - 1] + field[i + 1] + field[i - G] + field[i + G] - 4 * u;
        prev[i] = (2 * u - prev[i] + c2[i] * lap) * loss;
      }
    }
    // Leapfrog swap: prev now holds the new field.
    const tmp = this.field;
    this.field = this.prev;
    this.prev = tmp;
    return this.field[this.listenIdx];
  }

  /** Current displacement field (read-only use). */
  getField(): Float32Array {
    return this.field;
  }
}
