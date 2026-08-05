"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SpectraAudio } from "./audio";
import {
  BASE_HZ,
  CURVE_SAMPLES,
  N_PARTIALS,
  PRESETS,
  clonePreset,
  computeScale,
  computeSpectrum,
  mulberry32,
  type Scale,
  type TimbreParams,
} from "./dissonance";

/* -------------------------------- constants -------------------------------- */

// keys assigned to derived scale degrees, in order (unison first, octave last).
const KEY_ROW = [
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "0",
  "q", "w", "e", "r", "t", "y", "u", "i", "o", "p",
];
const PLOT_H = 200; // px height of the pure-DOM dissonance plot
const AUTO_IDLE_MS = 5200; // silence before the seeded auto-demo takes over
const MORPH_MS = 5600; // time to glide toward each morph target
const DEGREE_MS = 1300; // auto-demo degree cadence

type Phase = "idle" | "running" | "nosound";

interface Degree {
  key: string;
  cents: number;
  ratio: number; // interval multiplier from BASE
  nearest: string;
  index: number; // curve sample index, or -1 for the octave cap
}

const rounded = (n: number, d = 0) => n.toFixed(d);

/** Build the playable degree list: unison, each valley, then the octave. */
function buildDegrees(scale: Scale): Degree[] {
  const out: Degree[] = [
    { key: KEY_ROW[0], cents: 0, ratio: 1, nearest: "1/1", index: 0 },
  ];
  for (const v of scale.valleys) {
    if (out.length >= KEY_ROW.length - 1) break;
    out.push({
      key: KEY_ROW[out.length],
      cents: v.cents,
      ratio: v.ratio,
      nearest: v.nearest,
      index: v.index,
    });
  }
  out.push({
    key: KEY_ROW[Math.min(out.length, KEY_ROW.length - 1)],
    cents: 1200,
    ratio: 2,
    nearest: "2/1",
    index: -1,
  });
  return out;
}

/* ================================== page =================================== */

export default function SpectrascalePage() {
  const audioRef = useRef<SpectraAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const soundRef = useRef(false);
  const reducedRef = useRef(false);

  // live timbre params (also mirrored in a ref for the rAF auto-demo).
  const [params, setParams] = useState<TimbreParams>(() =>
    clonePreset(PRESETS[0]),
  );
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const [phase, setPhase] = useState<Phase>("idle");
  const [presetId, setPresetId] = useState<string>(PRESETS[0].id);
  const [active, setActive] = useState<number | null>(null); // active degree idx
  const [autoOn, setAutoOn] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  // auto-demo bookkeeping (refs so the rAF loop stays stable).
  const autoRef = useRef(true);
  autoRef.current = autoOn;
  const lastInputRef = useRef(0);
  const morphFromRef = useRef<TimbreParams>(clonePreset(PRESETS[0]));
  const morphToRef = useRef<TimbreParams>(clonePreset(PRESETS[2]));
  const morphStartRef = useRef(0);
  const lastMorphFrameRef = useRef(0);
  const lastDegreeRef = useRef(0);
  const rndRef = useRef(mulberry32(0x6808));
  const activeTimerRef = useRef<number | null>(null);

  /* ------------------------- derive the scale (memo) ---------------------- */

  const spectrum = useMemo(() => computeSpectrum(params), [params]);
  const scale = useMemo(() => computeScale(spectrum), [spectrum]);
  const degrees = useMemo(() => buildDegrees(scale), [scale]);

  // keep the audio engine's spectrum in lock-step with what's drawn.
  useEffect(() => {
    audioRef.current?.setSpectrum(spectrum);
  }, [spectrum]);

  /* ------------------------------- playback ------------------------------- */

  const flashDegree = useCallback((i: number) => {
    setActive(i);
    if (activeTimerRef.current != null) window.clearTimeout(activeTimerRef.current);
    activeTimerRef.current = window.setTimeout(() => setActive(null), 260);
  }, []);

  const playDegree = useCallback(
    (i: number, fromUser: boolean) => {
      const deg = degrees[i];
      if (!deg) return;
      if (fromUser) {
        lastInputRef.current = performance.now();
      }
      flashDegree(i);
      const audio = audioRef.current;
      if (audio && soundRef.current) {
        audio.pluck(BASE_HZ * deg.ratio, fromUser ? 0.85 : 0.55, 0.7);
      }
    },
    [degrees, flashDegree],
  );

  const markInput = useCallback(() => {
    lastInputRef.current = performance.now();
  }, []);

  const applyPreset = useCallback(
    (id: string) => {
      const p = PRESETS.find((x) => x.id === id);
      if (!p) return;
      markInput();
      setPresetId(id);
      setParams(clonePreset(p));
    },
    [markInput],
  );

  const setDrawbar = useCallback(
    (idx: number, value: number) => {
      markInput();
      setPresetId("custom");
      setParams((prev) => {
        const amps = [...prev.amps];
        amps[idx] = value;
        return { ...prev, amps };
      });
    },
    [markInput],
  );

  const setStretch = useCallback(
    (value: number) => {
      markInput();
      setPresetId("custom");
      setParams((prev) => ({ ...prev, stretch: value }));
    },
    [markInput],
  );

  const setInharm = useCallback(
    (value: number) => {
      markInput();
      setPresetId("custom");
      setParams((prev) => ({ ...prev, inharm: value }));
    },
    [markInput],
  );

  /* ------------------------------- start -------------------------------- */

  const start = useCallback(() => {
    if (soundRef.current) return;
    try {
      const audio = new SpectraAudio(computeSpectrum(paramsRef.current));
      audio.resume();
      audioRef.current = audio;
      soundRef.current = true;
      setPhase("running");
    } catch {
      setPhase("nosound");
    }
  }, []);

  /* ------------------- keyboard + auto-demo rAF lifecycle ----------------- */

  // refs the stable rAF loop reads from without re-subscribing.
  const degreesRef = useRef(degrees);
  degreesRef.current = degrees;
  const playDegreeRef = useRef(playDegree);
  playDegreeRef.current = playDegree;

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    lastInputRef.current = performance.now() - AUTO_IDLE_MS; // demo may start soon
    morphStartRef.current = performance.now();

    const loop = (t: number) => {
      const idle = t - lastInputRef.current > AUTO_IDLE_MS;
      if (autoRef.current && idle) {
        // ---- morph the timbre toward the current target ----
        const k = Math.min(1, (t - morphStartRef.current) / MORPH_MS);
        const ease = k * k * (3 - 2 * k); // smoothstep
        const from = morphFromRef.current;
        const to = morphToRef.current;
        const amps = from.amps.map(
          (a, i) => a + (to.amps[i] - a) * ease,
        );
        const stretch = from.stretch + (to.stretch - from.stretch) * ease;
        const inharm = from.inharm + (to.inharm - from.inharm) * ease;

        // throttle the (expensive) re-render/recompute to ~15fps; CSS
        // transitions carry the eye smoothly between updates.
        if (t - lastMorphFrameRef.current > 66 || k >= 1) {
          lastMorphFrameRef.current = t;
          setParams({ amps, stretch, inharm });
          setPresetId("demo");
        }

        if (k >= 1) {
          // reached target: pick the next preset as the new target.
          morphFromRef.current = { amps, stretch, inharm };
          const next = PRESETS[Math.floor(rndRef.current() * PRESETS.length)];
          morphToRef.current = clonePreset(next);
          morphStartRef.current = t;
        }

        // ---- occasionally sound a derived degree ----
        const cadence = reducedRef.current ? DEGREE_MS * 1.8 : DEGREE_MS;
        if (t - lastDegreeRef.current > cadence) {
          lastDegreeRef.current = t;
          const list = degreesRef.current;
          if (list.length > 2) {
            const pick = 1 + Math.floor(rndRef.current() * (list.length - 2));
            playDegreeRef.current(pick, false);
          }
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (activeTimerRef.current != null)
        window.clearTimeout(activeTimerRef.current);
    };
    // the loop reads live values via refs to stay mounted-once & stable.
  }, []);

  // re-bind keydown when the degree map changes (so key→degree stays correct).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const code = e.key.toLowerCase();
      const i = degrees.findIndex((d) => d.key === code);
      if (i >= 0) {
        e.preventDefault();
        playDegree(i, true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [degrees, playDegree]);

  // full teardown of audio on unmount.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      audioRef.current = null;
      soundRef.current = false;
      if (audio) audio.dispose();
    };
  }, []);

  /* ------------------------------ derived view ---------------------------- */

  const valleyByIndex = useMemo(() => {
    const m = new Map<number, number>(); // curve index -> degree index
    degrees.forEach((d, di) => {
      if (d.index >= 0) m.set(d.index, di);
    });
    return m;
  }, [degrees]);

  // 12-TET marker positions (percent across the octave).
  const tetMarks = useMemo(
    () => Array.from({ length: 11 }, (_, k) => ((k + 1) * 100) / 12),
    [],
  );

  const barW = 100 / CURVE_SAMPLES;

  /* --------------------------------- render ------------------------------- */

  return (
    <main className="relative min-h-screen w-full overflow-x-hidden bg-background text-foreground">
      {/* --------------------------- header --------------------------- */}
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-5 pt-6 sm:px-8">
        <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          6808 · living tuning · cycle 2
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Spectrascale
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          The scale is not assumed — it is grown from the timbre. Sweep a copy of
          the instrument&rsquo;s own spectrum across an octave, and the valleys of
          the sensory-dissonance curve become the consonant pitches. Reshape the
          partials and watch the whole set of playable notes re-lay-out.
        </p>
      </div>

      {/* ---------------------- the pure-DOM dissonance plot ---------------------- */}
      <div className="mx-auto mt-6 max-w-5xl px-5 sm:px-8">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Sensory-dissonance curve · unison → octave
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {scale.valleys.length} valleys ={" "}
            <span className="text-primary">{degrees.length} degrees</span>
          </div>
        </div>

        <div
          className="relative w-full rounded-md border border-border bg-background/60"
          style={{ height: PLOT_H + 82 }}
          aria-hidden
        >
          {/* 12-TET reference grid — see how far the timbre's scale departs */}
          {tetMarks.map((left, k) => (
            <div
              key={`tet${k}`}
              className="absolute bottom-[54px] top-3 w-px bg-border"
              style={{ left: `${left}%` }}
            >
              <span className="absolute -bottom-[16px] -translate-x-1/2 font-mono text-[9px] text-muted-foreground/70">
                {k + 1}
              </span>
            </div>
          ))}

          {/* the curve, as ~200 absolutely-positioned bars */}
          {scale.curve.map((d, i) => {
            const norm = (d - scale.minD) / Math.max(1e-9, scale.maxD - scale.minD);
            const h = 8 + norm * PLOT_H;
            const degIdx = valleyByIndex.get(i);
            const isValley = degIdx !== undefined;
            const isActive = isValley && active === degIdx;
            return (
              <div
                key={`b${i}`}
                className="absolute bottom-[54px]"
                style={{
                  left: `${i * barW}%`,
                  width: `${barW}%`,
                  height: h,
                  background: isValley
                    ? "var(--color-primary)"
                    : "color-mix(in oklch, var(--color-primary) 22%, transparent)",
                  opacity: isValley ? (isActive ? 1 : 0.9) : 0.55,
                  transform: isActive ? "scaleY(1.06)" : "scaleY(1)",
                  transformOrigin: "bottom",
                  boxShadow: isActive
                    ? "0 0 16px var(--color-primary)"
                    : "none",
                  transition:
                    "height 380ms cubic-bezier(0.4,0,0.2,1), background 380ms, opacity 380ms, transform 200ms, box-shadow 200ms",
                }}
              />
            );
          })}

          {/* valley labels: cents + nearest just ratio */}
          {degrees.map((deg, di) => {
            if (deg.index < 0 || deg.cents === 0) return null;
            const left = (deg.cents / 1200) * 100;
            const isActive = active === di;
            return (
              <div
                key={`lbl${di}`}
                className="absolute bottom-1 flex -translate-x-1/2 flex-col items-center"
                style={{
                  left: `${left}%`,
                  transition: "left 380ms cubic-bezier(0.4,0,0.2,1)",
                }}
              >
                <span
                  className={`font-mono text-[10px] leading-tight ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {rounded(deg.cents)}¢
                </span>
                <span
                  className={`font-mono text-[10px] leading-tight ${
                    isActive ? "text-primary" : "text-foreground/70"
                  }`}
                >
                  {deg.nearest}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground/70">
          <span>1/1 · 0¢</span>
          <span>thin grid = 12-TET semitones</span>
          <span>2/1 · 1200¢</span>
        </div>
      </div>

      {/* ------------------------- timbre controls ------------------------- */}
      <div className="mx-auto mt-6 max-w-5xl px-5 sm:px-8">
        <div className="flex flex-col gap-4 rounded-md border border-border bg-background/60 p-4 sm:flex-row sm:items-start sm:gap-8">
          {/* drawbars */}
          <div className="flex-1">
            <div className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Drawbars · partial amplitudes
            </div>
            <div className="flex items-end gap-2">
              {params.amps.map((a, i) => (
                <label
                  key={`db${i}`}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={a}
                    onChange={(e) => setDrawbar(i, parseFloat(e.target.value))}
                    className="h-24 w-6 cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary"
                    style={{ writingMode: "vertical-lr", direction: "rtl" }}
                    aria-label={`partial ${i + 1} amplitude`}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* stretch + inharmonicity */}
          <div className="flex w-full flex-col gap-4 sm:w-64">
            <div>
              <div className="mb-1 flex justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span>Octave stretch</span>
                <span className="text-primary">{params.stretch.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min={1.85}
                max={2.25}
                step={0.005}
                value={params.stretch}
                onChange={(e) => setStretch(parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary"
                aria-label="octave stretch ratio"
              />
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                2.000 = harmonic
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                <span>Inharmonicity</span>
                <span className="text-primary">{params.inharm.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.05}
                step={0.001}
                value={params.inharm}
                onChange={(e) => setInharm(parseFloat(e.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-primary/20 accent-primary"
                aria-label="inharmonicity coefficient"
              />
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                bends upper partials sharp (metallic)
              </div>
            </div>
          </div>
        </div>

        {/* preset row */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Preset
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p.id)}
              className={`min-h-[44px] rounded-md border px-4 text-sm transition-colors ${
                presetId === p.id
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
          {(presetId === "custom" || presetId === "demo") && (
            <span className="font-mono text-xs text-muted-foreground">
              {presetId === "demo" ? "· auto-demo morphing" : "· custom"}
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------ transport ----------------------------- */}
      <div className="mx-auto mt-5 flex max-w-5xl flex-wrap items-center gap-2 px-5 sm:px-8">
        {phase === "idle" && (
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start sound
          </button>
        )}
        {phase === "running" && (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            audio live · master 0.18
          </span>
        )}
        <button
          onClick={() => {
            setAutoOn((v) => !v);
            markInput();
          }}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {autoOn ? "Auto-demo: on" : "Auto-demo: off"}
        </button>
      </div>

      {phase === "nosound" && (
        <p className="mx-auto mt-3 max-w-5xl px-5 text-sm text-destructive sm:px-8">
          Web Audio is unavailable in this browser — the dissonance curve keeps
          morphing and the scale keeps re-deriving in silence.
        </p>
      )}

      {/* ------------------------- degree keyboard ------------------------- */}
      <div className="mx-auto mt-5 max-w-5xl px-5 pb-28 sm:px-8">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Derived scale degrees · press keys or tap
        </div>
        <div className="flex flex-wrap gap-1.5">
          {degrees.map((deg, i) => {
            const isActive = active === i;
            const edge = deg.cents === 0 || deg.index < 0;
            return (
              <button
                key={`deg${i}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  playDegree(i, true);
                }}
                className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center rounded-md border px-2 py-1 transition-colors ${
                  isActive
                    ? "border-primary bg-primary/20 text-primary"
                    : edge
                      ? "border-border bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
                      : "border-border bg-background/70 text-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <span className="font-mono text-sm uppercase">{deg.key}</span>
                <span className="font-mono text-[10px] opacity-70">
                  {rounded(deg.cents)}¢
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* --------------------------- design notes --------------------------- */}
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-3 right-4 z-20 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes →
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Spectrascale — design notes
              </h2>
              <button
                onClick={() => setShowNotes(false)}
                className="font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                close ✕
              </button>
            </div>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The consonant scale for an instrument depends on the instrument.
                Following William Sethares&rsquo; <em>Tuning Timbre Spectrum
                Scale</em>, we take the current spectrum, sweep a second copy of
                it across the octave (interval α ∈ [1, 2]), and at every α sum the
                pairwise sensory dissonance of all partials — the Plomp &amp;
                Levelt (1965) roughness model with the ~0.24 critical-bandwidth
                curve.
              </p>
              <p>
                The <span className="text-primary">local minima</span> of that
                curve are the intervals where the two copies&rsquo; partials line
                up best — the consonant steps. Those violet valleys, labelled with
                their cents and nearest just ratio, ARE the playable scale. The
                thin grid behind them is 12-TET, so you can see how far the
                timbre&rsquo;s own scale departs from equal temperament.
              </p>
              <p>
                A purely <strong>harmonic</strong> spectrum yields minima near the
                just ratios (5/4 ≈ 386¢ → ~388¢, 4/3 ≈ 498¢ → ~496¢, 3/2 ≈ 702¢ →
                ~705¢, 5/3 ≈ 884¢ → ~886¢). Raise the octave-stretch or the
                inharmonicity and the curve re-flows: the <strong>stretched</strong>{" "}
                timbre slides its valleys off the just ratios into a new,
                measurably shifted set, and the <strong>metallic</strong>/inharmonic
                spectrum produces a dense, distinctly non-12-TET scale. The
                additive voice is built from the
                exact same partials, so what you hear is what the curve is computed
                from.
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Refs — Sethares, <em>Tuning Timbre Spectrum Scale</em>
                (dissonance-curve / related-scale chapters) · Plomp &amp; Levelt,
                &ldquo;Tonal Consonance and Critical Bandwidth&rdquo; (1965).
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                Deterministic (mulberry32 seed 0x6808 · performance.now). No
                canvas / SVG / WebGL — the plot is {CURVE_SAMPLES} DOM bars.{" "}
                {N_PARTIALS} drawbar partials.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
