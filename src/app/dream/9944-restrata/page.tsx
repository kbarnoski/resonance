"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";
import { createVoidScene, STRATA, type VoidScene } from "./void-gl";
import { makeVoidAudio, type VoidAudio } from "./audio";

/* ── the ONE shared envelope ───────────────────────────────────────────────
   A single swell shape. Every stratum's IMAGE ring samples it at t (all bloom
   together — the one reference event). Each stratum's VOICE samples the SAME
   shape at (t + offset_i). Sharp-ish onset so the displacement is legible. */
const PULSE_PERIOD = 7.2; // seconds between swells
function pulseEnv(tt: number): number {
  const x = ((((tt % PULSE_PERIOD) + PULSE_PERIOD) % PULSE_PERIOD) / PULSE_PERIOD) % 1;
  const xp = 0.16; // peak position
  if (x < xp) return Math.pow(x / xp, 1.4); // quick rise
  const dd = (x - xp) / (1 - xp);
  return Math.exp(-dd * 4.0); // long fall
}

/* ── seeded PRNG — NO Math.random / NO Date.now anywhere ───────────────────── */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Each voice gets its OWN independently wandering offset: distinct amplitude,
   period and phase (seeded), so the N streams decorrelate over ~20–40 s. */
const OFFSET_AMP_MIN = 0.28; // seconds
const OFFSET_AMP_MAX = 0.62;
const OFFSET_PERIOD_MIN = 17; // seconds
const OFFSET_PERIOD_MAX = 41;

interface VoiceParams {
  amp: number;
  period: number;
  phase: number;
}

// stratum screen radii — must match void-gl (R = 0.11 + i*0.088, using res.y units)
const STRATUM_RADII = Array.from({ length: STRATA }, (_, i) => 0.11 + i * 0.088);

type Phase = "idle" | "running";

export default function RestrataPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [glOk, setGlOk] = useState<boolean>(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [auto, setAuto] = useState<boolean>(true);
  // per-stratum bound readout (0 adrift .. 1 bound), throttled for the UI
  const [boundUi, setBoundUi] = useState<number[]>(() => new Array(STRATA).fill(0));

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<VoidScene | null>(null);
  const audioRef = useRef<VoidAudio | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const lastTickRef = useRef<number>(0);
  const clockRef = useRef<number>(0);

  // desync state — per voice
  const driftRef = useRef<number[]>(new Array(STRATA).fill(1)); // 1 adrift .. 0 locked
  const driftTargetRef = useRef<number[]>(new Array(STRATA).fill(1));

  // auto self-demo state machine
  const autoRef = useRef<boolean>(true);
  const autoNextRef = useRef<number>(4); // first auto action a few seconds in

  // pointer parallax + latest pointer radius (for click targeting)
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerTargetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerRadiusRef = useRef<number>(0.3);

  const reducedRef = useRef<boolean>(false);
  const timeScaleRef = useRef<number>(1);
  const readoutAccRef = useRef<number>(0);

  // scratch arrays reused every frame (no per-frame allocation)
  const voiceEnvRef = useRef<number[]>(new Array(STRATA).fill(0));
  const boundArrRef = useRef<number[]>(new Array(STRATA).fill(0));

  // seeded per-voice offset parameters — deterministic every mount
  const voiceParams = useMemo<VoiceParams[]>(() => {
    const rnd = mulberry32(0x9944);
    const params: VoiceParams[] = [];
    for (let i = 0; i < STRATA; i++) {
      params.push({
        amp: OFFSET_AMP_MIN + rnd() * (OFFSET_AMP_MAX - OFFSET_AMP_MIN),
        period: OFFSET_PERIOD_MIN + rnd() * (OFFSET_PERIOD_MAX - OFFSET_PERIOD_MIN),
        phase: rnd() * Math.PI * 2,
      });
    }
    return params;
  }, []);

  const seedPhase = useMemo(() => mulberry32(0x9944 ^ 0x51)() * PULSE_PERIOD, []);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const nx = (e.clientX / w) * 2 - 1;
    const ny = (e.clientY / h) * 2 - 1;
    pointerTargetRef.current = { x: nx, y: -ny };
    // radius in the same res.y-normalized units the shader uses
    const dx = e.clientX - w / 2;
    const dy = e.clientY - h / 2;
    pointerRadiusRef.current = Math.sqrt(dx * dx + dy * dy) / h;
  }, []);

  // ── lock the nearest still-adrift stratum to the pointer's radius ──
  const lockNearest = useCallback(() => {
    const targets = driftTargetRef.current;
    const pr = pointerRadiusRef.current;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < STRATA; i++) {
      if (targets[i] < 0.5) continue; // already heading to locked
      const d = Math.abs(STRATUM_RADII[i] - pr);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    if (best >= 0) targets[best] = 0;
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      // freshen the target radius from THIS pointer (a tap may have no prior move)
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dx = e.clientX - w / 2;
      const dy = e.clientY - h / 2;
      pointerRadiusRef.current = Math.sqrt(dx * dx + dy * dy) / h;
      autoRef.current = false;
      setAuto(false);
      lockNearest();
    },
    [lockNearest],
  );

  const renderLoop = useCallback(() => {
    const scene = sceneRef.current;
    const now = performance.now();
    let dt = (now - lastTickRef.current) / 1000;
    lastTickRef.current = now;
    if (dt > 0.1) dt = 0.1; // clamp after tab-away
    const sdt = dt * timeScaleRef.current;
    clockRef.current += sdt;
    const t = clockRef.current + seedPhase;

    // ease pointer parallax
    const p = pointerRef.current;
    const pt = pointerTargetRef.current;
    p.x += (pt.x - p.x) * Math.min(1, dt * 2.5);
    p.y += (pt.y - p.y) * Math.min(1, dt * 2.5);

    // ── auto self-demo: bind strata one at a time, hold, then let go ──
    if (autoRef.current && t >= autoNextRef.current) {
      const targets = driftTargetRef.current;
      let firstAdrift = -1;
      for (let i = 0; i < STRATA; i++) {
        if (targets[i] > 0.5) {
          firstAdrift = i;
          break;
        }
      }
      if (firstAdrift >= 0) {
        targets[firstAdrift] = 0; // re-phase the next one
        autoNextRef.current = t + 2.8;
      } else {
        // all bound → hold a beat, then let go and let them drift apart
        for (let i = 0; i < STRATA; i++) targets[i] = 1;
        autoNextRef.current = t + 9.5;
      }
    }

    // ── per-voice desync engine ──
    const drift = driftRef.current;
    const targets = driftTargetRef.current;
    const voiceEnv = voiceEnvRef.current;
    const boundArr = boundArrRef.current;
    const imgEnv = pulseEnv(t); // shared image swell (all strata bloom together)
    let allBound = 1;

    for (let i = 0; i < STRATA; i++) {
      const tgt = targets[i];
      // fast to lock, slow to drift back apart (the fragmentation creeps back)
      const rate = tgt < drift[i] ? dt * 3.4 : dt * 0.16;
      drift[i] += (tgt - drift[i]) * Math.min(1, rate);
      const vp = voiceParams[i];
      const offSec = vp.amp * Math.sin((2 * Math.PI * t) / vp.period + vp.phase) * drift[i];
      voiceEnv[i] = pulseEnv(t + offSec);
      const bound = 1 - drift[i];
      boundArr[i] = bound;
      if (bound < allBound) allBound = bound;
    }

    audioRef.current?.setEnvelopes(voiceEnv);
    audioRef.current?.setBound(boundArr);

    if (scene && scene.ok) {
      scene.render({
        time: t,
        img: imgEnv,
        voice: voiceEnv,
        bound: boundArr,
        allBound,
        pointerX: p.x,
        pointerY: p.y,
      });
    }

    // throttle the UI readout (~8 Hz)
    readoutAccRef.current += dt;
    if (readoutAccRef.current > 0.12) {
      readoutAccRef.current = 0;
      setBoundUi(boundArr.slice());
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, [seedPhase, voiceParams]);

  // ── mount: start the void immediately (auto-drift, no audio yet) ──
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    timeScaleRef.current = reducedRef.current ? 0.6 : 1;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = createVoidScene(canvas);
    sceneRef.current = scene;
    setGlOk(scene.ok);
    if (!scene.ok) return;

    lastTickRef.current = performance.now();
    const onResize = () => scene.resize();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointerMove);
    rafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      scene.dispose();
      sceneRef.current = null;
    };
  }, [renderLoop, onPointerMove]);

  // ── full audio teardown on unmount ──
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
      const ac = acRef.current;
      if (ac && ac.state !== "closed") ac.close().catch(() => {});
      acRef.current = null;
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (phase === "running") return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ac = new AC();
      await ac.resume();
      acRef.current = ac;
      audioRef.current = makeVoidAudio(ac);
      setPhase("running");
    } catch {
      // visuals continue regardless; stay idle so the user can retry
    }
  }, [phase]);

  // ── Let go: re-loosen every stratum back onto its own timeline ──
  const handleLetGo = useCallback(() => {
    const targets = driftTargetRef.current;
    for (let i = 0; i < STRATA; i++) targets[i] = 1;
  }, []);

  const toggleAuto = useCallback(() => {
    setAuto((v) => {
      const next = !v;
      autoRef.current = next;
      if (next) autoNextRef.current = clockRef.current + seedPhase + 1.5;
      return next;
    });
  }, [seedPhase]);

  const boundCount = useMemo(
    () => boundUi.filter((b) => b > 0.94).length,
    [boundUi],
  );

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        className="fixed inset-0 h-full w-full touch-none"
      />

      {!glOk && (
        <div className="fixed inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base leading-relaxed text-muted-foreground">
            This piece renders a luminous void of drifting sound-and-image strata
            in WebGL, which your browser could not start. The sound still works —
            press Start to enter the drone-lit dark.
          </p>
        </div>
      )}

      {/* top-left chrome */}
      <div className="pointer-events-none fixed left-0 top-0 z-30 max-w-md p-5 sm:p-7">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          dissociative void · per-voice unbinding
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Restrata
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          The self is one event held together across senses. Here it un-binds
          voice by voice — each ring&apos;s sound peels onto its own timeline until
          you are scattered across many streams. Tap a ring to re-phase it: each
          tap snaps the nearest drifting stratum back into the one event.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
          {phase === "idle" ? (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          ) : (
            <button
              onClick={handleLetGo}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Let go
            </button>
          )}
          <button
            onClick={toggleAuto}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            auto: {auto ? "on" : "off"}
          </button>
          <button
            onClick={() => setNotesOpen(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            design notes
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {phase === "running"
            ? "the drone never stops · move the pointer to drift"
            : "visuals are live — press Start for sound"}
        </p>
      </div>

      {/* per-stratum bound readout — fragmentation made legible */}
      <div className="pointer-events-none fixed bottom-16 right-5 z-30 flex flex-col items-end gap-2 sm:bottom-6 sm:right-7">
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {boundCount} / {STRATA} bound
        </span>
        <div className="flex items-center gap-1.5">
          {boundUi.map((b, i) => (
            <span
              key={i}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                b > 0.94 ? "bg-primary" : "border border-border bg-transparent"
              }`}
              style={b > 0.94 ? undefined : { opacity: 0.4 + 0.6 * b }}
            />
          ))}
        </div>
      </div>

      {/* design notes modal */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              One clock drives a single swell envelope. Every stratum&apos;s{" "}
              <em>image</em> ring samples it at time{" "}
              <span className="font-mono">t</span> — so the rings bloom together,
              one reference event. But each stratum&apos;s <em>voice</em> samples
              the same shape at{" "}
              <span className="font-mono">t + offset&#8202;&#8339;</span>, and each
              offset wanders on its OWN period and phase. As the offsets grow, the
              voice rings peel away from their image rings in space and fall out of
              phase in time: the self scatters across many uncorrelated streams —
              the dissociative void.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Tapping re-phases <em>one stratum at a time</em> — the nearest still
              drifting ring snaps back to{" "}
              <span className="font-mono">offset = 0</span> and locks, visibly and
              audibly. Bind them all and the strata pulse as a single embodied
              event; let go and they loosen back into the void. That
              bound&#8596;unbound contrast, one voice at a time, is the piece.
            </p>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              This deepens the single global time-offset of the cycle-1 piece into
              N independent per-voice offsets. See README.md for the full
              reference chain (audiovisual temporal binding window; TPJ
              disembodiment / depersonalization literature) and honest limits.
            </p>
            <button
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["9944-restrata"]} />
    </main>
  );
}
