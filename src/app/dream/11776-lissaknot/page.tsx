"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11776-lissaknot — SING, AND YOUR OWN VOICE IS DRAWN AS LIVING LIGHT.
//
//   A genuine X-Y oscilloscope in the browser: the "drawn sound" tradition
//   (Jerobeam Fenderson's Oscilloscope Music, the macumbista Vector Synthesis
//   toolkit, Norman McLaren, Ben Laposky) made into an instrument you play with
//   your VOICE. A lightweight in-browser YIN-lite pitch estimator (pitch.ts, in
//   the spirit of PESTO real-time pitch estimation) tracks the fundamental you
//   sing; the beam's X axis oscillates at the drone-root rate, the Y axis at
//   your sung partial, so the pair traces a Lissajous figure. HOLD a clear note
//   and the ratio snaps to a simple integer ratio — the figure crystallizes and
//   LOCKS into a clean, glowing knot. Slur or add a consonant and it precesses
//   into a living scribble; each onset snaps a bright whip through the beam.
//
//   Muted-phone contract: with NO mic and NO audio, a seeded DemoVoice sings a
//   slow held-note melody from mount, so a knot forms and morphs within ~1s.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { makeBeamRenderer, MAX_SAMPLES, type BeamRenderer } from "./gl";
import { buildBeamPath } from "./beam";
import { quantizeRatio, type Pitch } from "./pitch";
import { ScopeAudio } from "./audio";
import { DemoVoice } from "./demo";
import { clamp } from "./prng";

const ROOT = 110; // drone root (A2) — sung intervals map onto knots over this.

interface LoopState {
  sKy: number; // smoothed Y-axis multiplier (num + detune)
  sLock: number;
  sAmp: number;
  sBright: number;
  whip: number;
  phase: number;
  rot: number;
  head: number;
  frame: number;
  lastPitch: Pitch | null;
}

export default function LissaKnotPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<BeamRenderer | null>(null);
  const audioRef = useRef<ScopeAudio | null>(null);
  const demoRef = useRef<DemoVoice | null>(null);
  const pointsRef = useRef<Float32Array>(new Float32Array(MAX_SAMPLES * 2));
  const rafRef = useRef<number>(0);
  const startClockRef = useRef<number>(0);
  const lastNowRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const stateRef = useRef<LoopState>({
    sKy: 2,
    sLock: 0,
    sAmp: 0.3,
    sBright: 0.2,
    whip: 0,
    phase: 0,
    rot: 0,
    head: 0,
    frame: 0,
    lastPitch: null,
  });

  const mic = useMicAnalyser({ smoothing: 0.8 });
  const micRef = useRef(mic);
  micRef.current = mic;

  const [webglOk, setWebglOk] = useState(true);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── mount: renderer + always-on drawing loop (self-demo needs no audio) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = makeBeamRenderer(canvas);
    if (!renderer || !renderer.ok) {
      renderer?.dispose();
      setWebglOk(false);
      return;
    }
    rendererRef.current = renderer;
    demoRef.current = new DemoVoice(ROOT);
    reducedRef.current = prefersReducedMotion();

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      rendererRef.current?.resize(w, h, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    startClockRef.current = performance.now();
    lastNowRef.current = startClockRef.current;

    const loop = (now: number) => {
      const age = (now - startClockRef.current) / 1000;
      const dt = clamp((now - lastNowRef.current) / 1000, 0, 0.05);
      lastNowRef.current = now;
      const reduced = reducedRef.current;
      const st = stateRef.current;
      st.frame++;

      const audio = audioRef.current;
      const m = micRef.current;
      const frame = m.running ? m.getFrame() : null;

      // Pitch is heavy — read it every other frame and hold between.
      if (audio && st.frame % 2 === 0) st.lastPitch = audio.readPitch();
      const pitch = audio ? st.lastPitch : null;

      // Choose the voice source: live mic when a clear pitch is present,
      // otherwise the seeded DemoVoice (so there is always a knot).
      const liveAmp = frame ? frame.amplitude : 0;
      const live = !!pitch && pitch.clarity > 0.5 && liveAmp > 0.02;

      let sung: number;
      let clarity: number;
      let amp: number;
      let bright: number;
      let onset: boolean;
      if (live && pitch && frame) {
        sung = pitch.freq;
        clarity = pitch.clarity;
        amp = Math.max(frame.amplitude, 0.2);
        bright = clamp((frame.centroid - 250) / 2800, 0, 1);
        onset = frame.onset;
      } else {
        const d = demoRef.current!.sample(age);
        sung = d.freq;
        clarity = d.clarity;
        amp = d.amp;
        bright = d.bright;
        onset = d.onset;
      }

      const rat = quantizeRatio(sung, ROOT, clarity);

      // Smooth toward the target so notes morph rather than pop.
      const kyTarget = rat.num + rat.detune;
      st.sKy += (kyTarget - st.sKy) * 0.18;
      st.sLock += (rat.lock - st.sLock) * 0.12;
      st.sAmp += (amp - st.sAmp) * 0.15;
      st.sBright += (bright - st.sBright) * 0.08;

      if (onset) st.whip = 1;
      st.whip *= Math.exp(-dt * (reduced ? 4 : 7));

      const phaseSpeed = reduced ? 0.12 : 0.2 + 1.4 * (1 - st.sLock);
      const rotSpeed = reduced ? 0.02 : 0.05 + 0.18 * (1 - st.sLock);
      const headSpeed = reduced ? 0.35 : 1.0;
      st.phase += dt * phaseSpeed;
      st.rot += dt * rotSpeed;
      st.head = (st.head + dt * headSpeed) % 1;

      const num = Math.round(st.sKy);
      const detune = st.sKy - num;
      const rich = clamp(st.sBright * (0.3 + 0.7 * st.sLock), 0, 0.8);
      const ampBeam = Math.max(st.sAmp, 0.28);

      const count = buildBeamPath(
        pointsRef.current,
        {
          den: rat.den,
          num,
          detune,
          phase: st.phase,
          rich,
          amp: ampBeam,
          lock: st.sLock,
        },
        MAX_SAMPLES,
      );

      const fadeBase = reduced ? 0.06 : 0.1;
      rendererRef.current?.render({
        points: pointsRef.current,
        count,
        bright: clamp(0.35 + 0.6 * st.sAmp + 0.25 * st.sLock, 0, 1.1),
        lock: st.sLock,
        whip: st.whip,
        head: st.head,
        rot: st.rot,
        fade: fadeBase * (1 - 0.35 * st.sLock),
      });

      // Sing the locked note back through the resonator.
      audio?.setResonance((ROOT * rat.num) / rat.den, st.sLock);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      rendererRef.current?.dispose();
      rendererRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      demoRef.current = null;
    };
  }, []);

  const onStart = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const audio = new ScopeAudio(ROOT);
      await audio.resume();
      audio.start();
      audioRef.current = audio;
      setStarted(true);
      setError(null);

      // Two mic taps on this one gesture: the shared analyser (onset / centroid)
      // and our own time-domain analyser (YIN-lite pitch). Both best-effort.
      const micOk = await audio.startMic();
      try {
        await mic.start();
      } catch {
        /* handled by the hook's error state */
      }
      if (!micOk) {
        setMicNote(
          "Microphone unavailable — the self-demo keeps singing the light.",
        );
      } else {
        setMicNote(null);
      }
    } catch {
      setError("This browser blocked audio. The scope keeps drawing silently.");
    }
  }, [mic]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream · 11776-lissaknot
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Lissajous Knot
          </h1>
          <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            Sing, and your own voice is drawn as living light. A real X-Y
            oscilloscope: hold a clear note and its pitch locks the beam into a
            glowing Lissajous knot; slur or clip it and the figure scribbles and
            whips.
          </p>
          {error ? (
            <p className="mt-3 text-sm leading-relaxed text-destructive">{error}</p>
          ) : null}
          {micNote ? (
            <p className="mt-3 text-sm leading-relaxed text-destructive">{micNote}</p>
          ) : null}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 px-5">
        {!webglOk ? (
          <p className="max-w-md text-center text-sm leading-relaxed text-destructive">
            This browser has no WebGL2, so the vector-scope beam can&apos;t render
            here. Try a recent desktop Chrome, Firefox, or Safari.
          </p>
        ) : (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
            {!started ? (
              <button
                type="button"
                onClick={onStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Sound the scope · sing
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {mic.running ? "Listening · sing a held note" : "Drone · self-demo singing"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Design notes button */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Drawn sound, sung by you
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This is a genuine X-Y vector-scope. The electron beam&apos;s
                horizontal deflection oscillates at the drone-root rate; its
                vertical deflection oscillates at the partial you sing. The pair
                traces a Lissajous figure — the same &ldquo;drawn sound&rdquo;
                tradition as Jerobeam Fenderson&apos;s Oscilloscope Music, the
                macumbista Vector Synthesis toolkit, Norman McLaren&apos;s hand-drawn
                soundtracks, and Ben Laposky&apos;s oscillons.
              </p>
              <p>
                A lightweight in-browser pitch estimator (a YIN-lite
                cumulative-mean-normalized autocorrelation, in the spirit of PESTO
                real-time pitch estimation) tracks the fundamental of your voice
                every frame. When you hold a clear note, its ratio over the root
                snaps to a simple integer ratio — an octave, a fifth, a fourth —
                and the figure crystallizes into a clean, closed knot that blooms
                as additive frames of the same shape accumulate. Let the note waver
                and the true detuned ratio is drawn instead, so the knot precesses
                into a living scribble.
              </p>
              <p>
                The beam is drawn as an additive WebGL2 line strip plus a halo of
                glow points over a slowly fading indigo trail — phosphor
                persistence, so a locked figure holds and morphs rather than
                blinking. A bright head sweeps the loop like a real scanning beam;
                each vocal onset snaps a brief brightness whip through it. There is
                no strobe: the glow only ever swells and decays smoothly, and
                reduced-motion slows the sweep and lengthens the persistence.
              </p>
              <p>
                With no microphone and no audio, a seeded DemoVoice sings a slow
                held-note melody from the moment the page loads, so a muted phone
                still watches knots form and morph. Nothing uses Math.random or the
                wall clock — the demo is identical every visit.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <PrototypeNav slugs={["11776-lissaknot"]} />
    </main>
  );
}
