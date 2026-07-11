"use client";

import { useEffect, useRef, useState } from "react";

// ── Jelly Choir ───────────────────────────────────────────────────────────────
// The lab's first mass-spring / Verlet soft-body → audio instrument.
// Each jelly is a ring of point-masses held in a circle by radial + structural
// springs (Verlet integration, Jakobsen-style constraint relaxation). Poke it and
// the overshoot makes it wobble; the wobble's deformation energy literally drives
// a warm modal voice (energy² → loudness, energy → brightness + vibrato). Tuning
// is just intonation (1/1, 9/8, 5/4, 3/2, 2/1) over a 196 Hz root — consonant but
// deliberately NOT C-major pentatonic, so two kids poking two jellies hear a pure
// interval ring out.
// Refs: nlm (arXiv 2603.10240, 2026); Provot, "Deformation Constraints in a
// Mass-Spring Model" (1995); Müller et al., Position-Based Dynamics.

const N_POINTS = 14; // perimeter masses per jelly
const SUBSTEPS = 2;
const CONSTRAINT_ITERS = 3;
const DAMPING = 0.93; // Verlet velocity retention (lower = jelly settles faster)
const K_RADIAL = 0.16; // radial spring relaxation (perimeter → home)
const K_STRUCT = 0.14; // structural spring relaxation (perimeter ↔ neighbor)

// Just-intonation ratios over the root — consonant, non-pentatonic by construction.
const ROOT_HZ = 196.0; // G3
const JELLIES = [
  { ratio: 1, color: "#ff5d8f", glow: "#ff9dbe" }, // rose
  { ratio: 9 / 8, color: "#ffb24d", glow: "#ffd49a" }, // amber
  { ratio: 5 / 4, color: "#54e0a0", glow: "#a4f0cd" }, // emerald
  { ratio: 3 / 2, color: "#4dd8ff", glow: "#a6ecff" }, // cyan
  { ratio: 2, color: "#b07bff", glow: "#d3b6ff" }, // violet
];

// Unordered jelly pairs, in a stable index order shared by physics + render.
const PAIRS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let a = 0; a < JELLIES.length; a++) {
    for (let b = a + 1; b < JELLIES.length; b++) out.push([a, b]);
  }
  return out;
})();

interface Mass {
  x: number;
  y: number;
  px: number; // previous position (Verlet)
  py: number;
  pinned: boolean;
}

interface Jelly {
  hx: number; // home (anchor) position
  hy: number;
  r: number; // rest radius
  phase: number; // breathing phase offset
  pts: Mass[];
  energy: number; // smoothed deformation energy
}

interface Voice {
  osc: OscillatorNode;
  octave: OscillatorNode;
  gain: GainNode;
  lp: BiquadFilterNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

export default function JellyChoirPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyEls = useRef<(SVGPathElement | null)[]>([]);
  const mouthEls = useRef<(SVGPathElement | null)[]>([]);
  const lineEls = useRef<(SVGLineElement | null)[]>([]);

  const [audioReady, setAudioReady] = useState(false);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let W = wrap.clientWidth || window.innerWidth;
    let H = wrap.clientHeight || window.innerHeight;

    const jellies: Jelly[] = JELLIES.map((j, i) => ({
      hx: 0,
      hy: 0,
      r: 1,
      phase: (i / JELLIES.length) * Math.PI * 2,
      energy: 0,
      pts: Array.from({ length: N_POINTS }, () => ({
        x: 0,
        y: 0,
        px: 0,
        py: 0,
        pinned: false,
      })),
    }));

    function layout() {
      W = wrap!.clientWidth || window.innerWidth;
      H = wrap!.clientHeight || window.innerHeight;
      const cols = jellies.length;
      const cellW = W / cols;
      const r = Math.max(34, Math.min(cellW * 0.36, H * 0.26));
      jellies.forEach((jel, i) => {
        jel.hx = cellW * (i + 0.5);
        jel.hy = H * 0.5;
        jel.r = r;
        for (let k = 0; k < N_POINTS; k++) {
          const ang = (k / N_POINTS) * Math.PI * 2;
          const x = jel.hx + Math.cos(ang) * r;
          const y = jel.hy + Math.sin(ang) * r;
          jel.pts[k].x = x;
          jel.pts[k].y = y;
          jel.pts[k].px = x;
          jel.pts[k].py = y;
        }
        jel.energy = 0;
      });
    }
    layout();

    // ── audio ─────────────────────────────────────────────────────────────────
    let audioCtx: AudioContext | null = null;
    let master: GainNode | null = null;
    let limiter: DynamicsCompressorNode | null = null;
    let droneGain: GainNode | null = null;
    const voices: Voice[] = [];

    function startAudio() {
      if (audioCtx) {
        if (audioCtx.state === "suspended") void audioCtx.resume();
        return;
      }
      try {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtx = new Ctor();
      } catch {
        return; // visuals still run; just no sound
      }
      const ctx = audioCtx;

      const limiterNode = ctx.createDynamicsCompressor();
      limiterNode.threshold.value = -8;
      limiterNode.knee.value = 6;
      limiterNode.ratio.value = 12;
      limiterNode.attack.value = 0.003;
      limiterNode.release.value = 0.25;
      limiter = limiterNode;

      const masterNode = ctx.createGain();
      masterNode.gain.value = 0.9;
      masterNode.connect(limiterNode);
      limiterNode.connect(ctx.destination);
      master = masterNode;

      // Always-on warm drone (root + fifth, very soft) so it's never silent.
      const drone = ctx.createGain();
      drone.gain.value = 0.0;
      drone.connect(masterNode);
      [ROOT_HZ * 0.5, ROOT_HZ * 0.75].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = i === 0 ? 0.5 : 0.32;
        o.connect(g);
        g.connect(drone);
        o.start();
      });
      drone.gain.setTargetAtTime(0.05, ctx.currentTime, 1.2);
      droneGain = drone;

      // One modal voice per jelly.
      JELLIES.forEach((j) => {
        const f0 = ROOT_HZ * j.ratio;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 320;
        lp.Q.value = 0.7;

        const gain = ctx.createGain();
        gain.gain.value = 0;

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = f0;

        const octave = ctx.createOscillator();
        octave.type = "triangle";
        octave.frequency.value = f0 * 2;
        const octGain = ctx.createGain();
        octGain.gain.value = 0.28;

        // vibrato — depth & rate scale with wobble energy
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 4;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfoGain.connect(octave.frequency);

        osc.connect(gain);
        octave.connect(octGain);
        octGain.connect(gain);
        gain.connect(lp);
        lp.connect(masterNode);

        osc.start();
        octave.start();
        lfo.start();
        voices.push({ osc, octave, gain, lp, lfo, lfoGain });
      });

      setAudioReady(true);
    }

    // ── pointer / pin handling (multi-touch) ────────────────────────────────────
    const pins = new Map<number, { jelly: number; pt: number }>();

    function localXY(e: PointerEvent) {
      const rect = wrap!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function grab(e: PointerEvent) {
      startAudio();
      setShowHint(false);
      const { x, y } = localXY(e);
      // find the closest perimeter point across all jellies, within grab range
      let bestJ = -1;
      let bestP = -1;
      let bestD = Infinity;
      jellies.forEach((jel, ji) => {
        const dc = Math.hypot(x - jel.hx, y - jel.hy);
        if (dc > jel.r * 1.7) return; // not near this jelly at all
        jel.pts.forEach((p, pi) => {
          const d = Math.hypot(x - p.x, y - p.y);
          if (d < bestD) {
            bestD = d;
            bestJ = ji;
            bestP = pi;
          }
        });
      });
      if (bestJ >= 0) {
        jellies[bestJ].pts[bestP].pinned = true;
        jellies[bestJ].pts[bestP].x = x;
        jellies[bestJ].pts[bestP].y = y;
        pins.set(e.pointerId, { jelly: bestJ, pt: bestP });
        wrap!.setPointerCapture?.(e.pointerId);
      }
    }

    function drag(e: PointerEvent) {
      const pin = pins.get(e.pointerId);
      if (!pin) return;
      const { x, y } = localXY(e);
      const p = jellies[pin.jelly].pts[pin.pt];
      // leave px/py from physics so release injects the gathered velocity → overshoot
      p.x = x;
      p.y = y;
    }

    function release(e: PointerEvent) {
      const pin = pins.get(e.pointerId);
      if (!pin) return;
      jellies[pin.jelly].pts[pin.pt].pinned = false;
      pins.delete(e.pointerId);
    }

    wrap.addEventListener("pointerdown", grab);
    wrap.addEventListener("pointermove", drag);
    wrap.addEventListener("pointerup", release);
    wrap.addEventListener("pointercancel", release);

    // ── physics + render loop ───────────────────────────────────────────────────
    let raf = 0;
    let t = 0;

    function step() {
      t += 1 / 60;

      jellies.forEach((jel) => {
        // slow "breathing" of the rest radius so a jelly is alive before touch
        const rRest = jel.r * (1 + 0.025 * Math.sin(t * 0.9 + jel.phase));
        const restChord = 2 * rRest * Math.sin(Math.PI / N_POINTS);

        for (let s = 0; s < SUBSTEPS; s++) {
          // Verlet integrate
          for (const p of jel.pts) {
            if (p.pinned) {
              p.px = p.x;
              p.py = p.y;
              continue;
            }
            const vx = (p.x - p.px) * DAMPING;
            const vy = (p.y - p.py) * DAMPING;
            p.px = p.x;
            p.py = p.y;
            p.x += vx;
            p.y += vy;
          }
          // constraint relaxation
          for (let it = 0; it < CONSTRAINT_ITERS; it++) {
            // radial springs → home
            for (const p of jel.pts) {
              if (p.pinned) continue;
              const dx = p.x - jel.hx;
              const dy = p.y - jel.hy;
              const d = Math.hypot(dx, dy) || 1e-4;
              const diff = ((d - rRest) / d) * K_RADIAL;
              p.x -= dx * diff;
              p.y -= dy * diff;
            }
            // structural springs → neighbors
            for (let k = 0; k < N_POINTS; k++) {
              const a = jel.pts[k];
              const b = jel.pts[(k + 1) % N_POINTS];
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const d = Math.hypot(dx, dy) || 1e-4;
              const diff = ((d - restChord) / d) * 0.5 * K_STRUCT;
              const ox = dx * diff;
              const oy = dy * diff;
              if (!a.pinned) {
                a.x += ox;
                a.y += oy;
              }
              if (!b.pinned) {
                b.x -= ox;
                b.y -= oy;
              }
            }
          }
        }

        // deformation energy = mean |radius − rest| / rest
        let dev = 0;
        for (const p of jel.pts) {
          const d = Math.hypot(p.x - jel.hx, p.y - jel.hy);
          dev += Math.abs(d - jel.r);
        }
        dev = dev / N_POINTS / jel.r;
        jel.energy += (dev - jel.energy) * 0.25;
      });

      // ── audio mapping ──────────────────────────────────────────────────────────
      if (audioCtx) {
        const now = audioCtx.currentTime;
        jellies.forEach((jel, i) => {
          const v = voices[i];
          if (!v) return;
          const e = jel.energy;
          const g = Math.min(e * e * 14, 0.24); // silent at rest (e²)
          const cut = Math.min(320 + e * 4200, 5200);
          const vibDepth = Math.min(e * 7, 5);
          const vibRate = 3.5 + Math.min(e * 5, 4);
          v.gain.gain.setTargetAtTime(g, now, 0.05);
          v.lp.frequency.setTargetAtTime(cut, now, 0.06);
          v.lfoGain.gain.setTargetAtTime(vibDepth, now, 0.08);
          v.lfo.frequency.setTargetAtTime(vibRate, now, 0.1);
        });
      }

      // ── render ──────────────────────────────────────────────────────────────────
      jellies.forEach((jel, i) => {
        const body = bodyEls.current[i];
        if (body) body.setAttribute("d", blobPath(jel.pts));
        const mouth = mouthEls.current[i];
        if (mouth) {
          const open = jel.r * (0.08 + Math.min(jel.energy, 1.2) * 0.32);
          const mw = jel.r * 0.4;
          const cx = jel.hx;
          const cy = jel.hy + jel.r * 0.22;
          // a smiling open mouth (quadratic arc, height = open)
          mouth.setAttribute(
            "d",
            `M ${cx - mw} ${cy} Q ${cx} ${cy + open + mw * 0.5} ${cx + mw} ${cy} Q ${cx} ${cy + open} ${cx - mw} ${cy} Z`,
          );
        }
      });

      // connecting glow between simultaneously-singing jellies
      PAIRS.forEach(([a, b], k) => {
        const line = lineEls.current[k];
        if (!line) return;
        const ea = jellies[a].energy;
        const eb = jellies[b].energy;
        const lit = Math.min(ea, eb);
        if (lit > 0.04) {
          line.setAttribute("x1", String(jellies[a].hx));
          line.setAttribute("y1", String(jellies[a].hy));
          line.setAttribute("x2", String(jellies[b].hx));
          line.setAttribute("y2", String(jellies[b].hy));
          line.setAttribute("opacity", String(Math.min(lit * 4, 0.6)));
        } else {
          line.setAttribute("opacity", "0");
        }
      });

      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    const onResize = () => layout();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      wrap.removeEventListener("pointerdown", grab);
      wrap.removeEventListener("pointermove", drag);
      wrap.removeEventListener("pointerup", release);
      wrap.removeEventListener("pointercancel", release);
      voices.forEach((v) => {
        try {
          v.osc.stop();
          v.octave.stop();
          v.lfo.stop();
        } catch {
          /* already stopped */
        }
        v.osc.disconnect();
        v.octave.disconnect();
        v.lfo.disconnect();
        v.lfoGain.disconnect();
        v.gain.disconnect();
        v.lp.disconnect();
      });
      droneGain?.disconnect();
      master?.disconnect();
      limiter?.disconnect();
      if (audioCtx) void audioCtx.close();
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#08060d] text-foreground">
      <div ref={wrapRef} className="absolute inset-0 touch-none">
        <svg className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <filter id="jellyGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="9" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* harmony glow lines (between two singing jellies) */}
          {PAIRS.map(([a, b], k) => (
            <line
              key={`l-${a}-${b}`}
              ref={(el) => {
                lineEls.current[k] = el;
              }}
              stroke="#ffffff"
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0}
              filter="url(#jellyGlow)"
            />
          ))}

          {JELLIES.map((j, i) => (
            <g key={i} filter="url(#jellyGlow)">
              <path
                ref={(el) => {
                  bodyEls.current[i] = el;
                }}
                fill={j.color}
                fillOpacity={0.9}
                stroke={j.glow}
                strokeWidth={3}
              />
              {/* mouth (opens with wobble energy) */}
              <path
                ref={(el) => {
                  mouthEls.current[i] = el;
                }}
                fill="#1a0e1f"
                fillOpacity={0.85}
              />
            </g>
          ))}
        </svg>

        {/* eyes as an HTML overlay (kept static at each jelly home, set on mount) */}
        <Eyes />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground drop-shadow">
          Jelly Choir
        </h1>
        <p
          className={`font-mono text-base text-foreground transition-opacity duration-1000 ${
            showHint ? "opacity-100" : "opacity-0"
          }`}
        >
          Poke a jelly! 🫧 It wobbles and sings. Poke two to make them harmonize.
        </p>
        {!audioReady && (
          <p className="font-mono text-sm text-muted-foreground">tap to wake the jellies</p>
        )}
      </div>

      <a
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/286-kids-jelly-choir/README.md"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-3 right-3 z-10 text-xs text-muted-foreground hover:text-foreground"
      >
        design notes
      </a>
    </main>
  );
}

// Catmull-Rom through the closed ring of masses → smooth cubic-Bézier blob path.
function blobPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d + " Z";
}

// Static googly eyes, one pair per jelly, laid out to match the page layout.
function Eyes() {
  const [boxes, setBoxes] = useState<
    { x: number; y: number; r: number }[]
  >([]);
  useEffect(() => {
    const recompute = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const cols = JELLIES.length;
      const cellW = W / cols;
      const r = Math.max(34, Math.min(cellW * 0.36, H * 0.26));
      setBoxes(
        JELLIES.map((_, i) => ({ x: cellW * (i + 0.5), y: H * 0.5, r })),
      );
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);
  return (
    <>
      {boxes.map((b, i) => {
        const eyeR = Math.max(5, b.r * 0.12);
        const dx = b.r * 0.34;
        const dy = b.r * 0.18;
        return (
          <div key={i}>
            {[-1, 1].map((s) => (
              <div
                key={s}
                className="pointer-events-none absolute rounded-full bg-card"
                style={{
                  left: b.x + s * dx - eyeR,
                  top: b.y - dy - eyeR,
                  width: eyeR * 2,
                  height: eyeR * 2,
                }}
              >
                <div
                  className="absolute rounded-full bg-[#1a0e1f]"
                  style={{
                    left: eyeR * 0.55,
                    top: eyeR * 0.7,
                    width: eyeR * 0.9,
                    height: eyeR * 0.9,
                  }}
                />
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
