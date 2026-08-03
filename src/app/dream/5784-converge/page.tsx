"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { mulberry32 } from "./rng";
import {
  DIM,
  buildFmVoice,
  denorm,
  disposeFmVoice,
  setFmParams,
  type FmVoice,
  type SynthParams,
} from "./synth";
import {
  N_BINS,
  fmBins,
  normDb,
  projectBins,
  resampleLinearToBins,
  spectralLoss,
} from "./features";
import { createES, type Candidate, type ES } from "./es";
import {
  makeCanvas2DRenderer,
  makeWebGLRenderer,
  type Renderer,
} from "./render";

const LAMBDA = 44; // population per generation
const MAX_GEN = 112; // generations before the swarm settles
const GEN_MS = 150; // one generation every 150 ms — visibly converging
const TRAIL_MAX = 180; // best-so-far trail length (> MAX_GEN, never overflows)
const EASE = 0.14; // per-frame swarm easing toward the new generation
const SEED0 = 0x51a7f00d; // fixed starting seed → reproducible first hunt

function fitToBright(f: number): number {
  return Math.exp(-f * 7); // loss → [0,1] brightness (1 = perfect match)
}
function nextSeed(s: number): number {
  return (Math.imul(s, 1664525) + 1013904223) >>> 0;
}

export default function ConvergePage() {
  const [started, setStarted] = useState(false);
  const [micState, setMicState] = useState<
    "idle" | "listening" | "active" | "denied"
  >("idle");
  const [ab, setAb] = useState<"target" | "best">("best");
  const [renderMode, setRenderMode] = useState<"webgl2" | "canvas2d" | "">("");
  const [showNotes, setShowNotes] = useState(false);
  const [status, setStatus] = useState(
    "Auto-demo: a synth is teaching itself to sound like the seeded target — no sound or tap needed.",
  );
  const [sourceLabel, setSourceLabel] = useState("seeded target");
  const [gen, setGen] = useState(0);
  const [matchPct, setMatchPct] = useState(0);

  // canvas + render
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const genTimerRef = useRef<number>(0);
  const t0Ref = useRef<number>(0);

  // search state
  const seedRef = useRef<number>(SEED0);
  const sourceRef = useRef<"seeded" | "mic">("seeded");
  const esRef = useRef<ES | null>(null);
  const targetDbRef = useRef<Float32Array | null>(null);
  const targetXYRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const targetParamsRef = useRef<SynthParams | null>(null);
  const bestRef = useRef<Candidate | null>(null);
  const doneRef = useRef<boolean>(false);
  const settleAtRef = useRef<number>(0);

  // display buffers (eased between generations)
  const genPosRef = useRef<Float32Array>(new Float32Array(LAMBDA * 2).fill(0.5));
  const genValRef = useRef<Float32Array>(new Float32Array(LAMBDA).fill(0.1));
  const dispPosRef = useRef<Float32Array>(
    new Float32Array(LAMBDA * 2).fill(0.5),
  );
  const dispValRef = useRef<Float32Array>(new Float32Array(LAMBDA).fill(0.1));
  const trailPosRef = useRef<Float32Array>(new Float32Array(TRAIL_MAX * 2));
  const trailValRef = useRef<Float32Array>(new Float32Array(TRAIL_MAX));
  const trailCountRef = useRef<number>(0);

  // audio
  const acRef = useRef<AudioContext | null>(null);
  const bestBusRef = useRef<GainNode | null>(null);
  const targetBusRef = useRef<GainNode | null>(null);
  const bestVoiceRef = useRef<FmVoice | null>(null);
  const targetVoiceRef = useRef<FmVoice | null>(null);
  const targetSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const recordedBufferRef = useRef<AudioBuffer | null>(null);
  const startedRef = useRef<boolean>(false);
  const abRef = useRef<"target" | "best">("best");

  // mic
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRafRef = useRef<number>(0);

  /* ── build the seeded target timbre from a seed ─────────────────────── */
  const buildSeededTarget = useCallback((seed: number) => {
    const trand = mulberry32(seed);
    const tvec = Array.from({ length: DIM }, () => trand());
    const p = denorm(tvec);
    const bins = fmBins(p);
    targetParamsRef.current = p;
    targetDbRef.current = normDb(bins);
    targetXYRef.current = projectBins(bins);
  }, []);

  /* ── (re)start the evolutionary search against the current target ───── */
  const startSearch = useCallback((seed: number) => {
    const binScratch = new Float32Array(N_BINS);
    const dbScratch = new Float32Array(N_BINS);
    const es = createES({
      dim: DIM,
      lambda: LAMBDA,
      rand: mulberry32(seed ^ 0x9e3779b9), // stream distinct from target pick
      initSigma: 0.36,
      evaluate: (vec) => {
        const p = denorm(vec);
        fmBins(p, binScratch);
        normDb(binScratch, dbScratch);
        const fitness = spectralLoss(dbScratch, targetDbRef.current!);
        const xy = projectBins(binScratch);
        return { fitness, x: xy.x, y: xy.y };
      },
    });
    esRef.current = es;
    bestRef.current = null;
    doneRef.current = false;
    trailCountRef.current = 0;
    genPosRef.current.fill(0.5);
    genValRef.current.fill(0.1);
    setGen(0);
    setMatchPct(0);
  }, []);

  /* ── audio: create context + buses lazily inside a user gesture ─────── */
  const wireTargetAudio = useCallback(() => {
    const ac = acRef.current;
    const bus = targetBusRef.current;
    if (!ac || !bus) return;
    if (targetVoiceRef.current) {
      disposeFmVoice(targetVoiceRef.current);
      targetVoiceRef.current = null;
    }
    if (targetSrcRef.current) {
      try {
        targetSrcRef.current.stop();
      } catch {
        /* not started */
      }
      targetSrcRef.current.disconnect();
      targetSrcRef.current = null;
    }
    if (sourceRef.current === "mic" && recordedBufferRef.current) {
      const src = ac.createBufferSource();
      src.buffer = recordedBufferRef.current;
      src.loop = true;
      src.connect(bus);
      src.start();
      targetSrcRef.current = src;
    } else if (targetParamsRef.current) {
      const v = buildFmVoice(ac, bus);
      v.amp.gain.setValueAtTime(0.24, ac.currentTime);
      setFmParams(v, targetParamsRef.current, ac.currentTime, 0.01);
      targetVoiceRef.current = v;
    }
  }, []);

  const applyAB = useCallback(() => {
    const ac = acRef.current;
    if (!ac) return;
    const now = ac.currentTime;
    bestBusRef.current?.gain.setTargetAtTime(
      abRef.current === "best" ? 0.9 : 0.0001,
      now,
      0.05,
    );
    targetBusRef.current?.gain.setTargetAtTime(
      abRef.current === "target" ? 0.9 : 0.0001,
      now,
      0.05,
    );
  }, []);

  const ensureAudio = useCallback(() => {
    if (acRef.current) return acRef.current;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    void ac.resume();
    const master = ac.createGain();
    master.gain.value = 0.9;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ac.destination);

    const bestBus = ac.createGain();
    const targetBus = ac.createGain();
    bestBus.gain.value = 0.0001;
    targetBus.gain.value = 0.0001;
    bestBus.connect(master);
    targetBus.connect(master);

    const best = buildFmVoice(ac, bestBus);
    best.amp.gain.setValueAtTime(0.24, ac.currentTime);
    if (bestRef.current) {
      setFmParams(best, denorm(bestRef.current.vec), ac.currentTime, 0.01);
    }

    acRef.current = ac;
    bestBusRef.current = bestBus;
    targetBusRef.current = targetBus;
    bestVoiceRef.current = best;
    startedRef.current = true;
    setStarted(true);
    wireTargetAudio();
    applyAB();
    return ac;
  }, [wireTargetAudio, applyAB]);

  const handleStart = useCallback(() => {
    ensureAudio();
    setStatus(
      "Sound on. You are hearing the best-so-far synth morph as it converges. Toggle A/B to compare with the target.",
    );
  }, [ensureAudio]);

  const toggleAB = useCallback(() => {
    setAb((prev) => {
      const next = prev === "best" ? "target" : "best";
      abRef.current = next;
      applyAB();
      return next;
    });
  }, [applyAB]);

  /* ── mic capture → set as target → restart the hunt ─────────────────── */
  const handleMic = useCallback(() => {
    const ac = ensureAudio();
    setMicState("listening");
    setStatus("Listening… hum, sing or whistle a steady note for ~1.5 s.");

    navigator.mediaDevices
      ?.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      .then((stream) => {
        micStreamRef.current = stream;
        const src = ac.createMediaStreamSource(stream);
        const an = ac.createAnalyser();
        an.fftSize = 2048;
        an.smoothingTimeConstant = 0.4;
        src.connect(an);

        // raw capture (for A/B target playback) via ScriptProcessor
        const chunks: Float32Array[] = [];
        const sp = ac.createScriptProcessor(4096, 1, 1);
        sp.onaudioprocess = (e) => {
          chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
        };
        const sink = ac.createGain();
        sink.gain.value = 0;
        src.connect(sp);
        sp.connect(sink);
        sink.connect(ac.destination);

        const binHz = ac.sampleRate / an.fftSize;
        const freq = new Float32Array(an.frequencyBinCount);
        const acc = new Float32Array(an.frequencyBinCount);
        let frames = 0;
        const startMs = performance.now();

        const finish = () => {
          sp.onaudioprocess = null;
          src.disconnect();
          sp.disconnect();
          sink.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          micStreamRef.current = null;

          if (frames > 0) for (let i = 0; i < acc.length; i++) acc[i] /= frames;
          const bins = resampleLinearToBins(acc, binHz);
          let e = 0;
          for (let i = 0; i < bins.length; i++) e += bins[i];
          if (e < 1e-7) {
            setMicState("denied");
            setStatus(
              "Heard almost nothing — staying on the seeded target. Try again, louder and closer.",
            );
            return;
          }

          const total = chunks.reduce((n, c) => n + c.length, 0);
          if (total > 0) {
            const buf = ac.createBuffer(1, total, ac.sampleRate);
            const d = buf.getChannelData(0);
            let o = 0;
            for (const c of chunks) {
              d.set(c, o);
              o += c.length;
            }
            recordedBufferRef.current = buf;
          }

          sourceRef.current = "mic";
          setSourceLabel("your sound");
          targetDbRef.current = normDb(bins);
          targetXYRef.current = projectBins(bins);
          targetParamsRef.current = null;
          seedRef.current = nextSeed(seedRef.current);
          startSearch(seedRef.current);
          wireTargetAudio();
          applyAB();
          setMicState("active");
          setStatus(
            "Now becoming YOUR sound. Watch the swarm of candidate synths hunt down your timbre.",
          );
        };

        const collect = () => {
          an.getFloatFrequencyData(freq);
          for (let i = 0; i < freq.length; i++) {
            acc[i] += Math.pow(10, freq[i] / 20);
          }
          frames += 1;
          if (performance.now() - startMs < 1500) {
            micRafRef.current = requestAnimationFrame(collect);
          } else {
            finish();
          }
        };
        micRafRef.current = requestAnimationFrame(collect);
      })
      .catch(() => {
        setMicState("denied");
        setStatus(
          "Microphone unavailable — running the seeded auto-demo instead.",
        );
      });
  }, [ensureAudio, startSearch, wireTargetAudio, applyAB]);

  /* ── one evolutionary generation (timer-driven) ─────────────────────── */
  const tick = useCallback(() => {
    const es = esRef.current;
    if (!es) return;

    if (doneRef.current) {
      // settled: seeded demo re-seeds for an endless gallery loop; a mic
      // target stays put (it's the user's sound).
      if (
        sourceRef.current === "seeded" &&
        performance.now() - settleAtRef.current > 2600
      ) {
        seedRef.current = nextSeed(seedRef.current);
        buildSeededTarget(seedRef.current);
        startSearch(seedRef.current);
        if (startedRef.current) wireTargetAudio();
      }
      return;
    }

    const g = es.step();
    const gp = genPosRef.current;
    const gv = genValRef.current;
    for (let i = 0; i < LAMBDA; i++) {
      const c = g.candidates[i];
      gp[i * 2] = c.x;
      gp[i * 2 + 1] = c.y;
      gv[i] = fitToBright(c.fitness);
    }

    // best-so-far (monotonic) + trail
    if (!bestRef.current || g.best.fitness < bestRef.current.fitness) {
      bestRef.current = g.best;
      if (startedRef.current && bestVoiceRef.current && acRef.current) {
        setFmParams(
          bestVoiceRef.current,
          denorm(g.best.vec),
          acRef.current.currentTime,
          0.1,
        );
      }
    }
    const best = bestRef.current;
    const tc = trailCountRef.current;
    if (tc < TRAIL_MAX) {
      trailPosRef.current[tc * 2] = best.x;
      trailPosRef.current[tc * 2 + 1] = best.y;
      trailCountRef.current = tc + 1;
    }

    setGen(g.gen);
    setMatchPct(Math.round(fitToBright(best.fitness) * 100));

    if (g.gen >= MAX_GEN || best.fitness < 1e-3) {
      doneRef.current = true;
      settleAtRef.current = performance.now();
    }
  }, [buildSeededTarget, startSearch, wireTargetAudio]);

  /* ── mount: build target, start search, renderer + loops (NO audio) ─── */
  useEffect(() => {
    buildSeededTarget(seedRef.current);
    startSearch(seedRef.current);

    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    let renderer: Renderer | null = makeWebGLRenderer(canvas);
    if (!renderer) renderer = makeCanvas2DRenderer(canvas);
    rendererRef.current = renderer;
    setRenderMode(renderer ? renderer.mode : "");

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const doResize = () => {
      const r = wrap.getBoundingClientRect();
      renderer?.resize(r.width, r.height, dpr);
    };
    doResize();
    const ro = new ResizeObserver(doResize);
    ro.observe(wrap);

    t0Ref.current = performance.now();
    genTimerRef.current = window.setInterval(tick, GEN_MS);
    tick();

    const loop = () => {
      const time = (performance.now() - t0Ref.current) / 1000;
      const dp = dispPosRef.current;
      const gp = genPosRef.current;
      const dv = dispValRef.current;
      const gv = genValRef.current;
      for (let i = 0; i < LAMBDA * 2; i++) dp[i] += (gp[i] - dp[i]) * EASE;
      for (let i = 0; i < LAMBDA; i++) dv[i] += (gv[i] - dv[i]) * EASE;

      const tc = trailCountRef.current;
      const tv = trailValRef.current;
      for (let i = 0; i < tc; i++) tv[i] = (i + 1) / tc; // oldest dim → newest bright

      const best = bestRef.current;
      rendererRef.current?.draw({
        candPos: dp,
        candVal: dv,
        trailPos: trailPosRef.current,
        trailVal: tv,
        trailCount: tc,
        target: targetXYRef.current,
        bestFit: best ? fitToBright(best.fitness) : 0,
        time,
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (genTimerRef.current) clearInterval(genTimerRef.current);
      ro.disconnect();
      renderer?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── teardown all audio + mic on unmount ────────────────────────────── */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(micRafRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (bestVoiceRef.current) disposeFmVoice(bestVoiceRef.current);
      if (targetVoiceRef.current) disposeFmVoice(targetVoiceRef.current);
      if (targetSrcRef.current) {
        try {
          targetSrcRef.current.stop();
        } catch {
          /* not started */
        }
      }
      const ac = acRef.current;
      if (ac && ac.state !== "closed") void ac.close();
      acRef.current = null;
    };
  }, []);

  const micLabel =
    micState === "listening"
      ? "Listening…"
      : micState === "active"
        ? "Re-listen"
        : "Use my sound";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream · 5784 · converge
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              A synth that becomes your sound
            </h1>
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="shrink-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        <p className="mt-3 text-base text-muted-foreground">
          Give it a timbre and a population of candidate FM synths evolves —
          generation by generation — until the swarm collapses onto your sound.
        </p>

        {/* stage */}
        <div
          ref={wrapRef}
          className="relative mt-5 aspect-[4/5] w-full overflow-hidden rounded-lg border border-border bg-[#05030c] sm:aspect-video"
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur-sm">
            gen {gen} · match {matchPct}% · {sourceLabel}
          </div>
          {renderMode === "canvas2d" && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-background/50 px-2.5 py-1.5 text-xs text-destructive backdrop-blur-sm">
              WebGL2 unavailable — Canvas2D fallback
            </div>
          )}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {status}
        </p>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!started ? (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Hear it converge
            </button>
          ) : (
            <button
              onClick={toggleAB}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              A/B: {ab === "best" ? "best-so-far" : "target"}
            </button>
          )}
          <button
            onClick={handleMic}
            disabled={micState === "listening"}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {micLabel}
          </button>
        </div>

        {micState === "denied" && (
          <p className="mt-3 text-sm text-destructive">
            Microphone denied or silent — the seeded auto-demo keeps running so
            the idea still reads.
          </p>
        )}

        <PrototypeNav slugs={["5784-converge"]} />
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              How it teaches itself
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The instrument is a 2-operator FM patch (carrier, modulator
                ratio, modulation index) through a resonant lowpass — five
                parameters, a genuinely non-convex timbre space where gradients
                are unreliable.
              </p>
              <p>
                So instead of differentiating the audio graph we run a
                population search: a separable CMA-ES samples a cloud of
                candidate synths each generation, scores each by the spectral
                distance between its log-magnitude spectrum and the target&apos;s,
                keeps the best, and adapts its Gaussian toward the winners. Every
                sample is drawn from a seeded RNG, so the whole hunt is
                reproducible.
              </p>
              <p>
                Each candidate is drawn in a 2-D timbre plane (x = spectral
                centroid, y = spectral spread); the target is the bright star.
                You watch — and hear — the swarm converge on it. Full notes and
                references live in{" "}
                <span className="text-foreground">README.md</span>.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
