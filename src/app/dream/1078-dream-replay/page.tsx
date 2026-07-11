"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Dream Replay — a Canvas2D "engram field" instrument. Zero permissions.
//
// WAKE (alpha low): you tap/drag the dark field. Every onset plays a warm
// just-intonation bell (pitch = vertical position) AND is recorded into a
// ring-buffer engram, leaving a persistent luminous glyph. The field fills with
// a constellation of your own notes — gesture makes sound and light directly.
//
// DREAM (alpha high): live input fades; a top-down read-head autonomously walks
// the stored engrams in a RECOMBINED order (a stochastic walk over the recorded
// sequence transitions, temperature = alpha). It re-fires each note and re-blooms
// each glyph. As alpha rises the spatial positions drift, timing loosens, glyphs
// smear into afterimage trails, and the recombination diverges from the literal
// record — your playing dreamed back, dissolving.
//
// alpha 0→1 is Bredenberg et al.'s oneirogen parameter (eLife 2026): 0 = awake /
// bottom-up sensory, 1 = fully dreaming / top-down generative replay. See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { startAudio, type DreamAudio, SCALE_SIZE } from "./audio";
import { EngramField, ReadHead, applyDrift, type Engram } from "./engram";

type Phase = "idle" | "running" | "error";

// ── Tunables ───────────────────────────────────────────────────────────────
const ARC_SECONDS = 50; // auto-rise time for alpha once playing.
const AUTO_DEMO_DELAY = 2500; // ms of no input before the synthetic player taps.
const RING_CAPACITY = 180;

/** A visible bloom on the field — either persistent (recorded) or a re-fire. */
interface Bloom {
  x: number; // normalised 0..1
  y: number;
  hue: number;
  radius: number;
  life: number; // 0..1, decays for re-fires; persistent blooms hold a floor.
  persistent: boolean;
}

/** Read-head filament between the last two recombined engrams. */
interface Filament {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
}

export default function DreamReplayPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<DreamAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const fieldRef = useRef<EngramField>(new EngramField(RING_CAPACITY));
  const headRef = useRef<ReadHead | null>(null);
  const bloomsRef = useRef<Bloom[]>([]);
  const filamentsRef = useRef<Filament[]>([]);

  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const readoutAtRef = useRef<number>(0);

  const alphaRef = useRef<number>(0);
  const autoAlphaRef = useRef<boolean>(true); // is alpha auto-rising?
  const startedAtRef = useRef<number>(0);
  const lastInputAtRef = useRef<number>(0);
  const interactedRef = useRef<boolean>(false);

  // Dream scheduling.
  const nextStepAtRef = useRef<number>(0);
  const headPosRef = useRef<{ x: number; y: number } | null>(null);
  const driftPhaseRef = useRef<number>(0);

  // Auto-demo motif scheduling.
  const demoQueueRef = useRef<{ x: number; y: number; at: number }[]>([]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [alphaView, setAlphaView] = useState(0);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const pitchFromY = useCallback((yNorm: number) => {
    // Higher on the field = higher pitch (invert y since canvas y grows down).
    const up = 1 - Math.min(1, Math.max(0, yNorm));
    return Math.min(SCALE_SIZE - 1, Math.floor(up * SCALE_SIZE));
  }, []);

  const hueFromPitch = useCallback((pitchIndex: number) => {
    // Map the scale across a cool→warm arc; the alpha drift warms it further.
    return 190 + (pitchIndex / Math.max(1, SCALE_SIZE - 1)) * 90;
  }, []);

  /** Register a real (awake) onset: play, record, bloom. */
  const onset = useCallback(
    (xNorm: number, yNorm: number, velocity: number, synthetic: boolean) => {
      const alpha = alphaRef.current;
      // In the dream, live input fades: only faint, and it does not record.
      const liveGain = 1 - alpha;
      const pitchIndex = pitchFromY(yNorm);
      const hue = hueFromPitch(pitchIndex);

      if (alpha < 0.85) {
        audioRef.current?.pluck(pitchIndex, velocity * (0.35 + 0.65 * liveGain), alpha);
      }

      if (alpha < 0.5) {
        // Faithful phase — record into the engram field, leave a persistent glyph.
        const e: Engram = {
          x: xNorm,
          y: yNorm,
          pitchIndex,
          velocity,
          t: performance.now(),
        };
        fieldRef.current.record(e);
        headRef.current?.refresh();
        bloomsRef.current.push({
          x: xNorm,
          y: yNorm,
          hue,
          radius: 0.02 + velocity * 0.03,
          life: 1,
          persistent: true,
        });
      } else {
        // Late-wake / early-dream: a faint transient bloom, not recorded.
        bloomsRef.current.push({
          x: xNorm,
          y: yNorm,
          hue,
          radius: 0.02,
          life: 0.5 * liveGain,
          persistent: false,
        });
      }

      if (!synthetic) {
        interactedRef.current = true;
        lastInputAtRef.current = performance.now();
      }
    },
    [pitchFromY, hueFromPitch],
  );

  /** One recombined dream step: walk the read-head, drift it, re-fire, re-bloom. */
  const stepDream = useCallback((alpha: number) => {
    const head = headRef.current;
    if (!head || fieldRef.current.size === 0) return;
    const e = head.step(alpha);
    if (!e) return;

    const drifted = applyDrift(e.x, e.y, alpha, driftPhaseRef.current);
    const hue = hueFromPitch(e.pitchIndex) + alpha * 35; // warm as we dream.

    audioRef.current?.pluck(e.pitchIndex, e.velocity, alpha);

    bloomsRef.current.push({
      x: drifted.x,
      y: drifted.y,
      hue,
      radius: 0.025 + e.velocity * 0.04 + alpha * 0.02,
      life: 1,
      persistent: false,
    });

    const prev = headPosRef.current;
    if (prev) {
      filamentsRef.current.push({
        x1: prev.x,
        y1: prev.y,
        x2: drifted.x,
        y2: drifted.y,
        life: 1,
      });
    }
    headPosRef.current = { x: drifted.x, y: drifted.y };
  }, [hueFromPitch]);

  // ── The frame loop ───────────────────────────────────────────────────────────
  const frame = useCallback(
    (ts: number) => {
      const canvas = canvasRef.current;
      const g = canvas?.getContext("2d");
      if (!canvas || !g) return;

      const dt = lastTsRef.current ? Math.min(0.05, (ts - lastTsRef.current) / 1000) : 0;
      lastTsRef.current = ts;

      const W = canvas.width;
      const H = canvas.height;

      // ── Auto-demo: if untouched, a synthetic player seeds a short motif ──────
      if (!interactedRef.current && demoQueueRef.current.length === 0) {
        const sinceStart = performance.now() - startedAtRef.current;
        if (sinceStart > AUTO_DEMO_DELAY) {
          // Build a 6–10 note motif across the field, then let the arc dream it.
          const n = 8;
          const now = performance.now();
          for (let i = 0; i < n; i++) {
            const phaseX = 0.18 + 0.64 * (i / (n - 1));
            const wobble = Math.sin(i * 1.7) * 0.22;
            demoQueueRef.current.push({
              x: phaseX,
              y: 0.5 - wobble - (i % 3) * 0.08,
              at: now + i * 420,
            });
          }
        }
      }
      if (demoQueueRef.current.length > 0) {
        const now = performance.now();
        while (
          demoQueueRef.current.length > 0 &&
          demoQueueRef.current[0].at <= now
        ) {
          const d = demoQueueRef.current.shift();
          if (d) onset(d.x, d.y, 0.7, true);
        }
      }

      // ── Advance alpha ───────────────────────────────────────────────────────
      if (autoAlphaRef.current) {
        // Rises slowly & automatically over ARC_SECONDS once running.
        const elapsed = (performance.now() - startedAtRef.current) / 1000;
        // Gentle ease so the opening stays clearly "awake".
        const raw = Math.min(1, Math.max(0, (elapsed - 4) / ARC_SECONDS));
        alphaRef.current = raw * raw * (3 - 2 * raw); // smoothstep
      }
      const alpha = alphaRef.current;
      audioRef.current?.setAlpha(alpha);
      driftPhaseRef.current += dt * (0.15 + alpha * 0.5);

      // ── Dream scheduling: read-head fires as alpha rises ─────────────────────
      if (alpha > 0.32 && fieldRef.current.size > 0) {
        if (nextStepAtRef.current === 0) nextStepAtRef.current = ts;
        if (ts >= nextStepAtRef.current) {
          stepDream(alpha);
          // Timing loosens as we dream: base interval jittered more at high alpha.
          const base = 620 - alpha * 240;
          const jitter = (Math.random() - 0.5) * alpha * 500;
          nextStepAtRef.current = ts + Math.max(150, base + jitter);
        }
      }

      // ── DRAW ─────────────────────────────────────────────────────────────────
      // Afterimage wash: a low-alpha black rect deepens smearing with alpha.
      const wash = 0.16 - alpha * 0.13; // less clearing in the dream = long trails.
      g.globalCompositeOperation = "source-over";
      g.fillStyle = `rgba(4, 4, 10, ${Math.max(0.02, wash)})`;
      g.fillRect(0, 0, W, H);

      // Filaments (read-head connections between recombined glyphs).
      g.globalCompositeOperation = "lighter";
      for (const f of filamentsRef.current) {
        g.strokeStyle = `hsla(${210 + alpha * 40}, 80%, 70%, ${f.life * 0.28})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(f.x1 * W, f.y1 * H);
        // A slight curve reads as a gesture, not a wire.
        const mx = (f.x1 + f.x2) * 0.5 * W;
        const my = ((f.y1 + f.y2) * 0.5 - 0.04) * H;
        g.quadraticCurveTo(mx, my, f.x2 * W, f.y2 * H);
        g.stroke();
        f.life -= dt * 0.8;
      }
      filamentsRef.current = filamentsRef.current.filter((f) => f.life > 0);

      // Blooms (persistent engram glyphs + transient re-fires).
      const scale = Math.min(W, H);
      for (const b of bloomsRef.current) {
        const px = b.x * W;
        const py = b.y * H;
        const r = b.radius * scale * (1 + (1 - b.life) * 1.4); // grow as it fades.
        const lum = b.persistent ? 0.32 + b.life * 0.5 : b.life;
        const grad = g.createRadialGradient(px, py, 0, px, py, r);
        grad.addColorStop(0, `hsla(${b.hue}, 85%, 70%, ${0.55 * lum})`);
        grad.addColorStop(0.4, `hsla(${b.hue}, 80%, 60%, ${0.22 * lum})`);
        grad.addColorStop(1, `hsla(${b.hue}, 80%, 55%, 0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();

        if (b.persistent) {
          // Persistent glyphs hold a luminous floor but breathe gently.
          b.life = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(driftPhaseRef.current + b.x * 10));
        } else {
          b.life -= dt * (0.35 + alpha * 0.25);
        }
      }
      bloomsRef.current = bloomsRef.current.filter(
        (b) => b.persistent || b.life > 0.02,
      );
      // Cap total blooms so memory stays bounded on long dreams.
      if (bloomsRef.current.length > 900) {
        bloomsRef.current.splice(0, bloomsRef.current.length - 900);
      }

      // Read-head marker: a brighter travelling presence.
      const hp = headPosRef.current;
      if (hp && alpha > 0.32) {
        const px = hp.x * W;
        const py = hp.y * H;
        const r = scale * 0.03;
        const grad = g.createRadialGradient(px, py, 0, px, py, r);
        grad.addColorStop(0, `hsla(${50 + alpha * 20}, 100%, 88%, 0.7)`);
        grad.addColorStop(1, "hsla(50, 100%, 80%, 0)");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();
      }

      g.globalCompositeOperation = "source-over";

      // Cheap readout throttle (state update ~5/s).
      if (ts - readoutAtRef.current > 200) {
        readoutAtRef.current = ts;
        setAlphaView(alpha);
      }

      rafRef.current = requestAnimationFrame(frame);
    },
    [onset, stepDream],
  );

  // ── Sizing ─────────────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  }, []);

  // ── Pointer input ────────────────────────────────────────────────────────────
  const pointerActiveRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastDragOnsetRef = useRef(0);

  const canvasToNorm = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0.5, y: 0.5 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleDown = useCallback(
    (clientX: number, clientY: number) => {
      pointerActiveRef.current = true;
      const p = canvasToNorm(clientX, clientY);
      lastPointRef.current = { x: p.x, y: p.y, t: performance.now() };
      onset(p.x, p.y, 0.8, false);
    },
    [canvasToNorm, onset],
  );

  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!pointerActiveRef.current) return;
      const now = performance.now();
      if (now - lastDragOnsetRef.current < 70) return; // rate-limit drag onsets.
      const p = canvasToNorm(clientX, clientY);
      const prev = lastPointRef.current;
      let vel = 0.6;
      if (prev) {
        const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
        vel = Math.min(1, 0.35 + dist * 6);
      }
      lastDragOnsetRef.current = now;
      lastPointRef.current = { x: p.x, y: p.y, t: now };
      onset(p.x, p.y, vel, false);
    },
    [canvasToNorm, onset],
  );

  const handleUp = useCallback(() => {
    pointerActiveRef.current = false;
    lastPointRef.current = null;
  }, []);

  // ── Begin (user gesture → audio) ─────────────────────────────────────────────
  const begin = useCallback(async () => {
    if (phase === "running") return;
    setErrorMsg(null);

    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext("2d")) {
      setPhase("error");
      setErrorMsg("Canvas2D is unavailable, so the engram field can't render.");
      return;
    }
    resize();

    // Fresh state.
    fieldRef.current = new EngramField(RING_CAPACITY);
    headRef.current = new ReadHead(fieldRef.current, 0x1078);
    bloomsRef.current = [];
    filamentsRef.current = [];
    alphaRef.current = 0;
    autoAlphaRef.current = true;
    interactedRef.current = false;
    headPosRef.current = null;
    nextStepAtRef.current = 0;
    demoQueueRef.current = [];
    startedAtRef.current = performance.now();
    lastInputAtRef.current = performance.now();

    // Audio — visuals still run if this is blocked.
    try {
      const ac = new AudioContext();
      if (ac.state === "suspended") await ac.resume();
      ctxRef.current = ac;
      audioRef.current = startAudio(ac);
      setAudioBlocked(false);
    } catch {
      audioRef.current = null;
      setAudioBlocked(true);
    }

    setPhase("running");
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, resize, frame]);

  // Manual alpha control.
  const closeEyes = useCallback(() => {
    autoAlphaRef.current = false;
    alphaRef.current = Math.min(1, alphaRef.current + 0.28);
  }, []);
  const wake = useCallback(() => {
    autoAlphaRef.current = false;
    alphaRef.current = Math.max(0, alphaRef.current - 0.32);
  }, []);
  const resumeAuto = useCallback(() => {
    autoAlphaRef.current = true;
    // Re-anchor the arc clock so it continues from the current alpha level.
    const inv = Math.max(0, Math.min(1, alphaRef.current));
    startedAtRef.current = performance.now() - (4 + inv * ARC_SECONDS) * 1000;
  }, []);

  // ── Teardown ─────────────────────────────────────────────────────────────────
  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 700);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── Phase label ──────────────────────────────────────────────────────────────
  const phaseLabel =
    alphaView < 0.32
      ? "awake — bottom-up"
      : alphaView < 0.7
        ? "drifting — replay begins"
        : "dreaming — top-down replay";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04040a] text-foreground">
      {/* Canvas field */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: phase === "running" ? "crosshair" : "default" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          handleDown(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => handleMove(e.clientX, e.clientY)}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
      />

      {/* Title + description (top-left) */}
      <div className="pointer-events-none absolute left-0 top-0 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Dream Replay
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Play the field; it records you. At the peak it stops listening and
          dreams your own playing back — recombined and drifting.
        </p>
      </div>

      {/* Start overlay */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="max-w-lg px-6 text-center">
            <p className="mb-6 text-base text-muted-foreground">
              Tap and drag the dark field to play warm just-intonation bells —
              each note is remembered. Over about fifty seconds the instrument
              closes its eyes and replays your gestures back, less and less
              faithfully. Headphones recommended. No microphone, no camera.
            </p>
            {phase === "error" && errorMsg && (
              <p className="mb-4 text-base text-violet-300">{errorMsg}</p>
            )}
            <button
              type="button"
              onClick={begin}
              className="rounded-lg bg-violet-500/20 px-6 py-3 text-lg font-medium text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* Controls (bottom) */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6">
          {audioBlocked && (
            <p className="text-base text-violet-300">
              Audio is blocked on this device — the visuals still run.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={wake}
              className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base font-medium text-foreground ring-1 ring-border transition hover:bg-accent"
            >
              ◂ Wake
            </button>
            <button
              type="button"
              onClick={resumeAuto}
              className="min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base font-medium text-muted-foreground ring-1 ring-border transition hover:bg-accent"
            >
              Let it drift
            </button>
            <button
              type="button"
              onClick={closeEyes}
              className="min-h-[44px] rounded-lg bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
            >
              Close your eyes ▸
            </button>
          </div>

          {/* alpha / phase readout */}
          <div className="flex w-full max-w-md flex-col items-center gap-1">
            <div className="flex w-full items-center justify-between text-sm font-mono text-muted-foreground">
              <span>awake</span>
              <span className="text-foreground">
                α {alphaView.toFixed(2)} · {phaseLabel}
              </span>
              <span>dreaming</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-400/70 to-violet-400"
                style={{ width: `${Math.round(alphaView * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Design notes toggle (top-right corner) */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base font-medium text-foreground ring-1 ring-border transition hover:bg-accent"
      >
        {showNotes ? "Close notes" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute right-4 top-20 max-h-[70vh] w-[min(92vw,32rem)] overflow-y-auto rounded-xl bg-[#0a0a16]/95 p-6 text-base leading-relaxed text-foreground ring-1 ring-border backdrop-blur">
          <h2 className="mb-2 text-xl font-semibold text-foreground">Design notes</h2>
          <p className="mb-3">
            An instrument that records you as you play, then at its peak stops
            listening and <em>dreams your own playing back</em> — your recent
            gestures replayed but recombined and drifting, less and less faithful.
          </p>
          <p className="mb-3">
            The <span className="font-mono text-violet-300">α</span> parameter runs
            0→1 across the arc. This is the <strong>oneirogen parameter</strong> of
            Bredenberg et al., <em>&ldquo;Modeling the hallucinatory effects of
            classical psychedelics in terms of replay-dependent plasticity
            mechanisms,&rdquo;</em> eLife 2026;14:RP105968 — where a 2026 model casts
            psychedelic hallucination as <strong>top-down generative replay of the
            recently-learned world</strong>, not bottom-up sensory noise. α=0 is
            awake (bottom-up / basal); α=1 is fully dreaming (top-down / apical
            replay dominating).
          </p>
          <p className="mb-3">
            <strong>Faithful (α low):</strong> every onset plays a bell and is
            recorded verbatim into a ring buffer, leaving a persistent glyph.{" "}
            <strong>Dreamed (α high):</strong> a top-down read-head walks the stored
            engrams in a recombined order — a stochastic walk over the recorded
            sequence transitions whose sampling temperature <em>is</em> α. Low-mid α
            retraces your real phrases; high α jumps and recombines fragments into
            sequences you never played, while positions drift and glyphs smear.
          </p>
          <p className="mb-3">
            Contrast <strong>Carhart-Harris &amp; Friston&apos;s REBUS</strong>{" "}
            (&ldquo;relaxed beliefs under psychedelics&rdquo;), where flattened
            high-level priors let bottom-up signals through — a{" "}
            <em>relaxation</em> account rather than an active <em>generative
            replay</em> one. Both live inside predictive-processing / active-
            inference; this piece takes the replay side literally and makes it
            audible: the priors here are your own just-played phrases.
          </p>
          <p className="text-muted-foreground">
            Two layers, metaphorically: basal (bottom-up, faithful live input,
            fading) vs apical (top-down, the dreaming glow, rising).
          </p>
        </div>
      )}
    </main>
  );
}
