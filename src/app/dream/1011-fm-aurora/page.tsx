"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  ALGORITHMS,
  ARP_MIDI,
  axisToModIndex,
  midiToHz,
  snapRatio,
  tiltToTimbre,
  type Algorithm,
  type TimbrePoint,
} from "./fm";
import {
  makeCanvas2DRenderer,
  makeWebGLRenderer,
  type Renderer,
} from "./render";

/* ── one FM voice: carrier + modulator → gain → carrier.frequency ─────── */

interface Voice {
  carrier: OscillatorNode;
  mod: OscillatorNode;
  modGain: GainNode;
  amp: GainNode;
}

type SensorMode = "tilt" | "pointer" | "auto";

const SMOOTH = 0.12; // timbre-point easing per frame

export default function FmAuroraPage() {
  const [started, setStarted] = useState(false);
  const [sensor, setSensor] = useState<SensorMode>("auto");
  const [statusMsg, setStatusMsg] = useState(
    "Tap Start to wake the synth.",
  );
  const [algoIdx, setAlgoIdx] = useState(0);
  const [renderMode, setRenderMode] = useState<"webgl2" | "canvas2d" | "">(
    "",
  );
  const [showNotes, setShowNotes] = useState(false);

  // refs that the animation/audio loops read without re-rendering
  const glCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voicesRef = useRef<Voice[]>([]);
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const arpTimerRef = useRef<number>(0);

  // live timbre target (set by tilt/pointer/auto) and the eased current value
  const targetRef = useRef<TimbrePoint>({ index: 0.45, ratio: 0.35 });
  const currentRef = useRef<TimbrePoint>({ index: 0.45, ratio: 0.35 });
  const lastInputRef = useRef<number>(0); // ms timestamp of last human input
  const algoRef = useRef<Algorithm>(ALGORITHMS[0]);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    algoRef.current = ALGORITHMS[algoIdx];
  }, [algoIdx]);

  /* ── build one FM voice ───────────────────────────────────────────── */
  const buildVoice = useCallback(
    (ac: AudioContext, dest: AudioNode): Voice => {
      const carrier = ac.createOscillator();
      const mod = ac.createOscillator();
      const modGain = ac.createGain();
      const amp = ac.createGain();
      carrier.type = "sine";
      mod.type = "sine";
      modGain.gain.value = 0;
      amp.gain.value = 0;
      mod.connect(modGain);
      modGain.connect(carrier.frequency); // FM: modulator drives carrier freq
      carrier.connect(amp);
      amp.connect(dest);
      carrier.start();
      mod.start();
      return { carrier, mod, modGain, amp };
    },
    [],
  );

  /* ── trigger one arpeggio note with ADSR ──────────────────────────── */
  const arpStepRef = useRef(0);
  const triggerArp = useCallback(() => {
    const ac = acRef.current;
    if (!ac) return;
    const voices = voicesRef.current;
    const algo = algoRef.current;
    const step = arpStepRef.current++ % ARP_MIDI.length;
    const midi = ARP_MIDI[step];
    const hz = midiToHz(midi);
    const now = ac.currentTime;

    const cur = currentRef.current;
    const ratio = snapRatio(cur.ratio);
    const modIndex = axisToModIndex(cur.index);
    const carriers = algo.carriers;

    // assign each carrier in the algorithm a pitch; modulators track ratio
    voices.forEach((v, i) => {
      const isCarrier = i < carriers.length;
      if (!isCarrier) {
        v.amp.gain.cancelScheduledValues(now);
        v.amp.gain.setTargetAtTime(0, now, 0.05);
        return;
      }
      // spread carriers across the arpeggiated chord for the parallel algo
      const cMidi = midi + (carriers.length > 1 ? i * 4 : 0);
      const cHz = midiToHz(cMidi);
      const modHz = cHz * ratio;
      // I (index) relates peak deviation = I * modHz
      const dev = modIndex * modHz;
      v.carrier.frequency.setValueAtTime(cHz, now);
      v.mod.frequency.setValueAtTime(modHz, now);
      v.modGain.gain.setTargetAtTime(dev, now, 0.03);

      // ADSR
      const peak = 0.22 / Math.max(1, carriers.length);
      const A = 0.012;
      const D = 0.18;
      const S = peak * 0.55;
      const R = 1.1;
      v.amp.gain.cancelScheduledValues(now);
      v.amp.gain.setValueAtTime(v.amp.gain.value, now);
      v.amp.gain.linearRampToValueAtTime(peak, now + A);
      v.amp.gain.linearRampToValueAtTime(S, now + A + D);
      v.amp.gain.setTargetAtTime(0.0001, now + 0.5, R);
    });
    void hz;
  }, []);

  /* ── continuously track ratio/index onto sustaining modulators ────── */
  const applyTimbre = useCallback(() => {
    const ac = acRef.current;
    if (!ac) return;
    const cur = currentRef.current;
    const ratio = snapRatio(cur.ratio);
    const modIndex = axisToModIndex(cur.index);
    const now = ac.currentTime;
    voicesRef.current.forEach((v, i) => {
      const algo = algoRef.current;
      if (i >= algo.carriers.length) return;
      const cHz = v.carrier.frequency.value;
      const modHz = cHz * ratio;
      const dev = modIndex * modHz;
      v.mod.frequency.setTargetAtTime(modHz, now, 0.08);
      v.modGain.gain.setTargetAtTime(dev, now, 0.08);
    });
  }, []);

  /* ── pointer + tilt input handlers ────────────────────────────────── */
  const onPointer = useCallback((e: PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    targetRef.current = {
      ratio: Math.min(1, Math.max(0, x)),
      index: Math.min(1, Math.max(0, 1 - y)),
    };
    lastInputRef.current = performance.now();
    setSensor((s) => (s === "tilt" ? s : "pointer"));
  }, []);

  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const t = tiltToTimbre(e.beta ?? 0, e.gamma ?? 0);
    targetRef.current = t;
    lastInputRef.current = performance.now();
    setSensor("tilt");
  }, []);

  /* ── master start (user gesture: create + resume AudioContext) ────── */
  const handleStart = useCallback(async () => {
    if (started) return;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new AC();
    await ac.resume();
    acRef.current = ac;

    const master = ac.createGain();
    master.gain.value = 0.85;
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    const analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;

    master.connect(limiter);
    limiter.connect(analyser);
    analyser.connect(ac.destination);
    masterRef.current = master;
    analyserRef.current = analyser;

    // build up to 6 voices (max operators across algorithms)
    voicesRef.current = Array.from({ length: 6 }, () =>
      buildVoice(ac, master),
    );

    startTimeRef.current = performance.now();
    setStarted(true);

    // request tilt permission inside the gesture (iOS-gated)
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const res = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
          setStatusMsg("Tilt your phone to sculpt the timbre.");
        } else {
          setStatusMsg(
            "Tilt denied — drag the canvas, or watch the auto-demo.",
          );
        }
      } catch {
        setStatusMsg("Tilt unavailable — drag the canvas to sculpt.");
      }
    } else if (
      typeof window !== "undefined" &&
      "DeviceOrientationEvent" in window
    ) {
      window.addEventListener("deviceorientation", onOrient);
      setStatusMsg(
        "Drag the canvas, or tilt if your device has a gyroscope.",
      );
    } else {
      setStatusMsg("No gyroscope — drag the canvas to sculpt the timbre.");
    }

    // start arpeggio
    const STEP_MS = 420;
    arpTimerRef.current = window.setInterval(triggerArp, STEP_MS);
    triggerArp();
  }, [started, buildVoice, triggerArp, onOrient]);

  /* ── set up renderer + animation loop after start ─────────────────── */
  useEffect(() => {
    if (!started) return;
    const glCanvas = glCanvasRef.current;
    const overlay = overlayRef.current;
    const wrap = wrapRef.current;
    if (!glCanvas || !overlay || !wrap) return;

    let renderer: Renderer | null = makeWebGLRenderer(glCanvas, overlay);
    if (!renderer) {
      // fallback: draw everything on the overlay canvas with Canvas2D
      renderer = makeCanvas2DRenderer(overlay);
    }
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

    wrap.addEventListener("pointerdown", onPointer);
    wrap.addEventListener("pointermove", onPointerMove);

    const analyser = analyserRef.current;
    const bins = analyser ? analyser.frequencyBinCount : 1024;
    const freqData = new Float32Array(bins);
    // we only visualise the lower ~half of bins (audible partial detail)
    const VIS_BINS = 160;
    const spectrum = new Float32Array(VIS_BINS);

    const loop = () => {
      const now = performance.now();
      const t = (now - startTimeRef.current) / 1000;

      // auto-demo: if no human input for >2s, LFO-sweep the timbre
      const idle = now - lastInputRef.current > 2000;
      if (idle) {
        if (sensor !== "auto") setSensor("auto");
        targetRef.current = {
          ratio: 0.5 + 0.45 * Math.sin(t * 0.21),
          index: 0.5 + 0.42 * Math.sin(t * 0.13 + 1.7),
        };
      }

      // ease current → target
      const cur = currentRef.current;
      const tgt = targetRef.current;
      cur.index += (tgt.index - cur.index) * SMOOTH;
      cur.ratio += (tgt.ratio - cur.ratio) * SMOOTH;
      applyTimbre();

      // pull spectrum
      if (analyser) {
        analyser.getFloatFrequencyData(freqData);
        for (let i = 0; i < VIS_BINS; i++) {
          // map -100..-20 dB → 0..1
          const db = freqData[i];
          spectrum[i] = Math.min(1, Math.max(0, (db + 100) / 80));
        }
      }

      rendererRef.current?.draw({
        spectrum,
        algorithm: algoRef.current,
        index: cur.index,
        ratio: cur.ratio,
        ratioValue: snapRatio(cur.ratio),
        time: t,
      });
      rafRef.current = requestAnimationFrame(loop);
    };

    function onPointerMove(e: PointerEvent) {
      if (e.buttons > 0) onPointer(e);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      wrap.removeEventListener("pointerdown", onPointer);
      wrap.removeEventListener("pointermove", onPointerMove);
      renderer?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, onPointer, applyTimbre]);

  /* ── teardown on unmount ──────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (arpTimerRef.current) clearInterval(arpTimerRef.current);
      window.removeEventListener("deviceorientation", onOrient);
      voicesRef.current.forEach((v) => {
        try {
          v.carrier.stop();
          v.mod.stop();
        } catch {
          /* already stopped */
        }
        v.carrier.disconnect();
        v.mod.disconnect();
        v.modGain.disconnect();
        v.amp.disconnect();
      });
      voicesRef.current = [];
      const ac = acRef.current;
      if (ac && ac.state !== "closed") void ac.close();
      acRef.current = null;
    };
  }, [onOrient]);

  const sensorLabel =
    sensor === "tilt"
      ? "gyroscope"
      : sensor === "pointer"
        ? "pointer-drag"
        : "auto-demo (idle)";

  return (
    <main className="min-h-screen bg-black text-foreground">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          FM Aurora
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Tilt your phone through a 2-D timbre space to sculpt a 6-operator
          FM synth, and watch the spectrum bloom with sidebands as you move.
        </p>

        {/* canvas stage */}
        <div
          ref={wrapRef}
          className="relative mt-5 aspect-[4/5] w-full touch-none overflow-hidden rounded-2xl border border-border bg-[#03040a] sm:aspect-video"
        >
          {/* WebGL aurora wash (behind) */}
          <canvas
            ref={glCanvasRef}
            className="absolute inset-0 h-full w-full"
          />
          {/* Canvas2D overlay: spectrum + operator graph (front) */}
          <canvas
            ref={overlayRef}
            className="absolute inset-0 h-full w-full"
          />

          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/40 backdrop-blur-[1px]">
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-full bg-gradient-to-r from-violet-400 to-violet-500 px-8 py-2.5 text-base font-semibold text-black shadow-lg transition hover:brightness-110"
              >
                Start
              </button>
              <p className="px-6 text-center text-base text-muted-foreground">
                Sound + visuals begin on tap.
              </p>
            </div>
          )}
        </div>

        {/* status + sensor readout */}
        <p className="mt-3 text-base text-violet-300">
          {statusMsg}
        </p>
        {started && (
          <p className="mt-1 text-base text-muted-foreground">
            input:{" "}
            <span className="text-foreground">{sensorLabel}</span>
            {renderMode === "canvas2d" && (
              <span className="ml-2 text-violet-300">
                WebGL2 unavailable — using Canvas2D fallback.
              </span>
            )}
            {renderMode === "" && started && (
              <span className="ml-2 text-violet-300">
                No canvas context available.
              </span>
            )}
          </p>
        )}

        {/* algorithm selector */}
        {started && (
          <div className="mt-4 flex flex-wrap gap-2">
            {ALGORITHMS.map((a, i) => (
              <button
                key={a.id}
                onClick={() => setAlgoIdx(i)}
                className={`min-h-[44px] rounded-lg px-4 py-2.5 text-base font-medium transition ${
                  algoIdx === i
                    ? "bg-violet-400/90 text-black"
                    : "bg-muted text-foreground hover:bg-accent"
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {/* design notes affordance */}
        <button
          onClick={() => setShowNotes((s) => !s)}
          className="mt-5 text-base text-violet-300 underline underline-offset-4 hover:text-violet-200"
        >
          {showNotes ? "Hide design notes" : "Read the design notes"}
        </button>
        {showNotes && (
          <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted p-4 text-base text-muted-foreground">
            <p>
              FM synthesis (Chowning, JAES 1973): one oscillator&apos;s
              output modulates another&apos;s frequency, generating sidebands
              at <span className="text-foreground">fc ± k·fm</span> whose
              amplitudes follow Bessel functions. Raising the modulation
              index pours energy into higher sidebands — the spectrum
              &quot;blooms.&quot;
            </p>
            <p>
              The Yamaha DX7 (1983) wired 6 operators into 32 fixed
              &quot;algorithms.&quot; Here, three routings are selectable; the
              orbiting nodes are operators and the pulsing links are
              modulation paths. Full notes live in{" "}
              <span className="text-foreground">README.md</span> beside this
              prototype.
            </p>
          </div>
        )}

        <PrototypeNav slugs={["1011-fm-aurora"]} />
      </div>
    </main>
  );
}
