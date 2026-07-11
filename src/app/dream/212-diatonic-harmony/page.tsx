"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── constants ─────────────────────────────────────────────────────────────────
const SCROLL_PX_S = 80;
const MIDI_LO     = 36;   // C2
const MIDI_HI     = 96;   // C7
const MIDI_RANGE  = MIDI_HI - MIDI_LO;

// ── scale tables ──────────────────────────────────────────────────────────────
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// Krumhansl-Kessler tonal hierarchy profiles for key detection
const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const PC_NAMES = ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];

// ── types ─────────────────────────────────────────────────────────────────────
type KeyInfo  = { rootPc: number; mode: "major" | "minor" };
type HarmNote = { midi: number; third: number; fifth: number; startMs: number; endMs: number | null };

type St = {
  actx:     AudioContext | null;
  analyser: AnalyserNode | null;
  dryGain:  GainNode | null;
  revGain:  GainNode | null;
  notes:    HarmNote[];
  chroma:   number[];
  key:      KeyInfo | null;
  prevMidi: number;
  prevCnt:  number;
};

function initSt(): St {
  return {
    actx: null, analyser: null, dryGain: null, revGain: null,
    notes: [], chroma: Array(12).fill(0) as number[],
    key: null, prevMidi: -1, prevCnt: 0,
  };
}

// ── pitch detection ───────────────────────────────────────────────────────────
function detectPitch(buf: Float32Array, sr: number): number {
  const N = buf.length, H = N >> 1;
  let rms = 0;
  for (let i = 0; i < N; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / N) < 0.015) return -1;
  let best = -1, bCorr = 0, lastC = 1;
  for (let off = 1; off < H; off++) {
    let c = 0;
    for (let i = 0; i < H; i++) c += Math.abs(buf[i] - buf[i + off]);
    c = 1 - c / H;
    if (c > 0.9 && c > lastC) { bCorr = c; best = off; break; }
    lastC = c;
  }
  if (bCorr < 0.9 || best < 1) return -1;
  return sr / best;
}

function hzToMidi(hz: number): number { return Math.round(69 + 12 * Math.log2(hz / 440)); }
function midiToHz(m: number): number   { return 440 * Math.pow(2, (m - 69) / 12); }

// ── key detection (Krumhansl-Kessler dot-product) ────────────────────────────
function detectKey(chroma: number[]): KeyInfo | null {
  const total = chroma.reduce((a, b) => a + b, 0);
  if (total < 4) return null;
  let best = -Infinity, rootPc = 0, mode: "major" | "minor" = "major";
  for (let r = 0; r < 12; r++) {
    let s = 0;
    for (let i = 0; i < 12; i++) s += (chroma[(i + r) % 12] / total) * KK_MAJ[i];
    if (s > best) { best = s; rootPc = r; mode = "major"; }
    s = 0;
    for (let i = 0; i < 12; i++) s += (chroma[(i + r) % 12] / total) * KK_MIN[i];
    if (s > best) { best = s; rootPc = r; mode = "minor"; }
  }
  return { rootPc, mode };
}

// ── diatonic voice (nth scale step above a MIDI note in a given key) ─────────
function diatonicVoice(midi: number, rootPc: number, mode: "major" | "minor", stepsUp: number): number {
  const scale  = mode === "major" ? MAJOR : MINOR;
  const semOff = ((midi - rootPc) % 12 + 12) % 12;
  let deg = 0, minDist = 12;
  for (let d = 0; d < scale.length; d++) {
    const dist = Math.min(Math.abs(scale[d] - semOff), 12 - Math.abs(scale[d] - semOff));
    if (dist < minDist) { minDist = dist; deg = d; }
  }
  const baseOct = Math.round((midi - rootPc - scale[deg]) / 12);
  const newDeg  = deg + stepsUp;
  const addOct  = Math.floor(newDeg / scale.length);
  let result    = rootPc + (baseOct + addOct) * 12 + scale[newDeg % scale.length];
  if (result > MIDI_HI) result -= 12;
  if (result < MIDI_LO) result += 12;
  return result;
}

// ── audio helpers ─────────────────────────────────────────────────────────────
function playTone(
  ctx: AudioContext, dest: GainNode,
  midi: number, gainVal: number, decayS: number, pan: number,
): void {
  const hz = midiToHz(midi);
  const t  = ctx.currentTime;
  const g  = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(gainVal, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decayS);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  g.connect(p).connect(dest);
  [1, 2, 3].forEach((n, i) => {
    const o = ctx.createOscillator(); const og = ctx.createGain();
    o.type = "sine"; o.frequency.value = hz * n;
    og.gain.value = ([1, 0.28, 0.09] as number[])[i];
    o.connect(og).connect(g); o.start(t); o.stop(t + decayS + 0.05);
  });
}

function makeReverb(ctx: AudioContext): ConvolverNode {
  const len = Math.ceil(ctx.sampleRate * 0.85);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const cv = ctx.createConvolver(); cv.buffer = buf; return cv;
}

// ── note helpers (operate on St directly) ────────────────────────────────────
function fireNote(st: St, midi: number, onKey: (k: string) => void): void {
  if (!st.actx || !st.dryGain || !st.revGain) return;
  st.chroma[midi % 12]++;
  const key = detectKey(st.chroma);
  if (key) { st.key = key; onKey(`${PC_NAMES[key.rootPc]} ${key.mode}`); }
  const rootPc = st.key?.rootPc ?? 0;
  const mode   = st.key?.mode   ?? "major";
  const third  = diatonicVoice(midi, rootPc, mode, 2);
  const fifth  = diatonicVoice(midi, rootPc, mode, 4);
  playTone(st.actx, st.dryGain, midi,  0.35, 0.85,  0.00);
  playTone(st.actx, st.dryGain, third, 0.22, 0.85,  0.28);
  playTone(st.actx, st.dryGain, fifth, 0.22, 0.85, -0.28);
  playTone(st.actx, st.revGain, midi,  0.14, 0.85,  0.00);
  playTone(st.actx, st.revGain, third, 0.10, 0.85,  0.28);
  playTone(st.actx, st.revGain, fifth, 0.10, 0.85, -0.28);
  st.notes.push({ midi, third, fifth, startMs: performance.now(), endMs: null });
}

function closeNote(st: St): void {
  const nowMs = performance.now();
  for (let i = st.notes.length - 1; i >= 0; i--) {
    if (st.notes[i].endMs === null) { st.notes[i].endMs = nowMs; break; }
  }
}

// ── component ─────────────────────────────────────────────────────────────────
export default function DiatonicHarmonyPage() {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const stRef  = useRef<St>(initSt());

  const [started,  setStarted]  = useState(false);
  const [keyLabel, setKeyLabel] = useState("detecting…");

  // ── boot ──────────────────────────────────────────────────────────────────────
  async function boot(): Promise<void> {
    let stream: MediaStream | null = null;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { /* demo mode */ }

    const ctx      = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    const reverb   = makeReverb(ctx);
    const dryGain  = ctx.createGain(); dryGain.gain.value = 0.65;
    const revGain  = ctx.createGain(); revGain.gain.value = 0.35;
    reverb.connect(ctx.destination);
    revGain.connect(reverb);
    dryGain.connect(ctx.destination);
    if (stream) ctx.createMediaStreamSource(stream).connect(analyser);

    const st = stRef.current;
    st.actx = ctx; st.analyser = analyser;
    st.dryGain = dryGain; st.revGain = revGain;
    setStarted(true);

    if (!stream) {
      // demo: ascending + descending C major scale
      const demo = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60];
      demo.forEach((midi, i) => {
        setTimeout(() => {
          closeNote(stRef.current);
          fireNote(stRef.current, midi, setKeyLabel);
        }, i * 610);
        setTimeout(() => { closeNote(stRef.current); }, i * 610 + 550);
      });
    }
  }

  // ── pitch poll ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const buf = new Float32Array(2048);
    const id = setInterval(() => {
      const sx = stRef.current;
      if (!sx.analyser || !sx.actx) return;
      sx.analyser.getFloatTimeDomainData(buf);
      const hz = detectPitch(buf, sx.actx.sampleRate);
      if (hz > 60 && hz < 2100) {
        const midi = hzToMidi(hz);
        if (midi >= MIDI_LO && midi <= MIDI_HI) {
          if (midi === sx.prevMidi) { sx.prevCnt++; }
          else { closeNote(sx); sx.prevMidi = midi; sx.prevCnt = 1; }
          if (sx.prevCnt === 2) {
            let alreadyOpen = false;
            for (let i = sx.notes.length - 1; i >= 0; i--) {
              if (sx.notes[i].endMs === null) { alreadyOpen = sx.notes[i].midi === midi; break; }
            }
            if (!alreadyOpen) fireNote(sx, midi, setKeyLabel);
          }
          return;
        }
      }
      if (sx.prevMidi > 0) { closeNote(sx); sx.prevMidi = -1; sx.prevCnt = 0; }
    }, 50);
    return () => clearInterval(id);
  }, [started]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── draw loop ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const cv = cvRef.current;
    if (!cv) return;
    const gc = cv.getContext("2d");
    if (!gc) return;
    let w = 0, h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      w = cv.offsetWidth; h = cv.offsetHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      gc.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    function drawLane(
      g2: CanvasRenderingContext2D,
      yOff: number, laneH: number,
      field: "midi" | "third" | "fifth",
      rgb: string, label: string,
      nowMs: number,
    ) {
      // octave reference lines
      for (let m = MIDI_LO; m <= MIDI_HI; m += 12) {
        const y = yOff + laneH - ((m - MIDI_LO) / MIDI_RANGE) * laneH;
        g2.beginPath(); g2.moveTo(0, y); g2.lineTo(w, y);
        g2.strokeStyle = "rgba(255,255,255,0.05)"; g2.lineWidth = 0.5; g2.stroke();
        g2.fillStyle = "rgba(255,255,255,0.14)";
        g2.font = "9px monospace"; g2.textAlign = "left"; g2.textBaseline = "middle";
        g2.fillText(`C${Math.floor(m / 12) - 1}`, 4, y);
      }
      // lane label
      g2.fillStyle = `rgba(${rgb},0.85)`;
      g2.font = "bold 11px monospace"; g2.textAlign = "right"; g2.textBaseline = "top";
      g2.fillText(label, w - 8, yOff + 5);
      // notes
      const semH = Math.max(4, (laneH / MIDI_RANGE) * 0.9);
      for (const note of stRef.current.notes) {
        const mval = field === "midi" ? note.midi : field === "third" ? note.third : note.fifth;
        const endMs = note.endMs ?? nowMs;
        const noteW = Math.max(8, ((endMs - note.startMs) / 1000) * SCROLL_PX_S);
        const noteX = w - ((nowMs - note.startMs) / 1000) * SCROLL_PX_S;
        if (noteX + noteW < 0) continue;
        const noteY = yOff + laneH - ((mval - MIDI_LO) / MIDI_RANGE) * laneH;
        const live  = note.endMs === null;
        g2.shadowColor = `rgba(${rgb},0.9)`; g2.shadowBlur = live ? 10 : 4;
        g2.fillStyle   = live ? `rgba(${rgb},0.95)` : `rgba(${rgb},0.55)`;
        g2.fillRect(noteX, noteY - semH / 2, noteW, semH);
        g2.shadowBlur = 0;
      }
    }

    const frame = () => {
      if (!cv) { rafRef.current = requestAnimationFrame(frame); return; }
      gc.clearRect(0, 0, w, h);
      gc.fillStyle = "#020208"; gc.fillRect(0, 0, w, h);
      const lH    = Math.floor(h / 3);
      const nowMs = performance.now();

      // prune notes that have scrolled off screen
      stRef.current.notes = stRef.current.notes.filter(n => {
        const eMs  = n.endMs ?? nowMs;
        const x0   = w - ((nowMs - n.startMs) / 1000) * SCROLL_PX_S;
        const nw   = Math.max(8, ((eMs - n.startMs) / 1000) * SCROLL_PX_S);
        return x0 + nw > -20;
      });

      drawLane(gc, 0,      lH, "third", "186 230 253", "THIRD  ▲3", nowMs);
      gc.beginPath(); gc.moveTo(0, lH); gc.lineTo(w, lH);
      gc.strokeStyle = "rgba(255,255,255,0.08)"; gc.lineWidth = 1; gc.stroke();

      drawLane(gc, lH,     lH, "midi",  "251 146 60",  "YOU",       nowMs);
      gc.beginPath(); gc.moveTo(0, lH * 2); gc.lineTo(w, lH * 2);
      gc.strokeStyle = "rgba(255,255,255,0.08)"; gc.lineWidth = 1; gc.stroke();

      drawLane(gc, lH * 2, lH, "fifth", "147 197 253", "FIFTH  ▲7", nowMs);

      // "now" cursor line
      gc.beginPath(); gc.moveTo(w - 2, 0); gc.lineTo(w - 2, h);
      gc.strokeStyle = "rgba(255,255,255,0.18)"; gc.lineWidth = 1.5; gc.stroke();

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(rafRef.current); window.removeEventListener("resize", resize); };
  }, [started]);

  // ── cleanup ───────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    stRef.current.actx?.close().catch((err) => { void err; });
  }, []);

  return (
    <div className="fixed inset-0 bg-black text-foreground flex flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <h1 className="text-base font-semibold text-foreground">Diatonic Harmony</h1>
        <p className="text-xs text-muted-foreground font-mono">scale-correct voices · cycle 245</p>
      </div>

      {!started ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-muted-foreground text-base max-w-sm leading-relaxed">
            Play piano into the mic. Every note you play is joined in real time by its
            diatonic third and fifth — scale-correct companion voices that adapt to
            your key as you play.
          </p>
          <button
            onClick={() => { void boot(); }}
            className="px-8 py-3 rounded-full bg-violet-600 hover:bg-violet-500 active:scale-95 text-foreground text-base font-medium min-h-[44px] min-w-[44px] transition-all"
          >
            Start mic
          </button>
          <p className="text-muted-foreground/70 text-xs">
            No mic? Click anyway — demo plays a C major scale.
          </p>
        </div>
      ) : (
        <>
          <canvas ref={cvRef} className="flex-1 w-full" />
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-border">
            <span className="text-sm font-mono text-muted-foreground">key: {keyLabel}</span>
            <span className="text-xs font-mono text-muted-foreground">
              <span className="text-violet-200/75">■</span> third ▲3 &nbsp;
              <span className="text-violet-400/90">■</span> you &nbsp;
              <span className="text-violet-300/75">■</span> fifth ▲7
            </span>
          </div>
        </>
      )}

      <div className="absolute bottom-16 right-4 z-10">
        <Link
          href="/dream"
          className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          ← dream lab
        </Link>
      </div>
      <div className="absolute bottom-16 left-4 z-10">
        <Link
          href="/dream/212-diatonic-harmony/README.md"
          className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          design notes
        </Link>
      </div>
    </div>
  );
}
