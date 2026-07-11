"use client";

// ════════════════════════════════════════════════════════════════════════════
// SHADOW (1218) — "the machine harmonizes you a beat behind"
//
// THE ONE QUESTION: What if Resonance could HARMONIZE you in real time — you
// play a single-note melody, and a "shadow" partner voices it into full four-part
// close-harmony a beat behind you, choosing the harmony by minimizing voice
// motion (real voice-leading), so a one-finger line blooms into a moving choir of
// chords under your hand?
//
// You play soprano (jade). For every note a rule-based harmonizer (harmony.ts)
// picks the best-fitting diatonic/borrowed chord and voices it in SATB with the
// smallest possible inner-voice motion; those A/T/B voices (rose) sound a musical
// shadow-delay later. The Canvas2D "voice-leading ribbon" shows all four voices
// gliding, so you SEE the inner voices move. Input: on-screen keyboard + QWERTY +
// Web MIDI (degrades gracefully). No mic — fully deterministic, demos perfectly.
//
// Lineage: Bach chorale voice-leading · Fux species counterpoint · Tymoczko,
// A Geometry of Music · Chris Wilson "A Tale of Two Clocks" (scheduler) ·
// Chowning FM synthesis. SAFETY: no strobe; scroll is a slow continuous drift
// well under 3 Hz; note-flashes are smooth exponential ramps; respects
// prefers-reduced-motion; audio gesture-gated with a master ramp-from-0 + limiter.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  harmonize,
  noteName,
  KEY_NAMES,
  type HarmonyResult,
  type Mode,
  type Style,
} from "./harmony";
import { ShadowEngine, LookaheadScheduler, type ScheduledNote } from "./engine";

// ─── Musical / visual constants ───────────────────────────────────────────────
const BPM = 88;
const SECONDS_PER_BEAT = 60 / BPM;
const LO_MIDI = 38; // bottom of the ribbon pitch window
const HI_MIDI = 86; // top of the ribbon pitch window
const KB_LO = 60; // on-screen keyboard: C4
const KB_HI = 84; // …to C6
const PAST_SEC = 5.5; // ribbon history shown left of the playhead
const FUTURE_SEC = 1.35; // and a little of the not-yet-sounded shadow to the right
const GLOW_TAU = 0.55; // key-flash decay (s)

// QWERTY → MIDI (Ableton-style single row), C4..E5.
const KEYMAP: Record<string, number> = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67,
  y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74, p: 75, ";": 76,
};

const BLACK_PCS = [1, 3, 6, 8, 10];
const isBlack = (midi: number) => BLACK_PCS.includes(((midi % 12) + 12) % 12);

type Phase = "idle" | "running" | "paused";
type Pt = { t: number; midi: number };

interface KeyRect {
  midi: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface KbLayout {
  whites: KeyRect[];
  blacks: KeyRect[];
  kbTop: number;
  kbH: number;
  ww: number;
}

interface ChordInfo {
  symbol: string;
  roman: string;
  notes: string[]; // S A T B note names
  nonChord: boolean;
}

// ─── Web MIDI (loose types so the build never depends on lib.dom WebMIDI) ─────
type MidiMsg = { data: Uint8Array | number[] };
interface MidiInputLike {
  onmidimessage: ((e: MidiMsg) => void) | null;
}
interface MidiAccessLike {
  inputs: { values(): IterableIterator<MidiInputLike> };
}

// ─── Scripted demo melody (diatonic, transposed into the current key/mode) ────
function buildDemo(keyRoot: number, mode: Mode): ScheduledNote[] {
  const scale = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  let rootMidi = 60 + keyRoot;
  if (rootMidi > 71) rootMidi -= 12;
  // [scaleDegree, octaveOffset, durationBeats]
  const line: Array<[number, number, number]> = [
    [0, 0, 1], [2, 0, 1], [4, 0, 1], [2, 0, 1],
    [3, 0, 1], [1, 0, 1], [4, 0, 2],
    [5, 0, 1], [4, 0, 1], [3, 0, 1], [2, 0, 1],
    [6, -1, 1], [0, 0, 1], [4, 0, 1], [2, 0, 1],
    [3, 0, 1], [1, 0, 1], [0, 0, 3],
  ];
  const notes: ScheduledNote[] = [];
  let beat = 0;
  for (const [deg, oct, dur] of line) {
    notes.push({ beat, midi: rootMidi + scale[deg] + 12 * oct, dur });
    beat += dur;
  }
  return notes;
}

function makeKeyboardLayout(cssW: number, cssH: number): KbLayout {
  const kbH = Math.max(120, Math.min(168, cssH * 0.24));
  const kbTop = cssH - kbH;
  const whitesMidi: number[] = [];
  for (let m = KB_LO; m <= KB_HI; m++) if (!isBlack(m)) whitesMidi.push(m);
  const n = whitesMidi.length;
  const ww = cssW / n;

  const whites: KeyRect[] = whitesMidi.map((midi, i) => ({
    midi, x: i * ww, y: kbTop, w: ww, h: kbH,
  }));

  const blacks: KeyRect[] = [];
  const bw = ww * 0.62;
  const bh = kbH * 0.6;
  for (let m = KB_LO; m <= KB_HI; m++) {
    if (!isBlack(m)) continue;
    let wi = 0;
    for (let k = KB_LO; k < m; k++) if (!isBlack(k)) wi++;
    blacks.push({ midi: m, x: wi * ww - bw / 2, y: kbTop, w: bw, h: bh });
  }
  return { whites, blacks, kbTop, kbH, ww };
}

export default function ShadowPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [keyRoot, setKeyRoot] = useState(0); // C
  const [mode, setMode] = useState<Mode>("major");
  const [style, setStyle] = useState<Style>("chorale");
  const [shadowBeats, setShadowBeats] = useState(0.5); // eighth-note shadow delay
  const [arp, setArp] = useState(false);
  const [demoPlaying, setDemoPlaying] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [midiNote, setMidiNote] = useState<string>("no MIDI device");
  const [chordInfo, setChordInfo] = useState<ChordInfo | null>(null);

  // audio + engine
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<ShadowEngine | null>(null);
  const schedulerRef = useRef<LookaheadScheduler | null>(null);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);

  // harmony state
  const prevHarmRef = useRef<HarmonyResult | null>(null);
  const chordPcsRef = useRef<Set<number>>(new Set());

  // live-parameter mirrors (so audio callbacks read fresh values)
  const keyRootRef = useRef(keyRoot);
  const modeRef = useRef(mode);
  const styleRef = useRef(style);
  const shadowBeatsRef = useRef(shadowBeats);
  const arpRef = useRef(arp);

  // ribbon point buffers (per voice)
  const sPtsRef = useRef<Pt[]>([]);
  const aPtsRef = useRef<Pt[]>([]);
  const tPtsRef = useRef<Pt[]>([]);
  const bPtsRef = useRef<Pt[]>([]);

  // keyboard glow + layout + misc timing
  const glowRef = useRef<Map<number, number>>(new Map());
  const kbLayoutRef = useRef<KbLayout | null>(null);
  const rafRef = useRef(0);
  const driftRef = useRef(0);
  const lastPerfRef = useRef(0);
  const timeoutsRef = useRef<number[]>([]);
  const heldKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => { keyRootRef.current = keyRoot; }, [keyRoot]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { styleRef.current = style; }, [style]);
  useEffect(() => { shadowBeatsRef.current = shadowBeats; }, [shadowBeats]);
  useEffect(() => { arpRef.current = arp; }, [arp]);

  // ── the visual clock: audio time while running, else a monotonic fallback ──
  const timeNow = useCallback(() => {
    const eng = engineRef.current;
    if (eng && runningRef.current) return eng.now();
    return performance.now() / 1000;
  }, []);

  const pushPt = (ref: React.MutableRefObject<Pt[]>, t: number, midi: number) => {
    ref.current.push({ t, midi });
    if (ref.current.length > 512) ref.current.shift();
  };

  const scheduleGlow = useCallback((midi: number, whenAudio: number) => {
    const eng = engineRef.current;
    if (!eng) return;
    const delay = Math.max(0, (whenAudio - eng.now()) * 1000);
    if (delay < 8) {
      glowRef.current.set(midi, performance.now());
    } else {
      const to = window.setTimeout(
        () => glowRef.current.set(midi, performance.now()),
        delay,
      );
      timeoutsRef.current.push(to);
    }
  }, []);

  // ── commit one melody note: harmonize + strike + ribbon + glow ──
  const commitNote = useCallback(
    (midi: number, whenS: number, vel: number) => {
      const eng = engineRef.current;
      if (!eng) return;

      const res = harmonize(
        midi,
        keyRootRef.current,
        modeRef.current,
        styleRef.current,
        prevHarmRef.current,
      );
      prevHarmRef.current = res;

      const shadow = shadowBeatsRef.current * SECONDS_PER_BEAT;
      const spread = arpRef.current ? SECONDS_PER_BEAT * 0.13 : 0;
      const wInner = whenS + shadow;

      // soprano now; the harmonized inner voices bloom a shadow-delay later
      eng.strike("s", midi, whenS, vel);
      eng.strike("b", res.voicing.b, wInner, vel * 0.95);
      eng.strike("t", res.voicing.t, wInner + spread, vel * 0.9);
      eng.strike("a", res.voicing.a, wInner + 2 * spread, vel * 0.9);

      pushPt(sPtsRef, whenS, midi);
      pushPt(bPtsRef, wInner, res.voicing.b);
      pushPt(tPtsRef, wInner + spread, res.voicing.t);
      pushPt(aPtsRef, wInner + 2 * spread, res.voicing.a);

      scheduleGlow(midi, whenS);

      // update the chord readout + keyboard tint exactly when the shadow sounds
      const delay = Math.max(0, (wInner - eng.now()) * 1000);
      const applyReadout = () => {
        chordPcsRef.current = new Set(res.chord.pcs);
        setChordInfo({
          symbol: res.chord.symbol,
          roman: res.chord.roman,
          nonChord: res.nonChordSoprano,
          notes: [
            noteName(res.voicing.s),
            noteName(res.voicing.a),
            noteName(res.voicing.t),
            noteName(res.voicing.b),
          ],
        });
      };
      if (delay < 8) applyReadout();
      else timeoutsRef.current.push(window.setTimeout(applyReadout, delay));
    },
    [scheduleGlow],
  );

  const playLive = useCallback(
    (midi: number, vel = 0.85) => {
      const eng = engineRef.current;
      if (!eng || !runningRef.current) return;
      commitNote(midi, eng.now() + 0.006, vel);
    },
    [commitNote],
  );

  // ── audio bring-up (gesture-gated) ──
  const beginAudio = useCallback(async (): Promise<boolean> => {
    if (runningRef.current) return true;
    setAudioError(null);
    const AC =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!AC) {
      setAudioError("Web Audio is unavailable in this browser — no sound.");
      return false;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not start audio. Tap Begin again.");
      return false;
    }
    ctxRef.current = ctx;
    const eng = new ShadowEngine(ctx);
    eng.start();
    engineRef.current = eng;
    runningRef.current = true;
    prevHarmRef.current = null;
    setPhase("running");

    // opportunistic Web MIDI (loose cast so we never bind lib.dom's WebMIDI types)
    const reqMidi = (
      navigator as unknown as {
        requestMIDIAccess?: (opts?: unknown) => Promise<MidiAccessLike>;
      }
    ).requestMIDIAccess;
    if (reqMidi) {
      reqMidi
        .call(navigator)
        .then((access: MidiAccessLike) => {
          let count = 0;
          for (const input of access.inputs.values()) {
            count++;
            input.onmidimessage = (e: MidiMsg) => {
              const d = e.data;
              const status = d[0] & 0xf0;
              if (status === 0x90 && d[2] > 0) {
                setMidiNote(`MIDI: ${noteName(d[1])}`);
                playLive(d[1], d[2] / 127);
              }
            };
          }
          setMidiNote(count > 0 ? `${count} MIDI device(s) connected` : "no MIDI device");
        })
        .catch(() => setMidiNote("Web MIDI blocked — keyboard still works"));
    } else {
      setMidiNote("no Web MIDI — keyboard/mouse only");
    }
    return true;
  }, [playLive]);

  const clearTimeouts = useCallback(() => {
    for (const to of timeoutsRef.current) clearTimeout(to);
    timeoutsRef.current = [];
  }, []);

  const teardownAudio = useCallback(() => {
    runningRef.current = false;
    schedulerRef.current?.stop();
    schedulerRef.current = null;
    clearTimeouts();
    engineRef.current?.dispose();
    engineRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) ctx.close().catch(() => {});
  }, [clearTimeouts]);

  const handleBegin = useCallback(async () => {
    await beginAudio();
  }, [beginAudio]);

  const handleDemo = useCallback(async () => {
    if (!runningRef.current) {
      const ok = await beginAudio();
      if (!ok) return;
    }
    const ctx = ctxRef.current;
    const eng = engineRef.current;
    if (!ctx || !eng) return;
    schedulerRef.current?.stop();
    prevHarmRef.current = null;
    const notes = buildDemo(keyRootRef.current, modeRef.current);
    setDemoPlaying(true);
    const sched = new LookaheadScheduler(
      ctx,
      notes,
      BPM,
      (n, when) => commitNote(n.midi, when, 0.82),
      () => setDemoPlaying(false),
    );
    schedulerRef.current = sched;
    sched.start();
  }, [beginAudio, commitNote]);

  const handleStopDemo = useCallback(() => {
    schedulerRef.current?.stop();
    schedulerRef.current = null;
    setDemoPlaying(false);
  }, []);

  const handlePause = useCallback(() => {
    if (!runningRef.current) return;
    schedulerRef.current?.stop();
    schedulerRef.current = null;
    setDemoPlaying(false);
    runningRef.current = false;
    engineRef.current?.silence();
    setPhase("paused");
  }, []);

  const handleResume = useCallback(() => {
    if (phase !== "paused" || !engineRef.current) return;
    engineRef.current.unsilence();
    runningRef.current = true;
    setPhase("running");
  }, [phase]);

  const handleStop = useCallback(() => {
    teardownAudio();
    sPtsRef.current = [];
    aPtsRef.current = [];
    tPtsRef.current = [];
    bPtsRef.current = [];
    glowRef.current.clear();
    chordPcsRef.current = new Set();
    setChordInfo(null);
    setDemoPlaying(false);
    setPhase("idle");
  }, [teardownAudio]);

  // ── QWERTY input ──
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const midi = KEYMAP[k];
      if (midi === undefined) return;
      if (heldKeysRef.current.has(k)) return; // no auto-repeat
      heldKeysRef.current.add(k);
      e.preventDefault();
      playLive(midi);
    };
    const onUp = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [playLive]);

  // ── canvas pointer: strike the on-screen keyboard ──
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const canvas = canvasRef.current;
      const layout = kbLayoutRef.current;
      if (!canvas || !layout) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (y < layout.kbTop) return; // ribbon area — not a key
      // black keys sit on top
      for (const b of layout.blacks) {
        if (x >= b.x && x <= b.x + b.w && y <= b.y + b.h) {
          playLive(b.midi);
          return;
        }
      }
      const i = Math.max(0, Math.min(layout.whites.length - 1, Math.floor(x / layout.ww)));
      playLive(layout.whites[i].midi);
    },
    [playLive],
  );

  // ── render one frame ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    const pw = Math.floor(cssW * dpr);
    const ph = Math.floor(cssH * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const layout = makeKeyboardLayout(cssW, cssH);
    kbLayoutRef.current = layout;

    const now = timeNow();
    const ribTop = 96;
    const ribBottom = layout.kbTop;
    const window0 = PAST_SEC + FUTURE_SEC;
    const playheadX = cssW * (PAST_SEC / window0);
    const pps = cssW / window0;
    const xFor = (t: number) => playheadX + (t - now) * pps;
    const yFor = (midi: number) => {
      const f = (midi - LO_MIDI) / (HI_MIDI - LO_MIDI);
      return ribBottom - 14 - f * (ribBottom - ribTop - 28);
    };

    // ground — deep slate gradient
    const g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, "#0a1119");
    g.addColorStop(1, "#0d1622");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    // octave guide-lines (C's) with soft labels
    ctx.font = "11px ui-monospace, monospace";
    for (let m = 48; m <= 84; m += 12) {
      const y = yFor(m);
      if (y < ribTop || y > ribBottom) continue;
      ctx.strokeStyle = "rgba(148,163,184,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(cssW, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(148,163,184,0.35)";
      ctx.fillText(noteName(m), 6, y - 4);
    }

    // slow drifting time grid (one line per beat) — well under 3 Hz, no strobe
    ctx.strokeStyle = "rgba(148,163,184,0.06)";
    ctx.lineWidth = 1;
    const firstBeat = Math.floor((now - PAST_SEC) / SECONDS_PER_BEAT);
    const lastBeat = Math.ceil((now + FUTURE_SEC) / SECONDS_PER_BEAT);
    for (let bt = firstBeat; bt <= lastBeat; bt++) {
      const x = xFor(bt * SECONDS_PER_BEAT);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, ribTop);
      ctx.lineTo(x + 0.5, ribBottom);
      ctx.stroke();
    }

    // the four voice ribbons
    const drawVoice = (
      pts: Pt[],
      stroke: string,
      dot: string,
      width: number,
    ) => {
      if (pts.length === 0) return;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        const x = xFor(p.t);
        if (x < -40 || x > cssW + 40) {
          started = false;
          continue;
        }
        const y = yFor(p.midi);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      for (const p of pts) {
        const x = xFor(p.t);
        if (x < -6 || x > cssW + 6) continue;
        const y = yFor(p.midi);
        ctx.fillStyle = dot;
        ctx.beginPath();
        ctx.arc(x, y, x <= playheadX + 3 ? 3 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // rose inner voices (bass deepest, alto brightest), jade soprano on top
    drawVoice(bPtsRef.current, "rgba(190,70,110,0.72)", "rgba(230,110,150,0.9)", 2.2);
    drawVoice(tPtsRef.current, "rgba(225,90,130,0.78)", "rgba(245,130,165,0.92)", 2.4);
    drawVoice(aPtsRef.current, "rgba(251,113,133,0.9)", "rgba(255,150,175,0.95)", 2.6);
    drawVoice(sPtsRef.current, "rgba(52,211,153,0.95)", "rgba(110,240,190,1)", 3.0);

    // moving note-name labels at the playhead (current pitch of each voice)
    const labelVoice = (pts: Pt[], color: string) => {
      let cur: Pt | null = null;
      for (const p of pts) if (p.t <= now) cur = p;
      if (!cur) return;
      ctx.fillStyle = color;
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillText(noteName(cur.midi), playheadX + 8, yFor(cur.midi) - 5);
    };
    labelVoice(sPtsRef.current, "rgba(150,245,205,0.95)");
    labelVoice(aPtsRef.current, "rgba(255,165,185,0.9)");
    labelVoice(tPtsRef.current, "rgba(250,150,175,0.85)");
    labelVoice(bPtsRef.current, "rgba(235,130,160,0.8)");

    // playhead
    ctx.strokeStyle = "rgba(110,240,190,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX + 0.5, ribTop);
    ctx.lineTo(playheadX + 0.5, ribBottom);
    ctx.stroke();

    // ── keyboard ──
    const perf = performance.now();
    const chordPcs = chordPcsRef.current;
    const glowAt = (midi: number) => {
      const on = glowRef.current.get(midi);
      if (on === undefined) return 0;
      const age = (perf - on) / 1000;
      if (age > 2.2) {
        glowRef.current.delete(midi);
        return 0;
      }
      return Math.exp(-age / GLOW_TAU);
    };

    // keyboard backdrop
    ctx.fillStyle = "#0b1017";
    ctx.fillRect(0, layout.kbTop, cssW, layout.kbH);

    for (const w of layout.whites) {
      ctx.fillStyle = "#c3cdd8";
      ctx.fillRect(w.x + 1, w.y, w.w - 2, w.h);
      const inChord = chordPcs.has(((w.midi % 12) + 12) % 12);
      if (inChord) {
        ctx.fillStyle = "rgba(251,113,133,0.22)";
        ctx.fillRect(w.x + 1, w.y, w.w - 2, w.h);
      }
      const gl = glowAt(w.midi);
      if (gl > 0.01) {
        ctx.fillStyle = `rgba(52,211,153,${0.75 * gl})`;
        ctx.fillRect(w.x + 1, w.y, w.w - 2, w.h);
      }
      ctx.strokeStyle = "rgba(10,17,25,0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x + 1, w.y, w.w - 2, w.h);
    }
    for (const b of layout.blacks) {
      ctx.fillStyle = "#161f2b";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      const inChord = chordPcs.has(((b.midi % 12) + 12) % 12);
      if (inChord) {
        ctx.fillStyle = "rgba(251,113,133,0.35)";
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      const gl = glowAt(b.midi);
      if (gl > 0.01) {
        ctx.fillStyle = `rgba(52,211,153,${0.85 * gl})`;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }, [timeNow]);

  // ── main loop (always mounted; audio events only when running) ──
  const frame = useCallback(
    (nowPerf: number) => {
      const dt = Math.min(0.05, (nowPerf - lastPerfRef.current) / 1000);
      lastPerfRef.current = nowPerf;
      driftRef.current += dt * (reducedRef.current ? 0.02 : 0.05);

      // prune ribbon points that have scrolled off
      const t = timeNow();
      const cutoff = t - PAST_SEC - 1.5;
      for (const ref of [sPtsRef, aPtsRef, tPtsRef, bPtsRef]) {
        const arr = ref.current;
        let drop = 0;
        while (drop < arr.length && arr[drop].t < cutoff) drop++;
        if (drop > 0) arr.splice(0, drop);
      }

      draw();
      rafRef.current = requestAnimationFrame(frame);
    },
    [draw, timeNow],
  );

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
    lastPerfRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [frame]);

  useEffect(() => () => teardownAudio(), [teardownAudio]);

  // ─── UI ───
  const btnGhost =
    "min-h-[44px] border border-border px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent";
  const btnActive =
    "min-h-[44px] border border-violet-300/70 bg-violet-300/15 px-4 py-2.5 font-mono text-base text-violet-100 transition-colors";

  return (
    <main className="relative min-h-screen w-full touch-none overflow-hidden bg-[#0a1119] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-pointer"
        onPointerDown={onPointerDown}
        aria-hidden
      />

      {/* header */}
      <header className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.25em] text-foreground sm:text-2xl">
          shadow
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Play a <span className="text-violet-200">single-note melody</span>; a
          voice-leading &ldquo;shadow&rdquo; voices it into{" "}
          <span className="text-violet-300">four-part harmony</span> a beat behind you,
          choosing each chord by minimising how far the inner voices have to move.
        </p>
      </header>

      {/* readout */}
      {chordInfo && phase !== "idle" && (
        <div className="pointer-events-none absolute left-6 top-28 z-10 font-mono text-base sm:left-10">
          <div className="text-2xl text-foreground">
            {chordInfo.symbol}
            <span className="ml-2 text-base text-muted-foreground">{chordInfo.roman}</span>
          </div>
          <div className="mt-1 text-base text-muted-foreground">
            {KEY_NAMES[keyRoot]} {mode} · {style}
          </div>
          <div className="mt-1 text-base">
            <span className="text-violet-200">S {chordInfo.notes[0]}</span>
            <span className="text-violet-300">
              {" "}· A {chordInfo.notes[1]} · T {chordInfo.notes[2]} · B{" "}
              {chordInfo.notes[3]}
            </span>
          </div>
          {chordInfo.nonChord && (
            <div className="mt-1 text-base text-muted-foreground">colour tone over chord</div>
          )}
        </div>
      )}

      {/* pre-start overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-4">
          <div className="flex max-w-md flex-col items-center gap-5 border border-border bg-black/60 px-8 py-7 text-center backdrop-blur-sm">
            <p className="text-base text-foreground">
              A real-time four-part harmonizer. You are the soprano (jade); a rule-based
              shadow partner supplies alto, tenor and bass (rose) a beat later, always
              taking the smoothest voice-leading path. Play with the on-screen keys, your
              QWERTY keyboard, or a MIDI controller.
            </p>
            <button
              onClick={handleBegin}
              className="min-h-[44px] min-w-[44px] bg-violet-300 px-6 py-2.5 font-mono text-base font-medium uppercase tracking-widest text-black transition-colors hover:bg-violet-200"
            >
              Begin
            </button>
            <button
              onClick={handleDemo}
              className="min-h-[44px] border border-border px-5 py-2.5 font-mono text-base text-foreground transition-colors hover:bg-accent"
            >
              Demo — play a melody
            </button>
            <p className="text-base text-muted-foreground">
              Sound starts on this tap (audio is gesture-gated). Then press keys, or let
              the demo play a phrase for you.
            </p>
            {audioError && <p className="text-base text-violet-300">{audioError}</p>}
          </div>
        </div>
      )}

      {/* control dock */}
      <div className="absolute bottom-[calc(24vh+16px)] left-1/2 z-10 w-[min(96vw,860px)] -translate-x-1/2">
        <div className="flex flex-wrap items-center justify-center gap-2 border border-border bg-black/55 px-4 py-3 backdrop-blur-sm">
          {/* key */}
          <label className="font-mono text-base text-muted-foreground">
            key
            <select
              value={keyRoot}
              onChange={(e) => setKeyRoot(Number(e.target.value))}
              className="ml-2 min-h-[44px] border border-border bg-black/40 px-3 py-2.5 font-mono text-base text-foreground"
            >
              {KEY_NAMES.map((n, i) => (
                <option key={n} value={i} className="bg-slate-900">
                  {n}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setMode("major")}
              className={mode === "major" ? btnActive : btnGhost}
            >
              major
            </button>
            <button
              onClick={() => setMode("minor")}
              className={mode === "minor" ? btnActive : btnGhost}
            >
              minor
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setStyle("chorale")}
              className={style === "chorale" ? btnActive : btnGhost}
            >
              chorale
            </button>
            <button
              onClick={() => setStyle("close")}
              className={style === "close" ? btnActive : btnGhost}
            >
              close (7ths)
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShadowBeats((v) => (v === 0.5 ? 1 : 0.5))}
              className={btnGhost}
              title="How far behind the shadow voices sound"
            >
              shadow {shadowBeats === 0.5 ? "1/8" : "1/4"}
            </button>
            <button
              onClick={() => setArp((v) => !v)}
              className={arp ? btnActive : btnGhost}
            >
              arp {arp ? "on" : "off"}
            </button>
          </div>

          <span className="mx-1 hidden h-6 w-px bg-muted sm:block" />

          {!demoPlaying ? (
            <button onClick={handleDemo} className={btnGhost}>
              demo
            </button>
          ) : (
            <button onClick={handleStopDemo} className={btnActive}>
              stop demo
            </button>
          )}
          {phase === "running" && (
            <button onClick={handlePause} className={btnGhost}>
              pause
            </button>
          )}
          {phase === "paused" && (
            <button onClick={handleResume} className={btnActive}>
              resume
            </button>
          )}
          {phase !== "idle" && (
            <button onClick={handleStop} className={btnGhost}>
              stop
            </button>
          )}
        </div>
        <p className="mt-2 text-center font-mono text-base text-muted-foreground">
          click keys · QWERTY (A W S E D F …) · {midiNote}
        </p>
      </div>

      {/* design-notes affordance */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 min-h-[44px] border border-border bg-black/50 px-4 py-2.5 font-mono text-base text-foreground backdrop-blur-sm transition-colors hover:bg-black/70"
      >
        design notes
      </button>
      {showNotes && (
        <div className="absolute right-4 top-20 z-30 w-[min(92vw,480px)] border border-border bg-black/85 p-5 text-base text-foreground backdrop-blur-sm">
          <p className="mb-2 font-mono text-xl uppercase tracking-widest text-foreground">
            the shadow harmonizer
          </p>
          <p className="mb-2">
            Every note you play is soprano. A rule-based harmonizer picks the
            best-fitting diatonic (or borrowed harmonic-minor) chord that contains your
            note, weighting toward functional root motion — descending-fifths, cadences,
            avoiding retrogressions and static repeats. It then voices that chord in four
            parts (SATB) by <em>minimising total inner-voice motion</em> from the previous
            chord, within comfortable ranges, keeping the bass on the root, avoiding
            doubled leading tones and parallel perfect fifths / octaves.
          </p>
          <p className="mb-2 text-muted-foreground">
            The harmonized alto, tenor and bass sound a musical shadow-delay (an eighth or
            quarter note) behind your soprano, so the choir blooms under your hand. The
            ribbon draws all four voices gliding: jade soprano on top, rose inner voices
            below; you literally see the smooth voice-leading. A look-ahead scheduler
            (Chris Wilson&rsquo;s &ldquo;A Tale of Two Clocks&rdquo;) drives the Demo
            melody onto the audio clock.
          </p>
          <p className="text-muted-foreground">
            Refs: Bach chorale voice-leading · Fux, <em>Gradus ad Parnassum</em> · Dmitri
            Tymoczko, <em>A Geometry of Music</em> · Chris Wilson, <em>A Tale of Two
            Clocks</em> · Chowning FM synthesis. No strobe; scroll drifts well under 3 Hz;
            note-flashes are smooth exponential ramps; respects prefers-reduced-motion.
          </p>
          <div className="mt-3">
            <Link href="/dream" className="font-mono text-foreground underline hover:text-foreground">
              &larr; back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
