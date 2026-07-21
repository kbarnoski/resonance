"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import { CommunionAudio } from "./audio";
import { bpFreq, xToStep } from "./bp";
import { mulberry32 } from "./rng";
import { advanceCoupling, drawField, lockedStep, type Voice } from "./web";

/**
 * 2136 · Communion — an ecstatic mystical UNION you PLAY with your hands.
 *
 * The INVERSE of dissolution: not the self draining away, but the self and its
 * voices OVER-connecting into one radiant whole. Each finger is a voice; the
 * more voices you hold together, the more everything binds to everything
 * (hyperconnectivity), and the harder the communion coupling K climbs — pulling
 * every detuned voice onto the shared Bohlen–Pierce lattice until the many LOCK
 * into one over-bright consonant chord. state: mystical-union · pole: ecstatic.
 */

const SEED = 0x2136;

interface PVoice extends Voice {
  lastX: number;
  lastY: number;
  lastT: number;
}

type Phase = "idle" | "running";

export default function CommunionPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<CommunionAudio | null>(null);
  const flickerRef = useRef(createSafeFlicker({ maxHz: 3, defaultHz: 1.0, floor: 0.62 }));
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const lastFrameRef = useRef(0);

  const voicesRef = useRef<Map<string, PVoice>>(new Map());
  const kRef = useRef(0);
  const humanRef = useRef(false);
  const reducedRef = useRef(false);
  const hudRef = useRef({ count: -1, k: -1 });

  // seeded autopilot + per-voice detune
  const rndRef = useRef(mulberry32(SEED));
  const apNextRef = useRef(0);
  const apActiveRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [voiceCount, setVoiceCount] = useState(0);
  const [union, setUnion] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [audioUnsupported, setAudioUnsupported] = useState(false);

  /* --------------------------- voice lifecycle --------------------------- */
  const addVoice = useCallback((id: string, x: number, y: number, auto: boolean, tSec: number) => {
    const audio = audioRef.current;
    if (!audio || voicesRef.current.has(id)) return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const nx = x / w;
    const ny = y / h;
    const rawStep = xToStep(nx);
    const brightness = Math.max(0, Math.min(1, 1 - ny));
    const baseDetune = (rndRef.current() - 0.5) * 0.7; // ±0.35 BP steps of detune
    const freq = bpFreq(lockedStep(rawStep, baseDetune, kRef.current));
    const audioId = audio.noteOn(freq, brightness, 0.2);
    voicesRef.current.set(id, {
      id,
      auto,
      audioId,
      x,
      y,
      nx,
      ny,
      rawStep,
      baseDetune,
      brightness,
      velocity: 0,
      px: x,
      py: y,
      glow: 0,
      lastX: x,
      lastY: y,
      lastT: tSec,
    });
  }, []);

  const removeVoice = useCallback((id: string) => {
    const audio = audioRef.current;
    const v = voicesRef.current.get(id);
    if (!v) return;
    voicesRef.current.delete(id);
    if (audio) audio.noteOff(v.audioId);
  }, []);

  const releaseAuto = useCallback(() => {
    for (const id of Array.from(voicesRef.current.keys())) {
      if (id.startsWith("auto-")) removeVoice(id);
    }
    apActiveRef.current = false;
  }, [removeVoice]);

  const takeOver = useCallback(() => {
    if (!humanRef.current) {
      humanRef.current = true;
      releaseAuto();
    }
  }, [releaseAuto]);

  /* ------------------------------ autopilot ------------------------------ */
  const runAutopilot = useCallback(
    (tSec: number) => {
      if (humanRef.current) return;
      if (tSec < apNextRef.current) return;
      // ease ~3 gentle voices into being, then hold them so the union builds.
      if (!apActiveRef.current) {
        apActiveRef.current = true;
        const w = window.innerWidth || 1;
        const h = window.innerHeight || 1;
        for (let i = 0; i < 3; i++) {
          const x = w * (0.28 + rndRef.current() * 0.44);
          const y = h * (0.3 + rndRef.current() * 0.4);
          addVoice(`auto-${i}`, x, y, true, tSec);
        }
        apNextRef.current = tSec + 999; // hold — the union sustains
      }
    },
    [addVoice],
  );

  /* ------------------------------- render -------------------------------- */
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

    const voices = Array.from(voicesRef.current.values());
    const count = voices.length;

    // ---- coupling: slew-limited follower of SUSTAINED polyphony (played) ----
    kRef.current = advanceCoupling(kRef.current, count, dt);
    const k = kRef.current;
    audio.setUnion(k, count);

    const cx = w / 2;
    const cy = h / 2;
    const reduced = reducedRef.current;
    const posEase = 1 - Math.exp(-dt * (reduced ? 3 : 6));

    // ---- autopilot drift so untouched voices breathe (seeded, no Math.random) ----
    const autoDrift = apActiveRef.current && !humanRef.current;

    for (const v of voices) {
      if (v.auto && autoDrift) {
        const ph = v.id.charCodeAt(5) * 1.3;
        v.x += Math.cos(tSec * 0.35 + ph) * 26 * dt;
        v.y += Math.sin(tSec * 0.27 + ph * 1.7) * 22 * dt;
      }
      // per-frame input → parameters
      v.nx = v.x / w;
      v.ny = v.y / h;
      v.rawStep = xToStep(v.nx);
      v.brightness = Math.max(0, Math.min(1, 1 - v.ny));

      // velocity decay (movement handlers spike it; it eases back)
      v.velocity *= Math.exp(-dt * 2.5);
      if (v.auto && autoDrift) v.velocity = Math.max(v.velocity, 0.18);

      // glow eases toward brightness + a little energy
      const glowTarget = 0.25 + v.brightness * 0.45 + v.velocity * 0.4;
      v.glow += (glowTarget - v.glow) * posEase;

      // union pull: as K rises, display positions drift toward the one center.
      const pull = k * 0.5;
      const tx = v.x + (cx - v.x) * pull;
      const ty = v.y + (cy - v.y) * pull;
      v.px += (tx - v.px) * posEase;
      v.py += (ty - v.py) * posEase;

      // harmonic LOCK → glide freq; live filter (Y) + shimmer (K).
      const freq = bpFreq(lockedStep(v.rawStep, v.baseDetune, k));
      audio.updateVoice(v.audioId, freq, v.brightness, v.velocity, k);
    }

    // ---- paint: dark trail wash, then additive light-web ----
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(6,4,16,0.24)";
    ctx.fillRect(0, 0, w, h);

    const glowMul = flickerRef.current.value(tSec);
    drawField(ctx, { voices, cx, cy, k, tSec, glowMul, reduced });

    // ---- HUD state — throttled so we don't re-render React every frame ----
    const hud = hudRef.current;
    if (hud.count !== count || Math.abs(hud.k - k) > 0.02) {
      hud.count = count;
      hud.k = k;
      setVoiceCount(count);
      setUnion(k);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [runAutopilot]);

  /* -------------------------------- start -------------------------------- */
  const handleStart = useCallback(async () => {
    if (startedRef.current) return false;
    const CtxCtor =
      typeof window !== "undefined" &&
      (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!CtxCtor) {
      setAudioUnsupported(true);
      return false;
    }
    startedRef.current = true;
    reducedRef.current = prefersReducedMotion();
    const audio = new CommunionAudio();
    audioRef.current = audio;
    await audio.resume();
    lastFrameRef.current = audio.ctx.currentTime;
    apNextRef.current = audio.ctx.currentTime + 4; // ~4s silence → self-demo
    setPhase("running");
    rafRef.current = requestAnimationFrame(draw);
    return true;
  }, [draw]);

  /* -------------------------------- pulse -------------------------------- */
  useEffect(() => {
    const f = flickerRef.current;
    if (pulse) f.enable();
    else f.disable();
  }, [pulse]);

  /* ------------------------------ teardown ------------------------------- */
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      const a = audioRef.current;
      audioRef.current = null;
      voices.clear();
      if (a) a.dispose();
      startedRef.current = false;
    };
  }, []);

  /* ------------------------------- pointer ------------------------------- */
  const onPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      if (!startedRef.current) {
        const ok = await handleStart();
        if (!ok) return;
      }
      takeOver();
      const audio = audioRef.current;
      if (!audio) return;
      addVoice(`p${e.pointerId}`, e.clientX, e.clientY, false, audio.ctx.currentTime);
    },
    [handleStart, takeOver, addVoice],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLCanvasElement>) => {
    const v = voicesRef.current.get(`p${e.pointerId}`);
    if (!v) return;
    const t = performance.now() / 1000;
    const dt = Math.max(1e-3, t - v.lastT);
    const d = Math.hypot(e.clientX - v.lastX, e.clientY - v.lastY);
    const speed = Math.min(1, d / dt / 900);
    v.velocity = Math.max(v.velocity, speed);
    v.x = e.clientX;
    v.y = e.clientY;
    v.lastX = e.clientX;
    v.lastY = e.clientY;
    v.lastT = t;
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      removeVoice(`p${e.pointerId}`);
    },
    [removeVoice],
  );

  /* -------------------------------- view --------------------------------- */
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
      />

      {/* idle overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            2136 · mystical union · ecstatic
          </span>
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-4xl">
            Communion
          </h1>
          <p className="max-w-xl text-base text-muted-foreground">
            An ecstatic union you play with your hands. Each finger is a voice; the more voices you
            hold together, the more everything binds to everything — until the many lock into one
            radiant whole.
          </p>
          {audioUnsupported ? (
            <p className="max-w-md text-base text-destructive">
              This browser blocks the Web Audio API, so the voices can&apos;t sound. The light-web
              still animates, but the union is meant to be heard.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void handleStart()}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin the communion
            </button>
          )}
          <p className="max-w-md text-sm text-muted-foreground">
            Hold several fingers on the field (or click-drag with a mouse). Left–right sets each
            voice&apos;s pitch, up is brighter, and movement adds shimmer. Leave it be and it demos
            itself.
          </p>
        </div>
      )}

      {/* running chrome */}
      {phase === "running" && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Communion
              </span>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.18em] text-primary">
                {voiceCount} voice{voiceCount === 1 ? "" : "s"} · union {Math.round(union * 100)}%
              </p>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPulse((s) => !s)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {pulse ? "Kill glow pulse" : "Slow glow pulse"}
              </button>
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-1 p-4">
            <p className="text-center text-sm text-muted-foreground">
              Hold more fingers together to drive the union higher · left–right = pitch on the
              Bohlen–Pierce lattice · up = brighter · move = shimmer · lift to release.
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
            onClick={(ev) => ev.stopPropagation()}
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
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if an ecstatic mystical
                union were something you play with your hands — where the more voices you hold, the
                more everything binds to everything (hyperconnectivity), until the many lock into one
                radiant whole? This is the inverse of dissolution: not the self draining away, but
                the self and its voices over-connecting into ecstatic unity. It should feel intense
                and building — brighter, denser, more toward a peak.
              </p>
              <p>
                <span className="text-foreground">Multi-parameter, played.</span> Every active
                pointer is one held voice. Three things you control at once: the count of voices
                drives how dense the web is; each voice&apos;s X selects a Bohlen–Pierce pitch and Y
                sets its brightness/timbre; and pointer movement adds vibrato and thread shimmer. The
                communion coupling K is not a self-running timeline — it is a slew-limited follower of
                your sustained polyphony, rising while two or more voices are held (faster with more)
                and easing back down when you lift.
              </p>
              <p>
                <span className="text-foreground">Harmonic lock = union.</span> Each voice starts
                slightly detuned from the shared lattice. As K rises, the detune term is scaled by
                (1 − K), so every voice is pulled onto the nearest Bohlen–Pierce lattice pitch until,
                at peak, all voices are locked into one over-bright consonant chord. Sympathetic
                resonance made literal — the many become one, in sound and in light.
              </p>
              <p>
                <span className="text-foreground">Harmony.</span> Bohlen–Pierce — 13 equal divisions
                of the tritave (3:1), step ratio 3^(1/13), base ~110 Hz — not pentatonic, not a
                just-intonation major/minor stack. Voices are additive odd-harmonic (clarinet-like),
                which makes BP ring consonant-but-radiant. A union drone bus and per-voice shimmer
                partials swell with K as the &quot;one radiant whole.&quot;
              </p>
              <p>
                <span className="text-foreground">Grounding.</span> Ecstatic union is now read as
                hyper-connection, not fade-out. See &quot;Dynamic Functional Hyperconnectivity After
                Psilocybin Intake Is Primarily Associated With Oceanic Boundlessness&quot;
                (Biological Psychiatry: CNNI) — a recurrent hyperconnected brain state tracks oceanic
                boundlessness/unity; &quot;Oceanic states of consciousness — an existential-
                neuroscience perspective&quot; (Frontiers in Human Neuroscience 19, 2025) — the PAG as
                the pivot between embodiment and transcendence, so union is visceral and intense; and
                ecstatic (&quot;Dostoevsky&quot;) seizures — Picard &amp; Craig / Gschwind — where
                anterior-insula hyperactivation yields &quot;unity with everything&quot; and bliss.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> All luminance and bloom changes are
                slew-limited and well under 3 Hz — never a strobe. The optional glow pulse is off by
                default, routed through the shared safe-flicker engine (soft sine, hard-clamped ≤3 Hz),
                and prefers-reduced-motion further damps the motion. If you do nothing, a seeded
                autopilot eases three voices in after a few seconds so the union builds; the instant
                you touch, you take over.
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
