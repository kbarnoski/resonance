"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mycelium } from "./growth";
import { MyceliumAudio } from "./audio";

/**
 * 1050 · Mycelial Grow
 *
 * Watch gold mycelium colonise the dark in real time via the Space
 * Colonization Algorithm. Long-form: fresh attractor clouds reseed in slow
 * waves so the network keeps reaching NEW territory and is visibly more
 * complex at minute 5 than minute 1. Each branch split rings a soft consonant
 * tone. Breath (mic, analysis-only) drives growth rate and tip brightness.
 */

// Warm-organic palette by branch depth: tips gold, inner branches dim to ochre.
// Returned as [r,g,b]. No blue/violet/neon ever.
function depthColor(depth01: number): [number, number, number] {
  // 0 = freshest tip (bright gold), 1 = deep/old (rust→brown ochre).
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [255, 236, 170]], // pale gold tip glow
    [0.18, [255, 205, 92]], // amber
    [0.45, [228, 150, 48]], // ochre/orange
    [0.72, [176, 96, 34]], // rust
    [1.0, [104, 58, 26]], // deep loam brown
  ];
  const d = Math.max(0, Math.min(1, depth01));
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (d - t0) / (t1 - t0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export default function MycelialGrowPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [elapsed, setElapsed] = useState(0);

  // Imperative refs for the running engine (no re-render churn).
  const rafRef = useRef<number | null>(null);
  const mycRef = useRef<Mycelium | null>(null);
  const audioRef = useRef<MyceliumAudio | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micBufRef = useRef<Float32Array | null>(null);
  const breathRef = useRef(0);
  const startMsRef = useRef(0);
  const micOnRef = useRef(false);

  // Full teardown.
  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    analyserRef.current = null;
    micBufRef.current = null;
    const a = audioRef.current;
    audioRef.current = null;
    if (a) void a.dispose();
    mycRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    startMsRef.current = performance.now();

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the canvas to its box with devicePixelRatio.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(640, Math.floor(rect.width));
    const H = Math.max(420, Math.floor(rect.height));
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // --- Build the network (seed time → never the same twice). ---
    const myc = new Mycelium(
      { width: W, height: H, maxNodes: 4200, attractionRadius: 84, killRadius: 13, segmentLength: 7 },
      (Date.now() & 0xffffff) ^ Math.floor(Math.random() * 0xffffff)
    );
    myc.seedRoots(4);
    myc.seedAttractors(420);
    mycRef.current = myc;

    // --- Audio (gesture-gated). ---
    const AC: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AC();
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
      } catch {
        /* ignore */
      }
    }
    const engine = new MyceliumAudio(audioCtx);
    engine.start();
    audioRef.current = engine;

    // --- Mic (analysis-only, never connected to destination). ---
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      micStreamRef.current = stream;
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser); // NOT connected to destination — no feedback.
      analyserRef.current = analyser;
      micBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      micOnRef.current = true;
      setMicState("on");
    } catch {
      micOnRef.current = false;
      setMicState("denied");
    }

    // Paint the dark loam ground once.
    ctx.fillStyle = "#0a0705";
    ctx.fillRect(0, 0, W, H);

    // Slow reseed waves: every ~5.5s a fresh attractor cloud somewhere new.
    let lastReseed = performance.now();
    let reseedCorner = 0;

    let lastUiUpdate = 0;

    const loop = () => {
      const m = mycRef.current;
      const eng = audioRef.current;
      if (!m || !eng) return;

      // Read breath RMS (analysis-only).
      const analyser = analyserRef.current;
      const buf = micBufRef.current;
      if (analyser && buf) {
        analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        // Smooth + expand into a usable 0..1 breath signal.
        const target = Math.min(1, rms * 6);
        breathRef.current += (target - breathRef.current) * 0.12;
      }
      const breath = breathRef.current;

      // Growth rate: calm default in self-drive, surges with breath.
      const base = micOnRef.current ? 0.28 : 0.6;
      const growthScale = Math.min(1.4, base + breath * 1.6);

      // Reseed in slow waves → keeps colonising NEW territory (long-form).
      const now = performance.now();
      if (now - lastReseed > 5500 && m.liveAttractorCount() < 160) {
        const corners: Array<[number, number]> = [
          [W * 0.18, H * 0.22],
          [W * 0.82, H * 0.28],
          [W * 0.2, H * 0.8],
          [W * 0.8, H * 0.78],
          [W * 0.5, H * 0.5],
        ];
        const [cx, cy] = corners[reseedCorner % corners.length];
        reseedCorner++;
        m.seedAttractors(220, { cx, cy, r: Math.min(W, H) * 0.34 });
        lastReseed = now;
      }

      // One or two growth steps per frame depending on breath.
      const steps = growthScale > 0.9 ? 2 : 1;
      const drawn: Array<{ node: number; depth: number; isFork: boolean; x: number }> = [];
      for (let s = 0; s < steps; s++) {
        const events = m.grow(growthScale);
        for (const e of events) drawn.push({ node: e.node, depth: e.depth, isFork: e.isFork, x: e.x });
      }

      // --- Gentle breathing recolonisation: fade the whole field slightly each
      // frame so the oldest filaments dim to make room. Lets it run forever. ---
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(10, 7, 5, 0.018)";
      ctx.fillRect(0, 0, W, H);

      // --- Draw the new segments with additive glow; tips brightest. ---
      ctx.globalCompositeOperation = "lighter";
      const maxDepthSeen = 26; // normaliser for colour ramp
      for (const d of drawn) {
        const node = m.nodes[d.node];
        if (!node || node.parent < 0) continue;
        const parent = m.nodes[node.parent];
        if (!parent) continue;

        const depth01 = Math.min(1, d.depth / maxDepthSeen);
        const [r, g, b] = depthColor(depth01);
        // Older/inner branches thicken; tips are thin and bright.
        const width = 0.6 + depth01 * 2.6;
        // Tip glow scaled by breath.
        const glow = (1 - depth01) * (0.5 + 0.5 * breath);

        // Soft bloom: a faint wide stroke under a bright thin core.
        ctx.lineCap = "round";
        ctx.strokeStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${0.10 + glow * 0.18})`;
        ctx.lineWidth = width + 2.2 + glow * 3.2;
        ctx.beginPath();
        ctx.moveTo(parent.x, parent.y);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();

        ctx.strokeStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${0.55 + glow * 0.4})`;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(parent.x, parent.y);
        ctx.lineTo(node.x, node.y);
        ctx.stroke();

        // Bright bloom dot at the growing tip.
        if (glow > 0.25) {
          ctx.fillStyle = `rgba(255, 240, 200, ${glow * 0.5})`;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 0.8 + glow * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Sonify forks (and a fraction of plain splits) → shimmer, not machine-gun.
        if (d.isFork || (depth01 < 0.5 && Math.random() < 0.16)) {
          eng.branch(d.x / W, depth01, 0.4 + breath * 0.6);
        }
      }
      ctx.globalCompositeOperation = "source-over";

      // UI clock (throttled).
      if (now - lastUiUpdate > 500) {
        setElapsed((now - startMsRef.current) / 1000);
        lastUiUpdate = now;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [started]);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60);
  const clock = `${mm}:${ss.toString().padStart(2, "0")}`;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0705] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-label="Growing mycelial network"
      />

      {/* Header / title */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Mycelial Grow
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Gold filaments colonise the dark in real time. Never the same twice —
          and genuinely different at minute five than at minute one.
        </p>
        {started && (
          <p className="mt-2 font-mono text-base text-muted-foreground">
            elapsed {clock}
            {micState === "on" && " · breathe to bloom"}
            {micState === "off" && " · self-drive"}
          </p>
        )}
      </div>

      {/* Begin gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="flex max-w-lg flex-col items-center px-6 text-center">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              Watch the mycelium grow
            </h2>
            <p className="mt-3 text-base text-foreground">
              A long-form audio-visual piece. Branching gold filaments grow via
              the space colonization algorithm, each split ringing a soft
              consonant tone over a warm drone. Optional: allow the mic and
              breathe — the network blooms faster.
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-7 min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-semibold text-[#1a0f06] transition-colors hover:bg-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              Begin
            </button>
            <p className="mt-3 text-base text-muted-foreground">
              Audio starts on tap. Mic is analysis-only — never recorded, never
              played back.
            </p>
          </div>
        </div>
      )}

      {/* Mic-denied notice */}
      {started && micState === "denied" && (
        <p className="absolute bottom-16 left-5 z-10 max-w-xs text-base text-violet-300">
          Mic unavailable — running in self-drive. The mycelium grows on its own
          at a calm default rate.
        </p>
      )}

      {/* Design-notes toggle */}
      <button
        type="button"
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-full border border-border bg-black/55 px-4 py-2.5 text-base text-foreground backdrop-blur transition-colors hover:bg-black/70 hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/80 p-6 backdrop-blur-md">
          <div className="mt-16 max-w-2xl text-foreground">
            <h2 className="text-2xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-3 text-base text-foreground">
              This is a living branching network grown with the{" "}
              <span className="text-foreground">Space Colonization Algorithm</span>{" "}
              (Runions, Lane &amp; Prusinkiewicz, 2007). A cloud of attractor
              points pulls growth nodes forward; each attractor influences its
              nearest node, nodes step toward the average direction of the
              attractors pulling them, and attractors within a kill radius are
              consumed. Branching emerges naturally when a node is pulled in
              divergent directions.
            </p>
            <p className="mt-3 text-base text-foreground">
              Fresh attractor clouds reseed in slow waves, so the network keeps
              reaching new territory — it is visibly more complex at minute five
              than at minute one. The whole field fades a hair each frame, so the
              oldest filaments dim and it can run indefinitely (a slow breathing
              recolonisation).
            </p>
            <p className="mt-3 text-base text-foreground">
              Each branch split triggers a soft tone from a fixed A-minor
              pentatonic set (no wrong notes), panned by x and pitched by depth,
              over a warm 55 Hz drone with a just fifth. Voice count is capped so
              dense growth shimmers rather than clips. The mic is analysis-only:
              breath RMS drives growth rate and tip brightness, and is never
              connected to the speakers.
            </p>
            <p className="mt-4 text-base text-muted-foreground">
              References: Runions, Lane &amp; Prusinkiewicz, &ldquo;Modeling Trees
              with a Space Colonization Algorithm&rdquo; (2007, algorithmicbotany.org)
              · Jason Webb, &ldquo;Modeling organic branching structures with the
              space colonization algorithm and JavaScript&rdquo; · Paul Stamets,{" "}
              <span className="italic">Mycelium Running</span>.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-full border border-border bg-muted px-5 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
