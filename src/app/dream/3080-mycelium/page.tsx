"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mycelium, mulberry32 } from "./growth";
import { MyceliumAudio } from "./audio";

/**
 * 3080 · Mycelium
 *
 * A psychedelic altered-state field that GROWS like living mycelium. Your hand
 * plants spores and scatters nutrient; the network filaments outward on its own
 * via the Space Colonization Algorithm (Runions, Lane & Prusinkiewicz, 2007),
 * branching where nutrient pulls in divergent directions and fusing
 * (anastomosis) where strands meet. It never erases itself — a true accreting
 * palimpsest, so minute 8 is not second 0. Touching a living strand rings its
 * voice: you play the web you grew.
 */

const SEED = 0x3080;

// ── Structural hue ramp (violet → magenta → soft lilac) keyed by depth band.
// Raw color lives ONLY here in the canvas art layer, drawn from the brand ramp.
const HUE_BANDS: Array<[number, number, number]> = [
  [120, 70, 210],
  [150, 80, 240],
  [176, 90, 230],
  [200, 104, 236],
  [196, 150, 250],
  [212, 182, 255],
];

export default function MyceliumPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [stats, setStats] = useState({ strands: 0, branches: 0, length: 0 });

  // Imperative engine refs (the hot loop never triggers React re-renders).
  const rafRef = useRef<number | null>(null);
  const mycRef = useRef<Mycelium | null>(null);
  const audioRef = useRef<MyceliumAudio | null>(null);
  const glowRef = useRef<HTMLCanvasElement | null>(null);
  const startMsRef = useRef(0);
  const lastUserMsRef = useRef(-1e9);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const bloomsRef = useRef<Array<{ x: number; y: number; born: number; strength: number }>>([]);
  const autoRnd = useRef<() => number>(mulberry32(SEED));
  const pointerDownRef = useRef(false);
  const lastScatterMsRef = useRef(0);
  const lastDragPluckMsRef = useRef(0);

  const teardown = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const a = audioRef.current;
    audioRef.current = null;
    if (a) void a.dispose();
    mycRef.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  // Convert a client point to canvas CSS-pixel coordinates.
  const toLocal = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = ((clientX - rect.left) / rect.width) * sizeRef.current.w;
    const y = ((clientY - rect.top) / rect.height) * sizeRef.current.h;
    return { x, y };
  }, []);

  // Plant a spore + feed nutrient, OR — if a living strand is under the finger —
  // ring that strand instead. This is the whole instrument.
  const touch = useCallback((x: number, y: number, isDrag: boolean) => {
    const m = mycRef.current;
    const eng = audioRef.current;
    if (!m || !eng) return;
    const { w, h } = sizeRef.current;
    const now = performance.now();
    lastUserMsRef.current = now;

    const near = m.nearestNode(x, y, 22);
    if (near && m.nodes.length > 40 && !isDrag) {
      // Pluck a living strand → ring its voice + bloom.
      const node = m.nodes[near.index];
      eng.pluck(
        Math.min(1, node.length / 600),
        node.y / h,
        node.x / w,
      );
      bloomsRef.current.push({ x: node.x, y: node.y, born: now, strength: 1 });
      // Feeding a little nutrient where you touched draws growth toward you.
      m.scatterNutrient(24, x, y, 46);
      return;
    }

    if (isDrag) {
      // Dragging paints a nutrient trail (directs where the web reaches) and
      // sympathetically rings any strand it crosses (throttled).
      if (now - lastScatterMsRef.current > 55) {
        m.scatterNutrient(14, x, y, 30);
        lastScatterMsRef.current = now;
      }
      if (near && now - lastDragPluckMsRef.current > 170) {
        const node = m.nodes[near.index];
        eng.pluck(Math.min(1, node.length / 600), node.y / h, node.x / w);
        bloomsRef.current.push({ x: node.x, y: node.y, born: now, strength: 0.6 });
        lastDragPluckMsRef.current = now;
      }
      return;
    }

    // Plant a new spore + scatter a nutrient burst around it.
    m.plantSpore(x, y, now);
    m.scatterNutrient(52, x, y, 62);
    eng.plantSpore(y / h);
    bloomsRef.current.push({ x, y, born: now, strength: 0.7 });
  }, []);

  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    startMsRef.current = performance.now();
    autoRnd.current = mulberry32(SEED);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const W = Math.max(320, Math.floor(rect.width));
    const H = Math.max(320, Math.floor(rect.height));
    sizeRef.current = { w: W, h: H, dpr };

    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Offscreen bloom layer — a long-exposure ghost trail of tip + pluck
    // activity that gently fades, laid additively under the structural web.
    const glow = document.createElement("canvas");
    glow.width = Math.floor(W * dpr);
    glow.height = Math.floor(H * dpr);
    const gctx = glow.getContext("2d");
    if (!gctx) return;
    gctx.scale(dpr, dpr);
    glowRef.current = glow;

    const myc = new Mycelium(
      {
        width: W,
        height: H,
        maxNodes: 3200,
        attractionRadius: 92,
        killRadius: 14,
        segmentLength: 7,
        fuseRadius: 6,
      },
      SEED,
    );
    mycRef.current = myc;

    // Audio (gesture-gated: this runs from the Start click).
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

    // Seed the very first breath of the garden so it is alive immediately.
    const now0 = performance.now();
    myc.plantSpore(W * 0.5, H * 0.62, now0);
    myc.scatterNutrient(64, W * 0.5, H * 0.5, Math.min(W, H) * 0.34);
    engine.plantSpore(0.62);

    // Paint the dark loam once.
    ctx.fillStyle = "#07040e";
    ctx.fillRect(0, 0, W, H);

    let lastPlantMs = performance.now();
    let lastPluckMs = performance.now();
    let autoCorner = 0;
    let lastUi = 0;
    let lastExtent = 0;

    const loop = () => {
      const m = mycRef.current;
      const eng = audioRef.current;
      const g = glowRef.current;
      if (!m || !eng || !g) return;
      const gc = g.getContext("2d");
      if (!gc) return;
      const now = performance.now();
      const rnd = autoRnd.current;
      const userActive = now - lastUserMsRef.current < 5000;

      // ── Autopilot gardener (seeded, deterministic). Plants + feeds, and
      // occasionally plucks — so the web is fully alive with no human input.
      // Suppressed while a real hand is playing, then it quietly resumes. ──
      if (!userActive) {
        if (now - lastPlantMs > 1500 && m.liveAttractorCount() < 210) {
          const corners: Array<[number, number]> = [
            [W * 0.28, H * 0.32],
            [W * 0.72, H * 0.3],
            [W * 0.24, H * 0.74],
            [W * 0.78, H * 0.72],
            [W * 0.5, H * 0.44],
            [W * 0.5, H * 0.86],
          ];
          const base = corners[autoCorner % corners.length];
          autoCorner++;
          const cx = base[0] + (rnd() - 0.5) * W * 0.16;
          const cy = base[1] + (rnd() - 0.5) * H * 0.16;
          if (rnd() < 0.6) {
            m.plantSpore(cx, cy, now);
            eng.plantSpore(cy / H);
            bloomsRef.current.push({ x: cx, y: cy, born: now, strength: 0.6 });
          }
          m.scatterNutrient(48, cx, cy, Math.min(W, H) * 0.24);
          lastPlantMs = now;
        }
        if (now - lastPluckMs > 2400 && m.nodes.length > 60) {
          const idx = Math.floor(rnd() * m.nodes.length);
          const node = m.nodes[idx];
          eng.pluck(Math.min(1, node.length / 600), node.y / H, node.x / W);
          bloomsRef.current.push({ x: node.x, y: node.y, born: now, strength: 0.8 });
          lastPluckMs = now;
        }
      }

      // ── Growth step (calmly paced so it can run indefinitely). ──
      const vigour = userActive ? 0.55 : 0.42;
      const events = m.grow(vigour);

      // Sonify a limited number of branch / fuse events → shimmer, not a swarm.
      let sonified = 0;
      for (const e of events) {
        const child = m.nodes[e.node];
        if (!child) continue;
        if ((e.isFork || e.isFuse) && sonified < 2) {
          eng.branch(child.x / W, child.y / H, e.isFuse ? 0.7 : 0.5);
          sonified++;
        }
      }

      // ── Fade the glow trail layer (ephemeral activity, may fade to dark). ──
      gc.globalCompositeOperation = "source-over";
      gc.fillStyle = "rgba(0,0,0,0.055)";
      gc.fillRect(0, 0, W, H);
      gc.globalCompositeOperation = "lighter";

      // Stamp soft blooms at freshly grown tips (the growing edge glows).
      for (const e of events) {
        const child = m.nodes[e.node];
        if (!child || !child.active) continue;
        const rad = 3.2;
        const grd = gc.createRadialGradient(child.x, child.y, 0, child.x, child.y, rad);
        grd.addColorStop(0, "rgba(210,180,255,0.5)");
        grd.addColorStop(1, "rgba(210,180,255,0)");
        gc.fillStyle = grd;
        gc.beginPath();
        gc.arc(child.x, child.y, rad, 0, Math.PI * 2);
        gc.fill();
      }

      // Animated pluck / plant blooms — an expanding ring of light.
      const blooms = bloomsRef.current;
      for (let i = blooms.length - 1; i >= 0; i--) {
        const b = blooms[i];
        const age = (now - b.born) / 1000;
        const life = 1.1;
        if (age > life) {
          blooms.splice(i, 1);
          continue;
        }
        const t = age / life;
        const rad = 6 + t * 46 * b.strength;
        const a = (1 - t) * 0.5 * b.strength;
        const grd = gc.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad);
        grd.addColorStop(0, `rgba(230,200,255,${a})`);
        grd.addColorStop(0.5, `rgba(176,90,230,${a * 0.6})`);
        grd.addColorStop(1, "rgba(176,90,230,0)");
        gc.fillStyle = grd;
        gc.beginPath();
        gc.arc(b.x, b.y, rad, 0, Math.PI * 2);
        gc.fill();
      }
      gc.globalCompositeOperation = "source-over";

      // ── Compose the frame. The structural web is REDRAWN every frame from the
      // node list, so its geometry is a permanent memory — old strands only dim
      // to a luminance floor, they are never erased. ──
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#07040e";
      ctx.fillRect(0, 0, W, H);

      // Lay the ghost trail underneath, additively.
      ctx.globalCompositeOperation = "lighter";
      ctx.drawImage(g, 0, 0, W, H);

      // Bucket segments by (hue band, brightness band) → a handful of Path2D
      // strokes instead of thousands, so it stays smooth at phone size.
      const cores = new Map<number, Path2D>();
      const halos = new Map<number, Path2D>();
      const nodes = m.nodes;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.parent < 0) continue;
        const p = nodes[node.parent];
        if (!p) continue;
        const ageSec = (now - node.born) / 1000;
        const recency = Math.exp(-ageSec / 7);
        // Floor keeps ancient strands faintly visible forever (the palimpsest).
        const bright = 0.18 + 0.82 * recency;
        const hb = Math.min(HUE_BANDS.length - 1, Math.floor((node.depth / 26) * HUE_BANDS.length));
        const bb = Math.max(0, Math.min(9, Math.round(bright * 9)));
        const key = hb * 10 + bb;
        let core = cores.get(key);
        if (!core) {
          core = new Path2D();
          cores.set(key, core);
        }
        core.moveTo(p.x, p.y);
        core.lineTo(node.x, node.y);
        if (recency > 0.22) {
          let halo = halos.get(key);
          if (!halo) {
            halo = new Path2D();
            halos.set(key, halo);
          }
          halo.moveTo(p.x, p.y);
          halo.lineTo(node.x, node.y);
        }
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // Wide soft halos first (recent growth only).
      for (const [key, path] of halos) {
        const hb = Math.floor(key / 10);
        const bb = key % 10;
        const [r, gg, bl] = HUE_BANDS[hb];
        const a = (bb / 9) * 0.16;
        ctx.strokeStyle = `rgba(${r},${gg},${bl},${a})`;
        ctx.lineWidth = 3.6;
        ctx.stroke(path);
      }
      // Bright thin cores for every strand (old = dim floor, never gone).
      for (const [key, path] of cores) {
        const hb = Math.floor(key / 10);
        const bb = key % 10;
        const [r, gg, bl] = HUE_BANDS[hb];
        const a = 0.14 + (bb / 9) * 0.72;
        ctx.strokeStyle = `rgba(${r},${gg},${bl},${a})`;
        ctx.lineWidth = 1.1;
        ctx.stroke(path);
      }
      ctx.globalCompositeOperation = "source-over";

      // ── Drive the ambient bed from the web's total extent + throttle UI. ──
      const extent = Math.min(1, m.totalLength / 26000);
      if (Math.abs(extent - lastExtent) > 0.01) {
        eng.setExtent(0.15 + extent * 0.85);
        lastExtent = extent;
      }
      if (now - lastUi > 400) {
        setElapsed((now - startMsRef.current) / 1000);
        setStats({
          strands: nodes.length,
          branches: m.branchPoints,
          length: Math.round(m.totalLength),
        });
        lastUi = now;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [started]);

  // ── Pointer plumbing (primary input). ──
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!started) return;
      const p = toLocal(e.clientX, e.clientY);
      if (!p) return;
      pointerDownRef.current = true;
      try {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* non-fatal */
      }
      touch(p.x, p.y, false);
    },
    [started, toLocal, touch],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!started || !pointerDownRef.current) return;
      const p = toLocal(e.clientX, e.clientY);
      if (!p) return;
      touch(p.x, p.y, true);
    },
    [started, toLocal, touch],
  );

  const onPointerUp = useCallback(() => {
    pointerDownRef.current = false;
  }, []);

  const mm = Math.floor(elapsed / 60);
  const ss = Math.floor(elapsed % 60);
  const clock = `${mm}:${ss.toString().padStart(2, "0")}`;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="A growing mycelial network of light you plant and play by touch"
      />

      {/* Title / description */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Mycelium
        </h1>
        <p className="mt-1 max-w-md text-base text-muted-foreground">
          Plant spores with your hand; a living network filaments outward on its
          own, remembers everything it grew, and rings when you touch a strand.
        </p>
        {started && (
          <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {clock} · {stats.strands} strands · {stats.branches} branch-points ·{" "}
            {stats.length} px grown
          </p>
        )}
      </div>

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-6 flex max-w-lg flex-col items-center rounded-lg border border-border bg-background p-6 text-center shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Grow a web of light
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Tap and drag to plant spores and scatter nutrient — luminous
              filaments will grow toward it, branching and fusing on their own.
              Touch a living strand to ring its voice. The web never resets: it
              only accretes, so it is genuinely different minutes from now. If
              you do nothing, a gardener tends it for you.
            </p>
            <button
              type="button"
              onClick={begin}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Sound begins on tap
            </p>
          </div>
        </div>
      )}

      {/* Design-notes trigger */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm">
          <div className="mt-12 max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              This is a morphogenetic network grown with the{" "}
              <span className="text-foreground">Space Colonization Algorithm</span>{" "}
              (Runions, Lane &amp; Prusinkiewicz, &ldquo;Modeling Trees with a
              Space Colonization Algorithm&rdquo;, Eurographics Workshop on
              Natural Phenomena, 2007). Each nutrient point pulls its nearest
              growth tip; every tip steps toward the average direction of the
              points pulling it, so branching emerges wherever it is tugged in
              divergent directions. When a tip lands on a foreign strand it{" "}
              <span className="text-foreground">fuses</span> — the anastomosis
              that makes fungal transport webs a network rather than a tree
              (Fricker et al.).
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your hand is the instrument. Tap or drag to plant spores and paint
              nutrient trails — you literally steer where the organism reaches.
              Touch a living strand and it rings: a fast-attack, slow-decay
              sympathetic voice whose pitch is a continuous function of that
              strand&rsquo;s length and height (never snapped to a scale).
              Planting births a soft low voice; each branch or fusion adds a
              shimmer partial; the web&rsquo;s total extent opens the drive of a
              just-intonation drone bed under a convolution void.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The geometry is the memory. Nodes are never deleted and the web is
              redrawn every frame from the node list, so old filaments only dim
              to a luminance floor — a true accreting palimpsest. Its cobweb
              radial symmetry nods to the Kl&uuml;ver form constants; the wider
              morphogenesis-in-graphics context is <span className="italic">Neural
              Cellular Automata: From Cells to Pixels</span> (arXiv:2506.22899,
              SIGGRAPH 2026).
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              What surprised me: fusion is what makes it read as alive rather
              than as a fractal tree — the moment strands start closing loops the
              whole field feels like tissue. The hard part is pacing so it grows
              for minutes without either stalling or overrunning the frame; the
              answer was a small per-frame growth budget plus bucketed Path2D
              redraws. Next: nutrient-flow pulses that travel the fused loops and
              light the strands they pass through.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
