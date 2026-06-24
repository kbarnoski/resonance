"use client";

// 902-harmonic-mirror — "Harmonic Mirror".
// What if, as you play, your instrument COMPLETES the chord you imply — adding the
// 1–2 notes you didn't play, tuned in pure JUST INTONATION to your root — so the
// harmony locks beat-lessly under your hands?
//
// You play (Web MIDI / on-screen piano / computer keyboard) -> warm detuned-saw
// EQUAL-TEMPERED voices. A chord-template inference (a slice of Riemann functional
// harmony) names the chord; a MIRROR adds the missing 1–2 voices in JUST INTONATION
// relative to the inferred root (small-integer ratios) so they beat-lessly lock. When
// the root shifts the mirror voices GLIDE-RETUNE. A Canvas2D circle-of-fifths
// constellation shows held notes (bright) + mirror notes (halo'd) joined by ratio-
// labeled completion lines, all amplitude-pulsing at 60fps.
//
// Subsystems: (1) MIDI/keyboard/on-screen input, (2) chord-template inference,
// (3) just-intonation synthesis with glide-retune, (4) Canvas2D constellation viz.

import { useCallback, useEffect, useRef, useState } from "react";
import { HarmonicMirrorAudio } from "./audio";
import {
  inferChord,
  InferredChord,
  midiToFreqET,
  jiFreq,
  NOTE_NAMES,
  pcAngle,
} from "./harmony";

// Computer-keyboard map: one octave, white + black keys interleaved.
// a w s e d f t g y h u j k -> C C# D D# E F F# G G# A A# B C(+12)
const KEY_TO_OFFSET: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

const BASE_MIDI = 60; // middle C for the on-screen / keyboard octave

// On-screen piano layout: white keys with black keys overlaid.
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12];
const BLACK_OFFSETS = [1, 3, -1, 6, 8, 10]; // -1 = gap after E
const WHITE_LABELS = ["C", "D", "E", "F", "G", "A", "B", "C"];

// Auto-demo: I–vi–IV–V in C, each chord as a short arpeggio through the pipeline.
const DEMO_CHORDS: number[][] = [
  [60, 64, 67], // C  (I)
  [57, 60, 64], // Am (vi)
  [53, 57, 60], // F  (IV)
  [55, 59, 62], // G  (V)
];

type AudioPhase = "idle" | "ready" | "error";

export default function HarmonicMirrorPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HarmonicMirrorAudio | null>(null);
  const rafRef = useRef<number>(0);

  // Held notes (MIDI numbers) — the source of truth for inference.
  const heldRef = useRef<Set<number>>(new Set());
  const chordRef = useRef<InferredChord | null>(null);
  const lastInteractRef = useRef<number>(0);
  const demoActiveRef = useRef<boolean>(true);
  const demoStepRef = useRef<number>(0);
  const demoNextAtRef = useRef<number>(0);
  const demoHeldRef = useRef<number[]>([]);

  const [audioPhase, setAudioPhase] = useState<AudioPhase>("idle");
  const [midiNotice, setMidiNotice] = useState<string | null>(null);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [chordName, setChordName] = useState<string>("—");
  const [mirrorInfo, setMirrorInfo] = useState<string>("");
  const [started, setStarted] = useState(false);

  // Ensure audio is running (called on first user gesture).
  const ensureAudio = useCallback(async (): Promise<HarmonicMirrorAudio | null> => {
    if (audioRef.current) {
      await audioRef.current.resume();
      return audioRef.current;
    }
    try {
      const a = new HarmonicMirrorAudio();
      await a.resume();
      audioRef.current = a;
      setAudioPhase("ready");
      return a;
    } catch {
      setAudioNotice(
        "Web Audio could not start — the visuals still run, but there's no sound."
      );
      setAudioPhase("error");
      return null;
    }
  }, []);

  // Re-run inference over the current held set and update played-derived mirror.
  const recompute = useCallback(() => {
    const a = audioRef.current;
    const held = [...heldRef.current];
    const chord = inferChord(held);
    chordRef.current = chord;

    if (!chord) {
      setChordName("—");
      setMirrorInfo("");
      a?.clearMirror();
      return;
    }
    setChordName(chord.name);

    // Build the JI mirror voices for the completion intervals.
    const targets = chord.completions.map((c) => ({
      id: `m${c.interval}`,
      freq: jiFreq(chord.rootMidi, c.interval),
    }));
    a?.setMirror(targets);

    if (chord.completions.length === 0) {
      setMirrorInfo("chord already complete — no voices added");
    } else {
      const parts = chord.completions
        .map((c) => {
          const pc = (chord.rootPc + c.interval) % 12;
          return `${NOTE_NAMES[pc]} (${c.ratioLabel})`;
        })
        .join("  +  ");
      setMirrorInfo(`mirror adds  ${parts}  in just intonation`);
    }
  }, []);

  // Note on / off shared by all input sources.
  const noteOn = useCallback(
    (midi: number, velocity = 0.8) => {
      if (demoActiveRef.current) {
        demoActiveRef.current = false; // first real input stops the demo
        demoStopAll();
      }
      lastInteractRef.current = performance.now();
      heldRef.current.add(midi);
      audioRef.current?.playNoteOn(`p${midi}`, midiToFreqET(midi), velocity);
      recompute();
    },
    [recompute] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const noteOff = useCallback(
    (midi: number) => {
      lastInteractRef.current = performance.now();
      heldRef.current.delete(midi);
      audioRef.current?.playNoteOff(`p${midi}`);
      recompute();
    },
    [recompute]
  );

  // Stop any demo-held notes immediately.
  const demoStopAll = () => {
    for (const m of demoHeldRef.current) {
      heldRef.current.delete(m);
      audioRef.current?.playNoteOff(`p${m}`);
    }
    demoHeldRef.current = [];
    recompute();
  };

  // ---- Web MIDI -----------------------------------------------------------
  useEffect(() => {
    const attached: MIDIInput[] = [];

    const onMessage = (e: MIDIMessageEvent) => {
      if (!e.data) return;
      const [status, note, vel] = e.data;
      const cmd = status & 0xf0;
      ensureAudio().then(() => {
        if (cmd === 0x90 && vel > 0) noteOn(note, vel / 127);
        else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteOff(note);
      });
    };

    if (!navigator.requestMIDIAccess) {
      setMidiNotice(
        "No Web MIDI in this browser — use the on-screen piano or your computer keyboard below."
      );
    } else {
      navigator
        .requestMIDIAccess()
        .then((acc) => {
          let count = 0;
          acc.inputs.forEach((input) => {
            count += 1;
            input.addEventListener("midimessage", onMessage as EventListener);
            attached.push(input);
          });
          if (count === 0) {
            setMidiNotice(
              "Web MIDI is on, but no device is connected — use the on-screen piano or keyboard."
            );
          } else {
            setMidiNotice(null);
          }
        })
        .catch(() => {
          setMidiNotice(
            "MIDI access was denied — use the on-screen piano or your computer keyboard below."
          );
        });
    }

    return () => {
      for (const input of attached) {
        input.removeEventListener("midimessage", onMessage as EventListener);
      }
    };
  }, [ensureAudio, noteOn, noteOff]);

  // ---- Computer keyboard --------------------------------------------------
  useEffect(() => {
    const downKeys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (!(k in KEY_TO_OFFSET)) return;
      e.preventDefault();
      if (downKeys.has(k)) return;
      downKeys.add(k);
      const midi = BASE_MIDI + KEY_TO_OFFSET[k];
      ensureAudio().then(() => noteOn(midi));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in KEY_TO_OFFSET)) return;
      downKeys.delete(k);
      noteOff(BASE_MIDI + KEY_TO_OFFSET[k]);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [ensureAudio, noteOn, noteOff]);

  // ---- Auto-demo + animation loop -----------------------------------------
  useEffect(() => {
    demoNextAtRef.current = performance.now() + 1800;

    const runDemoStep = (now: number) => {
      if (!demoActiveRef.current) return;
      // Only start the demo after ~2s of silence from the start.
      if (now < demoNextAtRef.current) return;
      // Release previous demo chord.
      for (const m of demoHeldRef.current) {
        heldRef.current.delete(m);
        audioRef.current?.playNoteOff(`p${m}`);
      }
      const chord = DEMO_CHORDS[demoStepRef.current % DEMO_CHORDS.length];
      // Arpeggiate: only the chord WITHOUT one member, so the mirror visibly
      // completes it. Drop the third to make the JI completion obvious.
      const partial = [chord[0], chord[2]]; // root + fifth (drop the third)
      demoHeldRef.current = partial;
      for (const m of partial) {
        heldRef.current.add(m);
        audioRef.current?.playNoteOn(`p${m}`, midiToFreqET(m), 0.5);
      }
      recompute();
      demoStepRef.current += 1;
      demoNextAtRef.current = now + 1700;
    };

    const draw = () => {
      const now = performance.now();
      // Restart demo if idle ~2s with nothing held and demo was stopped by silence.
      if (
        !demoActiveRef.current &&
        heldRef.current.size === 0 &&
        now - lastInteractRef.current > 2000 &&
        lastInteractRef.current > 0
      ) {
        demoActiveRef.current = true;
        demoStepRef.current = 0;
        demoNextAtRef.current = now + 200;
      }
      if (demoActiveRef.current) runDemoStep(now);

      drawConstellation(now);
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recompute]);

  // ---- Canvas2D constellation ---------------------------------------------
  const drawConstellation = useCallback((now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (
      canvas.width !== Math.floor(w * dpr) ||
      canvas.height !== Math.floor(h * dpr)
    ) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background near-black with faint violet vignette.
    ctx.fillStyle = "#08070c";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.36;

    // Ring of the 12 pitch-class anchor points (circle of fifths).
    ctx.strokeStyle = "rgba(167,139,250,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    const audio = audioRef.current;
    const levels = audio
      ? audio.sampleLevels()
      : { played: new Map<string, number>(), mirror: new Map<string, number>() };

    const pcPos = (pc: number) => {
      const ang = pcAngle(pc);
      return { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R };
    };

    // Faint labels for all 12 anchors.
    ctx.font =
      "12px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let pc = 0; pc < 12; pc += 1) {
      const p = pcPos(pc);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      const lp = pcPos(pc);
      const out = 1.16;
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      ctx.fillText(
        NOTE_NAMES[pc],
        cx + (lp.x - cx) * out,
        cy + (lp.y - cy) * out
      );
    }

    const held = [...heldRef.current];
    const chord = chordRef.current;
    const pulse = 1 + 0.12 * Math.sin(now * 0.006);

    // Map a played-voice level by pitch class (max over octaves).
    const pcLevelPlayed = (pc: number) => {
      let lv = 0;
      for (const [id, l] of levels.played) {
        const m = parseInt(id.slice(1), 10);
        if (((m % 12) + 12) % 12 === pc) lv = Math.max(lv, l);
      }
      return lv;
    };

    if (chord) {
      const rootPos = pcPos(chord.rootPc);

      // Completion lines from root -> mirror PCs, with ratio labels.
      for (const c of chord.completions) {
        const pc = (chord.rootPc + c.interval) % 12;
        const mp = pcPos(pc);
        const lv =
          levels.mirror.get(`m${c.interval}`) ?? 0;
        const glow = 0.35 + lv * 4;
        ctx.strokeStyle = `rgba(167,139,250,${Math.min(0.9, glow)})`;
        ctx.lineWidth = 1.5 + lv * 8;
        ctx.beginPath();
        ctx.moveTo(rootPos.x, rootPos.y);
        ctx.lineTo(mp.x, mp.y);
        ctx.stroke();

        // Mirror halo node.
        const halo = (8 + lv * 40) * pulse;
        const grad = ctx.createRadialGradient(
          mp.x,
          mp.y,
          0,
          mp.x,
          mp.y,
          halo
        );
        grad.addColorStop(0, "rgba(196,181,253,0.85)");
        grad.addColorStop(0.4, "rgba(167,139,250,0.35)");
        grad.addColorStop(1, "rgba(167,139,250,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mp.x, mp.y, halo, 0, Math.PI * 2);
        ctx.fill();

        // Ratio label at the midpoint of the completion line.
        const midx = (rootPos.x + mp.x) / 2;
        const midy = (rootPos.y + mp.y) / 2;
        ctx.fillStyle = "rgba(221,214,254,0.95)";
        ctx.font =
          "13px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText(c.ratioLabel, midx, midy);
      }

      // Bright held nodes.
      for (const m of held) {
        const pc = ((m % 12) + 12) % 12;
        const p = pcPos(pc);
        const lv = pcLevelPlayed(pc);
        const r = (7 + lv * 30) * pulse;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r + 6);
        grad.addColorStop(0, "rgba(255,255,255,0.98)");
        grad.addColorStop(0.5, "rgba(221,214,254,0.6)");
        grad.addColorStop(1, "rgba(167,139,250,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center chord name.
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.font =
        "600 30px ui-serif, Georgia, 'Times New Roman', serif";
      ctx.fillText(chord.name, cx, cy - 6);
      ctx.fillStyle = "rgba(196,181,253,0.75)";
      ctx.font =
        "13px ui-monospace, SFMono-Regular, Menlo, monospace";
      const jiTxt =
        chord.completions.length > 0
          ? chord.completions.map((c) => c.ratioLabel).join("  ")
          : "complete";
      ctx.fillText(jiTxt, cx, cy + 20);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.40)";
      ctx.font = "16px ui-monospace, monospace";
      ctx.fillText("play a note", cx, cy);
    }
  }, []);

  // ---- Teardown -----------------------------------------------------------
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  // ---- On-screen piano interaction ----------------------------------------
  const pressKey = useCallback(
    (offset: number) => {
      ensureAudio().then(() => {
        setStarted(true);
        noteOn(BASE_MIDI + offset);
      });
    },
    [ensureAudio, noteOn]
  );
  const releaseKey = useCallback(
    (offset: number) => {
      noteOff(BASE_MIDI + offset);
    },
    [noteOff]
  );

  return (
    <main className="min-h-screen bg-[#08070c] text-white px-5 py-8 md:px-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <h1 className="font-serif text-3xl md:text-4xl text-white">
            Harmonic Mirror
          </h1>
          <p className="mt-2 text-base text-white/75 max-w-2xl">
            Play, and your instrument completes the chord you imply — adding the
            1–2 notes you didn&apos;t play, tuned in pure{" "}
            <span className="text-violet-300">just intonation</span> to your
            root, so the harmony locks beat-lessly under your hands.
          </p>
        </header>

        {midiNotice && (
          <p className="mb-3 text-base text-rose-300">{midiNotice}</p>
        )}
        {audioNotice && (
          <p className="mb-3 text-base text-rose-300">{audioNotice}</p>
        )}

        {!started && audioPhase === "idle" && (
          <button
            type="button"
            onClick={() => {
              ensureAudio().then(() => setStarted(true));
            }}
            className="mb-4 min-h-[44px] rounded-lg bg-violet-500/20 px-4 py-2.5 text-base text-violet-200 hover:bg-violet-500/30 transition-colors"
          >
            Tap to enable sound, then play
          </button>
        )}

        <div className="relative rounded-xl overflow-hidden border border-white/10">
          <canvas
            ref={canvasRef}
            className="block w-full"
            style={{ height: "min(56vh, 460px)" }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="text-base text-white/95">
            Chord:{" "}
            <span className="font-mono text-violet-200">{chordName}</span>
          </span>
          <span className="text-base text-white/75 font-mono">
            {mirrorInfo}
          </span>
        </div>

        {/* On-screen piano */}
        <div className="mt-5">
          <div className="relative select-none" style={{ height: 150 }}>
            {/* white keys */}
            <div className="flex h-full gap-1">
              {WHITE_OFFSETS.map((off, i) => (
                <button
                  key={`w${i}`}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    pressKey(off);
                  }}
                  onPointerUp={() => releaseKey(off)}
                  onPointerLeave={(e) => {
                    if (e.buttons) releaseKey(off);
                  }}
                  className="flex-1 min-h-[44px] rounded-b-md bg-white/90 hover:bg-white active:bg-violet-200 flex items-end justify-center pb-2 text-sm font-mono text-black/70"
                >
                  {WHITE_LABELS[i]}
                </button>
              ))}
            </div>
            {/* black keys overlaid */}
            <div className="pointer-events-none absolute inset-0 flex">
              {WHITE_OFFSETS.slice(0, 7).map((_, i) => {
                const blackOff = BLACK_OFFSETS[i];
                return (
                  <div key={`bw${i}`} className="flex-1 relative">
                    {blackOff >= 0 && (
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.preventDefault();
                          pressKey(blackOff);
                        }}
                        onPointerUp={() => releaseKey(blackOff)}
                        onPointerLeave={(e) => {
                          if (e.buttons) releaseKey(blackOff);
                        }}
                        className="pointer-events-auto absolute -right-3 top-0 z-10 h-[60%] w-6 min-h-[44px] rounded-b-md bg-black hover:bg-zinc-800 active:bg-violet-900 border border-white/10"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-4 text-base text-white/75">
            Or use your computer keyboard:{" "}
            <span className="font-mono text-violet-200">
              a w s e d f t g y h u j k
            </span>{" "}
            → C C# D D# E F F# G G# A A# B C.
          </p>
          <p className="mt-1 text-base text-white/55">
            Connect a MIDI piano and it drives the same pipeline. Idle ~2s and a
            demo arpeggiates I–vi–IV–V; your first note stops it.
          </p>
        </div>

        <details className="mt-6 text-base text-white/55">
          <summary className="cursor-pointer text-violet-300 hover:text-violet-200">
            Read the design notes
          </summary>
          <div className="mt-2 space-y-2 text-white/75">
            <p>
              Your played notes are warm detuned-saw voices in equal temperament
              — the keys you actually pressed. The mirror infers your chord
              (maj / min / sus4 / bare-fifth / dom7 / cluster) and adds the
              missing 1–2 voices in just intonation relative to the root:{" "}
              <span className="font-mono text-violet-200">
                9/8 · 5/4 · 4/3 · 3/2 · 5/3 · 15/8
              </span>
              . Because they are small-integer ratios over your root, they lock
              beat-lessly. When your root shifts, the mirror voices glide-retune
              to the new ratios. See the README for the full ratio table and
              the dated research citation.
            </p>
          </div>
        </details>
      </div>
    </main>
  );
}
