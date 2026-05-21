"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Link from "next/link";

// ── types ─────────────────────────────────────────────────────────────────────
type SetupPhase = "setup-now" | "setup-goal" | "ready";
type RunPhase   = "journey" | "paused" | "complete";
type Phase      = SetupPhase | RunPhase;
type NKind      = "off" | "pink" | "brown";
interface Pt { x: number; y: number } // valence × arousal, both in [-1, 1]

// ── pure math ─────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function interpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

// normalize [-1,1] → [0,1]
function arN(p: Pt) { return (p.y + 1) / 2; }
function vlN(p: Pt) { return (p.x + 1) / 2; }

// ── audio param mappings (arousal [-1,1], valence [-1,1]) ─────────────────────
function bpmFor(ar: number)    { return Math.round(40 + ((ar + 1) / 2) * 100); }
function voicesFor(ar: number) { return Math.max(1, Math.round(1 + ((ar + 1) / 2) * 3)); }
function attackFor(ar: number) { return Math.max(0.02, 0.8 - ((ar + 1) / 2) * 0.76); }
function filterFcFor(vl: number) { return 400 * Math.pow(12.5, (vl + 1) / 2); }

function durFor(ar: number, bpm: number, vl: number): number {
  const beatDur  = 60 / bpm;
  const arFactor = 0.9 - ((ar + 1) / 2) * 0.65;
  const vlMod    = 1 + ((1 - vl) / 2) * 0.4;
  return beatDur * arFactor * vlMod;
}

function baseFreqFor(ar: number): number {
  return 130.81 * Math.pow(2, ((ar + 1) / 2) * 2);   // C3 → C5
}

function chordFor(vl: number): number[] {
  if (vl > 0.33)  return [0, 4, 7];  // major
  if (vl < -0.33) return [0, 3, 6];  // dim
  return [0, 3, 7];                  // minor
}

// ── brainwave mapping ─────────────────────────────────────────────────────────
function beatHzFor(ar: number): number {
  if (ar < -0.6) return 2;    // δ deep rest
  if (ar < -0.2) return 6;    // θ meditative
  if (ar < 0.3)  return 10;   // α relaxed
  return 16;                  // β focused
}
function beatSymFor(ar: number): string {
  if (ar < -0.6) return "δ";
  if (ar < -0.2) return "θ";
  if (ar < 0.3)  return "α";
  return "β";
}

// ── quadrant label ────────────────────────────────────────────────────────────
function quadLabel(p: Pt): string {
  const a = p.y > 0.15 ? "energetic" : p.y < -0.15 ? "calm" : "still";
  const v = p.x > 0.15 ? "happy" : p.x < -0.15 ? "sad" : "neutral";
  return `${a} · ${v}`;
}

// ── background color bilinear blend ───────────────────────────────────────────
function bgRgb(p: Pt): [number, number, number] {
  const tx = (p.x + 1) / 2, ty = (p.y + 1) / 2;
  const c: [number, number, number][] = [
    [210, 130,  20],  // excited+happy → amber
    [ 80,   0, 190],  // excited+sad   → purple
    [ 10, 150, 100],  // calm+happy    → teal
    [  5,  20, 110],  // calm+sad      → navy
  ];
  return [
    Math.round(ty*tx*c[0][0] + ty*(1-tx)*c[1][0] + (1-ty)*tx*c[2][0] + (1-ty)*(1-tx)*c[3][0]),
    Math.round(ty*tx*c[0][1] + ty*(1-tx)*c[1][1] + (1-ty)*tx*c[2][1] + (1-ty)*(1-tx)*c[3][1]),
    Math.round(ty*tx*c[0][2] + ty*(1-tx)*c[1][2] + (1-ty)*tx*c[2][2] + (1-ty)*(1-tx)*c[3][2]),
  ];
}

// ── canvas coord converters ───────────────────────────────────────────────────
function ptToXY(p: Pt, W: number, H: number): [number, number] {
  return [W / 2 + p.x * (W / 2 - 32), H / 2 - p.y * (H / 2 - 32)];
}
function xyToPt(cx: number, cy: number, W: number, H: number): Pt {
  return {
    x: Math.max(-1, Math.min(1, (cx - W / 2) / (W / 2 - 32))),
    y: Math.max(-1, Math.min(1, -(cy - H / 2) / (H / 2 - 32))),
  };
}

// ── noise chain helpers ───────────────────────────────────────────────────────
function buildNoiseLayer(
  ac: AudioContext, master: GainNode, kind: "pink" | "brown", vol: number,
  srcR: { current: AudioBufferSourceNode | null }, gainR: { current: GainNode | null },
) {
  const n   = Math.round(ac.sampleRate * 2);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d   = buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "pink") {
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.153852;  b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.016898;
      d[i] = (b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6=w*0.115926;
    } else {
      b0 = (b0 + 0.02*w) / 1.02; d[i] = b0 * 3.5;
    }
  }
  const src  = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const filt = ac.createBiquadFilter();
  filt.type = "lowpass"; filt.frequency.value = kind === "pink" ? 1200 : 300;
  const g   = ac.createGain(); g.gain.value = vol * 0.4;
  src.connect(filt); filt.connect(g); g.connect(master); src.start();
  srcR.current = src; gainR.current = g;
}

function clearNoiseLayer(
  srcR: { current: AudioBufferSourceNode | null }, gainR: { current: GainNode | null },
) {
  try { srcR.current?.stop(); } catch { /* already stopped */ }
  srcR.current?.disconnect(); gainR.current?.disconnect();
  srcR.current = null; gainR.current = null;
}

function fmtTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// ── durations ─────────────────────────────────────────────────────────────────
const DURS = [
  { label: "Quick  2m",  secs: 120  },
  { label: "Short  5m",  secs: 300  },
  { label: "Normal 10m", secs: 600  },
  { label: "Deep   20m", secs: 1200 },
];

// ════════════════════════════════════════════════════════════════════════════════

export default function MoodJourney() {
  const [phase,    setPhase]    = useState<Phase>("setup-now");
  const [nowPt,    setNowPt]    = useState<Pt | null>(null);
  const [goalPt,   setGoalPt]   = useState<Pt | null>(null);
  const [durIdx,   setDurIdx]   = useState(1);
  const [noiseK,   setNoiseK]   = useState<NKind>("off");
  const [noiseVol, setNoiseVol] = useState(0.25);
  const [pct,      setPct]      = useState(0);
  const [hudTxt,   setHudTxt]   = useState("");

  const canvasRef  = useRef<HTMLCanvasElement | null>(null);
  const acRef      = useRef<AudioContext | null>(null);
  const masterRef  = useRef<GainNode | null>(null);
  const filterRef  = useRef<BiquadFilterNode | null>(null);
  const isoLfoRef  = useRef<OscillatorNode | null>(null);
  const noiseSrcR  = useRef<AudioBufferSourceNode | null>(null);
  const noiseGainR = useRef<GainNode | null>(null);

  const phaseRef    = useRef<Phase>("setup-now");
  const nowRef      = useRef<Pt | null>(null);
  const goalRef     = useRef<Pt | null>(null);
  const durRef      = useRef(300);
  const progressRef = useRef(0);
  const startRef    = useRef(0);
  const pausedRef   = useRef(0);
  const trailRef    = useRef<Pt[]>([]);
  const schedRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animRef     = useRef(0);

  // Sync refs ← state
  useEffect(() => { phaseRef.current = phase; },  [phase]);
  useEffect(() => { nowRef.current   = nowPt; },  [nowPt]);
  useEffect(() => { goalRef.current  = goalPt; }, [goalPt]);
  useEffect(() => { durRef.current   = DURS[durIdx].secs; }, [durIdx]);

  // ── derived current position ──────────────────────────────────────────────
  const currentPt = useCallback((): Pt => {
    const n = nowRef.current, g = goalRef.current;
    if (!n || !g) return { x: 0, y: 0 };
    return interpPt(n, g, progressRef.current);
  }, []);

  // ── note trigger ──────────────────────────────────────────────────────────
  const triggerChord = useCallback(() => {
    const ac   = acRef.current;
    const filt = filterRef.current;
    if (!ac || !filt || phaseRef.current !== "journey") return;
    const p   = currentPt();
    const { x: vl, y: ar } = p;
    const bpm       = bpmFor(ar);
    const voices    = voicesFor(ar);
    const chord     = chordFor(vl);
    const baseFreq  = baseFreqFor(ar);
    const rawAtk    = attackFor(ar);
    const noteDur   = durFor(ar, bpm, vl);
    const attack    = Math.min(rawAtk, noteDur * 0.4);
    const isArp     = ar > 0.2;
    const arpStep   = isArp ? (60 / bpm) / voices : 0;
    const now       = ac.currentTime;
    const peak      = 0.18 / Math.sqrt(voices);
    filt.frequency.exponentialRampToValueAtTime(Math.max(80, filterFcFor(vl)), now + 0.3);
    for (let i = 0; i < Math.min(voices, chord.length); i++) {
      const freq = baseFreq * Math.pow(2, chord[i] / 12);
      const t    = now + i * arpStep;
      const osc  = ac.createOscillator();
      const g    = ac.createGain();
      osc.type = "triangle"; osc.frequency.value = freq;
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.001, t + noteDur);
      osc.connect(g); g.connect(filt);
      osc.start(t); osc.stop(t + noteDur + 0.06);
    }
    schedRef.current = setTimeout(triggerChord, (60 / bpm) * 1000);
  }, [currentPt]);

  // ── start journey ─────────────────────────────────────────────────────────
  const startJourney = useCallback(() => {
    const n = nowRef.current, g = goalRef.current;
    if (!n || !g) return;

    const ac     = new AudioContext();
    acRef.current = ac;
    const master = ac.createGain(); master.gain.value = 0.65;
    master.connect(ac.destination);
    masterRef.current = master;

    // Lowpass filter for mood synthesis
    const filt  = ac.createBiquadFilter();
    filt.type   = "lowpass"; filt.frequency.value = 2000; filt.Q.value = 0.7;
    filt.connect(master);
    filterRef.current = filt;

    // Isochronic layer: carrier → isoAmpGain ← LFO
    const carrier   = ac.createOscillator(); carrier.type = "sine"; carrier.frequency.value = 200;
    const isoAmpG   = ac.createGain(); isoAmpG.gain.value = 0.5;
    const isoLevel  = ac.createGain(); isoLevel.gain.value = 0.35;   // keep under mood synth
    const lfo       = ac.createOscillator(); lfo.type = "sine"; lfo.frequency.value = beatHzFor(n.y);
    const lfoGain   = ac.createGain(); lfoGain.gain.value = 0.45;
    lfo.connect(lfoGain); lfoGain.connect(isoAmpG.gain);
    carrier.connect(isoAmpG); isoAmpG.connect(isoLevel); isoLevel.connect(master);
    carrier.start(); lfo.start();
    isoLfoRef.current = lfo;

    progressRef.current  = 0;
    trailRef.current     = [{ ...n }];
    startRef.current     = Date.now();
    setPct(0);
    setPhase("journey");
    triggerChord();
  }, [triggerChord]);

  // ── pause / resume ────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    if (phaseRef.current === "journey") {
      pausedRef.current = Date.now();
      if (schedRef.current !== null) { clearTimeout(schedRef.current); schedRef.current = null; }
      setPhase("paused");
    } else if (phaseRef.current === "paused") {
      startRef.current += Date.now() - pausedRef.current;
      setPhase("journey");
      triggerChord();
    }
  }, [triggerChord]);

  // ── canvas click (setup only) ─────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const r  = cv.getBoundingClientRect();
    const cx = (e.clientX - r.left) * (cv.width / r.width);
    const cy = (e.clientY - r.top)  * (cv.height / r.height);
    const pt = xyToPt(cx, cy, cv.width, cv.height);
    if (phaseRef.current === "setup-now")  { setNowPt(pt);  setPhase("setup-goal"); }
    else if (phaseRef.current === "setup-goal") { setGoalPt(pt); setPhase("ready"); }
  }, []);

  // ── main RAF / journey loop ───────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    const totalMs = durRef.current * 1000;

    const draw = () => {
      const ph    = phaseRef.current;
      const n     = nowRef.current;
      const g     = goalRef.current;
      const prg   = progressRef.current;
      const cur   = (n && g) ? interpPt(n, g, prg) : { x: 0, y: 0 };
      const [bgR, bgG, bgB] = bgRgb(cur);

      // ── background ──────────────────────────────────────────────────────
      ctx.fillStyle = `rgb(${bgR*0.15+6},${bgG*0.15+6},${bgB*0.15+6})`;
      ctx.fillRect(0, 0, W, H);

      // quadrant color washes from corners
      const corners: [number, number, number, number, number][] = [
        [0,   0,   210, 130,  20],   // TL: excited+sad → amber-ish warm at top-right edge
        [W/2, 0,   210, 130,  20],   // swap — energetic+happy: amber top-right
        [0,   0,    80,   0, 190],   // energetic+sad: purple top-left
        [W/2, H/2,  10, 150, 100],   // calm+happy: teal bottom-right
        [0,   H/2,   5,  20, 110],   // calm+sad: navy bottom-left
      ];
      const qDefs: [number, number, number, number, number][] = [
        [W/2, 0,    210, 130,  20],  // energetic+happy (TR)
        [0,   0,     80,   0, 190],  // energetic+sad   (TL)
        [W/2, H/2,   10, 150, 100],  // calm+happy      (BR)
        [0,   H/2,    5,  20, 110],  // calm+sad        (BL)
      ];
      for (const [qx, qy, r2, g2, b2] of qDefs) {
        const gr = ctx.createRadialGradient(qx + W/4, qy + H/4, 0, qx + W/4, qy + H/4, Math.max(W,H)*0.55);
        gr.addColorStop(0, `rgba(${r2},${g2},${b2},0.35)`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
      void corners; // suppress unused warning

      // ── axes ────────────────────────────────────────────────────────────
      ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.lineWidth = 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(28, H/2); ctx.lineTo(W-28, H/2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W/2, 28); ctx.lineTo(W/2, H-28); ctx.stroke();

      // axis labels
      ctx.font = "10px monospace"; ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.textAlign = "left";  ctx.fillText("← sad",     34,    H/2 - 8);
      ctx.textAlign = "right"; ctx.fillText("happy →",   W-34,  H/2 - 8);
      ctx.textAlign = "center";
      ctx.fillText("energetic", W/2, 24);
      ctx.fillText("calm",      W/2, H - 8);

      // corner labels
      ctx.font = "9px monospace"; ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.textAlign = "left";  ctx.fillText("distressed", 8, 20);
      ctx.textAlign = "right"; ctx.fillText("excited",  W-8, 20);
      ctx.textAlign = "left";  ctx.fillText("serene",     8, H-8);
      ctx.textAlign = "right"; ctx.fillText("content",  W-8, H-8);

      // ── trail ───────────────────────────────────────────────────────────
      const trail = trailRef.current;
      if (trail.length > 1) {
        ctx.beginPath();
        const [tx0, ty0] = ptToXY(trail[0], W, H);
        ctx.moveTo(tx0, ty0);
        for (let i = 1; i < trail.length; i++) {
          const [tx, ty] = ptToXY(trail[i], W, H); ctx.lineTo(tx, ty);
        }
        ctx.strokeStyle = "rgba(180,200,255,0.35)"; ctx.lineWidth = 2.5;
        ctx.setLineDash([]); ctx.stroke();
      }

      // ── path to goal (dashed) ────────────────────────────────────────────
      if (g && (ph === "journey" || ph === "paused" || ph === "ready") && n) {
        const [cx2, cy2] = ptToXY(prg > 0 ? cur : n, W, H);
        const [gx, gy]   = ptToXY(g, W, H);
        ctx.strokeStyle = "rgba(130,210,130,0.25)"; ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 8]);
        ctx.beginPath(); ctx.moveTo(cx2, cy2); ctx.lineTo(gx, gy); ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── GOAL dot ────────────────────────────────────────────────────────
      if (g) {
        const [gx, gy] = ptToXY(g, W, H);
        ctx.strokeStyle = "rgba(120,230,120,0.7)"; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 5]);
        ctx.beginPath(); ctx.arc(gx, gy, 14, 0, Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(120,230,120,0.85)";
        ctx.beginPath(); ctx.arc(gx, gy, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "rgba(120,230,120,0.55)";
        ctx.font = "9px monospace"; ctx.textAlign = "center";
        ctx.fillText("GOAL", gx, gy + 23);
      }

      // ── NOW dot (during setup) ───────────────────────────────────────────
      if (n && (ph === "setup-goal" || ph === "ready")) {
        const [nx, ny] = ptToXY(n, W, H);
        ctx.fillStyle = "rgba(255,210,80,0.9)";
        ctx.beginPath(); ctx.arc(nx, ny, 8, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "rgba(255,210,80,0.55)";
        ctx.font = "9px monospace"; ctx.textAlign = "center";
        ctx.fillText("NOW", nx, ny + 20);
      }

      // ── current position dot (journey / paused / complete) ───────────────
      if (ph === "journey" || ph === "paused" || ph === "complete") {
        const [cx2, cy2] = ptToXY(cur, W, H);
        const hue = (Math.atan2(cur.y, cur.x) * 180 / Math.PI + 360) % 360;
        ctx.shadowBlur = 24; ctx.shadowColor = `hsl(${hue},80%,55%)`;
        ctx.fillStyle  = `hsl(${hue},80%,72%)`;
        ctx.beginPath(); ctx.arc(cx2, cy2, 11, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    if (phase === "journey") {
      const tick = () => {
        const elapsed = Date.now() - startRef.current;
        const t       = Math.min(1, elapsed / totalMs);
        progressRef.current = t;
        setPct(Math.round(t * 100));

        const n = nowRef.current, g = goalRef.current;
        if (n && g) {
          const cur = interpPt(n, g, t);
          // update trail
          const trail = trailRef.current;
          const last  = trail[trail.length - 1];
          if (!last || Math.abs(cur.x-last.x) > 0.003 || Math.abs(cur.y-last.y) > 0.003) {
            trail.push({ ...cur });
            if (trail.length > 600) trail.shift();
          }
          // update isochronic LFO
          const lfo = isoLfoRef.current, ac = acRef.current;
          if (lfo && ac) lfo.frequency.setTargetAtTime(beatHzFor(cur.y), ac.currentTime, 4);
          // hud
          const rem = Math.max(0, totalMs - elapsed) / 1000;
          setHudTxt(`${beatSymFor(cur.y)} ${beatHzFor(cur.y)} Hz · ${quadLabel(cur)} · ${fmtTime(rem)} remaining`);
        }
        draw();

        if (t >= 1) {
          if (schedRef.current !== null) { clearTimeout(schedRef.current); schedRef.current = null; }
          acRef.current?.close();
          setPhase("complete");
          return;
        }
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(animRef.current);
    } else {
      // Static draw for setup / paused / complete
      draw();
    }
  }, [phase]);   // re-runs when phase changes; reads live refs for everything else

  // Redraw on setup state changes (nowPt / goalPt updates)
  useEffect(() => {
    if (phase === "setup-now" || phase === "setup-goal" || phase === "ready") {
      const cv = canvasRef.current; if (!cv) return;
      const ctx = cv.getContext("2d"); if (!ctx) return;
      // trigger full redraw by queuing a micro-task
      requestAnimationFrame(() => {
        const ph = phaseRef.current;
        if (ph === "setup-now" || ph === "setup-goal" || ph === "ready") {
          // phase-effect above handles it; here we just need the redraw on nowPt/goalPt
          setHudTxt(""); // no-op to trigger the phase effect
        }
      });
    }
  }, [nowPt, goalPt, phase]);

  // ── noise effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    const ac = acRef.current, master = masterRef.current;
    if (!ac || !master) return;
    clearNoiseLayer(noiseSrcR, noiseGainR);
    if (noiseK !== "off") buildNoiseLayer(ac, master, noiseK, noiseVol, noiseSrcR, noiseGainR);
  }, [noiseK, noiseVol]);

  // ── noise volume live update ───────────────────────────────────────────────
  useEffect(() => {
    const g = noiseGainR.current, ac = acRef.current;
    if (g && ac) g.gain.setTargetAtTime(noiseVol * 0.4, ac.currentTime, 0.1);
  }, [noiseVol]);

  // ── cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      if (schedRef.current !== null) clearTimeout(schedRef.current);
      acRef.current?.close();
    };
  }, []);

  // ── UI helpers ────────────────────────────────────────────────────────────
  const isActive   = phase === "journey" || phase === "paused";
  const isSetup    = phase === "setup-now" || phase === "setup-goal" || phase === "ready";
  const instructions: Record<SetupPhase, string> = {
    "setup-now":  "Click the canvas to place your NOW mood.",
    "setup-goal": "Click to place your GOAL mood.",
    "ready":      "Choose a duration, then click Begin journey.",
  };

  const resetJourney = () => {
    setPhase("setup-now"); setNowPt(null); setGoalPt(null);
    progressRef.current = 0; trailRef.current = []; setPct(0); setHudTxt("");
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#e8e8e8", fontFamily: "monospace", padding: "20px 24px", maxWidth: 680, margin: "0 auto" }}>
      <Link href="/dream" style={{ color: "#555", fontSize: "12px", textDecoration: "none" }}>← dream index</Link>

      <h1 style={{ fontSize: "22px", fontWeight: 600, margin: "12px 0 2px" }}>Mood Journey</h1>
      <p style={{ color: "#888", fontSize: "13px", margin: "0 0 14px" }}>
        Navigate from one emotional state to another — the music walks with you.
        <span style={{ color: "#555" }}>{" "}(Russell circumplex · zero deps)</span>
      </p>

      {/* Setup instruction */}
      {isSetup && (
        <p style={{ color: "#aaa", fontSize: "12px", margin: "0 0 8px" }}>
          {instructions[phase as SetupPhase]}
        </p>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={640} height={380}
        onClick={handleCanvasClick}
        style={{
          display: "block", width: "100%",
          cursor: (phase === "setup-now" || phase === "setup-goal") ? "crosshair" : "default",
          borderRadius: 6, border: "1px solid rgba(255,255,255,0.07)",
        }}
      />

      {/* HUD / status */}
      {isActive && (
        <div style={{ fontSize: "12px", color: "#88aacc", marginTop: 8, letterSpacing: "0.04em" }}>
          {hudTxt}
        </div>
      )}

      {/* Progress bar */}
      {isActive && (
        <div style={{ background: "#181818", height: 4, borderRadius: 2, marginTop: 6 }}>
          <div style={{ background: "#4477bb", height: "100%", width: `${pct}%`, borderRadius: 2, transition: "width 0.4s linear" }} />
        </div>
      )}

      {/* Controls row */}
      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {/* Duration picker — only before journey */}
        {isSetup && (
          <div style={{ display: "flex", gap: 6 }}>
            {DURS.map((d, i) => (
              <button key={d.label} onClick={() => setDurIdx(i)} style={{
                padding: "4px 10px", fontSize: "11px", fontFamily: "monospace",
                background: durIdx === i ? "#1e2e40" : "#111",
                border: `1px solid ${durIdx === i ? "#3a6a99" : "#2a2a2a"}`,
                color: durIdx === i ? "#88bbdd" : "#555", borderRadius: 4, cursor: "pointer",
              }}>{d.label}</button>
            ))}
          </div>
        )}

        {/* Begin journey */}
        {phase === "ready" && (
          <button onClick={startJourney} style={{
            padding: "8px 22px", fontSize: "13px", fontFamily: "monospace",
            background: "#122012", border: "1px solid #3a7a3a",
            color: "#7ad67a", borderRadius: 6, cursor: "pointer",
          }}>▶ Begin journey</button>
        )}

        {/* Pause / Resume */}
        {isActive && (
          <button onClick={togglePause} style={{
            padding: "6px 16px", fontSize: "12px", fontFamily: "monospace",
            background: phase === "paused" ? "#122012" : "#111",
            border: `1px solid ${phase === "paused" ? "#3a7a3a" : "#2a2a2a"}`,
            color: phase === "paused" ? "#7ad67a" : "#777", borderRadius: 4, cursor: "pointer",
          }}>{phase === "paused" ? "▶ Resume" : "⏸ Pause"}</button>
        )}

        {/* Noise controls */}
        {isActive && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {(["off", "pink", "brown"] as NKind[]).map(k => (
              <button key={k} onClick={() => setNoiseK(k)} style={{
                padding: "3px 9px", fontSize: "11px", fontFamily: "monospace",
                background: noiseK === k ? "#1e1e30" : "#111",
                border: `1px solid ${noiseK === k ? "#4455aa" : "#2a2a2a"}`,
                color: noiseK === k ? "#99aadd" : "#555", borderRadius: 3, cursor: "pointer",
              }}>{k}</button>
            ))}
            {noiseK !== "off" && (
              <input type="range" min="0.05" max="0.6" step="0.01"
                value={noiseVol} onChange={e => setNoiseVol(Number(e.target.value))}
                style={{ width: 80, accentColor: "#4455aa" }} />
            )}
          </div>
        )}

        {/* Reset during setup */}
        {(phase === "setup-goal" || phase === "ready") && (
          <button onClick={resetJourney} style={{
            padding: "4px 12px", fontSize: "11px", fontFamily: "monospace",
            background: "#111", border: "1px solid #2a2a2a", color: "#555", borderRadius: 4, cursor: "pointer",
          }}>← reset</button>
        )}
      </div>

      {/* Complete panel */}
      {phase === "complete" && (
        <div style={{ marginTop: 18, padding: "14px 18px", background: "#0d180d", border: "1px solid #2a5a2a", borderRadius: 8 }}>
          <p style={{ color: "#7aba7a", fontSize: "14px", margin: "0 0 6px" }}>✓ Journey complete</p>
          {nowPt && goalPt && (
            <p style={{ color: "#666", fontSize: "12px", margin: "0 0 12px" }}>
              {quadLabel(nowPt)} → {quadLabel(goalPt)} over {fmtTime(DURS[durIdx].secs)}.
            </p>
          )}
          <button onClick={resetJourney} style={{
            padding: "6px 16px", fontSize: "12px", fontFamily: "monospace",
            background: "#111", border: "1px solid #2a2a2a", color: "#777", borderRadius: 4, cursor: "pointer",
          }}>← new journey</button>
        </div>
      )}

      <p style={{ marginTop: 20, fontSize: "11px", color: "#444" }}>
        Combines{" "}<Link href="/dream/38-mood-xy" style={{ color: "#556" }}>38-mood-xy</Link>{" "}synthesis
        with{" "}<Link href="/dream/42-binaural" style={{ color: "#556" }}>42-binaural</Link>{" "}isochronic tones —
        both track the gliding position automatically. ·{" "}
        <a href="/dream/47-mood-journey/README.md" target="_blank" style={{ color: "#556" }}>design notes</a>
      </p>
    </div>
  );
}
