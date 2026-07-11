"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchPianoBuffer, makeFallbackSoloist } from "./audio";
import {
  makeListenerState,
  runListenerFrame,
  type ChordEstimate,
  type ListenerState,
} from "./listener";
import { buildAgent, type Agent, type MotifSnapshot } from "./agent";

// ─── Constants (pure) ─────────────────────────────────────────────────────────
const FFT_SIZE = 2048;

type Phase = "idle" | "loading" | "playing" | "ended" | "unsupported";
type Provenance = "his" | "fallback";

// Warm hue (HSL) per chord root — amber / warm-gold territory.
function rootToHue(root: number): number {
  return 18 + root * 6; // 18°..84°
}

// A soft display state handed to the hearth canvas each frame.
type Visual = {
  energy: number; // 0..1 his playing energy
  answering: number; // 0..1 how lit the agent's answer is
  hue: number;
  tension: number; // 0..1
};

export default function RememberingRoom() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [provenance, setProvenance] = useState<Provenance>("his");
  const [chordName, setChordName] = useState("—");
  const [company, setCompany] = useState(0.5);
  const [memoryLean, setMemoryLean] = useState(0.5);
  const [showNotes, setShowNotes] = useState(false);
  const [bankSize, setBankSize] = useState(0);
  const [pressurePct, setPressurePct] = useState(0);

  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const agentRef = useRef<Agent | null>(null);
  const listenerRef = useRef<ListenerState | null>(null);
  const rafRef = useRef<number | null>(null);
  const hearthRef = useRef<HTMLCanvasElement | null>(null);
  const shelfRef = useRef<HTMLCanvasElement | null>(null);
  const visualRef = useRef<Visual>({
    energy: 0,
    answering: 0,
    hue: 30,
    tension: 1,
  });
  const lastTsRef = useRef<number>(0);
  const companyRef = useRef<number>(0.5);
  const memoryLeanRef = useRef<number>(0.5);

  useEffect(() => {
    companyRef.current = company;
    agentRef.current?.setCompany(company);
  }, [company]);

  useEffect(() => {
    memoryLeanRef.current = memoryLean;
    agentRef.current?.setMemoryLean(memoryLean);
  }, [memoryLean]);

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

  // ─── Render loop ──
  const runFrame = useCallback((ts: number) => {
    rafRef.current = requestAnimationFrame(runFrame);
    const ctx = ctxRef.current;
    const analyser = analyserRef.current;
    const listener = listenerRef.current;
    const agent = agentRef.current;
    const hearth = hearthRef.current;
    const shelf = shelfRef.current;
    if (!ctx || !analyser || !listener || !agent) return;

    const dt = lastTsRef.current ? ts - lastTsRef.current : 16;
    lastTsRef.current = ts;

    // 1) Listen.
    const bins = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(bins);
    runListenerFrame(listener, bins, ctx.sampleRate, FFT_SIZE, dt);

    // 2) Accompany.
    const now = ctx.currentTime;
    agent.setChord(listener.chord);
    agent.updatePad(listener.energy, now);

    // 3) Lift his recurring gesture into the bank when a phrase just ended.
    if (listener.hasFreshContour) {
      agent.liftContour(listener.lastPhraseContour, now);
    }

    // 4) Answer in the gaps (one-shot when a gap opens). With age, the answer
    //    increasingly recalls + develops a banked motif rather than inventing.
    if (listener.gapJustOpened) {
      agent.answer(listener.chord, listener.lastBrightChroma, now);
    }

    // 5) Update the hearth visual model.
    const v = visualRef.current;
    v.energy = listener.energy;
    v.hue = rootToHue(listener.chord.root);
    v.tension = listener.chord.tension;
    const answering = agent.isAnswering(now) ? 1 : 0;
    v.answering = v.answering * 0.85 + answering * 0.15;

    // 6) Surface chord / bank stats at a calm cadence.
    if (Math.floor(ts / 200) !== Math.floor((ts - dt) / 200)) {
      setChordName(formatChord(listener.chord));
    }
    const snap = agent.memorySnapshot();
    if (Math.floor(ts / 400) !== Math.floor((ts - dt) / 400)) {
      setBankSize(snap.length);
      setPressurePct(Math.round(agent.memoryPressure() * 100));
    }

    if (hearth) drawHearth(hearth, v);
    if (shelf) drawShelf(shelf, snap, v.hue, agent.lastRecalledId());
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

    let buffer = await fetchPianoBuffer(ctx);
    if (buffer) {
      setProvenance("his");
    } else {
      buffer = await makeFallbackSoloist(ctx.sampleRate);
      setProvenance("fallback");
    }

    if (!ctxRef.current) return; // unmounted mid-load

    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    const soloGain = ctx.createGain();
    soloGain.gain.value = 0.85;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(soloGain).connect(master);

    // Analyser taps the solo path only (the agent never analyzes itself).
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.6;
    soloGain.connect(analyser);

    const agent = buildAgent(ctx, master);
    agent.setCompany(companyRef.current);
    agent.setMemoryLean(memoryLeanRef.current);

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
    setBankSize(0);
    setPressurePct(0);
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
            "radial-gradient(120% 90% at 50% 36%, rgba(120,72,30,0.45), rgba(26,18,12,0) 60%)",
        }}
      />

      <Link
        href="/dream"
        className="absolute left-5 top-5 z-20 font-mono text-base text-violet-200/80 underline-offset-4 hover:underline"
      >
        ← gallery
      </Link>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-7 px-6 py-16">
        <header className="text-center">
          <p className="font-mono text-base uppercase tracking-[0.3em] text-violet-200/80">
            814 · remembering room
          </p>
          <h1 className="mt-3 font-semibold text-3xl font-semibold text-foreground sm:text-4xl">
            Welcome Home, remembered
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-foreground">
            His &ldquo;Welcome Home&rdquo; piano plays whole, as the soloist. A
            live music agent answers in his gaps — but this one{" "}
            <em>remembers</em>: it banks motifs, then over minutes transposes,
            augments, fragments and inverts them, so minute five is a
            development of minute one.
          </p>
        </header>

        {/* The warm minimal hearth */}
        <div className="relative flex h-56 w-full max-w-md items-center justify-center">
          <canvas
            ref={hearthRef}
            width={760}
            height={380}
            className="h-full w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center justify-between px-6 text-base text-muted-foreground">
            <span className="font-mono">him</span>
            <span className="font-mono">the answer</span>
          </div>
        </div>

        {/* Currently-detected chord (big) */}
        <div className="text-center">
          <p className="text-base text-muted-foreground">chord under his hands</p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-violet-100">
            {chordName}
          </p>
        </div>

        {/* The memory shelf — the long-form memory, made legible */}
        <div className="w-full max-w-md">
          <div className="flex items-baseline justify-between text-base text-muted-foreground">
            <span className="font-mono">memory shelf</span>
            <span className="font-mono tabular-nums text-violet-200/90">
              {bankSize} motifs · {pressurePct}% recall pressure
            </span>
          </div>
          <canvas
            ref={shelfRef}
            width={760}
            height={150}
            className="mt-2 h-[75px] w-full rounded-lg border border-violet-200/15 bg-black/25"
          />
          <p className="mt-2 text-base text-muted-foreground">
            Each glyph is a banked motif&rsquo;s contour; amber ones are{" "}
            <span className="text-violet-200/90">his gestures, lifted</span>,
            rose ones are the agent&rsquo;s own answers. A glyph flares when it
            is recalled and developed.
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
              <span className="font-mono text-foreground">company</span>
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

          <div className="w-full">
            <div className="flex items-center justify-between text-base text-muted-foreground">
              <span>invent</span>
              <span className="font-mono text-foreground">memory</span>
              <span>recall</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={memoryLean}
              onChange={(e) => setMemoryLean(parseFloat(e.target.value))}
              aria-label="how strongly the agent leans on memory"
              className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-violet-200/25 accent-violet-300"
            />
          </div>

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
                : "border-violet-300/40 text-violet-300/95"
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
          <section className="w-full max-w-lg rounded-2xl border border-violet-200/20 bg-black/20 p-6 text-base leading-relaxed text-foreground">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-3">
              This is a <strong>live music agent</strong> with{" "}
              <strong>long-form memory</strong>. His recording is the soloist —
              it plays whole, never chopped. A second, synthesized voice listens
              (a 12-bin chroma vector picks the triad under his hands; energy and
              spectral flux find the gaps between his phrases) and answers into
              the silences.
            </p>
            <p className="mt-3">
              What is new: the agent keeps an{" "}
              <strong>adaptive phrase bank</strong> of motifs stored{" "}
              <em>symbolically</em> and key-independently (scale-degree steps +
              relative durations). It banks its own best answers and lifts
              salient contours from his playing. As the piece ages, a rising{" "}
              <em>recall pressure</em> makes it increasingly quote a banked
              motif and develop it — transpose into the current key, augment or
              diminish the rhythm, fragment to the head, invert, sequence — so
              the piece accretes coherence over minutes.
            </p>
            <p className="mt-3 text-muted-foreground">
              Lineage: CHI 2026 &ldquo;A Design Space for Live Music Agents&rdquo;
              (arXiv 2602.05064), whose &ldquo;Adaptive Phrase Bank&rdquo; seeds
              this build and which notes that sustained motif development is a
              gap; Christopher Raphael&rsquo;s <em>Music Plus One</em>
              score-following; and this lab&rsquo;s own 770 · answering room,
              whose agent had no memory. Full notes in the folder README.
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

// ─── Pure-ish drawing ─────────────────────────────────────────────────────────
function formatChord(chord: ChordEstimate): string {
  if (chord.strength < 0.12) return "…";
  return chord.name;
}

function drawHearth(canvas: HTMLCanvasElement, v: Visual): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cy = h * 0.48;
  const hisX = w * 0.34;
  const ansX = w * 0.66;

  // Faint duet thread.
  ctx.strokeStyle = "rgba(255, 214, 170, 0.14)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hisX, cy);
  ctx.lineTo(ansX, cy);
  ctx.stroke();

  // HIM: a breathing glow scaled by his energy.
  const breathe = 0.85 + 0.15 * Math.sin(Date.now() / 900);
  const hisR = (44 + v.energy * 120) * breathe;
  drawGlow(ctx, hisX, cy, hisR, v.hue, 0.55 + v.energy * 0.4);

  // THE ANSWER: lit only while the agent is answering.
  const ansR = 30 + v.answering * 90;
  drawGlow(ctx, ansX, cy, ansR, v.hue + 14, 0.12 + v.answering * 0.75);

  if (v.tension > 0.55) {
    ctx.strokeStyle = `hsla(${v.hue - 8}, 70%, 70%, ${(v.tension - 0.55) * 0.5})`;
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

// The memory shelf: each banked motif a small glowing sparkline of its contour.
function drawShelf(
  canvas: HTMLCanvasElement,
  bank: MotifSnapshot[],
  hue: number,
  recalledId: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (bank.length === 0) {
    ctx.fillStyle = "rgba(255,224,180,0.45)";
    ctx.font = "26px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText("the shelf is empty — it fills as he plays", w / 2, h / 2 + 8);
    return;
  }

  const cols = Math.min(bank.length, 10);
  const cellW = w / cols;
  const padX = cellW * 0.16;
  const top = h * 0.2;
  const bot = h * 0.8;

  for (let i = 0; i < bank.length && i < cols; i++) {
    const m = bank[i];
    const x0 = i * cellW + padX;
    const x1 = (i + 1) * cellW - padX;
    // amber = his gestures lifted; rose = the agent's own answers.
    const baseHue = m.origin === "lifted" ? hue : 350;
    const isRecalled = m.id === recalledId;
    const flare = Math.max(m.active, isRecalled ? 1 : 0);
    const alpha = 0.34 + flare * 0.6;

    // Contour sparkline from the motif's degree steps.
    const degs = m.degrees;
    let dmin = Infinity;
    let dmax = -Infinity;
    for (const d of degs) {
      dmin = Math.min(dmin, d);
      dmax = Math.max(dmax, d);
    }
    const span = Math.max(1, dmax - dmin);

    ctx.lineWidth = 2 + flare * 2.5;
    ctx.strokeStyle = `hsla(${baseHue}, 80%, ${62 + flare * 16}%, ${alpha})`;
    ctx.beginPath();
    for (let n = 0; n < degs.length; n++) {
      const fx =
        degs.length > 1
          ? x0 + ((x1 - x0) * n) / (degs.length - 1)
          : (x0 + x1) / 2;
      const fy = bot - ((degs[n] - dmin) / span) * (bot - top);
      if (n === 0) ctx.moveTo(fx, fy);
      else ctx.lineTo(fx, fy);
    }
    ctx.stroke();

    // Recall count dots under the glyph.
    for (let r = 0; r < Math.min(m.recalls, 5); r++) {
      ctx.fillStyle = `hsla(${baseHue}, 80%, 70%, ${0.5 + flare * 0.4})`;
      ctx.beginPath();
      ctx.arc(x0 + 6 + r * 8, h - 8, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // A soft halo when actively developed.
    if (flare > 0.05) {
      const cx = (x0 + x1) / 2;
      const cy = (top + bot) / 2;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellW * 0.55);
      g.addColorStop(0, `hsla(${baseHue}, 85%, 70%, ${flare * 0.32})`);
      g.addColorStop(1, `hsla(${baseHue}, 85%, 70%, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, cellW * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
