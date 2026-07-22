"use client";

// 2326-we-breathe — "We Breathe".
// The lab's first genuinely MULTI-CONTEXT piece. Every open tab/window of this
// page is a living breathing presence in a shared room. Each presence is a
// Kuramoto phase-oscillator that couples weakly toward the collective breath;
// the coherence R = |mean(e^{iθ})| is a PURE EMERGENT READOUT — nobody holds an
// intensity dial. Presences gossip over a same-origin BroadcastChannel
// (transport.ts) with NO server. A seeded chorus (rng.ts @ 0x2326) keeps a solo
// reviewer in a full, coupling room. Your breath drives your presence (mic
// loudness, or pointer-hold = inhale). A warm-dawn WebGL2 fragment field
// (field.ts) blooms as one at high R and fractures cool/choppy at low R; a
// collective breath drone (audio.ts) detunes/beats when "many", blooms toward
// unison when "one". See README.md.
//
// state: collective effervescence / inter-brain respiratory synchrony
// pole: cosmic-ambient co-regulation

import { useCallback, useEffect, useRef, useState } from "react";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { Room } from "./transport";
import { CollectiveBreath } from "./audio";
import { FieldRenderer, type FieldPresence } from "./field";

type Phase = "idle" | "live" | "error";

interface Stats {
  R: number;
  peers: number;
  synthetic: boolean;
  channelOk: boolean;
}

export default function WeBreathePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [stats, setStats] = useState<Stats>({
    R: 0,
    peers: 0,
    synthetic: true,
    channelOk: true,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<CollectiveBreath | null>(null);
  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const holdingRef = useRef(false);
  const envRef = useRef(0.15);
  const reducedRef = useRef(false);

  // Latest-value refs so the render loop (mounted once) sees fresh values.
  const mic = useMicAnalyser({ smoothing: 0.9, gain: 1.8 });
  const micRef = useRef(mic);
  micRef.current = mic;
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;

  // Surface mic-permission failures as a destructive notice; the synthetic /
  // pointer-hold path keeps working regardless.
  useEffect(() => {
    if (mic.error) {
      setNotice(
        "Microphone unavailable — " +
          mic.error +
          " Hold anywhere to breathe instead; the room keeps breathing.",
      );
    }
  }, [mic.error]);

  // ── Mount: build the WebGL2 field + the presence room. Visuals + presence run
  //    immediately; audio waits for the Start gesture.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current = prefersReducedMotion();

    let renderer: FieldRenderer;
    try {
      renderer = new FieldRenderer(canvas);
    } catch (e) {
      setPhase("error");
      setNotice(
        "WebGL2 is unavailable in this browser, so the shared breath field " +
          "can't render. The idea: every open tab is a breathing presence that " +
          "weakly couples into one collective rhythm — coherence emerges, nobody " +
          "controls it." +
          (e instanceof Error ? " (" + e.message + ")" : ""),
      );
      return;
    }
    rendererRef.current = renderer;

    const room = new Room();
    roomRef.current = room;
    room.start();

    const applyResize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.resize(window.innerWidth, window.innerHeight, dpr);
    };
    applyResize();
    window.addEventListener("resize", applyResize);

    lastRef.current = performance.now();
    let statAcc = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - lastRef.current) / 1000 || 0);
      lastRef.current = now;

      // Drive self energy from a smoothed breath envelope.
      const m = micRef.current;
      let target = holdingRef.current ? 0.9 : 0.15;
      if (m.running) {
        const f = m.getFrame();
        if (f) target = Math.max(0.05, Math.min(1, f.amplitude * 1.7));
      }
      envRef.current += (target - envRef.current) * Math.min(1, dt * 3);
      room.setSelfEnergy(envRef.current);

      const snap = room.step(dt);

      const presences: FieldPresence[] = snap.presences.map((p) => ({
        pos: p.pos,
        phase: p.phase,
        energy: p.energy,
        hue: p.hue,
      }));
      renderer.render({
        time: now / 1000,
        R: snap.R,
        meanPhase: snap.meanPhase,
        reduced: reducedRef.current,
        presences,
      });

      const swell = 0.5 + 0.5 * Math.sin(snap.meanPhase);
      audioRef.current?.update(snap.R, swell, snap.meanEnergy);

      statAcc += dt;
      if (statAcc > 0.2) {
        statAcc = 0;
        setStats({
          R: snap.R,
          peers: snap.realPeers,
          synthetic: snap.synthetic,
          channelOk: snap.channelOk,
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", applyResize);
      void audioRef.current?.dispose();
      audioRef.current = null;
      room.dispose();
      roomRef.current = null;
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (phaseRef.current === "error") return;
    setNotice(null);
    // Audio must begin inside the user gesture.
    if (!audioRef.current) {
      try {
        const a = new CollectiveBreath();
        await a.start();
        audioRef.current = a;
      } catch {
        setNotice("Web Audio could not start in this browser.");
      }
    }
    setPhase("live");
    // Ask for the mic (optional). Denial falls back to pointer-hold/synthetic.
    try {
      await micRef.current.start();
    } catch {
      /* handled via mic.error effect */
    }
  }, []);

  const onPointerDown = useCallback(() => {
    holdingRef.current = true;
  }, []);
  const onPointerUp = useCallback(() => {
    holdingRef.current = false;
  }, []);

  let modeLabel = "you";
  if (stats.peers > 0) modeLabel = `${stats.peers + 1} breathing together`;
  else if (!stats.channelOk) modeLabel = "seeded chorus (no cross-tab support)";
  else if (stats.synthetic) modeLabel = "seeded chorus + you";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Top-left: title + description + controls */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            We Breathe
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            A room where every open browser tab is a living, breathing presence.
            The collective breath entrains into one shared rhythm you can feel —
            with nobody in control of it.
          </p>

          {notice && (
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-destructive">
              {notice}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {phase !== "error" && (
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {phase === "live" ? "Breathing" : "Start · begin the breath"}
              </button>
            )}
            <button
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
          </div>

          {phase === "live" && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {mic.running
                ? "Breathe near the mic — your inhale swells the room."
                : "Hold anywhere to inhale."}{" "}
              <span className="text-foreground">
                Open this page in another tab or window to breathe together.
              </span>
            </p>
          )}
        </div>

        {/* Bottom-left: emergent readout HUD */}
        <div className="pointer-events-none flex flex-col gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            coherence R (emergent)
          </span>
          <div className="flex items-center gap-3">
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${Math.round(stats.R * 100)}%` }}
              />
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {stats.R.toFixed(2)} · {modeLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Design-notes overlay */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm">
          <div className="max-h-[80dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background/95 p-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em]">
                  the one question
                </p>
                <p className="mt-1">
                  What if an altered state needed OTHER PEOPLE — a room where the
                  collective breath of everyone here entrains into one shared
                  rhythm you can feel, with nobody in control of it?
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em]">
                  real cross-tab presence
                </p>
                <p className="mt-1">
                  Each tab gossips a breath heartbeat (phase, rate, energy, hue)
                  over a same-origin <span className="text-foreground">BroadcastChannel</span> every
                  120ms — no server, no network. Open a second tab and a genuine
                  second oscillator joins, usually out of phase, so R drops and
                  the field fractures before re-entraining. When you are alone a
                  deterministic seeded chorus keeps the room populated.
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em]">
                  the coupling (no master knob)
                </p>
                <p className="mt-1">
                  Every presence is a Kuramoto oscillator dθ/dt = 2π·rate +
                  (K/N)·Σ sin(θⱼ−θ) with a modest FIXED K. Coherence R =
                  |mean(e^{"{iθ}"})| over all present phases is a pure readout: it
                  rises with entrainment and falls into turbulence. Low R shifts
                  the field cool, choppy and grainy and detunes the pad into
                  beating; high R merges the blooms into one warm ambient swell
                  and pulls the pad toward unison.
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em]">
                  references
                </p>
                <p className="mt-1">
                  Durkheim — collective effervescence (arises even in digital
                  space). 2026 Frontiers in Psychology fNIRS hyperscanning —
                  inter-brain synchrony rises with shared music. Kuramoto (1975)
                  — coupled-oscillator sync and the order parameter R.
                </p>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em]">
                  limitations
                </p>
                <p className="mt-1">
                  BroadcastChannel is same-origin/same-browser, so this is
                  multi-tab/multi-window, not internet-multi-device. Safe by
                  design: all motion is slow luminance drift at breath rate
                  (≤0.3 Hz), no strobe; reduced-motion is honored.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
