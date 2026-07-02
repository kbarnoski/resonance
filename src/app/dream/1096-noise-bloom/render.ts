// Canvas2D field for "Noise Bloom" — the visual meter of the SR effect.
//
// Low clarity  -> particles scatter as pure static grain.
// Near sweet-spot -> they cohere into slow drifting luminous filaments and a
//                    central bloom that pulses with the emerging melody.
// Past sweet-spot -> dissolves back into chaos.
// All motion is slow luminance/coherence drift (well under 3 Hz). No strobe.

const TWO_PI = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export interface FieldState {
  clarity: number;
  pulse: number;
  noiseLevel: number;
}

export interface FieldRenderer {
  resize(): void;
  frame(s: FieldState): void;
  dispose(): void;
}

interface Grain {
  cx: number; // chaos home, normalized 0..1
  cy: number;
  fil: number; // filament index
  r: number; // radius fraction along filament
  ph: number; // phase
  spd: number; // individual speed
}

const FILAMENTS = 9;

export function makeField(canvas: HTMLCanvasElement): FieldRenderer {
  const ctx = canvas.getContext("2d");
  let dpr = 1;
  let w = 0;
  let h = 0;
  let lastT = performance.now();
  let time = 0;

  const N = 240;
  const grains: Grain[] = Array.from({ length: N }, (_, i) => ({
    cx: Math.random(),
    cy: Math.random(),
    fil: i % FILAMENTS,
    r: 0.14 + 0.82 * Math.random(),
    ph: Math.random() * TWO_PI,
    spd: 0.25 + Math.random() * 0.7,
  }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(1, Math.floor(rect.width));
    h = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function frame(s: FieldState) {
    if (!ctx) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    time += dt;

    // smoothstep the coherence so the bloom feels organic
    const cl = clamp01(s.clarity);
    const c = cl * cl * (3 - 2 * cl);
    const pulse = clamp01(s.pulse);

    // slow trailing fade — smooth, never a hard flash
    ctx.fillStyle = "rgba(6, 7, 12, 0.16)";
    ctx.fillRect(0, 0, w, h);

    const cxp = w / 2;
    const cyp = h / 2;
    const R = Math.min(w, h) * 0.42;

    ctx.globalCompositeOperation = "lighter";
    for (const p of grains) {
      // chaos: slow brownian wander, wrapped
      p.cx += (Math.random() - 0.5) * 0.012;
      p.cy += (Math.random() - 0.5) * 0.012;
      if (p.cx < 0) p.cx += 1;
      else if (p.cx > 1) p.cx -= 1;
      if (p.cy < 0) p.cy += 1;
      else if (p.cy > 1) p.cy -= 1;
      const chaosX = p.cx * w;
      const chaosY = p.cy * h;

      // filament flow
      const ang = p.fil * (TWO_PI / FILAMENTS) + 0.25 * Math.sin(time * 0.12 + p.fil);
      const rad = R * p.r * (0.6 + 0.4 * Math.sin(time * 0.2 * p.spd + p.ph));
      const perp = 16 * Math.sin(time * 0.5 * p.spd + p.ph + p.r * 8);
      const flowX = cxp + Math.cos(ang) * rad - Math.sin(ang) * perp;
      const flowY = cyp + Math.sin(ang) * rad + Math.cos(ang) * perp;

      const x = chaosX + (flowX - chaosX) * c;
      const y = chaosY + (flowY - chaosY) * c;

      const a = clamp01(0.05 + 0.42 * c + 0.32 * c * pulse);
      const size = 0.8 + 1.8 * c;
      const rr = Math.round(178 + 55 * c);
      const gg = Math.round(162 + 70 * c);
      ctx.fillStyle = `rgba(${rr}, ${gg}, 255, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TWO_PI);
      ctx.fill();
    }

    // central bloom — brightens toward the sweet-spot and pulses with the melody
    const bloomA = clamp01(0.05 * c + 0.26 * c + 0.34 * c * pulse);
    if (bloomA > 0.001) {
      const rg = ctx.createRadialGradient(cxp, cyp, 0, cxp, cyp, R * 1.1);
      rg.addColorStop(0, `rgba(196, 178, 255, ${bloomA})`);
      rg.addColorStop(0.5, `rgba(150, 130, 255, ${bloomA * 0.4})`);
      rg.addColorStop(1, "rgba(120, 110, 255, 0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cxp, cyp, R * 1.1, 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function dispose() {
    // nothing persistent to release
  }

  resize();
  return { resize, frame, dispose };
}
