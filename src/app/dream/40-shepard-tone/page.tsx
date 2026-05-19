"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";

// ── Shepard tone constants ─────────────────────────────────────────────────────
// 8 sine oscillators spaced one octave apart: A1–A8
// Gain = bell-curve centered at A4 (440 Hz). As the shared phase advances,
// all frequencies glide upward; the bell ensures high/low extremes fade out.
// The auditory system hears only the loud middle — which always seems to be rising.

const NUM_OSC = 8;
const A1_HZ = 55;                             // lowest oscillator base frequency
const BELL_CENTER_LOG2 = Math.log2(440);      // A4 = peak brightness
const BELL_SIGMA = 1.5;                       // octaves; wider → more oscs audible

type IntervalMode = "chromatic" | "whole" | "semitone";

// Per-octave step counts for each interval mode
const STEPS_PER_OCT: Record<IntervalMode, number> = {
  chromatic: 0,   // 0 = continuous glide (no quantization)
  whole:     6,   // 6 whole-tone steps per octave
  semitone: 12,   // 12 semitone steps per octave
};

// Color palette per oscillator (low = violet, high = red), mirrors 1-live
const OSC_COLORS: [number, number, number][] = [
  [88,  32,  192],   // A1 — deep violet
  [32,  168, 220],   // A2 — cyan
  [80,  220, 100],   // A3 — green
  [240, 220, 70],    // A4 — yellow (bell center)
  [255, 180, 40],    // A5 — amber
  [255, 110, 40],    // A6 — deep orange
  [255, 60,  120],   // A7 — magenta
  [255, 40,  60],    // A8 — red
];
const OSC_LABELS = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"];

function gainForOsc(oscIndex: number, phase: number): number {
  // Actual log2 frequency of oscillator i when phase ∈ [0,1)
  const log2f = Math.log2(A1_HZ) + oscIndex + phase;
  const z = (log2f - BELL_CENTER_LOG2) / BELL_SIGMA;
  return Math.exp(-0.5 * z * z);
}

function allGains(phase: number): number[] {
  return Array.from({ length: NUM_OSC }, (_, i) => gainForOsc(i, phase));
}

function quantize(rawPhase: number, mode: IntervalMode): number {
  const steps = STEPS_PER_OCT[mode];
  if (steps === 0) return rawPhase;
  return Math.floor(rawPhase * steps) / steps;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ShepardTone() {
  const [running,      setRunning]      = useState(false);
  const [ascending,    setAscending]    = useState(true);
  const [rate,         setRate]         = useState(4);        // BPM = octaves/minute
  const [intervalMode, setIntervalMode] = useState<IntervalMode>("chromatic");
  const [frozen,       setFrozen]       = useState(false);
  const [micMode,      setMicMode]      = useState(false);
  const [micError,     setMicError]     = useState("");
  const [hudGains,     setHudGains]     = useState<number[]>(allGains(0));
  const [hudPhase,     setHudPhase]     = useState(0);
  const [hudRate,      setHudRate]      = useState(4);

  // Audio refs
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const oscRefs       = useRef<OscillatorNode[]>([]);
  const gainRefs      = useRef<GainNode[]>([]);
  const analyserRef   = useRef<AnalyserNode | null>(null);

  // Animation / state refs (avoid closure staleness)
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const animRef        = useRef(0);
  const phaseRef       = useRef(0);
  const lastTsRef      = useRef(0);
  const frozenRef      = useRef(false);
  const ascendingRef   = useRef(true);
  const rateRef        = useRef(4);
  const intervalRef    = useRef<IntervalMode>("chromatic");
  const micModeRef     = useRef(false);
  const micAmpRef      = useRef(0);
  const frameRef       = useRef(0);

  // Keep refs synced with state
  useEffect(() => { frozenRef.current    = frozen;       }, [frozen]);
  useEffect(() => { ascendingRef.current = ascending;    }, [ascending]);
  useEffect(() => { rateRef.current      = rate;         }, [rate]);
  useEffect(() => { intervalRef.current  = intervalMode; }, [intervalMode]);
  useEffect(() => { micModeRef.current   = micMode;      }, [micMode]);

  // ── Start audio ─────────────────────────────────────────────────────────────
  const startAudio = useCallback(() => {
    if (running) return;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.40;
    master.connect(ctx.destination);

    oscRefs.current  = [];
    gainRefs.current = [];

    for (let i = 0; i < NUM_OSC; i++) {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type          = "sine";
      osc.frequency.value = A1_HZ * Math.pow(2, i);
      g.gain.value      = 0;
      osc.connect(g);
      g.connect(master);
      osc.start();
      oscRefs.current.push(osc);
      gainRefs.current.push(g);
    }

    phaseRef.current  = 0;
    lastTsRef.current = performance.now();
    setRunning(true);
  }, [running]);

  // ── Stop audio ──────────────────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    oscRefs.current     = [];
    gainRefs.current    = [];
    analyserRef.current = null;
    setRunning(false);
    setMicMode(false);
    phaseRef.current = 0;
    setHudPhase(0);
    setHudGains(allGains(0));
  }, []);

  // ── Activate mic ────────────────────────────────────────────────────────────
  const activateMic = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const src = ctx.createMediaStreamSource(stream);
      const an  = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      analyserRef.current = an;
      setMicMode(true);
      setMicError("");
    } catch {
      setMicError("Mic access denied — rate control is manual only.");
    }
  }, []);

  // ── Cleanup on unmount ──────────────────────────────────────────────────────
  useEffect(() => () => { stopAudio(); }, [stopAudio]);

  // ── Main animation + audio scheduling loop ──────────────────────────────────
  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current;
    const ctx2d  = canvas?.getContext("2d");
    if (!canvas || !ctx2d) return;

    let dpr = 1;
    let W   = 0;
    let H   = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W   = window.innerWidth;
      H   = window.innerHeight;
      canvas.width        = W * dpr;
      canvas.height       = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (ts: number) => {
      animRef.current = requestAnimationFrame(draw);
      frameRef.current++;

      const dt = Math.min((ts - lastTsRef.current) / 1000, 0.1);
      lastTsRef.current = ts;

      // ── Mic amplitude reading ────────────────────────────────────────────
      if (micModeRef.current && analyserRef.current) {
        const buf = new Uint8Array(analyserRef.current.fftSize);
        analyserRef.current.getByteTimeDomainData(buf);
        let ss = 0;
        for (let j = 0; j < buf.length; j++) {
          const v = (buf[j] - 128) / 128;
          ss += v * v;
        }
        micAmpRef.current = Math.sqrt(ss / buf.length);
      }

      // ── Phase advance ────────────────────────────────────────────────────
      if (!frozenRef.current) {
        let r = rateRef.current;
        if (micModeRef.current) {
          // Louder playing → faster ascent; range 0.5× to 4× base rate
          r = r * (0.5 + 3.5 * micAmpRef.current);
        }
        const dir = ascendingRef.current ? 1 : -1;
        phaseRef.current = ((phaseRef.current + dir * (r / 60) * dt) % 1 + 1) % 1;
      }

      const rawPhase = phaseRef.current;
      const ph       = quantize(rawPhase, intervalRef.current);
      const gainVals = allGains(ph);

      // ── Update oscillators ───────────────────────────────────────────────
      const actx = audioCtxRef.current;
      if (actx) {
        for (let i = 0; i < NUM_OSC; i++) {
          const osc = oscRefs.current[i];
          const g   = gainRefs.current[i];
          if (!osc || !g) continue;
          osc.frequency.value = A1_HZ * Math.pow(2, i + ph);
          g.gain.setTargetAtTime(gainVals[i] * 0.88, actx.currentTime, 0.018);
        }
      }

      // ── Update HUD (React state) at ~8 Hz ───────────────────────────────
      if (frameRef.current % 8 === 0) {
        setHudGains([...gainVals]);
        setHudPhase(rawPhase);
        let displayRate = rateRef.current;
        if (micModeRef.current) displayRate = rateRef.current * (0.5 + 3.5 * micAmpRef.current);
        setHudRate(displayRate);
      }

      // ── Canvas drawing ───────────────────────────────────────────────────
      ctx2d.clearRect(0, 0, W, H);
      ctx2d.fillStyle = "#04040e";
      ctx2d.fillRect(0, 0, W, H);

      // Spiral center (left portion of canvas)
      const cx = W * 0.38;
      const cy = H * 0.50;

      const maxR = Math.min(W * 0.32, H * 0.40);
      const minR = maxR * 0.09;
      const turns = 2.0; // how many coils to draw

      // Draw logarithmic spiral.
      // The spiral rotates by rawPhase × 2π each full octave traversal.
      // It represents the "helical" pitch space — chromatic height (coil) vs register (level).
      ctx2d.save();
      ctx2d.translate(cx, cy);

      // Gradient spiral from violet (bottom/inner) to red (top/outer)
      ctx2d.beginPath();
      const SPIRAL_STEPS = 180;
      for (let s = 0; s <= SPIRAL_STEPS; s++) {
        const t     = s / SPIRAL_STEPS;
        const angle = t * turns * Math.PI * 2 - rawPhase * Math.PI * 2;
        const r2    = minR * Math.pow(maxR / minR, t);
        const px    = r2 * Math.cos(angle);
        const py    = -r2 * Math.sin(angle);
        if (s === 0) ctx2d.moveTo(px, py);
        else ctx2d.lineTo(px, py);
      }
      const sg = ctx2d.createLinearGradient(-maxR, 0, maxR, 0);
      sg.addColorStop(0,    "rgba(88,32,192,0.75)");
      sg.addColorStop(0.30, "rgba(32,168,220,0.75)");
      sg.addColorStop(0.55, "rgba(80,220,100,0.75)");
      sg.addColorStop(0.75, "rgba(255,180,40,0.75)");
      sg.addColorStop(1,    "rgba(255,60,120,0.75)");
      ctx2d.strokeStyle = sg;
      ctx2d.lineWidth   = 1.8;
      ctx2d.stroke();

      // Moving dot: tracks rawPhase position along the spiral.
      // At ph=0 → inner coil (t=0), ph=1 → outer coil (t=1, then wraps)
      // Use rawPhase directly as t so the dot walks along one full coil per octave.
      const dotT     = rawPhase;
      const dotAngle = dotT * turns * Math.PI * 2 - rawPhase * Math.PI * 2;
      const dotR     = minR * Math.pow(maxR / minR, dotT);
      const dotX     = dotR * Math.cos(dotAngle);
      const dotY     = -dotR * Math.sin(dotAngle);

      // Glow halo
      const glowGrad = ctx2d.createRadialGradient(dotX, dotY, 0, dotX, dotY, 18);
      glowGrad.addColorStop(0, "rgba(255,255,255,0.80)");
      glowGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx2d.beginPath();
      ctx2d.arc(dotX, dotY, 18, 0, Math.PI * 2);
      ctx2d.fillStyle = glowGrad;
      ctx2d.fill();
      // Core
      ctx2d.beginPath();
      ctx2d.arc(dotX, dotY, 4.5, 0, Math.PI * 2);
      ctx2d.fillStyle = "#ffffff";
      ctx2d.fill();

      ctx2d.restore();

      // ── Oscillator circles (right side) ────────────────────────────────
      const colX    = W * 0.77;
      const colTop  = H * 0.09;
      const colBot  = H * 0.91;
      const rowStep = (colBot - colTop) / (NUM_OSC - 1);

      for (let i = 0; i < NUM_OSC; i++) {
        // i=0 is A1 (bottom of column), i=7 is A8 (top)
        const yPos = colBot - i * rowStep;
        const gv   = gainVals[i];
        const [r, g, b] = OSC_COLORS[i];

        // Outer glow (additive-style, drawn before core)
        if (gv > 0.02) {
          const glowR = gv * 52 + 8;
          const gg    = ctx2d.createRadialGradient(colX, yPos, 0, colX, yPos, glowR);
          gg.addColorStop(0,   `rgba(${r},${g},${b},${Math.min(gv * 1.2, 0.88)})`);
          gg.addColorStop(0.4, `rgba(${r},${g},${b},${gv * 0.35})`);
          gg.addColorStop(1,   `rgba(${r},${g},${b},0)`);
          ctx2d.beginPath();
          ctx2d.arc(colX, yPos, glowR, 0, Math.PI * 2);
          ctx2d.fillStyle = gg;
          ctx2d.fill();
        }

        // Core circle
        const coreR = 5 + gv * 13;
        ctx2d.beginPath();
        ctx2d.arc(colX, yPos, coreR, 0, Math.PI * 2);
        ctx2d.fillStyle = `rgba(${r},${g},${b},${0.15 + gv * 0.85})`;
        ctx2d.fill();

        // Note label (left of circle)
        ctx2d.fillStyle = `rgba(200,200,200,${0.22 + gv * 0.60})`;
        ctx2d.font      = `${10 + gv * 3}px monospace`;
        ctx2d.textAlign = "right";
        ctx2d.fillText(OSC_LABELS[i], colX - 22, yPos + 4);

        // Hz label (right of circle, visible only when bright)
        if (gv > 0.25) {
          const freq = A1_HZ * Math.pow(2, i + ph);
          const fStr = freq < 1000 ? `${freq.toFixed(0)}` : `${(freq / 1000).toFixed(1)}k`;
          ctx2d.fillStyle = `rgba(150,150,150,${gv * 0.45})`;
          ctx2d.font      = "9px monospace";
          ctx2d.textAlign = "left";
          ctx2d.fillText(`${fStr}Hz`, colX + coreR + 5, yPos + 4);
        }
      }

      // Phase cursor arrow (points at current octave position on the column)
      const arrowY = colBot - rawPhase * (colBot - colTop);
      ctx2d.beginPath();
      ctx2d.moveTo(colX + 6, arrowY);
      ctx2d.lineTo(colX + 16, arrowY - 5);
      ctx2d.lineTo(colX + 16, arrowY + 5);
      ctx2d.closePath();
      ctx2d.fillStyle = "rgba(255,255,255,0.55)";
      ctx2d.fill();

      // Bottom caption
      ctx2d.fillStyle  = "rgba(120,120,120,0.45)";
      ctx2d.font       = "11px monospace";
      ctx2d.textAlign  = "center";
      ctx2d.fillText(
        ascendingRef.current
          ? "↑  the tone rises forever — and never arrives"
          : "↓  the tone falls forever — and never lands",
        cx, H - 13
      );
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [running]);

  // ── JSX ──────────────────────────────────────────────────────────────────────
  const effectiveRate = hudRate.toFixed(1);

  return (
    <div style={{ background: "#04040e", minHeight: "100vh", color: "#e0e0e0", fontFamily: "monospace" }}>
      {/* Full-screen canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
      />

      {/* Controls panel — overlaid top-left */}
      <div style={{
        position: "relative", zIndex: 10,
        padding: "18px 20px",
        maxWidth: 390,
        background: "rgba(4,4,14,0.72)",
        backdropFilter: "blur(4px)",
      }}>
        {/* Breadcrumb */}
        <div style={{ marginBottom: 6 }}>
          <Link href="/dream" style={{ color: "#555", fontSize: 11, textDecoration: "none" }}>
            ← dream
          </Link>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 2px", letterSpacing: "-0.4px" }}>
          Shepard Tone
        </h1>
        <p style={{ fontSize: 12, color: "#777", margin: "0 0 14px", lineHeight: 1.45 }}>
          An endless musical staircase. The tone rises forever — and never arrives.
        </p>

        {/* Primary start/stop */}
        {!running ? (
          <button
            onClick={startAudio}
            style={{
              background: "#5820c0", color: "#fff", border: "none",
              borderRadius: 6, padding: "9px 22px", cursor: "pointer",
              fontSize: 13, fontFamily: "monospace", marginBottom: 14,
            }}
          >
            ▶ Start
          </button>
        ) : (
          <button
            onClick={stopAudio}
            style={{
              background: "#1a1a2a", color: "#aaa", border: "1px solid #444",
              borderRadius: 6, padding: "9px 22px", cursor: "pointer",
              fontSize: 13, fontFamily: "monospace", marginBottom: 14,
            }}
          >
            ■ Stop
          </button>
        )}

        {running && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Ascending / Descending */}
            <div style={{ display: "flex", gap: 6 }}>
              {(["Ascending", "Descending"] as const).map(dir => {
                const isAsc = dir === "Ascending";
                const active = ascending === isAsc;
                return (
                  <button
                    key={dir}
                    onClick={() => setAscending(isAsc)}
                    style={{
                      flex: 1, fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                      padding: "7px 0", borderRadius: 5,
                      background: active ? "#18103a" : "#0e0e1a",
                      border: `1px solid ${active ? "#5820c0" : "#2a2a3a"}`,
                      color: active ? "#a080ff" : "#555",
                    }}
                  >
                    {isAsc ? "↑ Ascending" : "↓ Descending"}
                  </button>
                );
              })}
            </div>

            {/* Interval mode */}
            <div style={{ display: "flex", gap: 6 }}>
              {(["chromatic", "whole", "semitone"] as const).map(m => {
                const labels: Record<IntervalMode, string> = {
                  chromatic: "Glide", whole: "Whole-tone", semitone: "Semitone",
                };
                const active = intervalMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setIntervalMode(m)}
                    style={{
                      flex: 1, fontFamily: "monospace", fontSize: 11, cursor: "pointer",
                      padding: "6px 0", borderRadius: 5,
                      background: active ? "#18103a" : "#0e0e1a",
                      border: `1px solid ${active ? "#5820c0" : "#2a2a3a"}`,
                      color: active ? "#a080ff" : "#555",
                    }}
                  >
                    {labels[m]}
                  </button>
                );
              })}
            </div>

            {/* Freeze */}
            <button
              onClick={() => setFrozen(f => !f)}
              style={{
                fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                padding: "7px 0", borderRadius: 5,
                background: frozen ? "#1e1205" : "#0e0e1a",
                border: `1px solid ${frozen ? "#ff9030" : "#2a2a3a"}`,
                color: frozen ? "#ff9030" : "#555",
              }}
            >
              {frozen ? "❄ Frozen — click to resume" : "❄ Freeze"}
            </button>

            {/* Rate slider */}
            <div>
              <div style={{ fontSize: 11, color: "#777", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                <span>Rate (BPM = octaves/min)</span>
                <span style={{ color: "#ccc" }}>
                  {effectiveRate}
                  {micMode ? " (mic)" : ""}
                </span>
              </div>
              <input
                type="range" min={0.5} max={30} step={0.5} value={rate}
                onChange={e => setRate(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#5820c0" }}
              />
              <div style={{ fontSize: 10, color: "#444", display: "flex", justifyContent: "space-between" }}>
                <span>0.5 — meditative</span>
                <span>30 — dizzying</span>
              </div>
            </div>

            {/* Mic mode */}
            {!micMode ? (
              <button
                onClick={activateMic}
                style={{
                  fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                  padding: "7px 0", borderRadius: 5,
                  background: "#0e0e1a", border: "1px solid #2a2a3a", color: "#555",
                }}
              >
                🎤 Mic mode — loud input = faster ascent
              </button>
            ) : (
              <div style={{
                padding: "7px 12px", borderRadius: 5, fontSize: 12,
                background: "#04120a", border: "1px solid #1a4a2a", color: "#50a050",
                textAlign: "center",
              }}>
                🎤 mic live — amplitude accelerates glide
              </div>
            )}
            {micError && (
              <div style={{ fontSize: 11, color: "#c04040" }}>{micError}</div>
            )}

            {/* Readout */}
            <div style={{ fontSize: 10, color: "#333", display: "flex", gap: 14 }}>
              <span>phase {(hudPhase * 100).toFixed(0)}%</span>
              <span>
                loudest: {OSC_LABELS[hudGains.indexOf(Math.max(...hudGains))]}
                {" "}({(A1_HZ * Math.pow(2, hudGains.indexOf(Math.max(...hudGains)) + hudPhase)).toFixed(0)} Hz)
              </span>
            </div>
          </div>
        )}

        {/* Explainer (only when stopped) */}
        {!running && (
          <div style={{ fontSize: 11, color: "#555", marginTop: 6, lineHeight: 1.55 }}>
            <strong style={{ color: "#777" }}>What is a Shepard tone?</strong><br />
            8 sine waves, spaced one octave apart, all gliding upward together.
            As the highest fades to silence, a new tone fades in at the bottom —
            seamlessly. Your brain hears only the loud middle tones, which are always
            ascending. The staircase has no top floor.
            <br /><br />
            <em style={{ color: "#444" }}>Discovered by Roger Shepard (1964). Use headphones.</em>
          </div>
        )}

        {/* Design notes link */}
        <div style={{ marginTop: 16, paddingTop: 10, borderTop: "1px solid #1a1a2a" }}>
          <Link href="/dream/40-shepard-tone/README.md" style={{ fontSize: 10, color: "#444" }}>
            design notes ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
