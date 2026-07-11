"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  buildGrainCorpus,
  pickGrain,
  type AudioSourceKind,
  type Corpus,
} from "./audio";
import { makeRenderer, type Renderer } from "./render";
import {
  Portal,
  webrtcSupported,
  type NoteEvent,
  type PortalRole,
} from "./portal";

type Phase = "intro" | "loading" | "playing";
type ConnState = "idle" | "offering" | "answering" | "connected" | "failed";

// Concurrent grain-voice cap.
const MAX_VOICES = 18;
// Idle before the ghost remote player takes over (ms).
const GHOST_IDLE_MS = 2500;
// Min ms between two notes from the same dragging pointer.
const DRAG_INTERVAL_MS = 70;

interface ActiveVoice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

export default function PianoPortalJamPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [grainCount, setGrainCount] = useState(0);
  const [rendererKind, setRendererKind] = useState<"webgl" | "canvas2d" | null>(
    null,
  );
  const [showNotes, setShowNotes] = useState(false);
  const [ghosting, setGhosting] = useState(false);

  // ─ portal / handshake UI state ─
  const [rtcOk] = useState<boolean>(() =>
    typeof window === "undefined" ? true : webrtcSupported(),
  );
  const [conn, setConn] = useState<ConnState>("idle");
  const [role, setRole] = useState<PortalRole | null>(null);
  const [shareUrl, setShareUrl] = useState<string>("");
  const [answerToken, setAnswerToken] = useState<string>(""); // guest's outgoing
  const [pasteToken, setPasteToken] = useState<string>(""); // host's incoming
  const [copyMsg, setCopyMsg] = useState<string>("");
  const [showPortal, setShowPortal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const corpusRef = useRef<Corpus | null>(null);
  const voicesRef = useRef<ActiveVoice[]>([]);

  // renderer
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  // portal
  const portalRef = useRef<Portal | null>(null);
  const connectedRef = useRef<boolean>(false);
  const pendingOfferRef = useRef<string | null>(null);

  // ghost / idle
  const lastPointerMsRef = useRef<number>(0);
  const ghostRef = useRef<boolean>(false);
  const ghostPhaseRef = useRef<number>(0);
  const lastGhostMsRef = useRef<number>(0);
  const lastDragMsRef = useRef<number>(0);

  // ─── Play a single grain from a note-event (local or remote) ───────────────
  // `who` colors + pans it: 0 = local player (warm), 1 = remote/ghost (cool).
  const playNote = useCallback((x: number, y: number, who: 0 | 1) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const corpus = corpusRef.current;
    const buffer = bufferRef.current;
    const r = rendererRef.current;
    if (!ctx || !master || !corpus || !buffer) return;

    const gi = pickGrain(corpus.grains, x, y);
    if (gi < 0) return;
    const grain = corpus.grains[gi];
    const now = ctx.currentTime;
    const dur = 0.08 + grain.brightness * 0.06; // 80–140ms

    // voice cap: retire oldest
    if (voicesRef.current.length >= MAX_VOICES) {
      const oldest = voicesRef.current.shift();
      try {
        oldest?.gain.gain.cancelScheduledValues(now);
        oldest?.gain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
        oldest?.src.stop(now + 0.06);
      } catch {
        /* already stopped */
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 0.97 + grain.brightness * 0.06;

    const g = ctx.createGain();
    // Hann-ish window — ramp up over 45%, ramp down → clickless.
    const peak = 0.06 + grain.rms * 0.14;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + dur * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, now + dur);

    // Player 0 leans left/warm, player 1 leans right/cool, plus position.
    const posPan = (x * 2 - 1) * 0.5;
    const sidePan = who === 0 ? -0.3 : 0.3;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, posPan + sidePan));

    src.connect(g);
    g.connect(panner);
    panner.connect(master);
    src.start(now, grain.offset, dur + 0.02);
    src.stop(now + dur + 0.05);

    const voice: ActiveVoice = { src, gain: g };
    voicesRef.current.push(voice);
    src.onended = () => {
      voicesRef.current = voicesRef.current.filter((v) => v !== voice);
    };

    if (r) r.bloom({ x, y, who, born: now, energy: grain.rms });
  }, []);

  // ─── Local trigger: play it + send the event to the peer ───────────────────
  const triggerLocal = useCallback(
    (x: number, y: number) => {
      playNote(x, y, 0);
      const p = portalRef.current;
      if (p && p.connected) {
        const ev: NoteEvent = { p: 1, x, y, t: performance.now() };
        p.sendNote(ev);
      }
    },
    [playNote],
  );

  const fieldFromEvent = useCallback(
    (clientX: number, clientY: number): [number, number] => {
      const wrap = wrapRef.current;
      if (!wrap) return [0.5, 0.5];
      const rect = wrap.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      return [x, y];
    },
    [],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      lastPointerMsRef.current = performance.now();
      if (ghostRef.current) {
        ghostRef.current = false;
        setGhosting(false);
      }
      const [x, y] = fieldFromEvent(e.clientX, e.clientY);
      triggerLocal(x, y);
    },
    [fieldFromEvent, triggerLocal],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.buttons === 0 && e.pointerType === "mouse") return; // hover only
      const nowMs = performance.now();
      lastPointerMsRef.current = nowMs;
      if (ghostRef.current) {
        ghostRef.current = false;
        setGhosting(false);
      }
      if (nowMs - lastDragMsRef.current < DRAG_INTERVAL_MS) return;
      lastDragMsRef.current = nowMs;
      const [x, y] = fieldFromEvent(e.clientX, e.clientY);
      triggerLocal(x, y);
    },
    [fieldFromEvent, triggerLocal],
  );

  // ─── Begin: create + resume AudioContext inside the gesture ────────────────
  const begin = useCallback(async () => {
    setPhase("loading");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    ctxRef.current = ctx;

    // Master chain: masterGain(≤0.3) → lowpass(≤7000) → compressor → dest.
    const master = ctx.createGain();
    master.gain.value = 0.28;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6800;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 20;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);
    masterRef.current = master;

    // Load corpus: try Karel's recording, else offline fallback.
    let buffer = await fetchPianoBuffer(ctx);
    let kind: AudioSourceKind = "piano";
    if (!buffer) {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      kind = "fallback";
    }
    bufferRef.current = buffer;
    const corpus = buildGrainCorpus(buffer, kind);
    corpusRef.current = corpus;
    setGrainCount(corpus.grains.length);
    setSource(kind);

    // Build the starfield.
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (wrap && canvas) {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      const renderer = makeRenderer(canvas, rect.width, rect.height);
      rendererRef.current = renderer;
      setRendererKind(renderer.kind);
    }

    setPhase("playing");
    lastPointerMsRef.current = performance.now();
    lastFrameRef.current = performance.now();

    // ─ Render + ghost loop ─
    const loop = () => {
      const r = rendererRef.current;
      const c = ctxRef.current;
      const nowMs = performance.now();
      lastFrameRef.current = nowMs;
      const t = c ? c.currentTime : nowMs / 1000;

      // Ghost remote player: only when NO real peer is connected and idle.
      if (!connectedRef.current && nowMs - lastPointerMsRef.current > GHOST_IDLE_MS) {
        if (!ghostRef.current) {
          ghostRef.current = true;
          setGhosting(true);
        }
        ghostPhaseRef.current += 0.016;
        const p = ghostPhaseRef.current;
        // Drift a path through his recording; trigger as the cool remote player.
        if (nowMs - lastGhostMsRef.current > 150) {
          lastGhostMsRef.current = nowMs;
          const gx = 0.5 + 0.42 * Math.sin(p * 0.23);
          const gy = 0.5 + 0.34 * Math.sin(p * 0.31 + 1.1);
          playNote(
            Math.max(0, Math.min(1, gx)),
            Math.max(0, Math.min(1, gy)),
            1,
          );
        }
      }

      if (r) r.frame(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [playNote]);

  // ─── Portal: callbacks shared by host + guest ──────────────────────────────
  const makePortal = useCallback(
    (r: PortalRole): Portal => {
      return new Portal(r, {
        onState: (s) => {
          if (s === "failed" || s === "disconnected" || s === "closed") {
            if (!connectedRef.current) setConn("failed");
          }
        },
        onOpen: () => {
          connectedRef.current = true;
          setConn("connected");
          // a real peer arrived — silence the ghost
          ghostRef.current = false;
          setGhosting(false);
        },
        onClose: () => {
          connectedRef.current = false;
          setConn("failed");
        },
        onNote: (ev: NoteEvent) => {
          // remote player's grain — render locally in the cool color
          playNote(ev.x, ev.y, 1);
        },
      });
    },
    [playNote],
  );

  // ─── HOST: open a portal → build offer → shareable link ────────────────────
  const openPortal = useCallback(async () => {
    if (!rtcOk) return;
    portalRef.current?.destroy();
    const p = makePortal("host");
    portalRef.current = p;
    setRole("host");
    setConn("offering");
    setShowPortal(true);
    try {
      const token = await p.createOfferToken();
      const base = `${window.location.origin}${window.location.pathname}`;
      setShareUrl(`${base}#o=${token}`);
    } catch {
      setConn("failed");
    }
  }, [makePortal, rtcOk]);

  // ─── GUEST: auto-answer an offer found in the URL hash ──────────────────────
  const acceptOffer = useCallback(
    async (offerToken: string) => {
      if (!rtcOk) return;
      portalRef.current?.destroy();
      const p = makePortal("guest");
      portalRef.current = p;
      setRole("guest");
      setConn("answering");
      setShowPortal(true);
      try {
        const ans = await p.acceptOfferToken(offerToken);
        setAnswerToken(ans);
      } catch {
        setConn("failed");
      }
    },
    [makePortal, rtcOk],
  );

  // ─── HOST: paste the guest's return token → finish handshake ───────────────
  const submitAnswer = useCallback(async () => {
    const p = portalRef.current;
    if (!p || !pasteToken.trim()) return;
    try {
      await p.acceptAnswerToken(pasteToken.trim());
    } catch {
      setConn("failed");
    }
  }, [pasteToken]);

  // On mount: detect an offer token in the hash (guest flow).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.location.hash.match(/[#&]o=([^&]+)/);
    if (m && m[1]) {
      // wait until audio has begun before answering (need a gesture for audio,
      // but the handshake itself can proceed; we surface the panel immediately)
      setRole("guest");
      setShowPortal(true);
      // stash the token; the guest taps "Join the duet" which also begins audio
      pendingOfferRef.current = m[1];
    }
  }, []);

  // share / copy helpers
  const shareLink = useCallback(async () => {
    if (!shareUrl) return;
    const navAny = navigator as Navigator & {
      share?: (d: { url: string; title?: string }) => Promise<void>;
    };
    if (navAny.share) {
      try {
        await navAny.share({ url: shareUrl, title: "Play Karel's piano with me" });
        return;
      } catch {
        /* fall through to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyMsg("Link copied");
      setTimeout(() => setCopyMsg(""), 1800);
    } catch {
      setCopyMsg("Copy failed — select the box and copy");
      setTimeout(() => setCopyMsg(""), 2400);
    }
  }, [shareUrl]);

  const copyAnswer = useCallback(async () => {
    if (!answerToken) return;
    try {
      await navigator.clipboard.writeText(answerToken);
      setCopyMsg("Return code copied — send it to the host");
      setTimeout(() => setCopyMsg(""), 2400);
    } catch {
      setCopyMsg("Copy failed — select the box and copy");
      setTimeout(() => setCopyMsg(""), 2400);
    }
  }, [answerToken]);

  // ─── Canvas resize ─────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const wrap = wrapRef.current;
      const r = rendererRef.current;
      const c = canvasRef.current;
      if (!wrap || !c) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      if (r) r.resize(rect.width, rect.height);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [phase]);

  // ─── Teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      voices.forEach((v) => {
        try {
          v.src.stop();
        } catch {
          /* ok */
        }
      });
      voicesRef.current = [];
      portalRef.current?.destroy();
      portalRef.current = null;
      const r = rendererRef.current;
      if (r) r.destroy();
      rendererRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  // After audio begins as a guest, fire the pending answer.
  useEffect(() => {
    if (phase === "playing" && pendingOfferRef.current) {
      const tok = pendingOfferRef.current;
      pendingOfferRef.current = null;
      void acceptOffer(tok);
    }
  }, [phase, acceptOffer]);

  const connColor =
    conn === "connected"
      ? "text-violet-300"
      : conn === "failed"
        ? "text-violet-300"
        : "text-muted-foreground";
  const connLabel =
    conn === "connected"
      ? "portal open — duet live"
      : conn === "offering"
        ? "building your portal link…"
        : conn === "answering"
          ? "answering — send the return code back"
          : conn === "failed"
            ? "connection failed — try a fresh link"
            : "no peer — flying with a ghost";

  const isGuestPending = role === "guest" && phase !== "playing";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060c] text-foreground">
      <div
        ref={wrapRef}
        className="absolute inset-0"
        onPointerDown={phase === "playing" ? onPointerDown : undefined}
        onPointerMove={phase === "playing" ? onPointerMove : undefined}
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <h1 className="font-mono text-2xl text-foreground sm:text-3xl">
          Piano Portal Jam
        </h1>
        <p className="mt-2 max-w-xl text-base text-foreground">
          Open a portal to Karel&apos;s real piano and send it to a friend with
          one link. Then play it together — peer-to-peer, two constellations
          meeting.
        </p>
      </div>

      {/* Design notes link */}
      <Link
        href="#notes"
        onClick={(e) => {
          e.preventDefault();
          setShowNotes((s) => !s);
        }}
        className="pointer-events-auto absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-border bg-black/50 px-4 py-2.5 text-base text-violet-300 backdrop-blur hover:bg-accent"
      >
        Read the design notes
      </Link>

      {/* Intro / Begin */}
      {phase !== "playing" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl border border-border bg-[#0a0b16]/90 p-7 text-center">
            {isGuestPending ? (
              <>
                <p className="text-base text-foreground">
                  A friend opened a portal to Karel&apos;s piano and invited you
                  in. Tap below to start sound and join the duet — your grains
                  glow warm, theirs cool.
                </p>
                <button
                  onClick={begin}
                  disabled={phase === "loading"}
                  className="mt-6 min-h-[44px] w-full rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400 disabled:opacity-60"
                >
                  {phase === "loading" ? "Opening the portal…" : "Join the duet"}
                </button>
              </>
            ) : (
              <>
                <p className="text-base text-foreground">
                  His whole performance is loaded as a corpus of sound-grains.
                  Tap and drag the field to re-sound it. Leave it alone and a
                  ghost player drifts a duet with you. Open a portal to play it
                  with a real second phone.
                </p>
                <button
                  onClick={begin}
                  disabled={phase === "loading"}
                  className="mt-6 min-h-[44px] w-full rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400 disabled:opacity-60"
                >
                  {phase === "loading" ? "Loading his piano…" : "Enter the field"}
                </button>
              </>
            )}
            <p className="mt-4 text-base text-muted-foreground">
              Best with headphones. iOS needs this first tap to start sound.
            </p>
          </div>
        </div>
      )}

      {/* Status badges */}
      {phase === "playing" && (
        <div className="pointer-events-none absolute left-5 top-28 z-10 flex flex-col gap-2 sm:left-8">
          {source === "piano" && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-300/95">
              Karel&apos;s piano · {grainCount.toLocaleString()} grains
            </span>
          )}
          {source === "fallback" && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-300">
              live recording unavailable — fallback tone · {grainCount.toLocaleString()} grains
            </span>
          )}
          {rendererKind && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-300">
              {rendererKind === "webgl"
                ? "three.js starfield"
                : "Canvas2D field (WebGL absent)"}
            </span>
          )}
          <span
            className={`w-fit rounded-full bg-black/40 px-3 py-1.5 font-mono text-base ${connColor}`}
          >
            {connLabel}
          </span>
          {ghosting && !connectedRef.current && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-200">
              ghost duet — open a portal for a real friend
            </span>
          )}
          {!rtcOk && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-base text-violet-300">
              this browser can&apos;t open a portal — solo + ghost only
            </span>
          )}
        </div>
      )}

      {/* Portal control button (top-right under notes) */}
      {phase === "playing" && rtcOk && (
        <button
          onClick={() => {
            setShowPortal(true);
            if (conn === "idle") void openPortal();
          }}
          className="absolute right-4 top-20 z-20 min-h-[44px] rounded-full border border-violet-400/30 bg-violet-500/15 px-4 py-2.5 text-base text-violet-200 backdrop-blur hover:bg-violet-500/25"
        >
          {conn === "connected" ? "Portal open" : "Open a portal"}
        </button>
      )}

      {/* Footer hint */}
      {phase === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center px-4">
          <p className="rounded-full bg-black/45 px-4 py-2 text-center text-base text-muted-foreground backdrop-blur">
            Tap &amp; drag to play · you = warm · friend / ghost = cool
          </p>
        </div>
      )}

      {/* Portal handshake panel */}
      {showPortal && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
          onClick={() => setShowPortal(false)}
        >
          <div
            className="max-h-[86vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#0a0b16] p-6 text-base leading-relaxed text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-xl text-foreground">The portal</h2>
              <span className={`font-mono text-base ${connColor}`}>{connLabel}</span>
            </div>

            {!rtcOk && (
              <p className="mt-4 text-violet-300">
                This browser lacks WebRTC or the Compression APIs, so the portal
                can&apos;t open here. The solo + ghost duet still works.
              </p>
            )}

            {/* HOST flow */}
            {rtcOk && role !== "guest" && (
              <div className="mt-4 space-y-4">
                <p>
                  Step 1 — send this link to a friend (same room or across the
                  world). Step 2 — they&apos;ll send back a short{" "}
                  <span className="text-violet-300">return code</span>; paste it
                  below to connect.
                </p>
                {!shareUrl && (
                  <button
                    onClick={openPortal}
                    className="min-h-[44px] w-full rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400"
                  >
                    Build my portal link
                  </button>
                )}
                {shareUrl && (
                  <>
                    <textarea
                      readOnly
                      value={shareUrl}
                      className="h-20 w-full resize-none rounded-lg border border-border bg-black/40 p-3 font-mono text-base text-foreground"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      onClick={shareLink}
                      className="min-h-[44px] w-full rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400"
                    >
                      Copy / share the link
                    </button>
                    <div>
                      <p className="text-muted-foreground">
                        Paste the friend&apos;s return code here:
                      </p>
                      <textarea
                        value={pasteToken}
                        onChange={(e) => setPasteToken(e.target.value)}
                        placeholder="paste return code…"
                        className="mt-2 h-24 w-full resize-none rounded-lg border border-border bg-black/40 p-3 font-mono text-base text-foreground placeholder:text-muted-foreground/70"
                      />
                      <button
                        onClick={submitAnswer}
                        disabled={!pasteToken.trim()}
                        className="mt-2 min-h-[44px] w-full rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400 disabled:opacity-50"
                      >
                        Connect
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* GUEST flow */}
            {rtcOk && role === "guest" && (
              <div className="mt-4 space-y-4">
                <p>
                  You opened a friend&apos;s portal. Copy the{" "}
                  <span className="text-violet-300">return code</span> below and
                  send it back to them — then you&apos;re playing together.
                </p>
                {!answerToken && (
                  <p className="text-muted-foreground">Preparing your return code…</p>
                )}
                {answerToken && (
                  <>
                    <textarea
                      readOnly
                      value={answerToken}
                      className="h-28 w-full resize-none rounded-lg border border-border bg-black/40 p-3 font-mono text-base text-foreground"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <button
                      onClick={copyAnswer}
                      className="min-h-[44px] w-full rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400"
                    >
                      Copy return code
                    </button>
                  </>
                )}
              </div>
            )}

            {copyMsg && (
              <p className="mt-3 font-mono text-base text-violet-300">{copyMsg}</p>
            )}

            <button
              onClick={() => setShowPortal(false)}
              className="mt-5 min-h-[44px] w-full rounded-lg bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              {conn === "connected" ? "Back to the duet" : "Close"}
            </button>
          </div>
        </div>
      )}

      {/* Design notes panel */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82vh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#0a0b16] p-6 text-base leading-relaxed text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-mono text-xl text-foreground">Design notes</h2>
            <p className="mt-3">
              The question: what if you could open a{" "}
              <em>portal</em> to Karel&apos;s real recorded piano, send it to a
              friend with one shareable link, and then actually play it together
              — peer-to-peer, across the room or across the world?
            </p>
            <p className="mt-3">
              The elegant twist: <span className="text-violet-300">both peers
              already hold the same recording</span>. So across the WebRTC data
              channel we send only tiny note <em>events</em>{" "}
              <code>{`{p,x,y,t}`}</code> — each peer renders the other&apos;s
              grain locally from the identical corpus. Near-zero bandwidth,
              low latency, full fidelity.
            </p>
            <p className="mt-3">
              Signaling is <span className="text-violet-300">zero-server</span>:
              non-trickle ICE builds one complete SDP blob, gzip-compressed
              (native <code>CompressionStream</code>) into a base64url token
              inside a shareable URL. The guest auto-answers and returns a short
              code; the host pastes it — connected. No backend, no npm deps.
            </p>
            <p className="mt-3 text-muted-foreground">
              References: <strong>JackTrip</strong>&apos;s WebRTC work and the
              AES paper <em>&quot;Web-Based Networked Music Performances via
              WebRTC: A Low-Latency PCM Audio Solution&quot;</em> (RTCDataChannel
              + Web Audio). The corpus loader + concatenative grain engine reuse
              the lab&apos;s proven piano pattern (<code>720-paths-grainfield</code>).
            </p>
            <p className="mt-3 text-muted-foreground">
              Degrade story: no WebGL → a Canvas2D starfield (audio unaffected).
              No WebRTC / Compression APIs → solo + ghost only, with a rose
              notice. Recording fetch fails → an offline arpeggio so the corpus
              is never empty. With no peer, a ghost player auto-drifts a duet
              after ~2.5s so the screen always sounds and moves.
            </p>
            <p className="mt-3 text-violet-200">
              Honest caveat: the cross-device link is build-verified and
              correct-by-construction, but it has not been link-tested between
              two real devices in this sandbox. Symmetric/strict NATs may need a
              TURN relay (only public STUN is configured here).
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-lg bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
