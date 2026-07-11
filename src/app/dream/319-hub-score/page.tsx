"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHORD_PROGRESSION,
  DEFAULT_FIELD,
  HEARTBEAT_MS,
  JI_LABELS,
  JI_RATIOS,
  PRUNE_MS,
  breathGain,
  globalPhase,
  hueFor,
  makeId,
  openChannel,
  type HarmonyField,
  type Msg,
  type Voice,
} from "./sync";
import { Ensemble, nearestChordDegree } from "./audio";
import { drawScore, type DrawState } from "./score";

// ─────────────────────────────────────────────────────────────────────────────
// 319 · Hub Score — a server-less conducted ensemble.
//
// Every open tab of this URL is one sustained VOICE in a shared just-intonation
// drone over a D root. No server, no clock-sync handshake: the wall clock IS the
// conductor's baton — globalPhase(Date.now()) gives every same-origin tab the
// same slow breath at the same instant, so all voices swell together. A
// BroadcastChannel gossips presence, each tab's chosen chord-tone, and a shared
// "harmony field". Any tab can Take the baton to become conductor and step the
// field through a slow modal progression; everyone glides to match. Rendered as
// a Canvas2D living graphic score (a time-river of lanes), Ikeda-restrained.
//
// Lineage: The Hub (Bischoff/Perkis), The League of Automatic Music Composers,
// La Monte Young's Dream House, Ryoji Ikeda. See README.md.
// ─────────────────────────────────────────────────────────────────────────────

type Phase = "idle" | "running";

// Two gentle auto "ghost" voices so a lone tab already hears a chord breathing.
const GHOSTS: { id: string; degree: number }[] = [
  { id: "ghost-α", degree: 0 }, // root
  { id: "ghost-β", degree: 4 }, // fifth
];

export default function HubScorePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [field, setField] = useState<HarmonyField>(DEFAULT_FIELD);
  const [selfDegree, setSelfDegree] = useState(2); // a colour tone by default
  const [conductorId, setConductorId] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [noChannel, setNoChannel] = useState(false);
  const [noAudio, setNoAudio] = useState(false);

  // stable identity for this tab
  const selfIdRef = useRef<string>("");
  if (!selfIdRef.current) selfIdRef.current = makeId();
  const selfId = selfIdRef.current;
  const selfHue = hueFor(selfId);

  // mutable subsystems
  const chanRef = useRef<BroadcastChannel | null>(null);
  const ensembleRef = useRef<Ensemble | null>(null);
  const rosterRef = useRef<Map<string, Voice>>(new Map());
  const fieldRef = useRef<HarmonyField>(DEFAULT_FIELD);
  const conductorRef = useRef<{ id: string; at: number } | null>(null);
  const selfDegreeRef = useRef(selfDegree);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  // keep refs in sync with state the render loop reads
  useEffect(() => {
    fieldRef.current = field;
  }, [field]);
  useEffect(() => {
    selfDegreeRef.current = selfDegree;
  }, [selfDegree]);

  // ── broadcast helpers ──────────────────────────────────────────────────────
  const post = useCallback((m: Msg) => {
    chanRef.current?.postMessage(m);
  }, []);

  const announceVoice = useCallback(
    (degree: number) => {
      post({ t: "voice", id: selfId, degree, hue: selfHue });
    },
    [post, selfId, selfHue],
  );

  // ── pick which chord-tone I sing (any tab can do this) ─────────────────────
  const pickDegree = useCallback(
    (degree: number) => {
      const snapped = nearestChordDegree(degree, fieldRef.current);
      setSelfDegree(snapped);
      selfDegreeRef.current = snapped;
      ensembleRef.current?.ensureVoice(selfId, snapped, true);
      announceVoice(snapped);
    },
    [announceVoice, selfId],
  );

  // ── conductor: take the baton + shape the shared field ─────────────────────
  const takeBaton = useCallback(() => {
    const claim = { id: selfId, at: Date.now() };
    conductorRef.current = claim;
    setConductorId(selfId);
    post({ t: "conductor", id: selfId, at: claim.at });
    // also (re)broadcast the field so a late roster reconciles to us
    post({ t: "field", id: selfId, field: fieldRef.current });
  }, [post, selfId]);

  const broadcastField = useCallback(
    (next: HarmonyField) => {
      fieldRef.current = next;
      setField(next);
      ensembleRef.current?.setField(next);
      post({ t: "field", id: selfId, field: next });
      // my own tone re-snaps to the new chord
      const snapped = nearestChordDegree(selfDegreeRef.current, next);
      if (snapped !== selfDegreeRef.current) {
        setSelfDegree(snapped);
        selfDegreeRef.current = snapped;
        ensembleRef.current?.ensureVoice(selfId, snapped, true);
        announceVoice(snapped);
      }
    },
    [announceVoice, post, selfId],
  );

  const isConductor = conductorId === selfId;

  const stepChord = useCallback(
    (dir: number) => {
      if (!isConductor) return;
      const len = CHORD_PROGRESSION.length;
      const chordIndex = (fieldRef.current.chordIndex + dir + len) % len;
      broadcastField({ ...fieldRef.current, chordIndex, rev: fieldRef.current.rev + 1 });
    },
    [broadcastField, isConductor],
  );

  const nudge = useCallback(
    (key: "brightness" | "density", delta: number) => {
      if (!isConductor) return;
      const v = Math.min(1, Math.max(0, fieldRef.current[key] + delta));
      broadcastField({ ...fieldRef.current, [key]: v, rev: fieldRef.current.rev + 1 });
    },
    [broadcastField, isConductor],
  );

  const stepOctave = useCallback(
    (dir: number) => {
      if (!isConductor) return;
      const octave = Math.min(1, Math.max(-1, fieldRef.current.octave + dir));
      broadcastField({ ...fieldRef.current, octave, rev: fieldRef.current.rev + 1 });
    },
    [broadcastField, isConductor],
  );

  // ── incoming messages ──────────────────────────────────────────────────────
  const handleMsg = useCallback(
    (m: Msg) => {
      const now = Date.now();
      switch (m.t) {
        case "hello": {
          // welcome the newcomer with our voice + the current field + conductor
          if (m.id === selfId) break;
          post({
            t: "welcome",
            id: selfId,
            degree: selfDegreeRef.current,
            hue: selfHue,
            field: fieldRef.current,
          });
          if (conductorRef.current?.id === selfId) {
            post({ t: "conductor", id: selfId, at: conductorRef.current.at });
          }
          break;
        }
        case "welcome":
        case "voice":
        case "heartbeat": {
          if (m.id === selfId) break;
          const prev = rosterRef.current.get(m.id);
          rosterRef.current.set(m.id, {
            id: m.id,
            degree: m.degree,
            hue: m.hue,
            lastSeen: now,
          });
          if (!prev) ensembleRef.current?.ensureVoice(m.id, m.degree, false);
          else if (prev.degree !== m.degree)
            ensembleRef.current?.ensureVoice(m.id, m.degree, false);
          if (m.t === "welcome") {
            // reconcile to a field we may not have seen yet
            if (m.field.rev >= fieldRef.current.rev) {
              fieldRef.current = m.field;
              setField(m.field);
              ensembleRef.current?.setField(m.field);
            }
          }
          break;
        }
        case "field": {
          if (m.field.rev >= fieldRef.current.rev) {
            fieldRef.current = m.field;
            setField(m.field);
            ensembleRef.current?.setField(m.field);
            const snapped = nearestChordDegree(selfDegreeRef.current, m.field);
            if (snapped !== selfDegreeRef.current) {
              setSelfDegree(snapped);
              selfDegreeRef.current = snapped;
              ensembleRef.current?.ensureVoice(selfId, snapped, true);
            }
          }
          break;
        }
        case "conductor": {
          const cur = conductorRef.current;
          // last-to-take wins (latest timestamp)
          if (!cur || m.at >= cur.at) {
            conductorRef.current = { id: m.id, at: m.at };
            setConductorId(m.id);
          }
          break;
        }
        case "leave": {
          rosterRef.current.delete(m.id);
          ensembleRef.current?.removeVoice(m.id);
          if (conductorRef.current?.id === m.id) {
            conductorRef.current = null;
            setConductorId(null);
          }
          break;
        }
      }
    },
    [post, selfHue, selfId],
  );

  // ── canvas sizing ──────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    sizeRef.current = { w, h, dpr };
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // ── the start button: build audio + join the channel ───────────────────────
  const start = useCallback(() => {
    if (phase === "running") return;

    // audio
    try {
      const ens = new Ensemble(DEFAULT_FIELD);
      ens.resume();
      ensembleRef.current = ens;
      // my voice + the gentle ghosts
      ens.ensureVoice(selfId, selfDegreeRef.current, true);
      for (const g of GHOSTS) ens.ensureVoice(g.id, g.degree, false);
    } catch {
      setNoAudio(true);
    }

    // channel
    const chan = openChannel();
    if (!chan) {
      setNoChannel(true);
    } else {
      chanRef.current = chan;
      chan.onmessage = (e: MessageEvent<Msg>) => handleMsg(e.data);
      post({ t: "hello", id: selfId });
      announceVoice(selfDegreeRef.current);
    }

    setPhase("running");
  }, [announceVoice, handleMsg, phase, post, selfId]);

  // ── heartbeat + prune ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const hb = window.setInterval(() => {
      post({ t: "heartbeat", id: selfId, degree: selfDegreeRef.current, hue: selfHue });
      // prune stale peers
      const now = Date.now();
      for (const [id, v] of rosterRef.current) {
        if (now - v.lastSeen > PRUNE_MS) {
          rosterRef.current.delete(id);
          ensembleRef.current?.removeVoice(id);
          if (conductorRef.current?.id === id) {
            conductorRef.current = null;
            setConductorId(null);
          }
        }
      }
    }, HEARTBEAT_MS);
    return () => window.clearInterval(hb);
  }, [phase, post, selfHue, selfId]);

  // ── say goodbye on unload ──────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const bye = () => post({ t: "leave", id: selfId });
    window.addEventListener("pagehide", bye);
    window.addEventListener("beforeunload", bye);
    return () => {
      window.removeEventListener("pagehide", bye);
      window.removeEventListener("beforeunload", bye);
    };
  }, [phase, post, selfId]);

  // ── render + breath loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    let alive = true;

    const frame = () => {
      if (!alive) return;
      const phaseNow = globalPhase();
      const ens = ensembleRef.current;
      const levels = ens
        ? ens.tickBreath(phaseNow)
        : new Map<string, number>();

      // assemble the ordered voice list: self, peers, ghosts
      const voices: Voice[] = [];
      voices.push({ id: selfId, degree: selfDegreeRef.current, hue: selfHue, lastSeen: 0 });
      for (const v of rosterRef.current.values()) voices.push(v);
      for (const g of GHOSTS) {
        voices.push({
          id: g.id,
          degree: g.degree,
          hue: hueFor(g.id),
          lastSeen: 0,
          isGhost: true,
        });
      }
      // if audio failed, synthesize visual-only breathing levels so the score lives
      if (!ens) {
        for (const v of voices) {
          const off = (hueFor(v.id) % 360) / 360;
          levels.set(v.id, breathGain(phaseNow, off) / 1);
        }
      }

      setPeerCount(rosterRef.current.size);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const { w, h, dpr } = sizeRef.current;
        const state: DrawState = {
          voices,
          levels,
          phase: phaseNow,
          selfId,
          conductorId: conductorRef.current?.id ?? null,
          field: fieldRef.current,
          width: w,
          height: h,
          dpr,
        };
        drawScore(ctx, state);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      alive = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, selfHue, selfId]);

  // ── teardown on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        chanRef.current?.postMessage({ t: "leave", id: selfIdRef.current } as Msg);
      } catch {
        /* channel already closed */
      }
      chanRef.current?.close();
      ensembleRef.current?.dispose();
    };
  }, []);

  const chord = CHORD_PROGRESSION[field.chordIndex] ?? [0];

  // ── view ───────────────────────────────────────────────────────────────────
  return (
    <main className="relative flex min-h-screen w-full flex-col bg-[#050507] text-foreground">
      {/* the living score */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {/* idle gate */}
      {phase === "idle" && (
        <div className="relative z-10 m-auto max-w-lg px-6 text-center">
          <h1 className="font-mono text-2xl text-foreground">Hub Score</h1>
          <p className="mt-4 text-base text-foreground">
            Every open tab of this page is one sustained <span className="text-foreground">voice</span>{" "}
            in a single, server-less ensemble — a just-intonation drone over a D
            root that breathes together on the <span className="text-foreground">wall clock</span>.
            No server keeps time: the shared clock <em>is</em> the conductor&apos;s baton.
          </p>
          <p className="mt-4 text-base text-muted-foreground">
            Tap a degree to choose which chord-tone you sing. Take the baton to
            conduct the whole room&apos;s harmony — everyone glides to match.
          </p>
          <button
            onClick={start}
            className="mt-8 min-h-[44px] rounded-full border border-border bg-muted px-6 py-2.5 font-mono text-base text-foreground transition hover:bg-accent"
          >
            ▶ Start / Join the room
          </button>
          <p className="mt-6 text-base text-muted-foreground">
            Open this page in another tab to add a voice. A lone tab still hears
            two gentle ghost voices holding the chord.
          </p>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <>
          {/* top status */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between px-5 py-4">
            <p className="font-mono text-base text-muted-foreground">
              {peerCount + 1} {peerCount + 1 === 1 ? "voice" : "voices"}
              {peerCount === 0 ? " · solo" : ""}
              {isConductor ? " · you hold the baton" : conductorId ? " · conducted" : " · drifting"}
            </p>
            <p className="hidden font-mono text-base text-muted-foreground sm:block">
              breath ≈ 30s · wall-clock baton
            </p>
          </div>

          {peerCount === 0 && (
            <p className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 font-mono text-base text-muted-foreground">
              Open this page in another tab to add a voice.
            </p>
          )}

          {noChannel && (
            <p className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 px-4 text-center font-mono text-base text-violet-300/95">
              This browser blocks BroadcastChannel — running solo. Your voice
              still sings.
            </p>
          )}

          {noAudio && (
            <p className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 px-4 text-center font-mono text-base text-violet-300">
              Web Audio unavailable — showing the silent score only.
            </p>
          )}

          {/* bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col gap-3 px-4 pb-5 pt-2">
            {/* your degree picker */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="font-mono text-base text-muted-foreground">your tone</span>
              {JI_RATIOS.map((_, d) => {
                const inChord = chord.includes(d);
                const mine = selfDegree === d;
                return (
                  <button
                    key={d}
                    onClick={() => pickDegree(d)}
                    className={`min-h-[44px] rounded-md border px-3 py-2.5 font-mono text-base transition ${
                      mine
                        ? "border-border bg-muted text-foreground"
                        : inChord
                          ? "border-border bg-muted text-foreground hover:bg-accent"
                          : "border-border text-muted-foreground hover:bg-accent"
                    }`}
                    style={mine ? { boxShadow: `0 0 0 1px hsla(${selfHue},70%,60%,0.6)` } : undefined}
                  >
                    {JI_LABELS[d]}
                  </button>
                );
              })}
            </div>

            {/* conductor row */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {!isConductor ? (
                <button
                  onClick={takeBaton}
                  className="min-h-[44px] rounded-full border border-border bg-muted px-5 py-2.5 font-mono text-base text-foreground transition hover:bg-accent"
                >
                  Take the baton
                </button>
              ) : (
                <>
                  <button
                    onClick={() => stepChord(-1)}
                    className="min-h-[44px] rounded-md border border-border px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
                  >
                    ◀ chord
                  </button>
                  <button
                    onClick={() => stepChord(1)}
                    className="min-h-[44px] rounded-md border border-border px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
                  >
                    chord ▶
                  </button>
                  <button
                    onClick={() => nudge("brightness", 0.12)}
                    className="min-h-[44px] rounded-md border border-border px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
                  >
                    brighter
                  </button>
                  <button
                    onClick={() => nudge("brightness", -0.12)}
                    className="min-h-[44px] rounded-md border border-border px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
                  >
                    darker
                  </button>
                  <button
                    onClick={() => nudge("density", 0.12)}
                    className="min-h-[44px] rounded-md border border-border px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
                  >
                    denser
                  </button>
                  <button
                    onClick={() => nudge("density", -0.12)}
                    className="min-h-[44px] rounded-md border border-border px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
                  >
                    sparser
                  </button>
                  <button
                    onClick={() => stepOctave(1)}
                    className="min-h-[44px] rounded-md border border-border px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
                  >
                    oct +
                  </button>
                  <button
                    onClick={() => stepOctave(-1)}
                    className="min-h-[44px] rounded-md border border-border px-4 py-2.5 font-mono text-base text-foreground hover:bg-accent"
                  >
                    oct −
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <a
        href="/dream/319-hub-score/README.md"
        className="absolute right-4 top-4 z-10 font-mono text-base text-muted-foreground underline-offset-4 hover:underline"
      >
        Read the design notes
      </a>
    </main>
  );
}
