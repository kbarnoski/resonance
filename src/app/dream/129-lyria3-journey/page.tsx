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

const SCENES = [
  {
    name: "Stone Chamber",
    dot: "#a78bfa",
    prompt:
      "ambient score, single reverbed piano chord, stone cave acoustics, 35 BPM, long silence between phrases, eerie low rumble drone, no percussion",
  },
  {
    name: "Root Portal",
    dot: "#d97706",
    prompt:
      "earth bass drone, shamanic drum pulse, descending bass line, 50 BPM, dark organic resonance, ancient forest depth",
  },
  {
    name: "Underground Pool",
    dot: "#22d3ee",
    prompt:
      "cave reverb, crystalline water harmonics, ethereal voice drone, 45 BPM, mysterious subterranean calm, no percussion",
  },
  {
    name: "Tiny Planet",
    dot: "#34d399",
    prompt:
      "music box melody, pentatonic wonder, open sky, childlike delight, 75 BPM, light and bright, no bass",
  },
  {
    name: "Forest Dawn",
    dot: "#86efac",
    prompt:
      "solo piano, ascending major phrases, warm reverb, morning hope, 55 BPM, gentle dawn ambience",
  },
  {
    name: "Cosmic Ascension",
    dot: "#f9a8d4",
    prompt:
      "orchestral strings ascending, triumphant major resolution, cosmic transcendence, 90 BPM, celestial shimmer and glow",
  },
] as const;

type SceneStatus = "idle" | "generating" | "ready" | "playing" | "error";

const STATUS_LABEL: Record<SceneStatus, string> = {
  idle: "—",
  generating: "generating…",
  ready: "ready",
  playing: "▶",
  error: "error",
};

const STATUS_COLOR: Record<SceneStatus, string> = {
  idle: "text-muted-foreground/70",
  generating: "text-violet-300/95",
  ready: "text-violet-300/95",
  playing: "text-violet-300",
  error: "text-violet-300",
};

export default function Lyria3JourneyPage() {
  const [prompts, setPrompts] = useState<string[]>(() => SCENES.map((s) => s.prompt));
  const [statuses, setStatuses] = useState<SceneStatus[]>(() =>
    SCENES.map((): SceneStatus => "idle")
  );
  const [errorMsgs, setErrorMsgs] = useState<string[]>(() => SCENES.map(() => ""));
  const [activeScene, setActiveScene] = useState(-1);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomRafRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const buffersRef = useRef<(AudioBuffer | null)[]>(SCENES.map(() => null));
  const bpmsRef = useRef<(number | null)[]>(SCENES.map(() => null));
  const promptsRef = useRef(prompts);
  const stopPlayRef = useRef(false);

  useEffect(() => {
    promptsRef.current = prompts;
  }, [prompts]);

  useEffect(() => {
    if (activeScene < 0) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [activeScene]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(bloomRafRef.current);
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    } else if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }

  function setSceneStatus(idx: number, s: SceneStatus) {
    setStatuses((prev) => {
      const next = [...prev] as SceneStatus[];
      next[idx] = s;
      return next;
    });
  }

  function setSceneError(idx: number, msg: string) {
    setErrorMsgs((prev) => {
      const next = [...prev];
      next[idx] = msg;
      return next;
    });
  }

  function drawBloom(analyser: AnalyserNode) {
    const canvas = canvasRef.current;
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

  function clearBloom() {
    cancelAnimationFrame(bloomRafRef.current);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  async function generateScene(idx: number) {
    setSceneStatus(idx, "generating");
    setSceneError(idx, "");

    try {
      const res = await fetch("/dream/129-lyria3-journey/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptsRef.current[idx],
          seed: Math.floor(Math.random() * 100000),
        }),
      });
      const data = (await res.json()) as { url?: string; bpm?: number; error?: string };
      if (!data.url) throw new Error(data.error ?? "No audio URL returned");

      const actx = getAudioCtx();
      const ab = await fetch(data.url).then((r) => r.arrayBuffer());
      const buffer = await actx.decodeAudioData(ab);

      buffersRef.current[idx] = buffer;
      bpmsRef.current[idx] = data.bpm ?? null;
      setSceneStatus(idx, "ready");
    } catch (err) {
      setSceneStatus(idx, "error");
      setSceneError(idx, String(err));
    }
  }

  function playScene(idx: number) {
    const buf = buffersRef.current[idx];
    if (!buf) return;

    stopPlayRef.current = true;
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
    }
    clearBloom();
    setStatuses((prev) => prev.map((s) => (s === "playing" ? "ready" : s)) as SceneStatus[]);
    stopPlayRef.current = false;

    setActiveScene(idx);
    setElapsed(0);
    setDuration(Math.round(buf.duration));
    setSceneStatus(idx, "playing");

    const actx = getAudioCtx();
    let analyser = analyserRef.current;
    if (!analyser) {
      analyser = actx.createAnalyser();
      analyser.fftSize = 1024;
      analyserRef.current = analyser;
    }
    drawBloom(analyser);

    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(analyser);
    analyser.connect(actx.destination);
    src.start(0);
    sourceRef.current = src;

    src.onended = () => {
      sourceRef.current = null;
      if (!stopPlayRef.current) {
        setActiveScene(-1);
        setSceneStatus(idx, "ready");
        clearBloom();
      }
    };
  }

  function stopPlayback() {
    stopPlayRef.current = true;
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* ok */
      }
      sourceRef.current = null;
    }
    setActiveScene(-1);
    setStatuses((prev) => prev.map((s) => (s === "playing" ? "ready" : s)) as SceneStatus[]);
    clearBloom();
  }

  return (
    <div className="min-h-screen bg-black text-foreground flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-mono font-semibold tracking-tight">Ghost Scenes</h1>
            <p className="text-base text-muted-foreground mt-1 max-w-lg">
              Six scenes from the Ghost journey — each realized as 30 s of Lyria 3 ambient music.
              Generate any scene, then play.
            </p>
          </div>
          <Link
            href="/dream"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
          >
            ← dream lab
          </Link>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Scene list */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 overflow-y-auto border-b lg:border-b-0 lg:border-r border-border">
          <div className="p-3 space-y-2">
            {SCENES.map((scene, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 pt-2.5 pb-2 transition-colors ${
                  activeScene === i
                    ? "border-violet-500/50 bg-violet-950/40"
                    : statuses[i] === "ready"
                    ? "border-border bg-muted"
                    : "border-border bg-muted"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: scene.dot }}
                  />
                  <span className="text-sm font-semibold text-foreground flex-1 leading-tight">
                    {scene.name}
                  </span>
                  <span className={`text-xs font-mono shrink-0 ${STATUS_COLOR[statuses[i]]}`}>
                    {STATUS_LABEL[statuses[i]]}
                  </span>
                </div>

                <textarea
                  value={prompts[i]}
                  onChange={(e) => {
                    if (statuses[i] === "generating" || statuses[i] === "playing") return;
                    const next = [...prompts];
                    next[i] = e.target.value;
                    setPrompts(next);
                  }}
                  disabled={statuses[i] === "generating" || statuses[i] === "playing"}
                  rows={2}
                  className="w-full bg-transparent text-xs text-muted-foreground resize-none outline-none leading-relaxed font-mono mb-2"
                />

                {errorMsgs[i] && (
                  <p className="text-xs text-violet-300 mb-2 leading-relaxed">{errorMsgs[i]}</p>
                )}

                <div className="flex gap-1.5">
                  {statuses[i] === "idle" || statuses[i] === "error" ? (
                    <button
                      onClick={() => generateScene(i)}
                      className="flex-1 px-3 py-1.5 text-xs bg-muted hover:bg-accent rounded-md text-foreground transition-colors min-h-[32px]"
                    >
                      Generate
                    </button>
                  ) : statuses[i] === "generating" ? (
                    <div className="flex-1 text-center py-1.5">
                      <span className="text-xs text-violet-300/95 animate-pulse">
                        generating…
                      </span>
                    </div>
                  ) : (
                    <>
                      {statuses[i] === "playing" ? (
                        <button
                          onClick={stopPlayback}
                          className="flex-1 px-3 py-1.5 text-xs bg-violet-600/25 hover:bg-violet-600/40 rounded-md text-violet-300 transition-colors min-h-[32px]"
                        >
                          ■ Stop
                        </button>
                      ) : (
                        <button
                          onClick={() => playScene(i)}
                          className="flex-1 px-3 py-1.5 text-xs bg-muted hover:bg-accent rounded-md text-foreground transition-colors min-h-[32px]"
                        >
                          ▶ Play
                        </button>
                      )}
                      <button
                        onClick={() => generateScene(i)}
                        disabled={statuses[i] === "playing"}
                        className="px-2.5 py-1.5 text-xs bg-muted hover:bg-accent rounded-md text-muted-foreground transition-colors min-h-[32px] disabled:opacity-30"
                        title="Generate variation"
                      >
                        ↺
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bloom canvas + playback info */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 relative bg-black min-h-[240px]">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

            {activeScene >= 0 ? (
              <div className="absolute bottom-4 inset-x-0 text-center pointer-events-none">
                <span className="text-sm font-mono text-muted-foreground">
                  {SCENES[activeScene].name} ·{" "}
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                  {duration > 0 && (
                    <>
                      {" / "}
                      {Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}
                    </>
                  )}
                  {bpmsRef.current[activeScene] != null && (
                    <span className="text-muted-foreground/70 ml-3">
                      {bpmsRef.current[activeScene]} BPM
                    </span>
                  )}
                </span>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <p className="text-muted-foreground/70 text-sm text-center px-4 max-w-xs leading-relaxed">
                  Generate a scene, then play — Lyria 3 interprets the Ghost journey
                </p>
              </div>
            )}
          </div>

          {/* Scene progress strip */}
          <div className="px-4 py-3 border-t border-border">
            <div className="flex gap-1.5 mb-1.5">
              {SCENES.map((scene, i) => (
                <div key={i} className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      backgroundColor:
                        statuses[i] === "playing"
                          ? scene.dot
                          : statuses[i] === "ready"
                          ? scene.dot + "80"
                          : statuses[i] === "generating"
                          ? scene.dot + "40"
                          : "transparent",
                      width:
                        statuses[i] === "playing"
                          ? `${Math.min((elapsed / Math.max(duration, 1)) * 100, 100)}%`
                          : statuses[i] === "ready"
                          ? "100%"
                          : statuses[i] === "generating"
                          ? "10%"
                          : "0%",
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5">
              {SCENES.map((scene, i) => (
                <div key={i} className="flex-1 text-center">
                  <span
                    className={`text-[10px] font-mono truncate block transition-colors ${
                      activeScene === i ? "text-muted-foreground" : "text-muted-foreground/70"
                    }`}
                  >
                    {scene.name.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
