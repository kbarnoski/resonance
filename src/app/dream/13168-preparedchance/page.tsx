"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { WELCOME_HOME_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { ChanceEngine } from "./chance";
import { PreparedStrings, midiToFreq, type Preparation } from "./strings";
import {
  buildKeyMap,
  pitchNorm,
  specFromDegree,
  specFromMidi,
  transposeSpec,
  type KeyMapEntry,
  type NoteSpec,
} from "./music";
import {
  renderScene,
  type LaneEvent,
  type StringState,
  type TossState,
  type VizState,
} from "./viz";
import { README } from "./readme-text";

/**
 * 13168 · Prepared Chance — you play; a seeded I-Ching oracle re-composes.
 *
 * A live prepared-string instrument (Karplus-Strong) filtered through a
 * deterministic chance engine, after John Cage's *Sonatas and Interludes* and
 * *Music of Changes*. Web MIDI primary, QWERTY fallback, seeded muted demo on
 * load. Palette: graphite / paper / ink with one violet accent for chance.
 *
 * Real-music basis (retrofit 2026-08-25, rule 10): the strings are excited by
 * seeded grains of Karel's own recording — "Interplay" (Welcome Home) — loaded
 * via the shared welcomeHome helper. Chance operations on real piano.
 */

const FIXED_SEED = 0x13168;
const SOURCE_TRACK = WELCOME_HOME_TRACKS[0]; // "Interplay"
const BEAT_FRAMES = 42;
const PX_PER_FRAME = 1.25;

// The seeded demo phrase: a gentle modal motif, degrees over the scale.
const DEMO: { d: number; dur: number }[] = [
  { d: 0, dur: 1 },
  { d: 2, dur: 1 },
  { d: 4, dur: 0.5 },
  { d: 3, dur: 0.5 },
  { d: 2, dur: 1 },
  { d: 4, dur: 1 },
  { d: 5, dur: 1 },
  { d: 4, dur: 0.5 },
  { d: 2, dur: 0.5 },
  { d: 0, dur: 1 },
  { d: -2, dur: 1 },
  { d: 0, dur: 2 },
];

interface Pending {
  playFrame: number;
  midi: number;
  prep: Preparation;
  vel: number;
  audible: boolean;
  double: boolean;
  doubleMidi: number;
}

const IDLE_STRING: StringState = {
  active: false,
  startFrame: 0,
  freq: 0,
  prep: "felt",
  amp: 0,
};
const IDLE_TOSS: TossState = {
  active: false,
  startFrame: 0,
  hexagram: [],
  op: "keep",
  touched: false,
  label: "",
};

export default function PreparedChancePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const stringsRef = useRef<PreparedStrings | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);

  // engine + sim state (all mutated inside the RAF loop)
  const engineRef = useRef<ChanceEngine>(new ChanceEngine(FIXED_SEED));
  const frameRef = useRef(0);
  const eventsRef = useRef<LaneEvent[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const strRef = useRef<StringState>(IDLE_STRING);
  const tossRef = useRef<TossState>(IDLE_TOSS);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const chanceAmtRef = useRef(0.25);

  // demo scheduler
  const demoIdxRef = useRef(0);
  const demoNextRef = useRef(8);

  const keyMapRef = useRef<Map<string, KeyMapEntry>>(buildKeyMap());

  // UI state
  const [phase, setPhase] = useState<"idle" | "running">("idle");
  const [midiSupported, setMidiSupported] = useState(true);
  const [midiConnected, setMidiConnected] = useState(false);
  const [chanceAmount, setChanceAmount] = useState(0.25);
  const [showNotes, setShowNotes] = useState(false);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [sourceState, setSourceState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  useEffect(() => {
    chanceAmtRef.current = chanceAmount;
  }, [chanceAmount]);

  /* ------------------------- the note trigger path ------------------------ */
  const triggerNote = useCallback(
    (spec: NoteSpec, vel: number, audible: boolean) => {
      const engine = engineRef.current;
      const verdict = engine.next(chanceAmtRef.current);
      const f = frameRef.current;

      let finalSpec = spec;
      if (verdict.op === "transpose" && verdict.transposeSteps !== 0) {
        finalSpec = transposeSpec(spec, verdict.transposeSteps);
      }
      const displaceFrames = Math.round(verdict.displaceBeats * BEAT_FRAMES);
      const playFrame = f + displaceFrames;
      const muted = verdict.op === "mute";
      const doubled = verdict.op === "double";
      const dblSpec = doubled
        ? transposeSpec(finalSpec, verdict.doubleInterval)
        : finalSpec;

      const ev: LaneEvent = {
        origFrame: f,
        playFrame,
        y: pitchNorm(finalSpec.midi),
        touched: verdict.touched,
        op: verdict.op,
        muted,
        doubled,
        doubleY: pitchNorm(dblSpec.midi),
        hexagram: verdict.hexagram,
      };
      eventsRef.current.push(ev);

      tossRef.current = {
        active: true,
        startFrame: f,
        hexagram: verdict.hexagram,
        op: verdict.op,
        touched: verdict.touched,
        label: verdict.label,
      };

      if (!muted) {
        pendingRef.current.push({
          playFrame,
          midi: finalSpec.midi,
          prep: finalSpec.prep,
          vel,
          audible,
          double: doubled,
          doubleMidi: dblSpec.midi,
        });
      }
    },
    [],
  );

  /* ------------------------------- MIDI in -------------------------------- */
  const onMidi = useCallback(
    (e: MIDIMessageEvent) => {
      const data = e.data;
      if (!data || data.length < 3) return;
      const status = data[0] & 0xf0;
      const note = data[1];
      const vel = data[2];
      if (status === 0x90 && vel > 0) {
        triggerNote(specFromMidi(note), vel / 127, true);
      }
    },
    [triggerNote],
  );

  const setupMidi = useCallback(() => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (typeof nav.requestMIDIAccess !== "function") {
      setMidiSupported(false);
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
            input.onmidimessage = onMidi;
          });
          setMidiConnected(any);
        };
        wire();
        access.onstatechange = wire;
      })
      .catch(() => {
        setMidiSupported(false);
      });
  }, [onMidi]);

  /* ------------------------------- start ---------------------------------- */
  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("running");
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      const master = createSafeMaster(ctx);
      masterRef.current = master;
      stringsRef.current = new PreparedStrings(ctx, master.input);
      await ctx.resume();
      // Load Karel's real recording as the excitation/source material
      // (rule 10). Until it arrives, plucks use the labeled noise fallback.
      setSourceState("loading");
      loadRealTrackBuffer(ctx, SOURCE_TRACK.id)
        .then(({ buffer }) => {
          stringsRef.current?.setSource(buffer);
          setSourceState("ready");
        })
        .catch(() => setSourceState("error"));
    } catch {
      /* audio unavailable — the visual instrument continues */
    }
    setupMidi();
  }, [setupMidi]);

  /* --------------------------- render one frame --------------------------- */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const f = frameRef.current;

    // cull events fully scrolled off the left edge
    const ageLimit = (cssW * 0.8) / PX_PER_FRAME + 160;
    if (eventsRef.current.length > 48) {
      eventsRef.current = eventsRef.current.filter((e) => f - e.playFrame < ageLimit);
    }
    if (strRef.current.active && f - strRef.current.startFrame > 90) {
      strRef.current = { ...strRef.current, active: false };
    }
    if (tossRef.current.active && f - tossRef.current.startFrame > 140) {
      tossRef.current = { ...tossRef.current, active: false };
    }

    const state: VizState = {
      frame: f,
      beatFrames: BEAT_FRAMES,
      pxPerFrame: PX_PER_FRAME,
      events: eventsRef.current,
      str: strRef.current,
      toss: tossRef.current,
      chanceAmount: chanceAmtRef.current,
      started: startedRef.current,
    };
    renderScene(g, cssW, cssH, state);
  }, []);

  /* -------------------- main loop + listeners + teardown ------------------ */
  useEffect(() => {
    setMidiSupported(
      typeof (navigator as { requestMIDIAccess?: unknown }).requestMIDIAccess ===
        "function",
    );

    const tick = () => {
      const f = (frameRef.current += 1);

      // seeded silent demo, until the player takes over
      if (!startedRef.current) {
        let guard = 0;
        while (f >= demoNextRef.current && guard < 8) {
          const step = DEMO[demoIdxRef.current];
          triggerNote(specFromDegree(step.d), 0.6, false);
          demoNextRef.current += Math.max(1, Math.round(step.dur * BEAT_FRAMES));
          demoIdxRef.current += 1;
          if (demoIdxRef.current >= DEMO.length) {
            demoIdxRef.current = 0;
            demoNextRef.current += 2 * BEAT_FRAMES; // a breath before the loop
          }
          guard += 1;
        }
      }

      // fire scheduled plucks whose (possibly displaced) onset has arrived
      const pend = pendingRef.current;
      for (let i = pend.length - 1; i >= 0; i--) {
        if (f >= pend[i].playFrame) {
          const p = pend[i];
          const strings = stringsRef.current;
          if (p.audible && strings) {
            strings.pluck(p.midi, p.prep, p.vel);
            if (p.double) strings.pluck(p.doubleMidi, p.prep, p.vel * 0.55);
          }
          strRef.current = {
            active: true,
            startFrame: f,
            freq: midiToFreq(p.midi),
            prep: p.prep,
            amp: Math.max(0.45, p.vel),
          };
          pend.splice(i, 1);
        }
      }

      render();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const entry = keyMapRef.current.get(k);
      if (!entry) return;
      e.preventDefault();
      if (!startedRef.current) void handleStart();
      triggerNote(entry.spec, 0.85, startedRef.current);
      setPressed((prev) => {
        const next = new Set(prev);
        next.add(k);
        return next;
      });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!keyMapRef.current.has(k)) return;
      setPressed((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      const access = midiAccessRef.current;
      if (access) {
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
          try {
            input.close();
          } catch {
            /* already closed */
          }
        });
        access.onstatechange = null;
      }
      midiAccessRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      stringsRef.current?.dispose();
      stringsRef.current = null;
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
      startedRef.current = false;
    };
  }, [triggerNote, handleStart, render]);

  /* ------------------- on-screen key (touch / mouse) ---------------------- */
  const onKeyTap = useCallback(
    (entry: KeyMapEntry) => {
      if (!startedRef.current) void handleStart();
      triggerNote(entry.spec, 0.85, startedRef.current);
    },
    [handleStart, triggerNote],
  );

  const keyMap = keyMapRef.current;
  const whiteKeys = ["a", "s", "d", "f", "g", "h", "j", "k"];
  const blackKeys = ["w", "e", "t", "y", "u"];

  return (
    <main className="min-h-screen bg-background px-5 py-8 sm:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {/* header */}
        <header className="flex flex-col gap-2">
          <Link
            href="/dream"
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          >
            ← dream lab
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Prepared Chance
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Play a melody and it comes back subtly re-composed — recognisably
            yours, gently estranged. Each key strikes a prepared string excited
            by grains of Karel&apos;s own recording —{" "}
            <span className="text-foreground">&ldquo;{SOURCE_TRACK.title}&rdquo;</span>{" "}
            from <span className="text-foreground">Welcome Home</span> — and a
            seeded I-Ching oracle sometimes displaces, transposes, doubles, or
            silences the note. After John Cage&apos;s{" "}
            <span className="text-foreground">Sonatas and Interludes</span> and{" "}
            <span className="text-foreground">Music of Changes</span>.
          </p>
        </header>

        {/* canvas */}
        <div className="overflow-hidden rounded-lg border border-border">
          <canvas
            ref={canvasRef}
            className="block h-[380px] w-full sm:h-[460px]"
          />
        </div>

        {/* controls */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleStart()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {phase === "idle" ? "Start playing" : "Playing"}
            </button>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {phase === "idle"
                ? "seeded demo · muted"
                : midiConnected
                  ? "midi connected"
                  : midiSupported
                    ? "qwerty · no midi device"
                    : "qwerty · no web-midi"}
            </span>
            {phase === "running" && sourceState !== "idle" && (
              <span
                className={`font-mono text-xs uppercase tracking-[0.18em] ${
                  sourceState === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }`}
              >
                {sourceState === "ready"
                  ? `strings excited by “${SOURCE_TRACK.title}”`
                  : sourceState === "loading"
                    ? "loading karel’s recording…"
                    : "recording unavailable — noise excitation fallback"}
              </span>
            )}
          </div>

          {/* chance slider */}
          <div className="flex max-w-md flex-col gap-2">
            <label
              htmlFor="chance"
              className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
            >
              <span>Chance amount</span>
              <span>
                {chanceAmount < 0.12
                  ? "faithful"
                  : chanceAmount > 0.55
                    ? "estranged"
                    : `${Math.round(chanceAmount * 100)}%`}
              </span>
            </label>
            <input
              id="chance"
              type="range"
              min={0}
              max={0.8}
              step={0.01}
              value={chanceAmount}
              onChange={(e) => setChanceAmount(parseFloat(e.target.value))}
              className="h-1 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
            />
          </div>

          {/* qwerty helper keyboard */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Keyboard — white: A S D F G H J K · black: W E T Y U
            </span>
            <div className="flex flex-wrap gap-1.5">
              {blackKeys.map((k) => {
                const entry = keyMap.get(k);
                if (!entry) return null;
                const on = pressed.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={() => onKeyTap(entry)}
                    className={`min-h-[44px] min-w-[44px] rounded-md border px-3 text-sm transition-colors ${
                      on
                        ? "border-primary bg-primary/20 text-foreground"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {whiteKeys.map((k) => {
                const entry = keyMap.get(k);
                if (!entry) return null;
                const on = pressed.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onPointerDown={() => onKeyTap(entry)}
                    className={`min-h-[44px] min-w-[44px] rounded-md border px-3 text-sm transition-colors ${
                      on
                        ? "border-primary bg-primary/20 text-foreground"
                        : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {entry.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* design notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {README}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
