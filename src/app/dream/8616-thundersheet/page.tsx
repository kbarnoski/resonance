"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { makeThunderAudio, type ThunderAudio } from "./audio";
import { GlSheet, Canvas2dSheet, type SheetFrame } from "./gl";
import { NM } from "./modes";

type RenderKind = "webgl2" | "canvas2d" | "none";

// deterministic wobble on the auto-demo drive (no Math.random in logic)
function makeSeededWobble(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x45d9f3b);
    t ^= t >>> 15;
    return ((t >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Seeded escalating "shake" for the self-demo: rumble -> crash -> settle,
 *  all within ~8s. Returns null once the demo is finished. */
function runAutoDrive(t: number, wob: number): number | null {
  if (t > 8.5) return null;
  let base: number;
  if (t < 2.4) {
    // slow build: a distant, sub-threshold rumble
    base = 0.05 + (t / 2.4) * 0.26;
  } else if (t < 4.3) {
    // hard shake — drive up past the crash threshold
    const k = (t - 2.4) / 1.9;
    base = 0.31 + k * k * 0.95;
  } else {
    // let go — settle back to calm
    const k = (t - 4.3) / 4.2;
    base = 1.26 * Math.max(0, 1 - k) * (1 - k);
  }
  return Math.max(0, base + wob * 0.05 * base);
}

export default function ThunderSheetPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [renderKind, setRenderKind] = useState<RenderKind>("webgl2");
  const [sensorMsg, setSensorMsg] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<"auto" | "motion" | "drag">("auto");
  const [readout, setReadout] = useState({ drive: 0, storm: 0, storming: false });

  // engine refs (never recreate in the hot loop)
  const audioRef = useRef<ThunderAudio | null>(null);
  const glRef = useRef<GlSheet | null>(null);
  const c2dRef = useRef<Canvas2dSheet | null>(null);
  const rafRef = useRef<number>(0);
  const startPerfRef = useRef<number>(0);
  const demoStartRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  // input state
  const userTookOverRef = useRef<boolean>(false);
  const motionDriveRef = useRef<number>(0);
  const dragDriveRef = useRef<number>(0);
  const driveSmoothRef = useRef<number>(0);
  const tiltXRef = useRef<number>(0);
  const tiltYRef = useRef<number>(0);
  const heatRef = useRef<number>(0);
  const prevAccelRef = useRef<number>(0);
  const pointerRef = useRef<{ x: number; y: number; t: number; down: boolean }>({
    x: 0, y: 0, t: 0, down: false,
  });
  const reducedRef = useRef<boolean>(false);
  const wobRef = useRef<() => number>(makeSeededWobble(0x51574));
  // proxy energy model (used only before audio is unlocked) + readout throttle
  const proxyEnergiesRef = useRef<Float32Array>(new Float32Array(NM));
  const readoutClockRef = useRef<number>(0);

  // mirror inputMode into a ref so the sensor handlers can stay identity-stable
  // (otherwise the audio-lifecycle effect would re-run and tear down the ctx).
  const inputModeRef = useRef<"auto" | "motion" | "drag">("auto");
  useEffect(() => { inputModeRef.current = inputMode; }, [inputMode]);

  const markUserInput = useCallback((mode: "motion" | "drag") => {
    if (!userTookOverRef.current) {
      userTookOverRef.current = true;
      inputModeRef.current = mode;
      setInputMode(mode);
    } else if (mode === "motion" && inputModeRef.current === "drag") {
      inputModeRef.current = "motion";
      setInputMode("motion");
    }
  }, []);

  // ── device motion / orientation handlers ──────────────────────────────────
  const onMotion = useCallback((e: DeviceMotionEvent) => {
    const a = e.acceleration ?? e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
    const d = Math.abs(mag - prevAccelRef.current);
    prevAccelRef.current = mag;
    const shake = Math.min(1.4, d * 0.12);
    if (shake > motionDriveRef.current) motionDriveRef.current = shake;
    if (shake > 0.18) markUserInput("motion");
  }, [markUserInput]);

  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const beta = (e.beta ?? 0) / 90; // front-back tilt
    const gamma = (e.gamma ?? 0) / 90; // left-right tilt
    tiltYRef.current = Math.max(-1, Math.min(1, beta));
    tiltXRef.current = Math.max(-1, Math.min(1, gamma));
  }, []);

  // ── pointer drag (desktop fallback) ───────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const p = pointerRef.current;
    p.x = e.clientX; p.y = e.clientY; p.t = performance.now(); p.down = true;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const p = pointerRef.current;
    const now = performance.now();
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const dt = Math.max(1, now - p.t);
    const speed = Math.hypot(dx, dy) / dt; // px per ms
    p.x = e.clientX; p.y = e.clientY; p.t = now;
    // tilt the sheet toward the pointer position over the canvas
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tiltXRef.current = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    tiltYRef.current = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    if (p.down) {
      const drive = Math.min(1.4, speed * 0.55);
      if (drive > dragDriveRef.current) dragDriveRef.current = drive;
      if (drive > 0.08) markUserInput("drag");
    }
  }, [markUserInput]);

  const onPointerUp = useCallback(() => {
    pointerRef.current.down = false;
  }, []);

  // ── mount: build renderer, start visual loop (runs muted immediately) ──────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let kind: RenderKind = "none";
    try {
      if (GlSheet.isSupported(canvas)) {
        glRef.current = new GlSheet(canvas);
        kind = "webgl2";
      } else {
        c2dRef.current = new Canvas2dSheet(canvas);
        kind = "canvas2d";
      }
    } catch {
      try {
        c2dRef.current = new Canvas2dSheet(canvas);
        kind = "canvas2d";
      } catch {
        kind = "none";
      }
    }
    setRenderKind(kind);
    if (kind === "canvas2d") {
      setSensorMsg("WebGL2 unavailable — showing the Canvas2D sheet. Audio still runs.");
    }

    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const doResize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      glRef.current?.resize(w, h, dpr);
      c2dRef.current?.resize(w, h, dpr);
    };
    doResize();
    window.addEventListener("resize", doResize);

    startPerfRef.current = performance.now();
    demoStartRef.current = startPerfRef.current;
    lastFrameRef.current = startPerfRef.current;

    const zBase = reducedRef.current ? 0.42 : 0.9;
    const heatCap = reducedRef.current ? 0.55 : 1.0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const now = performance.now();
      let dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      if (dt > 0.05) dt = 0.05;

      // decay event-driven inputs
      motionDriveRef.current *= 0.90;
      dragDriveRef.current *= 0.88;

      // derive drive
      let rawDrive: number;
      if (userTookOverRef.current) {
        rawDrive = Math.max(motionDriveRef.current, dragDriveRef.current);
      } else {
        const t = (now - demoStartRef.current) / 1000;
        const auto = runAutoDrive(t, wobRef.current());
        rawDrive = auto ?? 0;
      }
      // smooth the drive
      driveSmoothRef.current += (rawDrive - driveSmoothRef.current) * 0.2;
      const drive = driveSmoothRef.current;

      // step the synth (also advances shared energies for the visual)
      const audio = audioRef.current;
      let storm = 0;
      let energies: Float32Array;
      if (audio) {
        audio.update(drive, dt);
        const st = audio.state();
        storm = st.storm;
        energies = audio.energies;
      } else {
        // no audio yet: run a tiny standalone energy proxy so visuals still move
        energies = proxyEnergiesRef.current;
        applyProxyEnergies(energies, drive, dt);
        storm = proxyStorm(energies);
      }

      // smoothed heat (attack/release) — never strobes
      const targetHeat = Math.min(heatCap, storm);
      const rate = targetHeat > heatRef.current ? 0.08 : 0.03;
      heatRef.current += (targetHeat - heatRef.current) * rate;

      const time = (now - startPerfRef.current) / 1000;
      const frame: SheetFrame = {
        time: reducedRef.current ? time * 0.55 : time,
        energies,
        heat: heatRef.current,
        tiltX: tiltXRef.current,
        tiltY: tiltYRef.current,
        zScale: zBase,
      };
      glRef.current?.draw(frame);
      c2dRef.current?.draw(frame);

      // throttled readout to React (~8/s)
      if (now - readoutClockRef.current > 120) {
        readoutClockRef.current = now;
        setReadout({
          drive: Math.min(1, drive),
          storm,
          storming: storm > 0.42,
        });
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", doResize);
      glRef.current?.dispose();
      glRef.current = null;
      c2dRef.current?.dispose();
      c2dRef.current = null;
    };
  }, []);

  // ── audio + sensor lifecycle ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
      audioRef.current = null;
      window.removeEventListener("devicemotion", onMotion as EventListener);
      window.removeEventListener("deviceorientation", onOrient as EventListener);
    };
  }, [onMotion, onOrient]);

  const handleStart = useCallback(async () => {
    // 1) audio (needs the user gesture)
    if (!audioRef.current) {
      const a = makeThunderAudio();
      audioRef.current = a;
      if (a) {
        // seed the audio energies from the proxy so there's no jump
        a.energies.set(proxyEnergiesRef.current);
        await a.resume();
      } else {
        setSensorMsg((m) => m ?? "Web Audio unavailable in this browser.");
      }
    } else {
      await audioRef.current.resume();
    }

    // 2) restart the self-demo (with sound) if the human hasn't grabbed it yet
    if (!userTookOverRef.current) {
      demoStartRef.current = performance.now();
    }

    // 3) motion sensors (iOS needs an explicit permission request on gesture)
    const DME = (window as unknown as {
      DeviceMotionEvent?: { requestPermission?: () => Promise<string> };
    }).DeviceMotionEvent;
    try {
      if (DME && typeof DME.requestPermission === "function") {
        const res = await DME.requestPermission();
        if (res === "granted") {
          window.addEventListener("devicemotion", onMotion as EventListener);
          window.addEventListener("deviceorientation", onOrient as EventListener);
        } else {
          setSensorMsg("Motion denied — drag across the sheet instead.");
        }
      } else if (typeof window !== "undefined" && "DeviceMotionEvent" in window) {
        window.addEventListener("devicemotion", onMotion as EventListener);
        window.addEventListener("deviceorientation", onOrient as EventListener);
      } else {
        setSensorMsg("No motion sensor — drag across the sheet to shake it.");
      }
    } catch {
      setSensorMsg("Motion unavailable — drag across the sheet to shake it.");
    }

    setStarted(true);
  }, [onMotion, onOrient]);

  const modeLabel =
    inputMode === "motion" ? "tilt / shake"
      : inputMode === "drag" ? "pointer drag"
        : "self-demo";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {/* top-left title + readout */}
      <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-sm">
        <h1 className="text-xl font-semibold tracking-tight text-foreground drop-shadow">
          Thunder Sheet
        </h1>
        <p className="mt-1 text-base text-muted-foreground drop-shadow">
          Shake a sheet of thin metal past the point where a rumble cracks into a storm.
        </p>
        <div className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <div>
            drive{" "}
            <span className="text-foreground">{readout.drive.toFixed(2)}</span>
            {"  ·  input "}
            <span className="text-foreground">{modeLabel}</span>
          </div>
          <div className="mt-1">
            state{" "}
            <span className={readout.storming ? "text-primary" : "text-foreground"}>
              {readout.storming ? "STORMING" : "rumbling"}
            </span>
            {"  ·  storm "}
            <span className="text-foreground">{readout.storm.toFixed(2)}</span>
          </div>
        </div>
        {sensorMsg && (
          <p className="pointer-events-auto mt-2 text-sm text-destructive drop-shadow">
            {sensorMsg}
          </p>
        )}
        {renderKind === "none" && (
          <p className="pointer-events-auto mt-2 text-sm text-destructive drop-shadow">
            No WebGL2 or Canvas2D available — visuals are disabled, but audio still works.
          </p>
        )}
      </div>

      {/* bottom-left controls */}
      <div className="absolute bottom-16 left-4 z-20 flex flex-wrap items-center gap-2">
        {!started ? (
          <button
            onClick={handleStart}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enable motion + sound
          </button>
        ) : (
          <span className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
            {inputMode === "motion"
              ? "Shake or tilt your device"
              : "Drag across the sheet to shake it"}
          </span>
        )}
        <button
          onClick={() => setShowNotes(true)}
          className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* pre-start hint that visuals are already live */}
      {!started && (
        <div className="pointer-events-none absolute bottom-28 left-4 z-10 max-w-xs">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            self-demo running (muted) — press start for sound
          </p>
        </div>
      )}

      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Thunder Sheet — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question:</span> what if you
                could <em>shake</em> a hanging sheet of thin metal and drive it past
                linearity — so a gentle wobble is a distant rumble, but a hard shake
                pumps energy up the mode ladder until it cracks into a bright
                shimmering bloom, with a real, discoverable threshold between calm
                and storm?
              </p>
              <p>
                <span className="text-foreground">The verb is continuous shaking,
                not a strike.</span> You drive it with device tilt/shake (or a
                pointer drag on desktop). How <em>hard</em> you drive changes the
                timbre: quiet input feeds only the low inharmonic modes (rumble); as
                you push past the crash threshold, a nonlinear coupling shuttles
                energy up into the high modes and it blooms/cracks. Let go and it
                rings down and settles.
              </p>
              <p>
                <span className="text-foreground">The synthesis is explicitly
                nonlinear.</span> A bank of high-Q resonators tuned to a stretched,
                inharmonic set is fed seeded noise; each mode&apos;s level is an
                energy value integrated per frame. Drive injects energy into the low
                modes; once a mode&apos;s energy exceeds the threshold, a fraction
                (growing quadratically with the excess) is transferred to higher
                modes — the amplitude-dependent cascade. Below threshold nothing
                moves up; it stays a soft rumble.
              </p>
              <p>
                <span className="text-foreground">How it differs from the lab&apos;s
                linear struck-plate pieces:</span> those are discrete strikes into a
                fixed linear modal decay. Here (1) input is continuous shaking driven
                by motion, and (2) the mode gains are coupled by an
                amplitude-dependent nonlinearity with a threshold you can find and
                cross — the spectrum changes shape with drive, not just amplitude.
              </p>
              <p>
                <span className="text-foreground">Research grounding.</span> Large-amplitude
                thin-plate vibration is governed by the Foppl-von Karman equations
                (coupled nonlinear PDEs for deflection + in-plane stress). The recent
                paper &ldquo;Explicit and Stable Pseudospectral Time-Domain Method for
                the Foppl-von Karman Equations&rdquo; (arXiv:2608.06139, 7 Aug 2026)
                gives a stable time-domain scheme for exactly this regime. This piece
                is a lightweight modal <em>analogue</em> of its key qualitative
                behaviour (energy transfer low-to-high with a crash) — not a PDE
                solve. It also nods to the theatrical thunder sheet and to nonlinear
                plate/cymbal chaos acoustics (Chaigne, Touze, Thomas on cymbal/gong
                chaotic vibration).
              </p>
              <p>
                <span className="text-foreground">Honest limitations.</span> It is a
                qualitative analogue, not a Foppl-von Karman PDE solve; the coupling
                is a hand-tuned scalar cascade, not derived from the true modal
                stiffness tensor; and the visible sheet uses idealized product-of-sine
                mode shapes rather than the plate&apos;s exact eigenmodes.
              </p>
              <p className="text-xs">
                Accessibility: honors reduced-motion (calmer buckling, softer glow);
                the crack highlight is a smoothed, localized copper-to-white sheen,
                never a full-screen strobe.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-4 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8616-thundersheet"]} />
    </main>
  );
}

// ── pre-audio visual proxy: same cascade shape so the muted self-demo reads ───
function applyProxyEnergies(e: Float32Array, drive: number, dt: number) {
  const step = Math.min(dt, 0.05);
  const damp = (i: number) => 0.55 + i * 0.5;
  for (let i = 0; i < NM; i++) e[i] *= Math.exp(-damp(i) * step);
  for (let i = 0; i < NM; i++) e[i] += drive * Math.exp(-i * 0.52) * 2.4 * step;
  const TH = 0.34;
  for (let i = 0; i < NM - 1; i++) {
    const ex = e[i] - TH;
    if (ex > 0) {
      let t = 5.2 * ex * e[i] * step;
      t = Math.min(t, e[i] * 0.8);
      e[i] -= t;
      e[i + 1] += t * 0.62;
      if (i + 2 < NM) e[i + 2] += t * 0.34;
    }
    if (e[i] > 1.6) e[i] = 1.6;
  }
  if (e[NM - 1] > 1.6) e[NM - 1] = 1.6;
}

function proxyStorm(e: Float32Array): number {
  let s = 0;
  for (let i = 7; i < NM; i++) s += e[i];
  return Math.min(1, s * 0.9);
}
