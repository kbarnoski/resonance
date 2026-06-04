// ─────────────────────────────────────────────────────────────────────────────
// 313 · Kids Tone Tower — Canvas2D tower-stacking scene
//
// The tower IS the song the child remembered. Each correct echoed note STACKS a
// glowing block (a little gravity settle + soft landing). A wrong note makes the
// top block WOBBLE and slide off (topple). The tower grows taller and PERSISTS.
//
// Pure Canvas2D — no creature, no pads, no WebGL. A self-contained render loop
// driven by a small block-physics model.
// ─────────────────────────────────────────────────────────────────────────────

import { colorForNote, type NoteName } from "./audio";

export type BlockState = "settling" | "resting" | "toppling";

export interface Block {
  note: NoteName;
  color: string;
  // Logical slot index from the bottom (0 = base). Drives resting Y.
  index: number;
  state: BlockState;
  // Vertical offset above its resting position (used during settle drop).
  dropY: number;
  vy: number; // velocity for settle bounce / topple fall
  // Toppling motion.
  toppleX: number;
  toppleVx: number;
  rot: number;
  rotVel: number;
  // Lighting: 0..1 glow boost, decays. Used for "sung by the tower" highlight.
  glow: number;
  // Per-block wobble phase for the resting sway.
  wobblePhase: number;
}

export function makeBlock(note: NoteName, index: number): Block {
  return {
    note,
    color: colorForNote(note),
    index,
    state: "settling",
    dropY: 320, // drops in from above
    vy: 0,
    toppleX: 0,
    toppleVx: 0,
    rot: 0,
    rotVel: 0,
    glow: 0,
    wobblePhase: Math.random() * Math.PI * 2,
  };
}

// Tunable layout. Blocks are wide and short, like real stacking blocks.
const BLOCK_W = 132;
const BLOCK_H = 46;
const GAP = 6;
const BASE_MARGIN = 90; // distance from bottom of canvas to base block

export class TowerScene {
  private blocks: Block[] = [];
  private toppling: Block[] = []; // blocks mid-fall (visual only)
  private w = 0;
  private h = 0;
  private dpr = 1;
  // Whole-tower celebratory shimmer: a rising highlight band, 0..1 (or -1 off).
  private shimmer = -1;
  // Ground base-pulse intensity (the "your turn" pulsing green base).
  private basePulse = 0;
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.resize();
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
  }

  setBlocks(notes: NoteName[]): void {
    this.blocks = notes.map((n, i) => {
      const b = makeBlock(n, i);
      b.state = "resting";
      b.dropY = 0;
      return b;
    });
  }

  get count(): number {
    return this.blocks.length;
  }

  // Add a glowing block on top (with a gravity settle). Returns the new block.
  stackBlock(note: NoteName): Block {
    const b = makeBlock(note, this.blocks.length);
    b.glow = 1;
    this.blocks.push(b);
    return b;
  }

  // Topple the top block off the tower (wrong note). It falls away gently.
  toppleTop(): NoteName | null {
    if (this.blocks.length === 0) return null;
    const b = this.blocks.pop()!;
    b.state = "toppling";
    b.toppleVx = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 2);
    b.vy = -4 - Math.random() * 2; // a little hop before it falls
    b.rotVel = b.toppleVx * 0.012;
    b.glow = 0.6;
    this.toppling.push(b);
    return b.note;
  }

  // Light the block at the given index (used while the tower "sings").
  lightBlock(index: number): void {
    const b = this.blocks[index];
    if (b) b.glow = 1;
  }

  // Pulse the base green to signal "your turn".
  setBasePulse(on: boolean): void {
    this.basePulse = on ? 1 : 0;
  }

  // Trigger the whole-tower celebratory shimmer.
  celebrate(): void {
    this.shimmer = 0;
  }

  private baseY(): number {
    return this.h - BASE_MARGIN;
  }

  private restingY(index: number): number {
    // index 0 sits on the base line; each block stacks upward.
    return this.baseY() - (index + 1) * (BLOCK_H + GAP);
  }

  // Advance physics by dt (seconds). Returns true while anything is animating
  // (settle / topple) so the caller can keep flags accurate if needed.
  step(dt: number): boolean {
    this.time += dt;
    let active = false;
    const g = 1400; // px/s^2 gravity feel

    for (const b of this.blocks) {
      // Settle drop with a soft bounce.
      if (b.state === "settling") {
        b.vy += g * dt;
        b.dropY -= b.vy * dt;
        if (b.dropY <= 0) {
          b.dropY = 0;
          if (b.vy > 120) {
            // small bounce
            b.vy = -b.vy * 0.28;
            b.dropY = 0.01;
          } else {
            b.vy = 0;
            b.state = "resting";
          }
        }
        active = true;
      }
      // Glow decays toward 0.
      b.glow *= Math.pow(0.12, dt);
      if (b.glow < 0.01) b.glow = 0;
    }

    // Toppling blocks fall off-screen, then are removed.
    for (const b of this.toppling) {
      b.vy += g * 0.6 * dt;
      b.dropY -= b.vy * dt; // dropY here used as a falling offset (goes negative)
      b.toppleX += b.toppleVx;
      b.rot += b.rotVel;
      b.glow *= Math.pow(0.3, dt);
      active = true;
    }
    this.toppling = this.toppling.filter(
      (b) => this.restingY(b.index) - b.dropY < this.h + 200,
    );

    // Shimmer rises up the tower then turns off.
    if (this.shimmer >= 0) {
      this.shimmer += dt * 1.6;
      active = true;
      if (this.shimmer > 1.4) this.shimmer = -1;
    }

    return active;
  }

  draw(): void {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);

    const cx = this.w / 2;
    const baseY = this.baseY();

    // ── Background: warm dark vertical gradient ──
    const bg = ctx.createLinearGradient(0, 0, 0, this.h);
    bg.addColorStop(0, "#0b0710");
    bg.addColorStop(1, "#140a16");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    // ── Ground line + base platform ──
    const pulse =
      this.basePulse > 0 ? 0.5 + 0.5 * Math.sin(this.time * 4) : 0;
    ctx.save();
    const platW = BLOCK_W + 40;
    const grad = ctx.createLinearGradient(0, baseY, 0, baseY + 26);
    grad.addColorStop(0, this.basePulse > 0 ? "#2e6b3a" : "#241b2e");
    grad.addColorStop(1, "#0d0810");
    ctx.fillStyle = grad;
    this.roundRect(ctx, cx - platW / 2, baseY, platW, 26, 8);
    ctx.fill();
    if (this.basePulse > 0) {
      ctx.shadowColor = "#6ee7a0";
      ctx.shadowBlur = 24 + pulse * 26;
      ctx.strokeStyle = `rgba(110,231,160,${0.4 + pulse * 0.5})`;
      ctx.lineWidth = 3;
      this.roundRect(ctx, cx - platW / 2, baseY, platW, 26, 8);
      ctx.stroke();
    }
    ctx.restore();

    // ── Toppling blocks (drawn behind/around the standing tower) ──
    for (const b of this.toppling) {
      const y = this.restingY(b.index) - b.dropY;
      this.drawBlock(ctx, cx + b.toppleX, y, b, b.rot, 1);
    }

    // ── Standing blocks (bottom → top) ──
    for (let i = 0; i < this.blocks.length; i++) {
      const b = this.blocks[i];
      const restY = this.restingY(i);
      const y = restY + b.dropY;
      // Gentle resting sway that grows toward the top (taller = a touch wobblier).
      const swayAmt = b.state === "resting" ? (i / 8) * 1.6 : 0;
      const sway =
        Math.sin(this.time * 1.3 + b.wobblePhase) * swayAmt;
      // Shimmer highlight: a rising band of brightness.
      let shimmerBoost = 0;
      if (this.shimmer >= 0) {
        const blockT = i / Math.max(1, this.blocks.length);
        const d = Math.abs(this.shimmer - blockT);
        shimmerBoost = Math.max(0, 1 - d * 6);
      }
      this.drawBlock(ctx, cx + sway, y, b, 0, 1 + shimmerBoost);
    }

    ctx.restore();
  }

  private drawBlock(
    ctx: CanvasRenderingContext2D,
    cx: number,
    topY: number,
    b: Block,
    rot: number,
    brightness: number,
  ): void {
    ctx.save();
    ctx.translate(cx, topY + BLOCK_H / 2);
    if (rot) ctx.rotate(rot);

    const x = -BLOCK_W / 2;
    const y = -BLOCK_H / 2;

    const glow = Math.min(1, b.glow + (brightness - 1));
    // Glow halo.
    if (glow > 0.02) {
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 18 + glow * 40;
    }

    // Body with a soft vertical gradient + glow-driven lightening.
    const lighten = glow * 0.5;
    const g = ctx.createLinearGradient(0, y, 0, y + BLOCK_H);
    g.addColorStop(0, this.mix(b.color, "#ffffff", 0.22 + lighten));
    g.addColorStop(1, this.mix(b.color, "#000000", 0.18 - lighten * 0.3));
    ctx.fillStyle = g;
    this.roundRect(ctx, x, y, BLOCK_W, BLOCK_H, 10);
    ctx.fill();

    // Top highlight edge (a little 3D lip).
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255,255,255,${0.18 + lighten})`;
    this.roundRect(ctx, x + 6, y + 4, BLOCK_W - 12, 7, 4);
    ctx.fill();

    // Inner rim outline.
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + glow * 0.5})`;
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, x, y, BLOCK_W, BLOCK_H, 10);
    ctx.stroke();

    ctx.restore();
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Linear color mix between two #rrggbb strings.
  private mix(a: string, b: string, t: number): string {
    const ca = this.parse(a);
    const cb = this.parse(b);
    const k = Math.max(0, Math.min(1, t));
    const r = Math.round(ca[0] + (cb[0] - ca[0]) * k);
    const gg = Math.round(ca[1] + (cb[1] - ca[1]) * k);
    const bl = Math.round(ca[2] + (cb[2] - ca[2]) * k);
    return `rgb(${r},${gg},${bl})`;
  }

  private parse(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
}
