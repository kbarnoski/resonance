"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Orbit Choir — a head-tracked HRTF spatial piece with a 6-minute harmonic arc.
// A circle of detuned voices, scattered in dissonance, slowly orbits inward and
// glides into a warm resolving chord. Turn your phone (or drag) to shepherd the
// voices home faster.
// ─────────────────────────────────────────────────────────────────────────────

const ARC_SECONDS = 360; // ~6 minutes

// Target chord: a warm natural-minor add9 with a stacked-fifth glow.
// A natural minor (A2) → E3 → A3 → C4 → E4 → B4(add9) → G4(b7) → A5.
// Frequencies in Hz for each voice's RESOLVED tone.
const TARGET_HZ = [
  110.0, // A2  — root drone
  164.81, // E3  — fifth
  220.0, // A3  — octave
  261.63, // C4  — minor third
  329.63, // E4  — fifth (upper)
  493.88, // B4  — the add9 shimmer
  392.0, // G4  — natural-minor 7th, gives the Dorian/Aeolian warmth
];

const VOICE_COUNT = TARGET_HZ.length;

// At t=0 each voice is detuned by these (semitone-ish) offsets into a cluster,
// and starts at a scattered azimuth. Over the arc both resolve.
const START_DETUNE_SEMITONES = [-0.9, 1.4, -1.8, 0.7, -1.2, 2.1, -0.5];

// Scattered start azimuths (radians) vs. evenly-spread resolved azimuths.
const START_AZIMUTH = [0.4, 2.9, 1.1, 5.6, 3.7, 0.9, 4.4];

// ── types ────────────────────────────────────────────────────────────────────

interface VoiceNodes {
  oscs: OscillatorNode[]; // 2-3 oscillators per voice
  detunes: number[]; // per-osc base detune (cents) for harmonic colour
  baseGain: GainNode; // per-voice level
  lfo: OscillatorNode; // breathing LFO
  lfoGain: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  // arc state
  azimuth: number; // current azimuth (rad)
  radius: number; // current radius (1 = far, ~0.4 = gathered)
  progress: number; // 0..1 personal resolution (shepherded forward)
  swell: number; // 0..1 facing swell (smoothed)
}

type Phase = "idle" | "running" | "resolved" | "no-audio";

// Narrow interfaces for legacy Web Audio fallbacks (no `any`).
interface LegacyPanner {
  setPosition(x: number, y: number, z: number): void;
  setOrientation(x: number, y: number, z: number): void;
}
interface LegacyListener {
  setPosition(x: number, y: number, z: number): void;
  setOrientation(
    fx: number,
    fy: number,
    fz: number,
    ux: number,
    uy: number,
    uz: number,
  ): void;
}
interface OrientationPermissionDOE {
  requestPermission?: () => Promise<"granted" | "denied">;
}

// ── helpers (NOT named useX) ───────────────────────────────────────────────────

function formatClock(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function semitonesToRatio(st: number): number {
  return Math.pow(2, st / 12);
}

// Synthesize a short reverb impulse from decaying filtered noise (no files).
function makeImpulse(actx: AudioContext): AudioBuffer {
  const rate = actx.sampleRate;
  const len = Math.round(rate * 2.6);
  const buf = actx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const decay = Math.pow(1 - t, 2.4);
      // lowpass-ish smoothing of white noise for a warmer tail
      const white = Math.random() * 2 - 1;
      last = last * 0.78 + white * 0.22;
      data[i] = last * decay;
    }
  }
  return buf;
}

// easeInOut for the macro arc so the resolution breathes rather than ramps.
function easeArc(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

// Apply a position to a panner supporting modern AudioParams OR legacy method.
function applyPannerPosition(
  panner: PannerNode,
  x: number,
  y: number,
  z: number,
  when: number,
): void {
  const modern = panner as PannerNode & { positionX?: AudioParam };
  if (modern.positionX) {
    modern.positionX.setTargetAtTime(x, when, 0.08);
    (panner as PannerNode & { positionY: AudioParam }).positionY.setTargetAtTime(
      y,
      when,
      0.08,
    );
    (panner as PannerNode & { positionZ: AudioParam }).positionZ.setTargetAtTime(
      z,
      when,
      0.08,
    );
  } else {
    (panner as unknown as LegacyPanner).setPosition(x, y, z);
  }
}

// Rotate the listener forward vector (yaw only) supporting modern OR legacy API.
function applyListenerForward(
  listener: AudioListener,
  yaw: number,
  when: number,
): void {
  const fx = Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const modern = listener as AudioListener & { forwardX?: AudioParam };
  if (modern.forwardX) {
    modern.forwardX.setTargetAtTime(fx, when, 0.05);
    (
      listener as AudioListener & { forwardY: AudioParam }
    ).forwardY.setTargetAtTime(0, when, 0.05);
    (
      listener as AudioListener & { forwardZ: AudioParam }
    ).forwardZ.setTargetAtTime(fz, when, 0.05);
    (listener as AudioListener & { upX: AudioParam }).upX.setValueAtTime(
      0,
      when,
    );
    (listener as AudioListener & { upY: AudioParam }).upY.setValueAtTime(
      1,
      when,
    );
    (listener as AudioListener & { upZ: AudioParam }).upZ.setValueAtTime(
      0,
      when,
    );
  } else {
    (listener as unknown as LegacyListener).setOrientation(
      fx,
      0,
      fz,
      0,
      1,
      0,
    );
  }
}

// ── component ──────────────────────────────────────────────────────────────────

export default function OrbitChoirPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [clock, setClock] = useState(0);
  const [sensorActive, setSensorActive] = useState(false);
  const [arcLabel, setArcLabel] = useState("scattered");

  // audio refs
  const actxRef = useRef<AudioContext | null>(null);
  const voicesRef = useRef<VoiceNodes[]>([]);
  const masterRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef(0);

  // interaction refs
  const yawRef = useRef(0); // listener facing (radians), 0 = forward
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const lastPointerRef = useRef(0);
  const autoTourRef = useRef(true); // hands-free demo unless user interacts
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── canvas draw loop ─────────────────────────────────────────────────────────
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.4;

    ctx.clearRect(0, 0, w, h);

    // faint guide ring
    ctx.strokeStyle = "rgba(139, 92, 246, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // listener at center
    ctx.fillStyle = "rgba(196, 181, 253, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // facing marker
    const yaw = yawRef.current;
    const fx = cx + Math.sin(yaw) * R * 1.06;
    const fy = cy - Math.cos(yaw) * R * 1.06;
    ctx.strokeStyle = "rgba(196, 181, 253, 0.5)";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(fx, fy);
    ctx.stroke();

    // voices
    for (const v of voicesRef.current) {
      const vr = R * v.radius;
      const px = cx + Math.sin(v.azimuth) * vr;
      const py = cy - Math.cos(v.azimuth) * vr;
      const glow = 0.22 + v.swell * 0.55 + v.progress * 0.15;
      ctx.fillStyle = `rgba(167, 139, 250, ${Math.min(0.85, glow)})`;
      ctx.beginPath();
      ctx.arc(px, py, 2.5 + v.swell * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  // ── per-frame arc + interaction update ───────────────────────────────────────
  const tick = useCallback(() => {
    const actx = actxRef.current;
    if (!actx) return;
    const now = actx.currentTime;
    const elapsed = now - startTimeRef.current;
    const globalT = Math.min(1, elapsed / ARC_SECONDS);
    const eased = easeArc(globalT);

    // hands-free slow auto-tour of the listener when no input is driving things
    if (autoTourRef.current) {
      yawRef.current = Math.sin(elapsed * 0.05) * 1.4;
    }
    const yaw = yawRef.current;
    const listener = actx.listener;
    applyListenerForward(listener, yaw, now);

    let allResolved = true;
    for (let i = 0; i < voicesRef.current.length; i++) {
      const v = voicesRef.current[i];

      // facing swell: how aligned listener yaw is with this voice's azimuth
      let da = v.azimuth - yaw;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const facing = Math.max(0, 1 - Math.abs(da) / 0.7); // 1 when dead-on
      v.swell += (facing - v.swell) * 0.08;

      // shepherding: facing a voice nudges its personal resolution forward,
      // floored by the global arc so it never lags the macro schedule.
      v.progress = Math.max(v.progress, globalT);
      if (facing > 0.35) {
        v.progress = Math.min(1, v.progress + facing * 0.0016);
      }
      const p = Math.max(eased, easeArc(v.progress));
      if (v.progress < 0.999) allResolved = false;

      // azimuth: lerp from scattered start toward an even, consonant spread
      const targetAz = (i / VOICE_COUNT) * Math.PI * 2;
      let azDelta = targetAz - START_AZIMUTH[i];
      while (azDelta > Math.PI) azDelta -= Math.PI * 2;
      while (azDelta < -Math.PI) azDelta += Math.PI * 2;
      v.azimuth = START_AZIMUTH[i] + azDelta * p;

      // radius: orbit inward from 1.0 to a gathered 0.45
      v.radius = 1.0 - 0.55 * p;

      // place panner in 3D (unit-ish circle around listener)
      const dist = 1.2 + v.radius * 4.5; // farther when scattered
      const px = Math.sin(v.azimuth) * dist;
      const pz = -Math.cos(v.azimuth) * dist;
      applyPannerPosition(v.panner, px, 0, pz, now);

      // pitch glide: from detuned cluster toward the target tone
      const startHz = TARGET_HZ[i] * semitonesToRatio(START_DETUNE_SEMITONES[i]);
      const hz = startHz + (TARGET_HZ[i] - startHz) * p;
      for (let o = 0; o < v.oscs.length; o++) {
        const harmonic = o === 0 ? 1 : o === 1 ? 2 : 3;
        v.oscs[o].frequency.setTargetAtTime(hz * harmonic, now, 0.3);
      }

      // facing swells the voice level a touch
      const lvl = 0.16 + v.swell * 0.12 + p * 0.04;
      v.baseGain.gain.setTargetAtTime(lvl, now, 0.2);
    }

    setClock(elapsed);
    setArcLabel(
      globalT < 0.12
        ? "scattered"
        : globalT < 0.45
          ? "drifting in"
          : globalT < 0.8
            ? "gathering"
            : globalT < 0.999
              ? "almost home"
              : "resolved",
    );

    if (allResolved && globalT >= 0.999 && phase === "running") {
      setPhase("resolved");
    }

    drawMap();
    rafRef.current = requestAnimationFrame(tick);
  }, [drawMap, phase]);

  // ── build the audio graph & start ────────────────────────────────────────────
  const start = useCallback(async () => {
    if (typeof window === "undefined") return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      setPhase("no-audio");
      return;
    }
    const actx = new AC();
    actxRef.current = actx;
    await actx.resume();

    const master = actx.createGain();
    master.gain.value = 0;
    master.connect(actx.destination);
    masterRef.current = master;

    // synthesized convolver reverb (shared)
    const convolver = actx.createConvolver();
    convolver.buffer = makeImpulse(actx);
    const reverbGain = actx.createGain();
    reverbGain.gain.value = 0.32;
    convolver.connect(reverbGain).connect(master);

    // listener baseline position (modern or legacy)
    const listener = actx.listener;
    const modernL = listener as AudioListener & { positionX?: AudioParam };
    if (modernL.positionX) {
      modernL.positionX.value = 0;
      (listener as AudioListener & { positionY: AudioParam }).positionY.value = 0;
      (listener as AudioListener & { positionZ: AudioParam }).positionZ.value = 0;
    } else {
      (listener as unknown as LegacyListener).setPosition(0, 0, 0);
    }

    const voices: VoiceNodes[] = [];
    for (let i = 0; i < VOICE_COUNT; i++) {
      const panner = actx.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 1;
      panner.rolloffFactor = 0.6;

      const filter = actx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400;
      filter.Q.value = 0.4;

      const baseGain = actx.createGain();
      baseGain.gain.value = 0.16;

      // breathing LFO modulating baseGain
      const lfo = actx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.05 + Math.random() * 0.05;
      const lfoGain = actx.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain).connect(baseGain.gain);
      lfo.start();

      // 2-3 oscillators per voice
      const oscs: OscillatorNode[] = [];
      const detunes: number[] = [];
      const startHz =
        TARGET_HZ[i] * semitonesToRatio(START_DETUNE_SEMITONES[i]);
      const oscCount = i % 2 === 0 ? 3 : 2;
      for (let o = 0; o < oscCount; o++) {
        const osc = actx.createOscillator();
        osc.type = "sine";
        const harmonic = o === 0 ? 1 : o === 1 ? 2 : 3;
        osc.frequency.value = startHz * harmonic;
        const det = o === 0 ? 0 : (Math.random() * 2 - 1) * 4;
        osc.detune.value = det;
        detunes.push(det);
        // quieter upper harmonics
        const hGain = actx.createGain();
        hGain.gain.value = o === 0 ? 1 : o === 1 ? 0.28 : 0.14;
        osc.connect(hGain).connect(filter);
        osc.start();
        oscs.push(osc);
      }

      filter.connect(baseGain);
      baseGain.connect(panner);
      panner.connect(master);
      panner.connect(convolver); // feed shared reverb

      voices.push({
        oscs,
        detunes,
        baseGain,
        lfo,
        lfoGain,
        filter,
        panner,
        azimuth: START_AZIMUTH[i],
        radius: 1.0,
        progress: 0,
        swell: 0,
      });
    }
    voicesRef.current = voices;

    startTimeRef.current = actx.currentTime;
    // gentle fade-in of the whole field
    master.gain.setValueAtTime(0, actx.currentTime);
    master.gain.linearRampToValueAtTime(0.7, actx.currentTime + 6);

    setPhase("running");
    setClock(0);
    rafRef.current = requestAnimationFrame(tick);

    // request device-orientation permission (iOS) inside this user gesture
    const DOE = (
      window as unknown as { DeviceOrientationEvent?: OrientationPermissionDOE }
    ).DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") setSensorActive(true);
      } catch {
        setSensorActive(false);
      }
    } else if (typeof window !== "undefined" && "DeviceOrientationEvent" in window) {
      // non-iOS: assume available; the listener flips sensorActive on first event
      setSensorActive(true);
    }
  }, [tick]);

  // ── teardown ─────────────────────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const actx = actxRef.current;
    if (actx) {
      for (const v of voicesRef.current) {
        try {
          v.oscs.forEach((o) => o.stop());
          v.lfo.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.panner.disconnect();
          v.baseGain.disconnect();
          v.filter.disconnect();
        } catch {
          /* noop */
        }
      }
      voicesRef.current = [];
      try {
        masterRef.current?.disconnect();
      } catch {
        /* noop */
      }
      actx.close().catch(() => undefined);
    }
    actxRef.current = null;
    masterRef.current = null;
  }, []);

  const beginAgain = useCallback(() => {
    stopAll();
    setPhase("idle");
    setClock(0);
    yawRef.current = 0;
    autoTourRef.current = true;
  }, [stopAll]);

  // ── device orientation listener ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running" && phase !== "resolved") return;
    function onOrient(e: DeviceOrientationEvent) {
      if (e.alpha == null) return;
      autoTourRef.current = false;
      setSensorActive(true);
      // alpha: 0..360 compass-ish → radians yaw
      yawRef.current = (e.alpha * Math.PI) / 180;
    }
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [phase]);

  // ── pointer + keyboard fallback ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running" && phase !== "resolved") return;
    function onDown(e: PointerEvent) {
      draggingRef.current = true;
      autoTourRef.current = false;
      lastPointerRef.current = e.clientX;
    }
    function onMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastPointerRef.current;
      lastPointerRef.current = e.clientX;
      yawRef.current += dx * 0.006;
    }
    function onUp() {
      draggingRef.current = false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        autoTourRef.current = false;
        yawRef.current -= 0.12;
      } else if (e.key === "ArrowRight") {
        autoTourRef.current = false;
        yawRef.current += 0.12;
      }
    }
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);

  // ── cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  // ── canvas sizing ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const size = 320;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.scale(dpr, dpr);
  }, []);

  const progressPct = Math.min(100, (clock / ARC_SECONDS) * 100);

  return (
    <main className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#05050a] text-white">
      {/* faint orbital map */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-80"
        aria-hidden
      />

      {/* arc progress ring label */}
      {(phase === "running" || phase === "resolved") && (
        <div className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 text-center">
          <p className="text-base text-white/75 tabular-nums">
            {formatClock(clock)} — {arcLabel}
          </p>
          <div className="mx-auto mt-2 h-px w-48 bg-white/10">
            <div
              className="h-px bg-violet-300/60"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* idle / start */}
      {phase === "idle" && (
        <div className="relative z-10 max-w-md px-6 text-center">
          <h1 className="font-serif text-2xl text-white/95">Orbit Choir</h1>
          <p className="mt-4 text-base text-white/80">
            A circle of voices, scattered in dissonance around your head, slowly
            orbits inward and resolves into one warm chord over about six
            minutes. Turn your phone or drag to shepherd the voices home.
          </p>
          <p className="mt-4 text-base text-white/80">
            Use <span className="text-violet-300">headphones</span> — the spatial
            field is rendered binaurally (HRTF) and won&apos;t work on speakers.
          </p>
          <button
            onClick={start}
            className="mt-8 min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/10 px-6 py-2.5 text-base text-white/95 transition hover:bg-violet-500/20"
          >
            Begin the orbit
          </button>
          <p className="mt-6 text-base text-white/75">
            No phone sensor? Drag left/right or use arrow keys. A slow auto-tour
            plays hands-free.
          </p>
        </div>
      )}

      {/* running hint */}
      {phase === "running" && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 px-6 text-center">
          {!sensorActive && (
            <p className="text-base text-rose-300">
              Motion sensor not active — drag or use arrow keys to turn; a slow
              auto-tour is guiding the field.
            </p>
          )}
          {sensorActive && (
            <p className="text-base text-white/75">
              Turn to face a voice — it swells, and gathers home a little faster.
            </p>
          )}
        </div>
      )}

      {/* resolved */}
      {phase === "resolved" && (
        <div className="relative z-10 max-w-md px-6 text-center">
          <p className="text-xl text-white/95">The chord is whole.</p>
          <p className="mt-3 text-base text-white/80">
            Every voice has orbited home and resolved. Rest in it, or begin the
            scattering again.
          </p>
          <button
            onClick={beginAgain}
            className="mt-6 min-h-[44px] rounded-full border border-violet-400/40 bg-violet-500/10 px-6 py-2.5 text-base text-white/95 transition hover:bg-violet-500/20"
          >
            Begin again
          </button>
        </div>
      )}

      {/* no audio */}
      {phase === "no-audio" && (
        <div className="relative z-10 max-w-md px-6 text-center">
          <p className="text-base text-rose-300">
            This browser doesn&apos;t support the Web Audio API, so the spatial
            choir can&apos;t play here. Try a recent Chrome, Safari, or Firefox.
          </p>
        </div>
      )}

      {/* design notes link */}
      <a
        href="/dream/308-orbit-choir/README.md"
        className="absolute bottom-4 right-4 text-base text-white/75 underline-offset-4 hover:underline"
      >
        Read the design notes
      </a>
    </main>
  );
}
