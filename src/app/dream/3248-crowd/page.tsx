"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyRehearse,
  applyTap,
  buildDemoSchedule,
  BUDGET,
  EVICT_THRESHOLD,
  freqToY,
  makeState,
  runSelfCheck,
  yToFreq,
  type DemoAction,
  type MemoryState,
  type Note,
} from "./memory";
import { MemoryAudio } from "./audio";

// ════════════════════════════════════════════════════════════════════════════
// 3248 — crowd
// THE QUESTION: what if memory had a hard capacity — so every new note you play
// pushes an older one toward being forgotten? A zero-sum attention economy you
// steer: adding a note is choosing what to lose. See README.md.
// ════════════════════════════════════════════════════════════════════════════

type Phase = "idle" | "running" | "unavailable";

interface Ripple {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  strength: number;
  born: number;
}
interface Crumble {
  t: number;
  freq: number;
  act: number;
  born: number;
}
interface Pulse {
  t: number;
  freq: number;
  strong: boolean;
  born: number;
}

interface Hud {
  held: number;
  total: number;
  notes: { id: number; act: number; rehearsals: number }[];
}

// violet art ramp (raw color allowed ONLY inside the canvas art layer)
const HUE = 272;
const nodeFill = (a: number) => `hsla(${HUE}, 85%, ${52 + 16 * a}%, ${0.22 + 0.72 * a})`;
const nodeGlow = (a: number) => `hsla(${HUE}, 95%, 72%, ${0.32 * a})`;
const RING_COL = `hsla(${HUE}, 40%, 60%, 0.14)`;
const GRID_COL = `hsla(${HUE}, 30%, 60%, 0.07)`;
const GRAVE_COL = `hsla(${HUE}, 18%, 55%, 0.22)`;
const RIPPLE_COL = (a: number) => `hsla(${HUE + 10}, 90%, 70%, ${a})`;
const PLAYHEAD_COL = `hsla(${HUE}, 90%, 75%, 0.35)`;

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<MemoryAudio | null>(null);
  const rafRef = useRef<number | null>(null);

  const memRef = useRef<MemoryState>(makeState());
  const displayRef = useRef<Map<number, number>>(new Map());
  const ripplesRef = useRef<Ripple[]>([]);
  const crumblesRef = useRef<Crumble[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);

  const demoActionsRef = useRef<DemoAction[]>([]);
  const demoIdxRef = useRef(0);
  const demoStartRef = useRef(0);
  const lastFrameRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [demoActive, setDemoActive] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<Hud>({ held: 0, total: 0, notes: [] });

  // ── geometry ───────────────────────────────────────────────────────────────
  const geom = useCallback((w: number, h: number) => {
    const cx = w / 2;
    const cy = h / 2;
    const m = Math.min(w, h);
    return { cx, cy, rMin: m * 0.15, rMax: m * 0.42 };
  }, []);

  const nodePos = useCallback(
    (t: number, freq: number, w: number, h: number) => {
      const { cx, cy, rMin, rMax } = geom(w, h);
      const y = freqToY(freq);
      const r = rMin + y * (rMax - rMin);
      const ang = t * Math.PI * 2 - Math.PI / 2;
      return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
    },
    [geom],
  );

  const syncHud = useCallback(() => {
    const s = memRef.current;
    const notes = [...s.notes]
      .sort((a, b) => b.act - a.act)
      .map((n) => ({ id: n.id, act: Math.round(n.act * 100) / 100, rehearsals: n.rehearsals }));
    setHud({
      held: s.notes.length,
      total: Math.round(s.notes.reduce((sum, n) => sum + n.act, 0) * 100) / 100,
      notes,
    });
  }, []);

  // ── apply a model step, spawn its visuals + audio ───────────────────────────
  const runStep = useCallback(
    (kind: "tap" | "rehearse", payload: { t?: number; freq?: number; targetId?: number }) => {
      const canvas = canvasRef.current;
      const audio = audioRef.current;
      const prev = memRef.current;
      const w = canvas?.clientWidth ?? 800;
      const h = canvas?.clientHeight ?? 600;

      // pre-step coordinate map (targets that get evicted vanish from state)
      const coord = new Map<number, { t: number; freq: number }>();
      for (const n of prev.notes) coord.set(n.id, { t: n.t, freq: n.freq });

      const result =
        kind === "tap"
          ? applyTap(prev, payload.t!, payload.freq!)
          : applyRehearse(prev, payload.targetId!);
      memRef.current = result.state;

      const src = result.state.notes.find((n) => n.id === result.sourceId);
      const srcCoord = src
        ? { t: src.t, freq: src.freq }
        : coord.get(result.sourceId) ?? { t: payload.t ?? 0, freq: payload.freq ?? 440 };
      if (!coord.has(result.sourceId)) coord.set(result.sourceId, srcCoord);

      const now = performance.now();
      const sp = nodePos(srcCoord.t, srcCoord.freq, w, h);
      pulsesRef.current.push({ t: srcCoord.t, freq: srcCoord.freq, strong: kind === "tap", born: now });

      // interference arrows: strongest steals rendered boldest
      for (const ev of result.events) {
        const c = coord.get(ev.id);
        if (!c || ev.removed < 0.01) continue;
        const tp = nodePos(c.t, c.freq, w, h);
        ripplesRef.current.push({ sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y, strength: ev.removed, born: now });
      }

      // evicted → crumble animation (gravestone persists afterward)
      for (const g of result.evicted) {
        const lastAct = displayRef.current.get(g.id) ?? EVICT_THRESHOLD;
        crumblesRef.current.push({ t: g.t, freq: g.freq, act: lastAct, born: now });
        displayRef.current.delete(g.id);
      }

      if (audio) audio.blip(srcCoord.freq, kind === "tap");
      syncHud();
    },
    [nodePos, syncHud],
  );

  // ── render loop ──────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const now = performance.now();
    const dt = lastFrameRef.current ? Math.min(0.05, (now - lastFrameRef.current) / 1000) : 0.016;
    lastFrameRef.current = now;

    // advance the self-demo
    if (demoActive) {
      const elapsed = now - demoStartRef.current;
      while (demoIdxRef.current < demoActionsRef.current.length && elapsed >= demoActionsRef.current[demoIdxRef.current].atMs) {
        const a = demoActionsRef.current[demoIdxRef.current++];
        if (a.kind === "tap") runStep("tap", { t: a.t, freq: a.freq });
        else runStep("rehearse", { targetId: a.targetId });
      }
      if (demoIdxRef.current >= demoActionsRef.current.length) setDemoActive(false);
    }

    const { cx, cy, rMin, rMax } = geom(w, h);

    // pitch guide rings (octave marks) + outer/inner band
    ctx.lineWidth = 1;
    for (let oct = 0; oct <= 3; oct++) {
      const y = freqToY(110 * Math.pow(2, oct));
      const r = rMin + y * (rMax - rMin);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = oct === 0 || oct === 3 ? RING_COL : GRID_COL;
      ctx.stroke();
    }

    // sweeping playhead
    const phase = audioRef.current?.phase ?? 0;
    const pa = phase * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx + rMin * 0.7 * Math.cos(pa), cy + rMin * 0.7 * Math.sin(pa));
    ctx.lineTo(cx + rMax * 1.03 * Math.cos(pa), cy + rMax * 1.03 * Math.sin(pa));
    ctx.strokeStyle = PLAYHEAD_COL;
    ctx.lineWidth = 2;
    ctx.stroke();

    // gravestones (faint, persistent)
    for (const g of memRef.current.gravestones) {
      const p = nodePos(g.t, g.freq, w, h);
      ctx.strokeStyle = GRAVE_COL;
      ctx.lineWidth = 1.5;
      const s = 4;
      ctx.beginPath();
      ctx.moveTo(p.x - s, p.y - s);
      ctx.lineTo(p.x + s, p.y + s);
      ctx.moveTo(p.x + s, p.y - s);
      ctx.lineTo(p.x - s, p.y + s);
      ctx.stroke();
    }

    // interference arrows (fade ~0.7s)
    ripplesRef.current = ripplesRef.current.filter((r) => now - r.born < 700);
    for (const r of ripplesRef.current) {
      const age = (now - r.born) / 700;
      const a = (1 - age) * Math.min(1, r.strength * 3);
      const hx = r.sx + (r.tx - r.sx) * (0.15 + 0.85 * age);
      const hy = r.sy + (r.ty - r.sy) * (0.15 + 0.85 * age);
      ctx.strokeStyle = RIPPLE_COL(a * 0.8);
      ctx.lineWidth = 1 + r.strength * 6;
      ctx.beginPath();
      ctx.moveTo(r.sx, r.sy);
      ctx.lineTo(hx, hy);
      ctx.stroke();
      ctx.fillStyle = RIPPLE_COL(a);
      ctx.beginPath();
      ctx.arc(hx, hy, 2 + r.strength * 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // source pulse rings (expanding, fade ~0.6s)
    pulsesRef.current = pulsesRef.current.filter((p) => now - p.born < 600);
    for (const p of pulsesRef.current) {
      const age = (now - p.born) / 600;
      const pos = nodePos(p.t, p.freq, w, h);
      ctx.strokeStyle = RIPPLE_COL((1 - age) * (p.strong ? 0.7 : 0.4));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6 + age * 34, 0, Math.PI * 2);
      ctx.stroke();
    }

    // crumbling (freshly evicted, ~0.8s)
    crumblesRef.current = crumblesRef.current.filter((c) => now - c.born < 800);
    for (const c of crumblesRef.current) {
      const age = (now - c.born) / 800;
      const pos = nodePos(c.t, c.freq, w, h);
      const seed = Math.floor(c.freq);
      for (let i = 0; i < 7; i++) {
        const ang = ((seed + i * 53) % 360) * (Math.PI / 180);
        const dist = age * 22;
        const px = pos.x + Math.cos(ang) * dist;
        const py = pos.y + Math.sin(ang) * dist + age * 10;
        ctx.fillStyle = `hsla(${HUE}, 60%, 60%, ${(1 - age) * 0.5 * c.act})`;
        ctx.beginPath();
        ctx.arc(px, py, (1 - age) * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // active nodes — size + opacity = activation (display-lerped)
    let sumDisp = 0;
    for (const n of memRef.current.notes) {
      const cur = displayRef.current.get(n.id) ?? 0;
      const next = cur + (n.act - cur) * (1 - Math.exp(-dt * 9));
      displayRef.current.set(n.id, next);
      sumDisp += next;
      const pos = nodePos(n.t, n.freq, w, h);
      const rad = 5 + 15 * next;

      ctx.fillStyle = nodeGlow(next);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rad * 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = nodeFill(next);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, rad, 0, Math.PI * 2);
      ctx.fill();

      if (n.rehearsals > 0) {
        ctx.strokeStyle = `hsla(${HUE}, 95%, 80%, ${0.5 * next})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, rad + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // capacity meter (center): summed activation vs budget
    ctx.font = "600 13px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fill = Math.min(1, sumDisp / BUDGET);
    ctx.strokeStyle = `hsla(${HUE}, 40%, 55%, 0.25)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, rMin * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `hsla(${HUE}, 90%, 70%, 0.85)`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, rMin * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill);
    ctx.stroke();
    ctx.fillStyle = `hsla(${HUE}, 30%, 88%, 0.9)`;
    ctx.fillText(`${sumDisp.toFixed(1)}`, cx, cy - 6);
    ctx.fillStyle = `hsla(${HUE}, 20%, 70%, 0.6)`;
    ctx.font = "500 10px ui-monospace, monospace";
    ctx.fillText(`/ ${BUDGET}`, cx, cy + 9);

    rafRef.current = requestAnimationFrame(draw);
  }, [demoActive, geom, nodePos, runStep]);

  // ── start / stop ─────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    const audio = new MemoryAudio();
    if (!audio.available) {
      setPhase("unavailable");
      return;
    }
    audioRef.current = audio;
    const ok = await audio.start(() => memRef.current.notes);
    if (!ok) {
      setPhase("unavailable");
      return;
    }
    memRef.current = makeState();
    displayRef.current.clear();
    ripplesRef.current = [];
    crumblesRef.current = [];
    pulsesRef.current = [];
    demoActionsRef.current = buildDemoSchedule();
    demoIdxRef.current = 0;
    demoStartRef.current = performance.now();
    setDemoActive(true);
    setPhase("running");
    syncHud();
  }, [syncHud]);

  const handleReplay = useCallback(() => {
    memRef.current = makeState();
    displayRef.current.clear();
    ripplesRef.current = [];
    crumblesRef.current = [];
    pulsesRef.current = [];
    demoActionsRef.current = buildDemoSchedule();
    demoIdxRef.current = 0;
    demoStartRef.current = performance.now();
    setDemoActive(true);
    syncHud();
  }, [syncHud]);

  // pointer interaction: tap empty space to encode, click a node to rehearse
  const handlePointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (phase !== "running") return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      let hit: Note | null = null;
      let best = 22;
      for (const n of memRef.current.notes) {
        const p = nodePos(n.t, n.freq, w, h);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < best) {
          best = d;
          hit = n;
        }
      }
      if (hit) {
        runStep("rehearse", { targetId: hit.id });
        return;
      }

      const { cx, cy, rMin, rMax } = geom(w, h);
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r < rMin * 0.75) return; // center reserved for the capacity meter
      const yy = Math.min(1, Math.max(0, (r - rMin) / (rMax - rMin)));
      const t = (((Math.atan2(dy, dx) + Math.PI / 2) / (Math.PI * 2)) % 1 + 1) % 1;
      runStep("tap", { t, freq: yToFreq(yy) });
    },
    [phase, geom, nodePos, runStep],
  );

  // start RAF once mounted; clean teardown
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const check = runSelfCheck();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">crowd</h1>
            <p className="mt-1 max-w-xl text-base text-muted-foreground">
              A limited-capacity working memory. Every note you play steals attention from the ones
              already held — add too many and the weakest are forgotten. You can&apos;t keep
              everything; adding is choosing what to lose.
            </p>
          </div>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </header>

        <div className="relative overflow-hidden rounded-lg border border-border bg-background/40">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointer}
            className="block h-[520px] w-full touch-none"
          />

          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-sm">
              <p className="max-w-sm px-6 text-center text-base text-muted-foreground">
                Sound needs your go-ahead. Press start — an auto-demo taps 8 notes into a memory that
                holds ~5, and you watch three get crowded out. Then take over.
              </p>
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start
              </button>
            </div>
          )}

          {phase === "unavailable" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 px-6 text-center">
              <p className="text-base text-destructive">Web Audio isn&apos;t available in this browser.</p>
              <p className="text-sm text-muted-foreground">
                The visualization needs an AudioContext to run. Try a current desktop browser.
              </p>
            </div>
          )}

          {phase === "running" && demoActive && (
            <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-border bg-background/70 px-3 py-1.5">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                auto-demo running
              </span>
            </div>
          )}
        </div>

        {phase === "running" && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleReplay}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Replay demo
              </button>
              <p className="text-sm text-muted-foreground">
                Tap empty space to encode a note (angle = time, distance from center = pitch — no
                snapping). Click a held note to rehearse it and fight to keep it.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  capacity
                </span>
                <span className="font-mono text-base text-foreground">
                  held {hud.held} / capacity {BUDGET}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  Σ activation {hud.total.toFixed(2)} · evicted {memRef.current.gravestones.length}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  held notes · activation
                </span>
                <div className="flex flex-col gap-1">
                  {hud.notes.length === 0 && (
                    <span className="font-mono text-xs text-muted-foreground">— empty —</span>
                  )}
                  {hud.notes.map((n) => (
                    <div key={n.id} className="flex items-center gap-2">
                      <span className="w-14 font-mono text-xs text-muted-foreground">
                        note {n.id}
                      </span>
                      <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.round(n.act * 100)}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-foreground">{n.act.toFixed(2)}</span>
                      {n.rehearsals > 0 && (
                        <span className="font-mono text-xs text-primary">
                          ×{n.rehearsals} rehearsed
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Working memory holds only a handful of things at once — Miller&apos;s &ldquo;seven,
                plus or minus two&rdquo; (1956), tightened by Cowan (2001) to about four chunks. Here
                the budget is five. Each held note carries an <em>activation</em> in [0,1].
              </p>
              <p>
                Encoding a new note injects activation for it and <em>steals</em> activation from the
                notes already held — retroactive interference (McGeoch, 1932). The theft is
                similarity-weighted: more is taken from notes close in pitch and near in the phrase,
                and more from traces already weak. Attention is a near-conserved pool: when it fills,
                every addition is a subtraction somewhere else.
              </p>
              <p>
                Fall below the eviction threshold and you&apos;re forgotten — the glyph crumbles to a
                faint gravestone. Rehearsing re-injects a favourite at the others&apos; expense, so
                you feel the trade-off. Forgetting here is driven by competition, not neglect
                (echoing arXiv:2606.15088, &ldquo;When the Same Musical Knowledge Forgets
                Differently&rdquo;, 2026).
              </p>
              <p>
                Pitch is continuous — distance from center maps straight to frequency across three
                octaves, with no scale snapping. The self-demo taps eight notes into a memory that
                holds five: three must go.
              </p>
              <p className="font-mono text-xs text-foreground">
                headless check (seed {check.seed}): survivors {check.survivors} ≤ {BUDGET} ·{" "}
                {check.evicted} evicted · rehearsed notes {check.favIds[0]},{check.favIds[1]} at{" "}
                {check.favActs[0].toFixed(2)}/{check.favActs[1].toFixed(2)} — strictly highest.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
