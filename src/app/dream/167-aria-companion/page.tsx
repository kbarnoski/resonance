"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

// ---- pitch detection (AMDF variant, from 155-piano-hands) ---------------
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

function midiFreq(m: number): number { return 440 * 2 ** ((m - 69) / 12); }
function freqMidi(f: number): number { return Math.round(12 * Math.log2(f / 440) + 69); }

// ---- Markov bigram -------------------------------------------------------
type Bigram = Map<number, Map<number, number>>;

function addEdge(t: Bigram, from: number, to: number) {
  let row = t.get(from);
  if (!row) { row = new Map(); t.set(from, row); }
  row.set(to, (row.get(to) ?? 0) + 1);
}

// C-major pentatonic across 3 octaves as fallback
const PENTA: readonly number[] = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84];

function sampleNext(t: Bigram, cur: number): number {
  const row = t.get(cur);
  if (row && row.size > 0) {
    let total = 0;
    for (const c of row.values()) total += c;
    let r = Math.random() * total;
    for (const [n, c] of row) { r -= c; if (r <= 0) return n; }
  }
  // Fallback: random pentatonic note within an octave of current
  const near = PENTA.filter(n => Math.abs(n - cur) <= 8);
  const pool = near.length > 0 ? near : [...PENTA];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---- piano synthesis -----------------------------------------------------
function playNote(actx: AudioContext, midi: number, t0: number, dur: number) {
  const f = midiFreq(midi);
  const gain = actx.createGain();
  gain.connect(actx.destination);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.2, t0 + 0.016);
  gain.gain.setTargetAtTime(0.09, t0 + 0.016, 0.09);
  gain.gain.setTargetAtTime(0.001, t0 + dur, 0.28);
  const end = t0 + dur + 1.4;
  [1, 2].forEach((harmonic, i) => {
    const osc = actx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = f * harmonic;
    const hg = actx.createGain();
    hg.gain.value = i === 0 ? 1 : 0.26;
    osc.connect(hg);
    hg.connect(gain);
    osc.start(t0);
    osc.stop(end);
  });
}

// ---- types ---------------------------------------------------------------
type Phase = "idle" | "listening" | "thinking" | "responding";
type RollNote = { midi: number; startMs: number; endMs: number; isAria: boolean };

const MIDI_LO = 48;  // C3
const MIDI_HI = 84;  // C6
const PX_SEC = 80;   // scroll speed
const SILENCE_MS = 2000;
const MIN_NOTES = 6;

// ---- component -----------------------------------------------------------
export default function AriaCompanion() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const phaseRef = useRef<Phase>("idle");

  const actxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);

  // note tracking (listening phase)
  const curMidiRef = useRef(-1);
  const curNoteStartRef = useRef(0);
  const lastSoundRef = useRef(0);       // ms of last detected pitch; 0 = none
  const capturedRef = useRef<number[]>([]);     // MIDI notes this phrase
  const capturedDursRef = useRef<number[]>([]); // durations (sec) this phrase

  // Markov table — persists across phrases, grows with every call-response
  const bigramRef = useRef<Bigram>(new Map());

  const rollRef = useRef<RollNote[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);

  // ---- tear-down ----------------------------------------------------------
  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    void actxRef.current?.close();
    actxRef.current = null;
    streamRef.current = null;
    analyserRef.current = null;
    timeBufRef.current = null;
    rollRef.current = [];
    capturedRef.current = [];
    capturedDursRef.current = [];
    bigramRef.current = new Map();
    curMidiRef.current = -1;
    lastSoundRef.current = 0;
    phaseRef.current = "idle";
    setPhase("idle");
  }, []);

  // ---- trigger Aria response ----------------------------------------------
  const triggerResponse = useCallback(() => {
    const actx = actxRef.current;
    const captured = [...capturedRef.current];
    if (!actx || captured.length < 2) {
      capturedRef.current = [];
      capturedDursRef.current = [];
      lastSoundRef.current = 0;
      return;
    }
    phaseRef.current = "thinking";
    setPhase("thinking");

    setTimeout(() => {
      if (phaseRef.current !== "thinking") return;

      // Update bigram from this phrase
      const bigram = bigramRef.current;
      for (let i = 0; i < captured.length - 1; i++) addEdge(bigram, captured[i], captured[i + 1]);

      // Estimate user's tempo → shape Aria's response duration
      const durs = capturedDursRef.current;
      const meanDur = durs.length > 0 ? durs.reduce((a, b) => a + b, 0) / durs.length : 0.35;
      const noteDur = Math.max(0.18, Math.min(0.68, meanDur * 0.88));
      const gap = noteDur * 0.2;

      // Generate 7–13 note response via bigram walk
      const count = 7 + Math.floor(Math.random() * 7);
      const notes: number[] = [];
      let cur = captured[captured.length - 1];
      for (let i = 0; i < count; i++) { cur = sampleNext(bigram, cur); notes.push(cur); }

      // Schedule audio
      const t0 = actx.currentTime + 0.05;
      const ms0 = performance.now() + 50;
      notes.forEach((midi, i) => {
        const t = t0 + i * (noteDur + gap);
        playNote(actx, midi, t, noteDur);
        const ms = ms0 + i * (noteDur + gap) * 1000;
        rollRef.current.push({ midi, startMs: ms, endMs: ms + noteDur * 1000, isAria: true });
      });

      phaseRef.current = "responding";
      setPhase("responding");

      // Return to listening after response completes
      const totalMs = (notes.length * (noteDur + gap) + 1.2) * 1000;
      setTimeout(() => {
        if (phaseRef.current === "responding") {
          capturedRef.current = [];
          capturedDursRef.current = [];
          lastSoundRef.current = 0;
          curMidiRef.current = -1;
          phaseRef.current = "listening";
          setPhase("listening");
        }
      }, totalMs);
    }, 450);
  }, []);

  // ---- start mic ----------------------------------------------------------
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new Ctx();
      actxRef.current = actx;
      const src = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(4096);
      src.connect(analyser); // not connected to destination — no feedback
      phaseRef.current = "listening";
      setPhase("listening");
      setMicError(null);
    } catch (e) {
      setMicError(e instanceof Error ? e.message : "Microphone unavailable — check permissions.");
    }
  }, []);

  // ---- demo mode (no mic) -------------------------------------------------
  const runDemo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const actx = new Ctx();
    actxRef.current = actx;

    // Play a short C-pentatonic phrase and feed it directly into the note buffer
    const demoMidis = [60, 62, 64, 67, 64, 62, 60, 55, 57, 60, 62, 64];
    const noteDur = 0.3;
    const gap = 0.08;
    const t0 = actx.currentTime + 0.05;
    const ms0 = performance.now() + 50;

    demoMidis.forEach((midi, i) => {
      const t = t0 + i * (noteDur + gap);
      playNote(actx, midi, t, noteDur);
      const ms = ms0 + i * (noteDur + gap) * 1000;
      rollRef.current.push({ midi, startMs: ms, endMs: ms + noteDur * 1000, isAria: false });
      capturedRef.current.push(midi);
      capturedDursRef.current.push(noteDur);
    });

    phaseRef.current = "listening";
    setPhase("listening");

    // Trigger after the demo phrase ends
    const phraseMs = demoMidis.length * (noteDur + gap) * 1000 + 50;
    setTimeout(() => {
      if (phaseRef.current === "listening") triggerResponse();
    }, phraseMs + 600);
  }, [triggerResponse]);

  // ---- render + pitch detection loop --------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    if (!c) return;

    let dpr = 1, w = 0, h = 0;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      c.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      // ---- pitch detection (listening phase only) ----
      if (phaseRef.current === "listening") {
        const analyser = analyserRef.current;
        const buf = timeBufRef.current;
        const sr = actxRef.current?.sampleRate ?? 44100;
        if (analyser && buf) {
          analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
          const freq = detectPitch(buf, sr);
          const midi = freq > 0 ? freqMidi(freq) : -1;
          const nowMs = performance.now();

          if (midi >= MIDI_LO && midi <= MIDI_HI) {
            lastSoundRef.current = nowMs;
            if (curMidiRef.current !== midi) {
              // Previous note ended — close it
              if (curMidiRef.current >= 0) {
                const dur = (nowMs - curNoteStartRef.current) / 1000;
                if (dur > 0.05) {
                  capturedRef.current.push(curMidiRef.current);
                  capturedDursRef.current.push(dur);
                  rollRef.current.push({
                    midi: curMidiRef.current,
                    startMs: curNoteStartRef.current,
                    endMs: nowMs,
                    isAria: false,
                  });
                }
              }
              curMidiRef.current = midi;
              curNoteStartRef.current = nowMs;
            }
          } else {
            // Silence: close current note after 80ms grace
            if (curMidiRef.current >= 0 && nowMs - lastSoundRef.current > 80) {
              const dur = (lastSoundRef.current - curNoteStartRef.current) / 1000;
              if (dur > 0.05) {
                capturedRef.current.push(curMidiRef.current);
                capturedDursRef.current.push(dur);
                rollRef.current.push({
                  midi: curMidiRef.current,
                  startMs: curNoteStartRef.current,
                  endMs: lastSoundRef.current,
                  isAria: false,
                });
              }
              curMidiRef.current = -1;
            }
            // Trigger response after SILENCE_MS of silence
            const silenceMs = nowMs - lastSoundRef.current;
            if (silenceMs > SILENCE_MS && capturedRef.current.length >= MIN_NOTES && lastSoundRef.current > 0) {
              lastSoundRef.current = 0; // prevent re-trigger
              triggerResponse();
            }
          }
        }
      }

      // ---- draw ----
      c.clearRect(0, 0, w, h);
      c.fillStyle = "#070809";
      c.fillRect(0, 0, w, h);

      const HDR = 44, FTR = 40;
      const rollH = h - HDR - FTR;
      const panH = Math.floor(rollH * 0.46);
      const gapH = rollH - panH * 2;
      const userY = HDR;
      const ariaY = HDR + panH + gapH;
      const right = w - 28; // "now" cursor x
      const nowMs = performance.now();

      // Subtle panel tints
      c.fillStyle = "rgba(255, 140, 60, 0.025)";
      c.fillRect(0, userY, w, panH);
      c.fillStyle = "rgba(80, 160, 255, 0.025)";
      c.fillRect(0, ariaY, w, panH);

      // Octave grid lines (C3, C4, C5, C6)
      for (const cn of [48, 60, 72, 84]) {
        const frac = (MIDI_HI - cn) / (MIDI_HI - MIDI_LO);
        c.strokeStyle = cn % 12 === 0 ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.035)";
        c.lineWidth = 0.5;
        for (const py of [userY, ariaY]) {
          const y = py + frac * panH;
          c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke();
        }
      }

      // "Now" cursor
      c.strokeStyle = "rgba(255,255,255,0.1)";
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(right, userY); c.lineTo(right, ariaY + panH); c.stroke();

      // Divider between panels
      const divY = HDR + panH + Math.floor(gapH / 2);
      c.strokeStyle = "rgba(255,255,255,0.06)";
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, divY); c.lineTo(w, divY); c.stroke();

      // Trim very old notes
      while (rollRef.current.length > 0 && nowMs - rollRef.current[0].endMs > 25000) rollRef.current.shift();

      // Draw note bars
      for (const note of rollRef.current) {
        const panY = note.isAria ? ariaY : userY;
        const noteH = Math.max(3, panH / (MIDI_HI - MIDI_LO) * 1.6);
        const noteY = panY + ((MIDI_HI - note.midi) / (MIDI_HI - MIDI_LO)) * panH - noteH / 2;
        const x0 = right - (nowMs - note.startMs) / 1000 * PX_SEC;
        const x1 = right - (nowMs - note.endMs) / 1000 * PX_SEC;
        if (x1 < 0 || x0 > w) continue;
        const nw = Math.max(3, x1 - x0);
        const [r, g, b] = note.isAria ? [80, 160, 255] : [255, 148, 55];
        c.shadowColor = `rgba(${r},${g},${b},0.35)`;
        c.shadowBlur = 4;
        c.fillStyle = `rgba(${r},${g},${b},0.88)`;
        c.beginPath();
        c.roundRect(x0, noteY, nw, noteH, 2);
        c.fill();
      }

      // Live-tail: currently-detected note extends to cursor
      if (phaseRef.current === "listening" && curMidiRef.current >= 0) {
        const noteH = Math.max(3, panH / (MIDI_HI - MIDI_LO) * 1.6);
        const noteY = userY + ((MIDI_HI - curMidiRef.current) / (MIDI_HI - MIDI_LO)) * panH - noteH / 2;
        const x0 = right - (nowMs - curNoteStartRef.current) / 1000 * PX_SEC;
        c.shadowColor = "rgba(255, 148, 55, 0.55)";
        c.shadowBlur = 7;
        c.fillStyle = "rgba(255, 165, 85, 0.92)";
        c.beginPath();
        c.roundRect(x0, noteY, right - x0, noteH + 1, 2);
        c.fill();
      }

      c.shadowBlur = 0;
      c.shadowColor = "transparent";

      // Panel labels
      c.font = "bold 10px monospace";
      c.textBaseline = "top";
      c.fillStyle = "rgba(255, 165, 80, 0.5)";
      c.fillText("YOU", 10, userY + 8);
      c.fillStyle = "rgba(80, 160, 255, 0.5)";
      c.fillText("ARIA", 10, ariaY + 8);

      // Phrase-fill bar: shows how close to triggering Aria
      if (phaseRef.current === "listening" && capturedRef.current.length > 0) {
        const pct = Math.min(1, capturedRef.current.length / MIN_NOTES);
        c.fillStyle = `rgba(255,165,80,${0.1 + pct * 0.12})`;
        c.fillRect(right - 4, userY, 4, panH);
      }

      // Thinking animation: pulsing dot in Aria panel
      if (phaseRef.current === "thinking") {
        const pulse = 0.45 + 0.45 * Math.sin(performance.now() * 0.006);
        c.fillStyle = `rgba(80, 160, 255, ${pulse})`;
        const cx = w / 2, cy = ariaY + panH / 2;
        c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(cx - 18, cy, 3, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(cx + 18, cy, 3, 0, Math.PI * 2); c.fill();
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [triggerResponse]);

  useEffect(() => () => stop(), [stop]);

  const PHASE_LABEL: Record<Phase, string> = {
    idle: "",
    listening: "● listening",
    thinking: "◌ thinking",
    responding: "▶ responding",
  };
  const PHASE_COLOR: Record<Phase, string> = {
    idle: "",
    listening: "text-emerald-300/80",
    thinking: "text-white/55",
    responding: "text-blue-300/80",
  };

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 3rem)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ background: "#070809" }}
      />

      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
          <h1 className="text-3xl font-light mb-3 tracking-tight">Aria</h1>
          <p className="text-base text-white/75 max-w-md mb-3 leading-relaxed">
            Play piano into your mic. After two seconds of silence, Aria responds — a
            short phrase built from the note transitions in what you just played.
          </p>
          <p className="text-sm text-white/55 max-w-md mb-8 leading-relaxed">
            The Markov table grows across every call-and-response. The longer the
            session, the more Aria sounds like you.
          </p>
          <div className="flex gap-3">
            <button
              onClick={start}
              className="px-6 py-3 text-sm tracking-wider uppercase border border-white/30 rounded hover:bg-white/5 hover:border-white/60 transition min-h-[44px]"
            >
              Start mic
            </button>
            <button
              onClick={runDemo}
              className="px-5 py-3 text-sm tracking-wider uppercase border border-white/15 text-white/55 rounded hover:bg-white/5 hover:text-white/80 transition min-h-[44px]"
            >
              Demo
            </button>
          </div>
          {micError && (
            <p className="mt-4 text-sm text-rose-300 max-w-sm">{micError}</p>
          )}
          <Link href="/dream" className="mt-12 text-xs text-white/30 hover:text-white/60">
            ← back to dream sandbox
          </Link>
        </div>
      )}

      {phase !== "idle" && (
        <>
          <div className="absolute top-0 left-0 right-0 h-11 flex items-center justify-between px-4 pointer-events-none">
            <span className="text-sm font-light text-white/80 tracking-wide">
              Aria — Piano Companion
            </span>
            <span className={`text-xs tracking-wider ${PHASE_COLOR[phase]}`}>
              {PHASE_LABEL[phase]}
            </span>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 pointer-events-auto"
            style={{ height: 40 }}
          >
            <Link href="/dream" className="text-xs text-white/30 hover:text-white/60">
              ← back
            </Link>
            <button
              onClick={stop}
              className="text-xs tracking-wider uppercase text-white/55 hover:text-white border border-white/20 hover:border-white/60 px-3 py-1.5 rounded min-h-[36px]"
            >
              stop
            </button>
          </div>
        </>
      )}
    </div>
  );
}
