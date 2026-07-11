'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Quality = 'maj' | 'min' | 'dom7';
type Chord = { root: number; quality: Quality };
type CompVoice = { osc: OscillatorNode; gain: GainNode; midi: number };
type HistBlock = { root: number; quality: Quality; startMs: number; endMs: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const C0 = 16.351597831287414; // Hz, the C in octave 0 — chroma reference.
const CHROMA_LO = 60; // Hz, low edge of the chroma fold band.
const CHROMA_HI = 2000; // Hz, high edge of the chroma fold band.
const CHROMA_SMOOTH = 0.8; // one-pole smoothing on the chroma vector.
const CONF_FLOOR = 0.62; // cosine-match floor; below it we hold the prior chord.
const SETTLE_MS = 160; // look-ahead: a new chord must persist this long to switch.
const ONSET_REFRACTORY_MS = 100; // min spacing between counted onsets.
const FLUX_K = 1.5; // adaptive onset threshold = mean + K·std.
const DEFAULT_BPM = 80; // gentle fallback pulse when playing is legato/sparse.
const DEMO_BPM = 88; // tempo of the ii–V–I–vi demo.
const LOOKAHEAD_MS = 100; // scheduler horizon (Chris Wilson "two clocks").
const SCHED_TICK_MS = 25; // scheduler wake-up cadence.
const HIST_WIN_MS = 16000; // chord-history trail window along the bottom.

// ii–V–I–vi in C for the no-mic demo, one bar each.
const DEMO_PROG: Chord[] = [
  { root: 2, quality: 'min' }, // Dm7
  { root: 7, quality: 'dom7' }, // G7
  { root: 0, quality: 'maj' }, // Cmaj7
  { root: 9, quality: 'min' }, // Am7
];

// Chord-quality templates over 12 pitch classes (root-relative). Weighted masks:
// shell tones (3rd, 7th) and color tones get emphasis; for dom7 the b7 is weighted.
function makeTemplate(intervals: { iv: number; w: number }[]): number[] {
  const t = new Array(12).fill(0);
  for (const { iv, w } of intervals) t[iv % 12] = w;
  // normalize to unit length for cosine matching
  const mag = Math.sqrt(t.reduce((s, v) => s + v * v, 0)) || 1;
  return t.map((v) => v / mag);
}

const TEMPLATES: Record<Quality, number[]> = {
  // root, M3, P5, M7 — shell (3,7) emphasized
  maj: makeTemplate([
    { iv: 0, w: 1.0 },
    { iv: 4, w: 1.1 },
    { iv: 7, w: 0.7 },
    { iv: 11, w: 1.0 },
  ]),
  // root, m3, P5, m7
  min: makeTemplate([
    { iv: 0, w: 1.0 },
    { iv: 3, w: 1.1 },
    { iv: 7, w: 0.7 },
    { iv: 10, w: 1.0 },
  ]),
  // root, M3, P5, b7 — b7 weighted, the dominant signature
  dom7: makeTemplate([
    { iv: 0, w: 1.0 },
    { iv: 4, w: 1.0 },
    { iv: 7, w: 0.6 },
    { iv: 10, w: 1.2 },
  ]),
};

const QUALITIES: Quality[] = ['maj', 'min', 'dom7'];

// ─── Pure music helpers ───────────────────────────────────────────────────────

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function chordLabel(c: Chord): string {
  const n = NOTE_NAMES[c.root];
  if (c.quality === 'maj') return `${n}maj7`;
  if (c.quality === 'min') return `${n}m7`;
  return `${n}7`;
}

function rootHue(root: number): number {
  return (root / 12) * 360;
}

// Cosine similarity of a chroma vector against a normalized template rotated to root.
function cosineToTemplate(chroma: number[], tmpl: number[], root: number): number {
  let dot = 0;
  let cMag = 0;
  for (let i = 0; i < 12; i++) {
    const tv = tmpl[((i - root) % 12 + 12) % 12];
    dot += chroma[i] * tv;
    cMag += chroma[i] * chroma[i];
  }
  cMag = Math.sqrt(cMag) || 1;
  return dot / cMag; // template already unit-length
}

// Best chord over all 36 templates; returns null if below the confidence floor.
function matchChord(chroma: number[]): { chord: Chord; conf: number } | null {
  let best: Chord = { root: 0, quality: 'maj' };
  let bestScore = -Infinity;
  for (const q of QUALITIES) {
    const tmpl = TEMPLATES[q];
    for (let root = 0; root < 12; root++) {
      const s = cosineToTemplate(chroma, tmpl, root);
      if (s > bestScore) {
        bestScore = s;
        best = { root, quality: q };
      }
    }
  }
  if (bestScore < CONF_FLOOR) return null;
  return { chord: best, conf: bestScore };
}

// Rootless / drop-2 comp voicing: 3rd + 7th shell plus a color tone (9 or 13),
// voiced in the mid register (~C3..C5 = midi 48..72). Mark Levine vocabulary.
function makeVoicing(c: Chord): number[] {
  const r = c.root;
  // semitone offsets from root within the chosen voicing.
  let offs: number[];
  if (c.quality === 'maj') offs = [4, 11, 14, 7]; // 3, 7, 9, 5(6)
  else if (c.quality === 'min') offs = [3, 10, 14, 7]; // b3, b7, 9, 5
  else offs = [4, 10, 14, 9]; // 3, b7, 9, 13 — rootless dom7
  // base octave: put the 3rd around midi 52 (E3).
  const base = 48 + r;
  const v = offs.map((o) => base + o);
  // keep voicing inside ~C3..C5; drop any voice an octave if it climbs too high.
  return v.map((m) => (m > 72 ? m - 12 : m)).sort((a, b) => a - b);
}

// Walking-bass step: root on a downbeat, otherwise a chord/approach tone leading
// toward the next chord's root. `beat` 0..3 within the bar.
function walkBassMidi(c: Chord, next: Chord, beat: number): number {
  const baseRoot = 36 + c.root; // C2-ish register
  if (beat === 0) return baseRoot;
  const nextRoot = 36 + next.root;
  if (beat === 3) {
    // chromatic approach a semitone below the next root
    const approach = nextRoot - 1;
    return approach > 28 ? approach : approach + 12;
  }
  // beats 1 & 2: chord tones (5th, then 3rd) within the current chord
  const third = c.quality === 'min' ? 3 : 4;
  const fifth = 7;
  return baseRoot + (beat === 1 ? fifth : third);
}

// ─── Audio graph helpers ──────────────────────────────────────────────────────

type Bed = {
  master: GainNode;
  comp: CompVoice[];
  compBus: GainNode;
  bassOsc: OscillatorNode;
  bassGain: GainNode;
  delay: DelayNode;
  feedback: GainNode;
};

function makeBed(ac: AudioContext): Bed {
  const master = ac.createGain();
  master.gain.value = 0.0;
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter);
  limiter.connect(ac.destination);

  // soft feedback delay for air
  const delay = ac.createDelay(1.0);
  delay.delayTime.value = 0.28;
  const feedback = ac.createGain();
  feedback.gain.value = 0.25;
  const wet = ac.createGain();
  wet.gain.value = 0.18;
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(master);

  // comp bus (four sine-ish voices that glide between voicings)
  const compBus = ac.createGain();
  compBus.gain.value = 0.5;
  compBus.connect(master);
  compBus.connect(delay);

  const comp: CompVoice[] = [];
  for (let i = 0; i < 4; i++) {
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    const gain = ac.createGain();
    gain.gain.value = 0;
    osc.frequency.value = midiToFreq(60);
    osc.connect(gain);
    gain.connect(compBus);
    osc.start();
    comp.push({ osc, gain, midi: 60 });
  }

  // walking bass
  const bassOsc = ac.createOscillator();
  bassOsc.type = 'triangle';
  const bassGain = ac.createGain();
  bassGain.gain.value = 0;
  bassOsc.frequency.value = midiToFreq(36);
  bassOsc.connect(bassGain);
  bassGain.connect(master);
  bassOsc.start();

  return { master, comp, compBus, bassOsc, bassGain, delay, feedback };
}

// Voice-lead the comp: each existing voice glides to the NEAREST pitch of the
// target voicing (minimal motion), then settles with setTargetAtTime.
function applyVoicing(ac: AudioContext, bed: Bed, voicing: number[], when: number): void {
  const targets = [...voicing];
  for (const v of bed.comp) {
    // find nearest unclaimed target to this voice's current pitch
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const d = Math.abs(targets[i] - v.midi);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const tgt = targets.splice(bestIdx, 1)[0] ?? v.midi;
    v.midi = tgt;
    v.osc.frequency.setTargetAtTime(midiToFreq(tgt), when, 0.06);
  }
}

// A soft comp "stab" — swell the comp bus envelope on a beat.
function scheduleCompStab(bed: Bed, when: number, energy: number): void {
  const g = bed.compBus.gain;
  const peak = 0.32 + 0.32 * energy;
  g.cancelScheduledValues(when);
  g.setTargetAtTime(peak, when, 0.02);
  g.setTargetAtTime(0.14, when + 0.18, 0.18);
}

// Pluck the walking bass note at `when` for `dur`.
function scheduleBassNote(ac: AudioContext, bed: Bed, midi: number, when: number, dur: number, energy: number): void {
  bed.bassOsc.frequency.setValueAtTime(midiToFreq(midi), when);
  const g = bed.bassGain.gain;
  const peak = 0.22 + 0.14 * energy;
  g.cancelScheduledValues(when);
  g.setValueAtTime(0.0, when);
  g.linearRampToValueAtTime(peak, when + 0.012);
  g.exponentialRampToValueAtTime(0.0001, when + dur * 0.9);
}

// ─── Component ────────────────────────────────────────────────────────────────

type RunState = 'idle' | 'listening' | 'demo';

type Scene = {
  chroma: number[]; // smoothed 12-bin chroma
  chord: Chord;
  conf: number;
  bassMidi: number;
  voicing: number[];
  beat: number; // current beat index in bar
  bpm: number;
  pulsePhase: number; // 0..1 within a beat, for the metronome dot
  onsetFlash: number; // decays 1→0 on each detected onset
  energy: number; // input loudness 0..1
  history: HistBlock[];
};

export default function LiveDuetHarmonist() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bedRef = useRef<Bed | null>(null);
  const rafRef = useRef<number>(0);
  const schedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const prevSpecRef = useRef<Float32Array | null>(null);
  const fluxHistRef = useRef<number[]>([]);
  const onsetTimesRef = useRef<number[]>([]);
  const lastOnsetMsRef = useRef<number>(0);

  // chord look-ahead "settle"
  const candidateRef = useRef<Chord | null>(null);
  const candidateSinceRef = useRef<number>(0);

  // scheduler state
  const nextBeatTimeRef = useRef<number>(0);
  const beatRef = useRef<number>(0);
  const demoIdxRef = useRef<number>(0);
  const startedRef = useRef<boolean>(false);

  const sceneRef = useRef<Scene>({
    chroma: new Array(12).fill(0),
    chord: { root: 0, quality: 'maj' },
    conf: 0,
    bassMidi: 36,
    voicing: makeVoicing({ root: 0, quality: 'maj' }),
    beat: 0,
    bpm: DEFAULT_BPM,
    pulsePhase: 0,
    onsetFlash: 0,
    energy: 0,
    history: [],
  });

  const [runState, setRunState] = useState<RunState>('idle');
  const [chordText, setChordText] = useState('—');
  const [bpmText, setBpmText] = useState(DEFAULT_BPM);
  const [err, setErr] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Commit a settled chord: update scene + voicing target + history block.
  const commitChord = useCallback((c: Chord, nowMs: number) => {
    const sc = sceneRef.current;
    sc.chord = c;
    sc.voicing = makeVoicing(c);
    candidateRef.current = null;
    const ac = acRef.current;
    const bed = bedRef.current;
    if (ac && bed) applyVoicing(ac, bed, sc.voicing, ac.currentTime);
    // history trail
    const h = sc.history;
    if (h.length) h[h.length - 1].endMs = nowMs;
    h.push({ root: c.root, quality: c.quality, startMs: nowMs, endMs: nowMs + 500 });
    while (h.length && nowMs - h[0].endMs > HIST_WIN_MS) h.shift();
    setChordText(chordLabel(c));
  }, []);

  // ─── Analysis: chroma + spectral-flux onsets (called each rAF when listening) ──
  const analyse = useCallback((nowMs: number) => {
    const an = analyserRef.current;
    const ac = acRef.current;
    if (!an || !ac) return;
    const bins = freqBufRef.current!;
    an.getByteFrequencyData(bins);
    const sr = ac.sampleRate;
    const nBins = an.frequencyBinCount;
    const binHz = sr / 2 / nBins;

    // 12-bin chroma fold over 60..2000 Hz
    const chroma = new Array(12).fill(0);
    let energy = 0;
    for (let i = 1; i < nBins; i++) {
      const f = i * binHz;
      if (f < CHROMA_LO || f > CHROMA_HI) continue;
      const v = bins[i] / 255;
      energy += v;
      const pc = ((Math.round(12 * Math.log2(f / C0)) % 12) + 12) % 12;
      chroma[pc] += v;
    }
    // normalize chroma so cosine-match is loudness-invariant
    const cMax = Math.max(...chroma, 1e-6);
    for (let i = 0; i < 12; i++) chroma[i] /= cMax;

    const sc = sceneRef.current;
    for (let i = 0; i < 12; i++) {
      sc.chroma[i] = CHROMA_SMOOTH * sc.chroma[i] + (1 - CHROMA_SMOOTH) * chroma[i];
    }
    sc.energy = Math.min(1, energy / 40);

    // ── chord match + settle ──
    const m = matchChord(sc.chroma);
    if (m) {
      const cand = m.chord;
      const cur = sc.chord;
      const same = cand.root === cur.root && cand.quality === cur.quality;
      if (!same) {
        const c = candidateRef.current;
        if (!c || c.root !== cand.root || c.quality !== cand.quality) {
          candidateRef.current = cand;
          candidateSinceRef.current = nowMs;
        } else if (nowMs - candidateSinceRef.current >= SETTLE_MS) {
          commitChord(cand, nowMs);
        }
      } else {
        candidateRef.current = null;
      }
      sc.conf = m.conf;
    }

    // ── spectral flux onset detection ──
    const prev = prevSpecRef.current!;
    let flux = 0;
    for (let i = 1; i < nBins; i++) {
      const f = i * binHz;
      if (f < CHROMA_LO || f > CHROMA_HI) continue;
      const cur = bins[i] / 255;
      const d = cur - prev[i];
      if (d > 0) flux += d;
      prev[i] = cur;
    }
    const hist = fluxHistRef.current;
    hist.push(flux);
    if (hist.length > 43) hist.shift(); // ~0.7s of frames
    const mean = hist.reduce((s, v) => s + v, 0) / hist.length;
    const variance = hist.reduce((s, v) => s + (v - mean) * (v - mean), 0) / hist.length;
    const thresh = mean + FLUX_K * Math.sqrt(variance);
    if (flux > thresh && flux > 0.5 && nowMs - lastOnsetMsRef.current > ONSET_REFRACTORY_MS) {
      lastOnsetMsRef.current = nowMs;
      sc.onsetFlash = 1;
      const ots = onsetTimesRef.current;
      ots.push(nowMs);
      if (ots.length > 8) ots.shift();
      // estimate tempo from inter-onset intervals, folded to 60..180 BPM
      if (ots.length >= 3) {
        const iois: number[] = [];
        for (let i = 1; i < ots.length; i++) iois.push(ots[i] - ots[i - 1]);
        iois.sort((a, b) => a - b);
        let ioi = iois[Math.floor(iois.length / 2)]; // median IOI
        while (ioi > 0 && 60000 / ioi < 60) ioi /= 2;
        while (ioi > 0 && 60000 / ioi > 180) ioi *= 2;
        const bpm = Math.max(60, Math.min(180, 60000 / ioi));
        sc.bpm = 0.85 * sc.bpm + 0.15 * bpm;
      }
    }
  }, [commitChord]);

  // ─── Scheduler (Chris Wilson two-clocks): place bass + comp on the pulse ──────
  const runScheduler = useCallback((demo: boolean) => {
    const ac = acRef.current;
    const bed = bedRef.current;
    if (!ac || !bed) return;
    const sc = sceneRef.current;
    const horizon = ac.currentTime + LOOKAHEAD_MS / 1000;

    while (nextBeatTimeRef.current < horizon) {
      const when = nextBeatTimeRef.current;
      const beat = beatRef.current;
      const bpm = demo ? DEMO_BPM : sc.bpm;
      const spb = 60 / bpm;

      let cur: Chord;
      let next: Chord;
      if (demo) {
        cur = DEMO_PROG[demoIdxRef.current % DEMO_PROG.length];
        next = DEMO_PROG[(demoIdxRef.current + 1) % DEMO_PROG.length];
        if (beat === 0) {
          // commit the demo chord on the downbeat so visuals + voicing follow
          sc.chord = cur;
          sc.voicing = makeVoicing(cur);
          applyVoicing(ac, bed, sc.voicing, when);
          const nowMs = performance.now();
          const h = sc.history;
          if (h.length) h[h.length - 1].endMs = nowMs;
          h.push({ root: cur.root, quality: cur.quality, startMs: nowMs, endMs: nowMs + 600 });
          while (h.length && nowMs - h[0].endMs > HIST_WIN_MS) h.shift();
          setChordText(chordLabel(cur));
        }
      } else {
        cur = sc.chord;
        next = sc.chord;
      }

      const energy = demo ? 0.6 : sc.energy;
      // bring the master up gently once playing
      bed.master.gain.setTargetAtTime(0.18 + 0.5 * energy, when, 0.2);

      // walking bass quarter note
      const bMidi = walkBassMidi(cur, next, beat);
      sc.bassMidi = bMidi;
      scheduleBassNote(ac, bed, bMidi, when, spb, energy);
      // comp stab on beats 0 and 2 (and a softer one on the and-of-beats when energetic)
      if (beat === 0 || beat === 2) scheduleCompStab(bed, when, energy);

      // advance
      beatRef.current = (beat + 1) % 4;
      if (demo && beatRef.current === 0) demoIdxRef.current += 1;
      nextBeatTimeRef.current += spb;
    }
  }, []);

  // ─── Render loop ──────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const W = cvs.width;
    const H = cvs.height;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = W / dpr;
    const h = H / dpr;
    const sc = sceneRef.current;
    const nowMs = performance.now();

    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h * 0.44;
    const ringR = Math.min(w, h) * 0.3;

    // ── 12-wedge chroma ring ──
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / 12) * Math.PI * 2 - Math.PI / 2;
      const e = sc.chroma[i];
      const hue = rootHue(i);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, ringR * (0.55 + 0.45 * e), a0 + 0.01, a1 - 0.01);
      ctx.closePath();
      ctx.fillStyle = `hsla(${hue}, 70%, ${18 + 42 * e}%, ${0.25 + 0.6 * e})`;
      ctx.fill();
    }
    // inner mask
    ctx.beginPath();
    ctx.arc(cx, cy, ringR * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = '#0a0a10';
    ctx.fill();

    // ── center chord name (colored by root) ──
    const hue = rootHue(sc.chord.root);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `hsl(${hue}, 75%, 70%)`;
    ctx.font = `600 ${Math.round(ringR * 0.34)}px ui-sans-serif, system-ui`;
    ctx.fillText(chordLabel(sc.chord), cx, cy - ringR * 0.04);
    ctx.font = `500 ${Math.round(ringR * 0.1)}px ui-monospace, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(`conf ${sc.conf.toFixed(2)}`, cx, cy + ringR * 0.22);

    // ── glowing comp-voice nodes (rootless voicing) — arc above center ──
    const voicing = sc.voicing;
    for (let i = 0; i < voicing.length; i++) {
      const t = voicing.length > 1 ? i / (voicing.length - 1) : 0.5;
      const nx = cx + (t - 0.5) * ringR * 1.4;
      const ny = cy - ringR * 0.95 - ((voicing[i] - 48) / 24) * ringR * 0.25;
      const pc = ((voicing[i] % 12) + 12) % 12;
      ctx.beginPath();
      ctx.arc(nx, ny, 9 + 6 * sc.energy, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${rootHue(pc)}, 75%, 65%, 0.85)`;
      ctx.shadowColor = `hsl(${rootHue(pc)}, 75%, 60%)`;
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '12px ui-monospace, monospace';
      ctx.fillText(NOTE_NAMES[pc], nx, ny - 18);
    }

    // ── walking-bass ladder (left side) ──
    const ladX = w * 0.1;
    const ladTop = cy - ringR * 0.7;
    const ladBot = cy + ringR * 0.9;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let r = 0; r < 12; r++) {
      const y = ladBot - (r / 11) * (ladBot - ladTop);
      ctx.beginPath();
      ctx.moveTo(ladX - 22, y);
      ctx.lineTo(ladX + 22, y);
      ctx.stroke();
    }
    const bassPc = ((sc.bassMidi % 12) + 12) % 12;
    const by = ladBot - (bassPc / 11) * (ladBot - ladTop);
    ctx.beginPath();
    ctx.arc(ladX, by, 11, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(265, 70%, 65%)';
    ctx.shadowColor = 'hsl(265,70%,55%)';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('bass', ladX, ladTop - 18);
    ctx.fillText(NOTE_NAMES[bassPc], ladX, by - 20);

    // ── pulse / beat indicator (right side) ──
    const pulseX = w * 0.9;
    const pulseY = cy - ringR * 0.4;
    for (let b = 0; b < 4; b++) {
      const active = b === sc.beat;
      ctx.beginPath();
      ctx.arc(pulseX, pulseY + b * 34, active ? 12 : 7, 0, Math.PI * 2);
      ctx.fillStyle = active
        ? `rgba(167,139,250,${0.6 + 0.4 * (1 - sc.pulsePhase)})`
        : 'rgba(255,255,255,0.15)';
      ctx.fill();
    }
    // onset flash ring
    if (sc.onsetFlash > 0.02) {
      ctx.beginPath();
      ctx.arc(pulseX, pulseY + 1.5 * 34, 26 + 18 * (1 - sc.onsetFlash), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(110,231,183,${sc.onsetFlash})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillText(`${Math.round(sc.bpm)} BPM`, pulseX, pulseY - 28);

    // ── chord-history trail along the bottom ──
    const trailTop = h - 56;
    const trailBot = h - 16;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('chord history', 16, trailTop - 10);
    const win = HIST_WIN_MS;
    for (const blk of sc.history) {
      const end = blk.endMs > blk.startMs ? blk.endMs : nowMs;
      const x0 = 16 + ((blk.startMs - (nowMs - win)) / win) * (w - 32);
      const x1 = 16 + ((end - (nowMs - win)) / win) * (w - 32);
      if (x1 < 16) continue;
      const bw = Math.max(3, x1 - x0);
      ctx.fillStyle = `hsla(${rootHue(blk.root)}, 70%, 55%, 0.75)`;
      ctx.fillRect(Math.max(16, x0), trailTop, bw, trailBot - trailTop);
      if (bw > 28) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(chordLabel({ root: blk.root, quality: blk.quality }), Math.max(20, x0 + 4), (trailTop + trailBot) / 2 + 4);
      }
    }
    ctx.textAlign = 'left';

    // decay transient visuals
    sc.onsetFlash *= 0.9;
  }, []);

  // ─── Main rAF loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    let prevMs = performance.now();
    const tick = () => {
      const nowMs = performance.now();
      const dt = nowMs - prevMs;
      prevMs = nowMs;
      const sc = sceneRef.current;
      // advance pulse phase for the metronome dot
      const spb = 60 / sc.bpm;
      sc.pulsePhase = (sc.pulsePhase + dt / 1000 / spb) % 1;
      if (runState === 'listening') analyse(nowMs);
      draw();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [runState, analyse, draw]);

  // ─── Canvas sizing ────────────────────────────────────────────────────────────
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = cvs.getBoundingClientRect();
      cvs.width = rect.width * dpr;
      cvs.height = rect.height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cvs);
    return () => ro.disconnect();
  }, []);

  // ─── Start helpers ────────────────────────────────────────────────────────────
  const startScheduler = useCallback((demo: boolean) => {
    const ac = acRef.current;
    if (!ac) return;
    nextBeatTimeRef.current = ac.currentTime + 0.1;
    beatRef.current = 0;
    demoIdxRef.current = 0;
    if (schedTimerRef.current) clearInterval(schedTimerRef.current);
    schedTimerRef.current = setInterval(() => {
      const sc = sceneRef.current;
      sc.beat = beatRef.current;
      runScheduler(demo);
    }, SCHED_TICK_MS);
  }, [runScheduler]);

  const startMic = useCallback(async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ac = new AudioContext();
      acRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const an = ac.createAnalyser();
      an.fftSize = 4096;
      an.smoothingTimeConstant = 0.4;
      src.connect(an);
      analyserRef.current = an;
      freqBufRef.current = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
      prevSpecRef.current = new Float32Array(an.frequencyBinCount);
      fluxHistRef.current = [];
      onsetTimesRef.current = [];
      bedRef.current = makeBed(ac);
      startedRef.current = true;
      setDemoMode(false);
      setRunState('listening');
      startScheduler(false);
    } catch {
      setErr('Microphone unavailable — running the ii–V–I–vi demo instead.');
      startDemo();
    }
  }, [startScheduler]); // eslint-disable-line react-hooks/exhaustive-deps

  const startDemo = useCallback(() => {
    try {
      const ac = new AudioContext();
      acRef.current = ac;
      bedRef.current = makeBed(ac);
      startedRef.current = true;
      setDemoMode(true);
      setRunState('demo');
      startScheduler(true);
    } catch {
      setErr('Audio is unavailable in this browser.');
    }
  }, [startScheduler]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (schedTimerRef.current) clearInterval(schedTimerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const ac = acRef.current;
      if (ac && ac.state !== 'closed') ac.close().catch(() => {});
    };
  }, []);

  // keep the displayed BPM in step with the inferred pulse
  useEffect(() => {
    const id = setInterval(() => {
      setBpmText(Math.round(demoMode ? DEMO_BPM : sceneRef.current.bpm));
    }, 400);
    return () => clearInterval(id);
  }, [demoMode]);

  const started = runState !== 'idle';

  return (
    <div className="flex flex-col h-screen bg-[#0a0a10] text-foreground select-none">
      <div className="px-6 pt-5 pb-3 flex-shrink-0">
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">Live Duet Harmonist</h1>
        <p className="text-base text-muted-foreground mt-1 max-w-2xl">
          Play <span className="text-violet-300">chords</span> and an AI accompanist answers with a
          jazz comping bed — <span className="text-violet-300/95">rootless voicings</span> and a{' '}
          <span className="text-violet-300/95">walking bass</span> that locks to the rhythm of your
          playing, not a fixed metronome.
        </p>
      </div>

      <div className="flex-1 mx-4 mb-3 rounded-xl overflow-hidden border border-border relative min-h-0">
        <canvas ref={canvasRef} className="w-full h-full block" />

        {!started && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#0a0a10]/85 backdrop-blur-sm">
            <div className="max-w-md text-center px-6">
              <p className="text-base text-muted-foreground leading-relaxed mb-6">
                A 12-bin <span className="text-violet-300">chroma</span> front end matches your chords
                against 36 templates (maj / min / dom7), waits a{' '}
                <span className="text-violet-300/95">160 ms settle</span> so the bed is anticipatory,
                then comps with jazz voicings and a walking bass{' '}
                <span className="text-violet-300/95">synced to your onsets</span>.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={startMic}
                  className="px-4 py-2.5 min-h-[44px] rounded-lg bg-violet-500/20 border border-violet-500/40 text-violet-300 text-base font-medium hover:bg-violet-500/30 transition-colors"
                >
                  Use microphone
                </button>
                <button
                  onClick={startDemo}
                  className="px-4 py-2.5 min-h-[44px] rounded-lg bg-muted border border-border text-muted-foreground text-base hover:bg-accent transition-colors"
                >
                  Run the demo
                </button>
              </div>
              {err && <p className="text-violet-300 text-base mt-4">{err}</p>}
            </div>
          </div>
        )}

        {started && (
          <div className="absolute top-3 left-4 right-4 flex items-start justify-between gap-3 pointer-events-none">
            <div className="text-base text-foreground font-mono">
              {chordText} <span className="text-muted-foreground">· {bpmText} BPM</span>
            </div>
            {demoMode && (
              <div className="text-violet-300 text-base pointer-events-auto">
                {err || 'Demo mode — mic unavailable. '}
                <button
                  onClick={startMic}
                  className="ml-1 underline decoration-dotted hover:text-violet-200"
                >
                  Use microphone
                </button>
              </div>
            )}
          </div>
        )}

        <div className="absolute bottom-4 right-4">
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="px-4 py-2.5 min-h-[44px] rounded-lg bg-muted border border-border text-muted-foreground text-base hover:bg-accent transition-colors"
          >
            {showNotes ? 'Hide' : 'Read the design notes'}
          </button>
        </div>

        {showNotes && (
          <div className="absolute bottom-20 right-4 max-w-sm rounded-xl bg-[#0a0a10]/95 border border-border p-4 text-base text-muted-foreground leading-relaxed">
            <p className="text-foreground font-medium mb-2 text-xl">Pipeline</p>
            <p>
              chroma → cosine-match 36 chord templates → 160 ms settle → rootless / drop-2 voicing
              with nearest-pitch voice leading → walking bass on the onset-inferred pulse. See{' '}
              <span className="font-mono text-violet-300">README.md</span> for the full voicing table
              and references (ReaLchords, Levine, Chris Wilson&apos;s two clocks).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
