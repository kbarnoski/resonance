"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Music theory ─────────────────────────────────────────────────────────────

const NOTE_NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

interface KeyTemplate { root: number; mode: "major"|"minor"; weights: number[] }

function buildKeyTemplates(): KeyTemplate[] {
  const out: KeyTemplate[] = [];
  for (let r = 0; r < 12; r++) {
    const makeWeights = (scale: number[]) => {
      const w = new Array<number>(12).fill(0);
      scale.forEach((s, i) => { w[(r + s) % 12] = i === 0 ? 1.0 : s === 7 ? 0.75 : 0.5; });
      return w;
    };
    out.push({ root: r, mode: "major", weights: makeWeights(MAJOR_SCALE) });
    out.push({ root: r, mode: "minor", weights: makeWeights(MINOR_SCALE) });
  }
  return out;
}
const KEY_TEMPLATES = buildKeyTemplates();

function detectKey(chroma: number[]): { root: number; mode: "major"|"minor"; name: string } {
  const total = chroma.reduce((a, b) => a + b, 0) || 1;
  const norm = chroma.map(v => v / total);
  let best = -Infinity, bestT = KEY_TEMPLATES[0];
  for (const t of KEY_TEMPLATES) {
    const score = t.weights.reduce((acc, w, i) => acc + w * norm[i], 0);
    if (score > best) { best = score; bestT = t; }
  }
  return {
    root: bestT.root,
    mode: bestT.mode,
    name: NOTE_NAMES[bestT.root] + (bestT.mode === "minor" ? "m" : ""),
  };
}

/** Return [diatonic 3rd above, diatonic 5th above] in MIDI numbers. */
function diatonicVoices(midi: number, root: number, mode: "major"|"minor"): [number, number] {
  const scale = mode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const pc = ((midi - root) % 12 + 12) % 12;
  // Find closest scale degree
  let deg = 0, minDist = 12;
  for (let d = 0; d < scale.length; d++) {
    const dist = Math.abs(scale[d] - pc);
    if (dist < minDist) { minDist = dist; deg = d; }
  }
  // Intervals from root to each scale degree
  const noteInterval  = scale[deg];
  const thirdInterval = scale[(deg + 2) % 7];
  const fifthInterval = scale[(deg + 4) % 7];
  // Semitone offsets from this note upward (wrap around octave if needed)
  const thirdAbove = thirdInterval + (thirdInterval < noteInterval ? 12 : 0) - noteInterval;
  const fifthAbove  = fifthInterval  + (fifthInterval  < noteInterval ? 12 : 0) - noteInterval;
  return [midi + thirdAbove, midi + fifthAbove];
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ─── Autocorrelation pitch detection ─────────────────────────────────────────

function detectPitch(buf: Float32Array, sampleRate: number): number {
  // Silence check
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / buf.length) < 0.007) return 0;

  const minPeriod = Math.floor(sampleRate / 1100);
  const maxPeriod = Math.min(Math.floor(sampleRate / 65), buf.length - 1);
  let bestCorr = 0, bestLag = 0;
  for (let lag = minPeriod; lag <= maxPeriod; lag++) {
    let corr = 0;
    for (let i = 0; i < buf.length - lag; i++) corr += buf[i] * buf[i + lag];
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  return bestLag > 0 ? sampleRate / bestLag : 0;
}

// ─── Piano roll ───────────────────────────────────────────────────────────────

const MIDI_LO    = 36;  // C2
const MIDI_HI    = 84;  // C6
const MIDI_RANGE = MIDI_HI - MIDI_LO;
const SCROLL_SPEED  = 72;   // px/s
const CURSOR_FRAC   = 0.28; // cursor at 28% from left

type VoiceType = "melody" | "third" | "fifth";
interface RollNote { midi: number; startX: number; endX: number; voice: VoiceType }

// RGB triples (no alpha) for each voice — kept as bare "r,g,b" strings
const VOICE_RGB: Record<VoiceType, string> = {
  melody: "255,160,55",
  third:  "90,175,255",
  fifth:  "65,105,240",
};

// ─── Demo sequence (Bach BWV 772, C major) ────────────────────────────────────

const DEMO_SEQ: { midi: number; dur: number }[] = [
  {midi:64,dur:.30},{midi:65,dur:.30},{midi:67,dur:.30},{midi:60,dur:.30},
  {midi:67,dur:.30},{midi:65,dur:.30},{midi:64,dur:.30},{midi:62,dur:.30},
  {midi:64,dur:.30},{midi:60,dur:.30},{midi:62,dur:.30},{midi:57,dur:.30},
  {midi:62,dur:.45},{midi:59,dur:.30},{midi:60,dur:.60},
  {midi:64,dur:.30},{midi:65,dur:.30},{midi:67,dur:.30},{midi:60,dur:.30},
  {midi:67,dur:.45},{midi:65,dur:.30},{midi:64,dur:.90},
];

// ─── Synthesis helper (module-level, not a hook) ──────────────────────────────

function scheduleVoice(
  midi: number, dur: number,
  aCtx: AudioContext,
  pan: number, gain: number,
) {
  const osc = aCtx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = midiToHz(midi);
  const gainNode = aCtx.createGain();
  const panner   = aCtx.createStereoPanner();
  panner.pan.value = pan;
  const t   = aCtx.currentTime;
  const atk = 0.018;
  const rel = Math.min(dur * 0.28, 0.12);
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(gain, t + atk);
  gainNode.gain.setValueAtTime(gain, t + dur - rel);
  gainNode.gain.linearRampToValueAtTime(0, t + dur);
  osc.connect(gainNode);
  gainNode.connect(panner);
  panner.connect(aCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LiveHarmonize() {
  const [status,   setStatus]   = useState<"idle"|"mic"|"demo">("idle");
  const [keyLabel, setKeyLabel] = useState("—");
  const [micError, setMicError] = useState<string|null>(null);

  const canvasRef   = useRef<HTMLCanvasElement|null>(null);
  const rafRef      = useRef(0);
  const aCtxRef     = useRef<AudioContext|null>(null);
  const streamRef   = useRef<MediaStream|null>(null);
  const analyserRef = useRef<AnalyserNode|null>(null);
  const tdBufRef    = useRef<Float32Array|null>(null);

  // Piano roll state
  const notesRef   = useRef<RollNote[]>([]);
  const scrollXRef = useRef(0);
  const prevTRef   = useRef(0);

  // Key detection accumulator
  const chromaRef = useRef<number[]>(new Array(12).fill(0));
  const keyRef    = useRef<{ root: number; mode: "major"|"minor" }>({ root: 0, mode: "major" });

  // Pitch tracking for note de-duplication
  const lastMidiRef   = useRef(-1);
  const lastNotemsRef = useRef(0);

  // Demo sequencer
  const demoIdxRef  = useRef(0);
  const demoNextRef = useRef(0);

  const clearAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void aCtxRef.current?.close();
    aCtxRef.current  = null;
    analyserRef.current = null;
    tdBufRef.current = null;
    notesRef.current = [];
    scrollXRef.current = 0;
    lastMidiRef.current = -1;
    chromaRef.current = new Array(12).fill(0);
    demoIdxRef.current = 0;
    setStatus("idle");
    setKeyLabel("—");
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ac = new Ctx();
      aCtxRef.current = ac;
      const src      = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      tdBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      src.connect(analyser);
      setMicError(null);
      setStatus("mic");
    } catch (e) {
      setMicError(e instanceof Error ? e.message : "Microphone unavailable.");
    }
  }, []);

  const startDemo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    aCtxRef.current = new Ctx();
    keyRef.current  = { root: 0, mode: "major" };
    demoIdxRef.current  = 0;
    demoNextRef.current = performance.now();
    setKeyLabel("C");
    setStatus("demo");
  }, []);

  useEffect(() => {
    if (status === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth;
      h = canvas.offsetHeight;
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    prevTRef.current = performance.now();

    /** Fire melody + diatonic harmony voices: schedule audio + push piano roll events. */
    const fireNote = (midi: number, dur: number, scrollX: number) => {
      const ac = aCtxRef.current;
      if (!ac) return;
      const [thirdM, fifthM] = diatonicVoices(midi, keyRef.current.root, keyRef.current.mode);
      const voices: { midi: number; voice: VoiceType; pan: number; gain: number }[] = [
        { midi,   voice: "melody", pan:  0.00, gain: 0.42 },
        { midi: thirdM, voice: "third",  pan:  0.38, gain: 0.26 },
        { midi: fifthM, voice: "fifth",  pan: -0.38, gain: 0.20 },
      ];
      voices.forEach(({ midi: m, voice, pan, gain }) => {
        scheduleVoice(m, dur, ac, pan, gain);
        notesRef.current.push({ midi: m, startX: scrollX, endX: scrollX + dur * SCROLL_SPEED, voice });
      });
    };

    const loop = (now: number) => {
      const dt = Math.min((now - prevTRef.current) / 1000, 0.08);
      prevTRef.current = now;
      scrollXRef.current += dt * SCROLL_SPEED;

      // ── Demo: schedule notes ─────────────────────────────────────────
      if (status === "demo" && now >= demoNextRef.current) {
        const dn = DEMO_SEQ[demoIdxRef.current % DEMO_SEQ.length];
        fireNote(dn.midi, dn.dur, scrollXRef.current);
        demoNextRef.current = now + dn.dur * 1000;
        demoIdxRef.current++;
        if (demoIdxRef.current >= DEMO_SEQ.length) {
          demoIdxRef.current = 0;
          demoNextRef.current = now + 550;
        }
      }

      // ── Mic: pitch detect → key → harmonize ─────────────────────────
      if (status === "mic") {
        const analyser = analyserRef.current;
        const buf      = tdBufRef.current;
        const ac       = aCtxRef.current;
        if (analyser && buf && ac) {
          analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
          const hz   = detectPitch(buf, ac.sampleRate);
          const nowMs = now;
          if (hz > 60 && hz < 1100) {
            const midi = Math.round(12 * Math.log2(hz / 440) + 69);
            // Accumulate chroma for key detection
            const pc = ((midi % 12) + 12) % 12;
            chromaRef.current[pc] = Math.min(1, chromaRef.current[pc] + 0.12);
            for (let i = 0; i < 12; i++) chromaRef.current[i] *= 0.996;
            // Periodic key detection (~every 30 frames)
            if (Math.random() < 0.035) {
              const k = detectKey(chromaRef.current);
              keyRef.current = k;
              setKeyLabel(k.name);
            }
            // Emit note if pitch changed or enough time has passed
            if (midi !== lastMidiRef.current && nowMs - lastNotemsRef.current > 100) {
              lastMidiRef.current   = midi;
              lastNotemsRef.current = nowMs;
              fireNote(midi, 0.48, scrollXRef.current);
            }
          } else {
            lastMidiRef.current = -1;
          }
        }
      }

      // ── Draw piano roll ──────────────────────────────────────────────
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#07070f";
      ctx.fillRect(0, 0, w, h);

      const curX = w * CURSOR_FRAC;
      const barH = Math.max(4, (h / MIDI_RANGE) - 1);

      // Octave grid + labels
      for (let m = MIDI_LO; m <= MIDI_HI; m++) {
        if (m % 12 === 0) {
          const y = h - ((m - MIDI_LO) / MIDI_RANGE) * h;
          ctx.strokeStyle = "rgba(255,255,255,0.07)";
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.22)";
          ctx.font = "10px monospace";
          ctx.fillText(`C${Math.floor(m / 12) - 1}`, 4, y - 3);
        }
      }

      // Cursor line
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(curX, 0); ctx.lineTo(curX, h); ctx.stroke();
      ctx.setLineDash([]);

      // Prune notes that have scrolled far off the left edge
      const cullBefore = scrollXRef.current - curX - 40;
      notesRef.current = notesRef.current.filter(n => n.endX > cullBefore);

      // Draw note bars
      ctx.shadowBlur = 0;
      for (const n of notesRef.current) {
        const x0 = curX + (n.startX - scrollXRef.current);
        const x1 = curX + (n.endX   - scrollXRef.current);
        if (x1 < 0 || x0 > w) continue;
        const bw = Math.max(3, x1 - x0);
        const y  = h - ((n.midi - MIDI_LO) / MIDI_RANGE) * h - barH / 2;
        const rgb = VOICE_RGB[n.voice];
        // Glow
        ctx.shadowColor = `rgba(${rgb},0.45)`;
        ctx.shadowBlur  = 7;
        ctx.fillStyle   = `rgba(${rgb},0.84)`;
        ctx.fillRect(x0, y, bw, barH);
      }
      ctx.shadowBlur = 0;

      // Voice legend (bottom-left)
      const lY = h - 12;
      const legend: { label: string; voice: VoiceType }[] = [
        { label: "you",  voice: "melody" },
        { label: "3rd",  voice: "third"  },
        { label: "5th",  voice: "fifth"  },
      ];
      legend.forEach(({ label, voice }, i) => {
        const lX = 8 + i * 72;
        ctx.fillStyle = `rgba(${VOICE_RGB[voice]},0.88)`;
        ctx.fillRect(lX, lY - 7, 13, 7);
        ctx.fillStyle = "rgba(255,255,255,0.62)";
        ctx.font = "11px monospace";
        ctx.fillText(label, lX + 17, lY);
      });

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [status]);

  useEffect(() => () => clearAll(), [clearAll]);

  return (
    <div className="relative min-h-screen bg-[#07070f] text-foreground flex flex-col">

      {/* Header */}
      <div className="relative z-10 px-6 pt-6 pb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-foreground tracking-tight">
            Live Harmonize
          </h1>
          <p className="text-base text-muted-foreground mt-1 max-w-md">
            Play a melody into the mic — diatonic 3rd and 5th harmony voices appear alongside each note, detected from your key, panned left and right.
          </p>
        </div>
        {status !== "idle" && (
          <div className="text-right shrink-0">
            <div className="text-xs text-muted-foreground font-mono mb-0.5">detected key</div>
            <div className="text-2xl font-mono text-violet-300">{keyLabel}</div>
          </div>
        )}
      </div>

      {/* Canvas area */}
      <div className="flex-1 relative" style={{ minHeight: "60vh" }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* Start screen overlay */}
        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
            <div className="max-w-sm w-full text-center space-y-5">
              <p className="text-base text-muted-foreground leading-relaxed">
                Play piano or sing into your mic. The system listens for your key and adds two harmony voices — the diatonic 3rd and 5th above every note — panned slightly left and right. A scrolling piano roll records all three parts.
              </p>

              {/* Voice color key */}
              <div className="flex flex-wrap gap-2 justify-center">
                {(["melody","third","fifth"] as VoiceType[]).map((v, i) => (
                  <span
                    key={v}
                    className="px-2.5 py-1 rounded text-sm font-mono"
                    style={{
                      background: `rgba(${VOICE_RGB[v]},0.18)`,
                      color: `rgba(${VOICE_RGB[v]},1)`,
                    }}
                  >
                    {["you (melody)", "diatonic 3rd", "diatonic 5th"][i]}
                  </span>
                ))}
              </div>

              {micError && (
                <p className="text-violet-300 text-base">{micError}</p>
              )}

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
                <button
                  onClick={startMic}
                  className="min-h-[44px] px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-foreground text-base font-medium rounded-lg transition-colors"
                >
                  Start mic
                </button>
                <button
                  onClick={startDemo}
                  className="min-h-[44px] px-6 py-2.5 bg-muted hover:bg-accent text-foreground text-base font-medium rounded-lg transition-colors"
                >
                  Demo mode
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Running HUD */}
        {status !== "idle" && (
          <div className="absolute bottom-6 right-4 flex flex-col items-end gap-2 z-10">
            <span className="text-xs font-mono text-muted-foreground">
              {status === "demo" ? "demo · Bach fragment · C major" : "mic active — play any melody"}
            </span>
            <button
              onClick={clearAll}
              className="min-h-[44px] px-4 py-2.5 bg-muted hover:bg-accent text-foreground text-sm font-medium rounded-lg transition-colors"
            >
              Stop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
