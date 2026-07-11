'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type SlotStatus = 'empty' | 'recording' | 'looping' | 'muted';
type BarCount = 1 | 2 | 4;

interface SlotData {
  status: SlotStatus;
  bars: BarCount;
  peaks: number[]; // 128-point normalized peak array for waveform display
}

// ── Module-level helpers (no 'use' prefix — not React hooks) ──────────────────

const SLOT_COLORS = ['#a78bfa', '#22d3ee', '#34d399', '#fbbf24'];

const INIT_SLOTS: SlotData[] = [
  { status: 'empty', bars: 2, peaks: [] },
  { status: 'empty', bars: 2, peaks: [] },
  { status: 'empty', bars: 2, peaks: [] },
  { status: 'empty', bars: 2, peaks: [] },
];

function buildPeaks(buf: AudioBuffer, n = 128): number[] {
  const data = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / n));
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    let mx = 0;
    for (let j = 0; j < step; j++) {
      const idx = k * step + j;
      if (idx < data.length) mx = Math.max(mx, Math.abs(data[idx]));
    }
    out.push(mx);
  }
  const norm = Math.max(0.001, ...out);
  return out.map(v => v / norm);
}

function applyFade(buf: AudioBuffer, fadeSecs: number) {
  const data = buf.getChannelData(0);
  const n = Math.min(Math.floor(fadeSecs * buf.sampleRate), (data.length >> 1) - 1);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    data[i] *= t;
    data[data.length - 1 - i] *= t;
  }
}

function makeSynthBuf(len: number, sr: number, fill: (j: number) => number): AudioBuffer {
  const buf = new AudioBuffer({ length: len, sampleRate: sr, numberOfChannels: 1 });
  const data = buf.getChannelData(0);
  for (let j = 0; j < len; j++) data[j] = fill(j);
  return buf;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LoopStation() {
  // Audio refs — no state, never trigger re-renders
  const actxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const masterStartRef = useRef(0);   // AudioContext time of loop beat-1
  const masterDurRef = useRef(0);     // loop duration in seconds
  const slotGainRef = useRef<(GainNode | null)[]>([null, null, null, null]);
  const slotSrcRef = useRef<(AudioBufferSourceNode | null)[]>([null, null, null, null]);
  const slotBufRef = useRef<(AudioBuffer | null)[]>([null, null, null, null]);
  const slotRecRef = useRef<(MediaRecorder | null)[]>([null, null, null, null]);
  const slotChunksRef = useRef<Blob[][]>([[], [], [], []]);
  const slotTimerRef = useRef<(ReturnType<typeof setTimeout> | null)[]>([null, null, null, null]);
  const slotCancelRef = useRef<boolean[]>([false, false, false, false]);
  const micSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bpmRef = useRef(80);
  const slotsRef = useRef<SlotData[]>(INIT_SLOTS);
  const tapBufRef = useRef<number[]>([]);
  const rafRef = useRef(0);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null, null, null]);

  // React state — only what the UI needs to render
  const [ready, setReady] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [bpm, setBpm] = useState(80);
  const [slots, setSlots] = useState<SlotData[]>(INIT_SLOTS);
  const [progress, setProgress] = useState<number[]>([0, 0, 0, 0]);

  // Keep slotsRef in sync with state
  useEffect(() => { slotsRef.current = slots; }, [slots]);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  // ── Playhead animation ─────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const actx = actxRef.current;
      if (actx) {
        const dur = masterDurRef.current;
        const now = actx.currentTime;
        const phase = dur > 0 ? ((now - masterStartRef.current) % dur) / dur : 0;
        setProgress(slotsRef.current.map(s =>
          s.status === 'looping' || s.status === 'muted'
            ? Math.max(0, Math.min(1, phase))
            : 0
        ));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // ── Audio init ─────────────────────────────────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (actxRef.current) return;
    const actx = new AudioContext();
    actxRef.current = actx;
    const mg = actx.createGain();
    mg.gain.value = 0.85;
    mg.connect(actx.destination);
    masterGainRef.current = mg;
    for (let k = 0; k < 4; k++) {
      const g = actx.createGain();
      g.connect(mg);
      slotGainRef.current[k] = g;
    }
    setReady(true);
  }, []);

  const enableMic = useCallback(async () => {
    await ensureAudio();
    if (streamRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;
    micSrcRef.current = actxRef.current!.createMediaStreamSource(stream);
    setMicOn(true);
  }, [ensureAudio]);

  // ── Loop duration helper ───────────────────────────────────────────────────
  const loopDurOf = useCallback((bars: BarCount) => (60 / bpmRef.current) * 4 * bars, []);

  // ── Start a looping AudioBufferSourceNode ──────────────────────────────────
  const startLoop = useCallback((i: number, abuf: AudioBuffer, dur: number) => {
    const actx = actxRef.current!;
    const g = slotGainRef.current[i]!;
    g.gain.value = 1;
    const prev = slotSrcRef.current[i];
    if (prev) { try { prev.stop(); } catch { /* already stopped */ } slotSrcRef.current[i] = null; }

    const now = actx.currentTime;
    let startAt: number;
    if (masterDurRef.current > 0) {
      // Phase-lock to existing beat-1 grid
      const elapsed = now - masterStartRef.current;
      startAt = masterStartRef.current +
        Math.ceil((elapsed + 0.01) / masterDurRef.current) * masterDurRef.current;
    } else {
      startAt = now + 0.05;
      masterStartRef.current = startAt;
      masterDurRef.current = dur;
    }

    const src = actx.createBufferSource();
    src.buffer = abuf;
    src.loop = true;
    src.loopEnd = dur;
    src.connect(g);
    src.start(startAt);
    slotSrcRef.current[i] = src;
  }, []);

  // ── Record ─────────────────────────────────────────────────────────────────
  const startRecord = useCallback(async (i: number) => {
    await ensureAudio();
    try {
      if (!streamRef.current) await enableMic();
    } catch (_e: unknown) {
      void _e;
      return; // mic permission denied
    }
    if (!streamRef.current) return;

    const actx = actxRef.current!;
    const bars = slotsRef.current[i].bars;
    const dur = loopDurOf(bars);

    slotCancelRef.current[i] = false;
    slotChunksRef.current[i] = [];

    const recorder = new MediaRecorder(streamRef.current);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) slotChunksRef.current[i].push(e.data);
    };

    recorder.onstop = async () => {
      if (slotTimerRef.current[i]) {
        clearTimeout(slotTimerRef.current[i]!);
        slotTimerRef.current[i] = null;
      }
      if (slotCancelRef.current[i]) {
        slotCancelRef.current[i] = false;
        return;
      }

      const blob = new Blob(slotChunksRef.current[i]);
      slotChunksRef.current[i] = [];

      try {
        const arrayBuf = await blob.arrayBuffer();
        const rawBuf = await actx.decodeAudioData(arrayBuf);
        const sr = actx.sampleRate;
        const targetLen = Math.round(dur * sr);
        const abuf = actx.createBuffer(1, targetLen, sr);
        const dst = abuf.getChannelData(0);
        const src = rawBuf.getChannelData(0);
        for (let j = 0; j < targetLen; j++) dst[j] = j < src.length ? src[j] : 0;
        applyFade(abuf, 0.15);
        slotBufRef.current[i] = abuf;
        startLoop(i, abuf, dur);
        const peaks = buildPeaks(abuf);
        setSlots(prev => {
          const n = [...prev];
          n[i] = { ...n[i], status: 'looping', peaks };
          slotsRef.current = n;
          return n;
        });
      } catch (_e: unknown) {
        void _e;
        // Recording too short or decode failed — reset to empty
        setSlots(prev => {
          const n = [...prev];
          n[i] = { ...n[i], status: 'empty', peaks: [] };
          slotsRef.current = n;
          return n;
        });
      }
    };

    recorder.start(100); // emit chunks every 100ms
    slotRecRef.current[i] = recorder;
    // Auto-stop after loop duration + small buffer
    slotTimerRef.current[i] = setTimeout(() => {
      if (slotRecRef.current[i]?.state === 'recording') slotRecRef.current[i]!.stop();
    }, (dur + 0.2) * 1000);

    setSlots(prev => {
      const n = [...prev];
      n[i] = { ...n[i], status: 'recording', peaks: [] };
      slotsRef.current = n;
      return n;
    });
  }, [ensureAudio, enableMic, loopDurOf, startLoop]);

  // ── Slot controls ──────────────────────────────────────────────────────────
  const pressRec = useCallback(async (i: number) => {
    const slot = slotsRef.current[i];
    if (slot.status === 'recording') {
      if (slotRecRef.current[i]?.state === 'recording') slotRecRef.current[i]!.stop();
    } else if (slot.status === 'empty') {
      await startRecord(i);
    }
  }, [startRecord]);

  const pressMute = useCallback((i: number) => {
    const slot = slotsRef.current[i];
    if (slot.status !== 'looping' && slot.status !== 'muted') return;
    const muting = slot.status === 'looping';
    const g = slotGainRef.current[i];
    if (g) g.gain.value = muting ? 0 : 1;
    setSlots(prev => {
      const n = [...prev];
      n[i] = { ...n[i], status: muting ? 'muted' : 'looping' };
      slotsRef.current = n;
      return n;
    });
  }, []);

  const pressClear = useCallback((i: number) => {
    if (slotTimerRef.current[i]) { clearTimeout(slotTimerRef.current[i]!); slotTimerRef.current[i] = null; }
    slotCancelRef.current[i] = true;
    const rec = slotRecRef.current[i];
    if (rec?.state === 'recording') rec.stop();
    slotRecRef.current[i] = null;
    const src = slotSrcRef.current[i];
    if (src) { try { src.stop(); } catch { /* stopped */ } slotSrcRef.current[i] = null; }
    slotBufRef.current[i] = null;
    const g = slotGainRef.current[i];
    if (g) g.gain.value = 1;

    // Reset master clock if no other loops remain
    const anyLeft = slotsRef.current.some(
      (s, j) => j !== i && (s.status === 'looping' || s.status === 'muted')
    );
    if (!anyLeft) { masterStartRef.current = 0; masterDurRef.current = 0; }

    setSlots(prev => {
      const n = [...prev];
      n[i] = { status: 'empty', bars: prev[i].bars, peaks: [] };
      slotsRef.current = n;
      return n;
    });
  }, []);

  const tapTempo = useCallback(async () => {
    const now = performance.now();
    tapBufRef.current = [...tapBufRef.current, now].filter(t => now - t < 4000).slice(-8);
    const recent = tapBufRef.current;
    if (recent.length >= 2) {
      const gaps = recent.slice(1).map((t, j) => t - recent[j]);
      const avg = gaps.reduce((a, b) => a + b) / gaps.length;
      const nb = Math.round(60000 / avg);
      if (nb >= 40 && nb <= 240) { setBpm(nb); bpmRef.current = nb; }
    }
    await ensureAudio();
  }, [ensureAudio]);

  const setBarCount = useCallback((i: number, bars: BarCount) => {
    setSlots(prev => {
      if (prev[i].status !== 'empty') return prev;
      const n = [...prev];
      n[i] = { ...n[i], bars };
      slotsRef.current = n;
      return n;
    });
  }, []);

  // ── Demo loops ─────────────────────────────────────────────────────────────
  const loadDemo = useCallback(async () => {
    await ensureAudio();
    const actx = actxRef.current!;

    // Teardown all slots without going through pressClear state updaters
    for (let k = 0; k < 4; k++) {
      if (slotTimerRef.current[k]) { clearTimeout(slotTimerRef.current[k]!); slotTimerRef.current[k] = null; }
      slotCancelRef.current[k] = true;
      const rec = slotRecRef.current[k];
      if (rec?.state === 'recording') rec.stop();
      slotRecRef.current[k] = null;
      const src = slotSrcRef.current[k];
      if (src) { try { src.stop(); } catch { /* stopped */ } slotSrcRef.current[k] = null; }
      slotBufRef.current[k] = null;
      if (slotGainRef.current[k]) slotGainRef.current[k]!.gain.value = 1;
    }

    const bars: BarCount = 2;
    const dur = loopDurOf(bars);
    const sr = actx.sampleRate;
    const len = Math.round(dur * sr);
    const bd = 60 / bpmRef.current; // beat duration (seconds)

    // ── Slot 0: sub-bass C2 drone (65.41 Hz sine)
    const b0 = makeSynthBuf(len, sr, j => 0.28 * Math.sin(2 * Math.PI * 65.41 * j / sr));

    // ── Slot 1: C-major piano phrase (triangle waves, 8th-note arpeggio)
    const phraseFreqs = [261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 261.63, 329.63];
    const b1 = makeSynthBuf(len, sr, j => {
      let v = 0;
      phraseFreqs.forEach((f, b) => {
        const s = Math.round(b * (bd / 2) * sr);
        const d = j - s;
        if (d >= 0 && d < Math.round(0.28 * sr)) {
          const env = d < 200 ? d / 200 : Math.exp(-d / (sr * 0.16));
          const ph = (d / sr * f) % 1;
          v += 0.20 * (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) * env;
        }
      });
      return v;
    });

    // ── Slot 2: high arpeggiated figure (C5–G5–C6, 16th notes, sine)
    const arpFreqs = [523.25, 783.99, 1046.50, 783.99];
    const arpStep = bd / 4;
    const arpCount = Math.floor(dur / arpStep);
    const b2 = makeSynthBuf(len, sr, j => {
      let v = 0;
      for (let p = 0; p < arpCount; p++) {
        const s = Math.round(p * arpStep * sr);
        const d = j - s;
        if (d >= 0 && d < Math.round(0.09 * sr)) {
          v += 0.16 * Math.sin(2 * Math.PI * arpFreqs[p % 4] * d / sr) *
               Math.exp(-d / (sr * 0.045));
        }
      }
      return v;
    });

    // ── Slot 3: kick + snare pattern (deterministic noise via sin hash)
    const beatCount = Math.floor(dur / bd);
    const b3 = makeSynthBuf(len, sr, j => {
      let v = 0;
      for (let b = 0; b < beatCount; b++) {
        const isKick = b % 2 === 0;
        const s = Math.round(b * bd * sr);
        const d = j - s;
        if (d >= 0 && d < Math.round(0.11 * sr)) {
          const tc = isKick ? 0.055 : 0.022;
          const env = Math.exp(-d / (sr * tc));
          // deterministic "noise" via nested sin — avoids Math.random() non-determinism
          const ns = Math.sin(d * 17.3 + b * 91.7) * Math.sin(d * 53.1 + b * 37.4);
          const kick = isKick ? Math.sin(2 * Math.PI * 58 * d / sr) : 0;
          v += (0.45 * kick + (isKick ? 0.12 : 0.50) * ns) * env;
        }
      }
      return v;
    });

    const demoBuffers = [b0, b1, b2, b3];
    demoBuffers.forEach(b => applyFade(b, 0.1));

    const startAt = actx.currentTime + 0.1;
    masterStartRef.current = startAt;
    masterDurRef.current = dur;

    const newSlots: SlotData[] = demoBuffers.map((rawBuf, k) => {
      slotBufRef.current[k] = rawBuf;
      slotGainRef.current[k]!.gain.value = 1;
      const src = actx.createBufferSource();
      src.buffer = rawBuf;
      src.loop = true;
      src.loopEnd = dur;
      src.connect(slotGainRef.current[k]!);
      src.start(startAt);
      slotSrcRef.current[k] = src;
      return { status: 'looping' as SlotStatus, bars, peaks: buildPeaks(rawBuf) };
    });

    setSlots(newSlots);
    slotsRef.current = newSlots;
  }, [ensureAudio, loopDurOf]);

  // ── Waveform canvas drawing ────────────────────────────────────────────────
  useEffect(() => {
    slots.forEach((slot, i) => {
      const canvas = canvasRefs.current[i];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);
      const col = SLOT_COLORS[i];
      const px = progress[i] * w;

      if (slot.peaks.length === 0) {
        // Empty or recording — show baseline
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
        if (slot.status === 'recording') {
          // Animated red fill shows recording is active
          ctx.fillStyle = '#ef444418';
          ctx.fillRect(0, 0, w, h);
        }
        return;
      }

      const bw = w / slot.peaks.length;
      slot.peaks.forEach((p, j) => {
        const x = j * bw;
        const bh = Math.max(2, p * (h - 6));
        ctx.fillStyle = x < px ? col + 'cc' : col + '44';
        ctx.fillRect(x, (h - bh) / 2, Math.max(bw - 1, 1), bh);
      });

      if (slot.status === 'looping') {
        // White playhead line
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(Math.max(0, px - 1), 0, 2, h);
      }
      if (slot.status === 'muted') {
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.50)';
        ctx.fillRect(0, 0, w, h);
      }
    });
  }, [slots, progress]);

  // ── Status label ───────────────────────────────────────────────────────────
  const labelOf = (s: SlotStatus) => {
    if (s === 'empty') return 'EMPTY';
    if (s === 'recording') return '● REC';
    if (s === 'looping') return '▶ LOOP';
    return '⏸ MUTED';
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#070707] text-foreground flex flex-col gap-4 p-4 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Loop Station</h1>
          <p className="text-base text-muted-foreground mt-1">
            Build a live layered performance. Each slot: pick bars → REC → play → STOP to loop.
          </p>
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{bpm} BPM</span>
            <button
              onClick={() => void tapTempo()}
              className="px-4 py-2 font-mono text-sm bg-muted hover:bg-accent border border-border rounded-lg min-h-[44px] min-w-[60px]">
              TAP
            </button>
          </div>
          <button
            onClick={() => void enableMic()}
            className={`px-4 py-2 font-mono text-sm rounded-lg border min-h-[44px] transition-colors ${
              micOn
                ? 'bg-violet-500/20 border-violet-400/40 text-violet-300'
                : 'bg-muted border-border text-muted-foreground hover:bg-accent'
            }`}>
            {micOn ? '🎤 Mic On' : '🎤 Start Mic'}
          </button>
        </div>
      </div>

      {/* Slots */}
      <div className="flex flex-col gap-3">
        {slots.map((slot, i) => (
          <div key={i} className="rounded-xl border border-border bg-muted p-3 flex flex-col gap-2">

            {/* Slot header: number · status · bar selector */}
            <div className="flex items-center gap-3">
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold shrink-0"
                style={{ background: SLOT_COLORS[i] + '22', color: SLOT_COLORS[i] }}>
                {i + 1}
              </span>
              <span
                className={`font-mono text-sm w-[88px] shrink-0 ${slot.status === 'recording' ? 'animate-pulse' : ''}`}
                style={{ color: slot.status === 'recording' ? '#f87171' : SLOT_COLORS[i] }}>
                {labelOf(slot.status)}
              </span>
              <div className="flex items-center gap-1 ml-auto">
                {([1, 2, 4] as BarCount[]).map(b => (
                  <button
                    key={b}
                    onClick={() => setBarCount(i, b)}
                    disabled={slot.status !== 'empty'}
                    className={`w-9 h-9 text-xs font-mono rounded-lg border transition-colors disabled:opacity-30 ${
                      slot.bars === b
                        ? 'border-border bg-muted text-foreground'
                        : 'border-border text-muted-foreground/70 hover:text-muted-foreground'
                    }`}>
                    {b}
                  </button>
                ))}
                <span className="text-xs font-mono text-muted-foreground/70 ml-1">bars</span>
              </div>
            </div>

            {/* Waveform canvas */}
            <canvas
              ref={el => { canvasRefs.current[i] = el; }}
              width={640}
              height={52}
              className="w-full rounded-lg"
              style={{ background: 'rgba(0,0,0,0.45)' }}
            />

            {/* Controls */}
            <div className="flex gap-2">
              <button
                onClick={() => void pressRec(i)}
                className={`flex-1 py-2.5 font-mono text-sm font-semibold rounded-lg border min-h-[44px] transition-colors ${
                  slot.status === 'recording'
                    ? 'bg-violet-500/25 border-violet-400/50 text-violet-300'
                    : 'bg-muted border-border text-foreground hover:bg-accent'
                }`}>
                {slot.status === 'recording' ? '■ STOP' : '● REC'}
              </button>
              <button
                onClick={() => pressMute(i)}
                disabled={slot.status !== 'looping' && slot.status !== 'muted'}
                className={`px-5 py-2.5 font-mono text-sm rounded-lg border min-h-[44px] transition-colors disabled:opacity-30 ${
                  slot.status === 'muted'
                    ? 'bg-violet-500/20 border-violet-400/40 text-violet-300'
                    : 'bg-muted border-border text-muted-foreground hover:bg-accent'
                }`}>
                {slot.status === 'muted' ? 'UNMUTE' : 'MUTE'}
              </button>
              <button
                onClick={() => pressClear(i)}
                disabled={slot.status === 'empty'}
                className="px-4 py-2.5 font-mono text-sm rounded-lg border border-border text-muted-foreground hover:bg-accent min-h-[44px] disabled:opacity-25 transition-colors">
                CLEAR
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
        <button
          onClick={() => void loadDemo()}
          className="px-5 py-2.5 font-mono text-sm bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/40 text-violet-300 rounded-lg min-h-[44px]">
          Load Demo Loops
        </button>
        {!ready && (
          <p className="text-sm font-mono text-muted-foreground/70">Tap any control to initialize audio</p>
        )}
        <span className="text-xs font-mono text-muted-foreground/70">loop-station · /dream/121</span>
      </div>
    </div>
  );
}
