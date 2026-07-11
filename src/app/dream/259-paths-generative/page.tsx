"use client";

import { useRef, useEffect, useState, useCallback } from "react";

// ─── Constants ─────────────────────────────────────────────────────────────────

// Loop lengths in seconds — pairwise incommensurate (no two have integer ratio).
// Chosen so LCM >> 10 minutes, ensuring audible drift for the whole session.
const LOOP_LENGTHS = [11.3, 14.7, 18.1, 23.9, 29.3, 37.7];

// Playback rates per voice: octave-down, maj-third up, fifth, etc.
const PLAYBACK_RATES = [1.0, 0.5, 0.667, 0.75, 1.25, 1.5];

// Stereo positions: spread evenly L→R
const PAN_POSITIONS = [-0.8, -0.4, -0.1, 0.2, 0.5, 0.9];

// LFO frequencies (Hz) per voice — also incommensurate with each other
const LFO_FREQS = [0.023, 0.031, 0.041, 0.053, 0.061, 0.071];

// Movement durations (seconds) — state machine advances every ~90-150s
const MOVEMENT_MIN = 90;
const MOVEMENT_MAX = 150;

// Reverb impulse length (seconds)
const REVERB_DURATION = 4.5;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Voice {
  index: number;
  loopLength: number;
  playbackRate: number;
  pan: number;
  lfoFreq: number;
  lfoPhase: number;
  source: AudioBufferSourceNode | null;
  gainNode: GainNode;
  panNode: StereoPannerNode;
  active: boolean;
}

interface Movement {
  id: number;
  activeVoices: number[];
  filterCutoff: number;
  reverbWet: number;
  transpositionSet: number[];
  palette: [number, number, number]; // HSL hue, sat%, light%
  densityMultiplier: number;
}

interface EngineState {
  audioCtx: AudioContext;
  sourceBuffer: AudioBuffer;
  voices: Voice[];
  masterGain: GainNode;
  filterNode: BiquadFilterNode;
  reverbNode: ConvolverNode;
  reverbDryGain: GainNode;
  reverbWetGain: GainNode;
  movements: Movement[];
  currentMovementIndex: number;
  movementStartTime: number;
  nextMovementAt: number;
  startedAt: number;
  driftSpeed: number;
}

// ─── Pure helpers (prefixed with make/build/draw — not hooks) ──────────────────

function buildReverbImpulse(ctx: AudioContext, duration: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.floor(sr * duration);
  const buf = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.5);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buf;
}

async function buildDemoBuffer(): Promise<AudioBuffer> {
  // Synthesize a gentle piano-like arpeggiated phrase: Cmaj7 → Fmaj7 → Am7 → G
  // Each note = enveloped triangle/sine partials (approximates piano attack + decay)
  const sr = 44100;
  const noteDur = 1.2; // seconds per note onset span
  const decayTail = 2.0;

  const chords = [
    [261.63, 329.63, 392.0, 493.88], // Cmaj7
    [349.23, 440.0, 523.25, 659.25], // Fmaj7
    [220.0, 261.63, 329.63, 415.3], // Am7
    [196.0, 246.94, 293.66, 392.0], // G
  ];

  const arpeggioNotes: { freq: number; startSec: number }[] = [];
  let t = 0;
  for (const chord of chords) {
    for (const freq of chord) {
      arpeggioNotes.push({ freq, startSec: t });
      t += noteDur * 0.55;
    }
    t += 0.3;
  }
  const totalDur = t + decayTail + 1.0;

  const offline = new OfflineAudioContext(2, Math.ceil(sr * totalDur), sr);

  const partials: [number, number][] = [
    [1, 0.5],
    [2, 0.2],
    [3, 0.08],
    [4, 0.04],
  ];

  for (const { freq, startSec } of arpeggioNotes) {
    for (const [partial, amp] of partials) {
      const osc = offline.createOscillator();
      osc.type = partial === 1 ? "triangle" : "sine";
      osc.frequency.value = freq * partial;

      const gain = offline.createGain();
      gain.gain.setValueAtTime(0, startSec);
      gain.gain.linearRampToValueAtTime(amp * 0.18, startSec + 0.015);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        startSec + noteDur + decayTail
      );

      const pan = offline.createStereoPanner();
      pan.pan.value = (Math.random() - 0.5) * 0.3;

      osc.connect(gain);
      gain.connect(pan);
      pan.connect(offline.destination);
      osc.start(startSec);
      osc.stop(startSec + noteDur + decayTail);
    }
  }

  return offline.startRendering();
}

function makeReverb(ctx: AudioContext): ConvolverNode {
  const conv = ctx.createConvolver();
  conv.buffer = buildReverbImpulse(ctx, REVERB_DURATION);
  return conv;
}

function calcNextMovementDuration(driftSpeed: number): number {
  const base = MOVEMENT_MIN + Math.random() * (MOVEMENT_MAX - MOVEMENT_MIN);
  return base / driftSpeed;
}

function makeMovement(
  id: number,
  prevMovement: Movement | null
): Movement {
  const voiceCount = 3 + Math.floor(Math.random() * 3); // 3–5
  const shuffled = [...Array(LOOP_LENGTHS.length).keys()].sort(
    () => Math.random() - 0.5
  );
  const activeVoices = shuffled.slice(0, voiceCount).sort((a, b) => a - b);

  const prevCutoff = prevMovement?.filterCutoff ?? 1200;
  const filterCutoff = Math.max(
    200,
    Math.min(4000, prevCutoff + (Math.random() - 0.5) * 600)
  );

  const prevWet = prevMovement?.reverbWet ?? 0.5;
  const reverbWet = Math.max(
    0.2,
    Math.min(0.9, prevWet + (Math.random() - 0.5) * 0.3)
  );

  const prevHue = prevMovement?.palette[0] ?? 220;
  const hue = (prevHue + (Math.random() - 0.5) * 40 + 360) % 360;
  const sat = 30 + Math.random() * 30;
  const light = 8 + Math.random() * 12;

  const useAlt = id > 2 && Math.random() < 0.3;
  const transpositionSet = useAlt
    ? [0.5, 0.667, 0.75, 1.0, 1.25]
    : [...PLAYBACK_RATES];

  const densityMultiplier = 0.6 + Math.random() * 0.8;

  return {
    id,
    activeVoices,
    filterCutoff,
    reverbWet,
    transpositionSet,
    palette: [hue, sat, light],
    densityMultiplier,
  };
}

function startVoice(
  voice: Voice,
  buffer: AudioBuffer,
  ctx: AudioContext,
  movement: Movement
): void {
  if (voice.source) {
    try {
      voice.source.stop();
      voice.source.disconnect();
    } catch {
      // already stopped
    }
    voice.source = null;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;

  const bufDur = buffer.duration;
  const loopLen = Math.min(voice.loopLength, bufDur * 0.9);
  const maxStart = Math.max(bufDur - loopLen, 0.001);
  const loopStart = (voice.index / LOOP_LENGTHS.length) * maxStart;
  const loopEnd = Math.min(loopStart + loopLen, bufDur);

  src.loopStart = loopStart;
  src.loopEnd = loopEnd;

  const tSet = movement.transpositionSet;
  src.playbackRate.value = tSet[voice.index % tSet.length];

  src.connect(voice.gainNode);
  src.start(0, loopStart);
  voice.source = src;
  voice.active = true;
}

function stopVoice(voice: Voice): void {
  if (voice.source) {
    try {
      voice.source.stop();
      voice.source.disconnect();
    } catch {
      // fine
    }
    voice.source = null;
  }
  voice.active = false;
}

// ─── Canvas drawing helpers ────────────────────────────────────────────────────

function drawBackground(
  ctx2d: CanvasRenderingContext2D,
  W: number,
  H: number,
  hue: number,
  sat: number,
  light: number
): void {
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(W, H) * 0.7;
  const gradient = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, maxR);
  gradient.addColorStop(0, `hsla(${hue}, ${sat}%, ${light * 1.5}%, 1)`);
  gradient.addColorStop(1, `hsla(${(hue + 40) % 360}, ${sat * 0.7}%, ${light * 0.4}%, 1)`);
  ctx2d.fillStyle = gradient;
  ctx2d.fillRect(0, 0, W, H);
}

function drawVoiceRings(
  ctx2d: CanvasRenderingContext2D,
  W: number,
  H: number,
  voices: Voice[],
  movement: Movement,
  elapsedSec: number,
  gainValues: number[]
): void {
  const cx = W / 2;
  const cy = H / 2;
  const maxR = Math.min(W, H) * 0.42;
  const activeSet = new Set(movement.activeVoices);
  const [hue] = movement.palette;

  voices.forEach((voice, i) => {
    const isActive = activeSet.has(i);
    const gain = gainValues[i] ?? 0;
    const ringR = maxR * (0.25 + (i / voices.length) * 0.75);
    const ringThickness = isActive ? 2 + gain * 4 : 1;

    // Shorter loops rotate faster — you see them drift apart visually
    const rotationRate = 1.0 / voice.loopLength;
    const angle = elapsedSec * rotationRate * Math.PI * 2;

    const voiceHue = (hue + i * 40) % 360;
    const ringAlpha = isActive ? 0.3 + gain * 0.5 : 0.08;

    ctx2d.strokeStyle = `hsla(${voiceHue}, 80%, 65%, ${ringAlpha})`;
    ctx2d.lineWidth = ringThickness;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx2d.stroke();

    // Playhead marker dot
    const px = cx + Math.cos(angle) * ringR;
    const py = cy + Math.sin(angle) * ringR;
    const markerAlpha = isActive ? 0.7 + gain * 0.3 : 0.15;
    const markerR = isActive ? 3 + gain * 3 : 2;

    ctx2d.beginPath();
    ctx2d.arc(px, py, markerR, 0, Math.PI * 2);
    ctx2d.fillStyle = `hsla(${voiceHue}, 90%, 80%, ${markerAlpha})`;
    ctx2d.fill();

    // Arc trail behind playhead for active voices
    if (isActive && gain > 0.05) {
      const trailLen = 0.3 + gain * 0.5;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, ringR, angle - trailLen, angle);
      ctx2d.strokeStyle = `hsla(${voiceHue}, 80%, 65%, ${gain * 0.35})`;
      ctx2d.lineWidth = ringThickness * 1.5;
      ctx2d.stroke();
    }
  });
}

function drawHUD(
  ctx2d: CanvasRenderingContext2D,
  H: number,
  elapsedSec: number,
  movementId: number,
  activeCount: number
): void {
  const mins = Math.floor(elapsedSec / 60);
  const secs = Math.floor(elapsedSec % 60);
  const elapsed = `${mins}:${String(secs).padStart(2, "0")}`;

  ctx2d.font = "12px 'JetBrains Mono', ui-monospace, monospace";
  ctx2d.fillStyle = "rgba(255,255,255,0.5)";
  ctx2d.textAlign = "left";
  ctx2d.fillText(
    `${elapsed}  ·  mvt ${movementId}  ·  ${activeCount} voices`,
    16,
    H - 16
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PathsGenerative() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineState | null>(null);
  const rafRef = useRef<number>(0);
  const movementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [trackId, setTrackId] = useState("");
  const [driftSpeed, setDriftSpeed] = useState(1.0);
  const [density, setDensity] = useState(1.0);
  const [movementNum, setMovementNum] = useState(1);
  const [activeVoiceCount, setActiveVoiceCount] = useState(0);
  const [elapsedDisplay, setElapsedDisplay] = useState("0:00");

  // ── Transition to next movement ──────────────────────────────────────────────

  const scheduleNextMovement = useCallback((engine: EngineState) => {
    if (movementTimerRef.current) clearTimeout(movementTimerRef.current);

    const dur = calcNextMovementDuration(engine.driftSpeed);
    movementTimerRef.current = setTimeout(() => {
      const eng = engineRef.current;
      if (!eng) return;

      const prevMovement = eng.movements[eng.currentMovementIndex];
      const newMovement = makeMovement(eng.movements.length + 1, prevMovement);
      eng.movements.push(newMovement);
      eng.currentMovementIndex = eng.movements.length - 1;
      eng.movementStartTime = eng.audioCtx.currentTime;

      // Smoothly ramp filter + reverb to new values
      const rampTime = eng.audioCtx.currentTime + 8;
      eng.filterNode.frequency.linearRampToValueAtTime(
        newMovement.filterCutoff,
        rampTime
      );
      eng.reverbWetGain.gain.linearRampToValueAtTime(
        newMovement.reverbWet,
        rampTime
      );
      eng.reverbDryGain.gain.linearRampToValueAtTime(
        1 - newMovement.reverbWet * 0.5,
        rampTime
      );

      // Activate/deactivate voices
      const activeSet = new Set(newMovement.activeVoices);
      eng.voices.forEach((v, i) => {
        if (activeSet.has(i) && !v.active) {
          startVoice(v, eng.sourceBuffer, eng.audioCtx, newMovement);
          v.gainNode.gain.setValueAtTime(0, eng.audioCtx.currentTime);
        } else if (!activeSet.has(i) && v.active) {
          v.gainNode.gain.linearRampToValueAtTime(
            0,
            eng.audioCtx.currentTime + 6
          );
          const capturedVoice = v;
          setTimeout(() => stopVoice(capturedVoice), 7000);
        }
      });

      setMovementNum(newMovement.id);
      setActiveVoiceCount(newMovement.activeVoices.length);
      scheduleNextMovement(eng);
    }, dur * 1000);
  }, []); // refs only, no external dep

  // ── Build and start the generative engine ────────────────────────────────────

  const startEngine = useCallback(
    async (buffer: AudioBuffer, isDemo: boolean) => {
      // Tear down previous engine
      if (engineRef.current) {
        engineRef.current.voices.forEach(stopVoice);
        try {
          await engineRef.current.audioCtx.close();
        } catch {
          // fine
        }
        engineRef.current = null;
      }
      if (movementTimerRef.current) clearTimeout(movementTimerRef.current);

      const ctx = new AudioContext();

      // Signal chain: voices → gains → pans → reverb split → filter → master
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.75;
      masterGain.connect(ctx.destination);

      const filterNode = ctx.createBiquadFilter();
      filterNode.type = "lowpass";
      filterNode.frequency.value = 1200;
      filterNode.Q.value = 0.7;
      filterNode.connect(masterGain);

      const reverbNode = makeReverb(ctx);
      const reverbDryGain = ctx.createGain();
      const reverbWetGain = ctx.createGain();
      reverbDryGain.gain.value = 0.75;
      reverbWetGain.gain.value = 0.5;

      reverbNode.connect(reverbWetGain);
      reverbWetGain.connect(filterNode);
      reverbDryGain.connect(filterNode);

      const firstMovement = makeMovement(1, null);

      // Build voice graph nodes
      const voices: Voice[] = LOOP_LENGTHS.map((len, i) => {
        const gainNode = ctx.createGain();
        gainNode.gain.value = 0;

        const panNode = ctx.createStereoPanner();
        panNode.pan.value = PAN_POSITIONS[i];

        gainNode.connect(panNode);
        panNode.connect(reverbDryGain);
        panNode.connect(reverbNode);

        return {
          index: i,
          loopLength: len,
          playbackRate: PLAYBACK_RATES[i],
          pan: PAN_POSITIONS[i],
          lfoFreq: LFO_FREQS[i],
          lfoPhase: (i / LOOP_LENGTHS.length) * Math.PI * 2,
          source: null,
          gainNode,
          panNode,
          active: false,
        };
      });

      // Start active voices with fade-in
      const activeSet = new Set(firstMovement.activeVoices);
      voices.forEach((v, i) => {
        if (activeSet.has(i)) {
          startVoice(v, buffer, ctx, firstMovement);
          v.gainNode.gain.setValueAtTime(0, ctx.currentTime);
          v.gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 3);
        }
      });

      const engine: EngineState = {
        audioCtx: ctx,
        sourceBuffer: buffer,
        voices,
        masterGain,
        filterNode,
        reverbNode,
        reverbDryGain,
        reverbWetGain,
        movements: [firstMovement],
        currentMovementIndex: 0,
        movementStartTime: ctx.currentTime,
        nextMovementAt: ctx.currentTime + 120,
        startedAt: Date.now(),
        driftSpeed,
      };

      engineRef.current = engine;
      setUsingDemo(isDemo);
      setPlaying(true);
      setMovementNum(1);
      setActiveVoiceCount(firstMovement.activeVoices.length);
      scheduleNextMovement(engine);
    },
    [driftSpeed, scheduleNextMovement]
  );

  // ── Load audio from API ───────────────────────────────────────────────────────

  const loadFromApi = useCallback(async () => {
    if (!trackId.trim()) return;
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/audio/${encodeURIComponent(trackId.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      let arrayBuf: ArrayBuffer;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        const json = (await res.json()) as { url: string };
        const audioRes = await fetch(json.url);
        if (!audioRes.ok)
          throw new Error(`Audio fetch HTTP ${audioRes.status}`);
        arrayBuf = await audioRes.arrayBuffer();
      } else {
        arrayBuf = await res.arrayBuffer();
      }

      const tempCtx = new AudioContext();
      const decoded = await tempCtx.decodeAudioData(arrayBuf);
      await tempCtx.close();
      await startEngine(decoded, false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(
        `Could not load track "${trackId}": ${msg}. Falling back to demo.`
      );
      const demo = await buildDemoBuffer();
      await startEngine(demo, true);
    }
  }, [trackId, startEngine]);

  // ── File input handler ────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg(null);
      try {
        const arrayBuf = await file.arrayBuffer();
        const tempCtx = new AudioContext();
        const decoded = await tempCtx.decodeAudioData(arrayBuf);
        await tempCtx.close();
        await startEngine(decoded, false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMsg(`Could not decode "${file.name}": ${msg}`);
      }
    },
    [startEngine]
  );

  // ── Stop engine ───────────────────────────────────────────────────────────────

  const stopEngine = useCallback(async () => {
    if (movementTimerRef.current) clearTimeout(movementTimerRef.current);
    cancelAnimationFrame(rafRef.current);

    if (engineRef.current) {
      engineRef.current.voices.forEach(stopVoice);
      try {
        await engineRef.current.audioCtx.close();
      } catch {
        // fine
      }
      engineRef.current = null;
    }

    setPlaying(false);
    setUsingDemo(false);
    setMovementNum(1);
    setActiveVoiceCount(0);
    setElapsedDisplay("0:00");
  }, []);

  // ── Start demo ────────────────────────────────────────────────────────────────

  const startDemo = useCallback(async () => {
    setErrorMsg(null);
    try {
      const buf = await buildDemoBuffer();
      await startEngine(buf, true);
    } catch (e) {
      setErrorMsg(
        `Demo synthesis failed: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }, [startEngine]);

  // ── Animation + LFO loop ──────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let frameId = 0;

    const loop = () => {
      frameId = requestAnimationFrame(loop);
      rafRef.current = frameId;

      const W = canvas.width;
      const H = canvas.height;
      const eng = engineRef.current;

      if (!eng || !playing) {
        // Idle state — dark background + faint ring outlines
        ctx2d.fillStyle = "#080810";
        ctx2d.fillRect(0, 0, W, H);
        const cx = W / 2;
        const cy = H / 2;
        [0.25, 0.38, 0.51, 0.63, 0.74, 0.84].forEach((r, i) => {
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, Math.min(W, H) * r * 0.5, 0, Math.PI * 2);
          ctx2d.strokeStyle = `rgba(140,100,255,${0.03 + i * 0.01})`;
          ctx2d.lineWidth = 1;
          ctx2d.stroke();
        });
        return;
      }

      const now = eng.audioCtx.currentTime;
      const elapsed = (Date.now() - eng.startedAt) / 1000;

      // Update elapsed display state (cheap — React batches these)
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      setElapsedDisplay(`${mins}:${String(secs).padStart(2, "0")}`);

      const movement = eng.movements[eng.currentMovementIndex];
      const activeSet = new Set(movement.activeVoices);

      // Compute LFO-modulated gain per voice and apply smoothly
      const gainValues: number[] = eng.voices.map((v) => {
        const lfo =
          0.5 +
          0.5 * Math.sin(now * v.lfoFreq * Math.PI * 2 + v.lfoPhase);
        const targetGain = activeSet.has(v.index)
          ? lfo * 0.4 * movement.densityMultiplier * density
          : 0;

        const current = v.gainNode.gain.value;
        const smoothed = current + (targetGain - current) * 0.005;
        v.gainNode.gain.setValueAtTime(smoothed, now);

        return smoothed;
      });

      // Draw canvas
      const [hue, sat, light] = movement.palette;
      drawBackground(ctx2d, W, H, hue, sat, light);
      drawVoiceRings(ctx2d, W, H, eng.voices, movement, elapsed, gainValues);
      drawHUD(ctx2d, H, elapsed, movement.id, movement.activeVoices.length);
    };

    frameId = requestAnimationFrame(loop);
    rafRef.current = frameId;

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [playing, density]);

  // ── Canvas resize observer ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resize = () => {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  // ── Sync driftSpeed to engine ──────────────────────────────────────────────────

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.driftSpeed = driftSpeed;
    }
  }, [driftSpeed]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (movementTimerRef.current) clearTimeout(movementTimerRef.current);
      cancelAnimationFrame(rafRef.current);
      if (engineRef.current) {
        engineRef.current.voices.forEach(stopVoice);
        engineRef.current.audioCtx.close().catch(() => {});
        engineRef.current = null;
      }
    };
  }, []);

  // ── Drag-and-drop ─────────────────────────────────────────────────────────────

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#080810] text-foreground flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div>
          <h1 className="text-2xl font-light tracking-wide text-foreground">
            Paths Generative
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-0.5">
            endless, never-repeating ambient · incommensurate tape loops
          </p>
        </div>
        <a
          href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/259-paths-generative/README.md"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-violet-300 hover:text-violet-200 transition-colors shrink-0 ml-4"
        >
          Read the design notes&thinsp;↗
        </a>
      </header>

      {/* Canvas area */}
      <div
        className="relative flex-1 min-h-[280px]"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/* Idle overlay */}
        {!playing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-muted-foreground text-base font-mono text-center px-6">
              Drop a piano recording here, load by track ID, or press{" "}
              <span className="text-violet-300/95">Start Demo</span>
            </p>
          </div>
        )}

        {/* Demo notice */}
        {playing && usingDemo && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 pointer-events-none text-center">
            <p className="text-muted-foreground text-sm font-mono">
              Playing a generated demo — drop your own piano recording to transform it.
            </p>
          </div>
        )}
      </div>

      {/* HUD readout bar */}
      {playing && (
        <div className="flex items-center gap-6 px-6 py-2 border-t border-border bg-black/20 text-xs font-mono text-muted-foreground flex-shrink-0">
          <span>
            <span className="text-violet-300/95">elapsed</span>{" "}
            {elapsedDisplay}
          </span>
          <span>
            <span className="text-violet-300">movement</span> {movementNum}
          </span>
          <span>
            <span className="text-violet-300/95">voices</span> {activeVoiceCount}
            {" / "}
            {LOOP_LENGTHS.length}
          </span>
        </div>
      )}

      {/* Controls panel */}
      <div className="border-t border-border bg-black/30 px-6 py-5 flex flex-col gap-4 flex-shrink-0">
        {/* Error notice */}
        {errorMsg && (
          <p className="text-violet-300 text-sm font-mono">{errorMsg}</p>
        )}

        {/* Row 1: file input + track ID loader */}
        <div className="flex flex-wrap gap-3 items-stretch">
          <label className="flex-1 min-w-[200px] flex items-center justify-center gap-2 border border-dashed border-border rounded-lg px-4 py-2.5 min-h-[44px] text-muted-foreground text-sm cursor-pointer hover:border-violet-400/50 hover:text-foreground transition-colors">
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            Drop or choose a piano recording
          </label>

          <div className="flex gap-2 items-center flex-1 min-w-[200px]">
            <input
              type="text"
              value={trackId}
              onChange={(e) => setTrackId(e.target.value)}
              placeholder="Resonance track ID…"
              className="flex-1 bg-muted border border-border rounded-lg px-4 py-2.5 min-h-[44px] text-base text-foreground placeholder-muted-foreground font-mono focus:outline-none focus:border-violet-400/50"
              onKeyDown={(e) => {
                if (e.key === "Enter") loadFromApi();
              }}
            />
            <button
              onClick={loadFromApi}
              className="px-4 py-2.5 min-h-[44px] rounded-lg bg-violet-600/30 hover:bg-violet-600/50 text-violet-300 text-sm font-mono transition-colors border border-violet-500/30"
            >
              Load
            </button>
          </div>
        </div>

        {/* Row 2: start/stop + sliders */}
        <div className="flex flex-wrap gap-3 items-center">
          {!playing ? (
            <button
              onClick={startDemo}
              className="px-6 py-2.5 min-h-[44px] rounded-lg bg-violet-700/40 hover:bg-violet-700/60 text-violet-300/95 font-mono text-sm transition-colors border border-violet-600/30"
            >
              Start Demo
            </button>
          ) : (
            <button
              onClick={stopEngine}
              className="px-6 py-2.5 min-h-[44px] rounded-lg bg-muted hover:bg-accent text-foreground font-mono text-sm transition-colors border border-border"
            >
              Stop
            </button>
          )}

          <label className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
            <span>drift</span>
            <input
              type="range"
              min="0.3"
              max="3.0"
              step="0.1"
              value={driftSpeed}
              onChange={(e) => setDriftSpeed(parseFloat(e.target.value))}
              className="w-28 accent-violet-400"
            />
            <span className="w-8 text-violet-300">{driftSpeed.toFixed(1)}×</span>
          </label>

          <label className="flex items-center gap-3 text-sm text-muted-foreground font-mono">
            <span>density</span>
            <input
              type="range"
              min="0.2"
              max="2.0"
              step="0.1"
              value={density}
              onChange={(e) => setDensity(parseFloat(e.target.value))}
              className="w-28 accent-violet-400"
            />
            <span className="w-8 text-violet-300/95">
              {density.toFixed(1)}×
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
