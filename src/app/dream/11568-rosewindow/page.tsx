"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11568-rosewindow — "Rose Window".
//
// The one question: what if playing a keyboard drew a living cathedral
// rose-window — a radial mandala — where each note is a petal in the exact
// colour Olivier Messiaen SAW for it, and chords fuse into one blended
// illuminated rose?
//
// Layout: pitch-class = ANGLE (12 spokes, like the 12 stone lights of a
// Gothic rose window), octave = RADIUS RING (outer = low, inner = high).
// Renderer: pure CSS/DOM — conic + radial gradients, filter:blur, and
// mix-blend-mode: screen inside an isolation:isolate stage. ZERO canvas,
// ZERO WebGL/WebGPU, ZERO SVG paths (see rosewindow.module.css). A single
// requestAnimationFrame loop writes only a handful of CSS custom properties
// per changed petal — React never re-renders per frame.
//
// Colour: messiaen.ts — a 12-spoke jewel wheel drawn from Messiaen's own
// documented sound-colour vocabulary (blue-violet, orange-gold, green, ruby,
// amethyst, grey-gold, milky-white...), plus a real detector for his Mode 1
// (whole tone) and Mode 2 (octatonic) that biases the whole rose toward that
// mode's colour when three or more notes land inside it.
//
// Input: Web MIDI, on-screen touch (tap anywhere on the rose — the whole
// window is the hit-surface, not 48 sub-44px slivers), and a QWERTY
// fallback tuned to Messiaen's favourite octatonic scale. All three are live
// at once. A seeded self-playing chorale blooms ~200ms after mount so a
// muted phone sees the rose alive within a second; the first real tap or
// keypress takes over into play mode.
//
// Refs: Olivier Messiaen's chord→colour synaesthesia and his Modes of
// Limited Transposition ("Music and Color: Conversations with Claude
// Samuel"); the Gothic rose-window tradition (Chartres, Notre-Dame).
// README.md has the full design notes + honest limitations.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { RoseAudio } from "./audio";
import {
  PITCH_CLASS_COLOR,
  NOTE_NAMES,
  MESSIAEN_MODES,
  registerTint,
  velocityToBrightness,
  detectMode,
  mixHex,
} from "./messiaen";
import styles from "./rosewindow.module.css";

const RINGS = 4;
const PCS = 12;
const RING_RADIUS_VMIN = [32.5, 24, 16.5, 9.5]; // ring 0 = outer/low … ring 3 = inner/high
const RING_FRAC = [0.833, 0.615, 0.423, 0.244]; // same radii as a fraction of the half-container, for tap hit-testing
const DEFAULT_BOSS_COLOR = "#E8CE96";

const SEED = 11568; // this prototype's own route number, as the literal seed

/** mulberry32 — tiny, fast, well-distributed 32-bit seeded PRNG, INLINE and
 *  deterministic: no Math.random, no Date.now, no new Date anywhere below. */
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

interface Cell {
  id: number;
  pc: number;
  ring: number;
  ang: number;
  rad: number;
  c: string;
  hi: string;
  lo: string;
}

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  for (let ring = 0; ring < RINGS; ring++) {
    for (let pc = 0; pc < PCS; pc++) {
      const tint = registerTint(PITCH_CLASS_COLOR[pc].hex, ring);
      cells.push({
        id: ring * PCS + pc,
        pc,
        ring,
        ang: pc * 30,
        rad: RING_RADIUS_VMIN[ring],
        c: tint.base,
        hi: tint.hi,
        lo: tint.lo,
      });
    }
  }
  return cells;
}
const CELLS = buildCells();

function cellStyle(cell: Cell): CSSProperties {
  return {
    "--ang": `${cell.ang}deg`,
    "--rad": `${cell.rad}vmin`,
    "--c": cell.c,
    "--hi": cell.hi,
    "--lo": cell.lo,
  } as CSSProperties;
}

function petalToMidi(pc: number, ring: number): number {
  return (ring + 4) * 12 + pc; // ring0→octave3 … ring3→octave6
}
function midiToPc(midi: number): number {
  return ((midi % 12) + 12) % 12;
}
function midiToRing(midi: number): number {
  const octave = Math.floor(midi / 12) - 1;
  return Math.max(0, Math.min(RINGS - 1, octave - 3));
}
function fracToRing(frac: number): number | null {
  if (frac > 1.02) return null;
  if (frac > (RING_FRAC[0] + RING_FRAC[1]) / 2) return 0;
  if (frac > (RING_FRAC[1] + RING_FRAC[2]) / 2) return 1;
  if (frac > (RING_FRAC[2] + RING_FRAC[3]) / 2) return 2;
  if (frac > 0.14) return 3;
  return null; // the boss — no note, just the bright heart
}

// QWERTY fallback, tuned to Messiaen's favourite mode: Mode 2 T1 (octatonic).
const OCTATONIC_T1 = [0, 1, 3, 4, 6, 7, 9, 10];
const TOP_ROW = ["a", "s", "d", "f", "g", "h", "j", "k"]; // ring 2 (mid-high)
const BOTTOM_ROW = ["z", "x", "c", "v", "b", "n"]; // ring 1 (mid-low), same mode
const KEY_MAP: Record<string, { pc: number; ring: number }> = {};
TOP_ROW.forEach((k, i) => (KEY_MAP[k] = { pc: OCTATONIC_T1[i], ring: 2 }));
BOTTOM_ROW.forEach((k, i) => (KEY_MAP[k] = { pc: OCTATONIC_T1[i], ring: 1 }));

// Self-demo chord bank: Messiaen's documented modes, each carrying its own
// pitch-class palette — the seeded chorale wanders between them.
const DEMO_MODES = MESSIAEN_MODES.map((m) => ({ ...m, arr: Array.from(m.pcs) }));

type InputMode = "self-playing demo" | "MIDI keyboard" | "touch" | "computer keyboard";

interface PetalState {
  level: number;
  target: number;
  held: boolean;
}

export default function RoseWindowPage() {
  const [audioReady, setAudioReady] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("self-playing demo");
  const [modeLabel, setModeLabel] = useState<string | null>(null);
  const [heldCount, setHeldCount] = useState(0);
  const [heldNotesText, setHeldNotesText] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const roseWrapRef = useRef<HTMLDivElement | null>(null);
  const pointerLayerRef = useRef<HTMLDivElement | null>(null);
  const glowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const petalRefs = useRef<(HTMLDivElement | null)[]>([]);
  const washRef = useRef<HTMLDivElement | null>(null);
  const bossRef = useRef<HTMLDivElement | null>(null);

  const petalStateRef = useRef<PetalState[] | null>(null);
  if (!petalStateRef.current) {
    petalStateRef.current = CELLS.map(() => ({ level: 0, target: 0, held: false }));
  }
  const activeNotesRef = useRef<Map<number, { pc: number; ring: number }>>(new Map());
  const modeBiasRef = useRef<{ name: string; color: string } | null>(null);
  const bossAlphaRef = useRef(0.34);
  const lastBossColorRef = useRef(DEFAULT_BOSS_COLOR);
  const washAlphaRef = useRef(0);
  const lastWashColorRef = useRef("#7c8aa0");
  const reducedRef = useRef(false);

  const audioRef = useRef<RoseAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiInputsRef = useRef<MIDIInput[]>([]);
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const keyMidiRef = useRef<Map<string, number>>(new Map());
  const pointerMidiRef = useRef<Map<number, number>>(new Map());
  const lastUserInputRef = useRef(0);
  const rafRef = useRef(0);
  const selfDemoRef = useRef({
    active: true,
    rng: mulberry32(SEED),
    nextAt: 0,
    heldMidis: [] as number[],
  });

  // ── the two note primitives every input path funnels through ────────────
  const triggerNoteOn = useCallback((midi: number, velocity: number, mode: InputMode) => {
    const pc = midiToPc(midi);
    const ring = midiToRing(midi);
    const id = ring * PCS + pc;
    const st = petalStateRef.current![id];
    st.held = true;
    st.target = velocityToBrightness(velocity);
    activeNotesRef.current.set(midi, { pc, ring });
    audioRef.current?.noteOn(midi, velocity);
    const pcs = new Set<number>();
    for (const v of activeNotesRef.current.values()) pcs.add(v.pc);
    const bias = detectMode(pcs);
    modeBiasRef.current = bias;
    setModeLabel(bias ? bias.name : null);
    setInputMode(mode);
  }, []);

  const triggerNoteOff = useCallback((midi: number) => {
    const pc = midiToPc(midi);
    const ring = midiToRing(midi);
    const id = ring * PCS + pc;
    const st = petalStateRef.current![id];
    st.held = false;
    activeNotesRef.current.delete(midi);
    audioRef.current?.noteOff(midi);
    const pcs = new Set<number>();
    for (const v of activeNotesRef.current.values()) pcs.add(v.pc);
    const bias = detectMode(pcs);
    modeBiasRef.current = bias;
    setModeLabel(bias ? bias.name : null);
  }, []);

  const stopSelfDemo = useCallback(() => {
    const s = selfDemoRef.current;
    if (!s.active && s.heldMidis.length === 0) return;
    s.active = false;
    for (const midi of s.heldMidis) triggerNoteOff(midi);
    s.heldMidis = [];
  }, [triggerNoteOff]);

  const stepSelfDemo = useCallback(
    (now: number) => {
      const s = selfDemoRef.current;
      if (!s.active || now < s.nextAt) return;
      for (const midi of s.heldMidis) triggerNoteOff(midi);
      s.heldMidis = [];

      const mode = DEMO_MODES[Math.floor(s.rng() * DEMO_MODES.length)];
      const noteCount = 2 + Math.floor(s.rng() * 3); // 2..4 notes
      const chosen = new Set<number>();
      let guard = 0;
      while (chosen.size < noteCount && guard < 24) {
        guard++;
        chosen.add(mode.arr[Math.floor(s.rng() * mode.arr.length)]);
      }
      for (const pc of chosen) {
        const roll = s.rng();
        const ring = roll < 0.15 ? 0 : roll < 0.55 ? 1 : roll < 0.88 ? 2 : 3;
        const midi = petalToMidi(pc, ring);
        triggerNoteOn(midi, 0.4 + s.rng() * 0.42, "self-playing demo");
        s.heldMidis.push(midi);
      }
      const dur = reducedRef.current ? 2.6 + s.rng() * 1.6 : 1.5 + s.rng() * 1.3;
      s.nextAt = now + dur * 1000;
    },
    [triggerNoteOn, triggerNoteOff],
  );

  // ── audio unlock on first user gesture (button OR first tap on the rose) ─
  const unlockAudio = useCallback(async () => {
    if (audioRef.current) {
      if (ctxRef.current && ctxRef.current.state === "suspended") {
        try {
          await ctxRef.current.resume();
        } catch {
          /* ignore */
        }
      }
      setAudioReady(true);
      return;
    }
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) {
      setAudioReady(true); // degrade gracefully — the rose still lights up
      return;
    }
    const ctx = new Ctor();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* the gesture should cover this */
      }
    }
    try {
      audioRef.current = new RoseAudio(ctx);
    } catch {
      /* visuals still run without sound */
    }
    setAudioReady(true);
  }, []);

  // ── pointer / touch: the WHOLE rose is the hit-surface ──────────────────
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      void unlockAudio();
      const wrap = roseWrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const frac = Math.sqrt(dx * dx + dy * dy) / (rect.width / 2);
      const ring = fracToRing(frac);
      if (ring === null) return;
      let angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      if (angleDeg < 0) angleDeg += 360;
      const pc = Math.round(angleDeg / 30) % 12;
      stopSelfDemo();
      lastUserInputRef.current = performance.now();
      const velocity = e.pressure && e.pressure > 0 ? Math.min(1, 0.35 + e.pressure * 0.65) : 0.78;
      const midi = petalToMidi(pc, ring);
      pointerMidiRef.current.set(e.pointerId, midi);
      triggerNoteOn(midi, velocity, "touch");
    },
    [unlockAudio, stopSelfDemo, triggerNoteOn],
  );
  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const midi = pointerMidiRef.current.get(e.pointerId);
      if (midi !== undefined) {
        triggerNoteOff(midi);
        pointerMidiRef.current.delete(e.pointerId);
      }
    },
    [triggerNoteOff],
  );

  // ── computer keyboard fallback (Mode 2 T1 octatonic layout) ─────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      const map = KEY_MAP[key];
      if (!map || pressedKeysRef.current.has(key)) return;
      pressedKeysRef.current.add(key);
      void unlockAudio();
      stopSelfDemo();
      lastUserInputRef.current = performance.now();
      const midi = petalToMidi(map.pc, map.ring);
      keyMidiRef.current.set(key, midi);
      triggerNoteOn(midi, 0.72, "computer keyboard");
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!KEY_MAP[key]) return;
      pressedKeysRef.current.delete(key);
      const midi = keyMidiRef.current.get(key);
      if (midi !== undefined) {
        triggerNoteOff(midi);
        keyMidiRef.current.delete(key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [unlockAudio, stopSelfDemo, triggerNoteOn, triggerNoteOff]);

  // ── Web MIDI: try once on mount, hot-plug aware, never throws ───────────
  useEffect(() => {
    let cancelled = false;
    const attach = (access: MIDIAccess) => {
      const inputs: MIDIInput[] = [];
      access.inputs.forEach((input) => {
        input.onmidimessage = (ev: MIDIMessageEvent) => {
          const data = ev.data;
          if (!data || data.length < 3) return;
          const cmd = data[0] & 0xf0;
          const note = data[1];
          const vel = data[2];
          void unlockAudio();
          stopSelfDemo();
          lastUserInputRef.current = performance.now();
          if (cmd === 0x90 && vel > 0) triggerNoteOn(note, vel / 127, "MIDI keyboard");
          else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) triggerNoteOff(note);
        };
        inputs.push(input);
      });
      midiInputsRef.current = inputs;
    };
    if (typeof navigator !== "undefined" && navigator.requestMIDIAccess) {
      navigator
        .requestMIDIAccess()
        .then((access) => {
          if (cancelled) return;
          midiAccessRef.current = access;
          attach(access);
          access.onstatechange = () => attach(access);
        })
        .catch(() => {
          /* denied / unsupported — touch + keyboard still play */
        });
    }
    return () => {
      cancelled = true;
      for (const input of midiInputsRef.current) input.onmidimessage = null;
      midiInputsRef.current = [];
      if (midiAccessRef.current) midiAccessRef.current.onstatechange = null;
    };
  }, [unlockAudio, stopSelfDemo, triggerNoteOn, triggerNoteOff]);

  // ── reduced-motion (initial + live) ──────────────────────────────────────
  useEffect(() => {
    const reduced = prefersReducedMotion();
    reducedRef.current = reduced;
    setReducedMotion(reduced);
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      reducedRef.current = mq.matches;
      setReducedMotion(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // ── the render loop: self-demo scheduling + petal envelopes + boss/wash ──
  useEffect(() => {
    let last = performance.now();
    selfDemoRef.current.nextAt = last + 200; // bloom within ~1s on a muted phone

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;

      stepSelfDemo(now);

      // idle → the self-demo reclaims the rose after a long silent stretch
      if (!selfDemoRef.current.active && now - lastUserInputRef.current > 22000) {
        selfDemoRef.current.active = true;
        selfDemoRef.current.nextAt = now + 400;
      }

      const attackRate = reducedRef.current ? 4 : 7.5;
      const releaseTau = reducedRef.current ? 1.0 : 0.55; // ~1.4s felt release either way
      let activity = 0;
      const states = petalStateRef.current!;
      for (let i = 0; i < states.length; i++) {
        const st = states[i];
        if (st.held) {
          st.level += (st.target - st.level) * Math.min(1, dt * attackRate);
        } else if (st.level > 0.0008) {
          st.level += (0 - st.level) * Math.min(1, dt / releaseTau);
          if (st.level < 0.0008) st.level = 0;
        } else {
          continue;
        }
        const a = st.level.toFixed(3);
        glowRefs.current[i]?.style.setProperty("--a", a);
        petalRefs.current[i]?.style.setProperty("--a", a);
        activity += st.level;
      }

      const bias = modeBiasRef.current;
      const boss = bossRef.current;
      if (boss) {
        const targetBossA = 0.3 + Math.min(0.6, activity * 0.14);
        bossAlphaRef.current += (targetBossA - bossAlphaRef.current) * Math.min(1, dt * 3);
        boss.style.setProperty("--ba", bossAlphaRef.current.toFixed(3));
        const bossColor = bias ? bias.color : DEFAULT_BOSS_COLOR;
        if (bossColor !== lastBossColorRef.current) {
          boss.style.setProperty("--bc", bossColor);
          boss.style.setProperty("--bc-hi", mixHex(bossColor, "#ffffff", 0.5));
          lastBossColorRef.current = bossColor;
        }
      }
      const wash = washRef.current;
      if (wash) {
        const targetWashA = bias ? 0.3 : 0;
        washAlphaRef.current += (targetWashA - washAlphaRef.current) * Math.min(1, dt * 2);
        wash.style.setProperty("--mode-a", washAlphaRef.current.toFixed(3));
        if (bias && bias.color !== lastWashColorRef.current) {
          wash.style.setProperty("--mode-c", bias.color);
          lastWashColorRef.current = bias.color;
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [stepSelfDemo]);

  // ── a light, infrequent readout sync (held count + note names) ──────────
  useEffect(() => {
    const id = window.setInterval(() => {
      const notes = activeNotesRef.current;
      setHeldCount(notes.size);
      const names = Array.from(new Set(Array.from(notes.values()).map((v) => NOTE_NAMES[v.pc])));
      setHeldNotesText(names.join(" · "));
    }, 220);
    return () => window.clearInterval(id);
  }, []);

  // ── full teardown ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      // RoseAudio.stop() releases every still-held voice itself.
      audioRef.current?.stop();
      audioRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
      ctxRef.current = null;
      for (const input of midiInputsRef.current) input.onmidimessage = null;
      midiInputsRef.current = [];
      if (midiAccessRef.current) midiAccessRef.current.onstatechange = null;
    };
  }, []);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <div className={styles.stage}>
        <div ref={roseWrapRef} className={styles.roseWrap}>
          <div className={styles.frame} />
          <div className={styles.breather} data-reduced={reducedMotion ? "true" : undefined}>
            <div className={styles.rotator} data-reduced={reducedMotion ? "true" : undefined}>
              <div className={styles.tracery} />
            </div>
            <div ref={washRef} className={styles.modeWash} />
            <div ref={bossRef} className={styles.boss} data-reduced={reducedMotion ? "true" : undefined} />
            <div className={styles.glowLayer}>
              {CELLS.map((cell) => (
                <div
                  key={cell.id}
                  ref={(el) => {
                    glowRefs.current[cell.id] = el;
                  }}
                  className={styles.glow}
                  style={cellStyle(cell)}
                />
              ))}
            </div>
            <div className={styles.petalLayer}>
              {CELLS.map((cell) => (
                <div
                  key={cell.id}
                  ref={(el) => {
                    petalRefs.current[cell.id] = el;
                  }}
                  className={styles.petal}
                  style={cellStyle(cell)}
                />
              ))}
            </div>
          </div>
          <div
            ref={pointerLayerRef}
            className={styles.pointerLayer}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="img"
            aria-label="A rose-window mandala of 48 petals — tap anywhere to sound the pitch under your finger"
          />
        </div>
      </div>

      {/* header */}
      <div className="pointer-events-none fixed left-0 top-0 z-20 p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          rose window · Messiaen sound-colour
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Rose Window
        </h1>
        <p className="mt-1 max-w-sm text-base text-muted-foreground">
          Play it and a cathedral mandala of light blooms — one petal per note,
          in the colour Messiaen said he saw when he heard it.
        </p>
      </div>

      {/* input · mode caption */}
      <div className="pointer-events-none fixed right-5 top-5 z-20 max-w-[13rem] text-right sm:right-7 sm:top-7">
        <span className="rounded-full border border-border bg-background/70 px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
          input · {inputMode}
        </span>
        {modeLabel && (
          <p className="mt-2 font-mono text-xs text-muted-foreground">chord reads as {modeLabel}</p>
        )}
        {heldCount > 0 && (
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {heldCount} held · {heldNotesText}
          </p>
        )}
      </div>

      {/* intro overlay — dismisses once audio unlocks */}
      {!audioReady && (
        <div className="fixed inset-0 z-30 flex items-end justify-center p-6 pb-24 sm:items-center sm:pb-6">
          <div className="w-full max-w-md rounded-lg border border-border bg-background/80 p-6 text-center shadow-lg backdrop-blur-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              tap to open the window
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              The rose is already breathing and self-playing in silence. Tap
              Enter (or any petal) to unlock sound, then play it yourself —
              MIDI keyboard, touch, or the{" "}
              <span className="font-mono text-foreground">a s d f g h j k</span>{" "}
              /{" "}
              <span className="font-mono text-foreground">z x c v b n</span>{" "}
              rows.
            </p>
            <div className="mt-5 flex justify-center">
              <button
                onClick={() => void unlockAudio()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter · unlock sound
              </button>
            </div>
          </div>
        </div>
      )}

      {/* corner: design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-20 right-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground sm:bottom-7 sm:right-7"
      >
        Read the design notes
      </button>

      {reducedMotion && (
        <p className="pointer-events-none fixed bottom-20 left-5 z-20 font-mono text-xs text-muted-foreground sm:bottom-7 sm:left-7">
          reduced-motion honoured
        </p>
      )}

      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The layout.</span> Twelve
                spokes = the twelve pitch classes, like the twelve stone
                lights of a Gothic rose window. Four rings = four octave
                registers, outer (low) to inner (high). Tap anywhere on the
                rose — the whole window is the touch surface, not 48 tiny
                targets.
              </p>
              <p>
                <span className="text-foreground">The colour.</span> Olivier
                Messiaen described, across decades of interviews, seeing
                specific complex colours whenever he heard certain chords —
                blue-violet rocks for his favourite octatonic mode, gold and
                brown on milky white, orange and red with green. This rose
                extrapolates a 12-tone jewel wheel from that documented
                palette (messiaen.ts), and genuinely detects his Mode&nbsp;1
                (whole tone) and Mode&nbsp;2 (octatonic) when three or more
                held notes fit one, biasing the whole window toward that
                mode&rsquo;s real colour.
              </p>
              <p>
                <span className="text-foreground">The light.</span> No canvas,
                no WebGL — every glow is a layered radial/conic CSS gradient,
                blurred, composited with{" "}
                <span className="font-mono text-foreground">mix-blend-mode: screen</span>{" "}
                inside an{" "}
                <span className="font-mono text-foreground">isolation: isolate</span>{" "}
                stage, so adjacent lit petals genuinely add into new blended
                hues — a chord fuses into one illuminated arc of stained
                glass. One rAF loop rewrites a single custom property
                (<span className="font-mono text-foreground">--a</span>) per
                changed petal; React never re-renders per frame.
              </p>
              <p>
                <span className="text-foreground">The sound.</span> An
                additive detuned-sine organ/celeste voice (fundamental +
                celeste-detuned twin + a quiet octave partial) per held note,
                ringing through a synthesised cathedral convolution tail and
                the shared ear-safety limiter — never straight to the
                speakers.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> No flashing —
                every swell is hundreds of milliseconds, the only rotation is
                the decorative tracery at one turn per 3.5 minutes, and{" "}
                <span className="font-mono text-foreground">prefers-reduced-motion</span>{" "}
                slows it further and lengthens every fade.
              </p>
              <p>
                <span className="text-foreground">References.</span> Olivier
                Messiaen&rsquo;s chord→colour synaesthesia and his Modes of
                Limited Transposition (documented most fully in{" "}
                <em>Music and Color: Conversations with Claude Samuel</em>);
                the Gothic rose-window tradition of Chartres and Notre-Dame.
                Full honest limitations in README.md.
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

      <PrototypeNav slugs={["11568-rosewindow"]} />
    </main>
  );
}
