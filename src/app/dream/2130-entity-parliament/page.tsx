"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { createSafeFlicker } from "../_shared/psych/safeFlicker";
import { ParliamentAudio } from "./audio";
import {
  bpFreq,
  bpPitchClass,
  KEY_DEFS,
  KEY_TO_STEP,
  midiToStep,
} from "./bp";
import { mulberry32 } from "./rng";
import {
  createParliament,
  drawBeing,
  drawGazeThreads,
  drawSharedMandala,
  pickBeing,
  runSteering,
  type Attention,
  type Being,
} from "./parliament";

/**
 * 2130 · Entity Parliament — a DMT-style entity encounter you PLAY.
 *
 * A ring of benevolent guide-beings OPEN and turn their gaze toward you as you
 * hold Bohlen–Pierce chords. How many keys you hold, which chord shape, and
 * velocity each drive different parameters. state: DMT · pole: intense-ecstatic.
 */

const BEING_COUNT = 11;
const SEED = 0x2130;

interface ActiveNote {
  voiceId: number;
  beingId: number;
  step: number;
  velocity: number;
}

type Phase = "idle" | "running";

export default function EntityParliamentPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<ParliamentAudio | null>(null);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.2, floor: 0.6 }));
  const beingsRef = useRef<Being[]>([]);
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const lastFrameRef = useRef(0);

  const activeRef = useRef<Map<string, ActiveNote>>(new Map());
  const tritaveRef = useRef(0);
  const shiftRef = useRef(false);
  const humanRef = useRef(false);
  const presenceRef = useRef(0);
  const midiAccessRef = useRef<MIDIAccess | null>(null);

  // attention locus — where the parliament looks (you). Pointer, else center.
  const attnRef = useRef<Attention>({ x: 0, y: 0 });
  const attnTargetRef = useRef<Attention>({ x: 0, y: 0 });
  const lastPointerRef = useRef(-10);

  // autopilot self-demo
  const apRnd = useRef(mulberry32(0x2130ab));
  const apNextRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const [midiConnected, setMidiConnected] = useState(false);
  const [shimmer, setShimmer] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  /* ------------------------------ note on/off ---------------------------- */
  const startNote = useCallback((token: string, step: number, velocity: number) => {
    const audio = audioRef.current;
    if (!audio || activeRef.current.has(token)) return;
    const freq = bpFreq(step, tritaveRef.current);
    const voiceId = audio.noteOn(freq, velocity);
    const being = pickBeing(beingsRef.current);
    if (being) {
      being.token = token;
      being.targetOpen = 1;
      being.velocity = velocity;
    }
    activeRef.current.set(token, {
      voiceId,
      beingId: being ? being.id : -1,
      step,
      velocity,
    });
  }, []);

  const endNote = useCallback((token: string) => {
    const audio = audioRef.current;
    const active = activeRef.current.get(token);
    if (!audio || !active) return;
    audio.noteOff(active.voiceId);
    const being = beingsRef.current.find((b) => b.id === active.beingId);
    if (being) {
      being.token = null;
      being.targetOpen = 0;
    }
    activeRef.current.delete(token);
  }, []);

  /* ----------------------------- autopilot ------------------------------- */
  const releaseAuto = useCallback(() => {
    for (const token of Array.from(activeRef.current.keys())) {
      if (token.startsWith("auto-")) endNote(token);
    }
  }, [endNote]);

  const runAutopilot = useCallback(
    (nowSec: number) => {
      if (humanRef.current) {
        if (activeRef.current.size > 0) releaseAuto();
        return;
      }
      if (nowSec < apNextRef.current) return;
      apNextRef.current = nowSec + 2.3 + apRnd.current() * 1.5;
      releaseAuto();
      // a gentle, benevolent BP cluster (Lambda-mode-ish steps)
      const pool = [0, 3, 4, 6, 7, 10, 13];
      const n = 1 + Math.floor(apRnd.current() * 3);
      const picks = new Set<number>();
      while (picks.size < n) picks.add(pool[Math.floor(apRnd.current() * pool.length)]);
      for (const step of picks) {
        startNote(`auto-${step}`, step, 0.34 + apRnd.current() * 0.16);
      }
    },
    [releaseAuto, startNote],
  );

  const takeOver = useCallback(() => {
    if (!humanRef.current) {
      humanRef.current = true;
      releaseAuto();
    }
  }, [releaseAuto]);

  /* ------------------------------ animation ------------------------------ */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const audio = audioRef.current;
    if (!canvas || !audio) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const tSec = audio.ctx.currentTime;
    let dt = tSec - lastFrameRef.current;
    if (!(dt > 0) || dt > 0.1) dt = 0.016;
    lastFrameRef.current = tSec;

    runAutopilot(tSec);

    // ---- chord analysis: many keys / which shape / velocity → parameters ----
    const notes = Array.from(activeRef.current.values());
    const count = notes.length;
    let velSum = 0;
    let minStep = Infinity;
    let maxStep = -Infinity;
    const pcs = new Set<number>();
    for (const nz of notes) {
      velSum += nz.velocity;
      pcs.add(bpPitchClass(nz.step));
      if (nz.step < minStep) minStep = nz.step;
      if (nz.step > maxStep) maxStep = nz.step;
    }
    const span = count >= 2 ? maxStep - minStep : 0;
    const foldN = Math.max(4, Math.min(13, 3 + pcs.size));

    // presence eases up while you hold voices → structure builds, presence arrives
    const presTarget = count > 0 ? Math.min(1, 0.28 + count * 0.16) : 0;
    presenceRef.current += (presTarget - presenceRef.current) * (1 - Math.exp(-dt * 1.6));
    const presence = presenceRef.current;
    audio.setPresence(presence);

    const cx = w / 2;
    const cy = h / 2;
    const ringR = Math.min(w, h) * 0.34;
    const beingR = Math.min(w, h) * 0.078;

    // attention eases toward the pointer (or drifts back to center when idle)
    if (tSec - lastPointerRef.current > 3.2) {
      attnTargetRef.current.x = cx;
      attnTargetRef.current.y = cy;
    }
    const ae = 1 - Math.exp(-dt * 5);
    attnRef.current.x += (attnTargetRef.current.x - attnRef.current.x) * ae;
    attnRef.current.y += (attnTargetRef.current.y - attnRef.current.y) * ae;

    const beings = beingsRef.current;
    for (const b of beings) b.baseR = beingR;
    runSteering(beings, cx, cy, ringR, attnRef.current, presence, dt);

    // ---- render ----
    const glowMul = flickerRef.current.value(tSec);

    // trailing wash over a near-black violet floor
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(8,4,18,0.22)";
    ctx.fillRect(0, 0, w, h);

    drawGazeThreads(ctx, beings, attnRef.current);

    // shared mandala — symmetry = chord, radius = span, brightness = presence
    const mandalaR = Math.min(w, h) * (0.12 + Math.min(1, span / 13) * 0.16 + presence * 0.06);
    const mandalaBright = presence * (0.45 + Math.min(1, velSum));
    const avgHue =
      count > 0 ? beings.reduce((s, b) => s + (b.token ? b.hue : 0), 0) / Math.max(1, count) : 0.3;
    drawSharedMandala(ctx, cx, cy, tSec, foldN, mandalaR, mandalaBright, avgHue);

    for (const b of beings) drawBeing(ctx, b, tSec, glowMul);

    // faint "you" marker at the attention locus
    ctx.globalCompositeOperation = "lighter";
    const you = ctx.createRadialGradient(
      attnRef.current.x,
      attnRef.current.y,
      0,
      attnRef.current.x,
      attnRef.current.y,
      18 + presence * 26,
    );
    you.addColorStop(0, `rgba(255,240,210,${0.1 + presence * 0.22})`);
    you.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = you;
    ctx.beginPath();
    ctx.arc(attnRef.current.x, attnRef.current.y, 18 + presence * 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    rafRef.current = requestAnimationFrame(draw);
  }, [runAutopilot]);

  /* ------------------------------- MIDI ---------------------------------- */
  const setupMidi = useCallback(() => {
    const nav = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (typeof nav.requestMIDIAccess !== "function") return;
    nav
      .requestMIDIAccess()
      .then((access) => {
        midiAccessRef.current = access;
        const wire = () => {
          let any = false;
          access.inputs.forEach((input) => {
            any = true;
            input.onmidimessage = (e: MIDIMessageEvent) => {
              const data = e.data;
              if (!data || data.length < 3) return;
              const status = data[0] & 0xf0;
              const note = data[1];
              const vel = data[2];
              if (status === 0x90 && vel > 0) {
                takeOver();
                startNote(`midi-${note}`, midiToStep(note), Math.max(0.15, vel / 127));
              } else if (status === 0x80 || (status === 0x90 && vel === 0)) {
                endNote(`midi-${note}`);
              }
            };
          });
          setMidiConnected(any);
        };
        wire();
        access.onstatechange = () => wire();
      })
      .catch(() => {
        /* no MIDI — keyboard is unaffected */
      });
  }, [startNote, endNote, takeOver]);

  /* ------------------------------- start --------------------------------- */
  const handleStart = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    beingsRef.current = createParliament(BEING_COUNT, SEED);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    attnRef.current = { x: cx, y: cy };
    attnTargetRef.current = { x: cx, y: cy };
    const audio = new ParliamentAudio();
    audioRef.current = audio;
    await audio.resume();
    lastFrameRef.current = audio.ctx.currentTime;
    apNextRef.current = audio.ctx.currentTime + 4; // ~4s of silence before self-demo
    setPhase("running");
    rafRef.current = requestAnimationFrame(draw);
    setupMidi();
  }, [draw, setupMidi]);

  /* --------------------------- keyboard events --------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shiftRef.current = true;
        return;
      }
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "x") {
        e.preventDefault();
        tritaveRef.current =
          k === "z"
            ? Math.max(-1, tritaveRef.current - 1)
            : Math.min(2, tritaveRef.current + 1);
        return;
      }
      const step = KEY_TO_STEP.get(k);
      if (step === undefined) return;
      e.preventDefault();
      if (!startedRef.current) {
        void handleStart();
        // start is async; defer the first note until audio exists
        window.setTimeout(() => {
          takeOver();
          startNote(k, step, shiftRef.current ? 0.95 : 0.72);
        }, 60);
      } else {
        takeOver();
        startNote(k, step, shiftRef.current ? 0.95 : 0.72);
      }
      setPressed((prev) => new Set(prev).add(k));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shiftRef.current = false;
        return;
      }
      const k = e.key.toLowerCase();
      if (!KEY_TO_STEP.has(k)) return;
      endNote(k);
      setPressed((prev) => {
        const next = new Set(prev);
        next.delete(k);
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [handleStart, startNote, endNote, takeOver]);

  /* ------------------------------- shimmer ------------------------------- */
  useEffect(() => {
    const f = flickerRef.current;
    if (shimmer) f.enable();
    else f.disable();
  }, [shimmer]);

  /* ------------------------------ teardown ------------------------------- */
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const access = midiAccessRef.current;
      if (access) {
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
        access.onstatechange = null;
      }
      midiAccessRef.current = null;
      const a = audioRef.current;
      audioRef.current = null;
      if (a) a.dispose();
      startedRef.current = false;
    };
  }, []);

  /* ------------------------------ pointer -------------------------------- */
  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    attnTargetRef.current.x = e.clientX;
    attnTargetRef.current.y = e.clientY;
    const a = audioRef.current;
    lastPointerRef.current = a ? a.ctx.currentTime : lastPointerRef.current;
  }, []);

  /* -------------------------------- view --------------------------------- */
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        className="absolute inset-0 h-full w-full"
      />

      {/* idle overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            2130 · DMT · intense / ecstatic
          </span>
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Entity Parliament
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            A parliament of benevolent guide-beings that open and turn their gaze toward you as you
            hold chords. Not a piece that plays itself — an instrument that responds to your hands.
          </p>
          <button
            type="button"
            onClick={() => void handleStart()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Awaken the parliament
          </button>
          <p className="max-w-md text-sm text-muted-foreground">
            Sound is blocked until you press a key — the moment you do, the beings turn toward you.
          </p>
        </div>
      )}

      {/* running chrome */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
            <div className="pointer-events-none">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Entity Parliament
              </span>
              {midiConnected && (
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  MIDI device connected · velocity is live
                </p>
              )}
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShimmer((s) => !s)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {shimmer ? "Kill glow pulse" : "Slow glow pulse"}
              </button>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Design notes
              </button>
            </div>
          </div>

          {/* always-visible key legend */}
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-2 p-4">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {KEY_DEFS.map((d) => (
                <span
                  key={d.key}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border font-mono text-xs transition-colors ${
                    pressed.has(d.key)
                      ? "border-primary bg-primary/20 text-foreground"
                      : "border-border bg-background/50 text-muted-foreground"
                  }`}
                >
                  {d.label}
                </span>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Hold keys to sound Bohlen–Pierce voices · Shift = brighter attack · Z / X shift a
              tritave · move the cursor — the beings watch where you are.
            </p>
          </div>
        </>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight">Design notes</h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-base text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if a DMT-style entity
                encounter were an instrument you play — a parliament of benevolent guide-beings that
                open and turn their gaze toward you as you hold chords? Structure builds and a
                presence arrives. This is the intense, ecstatic pole, the opposite of the self
                dissolving.
              </p>
              <p>
                <span className="text-foreground">Multi-parameter, not one knob.</span> How many
                keys you hold decides how much of the ring awakens and how far the presence swells;
                the chord shape (distinct Bohlen–Pierce pitch-classes) sets the central mandala&apos;s
                N-fold symmetry; the chord span sets its radius; velocity sets each eye&apos;s
                openness and brightness. Your cursor is the locus of attention every being steers
                its gaze toward.
              </p>
              <p>
                <span className="text-foreground">Harmony.</span> Bohlen–Pierce — 13 equal divisions
                of the tritave (3:1), step ratio 3^(1/13), not the octave. Voices are additive with a
                predominantly odd-harmonic, clarinet-like spectrum, which makes BP read
                consonant-but-alien: fitting for an &quot;other&quot; presence.
              </p>
              <p>
                <span className="text-foreground">The beings.</span> Each is a jeweled mandala-eye
                built from Klüver form-constants — tunnel rings, spiral arms, cobweb spokes, a
                lattice of gems — and a dark pupil that dilates and turns toward you (boid-like gaze
                convergence). McKenna&apos;s &quot;self-transforming machine elves&quot; churn in the
                spirals.
              </p>
              <p>
                <span className="text-foreground">Grounding.</span> Michael, Luke &amp; Robinson,
                Scientific Reports 2022 (s41598-022-11999-8) and the inhaled-DMT phenomenology corpus
                (PMC9130218): entity encounters occur in ~45.5% of DMT experiences, share consistent
                cross-subject phenomenology, skew benevolent, ~32.4% are companion/pedagogical guide
                types, and the core report is being seen and attended to by the presence — which is
                the interaction model here.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> Any glow pulse is off by default,
                routed through the shared safe-flicker engine (soft sine, hard-clamped ≤3 Hz, never a
                strobe) and honors prefers-reduced-motion. If you do nothing, a seeded autopilot
                gently sounds a few beings; the instant you press a key, you take over.
              </p>
            </div>
          </div>
        </div>
      )}

      <Link
        href="/dream"
        className="absolute bottom-3 right-3 z-10 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream lab
      </Link>
    </div>
  );
}
