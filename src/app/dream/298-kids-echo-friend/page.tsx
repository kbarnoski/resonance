"use client";

/**
 * Kids Echo Friend — /dream/298-kids-echo-friend
 *
 * A 4-year-old sings a phrase → a friendly creature listens, sings it back,
 * and remembers each phrase to build a growing little song together.
 *
 * Reference: SingingSDS (arXiv:2511.20972), Pauline Oliveros Deep Listening,
 * and classic call-and-response / "Simon" memory games.
 *
 * INPUT:  voice/singing (microphone, monophonic pitch via YIN-style NSDF)
 * OUTPUT: WebGL2 shader creature (GLSL, no three.js)
 * SCALE:  D-Dorian (D E F G A B C) — never atonal, never harsh
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { detectPitch, snapToDorian, pitchToT } from "./pitch";
import {
  makeAudioEngine,
  schedulePhrase,
  scheduleFullSong,
  duckDrone,
  resumeAudio,
  type EchoAudioState,
  type PhraseNote,
} from "./echo-audio";
import { startCreature, type CreatureHandle } from "./creature-gl";

// ── Demo phrases (auto-demo when mic unavailable) ──────────────────────────
// Each phrase is a short musical "sentence" in D-Dorian.
// Hz values drawn directly from the scale (D E F G A B C across 2 octaves).

const D3 = 146.83;
const E3 = 164.81;
const F3 = 174.61;
const G3 = 196.0;
const A3 = 220.0;
const B3 = 246.94;
const C4 = 261.63;
const D4 = 293.66;
const E4 = 329.63;
const G4 = 392.0;
const A4 = 440.0;

// Notes with durations (seconds)
function note(hz: number, dur = 0.45): PhraseNote {
  return { hz, duration: dur };
}

const DEMO_PHRASES: PhraseNote[][] = [
  // "Hello little creature" — descending gentle motif
  [note(D4, 0.5), note(B3, 0.4), note(G3, 0.4), note(E3, 0.6)],
  // "I like to sing" — rising question
  [note(E3, 0.4), note(G3, 0.4), note(A3, 0.4), note(D4, 0.5)],
  // "La la la" — three bouncy notes
  [note(G3, 0.35), note(A3, 0.35), note(B3, 0.35)],
  // "Up and up we go" — ascending line
  [note(D3, 0.4), note(F3, 0.4), note(A3, 0.4), note(C4, 0.4), note(D4, 0.5)],
  // "Floating down" — slow descent
  [note(A4, 0.5), note(G4, 0.5), note(E4, 0.5), note(D4, 0.6)],
  // "Little wiggle" — tight oscillation
  [note(G3, 0.3), note(A3, 0.3), note(G3, 0.3), note(A3, 0.3), note(G3, 0.4)],
];

// ── Types ──────────────────────────────────────────────────────────────────

type Phase =
  | "idle"           // before start button pressed
  | "listening"      // mic open, waiting for child to sing
  | "singing"        // child is currently singing
  | "echoing"        // creature is singing back
  | "fullsong";      // playing the full growing song

// ── Helper: convert a stream of raw Hz detections into a cleaned phrase ────
// Called by the main loop; collects notes, deduplicates, converts to PhraseNote[]
function buildPhraseNotes(rawHz: number[]): PhraseNote[] {
  // Collapse consecutive same quantized notes into single note with summed duration
  const perFrame = 1 / 60; // ~60 fps
  const collapsed: PhraseNote[] = [];
  for (const hz of rawHz) {
    const q = snapToDorian(hz);
    if (
      collapsed.length > 0 &&
      Math.abs(collapsed[collapsed.length - 1].hz - q) < 0.5
    ) {
      collapsed[collapsed.length - 1].duration += perFrame;
    } else {
      collapsed.push({ hz: q, duration: perFrame });
    }
  }
  // Clamp durations to something musical (0.25s – 0.7s per note)
  return collapsed
    .filter((n) => n.duration > 0.1)
    .map((n) => ({ hz: n.hz, duration: Math.min(0.65, Math.max(0.25, n.duration)) }))
    .slice(0, 12); // max 12 notes
}

// ── Silence detector ───────────────────────────────────────────────────────
// Returns true when recent frames are quiet (RMS below threshold)
function isSilent(buf: Float32Array, threshold = 0.012): boolean {
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  return rms < threshold;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function KidsEchoFriend() {
  // — state that drives UI —
  const [phase, setPhase] = useState<Phase>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [noWebgl, setNoWebgl] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [phraseCount, setPhraseCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Sing something to me!");

  // — refs (mutable, don't re-render) —
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<EchoAudioState | null>(null);
  const creatureRef = useRef<CreatureHandle | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number>(0);

  // Phrase collection state (mutable refs for loop closure)
  const phaseRef = useRef<Phase>("idle");
  const rawNotesRef = useRef<number[]>([]);   // Hz values collected this phrase
  const silenceFramesRef = useRef(0);
  const phraseStartedRef = useRef(false);
  const memorizedRef = useRef<PhraseNote[][]>([]);
  const demoIndexRef = useRef(0);
  const demoFrameRef = useRef(0);
  const isEchoingRef = useRef(false);
  const echoEndTimeRef = useRef(0); // performance.now() when echo finishes

  // Smoothed visual uniforms (for creature)
  const smoothPitchRef = useRef(0.15);
  const smoothSingingRef = useRef(0);
  const smoothSingbackRef = useRef(0);
  const smoothAmpRef = useRef(0);

  // Sync phaseRef when state changes
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── WebGL creature setup ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handle = startCreature(canvas);
    if (!handle) {
      setNoWebgl(true);
    } else {
      creatureRef.current = handle;
    }
    return () => {
      handle?.dispose();
      creatureRef.current = null;
    };
  }, []);

  // ── Main loop (runs for both live-mic and demo modes) ──────────────────
  const runLoop = useCallback(() => {
    const SILENCE_THRESH_FRAMES = 55; // ~0.9s at 60fps
    const MIN_PHRASE_FRAMES = 8;       // ~0.13s minimum singing to count

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const now = performance.now();
      const creature = creatureRef.current;
      const audio = audioRef.current;

      // ── Smooth visual uniforms toward targets ──────────────────────────
      const targetPitch = smoothPitchRef.current;
      const targetSinging = smoothSingingRef.current;
      const targetSingback = smoothSingbackRef.current;
      const targetAmp = smoothAmpRef.current;

      if (creature) {
        creature.setUniforms({
          pitch: targetPitch,
          singing: targetSinging,
          singback: targetSingback,
          amplitude: targetAmp,
          phrases: memorizedRef.current.length,
        });
      }

      // Decay
      smoothSingingRef.current *= 0.88;
      smoothSingbackRef.current *= 0.92;
      smoothAmpRef.current *= 0.85;

      // ── Get current pitch ──────────────────────────────────────────────
      let pitchHz = 0;
      let amplitude = 0;
      let isDemoFrame = false;

      if (analyserRef.current && timeBufRef.current) {
        // Live mic path
        analyserRef.current.getFloatTimeDomainData(
          timeBufRef.current as unknown as Float32Array<ArrayBuffer>,
        );
        const buf = timeBufRef.current;

        // RMS amplitude
        let rms = 0;
        for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
        amplitude = Math.sqrt(rms / buf.length);

        const silent = isSilent(buf);
        if (!silent) {
          pitchHz = detectPitch(buf, audio?.ctx.sampleRate ?? 44100);
        }
      } else if (phaseRef.current !== "idle") {
        // Auto-demo path: step through demo phrases
        isDemoFrame = true;
        demoFrameRef.current++;

        if (!isEchoingRef.current) {
          const phrase = DEMO_PHRASES[demoIndexRef.current % DEMO_PHRASES.length];
          // Figure out which note in the phrase we're "at" by frame count
          const framesPerNote = 30; // ~0.5s per note at 60fps
          const noteIdx = Math.floor(demoFrameRef.current / framesPerNote) % phrase.length;
          pitchHz = phrase[noteIdx].hz;
          amplitude = 0.45 + 0.2 * Math.sin(demoFrameRef.current * 0.2);

          // After showing the full phrase, trigger echo
          if (demoFrameRef.current >= phrase.length * framesPerNote + 20) {
            rawNotesRef.current = phrase.map((n) => n.hz);
            phraseStartedRef.current = true;
            // Force phrase completion
            silenceFramesRef.current = SILENCE_THRESH_FRAMES;
          }
        }
      }

      // ── Phrase state machine ───────────────────────────────────────────
      const currentPhase = phaseRef.current;

      if (currentPhase === "echoing" || isEchoingRef.current) {
        // Wait for echo to finish
        if (now > echoEndTimeRef.current) {
          isEchoingRef.current = false;
          smoothSingbackRef.current = 0;

          // Possibly play full song if 3+ phrases
          if (memorizedRef.current.length >= 3 && memorizedRef.current.length % 3 === 0) {
            if (audio) {
              const dur = scheduleFullSong(audio, memorizedRef.current, 0.3);
              setStatusMsg(
                `Our little song has ${memorizedRef.current.length} parts now! Sing more!`,
              );
              setPhase("fullsong");
              phaseRef.current = "fullsong";
              // After full song, return to listening
              setTimeout(() => {
                setPhase("listening");
                phaseRef.current = "listening";
                setStatusMsg("Sing something to me!");
                smoothSingbackRef.current = 0;
              }, dur * 1000 + 800);
            }
          } else {
            setPhase("listening");
            phaseRef.current = "listening";
            setStatusMsg("Sing something to me!");
          }

          // Reset demo frame counter for next phrase
          if (isDemoFrame) {
            demoFrameRef.current = 0;
            demoIndexRef.current++;
          }
        }
        return;
      }

      if (pitchHz > 70 && pitchHz < 900) {
        // Child is singing (or demo is playing notes)
        const q = snapToDorian(pitchHz);
        const t = pitchToT(q);
        rawNotesRef.current.push(q);
        if (rawNotesRef.current.length > 180) rawNotesRef.current.shift(); // ring buffer
        phraseStartedRef.current = true;
        silenceFramesRef.current = 0;

        smoothPitchRef.current = smoothPitchRef.current * 0.85 + t * 0.15;
        smoothSingingRef.current = Math.min(1, smoothSingingRef.current + 0.08);
        smoothAmpRef.current = Math.min(1, smoothAmpRef.current + amplitude * 0.3 + 0.1);

        if (currentPhase === "listening") {
          setPhase("singing");
          phaseRef.current = "singing";
          setStatusMsg("I'm listening…");
        }
      } else {
        // Silence
        smoothSingingRef.current *= 0.8;
        smoothAmpRef.current = Math.max(0, smoothAmpRef.current - 0.03);

        if (phraseStartedRef.current) {
          silenceFramesRef.current++;

          if (
            silenceFramesRef.current >= SILENCE_THRESH_FRAMES &&
            rawNotesRef.current.length >= MIN_PHRASE_FRAMES
          ) {
            // Phrase complete — trigger echo!
            const phrase = buildPhraseNotes(rawNotesRef.current);
            rawNotesRef.current = [];
            phraseStartedRef.current = false;
            silenceFramesRef.current = 0;

            if (phrase.length > 0 && audio) {
              memorizedRef.current.push(phrase);
              const newCount = memorizedRef.current.length;
              setPhraseCount(newCount);
              setStatusMsg(
                newCount === 1
                  ? "My turn! I'll sing it back…"
                  : `I remember ${newCount} songs now! Singing back…`,
              );

              // Duck the drone and schedule sing-back
              duckDrone(audio, 0.5 + phrase.reduce((s, n) => s + n.duration, 0));
              const dur = schedulePhrase(audio, phrase, 0.25);
              smoothSingbackRef.current = 1.0;

              isEchoingRef.current = true;
              echoEndTimeRef.current = now + (dur + 0.4) * 1000;
              setPhase("echoing");
              phaseRef.current = "echoing";
            } else {
              // No audio engine (shouldn't happen, but safe fallback)
              setPhase("listening");
              phaseRef.current = "listening";
              setStatusMsg("Sing something to me!");
              rawNotesRef.current = [];
              phraseStartedRef.current = false;
              silenceFramesRef.current = 0;
            }
          }
        } else if (currentPhase === "singing") {
          setPhase("listening");
          phaseRef.current = "listening";
          setStatusMsg("Sing something to me!");
        }
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Start: create AudioContext + mic in gesture handler ─────────────────
  const handleStart = useCallback(async () => {
    if (phase !== "idle") return;

    // Create audio engine inside the gesture
    const engine = makeAudioEngine();
    audioRef.current = engine;
    await resumeAudio(engine);

    // Try to get the microphone
    let gotMic = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      // Wire mic to analyser (analysis only — NOT connected to destination)
      const source = engine.ctx.createMediaStreamSource(stream);
      const analyser = engine.ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.15;
      source.connect(analyser);
      // NOT connected to destination — analysis only, never recorded
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(
        new ArrayBuffer(analyser.fftSize * 4),
      );

      gotMic = true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Mic unavailable";
      setMicError(
        `Mic not available (${msg}). Running in auto-demo mode — audio and visuals still work!`,
      );
      setIsDemo(true);
    }

    setPhase("listening");
    phaseRef.current = "listening";
    setStatusMsg(
      gotMic
        ? "Sing something to me!"
        : "Auto-demo: the creature sings its own song!",
    );

    // Kick off the main render/audio loop
    runLoop();
  }, [phase, runLoop]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.ctx.close();
      creatureRef.current?.dispose();
    };
  }, []);

  // ── Demo: a random note from the scale just so canvas draws immediately ──
  // (creature handles its own idle animation; no extra effect needed)

  // ── Derived UI state ──────────────────────────────────────────────────────
  const isActive = phase !== "idle";
  const isListening = phase === "listening";
  const isSinging = phase === "singing";
  const isEchoing = phase === "echoing" || phase === "fullsong";

  // Phase label color
  const phaseColor = isSinging
    ? "text-violet-300"
    : isEchoing
      ? "text-violet-300"
      : "text-violet-300/80";

  // ── Scale note display (purely decorative) ────────────────────────────────
  const scaleLabels = ["D", "E", "F", "G", "A", "B", "C"];

  return (
    <div className="relative min-h-screen bg-[#06030f] text-foreground flex flex-col">
      {/* ── WebGL creature canvas (full background) ── */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      />

      {/* ── Foreground UI ── */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <Link
            href="/dream"
            className="text-muted-foreground/70 hover:text-muted-foreground text-sm font-mono transition-colors"
          >
            ← dream lab
          </Link>
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="text-muted-foreground/70 hover:text-muted-foreground text-xs font-mono transition-colors"
            aria-label="Toggle design notes"
          >
            {showNotes ? "hide notes" : "design notes"}
          </button>
        </div>

        {/* Design notes panel */}
        {showNotes && (
          <div className="mx-4 mb-4 p-4 rounded-xl bg-black/60 backdrop-blur border border-border text-sm font-mono text-muted-foreground space-y-2">
            <p className="text-foreground text-base font-semibold">
              Kids Echo Friend — Design Notes
            </p>
            <p>
              A 4-year-old sings a short phrase → a friendly creature listens,
              sings it back (call-and-response), and remembers every phrase to
              build a growing little song together.
            </p>
            <p>
              <span className="text-violet-300">INPUT:</span> Voice/singing via
              microphone. Pitch detected with YIN-style NSDF autocorrelation
              (no ML, pure DSP). Quantized to D-Dorian (D E F G A B C) — modal,
              never atonal, never harsh.
            </p>
            <p>
              <span className="text-violet-300">OUTPUT:</span> WebGL2 fragment
              shader creature — SDF blob with domain-warped organic shape,
              aurora background, memory orbs. Hands-free; child never needs to
              tap.
            </p>
            <p>
              <span className="text-violet-300">AUDIO:</span> Warm sine+triangle
              through lowpass + short delay + DynamicsCompressor limiter. Idle
              D-drone so it&apos;s never silent. Duck-and-echo pattern after each
              phrase.
            </p>
            <p className="text-muted-foreground">
              Refs: SingingSDS (arXiv:2511.20972) · Pauline Oliveros, Deep
              Listening · Call-and-response / Simon memory game tradition.
            </p>
          </div>
        )}

        {/* Notices */}
        {noWebgl && (
          <div className="mx-4 mb-2 p-3 rounded-lg bg-black/50 border border-violet-500/40">
            <p className="text-violet-300 text-sm font-mono">
              WebGL2 not available — visuals disabled, but audio still works.
            </p>
          </div>
        )}
        {micError && (
          <div className="mx-4 mb-2 p-3 rounded-lg bg-black/50 border border-violet-500/30">
            <p className="text-violet-300 text-sm font-mono">{micError}</p>
          </div>
        )}

        {/* Main content — centred vertically when idle */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight mb-1">
              Echo Friend
            </h1>
            <p className="text-muted-foreground text-base font-mono">
              sing → I listen → I sing back
            </p>
          </div>

          {/* Start button */}
          {!isActive && (
            <button
              onClick={handleStart}
              className="min-h-[72px] px-10 py-4 rounded-2xl bg-violet-600 hover:bg-violet-500 active:scale-95 text-foreground text-xl font-semibold shadow-lg shadow-violet-900/60 transition-all"
              style={{ minWidth: 220 }}
            >
              Sing to me ✨
            </button>
          )}

          {/* Active state UI */}
          {isActive && (
            <div className="flex flex-col items-center gap-6 w-full max-w-sm">
              {/* Status message */}
              <div
                className={`text-center text-xl font-semibold transition-colors duration-500 ${phaseColor}`}
              >
                {statusMsg}
              </div>

              {/* Phrase memory display */}
              {phraseCount > 0 && (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-muted-foreground text-sm font-mono">
                    {phraseCount === 1
                      ? "1 phrase remembered"
                      : `${phraseCount} phrases remembered`}
                  </p>
                  {/* Memory orbs — one dot per phrase, glowing */}
                  <div className="flex gap-2 flex-wrap justify-center">
                    {memorizedRef.current.map((_, i) => (
                      <div
                        key={i}
                        className="w-3 h-3 rounded-full animate-pulse"
                        style={{
                          background: `hsl(${(i * 43 + 260) % 360}, 80%, 65%)`,
                          boxShadow: `0 0 8px hsl(${(i * 43 + 260) % 360}, 80%, 65%)`,
                          animationDelay: `${i * 0.15}s`,
                        }}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* D-Dorian scale indicator (decorative, no reading needed) */}
              {(isSinging || isListening) && (
                <div className="flex gap-1 items-end" aria-hidden="true">
                  {scaleLabels.map((label, i) => (
                    <div key={label} className="flex flex-col items-center gap-1">
                      <div
                        className="w-5 rounded-t transition-all duration-150"
                        style={{
                          height: 8 + i * 4,
                          background: `hsl(${260 + i * 18}, 65%, 58%)`,
                          opacity: 0.55,
                        }}
                      />
                      <span className="text-muted-foreground/70 text-xs font-mono">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Demo mode tag */}
              {isDemo && (
                <div className="text-center">
                  <span className="text-muted-foreground/70 text-xs font-mono">
                    auto-demo mode
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer attribution */}
        <div className="text-center pb-4 text-muted-foreground/70 text-xs font-mono">
          D-Dorian · WebGL2 · YIN pitch · call-and-response
        </div>
      </div>
    </div>
  );
}

