"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioEngine,
  buildEngine,
  attachMic,
  estimatePitch,
  startDrone,
  setDroneLevel,
  singGrainNote,
  loadVoiceCorpus,
  type AudioSourceKind,
} from "./audio";
import {
  FamilyState,
  makeFamily,
  rememberPhrase,
  familyGrowth,
  composeHarmony,
  MAX_COMPANIONS,
} from "./family";
import {
  FieldRenderer,
  makeGLField,
  makeCanvasField,
  type Blob,
} from "./field";

type Mode = "idle" | "mic" | "ghost";

export default function KidsSongFamily() {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [micNote, setMicNote] = useState<string | null>(null);
  const [voiceKind, setVoiceKind] = useState<AudioSourceKind | "loading">(
    "loading",
  );
  const [glFallback, setGlFallback] = useState(false);
  const [count, setCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engRef = useRef<AudioEngine | null>(null);
  const famRef = useRef<FamilyState>(makeFamily());
  const fieldRef = useRef<FieldRenderer | null>(null);
  const modeRef = useRef<Mode>("idle");

  const handleStart = async (withMic: boolean) => {
    if (started) return;
    setStarted(true);
    const eng = buildEngine();
    engRef.current = eng;
    if (eng.ctx.state === "suspended") {
      try {
        await eng.ctx.resume();
      } catch {
        /* ignore */
      }
    }
    startDrone(eng);

    if (withMic) {
      const ok = await attachMic(eng);
      if (ok) {
        setMode("mic");
        modeRef.current = "mic";
      } else {
        setMicNote(
          "No microphone — your friends will dream and hum on their own. Allow mic access and reload to sing together.",
        );
        setMode("ghost");
        modeRef.current = "ghost";
      }
    } else {
      setMode("ghost");
      modeRef.current = "ghost";
    }
  };

  // ── load Karel's piano voice corpus (or synth fallback) ──────────────────
  useEffect(() => {
    if (!started) return;
    const eng = engRef.current;
    if (!eng) return;
    const ac = new AbortController();
    loadVoiceCorpus(eng, ac.signal)
      .then((kind) => {
        if (!ac.signal.aborted) setVoiceKind(kind);
      })
      .catch(() => {
        if (!ac.signal.aborted) setVoiceKind("fallback");
      });
    return () => ac.abort();
  }, [started]);

  // ── main loop: visuals + harmony brain ───────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const eng = engRef.current;
    const canvas = canvasRef.current;
    if (!eng || !canvas) return;

    let field: FieldRenderer | null = null;
    try {
      field = makeGLField(canvas);
    } catch {
      setGlFallback(true);
      try {
        field = makeCanvasField(canvas);
      } catch {
        field = null;
      }
    }
    fieldRef.current = field;

    const onResize = () => fieldRef.current?.resize();
    window.addEventListener("resize", onResize);

    let raf = 0;
    const t0 = performance.now();

    // phrase capture (mic)
    let inPhrase = false;
    let phrasePitches: number[] = [];
    let phraseDurs: number[] = [];
    let lastVoiceMs = 0;
    let lastPitchMs = 0;

    // sing-back cadence (free / rubato, NOT a grid)
    let lastHeardMs = performance.now();
    let lastReplyMs = performance.now();
    let nextReplyGapMs = 5200;
    let singUntil = 0;

    // ghost demo: a virtual child hums
    let ghostNextMs = performance.now() + 1400;

    const ghostPhrase = () => {
      const len = 2 + Math.floor(Math.random() * 3);
      const steps = [-2, -1, 1, 2, 0];
      // raw Hz around child range so snapping is meaningful
      const base = [220, 246.94, 261.63, 293.66, 329.63, 392, 440];
      const pitches: number[] = [];
      const durs: number[] = [];
      let idx = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < len; i++) {
        idx = Math.max(
          0,
          Math.min(base.length - 1, idx + steps[Math.floor(Math.random() * steps.length)]),
        );
        pitches.push(base[idx]);
        durs.push(0.25 + Math.random() * 0.3);
      }
      const hatched = rememberPhrase(famRef.current, pitches, durs);
      if (hatched) setCount(famRef.current.companions.length);
      lastHeardMs = performance.now();
    };

    const performReply = (now: number) => {
      const { notes, total } = composeHarmony(famRef.current);
      if (notes.length === 0) return;
      const fg = familyGrowth(famRef.current);
      const base = eng.ctx.currentTime + 0.08;
      for (const ev of notes) {
        const when = base + ev.when;
        // spread companions across the stereo field by their x position
        const pan = Math.max(-1, Math.min(1, ev.companion.x * 0.7));
        singGrainNote(eng, ev.hz, when, ev.dur, ev.companion.growth, 0.9, pan);
        // light that companion's singing energy for visuals
        ev.companion.singEnergy = Math.min(1, ev.companion.singEnergy + 0.5);
      }
      singUntil = now + total * 1000 + 500;
      lastReplyMs = now;
      // mature families breathe a little more often, but still rubato
      nextReplyGapMs = 4600 - fg * 1800 + Math.random() * 2600;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const time = (now - t0) / 1000;
      const fam = famRef.current;

      // ── MIC: estimate pitch, capture phrases ──
      if (modeRef.current === "mic" && eng.analyser && eng.timeBuf) {
        eng.analyser.getFloatTimeDomainData(
          eng.timeBuf as unknown as Float32Array<ArrayBuffer>,
        );
        const { hz, rms } = estimatePitch(eng.timeBuf, eng.sampleRate);
        const voiced = rms > 0.012 && hz > 0;
        if (voiced) {
          lastVoiceMs = now;
          lastHeardMs = now;
          if (!inPhrase) {
            inPhrase = true;
            phrasePitches = [];
            phraseDurs = [];
            lastPitchMs = now;
          }
          if (now - lastPitchMs > 90) {
            phrasePitches.push(hz);
            phraseDurs.push(Math.min(0.7, (now - lastPitchMs) / 1000));
            lastPitchMs = now;
          }
        }
        if (inPhrase && now - lastVoiceMs > 700) {
          inPhrase = false;
          if (phrasePitches.length >= 1) {
            const hatched = rememberPhrase(fam, phrasePitches, phraseDurs);
            if (hatched) setCount(fam.companions.length);
          }
        }
      }

      // ── GHOST: virtual child hums on its own ──
      if (modeRef.current === "ghost" && now > ghostNextMs) {
        ghostPhrase();
        ghostNextMs = now + 2800 + Math.random() * 3200;
      }

      // ── SING-BACK cadence (rubato) ──
      const quietFor = now - lastHeardMs;
      if (
        fam.companions.length > 0 &&
        now - lastReplyMs > nextReplyGapMs &&
        quietFor > 850 &&
        now > singUntil
      ) {
        performReply(now);
      }

      const fg = familyGrowth(fam);
      setDroneLevel(eng, fg);

      // ── build the visual field from family state ──
      const blobs: Blob[] = fam.companions.map((c) => {
        c.singEnergy *= 0.93; // decay singing glow
        // tiny breathing wobble in resting position
        const wob = 0.02 * Math.sin(time * 0.6 + c.id);
        return {
          x: c.x,
          y: c.y + wob,
          radius: 0.1 + c.growth * 0.22,
          brightness: 0.3 + c.growth * 0.6,
          hue: c.hue,
          pulse: Math.min(1, c.singEnergy),
        };
      });

      fieldRef.current?.draw({ time, blobs, warmth: fg });
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      fieldRef.current?.dispose();
      fieldRef.current = null;
    };
  }, [started]);

  // ── full audio teardown on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      const eng = engRef.current;
      if (!eng) return;
      eng.micStream?.getTracks().forEach((t) => t.stop());
      try {
        eng.voiceBus.disconnect();
        eng.droneBus.disconnect();
        eng.master.disconnect();
      } catch {
        /* ignore */
      }
      eng.ctx.close().catch(() => undefined);
      engRef.current = null;
    };
  }, []);

  // ── start screen ─────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#03040c] px-6 text-center text-white">
        <div className="text-5xl select-none" aria-hidden="true">
          ✨🫧✨
        </div>
        <h1 className="text-3xl font-serif text-white/95">Song Family</h1>
        <p className="max-w-md text-base text-white/80">
          Hum a little song and a glowing friend hatches who remembers it. Sing
          more and a whole family of friends appears — and they sing your songs
          back to you, stacked in warm harmony, in a voice made from a real
          piano.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleStart(true)}
            className="min-h-[64px] rounded-2xl border border-violet-400/40 bg-violet-500/25 px-6 py-3 text-xl font-medium text-white/95 transition-colors hover:bg-violet-500/40"
          >
            🎤 Sing to them
          </button>
          <button
            onClick={() => handleStart(false)}
            className="min-h-[64px] rounded-2xl border border-white/20 bg-white/5 px-6 py-3 text-base text-white/80 transition-colors hover:bg-white/10"
          >
            Just watch them dream
          </button>
        </div>
        <p className="text-base text-white/75">
          Hum a few notes, then go quiet and listen. For little ones 3+.
        </p>
      </div>
    );
  }

  // ── live screen ──────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-[#03040c]">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 p-5 text-center">
        <h1 className="text-2xl font-serif text-white/95">Song Family</h1>
        <p className="text-base text-white/80">
          {mode === "ghost"
            ? "watching your friends dream and sing"
            : "hum a little song, then go quiet and listen"}
        </p>
        {count > 0 && (
          <p className="text-base text-violet-200">
            {count} glowing friend{count === 1 ? "" : "s"}
            {count >= MAX_COMPANIONS ? " — a whole family" : ""}
          </p>
        )}
        {voiceKind === "fallback" && (
          <p className="text-sm text-white/75">
            (singing in a soft synth voice — the real piano could not load)
          </p>
        )}
      </div>

      {/* design notes link, corner */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="pointer-events-auto absolute right-3 top-3 rounded-full border border-white/15 bg-black/50 px-4 py-2.5 text-sm text-white/75 backdrop-blur-md transition-colors hover:text-white"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {showNotes && (
        <div className="pointer-events-auto absolute right-3 top-16 max-w-xs rounded-2xl border border-white/15 bg-black/85 p-4 text-left text-sm text-white/80 backdrop-blur-md">
          <p className="mb-2 text-base text-white/95">Song Family</p>
          <p className="mb-2">
            A 4-year-old&apos;s hummed phrases hatch a family of glowing
            companions (cap {MAX_COMPANIONS}) that remember the melodies and sing
            them back as a stacked chord choir — each friend on a different
            consonant chord tone (root / 3rd / 5th / 9th). The harmony thickens
            from a thin solo to a full warm chord-family as the friends grow.
          </p>
          <p className="mb-2">
            Their voices are concatenative grains of Karel&apos;s real
            &ldquo;Welcome Home&rdquo; piano, pitch-shifted onto each note (synth
            fallback if it can&apos;t load). Rendered in raw WebGL2.
          </p>
          <p className="text-white/75">
            Cycle-2 of <span className="font-mono">738-kids-song-sprout</span>.
            {glFallback ? " (Canvas2D fallback active.)" : ""}
          </p>
        </div>
      )}

      {micNote && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 p-5 text-center">
          <p className="mx-auto max-w-md text-base text-rose-300">{micNote}</p>
        </div>
      )}
    </div>
  );
}
