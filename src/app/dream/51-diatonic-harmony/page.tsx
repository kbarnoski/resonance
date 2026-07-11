"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── music constants ────────────────────────────────────────────────────────────

const PC_NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"] as const;
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10] as const;

// Krumhansl-Kessler profiles — dot-product against normalized chroma detects tonal center
const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// ── piano roll layout ──────────────────────────────────────────────────────────

const MIDI_MIN = 36;  // C2
const MIDI_MAX = 96;  // C7 — extra headroom for fifth voice
const MIDI_RANGE = MIDI_MAX - MIDI_MIN;
const KEYS_W = 44;
const GRID_TOP = 28;
const GRID_BOT = 44;

// ── voice colors ───────────────────────────────────────────────────────────────

const COLOR_MELODY: [number, number, number] = [255, 160, 60];   // warm orange
const COLOR_THIRD:  [number, number, number] = [80, 200, 255];   // light blue
const COLOR_FIFTH:  [number, number, number] = [50, 90, 230];    // deep blue

// ── pitch detection (autocorrelation — same as 13-piano-canvas, 24-piano-roll) ─

function detectPitch(buf: Float32Array, sampleRate: number): number {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return 0;

  const ac = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += buf[i] * buf[i + lag];
    ac[lag] = s;
  }
  if (ac[0] === 0) return 0;

  const acn = new Float32Array(n);
  for (let i = 0; i < n; i++) acn[i] = ac[i] / ac[0];

  let minBin = 0;
  while (minBin < n - 1 && acn[minBin + 1] < acn[minBin]) minBin++;

  let maxVal = 0; let maxBin = minBin;
  for (let i = minBin; i < n; i++) {
    if (acn[i] > maxVal) { maxVal = acn[i]; maxBin = i; }
  }
  if (maxVal < 0.82) return 0;

  const y0 = acn[Math.max(0, maxBin - 1)];
  const y1 = acn[maxBin];
  const y2 = acn[Math.min(n - 1, maxBin + 1)];
  const denom = 2 * (2 * y1 - y0 - y2);
  const refined = denom !== 0 ? maxBin + (y0 - y2) / denom : maxBin;

  const freq = sampleRate / refined;
  if (freq < 24 || freq > 4500) return 0;
  return freq;
}

function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── key detection (Krumhansl-Kessler correlation) ─────────────────────────────

function detectKey(chroma: number[]): { root: number; mode: "major" | "minor" } {
  let best = -Infinity;
  let bestRoot = 0;
  let bestMode: "major" | "minor" = "major";
  for (let r = 0; r < 12; r++) {
    let majS = 0; let minS = 0;
    for (let i = 0; i < 12; i++) {
      majS += chroma[(i + r) % 12] * KK_MAJ[i];
      minS += chroma[(i + r) % 12] * KK_MIN[i];
    }
    if (majS > best) { best = majS; bestRoot = r; bestMode = "major"; }
    if (minS > best) { best = minS; bestRoot = r; bestMode = "minor"; }
  }
  return { root: bestRoot, mode: bestMode };
}

// ── diatonic voice computation ─────────────────────────────────────────────────

function computeDiatonicVoices(
  noteMidi: number,
  keyRoot: number,
  keyMode: "major" | "minor"
): { third: number; fifth: number } {
  const scale = keyMode === "major" ? MAJOR_SCALE : MINOR_SCALE;
  const pc = ((Math.round(noteMidi) - keyRoot) % 12 + 12) % 12;

  // Find nearest scale degree to this pitch class
  let closestDeg = 0; let closestDist = 12;
  for (let i = 0; i < 7; i++) {
    const d = Math.abs(scale[i] - pc);
    const wd = Math.min(d, 12 - d);
    if (wd < closestDist) { closestDist = wd; closestDeg = i; }
  }

  const notePc  = scale[closestDeg];
  const thirdPc = scale[(closestDeg + 2) % 7];
  const fifthPc = scale[(closestDeg + 4) % 7];

  // Semitone intervals going UP (wrap around octave boundary)
  let thirdInt = thirdPc - notePc; if (thirdInt <= 0) thirdInt += 12;
  let fifthInt  = fifthPc  - notePc; if (fifthInt  <= 0) fifthInt  += 12;

  return { third: Math.round(noteMidi) + thirdInt, fifth: Math.round(noteMidi) + fifthInt };
}

// ── demo: Bach BWV 772 (same fragment as 22-code-score, 24-piano-roll) ────────

function buildDemoNotes(bpm: number): { freq: number; duration: number }[] {
  const E = (60 / bpm) * 0.5;
  const Q = 60 / bpm;
  const H = (60 / bpm) * 2;
  const n = (name: string, oct: number, dur: number) => {
    const s: Record<string, number> = { C:0,"C#":1,D:2,"D#":3,E:4,F:5,"F#":6,G:7,"G#":8,A:9,"A#":10,B:11 };
    const midi = (oct + 1) * 12 + s[name];
    return { freq: 440 * Math.pow(2, (midi - 69) / 12), duration: dur };
  };
  return [
    n("C",4,E), n("D",4,E), n("E",4,E), n("F",4,E),
    n("G",4,E), n("A",4,E), n("B",4,E), n("C",5,E),
    n("D",5,E), n("B",4,E), n("C",5,E), n("D",5,E),
    n("G",4,E), n("D",5,E), n("C",5,E), n("B",4,E),
    n("A",4,E), n("G",4,E), n("A",4,E), n("B",4,E),
    n("C",5,E), n("B",4,E), n("A",4,E), n("G",4,E),
    n("F",4,E), n("G",4,E), n("A",4,E), n("G",4,E),
    n("F",4,E), n("E",4,E), n("D",4,E), n("C",4,E),
    n("E",4,Q), n("G",4,Q), n("C",4,H),
  ];
}

// ── types ──────────────────────────────────────────────────────────────────────

interface NoteBar {
  midi: number;
  startX: number;
  width: number;
  active: boolean;
  color: [number, number, number];
}

interface HarmonyVoices {
  gainThird: GainNode; gainFifth: GainNode;
  oscThird: OscillatorNode; oscFifth: OscillatorNode;
}

type Mode = "idle" | "mic" | "demo";

// ── component ──────────────────────────────────────────────────────────────────

export default function DiatonicHarmony() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef(0);

  // Audio
  const actxRef    = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef  = useRef<Float32Array | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);

  // Piano roll
  const notesRef        = useRef<NoteBar[]>([]);
  const activeNoteRef   = useRef<NoteBar | null>(null);
  const activeThirdRef  = useRef<NoteBar | null>(null);
  const activeFifthRef  = useRef<NoteBar | null>(null);
  const silenceFramesRef = useRef(0);
  const scrollXRef       = useRef(0);
  const lastFrameRef     = useRef(0);

  // Harmony audio
  const harmonyRef = useRef<HarmonyVoices | null>(null);

  // Key detection
  const chromaRef = useRef(new Float32Array(12));
  const keyRef    = useRef<{ root: number; mode: "major" | "minor" }>({ root: 0, mode: "major" });

  // Demo sequencer
  const demoTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoIdxRef     = useRef(0);
  const demoNotesRef   = useRef<{ freq: number; duration: number }[]>([]);
  const demoFreqRef    = useRef(0);
  const demoFreqEndRef = useRef(0);
  const lastDemoFreqRef = useRef(0);

  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [bpm, setBpm] = useState(72);
  const [keyLabel, setKeyLabel] = useState<string>("—");
  const bpmRef = useRef(72);
  useEffect(() => { bpmRef.current = bpm; }, [bpm]);

  // ── canvas resize ──────────────────────────────────────────────────────────

  const resizeCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width  = Math.round(window.innerWidth  * dpr);
    c.height = Math.round(window.innerHeight * dpr);
    c.style.width  = `${window.innerWidth}px`;
    c.style.height = `${window.innerHeight}px`;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // ── demo sequencer ─────────────────────────────────────────────────────────

  const scheduleDemoNote = useCallback((actx: AudioContext, analyser: AnalyserNode) => {
    const notes = demoNotesRef.current;
    const { freq, duration } = notes[demoIdxRef.current % notes.length];
    demoIdxRef.current++;

    // Melody plays audibly (soft triangle) AND into analyser for pitch detection
    const osc = actx.createOscillator();
    const g = actx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, actx.currentTime);
    g.gain.linearRampToValueAtTime(0.10, actx.currentTime + 0.02);
    g.gain.setValueAtTime(0.10, actx.currentTime + duration * 0.75);
    g.gain.linearRampToValueAtTime(0, actx.currentTime + duration);
    osc.connect(g);
    g.connect(analyser);
    g.connect(actx.destination);
    osc.start(actx.currentTime);
    osc.stop(actx.currentTime + duration + 0.05);

    demoFreqRef.current = freq;
    demoFreqEndRef.current = actx.currentTime + duration;

    demoTimerRef.current = setTimeout(
      () => scheduleDemoNote(actx, analyser),
      duration * 1000 + 40
    );
  }, []);

  // ── start mic ──────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      actxRef.current = actx;
      const analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      actx.createMediaStreamSource(stream).connect(analyser);
      setMode("mic");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mic unavailable. Check permissions.");
    }
  }, []);

  // ── start demo ─────────────────────────────────────────────────────────────

  const startDemo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    actxRef.current = actx;
    const analyser = actx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0;
    analyserRef.current = analyser;
    timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
    demoNotesRef.current = buildDemoNotes(bpmRef.current);
    demoIdxRef.current = 0;
    // Pre-seed key — BWV 772 is in C major
    keyRef.current = { root: 0, mode: "major" };
    setKeyLabel("C major");
    scheduleDemoNote(actx, analyser);
    setMode("demo");
    setError(null);
  }, [scheduleDemoNote]);

  // ── stop ───────────────────────────────────────────────────────────────────

  const stop = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
    const h = harmonyRef.current;
    if (h) {
      try { h.oscThird.stop(); h.oscFifth.stop(); } catch { /* already stopped */ }
      harmonyRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    void actxRef.current?.close();
    actxRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    notesRef.current = [];
    activeNoteRef.current = null;
    activeThirdRef.current = null;
    activeFifthRef.current = null;
    silenceFramesRef.current = 0;
    scrollXRef.current = 0;
    demoFreqRef.current = 0;
    lastDemoFreqRef.current = 0;
    chromaRef.current.fill(0);
    setKeyLabel("—");
    setMode("idle");
  }, []);

  // ── main render loop ───────────────────────────────────────────────────────

  useEffect(() => {
    if (mode === "idle") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
    const W = () => canvas.width / dpr();
    const H = () => canvas.height / dpr();

    // ── inline harmony control ─────────────────────────────────────────────

    const stopHarmony = () => {
      const h = harmonyRef.current;
      const actx = actxRef.current;
      if (!h || !actx) return;
      const t = actx.currentTime;
      for (const gn of [h.gainThird, h.gainFifth]) {
        gn.gain.cancelScheduledValues(t);
        gn.gain.setValueAtTime(gn.gain.value, t);
        gn.gain.linearRampToValueAtTime(0, t + 0.4);
      }
      h.oscThird.stop(t + 0.45);
      h.oscFifth.stop(t + 0.45);
      harmonyRef.current = null;
    };

    const startHarmony = (thirdMidi: number, fifthMidi: number) => {
      const actx = actxRef.current;
      if (!actx) return;
      stopHarmony();
      const spawnVoice = (midi: number, pan: number) => {
        const osc = actx.createOscillator();
        const gn  = actx.createGain();
        const sp  = actx.createStereoPanner();
        osc.type = "sine";
        osc.frequency.value = midiToFreq(midi);
        gn.gain.setValueAtTime(0, actx.currentTime);
        gn.gain.linearRampToValueAtTime(0.32, actx.currentTime + 0.15);
        sp.pan.value = pan;
        osc.connect(gn); gn.connect(sp); sp.connect(actx.destination);
        osc.start(actx.currentTime);
        return { osc, gn };
      };
      const tv = spawnVoice(thirdMidi, -0.28);
      const fv = spawnVoice(fifthMidi,  0.28);
      harmonyRef.current = { gainThird: tv.gn, gainFifth: fv.gn, oscThird: tv.osc, oscFifth: fv.osc };
    };

    // ── inline key update ──────────────────────────────────────────────────

    const updateKey = (pc: number) => {
      chromaRef.current[pc] += 1;
      const total = chromaRef.current.reduce((a, v) => a + v, 0);
      if (total < 3) return;
      const norm = Array.from(chromaRef.current, v => v / total);
      const k = detectKey(norm);
      keyRef.current = k;
      setKeyLabel(`${PC_NAMES[k.root]} ${k.mode}`);
    };

    // ── render ─────────────────────────────────────────────────────────────

    const SILENCE_GATE = 10;
    let lastHudUpdate = 0;

    const render = (now: number) => {
      animRef.current = requestAnimationFrame(render);
      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      if (!analyser || !buf) return;

      const w = W(); const h = H();
      const gridH = h - GRID_TOP - GRID_BOT;
      const rowH  = gridH / MIDI_RANGE;
      const dt = lastFrameRef.current > 0
        ? Math.min((now - lastFrameRef.current) / 1000, 0.1) : 0;
      lastFrameRef.current = now;

      const pxPerSec = (bpmRef.current / 60) * 80;
      scrollXRef.current += pxPerSec * dt;
      const scroll = scrollXRef.current;

      // Pitch detection
      analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
      let freq = 0;
      if (mode === "demo" && actxRef.current) {
        freq = actxRef.current.currentTime < demoFreqEndRef.current ? demoFreqRef.current : 0;
      } else {
        freq = detectPitch(buf, analyser.context.sampleRate);
      }

      const midi = freq > 0 ? freqToMidi(freq) : 0;

      // ── note onset tracking ───────────────────────────────────────────────

      if (freq > 0 && midi >= MIDI_MIN - 0.5 && midi <= MIDI_MAX + 0.5) {
        silenceFramesRef.current = 0;
        const clampedMidi = Math.max(MIDI_MIN, Math.min(MIDI_MAX, midi));

        // Detect new note onset
        const isNewNote = mode === "demo"
          ? demoFreqRef.current !== lastDemoFreqRef.current
          : !activeNoteRef.current || Math.abs(clampedMidi - activeNoteRef.current.midi) > 1.5;

        if (isNewNote) {
          // Close prior bars
          if (activeNoteRef.current) {
            activeNoteRef.current.active = false;
            if (activeThirdRef.current) activeThirdRef.current.active = false;
            if (activeFifthRef.current) activeFifthRef.current.active = false;
          }

          if (mode === "demo") lastDemoFreqRef.current = demoFreqRef.current;

          // Update key chroma (mic mode only — demo key is pre-seeded)
          if (mode === "mic") {
            const pc = ((Math.round(clampedMidi) % 12) + 12) % 12;
            updateKey(pc);
          }

          // Compute diatonic voices
          const key = keyRef.current;
          const voices = computeDiatonicVoices(clampedMidi, key.root, key.mode);
          const thirdMidi = Math.max(MIDI_MIN, Math.min(MIDI_MAX, voices.third));
          const fifthMidi  = Math.max(MIDI_MIN, Math.min(MIDI_MAX, voices.fifth));

          // Spawn harmony audio
          startHarmony(thirdMidi, fifthMidi);

          // Spawn note bars
          const mkBar = (m: number, color: [number,number,number]): NoteBar =>
            ({ midi: m, startX: scroll, width: 0, active: true, color });
          activeNoteRef.current  = mkBar(clampedMidi, COLOR_MELODY);
          activeThirdRef.current = mkBar(thirdMidi,   COLOR_THIRD);
          activeFifthRef.current  = mkBar(fifthMidi,   COLOR_FIFTH);
          notesRef.current.push(
            activeNoteRef.current,
            activeThirdRef.current,
            activeFifthRef.current,
          );
        } else {
          // Extend current bars
          if (activeNoteRef.current) {
            activeNoteRef.current.width += pxPerSec * dt;
            activeNoteRef.current.midi   = clampedMidi;
          }
          if (activeThirdRef.current) activeThirdRef.current.width += pxPerSec * dt;
          if (activeFifthRef.current)  activeFifthRef.current.width  += pxPerSec * dt;
        }
      } else {
        silenceFramesRef.current++;
        if (silenceFramesRef.current >= SILENCE_GATE && activeNoteRef.current) {
          activeNoteRef.current.active = false;
          if (activeThirdRef.current) activeThirdRef.current.active = false;
          if (activeFifthRef.current)  activeFifthRef.current.active  = false;
          activeNoteRef.current  = null;
          activeThirdRef.current = null;
          activeFifthRef.current  = null;
          stopHarmony();
        }
      }

      // Prune bars that have scrolled off-screen
      const notes = notesRef.current;
      let pi = 0;
      while (pi < notes.length) {
        if ((notes[pi].startX + notes[pi].width) - scroll + (w - KEYS_W) < -200) pi++;
        else break;
      }
      if (pi > 0) notes.splice(0, pi);

      // ── draw ──────────────────────────────────────────────────────────────

      ctx.fillStyle = "#050508";
      ctx.fillRect(0, 0, w, h);

      // Horizontal pitch lines
      ctx.save();
      for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
        const y = GRID_TOP + gridH - (m - MIDI_MIN) * rowH;
        if (m % 12 === 0) {
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(KEYS_W, y); ctx.lineTo(w, y); ctx.stroke();
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.font = "9px monospace";
          ctx.textAlign = "right";
          ctx.fillText(`C${Math.floor(m / 12) - 1}`, KEYS_W - 4, y + 3);
        } else if (m % 12 === 5 || m % 12 === 7) {
          // F and G lines slightly visible as reference
          ctx.strokeStyle = "rgba(255,255,255,0.05)";
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(KEYS_W, y); ctx.lineTo(w, y); ctx.stroke();
        }
      }
      ctx.restore();

      // Vertical beat lines
      const pxPerBeat = (bpmRef.current / 60) * 80;
      const firstBeat = Math.floor(scroll / pxPerBeat) * pxPerBeat;
      ctx.save();
      for (let bx = firstBeat; bx < scroll + w; bx += pxPerBeat) {
        const sx = KEYS_W + (bx - scroll);
        if (sx < KEYS_W) continue;
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(sx, GRID_TOP); ctx.lineTo(sx, h - GRID_BOT); ctx.stroke();
      }
      ctx.restore();

      // Note bars
      ctx.save();
      ctx.beginPath(); ctx.rect(KEYS_W, GRID_TOP, w - KEYS_W, gridH); ctx.clip();
      ctx.globalCompositeOperation = "lighter";

      for (const nb of notes) {
        const barX = KEYS_W + (nb.startX - scroll);
        const barW = nb.width;
        if (barX + barW < KEYS_W || barX > w) continue;
        const barY = GRID_TOP + gridH - (nb.midi - MIDI_MIN) * rowH - rowH * 0.85;
        const barH = rowH * 0.78;
        const [r, g2, b] = nb.color;

        ctx.fillStyle = `rgba(${r},${g2},${b},0.32)`;
        ctx.shadowColor = `rgb(${r},${g2},${b})`;
        ctx.shadowBlur  = nb.active ? 12 : 5;
        ctx.beginPath();
        ctx.roundRect(barX, barY, Math.max(2, barW), barH, 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${r},${g2},${b},0.62)`;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.roundRect(barX + 1, barY + 1, Math.max(1, barW - 2), barH - 2, 1);
        ctx.fill();

        if (nb.active) {
          ctx.fillStyle = `rgba(255,255,255,0.85)`;
          ctx.shadowColor = `rgb(${r},${g2},${b})`;
          ctx.shadowBlur = 14;
          ctx.fillRect(barX + barW - 2, barY, 2, barH);
        }
      }
      ctx.restore();

      // Cursor line
      const cursorX = w - 200;
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.moveTo(cursorX, GRID_TOP); ctx.lineTo(cursorX, h - GRID_BOT); ctx.stroke();
      ctx.restore();

      // Piano keys sidebar
      drawPianoKeys(ctx, KEYS_W, GRID_TOP, gridH, rowH, midi);

      // Bottom bar: BPM + voice legend
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(KEYS_W, h - GRID_BOT, w - KEYS_W, GRID_BOT);
      ctx.fillStyle = "rgba(255,255,255,0.20)";
      ctx.font = "9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${bpmRef.current} BPM`, KEYS_W + 8, h - GRID_BOT + 17);

      const lx = (w + KEYS_W) / 2;
      ctx.textAlign = "center";
      const [mr, mg, mb] = COLOR_MELODY;
      ctx.fillStyle = `rgba(${mr},${mg},${mb},0.9)`;
      ctx.fillText("■ melody", lx - 110, h - GRID_BOT + 17);
      const [tr, tg, tb] = COLOR_THIRD;
      ctx.fillStyle = `rgba(${tr},${tg},${tb},0.9)`;
      ctx.fillText("■ 3rd", lx, h - GRID_BOT + 17);
      const [fr, fg, fb] = COLOR_FIFTH;
      ctx.fillStyle = `rgba(${fr},${fg},${fb},0.9)`;
      ctx.fillText("■ 5th", lx + 70, h - GRID_BOT + 17);

      // Unused variable guard
      void lastHudUpdate;
      lastHudUpdate = now;
    };

    lastFrameRef.current = 0;
    animRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animRef.current);
      stopHarmony();
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#050508" }}
      />

      {/* ── Idle screen ── */}
      {mode === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-2xl md:text-3xl mb-3 tracking-tight">Diatonic Harmony</h1>
          <p className="text-sm text-muted-foreground max-w-md mb-2 leading-relaxed">
            Play a melody — the key is detected from what you play, and diatonic
            third and fifth voices float alongside each note.
          </p>
          <p className="text-xs text-muted-foreground/70 mb-8">
            Demo plays Bach Invention No.1 with auto-generated harmonies. Hear how
            different scale degrees produce different interval qualities.
          </p>

          <div className="flex items-center gap-3 mb-6">
            <label className="text-xs text-muted-foreground/70 uppercase tracking-wider">BPM</label>
            <input
              type="range" min={40} max={160} value={bpm}
              onChange={e => setBpm(Number(e.target.value))}
              className="w-32 accent-primary"
            />
            <span className="text-xs text-muted-foreground font-mono w-6">{bpm}</span>
          </div>

          <div className="flex gap-4">
            <button
              onClick={startMic}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition"
            >
              Start mic
            </button>
            <button
              onClick={startDemo}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-border rounded hover:bg-accent hover:border-border transition text-muted-foreground"
            >
              Demo mode
            </button>
          </div>

          {error && (
            <p className="mt-4 text-xs text-violet-300/80 max-w-sm">{error}</p>
          )}

          <Link
            href="/dream"
            className="mt-12 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
          >
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {/* ── Running HUD ── */}
      {mode !== "idle" && (
        <>
          {/* Key detection label */}
          <div className="absolute top-4 right-4 text-right pointer-events-none">
            <div className="text-[9px] text-muted-foreground/70 uppercase tracking-widest mb-0.5">
              detected key
            </div>
            <div className="text-sm text-foreground font-mono">{keyLabel}</div>
          </div>

          {/* Mode indicator */}
          <div className="absolute top-4 left-14 text-[10px] tracking-widest text-muted-foreground/70 pointer-events-none">
            {mode}
          </div>

          {/* Controls */}
          <div className="absolute bottom-[52px] right-4 flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">BPM</label>
              <input
                type="range" min={40} max={160} value={bpm}
                onChange={e => setBpm(Number(e.target.value))}
                className="w-20 accent-primary"
              />
              <span className="text-[10px] text-muted-foreground font-mono w-6">{bpm}</span>
            </div>
            <button
              onClick={stop}
              className="text-[10px] tracking-wider uppercase text-muted-foreground/70 hover:text-muted-foreground border border-border hover:border-border px-3 py-1 rounded transition"
            >
              stop
            </button>
            <Link href="/dream" className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground">
              ← back
            </Link>
          </div>

          <a
            href="/dream/51-diatonic-harmony/readme"
            className="absolute bottom-[52px] left-14 text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition"
          >
            design notes ↗
          </a>
        </>
      )}
    </div>
  );
}

// ── piano key sidebar (same as 24-piano-roll) ─────────────────────────────────

function drawPianoKeys(
  ctx: CanvasRenderingContext2D,
  keysW: number,
  gridTop: number,
  gridH: number,
  rowH: number,
  activeMidi: number
) {
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

  ctx.save();
  ctx.fillStyle = "#0a0a12";
  ctx.fillRect(0, gridTop, keysW, gridH);

  for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
    const semi = ((m % 12) + 12) % 12;
    const isBlack  = BLACK_KEYS.has(semi);
    const y = gridTop + gridH - (m - MIDI_MIN) * rowH - rowH;
    const isActive = Math.abs(m - activeMidi) < 0.6;

    if (isBlack) {
      ctx.fillStyle = isActive ? `hsl(${(m * 13) % 360},80%,45%)` : "#1a1a22";
      ctx.fillRect(2, y + 1, keysW - 10, rowH - 1);
    } else {
      ctx.fillStyle = isActive ? `hsl(${(m * 13) % 360},70%,70%)` : "#e8e8f0";
      ctx.fillRect(2, y + 0.5, keysW - 4, rowH - 1);
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(keysW, gridTop);
  ctx.lineTo(keysW, gridTop + gridH);
  ctx.stroke();

  ctx.restore();
}
