"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { makeWordLoop, type Drum, type WordLoop } from "./syllables";

// ── Config ──────────────────────────────────────────────────────────────
const BPM = 112;
const STEPS = 16;
const STEP_SEC = 60 / BPM / 4; // 16 steps = 4 beats per bar
const MAX_LOOPS = 5;
const DEMO_WORDS = ["cat", "elephant", "banana", "butterfly", "dog", "dinosaur", "rainbow", "frog"];
const MENU_WORDS = [
  { word: "cat", emoji: "🐱" },
  { word: "dog", emoji: "🐶" },
  { word: "elephant", emoji: "🐘" },
  { word: "butterfly", emoji: "🦋" },
  { word: "banana", emoji: "🍌" },
  { word: "dinosaur", emoji: "🦕" },
  { word: "rainbow", emoji: "🌈" },
  { word: "frog", emoji: "🐸" },
];

// Cartoon character per drum voice (kept bright + bold).
const DRUM_FACE: Record<Drum, string> = {
  kick: "🥁",
  snare: "👏",
  tom: "🪘",
  cowbell: "🔔",
  woodblock: "🪵",
  hat: "✨",
};

// ── Audio synthesis (all percussion built from oscillators + noise) ──────
function makeNoiseBuffer(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 0.4);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function playDrum(ac: AudioContext, master: GainNode, noise: AudioBuffer, drum: Drum, gain: number) {
  const t = ac.currentTime;
  const out = ac.createGain();
  out.gain.value = gain;
  out.connect(master);

  if (drum === "kick") {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.32);
  } else if (drum === "snare") {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    const g = ac.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    // tonal body
    const o = ac.createOscillator();
    o.type = "triangle";
    o.frequency.value = 190;
    const og = ac.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og);
    og.connect(out);
    src.start(t);
    src.stop(t + 0.2);
    o.start(t);
    o.stop(t + 0.12);
  } else if (drum === "hat") {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + 0.06);
  } else if (drum === "tom") {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.18);
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.28);
  } else if (drum === "cowbell") {
    const o1 = ac.createOscillator();
    const o2 = ac.createOscillator();
    o1.type = "square";
    o2.type = "square";
    o1.frequency.value = 540;
    o2.frequency.value = 800;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o1.connect(g);
    o2.connect(g);
    g.connect(out);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 0.24);
    o2.stop(t + 0.24);
  } else {
    // woodblock — short bright click with pitch
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(1000, t);
    o.frequency.exponentialRampToValueAtTime(620, t + 0.04);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.08);
  }
}

// Warm bass marimba root on the downbeat (pitch is SECONDARY — just warmth).
function playRoot(ac: AudioContext, master: GainNode) {
  const t = ac.currentTime;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = "sine";
  o.frequency.value = 65.41; // C2
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.18, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + 0.55);
}

// ── Component ────────────────────────────────────────────────────────────
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export default function ParadeCaller() {
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [asrSupported, setAsrSupported] = useState(true);
  const [loops, setLoops] = useState<WordLoop[]>([]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);

  const loopsRef = useRef<WordLoop[]>([]);
  const stepRef = useRef(0);
  const nextTimeRef = useRef(0);
  const flashRef = useRef<Map<number, number>>(new Map()); // loopId -> flash energy
  const rafRef = useRef(0);
  const demoTimerRef = useRef<number | null>(null);
  const demoIdxRef = useRef(0);
  const silenceTimerRef = useRef<number | null>(null);
  const lastWordRef = useRef("");

  // Detect ASR support once.
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    if (!w.SpeechRecognition && !w.webkitSpeechRecognition) setAsrSupported(false);
  }, []);

  // Add a word loop into the parade (capped, oldest drops).
  const addWord = useCallback((word: string) => {
    const loop = makeWordLoop(word);
    setLoops((prev) => {
      const next = [...prev, loop];
      if (next.length > MAX_LOOPS) next.shift();
      loopsRef.current = next;
      return next;
    });
    flashRef.current.set(loop.id, 0);
  }, []);

  // ── Demo loop: cycles built-in words so a silent glance hears the parade.
  const startDemo = useCallback(() => {
    if (demoTimerRef.current != null) return;
    const tick = () => {
      addWord(DEMO_WORDS[demoIdxRef.current % DEMO_WORDS.length]);
      demoIdxRef.current += 1;
      demoTimerRef.current = window.setTimeout(tick, 2500);
    };
    // first demo word after a short beat
    demoTimerRef.current = window.setTimeout(tick, 100);
  }, [addWord]);

  const stopDemo = useCallback(() => {
    if (demoTimerRef.current != null) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  }, []);

  // Real speech arrived: cancel demo, arm a silence timer to restart it.
  const onRealWord = useCallback(
    (word: string) => {
      stopDemo();
      addWord(word);
      if (silenceTimerRef.current != null) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = window.setTimeout(() => {
        demoIdxRef.current = 0;
        startDemo();
      }, 5000);
    },
    [addWord, startDemo, stopDemo],
  );

  // ── Audio scheduler: drives the shared parade clock.
  const scheduler = useCallback(() => {
    const ac = acRef.current;
    const master = masterRef.current;
    const noise = noiseRef.current;
    if (!ac || !master || !noise) return;

    while (nextTimeRef.current < ac.currentTime + 0.12) {
      const step = stepRef.current;
      const active = loopsRef.current;
      for (const loop of active) {
        const hit = loop.steps[step];
        if (hit) {
          playDrum(ac, master, noise, hit.drum, hit.gain);
          if (hit.drum !== "hat" && loop.bounceStep.includes(step)) {
            flashRef.current.set(loop.id, 1);
          }
        }
      }
      if (step === 0 && active.length > 0) playRoot(ac, master);

      stepRef.current = (step + 1) % STEPS;
      nextTimeRef.current += STEP_SEC;
    }
    rafRef.current = window.setTimeout(scheduler, 25) as unknown as number;
  }, []);

  // ── Start everything on the user gesture.
  const start = useCallback(() => {
    // create/resume audio (must be in a gesture for iOS Safari)
    if (!acRef.current) {
      const AC = (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
      const ac = new AC();
      const master = ac.createGain();
      master.gain.value = 0.9;
      master.connect(ac.destination);
      acRef.current = ac;
      masterRef.current = master;
      noiseRef.current = makeNoiseBuffer(ac);
      nextTimeRef.current = ac.currentTime + 0.1;
    }
    acRef.current.resume();
    setRunning(true);
    scheduler();

    // try speech recognition
    const w = window as unknown as {
      SpeechRecognition?: new () => RecognitionLike;
      webkitSpeechRecognition?: new () => RecognitionLike;
    };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (Rec) {
      try {
        const rec = new Rec();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US";
        rec.onresult = (e) => {
          const res = e.results[e.results.length - 1];
          if (!res || !res.isFinal) return;
          const text = (res[0]?.transcript || "").trim().toLowerCase();
          const words = text.split(/\s+/).filter(Boolean);
          const last = words[words.length - 1];
          if (last && last !== lastWordRef.current) {
            lastWordRef.current = last;
            onRealWord(last);
          }
        };
        rec.onerror = (ev) => {
          if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
            setNotice("Microphone is off — tap a picture below to add it to the parade!");
            setAsrSupported(false);
          }
        };
        rec.onend = () => {
          // auto-restart while running
          if (recRef.current) {
            try {
              recRef.current.start();
            } catch {
              /* already started */
            }
          }
        };
        recRef.current = rec;
        rec.start();
      } catch {
        setAsrSupported(false);
        setNotice("Speech isn't available here — tap a picture below to play!");
      }
    } else {
      setAsrSupported(false);
      setNotice("This browser has no microphone words — tap a picture below to play!");
    }

    // auto-demo if nothing arrives within 3s
    silenceTimerRef.current = window.setTimeout(() => {
      demoIdxRef.current = 0;
      startDemo();
    }, 3000);
  }, [scheduler, onRealWord, startDemo]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current);
      if (demoTimerRef.current != null) clearTimeout(demoTimerRef.current);
      if (silenceTimerRef.current != null) clearTimeout(silenceTimerRef.current);
      if (recRef.current) {
        recRef.current.onend = null;
        try {
          recRef.current.stop();
        } catch {
          /* ignore */
        }
        recRef.current = null;
      }
      if (acRef.current) acRef.current.close();
    };
  }, []);

  // ── Canvas render loop: the bright parade.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let anim = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let parade = 0; // scrolling ground offset
    const render = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      parade = (parade + 1.2) % 80;

      // sunny sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#7dd3fc");
      sky.addColorStop(0.6, "#bae6fd");
      sky.addColorStop(1, "#fef9c3");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // sun
      ctx.fillStyle = "rgba(253,224,71,0.9)";
      ctx.beginPath();
      ctx.arc(w - 70, 70, 38, 0, Math.PI * 2);
      ctx.fill();

      // marching ground
      const groundY = h * 0.72;
      ctx.fillStyle = "#86efac";
      ctx.fillRect(0, groundY, w, h - groundY);
      // dashed road for parade motion
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      const roadY = groundY + (h - groundY) * 0.45;
      for (let x = -parade; x < w; x += 80) {
        ctx.fillRect(x, roadY, 44, 8);
      }

      const active = loopsRef.current;
      const n = active.length;
      const ac = acRef.current;
      const playheadStep = ac ? stepRef.current : 0;

      // playhead sweep bar across the top
      const barY = 26;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(20, barY, w - 40, 12);
      for (let s = 0; s < STEPS; s++) {
        const px = 20 + ((w - 40) * s) / STEPS;
        ctx.fillStyle = s % 4 === 0 ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.12)";
        ctx.fillRect(px, barY, 2, 12);
      }
      const headX = 20 + ((w - 40) * playheadStep) / STEPS;
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(headX, barY - 4, 5, 20);

      // characters along the marching lane
      if (n > 0) {
        const slot = w / n;
        for (let i = 0; i < n; i++) {
          const loop = active[i];
          const cx = slot * i + slot / 2;
          let flash = flashRef.current.get(loop.id) ?? 0;
          flash = Math.max(0, flash - 0.06);
          flashRef.current.set(loop.id, flash);
          const bounce = flash * 26;
          const baseY = groundY - 18;
          const cy = baseY - bounce;
          const r = Math.min(slot * 0.34, 56) * (1 + flash * 0.18);

          // shadow
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.beginPath();
          ctx.ellipse(cx, baseY + 6, r * 0.8, r * 0.28, 0, 0, Math.PI * 2);
          ctx.fill();

          // body (bright primary disc)
          ctx.fillStyle = loop.color;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          // glow ring on hit
          if (flash > 0.05) {
            ctx.strokeStyle = `rgba(255,255,255,${0.7 * flash})`;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
            ctx.stroke();
          }

          // face / instrument emoji
          ctx.font = `${Math.floor(r * 1.1)}px serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(DRUM_FACE[loop.drum], cx, cy + 2);

          // syllable dots under the character
          const dotR = 5;
          const totalW = (loop.syllables - 1) * 16;
          for (let d = 0; d < loop.syllables; d++) {
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath();
            ctx.arc(cx - totalW / 2 + d * 16, baseY + 24, dotR, 0, Math.PI * 2);
            ctx.fill();
          }

          // big readable word label
          ctx.fillStyle = "#1e293b";
          ctx.font = "700 22px system-ui, sans-serif";
          ctx.fillText(loop.word.toUpperCase(), cx, cy - r - 16);
        }
      } else {
        ctx.fillStyle = "#1e293b";
        ctx.font = "700 26px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Say a word… the parade is coming!", w / 2, h * 0.5);
      }

      anim = window.requestAnimationFrame(render);
    };
    anim = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(anim);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-sky-200 text-slate-900">
      {/* Hero */}
      <header className="relative z-10 px-5 pt-6 pb-3 text-center">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 drop-shadow-sm sm:text-4xl">
          🎉 Parade Caller
        </h1>
        <p className="mx-auto mt-1 max-w-xl text-base font-semibold text-slate-700 sm:text-lg">
          Say a word out loud — its <span className="text-rose-600">syllables</span> become a drum beat,
          and every word marches into your parade band!
        </p>
      </header>

      {/* Canvas parade */}
      <div className="relative mx-auto h-[58vh] w-full max-w-5xl px-3">
        <canvas ref={canvasRef} className="h-full w-full rounded-3xl shadow-lg" />
      </div>

      {/* Controls */}
      <div className="relative z-10 mx-auto mt-4 flex w-full max-w-5xl flex-col items-center gap-3 px-4 pb-10">
        {!running ? (
          <button
            onClick={start}
            className="min-h-[72px] rounded-full bg-rose-500 px-10 py-4 text-2xl font-black text-white shadow-xl transition hover:bg-rose-600 active:scale-95"
          >
            🎤 Tap &amp; talk
          </button>
        ) : (
          <p className="min-h-[44px] text-lg font-bold text-slate-700">
            {asrSupported ? "Listening… say a word! 🐘🐱🦋" : "Tap a picture to add it to the parade! 👇"}
          </p>
        )}

        {notice && (
          <p className="max-w-xl text-center text-base font-semibold text-rose-300">{notice}</p>
        )}

        {/* Word menu — always available (and the full fallback with no mic). */}
        {running && (
          <div className="mt-1 grid w-full max-w-3xl grid-cols-4 gap-2 sm:gap-3">
            {MENU_WORDS.map((m) => (
              <button
                key={m.word}
                onClick={() => onRealWord(m.word)}
                className="flex min-h-[64px] flex-col items-center justify-center rounded-2xl bg-white/85 px-2 py-2 text-base font-bold text-slate-800 shadow-md transition hover:bg-white active:scale-95"
              >
                <span className="text-3xl leading-none">{m.emoji}</span>
                <span className="mt-1">{m.word}</span>
              </button>
            ))}
          </div>
        )}

        {/* tiny info on loop count */}
        {running && loops.length > 0 && (
          <p className="text-sm font-medium text-slate-600">
            {loops.length} / {MAX_LOOPS} words marching · {BPM} BPM
          </p>
        )}
      </div>

      {/* Design notes affordance (corner) */}
      <Link
        href="/dream/773-kids-parade-caller/README.md"
        className="absolute bottom-3 right-4 z-10 text-sm font-semibold text-slate-700/80 underline decoration-dotted hover:text-slate-900"
      >
        Read the design notes
      </Link>
    </main>
  );
}
