"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── Piano layout ──────────────────────────────────────────────────────────────

const MIDI_LO = 36; // C2
const MIDI_HI = 96; // C7
const WHITE_SEMI = new Set([0, 2, 4, 5, 7, 9, 11]);

function isWhiteKey(midi: number): boolean { return WHITE_SEMI.has(midi % 12); }

function whitesBelow(midi: number): number {
  let n = 0;
  for (let m = MIDI_LO; m < midi; m++) if (isWhiteKey(m)) n++;
  return n;
}

let TOTAL_WHITES = 0;
for (let m = MIDI_LO; m <= MIDI_HI; m++) if (isWhiteKey(m)) TOTAL_WHITES++;

// Precompute white-keys-before for every MIDI note (avoid repeated O(N) calls in draw)
const WHITES_BEFORE = new Int16Array(128);
const IS_WHITE_KEY = new Uint8Array(128);
for (let m = 0; m < 128; m++) {
  IS_WHITE_KEY[m] = isWhiteKey(m) ? 1 : 0;
  WHITES_BEFORE[m] = (m >= MIDI_LO && m <= MIDI_HI) ? whitesBelow(m) : 0;
}

// Normalized X position [0,1] for any MIDI note on the keyboard
const KEY_NX = new Float32Array(128);
for (let m = 0; m < 128; m++) {
  if (m < MIDI_LO || m > MIDI_HI) { KEY_NX[m] = 0.5; continue; }
  const wb = WHITES_BEFORE[m];
  KEY_NX[m] = IS_WHITE_KEY[m] ? (wb + 0.5) / TOTAL_WHITES : wb / TOTAL_WHITES;
}

// ── Bach Invention No. 1 demo notes ──────────────────────────────────────────

interface NoteEvt { t: number; dur: number; midi: number; }

const DEMO_NOTES: NoteEvt[] = ([
  // Right hand
  [0.00, 60, 0.22], [0.25, 62, 0.22], [0.50, 64, 0.22], [0.75, 65, 0.22],
  [1.00, 67, 0.22], [1.25, 64, 0.22], [1.50, 67, 0.22], [1.75, 65, 0.22],
  [2.00, 64, 0.22], [2.25, 62, 0.22], [2.50, 60, 0.45],
  [3.00, 67, 0.22], [3.25, 65, 0.22], [3.50, 64, 0.22], [3.75, 62, 0.22],
  [4.00, 64, 0.22], [4.25, 62, 0.22], [4.50, 60, 0.45],
  // Left hand
  [0.00, 48, 0.22], [0.25, 52, 0.22], [0.50, 55, 0.22], [0.75, 52, 0.22],
  [1.00, 48, 0.22], [1.25, 52, 0.22], [1.50, 55, 0.22], [1.75, 52, 0.22],
  [2.00, 47, 0.22], [2.25, 50, 0.22], [2.50, 55, 0.22], [2.75, 50, 0.22],
  [3.00, 47, 0.22], [3.25, 50, 0.22], [3.50, 55, 0.22], [3.75, 50, 0.22],
  [4.00, 48, 0.22], [4.25, 52, 0.22], [4.50, 55, 0.22], [4.75, 52, 0.22],
] as [number, number, number][]).map(([t, midi, dur]) => ({ t, midi, dur }));

const DEMO_DURATION = 5.2;

// ── FFT peak finder (real-time modes) ────────────────────────────────────────

function fftPeakMidi(
  fData: Float32Array<ArrayBuffer>, sr: number, loHz: number, hiHz: number
): number {
  const binHz = sr / (fData.length * 2);
  const lo = Math.max(0, Math.floor(loHz / binHz));
  const hi = Math.min(fData.length - 1, Math.ceil(hiHz / binHz));
  let maxDb = -Infinity;
  let maxBin = lo;
  for (let i = lo; i <= hi; i++) {
    if (fData[i] > maxDb) { maxDb = fData[i]; maxBin = i; }
  }
  if (maxDb < -68) return -1;
  const freq = maxBin * binHz;
  if (freq <= 0) return -1;
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  return midi >= MIDI_LO && midi <= MIDI_HI ? midi : -1;
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  kbX: number, kbY: number, kbW: number, kbH: number,
  active: Set<number>
): void {
  const wW = kbW / TOTAL_WHITES;
  const bW = wW * 0.55;
  const bH = kbH * 0.62;

  // White keys
  let wi = 0;
  for (let m = MIDI_LO; m <= MIDI_HI; m++) {
    if (!IS_WHITE_KEY[m]) continue;
    const x = kbX + wi * wW;
    const on = active.has(m);
    // Key body
    ctx.fillStyle = on ? "#d4b0ff" : "#ebebE5";
    ctx.fillRect(x + 0.5, kbY, wW - 1, kbH);
    // Active glow from top
    if (on) {
      const glow = ctx.createLinearGradient(0, kbY, 0, kbY + kbH);
      glow.addColorStop(0, "rgba(140,60,230,0.55)");
      glow.addColorStop(0.6, "rgba(140,60,230,0.15)");
      glow.addColorStop(1, "rgba(140,60,230,0.0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x + 0.5, kbY, wW - 1, kbH);
    }
    // Border
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x + 0.5, kbY, wW - 1, kbH);
    wi++;
  }

  // Black keys (drawn after white to sit on top)
  for (let m = MIDI_LO; m <= MIDI_HI; m++) {
    if (IS_WHITE_KEY[m]) continue;
    const wb = WHITES_BEFORE[m];
    const x = kbX + wb * wW - bW / 2;
    const on = active.has(m);
    ctx.fillStyle = on ? "#7a38bf" : "#131318";
    ctx.fillRect(x, kbY, bW, bH);
    if (on) {
      // Top highlight stripe
      ctx.fillStyle = "rgba(200,140,255,0.55)";
      ctx.fillRect(x + 1, kbY + 1, bW - 2, 4);
    }
  }

  // Octave labels at each C
  const fontSize = Math.max(8, Math.round(wW * 0.48));
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  ctx.textAlign = "center";
  for (let oct = 2; oct <= 7; oct++) {
    const m = oct * 12 + 12; // C2=36 … C7=96
    if (m < MIDI_LO || m > MIDI_HI) continue;
    ctx.fillText(`C${oct}`, kbX + (WHITES_BEFORE[m] + 0.5) * wW, kbY + kbH - 4);
  }
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, pw: number, ph: number,
  r: number, g: number, b: number,
  alpha: number
): void {
  ctx.save();
  ctx.globalAlpha = alpha;

  // Outer glow halo
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, pw);
  halo.addColorStop(0, `rgba(${r},${g},${b},0.18)`);
  halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(cx, cy, pw, ph * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Palm
  ctx.fillStyle = `rgba(${r},${g},${b},0.90)`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, pw * 0.50, ph * 0.50, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sheen highlight
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.ellipse(cx - pw * 0.09, cy - ph * 0.13, pw * 0.26, ph * 0.19, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Four fingers extending downward toward keyboard
  const fW = pw * 0.13;
  const fH = ph * 0.25;
  for (let fi = 0; fi < 4; fi++) {
    const fx = cx + (fi - 1.5) * pw * 0.23;
    const fy = cy + ph * 0.52;
    ctx.fillStyle = `rgba(${r},${g},${b},0.80)`;
    ctx.beginPath();
    ctx.ellipse(fx, fy, fW, fH, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// ── Audio state ───────────────────────────────────────────────────────────────

interface AudioSt {
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  freqBuf: Float32Array<ArrayBuffer> | null;
  isDemo: boolean;
  demoStart: number;
  raf: number;
  lhX: number; lhVx: number;
  rhX: number; rhVx: number;
  lhOn: boolean; rhOn: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Mode = "idle" | "demo" | "mic" | "paths";

export default function PianoMotion() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const st = useRef<AudioSt>({
    ctx: null, analyser: null, freqBuf: null,
    isDemo: false, demoStart: 0, raf: 0,
    lhX: 0.25, lhVx: 0, rhX: 0.75, rhVx: 0,
    lhOn: false, rhOn: false,
  });

  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [recId, setRecId] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // ── Canvas resize ─────────────────────────────────────────────────────────

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = c.offsetWidth * dpr;
      c.height = c.offsetHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    try { s.analyser?.disconnect(); } catch { /* */ }
    try { s.ctx?.close(); } catch { /* */ }
    s.ctx = null; s.analyser = null; s.freqBuf = null;
    s.isDemo = false; s.demoStart = 0; s.raf = 0;
    s.lhOn = false; s.rhOn = false;
    audioElRef.current?.pause();
    setMode("idle");
  }, []);

  useEffect(() => () => { stopAll(); }, [stopAll]);

  // ── Animation loop ────────────────────────────────────────────────────────

  const startLoop = useCallback(() => {
    const loop = () => {
      const s = st.current;
      s.raf = requestAnimationFrame(loop);

      const canvas = canvasRef.current;
      if (!canvas || !s.ctx || !s.analyser) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      const kbH = Math.min(H * 0.38, 165);
      const kbY = H - kbH;
      const kbW = W;
      const wW = kbW / TOTAL_WHITES;

      // ── Determine active notes + hand targets ───────────────────────────

      const activeNotes = new Set<number>();
      let lhTarget = s.lhX;
      let rhTarget = s.rhX;
      let lhSeen = false;
      let rhSeen = false;

      if (s.isDemo) {
        const now = s.ctx.currentTime - s.demoStart;
        for (const n of DEMO_NOTES) {
          if (now >= n.t && now < n.t + n.dur + 0.04) {
            activeNotes.add(n.midi);
            const nx = KEY_NX[n.midi];
            if (n.midi < 60) { lhTarget = nx; lhSeen = true; }
            else { rhTarget = nx; rhSeen = true; }
          }
        }
      } else if (s.freqBuf && s.ctx) {
        s.analyser.getFloatFrequencyData(s.freqBuf);
        const sr = s.ctx.sampleRate;
        const lMidi = fftPeakMidi(s.freqBuf, sr, 36.7, 261.6);  // A1–C4 (bass)
        const rMidi = fftPeakMidi(s.freqBuf, sr, 261.6, 2093.0); // C4–C7 (treble)
        if (lMidi >= 0) { activeNotes.add(lMidi); lhTarget = KEY_NX[lMidi]; lhSeen = true; }
        if (rMidi >= 0) { activeNotes.add(rMidi); rhTarget = KEY_NX[rMidi]; rhSeen = true; }
      }

      s.lhOn = lhSeen;
      s.rhOn = rhSeen;

      // ── Spring physics ──────────────────────────────────────────────────

      s.lhVx += (lhTarget - s.lhX) * 0.12;
      s.lhVx *= 0.60;
      s.lhX = Math.max(0.01, Math.min(0.99, s.lhX + s.lhVx));

      s.rhVx += (rhTarget - s.rhX) * 0.12;
      s.rhVx *= 0.60;
      s.rhX = Math.max(0.01, Math.min(0.99, s.rhX + s.rhVx));

      // ── Render ──────────────────────────────────────────────────────────

      ctx2d.fillStyle = "#07070f";
      ctx2d.fillRect(0, 0, W, H);

      // Subtle depth gradient in hand area
      const depthGrad = ctx2d.createLinearGradient(0, 0, 0, kbY);
      depthGrad.addColorStop(0, "rgba(15,5,35,0.0)");
      depthGrad.addColorStop(1, "rgba(15,5,35,0.55)");
      ctx2d.fillStyle = depthGrad;
      ctx2d.fillRect(0, 0, W, kbY);

      // Piano keyboard
      drawKeyboard(ctx2d, 0, kbY, kbW, kbH, activeNotes);

      // Middle-C divider (C4 = MIDI 60)
      const c4x = WHITES_BEFORE[60] * wW;
      ctx2d.strokeStyle = "rgba(255,255,255,0.055)";
      ctx2d.lineWidth = 1;
      ctx2d.setLineDash([3, 7]);
      ctx2d.beginPath();
      ctx2d.moveTo(c4x, 0);
      ctx2d.lineTo(c4x, kbY);
      ctx2d.stroke();
      ctx2d.setLineDash([]);

      // Register labels
      ctx2d.font = "10px monospace";
      ctx2d.textAlign = "center";
      ctx2d.fillStyle = "rgba(120,40,210,0.40)";
      ctx2d.fillText("LEFT HAND · bass", c4x * 0.5, 22);
      ctx2d.fillStyle = "rgba(220,80,120,0.40)";
      ctx2d.fillText("RIGHT HAND · treble", c4x + (W - c4x) * 0.5, 22);

      // Hand parameters
      const handAreaH = kbY;
      const handY = handAreaH * 0.50;
      const handPW = wW * 3.8;
      const handPH = wW * 1.9;

      // Connector lines (hand → active key)
      const drawConnector = (hx: number, col: string, on: boolean) => {
        if (!on) return;
        ctx2d.strokeStyle = col;
        ctx2d.lineWidth = 1.2;
        ctx2d.setLineDash([2, 5]);
        ctx2d.beginPath();
        ctx2d.moveTo(hx, handY + handPH * 0.55);
        ctx2d.lineTo(hx, kbY - 1);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
      };
      drawConnector(s.lhX * kbW, "rgba(120,40,210,0.28)", s.lhOn);
      drawConnector(s.rhX * kbW, "rgba(220,80,120,0.28)", s.rhOn);

      // Hands (always visible, dim when inactive)
      drawHand(ctx2d, s.lhX * kbW, handY, handPW, handPH, 120, 40, 210, s.lhOn ? 0.92 : 0.20);
      drawHand(ctx2d, s.rhX * kbW, handY, handPW, handPH, 220, 80, 120, s.rhOn ? 0.92 : 0.20);
    };
    st.current.raf = requestAnimationFrame(loop);
  }, []);

  // ── Demo mode ─────────────────────────────────────────────────────────────

  const startDemo = useCallback(async () => {
    stopAll();
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.85;
    analyser.connect(ctx.destination);

    const noteHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    for (const n of DEMO_NOTES) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = noteHz(n.midi);
      env.gain.setValueAtTime(0, ctx.currentTime + n.t);
      env.gain.linearRampToValueAtTime(0.11, ctx.currentTime + n.t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.t + n.dur * 0.95);
      osc.connect(env);
      env.connect(analyser);
      osc.start(ctx.currentTime + n.t);
      osc.stop(ctx.currentTime + n.t + n.dur);
    }

    const s = st.current;
    s.ctx = ctx;
    s.analyser = analyser;
    s.freqBuf = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
    s.isDemo = true;
    s.demoStart = ctx.currentTime;
    s.lhX = KEY_NX[48];
    s.rhX = KEY_NX[60];
    setMode("demo");
    setError(null);
    startLoop();

    setTimeout(() => {
      if (st.current.ctx === ctx) stopAll();
    }, (DEMO_DURATION + 0.3) * 1000);
  }, [stopAll, startLoop]);

  // ── Mic mode ──────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    stopAll();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0.82;
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      const s = st.current;
      s.ctx = ctx;
      s.analyser = analyser;
      s.freqBuf = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
      s.isDemo = false;
      setMode("mic");
      setError(null);
      startLoop();
    } catch (e) {
      setError(`Mic unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [stopAll, startLoop]);

  // ── Paths recording mode ──────────────────────────────────────────────────

  const loadRecording = useCallback(async () => {
    const id = recId.trim();
    if (!id) return;
    setLoading(true);
    setError(null);
    setAudioUrl(null);
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { url: string };
      setAudioUrl(data.url);
    } catch (e) {
      setError(`Load failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [recId]);

  const playRecording = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio || !audioUrl) return;
    stopAll();
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.80;
    const src = ctx.createMediaElementSource(audio);
    src.connect(analyser);
    analyser.connect(ctx.destination);
    audio.currentTime = 0;
    audio.play();
    const s = st.current;
    s.ctx = ctx;
    s.analyser = analyser;
    s.freqBuf = new Float32Array(analyser.frequencyBinCount) as Float32Array<ArrayBuffer>;
    s.isDemo = false;
    setMode("paths");
    setError(null);
    startLoop();
  }, [audioUrl, stopAll, startLoop]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      {audioUrl && (
        <audio
          ref={audioElRef}
          src={audioUrl}
          onEnded={stopAll}
          crossOrigin="anonymous"
          className="hidden"
        />
      )}

      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Start screen */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-5">
          <div>
            <h1 className="text-2xl md:text-3xl mb-2 tracking-tight">Piano Motion</h1>
            <p className="text-base text-muted-foreground max-w-sm leading-relaxed">
              Watch a piano being played — two hands glide across the keys as the music moves.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={startDemo}
              className="px-5 py-2.5 text-sm tracking-wide border border-violet-400/60 text-violet-300 rounded hover:bg-violet-500/10 transition min-h-[44px]"
            >
              ▶ Bach demo
            </button>
            <button
              onClick={startMic}
              className="px-5 py-2.5 text-sm tracking-wide border border-border rounded hover:bg-accent transition min-h-[44px]"
            >
              🎤 Use mic
            </button>
          </div>

          <div className="flex flex-col items-center gap-2 w-full max-w-sm">
            <p className="text-sm text-muted-foreground">Or animate a Resonance recording:</p>
            <div className="flex gap-2 w-full">
              <input
                type="text"
                value={recId}
                onChange={e => setRecId(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") loadRecording(); }}
                placeholder="Recording UUID"
                className="flex-1 px-3 py-2 text-sm bg-muted border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-violet-400/60 min-h-[44px]"
              />
              <button
                onClick={loadRecording}
                disabled={loading || !recId.trim()}
                className="px-4 py-2.5 text-sm border border-border rounded hover:bg-accent disabled:opacity-40 transition min-h-[44px]"
              >
                {loading ? "…" : "Load"}
              </button>
            </div>
            {audioUrl && !loading && (
              <button
                onClick={playRecording}
                className="w-full px-4 py-2.5 text-sm border border-violet-400/60 text-violet-300 rounded hover:bg-violet-500/10 transition min-h-[44px]"
              >
                ▶ Play recording
              </button>
            )}
          </div>

          {error && <p className="text-base text-violet-300 max-w-sm">{error}</p>}

          <Link href="/dream" className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition mt-2">
            ← dream sandbox
          </Link>
        </div>
      )}

      {/* Running controls */}
      {mode !== "idle" && (
        <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-auto">
          <span className="text-xs tracking-wider text-muted-foreground px-2">
            {mode === "demo" ? "BACH DEMO" : mode === "mic" ? "MIC" : "RECORDING"}
          </span>
          <button
            onClick={stopAll}
            className="text-xs tracking-wider uppercase text-muted-foreground hover:text-foreground border border-border hover:border-border px-3 py-1.5 rounded transition"
          >
            stop
          </button>
          <Link
            href="/dream"
            className="text-xs text-muted-foreground/70 hover:text-muted-foreground px-2 py-1 transition"
          >
            ← back
          </Link>
        </div>
      )}

      {/* Design notes link */}
      <Link
        href="/dream/183-piano-motion/README.md"
        className="absolute bottom-3 right-4 text-xs text-muted-foreground/70 hover:text-muted-foreground transition"
      >
        design notes
      </Link>
    </div>
  );
}
