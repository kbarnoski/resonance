"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2166-silent-lattice — "Silent Lattice"
//   state: ketamine / dissociative k-hole · pole: intense (non-dissolution).
//
// THE ONE QUESTION: what if the k-hole were rendered NOT as the self fading
// away, but as a SWITCH you PLAY — your familiar, sensory-connected world going
// dark while a previously-invisible alien architecture ignites and reorganises
// in its place, drawn as crisp vector line-work (an impossible Escher machine)?
//
// GROUNDING: Bera, Looger, Proekt & Cichon, "Cortical Mechanisms Contributing
// to Ketamine-Induced Dissociation," The Neuroscientist (2025/26). Dissociative
// ketamine SILENCES spontaneously-active ensembles while DORMANT neurons become
// ACTIVE — fragmenting normal circuit motifs and promoting novel, complex
// patterns DISCONNECTED from sensory thalamocortical input. Not a fade to void:
// a re-assembly. Harmony: Sethares (1993) stretched partials. Visual reference:
// M.C. Escher / impossible architecture.
//
// SUBSTRATE: real SVG-DOM. Every stroke is an actual <line>/<path>/<circle>
// element, created ONCE from a bounded, seeded pool (~145 nodes), then MUTATED
// per frame via refs. No <canvas>, no WebGL.
//
// THE MECHANIC: dissociation depth D∈[0,1] is a PLAYED FOLLOWER — it rises while
// contacts are sustained/dragged (more fingers → faster) and decays on release.
// As D crosses the switch the familiar iso-grid fragments region-by-region, the
// impossible lattice ignites in its place, and pointer→structure coupling
// DECOUPLES: your touch response slides "far off in the distance," warped onto
// the alien machine. Multi-parameter play: contact COUNT→switch pressure,
// X→region/pan, Y→pitch (Sethares degree), drag SPEED→ignition sparks.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { SilentLatticeAudio } from "./audio";
import {
  ACTIVE_LINES,
  HUBS,
  IMPOSSIBLE_BEAMS,
  IMPOSSIBLE_STRUTS,
  MAX_CONTACTS,
  SPARK_POOL,
  VIEW,
  mulberry32,
  warp,
} from "./scene";

type Phase = "idle" | "running" | "error";

const ACTIVE_COLOR = "#6f97c4"; // calm steel-blue — the familiar world
const ALIEN_COLOR = "#d17a3c"; // hot copper — the alien machine igniting

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

interface Contact {
  id: string;
  x: number;
  y: number;
  px: number;
  py: number;
  speed: number;
}

interface Spark {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number; // 1 → 0
}

export default function SilentLatticePage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const audioRef = useRef<SilentLatticeAudio | null>(null);

  const rafRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 0.6, floor: 0.62 }));
  const sparkRnd = useRef<() => number>(mulberry32(0x1c0de));

  // element refs — allocated once, mutated per frame.
  const activeRefs = useRef<(SVGLineElement | null)[]>([]);
  const strutRefs = useRef<(SVGLineElement | null)[]>([]);
  const beamRefs = useRef<(SVGPathElement | null)[]>([]);
  const hubRefs = useRef<(SVGCircleElement | null)[]>([]);
  const trueRefs = useRef<(SVGCircleElement | null)[]>([]);
  const respRefs = useRef<(SVGCircleElement | null)[]>([]);
  const linkRefs = useRef<(SVGLineElement | null)[]>([]);
  const sparkRefs = useRef<(SVGLineElement | null)[]>([]);

  // live played state
  const pointers = useRef<Map<number, Contact>>(new Map());
  const voiceIds = useRef<Set<string>>(new Set());
  const sparks = useRef<Spark[]>(Array.from({ length: SPARK_POOL }, () => ({ x1: 0, y1: 0, x2: 0, y2: 0, life: 0 })));
  const sparkHead = useRef<number>(0);
  const depthRef = useRef<number>(0);
  const lastInteract = useRef<number>(0);
  const lastT = useRef<number>(0);
  const hudDepth = useRef<number>(0);
  const hudSwitched = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [depthView, setDepthView] = useState(0);
  const [switched, setSwitched] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);

  // ── pointer plumbing ────────────────────────────────────────────────────────
  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * VIEW.w;
    const y = ((clientY - r.top) / r.height) * VIEW.h;
    return { x, y };
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (phase !== "running") return;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const { x, y } = svgPoint(e.clientX, e.clientY);
      if (pointers.current.size >= MAX_CONTACTS) return;
      pointers.current.set(e.pointerId, { id: `p${e.pointerId}`, x, y, px: x, py: y, speed: 0 });
      lastInteract.current = lastT.current;
    },
    [phase, svgPoint],
  );

  const onMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const c = pointers.current.get(e.pointerId);
      if (!c) return;
      const { x, y } = svgPoint(e.clientX, e.clientY);
      c.x = x;
      c.y = y;
      lastInteract.current = lastT.current;
    },
    [svgPoint],
  );

  const onUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
  }, []);

  // ── autopilot: seeded played gesture after 4s idle ───────────────────────────
  const autoRnd = useRef<() => number>(mulberry32(0x5a1ad));
  const autoTargets = useRef<{ ax: number; ay: number; bx: number; by: number }>({
    ax: 0.35, ay: 0.4, bx: 0.62, by: 0.55,
  });
  const autoLoop = useRef<number>(-1);

  function autoContacts(t: number): Contact[] {
    const PERIOD = 15;
    const local = t % PERIOD;
    const loopIx = Math.floor(t / PERIOD);
    if (loopIx !== autoLoop.current) {
      autoLoop.current = loopIx;
      const r = autoRnd.current;
      autoTargets.current = {
        ax: 0.22 + r() * 0.3,
        ay: 0.28 + r() * 0.44,
        bx: 0.55 + r() * 0.3,
        by: 0.28 + r() * 0.44,
      };
    }
    const tg = autoTargets.current;
    const out: Contact[] = [];
    // press-in over 0..2s, sustain+drift 2..10s (D climbs past the switch),
    // second finger joins 4..10s, release after 10.5s (D decays), rest to 15.
    const ease = smoothstep(0, 2, local) * (1 - smoothstep(10.5, 12, local));
    if (ease > 0.02) {
      const wob = Math.sin(local * 0.9) * 0.05;
      const x = (tg.ax + wob) * VIEW.w;
      const y = (tg.ay + Math.cos(local * 0.7) * 0.05) * VIEW.h;
      out.push({ id: "auto0", x, y, px: x, py: y, speed: 0.25 + 0.25 * Math.abs(Math.sin(local)) });
    }
    const ease2 = smoothstep(4, 6, local) * (1 - smoothstep(10, 11.5, local));
    if (ease2 > 0.02) {
      const x = (tg.bx + Math.cos(local * 1.1) * 0.06) * VIEW.w;
      const y = (tg.by + Math.sin(local * 0.8) * 0.06) * VIEW.h;
      out.push({ id: "auto1", x, y, px: x, py: y, speed: 0.3 + 0.3 * Math.abs(Math.cos(local * 1.3)) });
    }
    return out;
  }

  // ── the single frame loop ─────────────────────────────────────────────────────
  const frame = useCallback((tMs: number) => {
    const t = tMs / 1000;
    const first = lastT.current === 0;
    const dt = first ? 0.016 : Math.min(0.05, t - lastT.current);
    lastT.current = t;
    if (first) lastInteract.current = t; // 4s idle countdown starts now
    const reduced = reducedRef.current;
    const motion = reduced ? 0.45 : 1;
    const audio = audioRef.current;

    // 1. resolve the effective contact list (real, else seeded autopilot).
    const real = Array.from(pointers.current.values());
    let contacts: Contact[];
    let auto = false;
    if (real.length > 0) {
      contacts = real;
    } else if (t - lastInteract.current > 4) {
      contacts = autoContacts(t);
      auto = true;
    } else {
      contacts = [];
    }

    // per-contact drag speed (normalised) — used for sparks and audio ticks.
    for (const c of contacts) {
      if (!auto) {
        const dx = c.x - c.px;
        const dy = c.y - c.py;
        c.speed = Math.min(1, Math.hypot(dx, dy) / (dt * 900 + 1));
      }
    }

    // 2. drive D — the played follower. More contacts → faster switch.
    const engaged = contacts.length > 0;
    const rise = engaged ? (0.11 + 0.11 * Math.min(4, contacts.length)) : 0;
    const decay = 0.24;
    let D = depthRef.current;
    if (engaged) D += rise * dt;
    else D -= decay * dt;
    D = Math.min(1, Math.max(0, D));
    depthRef.current = D;

    // 3. sync audio voices to contacts (works for real + autopilot uniformly).
    if (audio) {
      const liveIds = new Set(contacts.map((c) => c.id));
      for (const id of Array.from(voiceIds.current)) {
        if (!liveIds.has(id)) {
          audio.noteOff(id);
          voiceIds.current.delete(id);
        }
      }
      for (const c of contacts) {
        const x01 = c.x / VIEW.w;
        const y01 = c.y / VIEW.h;
        if (!voiceIds.current.has(c.id)) {
          audio.noteOn(c.id, x01, y01);
          voiceIds.current.add(c.id);
        } else {
          audio.noteMove(c.id, x01, y01);
        }
      }
      audio.setDepth(D);
    }

    // 4. flicker glow (safe, ≤3Hz, honours reduced-motion) — only above switch.
    if (D > 0.45 && !flickerRef.current.enabled) flickerRef.current.enable();
    else if (D < 0.4 && flickerRef.current.enabled) flickerRef.current.disable();
    const glow = flickerRef.current.value(t);

    // 5. render — mutate the ACTIVE iso-grid (fades region-by-region).
    for (let i = 0; i < ACTIVE_LINES.length; i++) {
      const el = activeRefs.current[i];
      if (!el) continue;
      const s = ACTIVE_LINES[i];
      const on = 1 - smoothstep(s.switchAt - 0.07, s.switchAt + 0.07, D);
      el.setAttribute("opacity", (0.1 + 0.62 * on).toFixed(3));
    }

    // impossible struts — ignite region-by-region + slow reorganising sway.
    for (let i = 0; i < IMPOSSIBLE_STRUTS.length; i++) {
      const el = strutRefs.current[i];
      if (!el) continue;
      const s = IMPOSSIBLE_STRUTS[i];
      const on = smoothstep(s.switchAt - 0.07, s.switchAt + 0.07, D);
      // sway endpoint around its own midpoint — slow (<0.12 Hz), depth-scaled.
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      const a = s.drift * Math.sin(t * 0.5 + s.phase) * D * motion;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rot = (x: number, y: number) => {
        const dx = x - mx;
        const dy = y - my;
        return [mx + dx * ca - dy * sa, my + dx * sa + dy * ca];
      };
      const [nx1, ny1] = rot(s.x1, s.y1);
      const [nx2, ny2] = rot(s.x2, s.y2);
      el.setAttribute("x1", nx1.toFixed(1));
      el.setAttribute("y1", ny1.toFixed(1));
      el.setAttribute("x2", nx2.toFixed(1));
      el.setAttribute("y2", ny2.toFixed(1));
      el.setAttribute("opacity", (on * (0.5 + 0.5 * glow) * 0.9).toFixed(3));
    }

    // impossible tribar beams.
    for (let i = 0; i < IMPOSSIBLE_BEAMS.length; i++) {
      const el = beamRefs.current[i];
      if (!el) continue;
      const b = IMPOSSIBLE_BEAMS[i];
      const on = smoothstep(b.switchAt - 0.07, b.switchAt + 0.07, D);
      el.setAttribute("opacity", (on * (0.55 + 0.45 * glow)).toFixed(3));
      el.setAttribute("fill-opacity", (on * 0.5).toFixed(3));
    }

    // hubs — the joints; brighten with D.
    for (let i = 0; i < HUBS.length; i++) {
      const el = hubRefs.current[i];
      if (!el) continue;
      const on = smoothstep(0.32, 0.6, D);
      el.setAttribute("opacity", (on * (0.4 + 0.5 * glow)).toFixed(3));
      el.setAttribute("r", (2 + 2.5 * on).toFixed(2));
    }

    // 6. contacts → true markers, warped response markers, coupling links.
    const decoupleAmt = smoothstep(0.4, 0.82, D); // 0 coupled → 1 decoupled
    for (let i = 0; i < MAX_CONTACTS; i++) {
      const tr = trueRefs.current[i];
      const rp = respRefs.current[i];
      const lk = linkRefs.current[i];
      const c = contacts[i];
      if (!c) {
        tr?.setAttribute("opacity", "0");
        rp?.setAttribute("opacity", "0");
        lk?.setAttribute("opacity", "0");
        continue;
      }
      const w = warp(c.x, c.y, decoupleAmt);
      // response slides from the true point to the warped point as D rises.
      const rx = c.x + (w.x - c.x) * decoupleAmt;
      const ry = c.y + (w.y - c.y) * decoupleAmt;
      if (tr) {
        tr.setAttribute("cx", c.x.toFixed(1));
        tr.setAttribute("cy", c.y.toFixed(1));
        // the true pointer dims as it stops being where the response is.
        tr.setAttribute("opacity", (0.5 * (1 - 0.6 * decoupleAmt)).toFixed(3));
      }
      if (rp) {
        rp.setAttribute("cx", rx.toFixed(1));
        rp.setAttribute("cy", ry.toFixed(1));
        rp.setAttribute("r", (10 + 6 * c.speed).toFixed(1));
        rp.setAttribute("opacity", (0.85 * (0.55 + 0.45 * glow)).toFixed(3));
        rp.setAttribute("stroke", decoupleAmt > 0.5 ? ALIEN_COLOR : ACTIVE_COLOR);
      }
      if (lk) {
        lk.setAttribute("x1", c.x.toFixed(1));
        lk.setAttribute("y1", c.y.toFixed(1));
        lk.setAttribute("x2", rx.toFixed(1));
        lk.setAttribute("y2", ry.toFixed(1));
        lk.setAttribute("opacity", (decoupleAmt * 0.5).toFixed(3));
      }

      // 7. sparks on fast drag — emitted at the RESPONSE location.
      if (c.speed > 0.35 && D > 0.2) {
        const r = sparkRnd.current;
        if (r() < c.speed * 0.6) {
          const sp = sparks.current[sparkHead.current % SPARK_POOL];
          sparkHead.current++;
          const ang = r() * Math.PI * 2;
          const len = (18 + r() * 40) * motion;
          sp.x1 = rx;
          sp.y1 = ry;
          sp.x2 = rx + Math.cos(ang) * len;
          sp.y2 = ry + Math.sin(ang) * len;
          sp.life = 1;
          audio?.spark(c.speed, D);
        }
      }
      c.px = c.x;
      c.py = c.y;
    }

    // spark pool — decay + draw (one-shot fades, never repetitive strobing).
    const sparkDecay = dt / (reduced ? 1.4 : 0.9);
    for (let i = 0; i < SPARK_POOL; i++) {
      const el = sparkRefs.current[i];
      const sp = sparks.current[i];
      if (!el) continue;
      if (sp.life > 0) {
        sp.life = Math.max(0, sp.life - sparkDecay);
        el.setAttribute("x1", sp.x1.toFixed(1));
        el.setAttribute("y1", sp.y1.toFixed(1));
        el.setAttribute("x2", sp.x2.toFixed(1));
        el.setAttribute("y2", sp.y2.toFixed(1));
        el.setAttribute("opacity", (sp.life * 0.8).toFixed(3));
      } else {
        el.setAttribute("opacity", "0");
      }
    }

    // 8. throttled HUD (compare against refs so this loop has no reactive deps).
    if (Math.abs(D - hudDepth.current) > 0.01) {
      hudDepth.current = D;
      setDepthView(D);
    }
    const sw = D > 0.4;
    if (sw !== hudSwitched.current) {
      hudSwitched.current = sw;
      setSwitched(sw);
    }

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── begin ──────────────────────────────────────────────────────────────────
  const begin = useCallback(async () => {
    reducedRef.current = prefersReducedMotion();
    try {
      const a = new SilentLatticeAudio();
      audioRef.current = a;
      await a.resume();
      if (a.audioContext.state !== "running") setAudioBlocked(true);
    } catch {
      setAudioUnavailable(true);
    }
    lastInteract.current = 0; // let autopilot start after 4s from t≈0
    lastT.current = 0;
    setPhase("running");
  }, []);

  useEffect(() => {
    if (phase !== "running") return;
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [phase, frame]);

  useEffect(() => {
    const flicker = flickerRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      flicker.kill();
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* ── the SVG-DOM art layer ─────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        aria-hidden
      >
        <rect x={0} y={0} width={VIEW.w} height={VIEW.h} fill="#0a0b10" />

        {/* ACTIVE / familiar isometric grid */}
        <g stroke={ACTIVE_COLOR} strokeWidth={1.1} strokeLinecap="round">
          {ACTIVE_LINES.map((s, i) => (
            <line
              key={`a${i}`}
              ref={(el) => {
                activeRefs.current[i] = el;
              }}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              opacity={0.72}
            />
          ))}
        </g>

        {/* DORMANT / impossible tribar beams (paint order = impossible interlock) */}
        <g stroke={ALIEN_COLOR} strokeWidth={2} strokeLinejoin="round" fill="#0a0b10">
          {IMPOSSIBLE_BEAMS.map((b, i) => (
            <path
              key={`b${i}`}
              ref={(el) => {
                beamRefs.current[i] = el;
              }}
              d={b.d}
              opacity={0}
              fillOpacity={0}
            />
          ))}
        </g>

        {/* DORMANT / interpenetrating struts */}
        <g stroke={ALIEN_COLOR} strokeWidth={1.4} strokeLinecap="round">
          {IMPOSSIBLE_STRUTS.map((s, i) => (
            <line
              key={`s${i}`}
              ref={(el) => {
                strutRefs.current[i] = el;
              }}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              opacity={0}
            />
          ))}
        </g>

        {/* machine joints */}
        <g fill={ALIEN_COLOR}>
          {HUBS.map((h, i) => (
            <circle
              key={`h${i}`}
              ref={(el) => {
                hubRefs.current[i] = el;
              }}
              cx={h.x}
              cy={h.y}
              r={2}
              opacity={0}
            />
          ))}
        </g>

        {/* coupling links: true pointer → displaced response */}
        <g stroke={ALIEN_COLOR} strokeWidth={1} strokeDasharray="4 6">
          {Array.from({ length: MAX_CONTACTS }).map((_, i) => (
            <line
              key={`l${i}`}
              ref={(el) => {
                linkRefs.current[i] = el;
              }}
              opacity={0}
            />
          ))}
        </g>

        {/* true-pointer markers (where you actually touched) */}
        <g fill="none" stroke={ACTIVE_COLOR} strokeWidth={1} strokeDasharray="2 4">
          {Array.from({ length: MAX_CONTACTS }).map((_, i) => (
            <circle
              key={`t${i}`}
              ref={(el) => {
                trueRefs.current[i] = el;
              }}
              r={7}
              opacity={0}
            />
          ))}
        </g>

        {/* response markers (where the field answers — displaced at high D) */}
        <g fill="none" strokeWidth={2}>
          {Array.from({ length: MAX_CONTACTS }).map((_, i) => (
            <circle
              key={`r${i}`}
              ref={(el) => {
                respRefs.current[i] = el;
              }}
              r={10}
              stroke={ACTIVE_COLOR}
              opacity={0}
            />
          ))}
        </g>

        {/* ignition sparks */}
        <g stroke={ALIEN_COLOR} strokeWidth={1.6} strokeLinecap="round">
          {Array.from({ length: SPARK_POOL }).map((_, i) => (
            <line
              key={`k${i}`}
              ref={(el) => {
                sparkRefs.current[i] = el;
              }}
              opacity={0}
            />
          ))}
        </g>
      </svg>

      {/* ── header ────────────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Silent Lattice
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          The k-hole not as the self fading away, but as a switch you play &mdash;
          your familiar world goes dark and an invisible alien architecture
          ignites and re-assembles in its place.
        </p>
      </div>

      {/* ── start overlay ─────────────────────────────────────────────────── */}
      {phase !== "running" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="max-w-lg text-center">
            <p className="mb-6 text-base leading-relaxed text-muted-foreground">
              Press Begin, then touch and hold the field. A calm isometric grid
              answers your touch directly. Keep contact &mdash; more fingers press
              harder &mdash; and dissociation depth climbs past the switch: the grid
              fragments, an impossible Escher machine ignites in its place, and your
              touch decouples, its answer sliding far off into the machine. Release
              to come back. Left it alone? It plays itself. Sound on; no mic, no
              camera.
            </p>
            {audioUnavailable && (
              <p className="mb-4 text-sm text-destructive">
                Web Audio is unavailable here &mdash; the visuals still run.
              </p>
            )}
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          </div>
        </div>
      )}

      {/* ── depth HUD ─────────────────────────────────────────────────────── */}
      {phase === "running" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-6">
          {audioBlocked && (
            <p className="text-base text-muted-foreground">
              Audio is blocked on this device &mdash; the visuals still run.
            </p>
          )}
          <div className="flex w-full max-w-md flex-col items-center gap-1">
            <div className="flex w-full items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>familiar</span>
              <span className="text-foreground">
                depth {depthView.toFixed(2)} &middot; {switched ? "switched" : "coupled"}
              </span>
              <span>alien</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.round(depthView * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── design notes ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm">
          <div className="mt-16 max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Dissociation depth <span className="font-mono text-foreground">D</span>{" "}
                is a <em>played follower</em>, not a timeline: it rises while you
                sustain contact and drag (more fingers push it faster) and decays
                when you let go. As it crosses the switch (~0.4) the piece performs
                the mechanism in Bera, Looger, Proekt &amp; Cichon,{" "}
                <em>&ldquo;Cortical Mechanisms Contributing to Ketamine-Induced
                Dissociation,&rdquo;</em> The Neuroscientist (online 2025-12-26;
                print 2026-02-01): dissociative-dose ketamine <strong>silences</strong>{" "}
                spontaneously-active neuronal ensembles while previously-dormant
                neurons become <strong>active</strong>, fragmenting normal circuit
                motifs and promoting novel, complex activity{" "}
                <em>disconnected from sensory thalamocortical input</em> &mdash;
                &ldquo;reality far off in the distance.&rdquo;
              </p>
              <p>
                So the familiar isometric grid (the sensory-connected world) fades
                region-by-region while an impossible Escher machine ignites and
                assembles in the same space &mdash; a re-organisation, never a fade
                to void. And the pointer <strong>decouples</strong>: past the switch
                your touch no longer maps 1:1; its answer warps and slides onto the
                alien lattice, drawn literally as the dashed link from where you
                touched to where the field responds.
              </p>
              <p>
                Harmony is Sethares (1993) stretched partials &mdash; partial{" "}
                <span className="font-mono">n</span> at{" "}
                <span className="font-mono">f₀·n^log₂(A)</span>. Two timbre banks
                crossfade with <span className="font-mono">D</span>: warm{" "}
                <span className="font-mono">A=2.02</span> (familiar) &rarr; metallic{" "}
                <span className="font-mono">A=2.30</span> (machine). No pentatonic,
                no just intonation, no Bohlen&ndash;Pierce. Visual reference: M.C.
                Escher / impossible architecture.
              </p>
              <p>
                Substrate: real SVG-DOM &mdash; every stroke is an actual{" "}
                <span className="font-mono">&lt;line&gt;/&lt;path&gt;/&lt;circle&gt;</span>{" "}
                from a bounded, seeded pool (~145 nodes) mutated per frame; no
                canvas, no WebGL. Safety: no strobe. Depth is slew-limited, all
                luminance change is slow drift, and any glow routes through the
                shared photosensitive-safe flicker engine (&le;3&nbsp;Hz,
                reduced-motion honoured).
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2166-silent-lattice"]} />
    </main>
  );
}
