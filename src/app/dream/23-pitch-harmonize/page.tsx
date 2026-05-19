"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── AudioWorklet pitch shifter ─────────────────────────────────────────────
// Two-grain ring-buffer pitch shift (Jungle-style). Grain size = 4096 samples
// (~93ms at 44.1kHz). Two read pointers offset by N/2; cross-fade weight =
// distance from write pointer / N so the grain furthest from the write head
// dominates. Artifact-free for sustained notes; audible artifacts on sharp
// transients (acceptable for a harmonizer prototype).

const WORKLET_CODE = `
class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 1.0, minValue: 0.25, maxValue: 4.0, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.N = 4096;
    this.buf = new Float32Array(this.N);
    this.wp = 0;
    this.rp = 0;
    this.rp2 = this.N / 2;
  }
  process(inputs, outputs, parameters) {
    const inp = inputs[0] && inputs[0][0];
    const out = outputs[0] && outputs[0][0];
    if (!inp || !out) return true;
    const ratio = parameters.pitch[0] !== undefined ? parameters.pitch[0] : 1.0;
    const N = this.N;
    for (let i = 0; i < inp.length; i++) {
      this.buf[this.wp % N] = inp[i];
      this.wp++;
      const ri1 = Math.floor(this.rp) % N;
      const ri2 = Math.floor(this.rp2) % N;
      const d1 = (this.wp - ri1 + N) % N;
      const d2 = (this.wp - ri2 + N) % N;
      let w1 = d1 / N;
      let w2 = d2 / N;
      const s = w1 + w2;
      if (s > 0.001) { w1 /= s; w2 /= s; }
      out[i] = this.buf[ri1] * w1 + this.buf[ri2] * w2;
      this.rp = (this.rp + ratio) % N;
      this.rp2 = (this.rp2 + ratio) % N;
    }
    return true;
  }
}
registerProcessor('pitch-shifter', PitchShifterProcessor);
`;

// ── Intervals ─────────────────────────────────────────────────────────────

const INTERVALS = [
  { label: "+4th",  semitones:  5, ratio: Math.pow(2,  5 / 12) },
  { label: "+5th",  semitones:  7, ratio: Math.pow(2,  7 / 12) },
  { label: "+8va",  semitones: 12, ratio: 2.0                   },
  { label: "-8va",  semitones: -12, ratio: 0.5                  },
];

// ── Phase-portrait scope painter ──────────────────────────────────────────
// Plots (buf[i], buf[i+delay]) as a line trail. Additive blending gives
// CRT glow. A single sustained pitch draws an ellipse; a chord draws loops.

const N_SCOPE = 2048;

function drawTrail(
  ctx: CanvasRenderingContext2D,
  buf: Float32Array,
  delay: number,
  sz: number,
  hue: number,
): void {
  const r = sz / 2;
  const n = Math.min(buf.length - delay, N_SCOPE);
  if (n < 2) return;
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = `hsla(${hue},90%,65%,0.55)`;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = (buf[i] + 1) * r;
    const y = (1 - buf[i + delay]) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

// ── Types ─────────────────────────────────────────────────────────────────

interface AudioState {
  ctx: AudioContext;
  stream: MediaStream;
  worklet: AudioWorkletNode;
  harmGainNode: GainNode;
  harmPanner: PannerNode;
  dryAnalyser: AnalyserNode;
  harmAnalyser: AnalyserNode;
  dryBuf: Float32Array;
  harmBuf: Float32Array;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function PitchHarmonizePage() {
  const [mode, setMode]         = useState<"idle" | "active">("idle");
  const [error, setError]       = useState<string | null>(null);
  const [ivIdx, setIvIdx]       = useState(1);   // default: +5th
  const [azimuth, setAzimuth]   = useState(60);  // degrees, -90=left +90=right
  const [harmVol, setHarmVol]   = useState(0.75);

  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const animRef    = useRef(0);
  const audioRef   = useRef<AudioState | null>(null);

  // ── Stop ────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    const a = audioRef.current;
    if (a) {
      a.stream.getTracks().forEach(t => t.stop());
      void a.ctx.close();
      audioRef.current = null;
    }
    setMode("idle");
  }, []);

  // ── Start ────────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });

      const Ctx: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx();
      await ctx.resume();

      // Load worklet from inline Blob
      const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
      const url  = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);

      const source = ctx.createMediaStreamSource(stream);

      // ── Dry chain: source → dryAnalyser → dryPanner(center) → dest ──
      const dryAnalyser = ctx.createAnalyser();
      dryAnalyser.fftSize = 4096;
      dryAnalyser.smoothingTimeConstant = 0;
      const dryPanner = ctx.createPanner();
      dryPanner.panningModel = "HRTF";
      dryPanner.setPosition(0, 0, -1);
      source.connect(dryAnalyser);
      dryAnalyser.connect(dryPanner);
      dryPanner.connect(ctx.destination);

      // ── Harmony chain: source → worklet → harmGain → harmAnalyser → harmPanner → dest ──
      const worklet = new AudioWorkletNode(ctx, "pitch-shifter");
      worklet.parameters.get("pitch")!.value = INTERVALS[ivIdx].ratio;

      const harmGainNode = ctx.createGain();
      harmGainNode.gain.value = harmVol;

      const harmAnalyser = ctx.createAnalyser();
      harmAnalyser.fftSize = 4096;
      harmAnalyser.smoothingTimeConstant = 0;

      const harmPanner = ctx.createPanner();
      harmPanner.panningModel = "HRTF";
      const azRad = (azimuth * Math.PI) / 180;
      harmPanner.setPosition(Math.sin(azRad), 0, -Math.cos(azRad));

      source.connect(worklet);
      worklet.connect(harmGainNode);
      harmGainNode.connect(harmAnalyser);
      harmAnalyser.connect(harmPanner);
      harmPanner.connect(ctx.destination);

      const dryBuf  = new Float32Array(new ArrayBuffer(dryAnalyser.fftSize * 4));
      const harmBuf = new Float32Array(new ArrayBuffer(harmAnalyser.fftSize * 4));

      audioRef.current = {
        ctx, stream, worklet, harmGainNode, harmPanner,
        dryAnalyser, harmAnalyser, dryBuf, harmBuf,
      };
      setError(null);
      setMode("active");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone unavailable. Check permissions.");
    }
  }, [ivIdx, azimuth, harmVol]);

  // ── Live-update interval ──────────────────────────────────────────────

  useEffect(() => {
    const a = audioRef.current;
    if (!a || mode !== "active") return;
    a.worklet.parameters.get("pitch")!.value = INTERVALS[ivIdx].ratio;
  }, [ivIdx, mode]);

  // ── Live-update harmony panner position ──────────────────────────────

  useEffect(() => {
    const a = audioRef.current;
    if (!a || mode !== "active") return;
    const azRad = (azimuth * Math.PI) / 180;
    a.harmPanner.setPosition(Math.sin(azRad), 0, -Math.cos(azRad));
  }, [azimuth, mode]);

  // ── Live-update harmony volume ────────────────────────────────────────

  useEffect(() => {
    const a = audioRef.current;
    if (!a || mode !== "active") return;
    a.harmGainNode.gain.value = harmVol;
  }, [harmVol, mode]);

  // ── Animation loop ────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== "active") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let sz = 0;
    let delay = 882; // 20ms @ 44100 Hz

    const resize = () => {
      sz = Math.min(canvas.offsetWidth, canvas.offsetHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = sz * dpr;
      canvas.height = sz * dpr;
      ctx2d.scale(dpr, dpr);
      const a = audioRef.current;
      if (a) delay = Math.round(0.020 * a.ctx.sampleRate);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const a = audioRef.current;
      if (!a || sz === 0) return;

      // Slow fade — persistent CRT glow
      ctx2d.fillStyle = "rgba(0,0,0,0.10)";
      ctx2d.fillRect(0, 0, sz, sz);

      a.dryAnalyser.getFloatTimeDomainData(
        a.dryBuf  as unknown as Float32Array<ArrayBuffer>,
      );
      a.harmAnalyser.getFloatTimeDomainData(
        a.harmBuf as unknown as Float32Array<ArrayBuffer>,
      );

      drawTrail(ctx2d, a.dryBuf,  delay, sz, 30);   // warm orange
      drawTrail(ctx2d, a.harmBuf, delay, sz, 205);   // cool blue
    };
    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [mode]);

  // ── Cleanup on unmount ────────────────────────────────────────────────

  useEffect(() => () => stop(), [stop]);

  // ── Shared control styles ─────────────────────────────────────────────

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "7px 14px",
    fontSize: 11,
    letterSpacing: "0.07em",
    background: active ? "#fff" : "transparent",
    color: active ? "#000" : "#555",
    border: `1px solid ${active ? "#fff" : "#2a2a2a"}`,
    cursor: "pointer",
    fontFamily: "inherit",
  });

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}>

      {/* Title bar */}
      <div style={{ padding: "16px 20px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #111" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 3 }}>
            PITCH HARMONIZE
          </div>
          <div style={{ fontSize: 11, color: "#555" }}>
            Mic → pitch-shifted harmony → HRTF 3D position · dual phase-portrait scope
          </div>
        </div>
        <Link href="/dream/23-pitch-harmonize/README.md"
          style={{ fontSize: 10, color: "#333", textDecoration: "underline" }}>
          design notes
        </Link>
      </div>

      {/* Main */}
      {mode === "idle" ? (
        // ── Idle: setup + launch ──────────────────────────────────────────
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: "24px 24px" }}>

          {/* Interval picker */}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#444", letterSpacing: "0.1em", marginBottom: 10 }}>INTERVAL</div>
            <div style={{ display: "flex", gap: 6 }}>
              {INTERVALS.map((iv, i) => (
                <button key={iv.label} onClick={() => setIvIdx(i)} style={btnStyle(i === ivIdx)}>
                  {iv.label}
                </button>
              ))}
            </div>
          </div>

          {/* Spatial controls */}
          <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#444", letterSpacing: "0.08em" }}>HARMONY POSITION</span>
              <input type="range" min={-90} max={90} value={azimuth}
                onChange={e => setAzimuth(Number(e.target.value))} style={{ width: 180 }} />
              <span style={{ fontSize: 10, color: "#333" }}>
                {azimuth > 0 ? `${azimuth}° right` : azimuth < 0 ? `${-azimuth}° left` : "center"}
              </span>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#444", letterSpacing: "0.08em" }}>HARMONY VOLUME</span>
              <input type="range" min={0} max={1} step={0.05} value={harmVol}
                onChange={e => setHarmVol(Number(e.target.value))} style={{ width: 180 }} />
              <span style={{ fontSize: 10, color: "#333" }}>{Math.round(harmVol * 100)}%</span>
            </label>
          </div>

          <button onClick={start} style={{
            padding: "12px 32px", fontSize: 13, letterSpacing: "0.12em",
            background: "transparent", color: "#fff", border: "1px solid #fff",
            cursor: "pointer", fontFamily: "inherit",
          }}>
            START MIC
          </button>

          {error && <div style={{ color: "#f55", fontSize: 12 }}>{error}</div>}

          <div style={{ fontSize: 10, color: "#2a2a2a", textAlign: "center", maxWidth: 380, lineHeight: 1.7 }}>
            Wear headphones · play piano or sing a sustained note · your harmony floats to {azimuth > 0 ? "the right" : azimuth < 0 ? "the left" : "center"} ·
            orange scope = dry · blue scope = harmony
          </div>
        </div>

      ) : (
        // ── Active: scope + controls ──────────────────────────────────────
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

          {/* Scope canvas */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, position: "relative" }}>
            <canvas
              ref={canvasRef}
              style={{ width: "min(80vw, calc(100vh - 160px))", height: "min(80vw, calc(100vh - 160px))", display: "block" }}
            />
            {/* Legend */}
            <div style={{ position: "absolute", top: 12, right: 16, fontSize: 10, lineHeight: 1.8, textAlign: "right" }}>
              <div style={{ color: "hsl(30,90%,65%)" }}>■ dry</div>
              <div style={{ color: "hsl(205,90%,65%)" }}>■ {INTERVALS[ivIdx].label} harmony</div>
            </div>
            {/* Scope hint */}
            <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, textAlign: "center", fontSize: 9, color: "#222" }}>
              phase portrait — signal[t] vs signal[t+20ms]
            </div>
          </div>

          {/* Controls bar */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 16px", borderTop: "1px solid #111" }}>

            {/* Interval buttons */}
            {INTERVALS.map((iv, i) => (
              <button key={iv.label} onClick={() => setIvIdx(i)} style={btnStyle(i === ivIdx)}>
                {iv.label}
              </button>
            ))}

            <div style={{ width: 1, height: 24, background: "#1a1a1a", margin: "0 4px" }} />

            {/* Azimuth */}
            <span style={{ fontSize: 10, color: "#444" }}>pos</span>
            <input type="range" min={-90} max={90} value={azimuth}
              onChange={e => setAzimuth(Number(e.target.value))} style={{ width: 90 }} />
            <span style={{ fontSize: 10, color: "#333", minWidth: 40 }}>
              {azimuth > 0 ? `R${azimuth}°` : azimuth < 0 ? `L${-azimuth}°` : "ctr"}
            </span>

            {/* Harmony vol */}
            <span style={{ fontSize: 10, color: "#444" }}>harm</span>
            <input type="range" min={0} max={1} step={0.05} value={harmVol}
              onChange={e => setHarmVol(Number(e.target.value))} style={{ width: 70 }} />

            <button onClick={stop} style={{ ...btnStyle(false), marginLeft: "auto" }}>
              stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
