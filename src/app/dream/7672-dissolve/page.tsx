"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker } from "../_shared/visionary/safeFlicker";
import { DissolveScene } from "./scene";
import { startSilhouette, type SilhouetteRig, type SilhouetteMode } from "./silhouette";
import { makeDissolveAudio, type DissolveAudio } from "./audio";

type Phase = "idle" | "starting" | "running" | "error";

// Deterministic seed for the virtual performer (never Date.now / Math.random).
const PERFORMER_SEED = 0x7672d155;

export default function DissolvePage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<DissolveScene | null>(null);
  const rigRef = useRef<SilhouetteRig | null>(null);
  const audioRef = useRef<DissolveAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const clockRef = useRef(0);

  const precisionRef = useRef(1); // felt edge sharpness, starts present
  const depthRef = useRef(0); // long-form dissolution
  const flickerRef = useRef(
    createSafeFlicker({ maxHz: 3, defaultHz: 0.12, floor: 0.72 }),
  );
  const notchRef = useRef(-1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<SilhouetteMode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [precision, setPrecision] = useState(1);
  const [depth, setDepth] = useState(0);
  const [showNotes, setShowNotes] = useState(false);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    sceneRef.current?.dispose();
    sceneRef.current = null;
    rigRef.current?.stop();
    rigRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        if (ctx.state !== "closed") void ctx.close();
      }, 900);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    const onResize = () => sceneRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const begin = useCallback(async () => {
    if (phase === "starting" || phase === "running") return;
    setPhase("starting");
    setErrorMsg(null);
    setNotice(null);

    const container = containerRef.current;
    if (!container) {
      setPhase("error");
      setErrorMsg("Could not mount the canvas.");
      return;
    }

    // ── Visuals (WebGL2 may be unavailable → graceful error) ──────────────────
    let scene: DissolveScene;
    try {
      scene = new DissolveScene(container);
    } catch {
      setPhase("error");
      setErrorMsg(
        "WebGL2 is unavailable on this device, so the piece can't render.",
      );
      return;
    }
    sceneRef.current = scene;

    // ── Audio (built + resumed inside the gesture) ────────────────────────────
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      if (ctx.state === "suspended") await ctx.resume();
      ctxRef.current = ctx;
      audioRef.current = makeDissolveAudio(ctx);
    } catch {
      /* audio unavailable — visuals still run */
    }

    // ── Silhouette source (camera or deterministic performer) ─────────────────
    const { rig, fallbackReason } = await startSilhouette(PERFORMER_SEED);
    rigRef.current = rig;
    setMode(rig.mode);
    if (fallbackReason) setNotice(fallbackReason);

    flickerRef.current.enable();
    precisionRef.current = 1;
    depthRef.current = 0;
    clockRef.current = 0;
    lastRef.current = performance.now();
    setPhase("running");

    const loop = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      clockRef.current += dt;

      const rigNow = rigRef.current;
      const sc = sceneRef.current;
      if (rigNow && sc) {
        const { motion } = rigNow.read(dt);

        // Edge-precision: motion snaps it SHARP fast; stillness lets it DECAY
        // slowly toward 0 (self-attenuation of the bodily boundary).
        const pTarget = Math.min(1, motion * 3.4);
        let pr = precisionRef.current;
        const rising = pTarget > pr;
        const tauP = rising ? 0.22 : 9.0;
        pr += (pTarget - pr) * (1 - Math.exp(-dt / tauP));
        pr = Math.min(1, Math.max(0, pr));
        precisionRef.current = pr;

        // Long-form depth: accrues only under sustained stillness (~2–3 min to
        // full), collapses quickly on any real motion.
        const stillEnough = pr < 0.3;
        const dGoal = stillEnough ? 1 : 0;
        const tauD = stillEnough ? 55 : 1.4;
        let dp = depthRef.current;
        dp += (dGoal - dp) * (1 - Math.exp(-dt / tauD));
        dp = Math.min(1, Math.max(0, dp));
        depthRef.current = dp;

        const lum = flickerRef.current.value(clockRef.current);
        sc.render(rigNow.mask, pr, dp, lum, dt);
        audioRef.current?.setState(pr, dp);
        audioRef.current?.step(dt);

        // Throttle React re-renders to meter notches.
        const notch = Math.round(pr * 20) * 100 + Math.round(dp * 20);
        if (notch !== notchRef.current) {
          notchRef.current = notch;
          setPrecision(pr);
          setDepth(dp);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [phase]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-black text-foreground">
      {/* Fullscreen WebGL2 quad mounts here, behind the chrome. */}
      <div ref={containerRef} className="absolute inset-0" aria-hidden />

      {/* Idle / start / error panel */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6">
          <div className="max-w-lg rounded-lg border border-border bg-background/70 p-6 shadow-lg backdrop-blur-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Dissolve
            </h1>
            <p className="mt-3 text-base leading-relaxed text-foreground">
              Watch your own bodily boundary un-form into hyperspace. The camera
              reads your silhouette; a running{" "}
              <span className="text-primary">edge-precision</span> models the felt
              self / not-self boundary. Move and your outline snaps sharp and
              present. Hold still and precision decays — your edge dissolves
              outward through a log-polar warp into a form-constant tunnel, and you
              merge into a boundless field.
            </p>

            <button
              type="button"
              onClick={begin}
              disabled={phase === "starting"}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "starting" ? "Dissolving in…" : "Enable camera · begin"}
            </button>

            {errorMsg && (
              <p className="mt-4 text-base text-destructive">{errorMsg}</p>
            )}

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Dim the room and use headphones. The camera is read only in your
              browser to sense your silhouette and stillness — nothing is recorded
              or sent anywhere. With no camera it runs a deterministic virtual
              performer that moves, stills and dissolves on its own, so it is never
              blank or silent. No strobing; respects reduced-motion.
            </p>
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-5 top-5 z-10 max-w-xs select-none sm:left-7 sm:top-7">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Dissolve
          </h1>
          <p className="mt-1 text-sm text-primary">
            {mode === "camera"
              ? "● live silhouette · hold still to dissolve"
              : "● virtual performer · self-dissolving"}
          </p>
          {notice && (
            <p className="mt-2 text-sm text-destructive">{notice}</p>
          )}
          <p className="mt-2 text-sm text-muted-foreground">
            Any movement snaps your edge back sharp and present. Sustained
            stillness deepens the dissolution over minutes.
          </p>

          <div className="mt-4 space-y-3">
            <Meter label="edge precision" value={precision} />
            <Meter label="dissolution depth" value={depth} />
          </div>
        </div>
      )}

      {/* Design-notes toggle */}
      {phase === "running" && (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="absolute right-5 top-5 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-7 sm:top-7"
        >
          Notes
        </button>
      )}

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/50 px-6 py-16 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> Can you feel
                your own bodily boundary un-form? Predictive-processing accounts of
                the self hold that the brain constantly attenuates its own body
                signals — and that sustained stillness and attention can push that
                attenuation until the felt self / not-self edge dissolves.
              </p>
              <p>
                <span className="text-foreground">The mechanic.</span> The front
                camera is read into a small grab canvas; a silhouette mask is built
                on the CPU from a running-background foreground plus an
                instantaneous frame-difference, and the mean frame-difference gives
                a scalar motion energy. A single{" "}
                <span className="text-foreground">edge-precision</span> value tracks
                motion: it snaps sharp on movement and decays slowly toward zero in
                stillness. In a WebGL2 fragment shader the mask is sampled twice —
                once sharp, once pulled from a smaller log-radius so the edge blooms
                outward through the inverse log-polar exp() warp — and mixed with a
                tunnel + honeycomb form-constant field. Ping-pong FBO feedback
                drifts the previous frame outward down the tunnel for visionary
                trails.
              </p>
              <p>
                <span className="text-foreground">Sound.</span> Motion focuses the
                audio to a bright present tone (an opening just-intonation drone bed
                and a Shepard–Risset ascent); stillness opens a wide, detuned wash
                whose detune spread widens as the dissolution deepens.
              </p>
              <p>
                <span className="text-foreground">References.</span> Becattini,
                Lifshitz &amp; Miller (2026), &ldquo;Learning to attenuate
                myself&rdquo;, <em>Neuroscience of Consciousness</em>; the
                Bressloff–Cowan cortical model of geometric hallucinations; and
                Klüver&apos;s four form constants.
              </p>
              <p>
                <span className="text-foreground">Safety &amp; scope.</span> No hard
                strobe — luminance is a slow (≤3 Hz) sine drift, form-field drift is
                sub-1 Hz, feedback is bounded. Respects reduced-motion. With no
                camera a deterministic performer self-demos the full arc.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7672-dissolve"]} />
    </main>
  );
}

function Meter({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-mono text-xs text-primary">
          {value.toFixed(2)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}
