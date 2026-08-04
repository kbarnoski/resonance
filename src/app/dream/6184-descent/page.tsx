"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  AXIS_X,
  AXIS_Y,
  buildFmVoice,
  denorm,
  disposeFmVoice,
  setFmParams,
  setLevel,
  type FmVoice,
} from "./synth";
import {
  N_BINS,
  featuresOf,
  normDb,
  resampleLinearToBins,
  spectrumOf,
} from "./features";
import {
  FIELD_RES,
  createDescent,
  createSinger,
  type Descent,
  type Singer,
} from "./optimize";
import {
  makeCanvas2DRenderer,
  makeWebGLRenderer,
  type Renderer,
} from "./gl";

const SEED = 0x6184;
const TRAIL_MAX = 130;
const TRAIL_EVERY = 2; // push a trail node every N frames

/** loss (mse over normalized-dB bins) → a 0..1 "match" for glow / HUD. */
function matchOf(loss: number): number {
  return Math.exp(-loss * 26);
}

export default function DescentPage() {
  const [audioOn, setAudioOn] = useState(false);
  const [mode, setMode] = useState<"auto" | "mic">("auto");
  const [micState, setMicState] = useState<"idle" | "asking" | "live" | "error">(
    "idle",
  );
  const [renderMode, setRenderMode] = useState<"webgl2" | "canvas2d" | "">("");
  const [showNotes, setShowNotes] = useState(false);
  const [matchPct, setMatchPct] = useState(0);
  const [lossHud, setLossHud] = useState(0);
  const [gradHud, setGradHud] = useState(0);

  // canvas + render
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const t0Ref = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  // descent + target
  const descentRef = useRef<Descent | null>(null);
  const singerRef = useRef<Singer | null>(null);
  const singerVecRef = useRef<Float32Array>(new Float32Array(5));
  const targetDbRef = useRef<Float32Array>(new Float32Array(N_BINS));
  const synthDbRef = useRef<Float32Array>(new Float32Array(N_BINS));
  const targetBinRef = useRef<Float32Array>(new Float32Array(N_BINS));
  const fieldRef = useRef<Float32Array>(new Float32Array(FIELD_RES * FIELD_RES));
  const basinRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  // trail
  const trailPosRef = useRef<Float32Array>(new Float32Array(TRAIL_MAX * 2));
  const trailValRef = useRef<Float32Array>(new Float32Array(TRAIL_MAX));
  const trailCountRef = useRef<number>(0);

  // audio
  const acRef = useRef<AudioContext | null>(null);
  const chaserRef = useRef<FmVoice | null>(null);
  const singerVoiceRef = useRef<FmVoice | null>(null);
  const audioOnRef = useRef<boolean>(false);
  const modeRef = useRef<"auto" | "mic">("auto");

  // mic
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micFreqRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  /* ── ensure an AudioContext + the two duet voices (user gesture) ───────── */
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
    limiter.threshold.value = -12;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ac.destination);

    // chaser = the descending synth you hear; singer = the drifting target
    const chaser = buildFmVoice(ac, master, 0.12);
    const singer = buildFmVoice(ac, master, -0.32);
    acRef.current = ac;
    chaserRef.current = chaser;
    singerVoiceRef.current = singer;
    return ac;
  }, []);

  const applyLevels = useCallback(() => {
    const ac = acRef.current;
    if (!ac) return;
    const now = ac.currentTime;
    const on = audioOnRef.current;
    setLevel(chaserRef.current!, on ? 0.22 : 0.0001, now);
    // the synthetic singer is only audible in Auto mode (mic is analyser-only)
    setLevel(
      singerVoiceRef.current!,
      on && modeRef.current === "auto" ? 0.13 : 0.0001,
      now,
    );
  }, []);

  const handleStart = useCallback(() => {
    ensureAudio();
    audioOnRef.current = true;
    setAudioOn(true);
    applyLevels();
  }, [ensureAudio, applyLevels]);

  /* ── mic: getUserMedia → analyser ONLY (never routed to output) ────────── */
  const startMic = useCallback(() => {
    const ac = ensureAudio();
    setMicState("asking");
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
        an.smoothingTimeConstant = 0.6;
        src.connect(an); // analyser is a sink — nothing reaches destination
        micSrcRef.current = src;
        analyserRef.current = an;
        micFreqRef.current = new Float32Array(an.frequencyBinCount);
        modeRef.current = "mic";
        setMode("mic");
        setMicState("live");
        applyLevels();
      })
      .catch(() => {
        setMicState("error");
        modeRef.current = "auto";
        setMode("auto");
        applyLevels();
      });
  }, [ensureAudio, applyLevels]);

  const stopMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micSrcRef.current?.disconnect();
    micSrcRef.current = null;
    analyserRef.current = null;
    modeRef.current = "auto";
    setMode("auto");
    setMicState("idle");
    applyLevels();
  }, [applyLevels]);

  const toggleMode = useCallback(() => {
    if (modeRef.current === "auto") startMic();
    else stopMic();
  }, [startMic, stopMic]);

  /* ── mount: build descent, singer, renderer, run the loop (NO audio) ───── */
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    descentRef.current = createDescent(SEED);
    singerRef.current = createSinger(SEED);

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

    const loop = () => {
      const time = (performance.now() - t0Ref.current) / 1000;
      const timeScale = reducedRef.current ? 0.45 : 1;
      const t = time * timeScale;
      const descent = descentRef.current!;

      // 1) refresh the target spectrum
      if (modeRef.current === "mic" && analyserRef.current && micFreqRef.current) {
        const an = analyserRef.current;
        const freq = micFreqRef.current;
        an.getFloatFrequencyData(freq);
        const mag = new Float32Array(freq.length);
        let energy = 0;
        for (let i = 0; i < freq.length; i++) {
          mag[i] = Math.pow(10, freq[i] / 20);
          energy += mag[i];
        }
        if (energy > 1e-4) {
          const binHz = (acRef.current?.sampleRate ?? 48000) / an.fftSize;
          resampleLinearToBins(mag, binHz, targetBinRef.current);
          normDb(targetBinRef.current, targetDbRef.current);
        }
      } else {
        // Auto: the synthetic singer's drifting timbre is the target
        const vec = singerVecRef.current;
        singerRef.current!.at(t, vec);
        // reuse the descent's analytic spectrum path for the target
        const target = denorm(vec);
        // build the target spectrum via the shared analytic model
        spectrumOf(target, targetDbRef.current);
        // drive the audible singer voice
        if (audioOnRef.current && singerVoiceRef.current && acRef.current) {
          setFmParams(singerVoiceRef.current, target, acRef.current.currentTime, 0.06);
        }
      }

      // 2) descend
      const { loss, gradMag } = descent.run(targetDbRef.current);
      const match = matchOf(loss);

      // 3) drive the audible chaser voice with the descended params
      if (audioOnRef.current && chaserRef.current && acRef.current) {
        setFmParams(chaserRef.current, descent.current(), acRef.current.currentTime, 0.07);
      }

      // 4) loss landscape + basin
      const b = descent.field(targetDbRef.current, fieldRef.current);
      basinRef.current = { x: b.basinX, y: b.basinY };
      descent.spectrum(synthDbRef.current);

      // 5) trajectory trail
      frameRef.current += 1;
      if (frameRef.current % TRAIL_EVERY === 0) {
        const tc = trailCountRef.current;
        const pos = trailPosRef.current;
        const px = descent.params[AXIS_X];
        const py = descent.params[AXIS_Y];
        if (tc < TRAIL_MAX) {
          pos[tc * 2] = px;
          pos[tc * 2 + 1] = py;
          trailCountRef.current = tc + 1;
        } else {
          pos.copyWithin(0, 2);
          pos[(TRAIL_MAX - 1) * 2] = px;
          pos[(TRAIL_MAX - 1) * 2 + 1] = py;
        }
      }
      const tc = trailCountRef.current;
      const tv = trailValRef.current;
      for (let i = 0; i < tc; i++) tv[i] = (i + 1) / tc;

      // 6) draw
      rendererRef.current?.draw({
        field: fieldRef.current,
        fieldRes: FIELD_RES,
        point: { x: descent.params[AXIS_X], y: descent.params[AXIS_Y] },
        basin: basinRef.current,
        trailPos: trailPosRef.current,
        trailVal: tv,
        trailCount: tc,
        targetSpec: targetDbRef.current,
        synthSpec: synthDbRef.current,
        match,
        time,
        reducedMotion: reducedRef.current,
      });

      // 7) throttled HUD
      if (frameRef.current % 6 === 0) {
        setMatchPct(Math.round(match * 100));
        setLossHud(loss);
        setGradHud(gradMag);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  /* ── teardown all audio + mic on unmount ───────────────────────────────── */
  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (chaserRef.current) disposeFmVoice(chaserRef.current);
      if (singerVoiceRef.current) disposeFmVoice(singerVoiceRef.current);
      const ac = acRef.current;
      if (ac && ac.state !== "closed") void ac.close();
      acRef.current = null;
    };
  }, []);

  const feat = featuresOf(targetDbRef.current);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream · 6184 · descent
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Hearing a synth think its way toward you
            </h1>
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="shrink-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        <p className="mt-3 text-base text-muted-foreground">
          A five-parameter FM voice descends a spectral-loss gradient in real
          time — sliding its own knobs downhill, step by audible step, until its
          timbre becomes the target&apos;s. The optimization loop is the
          instrument.
        </p>

        {/* stage */}
        <div
          ref={wrapRef}
          className="relative mt-5 aspect-[4/5] w-full overflow-hidden rounded-lg border border-border bg-[#05030c] sm:aspect-video"
        >
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-background/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur-sm">
            match {matchPct}% · loss {lossHud.toFixed(3)} · |∇| {gradHud.toFixed(2)}
          </div>
          <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-background/50 px-2.5 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur-sm">
            {mode === "mic" ? "target: your voice" : "target: synthetic singer"}
          </div>
          {renderMode === "canvas2d" && (
            <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-background/50 px-2.5 py-1.5 text-xs text-destructive backdrop-blur-sm">
              WebGL2 unavailable — Canvas2D fallback
            </div>
          )}
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The glowing valley is the live loss landscape over two of the
          synth&apos;s parameters (ratio × index). The bright point is the
          synth, rolling downhill toward the star — the target basin. The two
          curves at the base are the target and synth spectra, converging.{" "}
          {mode === "auto"
            ? "A seeded synthetic singer drifts, so the minimum keeps moving and the synth keeps re-chasing."
            : "Hum or sing a steady note; the synth chases your timbre."}
        </p>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!audioOn ? (
            <button
              onClick={handleStart}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Hear it descend
            </button>
          ) : (
            <span className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground">
              Duet playing — {mode === "auto" ? "singer + chaser" : "chaser only"}
            </span>
          )}
          <button
            onClick={toggleMode}
            disabled={micState === "asking"}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {mode === "mic"
              ? "Switch to Auto"
              : micState === "asking"
                ? "Asking…"
                : "Use my mic"}
          </button>
        </div>

        {micState === "error" && (
          <p className="mt-3 text-sm text-destructive">
            Microphone unavailable — staying in Auto. The synthetic-singer duet
            keeps the piece fully alive.
          </p>
        )}

        <div className="mt-4 grid grid-cols-4 gap-3 font-mono text-xs text-muted-foreground">
          <div>
            centroid
            <div className="text-foreground">{feat.centroid.toFixed(2)}</div>
          </div>
          <div>
            spread
            <div className="text-foreground">{feat.spread.toFixed(2)}</div>
          </div>
          <div>
            flatness
            <div className="text-foreground">{feat.flatness.toFixed(2)}</div>
          </div>
          <div>
            rms
            <div className="text-foreground">{feat.rms.toFixed(2)}</div>
          </div>
        </div>

        <PrototypeNav slugs={["6184-descent"]} />
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              The optimization loop as the instrument
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The voice is a 2-operator FM patch through a resonant lowpass:
                five continuous parameters (fundamental, modulator ratio, FM
                index, cutoff, Q). Each frame we measure a spectral loss — the
                distance between the synth&apos;s log-band magnitude spectrum and
                the live target&apos;s — and take a few gradient-descent steps on
                those five parameters.
              </p>
              <p>
                Gradients are estimated by cheap finite differences: perturb each
                parameter, measure the change in loss. Momentum, gradient
                normalization and a clamp on the per-step move keep the slide
                stable — the &ldquo;macro-controls that keep it stable&rdquo;
                framing from ADAC. Every audible parameter is ramped, so you hear
                a continuous slide, not steps.
              </p>
              <p>
                The image is the descent itself: the glowing valley is the loss
                evaluated across a 44×44 grid of the two most salient parameters,
                recomputed live; the point rolls toward the basin. This walks the
                exact road{" "}
                <span className="text-foreground">5784-converge</span> named and
                did not take — it used an evolutionary population search{" "}
                <em>instead of</em> gradients; here the gradient is the
                instrument. Full notes and references in{" "}
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
