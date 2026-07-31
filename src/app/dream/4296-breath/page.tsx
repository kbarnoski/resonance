"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildAnswer,
  extractPhrase,
  KEY_BY_CHAR,
  KEYS,
  makeMulberry32,
  PlayedNote,
  scoreInvitation,
  TONIC_MIDI,
} from "./music";
import { AudioEngine, createAudioEngine } from "./audio";
import { BreathHandle, createBreathScene } from "./scene";

/* ────────────────────────────────────────────────────────────────────────────
   4296 · BREATH
   "What if a musical companion only answered when it felt genuinely INVITED —
   and when it wasn't invited, its silence took a visible body: a presence that
   draws near when you offer it a turn and withdraws while you're mid-thought?"

   You play a small D-dorian instrument (keyboard a s d f g h j k + black keys
   w e t y u, or the on-screen keys). A hand-rolled INVITATION SCORER reads the
   shape of your playing — a held note, a rising unresolved contour, a deliberate
   pause after a phrase all raise invitation; busy tumbling runs keep it low.
   Below threshold the companion stays SILENT and physically RECEDES into the
   dark (expressive, listening — not broken). At threshold it ANSWERS: it echoes
   your last gesture TRANSFORMED (inversion / augmentation / consonant
   transposition) in a soft breathy pad voice, timbrally distinct from your
   bright pluck, and blooms toward you at the moment it decides to speak.
   ──────────────────────────────────────────────────────────────────────────── */

const SEED = 0x4296;
const THRESHOLD = 0.6; // invitation the companion needs before it will answer

// On-screen keyboard geometry (a small piano: whites in a row, blacks between).
const WHITE_W = 46;
const GAP = 4;
const BLACK_W = 32;
const WHITES = KEYS.filter((k) => !k.black);
const BLACKS = KEYS.filter((k) => k.black);
const BLACK_AFTER: Record<string, number> = { w: 0, e: 2, t: 3, y: 4, u: 6 };

interface Readout {
  invitation: number;
  sustain: number;
  rising: number;
  pause: number;
  busy: number;
  status: string;
  transform: string;
  near: number;
}

export default function BreathPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [readout, setReadout] = useState<Readout>({
    invitation: 0,
    sustain: 0,
    rising: 0,
    pause: 0,
    busy: 0,
    status: "listening · far",
    transform: "—",
    near: 0,
  });

  const engine = useRef<{
    started: boolean;
    scene: BreathHandle | null;
    audio: AudioEngine | null;
    noteOn: ((char: string, semitone: number) => void) | null;
    noteOff: ((char: string) => void) | null;
    begin: (() => void) | null;
  }>({ started: false, scene: null, audio: null, noteOn: null, noteOff: null, begin: null });

  const brain = useRef({
    notes: [] as PlayedNote[],
    held: new Map<string, PlayedNote>(),
    floorT: 0,
    invitation: 0,
    bloom: 0,
    answerUntil: 0,
    cooldownUntil: 0,
    transform: "—",
    velRand: makeMulberry32(SEED + 1),
    answerRand: makeMulberry32(SEED + 2),
  });

  // ── Mount: scene, audio wiring, input, and the single master loop ─────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const eng = engine.current;

    const scene = createBreathScene(mount, SEED);
    if (!scene) setWebglOk(false);
    eng.scene = scene;

    const reducedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = reducedMQ.matches;
    const onReduced = () => {
      reduced = reducedMQ.matches;
    };
    reducedMQ.addEventListener("change", onReduced);

    async function ensureAudio() {
      if (!engine.current.audio) {
        try {
          engine.current.audio = createAudioEngine(SEED);
        } catch {
          setAudioBlocked(true);
          return;
        }
      }
      const ok = await engine.current.audio.ensureRunning();
      setAudioBlocked(!ok);
    }

    function begin() {
      if (!engine.current.started) {
        engine.current.started = true;
        setStarted(true);
      }
      void ensureAudio();
    }
    engine.current.begin = begin;

    function noteOn(char: string, semitone: number) {
      begin();
      const b = brain.current;
      if (b.held.has(char)) return;
      const now = performance.now();
      const midi = TONIC_MIDI + semitone;
      const velocity = 0.7 + b.velRand() * 0.25;
      const note: PlayedNote = { semitone, midi, velocity, startT: now, endT: null };
      b.notes.push(note);
      if (b.notes.length > 90) b.notes.splice(0, b.notes.length - 90);
      b.held.set(char, note);
      engine.current.audio?.playPluck(midi, velocity);
      engine.current.scene?.spawnTrace(semitone, velocity);
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.add(char);
        return next;
      });
    }
    engine.current.noteOn = noteOn;

    function noteOff(char: string) {
      const b = brain.current;
      const note = b.held.get(char);
      if (!note) return;
      note.endT = performance.now();
      b.held.delete(char);
      setActiveKeys((prev) => {
        const next = new Set(prev);
        next.delete(char);
        return next;
      });
    }
    engine.current.noteOff = noteOff;

    // Physical keyboard.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = KEY_BY_CHAR.get(e.key.toLowerCase());
      if (!k) return;
      e.preventDefault();
      noteOn(k.key, k.semitone);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = KEY_BY_CHAR.get(e.key.toLowerCase());
      if (!k) return;
      noteOff(k.key);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const ro = new ResizeObserver(() => scene?.resize());
    ro.observe(mount);

    // ── The master loop: score → decide → (answer) → render ────────────────
    let raf = 0;
    const t0 = performance.now();
    let last = t0;
    let readoutAccum = 0;

    function frame() {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = (now - t0) / 1000;
      const b = brain.current;

      const heldTimes = Array.from(b.held.values()).map((n) => n.startT);
      const sc = scoreInvitation(b.notes, now, heldTimes, b.floorT);

      // Smooth the invitation so the presence glides rather than jitters.
      b.invitation += (sc.invitation - b.invitation) * (1 - Math.exp(-dt / 0.25));
      b.bloom = Math.max(0, b.bloom - dt / 1.4);

      const answering = now < b.answerUntil;

      // The turn-gate: answer only into a genuine pause you've offered — never
      // over a held key, never mid-run, never during cooldown.
      if (
        !answering &&
        now >= b.cooldownUntil &&
        b.held.size === 0 &&
        b.invitation >= THRESHOLD &&
        sc.pause > 0.25
      ) {
        const phrase = extractPhrase(b.notes, b.floorT);
        if (phrase.length > 0) {
          const answer = buildAnswer(phrase, b.answerRand);
          const audio = engine.current.audio;
          const durSec = audio ? audio.scheduleAnswer(answer.notes) : answer.totalDurSec;
          b.answerUntil = now + durSec * 1000;
          b.cooldownUntil = b.answerUntil + 900;
          b.floorT = now; // consume this phrase so it can't re-trigger
          b.bloom = 1;
          b.transform = answer.transform;
        }
      }

      const audio = engine.current.audio;
      const padLevel = audio ? audio.getPadLevel() : 0;
      const nowAnswering = now < b.answerUntil;

      scene?.update(
        { approach: b.invitation, answering: nowAnswering, bloom: b.bloom, padLevel, reduced },
        elapsed,
      );

      readoutAccum += dt;
      if (readoutAccum > 0.1) {
        readoutAccum = 0;
        const near = nowAnswering ? 1 : b.invitation;
        const status = nowAnswering
          ? `answering · ${b.transform}`
          : b.invitation >= THRESHOLD
            ? "ready · near"
            : b.invitation > 0.32
              ? "drawing near"
              : "listening · far";
        setReadout({
          invitation: b.invitation,
          sustain: sc.sustain,
          rising: sc.rising,
          pause: sc.pause,
          busy: sc.busy,
          status,
          transform: b.transform,
          near,
        });
      }
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      reducedMQ.removeEventListener("change", onReduced);
      scene?.dispose();
      eng.audio?.dispose();
      eng.audio = null;
      eng.scene = null;
    };
  }, []);

  const onPointerDownKey = useCallback((e: React.PointerEvent, char: string, semitone: number) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    engine.current.noteOn?.(char, semitone);
  }, []);
  const onPointerUpKey = useCallback((char: string) => {
    engine.current.noteOff?.(char);
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0" />

      {!webglOk && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL isn&apos;t available here, so the companion&apos;s presence can&apos;t be drawn. The
            instrument and its listening still work — play the keys and it will answer when invited.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5 sm:p-7">
        <header className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Breath</h1>
          <p className="mt-1 text-base text-muted-foreground">
            A companion that answers only when you <em>invite</em> it. Hold a note, let a phrase rise and
            hang unresolved, then leave a deliberate pause — it draws near and replies. Tumble through a
            busy run and it stays silent, receding into the dark, listening.
          </p>
        </header>
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* Bottom console: readout + keyboard */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 p-5 sm:p-7">
        {audioBlocked && (
          <p className="pointer-events-auto text-base text-destructive">
            Audio is blocked — tap a key once to allow sound. The visuals keep listening either way.
          </p>
        )}

        {/* Invitation meter + component readout */}
        <div className="pointer-events-auto w-full max-w-md">
          <div className="mb-1 flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>invitation</span>
            <span className={readout.invitation >= THRESHOLD ? "text-primary" : undefined}>
              {readout.status}
            </span>
          </div>
          <div className="relative h-2 w-full rounded-full bg-border">
            <div
              className="h-2 rounded-full bg-primary"
              style={{ width: `${Math.round(readout.invitation * 100)}%` }}
            />
            {/* threshold marker */}
            <div
              className="absolute top-[-3px] h-[14px] w-px bg-muted-foreground"
              style={{ left: `${Math.round(THRESHOLD * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>hold {readout.sustain.toFixed(2)}</span>
            <span>rise {readout.rising.toFixed(2)}</span>
            <span>pause {readout.pause.toFixed(2)}</span>
            <span>busy {readout.busy.toFixed(2)}</span>
            <span>near {readout.near.toFixed(2)}</span>
          </div>
        </div>

        {/* On-screen keyboard (works with no physical keyboard) */}
        <div className="pointer-events-auto w-full overflow-x-auto pb-1">
          <div
            className="relative mx-auto flex"
            style={{ width: WHITES.length * WHITE_W + (WHITES.length - 1) * GAP, gap: GAP }}
          >
            {WHITES.map((k) => {
              const active = activeKeys.has(k.key);
              return (
                <button
                  key={k.key}
                  type="button"
                  aria-label={`${k.label} (key ${k.key})`}
                  onPointerDown={(e) => onPointerDownKey(e, k.key, k.semitone)}
                  onPointerUp={() => onPointerUpKey(k.key)}
                  onPointerLeave={() => onPointerUpKey(k.key)}
                  onPointerCancel={() => onPointerUpKey(k.key)}
                  className={`flex h-[132px] flex-col items-center justify-end rounded-md border border-border pb-2 text-sm transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-background/70 text-foreground hover:bg-accent"
                  }`}
                  style={{ minWidth: WHITE_W, width: WHITE_W }}
                >
                  <span className="text-base font-medium">{k.label}</span>
                  <span className="mt-1 font-mono text-xs uppercase text-muted-foreground">{k.key}</span>
                </button>
              );
            })}
            {BLACKS.map((k) => {
              const after = BLACK_AFTER[k.key];
              const center = (after + 1) * WHITE_W + after * GAP + GAP / 2;
              const active = activeKeys.has(k.key);
              return (
                <button
                  key={k.key}
                  type="button"
                  aria-label={`${k.label} (key ${k.key})`}
                  onPointerDown={(e) => onPointerDownKey(e, k.key, k.semitone)}
                  onPointerUp={() => onPointerUpKey(k.key)}
                  onPointerLeave={() => onPointerUpKey(k.key)}
                  onPointerCancel={() => onPointerUpKey(k.key)}
                  className={`absolute top-0 z-10 flex h-[80px] flex-col items-center justify-end rounded-md rounded-t-none border border-border pb-1 text-xs transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                  style={{ left: center - BLACK_W / 2, width: BLACK_W }}
                >
                  <span className="font-medium">{k.label}</span>
                  <span className="mt-0.5 font-mono uppercase">{k.key}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!started && (
          <button
            type="button"
            onClick={() => engine.current.begin?.()}
            className="pointer-events-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Begin — then play a key
          </button>
        )}
      </div>

      {/* Design notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[82vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              4296 · breath
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The one question:</strong> what if a musical companion
                only answered when it felt genuinely <em>invited</em> — and when it wasn&apos;t, its silence
                took a visible body: a presence that draws near when you offer it a turn and withdraws while
                you&apos;re mid-thought?
              </p>
              <p>
                <strong className="text-foreground">The invitation scorer.</strong> Your playing is captured
                as a symbolic note stream (pitch, timestamp, hold-duration, velocity — no microphone, no FFT).
                A hand-rolled scorer continuously reads three cues: a <em>held / sustained</em> note, a{" "}
                <em>rising unresolved contour</em> (a line that climbs and doesn&apos;t fall home to the
                tonic), and a <em>deliberate pause</em> right after a phrase. Each raises invitation; a busy,
                tumbling run of fast onsets gates it back down. The four sub-scores are shown live under the
                meter.
              </p>
              <p>
                <strong className="text-foreground">The turn-gate.</strong> Below threshold the companion
                stays silent and physically <em>recedes</em> into the fog, dimming — clearly listening, not
                broken. Its distance encodes attention: far = &ldquo;keep going,&rdquo; near = &ldquo;I&apos;m
                ready.&rdquo; At or above threshold, and only into a genuine pause you&apos;ve offered (never
                over a held key, never mid-run), it takes a turn: it blooms toward you and answers.
              </p>
              <p>
                <strong className="text-foreground">Its voice.</strong> The reply echoes your last gesture{" "}
                <em>transformed</em> — an inversion, a rhythmic augmentation, or a consonant diatonic
                transposition (hand-rolled, no ML), landing on a soft grounding tonic. You are a bright,
                thin, plucked timbre; it is a soft breathy pad floated on a small feedback-delay air — so
                it&apos;s always obvious who is speaking.
              </p>
              <p>
                <strong className="text-foreground">Instrument.</strong> One octave of D dorian. Keys{" "}
                <code>a s d f g h j k</code> are the mode; <code>w e t y u</code> are chromatic in-betweens.
                Tap the on-screen keys if you have no keyboard. All randomness is a seeded mulberry32 (seed{" "}
                <code>0x4296</code>); timing is <code>performance.now()</code> — no Math.random / Date.now.
              </p>
              <p>
                <strong className="text-foreground">References.</strong> &ldquo;Audio Interaction Model,&rdquo;
                arXiv:2606.05121 — a streaming perceive→decide→respond loop that decides <em>whether</em> a
                moment warrants a response. Pauline Oliveros, <em>Deep Listening</em> — attention and
                receptivity as the musical act. George Lewis, <em>Voyager</em> — an improvising system that
                decides its own participation. Unlike <em>Aria-Duet / &ldquo;The Ghost in the Keys&rdquo;</em>{" "}
                (2026), which needs an explicit handover signal, Breath <em>infers</em> the invitation from
                how you play.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
