// ─────────────────────────────────────────────────────────────────────────────
// render.ts — bright, daylit Canvas2D readout of the sun→Earth solar wind.
//
// A high-key daytime scene: a warm sun disc on the LEFT, Earth (with a faint
// magnetosphere bow shock) on the RIGHT, and streams of wind streaks flowing
// sun→Earth whose SPEED is the real wind speed and whose DENSITY is the real
// proton density. An aurora ribbon near Earth brightens/sparkles with Kp. Live
// numbers are overlaid in a translucent dark panel for contrast on the light sky.
//
// Photosensitive-safety: brightness only DRIFTS (a smooth <3 Hz sub-audio
// oscillation) — there is never a flash or strobe. prefers-reduced-motion slows
// particle motion and freezes the drift.
//
// makeScene() allocates a persistent particle pool. drawScene() advances it one
// frame from the current Targets. Both are DOM-free apart from the 2D context.
// ─────────────────────────────────────────────────────────────────────────────

import type { Targets } from "./mapping";

interface Streak {
  x: number; // 0..1 across sun→Earth
  y: number; // 0..1 vertical
  len: number; // streak length in px-ish (scaled at draw)
  jitter: number; // stable per-streak vertical wander seed
  bright: number; // 0..1 base brightness
}

export interface Scene {
  streaks: Streak[];
  t: number; // wall-clock seconds accumulator (for drift)
}

const MAX_STREAKS = 220;

// Deterministic pseudo-random so the idle scene is stable across reloads.
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function makeScene(): Scene {
  const streaks: Streak[] = [];
  for (let i = 0; i < MAX_STREAKS; i++) {
    streaks.push({
      x: seeded(i),
      y: seeded(i * 3.1 + 1),
      len: 12 + seeded(i * 7.7) * 26,
      jitter: seeded(i * 2.3 + 5),
      bright: 0.4 + seeded(i * 5.5) * 0.6,
    });
  }
  return { streaks, t: 0 };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Blend the daylight sky slightly toward violet as Bz goes negative (storm).
function skyStops(violet: number): [string, string] {
  // Calm: warm pale blue daylight. Storm: cooler violet-tinged high sky.
  const topH = lerp(205, 262, violet); // hue
  const topS = lerp(55, 48, violet);
  const topL = lerp(86, 74, violet);
  const botH = lerp(48, 275, violet);
  const botS = lerp(80, 40, violet);
  const botL = lerp(90, 82, violet);
  return [
    `hsl(${topH.toFixed(0)} ${topS.toFixed(0)}% ${topL.toFixed(0)}%)`,
    `hsl(${botH.toFixed(0)} ${botS.toFixed(0)}% ${botL.toFixed(0)}%)`,
  ];
}

/**
 * Draw one frame. `t` is null-safe idle targets are provided by the caller.
 * dt is seconds since last frame; reduced slows/freezes motion.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  w: number,
  h: number,
  target: Targets,
  dt: number,
  reduced: boolean,
): void {
  const motion = reduced ? 0.25 : 1;
  scene.t += reduced ? 0 : dt;

  // Smooth sub-3Hz brightness drift (0.35 Hz) — never a flash.
  const drift = 0.5 + 0.5 * Math.sin(scene.t * 0.35 * Math.PI * 2);

  // ── Sky ──────────────────────────────────────────────────────────────────
  const [top, bot] = skyStops(target.violet);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bot);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * 0.13;
  const sunY = h * 0.32;
  const sunR = Math.min(w, h) * 0.11;
  const earthX = w * 0.85;
  const earthY = h * 0.56;
  const earthR = Math.min(w, h) * 0.06;

  // ── Sun: warm glow + disc ──────────────────────────────────────────────────
  const glowR = sunR * (2.6 + 0.15 * drift);
  const glow = ctx.createRadialGradient(sunX, sunY, sunR * 0.4, sunX, sunY, glowR);
  glow.addColorStop(0, "rgba(255,241,200,0.95)");
  glow.addColorStop(0.35, "rgba(255,214,140,0.55)");
  glow.addColorStop(1, "rgba(255,214,140,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, glowR, 0, Math.PI * 2);
  ctx.fill();

  const disc = ctx.createRadialGradient(
    sunX - sunR * 0.2,
    sunY - sunR * 0.2,
    sunR * 0.1,
    sunX,
    sunY,
    sunR,
  );
  disc.addColorStop(0, "#fffef4");
  disc.addColorStop(0.7, "#ffe08a");
  disc.addColorStop(1, "#ffb545");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
  ctx.fill();

  // ── Wind streaks: sun → Earth. Speed & count from the data. ─────────────────
  const flowSpeed = lerp(0.09, 0.55, target.speed01) * motion; // fraction/sec
  // Density controls how many streaks are visible (fuller = denser wind).
  const visible = Math.round(lerp(40, MAX_STREAKS, target.density01));

  ctx.lineCap = "round";
  for (let i = 0; i < scene.streaks.length; i++) {
    const s = scene.streaks[i];
    // advance along sun→Earth; wrap.
    s.x += flowSpeed * dt;
    if (s.x > 1.08) s.x -= 1.16;

    if (i >= visible) continue;

    // Path: from just past the sun to Earth, gently bowed by the magnetosphere.
    const px = lerp(sunX + sunR * 1.1, earthX - earthR * 1.4, s.x);
    // vertical position + slow wander
    const wob = Math.sin(scene.t * 0.6 + s.jitter * Math.PI * 2) * 0.02 * motion;
    const py = lerp(h * 0.12, h * 0.9, s.y + wob);

    // Streaks brighten with speed; warm cream deflecting cool near Earth.
    const b = s.bright * (0.55 + 0.45 * drift);
    const warm = 1 - s.x; // warmer near the sun
    const r = Math.round(lerp(210, 255, warm));
    const g = Math.round(lerp(235, 244, warm));
    const bl = Math.round(lerp(255, 205, warm));
    const alpha = (0.15 + 0.5 * target.speed01) * b;
    const len = s.len * (0.6 + target.speed01 * 0.9);

    ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha.toFixed(3)})`;
    ctx.lineWidth = 1 + target.density01 * 1.6;
    ctx.beginPath();
    ctx.moveTo(px - len, py);
    ctx.lineTo(px, py);
    ctx.stroke();
  }

  // ── Magnetosphere bow shock in front of Earth ───────────────────────────────
  ctx.save();
  ctx.strokeStyle = `rgba(120,150,255,${(0.28 + 0.2 * target.violet).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const bowX = earthX - earthR * 2.4;
  ctx.moveTo(bowX, earthY - earthR * 3.2);
  ctx.quadraticCurveTo(
    bowX - earthR * 1.6,
    earthY,
    bowX,
    earthY + earthR * 3.2,
  );
  ctx.stroke();
  ctx.restore();

  // ── Aurora ribbon hugging Earth's day side — brightens/sparkles with Kp ─────
  const kp = target.sparkle; // 0..1
  if (kp > 0.001) {
    ctx.save();
    const ribbonX = earthX - earthR * 1.7;
    const bands = 3;
    for (let bnd = 0; bnd < bands; bnd++) {
      const phase = scene.t * (0.4 + bnd * 0.15) + bnd * 1.7;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const ty = k / 24;
        const yy = lerp(earthY - earthR * 2.6, earthY + earthR * 2.6, ty);
        const sway =
          Math.sin(ty * 6 + phase) * earthR * 0.5 * (0.4 + kp * 0.9) * motion;
        const xx = ribbonX - bnd * earthR * 0.35 + sway;
        if (k === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      // Green→magenta aurora, alpha scales with Kp and the smooth drift.
      const hue = lerp(140, 300, kp);
      const a = (0.12 + kp * 0.5) * (0.6 + 0.4 * drift);
      ctx.strokeStyle = `hsla(${hue.toFixed(0)} 90% 65% / ${a.toFixed(3)})`;
      ctx.lineWidth = 3 + kp * 4;
      ctx.stroke();
    }
    // Aurora sparkle dots (stable positions, twinkle by drift — no strobe).
    const sparks = Math.round(kp * 26);
    for (let sIdx = 0; sIdx < sparks; sIdx++) {
      const sx = ribbonX + (seeded(sIdx * 9.1) - 0.5) * earthR * 2;
      const sy = lerp(
        earthY - earthR * 2.4,
        earthY + earthR * 2.4,
        seeded(sIdx * 4.4 + 2),
      );
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(scene.t * 1.2 + sIdx));
      ctx.fillStyle = `hsla(${lerp(150, 300, kp).toFixed(0)} 95% 78% / ${(kp * tw).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.4 + kp * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ── Earth ───────────────────────────────────────────────────────────────────
  const eGlow = ctx.createRadialGradient(
    earthX,
    earthY,
    earthR * 0.7,
    earthX,
    earthY,
    earthR * 1.8,
  );
  eGlow.addColorStop(0, "rgba(150,200,255,0.4)");
  eGlow.addColorStop(1, "rgba(150,200,255,0)");
  ctx.fillStyle = eGlow;
  ctx.beginPath();
  ctx.arc(earthX, earthY, earthR * 1.8, 0, Math.PI * 2);
  ctx.fill();

  const earth = ctx.createRadialGradient(
    earthX - earthR * 0.3,
    earthY - earthR * 0.3,
    earthR * 0.2,
    earthX,
    earthY,
    earthR,
  );
  earth.addColorStop(0, "#eaf6ff");
  earth.addColorStop(0.55, "#5aa9e6");
  earth.addColorStop(1, "#22547e");
  ctx.fillStyle = earth;
  ctx.beginPath();
  ctx.arc(earthX, earthY, earthR, 0, Math.PI * 2);
  ctx.fill();
}
