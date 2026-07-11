"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Six-band colors matching 1-live
const BAND_COLORS: ReadonlyArray<[number, number, number]> = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

const PRESETS = [
  { label: "Forest Dawn", tags: "ambient piano, reverb, forest, 60 BPM, meditative, gentle" },
  { label: "Stone Chamber", tags: "single chord, long stone reverb, ancient, sparse piano, contemplative" },
  { label: "Cosmic Drift", tags: "space ambient, synth pads, deep reverb, 70 BPM, ethereal, vast" },
  { label: "Jazz Sketch", tags: "jazz piano trio, upright bass, brush drums, 90 BPM, warm, intimate" },
  { label: "Ocean Breath", tags: "ambient waves, peaceful, 50 BPM, guitar, meditative, expansive" },
];

// Discriminated union — TypeScript can narrow by phase
type GenState =
  | { phase: "idle" }
  | { phase: "generating"; startMs: number }
  | { phase: "done"; url: string; durationMs: number; peaks: number[] }
  | { phase: "error"; errorMsg: string };

// ── Audio helpers ─────────────────────────────────────────────────────

function buildPeaks(buf: AudioBuffer, bins: number): number[] {
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / bins));
  const out: number[] = [];
  for (let i = 0; i < bins; i++) {
    let peak = 0;
    const end = Math.min(data.length, (i + 1) * step);
    for (let j = i * step; j < end; j++) {
      const v = Math.abs(data[j]);
      if (v > peak) peak = v;
    }
    out.push(peak);
  }
  return out;
}

function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  r: number,
  g: number,
  b: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.scale(dpr, dpr);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const barW = W / peaks.length;
  const cy = H / 2;
  const halfH = H * 0.45;
  for (let i = 0; i < peaks.length; i++) {
    const h = Math.max(1, peaks[i] * halfH);
    ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
    ctx.fillRect(i * barW, cy - h, Math.max(1, barW - 1), h * 2);
  }
}

function runBloom(
  analyser: AnalyserNode,
  canvas: HTMLCanvasElement,
  animRef: { current: number }
) {
  const ctxMaybe = canvas.getContext("2d");
  if (!ctxMaybe) return;
  const ctx = ctxMaybe;
  const fdata = new Uint8Array(analyser.frequencyBinCount);

  function tick() {
    animRef.current = requestAnimationFrame(tick);
    analyser.getByteFrequencyData(fdata);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      ctx.scale(dpr, dpr);
    }
    const W = cw;
    const H = ch;
    const cx = W / 2;
    const cy = H / 2;

    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, W, H);

    const binPerBand = Math.floor(fdata.length / 6);
    ctx.globalCompositeOperation = "lighter";
    for (let b = 0; b < 6; b++) {
      let sum = 0;
      for (let i = b * binPerBand; i < (b + 1) * binPerBand; i++) sum += fdata[i];
      const energy = sum / (binPerBand * 255);
      const [r, g, bl] = BAND_COLORS[b];
      const maxR = Math.min(cx, cy) * (0.25 + 0.75 * (1 - b / 6));
      const radius = Math.max(4, maxR * energy);
      const alpha = 0.12 + energy * 0.55;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grad.addColorStop(0, `rgba(${r},${g},${bl},${alpha})`);
      grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
  }
  tick();
}

// ── Component ─────────────────────────────────────────────────────────

export default function CassetteSpeed() {
  const [tags, setTags] = useState(PRESETS[0].tags);
  const [cassette, setCassette] = useState<GenState>({ phase: "idle" });
  const [ace, setAce] = useState<GenState>({ phase: "idle" });
  const [cassetteElapsed, setCassetteElapsed] = useState(0);
  const [aceElapsed, setAceElapsed] = useState(0);
  const [nowPlaying, setNowPlaying] = useState<"cassette" | "ace" | null>(null);

  const actxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bloomRef = useRef<HTMLCanvasElement | null>(null);
  const waveRef = useRef<{ cassette: HTMLCanvasElement | null; ace: HTMLCanvasElement | null }>({
    cassette: null,
    ace: null,
  });
  const animRef = useRef(0);
  const audioBufs = useRef<{ cassette: AudioBuffer | null; ace: AudioBuffer | null }>({
    cassette: null,
    ace: null,
  });

  // Draw waveforms once audio is decoded
  useEffect(() => {
    if (cassette.phase !== "done") return;
    const canvas = waveRef.current.cassette;
    if (canvas) drawWaveform(canvas, cassette.peaks, 200, 80, 220);
  }, [cassette]);

  useEffect(() => {
    if (ace.phase !== "done") return;
    const canvas = waveRef.current.ace;
    if (canvas) drawWaveform(canvas, ace.peaks, 32, 168, 220);
  }, [ace]);

  // Bloom animation while a track plays
  useEffect(() => {
    cancelAnimationFrame(animRef.current);
    if (!nowPlaying || !analyserRef.current || !bloomRef.current) return;
    runBloom(analyserRef.current, bloomRef.current, animRef);
    return () => cancelAnimationFrame(animRef.current);
  }, [nowPlaying]);

  function stopTrack() {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        // already stopped
      }
      sourceRef.current = null;
    }
    cancelAnimationFrame(animRef.current);
    setNowPlaying(null);
  }

  function playTrack(backend: "cassette" | "ace") {
    const buf = audioBufs.current[backend];
    if (!buf || !actxRef.current) return;
    const actx = actxRef.current;

    stopTrack();

    if (!analyserRef.current) {
      const a = actx.createAnalyser();
      a.fftSize = 256;
      a.connect(actx.destination);
      analyserRef.current = a;
    }

    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(analyserRef.current);
    src.start();
    src.onended = () => setNowPlaying(null);
    sourceRef.current = src;
    setNowPlaying(backend);
  }

  function generate() {
    if (cassette.phase === "generating" || ace.phase === "generating") return;

    if (!actxRef.current) actxRef.current = new AudioContext();
    const actx = actxRef.current;

    stopTrack();
    audioBufs.current = { cassette: null, ace: null };
    setCassette({ phase: "idle" });
    setAce({ phase: "idle" });

    async function runBackend(backend: "cassette" | "ace") {
      const t0 = Date.now();
      if (backend === "cassette") {
        setCassette({ phase: "generating", startMs: t0 });
        setCassetteElapsed(0);
      } else {
        setAce({ phase: "generating", startMs: t0 });
        setAceElapsed(0);
      }

      const timer = setInterval(() => {
        if (backend === "cassette") setCassetteElapsed(Date.now() - t0);
        else setAceElapsed(Date.now() - t0);
      }, 100);

      try {
        const res = await fetch("/dream/81-cassette-speed/api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ backend, tags }),
        });
        const durationMs = Date.now() - t0;
        clearInterval(timer);

        if (!res.ok) {
          const txt = await res.text();
          if (backend === "cassette")
            setCassette({ phase: "error", errorMsg: txt.slice(0, 400) });
          else setAce({ phase: "error", errorMsg: txt.slice(0, 400) });
          return;
        }

        const data = (await res.json()) as { url?: string; error?: string };
        if (!data.url) {
          const msg = data.error ?? "no audio URL in response";
          if (backend === "cassette") setCassette({ phase: "error", errorMsg: msg });
          else setAce({ phase: "error", errorMsg: msg });
          return;
        }

        const arrayBuf = await fetch(data.url).then((r) => r.arrayBuffer());
        const audioBuf = await actx.decodeAudioData(arrayBuf);
        audioBufs.current[backend] = audioBuf;
        const peaks = buildPeaks(audioBuf, 200);

        if (backend === "cassette")
          setCassette({ phase: "done", url: data.url, durationMs, peaks });
        else setAce({ phase: "done", url: data.url, durationMs, peaks });
      } catch (err) {
        clearInterval(timer);
        const msg = String(err);
        if (backend === "cassette") setCassette({ phase: "error", errorMsg: msg });
        else setAce({ phase: "error", errorMsg: msg });
      }
    }

    void runBackend("cassette");
    void runBackend("ace");
  }

  const isGenerating =
    cassette.phase === "generating" || ace.phase === "generating";
  const bothDone = cassette.phase === "done" && ace.phase === "done";

  function fmtMs(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  return (
    <div className="min-h-screen bg-black text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Nav */}
        <Link
          href="/dream"
          className="text-muted-foreground text-sm hover:text-foreground transition-colors"
        >
          ← Dream Lab
        </Link>

        {/* Header */}
        <div className="mt-5 mb-8">
          <h1 className="text-2xl font-mono tracking-tight">Cassette vs ACE-Step</h1>
          <p className="text-muted-foreground mt-2 text-base leading-relaxed">
            Same prompt · two backends · fired simultaneously. CassetteAI targets ~2s.
            ACE-Step targets ~20–40s. Is the quality difference worth the wait?
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            CassetteAI $0.02/min · ACE-Step $0.012/min · FAL_KEY
          </p>
        </div>

        {/* Prompt input */}
        <div className="mb-6">
          <label className="block text-muted-foreground text-sm mb-2">Style tags</label>
          <textarea
            className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-base text-foreground placeholder-muted-foreground focus:outline-none focus:border-border resize-none"
            rows={2}
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="ambient piano, forest, 60 BPM, meditative…"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setTags(p.tags)}
                className="text-sm px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={isGenerating}
          className="w-full mb-8 py-3 px-6 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-foreground font-mono text-base transition-colors min-h-[44px]"
        >
          {isGenerating ? "Generating…" : "▶ Generate Both"}
        </button>

        {/* Side-by-side comparison panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Cassette panel */}
          <div className="bg-muted border border-border rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-mono text-base text-violet-300">CassetteAI</div>
                <div className="text-muted-foreground text-sm">speed-optimized · ~2s</div>
              </div>
              <span className="text-xs text-muted-foreground/70 font-mono mt-1">$0.02/min</span>
            </div>

            {/* Status line */}
            <div className="mb-3 font-mono text-sm" style={{ minHeight: "1.25rem" }}>
              {cassette.phase === "idle" && (
                <span className="text-muted-foreground/70">ready</span>
              )}
              {cassette.phase === "generating" && (
                <span className="text-violet-300">
                  ⟳ {fmtMs(cassetteElapsed)}…
                </span>
              )}
              {cassette.phase === "done" && (
                <span className="text-violet-300">
                  ✓ {fmtMs(cassette.durationMs)}
                </span>
              )}
              {cassette.phase === "error" && (
                <span className="text-violet-300">✗ error</span>
              )}
            </div>

            {/* Waveform area */}
            <div
              className="relative rounded overflow-hidden"
              style={{ height: 64, background: "rgba(0,0,0,0.5)" }}
            >
              {cassette.phase === "generating" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-violet-300/50 text-xs font-mono animate-pulse">
                    generating…
                  </div>
                </div>
              )}
              {cassette.phase === "error" && (
                <div className="absolute inset-0 p-2 overflow-hidden">
                  <span className="text-violet-300 text-xs">
                    {cassette.errorMsg}
                  </span>
                </div>
              )}
              <canvas
                ref={(el) => {
                  waveRef.current.cassette = el;
                }}
                className="w-full h-full"
                style={{
                  display: cassette.phase === "done" ? "block" : "none",
                }}
              />
            </div>

            {/* Playback controls */}
            {cassette.phase === "done" && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() =>
                    nowPlaying === "cassette"
                      ? stopTrack()
                      : playTrack("cassette")
                  }
                  className="flex-1 py-2 px-3 bg-violet-600/30 hover:bg-violet-600/50 rounded text-violet-300 font-mono text-sm transition-colors min-h-[36px]"
                >
                  {nowPlaying === "cassette" ? "■ stop" : "▶ play"}
                </button>
                <a
                  href={cassette.url}
                  download="cassette.mp3"
                  className="py-2 px-3 bg-muted hover:bg-accent rounded text-muted-foreground text-sm transition-colors flex items-center"
                >
                  ⬇
                </a>
              </div>
            )}
          </div>

          {/* ACE-Step panel */}
          <div className="bg-muted border border-border rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-mono text-base text-violet-300">ACE-Step</div>
                <div className="text-muted-foreground text-sm">quality-optimized · ~20–40s</div>
              </div>
              <span className="text-xs text-muted-foreground/70 font-mono mt-1">$0.012/min</span>
            </div>

            {/* Status line */}
            <div className="mb-3 font-mono text-sm" style={{ minHeight: "1.25rem" }}>
              {ace.phase === "idle" && (
                <span className="text-muted-foreground/70">ready</span>
              )}
              {ace.phase === "generating" && (
                <span className="text-violet-300">
                  ⟳ {fmtMs(aceElapsed)}…
                </span>
              )}
              {ace.phase === "done" && (
                <span className="text-violet-300">✓ {fmtMs(ace.durationMs)}</span>
              )}
              {ace.phase === "error" && (
                <span className="text-violet-300">✗ error</span>
              )}
            </div>

            {/* Waveform area */}
            <div
              className="relative rounded overflow-hidden"
              style={{ height: 64, background: "rgba(0,0,0,0.5)" }}
            >
              {ace.phase === "generating" && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-violet-300/50 text-xs font-mono animate-pulse">
                    generating…
                  </div>
                </div>
              )}
              {ace.phase === "error" && (
                <div className="absolute inset-0 p-2 overflow-hidden">
                  <span className="text-violet-300 text-xs">{ace.errorMsg}</span>
                </div>
              )}
              <canvas
                ref={(el) => {
                  waveRef.current.ace = el;
                }}
                className="w-full h-full"
                style={{
                  display: ace.phase === "done" ? "block" : "none",
                }}
              />
            </div>

            {/* Playback controls */}
            {ace.phase === "done" && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() =>
                    nowPlaying === "ace" ? stopTrack() : playTrack("ace")
                  }
                  className="flex-1 py-2 px-3 bg-violet-600/30 hover:bg-violet-600/50 rounded text-violet-300 font-mono text-sm transition-colors min-h-[36px]"
                >
                  {nowPlaying === "ace" ? "■ stop" : "▶ play"}
                </button>
                <a
                  href={ace.url}
                  download="ace-step.mp3"
                  className="py-2 px-3 bg-muted hover:bg-accent rounded text-muted-foreground text-sm transition-colors flex items-center"
                >
                  ⬇
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Six-band bloom visualizer during playback */}
        {nowPlaying && (
          <div
            className="mb-6 rounded-xl overflow-hidden"
            style={{ height: 200 }}
          >
            <canvas
              ref={bloomRef}
              className="w-full h-full"
              style={{ background: "#000" }}
            />
          </div>
        )}

        {/* Speed comparison summary */}
        {bothDone && cassette.phase === "done" && ace.phase === "done" && (
          <div className="bg-muted border border-border rounded-xl p-4 mb-8 text-sm text-muted-foreground leading-relaxed">
            <div className="font-mono text-foreground text-base mb-2">
              Speed comparison
            </div>
            {(() => {
              const cMs = cassette.durationMs;
              const aMs = ace.durationMs;
              const fasterName = cMs < aMs ? "CassetteAI" : "ACE-Step";
              const ratio = (Math.max(cMs, aMs) / Math.min(cMs, aMs)).toFixed(
                1
              );
              return (
                <>
                  <p>
                    <span className="text-foreground">{fasterName}</span> was{" "}
                    {ratio}× faster ({fmtMs(cMs)} vs {fmtMs(aMs)}).
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Play both and decide if the quality difference justifies
                    the wait. If CassetteAI sounds good enough, it could
                    replace ACE-Step in{" "}
                    <Link
                      href="/dream/6-compose"
                      className="text-muted-foreground hover:text-foreground underline"
                    >
                      /dream/6-compose
                    </Link>{" "}
                    for faster iteration loops.
                  </p>
                </>
              );
            })()}
          </div>
        )}

        {/* Footer notes */}
        <div className="text-muted-foreground/70 text-xs leading-relaxed border-t border-border pt-6 space-y-1">
          <p>
            CassetteAI — lightweight distilled model, ~2s generation, $0.02/min.
            Trade-off: speed over fidelity.
          </p>
          <p>
            ACE-Step — full diffusion model, ~20–40s, $0.006/30s ($0.012/min).
            Better style adherence and musical detail.
          </p>
          <p>
            Both receive identical style tags +{" "}
            <code className="text-muted-foreground">[inst]</code> for instrumental
            output. 30s clips.
          </p>
          <p className="mt-2">
            ⚠ CassetteAI endpoint{" "}
            <code className="text-muted-foreground">cassetteai/music-generator</code>{" "}
            uses best-guess parameter names — paste any API error for a fix
            next cycle.
          </p>
        </div>
      </div>
    </div>
  );
}
