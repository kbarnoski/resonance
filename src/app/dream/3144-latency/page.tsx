"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { PluckSynth } from "./audio";
import { LoopbackPeer, RtcPeer, type NetMsg, type Peer } from "./net";
import {
  BAR_MS,
  BEAT_MS,
  BPM,
  SCALE,
  SUBDIVS,
  TWO_PI,
  angleForPerf,
  drawWheel,
  mulberry32,
  pitchIndexForSubdiv,
  quantizeAngle,
  snapLatency,
  subdivAngle,
  type Mark,
} from "./wheel";

const NOTES_MD = `# Latency Canon — design notes

## The one question

What if two players turned the network lag between them into a deliberate
musical CANON — measuring the round-trip delay and snapping it to a rhythmic
subdivision so the echo reads as intentional counterpoint instead of a defect?

## How to play

Press Start (unlocks audio). A seeded partner is already playing a phrase on the
inner ring, and every note answers itself a canon-interval later — that gap IS
the measured latency, snapped to the grid. Tap anywhere on the wheel, or hit a
key, to drop your own notes on the outer ring. Tap ON a tick and your note and
its echo interlock into the ringing pattern; tap between ticks and the whole
figure frays. The stakes are rhythmic: WHEN you tap is the decision, and it can
be wrong.

Drag the latency slider to re-measure the round trip. The raw milliseconds
wobble with jitter; the snap engine locks the echo onto the nearest subdivision
(1/32 … 1/4) so the counterpoint stays legible even as the link changes.

## Invite a second device (opt-in)

"Invite a partner" opens a manual WebRTC handshake — no server. Create an offer,
send the SDP text to a friend, paste their answer back. Their taps land on the
inner ring in real time. If anything fails you stay in loopback, fully playable.

## Reference

NIME 2025, paper 69 — "Exploiting Latency in the Design of a Networked Music
Performance". Related: the ~25 ms Ensemble Performance Threshold (below which
players sync naturally, above which lag must become material), and Chafe /
CCRMA's latency-accepting networked ensembles (JackTrip). Rather than fight
delay toward zero, this piece quantizes it into canon.

## Subsystems integrated

WebRTC data channel (manual-SDP, or a seeded loopback stand-in) · a
latency measure-and-snap engine · a Web Audio pluck synth with a beat-synced
feedback delay · a Canvas2D rhythm wheel.

## Honest limits

The real two-phone path (RtcPeer) can't be exercised headless: no second
browser, and STUN/NAT traversal depends on the network. It is written
defensively and degrades to loopback on any failure, but the genuine
device-to-device canon is unverified in this sandbox. Everything reviewed here
runs through the loopback + seeded auto-partner, which is the intended demo.`;

const MARK_TTL = BAR_MS * 1.6;
const MAX_MARKS = 260;

type Phase = "idle" | "live";

interface Engine {
  ctx: AudioContext;
  synth: PluckSynth;
  perfStart: number;
  audioStart: number;
  marks: Mark[];
  fired: Set<string>;
  seed: number;
  myId: number;
  measuredRtt: number; // ms, smoothed
  loopback: LoopbackPeer;
  active: Peer;
  autoEnabled: boolean;
  lock: number; // 0..1 recent rhythmic accuracy
  raf: number;
  pingTimer: ReturnType<typeof setInterval> | null;
  readoutTimer: ReturnType<typeof setInterval> | null;
  basePhrase: number[];
}

function baseFreq(subdiv: number, band: "local" | "remote"): number {
  const f = SCALE[pitchIndexForSubdiv(subdiv)];
  return band === "remote" ? f * 0.5 : f; // partner an octave down = duet spread
}

/** The seeded auto-partner's phrase — steady groove with per-bar variation. */
function makePhrase(rng: () => number): number[] {
  const hits = new Set<number>([0, 8]);
  const cand = [2, 4, 6, 10, 12, 14, 3, 11];
  for (let k = 0; k < 4; k++) {
    hits.add(cand[Math.floor(rng() * cand.length)]);
  }
  return [...hits].sort((a, b) => a - b);
}

function phraseForBar(eng: Engine, bar: number): number[] {
  const r = mulberry32((Math.imul(eng.seed, 2654435761) ^ bar) >>> 0);
  const out = [...eng.basePhrase];
  // Occasional syncopated ghost note keeps it alive without drifting.
  if (r() < 0.5) {
    const syncop = [5, 7, 13, 15][Math.floor(r() * 4)];
    if (!out.includes(syncop)) out.push(syncop);
  }
  return out;
}

export default function Page() {
  const engineRef = useRef<Engine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latencyRef = useRef(140);

  const [phase, setPhase] = useState<Phase>("idle");
  const [latency, setLatency] = useState(140);
  const [measuredMs, setMeasuredMs] = useState(140);
  const [snapLabel, setSnapLabel] = useState("1/16");
  const [snappedMs, setSnappedMs] = useState(0);
  const [lockPct, setLockPct] = useState(0);
  const [netState, setNetState] = useState("loopback");
  const [showNotes, setShowNotes] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  // WebRTC handshake scratch state.
  const [offerSdp, setOfferSdp] = useState("");
  const [answerSdp, setAnswerSdp] = useState("");
  const [remoteSdp, setRemoteSdp] = useState("");
  const [rtcRole, setRtcRole] = useState<"none" | "offer" | "answer">("none");
  const [rtcNote, setRtcNote] = useState("");
  const rtcRef = useRef<RtcPeer | null>(null);

  const audioTimeFor = useCallback((eng: Engine, perf: number): number => {
    return eng.audioStart + (perf - eng.perfStart) / 1000;
  }, []);

  const pushMark = useCallback((eng: Engine, m: Mark) => {
    eng.marks.push(m);
    if (eng.marks.length > MAX_MARKS) eng.marks.splice(0, eng.marks.length - MAX_MARKS);
  }, []);

  // Fire an ORIGINAL note (local tap or partner) + schedule its snapped echo.
  const fireNote = useCallback(
    (
      eng: Engine,
      band: "local" | "remote",
      angleScreen: number,
      subdiv: number,
      offGrid: number,
      tPerf: number,
    ) => {
      const snap = snapLatency(eng.measuredRtt);
      const freq = baseFreq(subdiv, band);
      const panSign = band === "local" ? 1 : -1;

      pushMark(eng, {
        band,
        kind: "orig",
        angle: angleScreen,
        born: tPerf,
        ttl: MARK_TTL,
        offGrid,
      });
      eng.synth.pluck(
        freq,
        audioTimeFor(eng, tPerf),
        0.5 * (1 - 0.4 * offGrid),
        0.3 * panSign,
      );

      // The canon answer: same pitch, snapped delay later, opposite pan.
      const echoPerf = tPerf + snap.snappedMs;
      pushMark(eng, {
        band,
        kind: "echo",
        angle: angleScreen + snap.angle,
        parentAngle: angleScreen,
        born: echoPerf,
        ttl: MARK_TTL,
        offGrid,
      });
      eng.synth.pluck(
        freq,
        audioTimeFor(eng, echoPerf),
        0.34 * (1 - 0.4 * offGrid),
        -0.3 * panSign,
      );
    },
    [audioTimeFor, pushMark],
  );

  const handleMessage = useCallback(
    (eng: Engine, m: NetMsg) => {
      const now = performance.now();
      if (m.type === "pong") {
        const rtt = now - m.t;
        eng.measuredRtt = eng.measuredRtt * 0.7 + rtt * 0.3;
      } else if (m.type === "ping") {
        // A real remote pinged us — answer so THEY can measure.
        eng.active.send({ type: "pong", t: m.t, from: eng.myId });
      } else if (m.type === "tap") {
        if (m.from === eng.myId) {
          // Our own tap came back over the wire: draw the RAW (pre-snap)
          // arrival as a faint ghost — it wobbles with jitter while the
          // scheduled snapped echo stays locked to the grid.
          const elapsed = now - m.t;
          pushMark(eng, {
            band: "local",
            kind: "ghost",
            angle: m.angle + (elapsed / BAR_MS) * TWO_PI,
            born: now,
            ttl: 520,
            offGrid: m.off,
          });
        } else {
          // A real partner's original note.
          fireNote(eng, "remote", m.angle, m.subdiv, m.off, now);
        }
      }
    },
    [fireNote, pushMark],
  );

  const localTap = useCallback(
    (clientAngle?: number) => {
      const eng = engineRef.current;
      if (!eng) return;
      const now = performance.now();
      const angle =
        clientAngle !== undefined ? clientAngle : angleForPerf(now, eng.perfStart);
      const { subdiv, offGrid } = quantizeAngle(angle);
      // Update the rhythmic lock meter (dead-on = 1).
      eng.lock = eng.lock * 0.6 + (1 - offGrid) * 0.4;
      fireNote(eng, "local", angle, subdiv, offGrid, now);
      // Send over the wire so the round trip is real (loopback → ghost;
      // real peer → the partner sees your note).
      eng.active.send({
        type: "tap",
        angle,
        subdiv,
        off: offGrid,
        t: now,
        from: eng.myId,
      });
    },
    [fireNote],
  );

  const stop = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    cancelAnimationFrame(eng.raf);
    if (eng.pingTimer) clearInterval(eng.pingTimer);
    if (eng.readoutTimer) clearInterval(eng.readoutTimer);
    eng.loopback.close();
    rtcRef.current?.close();
    rtcRef.current = null;
    eng.synth.close();
    if (eng.ctx.state !== "closed") void eng.ctx.close();
    engineRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (engineRef.current) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    void ctx.resume();
    const seed = 0x3144;
    const idRng = mulberry32((seed ^ Math.floor(performance.now())) >>> 0);
    const synth = new PluckSynth(ctx, BEAT_MS);
    const loopback = new LoopbackPeer(seed);
    loopback.setLatency(latencyRef.current);

    const eng: Engine = {
      ctx,
      synth,
      perfStart: performance.now(),
      audioStart: ctx.currentTime + 0.06,
      marks: [],
      fired: new Set(),
      seed,
      myId: Math.floor(idRng() * 1e9),
      measuredRtt: latencyRef.current,
      loopback,
      active: loopback,
      autoEnabled: true,
      lock: 0,
      raf: 0,
      pingTimer: null,
      readoutTimer: null,
      basePhrase: makePhrase(mulberry32(seed)),
    };
    loopback.onMessage = (m) => handleMessage(eng, m);
    engineRef.current = eng;

    // Measure the round trip continuously.
    eng.pingTimer = setInterval(() => {
      eng.active.send({ type: "ping", t: performance.now(), from: eng.myId });
    }, 900);

    const loop = () => {
      const e = engineRef.current;
      if (!e) return;
      const now = performance.now();

      // Auto-partner scheduler (small lookahead).
      if (e.autoEnabled) {
        const startBar = Math.floor((now - e.perfStart) / BAR_MS);
        for (let b = startBar; b <= startBar + 1; b++) {
          const barStart = e.perfStart + b * BAR_MS;
          for (const sd of phraseForBar(e, b)) {
            const hitPerf = barStart + (sd / SUBDIVS) * BAR_MS;
            if (hitPerf < now - 60 || hitPerf > now + 140) continue;
            const key = `${b}:${sd}`;
            if (e.fired.has(key)) continue;
            e.fired.add(key);
            fireNote(e, "remote", subdivAngle(sd), sd, 0, hitPerf);
          }
        }
        if (e.fired.size > 512) e.fired.clear();
      }

      // Render.
      const cv = canvasRef.current;
      if (cv) {
        const g = cv.getContext("2d");
        if (g) {
          const R = Math.min(cv.width, cv.height) * 0.42;
          drawWheel(g, {
            marks: e.marks,
            now,
            playheadAngle: angleForPerf(now, e.perfStart),
            cx: cv.width / 2,
            cy: cv.height / 2,
            R,
            rL: R * 0.82,
            rR: R * 0.55,
            snapAngle: snapLatency(e.measuredRtt).angle,
            lock: e.lock,
          });
        }
      }

      e.lock *= 0.995; // decay toward silence when you stop tapping
      e.raf = requestAnimationFrame(loop);
    };
    eng.raf = requestAnimationFrame(loop);

    // Readout refresh (cheap, off the render loop).
    const readout = setInterval(() => {
      const e = engineRef.current;
      if (!e) return;
      const snap = snapLatency(e.measuredRtt);
      setMeasuredMs(Math.round(e.measuredRtt));
      setSnapLabel(snap.label);
      setSnappedMs(Math.round(snap.snappedMs));
      setLockPct(Math.round(e.lock * 100));
    }, 120);
    eng.readoutTimer = readout;

    setPhase("live");
  }, [fireNote, handleMessage]);

  // Keep loopback latency in sync with the slider.
  useEffect(() => {
    latencyRef.current = latency;
    engineRef.current?.loopback.setLatency(latency);
  }, [latency]);

  // Canvas sizing (DPR-aware).
  useEffect(() => {
    if (phase !== "live") return;
    const cv = canvasRef.current;
    if (!cv) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = cv.getBoundingClientRect();
      cv.width = Math.max(1, Math.floor(rect.width * dpr));
      cv.height = Math.max(1, Math.floor(rect.height * dpr));
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [phase]);

  // Keyboard taps.
  useEffect(() => {
    if (phase !== "live") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" || e.key.length === 1) {
        e.preventDefault();
        localTap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, localTap]);

  // Teardown on unmount.
  useEffect(() => () => stop(), [stop]);

  const onCanvasPointer = useCallback(
    () => {
      // Tap the wheel where the playhead IS (rhythmic intent), not the raw
      // pointer angle — clicking is a trigger, timing is what matters.
      localTap();
    },
    [localTap],
  );

  // --- WebRTC handshake handlers (opt-in) ---
  const switchToRtc = useCallback(
    (rtc: RtcPeer) => {
      const eng = engineRef.current;
      if (!eng) return;
      rtc.onMessage = (m) => handleMessage(eng, m);
      rtc.onStateChange = (s) => {
        setNetState(s);
        if (s === "open") {
          eng.active = rtc;
          eng.autoEnabled = false;
          setRtcNote("Connected — partner taps land on the inner ring.");
        } else if (s === "closed" || s === "failed" || s === "disconnected") {
          eng.active = eng.loopback;
          eng.autoEnabled = true;
          setNetState("loopback");
        }
      };
    },
    [handleMessage],
  );

  const doCreateOffer = useCallback(async () => {
    try {
      const rtc = new RtcPeer();
      rtcRef.current = rtc;
      switchToRtc(rtc);
      setRtcRole("offer");
      setRtcNote("Gathering network candidates…");
      const sdp = await rtc.createOffer();
      setOfferSdp(sdp);
      setRtcNote("Send this offer to your partner, then paste their answer.");
    } catch {
      setRtcNote("WebRTC unavailable — staying in loopback.");
    }
  }, [switchToRtc]);

  const doAcceptOffer = useCallback(async () => {
    try {
      const rtc = new RtcPeer();
      rtcRef.current = rtc;
      switchToRtc(rtc);
      setRtcRole("answer");
      setRtcNote("Gathering network candidates…");
      const answer = await rtc.acceptOffer(remoteSdp.trim());
      setAnswerSdp(answer);
      setRtcNote("Send this answer back to whoever created the offer.");
    } catch {
      setRtcNote("Couldn't read that offer — staying in loopback.");
    }
  }, [remoteSdp, switchToRtc]);

  const doAcceptAnswer = useCallback(async () => {
    try {
      await rtcRef.current?.acceptAnswer(remoteSdp.trim());
      setRtcNote("Answer accepted — waiting for the channel to open…");
    } catch {
      setRtcNote("Couldn't read that answer — staying in loopback.");
    }
  }, [remoteSdp]);

  const rtcSupported =
    typeof window !== "undefined" && "RTCPeerConnection" in window;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onPointerDown={onCanvasPointer}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: phase === "live" ? "block" : "none" }}
      />

      {/* Header chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-5">
        <h1 className="pointer-events-auto text-2xl font-semibold tracking-tight">
          Latency Canon
        </h1>
        <p className="pointer-events-auto max-w-md text-base text-muted-foreground">
          The round trip between two players, measured and snapped to a
          subdivision — so the lag rings as counterpoint, not a glitch.
        </p>
      </div>

      {/* Idle / Start */}
      {phase === "idle" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 px-6">
          <div className="max-w-md text-center text-base leading-relaxed text-muted-foreground">
            A seeded partner is already looping a phrase. Tap on the grid and
            your note answers itself one canon-interval late. Tap on the beat and
            it interlocks; tap off it and the figure frays.
          </div>
          <button
            onClick={start}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start
          </button>
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* Live controls */}
      {phase === "live" && (
        <>
          <div className="absolute inset-x-0 bottom-16 z-10 flex flex-col items-center gap-3 px-5">
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-lg border border-border bg-background/70 px-4 py-2 font-mono text-xs text-muted-foreground backdrop-blur-sm">
              <span>
                measured{" "}
                <span className="text-foreground">{measuredMs} ms</span>
              </span>
              <span>
                snapped{" "}
                <span className="text-primary">
                  {snapLabel} · {snappedMs} ms
                </span>
              </span>
              <span>
                lock <span className="text-foreground">{lockPct}%</span>
              </span>
              <span>
                {BPM} BPM · net{" "}
                <span
                  className={
                    netState === "open" ? "text-primary" : "text-muted-foreground"
                  }
                >
                  {netState}
                </span>
              </span>
            </div>

            <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-background/70 px-4 py-2 backdrop-blur-sm">
              <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                latency
              </label>
              <input
                type="range"
                min={40}
                max={320}
                value={latency}
                onChange={(e) => setLatency(Number(e.target.value))}
                className="h-1 flex-1 accent-primary"
              />
              <span className="w-14 text-right font-mono text-xs text-foreground">
                {latency} ms
              </span>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                onClick={() => setShowInvite(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Invite a partner
              </button>
              <button
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Design notes
              </button>
            </div>
            <p className="pointer-events-none font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              tap the wheel or press any key
            </p>
          </div>
        </>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {NOTES_MD.split("\n\n").map((block, i) => {
              if (block.startsWith("# ")) {
                return (
                  <h2 key={i} className="text-xl font-semibold tracking-tight">
                    {block.slice(2)}
                  </h2>
                );
              }
              if (block.startsWith("## ")) {
                return (
                  <h3
                    key={i}
                    className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
                  >
                    {block.slice(3)}
                  </h3>
                );
              }
              return (
                <p
                  key={i}
                  className="mt-2 text-sm leading-relaxed text-muted-foreground"
                >
                  {block}
                </p>
              );
            })}
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Invite (WebRTC manual SDP) modal */}
      {showInvite && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowInvite(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              Invite a second device
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A serverless WebRTC handshake — copy the SDP text between devices
              by hand. If it doesn&apos;t connect you stay in loopback, fully
              playable.
            </p>

            {!rtcSupported && (
              <p className="mt-4 text-sm text-destructive">
                WebRTC isn&apos;t available in this browser — loopback only.
              </p>
            )}

            {rtcSupported && rtcRole === "none" && (
              <div className="mt-4 flex flex-col gap-2">
                <button
                  onClick={doCreateOffer}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Create an offer (host)
                </button>
                <button
                  onClick={() => setRtcRole("answer")}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  I have an offer to answer
                </button>
              </div>
            )}

            {rtcRole === "offer" && (
              <div className="mt-4 flex flex-col gap-3">
                <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  1 · send this offer
                </label>
                <textarea
                  readOnly
                  value={offerSdp}
                  placeholder="generating…"
                  className="h-24 w-full resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-foreground"
                />
                <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  2 · paste their answer
                </label>
                <textarea
                  value={remoteSdp}
                  onChange={(e) => setRemoteSdp(e.target.value)}
                  className="h-24 w-full resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-foreground"
                />
                <button
                  onClick={doAcceptAnswer}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Connect
                </button>
              </div>
            )}

            {rtcRole === "answer" && (
              <div className="mt-4 flex flex-col gap-3">
                <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  1 · paste the offer you were sent
                </label>
                <textarea
                  value={remoteSdp}
                  onChange={(e) => setRemoteSdp(e.target.value)}
                  className="h-24 w-full resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-foreground"
                />
                <button
                  onClick={doAcceptOffer}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Generate answer
                </button>
                {answerSdp && (
                  <>
                    <label className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      2 · send this answer back
                    </label>
                    <textarea
                      readOnly
                      value={answerSdp}
                      className="h-24 w-full resize-none rounded-md border border-border bg-background/60 p-2 font-mono text-[11px] text-foreground"
                    />
                  </>
                )}
              </div>
            )}

            {rtcNote && (
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {rtcNote}
              </p>
            )}

            <button
              onClick={() => setShowInvite(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["3144-latency"]} />
    </main>
  );
}
