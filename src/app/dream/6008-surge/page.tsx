"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  DROP_TIME,
  SECTIONS,
  TOTAL_TIME,
  energyAt,
  sectionAt,
} from "./arrangement";
import { SAMPLES } from "./shaders";
import {
  disposeRig,
  drawRidge,
  makeGLRig,
  uploadStatic,
  type Rig,
} from "./render";
import { makeSurgeAudio, type SurgeAudio } from "./synth";

type Mode = "idle" | "playing";

export default function SurgePage() {
  const [mode, setMode] = useState<Mode>("idle");
  const [noGL, setNoGL] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [section, setSection] = useState(SECTIONS[0].name);
  const [energyPct, setEnergyPct] = useState(Math.round(energyAt(0) * 100));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<Rig | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<SurgeAudio | null>(null);
  const rafRef = useRef<number>(0);

  const modeRef = useRef<Mode>("idle");
  const reduceRef = useRef(false);
  const idleTimeRef = useRef(0); // playhead seconds while not playing (scrub)

  // static arrangement data for the shader (computed once)
  const staticData = useMemo(() => {
    const energy = new Float32Array(SAMPLES);
    const hot = new Float32Array(SAMPLES);
    for (let i = 0; i < SAMPLES; i++) {
      const t = (i / (SAMPLES - 1)) * TOTAL_TIME;
      energy[i] = energyAt(t);
      hot[i] = sectionAt(t).isDrop ? 1 : 0;
    }
    const sec = new Float32Array(8).fill(-1);
    SECTIONS.forEach((s, i) => {
      if (i < 8) sec[i] = s.startTime / TOTAL_TIME;
    });
    return { energy, hot, sec, secN: Math.min(8, SECTIONS.length) };
  }, []);

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const rig = rigRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.75, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    if (rig) rig.gl.viewport(0, 0, canvas.width, canvas.height);
  }, []);

  // single rAF loop — draws the ridge whether idle (static/scrub) or playing.
  const runFrame = useCallback((ts: number) => {
    const rig = rigRef.current;
    const audio = audioRef.current;
    const reduce = reduceRef.current;

    const t =
      modeRef.current === "playing" && audio
        ? audio.playheadTime()
        : idleTimeRef.current;
    const e = energyAt(t);
    const pump = audio && modeRef.current === "playing" ? audio.visualPump() : 0;

    if (rig) {
      drawRidge(rig, {
        time: ts / 1000,
        playhead: t / TOTAL_TIME,
        playE: e,
        pump: reduce ? pump * 0.4 : pump,
        reduce,
      });
    }

    const s = sectionAt(t);
    setSection((prev) => (prev === s.name ? prev : s.name));
    setEnergyPct((prev) => {
      const v = Math.round(e * 100);
      return prev === v ? prev : v;
    });

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // mount: reduced-motion, GL rig, static draw, rAF, resize listener
  useEffect(() => {
    reduceRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const canvas = canvasRef.current;
    if (canvas) {
      const rig = makeGLRig(canvas);
      if (rig) {
        rigRef.current = rig;
        resize();
        uploadStatic(
          rig,
          staticData.energy,
          staticData.hot,
          staticData.sec,
          staticData.secN,
        );
      } else {
        setNoGL(true);
      }
    } else {
      setNoGL(true);
    }

    rafRef.current = requestAnimationFrame(runFrame);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [resize, runFrame, staticData]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        window.setTimeout(() => {
          if (ac.state !== "closed") void ac.close();
        }, 400);
      }
      acRef.current = null;
      if (rigRef.current) disposeRig(rigRef.current);
      rigRef.current = null;
    };
  }, []);

  // AudioContext is created ONLY inside a user gesture (autoplay-safe).
  const ensureAudio = useCallback(async () => {
    if (audioRef.current) {
      if (acRef.current?.state === "suspended") await acRef.current.resume();
      return audioRef.current;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;
    const audio = makeSurgeAudio(ac, 0.18);
    audioRef.current = audio;
    return audio;
  }, []);

  const play = useCallback(async () => {
    const audio = await ensureAudio();
    audio.seek(idleTimeRef.current);
    audio.start();
    modeRef.current = "playing";
    setMode("playing");
  }, [ensureAudio]);

  const jumpToDrop = useCallback(async () => {
    idleTimeRef.current = DROP_TIME;
    if (modeRef.current === "playing") {
      audioRef.current?.seek(DROP_TIME);
    } else {
      await play();
      audioRef.current?.seek(DROP_TIME);
    }
  }, [play]);

  // scrub / seek on the timeline (tap or drag)
  const seekFromClientX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = u * TOTAL_TIME;
    idleTimeRef.current = t;
    if (modeRef.current === "playing") audioRef.current?.seek(t);
  }, []);

  const draggingRef = useRef(false);
  const onPointerDown = useCallback(
    (ev: React.PointerEvent) => {
      draggingRef.current = true;
      (ev.target as Element).setPointerCapture?.(ev.pointerId);
      seekFromClientX(ev.clientX);
    },
    [seekFromClientX],
  );
  const onPointerMove = useCallback(
    (ev: React.PointerEvent) => {
      if (draggingRef.current) seekFromClientX(ev.clientX);
    },
    [seekFromClientX],
  );
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const playing = mode === "playing";

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="fixed inset-0 h-full w-full cursor-ew-resize touch-none"
      />

      {/* section labels along the timeline (read as structure while silent) */}
      <div className="pointer-events-none fixed inset-x-0 top-[38%] z-10">
        {SECTIONS.map((s) => {
          const left = ((s.startTime + s.endTime) / 2 / TOTAL_TIME) * 100;
          return (
            <span
              key={s.name}
              style={{ left: `${left}%` }}
              className={`absolute -translate-x-1/2 whitespace-nowrap font-mono text-xs uppercase tracking-[0.18em] ${
                s.isDrop ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {s.name}
            </span>
          );
        })}
      </div>

      {noGL && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base leading-relaxed text-destructive">
            WebGL2 is unavailable here, so the energy ridge cannot render — but
            the build-and-drop arc still plays. Try a recent desktop Chrome,
            Firefox or Safari to see the visual.
          </p>
        </div>
      )}

      {/* top-left: title, description, controls */}
      <div className="fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Surge
        </h1>
        <p className="mt-2 text-base leading-relaxed text-foreground">
          A Resonance session as an EDM build-and-drop — a through-composed
          journey where tension racks up across a build, a snare-roll riser
          subdivides, and the whole floor drops.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            onClick={play}
            disabled={playing}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {playing ? "Playing" : "Play"}
          </button>
          <button
            onClick={jumpToDrop}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Jump to the drop
          </button>
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {playing
            ? `${section} · energy ${energyPct}%`
            : "tap play — or scrub the ridge to seek"}
        </p>
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="fixed bottom-16 right-4 z-30 max-w-sm rounded-lg border border-border bg-popover/90 p-5 shadow-lg backdrop-blur-md">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Design notes
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            One scalar automation curve, ENERGY(t), both drives the arrangement
            (which layers gate on, the master lowpass cutoff, note density, the
            sidechain pump) and is the picture you see — the energy ridge. The
            arrangement is a 124 BPM, 16-bar phrase grid: Intro, Build,
            Breakdown, DROP, Build II, Drop II, Outro.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The 16-bar phrase as the unit of build-and-drop dramaturgy follows
            Mark J. Butler, <em>Unlocking the Groove</em> (2006). A 16th-note
            look-ahead Web Audio scheduler places every hit against the audio
            clock; the snare-roll riser subdivides from 16ths toward 32nds as
            the build peaks. Everything generative is seeded (0x6008) — no
            wall-clock, no randomness at runtime.
          </p>
        </div>
      )}

      <PrototypeNav slugs={["6008-surge"]} />
    </main>
  );
}
