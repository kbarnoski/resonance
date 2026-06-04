"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 311 · Kids Music Box — a physical sequencer you build and that REMEMBERS.
//
// A slowly-rotating 3D music-box cylinder studded with pins. A fixed comb at the
// front plucks each pin as it turns past. The child taps slots on the front of
// the cylinder (columns = time steps around the circumference, rows = pitches
// along its length) to add or remove pins. The loop keeps playing, the child
// rearranges it, and the pattern PERSISTS to localStorage — so what they made is
// remembered and grows over the session. A little machine they built, not a
// momentary forgettable wash.
//
// Reference: the Swiss cylinder musical box (pinned rotating cylinder plucking a
// steel comb, Geneva ~1796). Timbre: Karplus-Strong plucked-string synthesis.
// Scale: D Lydian hexachord (bright, consonant) — explicitly NOT C-major-pent.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { MusicBoxAudio, ROW_COLORS } from "./ks-audio";
import { MusicBoxCanvas } from "./cylinder";
import {
  clearStored,
  loadPattern,
  makeEmptyPattern,
  makeSeedPattern,
  Pattern,
  savePattern,
} from "./store";

function detectWebGL(): boolean {
  if (typeof window === "undefined") return true; // assume yes during SSR
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

export default function Page() {
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [version, setVersion] = useState(0); // bumps so studs re-render
  const [webgl, setWebgl] = useState(true);
  const [audioOk, setAudioOk] = useState(true);

  // The pattern lives in a ref (read every animation frame by the scene) plus a
  // version counter (so React re-renders the studs). The ref is the source of
  // truth; persistence mirrors it.
  const patternRef = useRef<Pattern>(makeEmptyPattern());
  const audioRef = useRef<MusicBoxAudio | null>(null);

  useEffect(() => {
    setWebgl(detectWebGL());
  }, []);

  // Toggle a pin: mutate the ref, bump version, persist.
  const onToggle = useCallback((row: number, step: number) => {
    const p = patternRef.current;
    if (!p[row]) return;
    p[row][step] = !p[row][step];
    savePattern(p);
    setVersion((v) => v + 1);
  }, []);

  const runStart = useCallback(async () => {
    // Build / unlock audio on the user gesture.
    const audio = new MusicBoxAudio();
    const ok = audio.init();
    if (!ok) {
      setAudioOk(false);
    } else {
      await audio.resume();
      audioRef.current = audio;
    }

    // Load saved pattern, or seed a simple already-singing tune so the box is
    // alive at a glance.
    const saved = loadPattern();
    if (saved) {
      patternRef.current = saved;
    } else {
      const seed = makeSeedPattern();
      patternRef.current = seed;
      savePattern(seed);
    }
    setVersion((v) => v + 1);
    setStarted(true);
  }, []);

  const runClear = useCallback(() => {
    patternRef.current = makeEmptyPattern();
    clearStored();
    setVersion((v) => v + 1);
  }, []);

  // Dispose audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#1a120b] text-white">
      {/* 3D scene */}
      {started && webgl && (
        <div className="absolute inset-0">
          <MusicBoxCanvas
            patternRef={patternRef}
            audioRef={audioRef}
            onToggle={onToggle}
            version={version}
            paused={paused}
          />
        </div>
      )}

      {/* WebGL fallback */}
      {started && !webgl && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">
            This music box needs WebGL to draw its spinning cylinder, and your
            browser does not seem to have it. Try a different browser or device.
          </p>
        </div>
      )}

      {/* Top caption (adults) + paint legend */}
      {started && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-3 p-4">
          <h1 className="text-2xl font-semibold text-white/95 drop-shadow">
            Build a Music Box
          </h1>
          <p className="max-w-lg text-center text-base text-white/75">
            Tap the spinning barrel to place little pins. The comb plucks each
            pin as it rolls past — your tune keeps looping and is remembered.
          </p>
          {/* color = pitch legend */}
          <div className="flex gap-2">
            {ROW_COLORS.map((c, i) => (
              <span
                key={i}
                className="h-3 w-7 rounded-full"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Controls: pause + clear. Big friendly tap targets. */}
      {started && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 p-6">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="min-h-[44px] rounded-full bg-violet-500/20 px-6 py-2.5 text-base font-medium text-violet-300 backdrop-blur transition hover:bg-violet-500/30"
            aria-label={paused ? "Play the music box" : "Pause the music box"}
          >
            {paused ? "▶ Spin" : "⏸ Hold"}
          </button>
          <button
            type="button"
            onClick={runClear}
            className="min-h-[44px] rounded-full bg-white/10 px-6 py-2.5 text-base font-medium text-white/80 backdrop-blur transition hover:bg-white/20"
            aria-label="Clear all pins and start fresh"
          >
            🧹 Start fresh
          </button>
        </div>
      )}

      {/* Start / unlock screen */}
      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-[#1a120b] p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <span className="text-5xl" aria-hidden>
              🎶
            </span>
            <h1 className="text-2xl font-semibold text-white/95">
              Kids Music Box
            </h1>
            <p className="max-w-md text-base text-white/75">
              Tap the spinning barrel to stud it with pins. A comb plucks each
              pin as it turns — building a little looping tune that the box
              remembers, even after you come back.
            </p>
            <p className="max-w-md text-base text-white/55">
              No reading needed: colors are the notes, and the studs you tap are
              the melody.
            </p>
          </div>
          {!audioOk && (
            <p className="max-w-md text-base text-rose-300">
              Sound is not available in this browser, but you can still build
              and watch the box spin.
            </p>
          )}
          <button
            type="button"
            onClick={runStart}
            className="min-h-[56px] rounded-full bg-violet-500/20 px-10 py-3.5 text-2xl font-semibold text-violet-300 transition hover:bg-violet-500/30"
          >
            Start
          </button>
        </div>
      )}

      {/* design notes link (lab convention) */}
      <Link
        href="/dream/311-kids-music-box/README.md"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-2 right-3 z-20 text-sm text-white/55 hover:text-white/80"
      >
        Read the design notes
      </Link>
    </main>
  );
}
