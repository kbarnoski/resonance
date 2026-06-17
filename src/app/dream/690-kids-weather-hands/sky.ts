// sky.ts — the off-glass visual: a soft full-bleed sun<->cloud glow that
// "breathes". No buttons, no text to read while playing. A glance at the
// deployed page should look alive even before audio is unlocked.
//
// energy: 0 = sunny (warm gold, calm slow breath)
//         1 = stormy (cool slate/indigo, faster churn)

export interface SkyState {
  phase: number; // breathing phase
}

export function makeSky(): SkyState {
  return { phase: 0 };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  energy: number,
  state: SkyState,
  dt: number,
) {
  const e = Math.max(0, Math.min(1, energy));

  // breathing speeds up with energy
  state.phase += dt * (0.5 + e * 2.2);
  const breath = (Math.sin(state.phase) + 1) * 0.5; // 0..1

  // background wash: gold sky -> slate storm
  const cx = w * 0.5;
  const cy = h * (0.42 - 0.04 * e);
  const radius = Math.max(w, h) * (0.55 + 0.18 * breath - 0.05 * e);

  // edge (sky) color
  const edgeR = lerp(34, 18, e);
  const edgeG = lerp(28, 22, e);
  const edgeB = lerp(46, 40, e);

  // core (sun / storm-eye) color
  const coreR = lerp(255, 150, e);
  const coreG = lerp(214, 158, e);
  const coreB = lerp(140, 196, e);

  const g = ctx.createRadialGradient(cx, cy, radius * 0.04, cx, cy, radius);
  const coreA = lerp(0.95, 0.7, e) * (0.7 + 0.3 * breath);
  g.addColorStop(0, `rgba(${coreR | 0},${coreG | 0},${coreB | 0},${coreA})`);
  g.addColorStop(
    0.45,
    `rgba(${lerp(coreR, edgeR, 0.5) | 0},${lerp(coreG, edgeG, 0.5) | 0},${lerp(coreB, edgeB, 0.5) | 0},${0.6})`,
  );
  g.addColorStop(1, `rgba(${edgeR | 0},${edgeG | 0},${edgeB | 0},1)`);

  ctx.fillStyle = `rgb(${edgeR | 0},${edgeG | 0},${edgeB | 0})`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // sun rays (fade out as storm grows)
  const rayA = (1 - e) * (1 - e) * 0.18;
  if (rayA > 0.005) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(state.phase * 0.05);
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const len = radius * (0.6 + 0.15 * Math.sin(state.phase * 0.7 + i));
      ctx.strokeStyle = `rgba(255,226,170,${rayA})`;
      ctx.lineWidth = lerp(60, 30, breath);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * radius * 0.18, Math.sin(a) * radius * 0.18);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // storm clouds: drifting dark blobs that fade in as e grows
  const cloudA = e * e * 0.5;
  if (cloudA > 0.01) {
    const blobs = 5;
    for (let i = 0; i < blobs; i++) {
      const drift = state.phase * (0.18 + 0.05 * i) * (0.5 + e);
      const bx = ((Math.sin(drift + i * 1.7) * 0.5 + 0.5) * w);
      const by = cy + Math.cos(drift * 0.8 + i) * h * 0.12 + i * 18 - 30;
      const br = radius * (0.22 + 0.06 * i) * (0.9 + 0.1 * breath);
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      bg.addColorStop(0, `rgba(40,46,72,${cloudA})`);
      bg.addColorStop(1, "rgba(40,46,72,0)");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }

    // occasional soft "lightning" lift at high energy (no harsh flash)
    if (e > 0.75) {
      const flick = Math.max(0, Math.sin(state.phase * 3.0) - 0.985) * 40;
      if (flick > 0) {
        ctx.fillStyle = `rgba(200,210,255,${Math.min(0.12, flick * cloudA)})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  }
}
