"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { BEATS, TOTAL, stateAt } from "./story";
import { createReelScene, type ReelSceneHandle } from "./scene";
import { makeReelAudio, type ReelAudio } from "./audio";

type Phase = "preface" | "running" | "nogl";

const PEAK = 0.14;

// A deterministic, self-contained prefers-reduced-motion check (no cross-folder
// import beyond PrototypeNav is allowed).
function readReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

function timecode(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("preface");
  const [showNotes, setShowNotes] = useState(false);
  const [ended, setEnded] = useState(false);
  const [readout, setReadout] = useState({
    act: BEATS[0].name,
    index: 0,
    tension: 0,
    t: 0,
  });

  // engine state kept out of the React render path
  const sceneRef = useRef<ReelSceneHandle | null>(null);
  const audioRef = useRef<ReelAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const reducedRef = useRef(false);

  // clocks: story time is derived from the audio clock; visual time from a
  // frame counter so the atmosphere drifts even before audio starts.
  const startAudioTimeRef = useRef<number | null>(null);
  const frameRef = useRef(0);
  const readoutClockRef = useRef(0);

  const runFrame = useCallback(() => {
    if (!runningRef.current) return;
    frameRef.current += 1;
    const visualTime = frameRef.current / 60;
    const reduced = reducedRef.current;

    // authoritative story clock (audio-clock derived once playing)
    let storyT = 0;
    const ctx = ctxRef.current;
    if (ctx && startAudioTimeRef.current != null) {
      storyT = ctx.currentTime - startAudioTimeRef.current;
    }
    const atEnd = storyT >= TOTAL;
    if (storyT < 0) storyT = 0;
    if (storyT > TOTAL) storyT = TOTAL;

    const st = stateAt(storyT);

    // the ONE shared tension signal drives both engines
    const audio = audioRef.current;
    if (audio) {
      audio.setState(st.beat, st.tension);
      audio.schedule();
    }
    const scene = sceneRef.current;
    if (scene) {
      scene.update(
        visualTime,
        st.tension,
        st.shadow,
        st.mid,
        st.hi,
        st.turb,
        st.fog,
        reduced,
      );
    }

    readoutClockRef.current += 1;
    if (readoutClockRef.current >= 8) {
      readoutClockRef.current = 0;
      setReadout({
        act: st.beat.name,
        index: st.index,
        tension: Math.round(st.tension * 100),
        t: storyT,
      });
      if (atEnd) setEnded(true);
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // mount: build the scene, start the idle render loop (audio waits for a gesture)
  useEffect(() => {
    reducedRef.current = readReducedMotion();

    const mount = mountRef.current;
    if (mount) {
      const scene = createReelScene(mount);
      if (scene) {
        sceneRef.current = scene;
      } else {
        setPhase((p) => (p === "running" ? p : "nogl"));
      }
    }

    runningRef.current = true;
    frameRef.current = 0;
    rafRef.current = requestAnimationFrame(runFrame);

    return () => {
      runningRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (audioRef.current) {
        audioRef.current.stop();
        audioRef.current = null;
      }
      if (ctxRef.current) {
        const c = ctxRef.current;
        ctxRef.current = null;
        setTimeout(() => {
          c.close().catch(() => {});
        }, 700);
      }
      if (sceneRef.current) {
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
    };
  }, [runFrame]);

  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // gesture: open the AudioContext and roll the reel from the top
  const begin = useCallback(() => {
    if (!audioRef.current) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const ctx = new AC();
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        ctxRef.current = ctx;
        audioRef.current = makeReelAudio(ctx, PEAK);
        startAudioTimeRef.current = ctx.currentTime;
      } catch {
        audioRef.current = null;
      }
    }
    setEnded(false);
    setPhase((p) => (p === "nogl" ? p : "running"));
  }, []);

  const restart = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx) startAudioTimeRef.current = ctx.currentTime;
    audioRef.current?.reseat();
    setEnded(false);
  }, []);

  const jumpTo = useCallback((index: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    startAudioTimeRef.current = ctx.currentTime - BEATS[index].tStart;
    audioRef.current?.reseat();
    setEnded(false);
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-black text-foreground">
      {/* WebGL cinematic field */}
      <div ref={mountRef} className="absolute inset-0 block h-full w-full" />

      {/* cinematic letterbox bars (art framing, non-interactive) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[6vh] bg-gradient-to-b from-black to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[6vh] bg-gradient-to-t from-black to-transparent" />

      {/* preface / start overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-6 backdrop-blur-[2px]">
          <div className="max-w-xl text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Reel — a wordless short film
            </h1>
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
              An alternate journey engine: instead of a psychedelic arc, a
              self-playing five-minute film whose music and image both obey a
              classic dramatic beat sheet — Setup, Inciting Incident, Rising
              Action, Midpoint, Climax, Falling Action, Resolution.
            </p>
            {phase === "nogl" && (
              <p className="mt-6 text-base text-destructive">
                This device could not open a WebGL context, so the atmosphere
                cannot be drawn — but you can still press Play and the score will
                walk the whole arc.
              </p>
            )}
            <button
              type="button"
              onClick={begin}
              className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Play the reel
            </button>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowNotes((s) => !s)}
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {showNotes ? "Hide design notes" : "Design notes"}
              </button>
            </div>
            {showNotes && (
              <div className="mt-4 max-h-[44vh] overflow-y-auto rounded-md border border-border bg-background/70 p-5 text-left text-sm leading-relaxed text-muted-foreground">
                <p>
                  A beat-sheet state machine (Freytag&rsquo;s Pyramid; Blake
                  Snyder&rsquo;s <em>Save the Cat!</em>) assigns each act a
                  target dramatic tension, a key and mode, a tempo, and a color
                  grade. One smooth tension curve is interpolated between the
                  beats and is the single signal read by both the generative
                  score and the shader — so image and music never disagree.
                </p>
                <p className="mt-3">
                  A recurring motif carries the memory of the piece: stated
                  plainly in the Setup, driven through the Rising Action,
                  inverted an octave up at the Climax, and finally slowed to land
                  on the tonic in the Resolution — which returns to the home key
                  of the opening. The harmony literally comes home, so minute
                  five is genuinely a different place than minute one.
                </p>
                <p className="mt-3">
                  Deterministic and headless: a seeded PRNG powers every
                  generative choice and all timing comes from the audio clock, so
                  the reel plays itself the same way every time. It builds Web
                  Audio only on this gesture, keeps master gain low through a
                  compressor, and honours reduced-motion by calming the camera.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-5 top-[7vh] z-20 select-none">
            <div className="text-2xl font-semibold tracking-tight text-foreground">
              Reel
            </div>
            <div className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-primary">
              {readout.index + 1}/{BEATS.length} · {readout.act}
              {ended ? " · fin" : ""}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {timecode(readout.t)} / {timecode(TOTAL)} · tension {readout.tension}
              %
            </div>
            {/* tension / progress indicator */}
            <div className="mt-3 h-1 w-44 overflow-hidden rounded-full bg-primary/20">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.round((readout.t / TOTAL) * 100)}%` }}
              />
            </div>
          </div>

          {/* transport: restart + jump to any act */}
          <div className="absolute inset-x-0 bottom-[7vh] z-20 flex flex-wrap items-center justify-center gap-1.5 px-4">
            <button
              type="button"
              onClick={restart}
              className="min-h-[36px] rounded-md bg-primary/20 px-3 text-xs font-medium text-foreground transition-colors hover:bg-primary/30"
            >
              Restart
            </button>
            {BEATS.map((b, i) => (
              <button
                key={b.name}
                type="button"
                onClick={() => jumpTo(i)}
                className={`min-h-[36px] rounded-md px-3 font-mono text-xs transition-colors ${
                  i === readout.index
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/20 text-foreground hover:bg-primary/30"
                }`}
                title={`Jump to ${b.name}`}
              >
                {b.name.split(" ")[0]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="absolute right-5 top-[7vh] z-20 text-sm text-primary underline-offset-4 hover:underline"
          >
            {showNotes ? "Hide notes" : "Design notes"}
          </button>
          {showNotes && (
            <div className="absolute right-5 top-[13vh] z-20 max-h-[60vh] w-[min(22rem,80vw)] overflow-y-auto rounded-md border border-border bg-background/80 p-5 text-left text-sm leading-relaxed text-muted-foreground backdrop-blur-md">
              <p>
                One dramatic-tension curve, interpolated across a Freytag /
                Save-the-Cat beat sheet, drives both the score and the shader.
                The motif you heard in the Setup returns inverted at the Climax
                and resolves, in the home key, at the end.
              </p>
              <p className="mt-3">
                Jump between acts with the chips below, or press Restart to roll
                from the top. It plays itself with no input.
              </p>
            </div>
          )}
        </>
      )}

      <PrototypeNav slugs={["1638-reel"]} />
    </main>
  );
}
