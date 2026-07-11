"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  buildField,
  detectSign,
  pointGlow,
  pointPos,
  signsOverlap,
  FIELD_W,
  FIELD_H,
  type DetectedSign,
  type FieldPoint,
  type Vec,
} from "./field";
import { createAudio, type ApopheniaAudio } from "./audio";
import { NOTES_MD } from "./notes";

const POINT_COUNT = 190;
const SEED = 0x1396;
const ATTENTION_RADIUS = 150;
const DWELL_MS = 650;
const DWELL_MOVE_TOL = 3.4; // px/frame under which the locus counts as "dwelling"
const SIGN_TTL_MS = 20000;
const SIGN_FADE_MS = 4500;
const MAX_SIGNS = 6;
const IDLE_MS = 5000;
const IDLE_INTERVAL_MS = 5500;
const RECOG_COOLDOWN_MS = 380;
const HOME_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];
const Y_BANDS = 5;
const MARGIN = 46;

type Phase = "idle" | "live";

interface ActiveSign {
  id: number;
  indices: number[];
  kind: DetectedSign["kind"];
  createdAt: number;
}

interface SignRef {
  g: SVGGElement | null;
  poly: SVGPolylineElement | null;
  dots: (SVGCircleElement | null)[];
}

/** Render the design-notes markdown as austere in-page prose (no extra deps). */
function renderNotes(md: string) {
  return md.split("\n").map((line, i) => {
    if (line.startsWith("## ")) {
      return (
        <h2 key={i} className="mt-5 text-xl font-medium text-violet-300">
          {line.slice(3)}
        </h2>
      );
    }
    if (line.startsWith("# ")) {
      return (
        <h1 key={i} className="text-2xl font-semibold text-foreground">
          {line.slice(2)}
        </h1>
      );
    }
    if (line.startsWith("- ")) {
      return (
        <li key={i} className="ml-5 list-disc text-base leading-relaxed text-foreground">
          {renderInline(line.slice(2))}
        </li>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-2" />;
    return (
      <p key={i} className="text-base leading-relaxed text-foreground">
        {renderInline(line)}
      </p>
    );
  });
}

/** Minimal **bold** + `code` inline rendering. */
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-muted px-1 text-[0.95em] text-violet-200">
          {p.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{p}</span>;
  });
}

export default function ApopheniaFieldPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notesOpen, setNotesOpen] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signCount, setSignCount] = useState(0);
  const [signs, setSigns] = useState<ActiveSign[]>([]);
  const [idleHint, setIdleHint] = useState(false);

  // ── refs (animation + audio state; kept off React to avoid stale closures) ──
  const svgRef = useRef<SVGSVGElement | null>(null);
  const fieldRef = useRef<FieldPoint[]>([]);
  const posRef = useRef<Vec[]>([]);
  const pointEls = useRef<(SVGCircleElement | null)[]>([]);
  const signRefs = useRef<Map<number, SignRef>>(new Map());
  const signsRef = useRef<ActiveSign[]>([]);

  const locusGroupRef = useRef<SVGGElement | null>(null);
  const dwellArcRef = useRef<SVGCircleElement | null>(null);

  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const startedRef = useRef(false);
  const reducedRef = useRef(false);
  const audioRef = useRef<ApopheniaAudio | null>(null);

  const locusRef = useRef({ x: FIELD_W / 2, y: FIELD_H / 2, active: false, shown: false });
  const prevLocusRef = useRef({ x: FIELD_W / 2, y: FIELD_H / 2 });
  const dwellRef = useRef(0);
  const cooldownRef = useRef(0);
  const idSeqRef = useRef(1);
  const lastInteractRef = useRef(0);
  const idleActiveRef = useRef(false);
  const idleNextRef = useRef(0);
  const autoRndRef = useRef<() => number>(() => 0);
  const keyBandRef = useRef(0);

  // Build the (deterministic) field once.
  if (fieldRef.current.length === 0) {
    fieldRef.current = buildField(SEED, POINT_COUNT);
    posRef.current = fieldRef.current.map((p) => ({ x: p.bx, y: p.by }));
    // A separate seeded stream drives the idle self-demo's locus picks.
    let a = 0x51ed >>> 0;
    autoRndRef.current = () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 0xffffffff;
    };
  }

  const ensureSignRef = (id: number): SignRef => {
    let e = signRefs.current.get(id);
    if (!e) {
      e = { g: null, poly: null, dots: [] };
      signRefs.current.set(id, e);
    }
    return e;
  };

  const removeSign = useCallback((id: number) => {
    const arr = signsRef.current;
    const gi = arr.findIndex((s) => s.id === id);
    if (gi < 0) return;
    arr.splice(gi, 1);
    signRefs.current.delete(id);
    audioRef.current?.forget(id);
    signsRef.current = arr;
    setSigns([...arr]);
    setSignCount(arr.length);
    audioRef.current?.setDrive(arr.length);
  }, []);

  // Recognise a detected sign: light it, ring it, hold it.
  const recognize = useCallback(
    (sign: DetectedSign, now: number): boolean => {
      if (now < cooldownRef.current) return false;
      for (const s of signsRef.current) {
        if (signsOverlap(s.indices, sign.indices)) return false;
      }
      const id = idSeqRef.current++;
      const active: ActiveSign = {
        id,
        indices: sign.indices,
        kind: sign.kind,
        createdAt: now,
      };
      const arr = signsRef.current;
      arr.push(active);
      while (arr.length > MAX_SIGNS) {
        const oldest = arr[0];
        arr.splice(0, 1);
        signRefs.current.delete(oldest.id);
        audioRef.current?.forget(oldest.id);
      }
      signsRef.current = arr;
      const intensity = Math.min(1, 0.6 + sign.indices.length * 0.09);
      audioRef.current?.strike(id, sign.notes, intensity);
      audioRef.current?.setDrive(arr.length);
      setSigns([...arr]);
      setSignCount(arr.length);
      cooldownRef.current = now + RECOG_COOLDOWN_MS;
      dwellRef.current = 0;
      return true;
    },
    [],
  );

  const markInteract = useCallback((now: number) => {
    lastInteractRef.current = now;
    if (idleActiveRef.current) {
      idleActiveRef.current = false;
      setIdleHint(false);
    }
  }, []);

  // Pointer → attention locus.
  const clientToField = useCallback((clientX: number, clientY: number): Vec | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!startedRef.current) return;
      const p = clientToField(clientX, clientY);
      if (!p) return;
      locusRef.current.x = p.x;
      locusRef.current.y = p.y;
      locusRef.current.active = true;
      locusRef.current.shown = true;
      markInteract(performance.now());
    },
    [clientToField, markInteract],
  );

  const begin = useCallback(async () => {
    if (startedRef.current) return;
    setError(null);
    const audio = createAudio();
    audioRef.current = audio;
    try {
      await audio.begin();
    } catch {
      setError("Audio could not start in this browser. Try tapping again.");
      audioRef.current = null;
      return;
    }
    const now = performance.now();
    startedRef.current = true;
    lastInteractRef.current = now;
    idleNextRef.current = now + IDLE_MS + 500;
    setPhase("live");
  }, []);

  // reduced-motion detection.
  useEffect(() => {
    const r = prefersReducedMotion();
    setReduced(r);
    reducedRef.current = r;
  }, []);

  // Global keyboard control (works with no pointer).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!startedRef.current) return;
      const key = ev.key.toLowerCase();
      const now = performance.now();

      const hk = HOME_KEYS.indexOf(key);
      if (hk >= 0) {
        ev.preventDefault();
        const colW = (FIELD_W - MARGIN * 2) / HOME_KEYS.length;
        locusRef.current.x = MARGIN + colW * (hk + 0.5);
        keyBandRef.current = (keyBandRef.current + 1) % Y_BANDS;
        const bandH = (FIELD_H - MARGIN * 2) / (Y_BANDS - 1);
        locusRef.current.y = MARGIN + bandH * keyBandRef.current;
        locusRef.current.active = true;
        locusRef.current.shown = true;
        markInteract(now);
        return;
      }
      if (key === "arrowleft" || key === "arrowright" || key === "arrowup" || key === "arrowdown") {
        ev.preventDefault();
        const step = 26;
        if (key === "arrowleft") locusRef.current.x -= step;
        if (key === "arrowright") locusRef.current.x += step;
        if (key === "arrowup") locusRef.current.y -= step;
        if (key === "arrowdown") locusRef.current.y += step;
        locusRef.current.x = Math.max(0, Math.min(FIELD_W, locusRef.current.x));
        locusRef.current.y = Math.max(0, Math.min(FIELD_H, locusRef.current.y));
        locusRef.current.active = true;
        locusRef.current.shown = true;
        markInteract(now);
        return;
      }
      if (key === " " || key === "enter") {
        ev.preventDefault();
        markInteract(now);
        locusRef.current.active = true;
        locusRef.current.shown = true;
        const cand = detectSign(
          posRef.current,
          locusRef.current.x,
          locusRef.current.y,
          ATTENTION_RADIUS,
        );
        if (cand) recognize(cand, now);
        return;
      }
      if (key === "x" || key === "backspace") {
        ev.preventDefault();
        markInteract(now);
        const arr = signsRef.current;
        if (arr.length) removeSign(arr[0].id);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markInteract, recognize, removeSign]);

  // Pick a locus that yields a fresh sign, for the idle self-demo.
  const runAutoPick = useCallback((): DetectedSign | null => {
    const pos = posRef.current;
    const rnd = autoRndRef.current;
    for (let attempt = 0; attempt < 26; attempt++) {
      const base = pos[Math.floor(rnd() * pos.length)];
      const lx = base.x + (rnd() - 0.5) * 90;
      const ly = base.y + (rnd() - 0.5) * 90;
      const cand = detectSign(pos, lx, ly, ATTENTION_RADIUS);
      if (!cand) continue;
      let overlap = false;
      for (const s of signsRef.current) {
        if (signsOverlap(s.indices, cand.indices)) {
          overlap = true;
          break;
        }
      }
      if (!overlap) return cand;
    }
    return null;
  }, []);

  // The one animation loop: drift + detection + recognition + idle demo + draw.
  useEffect(() => {
    startTimeRef.current = performance.now();
    let lastFrame = startTimeRef.current;

    const frame = (nowMs: number) => {
      const t = (nowMs - startTimeRef.current) / 1000;
      const dt = Math.min(64, nowMs - lastFrame);
      lastFrame = nowMs;
      const motion = reducedRef.current ? 0.16 : 1;
      const field = fieldRef.current;
      const pos = posRef.current;

      // 1. drift + draw the field.
      for (let i = 0; i < field.length; i++) {
        const p = pointPos(field[i], t, motion);
        pos[i].x = p.x;
        pos[i].y = p.y;
        const el = pointEls.current[i];
        if (el) {
          el.setAttribute("cx", p.x.toFixed(1));
          el.setAttribute("cy", p.y.toFixed(1));
          el.setAttribute("opacity", pointGlow(field[i], t, motion).toFixed(3));
        }
      }

      const locus = locusRef.current;

      if (startedRef.current) {
        // 2. idle self-demo — hunts on its own when untouched.
        if (nowMs - lastInteractRef.current > IDLE_MS) {
          if (!idleActiveRef.current) {
            idleActiveRef.current = true;
            setIdleHint(true);
            idleNextRef.current = nowMs + 400;
          }
          if (nowMs >= idleNextRef.current) {
            const found = runAutoPick();
            if (found) {
              locus.x = found.cx;
              locus.y = found.cy;
              locus.shown = true;
              locus.active = false;
              recognize(found, nowMs);
            }
            const jitter = reducedRef.current ? 0 : autoRndRef.current() * 1200;
            idleNextRef.current = nowMs + IDLE_INTERVAL_MS + jitter;
          }
        }

        // 3. dwell detection (user-driven).
        if (locus.active) {
          const cand = detectSign(pos, locus.x, locus.y, ATTENTION_RADIUS);
          const moveDist = Math.hypot(
            locus.x - prevLocusRef.current.x,
            locus.y - prevLocusRef.current.y,
          );
          if (cand && moveDist < DWELL_MOVE_TOL) {
            dwellRef.current += dt;
            if (dwellRef.current >= DWELL_MS && nowMs >= cooldownRef.current) {
              recognize(cand, nowMs);
            }
          } else if (moveDist >= DWELL_MOVE_TOL) {
            dwellRef.current = 0;
          }
          // dwell arc feedback.
          const arc = dwellArcRef.current;
          if (arc) {
            const prog = cand ? Math.min(1, dwellRef.current / DWELL_MS) : 0;
            const circ = 2 * Math.PI * 26;
            arc.setAttribute("stroke-dashoffset", (circ * (1 - prog)).toFixed(1));
            arc.setAttribute("opacity", cand ? (0.35 + prog * 0.6).toFixed(2) : "0.12");
          }
        } else if (dwellArcRef.current) {
          dwellArcRef.current.setAttribute("opacity", "0");
        }
      }

      // 4. locus draw.
      const lg = locusGroupRef.current;
      if (lg) {
        lg.setAttribute("transform", `translate(${locus.x.toFixed(1)},${locus.y.toFixed(1)})`);
        lg.setAttribute("opacity", locus.shown && startedRef.current ? "1" : "0");
      }
      prevLocusRef.current.x = locus.x;
      prevLocusRef.current.y = locus.y;

      // 5. persistent signs: track drift, glow, fade + retire.
      const shimmer = reducedRef.current ? 1 : 0.85 + 0.15 * Math.sin(t * 1.3);
      const toRemove: number[] = [];
      for (const s of signsRef.current) {
        const ref = signRefs.current.get(s.id);
        if (!ref) continue;
        const age = nowMs - s.createdAt;
        // build the polyline + dots from current drifted positions.
        let pts = "";
        for (let j = 0; j < s.indices.length; j++) {
          const q = pos[s.indices[j]];
          pts += `${q.x.toFixed(1)},${q.y.toFixed(1)} `;
          const dot = ref.dots[j];
          if (dot) {
            dot.setAttribute("cx", q.x.toFixed(1));
            dot.setAttribute("cy", q.y.toFixed(1));
          }
        }
        if (ref.poly) ref.poly.setAttribute("points", pts.trim());

        const bloomMs = reducedRef.current ? 900 : 480;
        let op: number;
        if (age < bloomMs) op = 0.4 + 0.6 * (age / bloomMs);
        else if (age < SIGN_TTL_MS) op = 0.82 * shimmer;
        else op = 0.82 * shimmer * Math.max(0, 1 - (age - SIGN_TTL_MS) / SIGN_FADE_MS);
        if (ref.g) ref.g.setAttribute("opacity", op.toFixed(3));
        if (age >= SIGN_TTL_MS + SIGN_FADE_MS) toRemove.push(s.id);
      }
      for (const id of toRemove) removeSign(id);

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [recognize, removeSign, runAutoPick]);

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="min-h-screen bg-[#07060c] px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-4">
          <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
            Apophenia Field
          </h1>
          <p className="mt-1 text-base text-foreground">
            An instrument of attention: where you dwell, latent patterns
            crystallise out of pure noise and sound themselves.
          </p>
          <p className="mt-2 text-base text-violet-300">
            Move your attention over the field — where you dwell, patterns emerge.
          </p>
        </header>

        <div className="relative overflow-hidden rounded-xl border border-violet-400/20 bg-black">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${FIELD_W} ${FIELD_H}`}
            className="h-auto w-full touch-none select-none"
            role="img"
            aria-label="A dark field of drifting points in which constellations are recognised."
            onPointerMove={(e) => onPointer(e.clientX, e.clientY)}
            onPointerDown={(e) => onPointer(e.clientX, e.clientY)}
          >
            <defs>
              <radialGradient id="apx-bg" cx="50%" cy="42%" r="75%">
                <stop offset="0%" stopColor="#141026" />
                <stop offset="100%" stopColor="#050409" />
              </radialGradient>
              <filter id="apx-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="3.2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x="0" y="0" width={FIELD_W} height={FIELD_H} fill="url(#apx-bg)" />

            {/* noise field */}
            <g fill="#c9c4e8">
              {fieldRef.current.map((p, i) => (
                <circle
                  key={p.id}
                  ref={(el) => {
                    pointEls.current[i] = el;
                  }}
                  cx={p.bx}
                  cy={p.by}
                  r={2.3}
                  opacity={0.22}
                />
              ))}
            </g>

            {/* recognised signs */}
            <g filter="url(#apx-glow)">
              {signs.map((s) => {
                const ref = ensureSignRef(s.id);
                ref.dots = [];
                return (
                  <g
                    key={s.id}
                    ref={(el) => {
                      ensureSignRef(s.id).g = el;
                    }}
                    opacity={0}
                  >
                    <polyline
                      ref={(el) => {
                        ensureSignRef(s.id).poly = el;
                      }}
                      fill="none"
                      stroke="#c4b5fd"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points=""
                    />
                    {s.indices.map((pi, j) => (
                      <circle
                        key={j}
                        ref={(el) => {
                          const r = ensureSignRef(s.id);
                          r.dots[j] = el;
                        }}
                        r={4.2}
                        fill="#ede9fe"
                        stroke="#a78bfa"
                        strokeWidth={1}
                      />
                    ))}
                  </g>
                );
              })}
            </g>

            {/* attention locus */}
            <g ref={locusGroupRef} opacity={0}>
              <circle
                r={ATTENTION_RADIUS}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth={0.8}
                opacity={0.18}
              />
              <circle
                ref={dwellArcRef}
                r={26}
                fill="none"
                stroke="#c4b5fd"
                strokeWidth={3}
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 26}
                strokeDashoffset={2 * Math.PI * 26}
                transform="rotate(-90)"
                opacity={0}
              />
              <circle r={4} fill="#ede9fe" />
              <line x1={-11} y1={0} x2={11} y2={0} stroke="#c4b5fd" strokeWidth={1} opacity={0.7} />
              <line x1={0} y1={-11} x2={0} y2={11} stroke="#c4b5fd" strokeWidth={1} opacity={0.7} />
            </g>
          </svg>

          {/* pre-Begin overlay */}
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 backdrop-blur-[1px]">
              <p className="max-w-sm px-6 text-center text-base text-foreground">
                The field is pure noise — nothing is drawn yet. Begin, then let
                your attention find the signs hiding in it.
              </p>
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] rounded-full bg-violet-500/90 px-6 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-400"
              >
                Begin
              </button>
            </div>
          )}

          {/* status chips */}
          {phase === "live" && (
            <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
              <span className="rounded-full bg-violet-500/20 px-3 py-1 text-sm text-violet-200">
                signs recognised · {signCount}
              </span>
              {idleHint && (
                <span className="rounded-full bg-black/60 px-3 py-1 text-sm text-violet-300/95">
                  hunting on its own — move to take over
                </span>
              )}
            </div>
          )}
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-base text-muted-foreground">
            Pointer or touch to aim; keys{" "}
            <code className="rounded bg-muted px-1 text-violet-200">A…;</code>{" "}
            sweep, arrows nudge, <span className="text-foreground">space</span>{" "}
            recognises, <span className="text-foreground">X</span> lets one go.
          </p>
          <button
            type="button"
            onClick={() => setNotesOpen((v) => !v)}
            className="ml-auto min-h-[44px] rounded-full border border-border px-4 py-2.5 text-base text-foreground transition-colors hover:bg-accent"
          >
            {notesOpen ? "Hide notes" : "Design notes"}
          </button>
        </div>

        {reduced && (
          <p className="mt-3 text-base text-violet-300/95">
            Reduced-motion is on — the field drifts gently and signs bloom softly.
          </p>
        )}
        {error && <p className="mt-3 text-base text-violet-300">{error}</p>}

        {notesOpen && (
          <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-muted p-5">
            {renderNotes(NOTES_MD)}
          </div>
        )}
      </div>

      <PrototypeNav slugs={["1396-apophenia-field"]} />
    </main>
  );
}
