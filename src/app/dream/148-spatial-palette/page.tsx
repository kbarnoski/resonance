'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';

/* ─── pitch helpers ─────────────────────────────────────────────── */

const A4_FREQ = 440;
const A4_MIDI = 69;
const MIDI_C2  = 36;   // 65.41 Hz
const MIDI_C6  = 84;   // 1046.5 Hz

function midiToFreq(m: number): number {
  return A4_FREQ * Math.pow(2, (m - A4_MIDI) / 12);
}
function freqToMidi(f: number): number {
  return A4_MIDI + 12 * Math.log2(f / A4_FREQ);
}
function snapToSemitone(f: number): number {
  const clamped = Math.max(midiToFreq(MIDI_C2), Math.min(midiToFreq(MIDI_C6), f));
  return midiToFreq(Math.round(freqToMidi(clamped)));
}
function noteName(f: number): string {
  const NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const m = Math.round(freqToMidi(f));
  return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

// canvas Y: top = C6, bottom = C2  (linear MIDI scale so semitone rows are equal height)
function freqToY(freq: number, h: number): number {
  const m = freqToMidi(freq);
  return ((MIDI_C6 - m) / (MIDI_C6 - MIDI_C2)) * h;
}
function yToFreq(y: number, h: number): number {
  const m = MIDI_C6 - (y / h) * (MIDI_C6 - MIDI_C2);
  return midiToFreq(m);
}
function xToPan(x: number, w: number): number {
  return (x / w) * 2 - 1;
}

/* ─── chord detection ───────────────────────────────────────────── */

interface ChordTpl { label: string; chroma: number[] }

function buildChordTemplates(): ChordTpl[] {
  const NNAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const out: ChordTpl[] = [];
  for (let r = 0; r < 12; r++) {
    const maj = new Array<number>(12).fill(0);
    maj[r % 12] = 1; maj[(r + 4) % 12] = 1; maj[(r + 7) % 12] = 1;
    out.push({ label: NNAMES[r], chroma: maj });
    const min = new Array<number>(12).fill(0);
    min[r % 12] = 1; min[(r + 3) % 12] = 1; min[(r + 7) % 12] = 1;
    out.push({ label: NNAMES[r] + 'm', chroma: min });
  }
  return out;
}
const CHORD_TEMPLATES = buildChordTemplates();

function detectChord(voices: VoiceData[]): string {
  if (voices.length === 0) return '—';
  if (voices.length === 1) return noteName(voices[0].freq);
  const chroma = new Array<number>(12).fill(0);
  for (const v of voices) {
    const pc = ((Math.round(freqToMidi(v.freq)) % 12) + 12) % 12;
    chroma[pc] += 1;
  }
  const mag = Math.sqrt(chroma.reduce((s, x) => s + x * x, 0)) || 1;
  let best = -Infinity; let bestLabel = '?';
  for (const t of CHORD_TEMPLATES) {
    const dot = t.chroma.reduce((s, x, i) => s + x * chroma[i], 0);
    const score = dot / (mag * Math.sqrt(3));
    if (score > best) { best = score; bestLabel = t.label; }
  }
  return bestLabel;
}

/* ─── reverb ────────────────────────────────────────────────────── */

function buildReverbIR(actx: AudioContext): ConvolverNode {
  const sr = actx.sampleRate;
  const len = Math.floor(sr * 2.5);
  const buf = actx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
  const conv = actx.createConvolver();
  conv.buffer = buf;
  return conv;
}

/* ─── types ─────────────────────────────────────────────────────── */

type Timbre = 'sine' | 'triangle' | 'sawtooth' | 'square';
const TIMBRES: Timbre[] = ['sine', 'triangle', 'sawtooth', 'square'];
const TIMBRE_ICON: Record<Timbre, string> = {
  sine: '∿', triangle: '△', sawtooth: '⊿', square: '⊓',
};

const VOICE_HUES = [258, 320, 45, 160, 200, 28, 280, 90];
function hsl(hue: number, a: number): string {
  return `hsla(${hue},75%,62%,${a})`;
}

interface VoiceData {
  id: number;
  x: number;   // canvas px (display coords)
  y: number;   // canvas px (snapped to semitone row)
  freq: number;
  pan: number;
  timbre: Timbre;
  bright: number;  // 0 = dark/wet, 1 = bright/dry
  hue: number;
}

interface AudioNodes {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  mainGain: GainNode;
  wetGain: GainNode;
  panner: StereoPannerNode;
}

/* ─── component ─────────────────────────────────────────────────── */

let _idCounter = 0;
function nextId(): number { return ++_idCounter; }

export default function SpatialPalette() {
  const [started,    setStarted]    = useState(false);
  const [chord,      setChord]      = useState('—');
  const [voiceCount, setVoiceCount] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef  = useRef<HTMLCanvasElement>(null);
  const acRef     = useRef<AudioContext | null>(null);
  const convRef   = useRef<ConvolverNode | null>(null);
  const nodesRef  = useRef(new Map<number, AudioNodes>());
  const voicesRef = useRef<VoiceData[]>([]);
  const rafRef    = useRef(0);
  const chordRef  = useRef('—');

  // interaction state
  const dragRef      = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const longRef      = useRef<{ id: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const dblRef       = useRef<{ id: number; t: number } | null>(null);

  /* ── audio helpers ─────────────────────────────────────────── */

  const applyAudio = useCallback((v: VoiceData) => {
    const actx = acRef.current;
    if (!actx) return;
    const fc  = 200 + v.bright * 7800;
    const wet = (1 - v.bright) * 0.4;
    const existing = nodesRef.current.get(v.id);

    if (existing) {
      existing.osc.frequency.setTargetAtTime(v.freq,  actx.currentTime, 0.06);
      existing.filter.frequency.setTargetAtTime(fc,   actx.currentTime, 0.06);
      existing.panner.pan.setTargetAtTime(v.pan,      actx.currentTime, 0.06);
      existing.wetGain.gain.setTargetAtTime(wet,      actx.currentTime, 0.06);
      if (existing.osc.type !== v.timbre) existing.osc.type = v.timbre;
      return;
    }

    const osc    = actx.createOscillator();
    const filter = actx.createBiquadFilter();
    const mainG  = actx.createGain();
    const wetG   = actx.createGain();
    const panner = actx.createStereoPanner();

    osc.type = v.timbre;
    osc.frequency.value  = v.freq;
    filter.type          = 'lowpass';
    filter.frequency.value = fc;
    mainG.gain.value     = 0;
    wetG.gain.value      = wet;
    panner.pan.value     = v.pan;

    osc.connect(filter);
    filter.connect(mainG);
    mainG.connect(panner);
    panner.connect(actx.destination);

    filter.connect(wetG);
    wetG.connect(convRef.current!);

    mainG.gain.setTargetAtTime(0.22, actx.currentTime, 0.12);
    osc.start();

    nodesRef.current.set(v.id, { osc, filter, mainGain: mainG, wetGain: wetG, panner });
  }, []);

  const fadeOut = useCallback((id: number) => {
    const actx = acRef.current;
    const n = nodesRef.current.get(id);
    if (!n || !actx) return;
    n.mainGain.gain.setTargetAtTime(0, actx.currentTime, 0.1);
    setTimeout(() => {
      try { n.osc.stop(); } catch { /* already stopped */ }
      nodesRef.current.delete(id);
    }, 500);
  }, []);

  const refreshChord = useCallback(() => {
    const c = detectChord(voicesRef.current);
    if (c !== chordRef.current) { chordRef.current = c; setChord(c); }
    setVoiceCount(voicesRef.current.length);
  }, []);

  /* ── start ──────────────────────────────────────────────────── */

  const handleStart = useCallback(() => {
    const actx = new AudioContext();
    acRef.current = actx;
    const conv = buildReverbIR(actx);
    const reverbMaster = actx.createGain();
    reverbMaster.gain.value = 0.5;
    conv.connect(reverbMaster);
    reverbMaster.connect(actx.destination);
    convRef.current = conv;
    setStarted(true);
  }, []);

  /* ── place default voices after start ──────────────────────── */

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    const tri: Timbre = 'triangle';
    const defaults: VoiceData[] = [
      { id: nextId(), freq: 261.63, pan:  0,    timbre: tri, bright: 0.65, hue: VOICE_HUES[0], x: w * 0.50, y: 0 },
      { id: nextId(), freq: 329.63, pan:  0.38, timbre: tri, bright: 0.65, hue: VOICE_HUES[1], x: w * 0.68, y: 0 },
      { id: nextId(), freq: 392.00, pan: -0.38, timbre: tri, bright: 0.65, hue: VOICE_HUES[2], x: w * 0.32, y: 0 },
    ].map(v => ({ ...v, y: freqToY(v.freq, h) }));

    voicesRef.current = defaults;
    for (const v of defaults) applyAudio(v);
    refreshChord();
  }, [started, applyAudio, refreshChord]);

  /* ── animation loop ──────────────────────────────────────────── */

  useEffect(() => {
    if (!started) return;
    const canvas = canvasRef.current;
    const scope  = scopeRef.current;
    if (!canvas || !scope) return;
    const ctx  = canvas.getContext('2d')!;
    const sctx = scope.getContext('2d')!;
    const dpr  = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scope.width   = scope.offsetWidth   * dpr;
      scope.height  = scope.offsetHeight  * dpr;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // re-snap all voice Y coords after resize
      const h2 = canvas.offsetHeight;
      const w2 = canvas.offsetWidth;
      voicesRef.current = voicesRef.current.map(v => ({
        ...v,
        y: freqToY(v.freq, h2),
        x: Math.max(20, Math.min(w2 - 20, v.x)),
      }));
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      const voices = voicesRef.current;
      const actx = acRef.current!;

      /* ── main canvas ── */
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#070710';
      ctx.fillRect(0, 0, W, H);

      // semitone grid rows
      ctx.lineWidth = 1;
      for (let m = MIDI_C2; m <= MIDI_C6; m++) {
        const y = freqToY(midiToFreq(m), H);
        const isC = m % 12 === 0;
        ctx.strokeStyle = isC ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.035)';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        if (isC) {
          const oct = Math.floor(m / 12) - 1;
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.font = '10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(`C${oct}`, 6, y - 3);
        }
      }

      // stereo field verticals
      const panStops = [0.1, 0.25, 0.5, 0.75, 0.9];
      for (const frac of panStops) {
        const px = frac * W;
        ctx.strokeStyle = frac === 0.5 ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = frac === 0.5 ? 1.5 : 1;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';  ctx.fillText('L', 10, 22);
      ctx.textAlign = 'right'; ctx.fillText('R', W - 10, 22);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillText('C', W / 2, 22);

      // voices
      for (const v of voices) {
        const { x, y, hue } = v;
        // outer glow
        const grd = ctx.createRadialGradient(x, y, 0, x, y, 50);
        grd.addColorStop(0, hsl(hue, 0.35));
        grd.addColorStop(1, hsl(hue, 0));
        ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI * 2);
        ctx.fillStyle = grd; ctx.fill();
        // bright/dry indicator ring (outer)
        ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2);
        ctx.strokeStyle = hsl(hue, v.bright * 0.7 + 0.15);
        ctx.lineWidth = 2; ctx.stroke();
        // solid fill
        ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fillStyle = hsl(hue, 0.88); ctx.fill();
        // note name
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(noteName(v.freq), x, y + 4);
        // timbre icon above
        ctx.fillStyle = 'rgba(255,255,255,0.50)';
        ctx.font = '10px monospace';
        ctx.fillText(TIMBRE_ICON[v.timbre], x, y - 24);
      }

      /* ── scope: composite waveform ── */
      const SW = scope.offsetWidth;
      const SH = scope.offsetHeight;
      sctx.fillStyle = '#050508';
      sctx.fillRect(0, 0, SW, SH);
      sctx.strokeStyle = 'rgba(140,180,255,0.55)';
      sctx.lineWidth = 1.5;
      sctx.beginPath();
      const N = 220;
      const t0 = actx.currentTime;
      for (let i = 0; i < N; i++) {
        const t = t0 + (i / N) * 0.012;
        let s = 0;
        for (const v of voices) {
          s += Math.sin(2 * Math.PI * v.freq * t) * (0.28 / Math.max(1, voices.length));
        }
        const px = (i / (N - 1)) * SW;
        const py = SH * 0.5 - s * SH * 0.44;
        if (i === 0) sctx.moveTo(px, py); else sctx.lineTo(px, py);
      }
      sctx.stroke();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [started]);

  /* ── pointer interaction ──────────────────────────────────── */

  const hitTest = useCallback((x: number, y: number): number | null => {
    const vs = voicesRef.current;
    for (let i = vs.length - 1; i >= 0; i--) {
      if (Math.hypot(vs[i].x - x, vs[i].y - y) < 26) return vs[i].id;
    }
    return null;
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!started) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = hitTest(x, y);

    if (id !== null) {
      dragRef.current = { id, ox: x, oy: y };

      // double-click: cycle timbre
      const now = Date.now();
      const last = dblRef.current;
      if (last && last.id === id && now - last.t < 380) {
        dblRef.current = null;
        voicesRef.current = voicesRef.current.map(v => {
          if (v.id !== id) return v;
          const next = { ...v, timbre: TIMBRES[(TIMBRES.indexOf(v.timbre) + 1) % TIMBRES.length] };
          applyAudio(next);
          return next;
        });
        return;
      }
      dblRef.current = { id, t: now };

      // long-press: remove after 600 ms
      const timer = setTimeout(() => {
        voicesRef.current = voicesRef.current.filter(v => v.id !== id);
        fadeOut(id);
        refreshChord();
        longRef.current = null;
        dragRef.current = null;
      }, 600);
      longRef.current = { id, timer };

    } else {
      // add a voice on empty canvas (max 8)
      if (voicesRef.current.length >= 8) return;
      const h = e.currentTarget.offsetHeight;
      const w = e.currentTarget.offsetWidth;
      const freq = snapToSemitone(yToFreq(y, h));
      const pan  = xToPan(x, w);
      const hue  = VOICE_HUES[voicesRef.current.length % VOICE_HUES.length];
      const nv: VoiceData = { id: nextId(), x, y: freqToY(freq, h), freq, pan, timbre: 'sine', bright: 0.6, hue };
      voicesRef.current = [...voicesRef.current, nv];
      applyAudio(nv);
      refreshChord();
    }
  }, [started, hitTest, applyAudio, fadeOut, refreshChord]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // cancel long-press if moved > 8 px
    if (longRef.current?.id === drag.id && Math.hypot(x - drag.ox, y - drag.oy) > 8) {
      clearTimeout(longRef.current.timer);
      longRef.current = null;
    }

    const h = e.currentTarget.offsetHeight;
    const w = e.currentTarget.offsetWidth;
    const freq = snapToSemitone(yToFreq(y, h));
    const pan  = xToPan(Math.max(0, Math.min(w, x)), w);

    voicesRef.current = voicesRef.current.map(v => {
      if (v.id !== drag.id) return v;
      const updated = { ...v, x: Math.max(20, Math.min(w - 20, x)), y: freqToY(freq, h), freq, pan };
      applyAudio(updated);
      return updated;
    });
    refreshChord();
  }, [applyAudio, refreshChord]);

  const onPointerUp = useCallback(() => {
    if (longRef.current) { clearTimeout(longRef.current.timer); longRef.current = null; }
    dragRef.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!started) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = hitTest(x, y);
    if (id === null) return;
    voicesRef.current = voicesRef.current.map(v => {
      if (v.id !== id) return v;
      const bright = Math.max(0, Math.min(1, v.bright - e.deltaY * 0.002));
      const updated = { ...v, bright };
      applyAudio(updated);
      return updated;
    });
  }, [started, hitTest, applyAudio]);

  /* ── cleanup ─────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      acRef.current?.close();
    };
  }, []);

  /* ── render ──────────────────────────────────────────────── */

  if (!started) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#070710] text-foreground gap-6 px-6">
        <h1 className="text-3xl font-mono font-bold text-violet-300">Spatial Palette</h1>
        <p className="text-muted-foreground text-base text-center max-w-md leading-relaxed">
          Each dot is a synthesis voice. Drag left/right to pan it in stereo. Drag
          up/down to change pitch. Scroll over a dot to brighten or darken its
          timbre and reverb. Double-click to cycle waveform. Long-press to remove.
          Click empty canvas to add a voice.
        </p>
        <p className="text-muted-foreground text-sm text-center font-mono">
          C major triad pre-placed · up to 8 voices · zero API
        </p>
        <button
          onClick={handleStart}
          className="bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-foreground font-mono
                     px-8 py-3 rounded-lg text-base min-h-[48px] min-w-[160px] transition-colors"
        >
          Open Palette
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#070710] select-none overflow-hidden touch-none">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0 border-b border-border">
        <span className="text-muted-foreground text-sm font-mono">
          <Link href="/dream" className="hover:text-muted-foreground transition-colors">dream</Link>
          {' / '}spatial-palette
        </span>
        <span className="text-violet-300 font-mono text-2xl font-bold tracking-wide">{chord}</span>
        <span className="text-muted-foreground text-xs font-mono text-right hidden sm:block leading-4">
          drag pitch·pan<br />scroll brightness·reverb
        </span>
      </div>

      {/* main canvas */}
      <canvas
        ref={canvasRef}
        className="flex-1 w-full cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      />

      {/* scope strip */}
      <div className="shrink-0 border-t border-border">
        <canvas ref={scopeRef} className="w-full h-14" />
      </div>

      {/* footer */}
      <div className="flex items-center justify-between px-4 py-1.5 shrink-0 border-t border-border">
        <span className="text-muted-foreground text-xs font-mono">{voiceCount}/8 voices</span>
        <span className="text-muted-foreground/70 text-xs font-mono">∿ △ ⊿ ⊓ · double-click to cycle · long-press removes</span>
        <span className="text-muted-foreground/70 text-xs font-mono">148-spatial-palette</span>
      </div>
    </div>
  );
}
