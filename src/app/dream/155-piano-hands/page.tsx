"use client";
import { useEffect, useRef, useState } from "react";

// ── constants ─────────────────────────────────────────────────────────────

const MIDI_LO = 48; // C3
const MIDI_HI = 71; // B4

const WHITE_MIDIS = [48,50,52,53,55,57,59,60,62,64,65,67,69,71] as const;
const BLACK_DEFS: [number, number][] = [
  [49,0],[51,1],[54,3],[56,4],[58,5],
  [61,7],[63,8],[66,10],[68,11],[70,12],
];
// pitch class → hue (C…B)
const PC_HUE = [260,282,308,335,15,155,128,88,58,32,12,300] as const;

// Für Elise opening: [midi, dur_sec, gap_sec]
const DEMO_SEQ: [number, number, number][] = [
  [64,.28,.05],[63,.28,.05],[64,.28,.05],[63,.28,.05],[64,.28,.05],
  [59,.28,.05],[62,.28,.05],[60,.28,.05],[57,.55,.12],
  [48,.08,.04],[52,.08,.04],[57,.28,.05],[59,.55,.12],
  [49,.08,.04],[52,.08,.04],[56,.28,.05],[59,.28,.05],[60,.55,.25],
  [48,.08,.04],[52,.08,.04],[57,.28,.05],[64,.28,.05],
  [63,.28,.05],[64,.28,.05],[63,.28,.05],[64,.28,.05],
  [59,.28,.05],[62,.28,.05],[60,.28,.05],[57,.55,.65],
];

// ── helpers ───────────────────────────────────────────────────────────────

function midiFreq(m: number) { return 440 * 2 ** ((m - 69) / 12); }
function freqMidi(f: number) { return Math.round(12 * Math.log2(f / 440) + 69); }
function midiHue(m: number) { return PC_HUE[((m % 12) + 12) % 12]; }

function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const R = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + R, y);
  ctx.lineTo(x + w - R, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + R);
  ctx.lineTo(x + w, y + h - R);
  ctx.quadraticCurveTo(x + w, y + h, x + w - R, y + h);
  ctx.lineTo(x + R, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - R);
  ctx.lineTo(x, y + R);
  ctx.quadraticCurveTo(x, y, x + R, y);
  ctx.closePath();
}

// autocorrelation pitch detection (C2–C6 range)
function detectPitch(buf: Float32Array, sr: number): number {
  const half = buf.length >> 1;
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  if (rms / buf.length < 0.00014) return -1;
  const lo = Math.ceil(sr / 1050);
  const hi = Math.min(half, Math.floor(sr / 58));
  let best = -1, bestC = 0, lastC = 1, found = false;
  for (let o = lo; o < hi; o++) {
    let c = 0;
    for (let i = 0; i < half; i++) c += Math.abs(buf[i] - buf[i + o]);
    c = 1 - c / half;
    if (c > 0.9 && c > lastC) {
      found = true;
      if (c > bestC) { bestC = c; best = o; }
    } else if (found) break;
    lastC = c;
  }
  return best > 0 && bestC > 0.965 ? sr / best : -1;
}

// ── types ─────────────────────────────────────────────────────────────────

interface KeyInfo { x: number; w: number; pressY: number; isBlack: boolean; }

interface Finger {
  id: number; midi: number;
  x: number; pressY: number; w: number;
  y: number; alpha: number; hue: number;
  phase: 0 | 1 | 2; // 0=descend  1=press  2=lift
  born: number; liftAt: number;
}

interface S {
  mode: "idle" | "demo" | "mic";
  actx: AudioContext | null;
  stream: MediaStream | null;
  analyser: AnalyserNode | null;
  timeBuf: Float32Array | null;
  fingers: Finger[];
  nextId: number;
  active: Map<number, number>;          // midi → finger id
  pending: { midi: number; actxWhen: number; dur: number }[];
  pendingLifts: { midi: number; liftAt: number }[];
  demoUntil: number;
  demoIdx: number;
  keys: Map<number, KeyInfo>;
  kbTop: number;
  kbH: number;
  rafId: number;
  lastPitch: number;
  lastPitchSeen: number;
}

// ── layout ────────────────────────────────────────────────────────────────

function buildLayout(W: number, H: number, s: S) {
  s.kbTop = H * 0.56;
  s.kbH = H * 0.42;
  const wkW = W / WHITE_MIDIS.length;
  const bkW = wkW * 0.62;
  s.keys.clear();
  WHITE_MIDIS.forEach((midi, i) => {
    s.keys.set(midi, { x: i * wkW + wkW / 2, w: wkW - 2, pressY: s.kbTop, isBlack: false });
  });
  BLACK_DEFS.forEach(([midi, ai]) => {
    s.keys.set(midi, { x: ai * wkW + wkW - bkW / 2, w: bkW, pressY: s.kbTop + 2, isBlack: true });
  });
}

// ── finger management ─────────────────────────────────────────────────────

function spawnFinger(midi: number, s: S) {
  const k = s.keys.get(midi);
  if (!k) return;
  const existId = s.active.get(midi);
  if (existId !== undefined) {
    const ef = s.fingers.find(f => f.id === existId);
    if (ef && ef.phase !== 2) { ef.phase = 2; ef.liftAt = performance.now(); }
  }
  const f: Finger = {
    id: s.nextId++, midi,
    x: k.x, pressY: k.pressY, w: k.w,
    y: 0, alpha: 0, hue: midiHue(midi),
    phase: 0, born: performance.now(), liftAt: 0,
  };
  s.fingers.push(f);
  s.active.set(midi, f.id);
}

function liftFinger(midi: number, s: S) {
  const id = s.active.get(midi);
  if (id === undefined) return;
  const f = s.fingers.find(x => x.id === id);
  if (f && f.phase !== 2) { f.phase = 2; f.liftAt = performance.now(); }
  s.active.delete(midi);
}

// ── demo scheduler ────────────────────────────────────────────────────────

function schedOsc(midi: number, when: number, dur: number, actx: AudioContext) {
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = "triangle";
  osc.frequency.value = midiFreq(midi);
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.22, when + 0.016);
  g.gain.setTargetAtTime(0, when + dur * 0.65, 0.042);
  osc.connect(g);
  g.connect(actx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.35);
}

function advanceDemo(s: S) {
  if (!s.actx || s.mode !== "demo") return;
  const LOOK = 0.38;
  while (s.demoUntil < s.actx.currentTime + LOOK) {
    const [midi, dur, gap] = DEMO_SEQ[s.demoIdx % DEMO_SEQ.length];
    const when = Math.max(s.demoUntil, s.actx.currentTime + 0.02);
    schedOsc(midi, when, dur, s.actx);
    s.pending.push({ midi, actxWhen: when, dur });
    s.demoUntil = when + dur + gap;
    s.demoIdx++;
  }
}

// ── draw ──────────────────────────────────────────────────────────────────

function drawCanvas(cv: HTMLCanvasElement, s: S) {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const W = cv.width, H = cv.height;
  const now = performance.now();

  // process demo pending notes → spawn/lift fingers
  if (s.actx && s.mode === "demo") {
    const ct = s.actx.currentTime;
    s.pending = s.pending.filter(p => {
      if (ct >= p.actxWhen - 0.016) {
        spawnFinger(p.midi, s);
        s.pendingLifts.push({ midi: p.midi, liftAt: p.actxWhen + p.dur });
        return false;
      }
      return true;
    });
    s.pendingLifts = s.pendingLifts.filter(pl => {
      if (ct >= pl.liftAt) { liftFinger(pl.midi, s); return false; }
      return true;
    });
    advanceDemo(s);
  }

  // mic pitch detection
  if (s.mode === "mic" && s.analyser && s.timeBuf && s.actx) {
    s.analyser.getFloatTimeDomainData(
      s.timeBuf as unknown as Float32Array<ArrayBuffer>,
    );
    const hz = detectPitch(s.timeBuf, s.actx.sampleRate);
    if (hz > 0) {
      const m = freqMidi(hz);
      if (m >= MIDI_LO && m <= MIDI_HI && now - s.lastPitch > 80) {
        s.lastPitch = now;
        s.active.forEach((_, am) => { if (am !== m) liftFinger(am, s); });
        if (!s.active.has(m)) spawnFinger(m, s);
        s.lastPitchSeen = now;
      }
    } else if (now - s.lastPitchSeen > 320) {
      [...s.active.keys()].forEach(m => liftFinger(m, s));
    }
  }

  // animate fingers
  const DSCND = 220, LIFT = 400;
  s.fingers = s.fingers.filter(f => {
    if (f.phase === 0) {
      const t = Math.min(1, (now - f.born) / DSCND);
      const e = 1 - (1 - t) * (1 - t); // ease-out quad
      f.y = e * f.pressY;
      f.alpha = Math.min(1, t * 2.2);
      if (t >= 1) f.phase = 1;
    } else if (f.phase === 1) {
      f.y = f.pressY;
      f.alpha = 1;
    } else {
      const t = Math.min(1, (now - f.liftAt) / LIFT);
      f.y = f.pressY * (1 - t * 0.38);
      f.alpha = 1 - t;
      if (t >= 1) return false;
    }
    return true;
  });

  // ── background ────────────────────────────────────────────────────────
  ctx.fillStyle = "#060609";
  ctx.fillRect(0, 0, W, H);

  // colored column beams for active fingers
  s.fingers.forEach(f => {
    if (f.alpha < 0.05 || f.phase === 2) return;
    const k = s.keys.get(f.midi);
    if (!k) return;
    ctx.save();
    ctx.globalAlpha = f.alpha * 0.2;
    const g = ctx.createLinearGradient(k.x, 0, k.x, s.kbTop);
    g.addColorStop(0, "transparent");
    g.addColorStop(1, `hsl(${f.hue},80%,55%)`);
    ctx.fillStyle = g;
    ctx.fillRect(k.x - k.w / 2, 0, k.w, s.kbTop);
    ctx.restore();
  });

  // ── piano keyboard ────────────────────────────────────────────────────
  const KT = s.kbTop, KH = s.kbH;

  // white keys
  WHITE_MIDIS.forEach(midi => {
    const k = s.keys.get(midi);
    if (!k) return;
    const af = s.fingers.find(f => f.midi === midi && f.alpha > 0.01);
    const hue = midiHue(midi);
    ctx.save();
    if (af) {
      ctx.shadowColor = `hsl(${hue},90%,65%)`;
      ctx.shadowBlur = 22 * af.alpha;
      ctx.fillStyle = `hsl(${hue},${55 + 25 * af.alpha}%,${50 + 30 * af.alpha}%)`;
    } else {
      ctx.fillStyle = "#d8dce6";
    }
    rrect(ctx, k.x - k.w / 2 + 1, KT + 1, k.w - 2, KH - 3, 4);
    ctx.fill();
    if (!af) {
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  });

  // black keys (drawn on top)
  BLACK_DEFS.forEach(([midi]) => {
    const k = s.keys.get(midi);
    if (!k) return;
    const bkH = KH * 0.62;
    const af = s.fingers.find(f => f.midi === midi && f.alpha > 0.01);
    const hue = midiHue(midi);
    ctx.save();
    if (af) {
      ctx.shadowColor = `hsl(${hue},90%,65%)`;
      ctx.shadowBlur = 16 * af.alpha;
      ctx.fillStyle = `hsl(${hue},75%,${28 + 38 * af.alpha}%)`;
    } else {
      ctx.fillStyle = "#18181f";
    }
    rrect(ctx, k.x - k.w / 2, KT, k.w, bkH, 3);
    ctx.fill();
    ctx.restore();
  });

  // keyboard top edge
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, KT);
  ctx.lineTo(W, KT);
  ctx.stroke();

  // ── ghost fingers ─────────────────────────────────────────────────────
  s.fingers.forEach(f => {
    if (f.alpha < 0.02) return;
    const FW = Math.max(18, f.w * 0.72);
    const FH = 48;
    const fx = f.x - FW / 2;
    const fy = f.y - FH;

    ctx.save();
    ctx.globalAlpha = f.alpha;

    // glow
    ctx.shadowColor = `hsl(${f.hue},90%,68%)`;
    ctx.shadowBlur = 24;

    // finger body gradient
    const fg = ctx.createLinearGradient(fx, fy, fx, fy + FH);
    fg.addColorStop(0, `hsla(${f.hue},65%,82%,0.93)`);
    fg.addColorStop(0.5, `hsla(${f.hue},80%,67%,0.88)`);
    fg.addColorStop(1, `hsla(${f.hue},60%,50%,0.74)`);
    ctx.fillStyle = fg;
    rrect(ctx, fx, fy, FW, FH, FW / 2);
    ctx.fill();

    // knuckle highlight
    ctx.shadowBlur = 0;
    ctx.fillStyle = `hsla(${f.hue},40%,92%,0.2)`;
    ctx.beginPath();
    ctx.ellipse(f.x, fy + 10, FW * 0.28, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  });

  // light trails above active fingers
  s.fingers.forEach(f => {
    if (f.alpha < 0.06 || f.phase === 2) return;
    ctx.save();
    ctx.globalAlpha = f.alpha * 0.22;
    const tg = ctx.createLinearGradient(f.x, 0, f.x, f.y - 48);
    tg.addColorStop(0, "transparent");
    tg.addColorStop(1, `hsl(${f.hue},80%,62%)`);
    ctx.fillStyle = tg;
    ctx.fillRect(f.x - 5, 0, 10, Math.max(0, f.y - 48));
    ctx.restore();
  });
}

// ── component ─────────────────────────────────────────────────────────────

export default function PianoHandsPage() {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const sRef = useRef<S>({
    mode: "idle",
    actx: null, stream: null, analyser: null, timeBuf: null,
    fingers: [], nextId: 0,
    active: new Map(), pending: [], pendingLifts: [],
    demoUntil: 0, demoIdx: 0,
    keys: new Map(),
    kbTop: 0, kbH: 0, rafId: 0,
    lastPitch: 0, lastPitchSeen: 0,
  });
  const [uiMode, setUiMode] = useState<"idle" | "demo" | "mic">("idle");
  const [micError, setMicError] = useState<string | null>(null);

  // resize observer → rebuild key layout
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    function applySize() {
      if (!cv) return;
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(r.width * dpr);
      cv.height = Math.round(r.height * dpr);
      buildLayout(cv.width, cv.height, sRef.current);
    }
    const obs = new ResizeObserver(applySize);
    obs.observe(cv);
    applySize();
    return () => obs.disconnect();
  }, []);

  // RAF loop — active while uiMode !== "idle"
  useEffect(() => {
    if (uiMode === "idle") return;
    const s = sRef.current;
    const cv = cvRef.current;
    if (!cv) return;
    const canvas = cv; // narrowed to HTMLCanvasElement for closure capture
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    buildLayout(canvas.width, canvas.height, s);
    let alive = true;
    function tick() {
      if (!alive) return;
      drawCanvas(canvas, s);
      s.rafId = requestAnimationFrame(tick);
    }
    s.rafId = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(s.rafId);
    };
  }, [uiMode]);

  // full cleanup on unmount
  useEffect(() => {
    return () => {
      const s = sRef.current;
      s.stream?.getTracks().forEach(t => t.stop());
      void s.actx?.close();
      cancelAnimationFrame(s.rafId);
    };
  }, []);

  function handleDemo() {
    const s = sRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    s.actx = actx;
    s.mode = "demo";
    s.demoUntil = actx.currentTime + 0.05;
    s.demoIdx = 0;
    s.pending = [];
    s.pendingLifts = [];
    s.fingers = [];
    s.active.clear();
    setUiMode("demo");
  }

  function handleMic() {
    void (async () => {
      const s = sRef.current;
      setMicError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        const actx = new Ctx();
        s.actx = actx;
        s.stream = stream;
        const src = actx.createMediaStreamSource(stream);
        const analyser = actx.createAnalyser();
        analyser.fftSize = 4096;
        src.connect(analyser);
        s.analyser = analyser;
        s.timeBuf = new Float32Array(analyser.fftSize);
        s.mode = "mic";
        s.fingers = [];
        s.active.clear();
        s.lastPitchSeen = performance.now();
        setUiMode("mic");
      } catch (e) {
        setMicError(e instanceof Error ? e.message : "Mic unavailable — check permissions.");
      }
    })();
  }

  function handleBack() {
    const s = sRef.current;
    cancelAnimationFrame(s.rafId);
    s.stream?.getTracks().forEach(t => t.stop());
    s.stream = null;
    void s.actx?.close();
    s.actx = null;
    s.analyser = null;
    s.timeBuf = null;
    s.fingers = [];
    s.active.clear();
    s.pending = [];
    s.pendingLifts = [];
    s.mode = "idle";
    setUiMode("idle");
  }

  return (
    <div className="relative w-full h-screen bg-[#060609] flex flex-col overflow-hidden">
      <canvas ref={cvRef} className="absolute inset-0 w-full h-full" />

      {/* start screen */}
      {uiMode === "idle" && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full gap-8 px-6">
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-mono text-foreground tracking-tight">Piano Hands</h1>
            <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
              Ghost fingers descend onto the keys as notes are detected.
              Play piano into the mic — or watch a demo.
            </p>
            <p className="text-sm text-muted-foreground">
              C3 – B4 · autocorrelation pitch detection · zero API
            </p>
          </div>

          {micError && (
            <p className="text-base text-violet-300 text-center max-w-xs">{micError}</p>
          )}

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={handleMic}
              className="min-h-[48px] px-6 py-3 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 rounded-lg text-foreground text-base font-mono transition-colors"
            >
              Start mic
            </button>
            <button
              onClick={handleDemo}
              className="min-h-[48px] px-6 py-3 bg-muted hover:bg-accent border border-border rounded-lg text-foreground text-base font-mono transition-colors"
            >
              Watch demo
            </button>
          </div>

          <p className="text-sm text-muted-foreground/70">Headphones recommended</p>
        </div>
      )}

      {/* active HUD */}
      {uiMode !== "idle" && (
        <div className="relative z-10 flex items-center justify-between px-4 pt-3 pointer-events-none">
          <button
            onClick={handleBack}
            className="pointer-events-auto min-h-[44px] px-4 py-2 text-sm font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            ← back
          </button>
          <span className="text-sm font-mono text-muted-foreground select-none">
            {uiMode === "demo" ? "Für Elise · demo" : "mic · play C3–B4"}
          </span>
          <div className="w-20" />
        </div>
      )}
    </div>
  );
}
