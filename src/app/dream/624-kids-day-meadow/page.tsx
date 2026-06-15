"use client";

// A Whole Day — a long-form generative kids journey.
//
// One question: what if a kids music toy were a whole DAY? A slow self-evolving
// ~9-minute journey through dawn -> morning -> midday -> dusk -> night -> dawn
// that is genuinely different at minute 8 than at minute 1. The piece plays
// itself; the child decorates it by planting living things (flowers, birds,
// stars) that wake, sleep, and age with the time of day.
//
// Renderer: a single Canvas2D painterly side-on landscape diorama.
// Audio: a Chris-Wilson look-ahead scheduler over a kid-safe master chain.
//
// Refs: Brian Eno, Music for Airports / Bloom; Hustwit, ENO (2024);
// arXiv 2604.05343 Anchored Cyclic Generation (the motif-memory "anchor" idea).

import { useRef, useEffect, useState, useCallback } from "react";
import { makeAudio, type KidAudio } from "./audio";
import {
  sampleDay,
  makeMotif,
  voiceDegree,
  mutatedDegrees,
  wakefulness,
  type DayState,
  type Thing,
  type Kind,
} from "./engine";

const DAY_SECONDS = 540; // ~9 min for a full day at the settled rate.
const PREVIEW_RATE = 14; // accelerated day-rate before first interaction.
const MAX_THINGS = 24;
const IDLE_MS = 2500;

function kindForY(y: number, h: number): Kind {
  const f = y / h;
  if (f > 0.62) return "flower"; // low -> flower
  if (f > 0.34) return "bird"; // mid -> bird
  return "star"; // high/sky -> star
}

function hueForKind(kind: Kind, y: number, h: number): number {
  const f = 1 - y / h; // higher on screen = higher register
  if (kind === "flower") return 320 - f * 80; // magenta -> warm rose
  if (kind === "bird") return 150 + f * 80; // green -> teal/cyan
  return 48; // warm gold star
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // --- mutable engine state held in refs (never triggers React re-render) ---
  const audioRef = useRef<KidAudio | null>(null);
  const thingsRef = useRef<Thing[]>([]);
  const idRef = useRef(1);
  const startTimeRef = useRef(0); // performance.now()/1000 at start
  const phaseRef = useRef(0); // continuous 0..1 day phase
  const rateRef = useRef(PREVIEW_RATE); // current day-rate multiplier
  const interactedRef = useRef(false);
  const lastTickRef = useRef(0);
  const rafRef = useRef(0);
  const schedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastIdleRef = useRef(0);
  const dayRef = useRef<DayState>(sampleDay(0));

  // Plant a thing at CSS coords. Immediate sound + visual; capped + recycled.
  const plant = useCallback((x: number, y: number, ghost = false) => {
    const cv = canvasRef.current;
    const audio = audioRef.current;
    if (!cv || !audio) return;
    const h = cv.clientHeight;
    const kind = kindForY(y, h);
    const thing: Thing = {
      id: idRef.current++,
      kind,
      x,
      y,
      hue: hueForKind(kind, y, h),
      birthPhase: phaseRef.current,
      motif: makeMotif(kind),
      wakeful: 0,
      swayPhase: Math.random() * Math.PI * 2,
      lastSungAt: 0,
    };
    const arr = thingsRef.current;
    arr.push(thing);
    if (arr.length > MAX_THINGS) arr.shift(); // recycle oldest
    thing.nextNoteIdx = 0;

    // immediate confirmation chime so every tap rewards in <50ms
    const day = dayRef.current;
    const f = voiceDegree(day, thing.motif.degrees[0], thing.motif.octave);
    const t = audio.ctx.currentTime + 0.02;
    audio.tone(
      t,
      f,
      kind === "star" ? 1.6 : kind === "bird" ? 0.5 : 0.9,
      ghost ? 0.1 : 0.16,
      kind === "star" ? "bell" : kind === "bird" ? "pluck" : "pad",
      (x / cv.clientWidth) * 1.6 - 0.8,
    );
    thing.lastSungAt = t;
  }, []);

  // --- start (must run inside the user gesture for iOS audio unlock) ---
  const begin = useCallback(async () => {
    if (audioRef.current) return;
    const audio = makeAudio();
    audioRef.current = audio;
    await audio.resume();
    startTimeRef.current = performance.now() / 1000;
    lastTickRef.current = performance.now() / 1000;
    lastIdleRef.current = performance.now();
    setStarted(true);
  }, []);

  // Mark a real interaction: settle from preview rate to the full slow day.
  const markInteract = useCallback(() => {
    interactedRef.current = true;
    lastIdleRef.current = performance.now();
  }, []);

  // --- the audio scheduler (Chris Wilson look-ahead) ---
  useEffect(() => {
    if (!started) return;
    const audio = audioRef.current;
    if (!audio) return;

    const LOOKAHEAD = 0.12; // schedule this far ahead (s)
    // per-thing next-note clock, in audio time
    const nextAt = new Map<number, number>();
    let bedNextAt = 0;
    let ostinatoStep = 0;
    let ostinatoNextAt = 0;

    const pump = () => {
      const ctx = audio.ctx;
      const now = ctx.currentTime;
      const horizon = now + LOOKAHEAD;
      const day = dayRef.current;

      // Always-on bed: shift root + brightness with the phase.
      if (now >= bedNextAt) {
        const rootHz =
          440 * Math.pow(2, (Math.round(day.rootMidi) - 12 - 69) / 12);
        // bed louder in fuller parts of day, never silent
        const level = 0.08 + day.brightness * 0.1;
        audio.setBed(rootHz, day.brightness, level);
        bedNextAt = now + 0.4;
      }

      // Evolving ostinato bed-line: a gentle pulse following the day's scale.
      const beat = 1 / Math.max(0.4, day.bps);
      if (ostinatoNextAt < now) ostinatoNextAt = now + 0.05;
      while (ostinatoNextAt < horizon) {
        // density: sparser at the poles of the day
        const fire = Math.random() < 0.35 + day.brightness * 0.4;
        if (fire) {
          const deg = [0, 2, 4, 4, 2, 0, 7, 4][ostinatoStep % 8];
          const fr = voiceDegree(day, deg, -1);
          audio.tone(
            ostinatoNextAt,
            fr,
            beat * 1.4,
            0.06 + day.brightness * 0.05,
            "breath",
            Math.sin(ostinatoStep) * 0.4,
          );
        }
        ostinatoStep++;
        ostinatoNextAt += beat * 2;
      }

      // Each planted thing re-voices its (mutated) motif into the current scale.
      for (const th of thingsRef.current) {
        const wake = wakefulness(th.kind, day);
        if (wake < 0.12) continue; // asleep -> silent (but still drawn)
        let na = nextAt.get(th.id);
        if (na === undefined || na < now) {
          na = now + Math.random() * beat;
          nextAt.set(th.id, na);
        }
        while (na < horizon) {
          const age = (((day.phase - th.birthPhase) % 1) + 1) % 1;
          const degs = mutatedDegrees(th.motif, age);
          const step = (th.nextNoteIdx ?? 0) % degs.length;
          const deg = degs[step];
          const fr = voiceDegree(day, deg, th.motif.octave);
          const dur =
            th.kind === "star" ? 1.8 : th.kind === "bird" ? 0.45 : 0.8;
          const cv = canvasRef.current;
          const pan = cv ? (th.x / cv.clientWidth) * 1.6 - 0.8 : 0;
          audio.tone(
            na,
            fr,
            dur,
            (0.05 + wake * 0.1) *
              (th.kind === "bird" ? 0.9 : th.kind === "star" ? 1.1 : 1),
            th.kind === "star" ? "bell" : th.kind === "bird" ? "pluck" : "pad",
            pan,
          );
          th.lastSungAt = na;
          th.nextNoteIdx = (th.nextNoteIdx ?? 0) + 1;
          const rhy = th.motif.rhythm[step % th.motif.rhythm.length] || 1;
          na += beat * rhy * (th.kind === "star" ? 2.4 : 1.4);
        }
        nextAt.set(th.id, na);
      }
    };

    const id = setInterval(pump, 25);
    schedRef.current = id;
    return () => {
      clearInterval(id);
    };
  }, [started]);

  // --- the render + time loop (rAF) ---
  useEffect(() => {
    if (!started) return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    const ctx = ctx2d;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      w = cv.clientWidth;
      h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const nowS = performance.now() / 1000;
      let dt = nowS - lastTickRef.current;
      if (dt > 0.1) dt = 0.1; // clamp tab-away jumps
      lastTickRef.current = nowS;

      // ease the day-rate from preview down to full once the child interacts
      const target = interactedRef.current ? 1 : PREVIEW_RATE;
      rateRef.current += (target - rateRef.current) * Math.min(1, dt * 0.6);
      phaseRef.current =
        (phaseRef.current + (dt * rateRef.current) / DAY_SECONDS) % 1;
      const day = sampleDay(phaseRef.current);
      dayRef.current = day;

      // idle auto-demo: a ghost hand plants a couple of things if untouched
      if (!interactedRef.current && performance.now() - lastIdleRef.current > IDLE_MS) {
        lastIdleRef.current = performance.now();
        const gx = w * (0.2 + Math.random() * 0.6);
        const gy = h * (0.15 + Math.random() * 0.7);
        plant(gx, gy, true);
      }

      drawScene(ctx, w, h, day, thingsRef.current, nowS, audioRef.current);
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started, plant]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (schedRef.current) clearInterval(schedRef.current);
      cancelAnimationFrame(rafRef.current);
      const a = audioRef.current;
      if (a) {
        try {
          a.ctx.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const onPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cv = canvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      markInteract();
      plant(e.clientX - rect.left, e.clientY - rect.top);
    },
    [plant, markInteract],
  );

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05060f] text-white select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointer}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none" }}
      />

      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-[#0b1030] to-[#1a1230] px-6 text-center">
          <h1 className="font-serif text-4xl text-white sm:text-5xl">
            A Whole Day
          </h1>
          <p className="max-w-md text-base text-white/75">
            A song that lives a whole day by itself — from sunrise to starlight
            and back. Tap the meadow to plant flowers, birds, and stars. They
            wake, sleep, and grow with the light.
          </p>
          <button
            onClick={begin}
            className="flex min-h-[44px] items-center gap-3 rounded-full bg-amber-300 px-8 py-3.5 text-lg font-medium text-amber-950 shadow-lg shadow-amber-300/30 transition active:scale-95"
          >
            <span className="text-2xl">☀</span> Begin the day
          </button>
        </div>
      )}

      {started && (
        <>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="absolute right-3 top-3 z-10 min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 font-mono text-sm text-white/75 backdrop-blur transition active:scale-95"
          >
            notes
          </button>
          <div className="pointer-events-none absolute left-3 top-3 z-10 font-mono text-sm text-white/75">
            tap low → flower · mid → bird · sky → star
          </div>
          {showNotes && (
            <div className="absolute inset-x-3 bottom-3 z-10 max-h-[60dvh] overflow-auto rounded-2xl bg-black/70 p-5 text-base text-white/90 backdrop-blur">
              <p className="mb-2 text-white">
                A long-form generative journey: a continuous diurnal phase
                cross-fades through five musical regions (dawn, morning, midday,
                dusk, night) over ~9 minutes.
              </p>
              <p className="mb-2 text-white/75">
                Everything you plant stores a tiny motif. The engine re-voices
                those motifs into whatever scale the day is in now and mutates
                them as the light changes — so minute 8 is not minute 1, yet it
                all still belongs together.
              </p>
              <p className="text-white/75">
                After Brian Eno (Music for Airports / Bloom), Hustwit&apos;s
                ENO, and arXiv 2604.05343 Anchored Cyclic Generation.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Canvas2D painterly diorama renderer (pure draw fns; no React, no audio).
// ---------------------------------------------------------------------------

function rgb(c: [number, number, number], a = 1): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  day: DayState,
  things: Thing[],
  nowS: number,
  audio: KidAudio | null,
) {
  // --- sky gradient (full height, day-cycling) ---
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, rgb(day.sky[0]));
  sky.addColorStop(0.5, rgb(day.sky[1]));
  sky.addColorStop(1, rgb(day.sky[2]));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const horizon = h * 0.72;

  // --- stars (only at night) ---
  if (day.starAlpha > 0.01) {
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const sx = ((i * 97.13) % w);
      const sy = ((i * 53.7) % (horizon * 0.85));
      const tw = 0.5 + 0.5 * Math.sin(nowS * 1.5 + i);
      ctx.globalAlpha = day.starAlpha * (0.3 + tw * 0.7);
      ctx.fillStyle = "#fffbe8";
      const r = 0.8 + (i % 3) * 0.5;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- sun / moon traveling on a visible arc ---
  drawArc(ctx, w, horizon);
  if (day.sunAlt > 0.01) drawSun(ctx, w, horizon, day);
  if (day.moonAlt > 0.01) drawMoon(ctx, w, horizon, day);

  // --- drifting tinted clouds ---
  drawClouds(ctx, w, h, horizon, day, nowS);

  // --- parallax hills ---
  drawHills(ctx, w, h, horizon, day);

  // --- planted things ---
  for (const th of things) {
    const wake = wakefulness(th.kind, day);
    // smooth the visible wakefulness toward target
    th.wakeful += (wake - th.wakeful) * 0.08;
    const sang = audio ? Math.max(0, 1 - (audio.ctx.currentTime - th.lastSungAt) * 1.5) : 0;
    if (th.kind === "flower") drawFlower(ctx, th, sang, nowS);
    else if (th.kind === "bird") drawBird(ctx, th, sang, nowS, day);
    else drawStar(ctx, th, sang, nowS, day);
  }

  // --- gentle global brightness veil (darker at night) ---
  const dark = 1 - day.brightness;
  if (dark > 0.02) {
    ctx.fillStyle = `rgba(4,6,20,${dark * 0.28})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function arcXY(t: number, w: number, horizon: number): [number, number] {
  // t in [0,1] left->right; parabolic arc peaking at center.
  const x = t * w;
  const peak = horizon * 0.12;
  const y = horizon - Math.sin(t * Math.PI) * (horizon - peak);
  return [x, y];
}

function drawArc(ctx: CanvasRenderingContext2D, w: number, horizon: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const [x, y] = arcXY(i / 40, w, horizon);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSun(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  day: DayState,
) {
  // sun position from phase across daylight (0..0.78), peak at 0.42
  const t = Math.min(1, Math.max(0, day.phase / 0.8));
  const [x, y] = arcXY(t, w, horizon);
  const R = 34;
  const g = ctx.createRadialGradient(x, y, 2, x, y, R * 3);
  g.addColorStop(0, `rgba(255,244,200,${0.5 * day.sunAlt})`);
  g.addColorStop(1, "rgba(255,244,200,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(255,236,168,${0.85 * Math.max(0.3, day.sunAlt)})`;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
}

function drawMoon(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  day: DayState,
) {
  // moon arcs across the night window
  let t = (day.phase - 0.78) / 0.4; // 0.78..1 then wraps to 0..~0.05
  if (t < 0) t = (day.phase + 0.22) / 0.4;
  t = Math.min(1, Math.max(0, t));
  const [x, y] = arcXY(t, w, horizon);
  const R = 26;
  const g = ctx.createRadialGradient(x, y, 2, x, y, R * 3.2);
  g.addColorStop(0, `rgba(214,224,255,${0.4 * day.moonAlt})`);
  g.addColorStop(1, "rgba(214,224,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(236,240,255,${0.92 * day.moonAlt})`;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  // crater shadow for a soft crescent feel
  ctx.fillStyle = rgb(day.sky[0], 0.5 * day.moonAlt);
  ctx.beginPath();
  ctx.arc(x + 9, y - 5, R * 0.92, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  day: DayState,
  nowS: number,
) {
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const speed = 6 + i * 4;
    const cx = ((nowS * speed + i * 220) % (w + 300)) - 150;
    const cy = horizon * (0.2 + i * 0.13);
    const s = 34 + i * 10;
    ctx.fillStyle = rgb(day.cloud, 0.18 + day.brightness * 0.22);
    drawBlob(ctx, cx, cy, s);
  }
  ctx.restore();
}

function drawBlob(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.arc(x + s * 0.9, y + s * 0.15, s * 0.8, 0, Math.PI * 2);
  ctx.arc(x - s * 0.9, y + s * 0.18, s * 0.7, 0, Math.PI * 2);
  ctx.arc(x + s * 0.3, y - s * 0.3, s * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawHills(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  day: DayState,
) {
  const b = day.brightness;
  const layers: { y: number; col: [number, number, number]; amp: number }[] = [
    { y: horizon, col: [40 + b * 70, 80 + b * 90, 60 + b * 60], amp: 22 },
    { y: horizon + (h - horizon) * 0.28, col: [34 + b * 60, 92 + b * 80, 56 + b * 50], amp: 30 },
    { y: horizon + (h - horizon) * 0.6, col: [26 + b * 50, 100 + b * 70, 50 + b * 40], amp: 16 },
  ];
  for (const L of layers) {
    ctx.fillStyle = rgb(L.col);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, L.y);
    for (let x = 0; x <= w; x += 24) {
      const yy = L.y + Math.sin(x * 0.01 + L.y) * L.amp;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, awake: number) {
  // simple friendly cut-paper face; eyes close as it falls asleep
  const open = Math.max(0.1, awake);
  ctx.fillStyle = "rgba(40,30,40,0.85)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.4, y, r * 0.16, r * 0.16 * open, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.4, y, r * 0.16, r * 0.16 * open, 0, 0, Math.PI * 2);
  ctx.fill();
  if (awake > 0.3) {
    ctx.strokeStyle = "rgba(40,30,40,0.7)";
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.arc(x, y + r * 0.25, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  }
}

function drawFlower(ctx: CanvasRenderingContext2D, th: Thing, sang: number, nowS: number) {
  const open = th.wakeful; // bloom by day, close at night
  const sway = Math.sin(nowS * 0.8 + th.swayPhase) * 4;
  const x = th.x + sway;
  const y = th.y;
  const petalR = (16 + sang * 6) * (0.45 + open * 0.55);
  // stem
  ctx.strokeStyle = "rgba(60,120,60,0.8)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(th.x, y + 40);
  ctx.quadraticCurveTo(th.x + sway * 0.5, y + 18, x, y);
  ctx.stroke();
  // petals
  ctx.save();
  ctx.translate(x, y);
  const petals = 6;
  for (let i = 0; i < petals; i++) {
    ctx.rotate((Math.PI * 2) / petals);
    ctx.fillStyle = `hsla(${th.hue},80%,${60 + sang * 12}%,${0.55 + open * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(0, -petalR, petalR * 0.5, petalR, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // center + face
  ctx.fillStyle = `hsl(48,90%,${55 + sang * 20}%)`;
  ctx.beginPath();
  ctx.arc(x, y, petalR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  drawFace(ctx, x, y, petalR * 0.55, open);
}

function drawBird(
  ctx: CanvasRenderingContext2D,
  th: Thing,
  sang: number,
  nowS: number,
  day: DayState,
) {
  const awake = th.wakeful;
  // birds glide by day, roost (settle, eyes closed) at night
  const glide = awake * Math.sin(nowS * 0.5 + th.swayPhase) * 26;
  const x = th.x + glide;
  const bob = Math.sin(nowS * 2 + th.swayPhase) * (3 + sang * 4) * awake;
  const y = th.y + bob;
  const r = 16 + sang * 5;
  // body
  ctx.fillStyle = `hsla(${th.hue},70%,${55 + sang * 12}%,0.95)`;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.1, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // wings flap when singing
  const flap = Math.sin(nowS * 9 + th.swayPhase) * (0.4 + sang) * awake;
  ctx.fillStyle = `hsla(${th.hue},60%,46%,0.9)`;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(flap);
  ctx.beginPath();
  ctx.ellipse(-r * 0.9, -r * 0.2, r * 0.9, r * 0.4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // beak
  ctx.fillStyle = "rgba(245,180,60,0.95)";
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + r + 8, y - 3);
  ctx.lineTo(x + r + 8, y + 3);
  ctx.fill();
  drawFace(ctx, x - r * 0.2, y - r * 0.15, r * 0.7, awake);
  // little night "z" cue handled by closed eyes via drawFace
  void day;
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  th: Thing,
  sang: number,
  nowS: number,
  day: DayState,
) {
  const vis = th.wakeful * Math.max(day.starAlpha, day.moonAlt * 0.6 + 0.2);
  if (vis < 0.03) return;
  const tw = 0.6 + 0.4 * Math.sin(nowS * 2 + th.swayPhase);
  const R = (14 + sang * 8) * (0.6 + tw * 0.4);
  const x = th.x;
  const y = th.y;
  // glow
  const g = ctx.createRadialGradient(x, y, 1, x, y, R * 2.4);
  g.addColorStop(0, `hsla(${th.hue},95%,75%,${0.55 * vis})`);
  g.addColorStop(1, `hsla(${th.hue},95%,75%,0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * 2.4, 0, Math.PI * 2);
  ctx.fill();
  // 5-point star
  ctx.fillStyle = `hsla(${th.hue},95%,${72 + sang * 15}%,${0.85 * vis})`;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? R : R * 0.45;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  drawFace(ctx, x, y, R * 0.6, vis);
}
