"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  makeFallbackSoloist,
} from "./audio";
import {
  makeListenerState,
  runListenerFrame,
  type ChordEstimate,
  type ListenerState,
} from "./listener";
import { buildAgent, type Agent } from "./agent";

// ─── Constants (pure) ─────────────────────────────────────────────────────────
const FFT_SIZE = 2048;

type Phase = "idle" | "loading" | "playing" | "ended" | "unsupported";
type Provenance = "his" | "fallback";

// Pure: warm hue (HSL) per chord root — a slow walk around the wheel,
// staying in amber/rose/cream territory.
function rootToHue(root: number): number {
  return 18 + root * 6; // 18°..84° (amber → warm gold)
}

// Pure: a soft display state we hand to the canvas each frame.
type Visual = {
  energy: number; // 0..1 his playing energy
  answering: number; // 0..1 how lit the agent's answer is
  hue: number;
  tension: number; // 0..1
};

export default function AnsweringRoom() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [provenance, setProvenance] = useState<Provenance>("his");
  const [chordName, setChordName] = useState("—");
  const [company, setCompany] = useState(0.5);
  const [showNotes, setShowNotes] = useState(false);

  // Audio + analysis refs (never touched at module top).
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const listenerRef = useRef<ListenerState | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualRef = useRef<Visual>({ energy: 0, answering: 0, hue: 30, tension: 1 });
  const lastTsRef = useRef<number>(0);
  const companyRef = useRef<number>(0.5);

  // Keep the agent's company in sync with the slider without re-wiring.
  useEffect(() => {
    companyRef.current = company;
    agentRef.current?.setCompany(company);
  }, [company]);

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

  // ─── Render loop (canvas + per-frame analysis) ──
  const runFrame = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(runFrame);
    const ctx = ctxRef.current;
    const analyser = analyserRef.current;
    const listener = listenerRef.current;
    const agent = agentRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !analyser || !listener || !agent) return;

    const dt = lastTsRef.current ? ts - lastTsRef.current : 16;
    lastTsRef.current = ts;

    // 1) Listen.
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    runListenerFrame(listener, bins, ctx.sampleRate, FFT_SIZE, dt);

    // 2) Accompany. Pad swells with his energy; voice the current chord.
    const now = ctx.currentTime;
    agent.setChord(listener.chord);
    agent.updatePad(listener.energy, now);

    // 3) Answer in the gaps (one-shot when a gap opens).
    if (listener.gapJustOpened) {
      agent.answer(listener.chord, listener.lastBrightChroma, now);
    }

    // 4) Update the visual model.
    const v = visualRef.current;
    v.energy = listener.energy;
    v.hue = rootToHue(listener.chord.root);
    v.tension = listener.chord.tension;
    const answering = agent.isAnswering(now) ? 1 : 0;
    v.answering = v.answering * 0.85 + answering * 0.15;

    // Surface the chord name to the UI at a calm cadence.
    if (Math.floor(ts / 200) !== Math.floor((ts - dt) / 200)) {
      setChordName(formatChord(listener.chord));
    }

    if (canvas) drawScene(canvas, v);
  }, []);

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
    lastTsRef.current = 0;

    source.start();
    setPhase("playing");
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const stop = useCallback(() => {
    teardown();
    setPhase("ended");
    setChordName("—");
    visualRef.current = { energy: 0, answering: 0, hue: 30, tension: 1 };
  }, [teardown]);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#1a120c] text-white">
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
          <p className="font-mono text-base uppercase tracking-[0.3em] text-amber-200/80">
            770 · answering room
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
            A duet with the recording
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-white/80">
            His &ldquo;Welcome Home&rdquo; piano plays whole, as the soloist. A
            live music agent listens — tracking the chord under his hands and
            the silences between his phrases — and answers in the gaps.
          </p>
        </header>

        {/* The warm minimal visual */}
        <div className="relative flex h-64 w-full max-w-md items-center justify-center">
          <canvas
            ref={canvasRef}
            width={760}
            height={420}
            className="h-full w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-between px-6 text-base text-white/75">
            <span className="font-mono">him</span>
            <span className="font-mono">the answer</span>
          </div>
        </div>

        {/* Currently-detected chord (big) */}
        <div className="text-center">
          <p className="text-base text-white/75">listening — chord under his hands</p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-amber-100">
            {chordName}
          </p>
        </div>

        {/* Controls */}
        <div className="flex w-full max-w-md flex-col items-center gap-5">
          {phase !== "playing" ? (
            <button
              type="button"
              onClick={begin}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-full bg-amber-300 px-8 py-2.5 text-base font-semibold text-[#241509] shadow-lg shadow-amber-900/40 transition hover:bg-amber-200 disabled:opacity-60"
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
              className="min-h-[44px] rounded-full border border-amber-200/50 px-8 py-2.5 text-base font-semibold text-white transition hover:bg-amber-200/10"
            >
              Let the room rest
            </button>
          )}

          <div className="w-full">
            <div className="flex items-center justify-between text-base text-white/75">
              <span>shy</span>
              <span className="font-mono text-white/80">company</span>
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
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-amber-200/25 accent-amber-300"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] text-base text-amber-200/80 underline-offset-4 hover:underline"
          >
            {showNotes ? "Hide the design notes" : "Read the design notes"}
          </button>
        </div>

        {/* Provenance badge */}
        {phase === "playing" && (
          <div
            className={`rounded-full border px-4 py-1.5 text-base ${
              provenance === "his"
                ? "border-amber-300/40 text-amber-100/90"
                : "border-emerald-300/40 text-emerald-100/90"
            }`}
          >
            {provenance === "his"
              ? "soloist · his recording"
              : "soloist · synthesized fallback (recording unavailable)"}
          </div>
        )}

        {phase === "unsupported" && (
          <p className="max-w-md text-center text-base text-amber-100/90">
            Your browser would not open an audio context. Try a recent Chrome,
            Firefox, or Safari and tap Begin again.
          </p>
        )}

        {showNotes && (
          <section className="w-full max-w-lg rounded-2xl border border-amber-200/20 bg-black/20 p-6 text-base leading-relaxed text-white/80">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p className="mt-3">
              This is a <strong>live music agent</strong>. His recording is the
              soloist — it plays whole, never chopped into grains. A second,
              synthesized voice <em>listens</em> in real time: a 12-bin chroma
              vector folded from the FFT picks the triad under his hands, while
              spectral flux and energy find the gaps between his phrases. A warm
              pad voices that chord underneath him; a soft bell answers only in
              the silences, loosely inverting his last gesture and resolving on
              a chord tone.
            </p>
            <p className="mt-3 text-white/75">
              Lineage: CHI 2026 &ldquo;live music agents&rdquo;, Christopher
              Raphael&rsquo;s <em>Music Plus One</em> score-following, George
              Lewis&rsquo;s <em>Voyager</em>. Full notes live in the folder
              README.
            </p>
            <Link
              href="/dream"
              className="mt-4 inline-block text-amber-200/80 underline-offset-4 hover:underline"
            >
              ← back to the gallery
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

// ─── Pure-ish drawing (takes a canvas + a visual snapshot) ───────────────────
function formatChord(chord: ChordEstimate): string {
  if (chord.strength < 0.12) return "…";
  return chord.name;
}

function drawScene(canvas: HTMLCanvasElement, v: Visual): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cy = h * 0.46;
  const hisX = w * 0.34;
  const ansX = w * 0.66;

  // Faint connecting line — the duet thread.
  ctx.strokeStyle = "rgba(255, 214, 170, 0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hisX, cy);
  ctx.lineTo(ansX, cy);
  ctx.stroke();

  // HIM: a breathing glow whose scale/brightness tracks his energy.
  const breathe = 0.85 + 0.15 * Math.sin(Date.now() / 900);
  const hisR = (44 + v.energy * 120) * breathe;
  const hisHue = v.hue;
  drawGlow(ctx, hisX, cy, hisR, hisHue, 0.55 + v.energy * 0.4);

  // THE ANSWER: a second warm shape that lights up during answer phrases.
  const ansR = 30 + v.answering * 90;
  drawGlow(ctx, ansX, cy, ansR, hisHue + 14, 0.12 + v.answering * 0.75);

  // Tension hint: a soft ring around HIM when the chord is ambiguous.
  if (v.tension > 0.55) {
    ctx.strokeStyle = `hsla(${hisHue - 8}, 70%, 70%, ${(v.tension - 0.55) * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hisX, cy, hisR + 14, 0, Math.PI * 2);
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
