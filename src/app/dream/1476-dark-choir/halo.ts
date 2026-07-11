// ─────────────────────────────────────────────────────────────────────────────
// halo.ts — the deliberately restrained luminance field. This piece is AUDIO
// FIRST: it is meant to work with your eyes closed. The screen is a companion,
// not the show — a near-black field with a single soft breathing halo whose
// brightness and size track your voice, drifting slowly (well under 3 Hz, no
// flicker). It stays gently alive even in silence so a reviewer never faces a
// dead black rectangle.
//
//   Framed as luminous ASCENT: the halo sits a little high and a faint upward
//   wash brightens as the choir climbs — being lifted, not dissolving.
// ─────────────────────────────────────────────────────────────────────────────

export interface Halo {
  /** Feed the 0..1 luminance target (from the choir's live glow). */
  setLevel(level: number): void;
  /** Paint one frame. tMs from performance.now(). */
  draw(tMs: number): void;
  resize(): void;
  dispose(): void;
}

export function makeHalo(canvas: HTMLCanvasElement, reducedMotion: boolean): Halo {
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) {
    // Extremely unlikely, but never throw — return a no-op halo.
    return {
      setLevel() {},
      draw() {},
      resize() {},
      dispose() {},
    };
  }
  const g = ctx2d;

  let dpr = 1;
  let w = 0;
  let h = 0;
  let level = 0.18; // smoothed luminance actually rendered
  let target = 0.18;

  // Positional drift is disabled under prefers-reduced-motion; the slow
  // brightness breathing (~0.08 Hz) remains — it is luminance, not motion.
  const driftAmp = reducedMotion ? 0 : 1;

  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  const setLevel = (l: number) => {
    target = Math.min(1, Math.max(0, l));
  };

  const draw = (tMs: number) => {
    const t = tMs / 1000;
    // Ease rendered level toward target so nothing snaps (no flicker).
    level += (target - level) * 0.08;

    // A quiet baseline breath so the field is never fully dark.
    const breath = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.08 * t);
    const lum = Math.min(1, 0.12 + 0.08 * breath + 0.9 * level);

    // Near-black base wash, faintly warmer toward the top (the ascent).
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, `rgba(14,10,26,1)`);
    bg.addColorStop(1, `rgba(3,3,8,1)`);
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    // Halo sits a little above centre; drifts slowly when motion is allowed.
    const cx = w / 2 + driftAmp * Math.sin(2 * Math.PI * 0.017 * t) * (w * 0.05);
    const cy =
      h * 0.44 + driftAmp * Math.sin(2 * Math.PI * 0.013 * t + 1.3) * (h * 0.04);
    const baseR = Math.min(w, h) * 0.16;
    const radius = baseR * (0.75 + 0.9 * lum);

    // Soft violet-warm core → transparent. Colour warms slightly as it rises.
    const coreR = Math.round(220 + 30 * lum);
    const coreG = Math.round(205 + 20 * lum);
    const coreB = Math.round(255 - 30 * lum);
    const halo = g.createRadialGradient(cx, cy, 0, cx, cy, radius);
    halo.addColorStop(0, `rgba(${coreR},${coreG},${coreB},${0.55 * lum + 0.08})`);
    halo.addColorStop(0.4, `rgba(180,150,230,${0.28 * lum + 0.03})`);
    halo.addColorStop(1, `rgba(120,90,200,0)`);
    g.globalCompositeOperation = "lighter";
    g.fillStyle = halo;
    g.beginPath();
    g.arc(cx, cy, radius, 0, Math.PI * 2);
    g.fill();

    // A faint upward wash — being lifted — that brightens with the choir.
    const wash = g.createLinearGradient(0, h, 0, 0);
    wash.addColorStop(0, `rgba(90,70,170,0)`);
    wash.addColorStop(1, `rgba(150,130,220,${0.05 * level})`);
    g.fillStyle = wash;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";
  };

  return {
    setLevel,
    draw,
    resize,
    dispose() {
      /* nothing retained; canvas is owned by the page */
    },
  };
}
