"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14512-strainsong — the deformation of a physical membrane conducts your catalog.
//
// A mass-spring soft-body sheet of Karel's own music fills the screen, rendered
// in raw WebGL2. Tip your phone and gravity pours the sheet toward the low
// corner: it stretches uphill (tension) and bunches downhill (compression). The
// sheet is split into 16 regions, one per recording, and each region's local
// STRAIN drives that track's gain + lowpass cutoff. Tension is bright and loud;
// compression is dark and quiet. The physics — not a slider — is the mixer.
//
// No tilt sensor (desktop): gravity slowly orbits on its own and the live audio
// energy ripples the membrane; A/W/S/D nudge gravity. Achromatic grayscale only.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { Membrane } from "./physics";
import {
  makeMeshRig,
  resizeRig,
  drawMembrane,
  disposeRig,
  type MeshRig,
} from "./glmesh";
import { StrainAudio } from "./audio";

const GRAV = 7; // base gravity acceleration (clip units/s²)

interface OrientationPermission {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
}

interface Voiced {
  title: string;
  strain: number;
}

export default function StrainsongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<StrainAudio | null>(null);
  const rigRef = useRef<MeshRig | null>(null);
  const membraneRef = useRef<Membrane | null>(null);
  const rafRef = useRef<number>(0);

  const tiltRef = useRef({ gx: 0, gy: 0, active: false });
  const nudgeRef = useRef({ x: 0, y: 0 });
  const orbitRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);

  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [tiltActive, setTiltActive] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [total, setTotal] = useState(16);
  const [voiced, setVoiced] = useState<Voiced[]>([]);

  // probe WebGL2 early so we can show a graceful notice before Start
  useEffect(() => {
    const probe = document.createElement("canvas");
    if (!probe.getContext("webgl2")) setWebglOk(false);
  }, []);

  const runStart = useCallback(async () => {
    if (started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // audio first (inside the user gesture)
    let audio: StrainAudio;
    try {
      audio = new StrainAudio();
    } catch {
      setError("This browser blocked audio. Try a different browser.");
      return;
    }
    audioRef.current = audio;
    setTotal(audio.total);
    await audio.resume();
    audio.loadAll((n, t) => {
      setLoaded(n);
      setTotal(t);
    });

    // WebGL2 membrane
    const rig = makeMeshRig(canvas);
    if (!rig) {
      setWebglOk(false);
      setError("WebGL2 isn't available here, so the membrane can't render.");
      // audio still plays; leave it running with an autonomous orbit
    }
    rigRef.current = rig;
    const membrane = new Membrane();
    membraneRef.current = membrane;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const onResize = () => {
      if (rigRef.current)
        resizeRig(rigRef.current, window.innerWidth, window.innerHeight, dpr);
    };
    onResize();
    window.addEventListener("resize", onResize);

    // ── device tilt → gravity ────────────────────────────────────────────────
    let tiltTimer = 0;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null && e.beta === null) return;
      const gamma = e.gamma ?? 0; // left-right [-90, 90]
      const beta = e.beta ?? 0; // front-back [-180, 180]
      const gx = Math.max(-1, Math.min(1, gamma / 40));
      const gy = Math.max(-1, Math.min(1, (45 - beta) / 40));
      tiltRef.current = { gx: gx * GRAV, gy: gy * GRAV, active: true };
      window.clearTimeout(tiltTimer);
      if (!tiltActive) setTiltActive(true);
    };

    const attachOrient = () => {
      window.addEventListener("deviceorientation", onOrient);
      // if no events arrive shortly, we're on desktop → autonomous mode
      tiltTimer = window.setTimeout(() => {
        if (!tiltRef.current.active) setTiltActive(false);
      }, 2000);
    };

    const doe = window.DeviceOrientationEvent as unknown as
      | OrientationPermission
      | undefined;
    if (doe && typeof doe.requestPermission === "function") {
      doe
        .requestPermission()
        .then((state) => {
          if (state === "granted") attachOrient();
          else setTiltActive(false);
        })
        .catch(() => setTiltActive(false));
    } else if (typeof window !== "undefined" && "ondeviceorientation" in window) {
      attachOrient();
    } else {
      setTiltActive(false);
    }

    // ── keyboard nudge (desktop) ─────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const n = nudgeRef.current;
      if (k === "w") n.y += GRAV;
      else if (k === "s") n.y -= GRAV;
      else if (k === "a") n.x -= GRAV;
      else if (k === "d") n.x += GRAV;
    };
    window.addEventListener("keydown", onKey);

    // ── main loop ────────────────────────────────────────────────────────────
    let prev = performance.now();
    let uiClock = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const mem = membraneRef.current;
      const au = audioRef.current;
      if (!mem || !au) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const energy = au.sampleEnergy();

      // gravity vector
      let gx: number;
      let gy: number;
      if (tiltRef.current.active) {
        gx = tiltRef.current.gx;
        gy = tiltRef.current.gy;
      } else {
        // autonomous: gravity slowly orbits, bass swells its pull
        orbitRef.current += dt * 0.22;
        const mag = GRAV * (0.7 + energy.bass * 0.9);
        gx = Math.cos(orbitRef.current) * mag;
        gy = Math.sin(orbitRef.current) * mag;
      }
      // keyboard nudge (decays)
      const n = nudgeRef.current;
      gx += n.x;
      gy += n.y;
      n.x *= 0.9;
      n.y *= 0.9;

      // audio energy shivers the sheet
      if (energy.treble > 0.14) mem.kick(energy.treble);

      mem.step(dt, gx, gy);

      // shared normalization: what you see is what you hear
      const scale = Math.max(
        0.5,
        Math.min(40, 1 / (mem.maxAbsStrain * 1.3 + 1e-3)),
      );
      au.applyStrains(mem.regionStrain, scale);

      if (rigRef.current) {
        drawMembrane(
          rigRef.current,
          mem.pos,
          mem.vertStrain,
          scale,
          Math.min(1, energy.overall * 2.2),
        );
      }

      // throttle React updates for the "voiced now" panel
      uiClock += dt;
      if (uiClock > 0.18) {
        uiClock = 0;
        const rows = au
          .readout()
          .filter((r) => r.loaded)
          .sort((a, b) => b.strain - a.strain)
          .slice(0, 4)
          .map((r) => ({ title: r.title, strain: r.strain }));
        setVoiced(rows);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    setStarted(true);

    // teardown registered via ref cleanup effect below
    cleanupRef.current = () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(tiltTimer);
    };
  }, [started, tiltActive]);

  // full teardown on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      if (rigRef.current) {
        disposeRig(rigRef.current);
        rigRef.current = null;
      }
      audioRef.current?.dispose();
      audioRef.current = null;
      membraneRef.current = null;
    };
  }, []);

  const allLoaded = loaded >= total && total > 0;

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* header / chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-5">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Strainsong
          </h1>
          <p className="mt-1 text-base leading-relaxed text-muted-foreground">
            A membrane of your own recordings, tensed and slackened under gravity.
            Where the sheet stretches it rings bright and loud; where it bunches
            it goes dark and quiet. The strain field is the mixing engine.
          </p>

          {!started && (
            <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void runStart()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin — let the membrane sound
              </button>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                16 recordings · strain-mixed
              </span>
            </div>
          )}

          {started && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {tiltActive ? "tilt · pour the sheet" : "autonomous · gravity orbits"}
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {allLoaded ? "16 / 16 voiced" : `loading ${loaded} / ${total}`}
              </span>
              {!tiltActive && (
                <span className="text-sm text-muted-foreground">
                  no tilt sensor — A / W / S / D nudge gravity
                </span>
              )}
            </div>
          )}

          {error && (
            <p className="mt-2 max-w-md text-base text-destructive">{error}</p>
          )}
          {!webglOk && (
            <p className="mt-2 max-w-md text-base text-destructive">
              WebGL2 isn&apos;t available here, so the membrane can&apos;t render —
              the recordings still play if you begin.
            </p>
          )}
        </div>
      </div>

      {/* voiced-now panel: the catalog, ranked by live strain */}
      {started && voiced.length > 0 && (
        <div className="pointer-events-none absolute bottom-5 left-5">
          <div className="rounded-md border border-border bg-background/60 p-3 backdrop-blur">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              voiced now — taut recordings
            </span>
            <ul className="mt-2 space-y-1.5">
              {voiced.map((v, i) => {
                const w = Math.max(4, Math.min(100, (v.strain + 0.2) * 90));
                return (
                  <li key={`${v.title}-${i}`} className="flex items-center gap-2">
                    <span className="w-36 shrink-0 truncate text-sm text-foreground">
                      {v.title}
                    </span>
                    <span className="h-1.5 w-28 overflow-hidden rounded-md bg-accent">
                      <span
                        className="block h-full bg-foreground/80"
                        style={{ width: `${w}%` }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* design notes affordance */}
      <div className="absolute right-5 top-5">
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/70 p-6"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-md border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Strainsong — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The art is a{" "}
                <strong className="text-foreground">mass-spring soft body</strong>:
                a 28×28 lattice of point masses linked by structural and shear
                springs, pinned along its whole border, integrated with Verlet +
                Position-Based Dynamics relaxation. It is drawn in{" "}
                <strong className="text-foreground">raw WebGL2</strong> — a dynamic
                vertex buffer re-uploaded every frame, hand-written GLSL, no
                three.js.
              </p>
              <p>
                Gravity is a free 2D vector. On a phone it comes from{" "}
                <strong className="text-foreground">device tilt</strong> (beta /
                gamma), so the sheet pours toward the low corner. On desktop the
                gravity vector orbits on its own and the live audio energy ripples
                the membrane; A / W / S / D nudge it.
              </p>
              <p>
                Each spring reports a signed{" "}
                <strong className="text-foreground">strain</strong> =
                (length − rest) / rest. Averaged into a 4×4 grid of regions, that
                strain is the control signal: one of Karel&apos;s 16 recordings per
                region, its gain and lowpass cutoff driven directly by tension
                (bright, loud) versus compression (dark, quiet). Color follows the
                same field — achromatic grayscale, compression toward black,
                tension toward white — so what you see is what you hear.
              </p>
              <p>
                Every sound is real: Karel&apos;s <em>Welcome Home</em> and{" "}
                <em>Snowflake</em> catalogs, looped and strain-mixed through an
                ear-safety master bus. No oscillators, no synthesis.
              </p>
              <p className="text-xs">
                References: BioSonix / physics-based sonification (ISMIR 2026 line
                — sonifying deformation from tool interactions) and &ldquo;Tonal
                Cognition in Sonification&rdquo; (arXiv:2408.17012). The wager: a
                physical strain field, not a fader, is the instrument.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14512-strainsong"]} />
    </main>
  );
}
