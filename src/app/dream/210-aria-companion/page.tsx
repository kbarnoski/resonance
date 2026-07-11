"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ── constants ────────────────────────────────────────────────────────────────

const SCROLL_PX_PER_SEC = 80;
const STEP_MS           = 375;   // 8th note at 80 BPM
const RESPONSE_STEPS    = 8;
const SILENCE_MS        = 1500;
const MIN_NOTES         = 3;
const MIDI_LO           = 36;    // C2
const MIDI_HI           = 96;    // C7
const MIDI_RANGE        = MIDI_HI - MIDI_LO;

// ── types ────────────────────────────────────────────────────────────────────

type NoteEvent = { midi: number; startMs: number; endMs: number | null; lane: "user" | "aria" };
type MarkovRow = Map<number, number>;
type MarkovTable = Map<number, MarkovRow>;

type St = {
  actx:       AudioContext | null;
  analyser:   AnalyserNode | null;
  reverbGain: GainNode | null;
  dryGain:    GainNode | null;
  notes:      NoteEvent[];
  captured:   number[];
  markov:     MarkovTable;
  lastNote:   number;
  prevMidi:   number;
  prevCount:  number;
  phase:      "listening" | "thinking" | "responding";
  silTimer:   ReturnType<typeof setTimeout> | null;
  respTimer:  ReturnType<typeof setTimeout> | null;
  scheduled:  boolean;
};

function initSt(): St {
  return {
    actx: null, analyser: null, reverbGain: null, dryGain: null,
    notes: [], captured: [], markov: new Map(),
    lastNote: -1, prevMidi: -1, prevCount: 0,
    phase: "listening", silTimer: null, respTimer: null, scheduled: false,
  };
}

// ── pitch detection (autocorrelation) ────────────────────────────────────────

function detectPitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  const HALF = Math.floor(SIZE / 2);
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  if (Math.sqrt(rms / SIZE) < 0.015) return -1;
  let bestOff = -1, bestCorr = 0, lastCorr = 1;
  for (let off = 1; off < HALF; off++) {
    let corr = 0;
    for (let i = 0; i < HALF; i++) corr += Math.abs(buf[i] - buf[i + off]);
    corr = 1 - corr / HALF;
    if (corr > 0.9 && corr > lastCorr) { bestCorr = corr; bestOff = off; break; }
    lastCorr = corr;
  }
  if (bestCorr < 0.9 || bestOff < 1) return -1;
  return sampleRate / bestOff;
}

function hzToMidi(hz: number): number { return Math.round(69 + 12 * Math.log2(hz / 440)); }
function midiToHz(midi: number): number { return 440 * Math.pow(2, (midi - 69) / 12); }

// ── audio helpers ────────────────────────────────────────────────────────────

function playNote(ctx: AudioContext, dest: GainNode, midi: number, gainVal: number, decayS: number): void {
  const hz = midiToHz(midi);
  const t  = ctx.currentTime;
  const g  = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(gainVal, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decayS);
  g.connect(dest);
  [1, 2, 3].forEach((n, i) => {
    const o  = ctx.createOscillator();
    const og = ctx.createGain();
    o.type           = "sine";
    o.frequency.value = hz * n;
    og.gain.value    = [1, 0.28, 0.09][i];
    o.connect(og).connect(g);
    o.start(t); o.stop(t + decayS + 0.05);
  });
}

function makeReverb(ctx: AudioContext): ConvolverNode {
  const rate = ctx.sampleRate;
  const len  = Math.ceil(rate * 0.9);
  const buf  = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.5);
  }
  const cv = ctx.createConvolver();
  cv.buffer = buf;
  return cv;
}

// ── Markov chain ─────────────────────────────────────────────────────────────

function addTransition(markov: MarkovTable, from: number, to: number): void {
  if (!markov.has(from)) markov.set(from, new Map());
  const row = markov.get(from)!;
  row.set(to, (row.get(to) ?? 0) + 1);
}

function nextNote(markov: MarkovTable, from: number): number {
  const row = markov.get(from);
  if (!row || row.size === 0) {
    const offs = [0, 2, 4, 7, 9, 12];
    return from + offs[Math.floor(Math.random() * offs.length)];
  }
  const total = Array.from(row.values()).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [note, cnt] of row) { r -= cnt; if (r <= 0) return note; }
  return from;
}

function buildResponse(markov: MarkovTable, captured: number[]): number[] {
  const start = captured[Math.floor(Math.random() * captured.length)];
  const resp  = [start];
  let cur     = start;
  for (let i = 1; i < RESPONSE_STEPS; i++) {
    cur = Math.max(MIDI_LO, Math.min(MIDI_HI, nextNote(markov, cur)));
    resp.push(cur);
  }
  return resp;
}

// ── last-open-note helper ────────────────────────────────────────────────────

function closeLastUserNote(notes: NoteEvent[]): void {
  const nowMs = performance.now();
  for (let i = notes.length - 1; i >= 0; i--) {
    if (notes[i].lane === "user" && notes[i].endMs === null) {
      notes[i].endMs = nowMs;
      break;
    }
  }
}

// ── component ────────────────────────────────────────────────────────────────

export default function AriaCompanionPage() {
  const cvRef  = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const stRef  = useRef<St>(initSt());

  const [started, setStarted] = useState(false);
  const [status,  setStatus]  = useState("listening…");
  const [count,   setCount]   = useState(0);

  // ── schedule Aria's response ────────────────────────────────────────────────
  function scheduleResponse(st: St): void {
    if (st.scheduled || st.captured.length < MIN_NOTES) return;
    st.scheduled = true;
    st.phase = "thinking";
    setStatus("Aria is thinking…");

    st.respTimer = setTimeout(() => {
      const sx = stRef.current;
      if (!sx.actx || !sx.dryGain || !sx.reverbGain) return;
      sx.phase = "responding";
      setStatus("Aria is responding…");

      const resp = buildResponse(sx.markov, sx.captured);
      resp.forEach((midi, i) => {
        setTimeout(() => {
          const s = stRef.current;
          if (!s.actx || !s.dryGain || !s.reverbGain || s.phase !== "responding") return;
          playNote(s.actx, s.dryGain,    midi, 0.28, 0.80);
          playNote(s.actx, s.reverbGain, midi, 0.12, 0.80);
          const nowMs = performance.now();
          s.notes.push({ midi, startMs: nowMs, endMs: nowMs + STEP_MS * 0.78, lane: "aria" });
        }, i * STEP_MS);
      });

      setTimeout(() => {
        const s    = stRef.current;
        s.captured = [];
        s.lastNote = -1;
        s.scheduled = false;
        s.phase     = "listening";
        setStatus("listening…");
        setCount(0);
      }, RESPONSE_STEPS * STEP_MS + 500);
    }, 480);
  }

  // ── boot ─────────────────────────────────────────────────────────────────────
  async function boot(): Promise<void> {
    let stream: MediaStream | null = null;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { /* demo mode */ }

    const ctx      = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0;
    const reverb   = makeReverb(ctx);
    const revGain  = ctx.createGain(); revGain.gain.value  = 0.38;
    const dryGain  = ctx.createGain(); dryGain.gain.value  = 0.62;
    reverb.connect(ctx.destination);
    revGain.connect(reverb);
    dryGain.connect(ctx.destination);
    if (stream) ctx.createMediaStreamSource(stream).connect(analyser);

    const st      = stRef.current;
    st.actx       = ctx;
    st.analyser   = analyser;
    st.reverbGain = revGain;
    st.dryGain    = dryGain;
    setStarted(true);

    if (!stream) {
      // demo: play a pentatonic phrase and seed the Markov table
      const demo = [60, 62, 64, 67, 69, 67, 64, 62, 60, 62, 64];
      demo.forEach((midi, i) => {
        setTimeout(() => {
          const s = stRef.current;
          if (!s.actx || !s.dryGain || !s.reverbGain) return;
          playNote(s.actx, s.dryGain,    midi, 0.30, 0.65);
          playNote(s.actx, s.reverbGain, midi, 0.12, 0.65);
          const nowMs = performance.now();
          s.notes.push({ midi, startMs: nowMs, endMs: nowMs + 320, lane: "user" });
          if (i > 0) addTransition(s.markov, demo[i - 1], midi);
          s.lastNote = midi;
          s.captured.push(midi);
          setCount(s.captured.length);
        }, i * 420);
      });
      setTimeout(() => {
        const s = stRef.current;
        if (s.phase === "listening") scheduleResponse(s);
      }, demo.length * 420 + 1800);
    }
  }

  // ── pitch polling ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const buf = new Float32Array(2048);

    const id = setInterval(() => {
      const sx = stRef.current;
      if (sx.phase !== "listening" || !sx.analyser || !sx.actx) return;
      sx.analyser.getFloatTimeDomainData(buf);
      const hz = detectPitch(buf, sx.actx.sampleRate);

      if (hz > 60 && hz < 2100) {
        const midi = hzToMidi(hz);
        if (midi >= MIDI_LO && midi <= MIDI_HI) {
          if (midi === sx.prevMidi) {
            sx.prevCount++;
          } else {
            if (sx.prevMidi > 0) closeLastUserNote(sx.notes);
            sx.prevMidi  = midi;
            sx.prevCount = 1;
          }
          if (sx.prevCount === 2) {
            if (sx.silTimer) { clearTimeout(sx.silTimer); sx.silTimer = null; }
            // open note only if not already tracking this pitch
            let alreadyOpen = false;
            for (let i = sx.notes.length - 1; i >= 0; i--) {
              if (sx.notes[i].lane === "user" && sx.notes[i].endMs === null) {
                alreadyOpen = sx.notes[i].midi === midi;
                break;
              }
            }
            if (!alreadyOpen) {
              sx.notes.push({ midi, startMs: performance.now(), endMs: null, lane: "user" });
            }
            const prev = sx.lastNote;
            if (prev >= 0 && prev !== midi) addTransition(sx.markov, prev, midi);
            sx.lastNote = midi;
            if (sx.captured.length === 0 || sx.captured[sx.captured.length - 1] !== midi) {
              sx.captured.push(midi);
              setCount(sx.captured.length);
            }
          }
          return;
        }
      }

      // silence / out of range
      if (sx.prevMidi > 0) { closeLastUserNote(sx.notes); sx.prevMidi = -1; sx.prevCount = 0; }
      if (sx.captured.length >= MIN_NOTES && !sx.silTimer && !sx.scheduled) {
        sx.silTimer = setTimeout(() => {
          sx.silTimer = null;
          scheduleResponse(stRef.current);
        }, SILENCE_MS);
      }
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
      filter: "user" | "aria",
      rgb: string, label: string,
      nowMs: number
    ) {
      // octave grid lines
      for (let m = MIDI_LO; m <= MIDI_HI; m += 12) {
        const y = yOff + laneH - ((m - MIDI_LO) / MIDI_RANGE) * laneH;
        g2.beginPath(); g2.moveTo(0, y); g2.lineTo(w, y);
        g2.strokeStyle = "rgba(255,255,255,0.05)"; g2.lineWidth = 0.5; g2.stroke();
        g2.fillStyle = "rgba(255,255,255,0.16)";
        g2.font = "9px monospace"; g2.textAlign = "left"; g2.textBaseline = "middle";
        g2.fillText(`C${Math.floor(m / 12) - 1}`, 4, y);
      }
      // lane label
      g2.fillStyle = `rgba(${rgb},0.85)`;
      g2.font = "bold 11px monospace"; g2.textAlign = "right"; g2.textBaseline = "top";
      g2.fillText(label, w - 8, yOff + 6);
      // notes
      const semH = Math.max(3, (laneH / MIDI_RANGE) * 0.82);
      const sx   = stRef.current;
      for (const note of sx.notes) {
        if (note.lane !== filter) continue;
        const endMs  = note.endMs ?? nowMs;
        const noteW  = Math.max(8, ((endMs - note.startMs) / 1000) * SCROLL_PX_PER_SEC);
        const noteX  = w - ((nowMs - note.startMs) / 1000) * SCROLL_PX_PER_SEC;
        if (noteX + noteW < 0) continue;
        const noteY  = yOff + laneH - ((note.midi - MIDI_LO) / MIDI_RANGE) * laneH;
        const live   = note.endMs === null;
        g2.shadowColor = `rgba(${rgb},0.9)`; g2.shadowBlur = live ? 10 : 5;
        g2.fillStyle   = live ? `rgba(${rgb},0.95)` : `rgba(${rgb},0.6)`;
        g2.fillRect(noteX, noteY - semH / 2, noteW, semH);
        g2.shadowBlur = 0;
      }
    }

    const frame = () => {
      if (!cv) { rafRef.current = requestAnimationFrame(frame); return; }
      gc.clearRect(0, 0, w, h);
      gc.fillStyle = "#030309"; gc.fillRect(0, 0, w, h);
      const laneH = h / 2;
      const nowMs = performance.now();

      // prune notes scrolled off screen
      const sx = stRef.current;
      sx.notes = sx.notes.filter(n => {
        const endMs = n.endMs ?? nowMs;
        const x0    = w - ((nowMs - n.startMs) / 1000) * SCROLL_PX_PER_SEC;
        const nw    = Math.max(8, ((endMs - n.startMs) / 1000) * SCROLL_PX_PER_SEC);
        return x0 + nw > -20;
      });

      drawLane(gc, 0,     laneH, "user", "251 146 60", "YOU",  nowMs);

      gc.beginPath(); gc.moveTo(0, laneH); gc.lineTo(w, laneH);
      gc.strokeStyle = "rgba(255,255,255,0.10)"; gc.lineWidth = 1; gc.stroke();

      drawLane(gc, laneH, laneH, "aria", "96 165 250", "ARIA", nowMs);

      // "now" cursor line
      gc.beginPath(); gc.moveTo(w - 2, 0); gc.lineTo(w - 2, h);
      gc.strokeStyle = "rgba(255,255,255,0.20)"; gc.lineWidth = 1.5; gc.stroke();

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [started]);

  // ── cleanup ───────────────────────────────────────────────────────────────────
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    const st = stRef.current;
    if (st.silTimer)  clearTimeout(st.silTimer);
    if (st.respTimer) clearTimeout(st.respTimer);
    st.actx?.close().catch((err) => { void err; });
  }, []);

  return (
    <div className="fixed inset-0 bg-black text-foreground flex flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <h1 className="text-base font-semibold text-foreground">Aria Companion</h1>
        <p className="text-xs text-muted-foreground font-mono">markov piano dialogue · cycle 243</p>
      </div>

      {!started ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="text-muted-foreground text-base max-w-xs leading-relaxed">
            Play piano into the mic. After you pause, Aria responds with a phrase
            shaped by your playing. The longer you play, the more Aria learns
            your style.
          </p>
          <button
            onClick={() => { void boot(); }}
            className="px-8 py-3 rounded-full bg-violet-600 hover:bg-violet-500 active:scale-95 text-foreground text-base font-medium min-h-[44px] min-w-[44px] transition-all"
          >
            Start mic
          </button>
          <p className="text-muted-foreground/70 text-xs">
            No mic? Click anyway — demo plays a pentatonic phrase.
          </p>
        </div>
      ) : (
        <>
          <canvas ref={cvRef} className="flex-1 w-full" />
          <div className="shrink-0 flex items-center justify-between px-4 py-2 border-t border-border pb-safe">
            <span className="text-sm font-mono text-muted-foreground">{status}</span>
            <span className="text-xs font-mono text-muted-foreground/70">
              {count} note{count !== 1 ? "s" : ""} captured
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
          href="/dream/210-aria-companion/README.md"
          className="font-mono text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          design notes
        </Link>
      </div>
    </div>
  );
}
