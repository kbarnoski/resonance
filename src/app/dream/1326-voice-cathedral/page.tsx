"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { detectPitchHz, hzToMidi, midiToHz, snapToScale } from "./pitch";

/* ───────────────────────────────────────────────────────────────────────────
   1326-voice-cathedral — "Voice Cathedral"

   ONE question: What if your own held voice could build a vast luminous
   meditative space? Hum or sing a sustained tone; it is granularly captured,
   frozen, and multiplied into a slowly-blooming cathedral of light. Sustain
   longer and the boundaries of the cloud dissolve toward white — the non-dual
   "oceanic boundlessness" of deep meditation — your single voice becoming a
   boundless choir.

   Living reference: Julianna Barwick (looped-voice cathedral ambient), the
   Pauline Oliveros / Deep Listening lineage, Éliane Radigue's sustained drone.

   TECHNIQUE
     • Mic → AnalyserNode ONLY (never to destination) → no feedback path.
     • A rolling ~3s buffer of the captured voice is granulated: short Hann-
       windowed grains are scheduled continuously and read from the live buffer
       (while you sing) and from FROZEN snapshot "layers" that keep ringing after
       you stop — a slowly-decaying granular freeze, a choir accumulating.
     • Grains are pitch-spread into octaves/fifths, fed through a long code-built
       convolution reverb (cathedral space) plus a low drone bed and a pitch-
       following "seed" drone snapped to a pentatonic scale (always consonant).
     • The longer you sustain, a "boundlessness" value climbs; the luminous cloud
       dissolves edge→center→white and the ground lightens. Silence lets it
       settle back into a dark spacious void.

   SAFETY: cosmic-ambient. Slow smooth luminance drift only, NO strobe; a
   breath-paced ~0.1 Hz macro swell. The dissolve toward white is eased in so it
   is never a harsh blowout. prefers-reduced-motion slows all motion. Master gain
   ≤0.26 with a 1.5s fade-in and a DynamicsCompressor limiter before destination.
   Nothing is recorded or sent — the mic is heard only on this device.
─────────────────────────────────────────────────────────────────────────── */

const RING_SECONDS = 3;
const MAX_GRAINS = 40;
const MAX_LAYERS = 6;
const MAX_MOTES = 320;
const MASTER_GAIN = 0.24;

type Mode = "mic" | "demo" | "idle";

interface Layer {
  data: Float32Array<ArrayBuffer>; // frozen snapshot of the voice
  amp: number; // decaying loudness 0..1
}

interface Mote {
  ang: number; // angle around cloud center
  rad: number; // radius (fraction of cloud radius)
  vr: number; // outward drift
  life: number; // 1 → 0
  size: number;
  shimmer: number; // extra brightness for high-octave grains
}

interface Grains {
  set: Set<AudioBufferSourceNode>;
}

interface SeedDrone {
  a: OscillatorNode;
  b: OscillatorNode;
  sub: OscillatorNode;
  gain: GainNode;
}

interface DemoVoice {
  a: OscillatorNode;
  b: OscillatorNode;
  gain: GainNode;
}

// ── small pure helpers (no `use*` names — ESLint treats those as hooks) ──────

function smoothstep(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function makeMix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Schedule one Hann-windowed grain read from `snapshot`, pitch-spread into the
 *  choir, and route it to `dest`. Returns the chosen playback rate (for the
 *  matching visual mote) or -1 if the grain could not be spawned. */
function spawnGrain(
  ctx: AudioContext,
  dest: AudioNode,
  snapshot: Float32Array<ArrayBuffer>,
  sampleRate: number,
  baseAmp: number,
  boundless: number,
  grains: Grains,
): number {
  if (grains.set.size >= MAX_GRAINS) return -1;
  const dur = 0.08 + Math.random() * 0.09; // 80–170ms grains
  const glen = Math.max(64, Math.floor(sampleRate * dur));
  if (snapshot.length <= glen + 2) return -1;

  const start = Math.floor(Math.random() * (snapshot.length - glen - 1));
  const buf = ctx.createBuffer(1, glen, sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < glen; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / glen);
    d[i] = snapshot[start + i] * w;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  // As boundlessness grows, admit wider octave/fifth spread → a fuller choir.
  const choices = boundless > 0.4 ? [0.5, 1, 1, 1.5, 2, 2] : [1, 1, 1, 2];
  const rate = choices[Math.floor(Math.random() * choices.length)];
  src.playbackRate.value = rate;
  src.detune.value = (Math.random() - 0.5) * boundless * 35;

  const g = ctx.createGain();
  g.gain.value = 0.14 * baseAmp * (rate >= 2 ? 0.7 : 1);
  src.connect(g);
  g.connect(dest);

  grains.set.add(src);
  src.onended = () => {
    grains.set.delete(src);
    try {
      g.disconnect();
    } catch {
      /* ctx closing */
    }
    try {
      src.disconnect();
    } catch {
      /* already gone */
    }
  };
  src.start();
  return rate;
}

function makeMoteColor(shimmer: number, boundless: number, alpha: number): string {
  // Pale gold → warm white as the space becomes boundless.
  const e = smoothstep(boundless);
  const hue = makeMix(46, 44, e);
  const sat = makeMix(makeMix(60, 30, shimmer), 8, e);
  const light = makeMix(makeMix(72, 86, shimmer), 97, e);
  return `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`;
}

interface SceneParams {
  motes: Mote[];
  core: number; // 0..1 central luminosity
  boundless: number; // 0..1
  breathe: number; // ~0..1 macro swell
  cloudR: number; // px
}

function drawScene(
  c2d: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  p: SceneParams,
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  c2d.setTransform(dpr, 0, 0, dpr, 0, 0);

  const e = smoothstep(p.boundless);
  const cx = w / 2;
  const cy = h * 0.5;

  // Ground: dark spacious void that lightens toward warm white as it dissolves.
  const bg = c2d.createLinearGradient(0, 0, 0, h);
  const topL = makeMix(7, 232, e * 0.9);
  const botL = makeMix(11, 224, e * 0.9);
  bg.addColorStop(0, `rgb(${topL * 0.85}, ${topL * 0.9}, ${topL})`);
  bg.addColorStop(1, `rgb(${botL}, ${botL * 0.96}, ${botL * 0.88})`);
  c2d.fillStyle = bg;
  c2d.fillRect(0, 0, w, h);

  // Broad warm halo — the body of the cathedral of light.
  c2d.globalCompositeOperation = "lighter";
  const haloR = p.cloudR * (1 + 0.35 * p.breathe) * (1 + 0.7 * e);
  const halo = c2d.createRadialGradient(cx, cy, p.cloudR * 0.1, cx, cy, haloR);
  const ha = 0.1 + 0.22 * p.core;
  halo.addColorStop(0, `hsla(46, 55%, 82%, ${ha})`);
  halo.addColorStop(0.5, `hsla(45, 45%, 70%, ${ha * 0.5})`);
  halo.addColorStop(1, "hsla(45, 40%, 60%, 0)");
  c2d.fillStyle = halo;
  c2d.beginPath();
  c2d.arc(cx, cy, haloR, 0, Math.PI * 2);
  c2d.fill();

  // Voice grains as luminous motes.
  for (const m of p.motes) {
    const r = p.cloudR * m.rad * (1 + 0.5 * e);
    const x = cx + Math.cos(m.ang) * r;
    const y = cy + Math.sin(m.ang) * r * 0.72; // slightly oblate cloud
    const rad = m.size * (1 + 1.6 * m.shimmer);
    const a = 0.5 * m.life;
    const grad = c2d.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, makeMoteColor(m.shimmer, p.boundless, a));
    grad.addColorStop(1, makeMoteColor(m.shimmer, p.boundless, 0));
    c2d.fillStyle = grad;
    c2d.beginPath();
    c2d.arc(x, y, rad, 0, Math.PI * 2);
    c2d.fill();
  }

  // Bright breathing core.
  const coreR = p.cloudR * (0.18 + 0.12 * p.breathe) * (1 + 0.4 * p.core);
  const core = c2d.createRadialGradient(cx, cy, 0, cx, cy, coreR);
  core.addColorStop(0, `hsla(48, 40%, 98%, ${0.35 + 0.4 * p.core})`);
  core.addColorStop(1, "hsla(46, 50%, 80%, 0)");
  c2d.fillStyle = core;
  c2d.beginPath();
  c2d.arc(cx, cy, coreR, 0, Math.PI * 2);
  c2d.fill();

  // Boundlessness veil: white dissolves in from the edges toward the center as
  // you sustain. Eased so it never blows out harshly.
  c2d.globalCompositeOperation = "source-over";
  if (e > 0.001) {
    const maxR = Math.hypot(w, h) / 2;
    const inner = maxR * (1 - e) * 0.95;
    const veil = c2d.createRadialGradient(cx, cy, inner, cx, cy, maxR);
    veil.addColorStop(0, "rgba(255, 251, 242, 0)");
    veil.addColorStop(1, `rgba(255, 251, 242, ${0.85 * e})`);
    c2d.fillStyle = veil;
    c2d.fillRect(0, 0, w, h);
    // Gentle global lift so the whole field brightens toward boundlessness.
    c2d.fillStyle = `rgba(255, 250, 240, ${0.14 * e})`;
    c2d.fillRect(0, 0, w, h);
  }
}

export default function VoiceCathedralPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [boundlessPct, setBoundlessPct] = useState(0);
  const [voicesCount, setVoicesCount] = useState(0);

  // Audio graph + analysis (kept in refs to avoid re-renders).
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const reverbRef = useRef<VoidReverb | null>(null);
  const droneRef = useRef<DroneBank | null>(null);
  const seedRef = useRef<SeedDrone | null>(null);
  const demoRef = useRef<DemoVoice | null>(null);
  const grainBusRef = useRef<GainNode | null>(null);
  const grainsRef = useRef<Grains>({ set: new Set() });
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const recentRef = useRef<Float32Array<ArrayBuffer> | null>(null); // rolling voice buffer
  const layersRef = useRef<Layer[]>([]);
  const motesRef = useRef<Mote[]>([]);
  const rafRef = useRef<number | null>(null);
  const modeRef = useRef<Mode>("idle");
  const reducedRef = useRef(false);

  const stateRef = useRef({
    rms: 0,
    pitchMidi: -1,
    sustain: 0,
    boundless: 0,
    demoPhase: 0,
    lastMs: 0,
    grainAtMs: 0,
    layerAtMs: 0,
    moteAtMs: 0,
    pushAtMs: 0,
  });

  // ── The render + audio-analysis loop (stable: reads refs only) ────────────
  const drawFrame = useCallback((nowMs: number) => {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    const reduced = reducedRef.current;
    const dt = s.lastMs === 0 ? 0.016 : Math.min(0.05, (nowMs - s.lastMs) / 1000);
    s.lastMs = nowMs;

    const ctx = ctxRef.current;
    const mode = modeRef.current;
    const tSec = nowMs / 1000;

    // ---- Capture + analysis (mic or demo voice; idle before Begin) ----
    let voiced = false;
    if (ctx && (mode === "mic" || mode === "demo")) {
      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      const recent = recentRef.current;
      if (analyser && buf && recent) {
        analyser.getFloatTimeDomainData(buf);
        let rms = 0;
        for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
        rms = Math.sqrt(rms / buf.length);
        s.rms = rms;
        // Roll the captured voice into the linear buffer we granulate.
        const n = buf.length;
        recent.copyWithin(0, n);
        recent.set(buf, recent.length - n);

        if (mode === "mic") {
          const hz = detectPitchHz(buf, ctx.sampleRate);
          if (hz > 0) {
            const m = hzToMidi(hz);
            s.pitchMidi = s.pitchMidi < 0 ? m : s.pitchMidi * 0.7 + m * 0.3;
          } else {
            s.pitchMidi = -1;
          }
          voiced = s.pitchMidi > 0 && rms > 0.012;
        } else {
          // Demo: a slow wandering hum, always sounding, snapped to the scale.
          s.demoPhase += dt * 0.5;
          const wander = 57 + 7 * Math.sin(s.demoPhase * 0.7) + 3 * Math.sin(s.demoPhase * 0.31);
          s.pitchMidi = snapToScale(wander);
          voiced = true;
        }
      }
    }

    // ---- Sustain + boundlessness arcs ----
    s.sustain = voiced
      ? Math.min(1, s.sustain + dt * 0.6)
      : Math.max(0, s.sustain - dt * 0.5);
    const layers = layersRef.current;
    if (voiced) {
      s.boundless = Math.min(1, s.boundless + dt * (0.026 + 0.008 * layers.length));
    } else {
      s.boundless = Math.max(0, s.boundless - dt * 0.02);
    }

    // ---- Retune the seeded drone / demo voice to the (snapped) pitch ----
    if (ctx) {
      const targetMidi = s.pitchMidi > 0
        ? Math.max(45, Math.min(72, snapToScale(s.pitchMidi)))
        : 57;
      const hz = midiToHz(targetMidi);
      const seed = seedRef.current;
      if (seed) {
        seed.a.frequency.setTargetAtTime(hz, ctx.currentTime, 0.2);
        seed.b.frequency.setTargetAtTime(hz, ctx.currentTime, 0.2);
        seed.sub.frequency.setTargetAtTime(hz / 2, ctx.currentTime, 0.2);
        const g = voiced ? 0.05 + 0.09 * s.sustain : 0.0;
        seed.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.25);
      }
      const demo = demoRef.current;
      if (demo && mode === "demo") {
        demo.a.frequency.setTargetAtTime(hz, ctx.currentTime, 0.3);
        demo.b.frequency.setTargetAtTime(hz * 2, ctx.currentTime, 0.3);
      }
      // Reverb blooms and the drone opens as the space grows.
      reverbRef.current?.setWet(0.42 + 0.5 * smoothstep(s.boundless));
      droneRef.current?.setDrive(Math.min(1, 0.15 + 0.6 * s.boundless + 0.4 * s.rms));
    }

    // ---- Commit a frozen voice layer (the granular freeze / choir) ----
    if (ctx && recentRef.current && voiced && s.sustain > 0.5 && nowMs - s.layerAtMs > 2500) {
      s.layerAtMs = nowMs;
      layers.push({ data: recentRef.current.slice(), amp: 1 });
      if (layers.length > MAX_LAYERS) {
        // drop the quietest layer
        let qi = 0;
        for (let i = 1; i < layers.length; i++) if (layers[i].amp < layers[qi].amp) qi = i;
        layers.splice(qi, 1);
      }
    }
    // Layers slowly decay in silence — the space keeps ringing, then settles.
    for (const L of layers) L.amp *= Math.pow(0.955, dt * 60);
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i].amp < 0.02) layers.splice(i, 1);

    // ---- Grain scheduler ----
    const cloudR = canvas ? Math.min(canvas.clientWidth, canvas.clientHeight) * 0.34 : 200;
    const grainInterval = makeMix(95, 55, smoothstep(s.boundless));
    if (ctx && nowMs - s.grainAtMs > grainInterval) {
      s.grainAtMs = nowMs;
      const bus = grainBusRef.current;
      const recent = recentRef.current;
      if (bus && recent) {
        const motes = motesRef.current;
        const emit = (rate: number, amp: number) => {
          if (rate < 0 || motes.length >= MAX_MOTES) return;
          const shimmer = rate >= 2 ? 1 : rate >= 1.5 ? 0.5 : 0;
          motes.push({
            ang: Math.random() * Math.PI * 2,
            rad: 0.12 + Math.random() * (0.55 + 0.4 * smoothstep(s.boundless)),
            vr: (0.02 + Math.random() * 0.05) * (reduced ? 0.4 : 1),
            life: 1,
            size: 3 + Math.random() * 4 + amp * 5,
            shimmer,
          });
        };
        // Live grain while singing.
        if (voiced) {
          const r = spawnGrain(ctx, bus, recent, ctx.sampleRate, 0.6 + 0.6 * s.rms * 8, s.boundless, grainsRef.current);
          emit(r, s.sustain);
        }
        // Frozen layers keep singing after you stop.
        for (const L of layers) {
          if (Math.random() < L.amp * 0.9) {
            const r = spawnGrain(ctx, bus, L.data, ctx.sampleRate, 0.5 * L.amp, s.boundless, grainsRef.current);
            emit(r, L.amp);
          }
        }
      }
    }

    // ---- Pre-Begin: a gentle visual-only bloom so it is alive on a cold glance ----
    if (mode === "idle") {
      if (nowMs - s.moteAtMs > 260) {
        s.moteAtMs = nowMs;
        const motes = motesRef.current;
        if (motes.length < 90) {
          motes.push({
            ang: Math.random() * Math.PI * 2,
            rad: 0.15 + Math.random() * 0.5,
            vr: (0.02 + Math.random() * 0.03) * (reduced ? 0.4 : 1),
            life: 1,
            size: 3 + Math.random() * 3,
            shimmer: 0,
          });
        }
      }
      s.boundless = 0.12 + 0.06 * (0.5 + 0.5 * Math.sin(tSec * 0.2));
    }

    // ---- Update motes ----
    const motes = motesRef.current;
    const decay = reduced ? 0.6 : 1;
    for (const m of motes) {
      m.rad += m.vr * dt * decay;
      m.life -= dt * (0.14 + m.vr) * decay;
    }
    for (let i = motes.length - 1; i >= 0; i--) if (motes[i].life <= 0 || motes[i].rad > 2) motes.splice(i, 1);

    // ---- Draw ----
    if (canvas) {
      const c2d = canvas.getContext("2d");
      if (c2d) {
        const breatheHz = reduced ? 0.05 : 0.1;
        const breathe = 0.5 + 0.5 * Math.sin(2 * Math.PI * breatheHz * tSec);
        const core = Math.min(1, s.rms * 6 + 0.12 * layers.length + 0.15 + 0.15 * s.sustain);
        drawScene(c2d, canvas, { motes, core, boundless: s.boundless, breathe, cloudR });
      }
    }

    // ---- Throttled UI readout ----
    if (nowMs - s.pushAtMs > 300) {
      s.pushAtMs = nowMs;
      setBoundlessPct(Math.round(s.boundless * 100));
      setVoicesCount(layers.length);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  // Start the loop on mount (visual demo before Begin); cancel on unmount.
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  // ── Begin: unlock audio, build the graph, request the mic ─────────────────
  const runBegin = useCallback(async () => {
    if (started) return;
    setStarted(true);

    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtor();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    const sr = ctx.sampleRate;

    // master (fade-in) → limiter → destination
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(MASTER_GAIN, ctx.currentTime + 1.5);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    masterRef.current = master;

    // long convolution reverb — the cathedral space
    const reverb = createVoidReverb(ctx, { seconds: 6, decay: 2.4, wet: 0.5 });
    reverb.output.connect(master);
    reverbRef.current = reverb;

    // low drone bed (fixed C-rooted foundation), driven by loudness/boundless
    const drone = startDroneBank(ctx, reverb.input, {
      root: 65.41, // C2
      cutoffLow: 170,
      cutoffHigh: 1400,
      peakGain: 0.1,
    });
    droneRef.current = drone;

    // pitch-following seed drone (snapped to scale → consonant)
    const seedGain = ctx.createGain();
    seedGain.gain.value = 0;
    seedGain.connect(reverb.input);
    const seedA = ctx.createOscillator();
    seedA.type = "sine";
    seedA.frequency.value = 220;
    const seedB = ctx.createOscillator();
    seedB.type = "triangle";
    seedB.frequency.value = 220;
    seedB.detune.value = 6;
    const seedSub = ctx.createOscillator();
    seedSub.type = "sine";
    seedSub.frequency.value = 110;
    const subG = ctx.createGain();
    subG.gain.value = 0.5;
    seedA.connect(seedGain);
    seedB.connect(seedGain);
    seedSub.connect(subG);
    subG.connect(seedGain);
    seedA.start();
    seedB.start();
    seedSub.start();
    seedRef.current = { a: seedA, b: seedB, sub: seedSub, gain: seedGain };

    // grain bus → reverb
    const grainBus = ctx.createGain();
    grainBus.gain.value = 1;
    grainBus.connect(reverb.input);
    grainBusRef.current = grainBus;

    // rolling capture buffer
    recentRef.current = new Float32Array(new ArrayBuffer(Math.floor(sr * RING_SECONDS) * 4));

    // Try the mic. On failure, fall through to an audible demo voice.
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices) throw new Error("no mediaDevices");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const micSrc = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      // MIC SAFETY: mic → analyser ONLY. Never to destination → no feedback.
      micSrc.connect(analyser);
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      modeRef.current = "mic";
      setMicOn(true);
    } catch {
      // Demo voice: a sustained synthesized hum feeding the analyser (so it is
      // granulated) and the reverb (so it is audible).
      const demoGain = ctx.createGain();
      demoGain.gain.value = 0.06;
      const demoA = ctx.createOscillator();
      demoA.type = "sine";
      demoA.frequency.value = 220;
      const demoB = ctx.createOscillator();
      demoB.type = "triangle";
      demoB.frequency.value = 440;
      const demoBG = ctx.createGain();
      demoBG.gain.value = 0.25;
      demoA.connect(demoGain);
      demoB.connect(demoBG);
      demoBG.connect(demoGain);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      demoGain.connect(analyser);
      demoGain.connect(reverb.input);
      demoA.start();
      demoB.start();
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      demoRef.current = { a: demoA, b: demoB, gain: demoGain };
      modeRef.current = "demo";
      setMicOn(false);
      setMicNotice(
        "No microphone — listening to a demo voice. Grant mic access to sing your own space.",
      );
    }

    // clear the pre-Begin visual motes so the real voice cloud takes over
    motesRef.current = [];
    stateRef.current.boundless = 0;
  }, [started]);

  // ── Full teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    // grainsRef holds a single Set for the component's life (never reassigned),
    // so capturing it here is safe to use in the cleanup below.
    const grains = grainsRef.current;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const stopOsc = (o?: OscillatorNode) => {
        try {
          o?.stop();
        } catch {
          /* already stopped */
        }
      };
      grains.set.forEach((g) => {
        try {
          g.stop();
        } catch {
          /* already stopped */
        }
      });
      grains.set.clear();
      const seed = seedRef.current;
      stopOsc(seed?.a);
      stopOsc(seed?.b);
      stopOsc(seed?.sub);
      const demo = demoRef.current;
      stopOsc(demo?.a);
      stopOsc(demo?.b);
      droneRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#06070f] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-between px-6 py-8">
        {/* Header (scrim keeps text readable when the field blooms white) */}
        <header className="w-full max-w-xl rounded-2xl bg-black/35 px-5 py-4 text-center backdrop-blur-sm">
          <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">Voice Cathedral</h1>
          <p className="mt-2 text-base text-foreground">
            Hum or sing a sustained tone. Your held voice is captured, frozen and
            multiplied into a slowly-blooming cathedral of light — sustain, and
            its boundaries dissolve toward a boundless white choir.
          </p>
        </header>

        {/* Controls */}
        <div className="flex w-full max-w-xl flex-col items-center gap-4">
          {!started ? (
            <button
              type="button"
              onClick={runBegin}
              className="min-h-[44px] rounded-full bg-violet-300/90 px-8 py-2.5 text-lg font-semibold text-black shadow-lg transition-colors hover:bg-violet-200 active:bg-violet-300"
            >
              Begin — sing your space
            </button>
          ) : (
            <div className="rounded-2xl bg-black/35 px-5 py-3 text-center backdrop-blur-sm">
              <p className="min-h-[28px] text-base text-foreground">
                {micOn
                  ? "Listening — hold a hum and let the space bloom."
                  : "Demo voice singing — grant mic access to sing your own."}
              </p>
              <p className="mt-1 font-mono text-base text-muted-foreground">
                boundlessness {boundlessPct}% · voices {voicesCount}
              </p>
            </div>
          )}

          {micNotice && (
            <p className="max-w-md rounded-xl bg-black/40 px-4 py-2 text-center text-base text-violet-300 backdrop-blur-sm">
              {micNotice}
            </p>
          )}
        </div>

        {/* Footer */}
        <footer className="flex w-full max-w-xl items-center justify-between gap-4">
          <p className="text-base text-muted-foreground">
            Nothing is recorded or sent — your voice is heard only on this device.
          </p>
          <button
            type="button"
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] shrink-0 rounded-full bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Close notes" : "Read the design notes"}
          </button>
        </footer>
      </div>

      {/* Design-notes overlay (in-page, not a route) */}
      {showNotes && (
        <div className="absolute inset-0 z-20 overflow-y-auto bg-black/80 px-6 py-10 backdrop-blur-md">
          <div className="mx-auto max-w-2xl text-foreground">
            <h2 className="font-semibold text-2xl text-foreground">Voice Cathedral — design notes</h2>
            <p className="mt-4 text-base text-foreground">
              <span className="text-foreground">The question:</span> what if your own
              held voice could build a vast luminous meditative space? A sustained
              hum is granularly captured, frozen and multiplied into a slowly-
              blooming cathedral of light; sustain longer and the cloud&apos;s
              boundaries dissolve toward white — the non-dual &ldquo;oceanic
              boundlessness&rdquo; of deep meditation — one voice becoming a
              boundless choir.
            </p>
            <p className="mt-4 text-base text-foreground">
              <span className="text-foreground">Technique:</span> the mic feeds an
              AnalyserNode <em>only</em> (never the speakers, so there is no
              feedback path). A rolling ~3s buffer of your voice is granulated —
              short Hann-windowed grains are scheduled continuously, read from the
              live buffer while you sing and from <em>frozen snapshot layers</em>{" "}
              that keep ringing after you stop. Grains are pitch-spread into
              octaves and fifths, sent through a long code-built convolution
              reverb, over a low drone bed and a pitch-following seed drone snapped
              to a pentatonic scale so it stays consonant.
            </p>
            <p className="mt-4 text-base text-foreground">
              <span className="text-foreground">Boundlessness arc:</span> sustaining
              climbs a value that dissolves the cloud edge&rarr;center&rarr;white
              and lightens the ground; silence lets it settle back into a dark
              spacious void.
            </p>
            <p className="mt-4 text-base text-foreground">
              <span className="text-foreground">Lineage:</span> Julianna Barwick&apos;s
              looped-voice cathedral ambient, the Pauline Oliveros / Deep Listening
              tradition, and Éliane Radigue&apos;s sustained drone. This evokes a
              phenomenology; it makes no medical claims.
            </p>
            <p className="mt-4 text-base text-foreground">
              <span className="text-foreground">Safety:</span> cosmic-ambient — only
              slow smooth luminance drift, no strobe; a breath-paced ~0.1 Hz swell.
              The dissolve to white is eased in so it never blows out harshly.
              prefers-reduced-motion slows all motion. Master gain is ≤0.26 with a
              1.5s fade-in and a limiter before the speakers.
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              <span className="text-foreground">Controls:</span> Begin (unlock audio +
              mic), then simply hold a sustained tone — the longer and steadier the
              hum, the more voices freeze and the more boundless the light becomes.
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              <span className="text-foreground">Next:</span> an AudioWorklet grain
              engine for sample-accurate scheduling, per-layer spatial panning for
              a wider choir, and a breath-detector so inhales momentarily part the
              white.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
