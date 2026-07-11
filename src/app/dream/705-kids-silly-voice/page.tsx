"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// ----- types -----
type Phase = "intro" | "idle" | "recording" | "ready";
type SillyMode = "chipmunk" | "monster" | "backwards" | "robot" | "wobble";

type SillyButton = {
  mode: SillyMode;
  icon: string;
  color: string; // tailwind bg classes
  label: string;
};

const SILLY_BUTTONS: SillyButton[] = [
  { mode: "chipmunk", icon: "🐿️", color: "bg-violet-400", label: "chipmunk" },
  { mode: "monster", icon: "👹", color: "bg-violet-500", label: "monster" },
  { mode: "backwards", icon: "🔁", color: "bg-violet-400", label: "backwards" },
  { mode: "robot", icon: "🤖", color: "bg-violet-400", label: "robot" },
  { mode: "wobble", icon: "🌊", color: "bg-violet-400", label: "wobble" },
];

const RECORD_SECONDS = 1.8;

// ----- audio engine (kept outside React state for low latency) -----
type Engine = {
  ctx: AudioContext;
  master: GainNode; // capped, lowpass, compressor sit between this and destination
  padGain: GainNode;
  analyser: AnalyserNode;
  analyserData: Uint8Array<ArrayBuffer>;
};

function makeEngine(): Engine {
  const ctx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)();

  // kid-safe master chain: master gain -> lowpass -> compressor -> destination
  const master = ctx.createGain();
  master.gain.value = 0.32; // <= 0.35 cap

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7500;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  // analyser taps the master so the mouth lip-syncs to whatever plays
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  const analyserData = new Uint8Array(analyser.frequencyBinCount);

  master.connect(lowpass);
  lowpass.connect(comp);
  comp.connect(ctx.destination);
  master.connect(analyser);

  // gentle ambient pad so it is never fully silent
  const padGain = ctx.createGain();
  padGain.gain.value = 0.06;
  padGain.connect(master);

  return { ctx, master, padGain, analyser, analyserData };
}

function startPad(engine: Engine): void {
  const { ctx, padGain } = engine;
  // soft, warm, non-musical drone (two close detuned triangles + slow tremolo)
  const base = 90;
  [base, base * 1.5, base * 2].forEach((hz, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.22;
    // slow breathing tremolo
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.12 + i * 0.03;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    osc.connect(g);
    g.connect(padGain);
    osc.start();
    lfo.start();
  });
}

// reverse a copy of an AudioBuffer's channel data
function makeReversedBuffer(ctx: AudioContext, src: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(
    src.numberOfChannels,
    src.length,
    src.sampleRate
  );
  for (let c = 0; c < src.numberOfChannels; c++) {
    const inData = src.getChannelData(c);
    const outData = out.getChannelData(c);
    const n = inData.length;
    for (let i = 0; i < n; i++) {
      outData[i] = inData[n - 1 - i];
    }
  }
  return out;
}

// Play the recorded buffer transformed by a silly mode. Returns nodes for cleanup.
function playSilly(
  engine: Engine,
  buffer: AudioBuffer,
  mode: SillyMode
): { stop: () => void } {
  const { ctx, master } = engine;
  const src = ctx.createBufferSource();

  // small make-up gain so transformed voice is audible but stays under master cap
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0.9;

  const toCleanup: Array<{ stop: () => void } | OscillatorNode> = [];

  if (mode === "backwards") {
    src.buffer = makeReversedBuffer(ctx, buffer);
    src.playbackRate.value = 1;
    src.connect(voiceGain);
  } else if (mode === "chipmunk") {
    src.buffer = buffer;
    src.playbackRate.value = 1.85; // high & fast (varispeed)
    src.connect(voiceGain);
  } else if (mode === "monster") {
    src.buffer = buffer;
    src.playbackRate.value = 0.62; // low & slow (varispeed)
    src.connect(voiceGain);
  } else if (mode === "robot") {
    // ring modulation: voice * fast oscillator via gain modulation
    src.buffer = buffer;
    src.playbackRate.value = 1;
    const ringGain = ctx.createGain();
    ringGain.gain.value = 0; // will be driven entirely by the LFO
    const ringOsc = ctx.createOscillator();
    ringOsc.type = "square";
    ringOsc.frequency.value = 30; // ~30Hz buzzy robot
    const ringDepth = ctx.createGain();
    ringDepth.gain.value = 1;
    ringOsc.connect(ringDepth);
    ringDepth.connect(ringGain.gain);
    src.connect(ringGain);
    ringGain.connect(voiceGain);
    ringOsc.start();
    toCleanup.push(ringOsc);
  } else {
    // wobble: vibrato via a modulated delay line (warble)
    src.buffer = buffer;
    src.playbackRate.value = 1;
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.006;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 6.5; // warble speed
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.004;
    lfo.connect(lfoDepth);
    lfoDepth.connect(delay.delayTime);
    src.connect(delay);
    delay.connect(voiceGain);
    lfo.start();
    toCleanup.push(lfo);
  }

  voiceGain.connect(master);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      src.stop();
    } catch {
      /* already stopped */
    }
    toCleanup.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* ignore */
      }
    });
  };

  src.onended = stop;
  src.start();
  return { stop };
}

// Pre-baked silly sounds for the mic-denied fallback (boings, honks, pops).
function playPrebaked(engine: Engine, idx: number): void {
  const { ctx, master } = engine;
  const t = ctx.createGain();
  t.gain.value = 0.9;
  t.connect(master);

  const now = ctx.currentTime;
  if (idx === 0) {
    // boing: pitch dropping triangle
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(700, now);
    o.frequency.exponentialRampToValueAtTime(120, now + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.8, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o.connect(g);
    g.connect(t);
    o.start(now);
    o.stop(now + 0.55);
  } else if (idx === 1) {
    // honk: square pair
    [220, 277].forEach((hz) => {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.4, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      o.connect(g);
      g.connect(t);
      o.start(now);
      o.stop(now + 0.32);
    });
  } else if (idx === 2) {
    // pop: short sine blip rising
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(200, now);
    o.frequency.exponentialRampToValueAtTime(900, now + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.9, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o.connect(g);
    g.connect(t);
    o.start(now);
    o.stop(now + 0.14);
  } else if (idx === 3) {
    // wobble whistle
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = 500;
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 11;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    o.connect(g);
    g.connect(t);
    o.start(now);
    lfo.start(now);
    o.stop(now + 0.62);
    lfo.stop(now + 0.62);
  } else {
    // raspberry: noisy buzz via fast square + downward sweep
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(150, now);
    o.frequency.linearRampToValueAtTime(80, now + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.7, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    o.connect(g);
    g.connect(t);
    o.start(now);
    o.stop(now + 0.48);
  }
}

const PREBAKED: SillyButton[] = [
  { mode: "chipmunk", icon: "🪀", color: "bg-violet-400", label: "boing" },
  { mode: "monster", icon: "📯", color: "bg-violet-500", label: "honk" },
  { mode: "backwards", icon: "🎈", color: "bg-violet-400", label: "pop" },
  { mode: "robot", icon: "🛸", color: "bg-violet-400", label: "whistle" },
  { mode: "wobble", icon: "😝", color: "bg-violet-400", label: "raspberry" },
];

export default function KidsSillyVoice() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [micDenied, setMicDenied] = useState(false);
  const [canvasOk, setCanvasOk] = useState(true);
  const [activeMode, setActiveMode] = useState<SillyMode | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const recTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef<{ stop: () => void } | null>(null);

  // mouth / eye animation state read by the render loop
  const mouthRef = useRef(0.1); // 0..1 openness
  const eyeWiggleRef = useRef(0); // decays after each playback
  const phaseRef = useRef<Phase>("intro");
  phaseRef.current = phase;

  // ----- start: must happen inside the user gesture for iOS -----
  function runStart(): void {
    if (engineRef.current) return;
    try {
      const engine = makeEngine();
      engineRef.current = engine;
      // resume inside gesture
      void engine.ctx.resume();
      startPad(engine);
      setPhase("idle");
    } catch {
      setCanvasOk(true); // audio failed but keep UI; nothing else to do
    }
  }

  // ----- recording -----
  async function runStartRecording(): Promise<void> {
    const engine = engineRef.current;
    if (!engine || phaseRef.current === "recording") return;

    let stream = streamRef.current;
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      } catch {
        setMicDenied(true);
        return;
      }
    }

    let mr: MediaRecorder;
    try {
      mr = new MediaRecorder(stream);
    } catch {
      setMicDenied(true);
      return;
    }
    recRef.current = mr;
    recChunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) recChunksRef.current.push(e.data);
    };
    mr.onstop = async () => {
      const blob = new Blob(recChunksRef.current, {
        type: recChunksRef.current[0]?.type || "audio/webm",
      });
      try {
        const arr = await blob.arrayBuffer();
        const decoded = await engine.ctx.decodeAudioData(arr);
        bufferRef.current = decoded;
        setPhase("ready");
        // little googly celebration + auto-preview in chipmunk so there is instant payoff
        eyeWiggleRef.current = 1;
        playSillyAndTrack("chipmunk");
      } catch {
        // decoding failed; stay friendly, fall back to ready with no buffer
        setPhase("idle");
      }
    };
    setPhase("recording");
    mr.start();

    // auto-stop after RECORD_SECONDS so kids never get stuck
    recTimerRef.current = setTimeout(() => {
      runStopRecording();
    }, RECORD_SECONDS * 1000);
  }

  function runStopRecording(): void {
    if (recTimerRef.current) {
      clearTimeout(recTimerRef.current);
      recTimerRef.current = null;
    }
    const mr = recRef.current;
    if (mr && mr.state !== "inactive") {
      try {
        mr.stop();
      } catch {
        /* ignore */
      }
    }
  }

  function playSillyAndTrack(mode: SillyMode): void {
    const engine = engineRef.current;
    if (!engine) return;
    void engine.ctx.resume();

    // stop any in-flight playback so presses feel instant
    if (playingRef.current) {
      playingRef.current.stop();
      playingRef.current = null;
    }

    setActiveMode(mode);
    eyeWiggleRef.current = 1;

    if (bufferRef.current) {
      playingRef.current = playSilly(engine, bufferRef.current, mode);
    } else if (micDenied) {
      const idx = PREBAKED.findIndex((b) => b.mode === mode);
      playPrebaked(engine, idx < 0 ? 0 : idx);
    }
    // clear active highlight shortly
    setTimeout(() => setActiveMode(null), 260);
  }

  // ----- render loop -----
  useEffect(() => {
    if (phase === "intro") return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setCanvasOk(false);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCanvasOk(false);
      return;
    }

    let cancelled = false;

    function resize(): void {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();

    function frame(now: number): void {
      if (cancelled || !canvas || !ctx) return;
      const t = (now - start) / 1000;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      // follow playback loudness -> mouth openness (RMS envelope)
      const engine = engineRef.current;
      let target = 0.12;
      if (engine) {
        engine.analyser.getByteTimeDomainData(engine.analyserData);
        let sum = 0;
        const data = engine.analyserData;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        target = Math.min(1, 0.12 + rms * 4.5);
      }
      // smooth toward target (fast attack, gentle release)
      const cur = mouthRef.current;
      mouthRef.current =
        target > cur ? cur + (target - cur) * 0.6 : cur + (target - cur) * 0.18;

      // eye wiggle decay
      eyeWiggleRef.current *= 0.94;

      drawMonster(ctx, w, h, t, mouthRef.current, eyeWiggleRef.current, phaseRef.current);
      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

  // ----- cleanup on unmount -----
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (recTimerRef.current) clearTimeout(recTimerRef.current);
      if (playingRef.current) playingRef.current.stop();
      const mr = recRef.current;
      if (mr && mr.state !== "inactive") {
        try {
          mr.stop();
        } catch {
          /* ignore */
        }
      }
      streamRef.current?.getTracks().forEach((tr: MediaStreamTrack) => tr.stop());
      const eng = engineRef.current;
      if (eng) {
        try {
          void eng.ctx.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  const recording = phase === "recording";
  const showSilly = phase === "ready" || (micDenied && phase !== "intro");
  const buttons = micDenied && !bufferRef.current ? PREBAKED : SILLY_BUTTONS;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#15102a] text-foreground select-none">
      {/* monster canvas fills the screen */}
      {canvasOk ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
          <p className="text-violet-300 text-xl">
            Your screen can’t draw the monster right now. Try another browser!
          </p>
        </div>
      )}

      {/* INTRO: big start button (creates + resumes audio in this gesture) */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-8 bg-[#15102a]/80 backdrop-blur-sm px-6">
          <h1 className="text-2xl sm:text-4xl font-bold text-foreground text-center">
            Silly Voice Monster
          </h1>
          <p className="text-base sm:text-lg text-foreground text-center max-w-sm">
            Talk to the monster. It says it back in the silliest voice!
          </p>
          <button
            onClick={runStart}
            className="flex h-44 w-44 items-center justify-center rounded-full bg-violet-500/30 ring-4 ring-violet-300 text-7xl active:scale-95 transition-transform"
            aria-label="Start"
          >
            ▶️
          </button>
        </div>
      )}

      {/* IDLE: animated arrow points at the giant mic */}
      {phase === "idle" && !micDenied && (
        <div className="absolute left-1/2 top-[20%] z-10 -translate-x-1/2 text-5xl animate-bounce pointer-events-none">
          ⬇️
        </div>
      )}

      {/* GIANT MIC button (record). Press-and-hold or tap. */}
      {(phase === "idle" || phase === "recording") && !micDenied && (
        <div className="absolute inset-x-0 bottom-10 z-10 flex justify-center">
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              if (!recording) void runStartRecording();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              if (recording) runStopRecording();
            }}
            onClick={() => {
              // tap fallback: toggle
              if (!recording) void runStartRecording();
            }}
            className={`flex h-40 w-40 items-center justify-center rounded-full text-7xl transition-transform active:scale-95 ${
              recording
                ? "bg-violet-500/40 ring-8 ring-violet-300 animate-pulse scale-110"
                : "bg-violet-500/30 ring-4 ring-violet-300"
            }`}
            aria-label={recording ? "Listening" : "Record your voice"}
          >
            🎤
          </button>
        </div>
      )}

      {/* SILLY MODE buttons appear after a recording (or in fallback) */}
      {showSilly && (
        <div className="absolute inset-x-0 bottom-8 z-10 flex flex-col items-center gap-4 px-4">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            {buttons.map((b) => (
              <button
                key={b.label}
                onClick={() => playSillyAndTrack(b.mode)}
                className={`flex h-20 w-20 items-center justify-center rounded-3xl text-4xl shadow-lg transition-transform active:scale-90 ${
                  b.color
                } ${activeMode === b.mode ? "scale-110 ring-4 ring-border" : ""}`}
                aria-label={b.label}
              >
                {b.icon}
              </button>
            ))}
          </div>
          {/* re-record mic, smaller, still big enough */}
          {!micDenied && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                if (!recording) void runStartRecording();
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                if (recording) runStopRecording();
              }}
              onClick={() => {
                if (!recording) void runStartRecording();
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-muted ring-2 ring-border text-3xl active:scale-90 transition-transform"
              aria-label="Record again"
            >
              🎤
            </button>
          )}
        </div>
      )}

      {/* friendly mic-denied message */}
      {micDenied && (
        <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 px-4 text-center">
          <p className="text-violet-300 text-base max-w-xs">
            No microphone — but you can still press the silly buttons! 🎉
          </p>
        </div>
      )}

      {/* corner footer */}
      <div className="absolute bottom-2 left-3 z-30 flex items-center gap-3">
        <Link
          href="/dream"
          className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          ← dream lab
        </Link>
        <details className="text-xs text-muted-foreground/70">
          <summary className="cursor-pointer hover:text-muted-foreground">notes</summary>
          <div className="absolute bottom-6 left-0 w-64 rounded-lg bg-black/80 p-3 text-muted-foreground text-xs leading-relaxed">
            A comedy voice-changer toy. Records ~1.8s of your voice and replays
            it with playback-rate, reverse, ring-mod and wobble. See README.md
            for the full design notes &amp; references (Talking Tom, Toca Boca).
          </div>
        </details>
      </div>
    </main>
  );
}

// ----- cartoon monster (Canvas2D) -----
function drawMonster(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  mouth: number,
  wiggle: number,
  phase: Phase
): void {
  ctx.clearRect(0, 0, w, h);

  // background gradient
  const bg = ctx.createRadialGradient(
    w / 2,
    h * 0.45,
    40,
    w / 2,
    h * 0.45,
    Math.max(w, h) * 0.8
  );
  bg.addColorStop(0, "#2a1f55");
  bg.addColorStop(1, "#120c26");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.42;
  const r = Math.min(w, h) * 0.28;

  // gentle idle bob
  const bob = Math.sin(t * 1.6) * r * 0.04;
  const breathe = 1 + Math.sin(t * 1.2) * 0.02;

  ctx.save();
  ctx.translate(cx, cy + bob);
  ctx.scale(breathe, breathe);

  // little wiggly antennae
  for (const side of [-1, 1]) {
    ctx.strokeStyle = "#7c5bd6";
    ctx.lineWidth = r * 0.06;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(side * r * 0.4, -r * 0.85);
    const sway = Math.sin(t * 3 + side) * r * 0.12;
    ctx.quadraticCurveTo(
      side * r * 0.55 + sway,
      -r * 1.25,
      side * r * 0.45 + sway,
      -r * 1.45
    );
    ctx.stroke();
    ctx.fillStyle = phase === "recording" ? "#fb7185" : "#a78bfa";
    ctx.beginPath();
    ctx.arc(side * r * 0.45 + sway, -r * 1.5, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // body / head (rounded blob)
  const bodyGrad = ctx.createLinearGradient(0, -r, 0, r);
  bodyGrad.addColorStop(0, "#8b6df0");
  bodyGrad.addColorStop(1, "#5b3fc4");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r, 0, 0, Math.PI * 2);
  ctx.fill();

  // cheeks
  ctx.fillStyle = "rgba(251,113,133,0.35)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.6, r * 0.2, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  // googly eyes — wiggle harder right after a playback
  const wob = wiggle * r * 0.18;
  for (const side of [-1, 1]) {
    const ex = side * r * 0.4;
    const ey = -r * 0.25;
    const eR = r * 0.32;
    // white
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ex, ey, eR, 0, Math.PI * 2);
    ctx.fill();
    // pupil rolls around (googly)
    const px = ex + Math.cos(t * 7 + side * 2) * (wob + eR * 0.18);
    const py = ey + Math.sin(t * 9 + side) * (wob + eR * 0.18);
    ctx.fillStyle = "#1a1030";
    ctx.beginPath();
    ctx.arc(px, py, eR * 0.45, 0, Math.PI * 2);
    ctx.fill();
    // shine
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(px - eR * 0.15, py - eR * 0.15, eR * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  // mouth opens with playback loudness
  const mouthOpen = Math.max(0.06, mouth);
  const mw = r * 0.7;
  const mh = r * (0.12 + mouthOpen * 0.7);
  const my = r * 0.35;
  ctx.fillStyle = "#2a1030";
  ctx.beginPath();
  ctx.ellipse(0, my, mw, mh, 0, 0, Math.PI * 2);
  ctx.fill();
  // tongue
  ctx.fillStyle = "#ff7aa2";
  ctx.beginPath();
  ctx.ellipse(0, my + mh * 0.4, mw * 0.55, mh * 0.5, 0, 0, Math.PI);
  ctx.fill();
  // teeth (two friendly squares, never scary)
  ctx.fillStyle = "#ffffff";
  for (const side of [-1, 1]) {
    ctx.fillRect(side * mw * 0.32 - mw * 0.1, my - mh * 0.95, mw * 0.2, mh * 0.35);
  }

  ctx.restore();
}
