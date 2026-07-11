"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchPianoBuffer, makeFallbackSoloist } from "./audio";
import {
  makeListenerState,
  runListenerFrame,
  PITCH_NAMES,
  type ChordEstimate,
  type ListenerState,
} from "./listener";
import { buildAgent, type Agent } from "./agent";
import {
  makeSwarm,
  depositMotif,
  stepSwarm,
  rankedAgents,
  strongestAgent,
  consolidation,
  type SwarmState,
  type MotifAgent,
} from "./swarm";

// ─── Constants (pure) ─────────────────────────────────────────────────────────
const FFT_SIZE = 2048;

type Phase = "idle" | "loading" | "playing" | "ended" | "unsupported";
type Provenance = "his" | "fallback";

// Pure: warm hue (HSL) per chord root — a slow walk around the wheel,
// staying in amber/rose/cream territory.
function rootToHue(root: number): number {
  return 18 + root * 6; // 18°..84° (amber → warm gold)
}

// A name for a motif: its pitch-classes spelled out, e.g. "A·C·E".
function motifName(m: MotifAgent | null): string {
  if (!m) return "—";
  return m.pcs.map((pc) => PITCH_NAMES[pc]).join("·");
}

// A laid-out dot for one swarm agent (positions are pure of pheromone so they
// drift gently; brightness reads pheromone).
type DotLayout = { id: number; baseX: number; baseY: number; phase: number };

// Pure: a soft display state we hand to the canvas each frame.
type Visual = {
  energy: number; // 0..1 his playing energy
  answering: number; // 0..1 how lit the agent's answer is
  hue: number;
  tension: number; // 0..1
};

export default function AnsweringSwarm() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [provenance, setProvenance] = useState<Provenance>("his");
  const [chordName, setChordName] = useState("—");
  const [company, setCompany] = useState(0.5);
  const [trading, setTrading] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  // Swarm readouts (updated at a calm cadence).
  const [swarmCount, setSwarmCount] = useState(0);
  const [themeName, setThemeName] = useState("—");
  const [consolidationPct, setConsolidationPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Audio + analysis refs (never touched at module top).
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const listenerRef = useRef<ListenerState | null>(null);
  const swarmRef = useRef<SwarmState | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualRef = useRef<Visual>({ energy: 0, answering: 0, hue: 30, tension: 1 });
  const lastTsRef = useRef<number>(0);
  const companyRef = useRef<number>(0.5);
  const tradingRef = useRef<boolean>(false);
  const startTsRef = useRef<number>(0);
  const lastTradeRef = useRef<number>(0); // last trading-fours swell (ctx time)
  // Stable visual layout per agent id (so dots don't jump frame to frame).
  const layoutRef = useRef<Map<number, DotLayout>>(new Map());

  // Keep the agent's company in sync with the slider without re-wiring.
  useEffect(() => {
    companyRef.current = company;
    agentRef.current?.setCompany(company);
  }, [company]);

  useEffect(() => {
    tradingRef.current = trading;
  }, [trading]);

  // ─── Teardown (idempotent) ──
  const teardown = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    agentRef.current?.dispose();
    agentRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    listenerRef.current = null;
    swarmRef.current = null;
    layoutRef.current.clear();
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx) {
      ctx.close().catch(() => {
        // context may already be closing
      });
    }
  }, []);

  useEffect(() => {
    return () => teardown();
  }, [teardown]);

  // Ensure each agent has a stable drift layout.
  const layoutFor = useCallback((id: number): DotLayout => {
    const map = layoutRef.current;
    let l = map.get(id);
    if (!l) {
      // Deterministic-ish scatter from the id.
      const a = (id * 2654435761) % 1000;
      const b = (id * 40503) % 1000;
      l = {
        id,
        baseX: 0.18 + (a / 1000) * 0.64,
        baseY: 0.2 + (b / 1000) * 0.6,
        phase: (a / 1000) * Math.PI * 2,
      };
      map.set(id, l);
    }
    return l;
  }, []);

  // ─── Render loop (canvas + per-frame analysis) ──
  const runFrame = useCallback(
    (ts: number) => {
      rafRef.current = requestAnimationFrame(runFrame);
      const ctx = ctxRef.current;
      const analyser = analyserRef.current;
      const listener = listenerRef.current;
      const agent = agentRef.current;
      const swarm = swarmRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !analyser || !listener || !agent || !swarm) return;

      const dt = lastTsRef.current ? ts - lastTsRef.current : 16;
      lastTsRef.current = ts;
      if (!startTsRef.current) startTsRef.current = ts;

      // 1) Listen.
      const bins = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(bins);
      runListenerFrame(listener, bins, ctx.sampleRate, FFT_SIZE, dt);

      // 2) Swarm stigmergy: harvest his finished phrases, then let every agent
      //    sense the current harmony and deposit/decay pheromone.
      if (listener.harvested) {
        depositMotif(swarm, listener.harvested, swarm.clockMs);
      }
      stepSwarm(swarm, listener.chord, listener.energy, dt);

      // 3) Accompany. Pad swells with his energy; voice the current chord.
      const now = ctx.currentTime;
      agent.setChord(listener.chord);
      agent.updatePad(listener.energy, now);

      // 4) Answer in his gaps with the strongest swarm motif (snapped to key).
      const top = strongestAgent(swarm);
      if (listener.gapJustOpened && top) {
        agent.answerWithMotif(top, listener.chord, now, false);
      }
      // Trading-fours: a periodic longer, extended swell that takes a full turn
      // built from the consolidated theme — only when toggled on.
      if (tradingRef.current && top && now - lastTradeRef.current > 9) {
        if (!agent.isAnswering(now) && listener.energy < 0.12) {
          agent.answerWithMotif(top, listener.chord, now, true);
          lastTradeRef.current = now;
        }
      }

      // 5) Update the visual model.
      const v = visualRef.current;
      v.energy = listener.energy;
      v.hue = rootToHue(listener.chord.root);
      v.tension = listener.chord.tension;
      const answering = agent.isAnswering(now) ? 1 : 0;
      v.answering = v.answering * 0.85 + answering * 0.15;

      // Surface readouts to the UI at a calm cadence.
      if (Math.floor(ts / 220) !== Math.floor((ts - dt) / 220)) {
        setChordName(formatChord(listener.chord));
        setSwarmCount(swarm.agents.length);
        setThemeName(motifName(top));
        setConsolidationPct(Math.round(consolidation(swarm) * 100));
        setElapsed(Math.floor((ts - startTsRef.current) / 1000));
      }

      if (canvas) drawScene(canvas, v, rankedAgents(swarm), layoutFor, ts);
    },
    [layoutFor],
  );

  // ─── Begin ──
  const begin = useCallback(async () => {
    setPhase("loading");
    let ctx: AudioContext;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new Ctor();
    } catch {
      setPhase("unsupported");
      return;
    }
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => undefined);
    }

    // The soloist: his recording, or the synth fallback (never silent).
    let buffer = await fetchPianoBuffer(ctx);
    if (buffer) {
      setProvenance("his");
    } else {
      buffer = await makeFallbackSoloist(ctx.sampleRate);
      setProvenance("fallback");
    }

    if (!ctxRef.current) return; // unmounted mid-load

    // Master out.
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    // Soloist plays WHOLE through its own gain.
    const soloGain = ctx.createGain();
    soloGain.gain.value = 0.85;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(soloGain).connect(master);

    // The listener taps the soloist (analyser sits on the solo path only,
    // so the agent never analyzes its own output).
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6;
    soloGain.connect(analyser);

    // The agent: a SECOND synthesized voice, into master.
    const agent = buildAgent(ctx, master);
    agent.setCompany(companyRef.current);

    sourceRef.current = source;
    analyserRef.current = analyser;
    agentRef.current = agent;
    listenerRef.current = makeListenerState();
    swarmRef.current = makeSwarm();
    lastTsRef.current = 0;
    startTsRef.current = 0;
    lastTradeRef.current = 0;
    layoutRef.current.clear();

    source.start();
    setPhase("playing");
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const stop = useCallback(() => {
    teardown();
    setPhase("ended");
    setChordName("—");
    setThemeName("—");
    setSwarmCount(0);
    setConsolidationPct(0);
    visualRef.current = { energy: 0, answering: 0, hue: 30, tension: 1 };
  }, [teardown]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#1a120c] text-foreground">
      {/* Soft hearth wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 38%, rgba(120,72,30,0.45), rgba(26,18,12,0) 60%)",
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 py-16">
        <header className="text-center">
          <p className="font-mono text-base uppercase tracking-[0.3em] text-violet-200/80">
            792 · answering swarm
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground sm:text-4xl">
            A duet with a swarm of his own motifs
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-muted-foreground">
            His &ldquo;Welcome Home&rdquo; piano plays whole, as the soloist. A
            swarm of tiny memory-agents harvests fragments of his phrases — each
            holding one motif — and they self-organize over minutes: the
            fragments that fit the music are reinforced, the rest fade, until a
            few recurring themes <em>emerge</em> and answer back in his gaps.
          </p>
        </header>

        {/* The warm minimal swarm field */}
        <div className="relative flex h-64 w-full max-w-md items-center justify-center">
          <canvas
            ref={canvasRef}
            width={760}
            height={420}
            className="h-full w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-between px-6 text-base text-muted-foreground">
            <span className="font-mono">him</span>
            <span className="font-mono">the swarm</span>
          </div>
        </div>

        {/* Currently-detected chord (big) */}
        <div className="text-center">
          <p className="text-base text-muted-foreground">listening — chord under his hands</p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-violet-100">
            {chordName}
          </p>
        </div>

        {/* Swarm readout */}
        <div className="flex w-full max-w-md flex-col items-center gap-1 text-center">
          <p className="font-mono text-base text-muted-foreground">
            swarm: {swarmCount} motifs · strongest theme{" "}
            <span className="text-violet-100">{themeName}</span>
          </p>
          <p className="font-mono text-base text-muted-foreground">
            consolidation {consolidationPct}% · {fmtTime(elapsed)} elapsed
          </p>
        </div>

        {/* Controls */}
        <div className="flex w-full max-w-md flex-col items-center gap-5">
          {phase !== "playing" ? (
            <button
              type="button"
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-full bg-violet-300 px-8 py-2.5 text-base font-semibold text-[#241509] shadow-lg shadow-violet-900/40 transition hover:bg-violet-200 disabled:opacity-60"
            >
              {phase === "loading"
                ? "Warming up…"
                : phase === "ended"
                  ? "Begin again"
                  : "Begin"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stop}
              className="min-h-[44px] rounded-full border border-violet-200/50 px-8 py-2.5 text-base font-semibold text-foreground transition hover:bg-violet-200/10"
            >
              Let the room rest
            </button>
          )}

          <div className="w-full">
            <div className="flex items-center justify-between text-base text-muted-foreground">
              <span>shy</span>
              <span className="font-mono text-muted-foreground">company</span>
              <span>talkative</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={company}
              onChange={(e) => setCompany(parseFloat(e.target.value))}
              aria-label="how forward the agent is"
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-violet-200/25 accent-violet-300"
            />
          </div>

          <button
            type="button"
            onClick={() => setTrading((t) => !t)}
            aria-pressed={trading}
            className={`min-h-[44px] rounded-full border px-4 py-2.5 text-base font-semibold transition ${
              trading
                ? "border-violet-300/70 bg-violet-300/15 text-violet-100"
                : "border-violet-200/30 text-muted-foreground hover:bg-violet-200/10"
            }`}
          >
            {trading ? "trading fours · on" : "trading fours · off"}
          </button>

          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] text-base text-violet-200/80 underline-offset-4 hover:underline"
          >
            {showNotes ? "Hide the design notes" : "Read the design notes"}
          </button>
        </div>

        {/* Provenance badge */}
        {phase === "playing" && (
          <div
            className={`rounded-full border px-4 py-1.5 text-base ${
              provenance === "his"
                ? "border-violet-300/40 text-violet-100/90"
                : "border-violet-300/40 text-violet-100/90"
            }`}
          >
            {provenance === "his"
              ? "soloist · his recording"
              : "soloist · synthesized fallback (recording unavailable)"}
          </div>
        )}

        {phase === "unsupported" && (
          <p className="max-w-md text-center text-base text-violet-300">
            Your browser would not open an audio context. Try a recent Chrome,
            Firefox, or Safari and tap Begin again.
          </p>
        )}

        {showNotes && (
          <section className="w-full max-w-lg rounded-2xl border border-violet-200/20 bg-black/20 p-6 text-base leading-relaxed text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-3">
              His recording is the <strong>soloist</strong> — it plays whole,
              never chopped into grains. A <strong>listener</strong> folds the
              FFT into a 12-bin chroma to pick the triad under his hands and uses
              spectral-flux onsets + a phrase-gap state machine to harvest short
              <em> motif fragments</em> from his finished phrases.
            </p>
            <p className="mt-3">
              Each fragment becomes a tiny agent in a{" "}
              <strong>stigmergic swarm</strong>. Every frame each agent senses
              the current chord/key and <em>deposits</em> pheromone when its
              pitch-classes fit, while a global evaporation fades the rest. Over
              minutes the colony consolidates toward a few strong{" "}
              <em>bridging motifs</em> — emergent recurring themes — which the
              soft FM bell sounds back in his gaps, snapped to his key. So minute
              5 has settled themes that minute 1 did not.
            </p>
            <p className="mt-3 text-muted-foreground">
              Lineage: Markus J. Buehler, <em>MusicSwarm</em> (2026); George
              Lewis, <em>Voyager</em>; <em>LiveBand</em> (2026, causal past-only
              accompaniment). Full notes live in the folder README.
            </p>
            <Link
              href="/dream"
              className="mt-4 inline-block text-violet-200/80 underline-offset-4 hover:underline"
            >
              ← back to the gallery
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

// ─── Pure helpers ────────────────────────────────────────────────────────────
function formatChord(chord: ChordEstimate): string {
  if (chord.strength < 0.12) return "…";
  return chord.name;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Drawing (canvas + a visual snapshot + the ranked swarm) ─────────────────
function drawScene(
  canvas: HTMLCanvasElement,
  v: Visual,
  ranked: MotifAgent[],
  layoutFor: (id: number) => { baseX: number; baseY: number; phase: number },
  ts: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cy = h * 0.5;
  const hisX = w * 0.14;

  // Faint duet thread from "him" toward the swarm field.
  ctx.strokeStyle = "rgba(255, 214, 170, 0.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hisX, cy);
  ctx.lineTo(w * 0.55, cy);
  ctx.stroke();

  // HIM: a breathing glow whose scale/brightness tracks his energy.
  const breathe = 0.85 + 0.15 * Math.sin(ts / 900);
  const hisR = (34 + v.energy * 78) * breathe;
  drawGlow(ctx, hisX, cy, hisR, v.hue, 0.5 + v.energy * 0.4);

  // THE SWARM: one warm dot per agent, brightness = pheromone strength.
  // Strongest agents are drawn last (on top) and glow brighter / larger.
  const maxPher =
    ranked.length > 0
      ? Math.max(0.01, ...ranked.map((a) => a.pheromone))
      : 0.01;
  for (let i = ranked.length - 1; i >= 0; i--) {
    const a = ranked[i];
    const l = layoutFor(a.id);
    // Strong agents drift slightly toward the field centre (consolidation).
    const norm = a.pheromone / maxPher; // 0..1
    const drift = norm * 0.12;
    const cx = (l.baseX * (1 - drift) + 0.5 * drift) * w;
    const dy = l.baseY * h;
    const wobble = 7 * Math.sin(ts / 1300 + l.phase);
    const x = cx + wobble;
    const y = dy + wobble * 0.6;
    const r = 6 + norm * 26;
    const alpha = 0.12 + norm * 0.7;
    drawGlow(ctx, x, y, r, v.hue + 14 + norm * 10, alpha);
    // A faint thread to "him" for the dominant theme, lighting on answers.
    if (i === 0) {
      ctx.strokeStyle = `hsla(${v.hue + 18}, 80%, 72%, ${0.08 + v.answering * 0.35})`;
      ctx.lineWidth = 1.5 + v.answering * 2;
      ctx.beginPath();
      ctx.moveTo(hisX, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }

  // Tension hint: a soft ring around HIM when the chord is ambiguous.
  if (v.tension > 0.55) {
    ctx.strokeStyle = `hsla(${v.hue - 8}, 70%, 70%, ${(v.tension - 0.55) * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hisX, cy, hisR + 12, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hue: number,
  alpha: number,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `hsla(${hue}, 85%, 72%, ${alpha})`);
  g.addColorStop(0.5, `hsla(${hue}, 80%, 58%, ${alpha * 0.5})`);
  g.addColorStop(1, `hsla(${hue}, 70%, 40%, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
