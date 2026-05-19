"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── AudioWorklet: FFT spectral magnitude interpolation ─────────────────────
// Two input channels A and B. Each hop (256 samples) the processor:
//   1. Copies the N=1024 most-recent samples from each ring buffer
//   2. Applies Hann window + FFT to each
//   3. Interpolates magnitudes: |blend| = (1-t)|A| + t|B|, phase from A
//   4. IFFT + Hann window + overlap-add into the output ring
// The OLA normalization factor is 2*hop/N = 0.5 (Hann, 4× overlap).

const WORKLET_CODE = `
class SpectralMorphProc extends AudioWorkletProcessor {
  constructor() {
    super();
    this.N = 1024;
    this.hop = 256;
    this.bs = this.N * 2; // OLA ring size
    this.ringA = new Float32Array(this.N);
    this.ringB = new Float32Array(this.N);
    this.olaOut = new Float32Array(this.bs);
    this.wPos = 0; this.rPos = 0;
    this.countdown = this.N; // wait for ring to fill before first FFT
    this.t = 0.5;
    const N = this.N, TAU = 6.283185307;
    this.hann = new Float32Array(N);
    for (let i = 0; i < N; i++) this.hann[i] = 0.5 * (1 - Math.cos(TAU * i / N));
    const bits = Math.round(Math.log2(N));
    this.br = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      let rev = 0, x = i;
      for (let b = 0; b < bits; b++) { rev = (rev << 1) | (x & 1); x >>= 1; }
      this.br[i] = rev;
    }
    this.cosL = new Float32Array(N >> 1);
    this.sinL = new Float32Array(N >> 1);
    for (let k = 0; k < N >> 1; k++) {
      const a = -TAU * k / N;
      this.cosL[k] = Math.cos(a);
      this.sinL[k] = Math.sin(a);
    }
    this.port.onmessage = e => { if (e.data.t !== undefined) this.t = e.data.t; };
  }

  fft(re, im, inv) {
    const N = this.N;
    for (let i = 0; i < N; i++) {
      const j = this.br[i];
      if (j > i) {
        let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
        tmp = im[i]; im[i] = im[j]; im[j] = tmp;
      }
    }
    for (let s = 2; s <= N; s <<= 1) {
      const hs = s >> 1, step = (N / s) | 0;
      for (let k = 0; k < N; k += s) {
        for (let j = 0; j < hs; j++) {
          const kk = j * step;
          const wr = this.cosL[kk];
          const wi = inv ? -this.sinL[kk] : this.sinL[kk];
          const tr = wr * re[k+hs+j] - wi * im[k+hs+j];
          const ti = wr * im[k+hs+j] + wi * re[k+hs+j];
          re[k+hs+j] = re[k+j] - tr; im[k+hs+j] = im[k+j] - ti;
          re[k+j] += tr; im[k+j] += ti;
        }
      }
    }
    if (inv) { const sc = 1/N; for (let i=0;i<N;i++){re[i]*=sc; im[i]*=sc;} }
  }

  process(inputs, outputs) {
    const A = inputs[0] && inputs[0][0];
    const B = inputs[1] && inputs[1][0];
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    const N = this.N, bs = this.bs;
    for (let i = 0; i < out.length; i++) {
      this.ringA[this.wPos % N] = A ? A[i] : 0;
      this.ringB[this.wPos % N] = B ? B[i] : 0;
      this.wPos++;
      if (--this.countdown <= 0) { this.countdown = this.hop; this.morph(); }
      out[i] = this.olaOut[this.rPos % bs];
      this.olaOut[this.rPos % bs] = 0;
      this.rPos++;
    }
    return true;
  }

  morph() {
    const N = this.N, bs = this.bs, wp = this.wPos;
    const reA = new Float32Array(N), imA = new Float32Array(N);
    const reB = new Float32Array(N), imB = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const idx = (wp + i) % N;
      reA[i] = this.ringA[idx] * this.hann[i];
      reB[i] = this.ringB[idx] * this.hann[i];
    }
    this.fft(reA, imA, false);
    this.fft(reB, imB, false);
    const t = this.t;
    const reO = new Float32Array(N), imO = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const mA = Math.sqrt(reA[k]*reA[k] + imA[k]*imA[k]);
      const mB = Math.sqrt(reB[k]*reB[k] + imB[k]*imB[k]);
      const m = (1-t)*mA + t*mB;
      const ph = Math.atan2(imA[k], reA[k]);
      reO[k] = m * Math.cos(ph); imO[k] = m * Math.sin(ph);
    }
    this.fft(reO, imO, true);
    const scale = 2 * this.hop / N;
    const rp = this.rPos;
    for (let i = 0; i < N; i++) this.olaOut[(rp+i) % bs] += reO[i] * this.hann[i] * scale;
  }
}
registerProcessor('spectral-morph-proc', SpectralMorphProc);
`;

// ── Types ──────────────────────────────────────────────────────────────────

type SrcBType = "sine" | "triangle" | "noise";
type AppMode = "idle" | "demo" | "mic";

interface AudioNodes {
  ctx: AudioContext;
  worklet: AudioWorkletNode;
  anlA: AnalyserNode;
  anlB: AnalyserNode;
  anlOut: AnalyserNode;
  srcBNode: AudioScheduledSourceNode;
  stream?: MediaStream;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SpectralMorphPage() {
  const [mode, setMode] = useState<AppMode>("idle");
  const [morphT, setMorphT] = useState(0.5);
  const [srcB, setSrcB] = useState<SrcBType>("sine");
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioNodes | null>(null);
  const rafRef = useRef(0);
  const morphTRef = useRef(0.5);

  useEffect(() => {
    morphTRef.current = morphT;
    audioRef.current?.worklet.port.postMessage({ t: morphT });
  }, [morphT]);

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const a = audioRef.current;
    if (a) {
      try { a.srcBNode.stop(); } catch { /* already stopped */ }
      a.stream?.getTracks().forEach(t => t.stop());
      void a.ctx.close();
      audioRef.current = null;
    }
    setMode("idle");
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const launch = useCallback(async (launchMode: "demo" | "mic") => {
    stopAll();
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new Ctx() as AudioContext;

      const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      const worklet = new AudioWorkletNode(ctx, "spectral-morph-proc", {
        numberOfInputs: 2, numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      worklet.port.postMessage({ t: morphTRef.current });

      const anlA = ctx.createAnalyser(); anlA.fftSize = 1024;
      const anlB = ctx.createAnalyser(); anlB.fftSize = 1024;
      const anlOut = ctx.createAnalyser(); anlOut.fftSize = 1024;

      // Source B: synth (always)
      let srcBNode: AudioScheduledSourceNode;
      if (srcB === "noise") {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        const bsrc = ctx.createBufferSource();
        bsrc.buffer = buf; bsrc.loop = true; bsrc.start();
        srcBNode = bsrc;
      } else {
        const osc = ctx.createOscillator();
        osc.type = srcB === "triangle" ? "triangle" : "sine";
        osc.frequency.value = 130.81; // C3
        osc.start();
        srcBNode = osc;
      }
      const gainB = ctx.createGain(); gainB.gain.value = 0.35;
      srcBNode.connect(gainB);
      gainB.connect(anlB);
      gainB.connect(worklet, 0, 1);

      let stream: MediaStream | undefined;
      if (launchMode === "demo") {
        const oscA = ctx.createOscillator();
        oscA.type = "sawtooth"; oscA.frequency.value = 130.81;
        oscA.start();
        const gainA = ctx.createGain(); gainA.gain.value = 0.35;
        oscA.connect(gainA);
        gainA.connect(anlA);
        gainA.connect(worklet, 0, 0);
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const mic = ctx.createMediaStreamSource(stream);
        const gainA = ctx.createGain(); gainA.gain.value = 2.0;
        mic.connect(gainA);
        gainA.connect(anlA);
        gainA.connect(worklet, 0, 0);
      }

      worklet.connect(anlOut);
      anlOut.connect(ctx.destination);
      audioRef.current = { ctx, worklet, anlA, anlB, anlOut, srcBNode, stream };
      setMode(launchMode);
      startViz();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio setup failed");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcB, stopAll]);

  const startViz = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gfx = canvas.getContext("2d");
    if (!gfx) return;

    const BINS = 200; // visible frequency bins (up to ~8 kHz)
    const bufA = new Float32Array(512);
    const bufB = new Float32Array(512);
    const bufO = new Float32Array(512);

    function tick() {
      rafRef.current = requestAnimationFrame(tick);
      const a = audioRef.current;
      if (!a || !canvas || !gfx) return;
      a.anlA.getFloatFrequencyData(bufA as unknown as Float32Array<ArrayBuffer>);
      a.anlB.getFloatFrequencyData(bufB as unknown as Float32Array<ArrayBuffer>);
      a.anlOut.getFloatFrequencyData(bufO as unknown as Float32Array<ArrayBuffer>);

      const W = canvas.width, H = canvas.height;
      gfx.fillStyle = "rgba(0,0,0,0.88)";
      gfx.fillRect(0, 0, W, H);

      const MARGIN = 8;
      const panelH = Math.floor((H - 80) / 3);
      // Top=B, Middle=Blend, Bottom=A (matches spec: A=bottom, blend=center, B=top)
      const panels: [string, Float32Array, string][] = [
        ["SOURCE B", bufB, "#55aaff"],
        ["BLEND  (" + morphTRef.current.toFixed(2) + ")", bufO, "#ffffff"],
        ["SOURCE A", bufA, "#ff8844"],
      ];

      panels.forEach(([label, data, accent], pi) => {
        const y0 = MARGIN + pi * (panelH + 8);
        const barW = (W - 2 * MARGIN) / BINS;

        // dim background
        gfx.fillStyle = "#0a0a0a";
        gfx.fillRect(MARGIN, y0, W - 2 * MARGIN, panelH);

        for (let b = 0; b < BINS; b++) {
          const db = data[b] ?? -100;
          const norm = Math.max(0, Math.min(1, (db + 80) / 70));
          const barH = norm * (panelH - 16);
          // hue gradient: violet (low) → orange (high)
          const hue = 260 - (b / BINS) * 230;
          const lit = 35 + norm * 35;
          gfx.fillStyle = `hsl(${hue},85%,${lit}%)`;
          gfx.fillRect(
            MARGIN + b * barW,
            y0 + panelH - 16 - barH,
            barW - 0.5,
            barH,
          );
        }

        // label strip
        gfx.fillStyle = "#111";
        gfx.fillRect(MARGIN, y0 + panelH - 14, W - 2 * MARGIN, 14);
        gfx.fillStyle = accent;
        gfx.font = "9px monospace";
        gfx.fillText(label, MARGIN + 4, y0 + panelH - 3);

        // panel border
        gfx.strokeStyle = "#333";
        gfx.lineWidth = 1;
        gfx.strokeRect(MARGIN, y0, W - 2 * MARGIN, panelH);
      });

      // Morph T cursor — vertical line across all panels
      const tx = MARGIN + morphTRef.current * (W - 2 * MARGIN);
      gfx.strokeStyle = "rgba(255,255,255,0.25)";
      gfx.lineWidth = 1;
      gfx.setLineDash([3, 4]);
      gfx.beginPath();
      gfx.moveTo(tx, MARGIN);
      gfx.lineTo(tx, MARGIN + 3 * panelH + 2 * 8);
      gfx.stroke();
      gfx.setLineDash([]);

      // T=0 / T=1 labels at bottom
      gfx.fillStyle = "#555";
      gfx.font = "9px monospace";
      gfx.fillText("A", MARGIN + 2, H - 6);
      gfx.textAlign = "right";
      gfx.fillText("B", W - MARGIN - 2, H - 6);
      gfx.textAlign = "left";
    }
    tick();
  }, []);

  // ── UI ─────────────────────────────────────────────────────────────────

  const idle = mode === "idle";
  const running = mode === "demo" || mode === "mic";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#ddd", fontFamily: "monospace" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>
            34 — Spectral Morph
          </h1>
          <p style={{ fontSize: 12, color: "#666", margin: "6px 0 0" }}>
            Blend the spectral character of two audio sources via FFT magnitude interpolation.
            The morphed output is a genuinely new timbre — not a crossfade.
          </p>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          width={700}
          height={360}
          style={{ width: "100%", display: "block", borderRadius: 4, background: "#000", marginBottom: 16 }}
        />

        {/* Morph slider */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 11, color: "#888", display: "block", marginBottom: 4 }}>
            MORPH  A ←————→ B &nbsp; {morphT.toFixed(2)}
          </label>
          <input
            type="range" min={0} max={1} step={0.01}
            value={morphT}
            onChange={e => setMorphT(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "#fff" }}
          />
        </div>

        {/* Source B selector */}
        {idle && (
          <div style={{ marginBottom: 14, fontSize: 11, color: "#888" }}>
            <span>Source B waveform: &nbsp;</span>
            {(["sine", "triangle", "noise"] as SrcBType[]).map(s => (
              <button
                key={s}
                onClick={() => setSrcB(s)}
                style={{
                  marginRight: 6, padding: "2px 10px", fontSize: 11,
                  background: srcB === s ? "#333" : "transparent",
                  color: srcB === s ? "#fff" : "#666",
                  border: "1px solid " + (srcB === s ? "#555" : "#333"),
                  borderRadius: 3, cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {running && (
          <div style={{ marginBottom: 14, fontSize: 11, color: "#555" }}>
            Source B: <span style={{ color: "#888" }}>{srcB} @ C3 (130 Hz)</span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {idle ? (
            <>
              <button onClick={() => launch("demo")} style={btnStyle("#22c55e")}>
                ▶ Demo (sawtooth → {srcB})
              </button>
              <button onClick={() => launch("mic")} style={btnStyle("#3b82f6")}>
                🎤 Start mic
              </button>
            </>
          ) : (
            <button onClick={stopAll} style={btnStyle("#ef4444")}>
              ■ Stop
            </button>
          )}
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "#f87171", marginBottom: 12 }}>{error}</p>
        )}

        {/* Explanation */}
        <div style={{ fontSize: 11, color: "#555", lineHeight: 1.6, borderTop: "1px solid #1a1a1a", paddingTop: 12 }}>
          <strong style={{ color: "#888" }}>How it works:</strong>{" "}
          Every 256 samples, the AudioWorklet FFTs both sources (1024-point Cooley-Tukey),
          blends the magnitude spectra linearly, keeps Source A&apos;s phase, then IFFTs
          back to audio via overlap-add synthesis. Moving the slider to 0.5 produces a
          timbre distinct from either source — unlike a crossfade, which just mixes them.
          <br /><br />
          <strong style={{ color: "#888" }}>Demo:</strong>{" "}
          Source A = sawtooth (many harmonics, 1/n decay). Source B = {srcB}.
          At full A the buzz is clear; at full B only the fundamental remains;
          at 0.5 the harmonics are halved in amplitude, changing the timbral quality.
          <br /><br />
          <strong style={{ color: "#888" }}>Mic mode:</strong>{" "}
          Play piano or sing into Source A. Source B is always a synth tone.
          Morph toward B to gradually dissolve your playing into a {srcB} wave
          at the same frequency and phase structure.
        </div>

        <Link
          href="/dream"
          style={{ display: "inline-block", marginTop: 20, fontSize: 11, color: "#555", textDecoration: "none" }}
        >
          ← dream sandbox
        </Link>
        &nbsp;·&nbsp;
        <Link
          href="/dream/34-spectral-morph/README.md"
          style={{ fontSize: 11, color: "#555", textDecoration: "none" }}
        >
          design notes
        </Link>
      </div>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "8px 16px", fontSize: 12, fontFamily: "monospace",
    background: color + "22", color, border: `1px solid ${color}55`,
    borderRadius: 4, cursor: "pointer",
  };
}
