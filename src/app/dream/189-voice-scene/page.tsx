"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  getSpeechRecognition,
  type SpeechRecognitionEvent,
  type SpeechRecognitionType,
} from "@/lib/browser/speech-recognition";

// ── Scene config ───────────────────────────────────────────────────────────

type SceneKey = "cosmic" | "earth" | "forest" | "ocean" | "fire" | "crystal";

interface SceneConf {
  label: string; icon: string; words: string[];
  hue: number;
  midiRoot: number; bpm: number; scale: number[];
  ptMode: "rise" | "fall" | "drift" | "wave" | "burst" | "swirl";
  droneGain: number;
}

const SCENES: Record<SceneKey, SceneConf> = {
  cosmic:  { label:"Cosmic",  icon:"✦",
             words:["cosmic","space","star","stars","universe","void","galaxy","infinite"],
             hue:270, midiRoot:36, bpm:24,  scale:[0,7,12,19,24],    ptMode:"rise",  droneGain:0.08 },
  earth:   { label:"Earth",   icon:"◉",
             words:["earth","ground","stone","cave","ancient","root","deep","soil"],
             hue:30,  midiRoot:41, bpm:36,  scale:[0,3,5,7,10,14],   ptMode:"fall",  droneGain:0.10 },
  forest:  { label:"Forest",  icon:"✿",
             words:["forest","nature","green","tree","leaf","alive","grow","bloom"],
             hue:130, midiRoot:55, bpm:72,  scale:[0,2,4,7,9,12],    ptMode:"drift", droneGain:0.06 },
  ocean:   { label:"Ocean",   icon:"◎",
             words:["ocean","wave","water","sea","flow","calm","blue","float"],
             hue:200, midiRoot:48, bpm:42,  scale:[0,2,5,7,10,12],   ptMode:"wave",  droneGain:0.07 },
  fire:    { label:"Fire",    icon:"◈",
             words:["fire","bright","energy","warm","burn","spark","heat","red"],
             hue:15,  midiRoot:60, bpm:108, scale:[0,2,4,7,9,12,14], ptMode:"burst", droneGain:0.05 },
  crystal: { label:"Crystal", icon:"◇",
             words:["crystal","snow","ice","cold","clear","pure","glass","white"],
             hue:195, midiRoot:72, bpm:80,  scale:[0,4,7,12,16,19],  ptMode:"swirl", droneGain:0.05 },
};

const KEYS: SceneKey[] = ["cosmic","earth","forest","ocean","fire","crystal"];

const WORD_MAP = new Map<string, SceneKey>();
for (const k of KEYS) for (const w of SCENES[k].words) WORD_MAP.set(w, k);

function midiHz(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

// ── Particle ───────────────────────────────────────────────────────────────

interface Pt { x:number; y:number; vx:number; vy:number; r:number; age:number; maxAge:number; hue:number; }

function spawnPt(W: number, H: number, sc: SceneConf): Pt {
  const cx = W / 2, cy = H / 2;
  const a = Math.random() * Math.PI * 2;
  let x: number, y: number, vx: number, vy: number;
  switch (sc.ptMode) {
    case "rise":
      x = cx + (Math.random() - 0.5) * W * 0.85;
      y = H * 0.55 + Math.random() * H * 0.45;
      vx = (Math.random() - 0.5) * 0.55; vy = -0.55 - Math.random() * 0.75;
      break;
    case "fall":
      x = cx + (Math.random() - 0.5) * W * 0.85;
      y = Math.random() * H * 0.45;
      vx = (Math.random() - 0.5) * 0.5; vy = 0.45 + Math.random() * 0.65;
      break;
    case "drift":
      x = Math.random() * W; y = Math.random() * H;
      vx = (Math.random() - 0.5) * 0.9; vy = (Math.random() - 0.5) * 0.9;
      break;
    case "wave":
      x = Math.random() * W; y = Math.random() * H;
      vx = 0.3 + Math.random() * 0.5; vy = 0;
      break;
    case "burst":
      x = cx; y = cy;
      vx = Math.cos(a) * (0.9 + Math.random() * 1.5);
      vy = Math.sin(a) * (0.9 + Math.random() * 1.5);
      break;
    case "swirl":
    default: {
      const rr = 25 + Math.random() * 60;
      x = cx + Math.cos(a) * rr; y = cy + Math.sin(a) * rr;
      vx = Math.sin(a) * 1.15; vy = -Math.cos(a) * 1.15;
      break;
    }
  }
  return { x, y, vx, vy, r: 1.2 + Math.random() * 2.2, age: 0,
           maxAge: 70 + Math.floor(Math.random() * 95),
           hue: sc.hue + (Math.random() - 0.5) * 50 };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function VoiceScenePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actxRef   = useRef<AudioContext | null>(null);
  const dGainRef  = useRef<GainNode | null>(null);
  const dO1Ref    = useRef<OscillatorNode | null>(null);
  const dO2Ref    = useRef<OscillatorNode | null>(null);
  const arpRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef    = useRef<number>(0);
  const srRef     = useRef<InstanceType<SpeechRecognitionType> | null>(null);
  const ptsRef    = useRef<Pt[]>([]);
  const skRef     = useRef<SceneKey>("cosmic");
  const hueRef    = useRef<number>(270);
  const frameRef  = useRef<number>(0);
  const arpIdxRef = useRef<number>(0);

  const [started,   setStarted]   = useState(false);
  const [curKey,    setCurKey]    = useState<SceneKey>("cosmic");
  const [listening, setListening] = useState(false);
  const [lastWord,  setLastWord]  = useState("");
  const [srAvail,   setSrAvail]   = useState(false);

  useEffect(() => {
    setSrAvail(!!getSpeechRecognition());
  }, []);

  // ── arpeggio (runs per-tick; uses only refs + closured sc) ─────────────
  const runArp = useCallback((sc: SceneConf) => {
    if (arpRef.current) clearInterval(arpRef.current);
    arpIdxRef.current = 0;
    const beatMs = (60 / sc.bpm) * 1000;
    arpRef.current = setInterval(() => {
      const ax = actxRef.current;
      if (!ax) return;
      const semi = sc.scale[arpIdxRef.current % sc.scale.length];
      const osc  = ax.createOscillator();
      const g    = ax.createGain();
      osc.type = "sine";
      osc.frequency.value = midiHz(sc.midiRoot + semi);
      const t = ax.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t + beatMs / 1000 * 0.82);
      osc.connect(g); g.connect(ax.destination);
      osc.start(t); osc.stop(t + beatMs / 1000);
      arpIdxRef.current++;
    }, beatMs);
  }, []);

  // ── canvas loop ─────────────────────────────────────────────────────────
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width, H = canvas.height;
    frameRef.current++;
    const f = frameRef.current;
    const sc = SCENES[skRef.current];

    // Lerp hue toward target
    let dh = sc.hue - hueRef.current;
    if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
    hueRef.current += dh * 0.04;
    const h = hueRef.current;

    // Faded background — creates motion trail
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = `hsla(${h},18%,3%,0.20)`;
    ctx.fillRect(0, 0, W, H);

    // Spawn ~3 particles per frame
    for (let i = 0; i < 3; i++) {
      if (ptsRef.current.length < 270) ptsRef.current.push(spawnPt(W, H, sc));
    }

    // Update + draw particles
    ctx.globalCompositeOperation = "screen";
    ctx.shadowBlur = 14;
    const survivors: Pt[] = [];
    for (const p of ptsRef.current) {
      p.age++;
      if (p.age >= p.maxAge) continue;
      survivors.push(p);
      switch (sc.ptMode) {
        case "wave":
          p.vy += Math.sin(f * 0.018 + p.x * 0.009) * 0.06;
          break;
        case "swirl": {
          const dx = p.x - W / 2, dy = p.y - H / 2;
          const d  = Math.sqrt(dx * dx + dy * dy) + 1;
          p.vx += (-dy / d) * 0.05; p.vy += (dx / d) * 0.05;
          break;
        }
        case "burst":
          p.vx *= 0.990; p.vy *= 0.990;
          break;
        default: break;
      }
      p.vx *= 0.993; p.vy *= 0.993;
      p.x += p.vx; p.y += p.vy;

      const t     = p.age / p.maxAge;
      const alpha = Math.sin(t * Math.PI) * 0.88;
      ctx.shadowColor = `hsla(${p.hue},90%,70%,${alpha})`;
      ctx.fillStyle   = `hsla(${p.hue},90%,82%,${alpha * 0.85})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ptsRef.current = survivors;
    ctx.shadowBlur = 0;

    // Center ambient glow
    ctx.globalCompositeOperation = "source-over";
    const cg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 140);
    cg.addColorStop(0, `hsla(${h},55%,55%,0.13)`);
    cg.addColorStop(1, `hsla(${h},55%,30%,0)`);
    ctx.fillStyle = cg;
    ctx.fillRect(0, 0, W, H);

    // Scene icon + label
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "54px monospace";
    ctx.fillStyle = `hsla(${h},80%,80%,0.90)`;
    ctx.fillText(sc.icon, W / 2, H / 2 - 22);
    ctx.font = "bold 20px monospace";
    ctx.fillStyle = `hsla(${h},60%,90%,0.82)`;
    ctx.fillText(sc.label, W / 2, H / 2 + 40);

    rafRef.current = requestAnimationFrame(loop);
  }, []);

  // ── switch scene ────────────────────────────────────────────────────────
  const switchScene = useCallback((k: SceneKey) => {
    if (k === skRef.current) return;
    skRef.current = k;
    setCurKey(k);
    const sc = SCENES[k];
    const ax = actxRef.current;
    if (!ax) return;
    const now = ax.currentTime;
    dO1Ref.current?.frequency.linearRampToValueAtTime(midiHz(sc.midiRoot),     now + 1.1);
    dO2Ref.current?.frequency.linearRampToValueAtTime(midiHz(sc.midiRoot + 7), now + 1.1);
    dGainRef.current?.gain.linearRampToValueAtTime(sc.droneGain, now + 0.7);
    runArp(sc);
  }, [runArp]);

  // ── begin audio + canvas ─────────────────────────────────────────────────
  const startAll = useCallback(() => {
    const ax = new AudioContext();
    void ax.resume();
    actxRef.current = ax;
    const sc = SCENES[skRef.current];

    const dg = ax.createGain();
    dg.gain.setValueAtTime(0, ax.currentTime);
    dg.gain.linearRampToValueAtTime(sc.droneGain, ax.currentTime + 1.8);
    dg.connect(ax.destination);
    dGainRef.current = dg;

    const o1 = ax.createOscillator();
    o1.type = "sine"; o1.frequency.value = midiHz(sc.midiRoot); o1.connect(dg); o1.start();
    const o2 = ax.createOscillator();
    o2.type = "sine"; o2.frequency.value = midiHz(sc.midiRoot + 7); o2.connect(dg); o2.start();
    dO1Ref.current = o1; dO2Ref.current = o2;

    runArp(sc);
    rafRef.current = requestAnimationFrame(loop);
    setStarted(true);
  }, [loop, runArp]);

  // ── speech recognition ──────────────────────────────────────────────────
  const toggleSpeech = useCallback(() => {
    if (!srRef.current) {
      const Ctor = getSpeechRecognition();
      if (!Ctor) return;
      const sr = new Ctor();
      sr.continuous = true;
      sr.interimResults = true;
      sr.lang = "en-US";
      sr.onresult = (e: SpeechRecognitionEvent) => {
        const txt = Array.from(e.results).map(r => r[0].transcript).join(" ").toLowerCase();
        for (const raw of txt.split(/\s+/)) {
          const w = raw.replace(/[^a-z]/g, "");
          const k = WORD_MAP.get(w);
          if (k) { switchScene(k); setLastWord(w); break; }
        }
      };
      srRef.current = sr;
    }
    if (listening) {
      srRef.current.stop();
      setListening(false);
    } else {
      srRef.current.start();
      setListening(true);
    }
  }, [listening, switchScene]);

  // Cleanup
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (arpRef.current) clearInterval(arpRef.current);
    try { dO1Ref.current?.stop(); dO2Ref.current?.stop(); } catch { /* already stopped */ }
    void actxRef.current?.close();
    try { srRef.current?.stop(); } catch { /* not running */ }
  }, []);

  // Canvas resize
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(es => {
      const r = es[0]?.contentRect;
      if (!r) return;
      el.width = Math.round(r.width); el.height = Math.round(r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#050508] text-foreground overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-2 shrink-0">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Voice Scene</h1>
          <p className="text-base text-muted-foreground mt-0.5 max-w-md leading-snug">
            Speak a word — transform the space. Say{" "}
            <span className="text-foreground font-mono">cosmic</span>,{" "}
            <span className="text-foreground font-mono">forest</span>,{" "}
            <span className="text-foreground font-mono">ocean</span>,{" "}
            <span className="text-foreground font-mono">fire</span>, or any scene name.
          </p>
        </div>
        <Link
          href="/dream"
          className="text-muted-foreground text-sm font-mono hover:text-foreground transition-colors mt-1 ml-4 shrink-0"
        >
          ← dream lab
        </Link>
      </div>

      {/* Controls */}
      <div className="px-5 pb-2 shrink-0">
        {!started ? (
          <button
            onClick={startAll}
            className="px-5 py-2.5 bg-violet-500/20 border border-violet-500/40 text-violet-300 text-base font-mono rounded hover:bg-violet-500/30 transition min-h-[44px]"
          >
            ▶ Begin
          </button>
        ) : (
          <div className="flex gap-2 flex-wrap items-center">
            {KEYS.map(k => {
              const s = SCENES[k];
              const active = curKey === k;
              return (
                <button
                  key={k}
                  onClick={() => switchScene(k)}
                  className={`px-4 py-2 text-base font-mono rounded border transition min-h-[44px] ${
                    active
                      ? "bg-muted border-border text-foreground"
                      : "bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              );
            })}
            {srAvail && (
              <button
                onClick={toggleSpeech}
                className={`px-4 py-2 text-base font-mono rounded border transition min-h-[44px] ml-auto ${
                  listening
                    ? "bg-violet-500/20 border-violet-400/50 text-violet-300"
                    : "bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {listening ? "● listening" : "🎙 voice"}
              </button>
            )}
          </div>
        )}
        {lastWord && (
          <p className="text-muted-foreground text-sm font-mono mt-1.5">
            heard: <span className="text-foreground">&ldquo;{lastWord}&rdquo;</span>
          </p>
        )}
      </div>

      {/* Canvas */}
      <div className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center px-8">
              <p className="text-muted-foreground/70 text-base font-mono leading-loose">
                ✦ cosmic &nbsp;·&nbsp; ◉ earth &nbsp;·&nbsp; ✿ forest
                <br />
                ◎ ocean &nbsp;·&nbsp; ◈ fire &nbsp;·&nbsp; ◇ crystal
              </p>
              <p className="text-muted-foreground/70 text-sm font-mono mt-3">
                press Begin — then say a word or click a scene
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center px-5 py-2 text-muted-foreground text-xs font-mono shrink-0 border-t border-border">
        <span>189-voice-scene · cycle 221 · zero deps · zero api</span>
        <span className="text-muted-foreground/70">Web Audio · Web Speech API · Canvas2D</span>
      </div>
    </div>
  );
}
