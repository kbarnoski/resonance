"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════════════════════════════════════
// 1542 — Flow Tracer
//
// THE QUESTION: "What if your own body's MOTION, seen through the webcam,
// smeared the air into blooming LSD-style colour tracers you can hear?"
//
// state: LSD · pole: ecstatic / embodied / kinetic
//
// A dense frame-difference / normal-flow motion field is computed by hand in JS
// on a 64×36 grid (per-cell temporal delta + local spatial gradient → a 2-D
// motion vector). That field is the SOLE controller. It advects an iridescent
// violet dye/particle field inside a Canvas2D ping-pong feedback trail (previous
// frame re-drawn slightly zoomed/rotated at <1 alpha = positive-afterimage
// tracers). Total motion energy + its spatial centroid drive a granular/additive
// Web Audio voice over a soft drone bed — the bloom and the burst are one event.
//
// Never blank / never silent: if the camera is denied or unavailable, a seeded
// synthetic drifting motion field drives the exact same viz + audio.
//
// See README.md for named references and design notes.
// ════════════════════════════════════════════════════════════════════════════

type Mode = "idle" | "running";

// grid resolution for the dense motion field
const GW = 64;
const GH = 36;
const CELLS = GW * GH;
const MAX_PARTICLES = 420;
const MAX_VOICES = 14;

// deterministic PRNG — mulberry32 (the only source of randomness; no wall-clock)
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Particle {
  x: number; // normalized 0..1
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
}

// A soft granular / additive violet voice. Kept tiny; capped by the pool.
function makeMotionSeed(): number {
  // fixed constant, no time source — determinism preserved
  return 0x9e3779b1;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sampleRef = useRef<HTMLCanvasElement | null>(null);

  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const droneStopRef = useRef<(() => void) | null>(null);
  const voiceEndsRef = useRef<number[]>([]);
  const grainClockRef = useRef<number>(0);

  // motion field buffers
  const prevBrightRef = useRef<Float32Array | null>(null);
  const fieldVxRef = useRef<Float32Array>(new Float32Array(CELLS));
  const fieldVyRef = useRef<Float32Array>(new Float32Array(CELLS));
  const fieldMagRef = useRef<Float32Array>(new Float32Array(CELLS));
  const energyRef = useRef<number>(0);
  const centroidRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  const particlesRef = useRef<Particle[]>([]);
  const rngRef = useRef<() => number>(makeRng(makeMotionSeed()));
  const lastTimeRef = useRef<number>(0);
  const cameraLiveRef = useRef<boolean>(false);
  const reducedRef = useRef<boolean>(false);
  const hueRef = useRef<number>(276);

  const [mode, setMode] = useState<Mode>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);

  // ── synthetic motion field: seeded drifting blobs (used when no camera) ────
  const stepSyntheticField = useCallback((now: number) => {
    const vx = fieldVxRef.current;
    const vy = fieldVyRef.current;
    const mag = fieldMagRef.current;
    const t = now * 0.001;
    // three wandering attractors that push the dye around
    const blobs = [
      { x: 0.5 + 0.34 * Math.sin(t * 0.37), y: 0.5 + 0.3 * Math.cos(t * 0.29), s: 0.16 },
      { x: 0.5 + 0.4 * Math.sin(t * 0.23 + 2.1), y: 0.5 + 0.34 * Math.sin(t * 0.41 + 1.2), s: 0.2 },
      { x: 0.5 + 0.28 * Math.cos(t * 0.5 + 4.0), y: 0.5 + 0.26 * Math.sin(t * 0.33 + 3.3), s: 0.13 },
    ];
    let energy = 0;
    let cxW = 0;
    let cyW = 0;
    let wsum = 0;
    const speed = reducedRef.current ? 0.4 : 1;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const i = gy * GW + gx;
        const nx = (gx + 0.5) / GW;
        const ny = (gy + 0.5) / GH;
        let fx = 0;
        let fy = 0;
        let m = 0;
        for (const b of blobs) {
          const dx = nx - b.x;
          const dy = ny - b.y;
          const d2 = dx * dx + dy * dy;
          const g = Math.exp(-d2 / (b.s * b.s));
          // curl-ish tangential push for spiral flavour (Klüver-style)
          fx += (-dy * 1.6 + dx * 0.4) * g;
          fy += (dx * 1.6 + dy * 0.4) * g;
          m += g;
        }
        vx[i] = fx * speed;
        vy[i] = fy * speed;
        mag[i] = Math.min(1, m * 0.9) * speed;
        energy += mag[i];
        cxW += nx * mag[i];
        cyW += ny * mag[i];
        wsum += mag[i];
      }
    }
    energyRef.current = Math.min(1, (energy / CELLS) * 6);
    if (wsum > 1e-4) {
      centroidRef.current = { x: cxW / wsum, y: cyW / wsum };
    }
  }, []);

  // ── dense motion field from webcam pixels (normal-flow gradient constraint) ─
  const stepCameraField = useCallback(() => {
    const video = videoRef.current;
    const sample = sampleRef.current;
    if (!video || !sample || video.readyState < 2) return false;
    const sctx = sample.getContext("2d", { willReadFrequently: true });
    if (!sctx) return false;

    // mirror the webcam so it reads like a mirror
    sctx.save();
    sctx.translate(GW, 0);
    sctx.scale(-1, 1);
    sctx.drawImage(video, 0, 0, GW, GH);
    sctx.restore();

    let img: ImageData;
    try {
      img = sctx.getImageData(0, 0, GW, GH);
    } catch {
      return false;
    }
    const data = img.data;
    const bright = new Float32Array(CELLS);
    for (let i = 0; i < CELLS; i++) {
      const p = i * 4;
      bright[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
    }

    const prev = prevBrightRef.current;
    prevBrightRef.current = bright;
    if (!prev) return false;

    const vx = fieldVxRef.current;
    const vy = fieldVyRef.current;
    const mag = fieldMagRef.current;
    let energy = 0;
    let cxW = 0;
    let cyW = 0;
    let wsum = 0;
    const eps = 1e-3;

    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const i = gy * GW + gx;
        const xm = gx > 0 ? i - 1 : i;
        const xp = gx < GW - 1 ? i + 1 : i;
        const ym = gy > 0 ? i - GW : i;
        const yp = gy < GH - 1 ? i + GW : i;
        // spatial gradients (central difference) and temporal delta
        const Ix = (bright[xp] - bright[xm]) * 0.5;
        const Iy = (bright[yp] - bright[ym]) * 0.5;
        const It = bright[i] - prev[i];
        // brightness-constancy normal flow: v = -It * grad / |grad|^2
        const denom = Ix * Ix + Iy * Iy + eps;
        let fvx = (-It * Ix) / denom;
        let fvy = (-It * Iy) / denom;
        // clamp runaway vectors
        fvx = Math.max(-3, Math.min(3, fvx));
        fvy = Math.max(-3, Math.min(3, fvy));
        const m = Math.min(1, Math.abs(It) * 6);
        // light temporal smoothing to keep the field silky
        vx[i] = vx[i] * 0.55 + fvx * 0.45;
        vy[i] = vy[i] * 0.55 + fvy * 0.45;
        mag[i] = mag[i] * 0.5 + m * 0.5;
        energy += mag[i];
        cxW += ((gx + 0.5) / GW) * mag[i];
        cyW += ((gy + 0.5) / GH) * mag[i];
        wsum += mag[i];
      }
    }
    energyRef.current = Math.min(1, (energy / CELLS) * 10);
    if (wsum > 1e-3) {
      centroidRef.current = { x: cxW / wsum, y: cyW / wsum };
    }
    return true;
  }, []);

  // ── advect + spawn particles from the motion field ─────────────────────────
  const stepParticles = useCallback((dt: number) => {
    const rng = rngRef.current;
    const parts = particlesRef.current;
    const vxF = fieldVxRef.current;
    const vyF = fieldVyRef.current;
    const magF = fieldMagRef.current;
    const strength = reducedRef.current ? 0.35 : 0.6;

    // advect existing particles by sampling the field
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k];
      const gx = Math.max(0, Math.min(GW - 1, Math.floor(p.x * GW)));
      const gy = Math.max(0, Math.min(GH - 1, Math.floor(p.y * GH)));
      const i = gy * GW + gx;
      p.vx += vxF[i] * strength * dt * 3;
      p.vy += vyF[i] * strength * dt * 3;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05 || p.life <= 0) {
        parts.splice(k, 1);
      }
    }

    // spawn where the field is hot
    const budget = MAX_PARTICLES - parts.length;
    if (budget > 0) {
      const spawnScale = energyRef.current;
      let spawned = 0;
      const maxSpawn = Math.min(budget, Math.floor(4 + spawnScale * 40));
      for (let attempt = 0; attempt < maxSpawn * 3 && spawned < maxSpawn; attempt++) {
        const gx = Math.floor(rng() * GW);
        const gy = Math.floor(rng() * GH);
        const i = gy * GW + gx;
        if (magF[i] > 0.08 && rng() < magF[i]) {
          const nx = (gx + rng()) / GW;
          const ny = (gy + rng()) / GH;
          const maxLife = 1.4 + rng() * 2.2;
          parts.push({
            x: nx,
            y: ny,
            vx: vxF[i] * 0.4 + (rng() - 0.5) * 0.02,
            vy: vyF[i] * 0.4 + (rng() - 0.5) * 0.02,
            life: maxLife,
            maxLife,
            hue: hueRef.current + (rng() - 0.5) * 70,
            size: 4 + magF[i] * 14 + rng() * 6,
          });
          spawned++;
        }
      }
    }
  }, []);

  // ── render the ping-pong feedback + dye blooms ─────────────────────────────
  const drawFrame = useCallback((dt: number) => {
    const canvas = canvasRef.current;
    const buf = bufRef.current;
    if (!canvas || !buf) return;
    const ctx = canvas.getContext("2d");
    const bctx = buf.getContext("2d");
    if (!ctx || !bctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      buf.width = w;
      buf.height = h;
      ctx.fillStyle = "#05010c";
      ctx.fillRect(0, 0, w, h);
    }

    const reduced = reducedRef.current;
    // gentle, never-strobing feedback transform (all luminance change ≤ ~3 Hz)
    const decay = reduced ? 0.9 : 0.93;
    const zoom = reduced ? 1.003 : 1.006 + energyRef.current * 0.004;
    const rot = (reduced ? 0.0004 : 0.0012) * Math.sin(hueRef.current * 0.01);

    // 1) lay down the decayed, warped previous frame = positive-afterimage trail
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.globalAlpha = decay;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    ctx.translate(-w / 2, -h / 2);
    ctx.drawImage(buf, 0, 0, w, h);
    ctx.restore();

    // faint violet vignette floor so it never reads as pure black
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(10,3,22,0.06)";
    ctx.fillRect(0, 0, w, h);

    // 2) fresh iridescent dye, additive, streaked along each motion vector
    ctx.globalCompositeOperation = "lighter";
    const parts = particlesRef.current;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const px = p.x * w;
      const py = p.y * h;
      const lifeFrac = p.life / p.maxLife;
      const alpha = Math.min(0.5, lifeFrac * 0.5);
      const light = 55 + lifeFrac * 20;
      const r = p.size * dpr * (0.6 + lifeFrac * 0.6);
      // streak: trail the particle back along its velocity for the smear
      const tailX = px - p.vx * w * 0.12;
      const tailY = py - p.vy * h * 0.12;
      ctx.strokeStyle = `hsla(${p.hue} 92% ${light}% / ${alpha * 0.8})`;
      ctx.lineWidth = r * 0.7;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(px, py);
      ctx.stroke();
      // core bloom
      ctx.fillStyle = `hsla(${p.hue} 95% ${light + 12}% / ${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // 3) copy the composited frame into the ping-pong buffer for next time
    bctx.clearRect(0, 0, w, h);
    bctx.drawImage(canvas, 0, 0, w, h);

    // slowly drift the base hue through the violet band (indigo→magenta)
    hueRef.current += (reduced ? 6 : 12) * dt;
    if (hueRef.current > 320) hueRef.current -= 90;
  }, []);

  // ── audio: granular/additive voice + drone bed ─────────────────────────────
  const spawnGrain = useCallback((now: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    // prune finished voices
    const t = ctx.currentTime;
    voiceEndsRef.current = voiceEndsRef.current.filter((e) => e > t);
    if (voiceEndsRef.current.length >= MAX_VOICES) return;

    const rng = rngRef.current;
    const c = centroidRef.current;
    const energy = energyRef.current;
    // vertical centroid → pitch (up = higher); pentatonic-minor over violet mood
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const up = 1 - c.y;
    const idx = Math.max(0, Math.min(scale.length - 1, Math.floor(up * scale.length)));
    const base = 196; // G3
    const freq = base * Math.pow(2, (scale[idx] + (rng() < 0.3 ? 12 : 0)) / 12);
    // horizontal centroid → stereo pan
    const pan = Math.max(-1, Math.min(1, (c.x - 0.5) * 2));

    const osc = ctx.createOscillator();
    osc.type = rng() < 0.5 ? "sine" : "triangle";
    osc.frequency.value = freq * (1 + (rng() - 0.5) * 0.01);
    const partial = ctx.createOscillator(); // additive shimmer
    partial.type = "sine";
    partial.frequency.value = freq * 2.01;
    const pg = ctx.createGain();
    pg.gain.value = 0.25;
    const g = ctx.createGain();
    const pan2 = ctx.createStereoPanner();
    pan2.pan.value = pan;

    osc.connect(g);
    partial.connect(pg).connect(g);
    g.connect(pan2).connect(master);

    const dur = 0.18 + rng() * 0.35;
    const peak = (0.05 + energy * 0.13) * (0.6 + up * 0.5);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    partial.start(now);
    osc.stop(now + dur + 0.02);
    partial.stop(now + dur + 0.02);
    voiceEndsRef.current.push(now + dur + 0.02);
  }, []);

  const stepAudio = useCallback((dt: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const energy = energyRef.current;
    // grain density scales with total motion energy
    const rate = (reducedRef.current ? 6 : 16) * energy + 1.2;
    grainClockRef.current += rate * dt;
    while (grainClockRef.current >= 1) {
      grainClockRef.current -= 1;
      spawnGrain(ctx.currentTime + 0.01);
    }
  }, [spawnGrain]);

  // ── main loop ──────────────────────────────────────────────────────────────
  const loop = useCallback(() => {
    const now = performance.now();
    let dt = (now - lastTimeRef.current) / 1000;
    lastTimeRef.current = now;
    if (!(dt > 0) || dt > 0.1) dt = 0.016;

    const cameraOk = cameraLiveRef.current ? stepCameraField() : false;
    if (!cameraOk) {
      // graceful self-demo: seeded drifting field keeps viz + audio alive
      stepSyntheticField(now);
    }
    stepParticles(dt);
    drawFrame(dt);
    stepAudio(dt);

    rafRef.current = requestAnimationFrame(loop);
  }, [stepCameraField, stepSyntheticField, stepParticles, drawFrame, stepAudio]);

  // ── start: gesture-gated audio + camera request ────────────────────────────
  const start = useCallback(async () => {
    if (mode === "running") return;
    setMode("running");
    setNotice(null);

    // audio graph — created only after this user click
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(comp).connect(ctx.destination);
    // master ceiling ≤ 0.2
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.2);
    masterRef.current = master;

    // soft sustaining drone bed so it is never silent
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    droneGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 620;
    droneGain.connect(lp).connect(master);
    const droneFreqs = [98, 98 * 1.5, 98 * 2.005];
    const droneOscs = droneFreqs.map((f, k) => {
      const o = ctx.createOscillator();
      o.type = k === 0 ? "sine" : "triangle";
      o.frequency.value = f;
      const dg = ctx.createGain();
      dg.gain.value = k === 0 ? 0.6 : 0.22;
      o.connect(dg).connect(droneGain);
      o.start();
      return o;
    });
    // slow filter LFO for a breathing bed (≤ 3 Hz, no strobe)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    droneStopRef.current = () => {
      try {
        droneOscs.forEach((o) => o.stop());
        lfo.stop();
      } catch {
        /* already stopped */
      }
    };

    // try the camera; fall back silently-visible on denial
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 180, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        cameraLiveRef.current = true;
        setCameraLive(true);
      }
    } catch {
      cameraLiveRef.current = false;
      setCameraLive(false);
      setNotice(
        "Camera unavailable — running the synthetic idle motion field instead. Grant camera access and reload to play it with your body.",
      );
    }

    lastTimeRef.current = performance.now();
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop);
  }, [mode, loop]);

  // ── reduced-motion preference ──────────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      reducedRef.current = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ── full teardown on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      droneStopRef.current?.();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close();
      ctxRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* back-nav */}
      <a
        href="/dream"
        className="absolute left-4 top-4 z-20 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream
      </a>

      {/* hidden capture elements */}
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={sampleRef} width={GW} height={GH} className="hidden" />
      <canvas ref={bufRef} className="hidden" />

      {/* the art surface */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* title + controls overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center px-6 pt-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-3xl">
          Flow Tracer
        </h1>
        <p className="mt-2 max-w-md text-base text-muted-foreground drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
          Move in front of the camera. Your motion smears the air into blooming
          violet tracers you can hear.
        </p>

        {mode === "idle" && (
          <button
            type="button"
            onClick={start}
            className="pointer-events-auto mt-6 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start — camera + sound
          </button>
        )}

        {mode === "running" && (
          <div className="pointer-events-auto mt-6 flex flex-col items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {cameraLive ? "Live — you are the instrument" : "Idle self-demo running"}
            </span>
            {notice && (
              <p className="max-w-md text-sm text-destructive drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)]">
                {notice}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Design notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {showNotes ? "Hide notes" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute bottom-4 right-4 z-20 max-w-sm rounded-md border border-border bg-background/85 p-4 backdrop-blur">
          <p className="text-sm leading-relaxed text-muted-foreground">
            A dense frame-difference / normal-flow motion field is computed by
            hand on a 64×36 grid (per-cell temporal delta + local gradient → a 2-D
            vector). That field is the sole controller: it advects an iridescent
            dye inside a Canvas2D ping-pong feedback trail — the previous frame is
            re-drawn slightly zoomed and rotated at under-1 alpha, giving LSD-style
            positive-afterimage tracers. Total motion energy sets grain density and
            brightness; the horizontal motion centroid pans, the vertical one sets
            pitch, over a soft drone bed. Bloom and burst are the same event. If the
            camera is denied, a seeded drifting field drives the identical piece.
            No strobe; respects reduced-motion.
          </p>
        </div>
      )}
    </main>
  );
}
