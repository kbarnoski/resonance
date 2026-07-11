"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────
   268 · Kids Shadow Theater
   Wayang-kulit shadow puppets that sing in a slendro-like
   (NON-equal-tempered, NON-pentatonic-Western) gamelan tuning.
   Inline SVG only — no canvas, no WebGL.
   ──────────────────────────────────────────────────────────── */

// Slendro-ish tuning: deliberately stretched/inharmonic ratios over a base.
// NOT 12-TET, NOT C-major pentatonic — these "wrong" intervals are the point.
const BASE_FREQ = 220; // A3-ish anchor
const SLENDRO_RATIOS = [1.0, 1.16, 1.35, 1.52, 1.78];
const PUPPET_FREQS = SLENDRO_RATIOS.map((r) => BASE_FREQ * r);

// Tempo for the colotomic (gong) cycle — slow, ceremonial.
const BPM = 60;
const BEAT = 60 / BPM; // seconds per beat

type AnimalKey = "bird" | "elephant" | "deer" | "fish" | "monkey";

interface Puppet {
  key: AnimalKey;
  freqIndex: number;
  label: string;
}

const PUPPETS: Puppet[] = [
  { key: "bird", freqIndex: 0, label: "Bird" },
  { key: "elephant", freqIndex: 1, label: "Elephant" },
  { key: "deer", freqIndex: 2, label: "Deer" },
  { key: "fish", freqIndex: 3, label: "Fish" },
  { key: "monkey", freqIndex: 4, label: "Monkey" },
];

// Cut-paper SVG silhouettes (Lotte Reiniger style). Solid black paths in a
// 100×100 viewBox so they scale uniformly.
const SILHOUETTES: Record<AnimalKey, string> = {
  bird:
    "M14 60 C20 42 38 34 56 38 C58 28 66 22 74 24 C70 28 70 32 72 36 C82 38 90 46 92 58 C84 54 78 56 74 60 C80 66 80 76 74 82 C72 74 66 70 60 70 C46 74 28 72 18 64 C22 62 26 62 30 62 C24 60 18 60 14 60 Z M70 40 C72 40 74 42 74 44 C74 46 72 48 70 48 C68 48 66 46 66 44 C66 42 68 40 70 40 Z",
  elephant:
    "M18 70 C16 52 26 36 46 34 C66 32 82 44 84 62 L84 80 L74 80 L74 64 C70 66 64 66 60 64 L60 80 L50 80 L50 62 C44 70 42 78 44 86 C40 86 36 82 36 76 C34 80 30 84 26 84 C28 78 30 74 30 68 C24 70 20 70 18 70 Z M40 46 C42 46 44 48 44 50 C44 52 42 54 40 54 C38 54 36 52 36 50 C36 48 38 46 40 46 Z",
  deer:
    "M40 30 C38 22 32 18 30 12 C34 14 38 16 42 20 C42 14 40 10 40 6 C44 10 46 16 48 22 C52 16 54 12 58 10 C56 16 54 20 54 26 C58 22 62 20 66 20 C62 24 58 28 56 32 C66 36 72 46 72 58 L72 84 L62 84 L62 60 C56 64 48 64 42 60 L42 84 L32 84 L32 56 C28 50 28 40 34 34 C36 32 38 30 40 30 Z M48 38 C50 38 52 40 52 42 C52 44 50 46 48 46 C46 46 44 44 44 42 C44 40 46 38 48 38 Z",
  fish:
    "M12 50 C12 38 28 30 48 30 C66 30 80 38 84 48 C86 42 90 38 94 36 C92 42 92 46 92 50 C92 54 92 58 94 64 C90 62 86 58 84 52 C80 62 66 70 48 70 C28 70 12 62 12 50 Z M30 46 C32 46 34 48 34 50 C34 52 32 54 30 54 C28 54 26 52 26 50 C26 48 28 46 30 46 Z",
  monkey:
    "M50 22 C40 22 32 30 32 40 C26 40 22 46 24 52 C26 56 30 56 34 54 C36 62 42 68 50 68 C58 68 64 62 66 54 C70 56 74 56 76 52 C78 46 74 40 68 40 C68 30 60 22 50 22 Z M40 78 C40 70 46 66 50 66 C54 66 60 70 60 78 L60 88 L52 88 L52 80 L48 80 L48 88 L40 88 Z M42 40 C44 40 46 42 46 44 C46 46 44 48 42 48 C40 48 38 46 38 44 C38 42 40 40 42 40 Z M58 40 C60 40 62 42 62 44 C62 46 60 48 58 48 C56 48 54 46 54 44 C54 42 56 40 58 40 Z",
};

interface Voice {
  gain: GainNode;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  partial: OscillatorNode;
}

// Per-puppet animation/audio state held in a ref (rAF reads this, not state).
interface StageActor {
  key: AnimalKey;
  freq: number;
  x: number; // 0..1 across the lit screen
  dir: number; // +1 / -1 walking direction
  phase: number; // sway phase
  bob: number; // vertical bob
  voice: Voice | null;
  alive: boolean; // false = fading out, then culled
  removeAt: number; // audioCtx time after which it can be culled
}

export default function ShadowTheaterPage() {
  const [audioReady, setAudioReady] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [onStage, setOnStage] = useState<AnimalKey[]>([]);
  const [beatFlash, setBeatFlash] = useState(0);
  const [, setRenderTick] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const actorsRef = useRef<StageActor[]>([]);
  const rafRef = useRef<number | null>(null);
  const schedTimerRef = useRef<number | null>(null);
  const nextBeatRef = useRef<number>(0);
  const beatCountRef = useRef<number>(0);
  const onStageRef = useRef<AnimalKey[]>([]);

  // ── Build a detuned-FM metallophone voice (saron/bonang-ish) ──
  const makeVoice = useCallback((ctx: AudioContext, master: GainNode, freq: number): Voice => {
    // Two slightly detuned fundamentals → gamelan "beating" shimmer.
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    oscA.type = "sine";
    oscB.type = "sine";
    oscA.frequency.value = freq;
    oscB.frequency.value = freq * 1.004; // a few Hz beat in this register
    // Inharmonic upper partial (~2.4×) — characteristic metallophone ring.
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2.41;

    const partialGain = ctx.createGain();
    partialGain.gain.value = 0.18;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    tone.Q.value = 0.4;

    oscA.connect(gain);
    oscB.connect(gain);
    partial.connect(partialGain).connect(gain);
    gain.connect(tone).connect(master);

    oscA.start();
    oscB.start();
    partial.start();
    return { gain, oscA, oscB, partial };
  }, []);

  // ── Colotomic gong / kempul ──
  const scheduleGong = useCallback(
    (ctx: AudioContext, master: GainNode, when: number, low: boolean) => {
      const baseF = low ? 70 : 130;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(baseF * 1.12, when);
      osc.frequency.exponentialRampToValueAtTime(baseF, when + 0.35);

      const g = ctx.createGain();
      const peak = low ? 0.5 : 0.34;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + (low ? 5.5 : 3.5));

      // soft noise thump
      const noise = ctx.createBufferSource();
      const nlen = Math.floor(ctx.sampleRate * 0.25);
      const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
      const nd = nbuf.getChannelData(0);
      for (let i = 0; i < nlen; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nlen);
      noise.buffer = nbuf;
      const nf = ctx.createBiquadFilter();
      nf.type = "lowpass";
      nf.frequency.value = low ? 220 : 360;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, when);
      ng.gain.exponentialRampToValueAtTime(low ? 0.22 : 0.14, when + 0.01);
      ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);

      osc.connect(g).connect(master);
      noise.connect(nf).connect(ng).connect(master);
      osc.start(when);
      osc.stop(when + (low ? 5.8 : 3.8));
      noise.start(when);
      noise.stop(when + 0.45);
    },
    []
  );

  // ── Soft "kethuk" footstep tick ──
  const scheduleKethuk = useCallback((ctx: AudioContext, master: GainNode, when: number) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(540, when);
    osc.frequency.exponentialRampToValueAtTime(360, when + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.06, when + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    osc.connect(g).connect(master);
    osc.start(when);
    osc.stop(when + 0.2);
  }, []);

  // ── Strike a puppet voice, quantized to `when` ──
  const strikeVoice = useCallback((actor: StageActor, when: number) => {
    if (!actor.voice) return;
    const g = actor.voice.gain.gain;
    g.cancelScheduledValues(when);
    g.setValueAtTime(Math.max(0.0001, g.value), when);
    g.exponentialRampToValueAtTime(0.22, when + 0.012); // fast percussive attack
    g.exponentialRampToValueAtTime(0.0001, when + 3.2); // long bell decay
  }, []);

  // ── Lookahead scheduler ──
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const lookahead = 0.2;
    while (nextBeatRef.current < ctx.currentTime + lookahead) {
      const when = nextBeatRef.current;
      const beat = beatCountRef.current;
      if (beat % 8 === 0) {
        scheduleGong(ctx, master, when, true); // deep gong
      } else if (beat % 4 === 0) {
        scheduleGong(ctx, master, when, false); // mid kempul
      }
      const actors = actorsRef.current;
      actors.forEach((a) => {
        if (!a.alive) return;
        strikeVoice(a, when); // voices quantized → ensemble locks
        scheduleKethuk(ctx, master, when + 0.5 * BEAT); // footstep tick
      });
      const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
      window.setTimeout(() => setBeatFlash((f) => (f + 1) % 1000), delayMs);

      beatCountRef.current = beat + 1;
      nextBeatRef.current = when + BEAT;
    }
    schedTimerRef.current = window.setTimeout(runScheduler, 25);
  }, [scheduleGong, scheduleKethuk, strikeVoice]);

  // ── rAF animation loop: walks/sways actors. Reads/writes refs only. ──
  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ctx = ctxRef.current;
      const actors = actorsRef.current;
      let changed = false;
      for (let i = actors.length - 1; i >= 0; i--) {
        const a = actors[i];
        a.phase += dt * 1.6;
        a.bob = Math.sin(a.phase * 2) * 4;
        a.x += a.dir * dt * 0.06;
        if (a.x > 0.82) {
          a.x = 0.82;
          a.dir = -1;
        } else if (a.x < 0.18) {
          a.x = 0.18;
          a.dir = 1;
        }
        changed = true;
        if (!a.alive && ctx && ctx.currentTime > a.removeAt) {
          if (a.voice) {
            [a.voice.oscA, a.voice.oscB, a.voice.partial].forEach((o) => {
              try {
                o.stop();
              } catch {
                /* already stopped */
              }
            });
          }
          actors.splice(i, 1);
        }
      }
      if (changed) setRenderTick((t) => (t + 1) % 100000);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── Initialize audio on first user gesture ──
  const initAudio = useCallback(() => {
    if (ctxRef.current) return;
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        setAudioFailed(true);
        return;
      }
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      // Always-on limiter → toddler-safe, never clips.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 24;
      comp.ratio.value = 12;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      master.connect(comp).connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
      nextBeatRef.current = ctx.currentTime + 0.1;
      beatCountRef.current = 0;
      runScheduler();
      setAudioReady(true);
    } catch {
      setAudioFailed(true);
    }
  }, [runScheduler]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (schedTimerRef.current != null) clearTimeout(schedTimerRef.current);
      const ctx = ctxRef.current;
      if (ctx) {
        try {
          ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  // ── Toggle a puppet on/off the lit screen ──
  const togglePuppet = useCallback(
    (p: Puppet) => {
      if (!ctxRef.current) initAudio();
      const ctx = ctxRef.current;
      const master = masterRef.current;

      const isOn = onStageRef.current.includes(p.key);
      if (isOn) {
        const actor = actorsRef.current.find((a) => a.key === p.key && a.alive);
        if (actor && actor.voice && ctx) {
          actor.alive = false;
          actor.removeAt = ctx.currentTime + 2.6;
          const g = actor.voice.gain.gain;
          g.cancelScheduledValues(ctx.currentTime);
          g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime);
          g.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
        }
        const next = onStageRef.current.filter((k) => k !== p.key);
        onStageRef.current = next;
        setOnStage(next);
      } else {
        if (ctx && master) {
          const freq = PUPPET_FREQS[p.freqIndex];
          const voice = makeVoice(ctx, master, freq);
          const actor: StageActor = {
            key: p.key,
            freq,
            x: 0.5,
            dir: Math.random() > 0.5 ? 1 : -1,
            phase: Math.random() * Math.PI * 2,
            bob: 0,
            voice,
            alive: true,
            removeAt: Infinity,
          };
          actorsRef.current.push(actor);
        }
        const next = [...onStageRef.current, p.key];
        onStageRef.current = next;
        setOnStage(next);
      }
    },
    [initAudio, makeVoice]
  );

  // Lamp pulse (cosmetic)
  const pulse = 0.5 + 0.5 * Math.sin(beatFlash * 1.2);
  const stageActors = actorsRef.current.filter((a) => a.alive);

  return (
    <main className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#0b0717] text-foreground select-none">
      {/* ── Lamp / screen backdrop (warm amber → deep indigo) ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 38%, #ffdfa6 0%, #ffb35c 14%, #e06a2e 32%, #7b2f6b 58%, #2b1452 78%, #0b0717 100%)",
          opacity: 0.92 + pulse * 0.06,
          transition: "opacity 240ms ease-out",
        }}
        aria-hidden
      />
      {/* feTurbulence "oil lamp" shimmer overlay */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <filter id="lampflicker">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves={2} seed={7}>
              <animate
                attributeName="baseFrequency"
                dur="9s"
                values="0.012 0.02;0.016 0.026;0.012 0.02"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 0.8  0 0 0 0 0.4  0 0 0 0.1 0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter="url(#lampflicker)" />
      </svg>

      {/* ── Header ── */}
      <header className="relative z-10 flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h1 className="font-semibold text-2xl text-foreground drop-shadow sm:text-3xl">Shadow Theater</h1>
          <p className="mt-1 max-w-md text-base text-foreground">
            Tap a friendly puppet to send it onto the glowing screen — they sing together in an old
            Javanese gamelan tuning.
          </p>
        </div>
        <nav className="flex shrink-0 flex-col items-end gap-2 text-base">
          <Link
            href="/dream"
            className="min-h-[44px] rounded-lg bg-black/30 px-4 py-2.5 text-foreground backdrop-blur hover:bg-black/45"
          >
            ← Gallery
          </Link>
          <a
            href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/268-kids-shadow-theater/README.md"
            target="_blank"
            rel="noreferrer"
            className="text-base text-violet-300/95 hover:text-violet-200"
          >
            Read the design notes
          </a>
        </nav>
      </header>

      {/* ── Notices ── */}
      {audioFailed && (
        <p className="relative z-10 mx-5 mt-3 rounded-lg bg-black/40 px-4 py-2.5 text-base text-violet-300">
          Sound is not available in this browser — but you can still play with the shadow puppets.
        </p>
      )}
      {!audioReady && !audioFailed && (
        <p className="relative z-10 mx-5 mt-3 text-base text-muted-foreground">
          Tap any puppet to wake up the gamelan.
        </p>
      )}

      {/* ── The lit screen: SVG stage with walking actors ── */}
      <svg
        className="relative z-10 mx-auto mt-2 block w-full max-w-4xl"
        viewBox="0 0 1000 460"
        preserveAspectRatio="xMidYMid meet"
        style={{ touchAction: "manipulation" }}
        aria-label="Shadow puppet stage"
      >
        <ellipse cx="500" cy="430" rx="460" ry="26" fill="#000" opacity={0.18} />
        {stageActors.map((a) => {
          const px = 80 + a.x * (1000 - 320);
          const py = 300 + a.bob;
          const sway = Math.sin(a.phase) * 5;
          const flip = a.dir < 0 ? -1 : 1;
          return (
            <g
              key={a.key}
              transform={`translate(${px} ${py}) rotate(${sway}) scale(${flip * 2.4} 2.4)`}
              opacity={0.95}
              style={{ cursor: "pointer" }}
              onClick={() => {
                const p = PUPPETS.find((pp) => pp.key === a.key);
                if (p) togglePuppet(p);
              }}
            >
              <rect x={-30} y={-30} width={60} height={75} fill="transparent" />
              <path d={SILHOUETTES[a.key]} fill="#080306" transform="translate(-50 -50)" />
            </g>
          );
        })}
        {stageActors.length === 0 && (
          <text
            x="500"
            y="240"
            textAnchor="middle"
            fill="#1c0f2e"
            opacity={0.55}
            fontSize="34"
            fontFamily="serif"
          >
            ✶
          </text>
        )}
      </svg>

      {/* ── Puppet rack (bottom). Big tap targets, no reading required. ── */}
      <div className="relative z-10 mt-auto flex w-full items-end justify-center gap-3 px-3 pb-6 sm:gap-5">
        {PUPPETS.map((p) => {
          const active = onStage.includes(p.key);
          return (
            <button
              key={p.key}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                togglePuppet(p);
              }}
              aria-label={p.label}
              aria-pressed={active}
              className={`flex flex-col items-center rounded-2xl border-2 transition-transform duration-150 ${
                active
                  ? "scale-95 border-violet-300/90 bg-violet-300/10"
                  : "border-border bg-black/30 hover:bg-black/40"
              }`}
              style={{
                minWidth: 76,
                minHeight: 76,
                padding: "10px 8px 8px",
                touchAction: "manipulation",
              }}
            >
              <svg
                width="56"
                height="56"
                viewBox="0 0 100 100"
                aria-hidden
                style={{
                  filter: active ? "drop-shadow(0 0 8px rgba(255,196,120,0.8))" : "none",
                }}
              >
                <path d={SILHOUETTES[p.key]} fill={active ? "#2a1410" : "#08040a"} />
              </svg>
              <span
                className="mt-1 h-1.5 w-6 rounded-full"
                style={{
                  background: active
                    ? "linear-gradient(90deg,#ffd27a,#ff8a3c)"
                    : "rgba(255,255,255,0.18)",
                }}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </main>
  );
}
