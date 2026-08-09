"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 5224-covenant — entity-contact as real physics.
//
//   The autonomous "beings" of a visionary breakthrough, rendered as what they might
//   actually be: the self-propelled topological defects of an ACTIVE NEMATIC —
//   luminous +½ comets and passive −½ three-fold forms, each a voice, drifting
//   in a deep dark volume. You gather them inside a soft boundary until their
//   chaos relaxes into an eternal three-body "golden braid" that sings a
//   repeating canon. Drug-free; screen and sound do the work.
//
//   Physics + defect tracking: ./nematic. Entities-as-instrument: ./audio.
//   Bloom-lit volume: ./scene. Everything deterministic from seed 0x5224; the
//   full chaos→gather→braid arc self-demos hands-free on load (audio joins on
//   first tap).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { NematicField, type TrackedDefect } from "./nematic";
import { CovenantAudio, type VoiceState } from "./audio";
import { CovenantScene } from "./scene";

const SEED = 0x5224;

type Status = "CHAOS" | "GATHERING" | "BRAID LOCKED";

/** Pick the (up to) three interior +½ that constitute the braid. */
function braidTriad(defects: TrackedDefect[]): number[] {
  return defects
    .filter((d) => d.sign === 1 && d.inside && d.age > 1.2)
    .sort((a, b) => b.age - a.age)
    .slice(0, 3)
    .map((d) => d.id);
}

export default function CovenantPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<NematicField | null>(null);
  const sceneRef = useRef<CovenantScene | null>(null);
  const audioRef = useRef<CovenantAudio | null>(null);
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const frameNoRef = useRef(0);

  // demo state machine (runs until the user takes over the boundary)
  const userTookOverRef = useRef(false);
  const demoClockRef = useRef(0);
  const demoConfinedRef = useRef(false);
  const startedRef = useRef(false);
  const draggingRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [audioOk, setAudioOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [status, setStatus] = useState<Status>("CHAOS");
  const [plus, setPlus] = useState(0);
  const [minus, setMinus] = useState(0);
  const [confOn, setConfOn] = useState(false);

  const beginAudio = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    void audioRef.current?.resume();
  }, []);

  // ── place / move the soft confinement from a client-space pointer ──
  const placeConfinement = useCallback((clientX: number, clientY: number) => {
    const field = fieldRef.current;
    const scene = sceneRef.current;
    if (!field || !scene) return;
    const g = scene.pickGrid(clientX, clientY, field.N);
    if (!g) return;
    const r = 0.32 * field.N;
    field.setConfinement(g.gx, g.gy, r);
    setConfOn(true);
  }, []);

  const releaseConfinement = useCallback(() => {
    userTookOverRef.current = true;
    fieldRef.current?.clearConfinement();
    setConfOn(false);
  }, []);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // physics field (always constructs — pure CPU)
    fieldRef.current = new NematicField(SEED);

    // audio (may fail if Web Audio unavailable)
    try {
      audioRef.current = new CovenantAudio(SEED);
      setAudioOk(true);
    } catch {
      audioRef.current = null;
      setAudioOk(false);
    }

    // scene (may fail if WebGL unavailable)
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        sceneRef.current = new CovenantScene(canvas, SEED, reduced);
        setWebglOk(true);
      } catch {
        sceneRef.current = null;
        setWebglOk(false);
      }
    }

    const loop = (ts: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = lastTsRef.current
        ? Math.min(0.033, (ts - lastTsRef.current) / 1000)
        : 0.016;
      lastTsRef.current = ts;
      const field = fieldRef.current;
      if (!field) return;

      // ── hands-free demo arc: chaos → confine → hold → release, cycling ──
      if (!userTookOverRef.current) {
        demoClockRef.current += dt;
        const c = demoClockRef.current;
        if (!demoConfinedRef.current && c > 6) {
          field.setConfinement(field.N * 0.5, field.N * 0.5, 0.32 * field.N);
          demoConfinedRef.current = true;
          setConfOn(true);
        } else if (demoConfinedRef.current && c > 24) {
          field.clearConfinement();
          demoConfinedRef.current = false;
          setConfOn(false);
          demoClockRef.current = 0;
        }
      }

      const res = field.step(dt);
      const defects = field.trackedDefects;
      const braidIds = braidTriad(defects);

      // ── scene ──
      const scene = sceneRef.current;
      if (scene) {
        const veil = field.buildVeil(4);
        scene.frame(dt, {
          defects,
          N: field.N,
          veil,
          confinement: field.confinement,
          engagement: field.engagement,
          braidLocked: res.braidLocked,
          braidIds,
        });
      }

      // ── audio ──
      const audio = audioRef.current;
      if (audio) {
        const plusVoices: VoiceState[] = [];
        let minusCount = 0;
        for (const d of defects) {
          if (d.sign === 1) {
            plusVoices.push({
              id: d.id,
              x01: d.x / field.N,
              speed01: Math.min(1, d.speed / 12),
              age: d.age,
              inside: d.inside,
            });
          } else {
            minusCount++;
          }
        }
        audio.update({
          plus: plusVoices,
          minusCount,
          braidLocked: res.braidLocked,
          braidPeriod: res.braidPeriod,
          braidIds,
        });
      }

      // ── throttle React chrome updates (~6/s) ──
      if (frameNoRef.current++ % 10 === 0) {
        setStatus(res.status);
        setPlus(res.plus);
        setMinus(res.minus);
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => {
      const c = canvasRef.current;
      if (c && sceneRef.current) sceneRef.current.resize(c.clientWidth, c.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      sceneRef.current?.dispose();
      sceneRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
      fieldRef.current = null;
    };
  }, []);

  // ── pointer: gather with the boundary ──
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      beginAudio();
      userTookOverRef.current = true;
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      placeConfinement(e.clientX, e.clientY);
    },
    [beginAudio, placeConfinement],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (draggingRef.current) placeConfinement(e.clientX, e.clientY);
    },
    [placeConfinement],
  );
  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const statusColor =
    status === "BRAID LOCKED"
      ? "text-primary"
      : status === "GATHERING"
        ? "text-foreground"
        : "text-muted-foreground";

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: webglOk ? "crosshair" : "default" }}
      />

      {/* WebGL fallback — the sim + sound still run headlessly */}
      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-sm text-destructive">
            WebGL is unavailable, so the luminous volume can&apos;t render. The
            active-nematic physics and the entity voices still run — tap to gather
            the beings and listen for the braid to lock.
          </p>
        </div>
      )}

      {/* ── top-left: title + description ── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-1 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Covenant
        </h1>
        <p className="max-w-md text-base text-muted-foreground">
          Gather the drifting beings inside a boundary until their chaos locks
          into an eternal three-body golden braid.
        </p>
      </div>

      {/* ── top-right: live status ── */}
      <div className="pointer-events-none absolute right-5 top-5 flex flex-col items-end gap-1 sm:right-7 sm:top-7">
        <span className={`font-mono text-xs uppercase tracking-[0.18em] ${statusColor}`}>
          {status}
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {plus} comet · {minus} trefoil
        </span>
      </div>

      {/* ── first-run hint ── */}
      {!started && (
        <div className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 rounded-md border border-border bg-background/70 px-3 py-1 backdrop-blur-sm">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            self-playing · tap for sound
          </span>
        </div>
      )}

      {/* ── bottom bar ── */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          {!started ? (
            <button
              onClick={beginAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          ) : (
            <button
              onClick={releaseConfinement}
              disabled={!confOn}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
            >
              Release boundary
            </button>
          )}
          <span className="hidden font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:inline">
            {started ? "drag to gather" : ""}
          </span>
          {!audioOk && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-destructive">
              audio unavailable · visuals only
            </span>
          )}
        </div>

        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* ── design-notes modal ── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Beings made of physics
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The autonomous entities people meet in a visionary breakthrough feel
                real and self-willed. This piece renders one candidate for what an
                &ldquo;autonomous being&rdquo; could actually be:{" "}
                <span className="text-foreground">
                  the self-propelled topological defects of an active nematic
                </span>{" "}
                — the living liquid crystal of a dense suspension of
                energy-burning rods.
              </p>
              <p>
                A headless orientation field θ(x,y) is stored as the doubled-angle
                vector U=(cos2θ, sin2θ) on a 112×112 grid. Each step relaxes it
                elastically (U←U+κ∇²U), advects it by its own active flow
                v=A(∂ₓUₓ+∂ᵧUᵧ, ∂ₓUᵧ−∂ᵧUₓ), and nucleates fresh ±½ defect pairs.
                We read the winding of φ=atan2(Uᵧ,Uₓ) around every plaquette:{" "}
                <span className="text-foreground">+2π is a comet-shaped +½</span>{" "}
                (self-propelled), −2π a passive three-fold −½. Defects are tracked
                frame-to-frame into persistent beings with age, velocity and a
                trailed path.
              </p>
              <p>
                <span className="text-foreground">Each +½ defect is a voice</span>{" "}
                — an oscillator snapped to a just pentatonic slot by its ID,
                panned by position, swelling with age, its vibrato driven by how
                fast it darts. The −½ population feeds a low drone. Birth attacks
                softly; annihilation glides two voices together and cancels. Loose,
                the field is turbulent chaos and a darting atonal cloud.
              </p>
              <p>
                Draw a boundary and the interior activity is quenched and
                nucleation suppressed, coaxing the population toward{" "}
                <span className="text-foreground">
                  exactly three +½ in a periodic golden braid
                </span>{" "}
                — the 2025 confinement result (arXiv:2503.10880). When the three
                real, tracked defects lock and their pairwise distances oscillate,
                their voices snap to a consonant just-major triad over a repeating
                canon clocked to the braid&apos;s orbital period.
              </p>
              <p className="text-xs">
                After Sanchez &amp; Dogic, <span className="italic">Nature</span>{" "}
                (2012, active microtubule nematics); Tan et al.,{" "}
                <span className="italic">Nature Physics</span> (2019, topological
                turbulence); the golden-braid confinement of arXiv:2503.10880
                (2025); and the visionary-art tradition of autonomous
                entity-contact. No strobe; motion respects
                prefers-reduced-motion. If WebGL or Web Audio is missing, the
                piece degrades without crashing.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
