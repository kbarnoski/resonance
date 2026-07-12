"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  NODES,
  BONDS,
  nearestNode,
  reduceToTritave,
  playFreqNear,
  TRITAVE_CENTS,
} from "./tuning";
import { createLatticeAudio, type LatticeAudio } from "./audio";

// ── Lattice geometry (plane px, before responsive scale) ─────────────────────
const SPACING = 94;
const planePos = NODES.map((n) => ({ x: n.a * SPACING, y: -n.b * SPACING }));
const PLANE_TILT = 50; // deg — tabletop rake of the whole lattice

// Keys 0..12 for the no-mic fallback.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "q", "w", "e"];

function fmtCents(c: number): string {
  const r = Math.round(c);
  return `${r > 0 ? "+" : ""}${r}`;
}

export default function SingLatticePage() {
  const [started, setStarted] = useState(false);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [scale, setScale] = useState(1);
  const [, forceTick] = useState(0);

  const reduced = useMemo(() => prefersReducedMotion(), []);

  const audioRef = useRef<LatticeAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);

  // Per-node energy (how brightly it is ringing right now).
  const energyRef = useRef<Float32Array>(new Float32Array(NODES.length));
  // Live detection state, kept in a ref so the rAF closure is stable.
  const liveRef = useRef<{
    freq: number;
    clarity: number;
    snap: number;
    dev: number;
    voiced: boolean;
  }>({ freq: -1, clarity: 0, snap: -1, dev: 0, voiced: false });
  const lastRungRef = useRef<number>(-1);
  const traceHistRef = useRef<number[]>([]); // reduced-tritave cents, -1 = unvoiced

  // ── Responsive scale ──────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 520;
      const h = entries[0]?.contentRect.height ?? 480;
      setScale(Math.max(0.5, Math.min(1.05, Math.min(w / 560, h / 460))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [started]);

  // ── Ring a node (from voice or from a click/key) ──────────────────────
  const ringNode = useCallback(
    (index: number, mainFreq: number, strength: number) => {
      const audio = audioRef.current;
      const e = energyRef.current;
      e[index] = Math.min(1.5, e[index] + strength);
      audio?.pluck(mainFreq, 0.9 * strength, 0.55);
      // Sympathetic neighbours — the tarab strings answering.
      for (const nb of NODES[index].neighbours) {
        e[nb] = Math.min(1.4, e[nb] + strength * 0.5);
        const nf = playFreqNear(nb, mainFreq);
        audio?.pluck(nf, 0.34 * strength, 0.8);
      }
    },
    []
  );

  // ── Main animation / detection loop ───────────────────────────────────
  const loop = useCallback(() => {
    const audio = audioRef.current;
    const e = energyRef.current;

    // Voice tracking only runs when a mic is attached; in click/keyboard mode
    // triggerNode() owns the voice so the loop must not stomp it off.
    if (audio && audio.hasMic()) {
      const p = audio.readPitch();
      if (p && p.freq > 0 && p.clarity > 0.6) {
        const { cents } = reduceToTritave(p.freq);
        const snap = nearestNode(cents);
        const playHz = playFreqNear(snap.index, p.freq);
        const level = Math.min(1, p.rms * 6);
        audio.setVoice(playHz, true, level);
        liveRef.current = {
          freq: p.freq,
          clarity: p.clarity,
          snap: snap.index,
          dev: snap.deviation,
          voiced: true,
        };
        traceHistRef.current.push(cents);

        // Trigger sympathetic ring: on a new node, or when a held note has
        // decayed enough that the room wants re-exciting.
        const near = Math.abs(snap.deviation) < 62;
        if (near) {
          if (snap.index !== lastRungRef.current) {
            ringNode(snap.index, playHz, 0.85);
            lastRungRef.current = snap.index;
          } else if (e[snap.index] < 0.28 && p.clarity > 0.72) {
            ringNode(snap.index, playHz, 0.5);
          }
        }
      } else {
        audio.setVoice(0, false, 0);
        liveRef.current = {
          ...liveRef.current,
          voiced: false,
          clarity: p?.clarity ?? 0,
        };
        traceHistRef.current.push(-1);
        lastRungRef.current = -1;
      }
      if (traceHistRef.current.length > 240) traceHistRef.current.shift();
    }

    // Energy decay — the room slowly quiets.
    const decay = reduced ? 0.94 : 0.955;
    for (let i = 0; i < e.length; i++) e[i] *= decay;

    drawTrace();
    forceTick((t) => (t + 1) & 0xffff);
    rafRef.current = requestAnimationFrame(loop);
  }, [reduced, ringNode]);

  // ── Pitch-trace canvas (secondary visual) ─────────────────────────────
  // Function declaration (hoisted) so `loop`, defined above, can call it.
  function drawTrace() {
    const cv = traceRef.current;
    if (!cv) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;
    const W = cv.width;
    const H = cv.height;
    ctx2d.clearRect(0, 0, W, H);

    // Faint horizontal guides at each lattice node's cents.
    for (const n of NODES) {
      const y = H - (n.cents / TRITAVE_CENTS) * H;
      ctx2d.strokeStyle = "rgba(180,150,255,0.10)";
      ctx2d.beginPath();
      ctx2d.moveTo(0, y);
      ctx2d.lineTo(W, y);
      ctx2d.stroke();
    }

    const hist = traceHistRef.current;
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    let drawing = false;
    for (let i = 0; i < hist.length; i++) {
      const c = hist[i];
      const x = (i / 240) * W;
      if (c < 0) {
        drawing = false;
        continue;
      }
      const y = H - (c / TRITAVE_CENTS) * H;
      if (!drawing) {
        ctx2d.moveTo(x, y);
        drawing = true;
      } else {
        ctx2d.lineTo(x, y);
      }
    }
    ctx2d.strokeStyle = "rgba(255,196,128,0.9)";
    ctx2d.stroke();
  }

  // ── Begin ─────────────────────────────────────────────────────────────
  const begin = useCallback(
    async (withMic: boolean) => {
      const audio = createLatticeAudio();
      audioRef.current = audio;
      if (!audio) {
        setMicNotice("Web Audio is unavailable in this browser.");
      } else if (withMic) {
        const err = await audio.startMic();
        if (err) {
          setMicNotice(
            "Microphone blocked — tap or use keys 1-9 0 q w e to play the lattice instead."
          );
        }
      } else {
        setMicNotice(
          "No mic: tap a node or use keys 1-9 0 q w e. Enable the mic anytime by reloading."
        );
      }
      setStarted(true);
      if (audio && audio.ctx.state === "suspended") {
        await audio.ctx.resume().catch(() => {});
      }
      rafRef.current = requestAnimationFrame(loop);
    },
    [loop]
  );

  // ── Click / key fallback trigger ──────────────────────────────────────
  const triggerNode = useCallback(
    (index: number) => {
      const audio = audioRef.current;
      const hz = NODES[index].baseFreq;
      ringNode(index, hz, 1.0);
      // Briefly voice the snapped tone so a click always sounds pitched.
      audio?.setVoice(hz, true, 0.5);
      window.setTimeout(() => audio?.setVoice(0, false, 0), 260);
    },
    [ringNode]
  );

  useEffect(() => {
    if (!started) return;
    const onKey = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      const idx = KEYS.indexOf(k);
      if (idx >= 0) {
        triggerNode(idx);
        ev.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, triggerNode]);

  // ── Teardown ──────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  // ── Splash ────────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div className="relative flex min-h-full flex-col items-center justify-center gap-6 bg-background px-6 py-12 text-center">
        <div className="max-w-xl">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            sing lattice · bohlen–pierce
          </p>
          <h1 className="mb-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Sing into a scale that has no octave
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Hum or sing into the mic. Your voice is tracked and snapped onto a{" "}
            <span className="text-primary">Bohlen–Pierce</span> lattice — a
            13-tone scale that repeats not at the octave but at the{" "}
            <span className="text-primary">tritave</span> (3:1), built on odd
            harmonics. Every node you land on lights up, glides a tone to meet
            you, and rings its harmonic neighbours sympathetically until the room
            blooms into a strange, gorgeous chord.
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <button
            onClick={() => void begin(true)}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Enable mic &amp; sing
          </button>
          <button
            onClick={() => void begin(false)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Just tap the lattice
          </button>
        </div>

        <p className="max-w-md text-sm text-muted-foreground">
          Best with headphones. Hold a steady vowel to find and sustain the
          intervals — the &quot;wrongness&quot; is the instrument.
        </p>

        <button
          onClick={() => setShowNotes(true)}
          className="absolute bottom-4 right-4 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Read the design notes ↗
        </button>

        {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}
      </div>
    );
  }

  // ── Instrument ────────────────────────────────────────────────────────
  const live = liveRef.current;
  const snapNode = live.snap >= 0 ? NODES[live.snap] : null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      {/* Top bar */}
      <div className="z-10 flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/70 px-4 py-2.5 backdrop-blur-sm">
        <span className="text-xl font-semibold tracking-tight text-foreground">
          Sing Lattice
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          bohlen–pierce · 13 tones / tritave
        </span>
      </div>

      {/* 3-D lattice stage */}
      <div
        ref={stageRef}
        className="relative flex-1 select-none overflow-hidden"
        style={{ perspective: "1100px" }}
      >
        {/* warm radial wash that intensifies as the room fills with energy */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-500"
          style={{
            background:
              "radial-gradient(circle at 50% 44%, rgba(255,150,60,0.10), rgba(20,10,30,0) 60%)",
          }}
        />

        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transformStyle: "preserve-3d",
            transform: `translate(-50%,-50%) scale(${scale}) rotateX(${PLANE_TILT}deg)`,
          }}
        >
          {/* Bonds — the harmonic edges (±5 horizontal, ±7 depth). */}
          {BONDS.map((bond, bi) => {
            const p1 = planePos[bond.i];
            const p2 = planePos[bond.j];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const glow = Math.max(
              energyRef.current[bond.i],
              energyRef.current[bond.j]
            );
            return (
              <div
                key={`b${bi}`}
                className="absolute left-1/2 top-1/2 origin-center"
                style={{
                  width: len,
                  height: 2,
                  transform: `translate(-50%,-50%) translate(${mx}px, ${my}px) rotate(${ang}deg)`,
                  background:
                    bond.axis === "five"
                      ? `rgba(255,190,120,${0.1 + glow * 0.5})`
                      : `rgba(190,150,255,${0.1 + glow * 0.5})`,
                  boxShadow: glow > 0.15 ? `0 0 8px rgba(255,180,120,${glow * 0.5})` : "none",
                }}
              />
            );
          })}

          {/* Nodes */}
          {NODES.map((n, i) => {
            const pos = planePos[i];
            const e = Math.min(1.5, energyRef.current[i]);
            const isSnap = live.voiced && live.snap === i;
            const pop = e * 46 + (isSnap ? 10 : 0);

            // Warm amber (low) → luminous violet (high energy).
            const t = Math.min(1, e / 1.2);
            const r = Math.round(255 - 70 * t);
            const g = Math.round(180 - 60 * t);
            const b = Math.round(90 + 165 * t);
            const alpha = 0.32 + 0.6 * Math.min(1, e);
            const glow = 12 + e * 46;
            const nodeScale = 1 + e * 0.16 + (isSnap ? 0.06 : 0);

            return (
              <button
                key={n.step}
                onClick={() => triggerNode(i)}
                className="absolute left-1/2 top-1/2"
                style={{
                  transformStyle: "preserve-3d",
                  transform: `translate(-50%,-50%) translate(${pos.x}px, ${pos.y}px)`,
                }}
                aria-label={`Node ${n.label}, ratio ${n.num}/${n.den}`}
              >
                <span
                  className="flex items-center justify-center rounded-full border text-center"
                  style={{
                    width: 62,
                    height: 62,
                    transform: `translateZ(${pop}px) rotateX(${-PLANE_TILT}deg) scale(${nodeScale})`,
                    transformStyle: "preserve-3d",
                    borderColor: `rgba(${r},${g},${b},${0.4 + 0.5 * Math.min(1, e)})`,
                    background: `radial-gradient(circle at 50% 38%, rgba(${r},${g},${b},${alpha}), rgba(${r},${g},${b},${alpha * 0.25}))`,
                    boxShadow: isSnap
                      ? `0 0 ${glow}px rgba(${r},${g},${b},0.8), 0 0 0 2px rgba(255,235,200,0.7)`
                      : `0 0 ${glow}px rgba(${r},${g},${b},${0.3 + e * 0.5})`,
                    transition: "box-shadow 0.12s linear, border-color 0.12s linear",
                  }}
                >
                  <span className="flex flex-col items-center leading-none">
                    <span
                      className="text-lg font-semibold"
                      style={{ color: `rgba(255,248,238,${0.55 + 0.45 * Math.min(1, e + 0.2)})` }}
                    >
                      {n.label}
                    </span>
                    <span className="mt-0.5 font-mono text-[8px] text-muted-foreground">
                      {n.num}/{n.den}
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* corner hint */}
        <div className="pointer-events-none absolute left-3 top-3 flex select-none items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background: live.voiced ? "rgb(255,196,128)" : "rgba(160,140,200,0.5)",
            }}
          />
          {audioRef.current?.hasMic()
            ? live.voiced
              ? "hearing your voice"
              : "sing or hum a steady tone"
            : "tap nodes · keys 1-9 0 q w e"}
        </div>
      </div>

      {/* Readout + pitch trace */}
      <div className="z-10 flex-shrink-0 border-t border-border bg-background/70 px-4 py-3 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-mono text-sm">
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">voice</span>
            <span className="text-lg text-foreground">
              {live.voiced && live.freq > 0 ? `${live.freq.toFixed(1)} Hz` : "—"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">node</span>
            <span className="text-lg text-primary">
              {live.voiced && snapNode ? snapNode.label : "—"}
            </span>
            {live.voiced && snapNode && (
              <span className="text-muted-foreground">
                {snapNode.num}/{snapNode.den}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-muted-foreground">cents</span>
            <span
              className={
                live.voiced && Math.abs(live.dev) < 20
                  ? "text-foreground"
                  : "text-primary"
              }
            >
              {live.voiced ? `${fmtCents(live.dev)}¢` : "—"}
            </span>
          </div>
          <div className="flex min-w-[120px] items-center gap-2">
            <span className="text-muted-foreground">clarity</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-150"
                style={{
                  width: `${Math.round(Math.max(0, live.clarity) * 100)}%`,
                  background:
                    "linear-gradient(90deg, rgba(255,180,120,0.8), rgba(190,150,255,0.95))",
                }}
              />
            </span>
          </div>
        </div>

        <div className="mt-2 flex items-end gap-3">
          <canvas
            ref={traceRef}
            width={640}
            height={46}
            className="h-[46px] w-full rounded border border-border bg-black/30"
          />
          <button
            onClick={() => setShowNotes(true)}
            className="shrink-0 pb-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            notes ↗
          </button>
        </div>
      </div>

      {micNotice && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-md bg-background/90 px-4 py-2 text-center text-sm text-destructive shadow-lg">
          {micNotice}
        </div>
      )}

      {showNotes && <DesignNotes onClose={() => setShowNotes(false)} />}

      <PrototypeNav slugs={["1502-sing-lattice"]} />
    </div>
  );
}

// ── Design-notes overlay ─────────────────────────────────────────────────────
function DesignNotes({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
          Bohlen–Pierce, and why it sounds strange
        </h2>
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Western tuning repeats at the <span className="text-primary">octave</span>{" "}
            (2:1) and divides it into 12. The Bohlen–Pierce scale, found by Heinz
            Bohlen and independently John Pierce in the 1970s–80s, throws the
            octave away: it repeats at the <span className="text-primary">tritave</span>{" "}
            (3:1) and divides that into 13. Because the period is an odd number,
            BP consonance is built on <em>odd</em> harmonics — its signature
            chord is 3:5:7, and the synth voice here uses an odd-harmonic timbre
            to match.
          </p>
          <p>
            The nodes are the just &quot;Lambda&quot; BP ratios. Every ratio
            factors into 3·5·7 only, so — quotienting out the tritave — each
            pitch has a place on a 2-D <span className="text-primary">harmonic
            lattice</span> (an Erv-Wilson idea): the horizontal axis is the prime
            5, the depth axis is the prime 7. Lattice neighbours are each other&apos;s
            nearest consonances, which is why a struck node wakes them
            sympathetically, like a sitar&apos;s tarab strings.
          </p>
          <p>
            Your voice is tracked by <span className="text-primary">autocorrelation</span>{" "}
            (McLeod&apos;s normalized square-difference) on the raw time-domain
            samples — robust against the octave errors an FFT peak makes on a
            vowel. It snaps to the nearest node, glides a tone to meet you, and
            plucks a real Karplus–Strong string there and at its neighbours.
          </p>
          <p className="text-xs">
            Extends this lab&apos;s <span className="text-primary">1408-wolf-ring</span>{" "}
            (one &quot;wrong&quot; interval as a landmark) into a whole scale you
            get to be wrong in. See also Sevish&apos;s Scale Workshop. Full cents
            table and honest notes in the folder README.
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Close
        </button>
      </div>
    </div>
  );
}
