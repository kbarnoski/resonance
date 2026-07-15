"use client";

/**
 * 1694 · Reed Column
 * "What if you could blow into your laptop mic and it became a real clarinet —
 *  a self-oscillating single-reed woodwind whose exciter is your actual breath?"
 *
 * This is the BLOW member of the lab's physical-model instrument triad
 * (pluck -> bow -> blow). The engine is a 1-D DIGITAL WAVEGUIDE clarinet: a
 * cylindrical-bore delay line terminated by a sign-inverting, lossy bell
 * reflection and, at the mouthpiece, the McIntyre / Schumacher / Woodhouse /
 * STK single-REED nonlinearity. The reed table turns steady blowing pressure
 * into a self-sustaining oscillation; the PITCH is the bore length, the breath
 * only supplies energy. Below threshold it is SILENT; blow harder and it
 * overblows to the 3rd harmonic — a TWELFTH — the clarinet's signature.
 * (See ./worklet-source.ts for the per-sample physics.)
 *
 * Controller (non-keyboard): PRIMARY is the MIC — getUserMedia -> AnalyserNode
 * (never to destination) -> a per-frame breath RMS envelope IS the blowing
 * pressure. SECONDARY is pointer-x over the canvas, sliding the bore length to
 * pick a note from a clarinet-ish scale.
 *
 * Deterministic ghost: on mount, before any mic, a "ghost breath" built from a
 * FRAME COUNTER (no random/time in the audio path) plays a tongued phrase that
 * swells through the reed threshold and overblows on some notes, so the page is
 * never blank or silent headless. A live blow takes over; an idle timeout
 * returns to the ghost. Mic-denied is handled with an on-brand notice.
 *
 * Visual (Canvas2D only): the live standing pressure wave in the bore, a breath
 * meter with threshold + overblow marks, and the sounding pitch / register /
 * active harmonic. Warm amber-reed & wood tones inside the canvas only.
 *
 * References: McIntyre, Schumacher & Woodhouse (JASA 1983); Perry Cook's STK
 * Clarinet; Julius O. Smith, Physical Audio Signal Processing / digital
 * waveguides; Smith, Valimaki & Reiss, "Four Decades of Digital Waveguides"
 * (arXiv 2604.12878, 2026).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { WORKLET_SOURCE } from "./worklet-source";

// ── a clarinet-ish scale (D minor pentatonic across the chalumeau) ──────────
type Note = { freq: number; name: string };
const SCALE: Note[] = [
  { freq: 146.83, name: "D3" },
  { freq: 174.61, name: "F3" },
  { freq: 196.0, name: "G3" },
  { freq: 220.0, name: "A3" },
  { freq: 261.63, name: "C4" },
  { freq: 293.66, name: "D4" },
  { freq: 349.23, name: "F4" },
  { freq: 392.0, name: "G4" },
  { freq: 440.0, name: "A4" },
];
const NS = SCALE.length;
const DEFAULT_IDX = 2;

// ghost melody (indices into SCALE); notes marked hard overblow to the twelfth.
const GHOST_MELODY = [2, 4, 5, 6, 5, 4, 2, 7, 8, 6, 4, 2];
const GHOST_HARD = [false, false, true, false, false, false, false, true, true, false, false, false];
const NOTE_FRAMES = 56; // frames per ghost note (~0.9 s at 60 fps)
const IDLE_FRAMES = 260; // ~4.3 s of no blow / no pointer -> ghost resumes

// register / reed thresholds (in CONTROL-pressure units, matched to the worklet)
const ONSET = 0.3; // below this: silent
const OVERBLOW = 0.72; // above this (with hysteresis): jumps to the twelfth
const OVERBLOW_REL = 0.5;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function freqToName(f: number): string {
  const midi = Math.round(69 + 12 * Math.log2(f / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
}

type Engine = {
  ctx: AudioContext;
  node: AudioWorkletNode;
  master: GainNode;
  url: string;
};

type VizMsg = {
  wave: Float32Array;
  amp: number;
  over: boolean;
  pressure: number;
  freq: number;
};

export default function ReedColumnPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [running, setRunning] = useState(false);
  const [micState, setMicState] = useState<"off" | "asking" | "on" | "denied">("off");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // engine + loop refs (no re-render churn)
  const engineRef = useRef<Engine | null>(null);
  const audioOnRef = useRef(false);
  const rafRef = useRef(0);
  const frameRef = useRef(0); // deterministic ghost / idle frame counter
  const visClockRef = useRef(0); // decoupled visual clock (ms, rAF-fed)

  // mic analyser
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micBufRef = useRef<Float32Array | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micSmoothRef = useRef(0);
  const lastBlowFrameRef = useRef(-100000);

  // pointer (secondary controller: x -> bore length / note)
  const pointerRef = useRef({ has: false, index: DEFAULT_IDX, lastFrame: -100000 });

  // shared control/visual state
  const ctrlRef = useRef({
    pMouth: 0, // control pressure driving the reed
    idx: DEFAULT_IDX, // current note index
    over: false, // register (visual mirror of the worklet hysteresis)
    localAmp: 0, // local visual envelope (alive without audio)
    live: false, // true when a real blow drives it, false = ghost
    phase: 0, // visual standing-wave phase
  });
  const vizRef = useRef<VizMsg | null>(null);

  // ── start audio (needs a user gesture to resume the context) ──────────────
  const handleStart = useCallback(async () => {
    setRunning(true);
    if (engineRef.current) {
      try {
        await engineRef.current.ctx.resume();
      } catch {
        /* ignore */
      }
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) {
      setAudioError("Web Audio is unavailable — showing the silent ghost column.");
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not open an audio context.");
      return;
    }
    if (!ctx.audioWorklet) {
      setAudioError(
        "AudioWorklet is unavailable — the reed model needs it; the ghost still plays visually.",
      );
      audioOnRef.current = false;
      return;
    }
    try {
      const blob = new Blob([WORKLET_SOURCE], { type: "application/javascript" });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, "reed-column-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { freq: SCALE[DEFAULT_IDX].freq },
      });
      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { type: string } & VizMsg;
        if (d.type === "viz") {
          vizRef.current = {
            wave: d.wave,
            amp: d.amp,
            over: d.over,
            pressure: d.pressure,
            freq: d.freq,
          };
        }
      };

      // warm body tilt, then safety limiting: worklet -> LP -> comp -> gain.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 4200;
      lp.Q.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 22;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      const master = ctx.createGain();
      master.gain.value = 0.12; // low + limited: the model cannot blow up

      node.connect(lp);
      lp.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);

      engineRef.current = { ctx, node, master, url };
      audioOnRef.current = true;
      setAudioError(null);

      // opening the mic is the whole point — ask right after audio is live.
      void enableMic(ctx);
    } catch {
      setAudioError("The reed worklet failed to load — the ghost still plays visually.");
      audioOnRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── mic: open stream -> analyser ONLY (never to destination) ──────────────
  const enableMic = useCallback(async (ctx: AudioContext) => {
    if (analyserRef.current) return;
    setMicState("asking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      // IMPORTANT: mic -> analyser only. NEVER analyser -> destination.
      src.connect(analyser);
      analyserRef.current = analyser;
      micBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      setMicState("on");
    } catch {
      setMicState("denied");
    }
  }, []);

  // ── draw one frame ────────────────────────────────────────────────────────
  const drawScene = useCallback(
    (
      c: CanvasRenderingContext2D,
      p: { W: number; H: number; dt: number },
    ) => {
      const { W, H, dt } = p;
      const s = ctrlRef.current;

      // warm wood / reed backdrop
      const bg = c.createRadialGradient(W * 0.5, H * 0.4, 30, W * 0.5, H * 0.55, Math.max(W, H) * 0.8);
      bg.addColorStop(0, "#1e1510");
      bg.addColorStop(0.6, "#140d0a");
      bg.addColorStop(1, "#0a0705");
      c.fillStyle = bg;
      c.fillRect(0, 0, W, H);

      // bore geometry
      const boreX0 = Math.max(64, W * 0.14);
      const boreX1 = W - Math.max(48, W * 0.08);
      const boreLen = boreX1 - boreX0;
      const midY = H * 0.44;
      const maxDisp = Math.min(88, H * 0.26);

      const amp = Math.max(s.localAmp, audioOnRef.current && vizRef.current ? vizRef.current.amp * 1.6 : 0);
      const A = Math.min(1, amp) * maxDisp;
      const reg = s.over ? 3 : 1; // sounding resonance (odd series)

      // advance the visual phase (decoupled from audio)
      s.phase += (dt / 1000) * 6.0;

      // mouthpiece / reed at the left, flared bell at the right
      c.fillStyle = "rgba(120,86,54,0.9)";
      c.fillRect(boreX0 - 22, midY - 20, 22, 40); // mouthpiece block
      c.fillStyle = "rgba(214,168,110,0.95)";
      c.beginPath();
      c.moveTo(boreX0 - 22, midY - 5);
      c.lineTo(boreX0 - 2, midY - 1 - A * 0.12);
      c.lineTo(boreX0 - 2, midY + 1 + A * 0.12);
      c.lineTo(boreX0 - 22, midY + 5);
      c.closePath();
      c.fill(); // the reed, opening slightly with amplitude

      // bell flare
      c.strokeStyle = "rgba(150,104,64,0.8)";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(boreX1, midY - 14);
      c.quadraticCurveTo(boreX1 + 26, midY - 34, boreX1 + 34, midY - 8);
      c.moveTo(boreX1, midY + 14);
      c.quadraticCurveTo(boreX1 + 26, midY + 34, boreX1 + 34, midY + 8);
      c.stroke();

      // tube walls
      c.strokeStyle = "rgba(96,70,46,0.55)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(boreX0, midY - maxDisp - 6);
      c.lineTo(boreX1, midY - maxDisp - 6);
      c.moveTo(boreX0, midY + maxDisp + 6);
      c.lineTo(boreX1, midY + maxDisp + 6);
      c.stroke();

      // ── the live standing pressure wave in the bore ───────────────────────
      // Analytic mode shape: pressure ANTINODE at the reed (x=0), NODE at the
      // open bell (x=1). Fundamental -> cos(pi/2 x); overblown -> cos(3 pi/2 x)
      // (the 3rd, odd, resonance). A touch of odd-harmonic colour keeps the
      // clarinet's hollow character visible. Overlays the real bore snapshot.
      const N = 160;
      const k = (reg * Math.PI) / 2;
      const sinP = Math.sin(s.phase);
      const sin3 = Math.sin(3 * s.phase);
      c.lineWidth = 2.2;
      c.shadowColor = "rgba(255,178,96,0.6)";
      c.shadowBlur = 10 + A * 0.2;
      c.strokeStyle = s.over ? "rgba(255,208,150,0.95)" : "rgba(255,176,96,0.92)";
      c.beginPath();
      for (let i = 0; i <= N; i++) {
        const xn = i / N;
        const shape = Math.cos(k * xn) * sinP + 0.28 * Math.cos(3 * k * xn) * sin3;
        const x = boreX0 + xn * boreLen;
        const y = midY - A * shape;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.shadowBlur = 0;

      // faint real bore snapshot from the worklet (authentic wave in the tube)
      const viz = vizRef.current;
      if (audioOnRef.current && viz && viz.amp > 0.002) {
        const w = viz.wave;
        const M = w.length;
        let peak = 1e-6;
        for (let i = 0; i < M; i++) peak = Math.max(peak, Math.abs(w[i]));
        const scale = (Math.min(1, viz.amp * 1.6) * maxDisp) / peak;
        c.strokeStyle = "rgba(255,235,205,0.28)";
        c.lineWidth = 1;
        c.beginPath();
        for (let i = 0; i < M; i++) {
          const x = boreX0 + (i / (M - 1)) * boreLen;
          const y = midY - w[i] * scale;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }

      // pressure nodes for the sounding mode (visual anchor for the register)
      for (let m = 1; m <= reg; m++) {
        const xn = (2 * m - 1) / (2 * reg);
        const x = boreX0 + xn * boreLen;
        c.fillStyle = "rgba(255,230,200,0.5)";
        c.beginPath();
        c.arc(x, midY, 2.4, 0, Math.PI * 2);
        c.fill();
      }

      // ── breath-pressure meter (left column) ───────────────────────────────
      const mx = 22;
      const mtop = H * 0.16;
      const mh = H * 0.6;
      const mw = 12;
      c.fillStyle = "rgba(255,255,255,0.06)";
      c.fillRect(mx, mtop, mw, mh);
      // threshold + overblow marks
      const yOf = (v: number) => mtop + mh * (1 - v);
      c.strokeStyle = "rgba(255,235,205,0.4)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(mx - 3, yOf(ONSET));
      c.lineTo(mx + mw + 3, yOf(ONSET));
      c.moveTo(mx - 3, yOf(OVERBLOW));
      c.lineTo(mx + mw + 3, yOf(OVERBLOW));
      c.stroke();
      // fill
      const pv = Math.min(1, s.pMouth);
      const grad = c.createLinearGradient(0, mtop + mh, 0, mtop);
      grad.addColorStop(0, "#7a4a1e");
      grad.addColorStop(0.6, "#e39a3c");
      grad.addColorStop(1, "#ffd08a");
      c.fillStyle = grad;
      c.fillRect(mx, mtop + mh * (1 - pv), mw, mh * pv);
      c.font = "9px ui-monospace, monospace";
      c.fillStyle = "rgba(230,200,160,0.7)";
      c.textAlign = "left";
      c.fillText("BREATH", mx - 2, mtop - 8);
      c.fillStyle = "rgba(230,200,160,0.45)";
      c.fillText("blow", mx + mw + 6, yOf(OVERBLOW) - 2);
      c.fillText("speak", mx + mw + 6, yOf(ONSET) - 2);

      // ── readout (bottom) ──────────────────────────────────────────────────
      const baseFreq = SCALE[s.idx].freq;
      const soundFreq = s.over ? baseFreq * 3 : baseFreq;
      const soundName = s.over ? freqToName(soundFreq) : SCALE[s.idx].name;
      const speaking = s.pMouth > ONSET;

      c.textAlign = "left";
      c.font = "13px ui-monospace, monospace";
      c.fillStyle = "rgba(255,224,180,0.95)";
      c.fillText(
        speaking ? `${soundName}  ${soundFreq.toFixed(1)} Hz` : "— silent —",
        boreX0,
        H - 40,
      );
      c.font = "11px ui-monospace, monospace";
      c.fillStyle = "rgba(230,196,150,0.7)";
      const register = s.over ? "CLARION · 3rd harmonic (12th)" : "CHALUMEAU · fundamental";
      c.fillText(speaking ? register : "waiting for breath", boreX0, H - 22);

      // odd-harmonic reminder
      c.textAlign = "right";
      c.fillStyle = "rgba(210,170,130,0.55)";
      c.fillText("cylindrical bore · odd harmonics", boreX1, H - 22);

      // live / ghost badge
      c.textAlign = "right";
      c.font = "10px ui-monospace, monospace";
      c.fillStyle = s.live ? "rgba(255,210,150,0.95)" : "rgba(190,160,140,0.6)";
      c.fillText(s.live ? "● LIVE BREATH" : "○ GHOST BREATH", boreX1, mtop - 8);
    },
    [],
  );

  // ── the single animation + control loop ───────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c2d = canvas.getContext("2d");
    if (!c2d) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(320, rect.width);
      H = Math.max(300, rect.height);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // pointer-x -> note index (bore length). Secondary controller.
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const xn = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const idx = Math.min(NS - 1, Math.max(0, Math.round(xn * (NS - 1))));
      const pt = pointerRef.current;
      pt.has = true;
      pt.index = idx;
      pt.lastFrame = frameRef.current;
    };
    const onLeave = () => {
      pointerRef.current.has = false;
    };
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerdown", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    // deterministic ghost breath + melody from the frame counter.
    // Each note is tongued (breath dips to silence between notes); some notes
    // swell past the overblow threshold to sound the twelfth. NO random/time.
    const ghost = (f: number) => {
      const beat = Math.floor(f / NOTE_FRAMES);
      const step = beat % GHOST_MELODY.length;
      const idx = GHOST_MELODY[step];
      const hard = GHOST_HARD[step];
      const ph = (f % NOTE_FRAMES) / NOTE_FRAMES; // 0..1 within the note
      const env = Math.sin(ph * Math.PI); // 0 -> 1 -> 0 swell (tonguing)
      const peak = hard ? 0.9 : 0.62;
      const breath = 0.12 + (peak - 0.12) * env;
      return { idx, breath };
    };

    let lastTs = 0;
    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dt = lastTs ? Math.min(50, ts - lastTs) : 16;
      lastTs = ts;
      visClockRef.current += dt;
      const f = frameRef.current++;
      const s = ctrlRef.current;

      // 1. read the breath from the mic (RMS of the raw waveform).
      let micBreath = 0;
      const analyser = analyserRef.current;
      const buf = micBufRef.current;
      if (analyser && buf) {
        analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // map mic RMS into the blowing-pressure range; floor removes room hum.
        micBreath = Math.min(1, Math.max(0, (rms - 0.012) * 7));
      }
      micSmoothRef.current += (micBreath - micSmoothRef.current) * 0.25;
      const micLevel = micSmoothRef.current;

      const micOn = !!analyser;
      if (micOn && micLevel > 0.06) lastBlowFrameRef.current = f;
      const blowingLive = micOn && f - lastBlowFrameRef.current < IDLE_FRAMES;

      const pt = pointerRef.current;
      const pointerLive = pt.has && f - pt.lastFrame < IDLE_FRAMES;

      // 2. resolve breath source: live lungs, else the deterministic ghost.
      const g = ghost(f);
      const pMouth = blowingLive ? micLevel : g.breath;
      // 3. resolve pitch: pointer overrides the ghost melody when active.
      const idx = pointerLive ? pt.index : blowingLive ? s.idx : g.idx;

      s.pMouth = pMouth;
      s.idx = idx;
      s.live = blowingLive;

      // local register hysteresis (mirrors the worklet, keeps visuals honest).
      if (!s.over && pMouth > OVERBLOW) s.over = true;
      if (s.over && pMouth < OVERBLOW_REL) s.over = false;

      // local visual envelope (alive with or without audio output).
      const target = pMouth > ONSET ? Math.min(1, (pMouth - 0.22) * 1.8) : 0;
      s.localAmp += (target - s.localAmp) * (target > s.localAmp ? 0.06 : 0.02);

      // 4. drive the audio worklet.
      const eng = engineRef.current;
      if (eng && audioOnRef.current) {
        eng.node.port.postMessage({ type: "ctl", pressure: pMouth, freq: SCALE[idx].freq });
      }

      drawScene(c2d, { W, H, dt });
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const stream = streamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
        streamRef.current = null;
      }
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.node.port.postMessage({ type: "ctl", pressure: 0 });
          eng.node.disconnect();
          eng.master.disconnect();
          URL.revokeObjectURL(eng.url);
          void eng.ctx.close();
        } catch {
          /* ignore */
        }
        engineRef.current = null;
      }
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-5 py-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 1694 · reed column
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Reed Column</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Blow into your mic and it becomes a real clarinet: a self-oscillating
          single-reed woodwind whose exciter is your actual breath. A cylindrical
          digital-waveguide bore with an STK reed nonlinearity — silent until you
          blow past threshold, hollow with odd harmonics, and it overblows to the
          twelfth when you push harder. Slide the pointer across the bore to pick
          the note.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {!running ? (
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start blowing
          </button>
        ) : micState === "on" ? (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Blow into the mic · slide the pointer to change the note
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              const eng = engineRef.current;
              if (eng) void enableMic(eng.ctx);
            }}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enable mic
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowNotes((v) => !v)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showNotes ? "Hide" : "Read the"} design notes
        </button>
      </div>

      {audioError ? <p className="text-base text-destructive">{audioError}</p> : null}
      {micState === "denied" ? (
        <p className="text-base text-destructive">
          Mic access was denied — the deterministic ghost keeps playing. Allow the
          microphone and press “Enable mic” to blow it yourself.
        </p>
      ) : null}

      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-black">
        <canvas ref={canvasRef} className="h-full w-full touch-none" style={{ display: "block" }} />
      </div>

      {showNotes ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-4 text-base text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">How it works</h2>
          <p>
            The bore is a single delay line — a cylindrical clarinet tube. Each
            round trip is terminated by a sign-inverting, lossy one-pole reflection
            at the open bell and, at the mouthpiece, by the reed. Every audio
            sample we compute the pressure difference across the reed,{" "}
            <span className="font-mono text-xs">Δp = pBore − pMouth</span>, and pass
            it through a nonlinear reed table (STK form,{" "}
            <span className="font-mono text-xs">r = offset + slope·Δp</span>, clamped):
            the reed closes as blowing pressure rises, and that pressure-controlled
            nonlinearity is what makes the column self-oscillate.
          </p>
          <p>
            The pitch is the bore length, not the breath — the breath only supplies
            energy, so below threshold the column is genuinely silent (no drone).
            Because the bore is cylindrical and closed at the reed, it favours odd
            harmonics and overblows to the 3rd harmonic: blow past the overblow
            threshold and a modelled register vent retunes the loop to a third of
            its length, jumping the note up a twelfth (not an octave). Your mic feeds
            an analyser only — never the speakers — so there is no feedback howl.
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            mic RMS = blowing pressure · pointer-x = bore length / note · harder
            breath = overblow to the twelfth
          </p>
        </section>
      ) : null}

      <PrototypeNav slugs={["1694-reed-column"]} />
    </main>
  );
}
