"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type SrcType = "sawtooth" | "triangle" | "square" | "sine";

const NH = 40; // harmonics
const BASE_HZ = 130.81; // C3

const SRC_LABEL: Record<SrcType, string> = {
  sawtooth: "Sawtooth",
  triangle: "Triangle",
  square: "Square",
  sine: "Sine",
};

// 1-live palette: violet → cyan → green → yellow → orange → magenta
const PALETTE: [number, number, number][] = [
  [88, 32, 192],
  [32, 168, 220],
  [80, 220, 100],
  [240, 220, 70],
  [255, 150, 40],
  [255, 60, 120],
];

function colorAt(k: number): [number, number, number] {
  const s = (k / (NH - 1)) * (PALETTE.length - 1);
  const i = Math.min(Math.floor(s), PALETTE.length - 2);
  const f = s - i;
  const a = PALETTE[i],
    b = PALETTE[i + 1];
  return [
    a[0] + (b[0] - a[0]) * f,
    a[1] + (b[1] - a[1]) * f,
    a[2] + (b[2] - a[2]) * f,
  ];
}

function buildAmps(type: SrcType): Float32Array {
  const a = new Float32Array(NH);
  for (let k = 1; k <= NH; k++) {
    if (type === "sawtooth") a[k - 1] = 1 / k;
    else if (type === "triangle") a[k - 1] = k % 2 === 1 ? 1 / (k * k) : 0;
    else if (type === "square") a[k - 1] = k % 2 === 1 ? 1 / k : 0;
    else a[k - 1] = k === 1 ? 1 : 0; // sine
  }
  const mx = Math.max(...Array.from(a), 1e-9);
  for (let i = 0; i < NH; i++) a[i] /= mx;
  return a;
}

function applyGains(
  gains: GainNode[],
  aA: Float32Array,
  aB: Float32Array,
  t: number,
  vol: number
) {
  const now = gains[0]?.context.currentTime ?? 0;
  for (let i = 0; i < NH; i++) {
    gains[i].gain.setTargetAtTime(
      (aA[i] * (1 - t) + aB[i] * t) * vol * 0.15,
      now,
      0.04
    );
  }
}

export default function SpectralMorph() {
  const [active, setActive] = useState(false);
  const [srcA, setSrcA] = useState<SrcType>("sawtooth");
  const [srcB, setSrcB] = useState<SrcType>("sine");
  const [morph, setMorph] = useState(0);
  const [vol, setVol] = useState(0.5);

  const audioRef = useRef<{
    ctx: AudioContext;
    oscs: OscillatorNode[];
    gains: GainNode[];
  } | null>(null);
  const ampsARef = useRef(buildAmps("sawtooth"));
  const ampsBRef = useRef(buildAmps("sine"));
  const morphRef = useRef(0);
  const volRef = useRef(0.5);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  morphRef.current = morph;
  volRef.current = vol;

  function startAudio() {
    if (audioRef.current) return;
    const ctx = new AudioContext();
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const aA = ampsARef.current;
    const aB = ampsBRef.current;
    const t = morphRef.current;
    const v = volRef.current;
    for (let i = 0; i < NH; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = BASE_HZ * (i + 1);
      const gain = ctx.createGain();
      gain.gain.value = (aA[i] * (1 - t) + aB[i] * t) * v * 0.15;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      oscs.push(osc);
      gains.push(gain);
    }
    audioRef.current = { ctx, oscs, gains };
    setActive(true);
  }

  function stopAudio() {
    if (!audioRef.current) return;
    const { oscs, ctx } = audioRef.current;
    oscs.forEach((o) => {
      try {
        o.stop(0);
      } catch {
        // already stopped
      }
    });
    ctx.close();
    audioRef.current = null;
    setActive(false);
  }

  useEffect(() => {
    if (audioRef.current)
      applyGains(
        audioRef.current.gains,
        ampsARef.current,
        ampsBRef.current,
        morph,
        vol
      );
  }, [morph, vol]);

  useEffect(() => {
    ampsARef.current = buildAmps(srcA);
    if (audioRef.current)
      applyGains(
        audioRef.current.gains,
        ampsARef.current,
        ampsBRef.current,
        morphRef.current,
        volRef.current
      );
  }, [srcA]);

  useEffect(() => {
    ampsBRef.current = buildAmps(srcB);
    if (audioRef.current)
      applyGains(
        audioRef.current.gains,
        ampsARef.current,
        ampsBRef.current,
        morphRef.current,
        volRef.current
      );
  }, [srcB]);

  // Canvas render loop
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0;
    let H = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      c.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const drawStrip = (amps: Float32Array, yTop: number, stripH: number, alpha: number) => {
      const barW = W / NH;
      for (let k = 0; k < NH; k++) {
        const [r, g, b] = colorAt(k);
        const bh = amps[k] * stripH;
        c.fillStyle = `rgba(${r},${g},${b},${alpha})`;
        c.fillRect(k * barW + 1, yTop + stripH - bh, barW - 2, bh);
      }
    };

    const frame = () => {
      if (W === 0 || H === 0) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      const t = morphRef.current;
      const aA = ampsARef.current;
      const aB = ampsBRef.current;

      const blend = new Float32Array(NH);
      for (let i = 0; i < NH; i++) blend[i] = aA[i] * (1 - t) + aB[i] * t;

      c.fillStyle = "#000";
      c.fillRect(0, 0, W, H);

      // Reserve bottom for controls (~120px) and top padding
      const ctrlH = 130;
      const topPad = 24;
      const avail = H - topPad - ctrlH;
      const gap = 12;
      const stripH = (avail - gap * 2) / 3;

      const y0 = topPad;
      const y1 = topPad + stripH + gap;
      const y2 = topPad + (stripH + gap) * 2;

      // Background tint for middle strip
      c.fillStyle = "rgba(255,255,255,0.025)";
      c.fillRect(0, y1 - 4, W, stripH + 8);

      // Draw strips
      drawStrip(aA, y0, stripH, 0.5);
      drawStrip(blend, y1, stripH, 0.92);
      drawStrip(aB, y2, stripH, 0.5);

      // Labels
      c.font = "12px monospace";
      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillText(`A — ${SRC_LABEL[srcA]}`, 10, y0 - 6);

      c.fillStyle = "rgba(255,255,255,0.92)";
      c.fillText(
        `BLEND  ${Math.round(t * 100)}%  →  ${SRC_LABEL[srcB]}`,
        10,
        y1 - 6
      );

      c.fillStyle = "rgba(255,255,255,0.6)";
      c.fillText(`B — ${SRC_LABEL[srcB]}`, 10, y2 - 6);

      // Harmonic axis label (bottom of middle strip)
      c.font = "9px monospace";
      c.fillStyle = "rgba(255,255,255,0.22)";
      c.fillText("harmonic 1", 2, y1 + stripH + 10);
      c.fillText("40", W - 20, y1 + stripH + 10);

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [active, srcA, srcB]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const ref = audioRef.current;
      if (ref) {
        ref.oscs.forEach((o) => {
          try {
            o.stop(0);
          } catch {
            // already stopped
          }
        });
        ref.ctx.close();
        audioRef.current = null;
      }
    };
  }, []);

  const srcsA: SrcType[] = ["sawtooth", "triangle", "square"];
  const srcsB: SrcType[] = ["sine", "triangle", "sawtooth", "square"];

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      {active ? (
        <>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ background: "#000" }}
          />

          {/* Controls overlay — fixed to bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-4 flex flex-col gap-2 bg-black/60 backdrop-blur-sm">
            {/* Morph slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-sm text-foreground">
                <span>{SRC_LABEL[srcA]}</span>
                <span className="text-foreground font-mono text-xs tracking-wider">
                  MORPH {Math.round(morph * 100)}%
                </span>
                <span>{SRC_LABEL[srcB]}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.005"
                value={morph}
                onChange={(e) => setMorph(parseFloat(e.target.value))}
                className="w-full accent-violet-400"
                style={{ minHeight: 32 }}
              />
            </div>

            {/* Source selectors + volume + stop */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center text-sm">
              <div className="flex gap-1.5 items-center">
                <span className="text-muted-foreground text-xs tracking-wider">A:</span>
                {srcsA.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSrcA(s)}
                    className={`px-2.5 py-1 rounded text-xs min-h-[32px] border transition ${
                      srcA === s
                        ? "bg-violet-500/25 text-violet-200 border-violet-500/50"
                        : "text-muted-foreground hover:text-foreground border-border hover:border-border"
                    }`}
                  >
                    {SRC_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 items-center">
                <span className="text-muted-foreground text-xs tracking-wider">B:</span>
                {srcsB.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSrcB(s)}
                    className={`px-2.5 py-1 rounded text-xs min-h-[32px] border transition ${
                      srcB === s
                        ? "bg-violet-500/25 text-violet-200 border-violet-500/50"
                        : "text-muted-foreground hover:text-foreground border-border hover:border-border"
                    }`}
                  >
                    {SRC_LABEL[s]}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center ml-auto">
                <span className="text-xs text-muted-foreground">VOL</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={vol}
                  onChange={(e) => setVol(parseFloat(e.target.value))}
                  className="w-20 accent-primary"
                />
                <button
                  onClick={stopAudio}
                  className="text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1.5 rounded min-h-[32px]"
                >
                  stop
                </button>
                <Link
                  href="/dream"
                  className="text-xs text-muted-foreground/70 hover:text-muted-foreground"
                >
                  ← back
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-4 tracking-tight">
            Spectral Morph
          </h1>
          <p className="text-base text-foreground max-w-md mb-3 leading-relaxed">
            Drag the morph slider to blend the harmonic spectrum between two
            waveforms. At 50% you hear a genuine acoustic hybrid — not a
            crossfade, but a reshaped harmonic series.
          </p>
          <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
            40 sine partials tuned to harmonics of C3. Each partial&apos;s
            amplitude interpolates independently. The first sandbox prototype to
            synthesize audio from spectral manipulation rather than just analyze
            it.
          </p>
          <button
            onClick={startAudio}
            className="px-6 py-3 text-base tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition min-h-[44px] min-w-[44px]"
          >
            Start
          </button>
          <Link
            href="/dream"
            className="mt-12 text-xs text-muted-foreground/70 hover:text-muted-foreground"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}
    </div>
  );
}
