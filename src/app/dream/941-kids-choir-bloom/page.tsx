"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChoirSynth } from "./audio";
import { GpuMetaballs, type Blob } from "./gpu";
import { GlMetaballs } from "./webgl-fallback";
import {
  VOICE_RANGES,
  type VoiceId,
  snapToScale,
  voiceLead,
  consonance,
  DEMO_MELODY,
  type VoiceTargets,
} from "./voices";

// Creature colors (linear-ish RGB for the additive glow shader).
const VOICE_COLOR: Record<VoiceId, [number, number, number]> = {
  soprano: [1.0, 0.42, 0.62], // rose
  alto: [1.0, 0.74, 0.3], // amber
  tenor: [0.25, 0.92, 0.62], // emerald
  bass: [0.66, 0.5, 1.0], // violet
};

// Horizontal lane (0..1) for each creature so they don't all stack on one x.
const VOICE_X: Record<VoiceId, number> = {
  bass: 0.22,
  tenor: 0.42,
  alto: 0.6,
  soprano: 0.8,
};

const SOPRANO = VOICE_RANGES.find((r) => r.id === "soprano")!;
const IDLE_BEFORE_DEMO_MS = 2000;
const DEMO_STEP_MS = 900;

type RenderMode = "webgpu" | "webgl2" | "dom";

// Map a MIDI note within a voice's range to a normalized y (0 top .. 1 bottom).
function midiToY(midi: number, lo: number, hi: number): number {
  const t = (midi - lo) / (hi - lo);
  // Higher pitch -> nearer the top. Keep within a comfortable band.
  return 0.86 - Math.max(0, Math.min(1, t)) * 0.72;
}

// Inverse: a normalized y -> a MIDI value within [lo,hi] (pre-snap).
function yToMidi(y: number, lo: number, hi: number): number {
  const t = (0.86 - y) / 0.72;
  return lo + Math.max(0, Math.min(1, t)) * (hi - lo);
}

export default function KidsChoirBloom() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<RenderMode>("dom");
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Live pitch state mirrored into a ref for the rAF loop.
  const [targets, setTargets] = useState<VoiceTargets>({
    bass: 48,
    tenor: 55,
    alto: 64,
    soprano: 67,
  });
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const synthRef = useRef<ChoirSynth | null>(null);
  const gpuRef = useRef<GpuMetaballs | null>(null);
  const glRef = useRef<GlMetaballs | null>(null);
  const rafRef = useRef<number>(0);
  const lastTouchRef = useRef<number>(0);
  const demoIdxRef = useRef<number>(0);
  const draggingRef = useRef<boolean>(false);

  // --- apply a new soprano pitch and re-voice the lower three voices ---
  const applySoprano = useCallback((sopranoMidi: number) => {
    const cur = targetsRef.current;
    const next = voiceLead(sopranoMidi, {
      bass: cur.bass,
      tenor: cur.tenor,
      alto: cur.alto,
    });
    setTargets(next);
    const synth = synthRef.current;
    if (synth?.isStarted()) {
      synth.setVoicePitch("soprano", next.soprano, 90);
      synth.setVoicePitch("alto", next.alto, 120);
      synth.setVoicePitch("tenor", next.tenor, 130);
      synth.setVoicePitch("bass", next.bass, 140);
    }
  }, []);

  // --- pointer drag of the soprano creature ---
  const handlePointer = useCallback(
    (clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const y = (clientY - rect.top) / rect.height;
      const raw = yToMidi(y, SOPRANO.lo, SOPRANO.hi);
      const snapped = snapToScale(raw, SOPRANO.lo, SOPRANO.hi);
      applySoprano(snapped);
      lastTouchRef.current = performance.now();
    },
    [applySoprano],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!started) return;
      draggingRef.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      handlePointer(e.clientY);
    },
    [started, handlePointer],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!started || !draggingRef.current) return;
      handlePointer(e.clientY);
    },
    [started, handlePointer],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    lastTouchRef.current = performance.now();
  }, []);

  // --- Start (gesture-gated audio + GPU init) ---
  const onStart = useCallback(async () => {
    if (started) return;
    const synth = new ChoirSynth();
    synthRef.current = synth;
    await synth.start({
      bass: targetsRef.current.bass,
      tenor: targetsRef.current.tenor,
      alto: targetsRef.current.alto,
      soprano: targetsRef.current.soprano,
    });

    const canvas = canvasRef.current;
    if (canvas) {
      const gpu = await GpuMetaballs.create(canvas);
      if (gpu) {
        gpuRef.current = gpu;
        setMode("webgpu");
      } else {
        const gl = GlMetaballs.create(canvas);
        if (gl) {
          glRef.current = gl;
          setMode("webgl2");
        } else {
          setMode("dom");
        }
      }
    }
    lastTouchRef.current = performance.now();
    setStarted(true);
  }, [started]);

  // --- render + auto-demo loop ---
  useEffect(() => {
    if (!started) return;

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      gpuRef.current?.resize(w, h);
      glRef.current?.resize(w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastDemoStep = performance.now();

    const loop = () => {
      const now = performance.now();
      const t = now / 1000;

      // Auto-demo: after idle, drift the lead voice through a little tune.
      if (!draggingRef.current && now - lastTouchRef.current > IDLE_BEFORE_DEMO_MS) {
        if (now - lastDemoStep > DEMO_STEP_MS) {
          lastDemoStep = now;
          const note = DEMO_MELODY[demoIdxRef.current % DEMO_MELODY.length];
          demoIdxRef.current += 1;
          applySoprano(note);
        }
      }

      const tg = targetsRef.current;
      const bloom = consonance(tg);

      // Build blob list. Each creature's y reflects its pitch; gentle bob.
      const ids: VoiceId[] = ["bass", "tenor", "alto", "soprano"];
      const blobs: Blob[] = ids.map((id) => {
        const range = VOICE_RANGES.find((r) => r.id === id)!;
        const y = midiToY(tg[id], range.lo, range.hi);
        const bob = Math.sin(t * 1.6 + range.lo) * 0.012;
        const energy = id === "soprano" ? 1.0 : 0.6 + bloom * 0.4;
        return {
          x: VOICE_X[id] + Math.sin(t * 0.8 + range.hi) * 0.01,
          y: y + bob,
          r: 0.12 + (id === "soprano" ? 0.02 : 0) + bloom * 0.03,
          color: VOICE_COLOR[id],
          energy,
        };
      });

      gpuRef.current?.render(blobs, t, bloom);
      glRef.current?.render(blobs, t, bloom);

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started, applySoprano]);

  // --- full teardown on unmount ---
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      gpuRef.current?.dispose();
      gpuRef.current = null;
      glRef.current?.dispose();
      glRef.current = null;
      void synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  const bloomPct = Math.round(consonance(targets) * 100);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#0b0717] text-white select-none">
      {/* GPU / WebGL2 metaball surface */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* DOM fallback creatures (also a friendly visual if no GPU at all) */}
      {mode === "dom" && started && (
        <div className="pointer-events-none absolute inset-0">
          {(["bass", "tenor", "alto", "soprano"] as VoiceId[]).map((id) => {
            const range = VOICE_RANGES.find((r) => r.id === id)!;
            const y = midiToY(targets[id], range.lo, range.hi);
            const [r, g, b] = VOICE_COLOR[id];
            const rgb = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
            return (
              <div
                key={id}
                className="absolute h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md transition-all duration-200"
                style={{
                  left: `${VOICE_X[id] * 100}%`,
                  top: `${y * 100}%`,
                  background: `radial-gradient(circle, ${rgb} 0%, transparent 70%)`,
                  opacity: 0.85,
                }}
              />
            );
          })}
        </div>
      )}

      {mode === "dom" && started && (
        <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-base text-rose-300">
          GPU rendering unavailable — the choir is still singing, with a simple glow view.
        </p>
      )}

      {/* Header / nav (out of the kids' play area, top corners) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <Link
          href="/dream"
          className="pointer-events-auto rounded-xl bg-white/10 px-4 py-2.5 text-base text-white/95 backdrop-blur hover:bg-white/20"
        >
          ← Gallery
        </Link>
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="pointer-events-auto rounded-xl bg-white/10 px-4 py-2.5 text-base text-white/95 backdrop-blur hover:bg-white/20"
        >
          Design notes
        </button>
      </div>

      {/* Bloom meter (small, top-center, non-distracting) */}
      {started && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/10 px-4 py-2 text-base text-white/75 backdrop-blur">
          Harmony bloom: {bloomPct}%
          <span className="ml-2 text-white/50">({mode})</span>
        </div>
      )}

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0b0717]/80 px-6 text-center backdrop-blur">
          <h1 className="text-2xl font-semibold text-white sm:text-4xl">Choir Bloom</h1>
          <p className="max-w-md text-base text-white/75">
            Drag the bright rose blob up and down to lead a little melody. Three singing
            friends follow you into harmony — and the lights bloom when you all agree.
          </p>
          <button
            onClick={onStart}
            className="rounded-full bg-rose-400 px-10 py-5 text-2xl font-semibold text-[#0b0717] shadow-lg shadow-rose-500/30 active:scale-95"
            style={{ minHeight: 72 }}
          >
            ▶ Start singing
          </button>
          <p className="text-base text-white/75">Best with sound on.</p>
        </div>
      )}

      {/* Design notes overlay */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0b0717]/90 p-6 backdrop-blur">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="rounded-lg bg-white/10 px-4 py-2.5 text-base text-white/95 hover:bg-white/20"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-base text-white/75">
              <p className="text-white/95">
                <strong>For:</strong> kids (4+)
              </p>
              <p>
                <strong className="text-white/95">The idea:</strong> a child conducts a choir by
                dragging singing blob-creatures to pitches; a voice-leading brain turns their
                melody into real four-part harmony, rendered as luminous GPU metaballs that merge
                and bloom as the voices harmonize.
              </p>
              <p>
                <strong className="text-white/95">Interaction:</strong> drag the rose
                soprano up/down to choose a note (snapped to C-major — no wrong notes). Its scale
                degree implies a chord (1→I, 2→ii … 6→vi); the other three voices each glide to the
                nearest chord tone, so a melody you draw makes real chords change underneath.
              </p>
              <p>
                <strong className="text-white/95">Voices:</strong> formant source-filter
                singing — a glottal sawtooth source with slow vibrato into a bank of bandpass
                formant filters (warm /a/ vowel), brighter for high voices. Classic DSP, not
                samples and not AI.
              </p>
              <p>
                <strong className="text-white/95">Visuals:</strong> WebGPU (WGSL) metaball
                glow field, with a raw WebGL2 fallback and a plain-DOM glow if neither is
                available.
              </p>
              <p>
                <strong className="text-white/95">Inspiration:</strong> Blob Opera (David Li,
                Google Arts &amp; Culture, 2020); Cantor / Chorus Digitalis (IRCAM/LIMSI);
                Aldwell &amp; Schachter, <em>Harmony and Voice Leading</em>.
              </p>
              <p className="text-white/95">No mic, no network, no AI model — fully offline &amp; private.</p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
