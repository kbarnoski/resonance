'use client';
import { useRef, useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type NoteEvent = { midi: number; startMs: number; endMs: number };
type MTable = Map<number, Map<number, number>>;
type Phase = 'idle' | 'listening' | 'responding' | 'done';

// ─── Constants ────────────────────────────────────────────────────────────────

const PEN = [36,38,41,43,45,48,50,53,55,57,60,62,65,67,69,72,74,77,79,81,84];
const MIDI_LO = 36, MIDI_HI = 84, MIDI_R = MIDI_HI - MIDI_LO;
const WIN_MS = 7000; // 7 seconds visible in roll

// ─── Pure audio helpers ───────────────────────────────────────────────────────

function freqToMidi(f: number): number {
  return Math.round(12 * Math.log2(f / 440) + 69);
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function snapPen(midi: number): number {
  let b = PEN[0], bd = Infinity;
  for (const p of PEN) { const d = Math.abs(p - midi); if (d < bd) { bd = d; b = p; } }
  return b;
}

// NSDF-based pitch detection (McLeod Pitch Method variant)
function pitchDetect(buf: Float32Array, sr: number): number {
  const N = buf.length;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
  if (rms / N < 0.0001) return 0;
  const minP = Math.floor(sr / 1400), maxP = Math.min(Math.floor(sr / 50), N >> 1);
  let best = -Infinity, bestP = -1;
  for (let p = minP; p <= maxP; p++) {
    let c = 0, n = 0;
    for (let i = 0; i < N - p; i++) {
      c += buf[i] * buf[i + p];
      n += buf[i] * buf[i] + buf[i + p] * buf[i + p];
    }
    const v = n > 0 ? 2 * c / n : 0;
    if (v > best) { best = v; bestP = p; }
  }
  return bestP > 0 && best > 0.5 ? sr / bestP : 0;
}

function buildMT(notes: number[]): MTable {
  const t: MTable = new Map();
  for (let i = 0; i < notes.length - 1; i++) {
    const [a, b] = [notes[i], notes[i + 1]];
    if (!t.has(a)) t.set(a, new Map());
    const r = t.get(a)!;
    r.set(b, (r.get(b) ?? 0) + 1);
  }
  return t;
}

function genMT(seed: number, t: MTable, len: number): number[] {
  const out: number[] = [];
  let cur = seed;
  for (let i = 0; i < len; i++) {
    const r = t.get(cur);
    let next: number;
    if (r && r.size > 0 && Math.random() > 0.3) {
      const tot = Array.from(r.values()).reduce((a, b) => a + b, 0);
      let rv = Math.random() * tot;
      next = cur;
      for (const [p, c] of r) { rv -= c; if (rv <= 0) { next = p; break; } }
    } else {
      const idx = PEN.indexOf(snapPen(cur));
      next = PEN[Math.max(0, Math.min(PEN.length - 1, idx + Math.floor(Math.random() * 5) - 2))];
    }
    out.push(next);
    cur = next;
  }
  return out;
}

function pianoTone(ac: AudioContext, midi: number, when: number, dur = 0.42): void {
  const f = midiToFreq(midi);
  const env = ac.createGain();
  env.connect(ac.destination);
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(0.28, when + 0.012);
  env.gain.exponentialRampToValueAtTime(0.001, when + dur);
  ([[1, 1.0], [2, 0.42], [3, 0.18], [4.05, 0.07]] as [number, number][]).forEach(([h, g]) => {
    const o = ac.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * h, when);
    const og = ac.createGain();
    og.gain.setValueAtTime(g, when);
    o.connect(og); og.connect(env);
    o.start(when); o.stop(when + dur + 0.2);
  });
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function noteY(midi: number, y0: number, h: number): number {
  return y0 + h * (1 - (midi - MIDI_LO) / MIDI_R);
}

function paintPanel(
  ctx: CanvasRenderingContext2D,
  notes: NoteEvent[], nowMs: number,
  y0: number, h: number,
  fill: string, glow: string,
  label: string, active: boolean, W: number,
): void {
  // Octave grid
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let m = 36; m <= 84; m += 12) {
    const gy = noteY(m, y0, h);
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
  }
  ctx.fillStyle = active ? fill : 'rgba(255,255,255,0.32)';
  ctx.font = '11px ui-monospace, monospace';
  ctx.textAlign = 'left';
  ctx.fillText(label, 10, y0 + 15);

  const rh = Math.max(4, h / MIDI_R);
  for (const n of notes) {
    const eMs = n.endMs > 0 ? n.endMs : nowMs;
    const x1 = W * (1 - (nowMs - n.startMs) / WIN_MS);
    const x2 = W * (1 - (nowMs - eMs) / WIN_MS);
    if (x2 < 0 || x1 > W) continue;
    const nx = Math.max(0, x1);
    const nw = Math.max(3, Math.min(W, x2) - nx);
    const ny = noteY(n.midi, y0, h) - rh / 2;
    ctx.shadowColor = glow;
    ctx.shadowBlur = 10;
    ctx.fillStyle = fill;
    ctx.fillRect(nx, ny, nw, rh);
  }
  ctx.shadowBlur = 0;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AriaCompanion() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live refs for rAF + interval access
  const phaseRef = useRef<Phase>('idle');
  const phraseRef = useRef<NoteEvent[]>([]);
  const allUserRef = useRef<NoteEvent[]>([]);
  const allAriaRef = useRef<NoteEvent[]>([]);
  const mtRef = useRef<MTable>(new Map());
  const lastPitchRef = useRef<number>(0);
  const activeMidiRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>('idle');
  const [cycles, setCycles] = useState(0);
  const [err, setErr] = useState('');

  const triggerAria = useCallback(() => {
    if (phaseRef.current !== 'listening') return;
    phaseRef.current = 'responding';
    setPhase('responding');

    const midiSeq = phraseRef.current.map(n => n.midi);
    // Merge phrase into global Markov table
    for (const [from, row] of buildMT(midiSeq)) {
      if (!mtRef.current.has(from)) mtRef.current.set(from, new Map());
      const ex = mtRef.current.get(from)!;
      for (const [to, cnt] of row) ex.set(to, (ex.get(to) ?? 0) + cnt);
    }
    const respLen = Math.min(midiSeq.length + 3, 18);
    const resp = genMT(midiSeq[midiSeq.length - 1], mtRef.current, respLen);

    const ac = acRef.current!;
    const step = 0.50, noteDur = 0.40;
    const now = ac.currentTime, wallNow = Date.now();
    resp.forEach((midi, i) => {
      pianoTone(ac, midi, now + i * step, noteDur);
      allAriaRef.current.push({
        midi,
        startMs: wallNow + i * step * 1000,
        endMs: wallNow + (i * step + noteDur) * 1000,
      });
    });

    const totalMs = (resp.length - 1) * step * 1000 + noteDur * 1000 + 700;
    setTimeout(() => {
      phraseRef.current = [];
      activeMidiRef.current = 0;
      lastPitchRef.current = Date.now();
      phaseRef.current = 'listening';
      setPhase('listening');
      setCycles(c => c + 1);
    }, totalMs);
  }, []);

  const startMic = useCallback(async () => {
    if (phaseRef.current !== 'idle') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const ac = new AudioContext();
      acRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      analyserRef.current = analyser;
      phaseRef.current = 'listening';
      setPhase('listening');
      lastPitchRef.current = Date.now();

      const pitchBuf = new Float32Array(2048);
      ivRef.current = setInterval(() => {
        if (phaseRef.current !== 'listening') return;
        analyser.getFloatTimeDomainData(pitchBuf);
        const freq = pitchDetect(pitchBuf, ac.sampleRate);
        const now = Date.now();
        if (freq > 0) {
          const midi = snapPen(freqToMidi(freq));
          lastPitchRef.current = now;
          if (activeMidiRef.current !== midi) {
            if (activeMidiRef.current > 0 && phraseRef.current.length > 0) {
              phraseRef.current[phraseRef.current.length - 1].endMs = now;
            }
            const note: NoteEvent = { midi, startMs: now, endMs: 0 };
            phraseRef.current.push(note);
            allUserRef.current.push(note);
            activeMidiRef.current = midi;
          }
        } else {
          if (activeMidiRef.current > 0) {
            if (phraseRef.current.length > 0) {
              phraseRef.current[phraseRef.current.length - 1].endMs = now;
            }
            activeMidiRef.current = 0;
          }
          if (now - lastPitchRef.current > 2000 && phraseRef.current.length >= 8) {
            triggerAria();
          }
        }
      }, 50);
    } catch {
      setErr('Microphone access denied. Use the demo to see how it works.');
    }
  }, [triggerAria]);

  const startDemo = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    const ac = new AudioContext();
    acRef.current = ac;
    // Pre-baked user phrase: C D F G F D C D F A (pentatonic)
    const demoSeq = [60, 62, 65, 67, 65, 62, 60, 62, 65, 69];
    const wallBase = Date.now() - 5200;
    demoSeq.forEach((midi, i) => {
      const note: NoteEvent = { midi, startMs: wallBase + i * 500, endMs: wallBase + i * 500 + 420 };
      allUserRef.current.push(note);
      phraseRef.current.push(note);
    });
    phaseRef.current = 'responding';
    setPhase('responding');
    const table = buildMT(demoSeq);
    mtRef.current = table;
    const resp = genMT(demoSeq[demoSeq.length - 1], table, 12);
    const now = ac.currentTime, wallNow = Date.now();
    resp.forEach((midi, i) => {
      pianoTone(ac, midi, now + i * 0.5, 0.40);
      allAriaRef.current.push({ midi, startMs: wallNow + i * 500, endMs: wallNow + i * 500 + 420 });
    });
    setTimeout(() => { phaseRef.current = 'done'; setPhase('done'); }, resp.length * 500 + 700);
  }, []);

  const resetToIdle = useCallback(() => {
    if (ivRef.current) clearInterval(ivRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    void acRef.current?.close();
    acRef.current = null;
    streamRef.current = null;
    analyserRef.current = null;
    phaseRef.current = 'idle';
    phraseRef.current = [];
    allUserRef.current = [];
    allAriaRef.current = [];
    mtRef.current = new Map();
    activeMidiRef.current = 0;
    setPhase('idle');
    setErr('');
    setCycles(0);
  }, []);

  // Render loop
  useEffect(() => {
    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;
      if (!W || !H) return;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#080810';
      ctx.fillRect(0, 0, W, H);

      const nowMs = Date.now();
      const labH = 22, divY = Math.floor(H / 2), panH = divY - labH - 4;

      paintPanel(ctx, allUserRef.current, nowMs, labH, panH,
        'rgba(251,146,60,0.92)', 'rgba(251,146,60,0.6)', 'YOU',
        phaseRef.current === 'listening', W);

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, divY); ctx.lineTo(W, divY); ctx.stroke();

      paintPanel(ctx, allAriaRef.current, nowMs, divY + labH, panH,
        'rgba(96,165,250,0.92)', 'rgba(96,165,250,0.6)', 'ARIA',
        phaseRef.current === 'responding', W);

      // Phase indicator
      ctx.textAlign = 'right';
      ctx.font = '11px ui-monospace, monospace';
      if (phaseRef.current === 'listening') {
        ctx.fillStyle = 'rgba(251,146,60,0.65)';
        ctx.fillText('● listening', W - 10, divY - 5);
      } else if (phaseRef.current === 'responding') {
        ctx.fillStyle = 'rgba(96,165,250,0.65)';
        ctx.fillText('◆ responding', W - 10, divY + labH + 3);
      }
      ctx.textAlign = 'left';

      // Live pitch dot on right edge of YOU panel
      if (activeMidiRef.current > 0) {
        const py = noteY(activeMidiRef.current, labH, panH);
        ctx.fillStyle = 'rgba(251,146,60,0.95)';
        ctx.shadowColor = 'rgba(251,146,60,0.8)';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(W - 12, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Resize canvas to fill container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });
    ro.observe(canvas);
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    return () => ro.disconnect();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ivRef.current) clearInterval(ivRef.current);
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      void acRef.current?.close();
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#080810] text-white select-none">
      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-white/95 tracking-tight">Aria Companion</h1>
        <p className="text-base text-white/75 mt-1">
          Play a phrase on your piano. Pause 2 seconds — Aria responds, then listens again.
        </p>
      </div>

      <div className="flex-1 mx-4 mb-3 rounded-xl overflow-hidden border border-white/10 relative min-h-0">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {phase === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#080810]/85 backdrop-blur-sm">
            <div className="max-w-sm text-center px-6">
              <p className="text-base text-white/75 leading-relaxed mb-6">
                Play ≥ 8 notes on your piano, then rest for 2 seconds. Aria builds a Markov chain
                from your intervals and plays back. The more you play, the more it mirrors your style.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => { void startMic(); }}
                  className="px-5 py-2.5 min-h-[44px] rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 text-base font-medium hover:bg-violet-500/30 transition-colors"
                >
                  Start mic
                </button>
                <button
                  onClick={startDemo}
                  className="px-5 py-2.5 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-white/70 text-base hover:bg-white/10 transition-colors"
                >
                  Demo
                </button>
              </div>
              {err && <p className="text-rose-300 text-base mt-4">{err}</p>}
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center">
            <button
              onClick={resetToIdle}
              className="px-5 py-2.5 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-white/70 text-base hover:bg-white/10 transition-colors"
            >
              Try with mic →
            </button>
          </div>
        )}
      </div>

      <div className="px-6 pb-4 flex-shrink-0 flex items-center justify-between text-sm">
        <span className="text-white/55">
          {phase === 'listening' && 'Play ≥ 8 notes, then pause 2 seconds'}
          {phase === 'responding' && 'Aria is playing her response…'}
          {phase === 'done' && 'Demo complete — mic mode learns from your actual playing style'}
          {phase === 'idle' && 'Markov-chain piano duet · zero deps · no AI calls'}
        </span>
        {cycles > 0 && (
          <span className="text-white/55">
            {cycles} exchange{cycles !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
