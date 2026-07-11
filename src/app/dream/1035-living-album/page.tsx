"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  makeWorld,
  midiToHz,
  nudgeClimate,
  plantSeed,
  step,
  type NoteEvent,
  type World,
} from "./evolve";

/* ──────────────────────────────────────────────────────────────────────────
   Living Album — a self-evolving piece you tend, not play.

   A population of melodic agents drifts through a slowly-modulating diatonic
   harmony. Agents are born, age, breed (children inherit a mutated blend of two
   parents' genomes), and die. You don't trigger notes — you PLANT SEEDS (tap)
   or NUDGE THE CLIMATE, and the effect is felt over the next minute as the
   population adapts and your seed's descendants spread. evolve.ts holds the pure
   logic; this file turns world state into sound + a Canvas2D lineage field.
   ────────────────────────────────────────────────────────────────────────── */

const TICK_MS = 33; // ~30 sim ticks / second
const MAX_TRAILS = 220;

interface Trail {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  hue: number;
  generation: number;
}

interface DriftNode {
  // visual body of an agent, eased toward a target derived from its genome
  x: number;
  y: number;
  tx: number;
  ty: number;
}

export default function LivingAlbumPage() {
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState(
    "A living, self-evolving piece. It is already growing below — tap the garden to plant a seed.",
  );
  const [showNotes, setShowNotes] = useState(false);
  const [stats, setStats] = useState({ pop: 0, gen: 0, elapsed: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const padRef = useRef<{ stop: () => void } | null>(null);
  const worldRef = useRef<World | null>(null);
  const rafRef = useRef<number>(0);
  const tickTimerRef = useRef<number>(0);
  const trailsRef = useRef<Trail[]>([]);
  const nodesRef = useRef<Map<number, DriftNode>>(new Map());
  const startTimeRef = useRef<number>(0);
  const lastPlantRef = useRef<number>(0);

  /* ── build the world immediately so visuals + auto-demo run on load ── */
  useEffect(() => {
    worldRef.current = makeWorld((Math.random() * 1e9) >>> 0, 5);
  }, []);

  /* ── one soft synth voice per emitted note (filtered triangle/sine) ── */
  const playNote = useCallback((e: NoteEvent) => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    const now = ac.currentTime;
    const hz = midiToHz(e.midi);

    const osc = ac.createOscillator();
    osc.type = e.bright > 0.55 ? "triangle" : "sine";
    osc.frequency.value = hz;

    // a faint detuned partner for warmth on brighter agents
    const osc2 = ac.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = hz * 2;
    const osc2Gain = ac.createGain();
    osc2Gain.gain.value = 0.06 + e.bright * 0.12;

    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 400 + e.bright * 3200;
    filter.Q.value = 0.6;

    const amp = ac.createGain();
    const attack = 0.04 + (1 - e.bright) * 0.25;
    const dur = e.duration;
    const peak = 0.12 + 0.06 * (1 - e.bright);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(peak, now + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + attack + dur);

    osc.connect(filter);
    osc2.connect(osc2Gain);
    osc2Gain.connect(filter);
    filter.connect(amp);
    amp.connect(master);

    osc.start(now);
    osc2.start(now);
    const stopAt = now + attack + dur + 0.1;
    osc.stop(stopAt);
    osc2.stop(stopAt);
    osc.onended = () => {
      osc.disconnect();
      osc2.disconnect();
      osc2Gain.disconnect();
      filter.disconnect();
      amp.disconnect();
    };
  }, []);

  /* ── the soft generative bed (always-sounding root drone, two slow voices) ── */
  const startPad = useCallback(() => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    const now = ac.currentTime;
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    const lfos: OscillatorNode[] = [];

    // low root + soft fifth, gently breathing
    const roots = [midiToHz(36), midiToHz(43)];
    roots.forEach((hz, i) => {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = hz;
      const g = ac.createGain();
      g.gain.value = 0.0001;
      g.gain.exponentialRampToValueAtTime(i === 0 ? 0.05 : 0.03, now + 4);

      // slow amplitude LFO for "breathing"
      const lfo = ac.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.03 + i * 0.017;
      const lfoGain = ac.createGain();
      lfoGain.gain.value = i === 0 ? 0.02 : 0.014;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);

      o.connect(g);
      g.connect(master);
      o.start(now);
      lfo.start(now);
      oscs.push(o);
      gains.push(g);
      lfos.push(lfo);
    });

    padRef.current = {
      stop: () => {
        const t = ac.currentTime;
        gains.forEach((g) => {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        });
        oscs.forEach((o) => o.stop(t + 0.6));
        lfos.forEach((l) => l.stop(t + 0.6));
      },
    };
  }, []);

  /* ── start audio (gesture-gated) ── */
  const startAudio = useCallback(async () => {
    if (acRef.current) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ac = new Ctx();
    acRef.current = ac;
    const master = ac.createGain();
    master.gain.value = 0.9;
    // a soft master limiter via gentle compressor
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    master.connect(comp);
    comp.connect(ac.destination);
    masterRef.current = master;
    if (ac.state === "suspended") await ac.resume();
    startPad();
    setStarted(true);
    startTimeRef.current = performance.now();
    setStatus(
      "It's alive. Tap anywhere in the garden to plant a seed — its descendants will spread over the coming minutes.",
    );
  }, [startPad]);

  /* ── simulation tick: advance world, sound new notes, spawn trails ── */
  useEffect(() => {
    const tick = () => {
      const world = worldRef.current;
      if (world) {
        const events = step(world);
        const canvas = canvasRef.current;
        const w = canvas?.clientWidth ?? 1;
        const h = canvas?.clientHeight ?? 1;
        for (const e of events) {
          if (started) playNote(e);
          // map note → a trail bloom near its agent's drift node
          const node = nodesRef.current.get(e.agentId);
          const px = node ? node.x : w * 0.5;
          const py = node ? node.y : h * 0.5;
          if (trailsRef.current.length < MAX_TRAILS) {
            trailsRef.current.push({
              x: px,
              y: py,
              r: 2 + (1 - e.bright) * 6,
              life: 1,
              maxLife: 1,
              hue: e.hue,
              generation: e.generation,
            });
          }
        }
        const maxGen = world.agents.reduce(
          (m, a) => Math.max(m, a.generation),
          0,
        );
        setStats({
          pop: world.agents.length,
          gen: maxGen,
          elapsed: started
            ? (performance.now() - startTimeRef.current) / 1000
            : 0,
        });
      }
      tickTimerRef.current = window.setTimeout(tick, TICK_MS);
    };
    tick();
    return () => window.clearTimeout(tickTimerRef.current);
  }, [started, playNote]);

  /* ── render loop: Canvas2D lineage / organism field ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const world = worldRef.current;

      // soft aurora-organic wash, persistent (trails fade by translucent fill)
      ctx.globalCompositeOperation = "source-over";
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "rgba(6,10,16,0.34)");
      bg.addColorStop(1, "rgba(10,6,18,0.34)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      if (world) {
        // place / ease each agent's drift node from its genome
        const nodes = nodesRef.current;
        const liveIds = new Set<number>();
        for (const a of world.agents) {
          liveIds.add(a.id);
          // register → vertical (high pitch = top), brightness → horizontal
          const ty =
            h * (1 - (a.genome.register - 40) / (84 - 40)) * 0.86 + h * 0.07;
          const tx =
            w * (0.12 + a.genome.bright * 0.76) +
            Math.sin((a.id * 1.7 + t * 0.0003)) * 26;
          let n = nodes.get(a.id);
          if (!n) {
            n = { x: tx, y: ty, tx, ty };
            nodes.set(a.id, n);
          }
          n.tx = tx;
          n.ty = ty;
          const ease = 1 - Math.pow(0.001, dt);
          n.x += (n.tx - n.x) * ease;
          n.y += (n.ty - n.y) * ease;
        }
        // prune dead nodes
        for (const id of Array.from(nodes.keys())) {
          if (!liveIds.has(id)) nodes.delete(id);
        }

        // draw lineage threads: child → its parents (heredity made visible)
        ctx.globalCompositeOperation = "lighter";
        ctx.lineWidth = 1;
        for (const a of world.agents) {
          const child = nodes.get(a.id);
          if (!child) continue;
          for (const pid of a.parents) {
            const p = nodes.get(pid);
            if (!p) continue;
            const grd = ctx.createLinearGradient(child.x, child.y, p.x, p.y);
            const col = hsla(a.hue, 0.7, 0.6, 0.16);
            grd.addColorStop(0, col);
            grd.addColorStop(1, hsla(a.hue, 0.7, 0.6, 0.02));
            ctx.strokeStyle = grd;
            ctx.beginPath();
            ctx.moveTo(child.x, child.y);
            const mx = (child.x + p.x) / 2 + Math.sin(t * 0.0006 + a.id) * 18;
            const my = (child.y + p.y) / 2;
            ctx.quadraticCurveTo(mx, my, p.x, p.y);
            ctx.stroke();
          }
        }

        // draw agent bodies — size by lifespan-left, glow by brightness
        for (const a of world.agents) {
          const n = nodes.get(a.id);
          if (!n) continue;
          const lifeLeft = 1 - a.age / a.genome.lifespan;
          const rad = 5 + lifeLeft * 10 + a.genome.bright * 6;
          const glow = ctx.createRadialGradient(
            n.x,
            n.y,
            0,
            n.x,
            n.y,
            rad * 3,
          );
          glow.addColorStop(0, hsla(a.hue, 0.8, 0.7, 0.5 * lifeLeft + 0.15));
          glow.addColorStop(1, hsla(a.hue, 0.8, 0.6, 0));
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(n.x, n.y, rad * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = hsla(a.hue, 0.85, 0.78, 0.85 * lifeLeft + 0.1);
          ctx.beginPath();
          ctx.arc(n.x, n.y, rad * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // note-bloom trails
      ctx.globalCompositeOperation = "lighter";
      const trails = trailsRef.current;
      for (const tr of trails) {
        tr.life -= dt * 0.7;
        const a = Math.max(0, tr.life / tr.maxLife);
        const grd = ctx.createRadialGradient(
          tr.x,
          tr.y,
          0,
          tr.x,
          tr.y,
          tr.r * 6,
        );
        grd.addColorStop(0, hsla(tr.hue, 0.9, 0.75, a * 0.5));
        grd.addColorStop(1, hsla(tr.hue, 0.9, 0.7, 0));
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, tr.r * 6, 0, Math.PI * 2);
        ctx.fill();
      }
      trailsRef.current = trails.filter((tr) => tr.life > 0);

      ctx.globalCompositeOperation = "source-over";
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  /* ── full teardown ── */
  useEffect(() => {
    return () => {
      window.clearTimeout(tickTimerRef.current);
      cancelAnimationFrame(rafRef.current);
      try {
        padRef.current?.stop();
      } catch {
        /* ignore */
      }
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        ac.close().catch(() => {
          /* ignore */
        });
      }
      acRef.current = null;
      masterRef.current = null;
    };
  }, []);

  /* ── tap to plant a seed (the consequential, sparse perturbation) ── */
  const handlePlant = useCallback(
    async (clientX: number, clientY: number) => {
      const now = performance.now();
      if (now - lastPlantRef.current < 180) return; // debounce
      lastPlantRef.current = now;
      if (!acRef.current) await startAudio();
      const world = worldRef.current;
      const canvas = canvasRef.current;
      if (!world || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      const seed = plantSeed(world, x, y);
      setStatus(
        `Seed planted (register ${seed.genome.register}). Listen over the next minute — its line will breed and spread.`,
      );
    },
    [startAudio],
  );

  const onPointerDown = useCallback(
    (ev: React.PointerEvent<HTMLDivElement>) => {
      handlePlant(ev.clientX, ev.clientY);
    },
    [handlePlant],
  );

  /* ── climate nudges (the other perturbation: shift the whole field) ── */
  const warmer = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    nudgeClimate(world, {
      bright: Math.min(1, world.climate.bright + 0.25),
      register: Math.min(80, world.climate.register + 4),
    });
    setStatus(
      "Climate warmed. Over the next minute the whole population brightens and rises.",
    );
  }, []);

  const cooler = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    nudgeClimate(world, {
      bright: Math.max(0, world.climate.bright - 0.25),
      register: Math.max(44, world.climate.register - 4),
      density: Math.max(0.15, world.climate.density - 0.15),
    });
    setStatus(
      "Climate cooled. The garden slowly darkens and thins toward stillness.",
    );
  }, []);

  const modulate = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const shift = world.climate.keyShift === 0 ? 5 : 0;
    nudgeClimate(world, { keyShift: shift });
    setStatus(
      shift === 0
        ? "Key drifting home. The harmony glides back to its origin."
        : "Key modulating up a fourth. The whole field will glide into the new home over ~20s.",
    );
  }, []);

  const mm = Math.floor(stats.elapsed / 60);
  const ss = Math.floor(stats.elapsed % 60)
    .toString()
    .padStart(2, "0");

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#05070c] text-foreground">
      <div
        ref={wrapRef}
        className="absolute inset-0 cursor-crosshair"
        onPointerDown={onPointerDown}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>

      {/* header / copy */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-7">
        <h1 className="pointer-events-auto text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Living Album
        </h1>
        <p className="pointer-events-auto mt-2 max-w-xl text-base leading-relaxed text-muted-foreground">
          {status}
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2">
          {!started && (
            <button
              type="button"
              onClick={startAudio}
              className="min-h-[44px] rounded-full bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-400"
            >
              Wake the garden
            </button>
          )}
          <button
            type="button"
            onClick={warmer}
            className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
          >
            Warm climate
          </button>
          <button
            type="button"
            onClick={cooler}
            className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
          >
            Cool climate
          </button>
          <button
            type="button"
            onClick={modulate}
            className="min-h-[44px] rounded-full border border-border bg-muted px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
          >
            Modulate key
          </button>
          <button
            type="button"
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-full px-4 py-2.5 text-base text-violet-300 underline-offset-4 transition-colors hover:text-violet-200 hover:underline"
          >
            Read the design notes
          </button>
        </div>
      </div>

      {/* live stats */}
      <div className="pointer-events-none absolute bottom-16 left-5 z-10 flex gap-4 text-base text-muted-foreground sm:left-7">
        <span>
          population <span className="text-foreground">{stats.pop}</span>
        </span>
        <span>
          generations <span className="text-foreground">{stats.gen}</span>
        </span>
        <span>
          elapsed{" "}
          <span className="text-foreground">
            {mm}:{ss}
          </span>
        </span>
      </div>

      {/* design notes drawer */}
      {showNotes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-5 backdrop-blur-sm">
          <div className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#0b0e16] p-6 text-base leading-relaxed text-muted-foreground">
            <h2 className="text-xl font-semibold text-foreground">Design notes</h2>
            <p className="mt-3">
              You are a <span className="text-violet-300">gardener</span>, not a
              player. A small population of melodic agents drifts through a
              slowly-modulating <span className="text-foreground">diatonic</span>{" "}
              harmony. Each agent carries a tiny genome (register, density,
              brightness, a short interval-motif, a lifespan). Agents are born,
              age, breed, and die.
            </p>
            <p className="mt-3">
              When two agents reproduce, the child inherits a{" "}
              <span className="text-foreground">mutated blend</span> of both
              parents&rsquo; genomes. So the motifs alive at minute 6 are
              descendants of those alive at minute 1 — that lineage is the
              audible <span className="text-violet-300">memory</span>. The
              threads on screen draw each child back to its parents.
            </p>
            <p className="mt-3">
              <span className="text-foreground">Tapping</span> plants a seed whose
              genome is biased by where you tapped (left/right → low/high
              register, top/bottom → bright/dark). Its effect is felt over the
              next minute as it breeds. The climate buttons nudge the whole
              field; agents adapt toward it slowly. Nothing here is note-on-tap.
            </p>
            <p className="mt-3 text-muted-foreground">
              Reference: Brian Eno&rsquo;s generative <em>Reflection</em>, the
              2026 evolving long-form ambient wave, and arXiv:2506.05104
              &ldquo;Survey on the Evaluation of Generative Models in
              Music.&rdquo; Inspired by artificial-life heredity.
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-full bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-400"
            >
              Back to the garden
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1035-living-album"]} />
    </main>
  );
}

/* hsla helper — hue in 0..1 */
function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${Math.round(((h % 1) + 1) % 1 * 360)}, ${Math.round(
    s * 100,
  )}%, ${Math.round(l * 100)}%, ${a})`;
}
