"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10712-thresholdway — "What if you could DESCEND a long-form near-death passage
// — an endless tunnel toward a light — by HOLDING a single 'surrender' gesture,
// leaving the words you type hanging in the tunnel behind you as a re-readable
// transcript, while the piece moves through phenomenological phases so it is
// genuinely different at minute 5 than at minute 1?"
//
//   SUBSTRATE — pure CSS 3D. A `perspective: 700px` container wraps a
//   `preserve-3d` scene of 36 concentric ring <div>s at stepped translateZ. A
//   single `travel` accumulator rushes the rings toward and past the camera; a
//   ring that passes the near plane wraps back to the far end → an endless
//   corridor. The "light" is a soft radial-gradient disc deep at the far end.
//   No canvas, no WebGL, no SVG — every mark is a positioned <div> with
//   radial-gradients, blur and mix-blend-mode:screen.
//
//   INTERACTION — one gesture, held. Press-and-HOLD anywhere = surrender: the
//   descent accelerates, the Shepard fall lifts, you fall toward the light.
//   Release = you slow and drift. Typing pins a luminous word to the ring near
//   the camera; it recedes into the dark behind you (a re-readable transcript
//   hanging in the tunnel). Space = new cluster, Enter = a brighter surge,
//   Backspace = pull gently back up the tunnel.
//
//   FIVE PHASES driven by an internal depth accumulator: (1) dissolution,
//   (2) the tunnel, (3) approaching the light, (4) the clear light / ganzfeld
//   bloom (a SLOW smootherstep drift, never a flash), (5) boundless void /
//   return — then the cycle can begin again.
//
//   AUTO-PERFORMER — a seeded mulberry32(0x10712) drives an auto-descent that
//   begins ~1s after mount with NO gesture, holding/releasing surrender on its
//   own rhythm and auto-typing a fixed calm phrase, so a MUTED phone with
//   nothing granted still sees the whole passage. Real pointer/key input takes
//   over; the performer resumes after ~8s idle.
//
//   Refs: James Turrell — Ganzfeld / As Seen Below (ARoS Aarhus, 2026);
//   Shepard (1964) / Risset endless glissando; NDE tunnel phenomenology.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { startShepard, type ShepardEngine } from "../_shared/visionary/shepard";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

// ── deterministic PRNG (NEVER Math.random / Date.now) ───────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ken Perlin's smootherstep — every luminance drift is eased with this so the
// ganzfeld bloom is a slow drift, never a strobe.
function smootherstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ── corridor geometry ───────────────────────────────────────────────────────
const RING_COUNT = 36;
const DEPTH = 3600; // total recycle depth (px in translateZ space)
const SPACING = DEPTH / RING_COUNT; // 100
const FAR_OFFSET = 3200; // deepest ring sits at z = -3200
const NEAR_PASS = 400; // rings rush to +400 (past camera) before wrapping
const LIGHT_Z = -3300; // the far disc, always beyond the deepest ring

// ── descent dynamics ────────────────────────────────────────────────────────
const SPEED_DRIFT = 70; // gentle drift when released (px/s of travel)
const SPEED_MAX = 900; // full surrender rush
const PHASE_DEPTH = 5200; // travel per phase; 5 phases then the cycle repeats

// ── the five phenomenological phases (ART layer — raw hues allowed here) ─────
type PhaseParam = {
  name: string;
  hue: number;
  sat: number;
  light: number; // ring luminance (%)
  ringScale: number; // <1 tightens the tunnel, >1 opens it
  lightSize: number; // far disc radius (vmin)
  lightBright: number; // far disc luminance 0..1
  veil: number; // room-edge softening / vignette 0..1
  drive: number; // extra Shepard drive from the phase itself
};
const PHASES: PhaseParam[] = [
  // 1 · dissolution — dim, the room's edges soften
  { name: "dissolution", hue: 265, sat: 42, light: 30, ringScale: 1.18, lightSize: 9, lightBright: 0.05, veil: 0.6, drive: 0.04 },
  // 2 · the tunnel — rings tighten, speed builds, the light appears far ahead
  { name: "the tunnel", hue: 254, sat: 62, light: 56, ringScale: 0.72, lightSize: 16, lightBright: 0.24, veil: 0.22, drive: 0.14 },
  // 3 · approaching the light — the disc grows, brightness climbs
  { name: "approaching the light", hue: 276, sat: 56, light: 72, ringScale: 0.82, lightSize: 40, lightBright: 0.62, veil: 0.1, drive: 0.22 },
  // 4 · the clear light / ganzfeld — full-field bloom (SLOW smootherstep)
  { name: "the clear light", hue: 282, sat: 18, light: 96, ringScale: 0.98, lightSize: 92, lightBright: 1.0, veil: 0.0, drive: 0.26 },
  // 5 · boundless void / return — the field opens, calm; the cycle can restart
  { name: "boundless void", hue: 268, sat: 46, light: 40, ringScale: 1.34, lightSize: 22, lightBright: 0.14, veil: 0.34, drive: 0.06 },
];

// interpolate the phase params at a continuous phasePos in [0,5)
function paramsAt(phasePos: number): PhaseParam & { index: number; frac: number } {
  const i = Math.floor(phasePos) % PHASES.length;
  const j = (i + 1) % PHASES.length;
  const f = phasePos - Math.floor(phasePos);
  const a = PHASES[i];
  const b = PHASES[j];
  return {
    index: i,
    frac: f,
    name: a.name,
    hue: lerp(a.hue, b.hue, f),
    sat: lerp(a.sat, b.sat, f),
    light: lerp(a.light, b.light, f),
    ringScale: lerp(a.ringScale, b.ringScale, f),
    lightSize: lerp(a.lightSize, b.lightSize, f),
    lightBright: lerp(a.lightBright, b.lightBright, f),
    veil: lerp(a.veil, b.veil, f),
    drive: lerp(a.drive, b.drive, f),
  };
}

// The ganzfeld bloom: a smootherstep bump centred inside phase 4 (phasePos ~3.5).
// It only ever peaks slowly because phasePos advances with descent depth, and it
// is additionally slew-limited in the loop — so it is a SLOW DRIFT, never a flash.
function bloomTarget(phasePos: number): number {
  const local = phasePos - 3; // phase-4 window is [3,4)
  if (local < 0 || local >= 1) return 0;
  const up = smootherstep(local / 0.42);
  const down = 1 - smootherstep((local - 0.5) / 0.5);
  return Math.max(0, Math.min(up, down));
}

// ── typed transcript ─────────────────────────────────────────────────────────
type WordItem = {
  id: number;
  text: string;
  x: number; // px offset from tunnel centre
  y: number;
  pinTravel: number; // travel value when the word was pinned
};
const MAX_WORDS = 24;

// ── one inharmonic struck bell (per ring passed) ─────────────────────────────
const BELL_RATIOS = [1, 2.76, 5.4, 8.93];
function runBell(ctx: AudioContext, dest: AudioNode, base: number, gain: number) {
  const now = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(dest);
  for (let k = 0; k < BELL_RATIOS.length; k++) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = base * BELL_RATIOS[k];
    const g = ctx.createGain();
    const amp = (gain * 0.5) / (k + 1);
    const dur = 0.45 - k * 0.06;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.08, dur));
    osc.connect(g);
    g.connect(bus);
    osc.start(now);
    osc.stop(now + 0.5);
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// The seeded auto-performer's fixed passage (double spaces → new clusters).
const AUTO_PHRASE = "i let go  the light is near  it is kind  i fall  ";

export default function ThresholdwayPage() {
  // ── DOM refs the loop mutates directly (no per-frame React render) ──────────
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const ringRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lightRef = useRef<HTMLDivElement | null>(null);
  const bloomRef = useRef<HTMLDivElement | null>(null);
  const vignetteRef = useRef<HTMLDivElement | null>(null);
  const phaseLabelRef = useRef<HTMLSpanElement | null>(null);
  const depthLabelRef = useRef<HTMLSpanElement | null>(null);
  const wordEls = useRef<Map<number, HTMLSpanElement>>(new Map());

  // ── audio refs ──────────────────────────────────────────────────────────────
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const engineRef = useRef<ShepardEngine | null>(null);

  // ── running state (refs, read/written inside the loop) ──────────────────────
  const rafRef = useRef(0);
  const travelRef = useRef(0); // wraps within [0, DEPTH)
  const depthRef = useRef(0); // monotonic total descent → drives phases
  const speedRef = useRef(SPEED_DRIFT);
  const holdRef = useRef(false); // real pointer hold
  const surgeRef = useRef(0); // Enter surge, decays
  const prevZRef = useRef<number[]>([]);
  const lastBellRef = useRef(0);
  const bloomAppliedRef = useRef(0); // slew-limited bloom opacity
  const brightAppliedRef = useRef(0); // slew-limited far-light brightness
  const veilAppliedRef = useRef(0.6);

  // transcript
  const wordsRef = useRef<WordItem[]>([]);
  const activeWordRef = useRef<number | null>(null);
  const wordIdRef = useRef(0);
  const rngRef = useRef<() => number>(mulberry32(0x10712));

  // auto-performer
  const lastInputRef = useRef(0);
  const autoHoldRef = useRef(false);
  const autoToggleRef = useRef(0);
  const autoTypeRef = useRef(0);
  const autoIdxRef = useRef(0);

  // ── discrete UI state ────────────────────────────────────────────────────────
  const [audioOn, setAudioOn] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [words, setWords] = useState<WordItem[]>([]);
  const [autoBadge, setAutoBadge] = useState(true);

  // ── transcript mutation (shared by keyboard + auto-performer) ────────────────
  const pinWord = useCallback((initial: string) => {
    const rng = rngRef.current;
    const ang = rng() * Math.PI * 2;
    const rad = 120 + rng() * 220;
    const id = ++wordIdRef.current;
    const item: WordItem = {
      id,
      text: initial,
      x: Math.cos(ang) * rad,
      y: Math.sin(ang) * rad * 0.62,
      pinTravel: depthRef.current,
    };
    wordsRef.current = [...wordsRef.current, item];
    if (wordsRef.current.length > MAX_WORDS) {
      wordsRef.current = wordsRef.current.slice(-MAX_WORDS);
    }
    activeWordRef.current = id;
    setWords(wordsRef.current);
  }, []);

  const applyChar = useCallback(
    (ch: string) => {
      if (ch === " ") {
        activeWordRef.current = null; // start a fresh cluster on the next char
        return;
      }
      const id = activeWordRef.current;
      if (id == null) {
        pinWord(ch);
        return;
      }
      const arr = wordsRef.current;
      const idx = arr.findIndex((w) => w.id === id);
      if (idx === -1) {
        pinWord(ch);
        return;
      }
      const next = arr.slice();
      next[idx] = { ...next[idx], text: (next[idx].text + ch).slice(0, 22) };
      wordsRef.current = next;
      setWords(next);
    },
    [pinWord],
  );

  // ── start audio (deferred to the first user gesture — autoplay policy) ───────
  const startAudio = useCallback(async () => {
    if (ctxRef.current) return;
    try {
      const Ctor: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) {
        setAudioError("Web Audio is unavailable — visuals only.");
        return;
      }
      const ctx = new Ctor();
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* the gesture should cover this */
        }
      }
      const master = createSafeMaster(ctx);
      const engine = startShepard(ctx, master.input, { dir: -1, peakGain: 0.42 });
      ctxRef.current = ctx;
      masterRef.current = master;
      engineRef.current = engine;
      setAudioOn(true);
    } catch {
      setAudioError("Audio failed to start — visuals continue silently.");
    }
  }, []);

  const stopAudio = useCallback(() => {
    try {
      engineRef.current?.stop();
    } catch {
      /* closing */
    }
    try {
      masterRef.current?.disconnect();
    } catch {
      /* closing */
    }
    const ctx = ctxRef.current;
    engineRef.current = null;
    masterRef.current = null;
    ctxRef.current = null;
    if (ctx) void ctx.close();
    setAudioOn(false);
  }, []);

  // ── the single animation loop — starts on mount, no gesture required ─────────
  useEffect(() => {
    const reduced = prefersReducedMotion();
    const maxSpeed = reduced ? SPEED_MAX * 0.55 : SPEED_MAX;
    const now0 = performance.now();
    // seed the auto-performer to begin ~0.8s after mount with no input
    lastInputRef.current = now0 - 7200;
    autoToggleRef.current = now0 + 400;
    autoTypeRef.current = now0 + 900;
    prevZRef.current = new Array(RING_COUNT).fill(-FAR_OFFSET);
    let prev = now0;

    const frame = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - prev) / 1000));
      prev = ts;
      const rng = rngRef.current;

      // ── auto-performer arbitration ──────────────────────────────────────────
      const idle = ts - lastInputRef.current > 8000;
      if (idle) {
        if (ts >= autoToggleRef.current) {
          autoHoldRef.current = !autoHoldRef.current;
          const dur = autoHoldRef.current
            ? 2500 + rng() * 2400
            : 1500 + rng() * 1700;
          autoToggleRef.current = ts + dur;
        }
        if (ts >= autoTypeRef.current) {
          const ch = AUTO_PHRASE[autoIdxRef.current % AUTO_PHRASE.length];
          autoIdxRef.current++;
          applyChar(ch);
          autoTypeRef.current = ts + (ch === " " ? 500 : 210) + rng() * 130;
        }
      } else {
        autoHoldRef.current = false;
      }
      const wantBadge = idle;
      if (wantBadge !== autoBadge) setAutoBadge(wantBadge);

      // ── descent speed (the surrender gesture) ───────────────────────────────
      const holding = holdRef.current || (idle && autoHoldRef.current);
      const target = holding ? maxSpeed : SPEED_DRIFT;
      // ease toward target — snappier on press, gentle on release
      const k = holding ? 1 - Math.exp(-dt / 0.55) : 1 - Math.exp(-dt / 1.6);
      speedRef.current += (target - speedRef.current) * k;

      // Enter surge decays
      surgeRef.current *= Math.exp(-dt / 1.1);

      // advance travel + monotonic depth
      const adv = speedRef.current * dt;
      travelRef.current = (travelRef.current + adv) % DEPTH;
      depthRef.current += adv;

      // ── phase evaluation ────────────────────────────────────────────────────
      const phasePos = (depthRef.current / PHASE_DEPTH) % PHASES.length;
      const p = paramsAt(phasePos);

      // slew-limit brightness-critical values (photosensitive safety: whole-field
      // luminance may change no faster than ~full-range / 3s ≈ 0.33/s ≪ 3 Hz)
      const maxStep = dt / 3;
      const bloomWant = bloomTarget(phasePos);
      bloomAppliedRef.current +=
        Math.max(-maxStep, Math.min(maxStep, bloomWant - bloomAppliedRef.current));
      const brightWant = clamp01(p.lightBright + surgeRef.current * 0.4);
      brightAppliedRef.current +=
        Math.max(-maxStep, Math.min(maxStep, brightWant - brightAppliedRef.current));
      const veilStep = dt / 2.2;
      veilAppliedRef.current +=
        Math.max(-veilStep, Math.min(veilStep, p.veil - veilAppliedRef.current));

      // ── ring color via a single scene CSS var ───────────────────────────────
      const scene = sceneRef.current;
      if (scene) {
        scene.style.setProperty(
          "--ring",
          `hsl(${p.hue.toFixed(0)} ${p.sat.toFixed(0)}% ${p.light.toFixed(0)}%)`,
        );
      }

      // ── position + recycle each ring; fire bells on near-plane crossings ─────
      const travel = travelRef.current;
      const rs = p.ringScale;
      const nowAudioReady = ctxRef.current && masterRef.current && engineRef.current;
      for (let i = 0; i < RING_COUNT; i++) {
        const el = ringRefs.current[i];
        if (!el) continue;
        const z = ((travel + i * SPACING) % DEPTH) - FAR_OFFSET; // [-3200, 400)
        // opacity: fade in from the far plane, fade out as it rushes past
        let op = 1;
        if (z < -FAR_OFFSET + 700) op = clamp01((z + FAR_OFFSET) / 700);
        else if (z > NEAR_PASS - 320) op = clamp01((NEAR_PASS - z) / 320);
        el.style.transform = `translate(-50%,-50%) translateZ(${z.toFixed(1)}px) scale(${rs.toFixed(3)})`;
        el.style.opacity = op.toFixed(3);

        // near-plane crossing → struck bell (rate-limited)
        const pz = prevZRef.current[i];
        if (pz < -150 && z >= -150) {
          if (nowAudioReady && ts - lastBellRef.current > 90) {
            lastBellRef.current = ts;
            const octave = (p.index % 3) - 1;
            const base = 180 * Math.pow(2, octave) * (0.9 + 0.3 * rng());
            const g = 0.16 * clamp01(0.4 + speedRef.current / maxSpeed);
            runBell(ctxRef.current!, masterRef.current!.input, base, g);
          }
        }
        prevZRef.current[i] = z;
      }

      // ── far light disc ──────────────────────────────────────────────────────
      const light = lightRef.current;
      if (light) {
        const b = brightAppliedRef.current;
        const size = p.lightSize;
        light.style.width = `${size.toFixed(1)}vmin`;
        light.style.height = `${size.toFixed(1)}vmin`;
        light.style.opacity = (0.35 + 0.65 * b).toFixed(3);
        light.style.filter = `blur(${(6 + size * 0.25).toFixed(1)}px)`;
      }

      // ── ganzfeld bloom (full-field, slew-limited) ───────────────────────────
      const bloom = bloomRef.current;
      if (bloom) bloom.style.opacity = (bloomAppliedRef.current * 0.92).toFixed(3);

      // ── room-edge vignette (dissolution softening) ──────────────────────────
      const vig = vignetteRef.current;
      if (vig) vig.style.opacity = veilAppliedRef.current.toFixed(3);

      // ── transcript: recede words, cull, update transforms ───────────────────
      let culled = false;
      const alive: WordItem[] = [];
      for (const w of wordsRef.current) {
        const wz = -220 - (depthRef.current - w.pinTravel);
        if (wz < -DEPTH - 200) {
          culled = true;
          continue;
        }
        alive.push(w);
        const wel = wordEls.current.get(w.id);
        if (wel) {
          let wop = 1;
          if (wz > 200) wop = clamp01((NEAR_PASS - wz) / 200);
          else wop = clamp01((wz + DEPTH + 200) / 900);
          wel.style.transform = `translate(-50%,-50%) translate3d(${w.x.toFixed(1)}px, ${w.y.toFixed(1)}px, ${wz.toFixed(1)}px)`;
          wel.style.opacity = (wop * 0.9).toFixed(3);
        }
      }
      if (culled) {
        wordsRef.current = alive;
        setWords(alive);
      }

      // ── drive the Shepard fall from descent energy ──────────────────────────
      const engine = engineRef.current;
      if (engine) {
        const speedNorm = clamp01(
          (speedRef.current - SPEED_DRIFT) / (maxSpeed - SPEED_DRIFT),
        );
        engine.setDrive(clamp01(speedNorm * 0.78 + p.drive + surgeRef.current * 0.3));
        engine.step(dt);
      }

      // ── cheap chrome labels (only when they change) ─────────────────────────
      if (phaseLabelRef.current) {
        const txt = `phase ${p.index + 1} · ${p.name}`;
        if (phaseLabelRef.current.textContent !== txt)
          phaseLabelRef.current.textContent = txt;
      }
      if (depthLabelRef.current) {
        const d = `${(depthRef.current / 1000).toFixed(1)} deep`;
        if (depthLabelRef.current.textContent !== d)
          depthLabelRef.current.textContent = d;
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyChar]);

  // ── pointer surrender + keyboard transcript listeners ────────────────────────
  useEffect(() => {
    const markInput = () => {
      lastInputRef.current = performance.now();
    };
    const onDown = (e: PointerEvent) => {
      // ignore presses that land on interactive chrome (buttons/links)
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-chrome]")) return;
      holdRef.current = true;
      markInput();
    };
    const onUp = () => {
      holdRef.current = false;
      markInput();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        // pull gently back up the tunnel
        travelRef.current = (travelRef.current - 90 + DEPTH) % DEPTH;
        depthRef.current = Math.max(0, depthRef.current - 60);
        const id = activeWordRef.current;
        if (id != null) {
          const arr = wordsRef.current;
          const idx = arr.findIndex((w) => w.id === id);
          if (idx !== -1) {
            const next = arr.slice();
            const cut = next[idx].text.slice(0, -1);
            if (cut.length === 0) {
              next.splice(idx, 1);
              activeWordRef.current = null;
            } else {
              next[idx] = { ...next[idx], text: cut };
            }
            wordsRef.current = next;
            setWords(next);
          }
        }
        markInput();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        surgeRef.current = 1; // a brighter surge (slew-limited into the field)
        activeWordRef.current = null;
        markInput();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        applyChar(" ");
        markInput();
        return;
      }
      if (e.key.length === 1) {
        applyChar(e.key.toLowerCase());
        markInput();
      }
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [applyChar]);

  // ── full teardown on unmount ─────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try {
        engineRef.current?.stop();
      } catch {
        /* closing */
      }
      try {
        masterRef.current?.disconnect();
      } catch {
        /* closing */
      }
      const ctx = ctxRef.current;
      engineRef.current = null;
      masterRef.current = null;
      ctxRef.current = null;
      if (ctx) void ctx.close();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* ── the CSS-3D tunnel (ART layer — raw hues allowed here only) ── */}
      <div
        ref={stageRef}
        className="absolute inset-0 touch-none select-none"
        style={{ perspective: "700px", perspectiveOrigin: "50% 50%" }}
        aria-hidden
      >
        <div
          ref={sceneRef}
          className="absolute left-1/2 top-1/2"
          style={{
            transformStyle: "preserve-3d",
            // @ts-expect-error — custom property consumed by the rings
            "--ring": "hsl(265 42% 30%)",
          }}
        >
          {/* far light disc */}
          <div
            ref={lightRef}
            className="absolute left-1/2 top-1/2"
            style={{
              width: "9vmin",
              height: "9vmin",
              transform: `translate(-50%,-50%) translateZ(${LIGHT_Z}px)`,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(230,224,255,0.7) 38%, rgba(139,92,246,0.25) 66%, rgba(139,92,246,0) 100%)",
              mixBlendMode: "screen",
              filter: "blur(8px)",
              opacity: 0.35,
            }}
          />

          {/* concentric rings */}
          {Array.from({ length: RING_COUNT }).map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                ringRefs.current[i] = el;
              }}
              className="absolute left-1/2 top-1/2"
              style={{
                width: "62vmin",
                height: "62vmin",
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, transparent 63%, var(--ring) 70%, transparent 76%)",
                mixBlendMode: "screen",
                filter: "blur(1.2px)",
                transform: `translate(-50%,-50%) translateZ(${-FAR_OFFSET}px)`,
                willChange: "transform, opacity",
              }}
            />
          ))}

          {/* pinned transcript words hanging in the tunnel */}
          {words.map((w) => (
            <span
              key={w.id}
              ref={(el) => {
                if (el) wordEls.current.set(w.id, el);
                else wordEls.current.delete(w.id);
              }}
              className="absolute left-1/2 top-1/2 whitespace-nowrap font-mono"
              style={{
                fontSize: "3.2vmin",
                letterSpacing: "0.04em",
                color: "rgba(237,233,254,0.95)",
                textShadow:
                  "0 0 10px rgba(167,139,250,0.85), 0 0 22px rgba(139,92,246,0.5)",
                mixBlendMode: "screen",
                transform: "translate(-50%,-50%)",
                pointerEvents: "none",
              }}
            >
              {w.text}
            </span>
          ))}
        </div>
      </div>

      {/* room-edge vignette (dissolution softening) — ART layer */}
      <div
        ref={vignetteRef}
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(4,2,10,0.4) 62%, rgba(2,1,6,0.96) 100%)",
          opacity: 0.6,
        }}
        aria-hidden
      />

      {/* full-field ganzfeld bloom — slow smootherstep drift, never a flash */}
      <div
        ref={bloomRef}
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,255,255,1) 0%, rgba(244,240,255,0.98) 55%, rgba(222,214,255,0.9) 100%)",
          opacity: 0,
        }}
        aria-hidden
      />

      {/* ── chrome (semantic tokens only) ── */}
      <div
        data-chrome
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="pointer-events-auto">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Thresholdway
            </h1>
            <p className="mt-1 max-w-md text-base text-muted-foreground">
              Press and hold anywhere to surrender. You fall toward the light —
              type to leave words hanging in the tunnel behind you.
            </p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={startAudio}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin sound
              </button>
            ) : (
              <button
                type="button"
                onClick={stopAudio}
                className="min-h-[44px] rounded-md border border-border bg-muted px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Mute
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-md border border-border bg-muted px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              {showNotes ? "Close" : "Notes"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span ref={phaseLabelRef}>phase 1 · dissolution</span>
          <span ref={depthLabelRef}>0.0 deep</span>
          {autoBadge && (
            <span className="text-muted-foreground/80">
              auto — press and hold to descend
            </span>
          )}
          {audioError && (
            <span className="text-destructive">{audioError}</span>
          )}
        </div>
      </div>

      {/* notes panel */}
      {showNotes && (
        <div
          data-chrome
          className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 max-h-[62vh] overflow-y-auto border-t border-border bg-popover/92 p-6 backdrop-blur-md sm:p-8"
        >
          <div className="mx-auto max-w-2xl space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              the passage
            </p>
            <p>
              A long-form near-death descent rendered in pure CSS 3D — 36
              concentric rings rushing an endless corridor toward a soft light.
              Hold anywhere to surrender: the descent accelerates and a
              Shepard–Risset falling glissando lifts beneath you. Release to
              drift.
            </p>
            <p>
              Typing pins a luminous word to the ring near you; it recedes into
              the dark behind you, a re-readable transcript hanging in the
              tunnel. Space starts a new cluster, Enter is a brighter surge,
              Backspace pulls you gently back up.
            </p>
            <p>
              The piece advances through five phases with accumulated depth —
              dissolution, the tunnel, approaching the light, the clear light
              (a slow ganzfeld bloom), and the boundless void — so minute five
              is genuinely not minute one. A seeded auto-performer descends on
              its own so a muted phone still sees the whole passage.
            </p>
            <p className="text-muted-foreground/80">
              Refs: James Turrell — Ganzfeld / As Seen Below (ARoS Aarhus, 2026);
              Shepard (1964) / Risset endless glissando; NDE tunnel
              phenomenology.
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10712-thresholdway"]} />
    </main>
  );
}
