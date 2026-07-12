"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { VIOLET, MAGENTA } from "../_shared/palette";

// ════════════════════════════════════════════════════════════════════════════
// Click Cathedral (1520) — a drug-free human-echolocation instrument.
//
// ONE QUESTION: "Can you SEE a vast space you cannot see — by clicking into the
// dark and listening to it answer?"
//
// You emit CLICKS into an invisible procedural cathedral. The space answers in
// binaural echoes: each surface returns the click, delayed by its distance
// (speed of sound = 343 m/s), coloured by its material, and spatialized around
// your head with an HRTF PannerNode. Wear headphones.
//
// It EMBODIES a specific, recent finding — Garcia-Lazaro et al., "Neural and
// behavioral correlates of evidence accumulation in human click-based
// echolocation" (eNeuro, April 2026, Smith-Kettlewell + Cardiff): expert
// echolocators build their spatial map by STACKING clicks — localization
// accuracy grows roughly LINEARLY with the number of self-generated clicks; the
// percept is ACCUMULATED over time, not read from one optimal snapshot. So here
// every click toward a region sharpens that region's echo (louder, brighter)
// AND its dim point on the faint on-screen "belief map". The image is built, not
// revealed. See also Daniel Kish (flash-sonar) and Pauline Oliveros (Deep
// Listening).
//
// The screen is deliberately almost-empty. Sound is the medium; the belief map
// is a whisper of light, not the art.
//
// FOUR SUBSYSTEMS: (1) procedural seeded room geometry, (2) binaural HRTF echo
// renderer with per-surface material timbre + distance delay + convolution
// tail, (3) click-summation / evidence-accumulation belief model, (4) optional
// mic onset detection so real mouth/tongue clicks drive it. Fully playable with
// the spacebar alone if the mic is denied.
// ════════════════════════════════════════════════════════════════════════════

// ── Deterministic PRNG (NO Math.random / Date.now — house rule) ──────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPEED_OF_SOUND = 343; // m/s
const MAX_VOICES = 14; // global cap on simultaneous echo voices
const VOICES_PER_CLICK = 10; // strongest returns voiced per click

// ── Materials: each surface returns the click with a distinct timbre/tail ────
type MaterialKey = "soft" | "wood" | "stone";
interface Material {
  filter: BiquadFilterType;
  freq: number; // Hz — brightness of the return
  q: number;
  tail: number; // seconds — how long the return rings
  reflect: number; // 0..1 — how much energy comes back
  rate: number; // playbackRate of the noise burst (colours the transient)
}
const MATERIALS: Record<MaterialKey, Material> = {
  // near soft wall: dull, short, quiet
  soft: { filter: "lowpass", freq: 850, q: 0.7, tail: 0.05, reflect: 0.5, rate: 0.8 },
  // wooden panelling: warm midrange
  wood: { filter: "lowpass", freq: 2400, q: 0.9, tail: 0.12, reflect: 0.72, rate: 1.0 },
  // far stone vault: bright, long, reverberant
  stone: { filter: "bandpass", freq: 3600, q: 0.8, tail: 0.28, reflect: 0.92, rate: 1.25 },
};

// ── Room presets: audibly different SIZE (delay + reverb tail) ───────────────
interface Preset {
  name: string;
  blurb: string;
  seed: number;
  count: number;
  distMin: number;
  distMax: number;
  reverbSeconds: number;
  reverbDecay: number;
  // material weights [soft, wood, stone]
  weights: [number, number, number];
}
const PRESETS: Preset[] = [
  {
    name: "Small chamber",
    blurb: "close soft walls · quick, dull returns",
    seed: 0x1a2b3c,
    count: 8,
    distMin: 1.6,
    distMax: 6,
    reverbSeconds: 1.1,
    reverbDecay: 3.4,
    weights: [0.6, 0.35, 0.05],
  },
  {
    name: "Long corridor",
    blurb: "a receding axis · echoes that walk away",
    seed: 0x5f7d21,
    count: 11,
    distMin: 2,
    distMax: 26,
    reverbSeconds: 2.3,
    reverbDecay: 2.6,
    weights: [0.3, 0.45, 0.25],
  },
  {
    name: "Vast vault",
    blurb: "far bright stone · long, boundless tail",
    seed: 0x9c14e7,
    count: 14,
    distMin: 8,
    distMax: 42,
    reverbSeconds: 4.6,
    reverbDecay: 2.0,
    weights: [0.1, 0.3, 0.6],
  },
];

interface Surface {
  az: number; // azimuth, radians (0 = front, +right)
  dist: number; // metres
  elev: number; // metres (small vertical offset)
  mat: MaterialKey;
}

// Build a deterministic room from a preset. Corridor biases surfaces onto a
// long front/back axis so the SIZE reads as a receding tunnel.
function makeRoom(preset: Preset): Surface[] {
  const rnd = mulberry32(preset.seed);
  const [wSoft, wWood] = preset.weights;
  const isCorridor = preset.name === "Long corridor";
  const out: Surface[] = [];
  for (let i = 0; i < preset.count; i++) {
    let az = (rnd() * 2 - 1) * Math.PI;
    if (isCorridor) {
      // cluster near front (0) and back (±π) — a tunnel, not a sphere
      const back = rnd() < 0.5;
      az = (back ? Math.PI : 0) + (rnd() * 2 - 1) * 0.55;
    }
    // near surfaces skew close, far surfaces skew far (quadratic spread)
    const t = rnd();
    const dist = preset.distMin + (preset.distMax - preset.distMin) * t * t;
    const elev = (rnd() * 2 - 1) * Math.min(2.5, dist * 0.25);
    const r = rnd();
    const mat: MaterialKey = r < wSoft ? "soft" : r < wSoft + wWood ? "wood" : "stone";
    out.push({ az, dist, elev, mat });
  }
  return out;
}

// ── Deterministic white-noise buffer (broadband click source) ────────────────
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rnd = mulberry32(0xc0ffee);
  for (let i = 0; i < len; i++) data[i] = rnd() * 2 - 1;
  return buf;
}

// ── Deterministic convolution impulse — gives the room its "size" ────────────
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rnd = mulberry32(ch === 0 ? 0x1234567 : 0x89abcde);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, decay);
      const onset = Math.min(1, i / rate / 0.008);
      data[i] = (rnd() * 2 - 1) * env * onset;
    }
  }
  return buf;
}

function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}

function apply3D(p: PannerNode, x: number, y: number, z: number, t: number) {
  if (p.positionX) {
    p.positionX.setValueAtTime(x, t);
    p.positionY.setValueAtTime(y, t);
    p.positionZ.setValueAtTime(z, t);
  } else {
    // Deprecated fallback for older engines.
    p.setPosition(x, y, z);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Component
// ════════════════════════════════════════════════════════════════════════════
export default function ClickCathedralPage() {
  const [supported, setSupported] = useState(true);
  const [started, setStarted] = useState(false);
  const [presetIdx, setPresetIdx] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [micState, setMicState] = useState<"off" | "on" | "error">("off");
  const [micError, setMicError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── Audio graph refs ──
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const reverbReturnRef = useRef<GainNode | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);
  const noiseBufRef = useRef<AudioBuffer | null>(null);
  const activeVoicesRef = useRef(0);

  // ── Room / belief-model refs (avoid stale closures in listeners) ──
  const surfacesRef = useRef<Surface[]>(makeRoom(PRESETS[0]));
  const beliefRef = useRef<Float32Array>(new Float32Array(PRESETS[0].count));
  const facingRef = useRef(0); // radians, aim direction
  const presetIdxRef = useRef(0);

  // ── Visual refs ──
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);
  const lastClickRef = useRef(-10);
  const lastClickAzRef = useRef(0);
  const reducedMotionRef = useRef(false);

  // ── Mic refs ──
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micDataRef = useRef<Uint8Array | null>(null);
  const micBaselineRef = useRef(0);
  const micLastOnsetRef = useRef(0);

  // Feature-detect Web Audio + reduced motion once.
  useEffect(() => {
    const AC =
      typeof window !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) setSupported(false);
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      reducedMotionRef.current = mq.matches;
      const onChange = () => (reducedMotionRef.current = mq.matches);
      mq.addEventListener?.("change", onChange);
      return () => mq.removeEventListener?.("change", onChange);
    }
  }, []);

  // ── Emit one click: schedule the room's spatial answer ────────────────────
  const emitClick = useCallback(() => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const convolver = convolverRef.current;
    const noiseBuf = noiseBufRef.current;
    if (!ctx || !master || !convolver || !noiseBuf) return;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const facing = facingRef.current;
    const surfaces = surfacesRef.current;
    const belief = beliefRef.current;

    // Rank surfaces: directional aim lobe + reflectivity, nearer = higher.
    const ranked = surfaces
      .map((s, i) => {
        const delta = angleDelta(facing, s.az);
        // directional "flash-sonar" lobe: strong ahead, faint behind
        const lobe = 0.28 + 0.72 * Math.pow(Math.max(0, Math.cos(delta)), 1.6);
        const mat = MATERIALS[s.mat];
        const prio = (lobe * mat.reflect) / (1 + s.dist * 0.05);
        return { s, i, lobe, prio };
      })
      .sort((a, b) => b.prio - a.prio)
      .slice(0, VOICES_PER_CLICK);

    for (const { s, i, lobe } of ranked) {
      if (activeVoicesRef.current >= MAX_VOICES) break;
      const mat = MATERIALS[s.mat];
      // Evidence accumulation: the more belief here, the SHARPER the return.
      const conf = belief[i];
      const delay = s.dist / SPEED_OF_SOUND;
      const t0 = now + delay;

      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.value = mat.rate * (0.9 + 0.2 * conf);
      // random start offset into the noise for decorrelation (deterministic)
      src.loop = true;

      const filt = ctx.createBiquadFilter();
      filt.type = mat.filter;
      filt.frequency.value = mat.freq * (0.7 + 0.5 * conf); // brighter as it sharpens
      filt.Q.value = mat.q;

      const env = ctx.createGain();
      // distance attenuation + directional lobe + sharpening gain
      const distAtten = 1 / (1 + s.dist * 0.12);
      const peak = 0.9 * mat.reflect * lobe * distAtten * (0.45 + 0.55 * conf);
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(peak, t0 + 0.0015);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + mat.tail);

      const panner = ctx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.maxDistance = 120;
      panner.rolloffFactor = 0.9;
      const x = Math.sin(s.az) * s.dist;
      const z = -Math.cos(s.az) * s.dist;
      apply3D(panner, x, s.elev, z, t0);

      const send = ctx.createGain();
      send.gain.value = 0.35 * mat.reflect;

      src.connect(filt);
      filt.connect(env);
      env.connect(panner);
      panner.connect(master);
      env.connect(send);
      send.connect(convolver);

      activeVoicesRef.current += 1;
      src.start(t0);
      src.stop(t0 + mat.tail + 0.05);
      src.onended = () => {
        activeVoicesRef.current = Math.max(0, activeVoicesRef.current - 1);
        try {
          src.disconnect();
          filt.disconnect();
          env.disconnect();
          panner.disconnect();
          send.disconnect();
        } catch {
          /* already gone */
        }
      };

      // Accumulate belief (linear stacking) weighted by how well aimed it was.
      belief[i] = Math.min(1, belief[i] + 0.12 * lobe * mat.reflect);
    }

    // The emitted click itself — a tiny broadband tick at the head, centred.
    const tick = ctx.createBufferSource();
    tick.buffer = noiseBuf;
    tick.loop = true;
    const tickHp = ctx.createBiquadFilter();
    tickHp.type = "highpass";
    tickHp.frequency.value = 1500;
    const tickEnv = ctx.createGain();
    tickEnv.gain.setValueAtTime(0.0001, now);
    tickEnv.gain.linearRampToValueAtTime(0.5, now + 0.001);
    tickEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    tick.connect(tickHp);
    tickHp.connect(tickEnv);
    tickEnv.connect(master);
    tick.start(now);
    tick.stop(now + 0.05);
    tick.onended = () => {
      try {
        tick.disconnect();
        tickHp.disconnect();
        tickEnv.disconnect();
      } catch {
        /* gone */
      }
    };

    lastClickRef.current = performance.now() / 1000;
    lastClickAzRef.current = facing;

    // Confidence = mean belief (grows ~linearly with clicks, per eNeuro 2026).
    let sum = 0;
    for (let k = 0; k < belief.length; k++) sum += belief[k];
    setConfidence(sum / belief.length);
    setClicks((c) => c + 1);
  }, []);

  // ── Build / rebuild the room for a preset ─────────────────────────────────
  const loadPreset = useCallback((idx: number) => {
    const preset = PRESETS[idx];
    surfacesRef.current = makeRoom(preset);
    beliefRef.current = new Float32Array(preset.count);
    presetIdxRef.current = idx;
    setPresetIdx(idx);
    setClicks(0);
    setConfidence(0);
    const ctx = ctxRef.current;
    if (ctx && convolverRef.current) {
      convolverRef.current.buffer = makeImpulse(
        ctx,
        preset.reverbSeconds,
        preset.reverbDecay,
      );
    }
  }, []);

  // ── Start the AudioContext (must be inside a user gesture) ─────────────────
  const start = useCallback(() => {
    if (ctxRef.current) return;
    try {
      const AC: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0001;
      masterRef.current = master;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.2;

      master.connect(limiter);
      limiter.connect(ctx.destination);

      const preset = PRESETS[presetIdxRef.current];
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx, preset.reverbSeconds, preset.reverbDecay);
      convolverRef.current = convolver;
      const reverbReturn = ctx.createGain();
      reverbReturn.gain.value = 0.5;
      reverbReturnRef.current = reverbReturn;
      convolver.connect(reverbReturn);
      reverbReturn.connect(master);

      noiseBufRef.current = makeNoiseBuffer(ctx);

      // Faint ambient bed → never dead silent between clicks. Airy noise into
      // the room's own reverb, plus a low breath drone.
      const ambient = ctx.createGain();
      ambient.gain.value = 0.0001;
      ambientGainRef.current = ambient;
      const bedNoise = ctx.createBufferSource();
      bedNoise.buffer = noiseBufRef.current;
      bedNoise.loop = true;
      const bedFilt = ctx.createBiquadFilter();
      bedFilt.type = "lowpass";
      bedFilt.frequency.value = 500;
      bedNoise.connect(bedFilt);
      bedFilt.connect(ambient);
      const drone = ctx.createOscillator();
      drone.type = "sine";
      drone.frequency.value = 48;
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.12;
      drone.connect(droneGain);
      droneGain.connect(ambient);
      ambient.connect(convolver);
      ambient.connect(master);
      bedNoise.start();
      drone.start();

      const now = ctx.currentTime;
      master.gain.linearRampToValueAtTime(0.2, now + 1.2);
      ambient.gain.linearRampToValueAtTime(0.016, now + 2.5);

      setStarted(true);
    } catch {
      setSupported(false);
    }
  }, []);

  // ── Optional mic: broadband onset detection → emitClick ───────────────────
  const enableMic = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 1800; // isolate the sharp click transient
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(hp);
      hp.connect(analyser);
      // NOT connected to destination → no feedback.
      micAnalyserRef.current = analyser;
      micDataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      micBaselineRef.current = 0;
      setMicState("on");
      setMicError(null);
    } catch (e) {
      setMicState("error");
      setMicError(
        e instanceof Error
          ? `Mic unavailable — spacebar still works. (${e.message})`
          : "Mic unavailable — spacebar still works.",
      );
    }
  }, []);

  const disableMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    micDataRef.current = null;
    setMicState("off");
  }, []);

  // ── Keyboard: space = click, arrows = aim ─────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        emitClick();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        facingRef.current -= 0.26;
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        facingRef.current += 0.26;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, emitClick]);

  // ── Render loop: mic onset polling + faint belief map ─────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext("2d") ?? null;

    const frame = () => {
      // --- mic onset detection (broadband transient) ---
      const analyser = micAnalyserRef.current;
      const data = micDataRef.current;
      if (analyser && data) {
        analyser.getByteTimeDomainData(
          data as unknown as Uint8Array<ArrayBuffer>,
        );
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const v = Math.abs(data[i] - 128) / 128;
          if (v > peak) peak = v;
        }
        const base = micBaselineRef.current;
        const nowMs = performance.now();
        // sharp rise well above the rolling floor, with refractory window
        if (
          peak > 0.16 &&
          peak > base * 2.4 + 0.05 &&
          nowMs - micLastOnsetRef.current > 160
        ) {
          micLastOnsetRef.current = nowMs;
          emitClick();
        }
        micBaselineRef.current = base * 0.9 + peak * 0.1;
      }

      // --- belief map (a whisper of light) ---
      if (canvas && ctx2d) {
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const reduced = reducedMotionRef.current;
        if (reduced) {
          ctx2d.fillStyle = "#050308";
          ctx2d.fillRect(0, 0, w, h);
        } else {
          // gentle trailing fade → slow drift, no strobing
          ctx2d.fillStyle = "rgba(5,3,8,0.16)";
          ctx2d.fillRect(0, 0, w, h);
        }

        const nowS = performance.now() / 1000;
        const surfaces = surfacesRef.current;
        const belief = beliefRef.current;
        const preset = PRESETS[presetIdxRef.current];
        const maxR = Math.min(cx, cy) * 0.86;

        // listener at centre — a faint violet core
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, 3.5, 0, Math.PI * 2);
        ctx2d.fillStyle = VIOLET[400];
        ctx2d.globalAlpha = 0.5;
        ctx2d.fill();
        ctx2d.globalAlpha = 1;

        // aim wedge — where the next click will look
        const facing = facingRef.current;
        const breathe = reduced ? 0 : Math.sin(nowS * 0.9) * 0.04;
        ctx2d.save();
        ctx2d.translate(cx, cy);
        ctx2d.rotate(facing + breathe);
        const grad = ctx2d.createLinearGradient(0, 0, 0, -maxR);
        grad.addColorStop(0, "rgba(139,92,246,0.10)");
        grad.addColorStop(1, "rgba(139,92,246,0)");
        ctx2d.beginPath();
        ctx2d.moveTo(0, 0);
        ctx2d.arc(0, 0, maxR, -Math.PI / 2 - 0.34, -Math.PI / 2 + 0.34);
        ctx2d.closePath();
        ctx2d.fillStyle = grad;
        ctx2d.fill();
        ctx2d.restore();

        // belief points — bloom where you've probed and got strong returns
        for (let i = 0; i < surfaces.length; i++) {
          const s = surfaces[i];
          const b = belief[i];
          if (b < 0.02) continue;
          const r = (s.dist / preset.distMax) * maxR;
          const px = cx + Math.sin(s.az) * r;
          const py = cy - Math.cos(s.az) * r;
          const pulse = reduced ? 1 : 1 + Math.sin(nowS * 1.3 + i) * 0.12;
          const rad = (1.5 + b * 7) * pulse;
          const g = ctx2d.createRadialGradient(px, py, 0, px, py, rad * 2.4);
          const col = s.mat === "stone" ? MAGENTA : VIOLET[400];
          g.addColorStop(0, col);
          g.addColorStop(1, "rgba(20,12,38,0)");
          ctx2d.globalAlpha = 0.14 + b * 0.5;
          ctx2d.fillStyle = g;
          ctx2d.beginPath();
          ctx2d.arc(px, py, rad * 2.4, 0, Math.PI * 2);
          ctx2d.fill();
        }
        ctx2d.globalAlpha = 1;

        // expanding echo ring on a fresh click (gentle, ≤ once/click)
        if (!reduced) {
          const age = nowS - lastClickRef.current;
          if (age >= 0 && age < 1.3) {
            const rr = age * maxR * 0.9;
            ctx2d.beginPath();
            ctx2d.strokeStyle = `rgba(167,139,250,${0.18 * (1 - age / 1.3)})`;
            ctx2d.lineWidth = 1;
            ctx2d.arc(cx, cy, rr, 0, Math.PI * 2);
            ctx2d.stroke();
          }
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started, emitClick]);

  // ── Size the canvas to its box (crisp on HiDPI) ───────────────────────────
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [started]);

  // ── Full teardown on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx) void ctx.close();
    };
  }, []);

  // Pointer aim: horizontal position over the field sets facing.
  const onPointer = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width - 0.5;
    const dy = (e.clientY - rect.top) / rect.height - 0.5;
    facingRef.current = Math.atan2(dx, -dy);
  }, []);

  const preset = PRESETS[presetIdx];

  // ══ Not-supported fallback ═════════════════════════════════════════════════
  if (!supported) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Click Cathedral
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          This instrument needs the Web Audio API, which this browser does not
          expose. Try a recent Chrome, Safari, or Firefox with headphones.
        </p>
        <PrototypeNav slugs={["1520-click-cathedral"]} />
      </main>
    );
  }

  // ══ Main ═══════════════════════════════════════════════════════════════════
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* faint art field / belief map */}
      <div
        className="absolute inset-0"
        onPointerMove={started ? onPointer : undefined}
        onPointerDown={
          started
            ? (e) => {
                onPointer(e);
                emitClick();
              }
            : undefined
        }
      >
        {started ? (
          <canvas ref={canvasRef} className="h-full w-full" />
        ) : (
          <IdleField />
        )}
      </div>

      {/* chrome */}
      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col p-6 sm:p-10">
        <header className="pointer-events-auto max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            dream · 1520 · audio-only
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Click Cathedral
          </h1>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            Can you <span className="text-foreground">see</span> a vast space you
            cannot see — by clicking into the dark and listening to it answer?
            You emit clicks into an invisible cathedral; each click that lands
            sharpens the room in your ears and on the faint map.
          </p>
          <p className="mt-3 flex items-center gap-2 text-base text-foreground">
            <span aria-hidden>🎧</span>
            Wear headphones — the echoes are binaural and spatial.
          </p>
        </header>

        {!started ? (
          <div className="pointer-events-auto mt-8 flex flex-col items-start gap-4">
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Enter the dark
            </button>
            <p className="max-w-md text-sm text-muted-foreground">
              Then press <kbd className="rounded bg-accent px-1.5 py-0.5 text-foreground">Space</kbd>{" "}
              to click. Aim with <kbd className="rounded bg-accent px-1.5 py-0.5 text-foreground">←</kbd>{" "}
              <kbd className="rounded bg-accent px-1.5 py-0.5 text-foreground">→</kbd> or your pointer.
              Optionally let it hear your real tongue-clicks through the mic.
            </p>
          </div>
        ) : (
          <>
            {/* bottom control strip */}
            <div className="pointer-events-auto mt-auto flex flex-col gap-4">
              <p className="max-w-xl text-sm text-muted-foreground">
                Press <kbd className="rounded bg-accent px-1.5 py-0.5 text-foreground">Space</kbd>{" "}
                (or tap the field) to click. Aim with{" "}
                <kbd className="rounded bg-accent px-1.5 py-0.5 text-foreground">←</kbd>{" "}
                <kbd className="rounded bg-accent px-1.5 py-0.5 text-foreground">→</kbd>{" "}
                or by moving your pointer. Keep clicking toward a region to build
                its image.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {PRESETS.map((p, i) => (
                  <button
                    key={p.name}
                    onClick={() => loadPreset(i)}
                    className={
                      i === presetIdx
                        ? "min-h-[44px] rounded-md bg-primary/20 px-4 text-sm font-medium text-primary"
                        : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                    }
                  >
                    {p.name}
                  </button>
                ))}
                <button
                  onClick={micState === "on" ? disableMic : enableMic}
                  className={
                    micState === "on"
                      ? "min-h-[44px] rounded-md bg-primary/20 px-4 text-sm font-medium text-primary"
                      : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                  }
                >
                  {micState === "on" ? "Mic: listening" : "Use mic clicks"}
                </button>
                <button
                  onClick={() => setShowNotes(true)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Notes
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span>{preset.blurb}</span>
                <span>clicks: {clicks}</span>
                <span>
                  image forming: {Math.round(confidence * 100)}%
                </span>
              </div>

              {micError && (
                <p className="max-w-md text-sm text-destructive">{micError}</p>
              )}
            </div>
          </>
        )}
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              What you are hearing
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Every click is scattered back by a procedurally-generated room of
                surfaces. Each surface returns the click delayed by its distance
                (speed of sound, 343 m/s), coloured by its material, and placed
                around your head with an HRTF panner — near soft walls are dull
                and quick; a far stone vault is bright, late, and reverberant.
              </p>
              <p>
                This piece embodies Garcia-Lazaro et al.,{" "}
                <span className="text-foreground">
                  &ldquo;Neural and behavioral correlates of evidence
                  accumulation in human click-based echolocation&rdquo;
                </span>{" "}
                (eNeuro, April 2026). Expert echolocators build their spatial map
                by <span className="text-foreground">stacking clicks</span> —
                accuracy grows roughly linearly with the number of clicks. So
                here every click toward a region sharpens its echo and its point
                on the belief map. The image is <em>accumulated</em>, not
                revealed.
              </p>
              <p>
                In the lineage of Daniel Kish&rsquo;s flash-sonar and Pauline
                Oliveros&rsquo;s Deep Listening. Headphones essential.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to the dark
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1520-click-cathedral"]} />
    </main>
  );
}

// ── Idle field: a faint drifting violet wash so it's never a blank page ──────
function IdleField() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const raf = useRef<number>(0);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);
    const rnd = mulberry32(0x51a7);
    const pts = Array.from({ length: 40 }, () => ({
      a: rnd() * Math.PI * 2,
      r: rnd(),
      s: 0.2 + rnd() * 0.6,
    }));
    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const t = performance.now() / 1000;
      ctx.fillStyle = "#050308";
      ctx.fillRect(0, 0, w, h);
      const maxR = Math.min(cx, cy) * 0.95;
      for (const p of pts) {
        const drift = reduced ? 0 : Math.sin(t * 0.25 * p.s + p.a) * 0.03;
        const r = (p.r + drift) * maxR;
        const px = cx + Math.cos(p.a) * r;
        const py = cy + Math.sin(p.a) * r;
        const tw = reduced ? 0.06 : 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t * p.s + p.a));
        ctx.globalAlpha = tw;
        ctx.fillStyle = VIOLET[500];
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf.current = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener("resize", resize);
    };
  }, []);
  return <canvas ref={ref} className="h-full w-full" />;
}
