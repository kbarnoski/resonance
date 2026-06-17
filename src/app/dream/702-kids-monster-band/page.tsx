"use client";

/*
 * KIDS MONSTER BAND — 702
 * "What if two little kids on two phones build ONE goofy monster groove
 *  together — a beat neither could make alone?"
 *
 * Two browser tabs/phones open the SAME url -> they join ONE room over
 * BroadcastChannel (same-origin, NO server, NO network). Both devices are
 * phase-locked to ONE shared 16-step loop (~96 BPM) via a shared beat-zero
 * epoch. Each player is a big googly MONSTER with 4 huge silly sound buttons
 * (boom belly drum, honk mouth, pop, boing). Tapping drops that sound on the
 * nearest step and it LOOPS. The two patterns overlay into one emergent
 * groove. Each monster squashes on every hit — including the friend's hits —
 * so each kid SEES the other playing.
 *
 * Reference: Toca Band (Toca Boca) + Yamaha Tenori-on + The Hub / League of
 * Automatic Music Composers (networked ensemble). See README.md.
 */

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  makeAudio,
  runVoice,
  STEPS,
  STEP_DUR,
  type MonsterAudio,
  type VoiceId,
} from "./audio";
import {
  makeClock,
  makeEmptyPattern,
  randomId,
  ROOM_NAME,
  VOICES,
  type Msg,
  type Pattern,
} from "./room";

// ---- button identity -------------------------------------------------------
const VOICE_META: Record<
  VoiceId,
  { label: string; emoji: string; color: string }
> = {
  boom: { label: "BOOM", emoji: "🥁", color: "#ff5d8f" },
  honk: { label: "HONK", emoji: "📯", color: "#ffd23f" },
  pop: { label: "POP", emoji: "🫧", color: "#3ddc97" },
  boing: { label: "BOING", emoji: "🌀", color: "#7b8cff" },
};
const MONSTER_COLOR = ["#ff7a3c", "#46c2ff"]; // me, friend

// A friendly built-in pattern the GHOST friend plays when nobody else is here.
function makeGhostPattern(): Pattern {
  const p = makeEmptyPattern();
  // a gentle complementary backbeat: boom on off-beats, honk syncopation
  [4, 12].forEach((s) => (p.boom[s] = true));
  [2, 7, 10, 15].forEach((s) => (p.pop[s] = true));
  [6, 14].forEach((s) => (p.honk[s] = true));
  return p;
}

// ============================ 3D MONSTER ====================================

type HitFn = () => number; // returns last-hit timestamp (perf ms) for squash

function Monster({
  color,
  getSquash,
  faceRight,
  label,
}: {
  color: string;
  getSquash: HitFn;
  faceRight: boolean;
  label: string;
}) {
  const body = useRef<THREE.Group>(null);
  const eyeL = useRef<THREE.Mesh>(null);
  const eyeR = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const now = performance.now();
    const since = (now - getSquash()) / 1000;
    // squash & stretch envelope: pops up then settles
    const env = since < 0.45 ? Math.max(0, 1 - since / 0.45) : 0;
    const pop = Math.sin(env * Math.PI) * 0.9; // 0..0.9
    const t = clock.elapsedTime;
    const breathe = Math.sin(t * 1.6) * 0.04;
    if (body.current) {
      const sx = 1 + pop * 0.35 + breathe;
      const sy = 1 - pop * 0.3 + breathe * 0.5;
      body.current.scale.set(sx, sy, sx);
      body.current.position.y = pop * 0.5 + Math.sin(t * 1.6) * 0.05;
      body.current.rotation.z = Math.sin(t * 0.8) * 0.05 + (faceRight ? -0.05 : 0.05);
    }
    // googly eyes wobble
    const wob = Math.sin(t * 5 + (faceRight ? 1 : 0)) * 0.06;
    if (eyeL.current) eyeL.current.position.x = -0.32 + wob;
    if (eyeR.current) eyeR.current.position.x = 0.32 + wob;
  });

  const dir = faceRight ? 1 : -1;
  return (
    <group position={[0, -0.2, 0]}>
      <group ref={body}>
        {/* body blob */}
        <mesh castShadow>
          <sphereGeometry args={[1.15, 48, 48]} />
          <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
        </mesh>
        {/* belly */}
        <mesh position={[0, -0.25, 1.0]} scale={[0.7, 0.55, 0.4]}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshStandardMaterial color={"#ffffff"} opacity={0.18} transparent />
        </mesh>
        {/* eyes */}
        <group position={[0, 0.45, 0.85]}>
          <mesh ref={eyeL} position={[-0.32, 0, 0]}>
            <sphereGeometry args={[0.3, 24, 24]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh ref={eyeR} position={[0.32, 0, 0]}>
            <sphereGeometry args={[0.3, 24, 24]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          <mesh position={[-0.32, 0, 0.22]}>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
          <mesh position={[0.32, 0, 0.22]}>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color="#1a1a2e" />
          </mesh>
        </group>
        {/* big silly smile */}
        <mesh position={[0, -0.15, 1.0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.4, 0.09, 12, 24, Math.PI]} />
          <meshStandardMaterial color="#2b1b3a" />
        </mesh>
        {/* two little horns */}
        <mesh position={[-0.5 * dir, 1.05, 0]} rotation={[0, 0, dir * 0.3]}>
          <coneGeometry args={[0.18, 0.5, 16]} />
          <meshStandardMaterial color="#fff3c4" />
        </mesh>
        <mesh position={[0.5 * dir, 1.05, 0]} rotation={[0, 0, -dir * 0.3]}>
          <coneGeometry args={[0.18, 0.5, 16]} />
          <meshStandardMaterial color="#fff3c4" />
        </mesh>
        {/* stubby feet */}
        <mesh position={[-0.45, -1.15, 0.3]}>
          <sphereGeometry args={[0.32, 20, 20]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[0.45, -1.15, 0.3]}>
          <sphereGeometry args={[0.32, 20, 20]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      </group>
      <pointLight position={[0, 1.5, 2]} intensity={6} distance={6} color={color} />
      {/* label below */}
      <Banner text={label} y={-1.8} color={color} />
    </group>
  );
}

function Banner({ text, y, color }: { text: string; y: number; color: string }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 256, 64);
    g.font = "bold 34px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(text, 128, 36);
    const t = new THREE.CanvasTexture(c);
    t.needsUpdate = true;
    return t;
  }, [text, color]);
  return (
    <sprite position={[0, y, 0]} scale={[2.2, 0.55, 1]}>
      <spriteMaterial map={tex} transparent />
    </sprite>
  );
}

function Scene({
  meSquash,
  friendSquash,
  friendPresent,
  ghostMode,
}: {
  meSquash: HitFn;
  friendSquash: HitFn;
  friendPresent: boolean;
  ghostMode: boolean;
}) {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[3, 6, 5]} intensity={1.1} />
      <group position={[friendPresent || ghostMode ? -1.7 : 0, 0, 0]}>
        <Monster
          color={MONSTER_COLOR[0]}
          getSquash={meSquash}
          faceRight
          label="YOU"
        />
      </group>
      {(friendPresent || ghostMode) && (
        <group position={[1.7, 0, 0]}>
          <Monster
            color={MONSTER_COLOR[1]}
            getSquash={friendSquash}
            faceRight={false}
            label={ghostMode ? "GHOST" : "FRIEND"}
          />
        </group>
      )}
    </>
  );
}

// ============================ MAIN PAGE =====================================

export default function Page() {
  const [started, setStarted] = useState(false);
  const [friendPresent, setFriendPresent] = useState(false);
  const [ghostMode, setGhostMode] = useState(true); // ghost plays until a friend joins
  const [, forceTick] = useState(0);

  // my editable pattern (drives my monster + my audio)
  const [myPattern, setMyPattern] = useState<Pattern>(makeEmptyPattern);
  // current playhead step for the big visual ring
  const [playStep, setPlayStep] = useState(0);

  // refs that the scheduler / sync read without re-rendering
  const audioRef = useRef<MonsterAudio | null>(null);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const myIdRef = useRef<string>(randomId());
  const epochRef = useRef<number>(0); // shared beat-zero, perf ms
  const audioEpochRef = useRef<number>(0); // ctx time of beat zero
  const myPatternRef = useRef<Pattern>(myPattern);
  const friendPatternRef = useRef<Pattern>(makeEmptyPattern());
  const ghostPatternRef = useRef<Pattern>(makeGhostPattern());
  const revRef = useRef<number>(0);
  const friendSeenRef = useRef<number>(0); // last perf ms we heard from friend
  const lastTapRef = useRef<number>(performance.now());

  // squash timestamps for the monsters (perf ms of last hit)
  const meSquashRef = useRef<number>(0);
  const friendSquashRef = useRef<number>(0);

  useEffect(() => {
    myPatternRef.current = myPattern;
  }, [myPattern]);

  // ---- broadcast my pattern (last-write-wins via incrementing rev) --------
  function broadcastPattern() {
    const bc = bcRef.current;
    if (!bc) return;
    revRef.current += 1;
    const m: Msg = {
      type: "pattern",
      id: myIdRef.current,
      rev: revRef.current,
      pattern: myPatternRef.current,
      t: performance.now(),
    };
    bc.postMessage(m);
  }

  // ---- toggle a bead (big-button tap drops sound on nearest step) ---------
  function tapVoice(voice: VoiceId) {
    if (!started) return;
    lastTapRef.current = performance.now();
    // play instantly for <100ms feedback
    const a = audioRef.current;
    if (a) runVoice(a, voice, a.ctx.currentTime + 0.001, 0.35, 1);
    meSquashRef.current = performance.now();
    // tell the friend's screen about this live tap so their copy of MY
    // monster squashes the instant I press (not just on the looped bead)
    bcRef.current?.postMessage({
      type: "hit",
      id: myIdRef.current,
      voice,
      step: nearestStep(),
      t: performance.now(),
    } as Msg);

    // drop on the NEAREST step to the current playhead
    const step = nearestStep();
    setMyPattern((prev) => {
      const next: Pattern = {
        boom: [...prev.boom],
        honk: [...prev.honk],
        pop: [...prev.pop],
        boing: [...prev.boing],
      };
      next[voice][step] = !next[voice][step];
      myPatternRef.current = next;
      return next;
    });
    broadcastPattern();
  }

  function nearestStep(): number {
    const a = audioRef.current;
    if (!a) return 0;
    const elapsed = a.ctx.currentTime - audioEpochRef.current;
    const phase = ((elapsed % (STEP_DUR * STEPS)) + STEP_DUR * STEPS) %
      (STEP_DUR * STEPS);
    return Math.round(phase / STEP_DUR) % STEPS;
  }

  // ---- START (user gesture -> create + resume AudioContext) ---------------
  function start() {
    if (started) return;
    const a = makeAudio();
    audioRef.current = a;
    void a.ctx.resume();

    // shared clock setup: claim epoch now; joiners adopt via welcome
    const nowPerf = performance.now();
    epochRef.current = nowPerf;
    const clk = makeClock(epochRef.current, nowPerf, a.ctx.currentTime);
    audioEpochRef.current = clk.audioTimeOfEpoch;

    // broadcast channel
    const bc = new BroadcastChannel(ROOM_NAME);
    bcRef.current = bc;
    bc.onmessage = (ev) => onMessage(ev.data as Msg);
    // say hello; if someone is already here they reply welcome (with THEIR epoch)
    const hello: Msg = {
      type: "hello",
      id: myIdRef.current,
      epoch: epochRef.current,
      t: nowPerf,
    };
    bc.postMessage(hello);

    setStarted(true);
  }

  // ---- handle inbound room messages ---------------------------------------
  function onMessage(m: Msg) {
    if (m.id === myIdRef.current) return;
    const a = audioRef.current;
    switch (m.type) {
      case "hello": {
        // a friend just joined. Reply welcome with the canonical epoch
        // (whoever has the EARLIER epoch wins, so both converge).
        if (m.epoch < epochRef.current) adoptEpoch(m.epoch);
        const welcome: Msg = {
          type: "welcome",
          id: myIdRef.current,
          epoch: epochRef.current,
          t: performance.now(),
        };
        bcRef.current?.postMessage(welcome);
        // also resend my pattern so they see my beads immediately
        broadcastPattern();
        markFriend();
        break;
      }
      case "welcome": {
        if (m.epoch < epochRef.current) adoptEpoch(m.epoch);
        markFriend();
        break;
      }
      case "pattern": {
        friendPatternRef.current = m.pattern;
        markFriend();
        break;
      }
      case "hit": {
        // remote monster squashes + we hear the friend's tap immediately too
        friendSquashRef.current = performance.now();
        if (a) runVoice(a, m.voice, a.ctx.currentTime + 0.001, 0.6, 0.9);
        markFriend();
        break;
      }
      case "bye": {
        // friend left; ghost takes back over after a beat
        break;
      }
    }
  }

  function adoptEpoch(sharedPerf: number) {
    const a = audioRef.current;
    if (!a) return;
    epochRef.current = sharedPerf;
    const clk = makeClock(sharedPerf, performance.now(), a.ctx.currentTime);
    audioEpochRef.current = clk.audioTimeOfEpoch;
  }

  function markFriend() {
    friendSeenRef.current = performance.now();
    if (!friendPresent) setFriendPresent(true);
    if (ghostMode) setGhostMode(false);
  }

  // ---- the LOOK-AHEAD SCHEDULER (Chris Wilson pattern) --------------------
  // ~25ms tick, ~120ms look-ahead. Schedules every player's beads locally
  // against the shared epoch so both devices stay phase-locked.
  useEffect(() => {
    if (!started) return;
    const a = audioRef.current;
    if (!a) return;

    const LOOKAHEAD = 0.12;
    const TICK = 25;
    const loopLen = STEP_DUR * STEPS;
    // next absolute audio time we still need to schedule
    let nextTime = a.ctx.currentTime;
    // which absolute step index we are about to schedule
    let stepCursor = Math.ceil(
      (a.ctx.currentTime - audioEpochRef.current) / STEP_DUR,
    );

    const id = window.setInterval(() => {
      const now = a.ctx.currentTime;

      // presence timeout -> ghost takes back over
      const sinceFriend = performance.now() - friendSeenRef.current;
      if (friendPresent && sinceFriend > 1600) setFriendPresent(false);
      const ghostNow = !friendPresent && sinceFriend > 1600;
      if (ghostNow && !ghostMode) setGhostMode(true);

      while (nextTime < now + LOOKAHEAD) {
        const s = ((stepCursor % STEPS) + STEPS) % STEPS;
        const tAt = audioEpochRef.current + stepCursor * STEP_DUR;
        if (tAt >= now - 0.005) {
          // my beads
          for (const v of VOICES) {
            if (myPatternRef.current[v][s]) {
              runVoice(a, v, tAt, 0.35, 0.85);
            }
          }
          // friend beads (their pattern is authoritative for their monster)
          if (friendPresent) {
            for (const v of VOICES) {
              if (friendPatternRef.current[v][s]) {
                runVoice(a, v, tAt, 0.6, 0.8);
                scheduleSquash(tAt, "friend");
              }
            }
          } else if (ghostNow || ghostMode) {
            for (const v of VOICES) {
              if (ghostPatternRef.current[v][s]) {
                runVoice(a, v, tAt, 0.6, 0.7);
                scheduleSquash(tAt, "friend");
              }
            }
          }
          // schedule my own monster squash on my beads
          for (const v of VOICES) {
            if (myPatternRef.current[v][s]) {
              scheduleSquash(tAt, "me");
              break;
            }
          }
        }
        stepCursor += 1;
        nextTime = audioEpochRef.current + stepCursor * STEP_DUR;
      }

      // update the visual playhead ring (current step)
      const phase = (((now - audioEpochRef.current) % loopLen) + loopLen) % loopLen;
      setPlayStep(Math.floor(phase / STEP_DUR) % STEPS);
    }, TICK);

    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, friendPresent, ghostMode]);

  // squash the right monster at audio time t by setting a perf-ms timer
  function scheduleSquash(audioTime: number, who: "me" | "friend") {
    const a = audioRef.current;
    if (!a) return;
    const delayMs = Math.max(0, (audioTime - a.ctx.currentTime) * 1000);
    window.setTimeout(() => {
      if (who === "me") meSquashRef.current = performance.now();
      else friendSquashRef.current = performance.now();
    }, delayMs);
  }

  // ---- idle auto-demo: before anyone taps, the YOU monster shows a beat ---
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      const idle = performance.now() - lastTapRef.current;
      if (idle > 2500) {
        // gently seed a starter groove so the screen is alive
        const p = myPatternRef.current;
        const empty =
          VOICES.every((v) => p[v].every((b) => !b));
        if (empty) {
          const seed = makeEmptyPattern();
          [0, 8].forEach((s) => (seed.boom[s] = true));
          [4, 12].forEach((s) => (seed.boing[s] = true));
          setMyPattern(seed);
          myPatternRef.current = seed;
          broadcastPattern();
        }
      }
    }, 1200);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // ---- repaint the bead grid / playhead at ~30fps -------------------------
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 60);
    return () => window.clearInterval(id);
  }, [started]);

  // ---- FULL TEARDOWN ------------------------------------------------------
  useEffect(() => {
    return () => {
      try {
        const bc = bcRef.current;
        if (bc) {
          bc.postMessage({
            type: "bye",
            id: myIdRef.current,
            t: performance.now(),
          } as Msg);
          bc.close();
        }
      } catch {
        /* noop */
      }
      const a = audioRef.current;
      if (a) {
        try {
          a.ctx.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  // hit functions handed to the 3D monsters
  const meSquash: HitFn = () => meSquashRef.current;
  const friendSquash: HitFn = () => friendSquashRef.current;

  return (
    <div className="relative w-full" style={{ height: "calc(100vh - 48px)" }}>
      {/* 3D monster stage */}
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0.4, 6.5], fov: 50 }}
          gl={{ antialias: true }}
          style={{
            background:
              "radial-gradient(120% 120% at 50% 10%, #2a1d4d 0%, #150f2e 55%, #0a0717 100%)",
          }}
        >
          <Scene
            meSquash={meSquash}
            friendSquash={friendSquash}
            friendPresent={friendPresent}
            ghostMode={ghostMode}
          />
        </Canvas>
      </div>

      {/* HUD overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        {/* top: title + presence + help */}
        <div className="flex items-start justify-between p-4">
          <div>
            <h1 className="text-2xl font-black text-white/95 drop-shadow">
              Monster Band
            </h1>
            <p className="text-base text-white/75">
              {ghostMode
                ? "👻 ghost friend is jamming — tap a button!"
                : friendPresent
                  ? "🎉 a friend joined! play together"
                  : "tap the big buttons to make a beat"}
            </p>
          </div>
          <Link
            href="/dream/702-kids-monster-band/README.md"
            className="pointer-events-auto rounded-full bg-white/15 px-4 py-2 text-xl font-bold text-white/95 hover:bg-white/25"
            aria-label="design notes"
          >
            ?
          </Link>
        </div>

        <div className="flex-1" />

        {/* step ring: shows the shared 16-step loop + playhead */}
        {started && (
          <div className="flex justify-center pb-2">
            <StepRing pattern={myPattern} playStep={playStep} />
          </div>
        )}

        {/* bottom: the four GIANT sound buttons */}
        {started ? (
          <div className="pointer-events-auto grid grid-cols-4 gap-3 p-4">
            {VOICES.map((v) => (
              <button
                key={v}
                onPointerDown={(e) => {
                  e.preventDefault();
                  tapVoice(v);
                }}
                className="flex h-24 flex-col items-center justify-center rounded-3xl text-white/95 shadow-lg active:scale-95 transition-transform"
                style={{
                  background: VOICE_META[v].color,
                  minWidth: 64,
                  touchAction: "none",
                }}
                aria-label={VOICE_META[v].label}
              >
                <span className="text-4xl leading-none">
                  {VOICE_META[v].emoji}
                </span>
                <span className="mt-1 text-xl font-black">
                  {VOICE_META[v].label}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="pointer-events-auto flex flex-col items-center gap-4 p-8">
            <p className="max-w-md text-center text-base text-white/75">
              Open this same page on another phone to play together — you both
              join the same monster room!
            </p>
            <button
              onClick={start}
              className="rounded-full bg-gradient-to-r from-pink-500 to-amber-400 px-10 py-5 text-2xl font-black text-white/95 shadow-xl active:scale-95"
            >
              ▶ START THE BAND
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// big friendly 16-step ring of beads (purely visual reinforcement)
function StepRing({
  pattern,
  playStep,
}: {
  pattern: Pattern;
  playStep: number;
}) {
  const cells = [];
  for (let s = 0; s < STEPS; s++) {
    const active = VOICES.find((v) => pattern[v][s]);
    const isHead = s === playStep;
    cells.push(
      <div
        key={s}
        className="rounded-full transition-all"
        style={{
          width: isHead ? 22 : 16,
          height: isHead ? 22 : 16,
          background: active ? VOICE_META[active].color : "rgba(255,255,255,0.18)",
          boxShadow: isHead ? "0 0 14px rgba(255,255,255,0.9)" : "none",
          border: isHead ? "2px solid #fff" : "none",
        }}
      />,
    );
  }
  return <div className="flex items-center gap-2">{cells}</div>;
}
