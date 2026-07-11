"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ── Audio constants ──────────────────────────────────────────────────────────
// A warm consonant drone (a perfect fifth): A2 + E3. The child never picks a
// note — they only bend the DETUNE between two voices of each pitch, which is
// what makes the beating (roughness) the whole prototype is about.
const VOICE_HZ = [110, 164.81] as const; // A2, E3
const MASTER_GAIN = 0.24; // kids-safe ceiling (< 0.28)
const LOWPASS_HZ = 6000; // soft top end
const MAX_DETUNE_HZ = 9; // fastest beat rate when twisted fully apart

// ── Visual constants ─────────────────────────────────────────────────────────
const AUTO_DEMO_IDLE_MS = 2000; // idle before the layer drifts on its own
const STRIPE_SPACING = 22; // px between stripes in the base grid
const MAX_TWIST_RAD = 0.42; // angle range the child can twist the top layer

// Map the top layer's twist (0 = aligned, 1 = fully twisted) to a beat rate.
function twistToBeat(twist: number): number {
  return Math.abs(twist) * MAX_DETUNE_HZ;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Audio graph refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  // Each base pitch gets two oscillators; we detune the second by ±beat Hz.
  const oscARef = useRef<OscillatorNode[]>([]);
  const oscBRef = useRef<OscillatorNode[]>([]);

  // Interaction state (refs so the rAF loop stays self-contained)
  const twistRef = useRef(0); // -1 .. 1  (how far the top layer is twisted)
  const phaseRef = useRef(0); // px offset of top layer, animated for rolling band
  const draggingRef = useRef(false);
  const lastInputRef = useRef(0); // timestamp of last real input
  const autoDirRef = useRef(1); // direction of the auto-demo drift
  const dragStartXRef = useRef(0);
  const dragStartTwistRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [audioError, setAudioError] = useState(false);

  // ── Audio start (must happen inside a user gesture on iOS) ───────────────────
  function startAudio() {
    if (ctxRef.current) {
      void ctxRef.current.resume();
      setStarted(true);
      return;
    }
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        setAudioError(true);
        setStarted(true);
        return;
      }
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0;

      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = LOWPASS_HZ;
      lp.Q.value = 0.5;

      master.connect(lp);
      lp.connect(ctx.destination);

      const oscA: OscillatorNode[] = [];
      const oscB: OscillatorNode[] = [];
      for (const hz of VOICE_HZ) {
        // Voice gain blends the two-osc pair gently.
        const vg = ctx.createGain();
        vg.gain.value = 0.5;
        vg.connect(master);

        const a = ctx.createOscillator();
        a.type = "sine";
        a.frequency.value = hz;
        const ag = ctx.createGain();
        ag.gain.value = 0.5;
        a.connect(ag);
        ag.connect(vg);

        const b = ctx.createOscillator();
        b.type = "sine";
        b.frequency.value = hz;
        const bg = ctx.createGain();
        bg.gain.value = 0.5;
        b.connect(bg);
        bg.connect(vg);

        a.start();
        b.start();
        oscA.push(a);
        oscB.push(b);
      }

      ctxRef.current = ctx;
      masterRef.current = master;
      oscARef.current = oscA;
      oscBRef.current = oscB;

      // Soft fade-in of the always-on bed.
      const now = ctx.currentTime;
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(MASTER_GAIN, now + 0.9);

      void ctx.resume();
      setStarted(true);
    } catch {
      setAudioError(true);
      setStarted(true);
    }
  }

  // Push the current twist into the oscillator detune (the audible beating).
  function applyDetune() {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const beat = twistToBeat(twistRef.current); // Hz
    const oscB = oscBRef.current;
    const t = ctx.currentTime;
    for (let i = 0; i < oscB.length; i++) {
      const target = VOICE_HZ[i] + beat;
      // Smooth glide so detune changes never click.
      oscB[i].frequency.setTargetAtTime(target, t, 0.08);
    }
  }

  // ── Main loop: draw the moiré field, advance the rolling band, auto-demo ─────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let w = 0;
    let h = 0;
    let dpr = 1;

    function resize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    lastInputRef.current = performance.now();

    // Draw one grid of stripes radiating from center, rotated by `angle`,
    // offset along its own axis by `offset` px. Op-art high-contrast bands.
    function drawStripes(
      g: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      angle: number,
      offset: number,
      color: string,
    ) {
      g.save();
      g.translate(cx, cy);
      g.rotate(angle);
      g.fillStyle = color;
      const reach = Math.hypot(w, h);
      const start = -reach;
      const end = reach;
      // Concentric-ish vertical stripes (band thickness half the spacing).
      for (let x = start; x < end; x += STRIPE_SPACING) {
        const xx = x + (offset % STRIPE_SPACING);
        g.fillRect(xx, -reach, STRIPE_SPACING * 0.5, reach * 2);
      }
      g.restore();
    }

    function drawRings(
      g: CanvasRenderingContext2D,
      cx: number,
      cy: number,
      offset: number,
      color: string,
    ) {
      g.save();
      g.strokeStyle = color;
      g.lineWidth = STRIPE_SPACING * 0.5;
      const reach = Math.hypot(w, h);
      for (let r = STRIPE_SPACING; r < reach; r += STRIPE_SPACING) {
        const rr = r + (offset % STRIPE_SPACING);
        g.beginPath();
        g.arc(cx, cy, Math.max(1, rr), 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }

    function drawField(now: number) {
      if (!canvas) return;
      const g = ctx2d;
      if (!g) return;

      // Auto-demo: if untouched, slowly drift the twist back and forth so a
      // hands-off glance is alive within ~1s. Real input cancels it.
      const idle = now - lastInputRef.current;
      if (!draggingRef.current && idle > AUTO_DEMO_IDLE_MS) {
        twistRef.current += autoDirRef.current * 0.0016;
        if (twistRef.current > 0.85) autoDirRef.current = -1;
        if (twistRef.current < -0.85) autoDirRef.current = 1;
        applyDetune();
      }

      // Phase advances faster when more twisted → visible band shimmers faster,
      // matching the faster audio beating. When aligned, it nearly stops.
      const beat = twistToBeat(twistRef.current); // Hz
      phaseRef.current += 0.25 + beat * 0.9;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Warm light field (Bridget Riley territory): cream ground, deep ink bands.
      g.fillStyle = "#fdf3e3";
      g.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const twist = twistRef.current * MAX_TWIST_RAD;

      // Multiply blend makes the two layers physically interfere → true moiré.
      g.globalCompositeOperation = "multiply";

      // Bottom layer: rings (fixed). Top layer: stripes (twisting).
      drawRings(g, cx, cy, phaseRef.current * 0.4, "#7c2d12");
      drawStripes(g, cx, cy, twist, phaseRef.current, "#1e3a8a");

      g.globalCompositeOperation = "source-over";

      // A soft warm vignette so the center reads as the "play" zone.
      const grad = g.createRadialGradient(
        cx,
        cy,
        Math.min(w, h) * 0.15,
        cx,
        cy,
        Math.max(w, h) * 0.7,
      );
      grad.addColorStop(0, "rgba(253,243,227,0)");
      grad.addColorStop(1, "rgba(253,243,227,0.55)");
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);

      // Calm/rough read-out ring: tightens to a calm dot when aligned.
      const roughness = Math.abs(twistRef.current); // 0 calm .. 1 rough
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.001 * (1 + beat));
      const ringR = 26 + roughness * 40 * pulse;
      g.beginPath();
      g.arc(cx, cy, ringR, 0, Math.PI * 2);
      g.lineWidth = 5;
      g.strokeStyle = roughness < 0.12 ? "#16a34a" : "#b45309";
      g.globalAlpha = 0.85;
      g.stroke();
      g.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(drawField);
    }

    rafRef.current = requestAnimationFrame(drawField);

    // ── Pointer handling (touch + mouse via Pointer Events) ────────────────────
    function pointerDown(e: PointerEvent) {
      draggingRef.current = true;
      lastInputRef.current = performance.now();
      dragStartXRef.current = e.clientX;
      dragStartTwistRef.current = twistRef.current;
      canvas?.setPointerCapture(e.pointerId);
    }
    function pointerMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      lastInputRef.current = performance.now();
      const dx = e.clientX - dragStartXRef.current;
      // Forgiving: ~280px swing covers the full twist range.
      const next = dragStartTwistRef.current + dx / 280;
      twistRef.current = Math.max(-1, Math.min(1, next));
      applyDetune();
    }
    function pointerUp(e: PointerEvent) {
      draggingRef.current = false;
      lastInputRef.current = performance.now();
      try {
        canvas?.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be gone */
      }
    }

    canvas.addEventListener("pointerdown", pointerDown);
    canvas.addEventListener("pointermove", pointerMove);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      // Full audio teardown.
      const ctx = ctxRef.current;
      const master = masterRef.current;
      if (ctx) {
        try {
          if (master) {
            master.gain.cancelScheduledValues(ctx.currentTime);
            master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
          }
          for (const o of oscARef.current) {
            try {
              o.stop();
            } catch {
              /* already stopped */
            }
          }
          for (const o of oscBRef.current) {
            try {
              o.stop();
            } catch {
              /* already stopped */
            }
          }
          void ctx.close();
        } catch {
          /* teardown best-effort */
        }
      }
      ctxRef.current = null;
      masterRef.current = null;
      oscARef.current = [];
      oscBRef.current = [];
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#fdf3e3] text-stone-900">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: "grab" }}
      />

      {/* Hero overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center px-5 pt-6 text-center">
        <h1 className="text-3xl font-black tracking-tight text-stone-900 drop-shadow-sm sm:text-4xl">
          Roughness &amp; Calm
        </h1>
        <p className="mt-2 max-w-md text-base font-medium text-stone-800/90">
          Slide the stripes with one finger. Line them up to hear one calm tone —
          twist them apart to make it shimmer and wobble.
        </p>

        {!started && (
          <button
            type="button"
            onClick={startAudio}
            className="pointer-events-auto mt-4 rounded-full bg-stone-900 px-6 py-2.5 text-lg font-bold text-foreground shadow-lg transition active:scale-95"
          >
            ▶ Play
          </button>
        )}

        {started && audioError && (
          <p className="mt-4 max-w-md text-base font-semibold text-violet-600">
            Sound isn&apos;t available on this device — but you can still play
            with the moiré bands by sliding them.
          </p>
        )}

        {started && !audioError && (
          <p className="mt-3 text-base font-semibold text-stone-700/90">
            Drag left or right anywhere on the pattern.
          </p>
        )}
      </div>

      {/* Design notes link */}
      <Link
        href="/dream/899-kids-moire-beats/README.md"
        className="absolute bottom-3 right-4 z-10 text-base font-medium text-stone-700/80 underline decoration-stone-500/40 underline-offset-2 hover:text-stone-900"
      >
        Read the design notes
      </Link>
    </main>
  );
}
