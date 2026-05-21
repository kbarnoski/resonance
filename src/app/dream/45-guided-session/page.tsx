"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── types ────────────────────────────────────────────────────────────────────

interface WP { hz: number; sym: string; label: string; hue: number; desc: string; hint: string; noise: "pink" | "brown" }
type SessionPhase = "setup" | "running" | "done";
type NType = "off" | "pink" | "brown";

// ── constants ────────────────────────────────────────────────────────────────

const WPS: WP[] = [
  { hz: 35, sym: "γ",  label: "gamma",   hue: 20,  desc: "scattered · hyperactive", hint: "Notice each thought passing — it's just weather.", noise: "pink"  },
  { hz: 24, sym: "β⁺", label: "beta-h",  hue: 45,  desc: "stressed · anxious",      hint: "Feel where tension lives in your body. Begin to soften.", noise: "pink"  },
  { hz: 18, sym: "β",  label: "beta",    hue: 75,  desc: "alert · restless",        hint: "Activity is still here. You can breathe with it.", noise: "pink"  },
  { hz: 14, sym: "β⁻", label: "beta-l",  hue: 100, desc: "focused · clear",         hint: "Alert yet settled. Each breath steadies the field.", noise: "pink"  },
  { hz: 10, sym: "α",  label: "alpha",   hue: 180, desc: "relaxed · aware",         hint: "Relaxed awareness. What do you notice right now?", noise: "pink"  },
  { hz: 7,  sym: "θ⁺", label: "theta-h", hue: 210, desc: "drowsy · softening",      hint: "The boundary between waking and dreaming softens.", noise: "brown" },
  { hz: 4,  sym: "θ",  label: "theta",   hue: 240, desc: "meditative · deep",       hint: "What images arise? Let them pass without holding.", noise: "brown" },
  { hz: 2,  sym: "δ",  label: "delta",   hue: 270, desc: "deep rest · healing",     hint: "Let go completely. The body knows how to rest.", noise: "brown" },
];

const JOURNEYS = [
  { label: "Stressed → Calm",   desc: "from overwhelm to ease",       path: [1, 3, 4]    },
  { label: "Scattered → Calm",  desc: "from distraction to presence", path: [0, 2, 4]    },
  { label: "Wired → Drowsy",    desc: "from tension to release",      path: [2, 4, 5, 6] },
  { label: "Alert → Deep Rest", desc: "from day mind to sleep",       path: [3, 4, 6, 7] },
];

const DURS = [
  { label: "Quick  30s", secs: 30  },
  { label: "Normal  5m", secs: 300 },
  { label: "Deep   10m", secs: 600 },
];

// ── module helpers ────────────────────────────────────────────────────────────

function buildNoise(
  actx: AudioContext, master: GainNode, type: "pink" | "brown", level: number,
  sR: { current: AudioBufferSourceNode | null }, gR: { current: GainNode | null }
): void {
  const n = Math.round(actx.sampleRate * 2);
  const b = actx.createBuffer(1, n, actx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = b; src.loop = true;
  const f = actx.createBiquadFilter(); f.type = "lowpass";
  if (type === "pink") { f.frequency.value = 1200; f.Q.value = 0.7; }
  else { f.frequency.value = 300; f.Q.value = 0.5; }
  const g = actx.createGain(); g.gain.value = level * 0.4;
  src.connect(f); f.connect(g); g.connect(master); src.start();
  sR.current = src; gR.current = g;
}

function clearNoise(
  sR: { current: AudioBufferSourceNode | null }, gR: { current: GainNode | null }
): void {
  try { sR.current?.stop(); } catch { /* already stopped */ }
  sR.current?.disconnect(); gR.current?.disconnect();
  sR.current = null; gR.current = null;
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function GuidedSession() {
  // Setup state
  const [jIdx, setJIdx] = useState(0);
  const [dIdx, setDIdx] = useState(1);

  // Session state
  const [phase,   setPhase]   = useState<SessionPhase>("setup");
  const [stepI,   setStepI]   = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [log,     setLog]     = useState<{ sym: string; secs: number }[]>([]);

  // Controls
  const [noise,  setNoise]  = useState<NType>("off");
  const [nLevel, setNLevel] = useState(0.2);
  const [jOpen,  setJOpen]  = useState(false);
  const [jText,  setJText]  = useState("");

  // Audio refs
  const actxR  = useRef<AudioContext | null>(null);
  const masterR = useRef<GainNode | null>(null);
  const oscR   = useRef<OscillatorNode | null>(null);
  const lfoR   = useRef<OscillatorNode | null>(null);
  const lfoGR  = useRef<GainNode | null>(null);
  const nSR    = useRef<AudioBufferSourceNode | null>(null);
  const nGR    = useRef<GainNode | null>(null);

  // Shadow refs (keep in sync with state; read from timers/RAF)
  const phaseR   = useRef<SessionPhase>("setup");
  const stepIR   = useRef(0);
  const elapsedR = useRef(0);
  const durR     = useRef(DURS[1].secs);
  const pathR    = useRef<number[]>([]);
  const nLevelR  = useRef(0.2);

  // Canvas refs
  const canvasR  = useRef<HTMLCanvasElement | null>(null);
  const ringsR   = useRef<{ birthT: number }[]>([]);
  const nextBR   = useRef(0);
  const animR    = useRef(0);

  // Advance-step fn stored in ref so the interval callback always calls the latest version
  const advFnR = useRef<() => void>(() => { /* no-op until session starts */ });

  // ── derived (render-time only) ─────────────────────────────────────────────

  const journey = JOURNEYS[jIdx];
  const durSecs = DURS[dIdx].secs;
  const path    = journey.path;
  const wp      = pathR.current.length > 0 ? WPS[pathR.current[Math.min(stepI, pathR.current.length - 1)]] ?? WPS[4] : WPS[4];
  const progress = Math.min(elapsed / durSecs, 1);
  const canAdv  = elapsed >= Math.ceil(durSecs * 0.5) && phase === "running";
  const isLast  = stepI >= pathR.current.length - 1;
  const jHasSaved = typeof window !== "undefined" && phase === "running"
    ? !!(localStorage.getItem(`guided-${wp.label}`))
    : false;

  // ── update advFnR every render so the interval always has the latest ────────

  advFnR.current = () => {
    if (phaseR.current === "done") return;
    const si  = stepIR.current;
    const pth = pathR.current;
    const cur = WPS[pth[si]];

    setLog(l => [...l, { sym: cur.sym, secs: Math.min(elapsedR.current, durR.current) }]);

    if (si >= pth.length - 1) {
      phaseR.current = "done";
      setPhase("done");
      try { oscR.current?.stop(); } catch { /* already stopped */ }
      try { lfoR.current?.stop(); } catch { /* already stopped */ }
      clearNoise(nSR, nGR);
      try { actxR.current?.close(); } catch { /* already closed */ }
      actxR.current = null; masterR.current = null; oscR.current = null; lfoR.current = null;
      return;
    }

    const nsi = si + 1;
    const nwp = WPS[pth[nsi]];

    if (lfoR.current && actxR.current) {
      lfoR.current.frequency.setTargetAtTime(nwp.hz, actxR.current.currentTime, 4);
    }

    setNoise(nwp.noise);
    stepIR.current   = nsi;
    elapsedR.current = 0;
    setStepI(nsi);
    setElapsed(0);
  };

  // ── effects ────────────────────────────────────────────────────────────────

  useEffect(() => { phaseR.current  = phase;  }, [phase]);
  useEffect(() => { stepIR.current  = stepI;  }, [stepI]);
  useEffect(() => { nLevelR.current = nLevel; }, [nLevel]);

  // Load journal text when the active step changes
  useEffect(() => {
    if (pathR.current.length === 0) return;
    const label = WPS[pathR.current[stepI]]?.label ?? "";
    setJText(typeof window !== "undefined" ? (localStorage.getItem(`guided-${label}`) ?? "") : "");
  }, [stepI]);

  // Noise level live update
  useEffect(() => {
    if (nGR.current && actxR.current) {
      nGR.current.gain.setTargetAtTime(nLevel * 0.4, actxR.current.currentTime, 0.1);
    }
  }, [nLevel]);

  // Noise type change while session running
  useEffect(() => {
    if (!actxR.current || !masterR.current || phaseR.current !== "running") return;
    clearNoise(nSR, nGR);
    if (noise !== "off") buildNoise(actxR.current, masterR.current, noise, nLevelR.current, nSR, nGR);
  }, [noise]);

  // Timer — runs while phase is "running"; auto-advances on duration
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => {
      elapsedR.current += 1;
      setElapsed(elapsedR.current);
      if (elapsedR.current >= durR.current) advFnR.current();
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  // Canvas animation — mount/unmount with the running phase
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasR.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const obs = new ResizeObserver(() => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0) { canvas.width = Math.round(r.width); canvas.height = Math.round(r.height); }
    });
    obs.observe(canvas);
    const r0 = canvas.getBoundingClientRect();
    canvas.width = Math.round(r0.width); canvas.height = Math.round(r0.height);

    nextBR.current = actxR.current ? actxR.current.currentTime : Date.now() / 1000;
    ringsR.current = [];

    function tick() {
      if (!ctx || !canvas) return;
      const W = canvas.width, H = canvas.height;
      if (!W || !H) { animR.current = requestAnimationFrame(tick); return; }

      const pth = pathR.current;
      const si  = stepIR.current;
      const cwp = pth.length > 0 ? WPS[pth[Math.min(si, pth.length - 1)]] ?? WPS[4] : WPS[4];
      const hue = cwp.hue;
      const hz  = cwp.hz;
      const now = actxR.current ? actxR.current.currentTime : Date.now() / 1000;
      const rl  = Math.max(0.2, 3 / hz);
      const bp  = 1 / hz;
      const mxR = Math.min(W, H) * 0.42;

      if (phaseR.current === "running") {
        while (now >= nextBR.current) {
          ringsR.current.push({ birthT: nextBR.current });
          nextBR.current += bp;
        }
      }
      ringsR.current = ringsR.current.filter(ring => now - ring.birthT < rl + 0.3);

      ctx.fillStyle = "rgba(2, 2, 10, 0.18)";
      ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;
      const lat = ringsR.current[ringsR.current.length - 1];
      const ts  = lat ? Math.max(0, now - lat.birthT) : 99;
      const ga  = Math.exp(-ts * 5) * 0.6;
      if (ga > 0.01) {
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 55);
        gr.addColorStop(0, `hsla(${hue}, 80%, 85%, ${ga})`);
        gr.addColorStop(1, "transparent");
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy, 55, 0, Math.PI * 2); ctx.fill();
      }

      for (const ring of ringsR.current) {
        const age = now - ring.birthT;
        const tr  = age / rl;
        if (tr >= 1) continue;
        const al = (1 - tr) * 0.6;
        ctx.strokeStyle = `hsla(${hue}, 70%, 68%, ${al})`;
        ctx.lineWidth   = 2;
        ctx.shadowColor = `hsla(${hue}, 80%, 80%, ${al * 0.5})`;
        ctx.shadowBlur  = 10;
        ctx.beginPath(); ctx.arc(cx, cy, mxR * tr, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur  = 0;
      }
      animR.current = requestAnimationFrame(tick);
    }

    animR.current = requestAnimationFrame(tick);
    return () => { obs.disconnect(); cancelAnimationFrame(animR.current); };
  }, [phase]);

  // ── action handlers ────────────────────────────────────────────────────────

  function startSession() {
    const pth = JOURNEYS[jIdx].path;
    pathR.current    = pth;
    durR.current     = DURS[dIdx].secs;
    stepIR.current   = 0;
    elapsedR.current = 0;
    setStepI(0);
    setElapsed(0);
    setLog([]);

    const actx = new AudioContext();
    actxR.current = actx;
    const master = actx.createGain(); master.gain.value = 0.55; master.connect(actx.destination);
    masterR.current = master;

    const firstWp = WPS[pth[0]];

    // Isochronic: osc(200Hz) → ampGain(base 0.5) + lfo(beat) → lfoGain(0.5) → ampGain.gain
    const osc = actx.createOscillator(); osc.type = "sine"; osc.frequency.value = 200;
    const amp = actx.createGain(); amp.gain.value = 0.5;
    const lfo = actx.createOscillator(); lfo.type = "sine"; lfo.frequency.value = firstWp.hz;
    const lfoG = actx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(amp.gain);
    osc.connect(amp); amp.connect(master);
    osc.start(); lfo.start();
    oscR.current = osc; lfoR.current = lfo; lfoGR.current = lfoG;

    setNoise(firstWp.noise);
    buildNoise(actx, master, firstWp.noise, nLevelR.current, nSR, nGR);

    phaseR.current = "running";
    setPhase("running");
  }

  function resetToSetup() {
    pathR.current    = [];
    stepIR.current   = 0;
    elapsedR.current = 0;
    setPhase("setup");
    setLog([]);
    setStepI(0);
    setElapsed(0);
  }

  // ── render ────────────────────────────────────────────────────────────────

  const BG = "#040408";
  const BDR = "#13132a";
  const BTN = (active: boolean) => ({
    padding: "10px 14px", textAlign: "left" as const,
    background: active ? "#12183a" : "#080812",
    border: `1px solid ${active ? "#3355bb" : "#1a1a2c"}`,
    borderRadius: 6, color: active ? "#99aaee" : "#666",
    cursor: "pointer", fontFamily: "monospace",
  });

  return (
    <main style={{ minHeight: "100vh", background: BG, color: "#ddd", fontFamily: "monospace" }}>

      {/* Header */}
      <div style={{ padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${BDR}` }}>
        <span style={{ color: "#555", fontSize: 12 }}>dream / 45-guided-session</span>
        <Link href="/dream" style={{ color: "#555", fontSize: 12, textDecoration: "none" }}>← all</Link>
      </div>

      {/* ── SETUP ── */}
      {phase === "setup" && (
        <div style={{ maxWidth: 500, margin: "40px auto", padding: "0 20px" }}>
          <h1 style={{ fontSize: 21, fontWeight: 400, color: "#ddd", marginBottom: 6 }}>Guided Brainwave Session</h1>
          <p style={{ color: "#777", fontSize: 13, marginBottom: 28, lineHeight: 1.7 }}>
            Isochronic tones guide your brainwave frequency from one state to another — no headphones required. Choose a journey, set a step duration, and let the session unfold.
          </p>

          <div style={{ marginBottom: 22 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>Choose a journey</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {JOURNEYS.map((j, i) => (
                <button key={i} onClick={() => setJIdx(i)} style={BTN(jIdx === i)}>
                  <div style={{ fontSize: 13, marginBottom: 3 }}>{j.label}</div>
                  <div style={{ fontSize: 11, color: jIdx === i ? "#6677bb" : "#444" }}>{j.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={{ color: "#888", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 10 }}>Time per step</div>
            <div style={{ display: "flex", gap: 8 }}>
              {DURS.map((d, i) => (
                <button key={i} onClick={() => setDIdx(i)} style={{ ...BTN(dIdx === i), flex: 1, textAlign: "center", padding: "8px" }}>
                  <span style={{ fontSize: 12 }}>{d.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Path preview */}
          <div style={{ marginBottom: 28, padding: "12px 14px", background: "#07070f", border: `1px solid ${BDR}`, borderRadius: 6 }}>
            <div style={{ color: "#444", fontSize: 11, marginBottom: 8 }}>
              {path.length} step{path.length !== 1 ? "s" : ""} · {fmtTime(path.length * durSecs)} total
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {path.map((wi, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: `hsl(${WPS[wi].hue}, 65%, 65%)`, fontSize: 14 }}>
                    {WPS[wi].sym} <span style={{ color: "#444", fontSize: 11 }}>{WPS[wi].hz}Hz</span>
                  </span>
                  {i < path.length - 1 && <span style={{ color: "#222" }}>→</span>}
                </span>
              ))}
            </div>
          </div>

          <button onClick={startSession} style={{
            width: "100%", padding: "14px", fontSize: 15,
            background: "#112555", border: "1px solid #2255aa",
            borderRadius: 8, color: "#88aadd", cursor: "pointer", fontFamily: "monospace",
          }}>
            ▶ Begin journey
          </button>

          <div style={{ padding: "16px 0 0", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#444", fontSize: 11 }}>isochronic tones · speakers OK · Web Audio API</span>
            <Link href="/dream/45-guided-session/README.md" style={{ color: "#444", fontSize: 11, textDecoration: "none" }}>design notes</Link>
          </div>
        </div>
      )}

      {/* ── RUNNING ── */}
      {phase === "running" && (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 50px)" }}>

          {/* State header */}
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${BDR}`, flexShrink: 0 }}>
            {/* Path breadcrumb */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {pathR.current.map((wi, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 13, padding: "1px 8px", borderRadius: 4,
                    background: i === stepI ? `hsl(${WPS[wi].hue}, 25%, 12%)` : "transparent",
                    color: i === stepI ? `hsl(${WPS[wi].hue}, 65%, 68%)` : i < stepI ? "#333" : "#555",
                    border: i === stepI ? `1px solid hsl(${WPS[wi].hue}, 35%, 22%)` : "1px solid transparent",
                  }}>{WPS[wi].sym}</span>
                  {i < pathR.current.length - 1 && <span style={{ color: "#1e1e2e" }}>→</span>}
                </span>
              ))}
            </div>

            {/* Current state */}
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 34, color: `hsl(${wp.hue}, 65%, 68%)` }}>{wp.sym}</span>
              <span style={{ fontSize: 14, color: "#888" }}>{wp.hz} Hz · {wp.desc}</span>
            </div>

            {/* Progress */}
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "#555" }}>step {stepI + 1}/{pathR.current.length}</span>
              <span style={{ fontSize: 12, color: "#888" }}>{fmtTime(elapsed)} / {fmtTime(durSecs)}</span>
              <div style={{ flex: 1, height: 2, background: "#14142a", borderRadius: 2 }}>
                <div style={{
                  height: "100%", width: `${progress * 100}%`,
                  background: `hsl(${wp.hue}, 55%, 45%)`,
                  borderRadius: 2, transition: "width 1s linear",
                }} />
              </div>
            </div>
          </div>

          {/* Canvas */}
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <canvas ref={canvasR} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
            <div style={{
              position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)",
              textAlign: "center", maxWidth: 380, pointerEvents: "none",
            }}>
              <p style={{ color: `hsl(${wp.hue}, 45%, 55%)`, fontSize: 13, fontStyle: "italic", margin: 0, opacity: 0.85 }}>
                {wp.hint}
              </p>
            </div>
          </div>

          {/* Controls bar */}
          <div style={{ padding: "10px 20px", borderTop: `1px solid ${BDR}`, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ color: "#555", fontSize: 12 }}>noise</span>
              {(["off", "pink", "brown"] as NType[]).map(t => (
                <button key={t} onClick={() => setNoise(t)} style={{
                  padding: "3px 10px", fontSize: 12,
                  background: noise === t ? "#111" : "transparent",
                  border: `1px solid ${noise === t ? "#2a2a40" : "#14142a"}`,
                  borderRadius: 4, color: noise === t ? "#888" : "#444",
                  cursor: "pointer", fontFamily: "monospace",
                }}>{t}</button>
              ))}
              {noise !== "off" && (
                <input type="range" min={0} max={1} step={0.05} value={nLevel}
                  onChange={e => setNLevel(Number(e.target.value))}
                  style={{ width: 90 }} />
              )}
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                <button onClick={() => setJOpen(o => !o)} style={{
                  padding: "3px 10px", fontSize: 12, background: "transparent",
                  border: `1px solid ${BDR}`, borderRadius: 4,
                  color: jHasSaved ? "#aaa" : "#555", cursor: "pointer", fontFamily: "monospace",
                }}>📓{jHasSaved ? " ●" : ""}</button>
                {canAdv && (
                  <button onClick={() => advFnR.current()} style={{
                    padding: "4px 14px", fontSize: 12, background: "#112555",
                    border: "1px solid #2255aa", borderRadius: 4, color: "#88aadd",
                    cursor: "pointer", fontFamily: "monospace",
                  }}>{isLast ? "✓ finish" : "→ next"}</button>
                )}
              </div>
            </div>

            {jOpen && (
              <textarea
                value={jText}
                onChange={e => {
                  setJText(e.target.value);
                  const label = pathR.current.length > 0 ? WPS[pathR.current[stepIR.current]]?.label ?? "" : "";
                  if (label) localStorage.setItem(`guided-${label}`, e.target.value);
                }}
                placeholder={wp.hint}
                style={{
                  marginTop: 8, width: "100%", height: 72, background: "#07070f",
                  border: `1px solid ${BDR}`, borderRadius: 6,
                  color: "#aaa", fontFamily: "monospace", fontSize: 12,
                  padding: "7px", resize: "vertical", boxSizing: "border-box",
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {phase === "done" && (
        <div style={{ maxWidth: 440, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
          <h2 style={{ fontSize: 19, fontWeight: 400, color: "#ccc", marginBottom: 6 }}>Session complete</h2>
          <p style={{ color: "#666", fontSize: 13, marginBottom: 28 }}>{journey.label}</p>

          <div style={{ background: "#07070f", border: `1px solid ${BDR}`, borderRadius: 8, padding: "14px 18px", marginBottom: 20, textAlign: "left" }}>
            {log.map((e, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: i < log.length - 1 ? `1px solid ${BDR}` : "none" }}>
                <span style={{ color: "#888" }}>{e.sym}</span>
                <span style={{ color: "#555", fontFamily: "monospace" }}>{fmtTime(e.secs)}</span>
              </div>
            ))}
          </div>

          <button onClick={resetToSetup} style={{
            padding: "10px 22px", background: "#080812", border: `1px solid #1a1a2c`,
            borderRadius: 6, color: "#777", cursor: "pointer", fontFamily: "monospace", fontSize: 13,
          }}>← new session</button>
        </div>
      )}
    </main>
  );
}
