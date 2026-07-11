"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// ── constants ──────────────────────────────────────────────────────────────────

const N_SLOTS = 4;
const CROSSFADE_SAMPLES = 2205; // ~50ms at 44100 Hz
const BPM_DEFAULT = 80;

// matches 1-live band palette: sub-bass, low-mid, high-mid, mid
const SLOT_COLORS: [number, number, number][] = [
  [88, 32, 192],   // violet  — slot 0
  [80, 220, 100],  // green   — slot 1
  [255, 150, 40],  // orange  — slot 2
  [240, 220, 70],  // yellow  — slot 3
];

type SlotState = "empty" | "recording" | "playing" | "muted";

// ── audio state (refs — mutable, not React state) ──────────────────────────────

interface SlotAudio {
  state: SlotState;
  bars: 1 | 2 | 4;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  startTime: number;   // AudioContext.currentTime when loop started
  loopDur: number;     // loop duration in seconds
  waveform: number[];  // 120 normalized points for canvas
}

function makeSlot(): SlotAudio {
  return {
    state: "empty",
    bars: 2,
    buffer: null,
    source: null,
    gainNode: null,
    startTime: 0,
    loopDur: 0,
    waveform: [],
  };
}

// ── helpers ────────────────────────────────────────────────────────────────────

function applyCrossfade(buf: AudioBuffer, fadeSamples: number): void {
  const len = buf.length;
  const fade = Math.min(fadeSamples, Math.floor(len / 4));
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[i] *= t;
      data[len - 1 - i] *= t;
    }
  }
}

function buildWaveform(buf: AudioBuffer, points: number): number[] {
  const data = buf.getChannelData(0);
  const step = Math.floor(data.length / points);
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    let peak = 0;
    for (let j = 0; j < step; j++) {
      peak = Math.max(peak, Math.abs(data[i * step + j] || 0));
    }
    out.push(peak);
  }
  return out;
}

function barDuration(bpm: number, bars: number): number {
  return (60 / bpm) * 4 * bars;
}

function nextBarTime(
  originTime: number,
  barLen: number,
  nowCtx: number
): number {
  if (nowCtx <= originTime) return originTime;
  const elapsed = nowCtx - originTime;
  const beats = Math.ceil(elapsed / barLen);
  return originTime + beats * barLen;
}

// ── demo loop synthesis ────────────────────────────────────────────────────────

async function synthDemoLoop(
  sampleRate: number,
  durationSec: number,
  kind: "bass" | "phrase" | "arp" | "click"
): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(1, Math.ceil(durationSec * sampleRate), sampleRate);

  if (kind === "bass") {
    // Sub-bass drone: two detuned sines at 55 Hz + slight vibrato
    for (const detune of [0, 7]) {
      const osc = off.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 55;
      osc.detune.value = detune;
      const g = off.createGain();
      g.gain.value = 0.45;
      osc.connect(g);
      g.connect(off.destination);
      osc.start(0);
      osc.stop(durationSec);
    }
  } else if (kind === "phrase") {
    // Piano-like phrase: 4 notes across 2 bars
    const notes = [261.6, 329.6, 392.0, 523.3]; // C4 E4 G4 C5
    const dur = durationSec / notes.length;
    notes.forEach((freq, i) => {
      const t = i * dur;
      const osc = off.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const env = off.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.5, t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.25, t + 0.15);
      env.gain.setValueAtTime(0.25, t + dur - 0.12);
      env.gain.linearRampToValueAtTime(0, t + dur - 0.01);
      osc.connect(env);
      env.connect(off.destination);
      osc.start(t);
      osc.stop(t + dur);
    });
  } else if (kind === "arp") {
    // High arpeggio: 8 16th-note steps
    const notes = [523.3, 659.3, 783.9, 987.8, 1046.5, 783.9, 659.3, 523.3]; // C5 E5 G5 B5 C6…
    const dur = durationSec / notes.length;
    notes.forEach((freq, i) => {
      const t = i * dur;
      const osc = off.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const env = off.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.3, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
      osc.connect(env);
      env.connect(off.destination);
      osc.start(t);
      osc.stop(t + dur);
    });
  } else {
    // Rhythmic click: quarter-note white noise bursts
    const beatDur = durationSec / (4 * 2); // 4 beats × 2 bars
    const totalBeats = Math.floor(durationSec / beatDur);
    for (let i = 0; i < totalBeats; i++) {
      const t = i * beatDur;
      const buf = off.createBuffer(1, Math.ceil(off.sampleRate * 0.04), off.sampleRate);
      const d = buf.getChannelData(0);
      for (let s = 0; s < d.length; s++) d[s] = (Math.random() * 2 - 1) * Math.exp(-s / (off.sampleRate * 0.008));
      const src = off.createBufferSource();
      src.buffer = buf;
      const g = off.createGain();
      g.gain.value = i % 4 === 0 ? 0.55 : 0.3; // accent downbeat
      src.connect(g);
      g.connect(off.destination);
      src.start(t);
    }
  }

  return off.startRendering();
}

// ── component ──────────────────────────────────────────────────────────────────

export default function LoopStation() {
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const slotsRef = useRef<SlotAudio[]>(
    Array.from({ length: N_SLOTS }, makeSlot)
  );
  const recChunksRef = useRef<Float32Array[]>([]);
  const recSlotRef = useRef(-1);
  const originTimeRef = useRef(0);
  const hasOriginRef = useRef(false);
  const animRef = useRef(0);
  // ScriptProcessor reference kept only for teardown
  const procRef = useRef<ScriptProcessorNode | null>(null);

  const [bpm, setBpm] = useState(BPM_DEFAULT);
  const bpmRef = useRef(BPM_DEFAULT);
  const tapTimesRef = useRef<number[]>([]);

  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  // display state — updated from slotsRef in animation loop
  const [displaySlots, setDisplaySlots] = useState<
    { state: SlotState; bars: 1 | 2 | 4; playhead: number; waveform: number[] }[]
  >(
    Array.from({ length: N_SLOTS }, () => ({
      state: "empty" as SlotState,
      bars: 2 as 1 | 2 | 4,
      playhead: 0,
      waveform: [],
    }))
  );

  // ── audio context init ────────────────────────────────────────────────────────

  function ensureCtx(): AudioContext {
    if (!ctxRef.current) {
      const Ctx =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctxRef.current = new Ctx();
    }
    if (ctxRef.current.state === "suspended") {
      void ctxRef.current.resume();
    }
    return ctxRef.current;
  }

  // ── mic setup ─────────────────────────────────────────────────────────────────

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      setMicReady(true);
      setMicError(null);
    } catch (e) {
      setMicError(e instanceof Error ? e.message : "Mic unavailable");
    }
  }, []);

  // ── demo loader ───────────────────────────────────────────────────────────────

  const loadDemo = useCallback(async () => {
    setDemoLoading(true);
    const ctx = ensureCtx();
    const kinds: Array<"bass" | "phrase" | "arp" | "click"> = [
      "bass", "phrase", "arp", "click",
    ];
    const dur = barDuration(BPM_DEFAULT, 2);
    const slots = slotsRef.current;

    await Promise.all(
      kinds.map(async (kind, i) => {
        const buf = await synthDemoLoop(ctx.sampleRate, dur, kind);
        applyCrossfade(buf, CROSSFADE_SAMPLES);
        const slot = slots[i];
        slot.buffer = buf;
        slot.bars = 2;
        slot.loopDur = dur;
        slot.waveform = buildWaveform(buf, 120);
      })
    );

    // Start all 4 demo loops phase-locked at next beat boundary
    if (!hasOriginRef.current) {
      originTimeRef.current = ctx.currentTime + 0.05;
      hasOriginRef.current = true;
    }

    const bpmVal = bpmRef.current;
    const barLen = barDuration(bpmVal, 2);
    const startAt = nextBarTime(originTimeRef.current, barLen, ctx.currentTime + 0.05);

    slots.forEach((slot, i) => {
      if (!slot.buffer) return;
      const g = ctx.createGain();
      g.gain.value = 1;
      g.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = slot.buffer;
      src.loop = true;
      src.loopEnd = slot.loopDur;
      src.connect(g);
      src.start(startAt);
      slot.source = src;
      slot.gainNode = g;
      slot.startTime = startAt;
      slot.state = "playing";
      slotsRef.current[i] = slot;
    });

    setDemoLoaded(true);
    setDemoLoading(false);
  }, []);

  // ── record / stop-record ──────────────────────────────────────────────────────

  const pressRec = useCallback(
    (slotIdx: number) => {
      const ctx = ensureCtx();
      const slot = slotsRef.current[slotIdx];

      if (slot.state === "recording") {
        // ── stop recording → close loop ──────────────────────────────────────
        if (procRef.current) {
          procRef.current.disconnect();
          procRef.current = null;
        }

        const chunks = recChunksRef.current;
        if (chunks.length === 0) {
          slot.state = "empty";
          setDisplaySlots((prev) =>
            prev.map((s, i) => (i === slotIdx ? { ...s, state: "empty" } : s))
          );
          return;
        }

        const totalSamples = chunks.reduce((acc, c) => acc + c.length, 0);
        const bpmVal = bpmRef.current;
        const barLen = barDuration(bpmVal, slot.bars) * ctx.sampleRate;
        const targetLen = Math.round(barLen);
        const len = Math.min(totalSamples, targetLen);

        const audioBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = audioBuf.getChannelData(0);
        let offset = 0;
        for (const chunk of chunks) {
          const take = Math.min(chunk.length, len - offset);
          data.set(chunk.subarray(0, take), offset);
          offset += take;
          if (offset >= len) break;
        }

        applyCrossfade(audioBuf, CROSSFADE_SAMPLES);
        slot.buffer = audioBuf;
        slot.loopDur = audioBuf.length / ctx.sampleRate;
        slot.waveform = buildWaveform(audioBuf, 120);

        // schedule start at next bar boundary
        if (!hasOriginRef.current) {
          originTimeRef.current = ctx.currentTime;
          hasOriginRef.current = true;
        }
        const barDurSec = barDuration(bpmVal, slot.bars);
        const startAt = nextBarTime(
          originTimeRef.current,
          barDurSec,
          ctx.currentTime + 0.02
        );

        if (slot.source) {
          slot.source.stop();
          slot.source = null;
        }
        if (!slot.gainNode) {
          const g = ctx.createGain();
          g.gain.value = 1;
          g.connect(ctx.destination);
          slot.gainNode = g;
        }

        const src = ctx.createBufferSource();
        src.buffer = audioBuf;
        src.loop = true;
        src.loopEnd = slot.loopDur;
        src.connect(slot.gainNode);
        src.start(startAt);
        slot.source = src;
        slot.startTime = startAt;
        slot.state = "playing";

        recChunksRef.current = [];
        recSlotRef.current = -1;

        setDisplaySlots((prev) =>
          prev.map((s, i) =>
            i === slotIdx ? { ...s, state: "playing", waveform: slot.waveform } : s
          )
        );
        return;
      }

      if (slot.state === "playing") {
        // ── overdub: mix new recording on top ────────────────────────────────
        // For simplicity: mute slot, record new layer, mix on stop
        slot.gainNode?.gain.setValueAtTime(0.5, ctx.currentTime);
      }

      // ── start recording ──────────────────────────────────────────────────────
      if (!streamRef.current) {
        setMicError("Start mic first.");
        return;
      }

      // Stop any existing source in this slot (if overdubbing)
      const wasPlaying = slot.state === "playing";
      const prevBuf = wasPlaying ? slot.buffer : null;

      recChunksRef.current = [];
      recSlotRef.current = slotIdx;
      slot.state = "recording";

      const source = ctx.createMediaStreamSource(streamRef.current);
      const proc = ctx.createScriptProcessor(2048, 1, 1);
      procRef.current = proc;

      proc.onaudioprocess = (e: AudioProcessingEvent) => {
        const input = e.inputBuffer.getChannelData(0);
        recChunksRef.current.push(new Float32Array(input));
      };

      source.connect(proc);
      // connect to destination is required to keep the processor alive
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      proc.connect(silentGain);
      silentGain.connect(ctx.destination);

      // if overdubbing, keep track of the previous buffer to mix later
      // by storing it on the slot temporarily
      if (wasPlaying && prevBuf) {
        (slot as SlotAudio & { _prevBuf?: AudioBuffer })._prevBuf = prevBuf;
      }

      setDisplaySlots((prev) =>
        prev.map((s, i) => (i === slotIdx ? { ...s, state: "recording" } : s))
      );
    },
    []
  );

  // ── mute / unmute ─────────────────────────────────────────────────────────────

  const toggleMute = useCallback((slotIdx: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const slot = slotsRef.current[slotIdx];
    if (slot.state === "playing") {
      slot.gainNode?.gain.setValueAtTime(0, ctx.currentTime + 0.01);
      slot.state = "muted";
      setDisplaySlots((prev) =>
        prev.map((s, i) => (i === slotIdx ? { ...s, state: "muted" } : s))
      );
    } else if (slot.state === "muted") {
      slot.gainNode?.gain.setValueAtTime(1, ctx.currentTime + 0.01);
      slot.state = "playing";
      setDisplaySlots((prev) =>
        prev.map((s, i) => (i === slotIdx ? { ...s, state: "playing" } : s))
      );
    }
  }, []);

  // ── clear slot ────────────────────────────────────────────────────────────────

  const clearSlot = useCallback((slotIdx: number) => {
    const ctx = ctxRef.current;
    const slot = slotsRef.current[slotIdx];

    if (slot.source) {
      try { slot.source.stop(); } catch { /* already stopped */ }
      slot.source = null;
    }
    if (slot.gainNode) {
      slot.gainNode.disconnect();
      slot.gainNode = null;
    }
    if (recSlotRef.current === slotIdx && procRef.current) {
      procRef.current.disconnect();
      procRef.current = null;
      recChunksRef.current = [];
      recSlotRef.current = -1;
    }

    slotsRef.current[slotIdx] = { ...makeSlot(), bars: slot.bars };

    // resume context if it was suspended
    void ctx?.resume();

    setDisplaySlots((prev) =>
      prev.map((s, i) =>
        i === slotIdx ? { state: "empty", bars: s.bars, playhead: 0, waveform: [] } : s
      )
    );
  }, []);

  // ── set bars ──────────────────────────────────────────────────────────────────

  const setBars = useCallback((slotIdx: number, bars: 1 | 2 | 4) => {
    slotsRef.current[slotIdx].bars = bars;
    setDisplaySlots((prev) =>
      prev.map((s, i) => (i === slotIdx ? { ...s, bars } : s))
    );
  }, []);

  // ── BPM tap ───────────────────────────────────────────────────────────────────

  const tapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current;
    taps.push(now);
    if (taps.length > 8) taps.shift();
    if (taps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < taps.length; i++) intervals.push(taps[i] - taps[i - 1]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = Math.round(60000 / avg);
      if (newBpm >= 40 && newBpm <= 220) {
        bpmRef.current = newBpm;
        setBpm(newBpm);
      }
    }
  }, []);

  // ── animation loop: update playheads ─────────────────────────────────────────

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ctx = ctxRef.current;
      if (!ctx) return;
      const nowCtx = ctx.currentTime;

      setDisplaySlots((prev) =>
        prev.map((s, i) => {
          const slot = slotsRef.current[i];
          if ((slot.state === "playing" || slot.state === "muted") && slot.loopDur > 0) {
            const elapsed = (nowCtx - slot.startTime) % slot.loopDur;
            return { ...s, playhead: elapsed / slot.loopDur };
          }
          return s;
        })
      );
    };
    raf = requestAnimationFrame(tick);
    animRef.current = raf;
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── cleanup ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close();
    };
  }, []);

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#060610] text-foreground font-mono p-4 flex flex-col gap-4">
      {/* header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            LOOP STATION
          </h1>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            build a multi-layer performance in real time
          </p>
        </div>
        <Link
          href="/dream"
          className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          ← dream
        </Link>
      </div>

      {/* transport bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={tapTempo}
          className="px-3 py-1.5 bg-muted hover:bg-accent rounded text-xs transition-colors select-none"
        >
          TAP BPM
        </button>
        <span className="text-sm font-bold w-10 text-center">{bpm}</span>

        {!micReady ? (
          <button
            onClick={startMic}
            className="px-3 py-1.5 bg-muted hover:bg-accent rounded text-xs transition-colors"
          >
            🎤 Start mic
          </button>
        ) : (
          <span className="text-xs text-violet-400">🎤 mic live</span>
        )}

        {!demoLoaded && (
          <button
            onClick={loadDemo}
            disabled={demoLoading}
            className="px-3 py-1.5 bg-violet-700/60 hover:bg-violet-600/70 rounded text-xs transition-colors disabled:opacity-50"
          >
            {demoLoading ? "Loading…" : "▶ Load demo loops"}
          </button>
        )}

        {micError && (
          <span className="text-xs text-destructive">{micError}</span>
        )}
      </div>

      {/* slots */}
      <div className="flex flex-col gap-3 flex-1">
        {displaySlots.map((ds, i) => {
          const color = SLOT_COLORS[i];
          const rgb = `rgb(${color[0]},${color[1]},${color[2]})`;
          const isRec = ds.state === "recording";
          const isEmpty = ds.state === "empty";
          const isMuted = ds.state === "muted";

          return (
            <div
              key={i}
              className="rounded-lg border border-border p-3 flex flex-col gap-2"
              style={{ background: `rgba(${color[0]},${color[1]},${color[2]},0.06)` }}
            >
              {/* slot header */}
              <div className="flex items-center gap-3">
                {/* slot number */}
                <span
                  className="text-xs font-bold w-5 shrink-0"
                  style={{ color: rgb }}
                >
                  {i + 1}
                </span>

                {/* REC button */}
                <button
                  onClick={() => pressRec(i)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all shrink-0 ${
                    isRec
                      ? "bg-destructive animate-pulse text-foreground"
                      : "bg-destructive/40 hover:bg-destructive/60 text-destructive"
                  }`}
                >
                  {isRec ? "■ STOP" : "● REC"}
                </button>

                {/* bars selector */}
                <div className="flex gap-1 shrink-0">
                  {([1, 2, 4] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setBars(i, b)}
                      className={`px-2 py-0.5 rounded text-xs transition-colors ${
                        ds.bars === b
                          ? "bg-muted text-foreground"
                          : "bg-muted hover:bg-accent text-muted-foreground/70"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                  <span className="text-xs text-muted-foreground/70 self-center pl-1">bar{ds.bars !== 1 ? "s" : ""}</span>
                </div>

                {/* mute button */}
                <button
                  onClick={() => toggleMute(i)}
                  disabled={isEmpty || isRec}
                  className={`px-3 py-1 rounded text-xs transition-colors shrink-0 ${
                    isMuted
                      ? "bg-violet-600/60 text-violet-200"
                      : "bg-muted hover:bg-accent text-muted-foreground"
                  } disabled:opacity-20`}
                >
                  {isMuted ? "MUTED" : "MUTE"}
                </button>

                {/* clear */}
                <button
                  onClick={() => clearSlot(i)}
                  disabled={isEmpty}
                  className="px-3 py-1 rounded text-xs bg-muted hover:bg-accent text-muted-foreground/70 transition-colors shrink-0 disabled:opacity-20"
                >
                  CLEAR
                </button>

                {/* state label */}
                <span
                  className={`text-xs ml-auto ${
                    isRec
                      ? "text-destructive animate-pulse"
                      : ds.state === "playing"
                      ? "text-violet-400"
                      : isMuted
                      ? "text-violet-400"
                      : "text-muted-foreground/70"
                  }`}
                >
                  {ds.state.toUpperCase()}
                </span>
              </div>

              {/* waveform + playhead */}
              <SlotWaveform
                waveform={ds.waveform}
                playhead={ds.playhead}
                color={color}
                state={ds.state}
                recording={isRec}
              />
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div className="flex justify-between items-center text-xs text-muted-foreground/70 pt-2 border-t border-border">
        <span>tap all 4 slots together for phase-locked layering</span>
        <Link
          href="/dream/35-loop-station/README.md"
          className="hover:text-muted-foreground transition-colors"
        >
          design notes
        </Link>
      </div>
    </div>
  );
}

// ── waveform sub-component ─────────────────────────────────────────────────────

function SlotWaveform({
  waveform,
  playhead,
  color,
  state,
  recording,
}: {
  waveform: number[];
  playhead: number;
  color: [number, number, number];
  state: SlotState;
  recording: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gfx = canvas.getContext("2d");
    if (!gfx) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    gfx.scale(dpr, dpr);

    const [r, g, b] = color;

    const draw = () => {
      frameRef.current = requestAnimationFrame(draw);
      gfx.clearRect(0, 0, W, H);

      const midY = H / 2;

      if (recording) {
        // pulsing recording indicator
        const t = performance.now() / 400;
        const alpha = 0.3 + 0.4 * Math.abs(Math.sin(t));
        gfx.fillStyle = `rgba(220,50,50,${alpha})`;
        gfx.fillRect(0, 0, W, H);
        gfx.fillStyle = "rgba(255,255,255,0.6)";
        gfx.font = "11px monospace";
        gfx.textAlign = "center";
        gfx.fillText("● RECORDING…", W / 2, midY + 4);
        return;
      }

      if (waveform.length === 0) {
        gfx.strokeStyle = "rgba(255,255,255,0.07)";
        gfx.lineWidth = 1;
        gfx.beginPath();
        gfx.moveTo(0, midY);
        gfx.lineTo(W, midY);
        gfx.stroke();
        return;
      }

      // waveform bars
      const barW = W / waveform.length;
      const muted = state === "muted";
      gfx.fillStyle = muted
        ? `rgba(${r},${g},${b},0.25)`
        : `rgba(${r},${g},${b},0.65)`;

      for (let i = 0; i < waveform.length; i++) {
        const amp = waveform[i];
        const bH = Math.max(1, amp * (H - 4));
        gfx.fillRect(i * barW, midY - bH / 2, Math.max(1, barW - 1), bH);
      }

      // glow overlay
      if (!muted) {
        gfx.fillStyle = `rgba(${r},${g},${b},0.12)`;
        gfx.fillRect(0, 0, W, H);
      }

      // playhead
      if (state === "playing" || state === "muted") {
        const px = playhead * W;
        gfx.strokeStyle = "rgba(255,255,255,0.85)";
        gfx.lineWidth = 1.5;
        gfx.beginPath();
        gfx.moveTo(px, 0);
        gfx.lineTo(px, H);
        gfx.stroke();

        // shadow region played
        gfx.fillStyle = "rgba(0,0,0,0.25)";
        gfx.fillRect(px, 0, W - px, H);
      }
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameRef.current);
  }, [waveform, playhead, color, state, recording]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded"
      style={{ height: 48, background: "rgba(255,255,255,0.03)" }}
    />
  );
}
