// ─────────────────────────────────────────────────────────────────────────────
// render.ts — the circular gait-clock / step-loom (Canvas 2D).
//
//   A rotating radial timeline: 16 step-marks around a ring, a sweeping playhead
//   locked to the gait BPM, bright bursts dropped where footfalls land, and woven
//   threads accumulating between successive limb events across the ring interior.
//   A faint MediaPipe skeleton is overlaid (mirrored). Chromatic chiaroscuro:
//   warm ember/amber footfalls and cool teal/emerald limb-threads on deep
//   graphite — never bright-white-daylight, never near-black. All luminance
//   motion is slow / event-driven (no strobe, ≤3 Hz full-field change).
// ─────────────────────────────────────────────────────────────────────────────

import { BONES, type Landmark } from "./pose";
import type { Limb } from "./gait";
import type { LoomState } from "./grains";

interface Burst {
  ang: number;
  rad: number;
  r: number;
  life: number;
  warm: boolean; // true = ember footfall, false = teal limb
  spin: number;
}
interface ThreadNode {
  ang: number;
  rad: number;
  warm: boolean;
  age: number;
}

export interface LoomRenderer {
  draw(input: RenderInput): void;
}

export interface RenderInput {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  time: number; // seconds
  loom: LoomState;
  landmarks: Landmark[] | null;
  motion: number; // 0..1
  locked: boolean;
  cadence: number;
}

const WARM_LIMBS: Set<Limb> = new Set(["footL", "footR"]);

function limbRadius(limb: Limb, base: number): number {
  // footfalls sit on the ring; wrists/knees weave a little inside it.
  if (limb === "footL" || limb === "footR") return base;
  if (limb === "wristL" || limb === "wristR") return base * 0.62;
  return base * 0.8;
}

export function createLoomRenderer(): LoomRenderer {
  const bursts: Burst[] = [];
  const threads: ThreadNode[] = [];
  let rot = 0; // slow global rotation of the whole loom

  const draw = (input: RenderInput): void => {
    const { ctx, w, h, loom, landmarks, motion, locked, cadence } = input;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.36;
    const STEPS = loom.slots.length || 16;
    rot += 0.0012 + motion * 0.004;

    // ── deep graphite ground with a slow chiaroscuro wash ───────────────────
    const bg = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, Math.max(w, h) * 0.75);
    const warmth = 0.5 + 0.5 * Math.sin(input.time * 0.15);
    bg.addColorStop(0, `rgb(${28 + warmth * 6}, ${30 + warmth * 4}, ${38})`);
    bg.addColorStop(0.55, "rgb(20, 23, 29)");
    bg.addColorStop(1, "rgb(12, 14, 18)");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // faint teal + ember ambient glows (slow drift, no strobe)
    const glowA = ctx.createRadialGradient(
      cx - R * 0.5, cy + R * 0.3, 0, cx - R * 0.5, cy + R * 0.3, R * 1.4,
    );
    glowA.addColorStop(0, `rgba(20, 120, 110, ${0.06 + motion * 0.05})`);
    glowA.addColorStop(1, "rgba(20, 120, 110, 0)");
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, w, h);
    const glowB = ctx.createRadialGradient(
      cx + R * 0.5, cy - R * 0.4, 0, cx + R * 0.5, cy - R * 0.4, R * 1.2,
    );
    glowB.addColorStop(0, `rgba(190, 90, 40, ${0.05 + motion * 0.05})`);
    glowB.addColorStop(1, "rgba(190, 90, 40, 0)");
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, w, h);

    // ── faint skeleton overlay (mirrored) ───────────────────────────────────
    if (landmarks && landmarks.length >= 33) {
      ctx.save();
      ctx.lineWidth = Math.max(1.5, R * 0.012);
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(150, 200, 210, 0.18)";
      const px = (l: Landmark) => (1 - l.x) * w; // mirror
      const py = (l: Landmark) => l.y * h;
      ctx.beginPath();
      for (const [a, b] of BONES) {
        const la = landmarks[a];
        const lb = landmarks[b];
        if (!la || !lb) continue;
        if ((la.visibility ?? 1) < 0.4 || (lb.visibility ?? 1) < 0.4) continue;
        ctx.moveTo(px(la), py(la));
        ctx.lineTo(px(lb), py(lb));
      }
      ctx.stroke();
      // joints
      ctx.fillStyle = "rgba(180, 220, 225, 0.28)";
      for (const l of landmarks) {
        if ((l.visibility ?? 1) < 0.5) continue;
        ctx.beginPath();
        ctx.arc((1 - l.x) * w, l.y * h, R * 0.008, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // ── the loom ring: step marks + accumulated slot brightness ─────────────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);

    // base ring
    ctx.lineWidth = Math.max(1, R * 0.006);
    ctx.strokeStyle = "rgba(120, 150, 160, 0.16)";
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < STEPS; i++) {
      const ang = -Math.PI / 2 + (i / STEPS) * Math.PI * 2;
      const life = loom.slots[i];
      const beat = i % 4 === 0;
      const inner = R * (beat ? 0.9 : 0.94);
      const outer = R * (beat ? 1.07 : 1.04);
      ctx.lineWidth = Math.max(1, R * (beat ? 0.014 : 0.008));
      ctx.strokeStyle = beat
        ? "rgba(200, 175, 150, 0.4)"
        : "rgba(150, 170, 175, 0.22)";
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner);
      ctx.lineTo(Math.cos(ang) * outer, Math.sin(ang) * outer);
      ctx.stroke();

      // deposited grain glow on the ring — ember-teal blend by intensity
      if (life > 0.02) {
        const gx = Math.cos(ang) * R;
        const gy = Math.sin(ang) * R;
        const rad = R * (0.05 + life * 0.14);
        const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, rad);
        gg.addColorStop(0, `rgba(255, 180, 90, ${0.5 * life})`);
        gg.addColorStop(0.5, `rgba(90, 200, 180, ${0.28 * life})`);
        gg.addColorStop(1, "rgba(90, 200, 180, 0)");
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(gx, gy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── playhead sweep ──────────────────────────────────────────────────────
    const hAng = -Math.PI / 2 + loom.head * Math.PI * 2;
    const grad = ctx.createLinearGradient(0, 0, Math.cos(hAng) * R * 1.1, Math.sin(hAng) * R * 1.1);
    grad.addColorStop(0, "rgba(255, 220, 180, 0.0)");
    grad.addColorStop(1, `rgba(255, 210, 150, ${0.35 + motion * 0.4})`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(2, R * 0.02);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(hAng) * R * 1.08, Math.sin(hAng) * R * 1.08);
    ctx.stroke();
    // playhead head glow
    const hx = Math.cos(hAng) * R * 1.08;
    const hy = Math.sin(hAng) * R * 1.08;
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * 0.12);
    hg.addColorStop(0, `rgba(255, 235, 200, ${0.6 + motion * 0.3})`);
    hg.addColorStop(1, "rgba(255, 200, 140, 0)");
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, R * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // ── spawn bursts + thread nodes from fired grains ───────────────────────
    for (const ev of loom.fired) {
      const ang = -Math.PI / 2 + (ev.slot / STEPS) * Math.PI * 2 + rot;
      const warm = WARM_LIMBS.has(ev.limb);
      const rad = limbRadius(ev.limb, R);
      bursts.push({
        ang,
        rad,
        r: 0,
        life: 1,
        warm,
        spin: (Math.random() - 0.5) * 0.02,
      });
      threads.push({ ang, rad, warm, age: 0 });
      if (threads.length > 40) threads.shift();
    }

    // ── woven threads between recent limb events ────────────────────────────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.lineWidth = Math.max(1, R * 0.004);
    for (let i = 1; i < threads.length; i++) {
      const a = threads[i - 1];
      const b = threads[i];
      a.age += 1;
      const alpha = Math.max(0, 0.5 - a.age * 0.004);
      if (alpha <= 0) continue;
      const warm = a.warm && b.warm;
      ctx.strokeStyle = warm
        ? `rgba(230, 150, 90, ${alpha})`
        : `rgba(80, 205, 180, ${alpha})`;
      const ax = Math.cos(a.ang) * a.rad;
      const ay = Math.sin(a.ang) * a.rad;
      const bx = Math.cos(b.ang) * b.rad;
      const by = Math.sin(b.ang) * b.rad;
      // curve toward the centre so threads "weave"
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(0, 0, bx, by);
      ctx.stroke();
    }
    if (threads.length && threads[0].age > 140) threads.shift();
    ctx.restore();

    // ── draw + age bursts ───────────────────────────────────────────────────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= 0.03;
      b.r += R * 0.02;
      b.ang += b.spin;
      if (b.life <= 0) {
        bursts.splice(i, 1);
        continue;
      }
      const x = Math.cos(b.ang) * b.rad;
      const y = Math.sin(b.ang) * b.rad;
      const rr = R * 0.03 + b.r;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
      if (b.warm) {
        g.addColorStop(0, `rgba(255, 190, 110, ${0.55 * b.life})`);
        g.addColorStop(0.4, `rgba(230, 120, 60, ${0.3 * b.life})`);
        g.addColorStop(1, "rgba(230, 120, 60, 0)");
      } else {
        g.addColorStop(0, `rgba(150, 245, 210, ${0.5 * b.life})`);
        g.addColorStop(0.4, `rgba(60, 190, 170, ${0.26 * b.life})`);
        g.addColorStop(1, "rgba(60, 190, 170, 0)");
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // ── centre readout: BPM + lock state ────────────────────────────────────
    ctx.save();
    ctx.translate(cx, cy);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const scale = R / 200;
    ctx.fillStyle = locked
      ? "rgba(245, 215, 175, 0.95)"
      : "rgba(180, 205, 210, 0.7)";
    ctx.font = `600 ${Math.round(46 * scale)}px ui-monospace, monospace`;
    ctx.fillText(`${Math.round(loom.bpm)}`, 0, -8 * scale);
    ctx.font = `500 ${Math.round(14 * scale)}px ui-monospace, monospace`;
    ctx.fillStyle = "rgba(200, 210, 215, 0.55)";
    ctx.fillText(locked ? "BPM · gait-locked" : "BPM · seeking gait", 0, 26 * scale);
    if (cadence > 0) {
      ctx.fillStyle = "rgba(120, 210, 190, 0.5)";
      ctx.fillText(`${Math.round(cadence)} steps/min`, 0, 46 * scale);
    }
    ctx.restore();
  };

  return { draw };
}
