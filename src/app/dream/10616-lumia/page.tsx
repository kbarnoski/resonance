"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10616 · Lumia — play LIGHT ITSELF.
//
//   ONE QUESTION
//   What if a MIDI keyboard drove Thomas Wilfred's "Lumia" visual music — where
//   velocity, timing, and the SUSTAIN PEDAL are the composition, and sustained
//   notes FREEZE into standing "super-forms" that persist and slowly recompose,
//   so the screen accumulates a living stained-glass cathedral of your playing?
//
//   RENDERER  A pure CSS/DOM compositor. Every mark is a positioned <div> shaped
//   by radial/conic gradients + filter:blur + mix-blend-mode:screen (additive
//   light). No canvas, no WebGL, no SVG. The browser's compositor is the whole
//   renderer; the frame loop only writes CSS transforms / opacity / hue-rotate.
//
//   REFS  Thomas Wilfred, Clavilux / "Lumia" (1919) — light as an autonomous art
//   of form · colour · motion. Dave Payling, "Lumia factors" (form · colour ·
//   motion) as a framework for composing visual music.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { PrototypeNav } from "../_shared/prototype-nav";

// Seeded PRNG — the only source of randomness in this piece (no Math.random).
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Aurora-jewel / stained-glass palette, indexed by pitch-class ─────────────
// Each of the 12 pitch classes gets a fixed jewel hue so a chord reads as a
// cluster of stained-glass panes. Rich ambers, jades, magentas, violets, blues.
const PITCH_HUE = [45, 158, 276, 322, 212, 52, 190, 300, 232, 138, 340, 262];
const PITCH_SAT = [82, 70, 76, 80, 74, 84, 68, 78, 72, 66, 78, 74];

const A4 = 440;
const midiToFreq = (m: number) => A4 * Math.pow(2, (m - 69) / 12);

type FormKind = "blob" | "ring" | "ribbon";

interface Form {
  el: HTMLDivElement;
  active: boolean;
  frozen: boolean; // true → a persistent super-form
  decaying: boolean; // fading out (soft reset / recycle / transient release)
  born: number; // performance.now() at spawn
  life: number; // ms; Infinity for frozen
  x: number; // anchor, viewport %
  y: number;
  size: number; // px
  bright: number; // 0..1 peak opacity contribution
  driftX: number; // px amplitude
  driftY: number;
  driftPhX: number;
  driftPhY: number;
  driftRate: number; // rad/ms
  rot: number; // deg base
  rotRate: number; // deg/ms
  breathAmp: number; // scale +/-
  breathRate: number;
  breathPh: number;
  hueDrift: number; // deg, accumulates for frozen re-tint
  hueRate: number; // deg/ms
  blur: number;
  decayStart: number;
  decayLen: number;
  op: number; // last written opacity (to skip redundant writes)
}

interface Voice {
  oscs: OscillatorNode[];
  gain: GainNode;
  midi: number;
  sustained: boolean;
  startedAt: number;
}

type AutoOff = { midi: number; offAt: number };

const FREEZE_THRESHOLD = 0.35;
const MAX_SUPERFORMS = 150;
const TRANSIENT_POOL = 72;
const SUPER_POOL = MAX_SUPERFORMS + 12;

export default function LumiaPage() {
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [midiConnected, setMidiConnected] = useState(false);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [autoOn, setAutoOn] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [superCount, setSuperCount] = useState(0);
  const [pedalUi, setPedalUi] = useState(0);

  // DOM layers
  const stageRef = useRef<HTMLDivElement>(null);
  const transLayerRef = useRef<HTMLDivElement>(null);
  const superLayerRef = useRef<HTMLDivElement>(null);

  // Audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const voicesRef = useRef<Map<number, Voice>>(new Map());
  const heldKeysRef = useRef<Set<number>>(new Set());

  // Pedal — user (MIDI CC64) vs auto-performer; effective is the max.
  const midiPedalRef = useRef(0);
  const autoPedalRef = useRef(0);
  const pedalDepthRef = useRef(0);

  // MIDI
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const autoOnRef = useRef(true);

  // Form pools
  const transPoolRef = useRef<Form[]>([]);
  const superPoolRef = useRef<Form[]>([]);
  const superOrderRef = useRef<Form[]>([]); // freeze order, for oldest-recycle

  // Loop + auto-performer clock
  const rafRef = useRef(0);
  const rngRef = useRef<() => number>(makeRng(0x10616));
  const autoNextRef = useRef(0);
  const autoOffsRef = useRef<AutoOff[]>([]);
  const autoPedalUntilRef = useRef(0);
  const progNextRef = useRef(0);
  const progRootRef = useRef(0);
  const uiTickRef = useRef(0);

  // ── audio: additive/FM organ voice, 12-TET equal temperament ──────────────
  const startVoice = useCallback((midi: number, vel: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    // retrigger: release any existing voice on this key first
    const prev = voicesRef.current.get(midi);
    if (prev) hardStop(prev, ctx);

    const freq = midiToFreq(midi);
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);

    // additive organ partials (a few harmonics), gentle drawbar taper.
    const partials: Array<[number, number]> = [
      [1, 1.0],
      [2, 0.5],
      [3, 0.3],
      [4, 0.16],
      [6, 0.08],
    ];
    const oscs: OscillatorNode[] = [];
    for (const [h, g] of partials) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq * h, now);
      // slight FM shimmer via a tiny detune so the organ breathes, not buzzes.
      o.detune.setValueAtTime((h - 1) * 3, now);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(g, now);
      o.connect(pg);
      pg.connect(gain);
      o.start(now);
      oscs.push(o);
    }
    // soft attack, drop to a sustain plateau
    const peak = 0.09 * (0.35 + 0.65 * vel);
    gain.gain.linearRampToValueAtTime(peak, now + 0.06);
    gain.gain.setTargetAtTime(peak * 0.72, now + 0.06, 0.5);
    gain.connect(master.input);

    voicesRef.current.set(midi, {
      oscs,
      gain,
      midi,
      sustained: false,
      startedAt: performance.now(),
    });
  }, []);

  const releaseVoice = useCallback((midi: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const v = voicesRef.current.get(midi);
    if (!v) return;
    const now = ctx.currentTime;
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0.0001, now, 0.28);
    const stopAt = now + 1.4;
    for (const o of v.oscs) {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    voicesRef.current.delete(midi);
    window.setTimeout(() => {
      try {
        v.gain.disconnect();
      } catch {
        /* closing */
      }
    }, 1600);
  }, []);

  // ── light-forms ────────────────────────────────────────────────────────────
  const colorGradient = useCallback(
    (kind: FormKind, hue: number, sat: number, light: number) => {
      const c = (l: number, a: number) => `hsla(${hue},${sat}%,${l}%,${a})`;
      if (kind === "ring") {
        return `radial-gradient(circle at 50% 50%, transparent 0%, transparent 30%, ${c(
          light + 6,
          0.9,
        )} 46%, ${c(light, 0.4)} 60%, transparent 74%)`;
      }
      if (kind === "ribbon") {
        return `conic-gradient(from 0deg at 50% 50%, transparent 0deg, ${c(
          light + 8,
          0.85,
        )} 60deg, ${c(light, 0.3)} 130deg, transparent 200deg, transparent 300deg, ${c(
          light + 4,
          0.55,
        )} 350deg, transparent 360deg)`;
      }
      return `radial-gradient(circle at 50% 50%, ${c(light + 10, 0.95)} 0%, ${c(
        light,
        0.55,
      )} 34%, ${c(light - 6, 0.18)} 58%, transparent 74%)`;
    },
    [],
  );

  const configForm = useCallback(
    (f: Form, midi: number, vel: number, frozen: boolean) => {
      const rng = rngRef.current;
      const pc = ((midi % 12) + 12) % 12;
      const hue = PITCH_HUE[pc];
      const sat = PITCH_SAT[pc];
      // velocity → brightness + size
      const light = 52 + vel * 16;
      const kindRoll = rng();
      const kind: FormKind =
        kindRoll < 0.66 ? "blob" : kindRoll < 0.86 ? "ring" : "ribbon";
      // pitch → vertical position (high notes ride high), spread by seed
      const clamped = Math.max(36, Math.min(96, midi));
      const yBase = 88 - ((clamped - 36) / 60) * 74; // 88%..14%
      const y = Math.max(6, Math.min(94, yBase + (rng() - 0.5) * 14));
      // horizontal: seeded, nudged by pitch-class so chords fan out
      const x = Math.max(6, Math.min(94, 50 + (rng() - 0.5) * 82 + (pc - 5.5) * 1.5));
      const size = (frozen ? 150 : 190) * (0.55 + vel * 0.7) * (0.8 + rng() * 0.7);
      const bright = (frozen ? 0.26 : 0.42) * (0.45 + vel * 0.7);

      f.frozen = frozen;
      f.decaying = false;
      f.active = true;
      f.born = performance.now();
      f.life = frozen ? Infinity : 5200 + rng() * 3200;
      f.x = x;
      f.y = y;
      f.size = size;
      f.bright = bright;
      f.driftX = (frozen ? 26 : 40) * (0.5 + rng());
      f.driftY = (frozen ? 20 : 34) * (0.5 + rng());
      f.driftPhX = rng() * Math.PI * 2;
      f.driftPhY = rng() * Math.PI * 2;
      f.driftRate = (frozen ? 0.00007 : 0.00016) * (0.6 + rng() * 0.9);
      f.rot = rng() * 360;
      f.rotRate = (rng() - 0.5) * (frozen ? 0.0016 : 0.006);
      f.breathAmp = frozen ? 0.1 + rng() * 0.14 : 0.06 + rng() * 0.1;
      f.breathRate = (frozen ? 0.0006 : 0.0011) * (0.6 + rng() * 0.9);
      f.breathPh = rng() * Math.PI * 2;
      f.hueDrift = 0;
      f.hueRate = frozen ? (rng() - 0.5) * 0.0024 : 0;
      f.blur = (frozen ? 26 : 34) + rng() * 22;
      f.op = -1;

      const el = f.el;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      el.style.background = colorGradient(kind, hue, sat, light);
      el.style.borderRadius = kind === "ribbon" ? "44%" : "50%";
      el.style.filter = `blur(${f.blur}px)`;
      el.style.opacity = "0";
      el.style.display = "block";
    },
    [colorGradient],
  );

  const spawnTransient = useCallback(
    (midi: number, vel: number) => {
      const pool = transPoolRef.current;
      // find a free slot, else steal the oldest active
      let f = pool.find((p) => !p.active);
      if (!f) {
        f = pool.reduce((a, b) => (a.born <= b.born ? a : b));
      }
      configForm(f, midi, vel, false);
    },
    [configForm],
  );

  const spawnSuperform = useCallback(
    (midi: number, vel: number) => {
      const pool = superPoolRef.current;
      const f = pool.find((p) => !p.active);
      if (!f) return;
      configForm(f, midi, vel, true);
      const order = superOrderRef.current;
      order.push(f);
      // recycle oldest if we exceed the cathedral cap (guards vs. white-out)
      while (order.length > MAX_SUPERFORMS) {
        const old = order.shift();
        if (old && old.active && !old.decaying) {
          old.decaying = true;
          old.decayStart = performance.now();
          old.decayLen = 3400;
        }
      }
    },
    [configForm],
  );

  // ── event handlers (shared by MIDI + auto-performer) ──────────────────────
  const onNoteOn = useCallback(
    (midi: number, vel: number) => {
      heldKeysRef.current.add(midi);
      startVoice(midi, vel);
      spawnTransient(midi, vel);
      const depth = pedalDepthRef.current;
      if (depth > FREEZE_THRESHOLD) {
        // deeper pedal → more of the light freezes into standing super-forms
        if (rngRef.current() < 0.35 + depth * 0.6) spawnSuperform(midi, vel);
      }
    },
    [startVoice, spawnTransient, spawnSuperform],
  );

  const onNoteOff = useCallback(
    (midi: number) => {
      heldKeysRef.current.delete(midi);
      if (pedalDepthRef.current > FREEZE_THRESHOLD) {
        const v = voicesRef.current.get(midi);
        if (v) v.sustained = true; // held by the pedal, keeps ringing
      } else {
        releaseVoice(midi);
      }
    },
    [releaseVoice],
  );

  const onPedal = useCallback(
    (depth: number, fromAuto: boolean) => {
      if (fromAuto) autoPedalRef.current = depth;
      else midiPedalRef.current = depth;
      const eff = Math.max(midiPedalRef.current, autoPedalRef.current);
      const wasDown = pedalDepthRef.current > FREEZE_THRESHOLD;
      pedalDepthRef.current = eff;
      const nowDown = eff > FREEZE_THRESHOLD;
      // pedal lifted → let the sustained (physically-released) voices breathe out
      if (wasDown && !nowDown) {
        for (const [m, v] of voicesRef.current) {
          if (v.sustained && !heldKeysRef.current.has(m)) releaseVoice(m);
        }
      }
    },
    [releaseVoice],
  );

  // ── the "let go" soft reset — gently relax the whole cathedral ────────────
  const letGo = useCallback(() => {
    const now = performance.now();
    for (const f of superPoolRef.current) {
      if (f.active && !f.decaying) {
        f.decaying = true;
        f.decayStart = now;
        f.decayLen = 2600 + rngRef.current() * 1400;
      }
    }
    superOrderRef.current = [];
  }, []);

  // ── auto-performer — seeded, musical, ALWAYS runs on Start ────────────────
  // A slow modal phrase over a drifting root, with occasional held pedal so the
  // stained-glass field accumulates on its own (a muted phone still sees it).
  const MODE = [0, 2, 3, 5, 7, 9, 10]; // dorian degrees (12-TET; not a ratio lattice)
  const PROG = [0, 5, 3, -2, 7]; // root offsets, semitones

  const stepAuto = useCallback(
    (now: number) => {
      const rng = rngRef.current;
      // advance the slow root progression (~18s) for long-form evolution
      if (now >= progNextRef.current) {
        progRootRef.current =
          50 + PROG[Math.floor(rng() * PROG.length) % PROG.length];
        progNextRef.current = now + 15000 + rng() * 8000;
        // occasionally lean on the pedal for a while → a freeze wave
        if (rng() < 0.7) {
          autoPedalUntilRef.current = now + 5000 + rng() * 9000;
        }
      }
      // pedal envelope from the auto-performer
      const pedalActive = now < autoPedalUntilRef.current;
      const target = pedalActive ? 0.7 + rng() * 0.3 : 0;
      if (Math.abs(target - autoPedalRef.current) > 0.02) {
        onPedal(target, true);
      }

      // fire the scheduled note-offs
      const offs = autoOffsRef.current;
      for (let i = offs.length - 1; i >= 0; i--) {
        if (now >= offs[i].offAt) {
          onNoteOff(offs[i].midi);
          offs.splice(i, 1);
        }
      }

      if (now < autoNextRef.current) return;

      const root = progRootRef.current;
      const chordRoll = rng();
      const voices = chordRoll < 0.42 ? (rng() < 0.5 ? 3 : 2) : 1;
      const dur = 600 + rng() * 1400;
      const used = new Set<number>();
      for (let n = 0; n < voices; n++) {
        const deg = MODE[Math.floor(rng() * MODE.length)];
        const oct = 12 * (rng() < 0.28 ? 1 : 0) - (rng() < 0.2 ? 12 : 0);
        const midi = root + deg + oct;
        if (used.has(midi)) continue;
        used.add(midi);
        const vel = 0.4 + rng() * 0.55;
        onNoteOn(midi, vel);
        autoOffsRef.current.push({ midi, offAt: now + dur * (0.7 + rng() * 0.6) });
      }
      // slow, meditative cadence
      autoNextRef.current = now + 620 + rng() * 1100;
    },
    [onNoteOn, onNoteOff, onPedal],
  );

  // ── the render loop — the ONLY per-frame CSS writer ───────────────────────
  const frame = useCallback(() => {
    const now = performance.now();
    if (autoOnRef.current) stepAuto(now);

    const drawForm = (f: Form) => {
      if (!f.active) return;
      const age = now - f.born;

      // opacity envelope
      let env: number;
      if (f.frozen) {
        // fade-in, then hold; gentle global dim as the field fills so it never
        // saturates to white.
        const fadeIn = Math.min(1, age / 900);
        const fill = superOrderRef.current.length;
        const dim = 1 - Math.min(0.45, fill / (MAX_SUPERFORMS * 2.2));
        env = f.bright * fadeIn * dim;
      } else {
        const inA = Math.min(1, age / 380);
        const outA = 1 - Math.min(1, Math.max(0, (age - f.life * 0.35) / (f.life * 0.65)));
        env = f.bright * inA * outA;
        if (age >= f.life) {
          f.active = false;
          f.el.style.opacity = "0";
          f.el.style.display = "none";
          return;
        }
      }

      // soft-reset / recycle decay overrides
      if (f.decaying) {
        const d = 1 - Math.min(1, (now - f.decayStart) / f.decayLen);
        env *= d;
        if (d <= 0.001) {
          f.active = false;
          f.decaying = false;
          f.el.style.opacity = "0";
          f.el.style.display = "none";
          return;
        }
      }

      // motion: slow drift (lissajous), rotation, breathing scale
      const dx = Math.sin(f.driftPhX + now * f.driftRate) * f.driftX;
      const dy = Math.cos(f.driftPhY + now * f.driftRate * 0.83) * f.driftY;
      const scale = 1 + Math.sin(f.breathPh + now * f.breathRate) * f.breathAmp;
      const rot = f.rot + now * f.rotRate;
      f.el.style.transform = `translate(-50%,-50%) translate3d(${dx.toFixed(
        1,
      )}px,${dy.toFixed(1)}px,0) rotate(${rot.toFixed(1)}deg) scale(${scale.toFixed(3)})`;

      const op = env < 0.001 ? 0 : Math.min(0.92, env);
      if (Math.abs(op - f.op) > 0.004) {
        f.el.style.opacity = op.toFixed(3);
        f.op = op;
      }

      // frozen forms slowly re-tint (recompose) via a cheap hue-rotate write
      if (f.frozen && f.hueRate !== 0) {
        const hd = Math.sin(now * f.hueRate) * 34;
        if (Math.abs(hd - f.hueDrift) > 0.5) {
          f.hueDrift = hd;
          f.el.style.filter = `blur(${f.blur}px) hue-rotate(${hd.toFixed(0)}deg)`;
        }
      }
    };

    for (const f of transPoolRef.current) drawForm(f);
    for (const f of superPoolRef.current) drawForm(f);

    // throttled HUD sync (~5 Hz) — no per-frame React churn
    if (now - uiTickRef.current > 200) {
      uiTickRef.current = now;
      setSuperCount(superOrderRef.current.length);
      setPedalUi(pedalDepthRef.current);
    }

    rafRef.current = requestAnimationFrame(frame);
  }, [stepAuto]);

  // ── MIDI wiring ───────────────────────────────────────────────────────────
  const setupMidi = useCallback(() => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (typeof nav.requestMIDIAccess !== "function") {
      setMidiError(null); // not an error — just unsupported; auto-performer covers it
      return;
    }
    nav
      .requestMIDIAccess()
      .then((access) => {
        midiAccessRef.current = access;
        const wire = () => {
          let any = false;
          access.inputs.forEach((input) => {
            any = true;
            input.onmidimessage = (e: MIDIMessageEvent) => {
              const d = e.data;
              if (!d || d.length < 2) return;
              const status = d[0] & 0xf0;
              if (status === 0x90 && d[2] > 0) onNoteOn(d[1], d[2] / 127);
              else if (status === 0x80 || (status === 0x90 && d[2] === 0))
                onNoteOff(d[1]);
              else if (status === 0xb0 && d[1] === 64) onPedal(d[2] / 127, false);
            };
          });
          setMidiConnected(any);
        };
        wire();
        access.onstatechange = () => wire();
      })
      .catch(() => {
        setMidiError("MIDI access denied — playing the auto-performer instead.");
      });
  }, [onNoteOn, onNoteOff, onPedal]);

  // ── start ─────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (phase === "running") return;
    // build the DOM form pools once
    const buildPool = (host: HTMLDivElement, n: number, arr: Form[]) => {
      for (let i = 0; i < n; i++) {
        const el = document.createElement("div");
        el.style.position = "absolute";
        el.style.mixBlendMode = "screen";
        el.style.willChange = "transform, opacity";
        el.style.pointerEvents = "none";
        el.style.display = "none";
        el.style.opacity = "0";
        host.appendChild(el);
        arr.push({
          el,
          active: false,
          frozen: false,
          decaying: false,
          born: 0,
          life: 0,
          x: 50,
          y: 50,
          size: 100,
          bright: 0,
          driftX: 0,
          driftY: 0,
          driftPhX: 0,
          driftPhY: 0,
          driftRate: 0,
          rot: 0,
          rotRate: 0,
          breathAmp: 0,
          breathRate: 0,
          breathPh: 0,
          hueDrift: 0,
          hueRate: 0,
          blur: 30,
          decayStart: 0,
          decayLen: 0,
          op: -1,
        });
      }
    };
    if (transPoolRef.current.length === 0 && transLayerRef.current)
      buildPool(transLayerRef.current, TRANSIENT_POOL, transPoolRef.current);
    if (superPoolRef.current.length === 0 && superLayerRef.current)
      buildPool(superLayerRef.current, SUPER_POOL, superPoolRef.current);

    // audio — created inside the user gesture (autoplay policy)
    let ctx: AudioContext;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
    } catch {
      setMidiError("Audio is unavailable in this browser.");
      return;
    }
    if (ctx.state === "suspended") await ctx.resume();
    ctxRef.current = ctx;
    masterRef.current = createSafeMaster(ctx);

    // reduced motion → calmer clock
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const t = performance.now();
    autoNextRef.current = t + 300;
    progNextRef.current = t + 200;
    progRootRef.current = 50;
    autoPedalUntilRef.current = reduced ? 0 : t + 4000;

    setupMidi();
    setPhase("running");
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, frame, setupMidi]);

  // ── teardown ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      const access = midiAccessRef.current;
      if (access) {
        access.inputs.forEach((i) => (i.onmidimessage = null));
        access.onstatechange = null;
        midiAccessRef.current = null;
      }
      for (const v of voicesRef.current.values()) {
        try {
          for (const o of v.oscs) o.stop();
          v.gain.disconnect();
        } catch {
          /* closing */
        }
      }
      voicesRef.current.clear();
      if (masterRef.current) {
        masterRef.current.disconnect();
        masterRef.current = null;
      }
      const c = ctxRef.current;
      ctxRef.current = null;
      if (c && c.state !== "closed") {
        window.setTimeout(() => c.close().catch(() => {}), 400);
      }
    };
  }, []);

  useEffect(() => {
    autoOnRef.current = autoOn;
  }, [autoOn]);

  const modeBadge = midiConnected
    ? "MIDI keyboard connected"
    : "no device — auto-performer";

  return (
    <main className="relative h-dvh w-full overflow-hidden" style={{ backgroundColor: "#0d0b16" }}>
      {/* ── the Lumia stage: pure CSS/DOM compositor ── */}
      <div ref={stageRef} className="absolute inset-0" aria-hidden>
        {/* soft ground vignette so the light reads on the violet-slate dark */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 42%, rgba(40,32,74,0.55) 0%, rgba(13,11,22,0.0) 55%), radial-gradient(100% 100% at 50% 120%, rgba(24,20,46,0.6) 0%, rgba(13,11,22,0) 60%)",
          }}
        />
        <div ref={superLayerRef} className="absolute inset-0" />
        <div ref={transLayerRef} className="absolute inset-0" />
      </div>

      {/* ── HUD ── */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        <header className="pointer-events-auto max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Lumia
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Play light itself. Notes bloom into Wilfred&apos;s visual music; the
            sustain pedal freezes them into a standing stained-glass cathedral.
          </p>
          <p className="mt-2 text-sm">
            <span
              className={midiError ? "text-destructive" : "text-muted-foreground"}
            >
              {midiError ?? modeBadge}
            </span>
          </p>
        </header>

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          {phase === "idle" ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start — play light
            </button>
          ) : (
            <>
              <button
                onClick={letGo}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Let go — soften the field
              </button>
              <button
                onClick={() => setAutoOn((v) => !v)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {autoOn ? "Auto-performer: on" : "Auto-performer: off"}
              </button>
              <span className="text-sm text-muted-foreground tabular-nums">
                super-forms {superCount} · pedal {(pedalUi * 100) | 0}%
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── design notes affordance ── */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-5 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              About this piece
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                In 1919 Thomas Wilfred built the <em>Clavilux</em> and named a new
                art — <em>Lumia</em>: light composed as autonomously as music,
                through his three factors of <em>form</em>, <em>colour</em> and{" "}
                <em>motion</em> (later framed by Dave Payling as the &ldquo;Lumia
                factors&rdquo;). Here a keyboard drives that light.
              </p>
              <p>
                Every mark is a plain <code>&lt;div&gt;</code> painted with CSS
                gradients, blurred, and blended in <em>screen</em> mode so
                overlapping notes add up like stained glass. No canvas, no WebGL —
                the browser&apos;s compositor is the whole renderer.
              </p>
              <p>
                Velocity sets brightness and size; pitch sets hue (a jewel per
                pitch-class) and height. Hold the <strong>sustain pedal</strong>{" "}
                and notes <strong>freeze</strong> into standing super-forms that
                don&apos;t fade — they accumulate and slowly recompose, so minute
                five looks nothing like minute one. &ldquo;Let go&rdquo; softens
                the whole field back toward dark.
              </p>
              <p>
                No MIDI device? A seeded auto-performer plays a slow modal phrase
                and works the pedal on its own, so the cathedral still builds — even
                on a muted phone. Tones are plain 12-tone equal temperament.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10616-lumia"]} />
    </main>
  );
}

// stop a voice immediately (used on retrigger of the same key)
function hardStop(v: Voice, ctx: AudioContext) {
  const now = ctx.currentTime;
  try {
    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setTargetAtTime(0.0001, now, 0.02);
    for (const o of v.oscs) o.stop(now + 0.1);
    window.setTimeout(() => {
      try {
        v.gain.disconnect();
      } catch {
        /* closing */
      }
    }, 200);
  } catch {
    /* already gone */
  }
}
