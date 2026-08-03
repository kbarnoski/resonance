"use client";

// ── Incubator ────────────────────────────────────────────────────────────────
// An autonomous dream-director drifts a lone visitor through the fragmentary,
// self-morphing tableaux of sleep onset (hypnagogia). The director is a
// UTILITY-AI / BLACKBOARD system: a vector of continuous DRIVES ebbs and flows,
// and every few seconds ~8 scene-archetypes are SCORED against the live drives
// (+ seeded noise − recency); the best-satisfying scene wins. A seed MOTIF
// (phrase + glyph) RECURS and TRANSFORMS whenever the returnToSeedMotif drive
// peaks — MIT Dormio's targeted dream incubation made literal.
//
// The director's own state is drawn as an overlay (drive bars, live utility
// scores, depth, scene name, motif ledger) so the whole arc reads on a SILENT
// phone. Canvas2D + Web Audio only; deterministic from mulberry32(0x5688).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DRIVE_KEYS,
  DRIVE_LABEL,
  SCENES,
  makeDirector,
  midiToFreq,
  stepDirector,
  transformLabel,
  transitionAlpha,
  type Director,
  type DrawCtx,
  type DriveKey,
  type Recurrence,
} from "./director";

type Phase = "idle" | "running" | "error";

// Snapshot mirrored into React ~5×/s for the legibility overlay.
interface Snapshot {
  drives: Record<DriveKey, number>;
  depth: number;
  t: number;
  sceneName: string;
  reason: string;
  scores: { name: string; score: number; chosen: boolean }[];
  recurrences: Recurrence[];
  jerkCount: number;
}

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  padGain: GainNode;
  filter: BiquadFilterNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  padOscs: OscillatorNode[];
  padOscGains: GainNode[];
  delay: DelayNode;
  motifBus: GainNode;
}

export default function IncubatorPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dirRef = useRef<Director | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const audioRef = useRef<AudioRig | null>(null);
  const lastAudioSceneRef = useRef<number>(-1);
  const recurGlyphRef = useRef<{ rec: Recurrence; at: number } | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [audioOn, setAudioOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);

  // ── audio ──────────────────────────────────────────────────────────────────
  const startAudio = useCallback(() => {
    if (audioRef.current) return;
    try {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const master = new GainNode(ctx, { gain: 0.0 });
      master.connect(ctx.destination);

      // gentle ambient tail
      const delay = new DelayNode(ctx, { delayTime: 0.42 });
      const fb = new GainNode(ctx, { gain: 0.34 });
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(master);

      const filter = new BiquadFilterNode(ctx, {
        type: "lowpass",
        frequency: 700,
        Q: 0.6,
      });
      filter.connect(master);
      filter.connect(delay);

      const padGain = new GainNode(ctx, { gain: 0.5 });
      padGain.connect(filter);

      // slow filter LFO (<0.2 Hz) — movement without flicker
      const lfo = new OscillatorNode(ctx, { type: "sine", frequency: 0.06 });
      const lfoGain = new GainNode(ctx, { gain: 260 });
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      lfo.start();

      const padOscs: OscillatorNode[] = [];
      const padOscGains: GainNode[] = [];
      for (let i = 0; i < 3; i++) {
        const g = new GainNode(ctx, { gain: 0.33 });
        g.connect(padGain);
        const o = new OscillatorNode(ctx, { type: "sine", frequency: 110 });
        o.connect(g);
        o.start();
        padOscs.push(o);
        padOscGains.push(g);
      }

      const motifBus = new GainNode(ctx, { gain: 0.5 });
      motifBus.connect(filter);
      motifBus.connect(delay);

      master.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 3);

      audioRef.current = {
        ctx,
        master,
        padGain,
        filter,
        lfo,
        lfoGain,
        padOscs,
        padOscGains,
        delay,
        motifBus,
      };
      lastAudioSceneRef.current = -1; // force chord update
      setAudioOn(true);
      setNotice(null);
    } catch {
      setNotice("Audio unavailable — the visual dream still runs.");
    }
  }, []);

  // update the pad chord to match the active scene
  const applyChord = useCallback((sceneIdx: number) => {
    const rig = audioRef.current;
    if (!rig) return;
    const scene = SCENES[sceneIdx];
    const now = rig.ctx.currentTime;
    const triad = [0, 2, 4];
    for (let i = 0; i < rig.padOscs.length; i++) {
      const step = scene.mode[triad[i] % scene.mode.length];
      const oct = Math.floor(triad[i] / scene.mode.length);
      const freq = midiToFreq(scene.root + step + 12 * oct);
      rig.padOscs[i].type = scene.wave;
      rig.padOscs[i].frequency.setTargetAtTime(freq, now, 1.2);
    }
  }, []);

  // play a recurrence of the seed motif in its transformed guise
  const playMotif = useCallback((rec: Recurrence, sceneIdx: number) => {
    const rig = audioRef.current;
    if (!rig) return;
    const scene = SCENES[sceneIdx];
    const base = scene.root + 12; // an octave up — bell-like
    let when = rig.ctx.currentTime + 0.05;
    const dur = 0.5 * rec.stretch;
    for (const idx of rec.degrees) {
      const len = scene.mode.length;
      const step = ((idx % len) + len) % len;
      const oct = Math.floor(idx / len);
      const shift = rec.kind === "transposed" ? rec.param : 0;
      const freq = midiToFreq(base + scene.mode[step] + 12 * oct + shift);
      const o = new OscillatorNode(rig.ctx, {
        type: rec.kind === "re-colored" ? "square" : "triangle",
        frequency: freq,
      });
      const g = new GainNode(rig.ctx, { gain: 0 });
      o.connect(g);
      g.connect(rig.motifBus);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.18, when + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
      o.start(when);
      o.stop(when + dur + 0.1);
      when += dur * 0.75;
    }
  }, []);

  // ── render + director loop ───────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNotice("Canvas2D unavailable in this browser.");
      setPhase("error");
      return;
    }

    dirRef.current = makeDirector();
    setPhase("running");

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let snapAcc = 0;

    const frame = (ts: number) => {
      const dir = dirRef.current;
      if (!dir) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.1) dt = 0.1; // clamp after tab-away
      if (dt < 0) dt = 0;

      stepDirector(dir, dt, SCENES);

      // audio follow-up (only if running)
      if (audioRef.current) {
        if (dir.sceneIdx !== lastAudioSceneRef.current) {
          applyChord(dir.sceneIdx);
          lastAudioSceneRef.current = dir.sceneIdx;
        }
        if (dir.pendingMotif) playMotif(dir.pendingMotif, dir.sceneIdx);
      }
      if (dir.pendingMotif) {
        recurGlyphRef.current = { rec: dir.pendingMotif, at: dir.t };
        dir.pendingMotif = null;
      }

      // ── paint ──
      const p = transitionAlpha(dir);
      const mk = (alpha: number): DrawCtx => ({
        t: dir.t,
        local: dir.t - dir.sceneStart,
        depth: dir.depth,
        alpha,
        glyph: dir.motif.glyph,
        assets: dir.assets,
        flash: dir.flash,
      });

      ctx.globalAlpha = 1;
      SCENES[dir.prevIdx].draw(ctx, w, h, mk(1));
      ctx.globalAlpha = p;
      SCENES[dir.sceneIdx].draw(ctx, w, h, mk(p));
      ctx.globalAlpha = 1;

      drawRecurrenceGlyph(ctx, w, h, dir, recurGlyphRef.current);
      drawVignette(ctx, w, h, dir.depth);

      // throttle overlay updates
      snapAcc += dt;
      if (snapAcc >= 0.2) {
        snapAcc = 0;
        const scores = dir.lastScores.map((s, i) => ({
          name: s.name,
          score: s.score,
          chosen: i === dir.sceneIdx,
        }));
        setSnap({
          drives: { ...dir.drives },
          depth: dir.depth,
          t: dir.t,
          sceneName: SCENES[dir.sceneIdx].name,
          reason: dir.reason,
          scores,
          recurrences: dir.recurrences.slice(-6).reverse(),
          jerkCount: dir.jerkCount,
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [applyChord, playMotif]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      const rig = audioRef.current;
      if (rig) {
        try {
          rig.master.gain.cancelScheduledValues(rig.ctx.currentTime);
          rig.ctx.close();
        } catch {
          /* ignore */
        }
        audioRef.current = null;
      }
    };
  }, []);

  const mmss = (s: number) => {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, "0")}`;
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* ── hero ─────────────────────────────────────────────────────────── */}
      {!audioOn && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-center px-6 pt-10 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream lab · hypnagogia
          </p>
          <h1 className="mt-3 max-w-xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Incubator
          </h1>
          <p className="mt-3 max-w-md text-base text-muted-foreground">
            A dream-director with shifting wants drifts you through sleep-onset
            tableaux — and keeps being pulled back to a seeded theme.
          </p>
          <button
            type="button"
            onClick={startAudio}
            className="pointer-events-auto mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin the drift
          </button>
          <p className="mt-2 text-xs text-muted-foreground/70">
            The visual arc is already running — sound needs one tap.
          </p>
        </div>
      )}

      {/* ── design notes trigger ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {notice && (
        <p className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-md border border-border bg-background/70 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
          {notice}
        </p>
      )}

      {/* ── legibility overlay: the director's own state ─────────────────── */}
      {snap && (
        <>
          {/* left: drives + depth */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 w-[200px] rounded-lg border border-border bg-background/55 p-3 backdrop-blur-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Drives
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {mmss(snap.t)}
              </span>
            </div>
            <div className="mt-2 space-y-1.5">
              {DRIVE_KEYS.map((k) => (
                <Bar
                  key={k}
                  label={DRIVE_LABEL[k]}
                  value={snap.drives[k]}
                  hot={snap.reason === k}
                />
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                depth
              </span>
              <span className="font-mono text-[10px] text-muted-foreground/70">
                {snap.depth < 0.33
                  ? "drowsy"
                  : snap.depth < 0.7
                    ? "drifting"
                    : "near sleep"}
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
              <div
                className="h-full rounded-full bg-primary/80"
                style={{ width: `${Math.round(snap.depth * 100)}%` }}
              />
            </div>
            {snap.jerkCount > 0 && (
              <p className="mt-2 font-mono text-[10px] text-muted-foreground/70">
                hypnic jerks: {snap.jerkCount}
              </p>
            )}
          </div>

          {/* right-top: utility scores of the last decision */}
          <div className="pointer-events-none absolute right-4 top-20 z-10 w-[210px] rounded-lg border border-border bg-background/55 p-3 backdrop-blur-sm">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Last decision
            </span>
            <p className="mt-1 text-sm text-foreground">
              {snap.sceneName}
            </p>
            <p className="text-xs text-muted-foreground">
              won on{" "}
              <span className="text-primary">
                {DRIVE_LABEL[snap.reason as DriveKey] ?? snap.reason}
              </span>
            </p>
            <div className="mt-2 space-y-1">
              {snap.scores.length === 0 && (
                <p className="text-xs text-muted-foreground/70">
                  scoring…
                </p>
              )}
              {snap.scores
                .slice()
                .sort((a, b) => b.score - a.score)
                .slice(0, 5)
                .map((s) => (
                  <ScoreRow key={s.name} name={s.name} score={s.score} chosen={s.chosen} />
                ))}
            </div>
          </div>

          {/* right-bottom: motif ledger */}
          <div className="pointer-events-none absolute bottom-4 right-4 z-10 w-[210px] rounded-lg border border-border bg-background/55 p-3 backdrop-blur-sm">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Motif ledger
            </span>
            {snap.recurrences.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground/70">
                the seed theme is building…
              </p>
            ) : (
              <ol className="mt-1.5 space-y-1">
                {snap.recurrences.map((r) => (
                  <li
                    key={r.index}
                    className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span className="text-primary">#{r.index + 1}</span>
                    <span className="flex-1 truncate">{transformLabel(r)}</span>
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      {mmss(r.t)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}

      {/* ── design notes modal ───────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">Incubator</span> answers one
                question: can a dream feel <em>purposeful</em> — a mind with
                shifting wants — rather than a random walk?
              </p>
              <p>
                The director is a{" "}
                <span className="text-foreground">
                  utility-AI / blackboard
                </span>{" "}
                system. A blackboard of continuous drives (seek calm, seek
                novelty, return to seed, deepen, settle) ebbs and flows. Every
                few seconds all eight scene-archetypes are scored against the
                live drive vector — weighted by a rising{" "}
                <span className="text-foreground">depth</span>, plus seeded noise
                and a recency penalty — and the best-satisfying scene wins. You
                can watch the scores and see <em>why</em> each scene was chosen.
              </p>
              <p>
                A seed <span className="text-foreground">motif</span> (a short
                phrase + glyph, fixed at load) recurs whenever the
                &ldquo;return to seed&rdquo; drive peaks on its slow incubation
                cycle — each time in a transformed guise (transposed, inverted,
                stretched, re-colored, retrograde). This is MIT Dormio&rsquo;s{" "}
                <span className="text-foreground">
                  targeted dream incubation
                </span>{" "}
                made literal: a dream that is <em>about</em> something and keeps
                returning to it.
              </p>
              <p>
                Everything self-runs deterministically from a fixed seed, so a
                silent reviewer sees the whole arc with zero input. No strobe:
                only slow luminance drift and soft dissolves.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {phase === "error" && (
        <p className="absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 text-sm text-destructive">
          {notice}
        </p>
      )}
    </main>
  );
}

// ── overlay bits ──────────────────────────────────────────────────────────────
function Bar({
  label,
  value,
  hot,
}: {
  label: string;
  value: number;
  hot: boolean;
}) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span className={hot ? "text-primary" : undefined}>{label}</span>
        <span>{Math.round(value * 100)}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
        <div
          className={`h-full rounded-full ${hot ? "bg-primary" : "bg-primary/55"}`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRow({
  name,
  score,
  chosen,
}: {
  name: string;
  score: number;
  chosen: boolean;
}) {
  // scores land roughly in [-1, 3]; normalise for a bar
  const norm = Math.max(0, Math.min(1, (score + 0.5) / 3));
  return (
    <div>
      <div className="flex justify-between text-[10px]">
        <span className={chosen ? "text-primary" : "text-muted-foreground"}>
          {chosen ? "▸ " : ""}
          {name}
        </span>
        <span className="font-mono text-muted-foreground/70">
          {score.toFixed(2)}
        </span>
      </div>
      <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted/30">
        <div
          className={`h-full rounded-full ${chosen ? "bg-primary" : "bg-muted-foreground/40"}`}
          style={{ width: `${Math.round(norm * 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── canvas overlays ─────────────────────────────────────────────────────────
// The recurring motif glyph, shown for a few seconds each time it resurfaces.
function drawRecurrenceGlyph(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dir: Director,
  cur: { rec: Recurrence; at: number } | null,
): void {
  if (!cur) return;
  const age = dir.t - cur.at;
  const life = 4.5;
  if (age > life) return;
  const k = age / life;
  const alpha = Math.sin(Math.PI * k) * 0.7; // fade in + out
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = Math.min(w, h) * (0.16 + 0.06 * k);
  const flip = cur.rec.kind === "inverted" ? -1 : 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, flip);
  ctx.translate(-cx, -cy);
  const rot =
    (cur.rec.kind === "retrograde" ? -1 : 1) * dir.t * 0.15;
  drawGlyphAt(ctx, cx, cy, r, dir, rot, cur.rec.hue, alpha);
  ctx.restore();
}

function drawGlyphAt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  dir: Director,
  rot: number,
  hue: number,
  alpha: number,
): void {
  const glyph = dir.motif.glyph;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const seg = glyph.radii[i % glyph.radii.length];
    const rr =
      radius * (0.62 + 0.38 * seg) * (0.85 + 0.15 * Math.cos(a * glyph.points));
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.strokeStyle = `hsla(${hue}, 72%, 74%, ${alpha})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = `hsla(${hue}, 85%, 65%, ${alpha})`;
  ctx.shadowBlur = 22;
  ctx.stroke();
  ctx.restore();
}

// soft depth vignette (never full-screen high-contrast pulsing)
function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  depth: number,
): void {
  const g = ctx.createRadialGradient(
    w * 0.5,
    h * 0.5,
    Math.min(w, h) * 0.35,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.75,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${0.35 + depth * 0.35})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
