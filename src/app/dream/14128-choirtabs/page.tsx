"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14128-choirtabs — YOUR TABS AND DEVICES BECOME A CHOIR SINGING A CANON.
//
//   THE ONE QUESTION: What if you and your other browser tabs/devices became a
//   live CHOIR singing your OWN recorded piano as a canon — every voice locked to
//   one shared clock, entering in staggered rounds?
//
//   Every open tab of this page is ONE voice in a canon of Karel's real recorded
//   piano. A leader-elected shared clock rides the browser's zero-server
//   BroadcastChannel (same-origin, same-browser) so every tab's local engine stays
//   phase-locked: each voice enters after its assigned bar-delay, loops its phrase
//   gaplessly, and the round re-forms whenever you change your track or delay.
//
//   Demoable in a SINGLE tab: within ~1s it auto-spawns virtual voices so the
//   canon is audible and visible immediately; real tabs join and replace them.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS } from "../_shared/welcomeHome";
import {
  BEATS_PER_BAR,
  Choir,
  LOOP_BEATS,
} from "./clock";
import { Engine, type VoiceSpec } from "./voices";
import { Field, type FieldVoice, MAX_VOICES } from "./gl";

// ── Seeded PRNG (no Math.random — determinism gate) ──────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const modPos = (x: number, m: number) => ((x % m) + m) % m;

const DELAY_OPTIONS = [0, 1, 2, 3];

// Three seeded virtual stand-ins so a lone tab is never silent or empty.
interface Virtual {
  id: string;
  trackId: string;
  delayBars: number;
}
function makeVirtuals(): Virtual[] {
  const rnd = mulberry32(0x14128);
  const out: Virtual[] = [];
  for (let i = 0; i < 3; i++) {
    const trackId = REAL_TRACKS[Math.floor(rnd() * REAL_TRACKS.length)].id;
    out.push({ id: `virtual-${i}`, trackId, delayBars: i + 1 });
  }
  return out;
}

interface VoiceView {
  id: string;
  title: string;
  x: number;
  kind: number; // 0 peer, 1 self, 2 leader-peer, 3 self+leader
  isSelf: boolean;
  isLeader: boolean;
  isVirtual: boolean;
}

interface Snapshot {
  voices: VoiceView[];
  peers: number;
  playing: boolean;
}

const trackTitle = (id: string) =>
  REAL_TRACKS.find((t) => t.id === id)?.title ?? "—";

export default function ChoirTabsPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const choirRef = useRef<Choir | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const fieldRef = useRef<Field | null>(null);
  const virtualsRef = useRef<Virtual[]>([]);
  const rafRef = useRef<number>(0);
  const startPerfRef = useRef<number>(0);
  const lastSnapRef = useRef<number>(0);

  const [selfTrackId, setSelfTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [selfDelayBars, setSelfDelayBars] = useState<number>(0);
  const [started, setStarted] = useState(false);
  const [glOk, setGlOk] = useState(true);
  const [bcAvailable, setBcAvailable] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot>({
    voices: [],
    peers: 0,
    playing: false,
  });

  // ── Main loop: clock → engine → field, all off the shared beat ─────────────
  useEffect(() => {
    virtualsRef.current = makeVirtuals();
    const choir = new Choir(REAL_TRACKS[0].id, 0);
    choirRef.current = choir;
    setBcAvailable(choir.available);
    startPerfRef.current = performance.now();

    const canvas = canvasRef.current;
    if (canvas) {
      const field = new Field(canvas);
      fieldRef.current = field;
      setGlOk(field.ok);
    }

    const ro = new ResizeObserver(() => {
      const c = canvasRef.current;
      const f = fieldRef.current;
      if (c && f) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        f.resize(c.clientWidth, c.clientHeight, dpr);
      }
    });
    if (canvas) ro.observe(canvas);

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const t = (now - startPerfRef.current) / 1000;
      choir.update(now);

      const beat = choir.getContinuousBeat(now);
      const playing = choir.getPlaying();
      const leaderId = choir.getLeaderId();
      const self = choir.getSelfVoice();
      const peers = choir.getPeerVoices();

      // Replace virtual stand-ins one-for-one as real peers arrive.
      const virtualCount = Math.max(0, Math.min(3, 3 - peers.length));
      const virtuals = virtualsRef.current.slice(0, virtualCount);

      // Build the full ensemble: self + peers + virtual stand-ins.
      const raw: {
        id: string;
        trackId: string;
        delayBars: number;
        isSelf: boolean;
        isLeader: boolean;
        isVirtual: boolean;
      }[] = [];
      raw.push({
        id: self.id,
        trackId: self.trackId,
        delayBars: self.delayBars,
        isSelf: true,
        isLeader: leaderId === self.id,
        isVirtual: false,
      });
      for (const p of peers) {
        raw.push({
          id: p.id,
          trackId: p.trackId,
          delayBars: p.delayBars,
          isSelf: false,
          isLeader: leaderId === p.id,
          isVirtual: false,
        });
      }
      for (const v of virtuals) {
        raw.push({
          id: v.id,
          trackId: v.trackId,
          delayBars: v.delayBars,
          isSelf: false,
          isLeader: false,
          isVirtual: true,
        });
      }
      // Stable left→right order by canon entry, then id.
      raw.sort((a, b) =>
        a.delayBars !== b.delayBars
          ? a.delayBars - b.delayBars
          : a.id < b.id
            ? -1
            : 1,
      );
      const list = raw.slice(0, MAX_VOICES);

      // Drive the audio engine (plays the WHOLE choir locally, phase-locked).
      const engine = engineRef.current;
      if (engine) {
        const specs: VoiceSpec[] = list.map((v) => ({
          id: v.id,
          trackId: v.trackId,
          delayBars: v.delayBars,
        }));
        engine.update(specs, beat, playing);
      }
      const level = engine ? engine.getLevel() : 0;

      // Per-voice visual activation from the shared beat: flares on each onset.
      const n = list.length;
      const fieldVoices: FieldVoice[] = [];
      for (let i = 0; i < n; i++) {
        const v = list[i];
        const x = n <= 1 ? 0.5 : 0.09 + (i / (n - 1)) * 0.82;
        const delayBeats = v.delayBars * BEATS_PER_BAR;
        const entered = playing && beat >= delayBeats - 0.001;
        const phaseInLoop = entered ? modPos(beat - delayBeats, LOOP_BEATS) : 0;
        const onset = entered ? Math.exp(-phaseInLoop * 0.9) : 0;
        const beatFrac = beat - Math.floor(beat);
        const shimmer = entered ? 0.15 * Math.exp(-beatFrac * 3) : 0;
        const activation = clamp01(onset + shimmer * 0.4);
        const idle = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
        const vlevel = playing
          ? entered
            ? clamp01(0.28 + 0.55 * level + 0.32 * onset)
            : 0.05
          : idle;
        const kind =
          (v.isSelf ? 1 : 0) + (v.isLeader ? 2 : 0);
        fieldVoices.push({ x, level: vlevel, kind, activation });
      }

      const field = fieldRef.current;
      if (field && field.ok) {
        const barPhase = modPos(beat, BEATS_PER_BAR) / BEATS_PER_BAR;
        field.draw({
          voices: fieldVoices,
          beatPhase: barPhase,
          level,
          time: t,
        });
      }

      // Throttled React snapshot for the label chips + status readout.
      if (now - lastSnapRef.current > 110) {
        lastSnapRef.current = now;
        const views: VoiceView[] = list.map((v, i) => ({
          id: v.id,
          title: trackTitle(v.trackId),
          x: n <= 1 ? 0.5 : 0.09 + (i / (n - 1)) * 0.82,
          kind: (v.isSelf ? 1 : 0) + (v.isLeader ? 2 : 0),
          isSelf: v.isSelf,
          isLeader: v.isLeader,
          isVirtual: v.isVirtual,
        }));
        setSnap({ voices: views, peers: peers.length, playing });
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      choir.close();
      engineRef.current?.dispose();
      engineRef.current = null;
      fieldRef.current?.dispose();
      fieldRef.current = null;
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────
  const runJoin = useCallback(async () => {
    setError(null);
    try {
      if (!engineRef.current) {
        const engine = new Engine();
        engineRef.current = engine;
        await engine.resume();
      } else {
        await engineRef.current.resume();
      }
      choirRef.current?.setPlaying(true, performance.now());
      setStarted(true);
    } catch {
      setError("Could not start audio in this browser.");
    }
  }, []);

  const runToggle = useCallback(async () => {
    const choir = choirRef.current;
    if (!choir) return;
    if (!started || !engineRef.current) {
      await runJoin();
      return;
    }
    await engineRef.current.resume();
    choir.setPlaying(!choir.getPlaying(), performance.now());
  }, [started, runJoin]);

  const applySelfTrack = useCallback(
    (id: string) => {
      setSelfTrackId(id);
      choirRef.current?.setSelfVoice(id, selfDelayBars);
    },
    [selfDelayBars],
  );

  const applySelfDelay = useCallback(
    (bars: number) => {
      setSelfDelayBars(bars);
      choirRef.current?.setSelfVoice(selfTrackId, bars);
    },
    [selfTrackId],
  );

  const playing = snap.playing;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-10 text-foreground">
      <PrototypeNav slugs={["14128-choirtabs"]} />

      {/* Hero */}
      <header className="mb-6">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          14128 · choirtabs
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          A choir of your tabs, singing a canon
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Every open tab becomes one voice in a canon of Karel&rsquo;s real
          recorded piano. A leader-elected shared clock keeps every voice
          phase-locked; each enters after its own bar-delay and loops in a round.
          <span className="text-foreground">
            {" "}
            Open this page in another tab to add a voice.
          </span>
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runToggle}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {!started
              ? "Join the choir"
              : playing
                ? "Stop the choir"
                : "Play the choir"}
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </header>

      {/* Voice field */}
      <section className="relative">
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg border border-border bg-background">
          <canvas ref={canvasRef} className="h-full w-full" />

          {!glOk && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">
                WebGL2 is unavailable in this browser, so the voice-field
                can&rsquo;t render — the audio canon still plays.
              </p>
            </div>
          )}

          {/* Voice label chips over the field */}
          {glOk &&
            snap.voices.map((v) => (
              <div
                key={v.id}
                className="pointer-events-none absolute top-2 -translate-x-1/2"
                style={{ left: `${v.x * 100}%` }}
              >
                <div
                  className={`flex flex-col items-center gap-0.5 rounded-md border px-2 py-1 font-mono text-[10px] backdrop-blur-sm ${
                    v.isSelf
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-border bg-background/50 text-muted-foreground"
                  }`}
                >
                  <span className="max-w-[10ch] truncate">{v.title}</span>
                  <span className="flex gap-1">
                    {v.isSelf && (
                      <span className="text-primary">you</span>
                    )}
                    {v.isLeader && <span>· clock</span>}
                    {v.isVirtual && <span className="opacity-60">· sim</span>}
                  </span>
                </div>
              </div>
            ))}
        </div>

        {/* Status readout */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-muted-foreground">
          <span>
            voices <span className="text-foreground">{snap.voices.length}</span>
          </span>
          <span>
            other tabs <span className="text-foreground">{snap.peers}</span>
          </span>
          <span>
            transport{" "}
            <span className="text-foreground">
              {playing ? "playing" : "stopped"}
            </span>
          </span>
          {!bcAvailable && (
            <span className="text-destructive">
              BroadcastChannel unavailable — running solo
            </span>
          )}
        </div>
      </section>

      {/* Your voice controls */}
      <section className="mt-8 grid gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="track"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Your voice&rsquo;s track
          </label>
          <select
            id="track"
            value={selfTrackId}
            onChange={(e) => applySelfTrack(e.target.value)}
            className="min-h-[44px] w-full rounded-md border border-border bg-background/60 px-3 text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {REAL_TRACKS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-foreground">
            Your canon entry delay
          </span>
          <div className="flex gap-2">
            {DELAY_OPTIONS.map((bars) => (
              <button
                key={bars}
                type="button"
                onClick={() => applySelfDelay(bars)}
                className={`min-h-[44px] flex-1 rounded-md border px-3 text-sm transition-colors ${
                  selfDelayBars === bars
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {bars === 0 ? "lead" : `+${bars} bar${bars > 1 ? "s" : ""}`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Change your track or delay while it plays — the round re-forms live.
          </p>
        </div>
      </section>

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question:</span> what
                if you and your other tabs/devices became a live choir singing
                your own recorded piano as a canon — every voice locked to one
                shared clock, entering in staggered rounds?
              </p>
              <p>
                <span className="text-foreground">The shared clock.</span> Every
                tab runs its own Web Audio graph and plays the whole choir
                locally; only tiny state crosses a single same-origin
                BroadcastChannel. The tab with the lowest id is the leader: it
                owns the tempo and broadcasts periodic clock ticks. Followers
                treat a tick&rsquo;s arrival as &ldquo;the beat is this value
                now&rdquo; and extrapolate between ticks off performance.now(), so
                a dropped message just means a brief free-run at the same tempo.
                Close the leader and the next-lowest id takes over automatically.
              </p>
              <p>
                <span className="text-foreground">The canon.</span> Each voice
                loops a phrase of the real recording. We never set{" "}
                <code>source.loop</code>; a ~100ms lookahead scheduler queues
                successive buffer sources so each phrase lands on its beat
                boundary with an equal-power crossfade at the seam. A
                voice&rsquo;s entry-delay offsets its phrase grid, so voices enter
                in staggered rounds and weave a canon.
              </p>
              <p>
                <span className="text-foreground">Lineage.</span> The canon /
                round is a centuries-old imitative form. The browser-collaborative
                pattern here is &ldquo;broadcast control, not audio&rdquo; — the
                sub-50ms multiplayer model of shared online sequencers, where
                clients exchange state and each renders sound locally. It extends
                the lab&rsquo;s own <code>11888-chorusrooms</code>, fixing that
                piece&rsquo;s synthesized voices by singing Karel&rsquo;s real
                catalog instead.
              </p>
              <p>
                <span className="text-foreground">Honest limits.</span>{" "}
                BroadcastChannel is same-browser only, so &ldquo;devices&rdquo;
                means profiles/windows in the same browser on one machine. True
                cross-device sync needs a WebRTC or WebSocket relay, which is out
                of scope this cycle.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
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
