"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StemDef {
  label: string;
  key: "drums" | "bass" | "melody" | "other";
  color: string;
  az: number;   // azimuth degrees: 0=front, +90=right
  el: number;   // elevation degrees: 0=horizontal, positive=up
  dist: number; // listener distance in metres
  hint: string; // spatial description for UI
}

type StemStatus = "idle" | "decoding" | "ready" | "error";

interface StemUi {
  status: StemStatus;
  error: string;
  muted: boolean;
}

interface NodeGroup {
  src: AudioBufferSourceNode;
  pan: PannerNode;
  gain: GainNode;
}

// ── Stem positions + colors ───────────────────────────────────────────────────

const STEMS: StemDef[] = [
  { label: "Drums",  key: "drums",  color: "#8870d0", az: 0,   el: 60,  dist: 3,   hint: "above" },
  { label: "Bass",   key: "bass",   color: "#4090d0", az: 0,   el: -30, dist: 4,   hint: "below" },
  { label: "Melody", key: "melody", color: "#e09050", az: 30,  el: 10,  dist: 2.5, hint: "front-right" },
  { label: "Other",  key: "other",  color: "#50c0a0", az: -30, el: 0,   dist: 3,   hint: "front-left" },
];

const PRESETS = [
  {
    label: "Cinematic",
    value: "cinematic orchestral, cello quartet, 60 BPM, minor key, dramatic swells, dark ambient",
  },
  {
    label: "Jazz Trio",
    value: "jazz piano trio, upright bass, brush drums, warm acoustic, 90 BPM, swing feel",
  },
  {
    label: "Ambient",
    value: "ambient electronic, slow evolving pads, 65 BPM, contemplative, vast reverb, ethereal",
  },
  {
    label: "Folk",
    value: "acoustic folk, fingerpicked guitar, soft percussion, warm room, 80 BPM, pastoral",
  },
  {
    label: "Electronic",
    value: "electronic dance, synth bass, driving beat, 120 BPM, energetic, club atmosphere",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function sphericalToXYZ(azDeg: number, elDeg: number, distM: number): [number, number, number] {
  const a = (azDeg * Math.PI) / 180;
  const e = (elDeg * Math.PI) / 180;
  return [
    distM * Math.sin(a) * Math.cos(e),
    distM * Math.sin(e),
    -distM * Math.cos(a) * Math.cos(e),
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MaestroStemsPage() {
  const [prompt, setPrompt] = useState(PRESETS[0].value);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [rawResp, setRawResp] = useState("");
  const [stemUi, setStemUi] = useState<StemUi[]>(
    STEMS.map(() => ({ status: "idle", error: "", muted: false }))
  );
  const [stemMix, setStemMix] = useState<number[]>(STEMS.map(() => 1));
  const [playing, setPlaying] = useState(false);

  const ctxRef     = useRef<AudioContext | null>(null);
  const buffersRef = useRef<(AudioBuffer | null)[]>(STEMS.map(() => null));
  const nodeMapRef = useRef<Map<number, NodeGroup>>(new Map());
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);

  // ── Audio helpers ───────────────────────────────────────────────────────────

  const buildCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      ctxRef.current = new Ctx();
      ctxRef.current.listener.setPosition(0, 0, 0);
      ctxRef.current.listener.setOrientation(0, 0, -1, 0, 1, 0);
    }
    return ctxRef.current;
  }, []);

  const stopAll = useCallback(() => {
    nodeMapRef.current.forEach(({ src, pan, gain }) => {
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
      pan.disconnect();
      gain.disconnect();
    });
    nodeMapRef.current.clear();
    setPlaying(false);
  }, []);

  // ── Generate + decode ───────────────────────────────────────────────────────

  const generate = useCallback(async () => {
    if (!prompt.trim()) return;
    stopAll();
    setGenerating(true);
    setGenError("");
    setRawResp("");
    buffersRef.current = STEMS.map(() => null);
    setStemUi(STEMS.map(() => ({ status: "idle", error: "", muted: false })));

    try {
      const res = await fetch("/dream/54-maestro-stems/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json() as {
        trackUrl?: string;
        stems?: Record<string, string | undefined>;
        error?: string;
        raw?: string;
      };

      if (json.error) {
        throw new Error(json.raw ? `${json.error}\n\n${json.raw}` : json.error);
      }

      if (!json.stems) {
        throw new Error("Response missing stems object");
      }

      setRawResp(JSON.stringify(json, null, 2).slice(0, 600));

      const ctx = buildCtx();
      setStemUi(STEMS.map(() => ({ status: "decoding", error: "", muted: false })));

      await Promise.all(
        STEMS.map(async (stemDef, i) => {
          const url = json.stems?.[stemDef.key];
          if (!url) {
            setStemUi((prev) =>
              prev.map((s, j) =>
                j === i ? { ...s, status: "error", error: "No URL for this stem" } : s
              )
            );
            return;
          }
          try {
            const audioRes = await fetch(url);
            if (!audioRes.ok) throw new Error(`HTTP ${audioRes.status}`);
            const arrBuf = await audioRes.arrayBuffer();
            const buffer = await ctx.decodeAudioData(arrBuf);
            buffersRef.current[i] = buffer;
            setStemUi((prev) =>
              prev.map((s, j) => (j === i ? { ...s, status: "ready" } : s))
            );
          } catch (err) {
            buffersRef.current[i] = null;
            setStemUi((prev) =>
              prev.map((s, j) =>
                j === i ? { ...s, status: "error", error: String(err).slice(0, 200) } : s
              )
            );
          }
        })
      );
    } catch (err) {
      setGenError(String(err).slice(0, 600));
    } finally {
      setGenerating(false);
    }
  }, [prompt, stopAll, buildCtx]);

  // ── Playback ────────────────────────────────────────────────────────────────

  const startPlayback = useCallback(() => {
    const ctx = buildCtx();
    const newMap = new Map<number, NodeGroup>();

    STEMS.forEach((stemDef, i) => {
      const buf = buffersRef.current[i];
      if (!buf) return;

      const pan = ctx.createPanner();
      pan.panningModel = "HRTF";
      pan.distanceModel = "inverse";
      pan.refDistance = 1;
      pan.maxDistance = 10;
      const [x, y, z] = sphericalToXYZ(stemDef.az, stemDef.el, stemDef.dist);
      pan.setPosition(x, y, z);

      const gainNode = ctx.createGain();
      gainNode.gain.value = stemMix[i] ?? 1;

      const srcNode = ctx.createBufferSource();
      srcNode.buffer = buf;
      srcNode.loop = true;
      srcNode.connect(pan);
      pan.connect(gainNode);
      gainNode.connect(ctx.destination);
      srcNode.start(0);

      newMap.set(i, { src: srcNode, pan, gain: gainNode });
    });

    nodeMapRef.current = newMap;
    setPlaying(true);
  }, [stemMix, buildCtx]);

  const adjustMix = useCallback((i: number, val: number) => {
    setStemMix((prev) => {
      const next = [...prev];
      next[i] = val;
      return next;
    });
    const grp = nodeMapRef.current.get(i);
    const ctx = ctxRef.current;
    if (grp && ctx) {
      grp.gain.gain.setTargetAtTime(val, ctx.currentTime, 0.02);
    }
  }, []);

  const toggleMute = useCallback(
    (i: number) => {
      const ctx = ctxRef.current;
      setStemUi((prev) =>
        prev.map((s, j) => {
          if (j !== i) return s;
          const nowMuted = !s.muted;
          const grp = nodeMapRef.current.get(j);
          if (grp && ctx) {
            grp.gain.gain.setTargetAtTime(
              nowMuted ? 0 : (stemMix[j] ?? 1),
              ctx.currentTime,
              0.05
            );
          }
          return { ...s, muted: nowMuted };
        })
      );
    },
    [stemMix]
  );

  // ── Canvas — top-down sphere view ───────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function drawFrame() {
      if (!canvas) return;
      const gc = canvas.getContext("2d");
      if (!gc) return;
      const W = canvas.width;
      const H = canvas.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.40;

      gc.fillStyle = "#07070e";
      gc.fillRect(0, 0, W, H);

      // Grid rings
      for (let k = 1; k <= 3; k++) {
        gc.beginPath();
        gc.arc(cx, cy, (R * k) / 3, 0, Math.PI * 2);
        gc.strokeStyle = "rgba(255,255,255,0.06)";
        gc.lineWidth = 1;
        gc.stroke();
      }

      // Axis lines
      gc.strokeStyle = "rgba(255,255,255,0.05)";
      gc.lineWidth = 1;
      gc.beginPath();
      gc.moveTo(cx, cy - R); gc.lineTo(cx, cy + R);
      gc.moveTo(cx - R, cy); gc.lineTo(cx + R, cy);
      gc.stroke();

      // Cardinal labels
      gc.font = "11px monospace";
      gc.fillStyle = "rgba(255,255,255,0.22)";
      gc.textAlign = "center";
      gc.textBaseline = "bottom"; gc.fillText("F", cx, cy - R - 4);
      gc.textBaseline = "top";    gc.fillText("B", cx, cy + R + 6);
      gc.textBaseline = "middle";
      gc.textAlign = "right";     gc.fillText("L", cx - R - 6, cy);
      gc.textAlign = "left";      gc.fillText("R", cx + R + 6, cy);

      // Listener head
      gc.beginPath();
      gc.arc(cx, cy, 10, 0, Math.PI * 2);
      gc.fillStyle = "rgba(255,255,255,0.10)";
      gc.fill();
      gc.beginPath();
      gc.arc(cx, cy, 5, 0, Math.PI * 2);
      gc.fillStyle = "rgba(255,255,255,0.55)";
      gc.fill();

      // Forward triangle
      gc.beginPath();
      gc.moveTo(cx, cy - 14);
      gc.lineTo(cx - 3, cy - 9);
      gc.lineTo(cx + 3, cy - 9);
      gc.closePath();
      gc.fillStyle = "rgba(255,255,255,0.28)";
      gc.fill();

      // Stem source dots
      STEMS.forEach((stemDef, i) => {
        const ui = stemUi[i];
        const azRad = (stemDef.az * Math.PI) / 180;
        const distFrac = Math.min(1, stemDef.dist / 5.5);
        const px = cx + R * distFrac * Math.sin(azRad);
        const py = cy - R * distFrac * Math.cos(azRad);
        const { color } = stemDef;

        const isReady   = ui?.status === "ready";
        const isMuted   = ui?.muted ?? false;
        const isWorking = ui?.status === "decoding";
        const alpha = isReady && !isMuted ? 1
          : isReady && isMuted ? 0.28
          : isWorking ? 0.45
          : 0.18;

        if (isReady && !isMuted) {
          gc.beginPath();
          gc.arc(px, py, 18, 0, Math.PI * 2);
          gc.fillStyle = color + "20";
          gc.fill();
          gc.beginPath();
          gc.arc(px, py, 12, 0, Math.PI * 2);
          gc.fillStyle = color + "40";
          gc.fill();
        }

        gc.beginPath();
        gc.arc(px, py, 8, 0, Math.PI * 2);
        gc.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
        gc.fill();

        // Label
        gc.font = "10px monospace";
        gc.fillStyle = `rgba(255,255,255,${alpha * 0.75})`;
        gc.textAlign = "center";
        gc.textBaseline = "top";
        gc.fillText(stemDef.label, px, py + 11);

        // Elevation hint
        if (Math.abs(stemDef.el) > 4) {
          gc.font = "9px monospace";
          gc.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
          gc.fillText(
            stemDef.el > 0 ? `↑${stemDef.el}°` : `↓${Math.abs(stemDef.el)}°`,
            px,
            py + 22
          );
        }
      });

      rafRef.current = requestAnimationFrame(drawFrame);
    }

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [stemUi]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAll();
      ctxRef.current?.close();
    };
  }, [stopAll]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const anyGenerated  = stemUi.some((s) => s.status !== "idle");
  const anyReady      = stemUi.some((s) => s.status === "ready");
  const readyCount    = stemUi.filter((s) => s.status === "ready").length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#07070e] text-[#e0e0e8] font-mono px-5 py-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-baseline mb-1">
          <h1 className="text-lg font-bold tracking-wide">Maestro Stems</h1>
          <Link href="/dream" className="text-[11px] text-muted-foreground/70 hover:text-muted-foreground">
            ← dream
          </Link>
        </div>
        <p className="text-[12px] text-muted-foreground/70 mb-6 leading-relaxed">
          Generate a 2.5-minute instrumental track — then hear each stem played back from its own
          position in 3D space.{" "}
          <span className="text-muted-foreground">Drums above. Bass below. Melody right. Harmony left.</span>{" "}
          <span className="text-muted-foreground/70">Wear headphones.</span>
        </p>

        {/* Presets */}
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPrompt(p.value)}
              className={
                "px-3 py-1 rounded text-[11px] border transition cursor-pointer " +
                (prompt === p.value
                  ? "border-border text-foreground bg-muted"
                  : "border-border text-muted-foreground hover:border-border hover:text-muted-foreground")
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Prompt textarea */}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className="w-full bg-muted border border-border rounded px-3 py-2 text-[12px] text-muted-foreground mb-4 resize-none focus:outline-none focus:border-border"
          placeholder="Style, tempo, mood, instruments…"
        />

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={generating || !prompt.trim()}
          className={
            "w-full py-2.5 rounded-md text-[14px] font-bold border-0 transition mb-6 " +
            (generating
              ? "bg-muted text-muted-foreground/70 cursor-not-allowed"
              : !prompt.trim()
              ? "bg-muted text-muted-foreground/70 cursor-not-allowed"
              : "bg-muted text-foreground hover:bg-accent cursor-pointer")
          }
        >
          {generating ? "Generating… (30–90 seconds)" : "▶ Generate Track + Stems"}
        </button>

        {genError && (
          <div className="mb-5 p-3 rounded bg-destructive/20 border border-destructive/30 text-[11px] text-destructive/70 break-all leading-relaxed whitespace-pre-wrap">
            {genError}
          </div>
        )}

        {/* Canvas */}
        <div className="flex justify-center mb-6">
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            className="rounded-lg"
            style={{ maxWidth: "100%" }}
          />
        </div>

        {/* Stem cards */}
        {anyGenerated && (
          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {STEMS.map((stemDef, i) => {
              const ui = stemUi[i];
              return (
                <div
                  key={stemDef.key}
                  style={{
                    borderColor:
                      ui.status === "ready"
                        ? stemDef.color + "55"
                        : ui.status === "error"
                        ? "#e0504055"
                        : undefined,
                  }}
                  className="p-2.5 rounded-md bg-muted border border-border"
                >
                  {/* Stem header */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: stemDef.color }}
                    />
                    <span className="text-[11px] text-muted-foreground">{stemDef.label}</span>
                    <span className="text-[9px] text-muted-foreground/70 ml-auto">{stemDef.hint}</span>
                  </div>

                  {/* Status */}
                  <div
                    style={{
                      color:
                        ui.status === "ready"
                          ? "#6db56d"
                          : ui.status === "decoding"
                          ? "#d4a44a"
                          : ui.status === "error"
                          ? "#e05050"
                          : "#555",
                    }}
                    className="text-[11px] mb-1"
                  >
                    {ui.status === "ready"    ? "✓ ready"
                    : ui.status === "decoding" ? "decoding…"
                    : ui.status === "error"    ? "✗ error"
                    : "—"}
                  </div>

                  {ui.status === "error" && (
                    <div className="text-[10px] text-destructive/55 break-all leading-tight mb-1">
                      {ui.error.slice(0, 130)}
                    </div>
                  )}

                  {ui.status === "ready" && (
                    <div className="space-y-1.5">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={stemMix[i]}
                        onChange={(e) => adjustMix(i, parseFloat(e.target.value))}
                        className="w-full h-1 cursor-pointer"
                        style={{ accentColor: stemDef.color }}
                      />
                      <button
                        onClick={() => toggleMute(i)}
                        className="text-[10px] border border-border rounded px-2 py-0.5 text-muted-foreground hover:text-muted-foreground hover:border-border cursor-pointer"
                      >
                        {ui.muted ? "unmute" : "mute"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Playback controls */}
        {anyReady && (
          <div className="flex gap-3 items-center mb-6">
            {!playing ? (
              <button
                onClick={startPlayback}
                className="px-6 py-2.5 rounded-md text-[14px] font-bold bg-muted text-foreground hover:bg-accent cursor-pointer border-0 transition"
              >
                ▶ Play Stems
              </button>
            ) : (
              <button
                onClick={stopAll}
                className="px-6 py-2.5 rounded-md text-[14px] bg-muted text-foreground border border-border hover:bg-accent cursor-pointer"
              >
                ■ Stop
              </button>
            )}
            <span className="text-[12px] text-muted-foreground/70">
              {playing
                ? `${readyCount}/4 stems playing — wear headphones`
                : `${readyCount}/4 stems ready`}
            </span>
          </div>
        )}

        {/* Raw response (debug) */}
        {rawResp && (
          <details className="mb-5">
            <summary className="text-[10px] text-muted-foreground/70 cursor-pointer hover:text-muted-foreground/70 select-none">
              raw API response
            </summary>
            <pre className="mt-1.5 p-2 bg-muted rounded text-[9px] text-muted-foreground/70 overflow-auto max-h-40 leading-relaxed">
              {rawResp}
            </pre>
          </details>
        )}

        {/* Footer */}
        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
            Each stem is positioned via Web Audio HRTF PannerNode: drums overhead (+60°), bass
            below (−30°), melody front-right (+30° az, +10° el), harmony front-left (−30° az).
            Spatial separation by musical role — qualitatively different from{" "}
            <Link href="/dream/7-spatial" className="text-muted-foreground hover:text-muted-foreground">
              7-spatial
            </Link>{" "}
            which splits by frequency band. Mix sliders fade stems live without stopping playback.
          </p>
          <p className="text-[11px] text-muted-foreground/70">
            ⚠ Endpoint{" "}
            <code className="text-muted-foreground/70">beatoven/music-generation</code> from RESEARCH.md §101.
            If you see an error above, paste the text and the agent will fix the endpoint next cycle.
          </p>
          <div className="text-[10px] text-muted-foreground/70 pt-1">
            $0.10/track · FAL_KEY in use · /dream/54-maestro-stems
          </div>
        </div>

      </div>
    </div>
  );
}
