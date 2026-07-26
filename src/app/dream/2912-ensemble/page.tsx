"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  allFreqs,
  clamp01,
  N_STRINGS,
  playerHsl,
} from "./strings";
import { makeSynth, type SynthEngine } from "./audio";
import {
  broadcastAvailable,
  makeGhost,
  makeLoopback,
  makePeerId,
  makeWebrtc,
  webrtcAvailable,
  type Ghost,
  type NetEvent,
  type Transport,
  type WebrtcLink,
} from "./net";

// ── Geometry (SVG user units) ────────────────────────────────────────────────
const W = 1000;
const H = 620;
const PAD_X = 64;
const PAD_TOP = 46;
const PAD_BOT = 46;
const SPAN_Y = H - PAD_TOP - PAD_BOT;
const SPAN_X = W - PAD_X * 2;
const GAP = SPAN_Y / (N_STRINGS - 1);
const RIPPLE_POOL = 30;

const LOCAL = 0;
const PARTNER = 1;

const FREQS = allFreqs();

function stringY(i: number): number {
  return PAD_TOP + i * GAP;
}

// ── mutable per-string visual state ─────────────────────────────────────────
interface StringState {
  amp: number; // 0..1 vibration amplitude (visual)
  hue: number; // player index whose pluck last lit this string
  x: number; // normalised pluck position along the string
  vw: number; // visual angular frequency
  phase: number;
}

interface Ripple {
  active: boolean;
  x: number;
  y: number;
  start: number;
  hue: number;
  vel: number;
}

interface Presence {
  active: boolean;
  x: number;
  y: number;
  hue: number;
  lastSeen: number;
}

const DESIGN_NOTES = `Two people, two devices, one instrument — with no server in between.

Ensemble is a shared rack of ${N_STRINGS} plucked strings. When you drag across it you excite the field at that spot; a partner on another device hears the same pluck and sees the ripple in their own colour, and vice-versa.

The trick is that NOTHING streams audio. Only tiny control events cross the wire — {type:"pluck", stringIndex, velocity} and {type:"cursor", x, y}. Each browser re-synthesises the sound LOCALLY with a Karplus–Strong plucked string. This is the "synchronized local engine" model (Cornelljam; Chris Chafe & SoundWIRE telematic music): the payload is intent, not sound, so latency stays low and no TURN/relay is needed.

Three ways to pair, all speaking the identical event protocol:
  1. Ghost partner — a seeded virtual player joins on Start so it duets immediately, even solo.
  2. Local duet — open a second browser tab; a BroadcastChannel links the two tabs.
  3. Cross-device — copy the WebRTC invite to a second device and paste the answer back. No server.

Pitch rises smoothly with the string's position — deliberately not snapped to a tidy scale, so the field rings in free ratios.`;

export default function EnsemblePage() {
  const [phase, setPhase] = useState<"idle" | "live">("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [mode, setMode] = useState<"ghost" | "loopback" | "webrtc">("ghost");
  const [statusText, setStatusText] = useState("Ghost partner");
  const [notice, setNotice] = useState<string | null>(null);

  // WebRTC manual-SDP UI state
  const [rtcOpen, setRtcOpen] = useState(false);
  const [rtcRole, setRtcRole] = useState<"idle" | "host" | "guest">("idle");
  const [rtcOut, setRtcOut] = useState("");
  const [rtcIn, setRtcIn] = useState("");
  const [rtcHint, setRtcHint] = useState("");

  // engine refs
  const synthRef = useRef<SynthEngine | null>(null);
  const ghostRef = useRef<Ghost | null>(null);
  const ghostActiveRef = useRef(true);
  const transportRef = useRef<Transport | null>(null);
  const webrtcRef = useRef<WebrtcLink | null>(null);
  const rafRef = useRef<number | null>(null);
  const peerIdRef = useRef<string>("");

  // visual state refs
  const fieldRef = useRef<StringState[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const rippleHead = useRef(0);
  const presenceRef = useRef<Presence[]>([]);

  // DOM element pools
  const stringEls = useRef<(SVGPathElement | null)[]>([]);
  const rippleEls = useRef<(SVGCircleElement | null)[]>([]);
  const presenceEls = useRef<(SVGGElement | null)[]>([]);

  // local pointer bookkeeping
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);
  const lastStrumRef = useRef(-1);
  const lastPtrRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // ── excite: the ONE path both local input and remote events funnel through ──
  const excite = useCallback(
    (player: number, stringIndex: number, x: number, velocity: number) => {
      const synth = synthRef.current;
      if (!synth) return;
      const si = Math.max(0, Math.min(N_STRINGS - 1, stringIndex));
      const px = clamp01(x);
      // synthesise locally — this is where a peer's pluck becomes sound here
      synth.pluck(si, velocity, (px - 0.5) * 1.2);

      const f = fieldRef.current[si];
      if (f) {
        f.amp = Math.min(1, f.amp + 0.55 + velocity * 0.6);
        f.hue = player;
        f.x = px;
        f.phase = performance.now() * 0.001 * f.vw;
      }
      const r = ripplesRef.current[rippleHead.current];
      rippleHead.current = (rippleHead.current + 1) % RIPPLE_POOL;
      r.active = true;
      r.x = PAD_X + px * SPAN_X;
      r.y = stringY(si);
      r.start = performance.now();
      r.hue = player;
      r.vel = velocity;
    },
    [],
  );

  const updatePresence = useCallback(
    (player: number, x: number, y: number) => {
      const p = presenceRef.current[player];
      if (!p) return;
      p.active = true;
      p.x = clamp01(x);
      p.y = clamp01(y);
      p.lastSeen = performance.now();
    },
    [],
  );

  // remote / ghost events. Anything off the wire is drawn as the PARTNER.
  const handleRemote = useCallback(
    (ev: NetEvent, forcePartner: boolean) => {
      const player = forcePartner ? PARTNER : ev.player;
      if (ev.type === "pluck") {
        excite(player, ev.stringIndex, ev.x, ev.velocity);
      } else {
        updatePresence(player, ev.x, ev.y);
      }
    },
    [excite, updatePresence],
  );

  // ── animation loop ──────────────────────────────────────────────────────────
  const runFrame = useCallback(() => {
    const now = performance.now();

    if (ghostActiveRef.current) ghostRef.current?.tick(now);

    // strings
    for (let i = 0; i < N_STRINGS; i++) {
      const f = fieldRef.current[i];
      const el = stringEls.current[i];
      if (!f || !el) continue;
      f.amp *= 0.945;
      const y = stringY(i);
      const cxX = PAD_X + f.x * SPAN_X;
      const off =
        f.amp > 0.004
          ? Math.sin(now * 0.001 * f.vw + f.phase) * f.amp * GAP * 1.5
          : 0;
      el.setAttribute(
        "d",
        `M ${PAD_X} ${y} Q ${cxX} ${y + off} ${W - PAD_X} ${y}`,
      );
      if (f.amp > 0.02) {
        el.setAttribute("stroke", playerHsl(f.hue, 68));
        el.setAttribute("stroke-opacity", (0.28 + f.amp * 0.6).toFixed(3));
        el.setAttribute("stroke-width", (1 + f.amp * 2.6).toFixed(2));
      } else {
        el.setAttribute("stroke", "hsl(266 40% 60%)");
        el.setAttribute("stroke-opacity", "0.16");
        el.setAttribute("stroke-width", "1");
      }
    }

    // ripples
    for (let k = 0; k < RIPPLE_POOL; k++) {
      const r = ripplesRef.current[k];
      const el = rippleEls.current[k];
      if (!el) continue;
      if (!r.active) {
        el.setAttribute("r", "0");
        el.setAttribute("opacity", "0");
        continue;
      }
      const age = (now - r.start) / 1000;
      const life = 1.1;
      if (age > life) {
        r.active = false;
        el.setAttribute("opacity", "0");
        continue;
      }
      const radius = 6 + age * (60 + r.vel * 90);
      const op = (1 - age / life) * (0.32 + r.vel * 0.3);
      el.setAttribute("cx", r.x.toFixed(1));
      el.setAttribute("cy", r.y.toFixed(1));
      el.setAttribute("r", radius.toFixed(1));
      el.setAttribute("stroke", playerHsl(r.hue, 70));
      el.setAttribute("opacity", op.toFixed(3));
    }

    // presences
    for (let p = 0; p < presenceRef.current.length; p++) {
      const pr = presenceRef.current[p];
      const el = presenceEls.current[p];
      if (!el) continue;
      const fade = now - pr.lastSeen > 4000;
      if (!pr.active || fade) {
        el.setAttribute("opacity", "0");
        continue;
      }
      const cx = PAD_X + pr.x * SPAN_X;
      const cy = PAD_TOP + pr.y * SPAN_Y;
      el.setAttribute("transform", `translate(${cx.toFixed(1)} ${cy.toFixed(1)})`);
      el.setAttribute("opacity", "1");
    }

    rafRef.current = requestAnimationFrame(runFrame);
  }, []);

  // ── pointer input (local player) ────────────────────────────────────────────
  const svgPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * W;
    const svgY = ((clientY - rect.top) / rect.height) * H;
    const px = clamp01((svgX - PAD_X) / SPAN_X);
    const py = clamp01((svgY - PAD_TOP) / SPAN_Y);
    const stringIndex = Math.max(
      0,
      Math.min(N_STRINGS - 1, Math.round((svgY - PAD_TOP) / GAP)),
    );
    return { px, py, stringIndex };
  }, []);

  const emitLocalPluck = useCallback(
    (stringIndex: number, x: number, velocity: number) => {
      excite(LOCAL, stringIndex, x, velocity);
      transportRef.current?.send({
        type: "pluck",
        player: LOCAL,
        stringIndex,
        x,
        velocity,
        t: performance.now(),
      });
    },
    [excite],
  );

  const emitLocalCursor = useCallback(
    (x: number, y: number) => {
      updatePresence(LOCAL, x, y);
      transportRef.current?.send({
        type: "cursor",
        player: LOCAL,
        x,
        y,
        t: performance.now(),
      });
    },
    [updatePresence],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "live") return;
      const pt = svgPoint(e.clientX, e.clientY);
      if (!pt) return;
      draggingRef.current = true;
      lastStrumRef.current = pt.stringIndex;
      lastPtrRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      emitLocalCursor(pt.px, pt.py);
      emitLocalPluck(pt.stringIndex, pt.px, 0.7);
    },
    [phase, svgPoint, emitLocalCursor, emitLocalPluck],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== "live") return;
      const pt = svgPoint(e.clientX, e.clientY);
      if (!pt) return;
      emitLocalCursor(pt.px, pt.py);
      if (!draggingRef.current) return;

      // velocity from pointer speed
      const now = performance.now();
      const last = lastPtrRef.current;
      let vel = 0.6;
      if (last) {
        const dt = Math.max(8, now - last.t);
        const dist = Math.hypot(e.clientX - last.x, e.clientY - last.y);
        vel = Math.max(0.2, Math.min(1, dist / dt / 1.4));
      }
      lastPtrRef.current = { x: e.clientX, y: e.clientY, t: now };

      // strum: pluck each new string the drag crosses into
      if (pt.stringIndex !== lastStrumRef.current) {
        lastStrumRef.current = pt.stringIndex;
        emitLocalPluck(pt.stringIndex, pt.px, vel);
      }
    },
    [phase, svgPoint, emitLocalCursor, emitLocalPluck],
  );

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    lastStrumRef.current = -1;
    lastPtrRef.current = null;
  }, []);

  // ── init field/pool state once ──────────────────────────────────────────────
  const initState = useCallback(() => {
    fieldRef.current = Array.from({ length: N_STRINGS }, (_, i) => ({
      amp: 0,
      hue: LOCAL,
      x: 0.5,
      vw: 7 + i * 0.55,
      phase: 0,
    }));
    ripplesRef.current = Array.from({ length: RIPPLE_POOL }, () => ({
      active: false,
      x: 0,
      y: 0,
      start: 0,
      hue: LOCAL,
      vel: 0,
    }));
    presenceRef.current = Array.from({ length: 6 }, (_, p) => ({
      active: false,
      x: 0.5,
      y: 0.5,
      hue: p,
      lastSeen: 0,
    }));
    rippleHead.current = 0;
  }, []);

  // ── Start ────────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (phase === "live") return;
    initState();
    peerIdRef.current = makePeerId();
    const synth = makeSynth(FREQS);
    await synth.resume();
    synthRef.current = synth;
    ghostRef.current = makeGhost(PARTNER, (ev) => handleRemote(ev, true));
    ghostActiveRef.current = true;
    setMode("ghost");
    setStatusText("Ghost partner");
    setPhase("live");
    rafRef.current = requestAnimationFrame(runFrame);
  }, [phase, initState, handleRemote, runFrame]);

  // ── Tier 2: local duet across tabs ──────────────────────────────────────────
  const startLoopback = useCallback(() => {
    if (!broadcastAvailable()) {
      setNotice("BroadcastChannel unavailable — staying with the ghost partner.");
      return;
    }
    transportRef.current?.close();
    const t = makeLoopback({
      selfId: peerIdRef.current,
      onEvent: (ev) => handleRemote(ev, true),
      onPeer: (connected) => {
        ghostActiveRef.current = !connected;
        setStatusText(connected ? "Local duet · linked" : "Local duet · waiting");
        setNotice(
          connected
            ? null
            : "Open this page in a second tab to link the two.",
        );
      },
    });
    transportRef.current = t;
    setMode("loopback");
    ghostActiveRef.current = true; // ghost keeps the field alive until a tab links
    setStatusText("Local duet · waiting");
    setNotice("Open this page in a second tab to link the two.");
  }, [handleRemote]);

  // ── Tier 3: cross-device WebRTC (manual SDP) ────────────────────────────────
  const ensureWebrtc = useCallback((): WebrtcLink | null => {
    if (!webrtcAvailable()) {
      setNotice("WebRTC unavailable — staying with the ghost partner.");
      return null;
    }
    if (webrtcRef.current) return webrtcRef.current;
    const link = makeWebrtc({
      onEvent: (ev) => handleRemote(ev, true),
      onOpen: () => {
        ghostActiveRef.current = false;
        setMode("webrtc");
        setStatusText("Cross-device · linked");
        setRtcHint("Linked. Play — both devices hear each pluck.");
        setNotice(null);
      },
      onClose: () => {
        ghostActiveRef.current = true;
        setStatusText("Ghost partner");
      },
    });
    webrtcRef.current = link;
    transportRef.current = link;
    return link;
  }, [handleRemote]);

  const hostInvite = useCallback(async () => {
    const link = ensureWebrtc();
    if (!link) return;
    setRtcRole("host");
    setRtcHint("Generating invite…");
    const offer = await link.createInvite();
    setRtcOut(offer);
    setRtcHint("Copy this invite to the other device, then paste its answer below.");
    try {
      await navigator.clipboard.writeText(offer);
      setRtcHint("Invite copied to clipboard. Paste the other device's answer below.");
    } catch {
      // clipboard blocked — textarea still holds it
    }
  }, [ensureWebrtc]);

  const guestAnswer = useCallback(async () => {
    const link = ensureWebrtc();
    if (!link || !rtcIn.trim()) return;
    setRtcRole("guest");
    setRtcHint("Building answer…");
    try {
      const answer = await link.acceptInvite(rtcIn.trim());
      setRtcOut(answer);
      setRtcHint("Copy this answer back to the host device.");
      try {
        await navigator.clipboard.writeText(answer);
        setRtcHint("Answer copied. Paste it into the host's answer box.");
      } catch {
        // clipboard blocked
      }
    } catch {
      setRtcHint("Could not read that invite — check the pasted text.");
    }
  }, [ensureWebrtc, rtcIn]);

  const hostAcceptAnswer = useCallback(async () => {
    const link = webrtcRef.current;
    if (!link || !rtcIn.trim()) return;
    try {
      await link.acceptAnswer(rtcIn.trim());
      setRtcHint("Answer accepted — connecting…");
    } catch {
      setRtcHint("Could not read that answer — check the pasted text.");
    }
  }, [rtcIn]);

  const copyOut = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rtcOut);
      setRtcHint("Copied.");
    } catch {
      setRtcHint("Clipboard blocked — select the text and copy manually.");
    }
  }, [rtcOut]);

  // ── teardown ─────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    transportRef.current?.close();
    transportRef.current = null;
    webrtcRef.current?.close();
    webrtcRef.current = null;
    synthRef.current?.close();
    synthRef.current = null;
    ghostRef.current = null;
    setPhase("idle");
    setMode("ghost");
    setStatusText("Ghost partner");
    setNotice(null);
    setRtcOpen(false);
    setRtcRole("idle");
    setRtcOut("");
    setRtcIn("");
    setRtcHint("");
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      transportRef.current?.close();
      webrtcRef.current?.close();
      synthRef.current?.close();
    };
  }, []);

  return (
    <main className="relative min-h-screen bg-background text-foreground">
      {/* Design notes trigger */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Design notes
      </button>
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-20 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Dreams
      </Link>

      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-4 py-16">
        <header className="mb-6 max-w-2xl text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Ensemble
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Two people, two devices, one resonant instrument — no server. You
            pluck a shared rack of strings and a partner hears it in real time,
            each pluck re-synthesised locally on both ends.
          </p>
        </header>

        {phase === "idle" ? (
          <div className="mt-8 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              A seeded ghost partner joins immediately, so the field duets even
              when you are alone.
            </p>
          </div>
        ) : (
          <>
            {/* status + controls */}
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: playerHsl(PARTNER, 66) }}
                />
                <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {statusText}
                </span>
              </span>
              <button
                type="button"
                onClick={startLoopback}
                disabled={mode === "loopback"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                Local duet
              </button>
              <button
                type="button"
                onClick={() => setRtcOpen((v) => !v)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Cross-device
              </button>
              <button
                type="button"
                onClick={stop}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
            </div>

            {notice ? (
              <p className="mb-3 text-center text-sm text-muted-foreground">
                {notice}
              </p>
            ) : null}

            {/* the shared field */}
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full max-w-4xl touch-none rounded-lg border border-border bg-[hsl(266_45%_6%)]"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {/* strings */}
              {Array.from({ length: N_STRINGS }, (_, i) => (
                <path
                  key={i}
                  ref={(el) => {
                    stringEls.current[i] = el;
                  }}
                  d={`M ${PAD_X} ${stringY(i)} Q ${W / 2} ${stringY(i)} ${W - PAD_X} ${stringY(i)}`}
                  fill="none"
                  stroke="hsl(266 40% 60%)"
                  strokeOpacity={0.16}
                  strokeWidth={1}
                  strokeLinecap="round"
                />
              ))}
              {/* ripples */}
              {Array.from({ length: RIPPLE_POOL }, (_, k) => (
                <circle
                  key={k}
                  ref={(el) => {
                    rippleEls.current[k] = el;
                  }}
                  cx={0}
                  cy={0}
                  r={0}
                  fill="none"
                  strokeWidth={1.5}
                  opacity={0}
                />
              ))}
              {/* presences */}
              {Array.from({ length: 6 }, (_, p) => (
                <g
                  key={p}
                  ref={(el) => {
                    presenceEls.current[p] = el;
                  }}
                  opacity={0}
                >
                  <circle r={16} fill={playerHsl(p, 60, 0.14)} />
                  <circle r={6} fill={playerHsl(p, 68)} />
                </g>
              ))}
            </svg>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Drag across the strings to strum. You are{" "}
              <span style={{ color: playerHsl(LOCAL, 70) }}>violet</span>; your
              partner is{" "}
              <span style={{ color: playerHsl(PARTNER, 70) }}>magenta-violet</span>.
            </p>

            {/* WebRTC manual-SDP panel */}
            {rtcOpen ? (
              <div className="mt-5 w-full max-w-2xl rounded-lg border border-border bg-background/60 p-5">
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Cross-device pairing
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={hostInvite}
                    className="min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    Copy invite (host)
                  </button>
                  <button
                    type="button"
                    onClick={guestAnswer}
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Answer invite (guest)
                  </button>
                  {rtcRole === "host" ? (
                    <button
                      type="button"
                      onClick={hostAcceptAnswer}
                      className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      Accept answer
                    </button>
                  ) : null}
                </div>

                <label className="mt-4 block font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Paste from the other device
                </label>
                <textarea
                  value={rtcIn}
                  onChange={(e) => setRtcIn(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
                  placeholder="Paste invite (guest) or answer (host) here…"
                />

                {rtcOut ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <label className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                        Your {rtcRole === "guest" ? "answer" : "invite"} — send this over
                      </label>
                      <button
                        type="button"
                        onClick={copyOut}
                        className="rounded-md border border-border bg-background/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Copy
                      </button>
                    </div>
                    <textarea
                      value={rtcOut}
                      readOnly
                      rows={3}
                      className="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
                    />
                  </div>
                ) : null}

                {rtcHint ? (
                  <p className="mt-3 text-sm text-muted-foreground">{rtcHint}</p>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Design notes modal */}
      {showNotes ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              Ensemble
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {DESIGN_NOTES}
            </p>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
