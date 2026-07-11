"use client";

// 334 · Pass the Song — the lab's first multi-user / turn-taking KIDS piece.
//
// Two children on two tablets (or two browser tabs) in the same room pass a
// glowing creature back and forth and TAKE TURNS adding notes to build ONE
// shared song. When the creature is on YOUR screen you give it a note — by
// HUMMING (live pitch → snapped to the D-major scale) or by TAPPING one of the
// big glowing note-spots — then tap "send to friend" and the creature flies off
// the edge toward your friend over a BroadcastChannel. The growing song-ribbon
// of colored beads shows identically on both screens; every few turns the whole
// ribbon plays back as a song the two kids built together.
//
// Solo-demoable: if no second tab answers within ~4s, a cute robot friend takes
// the other side so one person sees the whole pass-back-and-forth loop.
//
// Renderer = inline SVG, animated by mutating refs in one rAF loop (the React
// tree is NOT re-rendered per frame).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEGREE_HUE,
  SCALE_LEN,
  snapToDegree,
  makeId,
  openChannel,
  type Bead,
  type Msg,
  type SongState,
} from "./sync";
import { SongAudio } from "./audio";

// Whose side the turn is on, from THIS tab's point of view.
type Phase =
  | "idle" // not started
  | "mine" // creature is here, child should give a note
  | "flying-out" // creature flying off to friend
  | "theirs" // friend's turn (real friend or robot)
  | "flying-in"; // creature arriving back to us

type FriendKind = "robot" | "real";

const PARTNER_TIMEOUT_MS = 4000; // no real partner by this → robot friend
const PING_MS = 1500; // presence heartbeat
const PLAYBACK_EVERY = 4; // play the whole ribbon back every N beads

export default function PassTheSong() {
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [beads, setBeads] = useState<Bead[]>([]);
  const [friendKind, setFriendKind] = useState<FriendKind>("robot");
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [pendingDegree, setPendingDegree] = useState<number | null>(null);

  // ── refs (don't trigger React re-render) ───────────────────────────────────
  const audioRef = useRef<SongAudio | null>(null);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const meRef = useRef<string>("");
  const friendRef = useRef<string>(""); // id of the real partner, if any
  const revRef = useRef<number>(0);
  const phaseRef = useRef<Phase>("idle");
  const beadsRef = useRef<Bead[]>([]);
  const pendingRef = useRef<number | null>(null);
  const friendKindRef = useRef<FriendKind>("robot");

  // animation refs
  const rafRef = useRef<number>(0);
  const creatureRef = useRef<SVGGElement>(null);
  const creatureBodyRef = useRef<SVGCircleElement>(null);
  const auraRef = useRef<SVGCircleElement>(null);
  const flyRef = useRef<{
    active: boolean;
    dir: "out" | "in";
    t0: number;
    dur: number;
    fromX: number;
    toX: number;
  }>({ active: false, dir: "out", t0: 0, dur: 700, fromX: 0, toX: 0 });
  const hueRef = useRef<number>(DEGREE_HUE[0]);
  const listenRef = useRef<boolean>(false); // are we sampling the mic now
  const heardRef = useRef<{ degree: number; frames: number }>({
    degree: -1,
    frames: 0,
  });

  // keep refs in sync with state we read inside the rAF / channel handlers
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  useEffect(() => {
    beadsRef.current = beads;
  }, [beads]);
  useEffect(() => {
    pendingRef.current = pendingDegree;
  }, [pendingDegree]);
  useEffect(() => {
    friendKindRef.current = friendKind;
  }, [friendKind]);

  // ── robot friend: receive creature, think, add a tasteful note, send back ───
  const robotTakeTurn = useCallback(() => {
    const audio = audioRef.current;
    const cur = beadsRef.current;
    // pick an in-scale degree that sounds good after the last note
    const last = cur.length ? cur[cur.length - 1].degree : 0;
    const opts = [last, last + 1, last - 1, last + 2, last - 2, last + 4].filter(
      (d) => d >= 0 && d < SCALE_LEN
    );
    const degree = opts[Math.floor(Math.random() * opts.length)] ?? 0;
    // a short "thinking" beat, then it adds its note and sends back to us
    window.setTimeout(() => {
      audio?.playDegree(degree, 0, 0.9);
      const next = [...beadsRef.current, { degree, by: "robot" as const }];
      beadsRef.current = next;
      setBeads(next);
      maybePlayback(next);
      // creature flies back IN to us
      window.setTimeout(() => {
        startFly("in", DEGREE_HUE[degree]);
      }, 450);
    }, 900 + Math.random() * 500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── playback: every few beads, replay the whole ribbon as a little song ─────
  const maybePlayback = useCallback((ribbon: Bead[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (ribbon.length === 0 || ribbon.length % PLAYBACK_EVERY !== 0) return;
    ribbon.forEach((b, i) => {
      audio.playDegree(b.degree, 0.6 + i * 0.34, 0.8);
    });
  }, []);

  // ── start a fly animation (out to friend, or in from friend) ────────────────
  const startFly = useCallback(
    (dir: "out" | "in", hue: number) => {
      const audio = audioRef.current;
      hueRef.current = hue;
      const W =
        typeof window !== "undefined" ? window.innerWidth || 360 : 360;
      // out: from centre → off right edge.  in: from off left edge → centre.
      const fromX = dir === "out" ? W / 2 : -120;
      const toX = dir === "out" ? W + 120 : W / 2;
      flyRef.current = {
        active: true,
        dir,
        t0: performance.now(),
        dur: 750,
        fromX,
        toX,
      };
      audio?.whoosh();
      setPhase(dir === "out" ? "flying-out" : "flying-in");
    },
    []
  );

  // ── commit the held note: add a bead, then fly the creature to the friend ───
  const sendToFriend = useCallback(() => {
    const deg = pendingRef.current;
    if (deg == null) return;
    const audio = audioRef.current;
    audio?.playDegree(deg, 0, 1);

    const next = [...beadsRef.current, { degree: deg, by: "me" as const }];
    beadsRef.current = next;
    setBeads(next);
    setPendingDegree(null);
    pendingRef.current = null;
    listenRef.current = false;
    heardRef.current = { degree: -1, frames: 0 };
    maybePlayback(next);

    // fly the creature OUT toward the friend
    startFly("out", DEGREE_HUE[deg]);

    // tell a real friend (if present) the new shared song + that it's their turn
    const chan = chanRef.current;
    if (friendKindRef.current === "real" && chan && friendRef.current) {
      revRef.current += 1;
      const state: SongState = {
        beads: next,
        holder: friendRef.current,
        fromEdge: "left", // arrives on their LEFT (mirror of our right exit)
        rev: revRef.current,
      };
      const msg: Msg = {
        t: "pass",
        id: meRef.current,
        to: friendRef.current,
        state,
      };
      chan.postMessage(msg);
    }
  }, [maybePlayback, startFly]);

  // ── when a fly-OUT finishes ─────────────────────────────────────────────────
  const onFlyOutDone = useCallback(() => {
    if (friendKindRef.current === "robot") {
      setPhase("theirs");
      robotTakeTurn();
    } else {
      // real friend now holds the creature; we wait for their "pass" back.
      setPhase("theirs");
    }
  }, [robotTakeTurn]);

  // ── when a fly-IN finishes: it's our turn again ─────────────────────────────
  const onFlyInDone = useCallback(() => {
    setPhase("mine");
    setPendingDegree(null);
    pendingRef.current = null;
    listenRef.current = audioRef.current?.hasMic() ?? false;
    heardRef.current = { degree: -1, frames: 0 };
  }, []);

  // ── pick a note by TAPPING a glowing spot (fallback / alternative input) ─────
  const tapNote = useCallback((degree: number) => {
    if (phaseRef.current !== "mine") return;
    audioRef.current?.playDegree(degree, 0, 1);
    setPendingDegree(degree);
    pendingRef.current = degree;
  }, []);

  // ── START button: create AudioContext + mic inside the user gesture ─────────
  const handleStart = useCallback(async () => {
    const audio = new SongAudio();
    audioRef.current = audio;
    await audio.start();

    // try mic (analysis-only). On failure we still run with tap + robot.
    try {
      await audio.startMic();
      setMicState("on");
    } catch {
      setMicState("denied");
    }

    const me = makeId();
    meRef.current = me;

    // open the channel + announce ourselves; listen for a real partner.
    const chan = openChannel();
    chanRef.current = chan;
    if (chan) {
      chan.onmessage = (ev: MessageEvent<Msg>) => onChannelMessage(ev.data);
      const ping: Msg = { t: "ping", id: me };
      chan.postMessage(ping);
    }

    setStarted(true);
    setBeads([]);
    beadsRef.current = [];
    // we start holding the creature: our turn.
    setPhase("mine");
    phaseRef.current = "mine";
    listenRef.current = audio.hasMic();

    // if nobody answers within the timeout, commit to the robot friend.
    window.setTimeout(() => {
      if (!friendRef.current) {
        setFriendKind("robot");
        friendKindRef.current = "robot";
      }
    }, PARTNER_TIMEOUT_MS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── channel handler ─────────────────────────────────────────────────────────
  const onChannelMessage = useCallback((msg: Msg) => {
    const chan = chanRef.current;
    const me = meRef.current;
    if (!chan || msg.id === me) return;
    switch (msg.t) {
      case "ping": {
        // a partner appeared — say hi back and remember them.
        friendRef.current = msg.id;
        setFriendKind("real");
        friendKindRef.current = "real";
        const pong: Msg = { t: "pong", id: me };
        chan.postMessage(pong);
        break;
      }
      case "pong": {
        friendRef.current = msg.id;
        setFriendKind("real");
        friendKindRef.current = "real";
        break;
      }
      case "pass": {
        if (msg.to !== me) return; // not for us
        // reconcile via rev counter, then receive the creature.
        if (msg.state.rev <= revRef.current) return;
        revRef.current = msg.state.rev;
        // beads from the friend: their newest is "friend"-coloured for us.
        const incoming = msg.state.beads.map((b, i) =>
          i === msg.state.beads.length - 1
            ? { degree: b.degree, by: "friend" as const }
            : b
        );
        beadsRef.current = incoming;
        setBeads(incoming);
        const lastHue =
          incoming.length > 0
            ? DEGREE_HUE[incoming[incoming.length - 1].degree]
            : DEGREE_HUE[0];
        startFly("in", lastHue);
        break;
      }
      case "bye": {
        if (msg.id === friendRef.current) {
          friendRef.current = "";
          setFriendKind("robot");
          friendKindRef.current = "robot";
        }
        break;
      }
    }
  }, [startFly]);

  // ── presence heartbeat ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const chan = chanRef.current;
    if (!chan) return;
    const iv = window.setInterval(() => {
      const ping: Msg = { t: "ping", id: meRef.current };
      chan.postMessage(ping);
    }, PING_MS);
    return () => window.clearInterval(iv);
  }, [started]);

  // ── the single rAF loop: mic sampling + creature animation ──────────────────
  useEffect(() => {
    if (!started) return;
    let mounted = true;

    const frame = () => {
      if (!mounted) return;
      const now = performance.now();
      const audio = audioRef.current;

      // 1) mic pitch sampling, only on OUR turn and only if no note picked yet
      if (
        listenRef.current &&
        phaseRef.current === "mine" &&
        pendingRef.current == null &&
        audio?.hasMic()
      ) {
        const hz = audio.detectPitch();
        if (hz > 0) {
          const deg = snapToDegree(hz);
          if (deg === heardRef.current.degree) {
            heardRef.current.frames += 1;
          } else {
            heardRef.current = { degree: deg, frames: 1 };
          }
          // sustained ~7 frames of the same degree → that's the child's note
          if (heardRef.current.frames === 7) {
            audio.playDegree(deg, 0, 1);
            setPendingDegree(deg);
            pendingRef.current = deg;
          }
        } else {
          heardRef.current.frames = Math.max(0, heardRef.current.frames - 1);
        }
      }

      // 2) creature animation
      const g = creatureRef.current;
      const body = creatureBodyRef.current;
      const aura = auraRef.current;
      const fly = flyRef.current;
      const W = window.innerWidth || 360;
      const cy = (window.innerHeight || 640) * 0.42;
      let x = W / 2;
      let breathe = 1;

      if (fly.active) {
        const p = Math.min(1, (now - fly.t0) / fly.dur);
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOut
        x = fly.fromX + (fly.toX - fly.fromX) * e;
        breathe = 1 + Math.sin(p * Math.PI) * 0.25;
        if (p >= 1) {
          fly.active = false;
          if (fly.dir === "out") onFlyOutDone();
          else onFlyInDone();
        }
      } else {
        // idle bob while waiting on our turn / their turn
        x = phaseRef.current === "theirs" ? W + 120 : W / 2;
        breathe = 1 + Math.sin(now / 600) * 0.06;
      }

      if (g) g.setAttribute("transform", `translate(${x.toFixed(1)} ${cy.toFixed(1)})`);
      const hue = hueRef.current;
      const pend = pendingRef.current;
      const glowHue = pend != null ? DEGREE_HUE[pend] : hue;
      if (body) {
        body.setAttribute("r", (38 * breathe).toFixed(1));
        body.setAttribute("fill", `hsl(${glowHue} 90% 64%)`);
      }
      if (aura) {
        const ar = 70 * breathe + (phaseRef.current === "mine" ? 16 : 0);
        aura.setAttribute("r", ar.toFixed(1));
        aura.setAttribute("fill", `hsl(${glowHue} 90% 60%)`);
        aura.setAttribute(
          "opacity",
          (0.22 + (phaseRef.current === "mine" ? 0.12 : 0)).toFixed(2)
        );
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [started, onFlyOutDone, onFlyInDone]);

  // ── teardown on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const chan = chanRef.current;
      if (chan) {
        try {
          const bye: Msg = { t: "bye", id: meRef.current };
          chan.postMessage(bye);
        } catch {
          /* noop */
        }
        chan.close();
      }
      chanRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  // ── render (structure only; per-frame motion is done in rAF via refs) ───────
  const myTurn = phase === "mine";
  const hasPending = pendingDegree != null;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0b0a14] text-foreground">
      {/* soft background wash */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 18%, rgba(139,92,246,0.16), transparent 60%), radial-gradient(120% 80% at 50% 100%, rgba(16,185,129,0.10), transparent 60%)",
        }}
      />

      {/* corner link to design notes */}
      <a
        href="/dream/334-kids-pass-the-song/README.md"
        className="absolute right-3 top-3 z-30 font-mono text-sm text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </a>

      {/* the SVG stage */}
      <svg
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>
        {/* the creature: aura + body + two friendly eyes */}
        <g ref={creatureRef}>
          <circle ref={auraRef} r="70" filter="url(#soft)" opacity="0.24" />
          <circle ref={creatureBodyRef} r="38" fill="hsl(265 90% 64%)" />
          <circle cx="-13" cy="-8" r="6" fill="#0b0a14" />
          <circle cx="13" cy="-8" r="6" fill="#0b0a14" />
          <circle cx="-11" cy="-10" r="2" fill="#fff" />
          <circle cx="15" cy="-10" r="2" fill="#fff" />
          <path
            d="M -12 12 Q 0 22 12 12"
            stroke="#0b0a14"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {/* the shared SONG RIBBON — one bead per turn, identical on both screens */}
      <div className="pointer-events-none absolute left-0 right-0 top-[58%] z-20 flex flex-wrap items-center justify-center gap-2 px-4">
        {beads.length === 0 ? (
          <div className="font-mono text-base text-muted-foreground">
            ✨ your song starts here ✨
          </div>
        ) : (
          beads.map((b, i) => (
            <span
              key={i}
              className="inline-block h-10 w-10 rounded-full ring-2 ring-border"
              style={{
                background: `hsl(${DEGREE_HUE[b.degree]} 88% 62%)`,
                boxShadow: `0 0 16px hsl(${DEGREE_HUE[b.degree]} 88% 62% / 0.7)`,
              }}
            />
          ))
        )}
      </div>

      {/* foreground UI */}
      <div className="relative z-20 flex min-h-screen flex-col items-center justify-end pb-8">
        {!started ? (
          <div className="mb-[18vh] flex flex-col items-center gap-5 px-6 text-center">
            <h1 className="text-3xl font-semibold text-foreground sm:text-5xl">
              Pass the Song 🎶
            </h1>
            <p className="max-w-md text-base text-muted-foreground sm:text-lg">
              Two friends, one song. Hum or tap to give the glowing friend a
              note, then send it across to your buddy. Take turns — your song
              grows!
            </p>
            <button
              onClick={handleStart}
              className="min-h-[64px] rounded-3xl bg-violet-500/30 px-10 py-4 text-2xl font-semibold text-foreground ring-2 ring-violet-300/60 transition hover:bg-violet-500/45 active:scale-95"
            >
              ▶ Start
            </button>
            <p className="font-mono text-sm text-muted-foreground">
              open in a second tab to play with a real friend 👫
            </p>
          </div>
        ) : (
          <>
            {/* who-am-I-playing-with badge */}
            <div className="absolute left-3 top-3 z-30">
              {friendKind === "real" ? (
                <span className="rounded-full bg-violet-500/20 px-4 py-2 text-base font-medium text-violet-300 ring-1 ring-violet-300/40">
                  Playing with a friend 👫
                </span>
              ) : (
                <span className="rounded-full bg-violet-500/20 px-4 py-2 text-base font-medium text-violet-300/95 ring-1 ring-violet-300/40">
                  Playing with the robot friend 🤖
                </span>
              )}
            </div>

            {/* mic-denied notice + assurance that tap still works */}
            {micState === "denied" && (
              <div className="absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-2xl bg-violet-500/10 px-4 py-2.5 text-center text-base text-violet-300 ring-1 ring-violet-300/30">
                No microphone — that&apos;s okay! Tap a glowing color to pick a
                note 🎨
              </div>
            )}

            {/* turn banner */}
            <div className="mb-4 text-center">
              {myTurn && !hasPending && (
                <p className="text-2xl font-semibold text-violet-300/95">
                  {micState === "on" ? "Your turn — hum or tap! 🎤" : "Your turn — tap a color! 🎨"}
                </p>
              )}
              {myTurn && hasPending && (
                <p className="text-2xl font-semibold text-foreground">
                  Nice! Now send it to your friend ✨
                </p>
              )}
              {phase === "theirs" && (
                <p className="text-2xl font-semibold text-muted-foreground">
                  {friendKind === "real"
                    ? "Your friend's turn… 👫"
                    : "Robot friend is thinking… 🤖"}
                </p>
              )}
              {(phase === "flying-out" || phase === "flying-in") && (
                <p className="text-2xl font-semibold text-muted-foreground">whoosh! ✨</p>
              )}
            </div>

            {/* big tappable note-spots (always available; the tap fallback) */}
            <div className="mb-5 flex flex-wrap items-center justify-center gap-3 px-4">
              {Array.from({ length: SCALE_LEN }, (_, d) => (
                <button
                  key={d}
                  onClick={() => tapNote(d)}
                  disabled={!myTurn}
                  aria-label={`note ${d + 1}`}
                  className="h-16 w-16 rounded-full ring-2 transition active:scale-90 disabled:opacity-30"
                  style={{
                    background: `hsl(${DEGREE_HUE[d]} 88% 60%)`,
                    boxShadow:
                      pendingDegree === d
                        ? `0 0 26px hsl(${DEGREE_HUE[d]} 88% 62%)`
                        : `0 0 10px hsl(${DEGREE_HUE[d]} 88% 62% / 0.5)`,
                    // ring colour cue when this note is the one we picked
                    // (inline so we don't fight Tailwind ring tokens)
                    outline:
                      pendingDegree === d ? "3px solid rgba(255,255,255,0.85)" : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>

            {/* the big SEND button */}
            <button
              onClick={sendToFriend}
              disabled={!myTurn || !hasPending}
              className="min-h-[64px] rounded-3xl bg-violet-500/30 px-10 py-4 text-2xl font-semibold text-foreground ring-2 ring-violet-300/60 transition hover:bg-violet-500/45 active:scale-95 disabled:opacity-30 disabled:ring-border"
            >
              ✨ send to friend
            </button>
          </>
        )}
      </div>
    </main>
  );
}
