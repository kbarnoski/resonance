"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Tilt Pool — a liquid harmony instrument you play by BALANCING.
//
// THE ONE QUESTION: What if you played chords by balancing — tilting your
// device so sound pools like water to the lowest corner?
//
// INPUT     : DeviceOrientationEvent (beta/gamma) → a tilt/gravity vector.
//             Desktop fallback: pointer position over the canvas IS the tilt.
// OUTPUT    : Canvas2D — a bright, daylit basin of colored liquid pools that
//             slump toward the low corner. Deep pools sing; thin pools fade.
// AUDIO     : Just-intonation drone bank, one sine+triangle voice per pool,
//             each voice's gain driven by that pool's depth. Shared lowpass
//             shimmer + feedback tail → DynamicsCompressor limiter → 0.2 master.
// TECHNIQUE : shallow-water pooling model + JI drone bank.
// PALETTE   : aqueous daylight (dawn blues / aqua / white foam / light ground).
//
// REFERENCE : Toshio Iwai's playful sensor-instrument lineage (Electroplankton);
//             physical balance/liquid instruments; the "pour sound like water"
//             metaphor.
//
// DEGRADES  : no tilt sensor / denied → pointer fallback, announced on screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "idle" | "running";
type Mode = "pointer" | "tilt";

// ── the pool bank ────────────────────────────────────────────────────────────
// Six pools in a just-intonation major scale over a base. Lower pitches sit
// lower in the basin, so a steep tilt collapses toward one deep low pool.
const BASE_HZ = 174.61; // F3-ish anchor
type PoolSpec = {
  ratio: number;
  x: number; // basin position, normalized 0..1 (y grows downward)
  y: number;
  rgb: [number, number, number];
};
const POOLS: PoolSpec[] = [
  { ratio: 1 / 1, x: 0.5, y: 0.82, rgb: [36, 96, 173] }, // deep dawn blue (root, bottom)
  { ratio: 9 / 8, x: 0.22, y: 0.63, rgb: [40, 140, 190] },
  { ratio: 5 / 4, x: 0.78, y: 0.6, rgb: [30, 165, 178] }, // teal
  { ratio: 4 / 3, x: 0.34, y: 0.4, rgb: [64, 190, 205] },
  { ratio: 3 / 2, x: 0.68, y: 0.36, rgb: [96, 205, 220] }, // cyan
  { ratio: 5 / 3, x: 0.5, y: 0.18, rgb: [150, 220, 230] }, // pale foam
];

// ── per-pool audio voice ─────────────────────────────────────────────────────
type Voice = {
  gain: GainNode;
  oscs: OscillatorNode[];
};

type Engine = {
  ctx: AudioContext;
  voices: Voice[];
  lowpass: BiquadFilterNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  masterGain: GainNode;
  comp: DynamicsCompressorNode;
  delay: DelayNode;
  fb: GainNode;
  wet: GainNode;
};

// mutable render/physics state kept off React's render path
type Field = {
  // target tilt vector (gravity direction), each component ~ -1..1
  tx: number;
  ty: number;
  // smoothed for display
  sx: number;
  sy: number;
  vols: number[]; // smoothed volume per pool
  prevVols: number[];
  ripple: number[]; // per-pool ripple timer 0..1
  lastAudioUpdate: number;
};

function computeProjection(px: number, py: number, gx: number, gy: number): number {
  // how far "downhill" a pool sits along the gravity direction (+ = toward low)
  return (px - 0.5) * gx + (py - 0.5) * gy;
}

function drawScene(
  ctx2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  field: Field,
  reduced: boolean,
  t: number,
): void {
  // ── bright daylit ground ──────────────────────────────────────────────────
  const bg = ctx2d.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#eaf7ff");
  bg.addColorStop(1, "#cfe9f5");
  ctx2d.fillStyle = bg;
  ctx2d.fillRect(0, 0, w, h);

  // basin: a shallow rounded bright bowl inset from the edges
  const pad = Math.min(w, h) * 0.06;
  const bx = pad;
  const by = pad;
  const bw = w - pad * 2;
  const bh = h - pad * 2;
  const r = Math.min(bw, bh) * 0.09;
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.moveTo(bx + r, by);
  ctx2d.arcTo(bx + bw, by, bx + bw, by + bh, r);
  ctx2d.arcTo(bx + bw, by + bh, bx, by + bh, r);
  ctx2d.arcTo(bx, by + bh, bx, by, r);
  ctx2d.arcTo(bx, by, bx + bw, by, r);
  ctx2d.closePath();
  const basin = ctx2d.createLinearGradient(0, by, 0, by + bh);
  basin.addColorStop(0, "#f6fdff");
  basin.addColorStop(1, "#e2f3fb");
  ctx2d.fillStyle = basin;
  ctx2d.fill();
  ctx2d.clip(); // pools live inside the basin

  const gx = field.sx;
  const gy = field.sy;
  const tiltMag = Math.min(1, Math.hypot(gx, gy));

  // ── liquid pools ────────────────────────────────────────────────────────────
  for (let i = 0; i < POOLS.length; i++) {
    const p = POOLS[i];
    const vol = field.vols[i];
    if (vol <= 0.01) continue;

    // slump: the pool centre drifts toward the low corner as tilt grows
    const slump = 0.07 * tiltMag;
    const wob = reduced ? 0 : Math.sin(t * 0.0011 + i * 1.7) * 0.006;
    const cx = bx + (p.x + gx * slump + wob) * bw;
    const cy = by + (p.y + gy * slump) * bh;

    // radius grows with depth/volume
    const baseR = Math.min(bw, bh) * (0.14 + vol * 0.16);

    // ripple ring when the pool has recently swelled
    const rip = field.ripple[i];
    if (rip > 0.02 && !reduced) {
      ctx2d.beginPath();
      const rr = baseR * (1 + (1 - rip) * 0.7);
      ctx2d.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx2d.strokeStyle = `rgba(255,255,255,${(rip * 0.5).toFixed(3)})`;
      ctx2d.lineWidth = 2;
      ctx2d.stroke();
    }

    // translucent liquid body
    const [rC, gC, bC] = p.rgb;
    const body = ctx2d.createRadialGradient(cx, cy, baseR * 0.1, cx, cy, baseR);
    const a = 0.18 + vol * 0.55;
    body.addColorStop(0, `rgba(${rC},${gC},${bC},${a.toFixed(3)})`);
    body.addColorStop(0.7, `rgba(${rC},${gC},${bC},${(a * 0.55).toFixed(3)})`);
    body.addColorStop(1, `rgba(${rC},${gC},${bC},0)`);
    ctx2d.fillStyle = body;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx2d.fill();

    // foam highlight — a soft light bloom, additive for daylight sparkle
    ctx2d.globalCompositeOperation = "lighter";
    const foam = ctx2d.createRadialGradient(
      cx - baseR * 0.22,
      cy - baseR * 0.28,
      0,
      cx - baseR * 0.22,
      cy - baseR * 0.28,
      baseR * 0.7,
    );
    foam.addColorStop(0, `rgba(255,255,255,${(vol * 0.4).toFixed(3)})`);
    foam.addColorStop(1, "rgba(255,255,255,0)");
    ctx2d.fillStyle = foam;
    ctx2d.beginPath();
    ctx2d.arc(cx - baseR * 0.22, cy - baseR * 0.28, baseR * 0.7, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.globalCompositeOperation = "source-over";
  }
  ctx2d.restore();

  // ── spirit-level / horizon indicator (top-right) ────────────────────────────
  const lvR = Math.min(w, h) * 0.07;
  const lvx = w - pad - lvR;
  const lvy = pad + lvR;
  ctx2d.save();
  ctx2d.beginPath();
  ctx2d.arc(lvx, lvy, lvR, 0, Math.PI * 2);
  ctx2d.strokeStyle = "rgba(40,90,140,0.55)";
  ctx2d.lineWidth = 2;
  ctx2d.stroke();
  // the "bubble" pulls toward the low corner
  const bubx = lvx + gx * lvR * 0.62;
  const buby = lvy + gy * lvR * 0.62;
  const bub = ctx2d.createRadialGradient(bubx, buby, 0, bubx, buby, lvR * 0.32);
  bub.addColorStop(0, "rgba(255,255,255,0.95)");
  bub.addColorStop(1, "rgba(120,200,220,0.5)");
  ctx2d.fillStyle = bub;
  ctx2d.beginPath();
  ctx2d.arc(bubx, buby, lvR * 0.3, 0, Math.PI * 2);
  ctx2d.fill();
  // level crosshair
  ctx2d.strokeStyle = "rgba(40,90,140,0.3)";
  ctx2d.lineWidth = 1;
  ctx2d.beginPath();
  ctx2d.moveTo(lvx - lvR * 0.5, lvy);
  ctx2d.lineTo(lvx + lvR * 0.5, lvy);
  ctx2d.moveTo(lvx, lvy - lvR * 0.5);
  ctx2d.lineTo(lvx, lvy + lvR * 0.5);
  ctx2d.stroke();
  ctx2d.restore();
}

function applyVoiceVolumes(engine: Engine, field: Field, now: number): void {
  // throttle setTargetAtTime calls to ~every 55ms; ramps stay smooth via tau
  if (now - field.lastAudioUpdate < 55) return;
  field.lastAudioUpdate = now;
  const t = engine.ctx.currentTime;
  for (let i = 0; i < engine.voices.length; i++) {
    const v = engine.voices[i];
    const target = field.vols[i] * 0.9;
    v.gain.gain.setTargetAtTime(target, t, 0.09);
  }
}

function runTeardown(
  engine: Engine | null,
  ctx2d: CanvasRenderingContext2D | null,
  canvas: HTMLCanvasElement | null,
): void {
  if (engine) {
    const t = engine.ctx.currentTime;
    engine.masterGain.gain.setTargetAtTime(0, t, 0.08);
    for (const v of engine.voices) {
      for (const o of v.oscs) {
        try {
          o.stop(t + 0.3);
        } catch {
          /* already stopped */
        }
      }
    }
    try {
      engine.lfo.stop(t + 0.3);
    } catch {
      /* noop */
    }
    setTimeout(() => {
      engine.ctx.close().catch(() => {});
    }, 400);
  }
  if (ctx2d && canvas) {
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
  }
}

export default function TiltPoolPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const rafRef = useRef<number>(0);
  const fieldRef = useRef<Field>({
    tx: 0,
    ty: 0,
    sx: 0,
    sy: 0,
    vols: POOLS.map(() => 0),
    prevVols: POOLS.map(() => 0),
    ripple: POOLS.map(() => 0),
    lastAudioUpdate: 0,
  });
  const orientHandlerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const reducedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("pointer");
  const [sensorMsg, setSensorMsg] = useState<string | null>(null);
  const [sensorErr, setSensorErr] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // ── resize with devicePixelRatio ────────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const c = canvas.getContext("2d");
    if (c) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2dRef.current = c;
    }
  }, []);

  // ── pointer over canvas → tilt vector (desktop fallback, always live) ────────
  const onPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (mode !== "pointer") return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width; // 0..1
      const ny = (e.clientY - rect.top) / rect.height;
      fieldRef.current.tx = Math.max(-1, Math.min(1, (nx - 0.5) * 2));
      fieldRef.current.ty = Math.max(-1, Math.min(1, (ny - 0.5) * 2));
    },
    [mode],
  );

  const onPointerLeave = useCallback(() => {
    if (mode !== "pointer") return;
    fieldRef.current.tx = 0;
    fieldRef.current.ty = 0;
  }, [mode]);

  // ── enable device tilt (iOS needs permission on a user gesture) ──────────────
  const enableTilt = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const DOE = (window as any).DeviceOrientationEvent;
    if (!DOE) {
      setSensorMsg("No tilt sensor on this device — playing with the pointer.");
      return;
    }
    if (typeof DOE.requestPermission === "function") {
      try {
        const perm = await DOE.requestPermission();
        if (perm !== "granted") {
          setSensorErr("Tilt permission denied — pointer control still works.");
          return;
        }
      } catch {
        setSensorErr("Tilt unavailable — pointer control still works.");
        return;
      }
    }

    let gotEvent = false;
    const handler = (e: DeviceOrientationEvent) => {
      const beta = e.beta; // front/back tilt (-180..180)
      const gamma = e.gamma; // left/right tilt (-90..90)
      if (beta === null && gamma === null) return;
      gotEvent = true;
      if (mode !== "tilt") {
        setMode("tilt");
        setSensorMsg(null);
        setSensorErr(null);
      }
      const f = fieldRef.current;
      f.tx = Math.max(-1, Math.min(1, (gamma ?? 0) / 40));
      f.ty = Math.max(-1, Math.min(1, ((beta ?? 0) - 0) / 40));
    };
    window.addEventListener("deviceorientation", handler);
    orientHandlerRef.current = handler;

    // if no orientation event fires shortly, this is a desktop — fall back.
    setTimeout(() => {
      if (!gotEvent) {
        setSensorMsg("No tilt readings — using the pointer as your tilt instead.");
      }
    }, 1400);
  }, [mode]);

  // ── Begin: unlock audio, build the drone bank, start the loop ────────────────
  const begin = useCallback(async () => {
    if (phase !== "idle") return;
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    resize();

    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();

    // master chain: bus → lowpass(+shimmer) → [dry + wet tail] → limiter → 0.2
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.2;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 24;
    comp.ratio.value = 12;
    comp.attack.value = 0.006;
    comp.release.value = 0.28;
    comp.connect(masterGain);
    masterGain.connect(ctx.destination);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1150;
    lowpass.Q.value = 0.7;

    // slow shimmer on the cutoff so the bank sounds liquid, not static
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = reducedRef.current ? 120 : 320;
    lfo.connect(lfoGain);
    lfoGain.connect(lowpass.frequency);
    lfo.start();

    // dry
    lowpass.connect(comp);
    // wet feedback tail for a watery bloom
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.19;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    lowpass.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(comp);

    // one voice per pool: sine (body) + soft detuned triangle (shimmer)
    const voices: Voice[] = POOLS.map((p) => {
      const freq = BASE_HZ * p.ratio;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(lowpass);

      const sine = ctx.createOscillator();
      sine.type = "sine";
      sine.frequency.value = freq;
      sine.connect(gain);
      sine.start();

      const tri = ctx.createOscillator();
      tri.type = "triangle";
      tri.frequency.value = freq;
      tri.detune.value = 7; // gentle beat for body
      const triGain = ctx.createGain();
      triGain.gain.value = 0.35;
      tri.connect(triGain);
      triGain.connect(gain);
      tri.start();

      return { gain, oscs: [sine, tri] };
    });

    engineRef.current = {
      ctx,
      voices,
      lowpass,
      lfo,
      lfoGain,
      masterGain,
      comp,
      delay,
      fb,
      wet,
    };

    setPhase("running");
  }, [phase, resize]);

  // ── the render + physics loop ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    let alive = true;
    let last = performance.now();

    const frame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(50, now - last);
      last = now;
      const f = fieldRef.current;
      const reduced = reducedRef.current;

      // smooth the tilt vector (calmer when reduced-motion)
      const k = reduced ? 0.05 : 0.12;
      f.sx += (f.tx - f.sx) * k;
      f.sy += (f.ty - f.sy) * k;

      // ── shallow-water pooling: liquid flows toward the low corner ────────────
      const gx = f.sx;
      const gy = f.sy;
      const tiltMag = Math.min(1, Math.hypot(gx, gy));
      for (let i = 0; i < POOLS.length; i++) {
        const p = POOLS[i];
        const proj = computeProjection(p.x, p.y, gx, gy);
        // level → every pool near base depth (a full chord);
        // steep → downhill pools deepen, uphill pools drain toward silence.
        const target = Math.max(0, Math.min(1, 0.45 + tiltMag * 1.7 * proj));
        f.prevVols[i] = f.vols[i];
        const vk = reduced ? 0.04 : 0.08;
        f.vols[i] += (target - f.vols[i]) * vk;
        // ripple when a pool swells
        const dv = f.vols[i] - f.prevVols[i];
        if (dv > 0.006) f.ripple[i] = 1;
        else f.ripple[i] = Math.max(0, f.ripple[i] - dt * 0.0022);
      }

      const engine = engineRef.current;
      if (engine) applyVoiceVolumes(engine, f, now);

      const ctx2d = ctx2dRef.current;
      const canvas = canvasRef.current;
      if (ctx2d && canvas) {
        const rect = canvas.getBoundingClientRect();
        drawScene(ctx2d, rect.width, rect.height, f, reduced, now);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    const onResize = () => resize();
    window.addEventListener("resize", onResize);

    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [phase, resize]);

  // ── full teardown on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    const raf = rafRef;
    const orient = orientHandlerRef;
    const engine = engineRef;
    const ctx2d = ctx2dRef;
    return () => {
      cancelAnimationFrame(raf.current);
      if (orient.current) {
        window.removeEventListener("deviceorientation", orient.current);
        orient.current = null;
      }
      // clearing a detached canvas is unnecessary on unmount — just kill audio.
      runTeardown(engine.current, ctx2d.current, null);
      engine.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (orientHandlerRef.current) {
      window.removeEventListener("deviceorientation", orientHandlerRef.current);
      orientHandlerRef.current = null;
    }
    runTeardown(engineRef.current, ctx2dRef.current, canvasRef.current);
    engineRef.current = null;
    setPhase("idle");
    setMode("pointer");
    fieldRef.current.vols = POOLS.map(() => 0);
    fieldRef.current.ripple = POOLS.map(() => 0);
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-foreground">
      <canvas
        ref={canvasRef}
        onPointerMove={onPointer}
        onPointerLeave={onPointerLeave}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* ── title + status (top-left) ──────────────────────────────────────── */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 max-w-lg p-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow">
          Tilt Pool
        </h1>
        <p className="mt-1 text-base text-muted-foreground drop-shadow">
          Balance the basin — sound pools like water to the lowest corner.
        </p>
        {phase === "running" && (
          <p className="mt-2 text-base text-violet-300 drop-shadow">
            Mode: {mode === "tilt" ? "device tilt" : "pointer (move over the pool)"}
          </p>
        )}
        {sensorMsg && (
          <p className="mt-1 text-base text-violet-300 drop-shadow">{sensorMsg}</p>
        )}
        {sensorErr && (
          <p className="mt-1 text-base text-violet-300 drop-shadow">{sensorErr}</p>
        )}
      </div>

      {/* ── controls (bottom-center) ───────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-wrap items-center justify-center gap-3 p-5">
        {phase === "idle" ? (
          <button
            onClick={begin}
            className="min-h-[44px] rounded-full bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground shadow-lg transition hover:bg-violet-400"
          >
            Begin
          </button>
        ) : (
          <>
            <button
              onClick={enableTilt}
              className="min-h-[44px] rounded-full bg-violet-500/85 px-4 py-2.5 text-base font-medium text-foreground shadow-lg transition hover:bg-violet-400"
            >
              Enable tilt
            </button>
            <button
              onClick={stop}
              className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base font-medium text-foreground shadow-lg backdrop-blur transition hover:bg-accent"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {/* ── design notes affordance (bottom-right corner) ──────────────────── */}
      <button
        onClick={() => setNotesOpen((v) => !v)}
        className="absolute bottom-5 right-5 z-20 min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base font-medium text-muted-foreground shadow backdrop-blur transition hover:bg-accent"
      >
        Read the design notes
      </button>

      {notesOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl bg-slate-900/90 p-6 shadow-2xl ring-1 ring-border">
            <h2 className="text-2xl font-semibold text-foreground">Tilt Pool — design notes</h2>
            <p className="mt-3 text-base text-muted-foreground">
              A liquid harmony instrument you play by <em>balancing</em>. The basin holds six
              colored pools, each tuned to a just-intonation degree over F. Tilt your device (or
              move the pointer, on desktop) and the liquid slumps toward the low corner: pools that
              gather there deepen and grow louder; thin pools fade.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Holding near level lets several pools coexist — a full chord. A steep tilt collapses
              everything into one deep, low pool. No touching notes, no dragging: you simply find
              the angle a chord lives at and hold it.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              input = tilt / pointer · output = canvas2d-bright · technique =
              shallow-water-pooling + JI-drone · palette = aqueous-daylight
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Reference: Toshio Iwai&apos;s playful sensor-instrument lineage (Electroplankton) and
              the &ldquo;pour sound like water&rdquo; metaphor of physical balance instruments.
            </p>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-full bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground transition hover:bg-violet-400"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
