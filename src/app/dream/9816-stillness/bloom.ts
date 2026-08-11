// ─────────────────────────────────────────────────────────────────────────────
// 9816 · Stillness — the bloom.
//
//   A Canvas2D radial mandala that GROWS from a dim point into a full luminous
//   field as the stillness meter `s` climbs, and contracts the instant you move.
//   No warm amber, no cosmic-indigo particle nebula — a cool, near-white
//   clinical void that blooms pale light.
//
//   Even at perfect stillness the field is alive: a seeded, deterministic slow
//   "breathing" modulation (mulberry32, seed 0x9816) makes an untouched muted
//   phone show a fully-bloomed field gently breathing — identical every load.
// ─────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic breathing: three slow sines with seeded phases. Range ≈ [-1, 1].
const TAU = Math.PI * 2;
const rng = mulberry32(0x9816);
const P1 = rng() * TAU;
const P2 = rng() * TAU;
const P3 = rng() * TAU;
const ROT_SEED = rng() * TAU;

function breathe(t: number, reduced: boolean): number {
  const k = reduced ? 0.4 : 1;
  return (
    0.55 * Math.sin(TAU * 0.05 * k * t + P1) +
    0.3 * Math.sin(TAU * 0.083 * k * t + P2) +
    0.15 * Math.sin(TAU * 0.021 * k * t + P3)
  );
}

// Ease so the bloom lingers near the top — the deep-listening payoff is broad.
function ease(s: number): number {
  return s * s * (3 - 2 * s);
}

export interface BloomState {
  /** Stillness meter, 0..1. */
  s: number;
  /** Seconds since mount (deterministic; starts at 0). */
  t: number;
  /** Recent-motion energy, 0..1 — adds a faint disturbance shimmer. */
  disturb: number;
  reduced: boolean;
}

/**
 * Paint one frame. `w`/`h` are CSS pixels; the caller has already scaled the
 * context for devicePixelRatio.
 */
export function renderBloom(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  st: BloomState,
): void {
  const { t, disturb, reduced } = st;
  const s = Math.min(1, Math.max(0, st.s));
  const e = ease(s);

  // Cool near-black void base.
  g.fillStyle = "#05060a";
  g.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.44;

  const br = 1 + 0.06 * breathe(t, reduced); // subtle radius breathing
  const bl = 0.85 + 0.15 * (0.5 + 0.5 * breathe(t + 4, reduced)); // luminance breath
  const bloomR = R * (0.1 + 0.9 * e) * br;

  g.save();
  g.globalCompositeOperation = "lighter";

  // 1 — soft luminous core (radial gradient white → cool → transparent).
  const coreA = (0.05 + 0.55 * e) * bl;
  const core = g.createRadialGradient(cx, cy, 0, cx, cy, bloomR);
  core.addColorStop(0, `rgba(238,244,255,${coreA})`);
  core.addColorStop(0.28, `rgba(196,214,240,${coreA * 0.6})`);
  core.addColorStop(0.7, `rgba(120,150,196,${coreA * 0.2})`);
  core.addColorStop(1, "rgba(90,120,170,0)");
  g.fillStyle = core;
  g.beginPath();
  g.arc(cx, cy, bloomR, 0, TAU);
  g.fill();

  // 2 — concentric rings, more of them as stillness deepens.
  const rings = Math.floor(2 + s * 7);
  for (let i = 1; i <= rings; i++) {
    const f = i / (rings + 1);
    const rr = bloomR * f;
    const shimmer = 0.5 + 0.5 * Math.sin(t * (reduced ? 0.15 : 0.4) + i * 0.9);
    const a = (0.03 + 0.22 * e) * (1 - f * 0.5) * (0.6 + 0.4 * shimmer);
    g.strokeStyle = `rgba(210,224,246,${a})`;
    g.lineWidth = 1 + e * 1.2;
    g.beginPath();
    g.arc(cx, cy, rr, 0, TAU);
    g.stroke();
  }

  // 3 — slow mandala petals: soft radial spokes that multiply with stillness.
  const petals = Math.floor(3 + s * 9);
  const rot = ROT_SEED + t * (reduced ? 0.01 : 0.03);
  for (let i = 0; i < petals; i++) {
    const ang = rot + (i / petals) * TAU;
    const x0 = cx + Math.cos(ang) * bloomR * 0.16;
    const y0 = cy + Math.sin(ang) * bloomR * 0.16;
    const x1 = cx + Math.cos(ang) * bloomR * 0.98;
    const y1 = cy + Math.sin(ang) * bloomR * 0.98;
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    const a = (0.04 + 0.14 * e) * bl;
    grad.addColorStop(0, `rgba(224,236,255,${a})`);
    grad.addColorStop(1, "rgba(150,180,220,0)");
    g.strokeStyle = grad;
    g.lineWidth = 1 + e * 1.5;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }

  g.restore();

  // 4 — faint disturbance haze: a cool contracting flicker when you move, so the
  //     "move = it retreats" gesture reads even before the bloom finishes ducking.
  if (disturb > 0.01) {
    g.save();
    g.globalCompositeOperation = "lighter";
    const a = disturb * 0.05;
    const hz = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.1);
    hz.addColorStop(0, "rgba(120,150,190,0)");
    hz.addColorStop(1, `rgba(150,175,210,${a})`);
    g.fillStyle = hz;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  // 5 — the always-visible stillness meter: a thin ring just outside the field.
  const meterR = R * 1.06;
  g.lineWidth = 2;
  g.strokeStyle = "rgba(255,255,255,0.06)"; // track
  g.beginPath();
  g.arc(cx, cy, meterR, 0, TAU);
  g.stroke();

  g.strokeStyle = `rgba(190,210,240,${0.35 + 0.4 * s})`; // filled arc
  g.lineCap = "round";
  g.beginPath();
  g.arc(cx, cy, meterR, -Math.PI / 2, -Math.PI / 2 + TAU * s);
  g.stroke();
  g.lineCap = "butt";
}
