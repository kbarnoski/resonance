"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";

const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

const PHASES = [
  {
    name: "Opening",
    numeral: "I",
    dot: "#a78bfa",
    prompt:
      "sparse piano, introspective, major key, vast reverb, slow 28 BPM, long silence between phrases",
  },
  {
    name: "Descent",
    numeral: "II",
    dot: "#93c5fd",
    prompt:
      "minor arpeggios, cello drone enters, suspended chords, tension building slowly, 55 BPM",
  },
  {
    name: "Awakening",
    numeral: "III",
    dot: "#67e8f9",
    prompt:
      "ethereal synth pads layering, harmonic widening, rising complexity, shimmering textures, 80 BPM",
  },
  {
    name: "Peak",
    numeral: "IV",
    dot: "#fcd34d",
    prompt:
      "full orchestral, triumphant major resolution, ecstatic climax, strings and brass, 112 BPM",
  },
  {
    name: "Integration",
    numeral: "V",
    dot: "#6ee7b7",
    prompt:
      "bittersweet descending, minor to major resolution, strings and piano fading, 70 BPM",
  },
  {
    name: "Return",
    numeral: "VI",
    dot: "#fda4af",
    prompt:
      "single piano alone, open fifth drone, vast spacious silence, gently fading to near-silence, 25 BPM",
  },
] as const;

type PhaseStatus = "idle" | "generating" | "ready" | "playing" | "done" | "error";

const STATUS_LABEL: Record<PhaseStatus, string> = {
  idle: "—",
  generating: "generating…",
  ready: "ready",
  playing: "▶",
  done: "done",
  error: "error",
};

const STATUS_COLOR: Record<PhaseStatus, string> = {
  idle: "text-white/30",
  generating: "text-amber-300/95",
  ready: "text-cyan-300/95",
  playing: "text-violet-300",
  done: "text-white/50",
  error: "text-rose-300",
};

export default function ArcSteerPage() {
  const [prompts, setPrompts] = useState<string[]>(() => PHASES.map((p) => p.prompt));
  const [statuses, setStatuses] = useState<PhaseStatus[]>(() =>
    PHASES.map((): PhaseStatus => "idle")
  );
  const [activePhase, setActivePhase] = useState(-1);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const bloomRef = useRef<HTMLCanvasElement | null>(null);
  const bloomRafRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const stoppedRef = useRef(false);
  const promptsRef = useRef(prompts);

  useEffect(() => {
    promptsRef.current = prompts;
  }, [prompts]);

  // Elapsed timer per active phase
  useEffect(() => {
    if (activePhase < 0) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [activePhase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(bloomRafRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, []);

  function setPhaseStatus(idx: number, s: PhaseStatus) {
    setStatuses((prev) => {
      const next = [...prev] as PhaseStatus[];
      next[idx] = s;
      return next;
    });
  }

  function runBloom(analyser: AnalyserNode) {
    const canvas = bloomRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = canvas.offsetWidth;
    let h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);

    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      bloomRafRef.current = requestAnimationFrame(tick);

      if (canvas.offsetWidth !== w || canvas.offsetHeight !== h) {
        w = canvas.offsetWidth;
        h = canvas.offsetHeight;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        ctx.scale(dpr, dpr);
      }

      analyser.getByteFrequencyData(freqData);
      const binPer = Math.floor(freqData.length / 6);
      const bands = Array.from({ length: 6 }, (_, b) => {
        let s = 0;
        for (let j = b * binPer; j < (b + 1) * binPer; j++) s += freqData[j] ?? 0;
        return s / binPer / 255;
      });

      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const base = Math.min(w, h) * 0.1;
      const maxR = Math.min(w, h) * 0.42;

      ctx.globalCompositeOperation = "lighter";
      for (let b = 0; b < 6; b++) {
        const e = bands[b];
        if (e < 0.01) continue;
        const r = base + e * maxR;
        const angle = (b / 6) * Math.PI * 2 - Math.PI / 2;
        const [cr, cg, cb] = BAND_COLORS[b];
        const gx = cx + Math.cos(angle) * r * 0.28;
        const gy = cy + Math.sin(angle) * r * 0.28;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.6 * e + 0.04})`);
        grad.addColorStop(0.55, `rgba(${cr},${cg},${cb},${0.25 * e})`);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.beginPath();
        ctx.arc(gx, gy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };
    tick();
  }

  function stopBloom() {
    cancelAnimationFrame(bloomRafRef.current);
    const canvas = bloomRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  async function playBuffer(
    buffer: AudioBuffer,
    analyser: AnalyserNode,
    ctx: AudioContext
  ): Promise<void> {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
    }
    return new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      src.start(0);
      sourceRef.current = src;
      src.onended = () => {
        sourceRef.current = null;
        resolve();
      };
    });
  }

  async function fetchPhaseAudio(idx: number): Promise<string> {
    const res = await fetch("/dream/126-arc-steer/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: promptsRef.current[idx], duration: 30 }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!data.url) throw new Error(data.error ?? "No audio URL");
    return data.url;
  }

  const handleBeginJourney = async () => {
    stoppedRef.current = false;
    setRunning(true);
    setComplete(false);
    setErrorMsg("");
    setActivePhase(-1);
    setElapsed(0);
    setStatuses(PHASES.map((): PhaseStatus => "idle"));

    const actx = new AudioContext();
    audioCtxRef.current = actx;
    const analyser = actx.createAnalyser();
    analyser.fftSize = 1024;
    analyserRef.current = analyser;
    runBloom(analyser);

    for (let i = 0; i < PHASES.length; i++) {
      if (stoppedRef.current) break;

      setPhaseStatus(i, "generating");
      let url: string;
      try {
        url = await fetchPhaseAudio(i);
      } catch (err) {
        setPhaseStatus(i, "error");
        setErrorMsg(`${PHASES[i].name}: ${String(err)}`);
        break;
      }
      if (stoppedRef.current) break;

      setPhaseStatus(i, "ready");

      let buffer: AudioBuffer;
      try {
        const ab = await fetch(url).then((r) => r.arrayBuffer());
        buffer = await actx.decodeAudioData(ab);
      } catch (err) {
        setPhaseStatus(i, "error");
        setErrorMsg(`${PHASES[i].name} decode: ${String(err)}`);
        break;
      }
      if (stoppedRef.current) break;

      setPhaseStatus(i, "playing");
      setActivePhase(i);

      await playBuffer(buffer, analyser, actx);
      if (!stoppedRef.current) setPhaseStatus(i, "done");
    }

    if (!stoppedRef.current) setComplete(true);
    setRunning(false);
    setActivePhase(-1);
    stopBloom();
  };

  const handleStopJourney = () => {
    stoppedRef.current = true;
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setRunning(false);
    setActivePhase(-1);
    stopBloom();
  };

  const handleReset = () => {
    setStatuses(PHASES.map((): PhaseStatus => "idle"));
    setActivePhase(-1);
    setComplete(false);
    setErrorMsg("");
    setElapsed(0);
  };

  const activeIdx = activePhase;

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-mono font-semibold tracking-tight">Arc Steer</h1>
            <p className="text-base text-white/75 mt-1 max-w-lg">
              Six phases of a Resonance journey arc — each realized as 30 s of AI-generated
              music. Edit any prompt, then begin.
            </p>
          </div>
          <Link
            href="/dream"
            className="text-xs text-white/40 hover:text-white/70 transition-colors shrink-0 mt-1"
          >
            ← dream lab
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Phase list */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/10">
          <div className="p-3 space-y-2">
            {PHASES.map((phase, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 pt-2.5 pb-2 transition-colors ${
                  activeIdx === i
                    ? "border-violet-500/50 bg-violet-950/40"
                    : statuses[i] === "done"
                    ? "border-white/6 bg-white/[0.02] opacity-55"
                    : "border-white/8 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: phase.dot }}
                  />
                  <span className="text-[11px] text-white/40 font-mono w-6 shrink-0">
                    {phase.numeral}
                  </span>
                  <span className="text-sm font-semibold text-white/95 flex-1 leading-tight">
                    {phase.name}
                  </span>
                  <span
                    className={`text-xs font-mono shrink-0 ${STATUS_COLOR[statuses[i]]}`}
                  >
                    {STATUS_LABEL[statuses[i]]}
                  </span>
                </div>
                <textarea
                  value={prompts[i]}
                  onChange={(e) => {
                    if (running) return;
                    const next = [...prompts];
                    next[i] = e.target.value;
                    setPrompts(next);
                  }}
                  disabled={running}
                  rows={2}
                  className="w-full bg-transparent text-xs text-white/65 resize-none outline-none leading-relaxed font-mono"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Canvas + controls */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Bloom */}
          <div className="flex-1 relative bg-black min-h-[200px]">
            <canvas ref={bloomRef} className="absolute inset-0 w-full h-full" />

            {activeIdx >= 0 && (
              <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none">
                <span className="text-sm font-mono text-white/70">
                  {PHASES[activeIdx].name} ·{" "}
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} / 0:30
                </span>
              </div>
            )}

            {!running && activeIdx < 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-white/20 text-sm text-center px-4">
                  {complete
                    ? "Journey complete — reset to run again"
                    : "Six phases · ~3 minutes total · ACE‑Step"}
                </p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="px-5 py-4 border-t border-white/10 flex items-center gap-3 flex-wrap">
            {!running ? (
              <button
                onClick={handleBeginJourney}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 active:bg-violet-700 rounded-lg text-sm font-semibold text-white transition-colors min-h-[44px]"
              >
                ▶ Begin Journey
              </button>
            ) : (
              <button
                onClick={handleStopJourney}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/15 rounded-lg text-sm font-semibold text-white transition-colors min-h-[44px]"
              >
                ■ Stop
              </button>
            )}

            {complete && !running && (
              <button
                onClick={handleReset}
                className="px-4 py-2.5 bg-white/[0.07] hover:bg-white/10 rounded-lg text-sm text-white/75 transition-colors min-h-[44px]"
              >
                ↺ Reset
              </button>
            )}

            {errorMsg ? (
              <p className="text-rose-300 text-sm">{errorMsg}</p>
            ) : (
              <p className="text-xs text-white/35 ml-auto">
                6 × 30 s · ~$0.04 · FAL_KEY required
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Phase timeline */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex gap-1.5 mb-1.5">
          {PHASES.map((phase, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  backgroundColor:
                    statuses[i] === "done"
                      ? "rgba(255,255,255,0.28)"
                      : statuses[i] === "playing"
                      ? phase.dot
                      : statuses[i] === "ready"
                      ? phase.dot + "70"
                      : statuses[i] === "generating"
                      ? phase.dot + "50"
                      : "transparent",
                  width:
                    statuses[i] === "done"
                      ? "100%"
                      : statuses[i] === "playing"
                      ? `${Math.min((elapsed / 30) * 100, 100)}%`
                      : statuses[i] === "ready"
                      ? "25%"
                      : statuses[i] === "generating"
                      ? "10%"
                      : "0%",
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5">
          {PHASES.map((phase, i) => (
            <div key={i} className="flex-1 text-center">
              <span
                className={`text-[10px] font-mono transition-colors ${
                  activeIdx === i ? "text-white/70" : "text-white/30"
                }`}
              >
                {phase.numeral}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
