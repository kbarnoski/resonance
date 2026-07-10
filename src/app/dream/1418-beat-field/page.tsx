"use client";

// 1418-beat-field — "Beat Field".
// What if the music were composed in the BEATING itself? A stack of 4 detuned
// oscillator voices, each split by a single beat-rate control `bt`, sculpted
// along one continuous axis: pure lock (silence-of-beating) → 1–3 Hz shimmer →
// AM tremolo → the dense-roughness howl. Dissonance/beating is the PLAYED medium.
// Render substrate: raw WebGPU compute (WGSL) computing a Plomp–Levelt/Sethares
// roughness field, with WebGL2-fragment and Canvas2D fallbacks so it is never a
// blank frame. See the in-page design notes / README.md.

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  BT_MAX,
  BT_MIN,
  CHORD_PRESETS,
  btFromX,
  computeField,
  type FieldState,
  type FieldRenderer,
} from "./field";
import { BeatFieldAudio } from "./audio";
import { createBeatFieldGPU, WebGPUUnsupportedError } from "./gpu";
import { createBeatFieldGL } from "./gl";
import { createBeatFieldCanvas2D } from "./canvas2d";

type Phase = "intro" | "running";
type Tier = "webgpu" | "webgl2" | "canvas";

function describeRegime(bt: number): string {
  if (bt < 0.8) return "lock · silence-of-beating";
  if (bt < 4) return "slow shimmer (1–3 Hz)";
  if (bt < 14) return "AM tremolo";
  return "dense roughness · the howl";
}

/** Build the render tier, trying WebGPU → WebGL2 → Canvas2D in order. */
async function makeRenderer(
  canvas: HTMLCanvasElement,
): Promise<{ renderer: FieldRenderer; note: string | null }> {
  try {
    const renderer = await createBeatFieldGPU(canvas);
    return { renderer, note: null };
  } catch (e) {
    const why = e instanceof WebGPUUnsupportedError ? e.message : String(e);
    try {
      const renderer = createBeatFieldGL(canvas);
      return { renderer, note: `WebGPU unavailable (${why}) — using WebGL2` };
    } catch {
      const renderer = createBeatFieldCanvas2D(canvas);
      return { renderer, note: "WebGPU + WebGL2 unavailable — using Canvas2D" };
    }
  }
}

const TIER_STYLE: Record<Tier, string> = {
  webgpu: "border-emerald-300/50 bg-emerald-500/15 text-emerald-100",
  webgl2: "border-sky-300/50 bg-sky-500/15 text-sky-100",
  canvas: "border-amber-300/50 bg-amber-500/15 text-amber-100",
};
const TIER_LABEL: Record<Tier, string> = { webgpu: "WebGPU", webgl2: "WebGL2", canvas: "Canvas" };

export default function BeatFieldPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [tier, setTier] = useState<Tier | null>(null);
  const [tierNote, setTierNote] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // Live readout, refreshed on a timer (not every frame).
  const [hud, setHud] = useState({ bt: BT_MIN, preset: 0, root: 110, drive: 0, pairs: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const audioRef = useRef<BeatFieldAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const draggingRef = useRef(false);
  const lastInteractRef = useRef(0);
  const reducedRef = useRef(false);
  reducedRef.current = reduced;

  const stateRef = useRef<FieldState>({ root: 110, bt: BT_MIN, drive: 0.35, presetIndex: 0 });

  useEffect(() => {
    const r = prefersReducedMotion();
    setReduced(r);
    if (typeof window !== "undefined" && window.matchMedia) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const on = () => setReduced(mq.matches);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }
  }, []);

  const markInteract = useCallback(() => {
    lastInteractRef.current = performance.now();
  }, []);

  // ── The begin gesture: renderer (fallback chain) + audio context + loop ──────
  const begin = useCallback(async () => {
    if (phase === "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const { renderer, note } = await makeRenderer(canvas);
    rendererRef.current = renderer;
    setTier(renderer.tier);
    setTierNote(note);

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
        audioRef.current = new BeatFieldAudio(ctx);
      } catch {
        /* visuals still run without audio */
      }
    }

    lastInteractRef.current = performance.now();
    setPhase("running");
  }, [phase]);

  // ── Pointer drag on the canvas: x → bt, y → drive ────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const apply = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height)));
      stateRef.current.bt = btFromX(nx);
      stateRef.current.drive = 1 - ny; // top = bright/loud
      markInteract();
    };
    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      canvas.setPointerCapture?.(e.pointerId);
      apply(e);
    };
    const onMove = (e: PointerEvent) => {
      if (draggingRef.current) apply(e);
    };
    const onUp = () => {
      draggingRef.current = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [phase, markInteract]);

  // ── Number / arrow keys ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const s = stateRef.current;
      if (e.key >= "1" && e.key <= "5") {
        s.presetIndex = Number(e.key) - 1;
      } else if (e.key === "ArrowUp") {
        s.root = Math.min(300, s.root * Math.pow(2, 1 / 12));
      } else if (e.key === "ArrowDown") {
        s.root = Math.max(40, s.root / Math.pow(2, 1 / 12));
      } else if (e.key === "ArrowRight") {
        s.bt = Math.min(BT_MAX, s.bt * 1.15);
      } else if (e.key === "ArrowLeft") {
        s.bt = Math.max(BT_MIN, s.bt / 1.15);
      } else {
        return;
      }
      e.preventDefault();
      markInteract();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, markInteract]);

  // ── Resize ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const onResize = () => rendererRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // ── Render + audio loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const start = performance.now();

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const renderer = rendererRef.current;
      if (!renderer) return;
      const now = performance.now();
      const t = (now - start) / 1000;
      const s = stateRef.current;
      const isReduced = reducedRef.current;

      // Idle self-demo: after 5 s of no input, auto-sweep bt through the whole
      // arc (lock → howl → lock) so a cold glance is alive. Slower + gentler
      // under reduced-motion.
      if (now - lastInteractRef.current > 5000) {
        const period = isReduced ? 48 : 26; // seconds per lock→howl→lock cycle
        const phaseT = ((now - lastInteractRef.current - 5000) / 1000) / period;
        const arc = 0.5 - 0.5 * Math.cos(phaseT * Math.PI * 2); // 0→1→0
        s.bt = btFromX(0.05 + arc * 0.9);
        s.drive = isReduced ? 0.4 + arc * 0.2 : 0.35 + arc * 0.45;
      }

      const snap = computeField(s);
      renderer.render(
        { blobs: snap.blobs, intensity: snap.intensity, drive: s.drive, reduced: isReduced },
        t,
      );
      audioRef.current?.setState(snap.partials, s.drive, snap.intensity);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // Keep the HUD readout roughly live without re-rendering every frame.
  useEffect(() => {
    if (phase !== "running") return;
    const id = window.setInterval(() => {
      const s = stateRef.current;
      const snap = computeField(s);
      setHud({ bt: s.bt, preset: s.presetIndex, root: s.root, drive: s.drive, pairs: snap.activePairs });
    }, 160);
    return () => window.clearInterval(id);
  }, [phase]);

  // ── Full teardown ────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
      ctxRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04030a] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="Beat Field — a GPU Plomp–Levelt roughness field you sculpt by dragging the beat rate"
      />

      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-violet-300/40 bg-black/45 px-4 py-2.5 text-sm text-violet-100 backdrop-blur hover:bg-black/65"
      >
        Read the design notes
      </button>

      {tier && (
        <span
          className={`absolute left-4 top-4 z-30 rounded-full border px-3 py-1 text-xs font-medium ${TIER_STYLE[tier]}`}
          title={tierNote ?? "primary GPU-compute tier"}
        >
          {TIER_LABEL[tier]}
        </span>
      )}

      <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-6 md:p-10">
        <header className="pointer-events-auto max-w-2xl">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-white md:text-5xl">
            Beat Field
          </h1>
          <p className="mt-3 text-base text-white/80">
            What if the music were composed in the{" "}
            <span className="text-violet-300">beating</span> itself? Four detuned
            voices, one axis: from the <span className="text-violet-300">lock</span>{" "}
            (silence-of-beating) out into the{" "}
            <span className="text-rose-300">howl</span>. The roughness is the
            instrument — push into it, release back.
          </p>
          {phase === "running" && (
            <p className="mt-3 text-base text-white/75">
              bt <span className="text-violet-300">{hud.bt.toFixed(2)} Hz</span> ·{" "}
              {describeRegime(hud.bt)} · chord{" "}
              <span className="text-white/90">{CHORD_PRESETS[hud.preset].name}</span> ·
              root <span className="text-white/90">{Math.round(hud.root)} Hz</span> ·
              lit pairs <span className="text-violet-300">{hud.pairs}</span>
              {reduced && <span className="text-white/75"> · reduced-motion</span>}
            </p>
          )}
        </header>

        <section className="pointer-events-auto flex max-w-2xl flex-col items-start gap-3">
          {phase === "intro" && (
            <>
              <button
                onClick={() => void begin()}
                className="min-h-[44px] rounded-md border border-violet-300/50 bg-violet-500/25 px-5 py-2.5 text-base font-medium text-violet-50 hover:bg-violet-500/35"
              >
                Begin · enter the lock
              </button>
              <p className="text-base text-white/75">
                Sound starts on this tap (browsers block autoplay). Then{" "}
                <span className="text-white/90">drag anywhere</span>: left↔right is
                the beat rate (lock→howl), up↕down is drive. Keys{" "}
                <span className="font-mono text-violet-300">1–5</span> pick a chord,{" "}
                <span className="font-mono text-violet-300">↑ ↓</span> move the root,{" "}
                <span className="font-mono text-violet-300">← →</span> nudge bt. Idle
                a few seconds and it sweeps the arc itself.
              </p>
            </>
          )}
        </section>

        {phase === "running" && (
          <footer className="pointer-events-auto max-w-2xl">
            <p className="text-base text-white/75">
              Each voice&apos;s partial <span className="font-mono text-violet-300">h</span>{" "}
              sits at <span className="font-mono text-violet-300">h·f ± h·bt/2</span>, so
              the upper partials roughen first as you push bt up. The field shows{" "}
              <em>where</em> the roughness lives — voice-pairs down the screen,
              harmonic region across it.
            </p>
          </footer>
        )}
      </div>

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
      <PrototypeNav slugs={["1418-beat-field"]} />
    </main>
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
        className="relative w-full max-w-2xl rounded-xl border border-white/15 bg-[#0a0812] p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 min-h-[44px] rounded-md border border-white/20 bg-white/10 px-4 py-2.5 text-base text-white/95 hover:bg-white/20"
        >
          Close
        </button>
        <h2 className="font-serif text-2xl font-semibold text-white">Beat Field — design notes</h2>

        <div className="mt-4 space-y-4 text-base leading-relaxed text-white/85">
          <p>
            <span className="font-semibold text-white">The question.</span> What if
            the music were composed in the <em>beating</em> itself? Not a tuning to
            purify and not a dissonance to minimize — the acoustic roughness is the
            expressive medium you play, along one continuous axis from the dark calm
            of the lock to the dense howl.
          </p>
          <p>
            <span className="font-semibold text-white">The kernel.</span> Between two
            partials the Plomp–Levelt / Sethares sensory roughness is{" "}
            <span className="font-mono text-violet-300">
              r = a₁a₂(e^(−3.5·s·df) − e^(−5.75·s·df))
            </span>{" "}
            with <span className="font-mono text-violet-300">s = 0.24/(0.021·min(f₁,f₂)+19)</span>{" "}
            and <span className="font-mono text-violet-300">df = |f₁−f₂|</span>. This
            one function lives in <span className="font-mono">field.ts</span> and
            feeds every render tier and the audio.
          </p>
          <p>
            <span className="font-semibold text-white">The instrument.</span> Four
            detunable voices (a chord), each 6 partials, alternating detune
            direction. A single control{" "}
            <span className="font-mono text-violet-300">bt</span> (0.25 → 42 Hz,
            log-mapped from pointer x) splits every voice&apos;s partial{" "}
            <span className="font-mono">h</span> to{" "}
            <span className="font-mono text-violet-300">h·f ± h·bt/2</span>. Because
            the split scales with <span className="font-mono">h</span>, the upper
            partials cross the critical band first — roughness climbs <em>down</em>{" "}
            the harmonic ladder as you push.
          </p>
          <p>
            <span className="font-semibold text-white">Sound.</span> 24 oscillators
            (4 voices × 6 partials) tuned straight to the split partials. The tremolo
            and howl are the <em>real</em> acoustic beating between them — no LFO is
            faked on top. Master gain ramps to ≤ 0.20 behind a compressor/limiter,
            over a low just-intonation drone bed and a void reverb.
          </p>
          <p>
            <span className="font-semibold text-white">Render substrate.</span> The
            primary tier is a <span className="text-emerald-200">raw WebGPU compute
            shader</span> (WGSL) dispatched over a 256×256 grid that splats the
            partial-pair roughness into an{" "}
            <span className="font-mono">rgba16float</span> storage texture; a render
            pass blits it with an additive glow. If WebGPU is missing it drops to a{" "}
            <span className="text-sky-200">WebGL2</span> fragment shader, then a{" "}
            <span className="text-amber-200">Canvas2D</span> coarse grid — never a
            blank frame. The tier badge (top-left) tells you which is live.
          </p>
          <p>
            <span className="font-semibold text-white">Safety.</span> No strobe. Every
            visual pulsation is clamped to ≤ 2.8 Hz even when the audio beat is fast,
            and the idle auto-sweep moves over tens of seconds.{" "}
            <span className="font-mono">prefers-reduced-motion</span> slows the sweep
            and softens contrast toward the calm floor. The screen never goes black —
            a dark-violet nebula floor is always present.
          </p>
          <p>
            <span className="font-semibold text-white">References.</span> Plomp &amp;
            Levelt (1965), &ldquo;Tonal Consonance and Critical Bandwidth&rdquo;;
            William Sethares, <em>Tuning, Timbre, Spectrum, Scale</em> (2005); and the
            beating dissonance submodel of the{" "}
            <span className="text-violet-300">XenRoll v0.4.3</span> (June 2026)
            xenharmonic piano-roll.
          </p>
        </div>
      </div>
    </div>
  );
}
