"use client";

/**
 * 313 · Kids Tone Tower — /dream/313-kids-tone-tower
 *
 * What if a ~4-year-old echoed a growing melody and each correct note STACKED a
 * glowing block onto a tower that grows taller and PERSISTS — while a wrong note
 * makes the top block wobble and slide off (gentle, visible consequence, no
 * punishment)? The consequence of memory is made PHYSICAL: the tower IS the song
 * the child remembered.
 *
 * INPUT:  touch (a row of 4 big colored note-tiles, each ≥96px)
 * OUTPUT: Canvas2D tower-stacking scene (glowing stacked blocks, gentle physics)
 * CORE:   echo-the-sequence memory → block-stacking with persistent growth
 * SCALE:  G-major hexachord; the 4 tiles play G A B D (NOT C-major-pentatonic)
 *
 * Refs: Simon (Milton Bradley, 1978) growing-sequence memory; classic stacking /
 * block-tower toys as a construction metaphor; JMIR Serious Games 2026 on
 * game-based, process-oriented music learning beating pass/fail evaluation in
 * children (the pedagogy behind "wrong costs a block but never ends the game").
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ToneTowerAudio, TILES, SCALE, type NoteName } from "./audio";
import { TowerScene } from "./tower";

// ── Game phases ─────────────────────────────────────────────────────────────
type Phase =
  | "idle" // before Start
  | "demo" // tower sings its current sequence
  | "yourTurn" // child echoes the sequence
  | "celebrate"; // full sequence matched → shimmer + grow

// The tower never topples below this many blocks (the standing base).
const BASE_BLOCKS = 2;

// Initial standing tower (2 blocks) + the initial target sequence to echo.
const INITIAL_TOWER: NoteName[] = ["G3", "B3"];

// Growth notes are drawn ONLY from the 4 playable tiles (G A B D) so the child
// can always echo the note they're given — never an unreachable C/E.
function randScaleNote(): NoteName {
  return TILES[Math.floor(Math.random() * TILES.length)].note;
}

export default function KidsToneTower() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [noAudio, setNoAudio] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [litTile, setLitTile] = useState<NoteName | null>(null);
  // height drives a tiny "how tall" indicator dot row for the grown-up
  const [towerHeight, setTowerHeight] = useState(INITIAL_TOWER.length);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<ToneTowerAudio | null>(null);
  const sceneRef = useRef<TowerScene | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  // ── Game state held in refs (read by handlers + timers, not for render) ──
  const phaseRef = useRef<Phase>("idle");
  const targetRef = useRef<NoteName[]>([...INITIAL_TOWER]); // sequence to echo
  const echoPosRef = useRef(0); // how many notes the child has matched this round
  const wrongCountRef = useRef(0); // wrong taps this round (for generous re-demo)
  const acceptingRef = useRef(false); // are taps currently accepted?
  const timersRef = useRef<number[]>([]);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  // ── Render loop (Canvas2D physics) ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new TowerScene(canvas);
    sceneRef.current = scene;
    scene.setBlocks([...INITIAL_TOWER]);

    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);

    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick);
      const last = lastTsRef.current || ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;
      scene.step(dt);
      scene.draw();
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimers();
      audioRef.current?.dispose();
    };
  }, [clearTimers]);

  // ── Play the current target sequence: the tower "sings" bottom→top ──────
  // `slow` stretches the timing (used after repeated wrong taps — generous).
  const playSequence = useCallback(
    (slow = false) => {
      const audio = audioRef.current;
      const scene = sceneRef.current;
      if (!scene) return;
      setPhaseBoth("demo");
      acceptingRef.current = false;
      scene.setBasePulse(false);

      const seq = targetRef.current;
      const step = slow ? 720 : 480; // ms between notes
      seq.forEach((note, i) => {
        later(() => {
          // Light the matching standing block (bottom→top) and play its note.
          scene?.lightBlock(i);
          if (audio) audio.playNote(SCALE[note], undefined, 0.85);
        }, 250 + i * step);
      });

      // After the demo, hand over to the child.
      later(
        () => {
          echoPosRef.current = 0;
          acceptingRef.current = true;
          scene?.setBasePulse(true);
          setPhaseBoth("yourTurn");
        },
        250 + seq.length * step + 350,
      );
    },
    [later, setPhaseBoth],
  );

  // ── Completing the full sequence: celebrate, GROW by a block, re-demo ────
  // The standing tower == the target sequence. Completing it stacks ONE new
  // glowing block (a random scale note) so the tower is now one taller and the
  // next song to echo is longer. This persistent growth IS the point.
  const runCelebrate = useCallback(() => {
    const audio = audioRef.current;
    const scene = sceneRef.current;
    if (!scene) return;
    acceptingRef.current = false;
    scene.setBasePulse(false);
    setPhaseBoth("celebrate");
    scene.celebrate();

    // Rising arpeggio up the whole tower.
    const seq = targetRef.current;
    seq.forEach((note, i) => {
      later(() => {
        scene?.lightBlock(i);
        if (audio) audio.playNote(SCALE[note], undefined, 0.7);
      }, i * 110);
    });

    // Append a new note → stack the matching block → re-demo the taller song.
    later(() => {
      const grown = randScaleNote();
      targetRef.current = [...targetRef.current, grown];
      scene.stackBlock(grown);
      if (audio) audio.playLand(SCALE[grown]);
      setTowerHeight(scene.count);
      wrongCountRef.current = 0;
      later(() => playSequence(false), 700);
    }, Math.max(800, seq.length * 110 + 500));
  }, [later, playSequence, setPhaseBoth]);

  // ── Handle a child tapping a note-tile ──────────────────────────────────
  const tapTile = useCallback(
    (note: NoteName) => {
      const audio = audioRef.current;
      const scene = sceneRef.current;
      // Immediate feedback always (so a tap never feels dead), even pre-game.
      if (audio) audio.playNote(SCALE[note], undefined, 0.9);
      setLitTile(note);
      window.setTimeout(() => setLitTile((c) => (c === note ? null : c)), 160);

      if (!acceptingRef.current || phaseRef.current !== "yourTurn") return;
      if (!scene) return;

      const target = targetRef.current;
      const pos = echoPosRef.current;
      const expected = target[pos];

      if (note === expected) {
        // CORRECT → the matching block lights up + a soft landing chime. The
        // child is re-affirming the song the tower already holds.
        scene.lightBlock(pos);
        if (audio) audio.playLand(SCALE[note]);
        echoPosRef.current = pos + 1;

        if (echoPosRef.current >= target.length) {
          // Whole sequence echoed → celebrate, then GROW the tower by a block.
          runCelebrate();
        }
      } else {
        // WRONG → the top block wobbles and topples off (gentle "aw"); the song
        // shrinks by one. Never below the starting base blocks.
        wrongCountRef.current += 1;
        acceptingRef.current = false;
        if (target.length > BASE_BLOCKS) {
          targetRef.current = target.slice(0, target.length - 1);
          scene.toppleTop();
          if (audio) audio.playTopple();
          setTowerHeight(scene.count);
        } else if (audio) {
          // Already at the base — gentle "aw" but nothing falls.
          audio.playTopple();
        }

        // Re-play the (now shorter) target from the bottom so the child retries.
        // After 2 wrong taps this round, play it slower so it's easy to follow.
        const slow = wrongCountRef.current >= 2;
        later(() => playSequence(slow), 700);
      }
    },
    [later, playSequence, runCelebrate],
  );

  // ── Start: resume/create audio, self-demo the starting tower ────────────
  const handleStart = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    const audio = new ToneTowerAudio();
    audioRef.current = audio;
    await audio.resume();
    if (!audio.available) setNoAudio(true);

    // Reset to the initial tower + sequence so Start always self-demos cleanly.
    targetRef.current = [...INITIAL_TOWER];
    echoPosRef.current = 0;
    wrongCountRef.current = 0;
    sceneRef.current?.setBlocks([...INITIAL_TOWER]);
    setTowerHeight(INITIAL_TOWER.length);

    playSequence(false);
  }, [playSequence]);

  // ── UI derived state ────────────────────────────────────────────────────
  const started = phase !== "idle";
  const isYourTurn = phase === "yourTurn";

  return (
    <div className="relative min-h-screen bg-[#0b0710] text-foreground flex flex-col overflow-hidden">
      {/* ── Canvas tower scene (fills the screen behind the UI) ── */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ zIndex: 0 }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <Link
            href="/dream"
            className="text-muted-foreground hover:text-foreground text-base font-mono transition-colors"
          >
            ← dream lab
          </Link>
          <div className="flex items-center gap-4">
            {/* tower-height indicator (for the grown-up) */}
            {started && (
              <span
                className="text-muted-foreground text-base font-mono"
                aria-label={`Tower is ${towerHeight} blocks tall`}
              >
                🧱 {towerHeight}
              </span>
            )}
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-muted-foreground hover:text-foreground text-base font-mono transition-colors"
            >
              {showNotes ? "hide notes" : "Read the design notes"}
            </button>
          </div>
        </div>

        {/* Design notes panel + README link */}
        {showNotes && (
          <div className="mx-4 mb-2 p-4 rounded-xl bg-black/70 backdrop-blur border border-border text-base text-foreground space-y-2">
            <p className="text-foreground text-xl font-semibold">Tone Tower</p>
            <p>
              The tower IS the song. Echo the melody the tower sings: each correct
              note stacks a glowing block (the tower grows taller and stays). A
              wrong note makes the top block wobble and slide off — gentle, never
              game-over. Finish the whole song and it grows by one note.
            </p>
            <p className="text-muted-foreground">
              Touch · Canvas2D stacking · echo-the-sequence memory · G-major
              hexachord (tiles play G A B D). Refs: Simon (1978); classic block /
              stacking toys; JMIR Serious Games 2026 (process-over-pass/fail).
            </p>
            <Link
              href="./README.md"
              className="inline-block text-violet-300 hover:text-violet-200 underline text-base"
            >
              Read the full design notes (README.md)
            </Link>
          </div>
        )}

        {/* Audio-unavailable notice (visuals stay alive) */}
        {noAudio && (
          <div className="mx-4 mb-2 p-3 rounded-lg bg-black/60 border border-violet-500/40">
            <p className="text-violet-300 text-base font-mono">
              Sound is not available on this device — the tower still builds, just
              quietly.
            </p>
          </div>
        )}

        {/* Center area (Start button / your-turn cue) */}
        <div className="flex-1 flex flex-col items-center justify-start px-4">
          {!started && (
            <div className="mt-8 flex flex-col items-center gap-5 text-center">
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">
                Tone Tower
              </h1>
              <p className="text-foreground text-base font-mono max-w-xs">
                Listen to the tower&apos;s song, then tap it back. Every note you
                remember builds it taller.
              </p>
              <button
                onClick={handleStart}
                className="min-h-[72px] px-10 py-4 rounded-2xl bg-violet-500 hover:bg-violet-400 active:scale-95 text-[#1a1206] text-xl font-bold shadow-lg shadow-violet-900/50 transition-all"
                style={{ minWidth: 220 }}
              >
                Build it taller ▲
              </button>
            </div>
          )}

          {/* Your-turn cue: a big pulsing pointer, no text gating */}
          {isYourTurn && (
            <div
              className="mt-6 flex items-center gap-3 text-violet-300 text-2xl animate-pulse"
              aria-label="Your turn"
            >
              <span className="text-3xl">👆</span>
              <span className="font-semibold">your turn</span>
            </div>
          )}
        </div>

        {/* ── Bottom: 4 big colored note-tiles (≥96px) ── */}
        <div className="px-3 pb-5 pt-2">
          <div className="flex justify-center gap-3">
            {TILES.map((tile) => {
              const lit = litTile === tile.note;
              return (
                <button
                  key={tile.note}
                  onClick={() => tapTile(tile.note)}
                  className="rounded-2xl active:scale-95 transition-transform touch-none select-none"
                  style={{
                    width: "min(22vw, 120px)",
                    height: 104,
                    minWidth: 96,
                    minHeight: 96,
                    background: tile.color,
                    boxShadow: lit
                      ? `0 0 28px 6px ${tile.color}, inset 0 0 0 4px rgba(255,255,255,0.85)`
                      : `0 6px 0 0 rgba(0,0,0,0.35), inset 0 0 0 2px rgba(255,255,255,0.25)`,
                    transform: lit ? "translateY(2px) scale(0.97)" : undefined,
                  }}
                  aria-label={`note ${tile.note}`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
