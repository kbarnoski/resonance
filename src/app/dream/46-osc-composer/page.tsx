"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { CSSProperties } from "react";

// --- WAV encoder (stereo, 16-bit PCM) ---
function buildWAV(L: Float32Array, R: Float32Array, sr: number): ArrayBuffer {
  const ns = L.length;
  const sz = ns * 4; // 2 channels × 2 bytes
  const buf = new ArrayBuffer(44 + sz);
  const v = new DataView(buf);
  const ws = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  ws(0, "RIFF"); v.setUint32(4, 36 + sz, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 2, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  ws(36, "data"); v.setUint32(40, sz, true);
  let o = 44;
  for (let i = 0; i < ns; i++) {
    v.setInt16(o, Math.round(Math.max(-0.999, Math.min(0.999, L[i])) * 32767), true); o += 2;
    v.setInt16(o, Math.round(Math.max(-0.999, Math.min(0.999, R[i])) * 32767), true); o += 2;
  }
  return buf;
}

// --- Lissajous renderer (analytical, module-level = stable) ---
function paintFigure(
  ctx: CanvasRenderingContext2D,
  rL: number, rR: number, phDeg: number,
  cx: number, cy: number, rad: number,
  color: string, alpha: number
) {
  const ph = (phDeg * Math.PI) / 180;
  const N = 3000;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = cx + rad * Math.sin(rL * t);
    const y = cy - rad * Math.sin(rR * t + ph);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

// --- Presets & puzzles ---
interface Shape { name: string; rL: number; rR: number; ph: number; note: string }

const PRESETS: Shape[] = [
  { name: "Circle",   rL: 1, rR: 1, ph: 90,  note: "1:1 · unison" },
  { name: "Figure-8", rL: 1, rR: 2, ph: 0,   note: "1:2 · octave" },
  { name: "Trefoil",  rL: 2, rR: 3, ph: 0,   note: "2:3 · 5th" },
  { name: "Rose",     rL: 3, rR: 4, ph: 0,   note: "3:4 · 4th" },
  { name: "Starburst",rL: 3, rR: 5, ph: 36,  note: "3:5 · M6th" },
];

const PUZZLES: Shape[] = [
  { name: "Circle",   rL: 1, rR: 1, ph: 90,  note: "" },
  { name: "Figure-8", rL: 1, rR: 2, ph: 0,   note: "" },
  { name: "Trefoil",  rL: 2, rR: 3, ph: 0,   note: "" },
  { name: "Rose",     rL: 3, rR: 4, ph: 0,   note: "" },
];

const BASE_HZ = 220;

// --- Component ---
export default function OscComposerPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [rL, setRL] = useState(1);
  const [rR, setRR] = useState(1);
  const [phase, setPhase] = useState(90);
  const [puzzle, setPuzzle] = useState(false);
  const [pIdx, setPIdx] = useState(0);
  const [solved, setSolved] = useState(false);
  const [busy, setBusy] = useState(false);

  const acRef    = useRef<AudioContext | null>(null);
  const oscLRef  = useRef<OscillatorNode | null>(null);
  const oscRRef  = useRef<OscillatorNode | null>(null);
  const rafRef   = useRef<number>(0);

  // Mutable refs so the animation loop reads current values without restart
  const rlRef     = useRef(rL);
  const rrRef     = useRef(rR);
  const phRef     = useRef(phase);
  const puzzleRef = useRef(puzzle);
  const pIdxRef   = useRef(pIdx);

  useEffect(() => { rlRef.current = rL; }, [rL]);
  useEffect(() => { rrRef.current = rR; }, [rR]);
  useEffect(() => { phRef.current = phase; }, [phase]);
  useEffect(() => { puzzleRef.current = puzzle; }, [puzzle]);
  useEffect(() => { pIdxRef.current = pIdx; }, [pIdx]);

  // Keep oscillator frequencies in sync
  useEffect(() => {
    const ac = acRef.current;
    if (!ac || !oscLRef.current || !oscRRef.current) return;
    const now = ac.currentTime;
    oscLRef.current.frequency.setTargetAtTime(BASE_HZ * rL, now, 0.05);
    oscRRef.current.frequency.setTargetAtTime(BASE_HZ * rR, now, 0.05);
  }, [rL, rR]);

  // Puzzle solved check
  useEffect(() => {
    if (!puzzle) { setSolved(false); return; }
    const t = PUZZLES[pIdx];
    setSolved(rL === t.rL && rR === t.rR && Math.abs(phase - t.ph) < 12);
  }, [puzzle, pIdx, rL, rR, phase]);

  // Animation loop — reads from refs, restarts only when started changes
  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const tick = () => {
      // CRT phosphor persistence
      ctx.fillStyle = "rgba(0,0,0,0.13)";
      ctx.fillRect(0, 0, W, H);

      if (puzzleRef.current) {
        const tgt = PUZZLES[pIdxRef.current];
        const half = W / 2;
        const r = Math.min(half, H) * 0.40;

        // Dashed divider
        ctx.save();
        ctx.strokeStyle = "#2a2a2a";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(half, 0); ctx.lineTo(half, H); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Target (grey, left half)
        paintFigure(ctx, tgt.rL, tgt.rR, tgt.ph, half / 2, H / 2, r, "#555", 0.7);
        ctx.fillStyle = "#444";
        ctx.font = "10px monospace";
        ctx.fillText("TARGET", 10, 18);

        // User's figure (cyan, right half)
        paintFigure(ctx, rlRef.current, rrRef.current, phRef.current, half + half / 2, H / 2, r, "#00ffcc", 0.9);
        ctx.fillStyle = "#00ffcc";
        ctx.font = "10px monospace";
        ctx.fillText("YOURS", half + 10, 18);

      } else {
        const r = Math.min(W, H) * 0.41;
        paintFigure(ctx, rlRef.current, rrRef.current, phRef.current, W / 2, H / 2, r, "#00ffcc", 0.9);
        // Ratio + phase readout
        ctx.fillStyle = "rgba(0,255,204,0.35)";
        ctx.font = "11px monospace";
        ctx.fillText(`${rlRef.current}:${rrRef.current}  φ ${phRef.current}°`, 10, H - 10);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(rafRef.current); };
  }, [started]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      try { oscLRef.current?.stop(); } catch { /* already stopped */ }
      try { oscRRef.current?.stop(); } catch { /* already stopped */ }
      acRef.current?.close().catch(() => { /* ignore */ });
    };
  }, []);

  const startAudio = useCallback(() => {
    if (acRef.current) return;
    const ac = new AudioContext();
    acRef.current = ac;

    const merger = ac.createChannelMerger(2);
    merger.connect(ac.destination);

    const gL = ac.createGain(); gL.gain.value = 0.42;
    const gR = ac.createGain(); gR.gain.value = 0.42;
    gL.connect(merger, 0, 0);
    gR.connect(merger, 0, 1);

    const oL = ac.createOscillator();
    oL.type = "sine"; oL.frequency.value = BASE_HZ * rL;
    oL.connect(gL); oL.start();
    oscLRef.current = oL;

    // Phase-offset R oscillator by starting it slightly in the past
    const phRad = (phase * Math.PI) / 180;
    const offset = phRad / (2 * Math.PI * BASE_HZ * rR);
    const oR = ac.createOscillator();
    oR.type = "sine"; oR.frequency.value = BASE_HZ * rR;
    oR.connect(gR);
    oR.start(Math.max(0, ac.currentTime - offset));
    oscRRef.current = oR;

    setStarted(true);
  }, [rL, rR, phase]);

  const applyPreset = useCallback((p: Shape) => {
    setRL(p.rL); setRR(p.rR); setPhase(p.ph); setSolved(false);
  }, []);

  const downloadWAV = useCallback(() => {
    setBusy(true);
    // setTimeout gives React time to render "Rendering…" before the sync loop
    setTimeout(() => {
      const sr = 44100, dur = 5, ns = sr * dur;
      const ph = (phase * Math.PI) / 180;
      const fL = BASE_HZ * rL, fR = BASE_HZ * rR;
      const L = new Float32Array(ns);
      const R = new Float32Array(ns);
      for (let i = 0; i < ns; i++) {
        const t = i / sr;
        L[i] = 0.72 * Math.sin(2 * Math.PI * fL * t);
        R[i] = 0.72 * Math.sin(2 * Math.PI * fR * t + ph);
      }
      const wav = buildWAV(L, R, sr);
      const url = URL.createObjectURL(new Blob([wav], { type: "audio/wav" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `lissajous-${rL}-${rR}-${phase}deg.wav`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setBusy(false);
    }, 40);
  }, [rL, rR, phase]);

  // --- Styles ---
  const page: CSSProperties = {
    minHeight: "100vh", background: "#0a0a0a", color: "#ccc",
    fontFamily: "monospace", display: "flex", flexDirection: "column",
    alignItems: "center", padding: "20px 16px", gap: "14px",
  };
  const h1: CSSProperties = { fontSize: "17px", fontWeight: 700, color: "#00ffcc", margin: 0 };
  const sub: CSSProperties = { fontSize: "12px", color: "#555", margin: "3px 0 0", textAlign: "center" };
  const canvasWrap: CSSProperties = { position: "relative", width: "100%", maxWidth: "500px" };
  const canvasStyle: CSSProperties = {
    display: "block", width: "100%", aspectRatio: "1 / 1",
    background: "#000", borderRadius: "4px", border: "1px solid #1c1c1c",
  };
  const overlay: CSSProperties = {
    position: "absolute", inset: 0, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: "14px",
  };
  const startBtnStyle: CSSProperties = {
    background: "#00ffcc", color: "#000", border: "none", borderRadius: "6px",
    padding: "10px 26px", fontFamily: "monospace", fontSize: "15px",
    fontWeight: 700, cursor: "pointer",
  };
  const hintStyle: CSSProperties = {
    color: "#444", fontSize: "11px", textAlign: "center",
    maxWidth: "240px", lineHeight: 1.6,
  };
  const controls: CSSProperties = {
    width: "100%", maxWidth: "500px", display: "flex",
    flexDirection: "column", gap: "10px",
  };
  const row: CSSProperties = { display: "flex", gap: "10px", alignItems: "center" };
  const lbl: CSSProperties = { fontSize: "11px", color: "#666", minWidth: "64px" };
  const sliderStyle: CSSProperties = { flex: 1, accentColor: "#00ffcc", cursor: "pointer" };
  const val: CSSProperties = { fontSize: "11px", color: "#00ffcc", minWidth: "40px", textAlign: "right" };
  const presetsRow: CSSProperties = { display: "flex", gap: "6px", flexWrap: "wrap" };
  const actionsRow: CSSProperties = { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "2px" };
  const solvedBadge: CSSProperties = {
    position: "absolute", top: "12px", right: "12px",
    background: "#00ffcc", color: "#000", padding: "4px 10px",
    borderRadius: "20px", fontFamily: "monospace", fontSize: "11px", fontWeight: 700,
  };
  const footerStyle: CSSProperties = { fontSize: "11px", color: "#333", marginTop: "4px" };
  const linkStyle: CSSProperties = { color: "#444", textDecoration: "none" };

  const activePreset = PRESETS.find(p => p.rL === rL && p.rR === rR && Math.abs(p.ph - phase) < 5);

  const presetBtn = (active: boolean): CSSProperties => ({
    padding: "5px 9px", border: `1px solid ${active ? "#00ffcc" : "#2a2a2a"}`,
    background: active ? "rgba(0,255,204,0.08)" : "transparent",
    color: active ? "#00ffcc" : "#555", borderRadius: "4px",
    cursor: "pointer", fontFamily: "monospace", fontSize: "10px",
    lineHeight: 1.5, whiteSpace: "nowrap",
  });

  const actionBtn: CSSProperties = {
    padding: "7px 14px", border: "1px solid #2a2a2a", background: "transparent",
    color: "#888", borderRadius: "4px", cursor: "pointer",
    fontFamily: "monospace", fontSize: "11px",
  };

  return (
    <main style={page}>
      <div style={{ textAlign: "center" }}>
        <h1 style={h1}>Oscilloscope Composer</h1>
        <p style={sub}>
          Design a Lissajous figure. Get the stereo WAV that draws it on an oscilloscope in XY mode.
        </p>
      </div>

      <div style={canvasWrap}>
        <canvas ref={canvasRef} width={500} height={500} style={canvasStyle} />
        {!started && (
          <div style={overlay}>
            <button style={startBtnStyle} onClick={startAudio}>▶ Start</button>
            <p style={hintStyle}>
              Left channel = X axis. Right channel = Y axis.
              Together they draw the shape through stereo audio.
            </p>
          </div>
        )}
        {solved && puzzle && <div style={solvedBadge}>✓ Matched!</div>}
      </div>

      {started && (
        <div style={controls}>
          <div style={row}>
            <span style={lbl}>L freq</span>
            <input type="range" min={1} max={5} step={1} value={rL}
              style={sliderStyle} onChange={e => setRL(Number(e.target.value))} />
            <span style={val}>{rL}×</span>
          </div>
          <div style={row}>
            <span style={lbl}>R freq</span>
            <input type="range" min={1} max={5} step={1} value={rR}
              style={sliderStyle} onChange={e => setRR(Number(e.target.value))} />
            <span style={val}>{rR}×</span>
          </div>
          <div style={row}>
            <span style={lbl}>Phase</span>
            <input type="range" min={0} max={359} step={1} value={phase}
              style={sliderStyle} onChange={e => setPhase(Number(e.target.value))} />
            <span style={val}>{phase}°</span>
          </div>

          <div style={presetsRow}>
            {PRESETS.map(p => (
              <button key={p.name} style={presetBtn(p === activePreset)} onClick={() => applyPreset(p)}>
                {p.name}<br />{p.note}
              </button>
            ))}
          </div>

          <div style={actionsRow}>
            <button style={actionBtn} onClick={downloadWAV} disabled={busy}>
              {busy ? "Rendering…" : "↓ Download WAV"}
            </button>
            <button style={actionBtn} onClick={() => { setPuzzle(!puzzle); setSolved(false); }}>
              {puzzle ? "✕ Exit puzzle" : "🎯 Puzzle mode"}
            </button>
          </div>

          {puzzle && (
            <div>
              <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>
                Match the target figure using the sliders above:
              </div>
              <div style={presetsRow}>
                {PUZZLES.map((p, i) => (
                  <button key={p.name} style={presetBtn(i === pIdx)}
                    onClick={() => { setPIdx(i); setSolved(false); }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={footerStyle}>
        <a href="README.md" target="_blank" rel="noreferrer" style={linkStyle}>
          Design notes
        </a>
        {" · "}
        <a href="/dream" style={linkStyle}>← all prototypes</a>
      </div>
    </main>
  );
}
