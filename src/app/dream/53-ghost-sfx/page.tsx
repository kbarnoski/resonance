"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SrcDef {
  label: string;
  prompt: string;
  az: number;  // azimuth degrees: 0=front, +90=right, 180/–180=back, –90=left
  el: number;  // elevation degrees: 0=horizontal, positive=up
  dist: number; // listener distance in metres
}

interface SceneDef {
  name: string;
  accent: string; // CSS colour
  tagline: string;
  sources: SrcDef[];
}

type SrcStatus = "idle" | "loading" | "ready" | "error";

interface SrcUi {
  status: SrcStatus;
  error: string;
  muted: boolean;
}

interface NodeGroup {
  src: AudioBufferSourceNode;
  pan: PannerNode;
  gain: GainNode;
}

// ── Scene definitions ─────────────────────────────────────────────────────────

const SCENES: SceneDef[] = [
  {
    name: "Stone Chamber",
    accent: "#c4a882",
    tagline: "Weight of stone — single piano, water, deep hum",
    sources: [
      {
        label: "Piano",
        prompt: "single piano chord with 3-second stone chamber reverb, long sustain, quiet decay",
        az: -30, el: 0, dist: 2,
      },
      {
        label: "Water drip",
        prompt: "isolated water drop echoing in stone cave, slow single drip, 3-second stone reverb",
        az: 75, el: -20, dist: 3.5,
      },
      {
        label: "Hum",
        prompt: "low resonant drone 80 Hz inside large stone room, sustained ambient hum, very quiet",
        az: 160, el: 5, dist: 4.5,
      },
    ],
  },
  {
    name: "Root Portal",
    accent: "#6db56d",
    tagline: "Earth drone below — forest ambience ahead",
    sources: [
      {
        label: "Root tone",
        prompt: "deep bass drone 55 Hz, subharmonic, vast dark underground space, slowly fading in",
        az: 0, el: -30, dist: 5,
      },
      {
        label: "Bird call",
        prompt: "single forest bird call, morning light, natural forest reverb, short melodic call",
        az: 45, el: 25, dist: 4,
      },
      {
        label: "Leaves",
        prompt: "gentle wind through leaves, soft continuous rustling, peaceful forest ambient",
        az: -60, el: 0, dist: 3,
      },
    ],
  },
  {
    name: "Underground Pool",
    accent: "#4a9ab5",
    tagline: "Water echoes — vast resonance far below",
    sources: [
      {
        label: "Ripple",
        prompt: "soft water ripple in underground cave pool, gentle splash, low cave ceiling reverb",
        az: 80, el: 0, dist: 2.5,
      },
      {
        label: "Deep resonance",
        prompt: "vast underground low frequency resonance 50 Hz, hollow cave acoustic, sustained",
        az: 0, el: -40, dist: 6,
      },
      {
        label: "Ceiling drip",
        prompt: "water drop falling from high cave ceiling, long echo, single drip, distant",
        az: 150, el: 35, dist: 5,
      },
    ],
  },
  {
    name: "Tiny Planet",
    accent: "#d4a44a",
    tagline: "Wind dome — bird orbit — crystalline shimmer above",
    sources: [
      {
        label: "Wind",
        prompt: "sustained omnidirectional wind, constant gentle breeze, no variation, airy texture",
        az: 0, el: 0, dist: 3,
      },
      {
        label: "Bird pass",
        prompt: "sharp bird call swooping quickly overhead, bright and short, passing above",
        az: 90, el: 55, dist: 3,
      },
      {
        label: "Shimmer",
        prompt: "high frequency crystalline bell shimmer, very soft, harmonics, sustained 5 seconds",
        az: -90, el: 40, dist: 4,
      },
    ],
  },
  {
    name: "Forest Dawn",
    accent: "#7ab58a",
    tagline: "Canopy birds above — stream left — piano front",
    sources: [
      {
        label: "Canopy",
        prompt: "dawn bird chorus from tree canopy above, multiple birds, morning light, rich and varied",
        az: 20, el: 60, dist: 4,
      },
      {
        label: "Stream",
        prompt: "gentle stream babbling to the left, natural water flowing over stones, continuous",
        az: -85, el: -10, dist: 2,
      },
      {
        label: "Piano",
        prompt: "single piano note E4 in forest clearing, warm natural reverb from surrounding trees",
        az: 10, el: 0, dist: 3,
      },
    ],
  },
  {
    name: "Cosmic Ascension",
    accent: "#a080e0",
    tagline: "Vast drone — harmonic rise — deep sub pulse below",
    sources: [
      {
        label: "Vast drone",
        prompt: "vast cosmic ambient drone, enormous reverberant space, 100 Hz bass, slow crescendo",
        az: 0, el: 0, dist: 6,
      },
      {
        label: "Harmonic rise",
        prompt: "ascending harmonic overtone series, ethereal shimmer, slowly rising in pitch, sustained",
        az: 60, el: 30, dist: 4,
      },
      {
        label: "Sub pulse",
        prompt: "deep subharmonic pulse 40 Hz, single slow beat every 3 seconds, vast space decay",
        az: 0, el: -50, dist: 5,
      },
    ],
  },
];

// ── 3-D position helpers ──────────────────────────────────────────────────────

// Spherical → Cartesian (Web Audio convention: +x=right, +y=up, −z=forward)
function toXYZ(azDeg: number, elDeg: number, distM: number): [number, number, number] {
  const a = (azDeg * Math.PI) / 180;
  const e = (elDeg * Math.PI) / 180;
  return [
    distM * Math.sin(a) * Math.cos(e),
    distM * Math.sin(e),
    -distM * Math.cos(a) * Math.cos(e),
  ];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GhostSfxPage() {
  const [sceneIdx, setSceneIdx] = useState(-1);
  const [srcUi, setSrcUi] = useState<SrcUi[]>([]);
  const [playing, setPlaying] = useState(false);
  const [generating, setGenerating] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<(AudioBuffer | null)[]>([]);
  const nodeMapRef = useRef<Map<number, NodeGroup>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  // ── Audio helpers ───────────────────────────────────────────────────────────

  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      ctxRef.current = new Ctx();
      ctxRef.current.listener.setPosition(0, 0, 0);
      ctxRef.current.listener.setOrientation(0, 0, -1, 0, 1, 0);
    }
    return ctxRef.current;
  }, []);

  const killNodes = useCallback(() => {
    nodeMapRef.current.forEach(({ src, pan, gain }) => {
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
      pan.disconnect();
      gain.disconnect();
    });
    nodeMapRef.current.clear();
    setPlaying(false);
  }, []);

  const loadScene = useCallback(async (idx: number) => {
    killNodes();
    setSceneIdx(idx);
    setGenerating(true);
    buffersRef.current = [];

    const scene = SCENES[idx];
    const initUi: SrcUi[] = scene.sources.map(() => ({
      status: "loading",
      error: "",
      muted: false,
    }));
    setSrcUi(initUi);

    const ctx = getCtx();

    await Promise.all(
      scene.sources.map(async (srcDef, i) => {
        try {
          const res = await fetch("/dream/53-ghost-sfx/api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: srcDef.prompt }),
          });
          const data = await res.json() as { url?: string; error?: string; raw?: string };
          if (data.error) {
            throw new Error(data.raw ? `${data.error} · ${data.raw}` : data.error);
          }
          if (!data.url) throw new Error("No audio URL in response");

          const audioRes = await fetch(data.url);
          if (!audioRes.ok) throw new Error(`Audio fetch failed: HTTP ${audioRes.status}`);
          const arrBuf = await audioRes.arrayBuffer();
          const buffer = await ctx.decodeAudioData(arrBuf);

          buffersRef.current[i] = buffer;
          setSrcUi((prev) =>
            prev.map((s, j) => (j === i ? { ...s, status: "ready" } : s))
          );
        } catch (err) {
          buffersRef.current[i] = null;
          setSrcUi((prev) =>
            prev.map((s, j) =>
              j === i
                ? { ...s, status: "error", error: String(err).slice(0, 200) }
                : s
            )
          );
        }
      })
    );

    setGenerating(false);
  }, [getCtx, killNodes]);

  const startAudio = useCallback(() => {
    if (sceneIdx < 0) return;
    const ctx = getCtx();
    const scene = SCENES[sceneIdx];
    const newMap = new Map<number, NodeGroup>();

    scene.sources.forEach((srcDef, i) => {
      const buf = buffersRef.current[i];
      if (!buf) return;

      const pan = ctx.createPanner();
      pan.panningModel = "HRTF";
      pan.distanceModel = "inverse";
      pan.refDistance = 1;
      pan.maxDistance = 10;
      const [x, y, z] = toXYZ(srcDef.az, srcDef.el, srcDef.dist);
      pan.setPosition(x, y, z);

      const gainNode = ctx.createGain();
      gainNode.gain.value = srcUi[i]?.muted ? 0 : 0.75;

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
  }, [sceneIdx, srcUi, getCtx]);

  const toggleMute = useCallback((i: number) => {
    const ctx = ctxRef.current;
    setSrcUi((prev) =>
      prev.map((s, j) => {
        if (j !== i) return s;
        const nowMuted = !s.muted;
        const grp = nodeMapRef.current.get(j);
        if (grp && ctx) {
          grp.gain.gain.setTargetAtTime(nowMuted ? 0 : 0.75, ctx.currentTime, 0.05);
        }
        return { ...s, muted: nowMuted };
      })
    );
  }, []);

  // ── Canvas draw loop ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function drawCanvas() {
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
        gc.strokeStyle = "rgba(255,255,255,0.07)";
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
      gc.textBaseline = "bottom";
      gc.fillText("F", cx, cy - R - 4);
      gc.textBaseline = "top";
      gc.fillText("B", cx, cy + R + 6);
      gc.textBaseline = "middle";
      gc.textAlign = "right";
      gc.fillText("L", cx - R - 6, cy);
      gc.textAlign = "left";
      gc.fillText("R", cx + R + 6, cy);

      // Listener head
      gc.beginPath();
      gc.arc(cx, cy, 10, 0, Math.PI * 2);
      gc.fillStyle = "rgba(255,255,255,0.10)";
      gc.fill();
      gc.beginPath();
      gc.arc(cx, cy, 5, 0, Math.PI * 2);
      gc.fillStyle = "rgba(255,255,255,0.55)";
      gc.fill();

      // Forward indicator (small triangle pointing up = forward)
      gc.beginPath();
      gc.moveTo(cx, cy - 14);
      gc.lineTo(cx - 3, cy - 9);
      gc.lineTo(cx + 3, cy - 9);
      gc.closePath();
      gc.fillStyle = "rgba(255,255,255,0.28)";
      gc.fill();

      // Sound sources
      if (sceneIdx >= 0) {
        const scene = SCENES[sceneIdx];
        scene.sources.forEach((srcDef, i) => {
          const ui = srcUi[i];
          const azRad = (srcDef.az * Math.PI) / 180;
          const distFrac = Math.min(1, srcDef.dist / 7);
          const px = cx + R * distFrac * Math.sin(azRad);
          const py = cy - R * distFrac * Math.cos(azRad);
          const accent = scene.accent;

          const isReady = ui?.status === "ready";
          const isMuted = ui?.muted ?? false;
          const isLoading = ui?.status === "loading";
          const alpha = isReady && !isMuted ? 1
            : isReady && isMuted ? 0.28
            : isLoading ? 0.45
            : 0.18;

          // Glow ring for active (ready + not muted)
          if (isReady && !isMuted) {
            gc.beginPath();
            gc.arc(px, py, 17, 0, Math.PI * 2);
            gc.fillStyle = accent + "25";
            gc.fill();
            gc.beginPath();
            gc.arc(px, py, 12, 0, Math.PI * 2);
            gc.fillStyle = accent + "40";
            gc.fill();
          }

          // Main dot
          gc.beginPath();
          gc.arc(px, py, 8, 0, Math.PI * 2);
          gc.fillStyle =
            accent + Math.round(alpha * 255).toString(16).padStart(2, "0");
          gc.fill();

          // Label below dot
          gc.font = "10px monospace";
          gc.fillStyle = `rgba(255,255,255,${alpha * 0.75})`;
          gc.textAlign = "center";
          gc.textBaseline = "top";
          gc.fillText(srcDef.label, px, py + 11);

          // Elevation hint (small, if nonzero)
          if (Math.abs(srcDef.el) > 4) {
            gc.font = "9px monospace";
            gc.fillStyle = `rgba(255,255,255,${alpha * 0.35})`;
            gc.fillText(
              srcDef.el > 0 ? `+${srcDef.el}°` : `${srcDef.el}°`,
              px,
              py + 22
            );
          }
        });
      }

      rafRef.current = requestAnimationFrame(drawCanvas);
    }

    rafRef.current = requestAnimationFrame(drawCanvas);
    return () => cancelAnimationFrame(rafRef.current);
  }, [sceneIdx, srcUi]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      killNodes();
      ctxRef.current?.close();
    };
  }, [killNodes]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const scene = sceneIdx >= 0 ? SCENES[sceneIdx] : null;
  const anyReady = srcUi.some((s) => s.status === "ready");
  const readyCount = srcUi.filter((s) => s.status === "ready").length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#07070e] text-[#e0e0e8] font-mono px-5 py-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-baseline mb-1">
          <h1 className="text-lg font-bold tracking-wide">Ghost SFX</h1>
          <Link
            href="/dream"
            className="text-[11px] text-white/30 hover:text-white/60"
          >
            ← dream
          </Link>
        </div>
        <p className="text-[12px] text-white/40 mb-6 leading-relaxed">
          Each Ghost scene has a sound as distinctive as its visuals.{" "}
          <span className="text-white/25">Wear headphones.</span>
        </p>

        {/* Scene selector */}
        <div className="flex flex-wrap gap-2 mb-7">
          {SCENES.map((s, i) => (
            <button
              key={s.name}
              onClick={() => loadScene(i)}
              disabled={generating}
              style={{
                borderColor: i === sceneIdx ? s.accent : undefined,
                background: i === sceneIdx ? s.accent + "1a" : undefined,
                color: i === sceneIdx ? s.accent : undefined,
              }}
              className={
                "px-3 py-1.5 rounded text-[12px] border transition " +
                (i !== sceneIdx
                  ? "border-white/12 text-white/50 hover:border-white/30 hover:text-white/70 "
                  : "") +
                (generating && i !== sceneIdx ? "opacity-40 cursor-not-allowed" : "cursor-pointer")
              }
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Canvas — top-down sphere view */}
        <div className="flex justify-center mb-6">
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            className="rounded-lg"
            style={{ maxWidth: "100%" }}
          />
        </div>

        {/* Source status cards */}
        {srcUi.length > 0 && (
          <div className="flex gap-2.5 mb-5">
            {srcUi.map((ui, i) => (
              <div
                key={i}
                style={{
                  borderColor:
                    ui.status === "ready"
                      ? (scene?.accent ?? "#666") + "55"
                      : ui.status === "error"
                      ? "#e0504055"
                      : undefined,
                }}
                className="flex-1 p-2.5 rounded-md bg-white/[0.04] border border-white/[0.08]"
              >
                <div className="text-[10px] text-white/38 mb-1">
                  {sceneIdx >= 0 ? SCENES[sceneIdx].sources[i]?.label : ""}
                </div>
                <div
                  style={{
                    color:
                      ui.status === "ready"
                        ? "#6db56d"
                        : ui.status === "loading"
                        ? "#d4a44a"
                        : ui.status === "error"
                        ? "#e05050"
                        : "#666",
                  }}
                  className="text-[12px]"
                >
                  {ui.status === "ready"
                    ? "✓ ready"
                    : ui.status === "loading"
                    ? "generating…"
                    : ui.status === "error"
                    ? "✗ error"
                    : "—"}
                </div>
                {ui.status === "error" && (
                  <div className="text-[10px] text-red-400/60 mt-1 break-all leading-tight">
                    {ui.error.slice(0, 150)}
                  </div>
                )}
                {ui.status === "ready" && (
                  <button
                    onClick={() => toggleMute(i)}
                    className="mt-1.5 px-2 py-0.5 text-[10px] border border-white/15 rounded text-white/55 hover:text-white/80 hover:border-white/30"
                  >
                    {ui.muted ? "unmute" : "mute"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Playback controls */}
        <div className="flex gap-3 items-center mb-7">
          {!playing ? (
            <button
              onClick={startAudio}
              disabled={!anyReady}
              style={
                anyReady && scene
                  ? { background: scene.accent, color: "#07070e" }
                  : {}
              }
              className={
                "px-6 py-2.5 rounded-md text-[14px] font-bold border-0 transition " +
                (anyReady
                  ? "cursor-pointer"
                  : "bg-white/8 text-white/22 cursor-not-allowed")
              }
            >
              ▶ Play
            </button>
          ) : (
            <button
              onClick={killNodes}
              className="px-6 py-2.5 rounded-md text-[14px] bg-white/8 text-white/80 border border-white/18 hover:bg-white/12 cursor-pointer"
            >
              ■ Stop
            </button>
          )}

          <span className="text-[12px] text-white/35">
            {generating
              ? `generating… ${readyCount}/${srcUi.length} ready`
              : sceneIdx < 0
              ? "select a scene above"
              : anyReady
              ? playing
                ? "playing — wear headphones"
                : "ready to play"
              : "all sources failed"}
          </span>
        </div>

        {/* Info + API note */}
        <div className="border-t border-white/[0.06] pt-4 space-y-2">
          <p className="text-[11px] text-white/28 leading-relaxed">
            Each source is positioned at its 3-D location via Web Audio HRTF
            PannerNode. The canvas shows the top-down view: F=forward, B=back,
            L=left, R=right. Elevation (±°) is applied to the audio even though
            the top-down canvas doesn&apos;t show it vertically. Six scenes · 3
            AI-generated sounds each · ~$0.05–0.15/scene (ElevenLabs on fal.ai).
          </p>
          <p className="text-[11px] text-white/22">
            ⚠ API note: endpoint{" "}
            <code className="text-white/40">fal-ai/elevenlabs/sound-generation</code>
            . If sources show errors, paste the error text and the agent will fix
            the endpoint or parameters next cycle.
          </p>
          <div className="text-[10px] text-white/18 pt-1">/dream/53-ghost-sfx</div>
        </div>
      </div>
    </div>
  );
}
