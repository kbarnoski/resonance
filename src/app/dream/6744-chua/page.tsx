"use client";

// ════════════════════════════════════════════════════════════════════════════
// 6744 · CHUA — an audio-rate strange-attractor synthesizer
//
// THE ONE QUESTION: "What if you could HEAR a strange attractor at audio rate —
// listen to a chaotic ODE integrate itself sample-by-sample, and steer it live
// through the route to chaos (pure tone → period-doubling → full chaos)?"
//
// The waveform IS the trajectory of Chua's circuit, integrated once PER AUDIO
// SAMPLE inside an AudioWorkletProcessor (worklet.ts). x → left, y → right.
// Raising the bifurcation knob (alpha) walks the period-doubling route to chaos:
// a stable limit cycle (near-pure tone) → subharmonics → the double-scroll
// broadband-but-pitched chaos. The worklet posts a downsampled (x,y,z) snapshot
// to the main thread; we plot it as a cloud of recycled <div> dots — PURE DOM,
// zero GPU, no canvas/svg. A live largest-Lyapunov estimate drives the chaos
// meter. Degrades to a reduced main-thread osc-bank model if AudioWorklet is
// unavailable. See README.md.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_PARAMS,
  alphaFromKnob,
  chaosFromAlpha,
  chuaDiode,
  makeMulberry32,
  regimeFromAlpha,
  stepRK4,
  type Regime,
  type Vec3,
} from "./chua";
import { PROCESSOR_NAME, PROCESSOR_SOURCE } from "./worklet";

// ── Tunables ────────────────────────────────────────────────────────────────
const DOT_COUNT = 360; // fixed pool of recycled DOM dots
const RING_CAP = 360; // phase-space history length (x,y,z)
const SWEEP_PERIOD_MS = 26000; // auto-demo route-to-chaos sweep
const SWEEP_PERIOD_MS_REDUCED = 60000; // slowed for prefers-reduced-motion
const DT_MIN = 0.0018;
const DT_SPAN = 0.0054; // dtAudio = DT_MIN + speed*DT_SPAN  → ~72..291 Hz
const VIS_DT = 0.01; // main-thread visual integrator step
const VIS_SUBSTEPS = 22; // dimensionless time advanced per visual frame

function dtFromSpeed(speed: number): number {
  return DT_MIN + Math.min(1, Math.max(0, speed)) * DT_SPAN;
}

// Fundamental ≈ the y–z rotation rate (ω = √beta), in Hz for the given sample dt.
function computeHz(sampleRate: number, dtAudio: number, beta: number): number {
  return (sampleRate * dtAudio * Math.sqrt(beta)) / (2 * Math.PI);
}

type UiState = {
  knob: number;
  speed: number;
  mBreak: number;
  gain: number;
  regime: Regime;
  chaos: number; // 0..1 meter
  hz: number;
  alpha: number;
  lyap: number;
  frozen: boolean;
};

export default function Page() {
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [ui, setUi] = useState<UiState>({
    knob: 0.05,
    speed: 0.37,
    mBreak: DEFAULT_PARAMS.m0,
    gain: 0.7,
    regime: "limit cycle",
    chaos: 0,
    hz: 150,
    alpha: alphaFromKnob(0.05),
    lyap: 0,
    frozen: false,
  });

  // ── Authoritative live values (refs — no render churn) ────────────────────
  const knobRef = useRef(0.05);
  const speedRef = useRef(0.37);
  const breakRef = useRef(DEFAULT_PARAMS.m0);
  const gainRef = useRef(0.7);
  const frozenRef = useRef(false);
  const autoDemoRef = useRef(true);
  const lyapRef = useRef(0);
  const reducedRef = useRef(false);

  // Audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  // Fallback osc bank
  const fbRef = useRef<{
    fund: OscillatorNode;
    sub2: OscillatorNode;
    sub4: OscillatorNode;
    gFund: GainNode;
    gSub2: GainNode;
    gSub4: GainNode;
    gNoise: GainNode;
    bp: BiquadFilterNode;
    noise: AudioBufferSourceNode;
  } | null>(null);

  // Phase-space ring buffer
  const rxRef = useRef<Float32Array>(new Float32Array(RING_CAP));
  const ryRef = useRef<Float32Array>(new Float32Array(RING_CAP));
  const rzRef = useRef<Float32Array>(new Float32Array(RING_CAP));
  const headRef = useRef(0);
  const countRef = useRef(0);

  // Main-thread visual integrator (also the pre-Start silent animation)
  const visRef = useRef<Vec3>({ x: 0.15, y: 0.02, z: 0.0 });
  const useSnapshotsRef = useRef(false); // true once worklet feeds the ring

  // DOM refs
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const extentRef = useRef(3);
  const angleRef = useRef(0);
  const t0Ref = useRef(0);
  const lastUiRef = useRef(0);

  // ── Ring buffer append ────────────────────────────────────────────────────
  const pushPoint = useCallback((x: number, y: number, z: number) => {
    const h = headRef.current;
    rxRef.current[h] = x;
    ryRef.current[h] = y;
    rzRef.current[h] = z;
    headRef.current = (h + 1) % RING_CAP;
    if (countRef.current < RING_CAP) countRef.current++;
  }, []);

  // ── Push current params into the live audio graph ─────────────────────────
  const pushAudio = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (frozenRef.current) return; // freeze holds the current regime (A/B)
    const alpha = alphaFromKnob(knobRef.current);
    const dt = dtFromSpeed(speedRef.current);
    const m0 = breakRef.current;
    const gain = gainRef.current;
    const now = ctx.currentTime;
    const tc = 0.03;

    const node = workletRef.current;
    if (node) {
      node.parameters.get("alpha")?.setTargetAtTime(alpha, now, tc);
      node.parameters.get("dt")?.setTargetAtTime(dt, now, tc);
      node.parameters.get("m0")?.setTargetAtTime(m0, now, tc);
      node.parameters.get("gain")?.setTargetAtTime(gain, now, tc);
      return;
    }

    // Fallback osc bank: tone → subharmonic → noise band as alpha rises.
    const fb = fbRef.current;
    if (fb) {
      const hz = computeHz(ctx.sampleRate, dt, DEFAULT_PARAMS.beta);
      const chaos = chaosFromAlpha(alpha);
      const p2 = Math.min(1, Math.max(0, (alpha - 8.3) / 0.9)); // period-2 onset
      const p4 = Math.min(1, Math.max(0, (alpha - 8.75) / 1.5)); // period-4 onset
      fb.fund.frequency.setTargetAtTime(hz, now, tc);
      fb.sub2.frequency.setTargetAtTime(hz / 2, now, tc);
      fb.sub4.frequency.setTargetAtTime(hz / 4, now, tc);
      fb.bp.frequency.setTargetAtTime(hz, now, tc);
      const g = gain * 0.6;
      fb.gFund.gain.setTargetAtTime(g * (1 - 0.35 * chaos), now, tc);
      fb.gSub2.gain.setTargetAtTime(g * 0.6 * p2, now, tc);
      fb.gSub4.gain.setTargetAtTime(g * 0.5 * p4, now, tc);
      fb.gNoise.gain.setTargetAtTime(g * 0.9 * chaos * chaos, now, tc);
    }
  }, []);

  // ── The one control surface (routed through refs so JSX handlers are stable) ─
  const setKnob = useCallback(
    (v: number, interactive = true) => {
      knobRef.current = v;
      if (interactive) autoDemoRef.current = false;
    },
    [],
  );
  const setSpeed = useCallback((v: number) => {
    speedRef.current = v;
    autoDemoRef.current = false;
  }, []);
  const setBreak = useCallback((v: number) => {
    breakRef.current = v;
    autoDemoRef.current = false;
  }, []);
  const setGain = useCallback((v: number) => {
    gainRef.current = v;
  }, []);
  const toggleFreeze = useCallback(() => {
    frozenRef.current = !frozenRef.current;
    autoDemoRef.current = false;
    workletRef.current?.port.postMessage({ type: "freeze", value: frozenRef.current });
  }, []);

  // ── Start audio (only after user gesture) ─────────────────────────────────
  const startAudio = useCallback(async () => {
    if (ctxRef.current) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      await ctx.resume();

      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      masterRef.current = master;

      let workletOk = false;
      if (ctx.audioWorklet) {
        try {
          const blob = new Blob([PROCESSOR_SOURCE], { type: "application/javascript" });
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          await ctx.audioWorklet.addModule(url);
          const node = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          // Snapshots from the render thread → the DOM phase-space plot.
          node.port.onmessage = (e: MessageEvent) => {
            const d = e.data as { type?: string; data?: Float32Array; count?: number; lyap?: number };
            if (d.type === "snap" && d.data && d.count) {
              useSnapshotsRef.current = true;
              lyapRef.current = d.lyap ?? lyapRef.current;
              const arr = d.data;
              for (let i = 0; i < d.count; i++) {
                pushPoint(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
              }
            }
          };
          node.parameters.get("beta")?.setValueAtTime(DEFAULT_PARAMS.beta, ctx.currentTime);
          node.parameters.get("m1")?.setValueAtTime(DEFAULT_PARAMS.m1, ctx.currentTime);
          node.connect(master);
          workletRef.current = node;
          workletOk = true;
        } catch {
          workletOk = false;
        }
      }

      if (!workletOk) {
        // Reduced main-thread model: an oscillator bank we steer from the ODE.
        setFallback(true);
        useSnapshotsRef.current = false;
        const mk = (type: OscillatorType, f: number) => {
          const o = ctx.createOscillator();
          o.type = type;
          o.frequency.value = f;
          return o;
        };
        const fund = mk("sawtooth", 150);
        const sub2 = mk("sine", 75);
        const sub4 = mk("sine", 37.5);
        const gFund = ctx.createGain();
        const gSub2 = ctx.createGain();
        const gSub4 = ctx.createGain();
        const gNoise = ctx.createGain();
        gFund.gain.value = 0.4;
        gSub2.gain.value = 0;
        gSub4.gain.value = 0;
        gNoise.gain.value = 0;
        // Seeded noise buffer (no Math.random) band-passed for the chaos band.
        const rnd = makeMulberry32(0x6744c);
        const len = Math.floor(ctx.sampleRate * 1.5);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < len; i++) ch[i] = rnd() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;
        noise.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = 150;
        bp.Q.value = 2.2;
        fund.connect(gFund).connect(master);
        sub2.connect(gSub2).connect(master);
        sub4.connect(gSub4).connect(master);
        noise.connect(bp).connect(gNoise).connect(master);
        fund.start();
        sub2.start();
        sub4.start();
        noise.start();
        fbRef.current = { fund, sub2, sub4, gFund, gSub2, gSub4, gNoise, bp, noise };
      }

      setStarted(true);
      pushAudio();
    } catch {
      // Never white-screen — visuals keep running; surface a notice.
      setFallback(true);
    }
  }, [pushAudio, pushPoint]);

  // Stable handles for JSX so the render tree has no stale-closure deps.
  const ctlRef = useRef({ setKnob, setSpeed, setBreak, setGain, toggleFreeze, startAudio, setUi });
  ctlRef.current = { setKnob, setSpeed, setBreak, setGain, toggleFreeze, startAudio, setUi };

  // ── Mount: rAF loop + keyboard, teardown on unmount ───────────────────────
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    reducedRef.current = prefersReduced;
    setReduced(prefersReduced);

    t0Ref.current = performance.now();

    // Seed the visual ring with a short burst so a still first frame reads.
    for (let k = 0; k < RING_CAP; k++) {
      for (let s = 0; s < VIS_SUBSTEPS; s++) {
        visRef.current = stepRK4(visRef.current, { ...DEFAULT_PARAMS, alpha: alphaFromKnob(0.6) }, VIS_DT);
      }
      pushPoint(visRef.current.x, visRef.current.y, visRef.current.z);
    }

    const runFrame = (now: number) => {
      // 1 · auto-demo sweep of the bifurcation knob (route to chaos).
      if (autoDemoRef.current) {
        const P = reducedRef.current ? SWEEP_PERIOD_MS_REDUCED : SWEEP_PERIOD_MS;
        const phase = ((now - t0Ref.current) / P) % 1;
        const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
        knobRef.current = tri;
      }

      const alpha = alphaFromKnob(knobRef.current);

      // 2 · visuals from ODE when the worklet is NOT feeding snapshots.
      if (!useSnapshotsRef.current && !frozenRef.current) {
        const params = { ...DEFAULT_PARAMS, alpha, m0: breakRef.current };
        const sub = reducedRef.current ? Math.floor(VIS_SUBSTEPS / 2) : VIS_SUBSTEPS;
        for (let s = 0; s < sub; s++) {
          visRef.current = stepRK4(visRef.current, params, VIS_DT);
        }
        if (!Number.isFinite(visRef.current.x) || Math.abs(visRef.current.x) > 1e3) {
          visRef.current = { x: 0.15, y: 0.02, z: 0.0 };
        }
        pushPoint(visRef.current.x, visRef.current.y, visRef.current.z);
      }

      // 3 · push params into the live audio graph.
      pushAudio();

      // 4 · render the phase-space dot cloud (pure DOM).
      const panel = panelRef.current;
      if (panel) {
        const w = panel.clientWidth;
        const h = panel.clientHeight;
        const cx = w / 2;
        const cy = h / 2;
        const minDim = Math.min(w, h);

        // adaptive extent from the ring's radius
        const cnt = countRef.current;
        let maxR = 0.5;
        for (let i = 0; i < cnt; i += 3) {
          const ax = Math.abs(rxRef.current[i]);
          const az = Math.abs(rzRef.current[i]);
          if (ax > maxR) maxR = ax;
          if (az > maxR) maxR = az;
        }
        extentRef.current += (maxR - extentRef.current) * 0.06;
        const scale = (0.42 * minDim) / (extentRef.current || 1);

        // slow tumble mixing y in for a 3D read of the double scroll
        angleRef.current += reducedRef.current ? 0.0016 : 0.0035;
        const a = angleRef.current;
        const ca = Math.cos(a);
        const sa = Math.sin(a);

        const head = headRef.current;
        for (let i = 0; i < DOT_COUNT; i++) {
          const el = dotRefs.current[i];
          if (!el) continue;
          if (i >= cnt) {
            el.style.opacity = "0";
            continue;
          }
          const idx = (head - 1 - i + RING_CAP * 2) % RING_CAP;
          const x = rxRef.current[idx];
          const y = ryRef.current[idx];
          const z = rzRef.current[idx];
          const hx = x * ca - y * sa;
          const depth = x * sa + y * ca; // -~ to +~ → brightness/size
          const px = cx + hx * scale;
          const py = cy - z * scale;
          const ageT = i / DOT_COUNT; // 0 newest → 1 oldest
          const op = (1 - ageT) * (1 - ageT) * 0.85 + 0.03;
          const dep = Math.min(1, Math.max(0, depth / 3 + 0.5));
          const light = 42 + dep * 34; // violet-ramp lightness by depth
          const size = 2 + (1 - ageT) * 2.4 + dep * 1.6;
          el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
          el.style.width = `${size.toFixed(1)}px`;
          el.style.height = `${size.toFixed(1)}px`;
          el.style.opacity = op.toFixed(3);
          el.style.backgroundColor = `hsl(266 78% ${light.toFixed(0)}%)`;
        }
      }

      // 5 · throttled readout / slider mirror (~9 Hz).
      if (now - lastUiRef.current > 110) {
        lastUiRef.current = now;
        const dt = dtFromSpeed(speedRef.current);
        const sr = ctxRef.current?.sampleRate ?? 48000;
        const hz = computeHz(sr, dt, DEFAULT_PARAMS.beta);
        const lyap = lyapRef.current;
        const meter = useSnapshotsRef.current
          ? Math.min(1, Math.max(0, 0.5 * (lyap / 0.3) + 0.5 * chaosFromAlpha(alpha)))
          : chaosFromAlpha(alpha);
        ctlRef.current.setUi({
          knob: knobRef.current,
          speed: speedRef.current,
          mBreak: breakRef.current,
          gain: gainRef.current,
          regime: regimeFromAlpha(alpha),
          chaos: meter,
          hz,
          alpha,
          lyap,
          frozen: frozenRef.current,
        });
      }

      rafRef.current = requestAnimationFrame(runFrame);
    };
    rafRef.current = requestAnimationFrame(runFrame);

    // Keyboard: presets, nudges, freeze.
    const onKey = (e: KeyboardEvent) => {
      const c = ctlRef.current;
      switch (e.key) {
        case "1": c.setKnob(0.08); break; // limit cycle (near-pure tone)
        case "2": c.setKnob(0.185); break; // period-2
        case "3": c.setKnob(0.222); break; // period-4
        case "4": c.setKnob(0.45); break; // chaos
        case "5": c.setKnob(0.9); break; // double scroll
        case "ArrowRight": c.setKnob(Math.min(1, knobRef.current + 0.02)); break;
        case "ArrowLeft": c.setKnob(Math.max(0, knobRef.current - 0.02)); break;
        case "ArrowUp": c.setSpeed(Math.min(1, speedRef.current + 0.05)); break;
        case "ArrowDown": c.setSpeed(Math.max(0, speedRef.current - 0.05)); break;
        case " ":
        case "f":
        case "F":
          e.preventDefault();
          c.toggleFreeze();
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKey);
      try {
        workletRef.current?.port.close();
        workletRef.current?.disconnect();
      } catch {
        /* noop */
      }
      const fb = fbRef.current;
      if (fb) {
        try {
          fb.fund.stop();
          fb.sub2.stop();
          fb.sub4.stop();
          fb.noise.stop();
        } catch {
          /* already stopped */
        }
      }
      masterRef.current?.disconnect();
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-once: all live state lives in refs; ctlRef bridges to JSX

  // ── Small presentational helpers ──────────────────────────────────────────
  const meterPct = Math.round(ui.chaos * 100);
  const diode = chuaDiode(1, ui.mBreak, DEFAULT_PARAMS.m1); // breakpoint indicator

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground select-none">
      {/* Phase-space panel (dot cloud) */}
      <div ref={panelRef} className="absolute inset-0">
        {Array.from({ length: DOT_COUNT }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            className="pointer-events-none absolute left-0 top-0"
            style={{
              width: 3,
              height: 3,
              borderRadius: "50%",
              opacity: 0,
              willChange: "transform, opacity",
              transform: "translate(-100px,-100px)",
              boxShadow: "0 0 6px hsl(266 80% 60% / 0.55)",
            }}
          />
        ))}
      </div>

      {/* subtle center vignette + crosshair for the phase plane */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 55%, color-mix(in oklab, var(--background) 82%, black) 100%)",
        }}
      />

      {/* Header */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 p-5 sm:p-7">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          6744 · strange attractor · audio-rate
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Chua
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          A chaotic circuit integrated one step per audio sample — its trajectory
          is the sound. Turn the route-to-chaos knob: pure tone → period-doubling
          → double-scroll chaos.
        </p>
        {fallback && (
          <p className="mt-2 max-w-xl text-sm text-destructive">
            audio-worklet unavailable — running a reduced main-thread model.
          </p>
        )}
      </div>

      {/* Live readouts (top-right) */}
      <div className="pointer-events-none absolute right-5 top-24 flex flex-col items-end gap-1 font-mono text-xs text-muted-foreground sm:top-28">
        <div className="text-sm text-foreground">{ui.regime}</div>
        <div>α = {ui.alpha.toFixed(2)}</div>
        <div>ƒ₀ ≈ {ui.hz.toFixed(1)} Hz</div>
        <div>λ₁ ≈ {ui.lyap.toFixed(3)}</div>
        {ui.frozen && <div className="text-primary">orbit frozen</div>}
      </div>

      {/* Chaos meter (violet ramp, left) */}
      <div className="pointer-events-none absolute left-5 top-40 w-40 sm:top-44">
        <div className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          chaos meter
        </div>
        <div className="h-2 w-full overflow-hidden rounded-md bg-primary/15">
          <div
            className="h-full rounded-md transition-[width] duration-150"
            style={{
              width: `${meterPct}%`,
              background: "linear-gradient(90deg, hsl(266 60% 45%), hsl(266 85% 68%))",
            }}
          />
        </div>
        <div className="mt-1 font-mono text-xs text-muted-foreground">{meterPct}%</div>
      </div>

      {/* Control dock (bottom) */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-sm sm:p-5">
          {/* Bifurcation — the main expressive control */}
          <label className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>route to chaos · α</span>
              <span className="text-foreground">{ui.alpha.toFixed(2)}</span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={ui.knob}
              onChange={(e) => {
                const v = Number(e.target.value);
                ctlRef.current.setKnob(v);
                setUi((u) => ({ ...u, knob: v }));
              }}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary"
              aria-label="Bifurcation (route to chaos)"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span>pitch</span>
                <span className="text-foreground">{ui.hz.toFixed(0)}Hz</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={ui.speed}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  ctlRef.current.setSpeed(v);
                  setUi((u) => ({ ...u, speed: v }));
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary"
                aria-label="Integration speed (pitch)"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span>breakpoint</span>
                <span className="text-foreground">{diode.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min={-1.7}
                max={-0.6}
                step={0.001}
                value={ui.mBreak}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  ctlRef.current.setBreak(v);
                  setUi((u) => ({ ...u, mBreak: v }));
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary"
                aria-label="Diode nonlinearity breakpoint"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span>output</span>
                <span className="text-foreground">{Math.round(ui.gain * 100)}</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.001}
                value={ui.gain}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  ctlRef.current.setGain(v);
                  setUi((u) => ({ ...u, gain: v }));
                }}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary"
                aria-label="Output gain"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!started ? (
              <button
                onClick={() => void ctlRef.current.startAudio()}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start — listen to the attractor
              </button>
            ) : (
              <button
                onClick={() => ctlRef.current.toggleFreeze()}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {ui.frozen ? "Release orbit" : "Freeze orbit (A/B)"}
              </button>
            )}
            <span className="font-mono text-xs text-muted-foreground">
              keys 1–5 orbits · ← → route · ↑ ↓ pitch · space freeze
            </span>
            {reduced && (
              <span className="font-mono text-xs text-muted-foreground">
                reduced-motion: sweep slowed
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This is <strong>Chua&apos;s circuit</strong> (Leon Chua, 1983) —
                the canonical double-scroll chaotic oscillator — integrated with
                RK4 <em>once per audio sample</em> inside an AudioWorkletProcessor
                running on the audio render thread. The three state variables x, y,
                z are the waveform: x drives the left channel, y the right,
                DC-blocked and soft-clipped so it is always safe to hear.
              </p>
              <p>
                The bifurcation knob is Chua&apos;s <strong>α</strong>. Low α is a
                stable limit cycle — a near-pure tone. Raising it walks the{" "}
                <strong>period-doubling route to chaos</strong> (Feigenbaum):
                subharmonics appear (period-2, period-4), then the trajectory jumps
                between two lobes as broadband-but-pitched double-scroll chaos. The
                chaos meter is a live largest-Lyapunov estimate — a shadow
                trajectory offset by 10⁻⁷, renormalised periodically, accumulating
                its log-divergence — positive means genuine chaos.
              </p>
              <p>
                The phase portrait is <strong>pure DOM</strong>: ~360 recycled
                <code> &lt;div&gt; </code> dots positioned by CSS transform, plotting
                the (x, y, z) trajectory the worklet posts up as a downsampled
                snapshot — no canvas, no WebGL, no SharedArrayBuffer.
              </p>
              <p>
                Where AudioWorklet is unavailable, a reduced main-thread model runs
                the same ODE and drives an oscillator bank (tone + subharmonics +
                a band-passed noise layer) so the route to chaos is still audible.
              </p>
              <p className="text-xs">
                References — Chua, <em>Chua&apos;s circuit</em> (1983); Rick
                Bidlack, &ldquo;Chaotic Systems as Simple (but Complex)
                Compositional Algorithms,&rdquo; <em>Computer Music Journal</em>{" "}
                16(3), 1992; Edward Ott, <em>Chaos in Dynamical Systems</em>
                (period-doubling / Feigenbaum); the Web Audio AudioWorklet
                render-thread model.
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
    </main>
  );
}
