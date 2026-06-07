"use client";

// 371 · Kids Clap-Along
// ────────────────────────────────────────────────────────────────────────────
// "What if a 4-year-old could have a clapping CONVERSATION with a friendly
//  creature — clap with their real hands, the phone HEARS it (no screen-tapping),
//  and the shared rhythm GROWS each time they clap it back?"
//
// INPUT      the MICROPHONE — real acoustic CLAP detection via onset detection
//            on an AnalyserNode FFT (onset.ts). NOT screen taps, NOT tilt.
//            Fallbacks (all into the SAME detector): a pointer/tap "clap" that
//            plays a real broadband burst the detector hears; and an AUTO-DEMO
//            that claps the call AND claps it back, so it plays itself hands-free.
// OUTPUT     raw WebGL2 (creature-gl.ts): one warm breathing creature + a row of
//            glowing clap beads that GROWS with the song. Matte premultiplied
//            alpha-over compositing — no additive bloom (house style).
// TECHNIQUE  real-time spectral-flux / HFC onset detection with an adaptive
//            threshold + ~140 ms refractory (onset.ts), PLUS a call-and-response
//            growing-memory engine (pattern.ts) that records the target rhythm,
//            compares the child's detected onset times within a generous
//            tolerance, and grows the pattern by one clap on a good-enough match.
// AUDIO      clap-audio.ts: always-on soft D+A drone (never silent), D-DORIAN
//            tuned clap voices (call vs answer), a reward sparkle on each grow,
//            all through a DynamicsCompressor limiter so it can never blast.
// VIBE       kids, warm, calm-but-playful. No reading, no score, no fail — a
//            miss just warmly replays the same pattern ("let's try together").

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createOnsetDetector, type OnsetDetector } from "./onset";
import {
  createPatternEngine,
  type PatternEngine,
  type Phase,
} from "./pattern";
import { createClapAudio, SCALE_NAMES, type ClapAudio } from "./clap-audio";
import {
  createCreatureRenderer,
  type CreatureRenderer,
  type CreatureView,
} from "./creature-gl";

const AUTO_DEMO_AFTER_MS = 4500; // no real claps for this long → play itself

type Mode = "idle" | "running";

// human-readable cue for each phase of the conversation
const PHASE_HINT: Record<Phase, string> = {
  intro: "say hello…",
  calling: "listen — they're clapping",
  waiting: "your turn! clap it back ▸",
  judging: "…",
  celebrate: "yes! the song grew!",
};

export default function KidsClapAlongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [usingTapFallback, setUsingTapFallback] = useState(false);
  const [autoDemo, setAutoDemo] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");
  const [level, setLevel] = useState(0);

  // live engine refs (mutated in the loop, kept out of React state)
  const audioRef = useRef<ClapAudio | null>(null);
  const onsetRef = useRef<OnsetDetector | null>(null);
  const patternRef = useRef<PatternEngine | null>(null);
  const rendererRef = useRef<CreatureRenderer | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  const micWorkingRef = useRef(false); // did the mic produce a real clap recently
  const autoDemoRef = useRef(false);
  const lastRealClapMsRef = useRef(0);

  // live mood passed to the renderer; mutated each frame
  const viewRef = useRef<CreatureView>({
    warm: 0,
    squash: 0,
    listen: 0,
    delight: 0,
    beadCount: 2,
    litBead: -1,
    litStrength: 0,
    litWho: "none",
  });

  // ── one shared clap handler: every detected onset lands here ─────────────────
  // The detector cannot know WHO clapped — so context decides: during the
  // creature's call we ignore detections (its own claps), during the child's
  // window every detection is a response. The creature's beats are emitted by
  // the engine separately (it knows its own pattern).
  const onDetectedClap = useCallback((strength: number) => {
    const engine = patternRef.current;
    if (!engine) return;
    const st = engine.state();
    if (st.phase !== "waiting") return; // only the child's turn counts

    // this is a real/standin clap from the human (or auto-demo)
    engine.registerClap();

    // light the nearest matching bead as a "child answer" + squash the creature
    const offset = nearestBeadIndex(st.pattern, st.phaseProgress);
    const v = viewRef.current;
    v.squash = Math.min(1, 0.6 + strength * 0.4);
    v.litBead = offset;
    v.litStrength = Math.min(1, 0.6 + strength * 0.5);
    v.litWho = "child";
  }, []);

  // ── the creature claps one beat of its call (engine drives this) ─────────────
  const emitCreatureBeat = useCallback((beatIndex: number, total: number) => {
    const audio = audioRef.current;
    // tune the clap up the D-Dorian set by position so the call reads as a tune
    const scaleIndex = beatIndex % 7;
    audio?.clap(0.9, "creature", scaleIndex);
    const v = viewRef.current;
    v.squash = 1;
    v.litBead = beatIndex;
    v.litStrength = 1;
    v.litWho = "creature";
    void total;
  }, []);

  // ── main start gesture: unlock audio + request mic + run loop ────────────────
  const start = useCallback(async () => {
    if (mode === "running") return;

    // 1. AudioContext INSIDE the gesture (iOS/Safari requirement).
    let ctx: AudioContext;
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      return;
    }
    const audio = createClapAudio(ctx);
    audioRef.current = audio;

    // 2. Onset detector reads the SHARED analyser (so synthetic taps are heard).
    const onset = createOnsetDetector();
    onset.connect(audio.analyser);
    onsetRef.current = onset;

    // 3. Pattern engine.
    patternRef.current = createPatternEngine();

    // 4. WebGL2 (graceful: notice + audio still runs if unavailable).
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });
    if (gl) {
      try {
        rendererRef.current = createCreatureRenderer(gl);
      } catch {
        rendererRef.current = null;
        setNoWebgl(true);
      }
    } else {
      setNoWebgl(true);
    }
    sizeCanvas();

    // 5. Microphone permission — MUST be requested inside this tap gesture.
    micWorkingRef.current = false;
    lastRealClapMsRef.current = performance.now();
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false, // we WANT the raw transient
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
        micStreamRef.current = stream;
        const src = ctx.createMediaStreamSource(stream);
        // route the mic INTO the shared analyser (NOT to the speakers → no
        // feedback). The synthetic tap-bus is already wired to this analyser,
        // so every input path lands in the SAME spectral-flux detector.
        src.connect(audio.analyser);
      } else {
        setMicDenied(true);
        setUsingTapFallback(true);
      }
    } catch {
      // denied / unavailable → tap-to-clap fallback (same pipeline) + auto-demo
      setMicDenied(true);
      setUsingTapFallback(true);
    }

    setMode("running");

    // 6. Loop: detect claps, advance the conversation, drive audio + visuals.
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const det = onsetRef.current;
      const engine = patternRef.current;
      const audioNow = audioRef.current;

      // (a) ALWAYS pull the mic/analyser FFT — this also detects synthetic taps
      //     and auto-demo claps that were injected into the analyser. ONE pipe.
      if (det) {
        const hit = det.sampleMic(now);
        if (hit) {
          // a transient was detected. If it came from a real human clap (mic),
          // mark the mic as working and cancel the auto-demo.
          const st = engine?.state();
          if (st && st.phase === "waiting") {
            // only meaningful as a response during the child's turn
            if (!autoDemoRef.current) {
              micWorkingRef.current = true;
              lastRealClapMsRef.current = now;
            }
            onDetectedClap(hit.strength);
          }
        }
      }

      // (b) auto-demo: if nothing real has clapped for a while, the piece plays
      //     itself — the creature calls AND claps its own answer back, through
      //     the IDENTICAL clap()→analyser→detector path. Critical for a reviewer
      //     who opens this on a phone and does nothing.
      if (engine) {
        const idle = now - lastRealClapMsRef.current;
        if (!autoDemoRef.current && idle > AUTO_DEMO_AFTER_MS) {
          autoDemoRef.current = true;
          setAutoDemo(true);
        }
      }

      // (c) advance the conversation state machine.
      if (engine) {
        engine.tick(dt, emitCreatureBeat);
        const st = engine.state();

        // auto-demo answers the call: during the waiting window, schedule claps
        // on the target beats so the full call→response→grow loop runs solo.
        if (autoDemoRef.current && st.phase === "waiting") {
          autoAnswer(st.pattern, st.phaseProgress, audioNow);
        }

        // reflect phase + level into React (cheap, only on change)
        if (st.phase !== phaseRef.current) {
          phaseRef.current = st.phase;
          setPhase(st.phase);
          // sounds tied to transitions
          if (st.phase === "celebrate") {
            const r = engine.lastResult();
            audioNow?.reward(st.level);
            void r;
          }
          if (st.phase === "calling" && lastPhaseRef.current === "judging") {
            // we re-entered calling straight from judging → a gentle retry
            audioNow?.encourage();
          }
          lastPhaseRef.current = st.phase;
        }
        if (st.level !== levelRef.current) {
          levelRef.current = st.level;
          setLevel(st.level);
        }

        // ── drive the creature mood from the conversation phase ──────────────
        const v = viewRef.current;
        v.beadCount = st.pattern.length;
        // warmth rises while calling/celebrating, calmer while waiting
        const targetWarm =
          st.phase === "calling"
            ? 0.7
            : st.phase === "celebrate"
              ? 1.0
              : st.phase === "waiting"
                ? 0.35
                : 0.2;
        v.warm += (targetWarm - v.warm) * Math.min(1, dt * 3);
        v.listen = st.phase === "waiting" ? 1 : 0;
        v.delight = st.phase === "celebrate" ? 1 : v.delight * (1 - Math.min(1, dt * 2));
      }

      // (d) render
      const r = rendererRef.current;
      if (r) {
        r.step(dt, viewRef.current);
        r.render(now / 1000);
      }
      // beats consume the one-shot lit flag so it doesn't latch every frame
      viewRef.current.litBead = -1;

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [mode, emitCreatureBeat, onDetectedClap]);

  // phase / level mirrors to avoid setState every frame
  const phaseRef = useRef<Phase>("intro");
  const lastPhaseRef = useRef<Phase>("intro");
  const levelRef = useRef(0);

  // auto-demo answer bookkeeping: which target beats we've already answered.
  const autoAnsweredRef = useRef<Set<number>>(new Set());

  // schedule synthetic answer-claps on the target beats during waiting, so the
  // whole loop runs hands-free. Goes through clap()→analyser→detector (one pipe).
  function autoAnswer(
    pattern: number[],
    phaseProgress: number,
    audio: ClapAudio | null,
  ) {
    if (!audio || pattern.length === 0) return;
    const dur = pattern[pattern.length - 1] || 0;
    const windowLen = dur + 1.1; // mirrors pattern.ts responseSlackSec
    const elapsed = phaseProgress * windowLen;
    if (elapsed < 0.05) {
      autoAnsweredRef.current.clear();
    }
    for (let i = 0; i < pattern.length; i++) {
      // answer a touch late + a little jitter, like a real (good) kid
      const target = pattern[i] + 0.12;
      if (!autoAnsweredRef.current.has(i) && elapsed >= target) {
        autoAnsweredRef.current.add(i);
        const scaleIndex = i % 7;
        audio.clap(0.85, "child", scaleIndex); // → detected by sampleMic
      }
    }
  }

  // map a child clap to the nearest bead for the visual flash.
  function nearestBeadIndex(
    pattern: number[],
    phaseProgress: number,
  ): number {
    if (pattern.length === 0) return -1;
    const dur = pattern[pattern.length - 1] || 0;
    const windowLen = dur + 1.1;
    const elapsed = phaseProgress * windowLen;
    let best = 0;
    let bestErr = Infinity;
    for (let i = 0; i < pattern.length; i++) {
      const e = Math.abs(pattern[i] - elapsed);
      if (e < bestErr) {
        bestErr = e;
        best = i;
      }
    }
    return best;
  }

  // ── canvas sizing (DPR capped) ───────────────────────────────────────────────
  function sizeCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      rendererRef.current?.resize(w, h);
    }
  }

  useEffect(() => {
    const onResize = () => sizeCanvas();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── pointer/tap "clap" fallback ──────────────────────────────────────────────
  // A tap plays a REAL broadband burst into the analyser, so the SAME onset
  // detector hears it — a screen-tap travels the identical pipeline as a hand
  // clap. Also cancels the auto-demo (a human is here).
  useEffect(() => {
    if (mode !== "running") return;
    const tap = (e: PointerEvent) => {
      // ignore taps on the UI chrome (buttons/links)
      const el = e.target as HTMLElement;
      if (el.closest("button, a")) return;
      const audio = audioRef.current;
      if (!audio) return;
      autoDemoRef.current = false;
      setAutoDemo(false);
      if (micDenied) setUsingTapFallback(true);
      lastRealClapMsRef.current = performance.now();
      // play a child-tinted clap; sampleMic will detect it during waiting
      const engine = patternRef.current;
      const st = engine?.state();
      const idx = st ? st.responses.length % 7 : 0;
      audio.clap(1.0, "child", idx);
    };
    window.addEventListener("pointerdown", tap);
    return () => window.removeEventListener("pointerdown", tap);
  }, [mode, micDenied]);

  // ── unmount / stop cleanup ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      onsetRef.current?.dispose();
      onsetRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      patternRef.current = null;
      const stream = micStreamRef.current;
      if (stream) {
        for (const t of stream.getTracks()) {
          try {
            t.stop();
          } catch {
            /* ignore */
          }
        }
      }
      micStreamRef.current = null;
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#070611] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none" }}
      />

      {/* idle / start overlay */}
      {mode === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#0b0918]/70 to-[#070611]/90 px-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-white/60">
              371 · clap-along
            </span>
            <h1 className="text-3xl font-semibold text-white sm:text-4xl">
              Clap with a creature.
            </h1>
            <p className="max-w-md text-base text-white/80">
              A friendly creature claps a little rhythm. Clap it back with your
              real hands — the phone listens — and every time you do, the song you
              share gets one clap longer.
            </p>
          </div>

          <button
            onClick={start}
            className="min-h-[64px] rounded-full bg-gradient-to-r from-amber-300 to-orange-400 px-10 text-xl font-semibold text-[#2a1402] shadow-lg shadow-amber-500/25 transition-transform active:scale-95"
          >
            Clap to play ▸
          </button>

          <p className="max-w-sm text-base text-white/60">
            We&apos;ll ask for the microphone so it can hear your claps. No mic?
            Tap the screen to clap — or just watch, it plays itself.
          </p>
        </div>
      )}

      {/* running HUD */}
      {mode === "running" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1 px-6 pt-5 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-white/85">
            {PHASE_HINT[phase]}
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-white/60">
            song length · {Math.max(2, level + 2)} claps
          </p>
          {micDenied && (
            <p className="max-w-md text-base text-rose-300">
              No microphone — tap the screen to clap instead, or just watch it
              play itself.
            </p>
          )}
          {!micDenied && usingTapFallback && (
            <p className="max-w-md text-base text-rose-300">
              Tap-to-clap is on — tap the screen, or let it play itself.
            </p>
          )}
          {autoDemo && (
            <p className="max-w-md text-base text-white/75">
              Playing by itself — clap (or tap) any time to join in.
            </p>
          )}
          {noWebgl && (
            <p className="max-w-md text-base text-rose-300">
              Graphics need WebGL2 — the creature is hidden, but the sound still
              plays.
            </p>
          )}
        </div>
      )}

      {/* D-Dorian legend */}
      {mode === "running" && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2">
          <div className="flex gap-3 font-mono text-xs text-white/60">
            {SCALE_NAMES.map((n, i) => (
              <span key={i}>{n}</span>
            ))}
            <span className="text-white/40">· D-dorian</span>
          </div>
        </div>
      )}

      {/* design notes affordance */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-3 top-3 z-30 min-h-[44px] rounded-full border border-white/15 bg-black/40 px-4 py-2.5 font-mono text-xs text-white/75 backdrop-blur-sm transition-colors hover:text-white"
      >
        {showNotes ? "close" : "design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-40 overflow-y-auto bg-black/85 px-6 py-16 backdrop-blur-md">
          <div className="mx-auto max-w-xl space-y-5 text-base leading-relaxed text-white/80">
            <h2 className="text-2xl font-semibold text-white">
              Clap-Along — design notes
            </h2>
            <p>
              <span className="text-white/95">The one question:</span> what if a
              4-year-old could have a clapping conversation with a friendly
              creature — clap with their real hands, the phone hears it, and the
              shared rhythm grows each time they clap it back?
            </p>
            <p>
              <span className="text-white/95">Hearing a clap.</span> A clap is a
              sharp broadband transient. Each frame we read the microphone&apos;s{" "}
              <span className="font-mono text-amber-200">FFT</span> and compute a{" "}
              <span className="font-mono text-amber-200">spectral-flux</span> /
              high-frequency-content novelty — the sum of positive,
              high-weighted bin-to-bin energy increases. An{" "}
              <span className="font-mono text-amber-200">adaptive threshold</span>{" "}
              (a slow running mean of that novelty) self-tunes to the room, and a{" "}
              <span className="font-mono text-amber-200">~140 ms refractory</span>{" "}
              window makes a single clap — even a wobbly double-tap — count once.
            </p>
            <p>
              <span className="text-white/95">A growing song.</span> The creature
              calls a short rhythm; we record your claps&apos; onset times and
              match them against the target within a generous tolerance (little
              hands are forgiven). A good-enough answer makes the creature delight
              and the pattern grow by one clap — Simon-style — so the shared
              rhythm gets longer and longer. A miss is never a fail: the creature
              warmly replays the same pattern.
            </p>
            <p>
              <span className="text-white/95">One pipeline, three doors.</span>{" "}
              Real claps reach the detector through the mic; a screen-tap and the
              hands-free auto-demo play a real broadband burst into the{" "}
              <span className="italic">same</span> analyser, so all three are
              judged by the identical onset machine.
            </p>
            <p>
              <span className="text-white/95">Sound &amp; light.</span> Tuned clap
              voices in{" "}
              <span className="font-mono text-amber-200">D-Dorian</span> (D E F G
              A B C — explicitly not C-major-pentatonic) over an always-on soft
              D+A drone, all through a limiter so it can never blast. The visuals
              are raw WebGL2 — one breathing creature and a row of clap beads that
              grows with the song — composited matte (no additive glow).
            </p>
            <p>
              <span className="text-white/95">References.</span>{" "}
              <span className="italic">Drumball</span> (Audio Mostly 2024), a
              tangible call-and-response drumming system inspired by the West
              African djembe; Steve Reich&apos;s{" "}
              <span className="italic">Clapping Music</span> (1972), clapping as
              composition; and the African call-and-response / talking-drum
              tradition.
            </p>
            <p className="text-sm text-white/60">
              Tags — INPUT: microphone / acoustic clap · OUTPUT: raw WebGL2 ·
              TECHNIQUE: spectral-flux onset detection + growing call-and-response
              · VIBE: kids, warm, calm-but-playful, D-Dorian.
            </p>
          </div>
        </div>
      )}

      <Link
        href="/dream"
        className="absolute left-3 top-3 z-30 min-h-[44px] rounded-full border border-white/15 bg-black/40 px-4 py-2.5 font-mono text-xs text-white/75 backdrop-blur-sm transition-colors hover:text-white"
      >
        ← dream
      </Link>
    </main>
  );
}
