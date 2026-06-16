"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
 * KIDS DANCE BAND — "What if a 4-year-old could make a band play by DANCING?"
 *
 * Webcam -> downscaled grid -> per-cell frame-difference -> global motion energy
 * + spatial centroid. Energy is smoothed (running average) and mapped to discrete
 * groove "tiers" with hysteresis. A clocked, layered groove engine (Chris Wilson
 * look-ahead scheduler) always plays a soft base groove; more movement stacks
 * layers and the particle field erupts. Camera centroid shifts brightness/pan.
 *
 * NO ML. Pure pixel diff. Canvas2D particle field. Web Audio synth band.
 */

// ---------- Motion grid ----------
const GRID_W = 32;
const GRID_H = 24;
const CELLS = GRID_W * GRID_H;

// ---------- Groove / musical constants ----------
const BPM = 112;
const SPB = 60 / BPM; // seconds per beat
const STEP = SPB / 4; // 16th note
const STEPS = 16; // one bar

// A minor pentatonic-ish, joyful & always-in-key. Hz values.
const A2 = 110;
const NOTE = (semi: number) => A2 * Math.pow(2, semi / 12);
// bass line (one note per beat-ish), melody pool
const BASS = [NOTE(0), NOTE(0), NOTE(7), NOTE(5)]; // A A E D (per beat)
const MELODY = [
  NOTE(24), NOTE(27), NOTE(31), NOTE(24),
  NOTE(36), NOTE(31), NOTE(27), NOTE(24),
]; // bright pentatonic sparkle, octaves up
const PAD = [NOTE(12), NOTE(19), NOTE(24)]; // soft chord A E A

// Energy tiers: how many layers are on. Hysteresis thresholds.
// tier 0 = pad only, 1 = +kick, 2 = +hat+bass, 3 = +snare, 4 = +melody (full party)
const TIER_UP = [0.04, 0.1, 0.2, 0.34];
const TIER_DOWN = [0.025, 0.07, 0.15, 0.27];
const MAX_TIER = 4;

type Spark = {
  x: number; y: number; vx: number; vy: number;
  hue: number; a: number; r: number;
};

type Engine = {
  ctx: AudioContext;
  master: GainNode;
  // smoothed motion energy 0..1 and centroid 0..1
  energy: number;
  cx: number;
  cy: number;
  tier: number;
  // scheduler
  nextStepTime: number;
  step: number;
  timer: number | null;
  beatPulse: number; // 0..1 set on downbeats, decays in rAF
  // fallback manual energy (when no camera): target the energy toward this
  manual: number | null;
};

// ---------- Synth voices ----------
function drawKick(ctx: AudioContext, dest: AudioNode, t: number, gain: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(135, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.32);
}

function drawHat(ctx: AudioContext, dest: AudioNode, t: number, gain: number, buf: AudioBuffer) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(hp).connect(g).connect(dest);
  s.start(t);
  s.stop(t + 0.06);
}

function drawSnare(ctx: AudioContext, dest: AudioNode, t: number, gain: number, buf: AudioBuffer) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1900;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
  s.connect(bp).connect(g).connect(dest);
  s.start(t);
  s.stop(t + 0.18);
  // body tone
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.value = 190;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(gain * 0.6, t);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
  o.connect(g2).connect(dest);
  o.start(t);
  o.stop(t + 0.12);
}

function drawBass(ctx: AudioContext, dest: AudioNode, t: number, hz: number, gain: number) {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.value = hz;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + SPB * 0.9);
  o.connect(lp).connect(g).connect(dest);
  o.start(t);
  o.stop(t + SPB);
}

function drawPluck(ctx: AudioContext, dest: AudioNode, t: number, hz: number, gain: number, pan: number) {
  const o = ctx.createOscillator();
  o.type = "triangle";
  o.frequency.value = hz;
  const o2 = ctx.createOscillator();
  o2.type = "sine";
  o2.frequency.value = hz * 2.01;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(g);
  const g2 = ctx.createGain();
  g2.gain.value = 0.3;
  o2.connect(g2).connect(g);
  g.connect(p).connect(dest);
  o.start(t); o2.start(t);
  o.stop(t + 0.45); o2.stop(t + 0.45);
}

// soft sustained pad chord — restarted each bar, gentle
function drawPad(ctx: AudioContext, dest: AudioNode, t: number, gain: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + SPB * 1.5);
  g.gain.linearRampToValueAtTime(0.0001, t + SPB * 4);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2200;
  g.connect(lp).connect(dest);
  for (const hz of PAD) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    const og = ctx.createGain();
    og.gain.value = 0.5;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + SPB * 4 + 0.1);
  }
}

function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export default function KidsDanceBand() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const sparksRef = useRef<Spark[]>([]);
  // motion grid working buffers
  const prevGrayRef = useRef<Float32Array | null>(null);
  const cellEnergyRef = useRef<Float32Array>(new Float32Array(CELLS));
  const streamRef = useRef<MediaStream | null>(null);
  const manualRef = useRef<number | null>(null);

  const [started, setStarted] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [tier, setTier] = useState(0);

  // -------- visual + motion loop (rAF) --------
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    let lastTs = 0;

    // offscreen for downscaling the webcam frame
    const grid = document.createElement("canvas");
    grid.width = GRID_W;
    grid.height = GRID_H;
    const gctx = grid.getContext("2d", { willReadFrequently: true });

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.offsetWidth * dpr);
      canvas.height = Math.round(canvas.offsetHeight * dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // compute motion energy from webcam (frame-difference on downscaled grid)
    function detectMotion(): { energy: number; cx: number; cy: number } | null {
      const video = videoRef.current;
      if (!gctx || !video || video.readyState < 2) return null;
      // mirror horizontally so it feels like a mirror
      gctx.save();
      gctx.scale(-1, 1);
      gctx.drawImage(video, -GRID_W, 0, GRID_W, GRID_H);
      gctx.restore();
      const img = gctx.getImageData(0, 0, GRID_W, GRID_H).data;
      let prev = prevGrayRef.current;
      const cell = cellEnergyRef.current;
      if (!prev) {
        prev = new Float32Array(CELLS);
        prevGrayRef.current = prev;
        for (let i = 0; i < CELLS; i++) {
          prev[i] = (img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]) / 3;
        }
        return { energy: 0, cx: 0.5, cy: 0.5 };
      }
      let sum = 0, wx = 0, wy = 0, wsum = 0;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const i = y * GRID_W + x;
          const g = (img[i * 4] + img[i * 4 + 1] + img[i * 4 + 2]) / 3;
          let d = Math.abs(g - prev[i]);
          if (d < 14) d = 0; // noise floor
          prev[i] = g;
          // decaying cell energy for the visual heat overlay
          cell[i] = Math.max(cell[i] * 0.82, d / 255);
          sum += d;
          if (d > 0) { wx += x * d; wy += y * d; wsum += d; }
        }
      }
      // normalize: average diff per cell, scaled. 255 max diff.
      const energy = Math.min(1, (sum / CELLS / 255) * 6);
      const cx = wsum > 0 ? wx / wsum / (GRID_W - 1) : 0.5;
      const cy = wsum > 0 ? wy / wsum / (GRID_H - 1) : 0.5;
      return { energy, cx, cy };
    }

    function spawnSparks(eng: Engine, n: number) {
      if (!canvas) return;
      const W = canvas.width, H = canvas.height;
      // emit from centroid position (mirrored x already baked into cx)
      const ox = eng.cx * W;
      const oy = eng.cy * H;
      const hueBase = 280 - eng.energy * 230; // violet (calm) -> warm gold (party)
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const spd = (1 + eng.energy * 9) * (0.5 + Math.random());
        sparksRef.current.push({
          x: ox + (Math.random() - 0.5) * W * 0.3,
          y: oy + (Math.random() - 0.5) * H * 0.3,
          vx: Math.cos(a) * spd,
          vy: Math.sin(a) * spd - 1.5,
          hue: hueBase + (Math.random() - 0.5) * 60,
          a: 1,
          r: 2 + Math.random() * 4 + eng.energy * 4,
        });
      }
    }

    function frame(ts: number) {
      if (!canvas) return;
      const gc = canvas.getContext("2d");
      const eng = engineRef.current;
      if (!gc || !eng) { raf = requestAnimationFrame(frame); return; }
      const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016;
      lastTs = ts;
      const W = canvas.width, H = canvas.height;

      // --- update motion energy (smoothed) ---
      const manual = manualRef.current;
      if (manual !== null) {
        // fallback: ease toward manual target
        eng.energy += (manual - eng.energy) * Math.min(1, dt * 3);
        eng.cx += (0.5 - eng.cx) * Math.min(1, dt * 2);
        eng.cy += (0.5 - eng.cy) * Math.min(1, dt * 2);
      } else {
        const m = detectMotion();
        if (m) {
          // running average low-pass (attack faster than release)
          const k = m.energy > eng.energy ? 0.28 : 0.06;
          eng.energy += (m.energy - eng.energy) * k;
          eng.cx += (m.cx - eng.cx) * 0.2;
          eng.cy += (m.cy - eng.cy) * 0.2;
        }
      }

      // --- emit sparks proportional to energy ---
      const emit = Math.round(eng.energy * eng.energy * 14);
      if (emit > 0) spawnSparks(eng, emit);

      // --- draw background (darkens to glowing on energy) ---
      const bgL = 4 + eng.energy * 5;
      gc.fillStyle = `rgb(${Math.round(bgL)}, ${Math.round(bgL * 0.7)}, ${Math.round(bgL + eng.energy * 14)})`;
      gc.globalAlpha = 0.32; // trail / motion blur
      gc.fillRect(0, 0, W, H);
      gc.globalAlpha = 1;

      // --- motion heat overlay (coarse, faint) ---
      const cell = cellEnergyRef.current;
      const cw = W / GRID_W, ch = H / GRID_H;
      gc.globalCompositeOperation = "lighter";
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const v = cell[y * GRID_W + x];
          if (v < 0.05) continue;
          // mirror x for display so it tracks the dancer
          const dx = (GRID_W - 1 - x) * cw;
          const hue = 200 - eng.energy * 160;
          gc.fillStyle = `hsla(${hue}, 90%, 60%, ${Math.min(0.5, v * 0.9)})`;
          gc.fillRect(dx, y * ch, cw + 1, ch + 1);
        }
      }

      // --- beat pulse ring (flashes on the beat) ---
      if (eng.beatPulse > 0.01) {
        const cx = W / 2, cy = H / 2;
        const baseR = Math.min(W, H) * 0.18;
        const r = baseR * (1 + (1 - eng.beatPulse) * 2);
        const hue = 50 + eng.tier * 8;
        gc.strokeStyle = `hsla(${hue}, 100%, 70%, ${eng.beatPulse * 0.5})`;
        gc.lineWidth = 4 + eng.beatPulse * 16;
        gc.beginPath();
        gc.arc(cx, cy, r, 0, Math.PI * 2);
        gc.stroke();
        eng.beatPulse = Math.max(0, eng.beatPulse - dt * 2.6);
      }

      // --- sparks ---
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.08;
        s.vx *= 0.99;
        s.a -= dt * (0.7 + (1 - eng.energy) * 1.0);
        if (s.a <= 0 || s.y > H + 40) { sparks.splice(i, 1); continue; }
        gc.fillStyle = `hsla(${s.hue}, 95%, ${55 + eng.energy * 20}%, ${s.a})`;
        gc.beginPath();
        gc.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        gc.fill();
      }
      gc.globalCompositeOperation = "source-over";

      // cap sparks
      if (sparks.length > 800) sparks.splice(0, sparks.length - 800);

      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [started]);

  // -------- start the band (camera + audio in the tap) --------
  async function runStart() {
    if (engineRef.current) return;
    // AudioContext created/resumed inside the tap (iOS requirement)
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    if (ctx.state === "suspended") await ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 1.2); // gentle fade-in, no transient
    master.connect(ctx.destination);
    noiseRef.current = makeNoiseBuffer(ctx);

    const eng: Engine = {
      ctx, master,
      energy: 0, cx: 0.5, cy: 0.5, tier: 0,
      nextStepTime: ctx.currentTime + 0.1,
      step: 0,
      timer: null,
      beatPulse: 0,
      manual: null,
    };
    engineRef.current = eng;

    // --- look-ahead scheduler (Chris Wilson pattern) ---
    function scheduleStep(stepIdx: number, time: number) {
      const noise = noiseRef.current;
      if (!noise) return;
      // hysteresis tier selection from smoothed energy
      let t = eng.tier;
      while (t < MAX_TIER && eng.energy >= TIER_UP[t]) t++;
      while (t > 0 && eng.energy < TIER_DOWN[t - 1]) t--;
      if (t !== eng.tier) {
        eng.tier = t;
        // surface to UI (cheap; only on change)
        setTier(t);
      }

      const beat = Math.floor(stepIdx / 4);
      const onBeat = stepIdx % 4 === 0;
      const energyGain = 0.4 + eng.energy * 0.6;
      // pan from horizontal centroid (-1..1), display-mirrored so it matches
      const pan = Math.max(-0.9, Math.min(0.9, (0.5 - eng.cx) * 1.6));

      // PAD: always on, restart at top of bar (tier 0+)
      if (stepIdx === 0) drawPad(ctx, master, time, 0.1 + (1 - eng.energy) * 0.06);

      // KICK: tier 1+ — four-on-floor on beats
      if (t >= 1 && onBeat) drawKick(ctx, master, time, 0.6 * energyGain);
      // extra kick syncopation at high energy
      if (t >= 3 && stepIdx === 10) drawKick(ctx, master, time, 0.45 * energyGain);

      // HAT: tier 2+ — every 8th (even steps), busier at tier 4
      if (t >= 2 && stepIdx % 2 === 0) drawHat(ctx, master, time, 0.18 * energyGain, noise);
      if (t >= 4 && stepIdx % 2 === 1) drawHat(ctx, master, time, 0.1 * energyGain, noise);

      // BASS: tier 2+ — one note per beat
      if (t >= 2 && onBeat) drawBass(ctx, master, time, BASS[beat % BASS.length] / 2, 0.32 * energyGain);

      // SNARE: tier 3+ — backbeat (beats 2 & 4 -> steps 4 and 12)
      if (t >= 3 && (stepIdx === 4 || stepIdx === 12)) drawSnare(ctx, master, time, 0.4 * energyGain, noise);

      // MELODY: tier 4 (full party) — sparkle on the 8ths
      if (t >= 4 && stepIdx % 2 === 0) {
        const note = MELODY[(stepIdx / 2) % MELODY.length];
        drawPluck(ctx, master, time, note, 0.22 * energyGain, pan);
      } else if (t === 3 && onBeat) {
        // a little melody shimmer at tier 3 too
        const note = MELODY[beat % MELODY.length];
        drawPluck(ctx, master, time, note, 0.14 * energyGain, pan);
      }

      // beat pulse for visuals (downbeats)
      if (onBeat) eng.beatPulse = 1;
    }

    function pump() {
      const e = engineRef.current;
      if (!e) return;
      const lookahead = 0.12; // schedule 120ms ahead
      while (e.nextStepTime < e.ctx.currentTime + lookahead) {
        scheduleStep(e.step, e.nextStepTime);
        e.nextStepTime += STEP;
        e.step = (e.step + 1) % STEPS;
      }
    }
    eng.timer = window.setInterval(pump, 25);
    pump();

    // --- request camera (after audio is live so the band never feels broken) ---
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      const vid = document.createElement("video");
      vid.srcObject = stream;
      vid.playsInline = true;
      vid.muted = true;
      await vid.play();
      videoRef.current = vid;
      manualRef.current = null;
      eng.manual = null;
    } catch {
      // camera denied / unavailable -> fallback to manual energy controls
      setCamError(
        "No camera — use the big buttons below to make the band play! Nothing is uploaded either way."
      );
      manualRef.current = 0.05; // start at a gentle groove
    }

    setStarted(true);
  }

  // -------- fallback energy controls (no camera) --------
  function applyManual(v: number) {
    manualRef.current = Math.max(0, Math.min(1, v));
  }

  useEffect(() => {
    if (!started || !camError) return;
    function onKey(e: KeyboardEvent) {
      const cur = manualRef.current ?? 0;
      if (e.key === "ArrowUp") manualRef.current = Math.min(1, cur + 0.18);
      if (e.key === "ArrowDown") manualRef.current = Math.max(0, cur - 0.18);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, camError]);

  // -------- cleanup on unmount --------
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng?.timer) clearInterval(eng.timer);
      if (eng) {
        try { eng.master.disconnect(); } catch {}
        void eng.ctx.close();
      }
      engineRef.current = null;
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      const v = videoRef.current;
      if (v) { v.srcObject = null; }
      videoRef.current = null;
    };
  }, []);

  const tierLabels = ["soft pad", "+ beat", "+ bass & hats", "+ snare", "FULL PARTY!"];

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05050b] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        style={{ touchAction: "none" }}
      />

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-4">
        <div className="pointer-events-none">
          <h1 className="text-2xl font-bold text-white/95 sm:text-3xl">
            Dance Band
          </h1>
          {started && (
            <p className="mt-1 text-base text-white/80">
              Move BIG to make the band play!
            </p>
          )}
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto rounded-full px-3 py-2 text-base text-violet-300 hover:text-white"
        >
          ← lab
        </Link>
      </div>

      {/* live tier readout */}
      {started && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20">
          <div className="rounded-2xl bg-black/45 px-4 py-2.5 backdrop-blur-sm">
            <div className="text-base font-semibold text-violet-300">
              {tierLabels[tier]}
            </div>
            <div className="mt-1 flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className={`h-3 w-7 rounded-full ${
                    i <= tier ? "bg-amber-300" : "bg-white/15"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* start hero overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/70 px-6 text-center backdrop-blur-sm">
          <h2 className="text-2xl font-bold text-white/95 sm:text-4xl">
            Make a band play by DANCING!
          </h2>
          <p className="max-w-md text-base text-white/80 sm:text-lg">
            Stand back so the camera can see you, then wiggle, jump, and wave.
            The more you move, the bigger the band gets!
          </p>
          <button
            onClick={runStart}
            className="min-h-[64px] rounded-full bg-amber-400 px-10 py-4 text-xl font-bold text-black transition-transform hover:scale-105 active:scale-95"
          >
            Start dancing
          </button>
          <p className="max-w-sm text-base text-white/75">
            We&apos;ll ask to use your camera. The video stays on your device —
            nothing is ever uploaded or saved.
          </p>
        </div>
      )}

      {/* camera error + fallback controls */}
      {started && camError && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex flex-col items-center gap-4 px-4">
          <p className="max-w-md text-center text-base text-rose-300">
            {camError}
          </p>
          <div className="flex items-center gap-4">
            <button
              onPointerDown={() => applyManual((manualRef.current ?? 0) - 0.25)}
              className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-2xl bg-white/10 px-6 text-3xl font-bold text-white/90 active:scale-95"
              aria-label="calm down"
            >
              🌙
            </button>
            <button
              onPointerDown={() => applyManual(0.6)}
              onPointerUp={() => applyManual(0.15)}
              className="flex min-h-[64px] min-w-[120px] items-center justify-center rounded-2xl bg-amber-400 px-6 text-xl font-bold text-black active:scale-95"
            >
              DANCE! 🎉
            </button>
            <button
              onPointerDown={() => applyManual((manualRef.current ?? 0) + 0.25)}
              className="flex min-h-[64px] min-w-[64px] items-center justify-center rounded-2xl bg-white/10 px-6 text-3xl font-bold text-white/90 active:scale-95"
              aria-label="more energy"
            >
              🔥
            </button>
          </div>
        </div>
      )}

      {/* privacy note */}
      {started && !camError && (
        <div className="pointer-events-none absolute bottom-5 right-4 z-20 max-w-[200px] text-right text-base text-white/75">
          Camera stays on your device. Nothing is uploaded.
        </div>
      )}
    </main>
  );
}
