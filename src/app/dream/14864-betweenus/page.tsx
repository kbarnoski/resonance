"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { prefersReducedMotion } from "../_shared/visionary/safeFlicker";

// ─────────────────────────────────────────────────────────────────────────────
// BETWEEN US — a relational instrument. Two browser contexts (two tabs / two
// devices on the same origin) each become ONE presence: a soft point of light
// dragged around a shared circular field. Each presence loops one of Karel's
// real piano takes. The music lives in the DISTANCE between them:
//   far → the two voices sit detuned apart, a slow gentle beating, no bloom.
//   near → presence B's pitch glides to lock into a just major third above A,
//          and a third "between" layer blooms — the summed voices routed through
//          a shared convolution reverb whose wet gain rises as the two meet.
// Cross-context sync is genuine and server-less via BroadcastChannel. A solo
// reviewer is met by a drifting "ghost" partner so the full harmony is always
// demonstrable; the ghost yields the instant a real partner heartbeat arrives.
// Lineage: The Hub / the League of Automatic Music Composers — the first
// computer-network band — music that exists between networked players.
// ─────────────────────────────────────────────────────────────────────────────

const CHANNEL = "resonance-betweenus";

// Presence hues (art layer — hsl allowed here, chrome uses semantic tokens).
const HUE_A = { h: 158, s: 72, l: 58 }; // sea-green — the local presence
const HUE_B = { h: 322, s: 70, l: 62 }; // magenta-rose — the partner presence

// Two DISTINCT real takes, one per presence.
const TRACK_A = REAL_TRACKS[0]; // Interplay
const TRACK_B = REAL_TRACKS[2]; // Welcome Home

const SPREAD_CENTS = 8; // how far apart the voices detune when far
const LOCK_CENTS = 386; // just major third (5:4) — the consonance B glides into
const MAX_WET = 0.55; // ceiling of the "between" bloom's wet send

const PARTNER_TTL = 2500; // ms a real partner is trusted after its last packet
const GHOST_AFTER = 3000; // ms of solitude before a ghost drifts in
const POS_THROTTLE = 30; // ms between outgoing position packets
const BEAT_EVERY = 1000; // ms between heartbeat packets

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Presence positions live in normalized "field" coordinates: a unit disk of
// radius 0.5 centered at (0.5, 0.5). Device-independent, so a phone and a
// laptop agree on where each light sits and how far apart they are.
interface Pt {
  x: number;
  y: number;
}

// Keep a point inside the field disk (radius 0.5 about the center).
function clampToField(p: Pt): Pt {
  const dx = p.x - 0.5;
  const dy = p.y - 0.5;
  const r = Math.hypot(dx, dy);
  if (r <= 0.5) return p;
  const k = 0.5 / r;
  return { x: 0.5 + dx * k, y: 0.5 + dy * k };
}

// Normalized separation of the two presences, 0 (touching) … 1 (opposite rims).
function fieldDistance(a: Pt, b: Pt): number {
  return clamp(Math.hypot(a.x - b.x, a.y - b.y), 0, 1);
}

// A short decaying-noise impulse response — a reverb KERNEL, not synthesized
// music. This is the only synthesis in the piece and it never reaches the
// speakers on its own; it only colors the summed real takes.
function makeImpulseResponse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const ir = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return ir;
}

type Status = "idle" | "waiting" | "ghost" | "two";

interface PacketPos {
  type: "pos";
  id: string;
  x: number;
  y: number;
}
interface PacketBeat {
  type: "beat";
  id: string;
}
type Packet = PacketPos | PacketBeat;

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export default function BetweenUsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  // audio
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const voiceARef = useRef<Voice | null>(null);
  const voiceBRef = useRef<Voice | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const audioLiveRef = useRef(false);
  const freqBufRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // presence state
  const selfIdRef = useRef<string>("");
  const selfPosRef = useRef<Pt>({ x: 0.33, y: 0.5 });
  const realPartnerRef = useRef<{ pos: Pt; lastSeen: number } | null>(null);
  const partnerPosRef = useRef<Pt>({ x: 0.67, y: 0.5 }); // resolved (real or ghost)
  const bcRef = useRef<BroadcastChannel | null>(null);
  const lastSentRef = useRef(0);
  const lastBeatRef = useRef(0);

  const reducedRef = useRef(false);
  const energyRef = useRef(0); // smoothed analyser energy 0..1
  const distRef = useRef(1);

  // chrome (throttled — never set per frame)
  const [status, setStatus] = useState<Status>("idle");
  const [audioLive, setAudioLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noCanvas, setNoCanvas] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({ dist: 1, wet: 0 });
  const statusRef = useRef<Status>("idle");

  // ── begin: build audio inside the user gesture ─────────────────────────────
  const begin = useCallback(async () => {
    if (audioLiveRef.current || loading) return;
    setLoading(true);
    setError(null);
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      const master = createSafeMaster(ctx, { gain: 0.5 });

      // Load both real takes in parallel.
      const [a, b] = await Promise.all([
        loadRealTrackBuffer(ctx, TRACK_A.id),
        loadRealTrackBuffer(ctx, TRACK_B.id),
      ]);

      // Shared wet "between" bus: sum of both voices → convolver → wetGain → master.
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulseResponse(ctx, 2.4);
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0;
      convolver.connect(wetGain);
      wetGain.connect(master.input);

      const makeVoice = (buf: AudioBuffer, level: number): Voice => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const gain = ctx.createGain();
        gain.gain.value = level;
        src.connect(gain);
        gain.connect(master.input); // dry
        gain.connect(convolver); // send into the shared between-bus
        src.start();
        return { src, gain };
      };

      audioCtxRef.current = ctx;
      masterRef.current = master;
      wetGainRef.current = wetGain;
      voiceARef.current = makeVoice(a.buffer, 0.62);
      voiceBRef.current = makeVoice(b.buffer, 0.62);
      freqBufRef.current = new Uint8Array(
        new ArrayBuffer(master.analyser.frequencyBinCount),
      );

      audioLiveRef.current = true;
      setAudioLive(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? `Could not load Karel's takes (${e.message}). The visuals still run silently.`
          : "Could not load audio. The visuals still run silently.",
      );
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // ── mount: canvas, BroadcastChannel, render loop ───────────────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    selfIdRef.current = Math.random().toString(36).slice(2, 10);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) {
      setNoCanvas(true);
      return;
    }
    ctx2dRef.current = g;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: rect.width, h: rect.height };
    };
    resize();
    window.addEventListener("resize", resize);

    // ── pointer: drag the local presence around the field ────────────────────
    const fieldGeom = () => {
      const { w, h } = sizeRef.current;
      const R = Math.min(w, h) * 0.4;
      return { cx: w / 2, cy: h / 2, R };
    };
    const setSelfFromPointer = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const { cx, cy, R } = fieldGeom();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const nx = 0.5 + (px - cx) / (R * 2);
      const ny = 0.5 + (py - cy) / (R * 2);
      selfPosRef.current = clampToField({ x: nx, y: ny });
    };
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      setSelfFromPointer(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      setSelfFromPointer(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ── BroadcastChannel: genuine cross-context presence sync, no server ──────
    let bc: BroadcastChannel | null = null;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      bc = new BroadcastChannel(CHANNEL);
      bcRef.current = bc;
      bc.onmessage = (ev: MessageEvent<Packet>) => {
        const m = ev.data;
        if (!m || m.id === selfIdRef.current) return;
        const now = performance.now();
        if (m.type === "pos") {
          realPartnerRef.current = {
            pos: clampToField({ x: m.x, y: m.y }),
            lastSeen: now,
          };
        } else if (m.type === "beat") {
          const prev = realPartnerRef.current;
          realPartnerRef.current = {
            pos: prev?.pos ?? { x: 0.5, y: 0.5 },
            lastSeen: now,
          };
        }
      };
    }

    // ── main loop ─────────────────────────────────────────────────────────────
    const start = performance.now();
    let prev = start;

    const frame = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const t = (now - start) / 1000;

      // Resolve the partner: a live real partner wins; otherwise, after a beat
      // of solitude, a ghost drifts a slow Lissajous path around the field.
      const real = realPartnerRef.current;
      const realAlive = real !== null && now - real.lastSeen < PARTNER_TTL;
      let partner: Pt;
      let nextStatus: Status;
      if (realAlive && real) {
        partner = real.pos;
        nextStatus = "two";
      } else if (now - start > GHOST_AFTER) {
        // ghost path (clamped into the disk)
        partner = clampToField({
          x: 0.5 + 0.34 * Math.sin(0.19 * t + 0.6),
          y: 0.5 + 0.34 * Math.sin(0.27 * t + 2.1),
        });
        nextStatus = "ghost";
      } else {
        partner = partnerPosRef.current;
        nextStatus = "waiting";
      }
      partnerPosRef.current = partner;

      if (nextStatus !== statusRef.current) {
        statusRef.current = nextStatus;
        setStatus(nextStatus);
      }

      // Broadcast our own position + heartbeat.
      if (bc) {
        if (now - lastSentRef.current > POS_THROTTLE) {
          lastSentRef.current = now;
          const p = selfPosRef.current;
          bc.postMessage({
            type: "pos",
            id: selfIdRef.current,
            x: p.x,
            y: p.y,
          } satisfies Packet);
        }
        if (now - lastBeatRef.current > BEAT_EVERY) {
          lastBeatRef.current = now;
          bc.postMessage({
            type: "beat",
            id: selfIdRef.current,
          } satisfies Packet);
        }
      }

      // Distance → consonance.
      const d = fieldDistance(selfPosRef.current, partner);
      distRef.current += (d - distRef.current) * 0.15; // smoothed
      const near = 1 - distRef.current;

      // Analyser energy (for the bloom + glow pulse).
      let energy = 0;
      const analyser = masterRef.current?.analyser;
      const buf = freqBufRef.current;
      if (audioLiveRef.current && analyser && buf) {
        analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i];
        energy = sum / (buf.length * 255);
      }
      energyRef.current += (energy - energyRef.current) * 0.2;

      // Apply audio: detune spread/lock + wet bloom.
      const ctx = audioCtxRef.current;
      if (audioLiveRef.current && ctx) {
        const dd = distRef.current;
        const detuneA = SPREAD_CENTS * dd; // far: sharp, near: 0
        const detuneB = -SPREAD_CENTS * dd + LOCK_CENTS * near; // far: flat, near: +third
        voiceARef.current?.src.detune.setTargetAtTime(
          detuneA,
          ctx.currentTime,
          0.15,
        );
        voiceBRef.current?.src.detune.setTargetAtTime(
          detuneB,
          ctx.currentTime,
          0.15,
        );
        const wet = MAX_WET * Math.pow(near, 1.5);
        wetGainRef.current?.gain.setTargetAtTime(wet, ctx.currentTime, 0.2);
      }

      // throttled readout (~6/s)
      if (Math.floor(t * 6) !== Math.floor((t - dt) * 6)) {
        setReadout({
          dist: distRef.current,
          wet: MAX_WET * Math.pow(near, 1.5),
        });
      }

      drawScene(
        g,
        sizeRef.current,
        selfPosRef.current,
        partner,
        distRef.current,
        energyRef.current,
        nextStatus,
        reducedRef.current,
        t,
      );

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      if (bc) bc.close();
      bcRef.current = null;
      try {
        voiceARef.current?.src.stop();
        voiceBRef.current?.src.stop();
      } catch {
        /* already stopped */
      }
      masterRef.current?.disconnect();
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      masterRef.current = null;
      voiceARef.current = null;
      voiceBRef.current = null;
      wetGainRef.current = null;
      audioLiveRef.current = false;
    };
  }, []);

  const statusText: Record<Status, string> = {
    idle: "press begin to bring your presence in",
    waiting: "waiting for another…",
    ghost: "a ghost drifts with you",
    two: "two present",
  };

  const consonance =
    readout.dist < 0.18
      ? "locked — a third blooms between"
      : readout.dist < 0.5
        ? "drawing together"
        : "detuned apart";

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="A shared field of two soft lights. Drag your light near the other and a third resonance blooms between them."
      />

      {/* hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            a relational instrument
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Between Us
          </h1>
          <p className="mt-1 max-w-md text-base text-muted-foreground">
            A chord that can only complete when two people are present — drag
            your light toward the other and the music blooms in the space
            between you.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!audioLive ? (
              <button
                type="button"
                onClick={begin}
                disabled={loading}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? "Loading…" : "Begin"}
              </button>
            ) : (
              <span className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 py-3 font-mono text-xs text-muted-foreground">
                sound live · {statusText[status]}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
          {error && (
            <p className="mt-2 max-w-md text-base text-destructive">{error}</p>
          )}
          {noCanvas && (
            <p className="mt-2 max-w-md text-base text-destructive">
              Canvas2D is unavailable in this browser, so the field can&apos;t be
              drawn.
            </p>
          )}
        </div>
      </div>

      {/* readout */}
      <div className="pointer-events-none absolute right-5 top-5 z-10 sm:right-8 sm:top-8">
        <div className="rounded-lg border border-border bg-background/70 px-4 py-3 text-right backdrop-blur-sm">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {statusText[status]}
          </div>
          <div className="mt-1 font-mono text-3xl font-semibold tabular-nums text-foreground">
            {(1 - readout.dist).toFixed(2)}
          </div>
          <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            nearness · between {(readout.wet / MAX_WET).toFixed(2)}
          </div>
          <div className="mt-0.5 font-mono text-xs text-muted-foreground/80">
            {consonance}
          </div>
        </div>
      </div>

      {/* hint */}
      <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
          drag your light · open a second tab to meet a real partner
        </p>
      </div>

      {/* design-notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Between Us — design notes
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              The question: what if a chord could only complete when TWO people
              are present — a relational instrument where the music lives
              between two listeners, not conducted by either one?
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Each browser context is one presence looping one of Karel&apos;s
              real piano takes. Two contexts find each other over a server-less{" "}
              <span className="font-mono text-xs">BroadcastChannel</span>. Field
              distance drives consonance: far, the voices detune apart into slow
              beating; near, presence B glides up into a just major third and a
              third layer blooms — both takes summed through a shared convolution
              reverb whose wet gain rises as you meet. Alone, a drifting ghost
              partner stands in until a real heartbeat arrives.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Lineage: <span className="text-foreground">The Hub</span> and the
              League of Automatic Music Composers — the first computer-network
              band (1970s–80s) — music that exists between networked players.
            </p>
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

      <PrototypeNav slugs={["14864-betweenus"]} />
    </main>
  );
}

// ── canvas rendering (art layer) ─────────────────────────────────────────────
function drawScene(
  g: CanvasRenderingContext2D,
  size: { w: number; h: number },
  self: Pt,
  partner: Pt,
  dist: number,
  energy: number,
  status: Status,
  reduced: boolean,
  t: number,
) {
  const { w, h } = size;
  if (w === 0 || h === 0) return;
  const R = Math.min(w, h) * 0.4;
  const cx = w / 2;
  const cy = h / 2;

  // field → screen
  const toScreen = (p: Pt) => ({
    x: cx + (p.x - 0.5) * R * 2,
    y: cy + (p.y - 0.5) * R * 2,
  });

  // gentle trail on a near-black ground (no strobe — slow luminance only)
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(6, 7, 10, 0.34)";
  g.fillRect(0, 0, w, h);

  // field ring
  g.strokeStyle = "rgba(200, 210, 225, 0.10)";
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.stroke();

  const near = clamp(1 - dist, 0, 1);
  const pulse = reduced ? 0 : 0.5 + 0.5 * Math.sin(t * 1.4);
  const eGlow = 0.5 + 0.5 * energy;

  const a = toScreen(self);
  const b = toScreen(partner);

  g.globalCompositeOperation = "lighter";

  // filament between the two when near
  if (near > 0.05) {
    const grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, `hsla(${HUE_A.h}, ${HUE_A.s}%, ${HUE_A.l}%, ${0.5 * near})`);
    grad.addColorStop(0.5, `hsla(50, 30%, 96%, ${0.6 * near})`);
    grad.addColorStop(1, `hsla(${HUE_B.h}, ${HUE_B.s}%, ${HUE_B.l}%, ${0.5 * near})`);
    g.strokeStyle = grad;
    g.lineWidth = 1 + 3 * near;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  }

  // the two presence glows
  const glowR = R * (0.34 + 0.05 * energy);
  drawGlow(g, a.x, a.y, glowR * (0.95 + 0.1 * pulse), HUE_A, 0.5 * eGlow);
  drawGlow(g, b.x, b.y, glowR * (0.95 + 0.1 * pulse), HUE_B, 0.5 * eGlow);

  // the between-bloom: a white-hot core at the midpoint, sized by nearness×energy
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const bloom = near * (0.35 + 0.65 * energy);
  if (bloom > 0.02) {
    const r = R * (0.12 + 0.5 * bloom);
    const grd = g.createRadialGradient(mid.x, mid.y, 0, mid.x, mid.y, r);
    grd.addColorStop(0, `hsla(48, 40%, 99%, ${clamp(0.85 * bloom, 0, 0.95)})`);
    grd.addColorStop(0.4, `hsla(48, 45%, 96%, ${0.4 * bloom})`);
    grd.addColorStop(1, "hsla(48, 45%, 96%, 0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(mid.x, mid.y, r, 0, Math.PI * 2);
    g.fill();
  }

  g.globalCompositeOperation = "source-over";

  // solid presence dots + a faint ghost ring so the partner reads as "other"
  drawDot(g, a.x, a.y, HUE_A);
  drawDot(g, b.x, b.y, HUE_B);
  if (status === "ghost") {
    g.strokeStyle = `hsla(${HUE_B.h}, ${HUE_B.s}%, ${HUE_B.l}%, 0.5)`;
    g.lineWidth = 1;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.arc(b.x, b.y, 14, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
}

function drawGlow(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  hue: { h: number; s: number; l: number },
  alpha: number,
) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, `hsla(${hue.h}, ${hue.s}%, ${hue.l}%, ${alpha})`);
  grd.addColorStop(0.5, `hsla(${hue.h}, ${hue.s}%, ${hue.l}%, ${alpha * 0.35})`);
  grd.addColorStop(1, `hsla(${hue.h}, ${hue.s}%, ${hue.l}%, 0)`);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function drawDot(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  hue: { h: number; s: number; l: number },
) {
  g.fillStyle = `hsla(${hue.h}, ${hue.s}%, ${hue.l}%, 0.9)`;
  g.beginPath();
  g.arc(x, y, 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = `hsla(${hue.h}, ${hue.s}%, 92%, 0.95)`;
  g.beginPath();
  g.arc(x, y, 4, 0, Math.PI * 2);
  g.fill();
}
