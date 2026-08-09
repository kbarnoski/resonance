"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 7592-floatwell · page.tsx
//
// The one question: what if the browser's own CSS compositor — no canvas, no
// WebGL, not a single pixel we draw ourselves — could sink a viewer into the
// featureless "mythic" void of a sensory-deprivation float tank, where the
// empty field slowly resolves into archetypal forms as you descend?
//
// This is PURE CSS / DOM generative art. The visual is entirely layered
// gradients + filter blur + mix-blend-mode + transforms (see
// ./floatwell.module.css). The only per-frame work here is (a) updating a small
// set of CSS custom properties on the stage element, and (b) feeding the drone.
//
// The VERB is breath: tap (spacebar / click) at your own breathing rate and the
// void entrains — its whole-field brightness swells with your breath and the
// drone amplitude locks to your tempo. Breathe slower → sink deeper, calmer.
// Stop → the void stills.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { startVoidAudio, type VoidAudio } from "./audio";
import styles from "./floatwell.module.css";

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * clamp01(dt * rate);

// Descent traverses the full void in ~5 min when breathing calmly; slower when
// still or shallow. DESCENT_BASE is the per-second rate at rest.
const DESCENT_BASE = 1 / 320;
const DEFAULT_PERIOD = 6; // seconds — the auto-breath when no one is tapping

// Drifting phosphene blobs — a fixed, hand-tuned constellation (deterministic,
// no per-render randomness). Each is a soft radial-gradient div.
type Blob = {
  left: string;
  top: string;
  size: string;
  color: string;
  op: number;
  dur: string;
  delay: string;
  dx: string;
  dy: string;
};
const BLOBS: Blob[] = [
  { left: "22%", top: "34%", size: "34vmax", color: "rgba(150,110,240,0.9)", op: 0.5, dur: "46s", delay: "0s", dx: "5vw", dy: "-4vh" },
  { left: "64%", top: "28%", size: "26vmax", color: "rgba(176,67,224,0.75)", op: 0.42, dur: "58s", delay: "-8s", dx: "-4vw", dy: "5vh" },
  { left: "48%", top: "60%", size: "40vmax", color: "rgba(99,102,241,0.7)", op: 0.46, dur: "64s", delay: "-20s", dx: "3vw", dy: "-6vh" },
  { left: "34%", top: "70%", size: "22vmax", color: "rgba(196,181,253,0.6)", op: 0.34, dur: "52s", delay: "-14s", dx: "-6vw", dy: "-3vh" },
  { left: "74%", top: "58%", size: "30vmax", color: "rgba(139,92,246,0.72)", op: 0.4, dur: "70s", delay: "-30s", dx: "-3vw", dy: "-5vh" },
  { left: "50%", top: "20%", size: "24vmax", color: "rgba(167,139,250,0.6)", op: 0.32, dur: "60s", delay: "-40s", dx: "4vw", dy: "4vh" },
];

export default function FloatWellPage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const audioRef = useRef<VoidAudio | null>(null);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // ── hot-loop state (refs only — no per-frame React re-render) ──────────────
  const startedRef = useRef(false);
  const reducedRef = useRef(false);
  const lastTimeRef = useRef(0);
  const depthRef = useRef(0);
  const phaseRef = useRef(0); // breath phase (radians)
  const periodRef = useRef(DEFAULT_PERIOD); // seconds per breath
  const breathAmpRef = useRef(0.18); // how deep the swell is (grows while tapping)
  const lastTapRef = useRef(-1e9); // performance.now()/1000 of last tap
  const prevTapRef = useRef(-1e9);
  const tapPulseRef = useRef(0); // soft, non-flicker bloom on each tap

  // ── register a breath tap (spacebar / click / touch) ───────────────────────
  const onTap = useCallback(() => {
    const t = performance.now() / 1000;
    const interval = t - lastTapRef.current;
    // A plausible breath interval entrains the period; wild taps are ignored.
    if (interval > 1.4 && interval < 16) {
      periodRef.current = smooth(periodRef.current, interval, 0.6, 1);
    }
    prevTapRef.current = lastTapRef.current;
    lastTapRef.current = t;
    tapPulseRef.current = 1; // bloom, decays over ~1s
  }, []);

  // ── the render loop: drive CSS custom properties + feed the drone ──────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const stage = stageRef.current;
    if (stage) stage.dataset.reduced = String(reducedRef.current);
    lastTimeRef.current = performance.now() / 1000;

    const frame = () => {
      const now = performance.now() / 1000;
      let dt = now - lastTimeRef.current;
      lastTimeRef.current = now;
      if (dt > 0.1) dt = 0.1; // clamp after tab-away so nothing jumps

      // Is the viewer actively breathing (tapping)?
      const sinceTap = now - lastTapRef.current;
      const active = sinceTap < periodRef.current * 2.4;

      // Breath swell depth eases up while tapping, settles when stopped.
      breathAmpRef.current = smooth(breathAmpRef.current, active ? 1 : 0.16, 0.5, dt);
      // With no input, the period relaxes toward the default calm breath.
      if (!active) {
        periodRef.current = smooth(periodRef.current, DEFAULT_PERIOD, 0.1, dt);
      }

      // Advance the breath oscillator; raised cosine → 0 at exhale, 1 at inhale.
      phaseRef.current += dt * ((Math.PI * 2) / periodRef.current);
      const breath = 0.5 - 0.5 * Math.cos(phaseRef.current);
      const swell = breath * breathAmpRef.current;

      // Tap bloom decays smoothly (never a flash).
      tapPulseRef.current = smooth(tapPulseRef.current, 0, 1.6, dt);
      const pulse = tapPulseRef.current;

      // Calm = slow, steady breathing → deeper, faster descent.
      const calm = clamp01((periodRef.current - 2.5) / 7);
      const rate = DESCENT_BASE * (0.5 + 0.9 * calm) * (active ? 1 : 0.4);
      depthRef.current = clamp01(depthRef.current + dt * rate);
      const depth = depthRef.current;

      // ── composite the CSS custom properties ──────────────────────────────
      // Ganzfeld luminance: base + breath swell + a very slow drift + tap bloom.
      const drift = 0.06 * Math.sin(now * 0.06);
      const lum = 0.42 + 0.4 * swell + drift + pulse * 0.12;

      // Archetypal forms phase in at increasing depths.
      const mandalaOsc = 0.5 + 0.5 * Math.sin(now * 0.045);
      const mandala = clamp01((depth - 0.24) * 1.5) * (0.4 + 0.6 * mandalaOsc);
      const tunnel = clamp01((depth - 0.12) * 1.25);
      // Phosphenes are the shallow baseline; they recede as the mandala fills in.
      let phos = 0.32 + 0.4 * (0.5 + 0.5 * Math.sin(now * 0.03));
      phos *= 1 - mandala * 0.35;
      const aura = swell * 0.7 + pulse * 0.5;

      if (stage) {
        stage.style.setProperty("--lum", lum.toFixed(3));
        stage.style.setProperty("--depth", depth.toFixed(3));
        stage.style.setProperty("--mandala", mandala.toFixed(3));
        stage.style.setProperty("--tunnel", tunnel.toFixed(3));
        stage.style.setProperty("--phos", phos.toFixed(3));
        stage.style.setProperty("--aura", aura.toFixed(3));
      }

      const audio = audioRef.current;
      if (audio) {
        audio.setBreath(swell);
        audio.setDepth(depth);
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── keyboard: spacebar taps a breath (only once the descent has begun) ─────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (startedRef.current) onTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTap]);

  // ── enter the float: initialise audio (needs a user gesture) ───────────────
  const begin = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    try {
      const audio = startVoidAudio();
      if (!audio) {
        setNotice("Web Audio is unavailable — the void is silent, but you can still descend.");
      } else {
        audioRef.current = audio;
      }
    } catch {
      setNotice("Audio could not start — the void is silent, but you can still descend.");
    }
    onTap(); // first breath
  }, [onTap]);

  // ── teardown on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const onStageClick = useCallback(() => {
    if (startedRef.current) onTap();
  }, [onTap]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#050309] text-foreground">
      {/* ── the art: pure CSS/DOM compositor layers ── */}
      <div
        ref={stageRef}
        className={styles.stage}
        onClick={onStageClick}
        role="presentation"
        aria-hidden="true"
      >
        <div className={`${styles.layer} ${styles.ganzfeld}`} />
        <div className={`${styles.layer} ${styles.tunnel}`}>
          <div className={styles.tunnelRings} />
          <div className={styles.tunnelCore} />
        </div>
        <div className={`${styles.layer} ${styles.mandala}`} />
        <div className={`${styles.layer} ${styles.mandala2}`} />
        <div className={`${styles.layer} ${styles.aura}`}>
          <div className={styles.auraInner} />
        </div>
        <div className={`${styles.layer} ${styles.phosphenes}`}>
          {BLOBS.map((b, i) => (
            <div
              key={i}
              className={styles.blob}
              style={
                {
                  left: b.left,
                  top: b.top,
                  width: b.size,
                  height: b.size,
                  marginLeft: `calc(${b.size} / -2)`,
                  marginTop: `calc(${b.size} / -2)`,
                  background: `radial-gradient(circle, ${b.color} 0%, transparent 68%)`,
                  "--blob-op": b.op,
                  "--dur": b.dur,
                  "--delay": b.delay,
                  "--dx": b.dx,
                  "--dy": b.dy,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className={`${styles.layer} ${styles.vignette}`} />
      </div>

      {/* ── chrome ── */}
      {!started ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="pointer-events-auto max-w-md rounded-xl border border-border bg-background/70 p-7 text-center backdrop-blur-md">
            <h1 className="text-2xl font-semibold tracking-tight">Floatwell</h1>
            <p className="mt-3 text-base text-muted-foreground">
              A sensory-deprivation float, rendered by nothing but the browser&rsquo;s CSS
              compositor. Breathe the void: tap at your own rhythm and sink until the empty
              field resolves into archetypal forms.
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enter the float
            </button>
            <p className="mt-4 text-sm text-muted-foreground">
              Best with sound. Tap slowly. There is no flicker — only slow light.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* minimal in-float prompt, fades on its own via CSS */}
          <div className="pointer-events-none absolute inset-x-0 bottom-8 z-10 flex flex-col items-center gap-2 px-6 text-center">
            <p className="text-base text-muted-foreground">
              tap <span className="text-foreground">space</span> or the field with your breath ·
              slower sinks deeper
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="absolute bottom-6 right-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "close" : "design notes"}
          </button>
        </>
      )}

      {notice && (
        <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-md border border-border bg-background/80 px-4 py-2 text-sm text-destructive backdrop-blur">
          {notice}
        </div>
      )}

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-xl border border-border bg-background/85 p-6 backdrop-blur-md">
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <p className="mt-3 text-base text-muted-foreground">
              The renderer is the browser&rsquo;s CSS compositor. There is no canvas, no
              WebGL, no SVG path-art — every mark is a layered radial/conic gradient shaped
              by <code>filter: blur</code>, <code>mix-blend-mode: screen</code> and slow
              transforms. A render loop only rewrites a few CSS custom properties per frame.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              A single <span className="text-foreground">depth</span> value rises
              monotonically over minutes. Around it, archetypal forms phase in and out of the
              Ganzfeld void: a tunnel-to-light, soft mandala rings, drifting phosphene blobs —
              all blurred gradients, never hard edges. Your breath paces the descent: tapping
              entrains the whole-field brightness swell and the drone&rsquo;s amplitude to
              your tempo. Breathe slower to sink deeper; stop and the void stills. Nothing
              ever flickers — luminance only drifts at a breath rate.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Sound is a just-intonation cosmic-ambient drone (a low detuned bed with a
              single slowly-rotating overtone) fed through a vast generated convolution
              reverb. No melody, no percussion — boundless and minimal.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              References: John C. Lilly&rsquo;s flotation / REST tanks; the Ganzfeld effect;
              Ganzfeld / hypnagogia and sensory-deprivation phenomenology (reduced sensory
              input surfacing endogenous, dream-like geometry); &ldquo;Beyond the reducing
              valve: computational neurophenomenology of altered states&rdquo; (Frontiers 2026).
            </p>
            <div className="mt-5">
              <Link
                href="/dream"
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                ← back to the dream lab
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
