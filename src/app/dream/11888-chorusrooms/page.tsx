"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11888-chorusrooms — A LISTENING ROOM THAT SPANS EVERY OPEN TAB, WITH NO SERVER.
//
//   Every open tab/window of this page is ONE voice in a shared ambient canon.
//   Tabs stay phase-locked through a leader-elected shared clock carried over the
//   browser's zero-server BroadcastChannel (same-origin, same-device) — no WebRTC,
//   no signaling, no backend. This is the "synchronized local-engine" model: each
//   tab runs its OWN Web Audio graph and renders the whole room; only tiny state
//   (pointer, liveness, downbeats) crosses between tabs. Move your pointer to shape
//   your voice's timbre and pan; open a second window and you literally add a player.
//
//   Muted-06:30 stand-in: from mount, three seeded phantom residents breathe a full
//   living room within ~1s with zero audio and zero peers. Tap "Join the room" to
//   sound it; open another tab to replace phantoms with people.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { Room } from "./room";
import { PhantomRoom, assignFromId } from "./demo";
import { Ensemble } from "./voice";
import { ChorusRoom, type OrbView, type RoomView } from "./render";
import { clamp01 } from "./prng";
import type { Participant } from "./types";

const RENDER_MS = 33; // ~30fps SVG refresh — calm scene, no need for 60

interface Frame {
  view: RoomView | null;
  peers: number;
  conducting: boolean;
}

export default function ChorusRoomsPage() {
  const roomRef = useRef<Room | null>(null);
  const phantomRef = useRef<PhantomRoom | null>(null);
  const ensembleRef = useRef<Ensemble | null>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const lastRenderRef = useRef<number>(0);

  const [frame, setFrame] = useState<Frame>({ view: null, peers: 0, conducting: true });
  const [started, setStarted] = useState(false);
  const [bcAvailable, setBcAvailable] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const room = new Room();
    const phantoms = new PhantomRoom();
    roomRef.current = room;
    phantomRef.current = phantoms;
    setBcAvailable(room.available);
    startRef.current = performance.now();

    const loop = (now: number) => {
      const t = (now - startRef.current) / 1000;
      room.update(now);

      const phase = room.getPhase(now);
      const bar = room.getBar();
      const self = room.getSelf();
      const peers = room.getPeers();
      const leaderId = room.getLeaderId();

      // Phantoms recede as real tabs join; fade the whole room in over ~0.8s so a
      // fresh muted tab settles into a full room within a second.
      const intro = clamp01(t / 0.8);
      const phantomPresence = clamp01(1 - peers.length * 0.28) * 0.55 * intro + 0.28 * intro;

      const participants: Participant[] = [];
      {
        const a = assignFromId(self.id);
        participants.push({
          id: self.id,
          kind: "self",
          px: self.px,
          py: self.py,
          slot: a.slot,
          scaleIdx: a.scaleIdx,
          presence: intro,
          conducting: leaderId === self.id,
        });
      }
      for (const p of peers) {
        const a = assignFromId(p.id);
        participants.push({
          id: p.id,
          kind: "peer",
          px: p.px,
          py: p.py,
          slot: a.slot,
          scaleIdx: a.scaleIdx,
          presence: 1,
          conducting: leaderId === p.id,
        });
      }
      for (const ph of phantoms.list(t, phantomPresence)) participants.push(ph);

      ensembleRef.current?.update(participants, phase, bar, now);
      const level = ensembleRef.current?.getLevel() ?? 0;

      // Throttled SVG snapshot.
      if (now - lastRenderRef.current >= RENDER_MS) {
        lastRenderRef.current = now;
        const breath = 0.88 + 0.12 * Math.sin(t * 0.35);
        const orbs: OrbView[] = participants.map((p) => {
          const since = (phase - p.slot + 1) % 1; // 0 right after this voice's entry
          const pulse = Math.exp(-since * 5);
          return {
            id: p.id,
            kind: p.kind,
            px: p.px,
            py: p.py,
            slot: p.slot,
            presence: p.presence,
            conducting: p.conducting,
            pulse,
          };
        });
        setFrame({
          view: { orbs, phase, breath, level },
          peers: peers.length,
          conducting: leaderId === self.id,
        });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ensembleRef.current?.dispose();
      ensembleRef.current = null;
      room.close();
      roomRef.current = null;
      phantomRef.current = null;
    };
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const room = roomRef.current;
    if (!room) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    room.setPointer(
      clamp01((e.clientX - rect.left) / rect.width),
      clamp01((e.clientY - rect.top) / rect.height),
    );
  }, []);

  const onJoin = useCallback(async () => {
    if (ensembleRef.current) return;
    try {
      const ens = new Ensemble();
      await ens.resume();
      ensembleRef.current = ens;
      setStarted(true);
      setError(null);
    } catch {
      setError("This browser blocked audio. The room keeps breathing silently.");
    }
  }, []);

  const conductingLabel = frame.conducting ? "You are conducting" : "In the ensemble";
  const peersLabel =
    frame.peers === 0 ? "no other tabs yet" : `${frame.peers} other tab${frame.peers === 1 ? "" : "s"}`;

  return (
    <main
      onPointerMove={onPointerMove}
      className="relative h-[100dvh] w-full touch-none overflow-hidden bg-background"
    >
      {frame.view ? <ChorusRoom view={frame.view} /> : null}

      {/* Header chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Dream · 11888-chorusrooms
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Chorus Rooms
          </h1>
          <p className="mt-2 max-w-md text-base leading-relaxed text-muted-foreground">
            A listening room that spans every open tab of this page — a single
            synchronized instrument with no server at all. Each tab is one voice in a
            shared canon, phase-locked by a leader-elected clock over the browser&apos;s
            BroadcastChannel. Move your pointer to shape your voice; open a second window
            to add a player to the room.
          </p>
          {!bcAvailable ? (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              This browser has no BroadcastChannel, so cross-tab sync is off — the seeded
              phantom room keeps playing on its own.
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm leading-relaxed text-destructive">{error}</p>
          ) : null}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-3 px-5">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
          {!started ? (
            <button
              type="button"
              onClick={onJoin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Join the room · sound your voice
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {conductingLabel} · {peersLabel}
            </span>
          )}
        </div>
        {!started ? (
          <p className="pointer-events-none max-w-sm text-center text-sm text-muted-foreground">
            The room is already breathing. Tap to hear it, then open this page in another
            window.
          </p>
        ) : null}
      </div>

      {/* Design notes button */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              One instrument, many tabs
            </h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Every open tab of this page is one voice in a shared ambient canon. There
                is no server: tabs on the same device and origin find each other over the
                browser&apos;s BroadcastChannel and exchange only tiny state — a pointer
                position, a liveness heartbeat, a downbeat. No audio ever streams between
                tabs.
              </p>
              <p>
                This is the <em>synchronized local-engine</em> model of browser networked
                music (as opposed to a single <em>shared instance</em>). Each tab runs its
                own Web Audio graph and renders the whole room locally; what keeps them
                together is a shared clock. The tab with the lowest id is, by unanimous
                agreement, the conductor — on each bar it broadcasts a downbeat, and every
                other tab nudges its local bar phase into agreement. Close the conductor
                and the next-lowest id simply takes over.
              </p>
              <p>
                Each voice sounds once per bar, exactly when the shared phase sweeps past
                its canon slot — so many tabs weave a slow round. The phase ribbon along
                the bottom shows that sweep; place two windows side by side and the
                playheads move in lock-step. Your pointer shapes only your own voice&apos;s
                brightness (height) and pan (width).
              </p>
              <p>
                A lone, muted tab is never empty: three seeded phantom residents breathe a
                full room within a second and take their turns in the canon. As real tabs
                join, the phantoms recede so the room is carried by the people in it.
              </p>
              <p>
                Determinism: nothing uses the platform RNG or the wall clock. Phantom drift,
                canon slots and pitches come from a seeded mulberry32; the clock derives
                from performance.now() and the audio context, corrected by exchanged
                downbeats. Everything is routed through the shared safe-master limiter, and
                all luminance change is a slow breath — no strobe.
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
      ) : null}

      <PrototypeNav slugs={["11888-chorusrooms"]} />
    </main>
  );
}
