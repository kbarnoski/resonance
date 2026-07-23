"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { useMicAnalyser } from "../_shared/use-mic-analyser";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  makeEngine,
  stepEngine,
  humanTap,
  lockLabel,
  F_LO,
  F_HI,
  type EngineState,
  type Snapshot,
} from "./engine";
import { LockAudio } from "./audio";
import { createTunnel, type Tunnel } from "./tunnel";

interface Readout {
  plv: number;
  tempoMatch: number; // 1 − tempoError
  phaseAlign: number;
  coherence: number;
  tempoHz: number;
  tapBpm: number;
  label: "searching" | "off-phase" | "entrained";
  autopilot: boolean;
}

const EMPTY_READOUT: Readout = {
  plv: 0,
  tempoMatch: 0,
  phaseAlign: 0,
  coherence: 0,
  tempoHz: F_LO,
  tapBpm: 0,
  label: "searching",
  autopilot: true,
};

export default function LockPage() {
  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [readout, setReadout] = useState<Readout>(EMPTY_READOUT);

  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<EngineState | null>(null);
  const audioRef = useRef<LockAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const tunnelRef = useRef<Tunnel | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const reducedRef = useRef(false);
  const micOnRef = useRef(false);
  const readoutMsRef = useRef(0);

  // useMicAnalyser is a real hook; keep a live ref so the rAF loop can poll it
  // without re-subscribing every frame. Assigning during render is intentional.
  const mic = useMicAnalyser({ onsetThreshold: 1.9, smoothing: 0.7 });
  const micRef = useRef(mic);
  micRef.current = mic;

  const doHumanTap = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    const wasAuto = e.autopilot;
    humanTap(e);
    audioRef.current?.tapClick(true);
    if (wasAuto) {
      setReadout((r) => ({ ...r, autopilot: false }));
    }
  }, []);

  const takeOver = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    e.autopilot = false;
    setReadout((r) => ({ ...r, autopilot: false }));
  }, []);

  const enableMic = useCallback(async () => {
    await micRef.current.start();
    // start() sets .running / .error internally; reflect next tick
    window.setTimeout(() => {
      if (micRef.current.running) {
        micOnRef.current = true;
        setMicState("on");
      } else {
        setMicState("denied");
      }
    }, 200);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    teardownRef.current?.();
    teardownRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    if (running) return;
    const mount = mountRef.current;
    if (!mount) return;

    reducedRef.current = prefersReducedMotion();
    const reduced = reducedRef.current;

    // ── AudioContext must be created inside the Start gesture ────────────────
    let ctx: AudioContext | null = null;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctx = new Ctor();
      await ctx.resume();
    } catch {
      ctx = null;
    }
    let audio: LockAudio | null = null;
    if (ctx) {
      ctxRef.current = ctx;
      audio = new LockAudio(ctx, reduced);
      audio.start();
      audioRef.current = audio;
    }

    const engine = makeEngine();
    engineRef.current = engine;

    // ── three.js renderer (falls back to audio-only if WebGL is missing) ─────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      renderer = null;
    }
    let tunnel: Tunnel | null = null;
    let ro: ResizeObserver | null = null;
    if (!renderer) {
      setWebglFailed(true);
    } else {
      setWebglFailed(false);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(new THREE.Color(0x12151a), 1);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";
      rendererRef.current = renderer;

      tunnel = createTunnel();
      tunnelRef.current = tunnel;

      const resize = () => {
        const w = mount.clientWidth || 1;
        const h = mount.clientHeight || 1;
        renderer!.setSize(w, h, false);
        tunnel!.resize(w, h);
      };
      resize();
      ro = new ResizeObserver(resize);
      ro.observe(mount);
    }

    setRunning(true);
    setReadout({ ...EMPTY_READOUT, autopilot: true });

    // ── input listeners ──────────────────────────────────────────────────────
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === "Space" && !ev.repeat) {
        ev.preventDefault();
        doHumanTap();
      }
    };
    const onPointer = () => doHumanTap();
    window.addEventListener("keydown", onKey);
    mount.addEventListener("pointerdown", onPointer);

    // ── the loop ─────────────────────────────────────────────────────────────
    let last = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;

      // mic onsets act as human taps
      if (micOnRef.current && micRef.current.running) {
        const f = micRef.current.getFrame();
        if (f && f.onset) doHumanTap();
      }

      const snap: Snapshot = stepEngine(engine, dt);
      const bright = (snap.tempo - F_LO) / (F_HI - F_LO);
      if (snap.beat) audioRef.current?.beatClick(bright);
      if (snap.tap) audioRef.current?.tapClick(false); // autopilot tap sound
      audioRef.current?.update(snap.coherence, snap.phaseAlign);

      if (tunnelRef.current && rendererRef.current) {
        tunnelRef.current.update(snap, dt, reducedRef.current);
        rendererRef.current.render(
          tunnelRef.current.scene,
          tunnelRef.current.camera,
        );
      }

      if (now - readoutMsRef.current > 120) {
        readoutMsRef.current = now;
        setReadout({
          plv: snap.plv,
          tempoMatch: 1 - snap.tempoError,
          phaseAlign: snap.phaseAlign,
          coherence: snap.coherence,
          tempoHz: snap.tempo,
          tapBpm: Number.isFinite(snap.tapRate) ? snap.tapRate * 60 : 0,
          label: lockLabel(snap),
          autopilot: engine.autopilot,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── teardown ─────────────────────────────────────────────────────────────
    teardownRef.current = () => {
      window.removeEventListener("keydown", onKey);
      mount.removeEventListener("pointerdown", onPointer);
      ro?.disconnect();
      tunnel?.dispose();
      tunnelRef.current = null;
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === mount)
          mount.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      const c = ctxRef.current;
      if (c && c.state !== "closed") {
        window.setTimeout(() => {
          if (c.state !== "closed") void c.close();
        }, 700);
      }
      ctxRef.current = null;
      micOnRef.current = false;
      engineRef.current = null;
    };
  }, [running, doHumanTap]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* hero + controls */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            neural entrainment · phase-lock · earned state
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Lock
          </h1>
          <p className="text-base text-muted-foreground">
            The trippy bloom is not a knob — it is a lock you have to earn. Tap
            along with the drifting pulse (spacebar, click, or your mic). Match
            its tempo <em>and</em> land on its beat and the tunnel snaps into
            coherent rings; lose either and it drifts apart.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {webglFailed && (
            <p className="max-w-xl text-base text-destructive">
              WebGL is unavailable, so the tunnel is off — but the instrument is
              still running. Tap the pulse and watch the readouts lock and drift;
              the audio tracks your entrainment either way.
            </p>
          )}
          {micState === "denied" && (
            <p className="max-w-xl text-base text-destructive">
              Microphone was blocked. No problem — the spacebar and clicks still
              tap, and the autopilot keeps the piece alive.
            </p>
          )}

          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start
              </button>
            ) : (
              <>
                {readout.autopilot && (
                  <button
                    onClick={takeOver}
                    className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Take over
                  </button>
                )}
                {micState !== "on" && (
                  <button
                    onClick={enableMic}
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Use mic
                  </button>
                )}
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop
                </button>
              </>
            )}
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>

          {running && (
            <p className="max-w-xl text-sm text-muted-foreground">
              {readout.autopilot
                ? "Autopilot: a seeded virtual tapper is drifting in and out of lock. Tap or press Take over to steer."
                : "You have control — spacebar or click on the beat. Stop tapping and the lock decays."}
            </p>
          )}
        </div>
      </div>

      {/* live readouts — the two independent axes, never one dial */}
      {running && (
        <div className="pointer-events-none absolute right-4 top-4 z-20 w-52 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              state
            </span>
            <span className="font-mono text-sm text-foreground">
              {readout.label}
            </span>
          </div>
          <Meter label="tempo match" value={readout.tempoMatch} />
          <Meter label="phase align" value={readout.phaseAlign} />
          <Meter label="PLV (consistency)" value={readout.plv} />
          <Meter label="coherence" value={readout.coherence} accent />
          <div className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>pulse</span>
              <span className="text-foreground">
                {readout.tempoHz.toFixed(2)} Hz
              </span>
            </div>
            <div className="flex justify-between">
              <span>your tempo</span>
              <span className="text-foreground">
                {readout.tapBpm > 0 ? `${Math.round(readout.tapBpm)} bpm` : "—"}
              </span>
            </div>
          </div>
        </div>
      )}

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Lock — design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A drug-free neural-entrainment instrument. A stimulus pulse ticks
                at a tempo that slowly drifts through 1.65 → 2.25 → 2.85 Hz and
                back (a ~40 s triangle sweep). You entrain by tapping. There is no
                master &quot;intensity&quot; slider — the state is{" "}
                <strong>two genuinely independent axes that can conflict</strong>.
              </p>
              <p>
                <strong>tempo match</strong> asks whether your inter-tap tempo
                matches the pulse. <strong>phase align</strong> asks whether your
                taps land <em>on</em> the beat or in anti-phase. You can nail the
                tempo yet tap perfectly off-beat, or hit one beat by luck at the
                wrong tempo. Consistency across recent taps is the{" "}
                <strong>PLV</strong> — the magnitude of the mean unit phasor{" "}
                <code>e^(i·2π·tapPhase)</code> over a sliding window (Lachaux et
                al., 1999).
              </p>
              <p>
                The bloom is gated on <em>both</em>: rings only form when PLV is
                high AND tempo error is low (<code>coherence</code>), and they
                only pulse <em>on the beat</em> when phase is aligned too. So
                three states read clearly differently: <em>searching</em>{" "}
                (jittered, dim), <em>off-phase</em> (clean rings that swell{" "}
                <em>between</em> the reference beat-flashes), and{" "}
                <em>entrained</em> (rings swell on the flash, camera glides).
              </p>
              <p>
                On load a seeded (mulberry32, 0x2332) autopilot flies a virtual
                tapper through the whole arc — search → lock-tempo-but-anti-phase
                → correct → drift → relock — so the piece is alive untouched.
              </p>
              <p>
                References: Aparicio-Terrés et al. (2025), on drumming/rhythm
                entrainment paralleling psychedelic thalamo-cortical mechanisms;
                the 2025 study (PMC12014595) finding auditory-entrainment strength
                near ~2 Hz correlates with altered-state proxies — the reason the
                pulse sweeps 1.65/2.25/2.85 Hz; and Lachaux, Rodriguez,
                Martinerie &amp; Varela (1999), the PLV measure.
              </p>
              <p>
                Honest limitations: tempo error does not fold octaves (tapping
                double-time reads as wrong on purpose); mic onset detection is
                coarse in noisy rooms; the &quot;altered state&quot; here is an
                evoked feeling of earned lock, not a clinical claim. Safety: the
                pulse stays 1.65–2.85 Hz (&lt; 3 Hz), luminance moves as smooth
                swells rather than hard strobe, and reduced-motion softens the
                camera and widens the pulse.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2332-lock"]} />
    </main>
  );
}

function Meter({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  const pctv = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex justify-between font-mono text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground tabular-nums">{pctv}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={accent ? "h-full bg-primary" : "h-full bg-foreground/70"}
          style={{ width: `${pctv}%` }}
        />
      </div>
    </div>
  );
}
