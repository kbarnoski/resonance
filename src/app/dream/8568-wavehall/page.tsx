"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 8568-wavehall — "See a phrase travel the hall."
//
// A top-down architectural cross-section of an apsidal nave with two stalls.
// Cast a phrase from your (LEFT) stall and watch its sound sweep the plan as an
// expanding luminous wavefront, REFLECTING off the walls (image-source method).
// As the front REACHES the partner marker and each wall, an HRTF-spatialized tap
// fires — DELAYED by the travel time — so you SEE the front hit the far wall and
// HEAR the arrival from that direction. A partner (real 2nd tab, or a seeded
// ghost) ANSWERS from across the hall in a contrasting timbre — a transform of
// your call, never a verbatim echo. Antiphonal call-and-response: NO shared
// clock, NO unison, never locking. The reward is watching + hearing phrases
// traverse the room between the two of you.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRenderer,
  type Front,
  STALL_L,
  STALL_R,
  MAX_FRONTS,
} from "./gl";
import { createAudioEngine } from "./audio";
import { createSync, type SyncMsg } from "./sync";
import {
  answerOf,
  keyToSemi,
  mulberry32,
  KEY_ORDER,
  SCALE_SEMIS,
  seededCall,
  semiToFreq,
} from "./music";

type Mode = "webgl2" | "fallback";

interface NoteEvent {
  at: number; // seconds
  side: 0 | 1;
  kind: "note" | "end";
  semi?: number;
  notes?: number[];
}

export default function Page() {
  const [entered, setEntered] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [mode, setMode] = useState<Mode>("webgl2");
  const [hasPartner, setHasPartner] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [status, setStatus] = useState("ghost partner drifting");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const enter = useCallback(() => setEntered(true), []);

  useEffect(() => {
    if (!entered) return;
    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;

    const reduce =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const SPEED = reduce ? 0.42 : 0.72; // world units / sec
    const NOTE_STEP = reduce ? 0.6 : 0.4; // sec between notes of a phrase
    const PHRASE_GAP = 0.75; // sec of silence that ends a cast phrase
    const ANSWER_GAP = 0.7; // sec before a partner replies
    const DEMO_IDLE = 6; // sec of user inactivity before the demo self-plays
    const PARTNER_TIMEOUT = 1.5; // sec since last heartbeat → partner gone
    const BEAT_PERIOD = 1.0;
    const FRONT_AMP = 0.95;
    const FRONT_MAX_AGE = 6.5;

    // ── engines ───────────────────────────────────────────────────────────
    const renderer = createRenderer(canvas);
    const engine = createAudioEngine();
    const rng = mulberry32(0x8568);

    // ── live simulation state ─────────────────────────────────────────────
    const start = performance.now();
    const time = () => (performance.now() - start) / 1000;
    let fronts: Front[] = [];
    const pulse = [0, 0];
    const queue: NoteEvent[] = [];
    let userNotes: Array<{ semi: number; t: number }> = [];
    let lastKeyTime = -100;
    let userActive = -100;
    let nextDemoCall = 0.4;
    let partnerSeen = -100;
    let lastBeat = -100;
    let lastFrameT = 0;
    let audioFlag = false;
    let partnerFlag = false;
    let raf = 0;

    const hasPartnerNow = () => time() - partnerSeen < PARTNER_TIMEOUT;

    // ── transport ─────────────────────────────────────────────────────────
    function onMsg(m: SyncMsg) {
      if (m.t === "beat") {
        partnerSeen = time();
        return;
      }
      // a partner's CALL arrives as a phrase sweeping from OUR partner (RIGHT)
      partnerSeen = time();
      const startAt = time() + 0.05;
      const items = m.notes.map((n) => ({ semi: n.semi, at: startAt + n.dt / 1000 }));
      enqueue(1, items, m.notes.map((n) => n.semi));
    }
    const sync = createSync(onMsg);

    // ── phrase scheduling ─────────────────────────────────────────────────
    function enqueue(
      side: 0 | 1,
      items: Array<{ semi: number; at: number }>,
      endNotes: number[],
    ) {
      for (const it of items) queue.push({ at: it.at, side, kind: "note", semi: it.semi });
      const endAt = items.length ? items[items.length - 1].at + 0.05 : time();
      queue.push({ at: endAt, side, kind: "end", notes: endNotes });
      queue.sort((a, b) => a.at - b.at);
    }
    function enqueueEven(side: 0 | 1, semis: number[], startAt: number) {
      const items = semis.map((semi, i) => ({ semi, at: startAt + i * NOTE_STEP }));
      enqueue(side, items, semis);
    }
    function scheduleGhostAnswer(callSemis: number[]) {
      const ans = answerOf(callSemis, rng);
      enqueueEven(1, ans.semis, time() + ANSWER_GAP);
      setStatus(`answered · ${ans.label}`);
    }

    // ── the visible + audible arrival ─────────────────────────────────────
    function spawnNote(side: 0 | 1, semi: number) {
      const st = side === 0 ? STALL_L : STALL_R;
      fronts.push({ x: st.x, y: st.y, t0: time(), amp: FRONT_AMP, side, speed: SPEED });
      if (fronts.length > MAX_FRONTS) fronts.splice(0, fronts.length - MAX_FRONTS);
      pulse[side] = 1;
      if (engine.ready()) {
        engine.tap({ x: st.x, y: st.y, freq: semiToFreq(semi), side, speed: SPEED });
      }
    }

    function finalizeUser() {
      if (userNotes.length === 0) return;
      const first = userNotes[0].t;
      const notes = userNotes.map((n) => ({ semi: n.semi, dt: (n.t - first) * 1000 }));
      sync.send({ t: "call", peer: sync.peerId, notes, speed: SPEED });
      if (!hasPartnerNow()) scheduleGhostAnswer(userNotes.map((n) => n.semi));
      userNotes = [];
    }

    function castKeySemi(semi: number) {
      engine.unlock();
      if (userNotes.length >= 6) finalizeUser();
      spawnNote(0, semi);
      const t = time();
      userNotes.push({ semi, t });
      lastKeyTime = t;
      userActive = t;
    }

    // ── input ─────────────────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const semi = keyToSemi(e.key);
      engine.unlock();
      if (semi === null) return;
      castKeySemi(semi);
    };
    const onDown = (e: PointerEvent) => {
      engine.unlock();
      const frac = Math.min(0.999, Math.max(0, e.clientX / window.innerWidth));
      const idx = Math.floor(frac * KEY_ORDER.length);
      castKeySemi(SCALE_SEMIS[Math.min(idx, SCALE_SEMIS.length - 1)]);
    };

    const applyResize = () => renderer?.resize();

    // ── frame loop ────────────────────────────────────────────────────────
    function frame() {
      const t = time();
      const dt = Math.min(0.1, t - lastFrameT);
      lastFrameT = t;

      // stall glow decay
      pulse[0] *= Math.exp(-dt * 3);
      pulse[1] *= Math.exp(-dt * 3);

      // due scheduled notes
      while (queue.length && queue[0].at <= t) {
        const ev = queue.shift();
        if (!ev) break;
        if (ev.kind === "end") {
          if (ev.side === 0 && !hasPartnerNow()) scheduleGhostAnswer(ev.notes ?? []);
        } else if (ev.semi !== undefined) {
          spawnNote(ev.side, ev.semi);
        }
      }

      // end a user phrase after a pause
      if (userNotes.length && t - lastKeyTime > PHRASE_GAP) finalizeUser();

      // self-demo: when idle + no real partner, the seeded ghost calls (LEFT),
      // and each call's end triggers a RIGHT answer — continuous antiphony
      if (!hasPartnerNow() && t - userActive > DEMO_IDLE && t > nextDemoCall) {
        enqueueEven(0, seededCall(rng), t + 0.15);
        nextDemoCall = t + 5.5 + rng() * 3.5;
        setStatus("ghost calling across the hall");
      }

      // heartbeat
      if (t - lastBeat > BEAT_PERIOD) {
        sync.send({ t: "beat", peer: sync.peerId });
        lastBeat = t;
      }

      // cull spent fronts
      if (fronts.length) fronts = fronts.filter((f) => t - f.t0 < FRONT_MAX_AGE);

      // reflect engine/presence status into React (throttled by change)
      const ready = engine.ready();
      if (ready !== audioFlag) {
        audioFlag = ready;
        setAudioReady(ready);
      }
      const partnerNow = hasPartnerNow();
      if (partnerNow !== partnerFlag) {
        partnerFlag = partnerNow;
        setHasPartner(partnerNow);
        setStatus(partnerNow ? "partner present — trade phrases" : "ghost partner drifting");
      }

      renderer?.draw({ time: t, fronts, pulseL: pulse[0], pulseR: pulse[1], reduce });
      raf = requestAnimationFrame(frame);
    }

    // ── boot ──────────────────────────────────────────────────────────────
    setMode(renderer ? "webgl2" : "fallback");
    renderer?.resize();
    window.addEventListener("resize", applyResize);
    window.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", onDown);
    lastFrameT = 0;
    raf = requestAnimationFrame(frame);

    // ── teardown ──────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", applyResize);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onDown);
      sync.close();
      engine.close();
      renderer?.dispose();
    };
  }, [entered]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: mode === "fallback" ? "none" : "block" }}
      />

      {/* minimal SVG fallback when WebGL2 is unavailable — audio still works */}
      {mode === "fallback" && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <svg
            viewBox="0 0 400 240"
            className="h-auto w-[min(90vw,720px)]"
            aria-label="hall cross-section"
          >
            <rect x="20" y="40" width="360" height="160" rx="80"
              fill="none" stroke="currentColor" className="text-muted-foreground" strokeWidth="1.5" />
            <line x1="20" y1="120" x2="380" y2="120" stroke="currentColor"
              className="text-muted-foreground/40" strokeWidth="1" />
            <circle cx="70" cy="120" r="7" fill="#ffb24d" />
            <circle cx="330" cy="120" r="7" fill="#5cd2d8" />
            <circle cx="70" cy="120" r="7" fill="none" stroke="#ffb24d" strokeWidth="1.5"
              className="origin-center motion-safe:animate-ping" />
            <circle cx="330" cy="120" r="7" fill="none" stroke="#5cd2d8" strokeWidth="1.5"
              className="origin-center motion-safe:animate-ping" />
          </svg>
        </div>
      )}

      {/* pre-enter hero */}
      {!entered && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-background/85 px-6 text-center backdrop-blur-sm">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              See a phrase travel the hall
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Cast a phrase from your stall and watch its sound sweep the room as
              a wavefront, reflecting off the walls. As the front reaches the far
              side you hear the arrival from that direction — and a partner across
              the hall answers, the two of you trading phrases the room carries
              between you.
            </p>
          </div>
          <button
            type="button"
            onClick={enter}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Enter the hall
          </button>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            keys A S D F G H cast · pause to send · open a 2nd tab to duet
          </p>
        </div>
      )}

      {/* HUD */}
      {entered && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
          <div className="flex flex-col gap-2">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              wavehall · antiphonal
            </div>
            <div className="text-base text-foreground">{status}</div>
            {!audioReady && (
              <div className="text-sm text-muted-foreground">
                press a key or tap to unlock sound
              </div>
            )}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <span className="rounded-md border border-border bg-background/60 px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {hasPartner ? "partner" : "ghost"}
            </span>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>
      )}

      {/* cast legend + fallback notice */}
      {entered && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between gap-4 p-4">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            A S D F G H — cast a note · pause ends the phrase
          </div>
          {mode === "fallback" && (
            <span className="rounded-md border border-border bg-background/60 px-3 py-1 text-sm text-destructive">
              WebGL2 unavailable — showing a minimal plan; audio still plays
            </span>
          )}
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                This is an antiphonal hall — a call-and-response room, deliberately
                NOT an entrainment lock. There is no shared clock and no unison:
                you cast a phrase, its wavefront sweeps the architectural plan, and
                a partner answers from across the nave.
              </p>
              <p>
                Each cast note emanates an expanding luminous front from your stall,
                rendered in a hand-written WebGL2 fragment shader. It reflects off
                the walls by the{" "}
                <span className="text-foreground">image-source method</span>: each
                wall mirrors the source, and the reflected ring appears to radiate
                from that mirrored image — geometrically exact for a first-order
                bounce.
              </p>
              <p>
                As the front reaches the partner and each wall, a Web Audio{" "}
                <span className="text-foreground">HRTF</span> panner fires a tap,
                DELAYED through a DelayNode by the travel time (distance ÷ speed).
                So you SEE the front hit the far wall and HEAR the arrival from that
                direction — the direct path plus its reflections are the room&apos;s
                impulse response, made audible and visible. A bounded feedback delay
                gives the tail.
              </p>
              <p>
                The partner&apos;s answer is a transform of your call — transpose,
                retrograde, inversion, or ornament — a genuine response, never a
                verbatim echo. Co-presence rides BroadcastChannel: we send the call
                as a note-list (control data, never audio), and each device
                synthesizes and renders locally. Add{" "}
                <span className="text-foreground">#room=name</span> to the URL to
                pair two tabs. With no partner, a seeded ghost (mulberry32 0x8568)
                calls and answers so the whole arc reads on a muted phone.
              </p>
              <p className="text-xs">
                After: image-source method / geometric room acoustics ·
                whispering-gallery acoustics · Giovanni Gabrieli&apos;s Venetian
                cori spezzati antiphony · Alvin Lucier, &ldquo;I Am Sitting in a
                Room.&rdquo; Extends the lab&apos;s 7912-entrain-moire co-presence
                lineage as call-and-response with visible propagation.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
