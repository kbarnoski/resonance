"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  segmentPhrases,
  playPhrase,
  type AudioSourceKind,
  type PhraseBank,
} from "./audio";
import { makeRenderer, type Renderer, type TableState } from "./render";
import {
  Portal,
  webrtcSupported,
  type NoteEvent,
} from "./portal";

type Phase = "intro" | "loading" | "playing";

const SEAT_COUNT = 6;
const SEAT_LABELS = ["Cello", "Viola", "Violin I", "Violin II", "Flute", "Bells"];
// Register shift in semitones per seat (bass → treble). Low seats darker.
const SEAT_SEMIS = [-12, -7, 0, 3, 7, 12];
const SEAT_REGISTER = [-1, -0.6, -0.1, 0.2, 0.6, 1];

// Look-ahead scheduler constants (Chris Wilson "A Tale of Two Clocks").
const LOOKAHEAD_MS = 25; // how often the scheduler wakes
const SCHEDULE_AHEAD = 0.12; // how far ahead (s) we schedule

interface SeatRuntime {
  on: boolean;
  remote: boolean;
  bloom: number;
  pulse: number;
  /** which slice of the phrase bank this seat currently favors (drifts). */
  bankCenter: number;
  /** next audio time this seat is due to play (s). */
  nextTime: number;
  /** this seat's own rhythmic subdivision (beats per hit), drifts over time. */
  subdiv: number;
}

export default function ConductedTablePage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [phraseCount, setPhraseCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [tempo, setTempo] = useState(0.4); // 0..1
  const [dynamics, setDynamics] = useState(0.55); // 0..1
  const [, force] = useState(0); // re-render seat chips
  const [elapsedMin, setElapsedMin] = useState(0);

  // networking UI
  const [rtcOk] = useState<boolean>(() =>
    typeof window === "undefined" ? true : webrtcSupported(),
  );
  const [shareUrl, setShareUrl] = useState("");
  const [pasteToken, setPasteToken] = useState("");
  const [netMsg, setNetMsg] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [guestAnswer, setGuestAnswer] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const bankRef = useRef<PhraseBank | null>(null);
  const seatBusRef = useRef<GainNode[]>([]);
  const droneRef = useRef<{ osc: OscillatorNode; g: GainNode }[]>([]);
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // renderer
  const rendererRef = useRef<Renderer | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const cuesRef = useRef<{ seat: number; prog: number; vel: number }[]>([]);

  // long-form arc / scheduler state
  const startTimeRef = useRef<number>(0);
  const schedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beatTimeRef = useRef<number>(0); // next beat boundary (audio s)
  const beatCountRef = useRef<number>(0);
  const seatsRef = useRef<SeatRuntime[]>([]);
  const tempoRef = useRef(tempo);
  const dynRef = useRef(dynamics);
  const centerRef = useRef(0.5); // harmonic center, migrates
  const densityRef = useRef(0.5); // breathes
  const seededRef = useRef(false);

  // networking refs
  const hostPortalsRef = useRef<Portal[]>([]);
  const guestPortalRef = useRef<Portal | null>(null);

  tempoRef.current = tempo;
  dynRef.current = dynamics;

  // ─── trigger one phrase for a seat (local audio + visual cue) ──────────────
  const firePhrase = useCallback(
    (seat: number, phraseIdx: number, vel: number, when: number) => {
      const ctx = ctxRef.current;
      const bank = bankRef.current;
      const bus = seatBusRef.current[seat];
      if (!ctx || !bank || !bus) return;
      const phrase = bank.phrases[phraseIdx];
      if (!phrase) return;
      const src = playPhrase(ctx, bank, phrase, bus, {
        when,
        semis: SEAT_SEMIS[seat],
        vel: Math.max(0.02, vel),
        maxDur: 2.6,
      });
      if (src) {
        liveSourcesRef.current.add(src);
        src.addEventListener("ended", () => liveSourcesRef.current.delete(src));
      }
      // schedule the visual cue to appear roughly when the sound lands
      const delay = Math.max(0, (when - ctx.currentTime) * 1000);
      window.setTimeout(() => {
        cuesRef.current.push({ seat, prog: 0, vel });
        const s = seatsRef.current[seat];
        if (s) s.bloom = Math.min(1, 0.6 + vel * 0.5);
      }, delay);
    },
    [],
  );

  // ─── look-ahead scheduler: the long-form, stateful engine ──────────────────
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current;
    const bank = bankRef.current;
    if (!ctx || !bank || bank.phrases.length === 0) return;

    const now = ctx.currentTime;
    const elapsed = now - startTimeRef.current;

    // ── slow MEMORY-driven evolution (minute 5 ≠ minute 0) ──
    // Harmonic center migrates on a slow sine + drift; conductor dynamics biases it.
    centerRef.current =
      0.5 +
      0.35 * Math.sin(elapsed * 0.012 + 0.7) +
      0.1 * Math.sin(elapsed * 0.031);
    centerRef.current = Math.min(1, Math.max(0, centerRef.current));
    // Density breathes over ~90s cycles, lifted by dynamics dial.
    densityRef.current =
      0.35 +
      0.3 * (0.5 + 0.5 * Math.sin(elapsed * 0.018)) +
      dynRef.current * 0.3;

    // beat duration from tempo dial (0.85s slow → 0.22s fast).
    const beatDur = 0.85 - tempoRef.current * 0.63;

    // schedule any beats that fall within the look-ahead window
    while (beatTimeRef.current < now + SCHEDULE_AHEAD) {
      const beatT = beatTimeRef.current;
      const beat = beatCountRef.current;
      const seats = seatsRef.current;

      for (let i = 0; i < seats.length; i++) {
        const seat = seats[i];
        if (!seat.on) continue;
        // remote-held seats are driven by incoming note-events, not the local arc
        if (seat.remote) continue;

        // each seat plays on its own drifting subdivision
        if (beat % Math.max(1, Math.round(seat.subdiv)) !== i % 2) continue;
        if (beatT < seat.nextTime) continue;

        // ── per-seat MEMORY drift: bank center & subdivision wander slowly ──
        seat.bankCenter += (Math.random() - 0.5) * 0.02 + Math.sin(elapsed * 0.02 + i) * 0.003;
        seat.bankCenter = Math.min(1, Math.max(0, seat.bankCenter));
        if (Math.random() < 0.04) {
          seat.subdiv = Math.max(1, Math.min(6, seat.subdiv + (Math.random() < 0.5 ? -1 : 1)));
        }

        // density gates how often seats actually sound
        const playProb = 0.25 + densityRef.current * 0.6;
        if (Math.random() > playProb) {
          seat.nextTime = beatT + beatDur;
          continue;
        }

        // choose a phrase: blend the seat's drifting center with the global
        // harmonic center, then add jitter — bank is sorted by brightness so
        // this maps to register migration.
        const target =
          0.5 * seat.bankCenter +
          0.5 * centerRef.current +
          (Math.random() - 0.5) * 0.18;
        const idx = Math.min(
          bank.phrases.length - 1,
          Math.max(0, Math.round(target * (bank.phrases.length - 1))),
        );
        const vel =
          (0.25 + dynRef.current * 0.65) *
          bank.phrases[idx].energy *
          (0.7 + Math.random() * 0.4);

        firePhrase(i, idx, vel, beatT);

        // broadcast to any connected peers so they render the same phrase
        const ev: NoteEvent = {
          seat: i,
          phrase: idx,
          vel,
          t: performance.now(),
        };
        for (const p of hostPortalsRef.current) p.sendNote(ev);
        if (guestPortalRef.current) guestPortalRef.current.sendNote(ev);

        seat.nextTime = beatT + beatDur * Math.max(1, seat.subdiv * 0.5);
      }

      beatTimeRef.current += beatDur;
      beatCountRef.current++;
    }

    // gently track drone toward harmonic center
    const drones = droneRef.current;
    if (drones.length >= 2) {
      const rootHz = 110 * Math.pow(2, (centerRef.current - 0.5) * 0.5);
      drones[0].osc.frequency.setTargetAtTime(rootHz, now, 2.0);
      drones[1].osc.frequency.setTargetAtTime(rootHz * 1.5, now, 2.0); // open fifth
    }
  }, [firePhrase]);

  // ─── incoming remote note-event: a guest filled a seat ─────────────────────
  const onRemoteNote = useCallback(
    (ev: NoteEvent) => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      const seat = seatsRef.current[ev.seat];
      if (seat) {
        seat.remote = true;
        seat.on = true;
        force((n) => n + 1);
      }
      firePhrase(ev.seat, ev.phrase, ev.vel, ctx.currentTime + 0.02);
    },
    [firePhrase],
  );

  // ─── render loop ───────────────────────────────────────────────────────────
  const frame = useCallback((ts: number) => {
    const r = rendererRef.current;
    const ctx = ctxRef.current;
    if (r && ctx) {
      const dt = lastFrameRef.current ? (ts - lastFrameRef.current) / 1000 : 0.016;
      lastFrameRef.current = ts;

      // advance cues
      const cues = cuesRef.current;
      for (let i = cues.length - 1; i >= 0; i--) {
        cues[i].prog += dt * 2.2;
        if (cues[i].prog >= 1) cues.splice(i, 1);
      }
      // decay blooms, advance idle pulse
      const seats = seatsRef.current;
      for (const s of seats) {
        s.bloom = Math.max(0, s.bloom - dt * 1.6);
        s.pulse = (s.pulse + dt * 0.2) % 1;
      }

      const state: TableState = {
        seats: seats.map((s, i) => ({
          label: SEAT_LABELS[i],
          register: SEAT_REGISTER[i],
          on: s.on,
          remote: s.remote,
          bloom: s.bloom,
          pulse: s.pulse,
        })),
        cues: cues.map((c) => ({ seat: c.seat, prog: c.prog, vel: c.vel })),
        tempo: tempoRef.current,
        dynamics: dynRef.current,
        elapsed: ctx.currentTime - startTimeRef.current,
        center: centerRef.current,
        density: densityRef.current,
      };
      r.draw(state);
      setElapsedMin((ctx.currentTime - startTimeRef.current) / 60);
    }
    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ─── build the audio graph + start everything (user gesture) ───────────────
  const begin = useCallback(async () => {
    if (phase !== "intro") return;
    setPhase("loading");

    const AC: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AC();
    await ctx.resume();
    ctxRef.current = ctx;

    // master chain: gain ≤0.3 → lowpass ≤7500 → compressor → destination
    const master = ctx.createGain();
    master.gain.value = 0.26;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    master.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);
    masterRef.current = master;

    // soft open-fifth root drone for warmth
    const drones: { osc: OscillatorNode; g: GainNode }[] = [];
    for (const [mult, gain] of [[1, 0.05] as const, [1.5, 0.035] as const]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 110 * mult;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g);
      g.connect(master);
      osc.start();
      drones.push({ osc, g });
    }
    droneRef.current = drones;

    // per-seat bus gains
    const buses: GainNode[] = [];
    for (let i = 0; i < SEAT_COUNT; i++) {
      const g = ctx.createGain();
      g.gain.value = 0.9;
      g.connect(master);
      buses.push(g);
    }
    seatBusRef.current = buses;

    // load recording → phrases (fallback if fetch fails)
    let buffer = await fetchPianoBuffer(ctx);
    let kind: AudioSourceKind = "piano";
    if (!buffer) {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      kind = "fallback";
    }
    const bank = segmentPhrases(buffer, kind);
    bankRef.current = bank;
    setSource(kind);
    setPhraseCount(bank.phrases.length);

    // init seat runtimes — ghost ensemble: all ON so it's ALIVE on load.
    seatsRef.current = Array.from({ length: SEAT_COUNT }, (_, i) => ({
      on: true,
      remote: false,
      bloom: 0,
      pulse: i / SEAT_COUNT,
      bankCenter: SEAT_REGISTER[i] * 0.5 + 0.5,
      nextTime: 0,
      subdiv: 1 + (i % 3),
    }));
    seededRef.current = true;

    // renderer
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (canvas && wrap) {
      const c2d = canvas.getContext("2d");
      if (c2d) {
        const r = makeRenderer(c2d, SEAT_COUNT);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        r.resize(wrap.clientWidth, wrap.clientHeight, dpr);
        rendererRef.current = r;
      }
    }

    // start clock + scheduler
    startTimeRef.current = ctx.currentTime;
    beatTimeRef.current = ctx.currentTime + 0.1;
    beatCountRef.current = 0;
    schedTimerRef.current = setInterval(runScheduler, LOOKAHEAD_MS);

    setPhase("playing");
    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(frame);
  }, [phase, runScheduler, frame]);

  // ─── guest auto-join from #o= link ─────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.startsWith("#o=")) setIsGuest(true);
  }, []);

  const acceptInviteAsGuest = useCallback(async () => {
    if (typeof window === "undefined") return;
    const token = window.location.hash.slice(3);
    if (!token) return;
    setNetMsg("Joining the ensemble…");
    const portal = new Portal("guest", {
      onState: () => {},
      onOpen: () => setNetMsg("Connected — you hold a seat. Phrases are shared."),
      onClose: () => setNetMsg("Disconnected."),
      onNote: onRemoteNote,
    });
    guestPortalRef.current = portal;
    try {
      const answer = await portal.acceptOfferToken(token);
      setGuestAnswer(answer);
      setNetMsg("Send this answer code back to the conductor:");
    } catch {
      setNetMsg("Could not read the invite link.");
    }
  }, [onRemoteNote]);

  // ─── host: generate an invite link for the next empty seat ─────────────────
  const createInvite = useCallback(async () => {
    if (typeof window === "undefined") return;
    setNetMsg("Forging an invite link…");
    const portal = new Portal("host", {
      onState: () => {},
      onOpen: () => setNetMsg("A player joined! They now drive a seat."),
      onClose: () => setNetMsg("A player left."),
      onNote: onRemoteNote,
    });
    hostPortalsRef.current.push(portal);
    try {
      const token = await portal.createOfferToken();
      const base = window.location.href.split("#")[0];
      setShareUrl(`${base}#o=${token}`);
      setNetMsg("Share this link. When they reply, paste their answer below.");
    } catch {
      setNetMsg("Could not create an invite.");
    }
  }, [onRemoteNote]);

  const acceptAnswer = useCallback(async () => {
    const portal = hostPortalsRef.current[hostPortalsRef.current.length - 1];
    if (!portal || !pasteToken.trim()) return;
    try {
      await portal.acceptAnswerToken(pasteToken.trim());
      setNetMsg("Player connected.");
      setPasteToken("");
    } catch {
      setNetMsg("That answer code didn't work.");
    }
  }, [pasteToken]);

  // ─── seat mute/unmute (the conductor's mixer) ──────────────────────────────
  const toggleSeat = useCallback((i: number) => {
    const seat = seatsRef.current[i];
    const bus = seatBusRef.current[i];
    const ctx = ctxRef.current;
    if (!seat || !bus || !ctx) return;
    seat.on = !seat.on;
    bus.gain.setTargetAtTime(seat.on ? 0.9 : 0.0001, ctx.currentTime, 0.08);
    force((n) => n + 1);
  }, []);

  // canvas pointer → seat hit-test
  const onCanvasPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = rendererRef.current;
      const canvas = canvasRef.current;
      if (!r || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const seat = r.hitSeat(cx, cy);
      if (seat >= 0) toggleSeat(seat);
    },
    [toggleSeat],
  );

  // resize handling
  useEffect(() => {
    if (phase !== "playing") return;
    const onResize = () => {
      const r = rendererRef.current;
      const wrap = wrapRef.current;
      if (r && wrap) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        r.resize(wrap.clientWidth, wrap.clientHeight, dpr);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [phase]);

  // ─── full teardown ─────────────────────────────────────────────────────────
  useEffect(() => {
    const liveSources = liveSourcesRef.current;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (schedTimerRef.current) clearInterval(schedTimerRef.current);
      for (const src of liveSources) {
        try {
          src.stop();
          src.disconnect();
        } catch {
          /* ok */
        }
      }
      liveSources.clear();
      for (const d of droneRef.current) {
        try {
          d.osc.stop();
          d.osc.disconnect();
          d.g.disconnect();
        } catch {
          /* ok */
        }
      }
      for (const p of hostPortalsRef.current) p.destroy();
      hostPortalsRef.current = [];
      if (guestPortalRef.current) guestPortalRef.current.destroy();
      guestPortalRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") {
        ctx.close().catch(() => {});
      }
      ctxRef.current = null;
    };
  }, []);

  const copy = useCallback((text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(
        () => setNetMsg("Copied to clipboard."),
        () => setNetMsg("Copy failed — select and copy manually."),
      );
    }
  }, []);

  const liveSeats = seatsRef.current.filter((s) => s.on).length;

  return (
    <main className="min-h-screen w-full bg-amber-50 text-stone-900">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          The Conducted Table
        </h1>
        <p className="mt-2 max-w-2xl text-base text-stone-700">
          Karel&apos;s real piano becomes a long-form ensemble you direct from a
          top-down score table — mute and revive seats, shape tempo and
          dynamics, and let friends fill the empty chairs from their phones.
        </p>

        {phase === "intro" && (
          <div className="mt-8">
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-xl bg-amber-600 px-6 py-2.5 text-base font-semibold text-white shadow-md transition hover:bg-amber-700"
            >
              Begin
            </button>
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="ml-3 min-h-[44px] rounded-xl border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-100"
            >
              Read the design notes
            </button>
            {isGuest && (
              <p className="mt-4 text-base text-amber-800">
                You followed an invite link. Press Begin to hear the ensemble,
                then accept the seat in the invite panel.
              </p>
            )}
          </div>
        )}

        {phase === "loading" && (
          <p className="mt-8 text-base text-stone-700">Tuning the ensemble…</p>
        )}

        {phase === "playing" && (
          <>
            <div
              ref={wrapRef}
              className="relative mt-6 h-[58vh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-amber-200 shadow-lg"
            >
              <canvas
                ref={canvasRef}
                onPointerDown={onCanvasPointer}
                className="h-full w-full cursor-pointer touch-none"
              />
            </div>

            {source === "fallback" && (
              <p className="mt-3 text-base font-semibold text-rose-700">
                Live recording unavailable — a synthesized fallback tone is
                playing so the ensemble is never silent.
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600">
              <span>{phraseCount} phrases from Karel&apos;s playing</span>
              <span>·</span>
              <span>{liveSeats}/{SEAT_COUNT} seats in</span>
              <span>·</span>
              <span>{elapsedMin.toFixed(1)} min into the arc</span>
            </div>

            {/* conductor controls */}
            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="text-base font-semibold text-stone-800">
                  Tempo — ensemble pulse
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={tempo}
                  onChange={(e) => setTempo(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-amber-600"
                />
              </label>
              <label className="block">
                <span className="text-base font-semibold text-stone-800">
                  Dynamics — loudness &amp; density
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={dynamics}
                  onChange={(e) => setDynamics(parseFloat(e.target.value))}
                  className="mt-2 w-full accent-amber-600"
                />
              </label>
            </div>

            {/* seat mixer chips (also tappable on canvas) */}
            <div className="mt-4 flex flex-wrap gap-2">
              {SEAT_LABELS.map((label, i) => {
                const s = seatsRef.current[i];
                const on = s?.on;
                const remote = s?.remote;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleSeat(i)}
                    className={`min-h-[44px] rounded-xl px-4 py-2.5 text-base font-semibold transition ${
                      on
                        ? remote
                          ? "bg-sky-600 text-white"
                          : "bg-amber-600 text-white"
                        : "border border-stone-300 bg-white text-stone-500"
                    }`}
                  >
                    {label} · {on ? (remote ? "LIVE" : "IN") : "OUT"}
                  </button>
                );
              })}
            </div>

            {/* networking */}
            {rtcOk && (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-white/60 p-4">
                <button
                  type="button"
                  onClick={() => setShowInvite((v) => !v)}
                  className="min-h-[44px] rounded-xl bg-stone-800 px-4 py-2.5 text-base font-semibold text-white hover:bg-stone-900"
                >
                  {showInvite ? "Hide invite panel" : "Invite a player"}
                </button>

                {showInvite && (
                  <div className="mt-4 space-y-4">
                    {!isGuest && (
                      <div className="space-y-2">
                        <p className="text-base font-semibold text-stone-800">
                          Conductor (host)
                        </p>
                        <button
                          type="button"
                          onClick={createInvite}
                          className="min-h-[44px] rounded-xl bg-amber-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-amber-700"
                        >
                          Create invite link
                        </button>
                        {shareUrl && (
                          <div className="space-y-2">
                            <textarea
                              readOnly
                              value={shareUrl}
                              className="h-20 w-full rounded-lg border border-stone-300 p-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => copy(shareUrl)}
                              className="min-h-[44px] rounded-xl border border-stone-300 px-4 py-2.5 text-base hover:bg-stone-100"
                            >
                              Copy link
                            </button>
                            <p className="text-base text-stone-700">
                              Paste the player&apos;s answer code:
                            </p>
                            <textarea
                              value={pasteToken}
                              onChange={(e) => setPasteToken(e.target.value)}
                              placeholder="answer code…"
                              className="h-20 w-full rounded-lg border border-stone-300 p-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={acceptAnswer}
                              className="min-h-[44px] rounded-xl bg-stone-800 px-4 py-2.5 text-base font-semibold text-white hover:bg-stone-900"
                            >
                              Connect player
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isGuest && (
                      <div className="space-y-2">
                        <p className="text-base font-semibold text-stone-800">
                          You are joining a seat (guest)
                        </p>
                        <button
                          type="button"
                          onClick={acceptInviteAsGuest}
                          className="min-h-[44px] rounded-xl bg-amber-600 px-4 py-2.5 text-base font-semibold text-white hover:bg-amber-700"
                        >
                          Accept the seat
                        </button>
                        {guestAnswer && (
                          <div className="space-y-2">
                            <textarea
                              readOnly
                              value={guestAnswer}
                              className="h-20 w-full rounded-lg border border-stone-300 p-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => copy(guestAnswer)}
                              className="min-h-[44px] rounded-xl border border-stone-300 px-4 py-2.5 text-base hover:bg-stone-100"
                            >
                              Copy answer code
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {netMsg && (
                      <p className="text-base text-amber-800">{netMsg}</p>
                    )}
                  </div>
                )}
              </div>
            )}
            {!rtcOk && (
              <p className="mt-4 text-base text-stone-600">
                Multiplayer needs newer browser APIs — running in solo mode. The
                full ensemble still plays.
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="mt-6 min-h-[44px] rounded-xl border border-stone-300 px-4 py-2.5 text-base font-medium text-stone-700 hover:bg-stone-100"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
          </>
        )}

        {showNotes && (
          <div className="mt-5 max-w-2xl space-y-3 rounded-2xl border border-amber-200 bg-white/70 p-5 text-base leading-relaxed text-stone-700">
            <p>
              <strong>One question:</strong> what if Karel&apos;s real piano
              recording became a long-form conducted ensemble you direct from a
              top-down score table — and friends could fill the empty chairs from
              their own phones?
            </p>
            <p>
              This is cycle-2 of{" "}
              <em>729-piano-portal-jam</em>: same zero-server WebRTC idea (only
              tiny note-events travel; both peers render from the identical
              recording), but his playing is replayed as musical PHRASES via
              onset/silence detection, not grains. A look-ahead scheduler keeps
              the pulse steady while a slow internal arc migrates the harmonic
              center and breathes density, so minute 5 is not minute 0.
            </p>
            <p>
              Lineage: The Hub / League of Automatic Music Composers, JackTrip,
              and the AES paper &quot;Web-Based Networked Music Performances via
              WebRTC.&quot;
            </p>
            <Link
              href="/dream/729-piano-portal-jam"
              className="inline-block font-semibold text-amber-700 underline"
            >
              ← Visit the cycle-1 duet
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
