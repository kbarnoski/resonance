"use client";

// 1348-prism-cortex — "Prism Cortex".
// A DMT-breakthrough field rendered as a living Gray-Scott reaction-diffusion
// chemistry running as a WebGPU *compute* shader, warped through the cortical
// form-constant map (inverse log-polar), and PLAYED on a MIDI keyboard (with a
// QWERTY fallback). This is the lab's first WGSL compute-shader piece — the GPU
// chemistry substrate is the deliverable. See the in-page design notes.
//
// Refs: Bressloff–Cowan / Klüver retino-cortical form constants; iridescent
// GPU-field aesthetic after Marpi (marpi.studio) and Android Jones. README.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { PrismAudio } from "./audio";
import {
  createPrismRenderer,
  WebGPUUnsupportedError,
  type PrismRenderer,
  type Seed,
} from "./webgpu";

type Phase = "intro" | "running" | "unsupported" | "error";

interface HeldSeed {
  x: number;
  y: number;
  radius: number;
  strength: number;
  held: boolean;
}

// QWERTY piano: white keys on the home row, black keys on the row above.
const QWERTY_MAP: Record<string, number> = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72, l: 74,
  w: 61, e: 63, t: 66, y: 68, u: 70, o: 73,
};

// A gentle C-minor-pentatonic loop for the idle auto-demo.
const AUTO_SEQUENCE = [60, 63, 65, 67, 70, 67, 65, 63];

/** Map a MIDI pitch to a seed position on a ring in the RD texture. */
function pitchToSeedPos(midi: number): { x: number; y: number } {
  const pc = midi % 12;
  const angle = (pc / 12) * Math.PI * 2;
  const oct = Math.floor(midi / 12);
  const ring = Math.min(0.42, Math.max(0.08, 0.14 + (oct - 4) * 0.045));
  return {
    x: 0.5 + Math.cos(angle) * ring,
    y: 0.5 + Math.sin(angle) * ring,
  };
}

export default function PrismCortexPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [gpuMaybe, setGpuMaybe] = useState(true);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [midiLabel, setMidiLabel] = useState("QWERTY (press a–l)");
  const [heldCount, setHeldCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<PrismRenderer | null>(null);
  const audioRef = useRef<PrismAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  const seedsRef = useRef<Map<number, HeldSeed>>(new Map());
  const pressedRef = useRef<Set<string>>(new Set());
  const midiInputsRef = useRef<MIDIInput[]>([]);
  const lastInteractRef = useRef(0);
  const autoRef = useRef({ next: 0, idx: 0, held: -1 });
  const reducedRef = useRef(false);
  reducedRef.current = reducedMotion;

  // ─── Feature-detect WebGPU + reduced-motion on mount ───────────────────────
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.gpu) setGpuMaybe(false);
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);
      const on = () => setReducedMotion(mq.matches);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }
  }, []);

  // ─── Note handlers (shared by MIDI, QWERTY and auto-demo) ──────────────────
  const noteOn = useCallback((midi: number, velocity: number) => {
    const pos = pitchToSeedPos(midi);
    seedsRef.current.set(midi, {
      x: pos.x,
      y: pos.y,
      radius: 0.014 + velocity * 0.02,
      strength: 0.55 + velocity * 0.45,
      held: true,
    });
    audioRef.current?.noteOn(midi, velocity);
    setHeldCount(seedsRef.current.size);
  }, []);

  const noteOff = useCallback((midi: number) => {
    const s = seedsRef.current.get(midi);
    if (s) s.held = false; // begins its decay in the render loop
    audioRef.current?.noteOff(midi);
  }, []);

  // ─── The begin gesture: audio ctx + WebGPU device + loop ───────────────────
  const begin = useCallback(async () => {
    if (phase === "running") return;
    setStatusMsg("initialising WebGPU…");

    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. WebGPU renderer (typed graceful failure → readable notice).
    let renderer: PrismRenderer;
    try {
      renderer = await createPrismRenderer(canvas);
    } catch (e) {
      if (e instanceof WebGPUUnsupportedError) {
        setPhase("unsupported");
        setStatusMsg(e.message);
      } else {
        setPhase("error");
        setStatusMsg(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    rendererRef.current = renderer;

    // 2. Audio context on the gesture.
    const w = window as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (Ctor) {
      const ctx = new Ctor();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* the gesture should cover this */
        }
      }
      try {
        audioRef.current = new PrismAudio(ctx);
      } catch {
        /* visuals still run without audio */
      }
    }

    // 3. Web MIDI (feature-detected; throws when unsupported/denied).
    if (typeof navigator !== "undefined" && navigator.requestMIDIAccess) {
      try {
        const access = await navigator.requestMIDIAccess();
        const inputs: MIDIInput[] = [];
        access.inputs.forEach((input) => {
          input.onmidimessage = (ev: MIDIMessageEvent) => {
            const data = ev.data;
            if (!data || data.length < 3) return;
            const cmd = data[0] & 0xf0;
            const note = data[1];
            const vel = data[2];
            lastInteractRef.current = performance.now();
            if (cmd === 0x90 && vel > 0) noteOn(note, vel / 127);
            else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) noteOff(note);
          };
          inputs.push(input);
        });
        midiInputsRef.current = inputs;
        setMidiLabel(
          inputs.length > 0
            ? `MIDI: ${inputs.length} device${inputs.length > 1 ? "s" : ""} + QWERTY`
            : "QWERTY (no MIDI device found)",
        );
      } catch {
        setMidiLabel("QWERTY (Web MIDI unavailable)");
      }
    }

    lastInteractRef.current = performance.now();
    autoRef.current = { next: performance.now() + 4000, idx: 0, held: -1 };
    setStatusMsg(null);
    setPhase("running");
  }, [phase, noteOn, noteOff]);

  // ─── QWERTY input ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const midi = QWERTY_MAP[e.key.toLowerCase()];
      if (midi === undefined) return;
      if (pressedRef.current.has(e.key.toLowerCase())) return;
      pressedRef.current.add(e.key.toLowerCase());
      lastInteractRef.current = performance.now();
      noteOn(midi, 0.7);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midi = QWERTY_MAP[key];
      if (midi === undefined) return;
      pressedRef.current.delete(key);
      noteOff(midi);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, noteOn, noteOff]);

  // ─── Resize handling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // ─── The render / chemistry loop ───────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const start = performance.now();
    let prev = start;

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const renderer = rendererRef.current;
      if (!renderer) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = (now - start) / 1000;
      const reduced = reducedRef.current;

      // Idle auto-demo: gently seed the field so it lives on a phone with no
      // keyboard. Runs only after a few idle seconds; user input pre-empts it.
      const auto = autoRef.current;
      if (now - lastInteractRef.current > 4000 && now >= auto.next) {
        if (auto.held >= 0) noteOff(auto.held);
        const midi = AUTO_SEQUENCE[auto.idx % AUTO_SEQUENCE.length];
        auto.idx += 1;
        auto.held = midi;
        noteOn(midi, 0.45);
        auto.next = now + 1600;
      }

      // Decay released seeds; collect the active set for the compute uniform.
      const seeds: Seed[] = [];
      let strengthSum = 0;
      let held = 0;
      for (const [midi, s] of seedsRef.current) {
        if (!s.held) {
          s.strength *= 0.9;
          if (s.strength < 0.01) {
            seedsRef.current.delete(midi);
            continue;
          }
        } else {
          held += 1;
        }
        strengthSum += s.strength;
        if (seeds.length < 16) {
          seeds.push({ x: s.x, y: s.y, radius: s.radius, strength: s.strength });
        }
      }

      // Slow "breathing" LFO on feed/kill (≤ 3 Hz — here ~0.05 Hz). Stays in the
      // worm/maze regime of Gray-Scott.
      const breath = Math.sin(t * 2 * Math.PI * 0.05);
      const feed = 0.037 + breath * 0.0016;
      const kill = 0.06 + breath * 0.0012;

      // Reduced-motion: fewer chemistry steps, slower drift, softened contrast.
      const substeps = reduced ? 3 : 8;
      const drift = reduced ? 0.006 : 0.02;
      const contrast = reduced ? 0.55 : 1.0;
      const glow = reduced ? 0.35 : 0.6;

      renderer.step({
        seeds,
        feed,
        kill,
        substeps,
        timeSec: t,
        sampleScale: 2.6,
        symmetry: 6,
        spiral: 0.8,
        saturation: 1.15,
        chroma: reduced ? 0.4 : 1.0,
        contrast,
        drift,
        glow,
      });

      // Audio activity ← how much chemistry is being sown right now.
      const activity = Math.min(1, 0.14 + held * 0.16 + strengthSum * 0.12);
      audioRef.current?.setActivity(activity);
      audioRef.current?.step(dt);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, noteOn, noteOff]);

  // Keep the header held-count readout roughly live.
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => setHeldCount(seedsRef.current.size), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // ─── Full teardown ─────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      for (const input of midiInputsRef.current) input.onmidimessage = null;
      midiInputsRef.current = [];
      audioRef.current?.stop();
      audioRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        void ctx.close().catch(() => {});
      }
      ctxRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04050a] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Prism Cortex — a GPU reaction-diffusion field warped through the cortical form-constant map"
      />

      {/* Corner: design notes overlay control */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-cyan-300/40 bg-black/40 px-4 py-2.5 font-mono text-sm text-cyan-100/90 backdrop-blur hover:bg-black/60"
      >
        Read the design notes
      </button>

      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        {/* Header */}
        <header className="pointer-events-auto max-w-2xl">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-white/95 md:text-4xl">
            Prism Cortex
          </h1>
          <p className="mt-3 text-base text-white/75">
            A DMT-breakthrough field as a living{" "}
            <span className="text-cyan-200">Gray-Scott reaction-diffusion</span>{" "}
            chemistry — run as a{" "}
            <span className="text-violet-200">WebGPU compute shader</span>, warped
            through the cortical{" "}
            <span className="text-fuchsia-200">form-constant map</span>, and{" "}
            <em>played</em> on a MIDI keyboard.
          </p>
          {phase === "running" && (
            <p className="mt-2 font-mono text-sm text-white/75">
              input: {midiLabel} · voices held:{" "}
              <span className="text-cyan-200">{heldCount}</span>
              {reducedMotion && (
                <span className="text-white/75"> · reduced-motion honoured</span>
              )}
            </p>
          )}
        </header>

        {/* Center: begin / notices */}
        <section className="pointer-events-auto flex max-w-2xl flex-col items-start gap-3">
          {phase === "intro" && gpuMaybe && (
            <>
              <button
                onClick={() => void begin()}
                className="min-h-[44px] rounded-md border border-violet-300/50 bg-violet-500/25 px-5 py-2.5 text-base font-medium text-violet-50 hover:bg-violet-500/35"
              >
                Begin · sow the chemistry
              </button>
              <p className="text-base text-white/75">
                Sound only starts on this click (browsers block autoplay). Then
                play the <span className="font-mono text-cyan-200">a–l</span> keys
                (black keys on <span className="font-mono text-cyan-200">w e t y u o</span>),
                or plug in a MIDI keyboard. Idle for a few seconds and it plays
                itself.
              </p>
            </>
          )}

          {phase === "intro" && !gpuMaybe && <WebGPUNotice detail={null} />}
          {phase === "unsupported" && <WebGPUNotice detail={statusMsg} />}

          {phase === "error" && (
            <div className="rounded-lg border border-rose-300/40 bg-rose-950/40 p-4">
              <p className="text-base text-rose-100">
                Something went wrong starting the GPU pipeline.
              </p>
              {statusMsg && (
                <p className="mt-1 font-mono text-sm text-rose-200/90">{statusMsg}</p>
              )}
              <button
                onClick={() => {
                  setPhase("intro");
                  setStatusMsg(null);
                }}
                className="mt-3 min-h-[44px] rounded-md border border-rose-300/40 bg-rose-500/20 px-4 py-2.5 text-base text-rose-50 hover:bg-rose-500/30"
              >
                Try again
              </button>
            </div>
          )}

          {statusMsg && phase === "intro" && gpuMaybe && (
            <p className="font-mono text-sm text-violet-200">{statusMsg}</p>
          )}
        </section>

        {/* Footer: how to play */}
        {phase === "running" && (
          <footer className="pointer-events-auto max-w-2xl">
            <p className="text-base text-white/75">
              Each note sows a Gaussian seed of chemical B into the field at an
              angle set by its pitch class; velocity sets the bloom size. Held
              keys sustain both the worm-source and a detuned drone partial. The
              log-polar warp turns the maze into tunnels, spirals and honeycomb
              lattices.
            </p>
          </footer>
        )}
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
    </main>
  );
}

function WebGPUNotice({ detail }: { detail: string | null }) {
  return (
    <div className="rounded-lg border border-amber-300/40 bg-amber-950/40 p-4">
      <p className="text-base text-amber-50">
        This piece needs a <span className="font-semibold">WebGPU</span> browser.
      </p>
      <p className="mt-1 text-base text-white/75">
        Try Chrome 113+, Edge 113+, or Safari 18+ (desktop or a recent iOS/iPadOS).
        WebGPU is the whole point here — the visuals are a GPU compute-shader
        chemistry, so there is nothing to fall back to.
      </p>
      {detail && (
        <p className="mt-2 font-mono text-sm text-amber-200/90">detail: {detail}</p>
      )}
    </div>
  );
}

function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur md:p-10"
      role="dialog"
      aria-modal="true"
      aria-label="Design notes"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-xl border border-white/15 bg-[#0a0b12] p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 min-h-[44px] rounded-md border border-white/20 bg-white/10 px-4 py-2.5 text-base text-white/95 hover:bg-white/20"
        >
          Close
        </button>
        <h2 className="font-mono text-2xl font-semibold text-white/95">
          Prism Cortex — design notes
        </h2>

        <div className="mt-4 space-y-4 text-base leading-relaxed text-white/85">
          <p>
            <span className="font-semibold text-white/95">The question.</span>{" "}
            What if a DMT-breakthrough field were a living Gray-Scott
            reaction-diffusion chemistry running as a WebGPU <em>compute</em>{" "}
            shader, warped through the cortical form-constant map, and you played
            it on a MIDI keyboard?
          </p>
          <p>
            <span className="font-semibold text-white/95">The substrate.</span>{" "}
            This is the lab&apos;s first WGSL compute-shader piece. Two chemicals
            A/B live in a pair of{" "}
            <span className="font-mono text-cyan-200">rgba16float</span> storage
            textures, ping-ponged. A compute shader steps the Gray-Scott
            equations 3–8 iterations per frame via{" "}
            <span className="font-mono text-cyan-200">dispatchWorkgroups</span> — a
            genuine GPU cellular chemistry in the worm/maze regime, with a slow
            LFO on feed/kill for &ldquo;breathing.&rdquo;
          </p>
          <p>
            <span className="font-semibold text-white/95">The warp.</span> A render
            pass samples the field through an inverse log-polar
            (<span className="font-mono text-cyan-200">log r</span>, θ) map — the
            Bressloff–Cowan retino-cortical projection behind Klüver&apos;s form
            constants. Radial structure becomes tunnels, angular structure becomes
            funnels, and the diagonal maze becomes spirals and honeycomb lattices.
            Thin-film iridescence, chromatic aberration and an additive glow finish
            the neon jewel.
          </p>
          <p>
            <span className="font-semibold text-white/95">Playing it.</span> Web
            MIDI note-ons inject Gaussian seeds of chemical B into the field at an
            angle set by pitch class (velocity → bloom size); note-off releases the
            seed and its held drone partial. A QWERTY fallback
            (<span className="font-mono text-cyan-200">a–l</span> white keys,{" "}
            <span className="font-mono text-cyan-200">w e t y u o</span> black keys)
            is always live, and after a few idle seconds the field auto-seeds a
            gentle pentatonic loop so it&apos;s alive on a phone.
          </p>
          <p>
            <span className="font-semibold text-white/95">Sound.</span> An additive
            pad-drone: a just-intonation drone bed, a detuned partial per held
            note, and a slow Shepard shimmer, summed into a void-reverb bus and
            hard-limited by a compressor at master gain ≤ 0.25 with an exponential
            fade-in.
          </p>
          <p>
            <span className="font-semibold text-white/95">Safety.</span> No strobe;
            any global luminance oscillation stays ≤ 3 Hz (the breath LFO is ~0.05
            Hz).{" "}
            <span className="font-mono text-cyan-200">prefers-reduced-motion</span>{" "}
            slows the chemistry and softens contrast. If WebGPU is missing the page
            shows a readable notice instead of a blank screen.
          </p>
          <p>
            <span className="font-semibold text-white/95">Reference.</span> The
            iridescent GPU-field aesthetic follows{" "}
            <span className="text-fuchsia-200">Marpi</span> (marpi.studio) and{" "}
            <span className="text-fuchsia-200">Android Jones</span> — both living
            artists working in luminous, jeweled generative fields.
          </p>
        </div>
      </div>
    </div>
  );
}
