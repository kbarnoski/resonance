"use client";

/**
 * 1692 · Friction Loom
 * "What if a pointer-drag gesture were a bow — dragging across strings with
 *  real stick-slip friction, giving the scratch -> pitch -> over-pressure
 *  continuum a plucked model can't?"
 *
 * Input = a continuous pointer-drag GESTURE (mouse + touch), never a
 * note-per-key or tap trigger. The pointer is the bow: its per-frame speed
 * is bow velocity/force, the nearest string is the one under the hair. Slow
 * drag -> airy surface harmonic; medium -> a singing Helmholtz tone; fast ->
 * a full bite / over-pressure scratch. Stop dragging and the string decays
 * to silence: bowed = sustained-while-bowing, gesture-articulated, NOT a
 * drone bed.
 *
 * Technique = a genuine McIntyre/Schumacher/Woodhouse (1983) stick-slip
 * bowed STRING: a digital-waveguide velocity-wave loop whose bow contact runs
 * a grip/slip friction characteristic every sample (see ./worklet-source.ts).
 * Runs in an AudioWorklet built from a Blob URL; if that is unavailable we
 * keep the visual + ghost alive and show an on-brand notice.
 *
 * Output = Canvas2D: strings that visibly vibrate with a travelling
 * Helmholtz corner, the bow path, and a live bow-force/speed + per-string
 * brightness readout. Warm rosin/wood palette inside the canvas only.
 *
 * Deterministic ghost self-demo: on mount a "ghost bow" traces a fixed
 * musical gesture derived from a FRAME COUNTER (no random/time in the music
 * path) so the loom bows itself and is never blank/silent headless. A real
 * pointer takes over instantly; release returns to the ghost.
 *
 * References: McIntyre, Schumacher & Woodhouse, "On the oscillations of
 * musical instruments" (JASA 1983); Chris Chafe, physical-model bowed
 * strings (CCRMA). Sibling contrast: 320-kids-light-loom (a kids' light toy)
 * — this is the adult gestural instrument with the real friction nonlinearity.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { WORKLET_SOURCE } from "./worklet-source";

// ── the string field (D major pentatonic, ~1.4 octaves) ────────────
type StringDef = { freq: number; name: string; hue: number };
const STRINGS: StringDef[] = [
  { freq: 293.66, name: "D4", hue: 40 }, // amber
  { freq: 329.63, name: "E4", hue: 30 },
  { freq: 369.99, name: "F#4", hue: 18 }, // rose-orange
  { freq: 440.0, name: "A4", hue: 6 },
  { freq: 493.88, name: "B4", hue: 350 }, // rose
  { freq: 587.33, name: "D5", hue: 320 }, // magenta-rose
];
const NS = STRINGS.length;

// gesture tuning
const REF_STEP = 12; // px/frame that reads as full bow speed
const BAND_FRAC = 0.5; // fraction of string spacing that counts as "on" the string

type Bow = { vel: number; force: number };

type Engine = {
  ctx: AudioContext;
  node: AudioWorkletNode;
  master: GainNode;
  url: string;
};

export default function FrictionLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [running, setRunning] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── engine + loop refs (no re-render) ────────────────────────────
  const engineRef = useRef<Engine | null>(null);
  const audioOnRef = useRef(false);
  const rafRef = useRef(0);
  const frameRef = useRef(0); // deterministic ghost frame counter
  const visClockRef = useRef(0); // purely-visual clock (ms), rAF-fed

  // bow (pointer) state, in CSS-logical canvas pixels
  const bowRef = useRef({
    live: false,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    has: false,
    speed01: 0,
    force01: 0,
    activeString: -1,
    trail: [] as { x: number; y: number; a: number }[],
  });

  // amplitude / phase state for the visuals
  const localAmpRef = useRef<Float32Array>(new Float32Array(NS));
  const workletAmpRef = useRef<Float32Array>(new Float32Array(NS));
  const phaseRef = useRef<Float32Array>(new Float32Array(NS));

  // ── start audio (requires a user gesture; resumes the context) ───
  const handleStart = useCallback(async () => {
    setRunning(true);
    if (engineRef.current) {
      try {
        await engineRef.current.ctx.resume();
      } catch {
        /* ignore */
      }
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      setAudioError("Web Audio is unavailable — showing the silent ghost loom.");
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = new AC();
      await ctx.resume();
    } catch {
      setAudioError("Could not open an audio context.");
      return;
    }
    if (!ctx.audioWorklet) {
      setAudioError(
        "AudioWorklet is unavailable — the friction model needs it; the ghost still plays visually.",
      );
      audioOnRef.current = false;
      return;
    }
    try {
      const blob = new Blob([WORKLET_SOURCE], {
        type: "application/javascript",
      });
      const url = URL.createObjectURL(blob);
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, "friction-loom-processor", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          freqs: STRINGS.map((s) => s.freq),
          couple: 0.02,
        },
      });
      node.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { type: string; amps?: Float32Array };
        if (d.type === "amps" && d.amps) workletAmpRef.current = d.amps;
      };

      // warm body EQ, then safety limiting: worklet -> LP -> compressor -> gain
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3600;
      lp.Q.value = 0.6;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.knee.value = 24;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      const master = ctx.createGain();
      master.gain.value = 0.12; // low + limited: the model cannot blow up

      node.connect(lp);
      lp.connect(comp);
      comp.connect(master);
      master.connect(ctx.destination);

      engineRef.current = { ctx, node, master, url };
      audioOnRef.current = true;
      setAudioError(null);
    } catch {
      setAudioError(
        "The friction worklet failed to load — the ghost still plays visually.",
      );
      audioOnRef.current = false;
    }
  }, []);

  // ── draw one frame ───────────────────────────────────────────────
  const drawScene = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      p: {
        W: number;
        H: number;
        t: number;
        dt: number;
        bow: (typeof bowRef)["current"];
        stringX: (i: number) => number;
        active: number;
      },
    ) => {
      const { W, H, t, dt, bow, stringX, active } = p;
      const top = 54;
      const bot = H - 64;
      const len = bot - top;

      // warm rosin/wood backdrop
      const bg = ctx.createRadialGradient(
        W * 0.5,
        H * 0.42,
        40,
        W * 0.5,
        H * 0.5,
        Math.max(W, H) * 0.75,
      );
      bg.addColorStop(0, "#1c1414");
      bg.addColorStop(0.6, "#120c0e");
      bg.addColorStop(1, "#0a0709");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const la = localAmpRef.current;
      const wa = workletAmpRef.current;
      const ph = phaseRef.current;

      // advance visual (not audio) phases — slowed to a visible rate.
      for (let i = 0; i < NS; i++) {
        ph[i] += (dt / 1000) * (3.4 + i * 0.5) * Math.PI * 2;
      }

      // strings with a travelling Helmholtz corner
      for (let i = 0; i < NS; i++) {
        const x = stringX(i);
        const s = STRINGS[i];
        const amp = Math.max(la[i], audioOnRef.current ? wa[i] : 0);
        const force = active === i ? bow.force01 : 0;
        const maxDisp = Math.min(46, (stringX(1) - stringX(0)) * 0.42);
        const A = amp * maxDisp;
        const phase = ph[i];
        const corner = 0.5 + 0.34 * Math.sin(phase); // travels along string
        const disp = A * Math.cos(phase);
        const cy = top + corner * len;
        const cx = x + disp;

        // string glow — brighter + whiter as bow force rises (scratch).
        const lift = Math.min(1, amp * 1.3);
        const light = 34 + lift * 40 + force * 22;
        const sat = 72 - force * 34; // over-pressure desaturates toward a harsh sheen
        const col = `hsl(${s.hue}, ${sat}%, ${light}%)`;

        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 6 + lift * 22;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4 + lift * 2.4;
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(cx, cy);
        ctx.lineTo(x, bot);
        ctx.stroke();
        ctx.restore();

        // nut + bridge anchors
        ctx.fillStyle = "rgba(210,180,150,0.5)";
        ctx.fillRect(x - 5, top - 3, 10, 3);
        ctx.fillRect(x - 5, bot, 10, 3);

        // per-string brightness bar + label
        const bh = 30 * amp;
        ctx.fillStyle = `hsla(${s.hue}, ${sat}%, ${Math.min(70, light + 8)}%, 0.85)`;
        ctx.fillRect(x - 2, top - 12 - bh, 4, bh);
        ctx.font = "10px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle =
          active === i ? "rgba(255,228,196,0.95)" : "rgba(200,170,150,0.45)";
        ctx.fillText(s.name, x, bot + 18);
      }

      // bow path trail
      ctx.lineCap = "round";
      for (let i = 1; i < bow.trail.length; i++) {
        const a = bow.trail[i];
        const b0 = bow.trail[i - 1];
        ctx.strokeStyle = `rgba(255,206,140,${a.a * 0.4})`;
        ctx.lineWidth = 1 + a.a * 2;
        ctx.beginPath();
        ctx.moveTo(b0.x, b0.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
      }

      // the bow itself (a short angled stroke) + rosin sparks under load
      if (bow.has) {
        const engaged = bow.speed01 > 0.02;
        const bl = 30 + bow.speed01 * 26;
        ctx.save();
        ctx.translate(bow.x, bow.y);
        ctx.rotate(-0.5);
        ctx.strokeStyle = engaged
          ? `rgba(255,${Math.round(200 - bow.force01 * 80)},150,0.9)`
          : "rgba(200,170,150,0.5)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-bl, 0);
        ctx.lineTo(bl, 0);
        ctx.stroke();
        ctx.restore();

        // over-pressure "bite" sparks — deterministic scatter (no random)
        if (engaged && bow.force01 > 0.6) {
          const n = Math.floor(bow.force01 * 6);
          for (let k = 0; k < n; k++) {
            const ang = (k / n) * Math.PI * 2 + t * 0.006;
            const r = 6 + ((k * 7) % 14);
            ctx.fillStyle = `rgba(255,190,120,${0.5 * bow.force01})`;
            ctx.fillRect(
              bow.x + Math.cos(ang) * r,
              bow.y + Math.sin(ang) * r,
              2,
              2,
            );
          }
        }
      }

      // ── on-canvas readout (bottom-left) ──────────────────────────
      ctx.textAlign = "left";
      ctx.font = "11px ui-monospace, monospace";
      const meter = (label: string, v: number, y: number, hue: number) => {
        ctx.fillStyle = "rgba(200,175,150,0.7)";
        ctx.fillText(label, 16, y);
        const bx = 96;
        const bw = 120;
        ctx.fillStyle = "rgba(255,255,255,0.08)";
        ctx.fillRect(bx, y - 8, bw, 6);
        ctx.fillStyle = `hsl(${hue}, 70%, 58%)`;
        ctx.fillRect(bx, y - 8, bw * Math.min(1, v), 6);
      };
      meter("BOW SPEED", bow.speed01, H - 34, 40);
      meter("PRESSURE", bow.force01, H - 18, 12);

      // regime label
      let regime = "— silent —";
      if (bow.speed01 > 0.02) {
        if (bow.force01 < 0.28) regime = "airy harmonic";
        else if (bow.force01 < 0.72) regime = "singing tone";
        else regime = "over-pressure bite";
      }
      ctx.font = "12px ui-monospace, monospace";
      ctx.fillStyle = "rgba(255,220,180,0.85)";
      ctx.textAlign = "right";
      ctx.fillText(regime.toUpperCase(), W - 16, H - 18);

      // ghost / live badge
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = bow.live
        ? "rgba(255,210,150,0.9)"
        : "rgba(180,155,140,0.6)";
      ctx.fillText(bow.live ? "● LIVE BOW" : "○ GHOST BOW", W - 16, 26);
    },
    [],
  );

  // ── the single animation + audio-drive loop ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let W = 0;
    let H = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(320, rect.width);
      H = Math.max(320, rect.height);
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // string x positions + hit band from current width
    const stringX = (i: number) => {
      const m = Math.max(56, W * 0.12);
      const t = NS > 1 ? i / (NS - 1) : 0.5;
      return m + t * (W - 2 * m);
    };
    const spacing = () => (W - 2 * Math.max(56, W * 0.12)) / (NS - 1);

    // ── pointer handlers: the pointer IS the bow ───────────────────
    const toLocal = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };
    const onDown = (e: PointerEvent) => {
      const b = bowRef.current;
      const p = toLocal(e.clientX, e.clientY);
      b.live = true;
      b.has = true;
      b.x = p.x;
      b.y = p.y;
      b.px = p.x;
      b.py = p.y;
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      const b = bowRef.current;
      if (!b.live) return;
      const p = toLocal(e.clientX, e.clientY);
      b.x = p.x;
      b.y = p.y;
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      const b = bowRef.current;
      b.live = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ── ghost bow: deterministic gesture from the frame counter ────
    // Slowly crosses the string field (choosing which string) while running
    // a vertical bowing stroke whose vigour rises and falls — sweeping the
    // airy -> singing -> bite continuum. NO random / time in this path.
    const ghostBow = (f: number) => {
      const cross = Math.sin(f * 0.0016); // which string, slow
      const vigor = 0.5 + 0.5 * Math.sin(f * 0.0009); // 0..1 bow vigour
      const rate = 0.03 + 0.06 * vigor; // vertical stroke speed
      const stroke = Math.sin(f * rate); // the bowing motion
      const gx01 = 0.5 + 0.42 * cross;
      const gy01 = 0.5 + (0.16 + 0.18 * vigor) * stroke;
      return { x: gx01 * W, y: gy01 * H };
    };

    let lastTs = 0;
    const frame = (ts: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dt = lastTs ? Math.min(50, ts - lastTs) : 16;
      lastTs = ts;
      visClockRef.current += dt;
      const f = frameRef.current++;

      const b = bowRef.current;
      // resolve the bow position: live pointer, else the ghost.
      if (!b.live) {
        const g = ghostBow(f);
        b.x = g.x;
        b.y = g.y;
        b.has = true;
      }

      // per-frame bow speed (any direction) -> velocity + force.
      const step = Math.hypot(b.x - b.px, b.y - b.py);
      b.px = b.x;
      b.py = b.y;
      const rawSpeed = Math.min(1.4, step / REF_STEP);
      // ease so it feels like real bow inertia, not a twitchy readout.
      b.speed01 += (rawSpeed - b.speed01) * 0.35;
      // force follows speed with a curve: light bowing barely grips (airy),
      // hard/fast bowing over-presses into a bite.
      const forceTarget = Math.min(1.3, 0.04 + b.speed01 * 1.15);
      b.force01 += (forceTarget - b.force01) * 0.2;

      // which string is under the bow?
      const band = spacing() * BAND_FRAC;
      let active = -1;
      let bestD = band;
      for (let i = 0; i < NS; i++) {
        const d = Math.abs(b.x - stringX(i));
        if (d < bestD) {
          bestD = d;
          active = i;
        }
      }
      b.activeString = active;

      // build per-string bow commands.
      const bows: Bow[] = [];
      const engaged = b.speed01 > 0.02;
      for (let i = 0; i < NS; i++) {
        if (i === active && engaged) {
          bows.push({ vel: b.speed01, force: b.force01 });
        } else {
          bows.push({ vel: 0, force: b.force01 * 0.4 });
        }
      }
      // drive the audio worklet.
      const eng = engineRef.current;
      if (eng && audioOnRef.current) {
        eng.node.port.postMessage({ type: "bow", bows });
      }

      // local visual envelope (so it stays alive with or without audio).
      const la = localAmpRef.current;
      for (let i = 0; i < NS; i++) {
        const drive = bows[i].vel > 0 ? Math.min(1, 0.25 + bows[i].vel) : 0;
        la[i] += (drive - la[i]) * (drive > la[i] ? 0.08 : 0.02);
      }

      // bow trail
      b.trail.push({ x: b.x, y: b.y, a: 1 });
      if (b.trail.length > 46) b.trail.shift();
      for (const t of b.trail) t.a *= 0.93;

      drawScene(ctx2d, {
        W,
        H,
        t: visClockRef.current,
        dt,
        bow: b,
        stringX,
        active,
      });
      return;
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── cleanup audio on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      if (eng) {
        try {
          eng.node.port.postMessage({ type: "bow", bows: [] });
          eng.node.disconnect();
          eng.master.disconnect();
          URL.revokeObjectURL(eng.url);
          void eng.ctx.close();
        } catch {
          /* ignore */
        }
        engineRef.current = null;
      }
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-5 py-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 1692 · friction loom
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Friction Loom
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          The pointer is a bow. Drag across the strings and a real stick-slip
          friction model grips and slips the string — slow for an airy harmonic,
          steady for a singing tone, hard and fast for an over-pressure bite.
          Stop, and the string decays to silence.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {!running ? (
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start bowing
          </button>
        ) : (
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Drag on the loom — release to hear the ghost bow
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowNotes((s) => !s)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showNotes ? "Hide" : "Design"} notes
        </button>
      </div>

      {audioError ? (
        <p className="text-base text-destructive">{audioError}</p>
      ) : null}

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-black">
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          style={{ display: "block" }}
        />
      </div>

      {showNotes ? (
        <section className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-4 text-base text-muted-foreground">
          <h2 className="text-base font-semibold text-foreground">
            How it works
          </h2>
          <p>
            Each string is a digital-waveguide bowed string: two velocity-wave
            delay lines terminated by a sign-inverting nut and a lossy bridge.
            At the bow contact every audio sample runs the McIntyre / Schumacher
            / Woodhouse (1983) friction law — the hair grips the string while the
            slip velocity is small and lets go as it grows, self-sustaining the
            Helmholtz corner you see travelling along the line. Bow speed sets
            loudness and brightness; bow force widens the grip and, over-pressed,
            tips it into raucous multi-slip. The six strings share a faint
            bridge cross-talk so idle strings ring sympathetically.
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            vertical drag = bowing stroke · horizontal = change string · speed =
            velocity/force
          </p>
        </section>
      ) : null}

      <PrototypeNav slugs={["1692-friction-loom"]} />
    </main>
  );
}
