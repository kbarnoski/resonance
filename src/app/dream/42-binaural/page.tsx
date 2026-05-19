"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── types ──────────────────────────────────────────────────────────────────────

interface BrainState {
  sym: string;
  label: string;
  min: number;
  max: number;
  hue: number;
  desc: string;
}

interface Ring {
  birthT: number;
}

type AudioMode = "binaural" | "isochronic";

// ── constants ──────────────────────────────────────────────────────────────────

const BRAIN_STATES: BrainState[] = [
  { sym: "δ", label: "delta", min: 0.5, max: 4,   hue: 270, desc: "deep sleep · healing"     },
  { sym: "θ", label: "theta", min: 4,   max: 8,   hue: 220, desc: "drowsy · meditative"      },
  { sym: "α", label: "alpha", min: 8,   max: 13,  hue: 180, desc: "relaxed · aware"          },
  { sym: "β", label: "beta",  min: 13,  max: 30,  hue: 100, desc: "focused · alert"          },
  { sym: "γ", label: "gamma", min: 30,  max: 100, hue:  30, desc: "high cognition · insight" },
];

const PRESETS: Array<{ label: string; beat: number; carrier: number }> = [
  { label: "δ 2",  beat: 2,  carrier: 160 },
  { label: "θ 6",  beat: 6,  carrier: 180 },
  { label: "α 10", beat: 10, carrier: 200 },
  { label: "β 16", beat: 16, carrier: 220 },
  { label: "γ 40", beat: 40, carrier: 200 },
];

// ── pure helpers ───────────────────────────────────────────────────────────────

function findState(hz: number): BrainState {
  return BRAIN_STATES.find(s => hz >= s.min && hz < s.max) ?? BRAIN_STATES[0];
}

// ── component ──────────────────────────────────────────────────────────────────

export default function BinauralPage() {
  // Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Audio refs
  const actxRef     = useRef<AudioContext | null>(null);
  const masterRef   = useRef<GainNode | null>(null);
  const leftOscRef  = useRef<OscillatorNode | null>(null);
  const rightOscRef = useRef<OscillatorNode | null>(null);
  const isoOscRef   = useRef<OscillatorNode | null>(null);
  const isoLfoRef   = useRef<OscillatorNode | null>(null);

  // Animation refs
  const ringsRef    = useRef<Ring[]>([]);
  const nextBeatRef = useRef<number>(0);
  const playingRef  = useRef(false);
  const carrierRef  = useRef(200);
  const beatRef     = useRef(10);

  // UI state
  const [playing, setPlaying] = useState(false);
  const [carrier, setCarrier] = useState(200);
  const [beat,    setBeat]    = useState(10);
  const [mode,    setMode]    = useState<AudioMode>("binaural");
  const [volume,  setVolume]  = useState(0.4);

  // ── sync refs + live-update oscillators when carrier/beat change ──────────

  useEffect(() => {
    carrierRef.current = carrier;
    beatRef.current    = beat;
    const now = actxRef.current?.currentTime;
    if (now === undefined) return;
    leftOscRef.current?.frequency.setTargetAtTime(carrier,        now, 0.08);
    rightOscRef.current?.frequency.setTargetAtTime(carrier + beat, now, 0.08);
    isoOscRef.current?.frequency.setTargetAtTime(carrier,         now, 0.08);
    isoLfoRef.current?.frequency.setTargetAtTime(beat,            now, 0.08);
  }, [carrier, beat]);

  // ── live volume ──────────────────────────────────────────────────────────

  useEffect(() => {
    const now = actxRef.current?.currentTime;
    if (now === undefined || !masterRef.current) return;
    masterRef.current.gain.setTargetAtTime(volume, now, 0.1);
  }, [volume]);

  // ── canvas resize ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        canvas.width  = Math.round(r.width);
        canvas.height = Math.round(r.height);
      }
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(canvas);
    return () => obs.disconnect();
  }, []);

  // ── animation loop ───────────────────────────────────────────────────────

  useEffect(() => {
    let rafId = 0;

    function tick() {
      const canvas = canvasRef.current;
      if (!canvas) { rafId = requestAnimationFrame(tick); return; }
      const g = canvas.getContext("2d");
      if (!g)    { rafId = requestAnimationFrame(tick); return; }

      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) { rafId = requestAnimationFrame(tick); return; }

      const actx      = actxRef.current;
      const t         = actx ? actx.currentTime : Date.now() / 1000;
      const bt        = beatRef.current;
      const st        = findState(bt);
      const { hue }   = st;
      const isPlaying = playingRef.current;

      // Birth new rings on schedule
      if (isPlaying) {
        while (t >= nextBeatRef.current) {
          ringsRef.current.push({ birthT: nextBeatRef.current });
          nextBeatRef.current += 1 / bt;
        }
      }

      // Each ring lives long enough to always show ~3 concurrent rings
      const ringLife = Math.max(0.2, 3 / bt);
      ringsRef.current = ringsRef.current.filter(r => t - r.birthT < ringLife);

      // Phase within current beat (0 = ring just born, 1 = just before next ring)
      const latestRing = ringsRef.current[ringsRef.current.length - 1];
      const phase = (latestRing && isPlaying) ? Math.min(1, (t - latestRing.birthT) * bt) : 1;
      const pulse = Math.exp(-phase * 5);   // sharp decay from birth

      // Background fade (trail)
      g.fillStyle = "rgba(4, 4, 16, 0.18)";
      g.fillRect(0, 0, W, H);

      const cx   = W / 2;
      const cy   = H / 2 - H * 0.03;
      const maxR = Math.min(W, H) * 0.43;

      // Expanding rings
      for (const ring of ringsRef.current) {
        const age  = t - ring.birthT;
        const prog = age / ringLife;
        const r    = prog * maxR;
        if (r < 1) continue;
        const alpha = (1 - prog) * 0.65;
        g.save();
        g.beginPath();
        g.arc(cx, cy, r, 0, 2 * Math.PI);
        g.strokeStyle = `hsla(${hue}, 80%, 60%, ${alpha.toFixed(3)})`;
        g.lineWidth   = 1.5 + (1 - prog) * 2;
        g.stroke();
        g.restore();
      }

      // Center glow (peaks on beat birth, decays)
      if (isPlaying) {
        const glowR = maxR * 0.05 + pulse * maxR * 0.22;
        g.save();
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, glowR * 2.8);
        grad.addColorStop(0,   `hsla(${hue}, 90%, 92%, ${(0.25 + pulse * 0.55).toFixed(3)})`);
        grad.addColorStop(0.3, `hsla(${hue}, 80%, 65%, ${(0.08 + pulse * 0.22).toFixed(3)})`);
        grad.addColorStop(1,   `hsla(${hue}, 60%, 30%, 0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy, glowR * 2.8, 0, 2 * Math.PI);
        g.fill();
        g.restore();
      } else {
        // Idle: slow breathing glow
        const idleA = 0.07 + 0.03 * Math.sin(Date.now() / 2200);
        g.save();
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.28);
        grad.addColorStop(0, `hsla(${hue}, 50%, 55%, ${idleA.toFixed(3)})`);
        grad.addColorStop(1, `hsla(${hue}, 30%, 20%, 0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy, maxR * 0.28, 0, 2 * Math.PI);
        g.fill();
        g.restore();
      }

      // State overlay: Greek symbol + Hz + description
      const bigSz = Math.round(Math.min(W, H) * 0.1);
      const midSz = Math.round(Math.min(W, H) * 0.03);
      const smlSz = Math.round(Math.min(W, H) * 0.022);
      const dimA  = isPlaying ? 1 : 0.4;

      g.save();
      g.textAlign = "center";

      g.font      = `${bigSz}px "Courier New", monospace`;
      g.fillStyle = `hsla(${hue}, 80%, 78%, ${(0.9 * dimA).toFixed(3)})`;
      g.fillText(st.sym, cx, cy - bigSz * 0.08);

      g.font      = `${midSz}px "Courier New", monospace`;
      g.fillStyle = `hsla(${hue}, 70%, 65%, ${(0.75 * dimA).toFixed(3)})`;
      g.fillText(`${bt.toFixed(1)} Hz  ·  ${st.label}`, cx, cy + bigSz * 0.55);

      g.font      = `${smlSz}px "Courier New", monospace`;
      g.fillStyle = `hsla(${hue}, 60%, 60%, ${(0.55 * dimA).toFixed(3)})`;
      g.fillText(st.desc, cx, cy + bigSz * 0.55 + smlSz * 1.7);

      g.restore();

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []); // refs only — no state deps

  // ── audio start ────────────────────────────────────────────────────────────

  function startAudio(m: AudioMode, car: number, bt: number, vol: number) {
    const actx   = new AudioContext();
    actxRef.current = actx;

    const master = actx.createGain();
    master.gain.setValueAtTime(0, actx.currentTime);
    master.gain.linearRampToValueAtTime(vol, actx.currentTime + 0.5);
    master.connect(actx.destination);
    masterRef.current = master;

    const now = actx.currentTime;
    nextBeatRef.current = Math.ceil(now * bt + 0.001) / bt;

    if (m === "binaural") {
      const leftOsc  = actx.createOscillator();
      const leftG    = actx.createGain();
      const leftPan  = actx.createStereoPanner();
      leftOsc.type   = "sine";
      leftOsc.frequency.setValueAtTime(car, now);
      leftG.gain.setValueAtTime(1, now);
      leftPan.pan.setValueAtTime(-1, now);
      leftOsc.connect(leftG);
      leftG.connect(leftPan);
      leftPan.connect(master);
      leftOsc.start(now);
      leftOscRef.current = leftOsc;

      const rightOsc  = actx.createOscillator();
      const rightG    = actx.createGain();
      const rightPan  = actx.createStereoPanner();
      rightOsc.type   = "sine";
      rightOsc.frequency.setValueAtTime(car + bt, now);
      rightG.gain.setValueAtTime(1, now);
      rightPan.pan.setValueAtTime(1, now);
      rightOsc.connect(rightG);
      rightG.connect(rightPan);
      rightPan.connect(master);
      rightOsc.start(now);
      rightOscRef.current = rightOsc;
    } else {
      // Isochronic: carrier + sine LFO amplitude modulation → gain [0, 1]
      const osc = actx.createOscillator();
      osc.type  = "sine";
      osc.frequency.setValueAtTime(car, now);

      const ampGain = actx.createGain();
      ampGain.gain.setValueAtTime(0.5, now);

      const lfoGain = actx.createGain();
      lfoGain.gain.setValueAtTime(0.5, now);

      const lfo = actx.createOscillator();
      lfo.type  = "sine";
      lfo.frequency.setValueAtTime(bt, now);

      osc.connect(ampGain);
      lfo.connect(lfoGain);
      lfoGain.connect(ampGain.gain);
      ampGain.connect(master);

      osc.start(now);
      lfo.start(now);

      isoOscRef.current = osc;
      isoLfoRef.current = lfo;
    }

    actx.resume();
  }

  // ── audio stop ────────────────────────────────────────────────────────────

  function stopAudio() {
    const actx = actxRef.current;
    if (!actx) return;
    const now  = actx.currentTime;
    const fade = 0.4;

    masterRef.current?.gain.setTargetAtTime(0, now, fade / 3);

    const toStop: Array<OscillatorNode | null> = [
      leftOscRef.current, rightOscRef.current, isoOscRef.current, isoLfoRef.current,
    ];
    toStop.forEach(o => { try { o?.stop(now + fade); } catch { /* already stopped */ } });

    leftOscRef.current  = null;
    rightOscRef.current = null;
    isoOscRef.current   = null;
    isoLfoRef.current   = null;
    masterRef.current   = null;

    ringsRef.current    = [];
    nextBeatRef.current = 0;

    setTimeout(() => {
      actx.close();
      actxRef.current = null;
    }, (fade + 0.2) * 1000);
  }

  // ── event handlers ────────────────────────────────────────────────────────

  function togglePlay() {
    if (playing) {
      playingRef.current = false;
      stopAudio();
      setPlaying(false);
    } else {
      startAudio(mode, carrier, beat, volume);
      playingRef.current = true;
      setPlaying(true);
    }
  }

  function applyPreset(bt: number, car: number) {
    setBeat(bt);
    setCarrier(car);
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const stNow = findState(beat);

  // ── styles helpers ────────────────────────────────────────────────────────

  const btnBase: React.CSSProperties = {
    padding: "0.25rem 0.55rem",
    fontSize: "0.7rem",
    borderRadius: "3px",
    fontFamily: "inherit",
    cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "transparent",
    color: "rgba(255,255,255,0.4)",
  };

  const activeBtn: React.CSSProperties = {
    ...btnBase,
    border: `1px solid rgba(255,255,255,0.35)`,
    background: "rgba(255,255,255,0.07)",
    color: "#fff",
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 3rem)",
        background: "#04040e",
        color: "#e0e0f0",
        fontFamily: "'Courier New', Courier, monospace",
      }}
    >
      {/* ── title bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.4rem 1rem",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}
      >
        <div>
          <span
            style={{ fontSize: "0.95rem", letterSpacing: "0.1em", color: `hsl(${stNow.hue}, 70%, 70%)` }}
          >
            binaural
          </span>
          <span
            style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.3)", marginLeft: "1rem" }}
          >
            brainwave entrainment · psychoacoustics
          </span>
        </div>
        <Link
          href="/dream"
          style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.2)", textDecoration: "none" }}
        >
          ← all prototypes
        </Link>
      </div>

      {/* ── canvas ── */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, display: "block", width: "100%" }}
      />

      {/* ── controls ── */}
      <div
        style={{
          flexShrink: 0,
          padding: "0.55rem 1rem",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(0,0,0,0.35)",
          display: "flex",
          flexDirection: "column",
          gap: "0.45rem",
        }}
      >
        {/* Row 1: mode + presets + play */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.3)" }}>mode</span>

          {(["binaural", "isochronic"] as AudioMode[]).map(m => (
            <button
              key={m}
              onClick={() => !playing && setMode(m)}
              style={mode === m ? activeBtn : { ...btnBase, cursor: playing ? "not-allowed" : "pointer" }}
            >
              {m}
            </button>
          ))}

          <span style={{ flex: 1 }} />

          {PRESETS.map(p => {
            const active = Math.abs(beat - p.beat) < 0.01;
            const pSt    = findState(p.beat);
            return (
              <button
                key={p.label}
                onClick={() => applyPreset(p.beat, p.carrier)}
                style={{
                  ...btnBase,
                  border: `1px solid rgba(255,255,255,${active ? 0.4 : 0.1})`,
                  background: active ? `hsla(${pSt.hue}, 60%, 18%, 0.7)` : "transparent",
                  color: active ? `hsl(${pSt.hue}, 80%, 72%)` : "rgba(255,255,255,0.35)",
                }}
              >
                {p.label}
              </button>
            );
          })}

          <button
            onClick={togglePlay}
            style={{
              padding: "0.3rem 1rem",
              fontSize: "0.82rem",
              fontFamily: "inherit",
              fontWeight: "bold",
              cursor: "pointer",
              borderRadius: "4px",
              marginLeft: "0.4rem",
              border: `1px solid ${playing ? "rgba(255,100,100,0.5)" : `hsla(${stNow.hue}, 70%, 45%, 0.6)`}`,
              background: playing
                ? "rgba(255,80,80,0.08)"
                : `hsla(${stNow.hue}, 55%, 13%, 0.9)`,
              color: playing ? "#ff8888" : `hsl(${stNow.hue}, 80%, 70%)`,
            }}
          >
            {playing ? "■ Stop" : "▶ Start"}
          </button>
        </div>

        {/* Row 2: sliders */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <label
            style={{
              fontSize: "0.7rem",
              color: "rgba(255,255,255,0.38)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            beat
            <input
              type="range"
              min="0.5"
              max="40"
              step="0.5"
              value={beat}
              onChange={e => setBeat(parseFloat(e.target.value))}
              style={{ width: "110px", accentColor: `hsl(${stNow.hue}, 70%, 55%)` }}
            />
            <span style={{ color: `hsl(${stNow.hue}, 70%, 65%)`, minWidth: "46px" }}>
              {beat.toFixed(1)} Hz
            </span>
          </label>

          <label
            style={{
              fontSize: "0.7rem",
              color: "rgba(255,255,255,0.38)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            carrier
            <input
              type="range"
              min="80"
              max="400"
              step="5"
              value={carrier}
              onChange={e => setCarrier(parseInt(e.target.value, 10))}
              style={{ width: "80px", accentColor: `hsl(${stNow.hue}, 70%, 55%)` }}
            />
            <span style={{ color: "rgba(255,255,255,0.45)", minWidth: "46px" }}>
              {carrier} Hz
            </span>
          </label>

          <label
            style={{
              fontSize: "0.7rem",
              color: "rgba(255,255,255,0.38)",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            vol
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              style={{ width: "70px", accentColor: `hsl(${stNow.hue}, 70%, 55%)` }}
            />
          </label>

          {mode === "binaural" && (
            <span
              style={{
                fontSize: "0.65rem",
                color: "rgba(220, 200, 100, 0.7)",
                marginLeft: "auto",
              }}
            >
              🎧 headphones required for binaural
            </span>
          )}
        </div>
      </div>

      {/* ── design notes ── */}
      <div
        style={{
          textAlign: "right",
          padding: "0.18rem 1rem",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          flexShrink: 0,
        }}
      >
        <Link
          href="/dream/42-binaural/README.md"
          style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.14)", textDecoration: "none" }}
        >
          design notes
        </Link>
      </div>
    </div>
  );
}
