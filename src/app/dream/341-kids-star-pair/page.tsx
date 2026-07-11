"use client";

// 341-kids-star-pair — two young children, each on their own screen, each holding
// ONE glowing star, sliding (or humming) it up and down until the two stars sing
// in tune and LINK with a beam of light. The lab's first real-time simultaneous
// two-child co-play piece.
//
// Subsystems (all in this folder):
//   audio.ts  — Web Audio: always-on D drone + two voices + lock chime/shimmer,
//               master through a brick-wall limiter. The real acoustic beating
//               between the two voices is what you hear when out of tune.
//   tuning.ts — pitch ↔ arc-position mapping + just-intonation consonance scoring.
//   sync.ts   — BroadcastChannel presence + pitch sharing (319-hub-score lineage).
//   pitch.ts  — analysis-only mic pitch detection (never recorded/uploaded).
//   scene.ts  — raw WebGL2 renderer (stars, beam, sparkles, background).
//
// Renderer is raw WebGL2 only (no SVG / Canvas2D / three.js / WebGPU).

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { startAudio, type StarAudio } from "./audio";
import {
  posToFreq,
  freqToPos,
  scoreInterval,
  FREQ_MIN,
  FREQ_MAX,
} from "./tuning";
import {
  openChannel,
  makeId,
  BROADCAST_MS,
  PEER_TIMEOUT_MS,
  type StarMsg,
} from "./sync";
import { startMic, type MicPitch } from "./pitch";
import { createStarScene, type StarScene, type SceneState } from "./scene";

// Star arc x positions (must match the faint tracks drawn in scene.ts).
const ME_X = 0.2;
const FRIEND_X = 0.8;

// Colours (rgb 0..1): me = violet, friend = cyan.
const ME_COLOR: [number, number, number] = [0.62, 0.45, 0.98];
const FRIEND_COLOR: [number, number, number] = [0.35, 0.85, 0.95];

// Vertical playable band on screen (0 = top, 1 = bottom). We invert so the TOP
// of the arc = the HIGHEST pitch.
const ARC_TOP = 0.14;
const ARC_BOTTOM = 0.86;

/** arc-y (screen, 0..1 top→bottom) → tuning position t (0 bottom .. 1 top). */
function yToPos(y: number): number {
  const c = (y - ARC_TOP) / (ARC_BOTTOM - ARC_TOP);
  return 1 - Math.max(0, Math.min(1, c));
}
/** tuning position t (0..1) → arc-y (screen, 0..1). */
function posToY(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return ARC_TOP + (1 - c) * (ARC_BOTTOM - ARC_TOP);
}

type Phase = "idle" | "playing";

export default function KidsStarPair() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [glError, setGlError] = useState("");
  const [micError, setMicError] = useState("");
  const [hasPeer, setHasPeer] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  const audioRef = useRef<StarAudio | null>(null);
  const sceneRef = useRef<StarScene | null>(null);
  const micRef = useRef<MicPitch | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const idRef = useRef<string>(makeId());

  // ── live state held in refs (the single rAF loop reads these) ──────────────
  const myFreqRef = useRef(FREQ_MIN * 1.5); // my star's current pitch
  const friendFreqRef = useRef(FREQ_MIN * 1.5 * (3 / 2));
  const draggingRef = useRef(false);

  // friend / peer bookkeeping
  const lastPeerAtRef = useRef(0); // last time we heard a real peer
  const hasPeerRef = useRef(false);

  // robot friend drift state
  const robotTargetRef = useRef(FREQ_MIN * 2);
  const robotPauseRef = useRef(0); // seconds remaining to pause near a consonance

  // lock bookkeeping for the celebration ramp
  const lockedRef = useRef(false);
  const lockStartRef = useRef(0);

  // broadcasting throttle
  const lastBroadcastRef = useRef(0);

  // ── push my pitch over the channel ────────────────────────────────────────
  const broadcast = useCallback((freq: number) => {
    const ch = channelRef.current;
    if (!ch) return;
    const msg: StarMsg = { t: "star", id: idRef.current, freq, at: Date.now() };
    try {
      ch.postMessage(msg);
    } catch {
      /* channel closed */
    }
  }, []);

  // ── robot friend: drift slowly, PAUSE near consonances so a lone player can
  //    catch the lock. Runs only when no real peer is present. ───────────────
  const stepRobot = useCallback((dt: number) => {
    const myFreq = myFreqRef.current;
    let f = friendFreqRef.current;

    if (robotPauseRef.current > 0) {
      robotPauseRef.current -= dt;
    } else {
      // glide toward a wandering target
      const target = robotTargetRef.current;
      const speed = 0.25; // gentle
      f += (target - f) * Math.min(1, speed * dt);

      // reached target? pick a new one, occasionally aiming AT a consonance with
      // my current pitch so the child can find the beam.
      if (Math.abs(f - target) < 2) {
        if (Math.random() < 0.55) {
          // aim at a just interval above or below my pitch
          const ratios = [1, 6 / 5, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 2];
          const r = ratios[Math.floor(Math.random() * ratios.length)];
          const up = Math.random() > 0.5 ? r : 1 / r;
          robotTargetRef.current = Math.max(
            FREQ_MIN,
            Math.min(FREQ_MAX, myFreq * up),
          );
        } else {
          robotTargetRef.current =
            FREQ_MIN + Math.random() * (FREQ_MAX - FREQ_MIN);
        }
      }

      // if we happen to be sitting on a consonance, PAUSE so it can be caught
      const sc = scoreInterval(myFreq, f);
      if (sc.nearness > 0.7 && Math.random() < 0.04) {
        robotPauseRef.current = 1.6 + Math.random() * 1.2;
      }
    }

    f = Math.max(FREQ_MIN, Math.min(FREQ_MAX, f));
    friendFreqRef.current = f;
  }, []);

  // ── main animation + audio-driving loop ───────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const scene = sceneRef.current;
    if (!scene) return; // WebGL2 failed → audio still runs (see startEverything)

    let startT = -1;
    let prevT = 0;

    const frame = (now: number) => {
      if (startT < 0) {
        startT = now;
        prevT = now;
      }
      const time = (now - startT) / 1000;
      const dt = Math.min(0.05, (now - prevT) / 1000);
      prevT = now;

      // resize to device pixels
      const canvas = canvasRef.current!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(window.innerWidth * dpr);
      const h = Math.round(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        scene.resize(w, h);
      }

      // mic → my star (only when NOT dragging, so drag stays the reliable primary)
      const mic = micRef.current;
      if (mic && !draggingRef.current) {
        const hz = mic.read();
        if (hz != null) {
          // fold the hummed pitch into the playable octave band
          let f = hz;
          while (f > FREQ_MAX) f /= 2;
          while (f < FREQ_MIN) f *= 2;
          // smooth toward it
          myFreqRef.current += (f - myFreqRef.current) * 0.25;
        }
      }

      // peer presence: real peer if heard within the timeout, else robot friend
      const now2 = Date.now();
      const peer = now2 - lastPeerAtRef.current < PEER_TIMEOUT_MS;
      if (peer !== hasPeerRef.current) {
        hasPeerRef.current = peer;
        setHasPeer(peer);
      }
      if (!peer) {
        stepRobot(dt);
      }

      const myFreq = myFreqRef.current;
      const friendFreq = friendFreqRef.current;

      // push my pitch to the channel ~3×/sec
      if (now - lastBroadcastRef.current > BROADCAST_MS) {
        lastBroadcastRef.current = now;
        broadcast(myFreq);
      }

      // score the interval
      const sc = scoreInterval(myFreq, friendFreq);

      // drive audio
      const audio = audioRef.current;
      if (audio) {
        audio.setMyFreq(myFreq);
        audio.setFriendFreq(friendFreq);
        audio.setLocked(sc.locked);
      }

      // lock bookkeeping for the celebration ramp
      if (sc.locked && !lockedRef.current) {
        lockedRef.current = true;
        lockStartRef.current = time;
      } else if (!sc.locked && lockedRef.current) {
        lockedRef.current = false;
      }
      const lockAge = sc.locked ? time - lockStartRef.current : 0;

      // jitter amplitude grows with the beat frequency, falls to 0 near lock
      const jitter = sc.locked
        ? 0
        : Math.min(0.03, sc.beatHz * 0.0009) * (1 - sc.nearness * 0.6);

      const glowMe = sc.locked ? 1 : 0.4 + sc.nearness * 0.4;
      const glowFr = glowMe;

      const state: SceneState = {
        me: {
          x: ME_X,
          y: posToY(freqToPos(myFreq)),
          color: ME_COLOR,
          radius: 0.075,
          glow: glowMe,
          jitter,
        },
        friend: {
          x: FRIEND_X,
          y: posToY(freqToPos(friendFreq)),
          color: FRIEND_COLOR,
          radius: 0.075,
          glow: glowFr,
          jitter,
        },
        nearness: sc.nearness,
        locked: sc.locked,
        beatHz: sc.beatHz,
        lockAge,
        hasPeer: peer,
        time,
      };
      scene.render(state);

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, broadcast, stepRobot]);

  // ── pointer drag: move MY star along its arc ──────────────────────────────
  const applyPointer = useCallback((clientY: number) => {
    const y = clientY / window.innerHeight; // 0..1 top→bottom
    const t = yToPos(y);
    myFreqRef.current = posToFreq(t);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (phase !== "playing") return;
      canvasRef.current?.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      applyPointer(e.clientY);
    },
    [phase, applyPointer],
  );
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      applyPointer(e.clientY);
    },
    [applyPointer],
  );
  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // ── start everything (inside the tap, for iOS) ────────────────────────────
  const handleStart = useCallback(async () => {
    setPhase("playing");

    // 1) audio (must be created in the gesture)
    let audio: StarAudio | null = null;
    try {
      audio = startAudio();
      audioRef.current = audio;
    } catch {
      // audio failing is unusual; we keep going (visuals still work)
    }

    // 2) WebGL2 renderer
    const canvas = canvasRef.current;
    if (canvas) {
      const gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: true,
        premultipliedAlpha: false,
      });
      if (!gl) {
        setGlError("This device can't show the stars (no WebGL2) — but you can still hear them.");
      } else {
        try {
          sceneRef.current = createStarScene(gl);
        } catch {
          setGlError("Could not start the star renderer — but you can still hear them.");
        }
      }
    }

    // 3) mic (analysis-only) — also in the gesture for iOS
    if (audio) {
      try {
        micRef.current = await startMic(audio.ctx);
      } catch {
        setMicError("No microphone — drag your star to play. (humming is optional)");
      }
    }

    // 4) channel
    const ch = openChannel();
    channelRef.current = ch;
    if (ch) {
      ch.onmessage = (ev: MessageEvent<StarMsg>) => {
        const m = ev.data;
        if (!m || m.id === idRef.current) return;
        if (m.t === "star") {
          friendFreqRef.current = m.freq;
          lastPeerAtRef.current = Date.now();
        } else if (m.t === "bye") {
          // peer left → fall back to robot after the timeout elapses
        }
      };
    }
  }, []);

  // ── teardown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const myId = idRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);
      const ch = channelRef.current;
      if (ch) {
        try {
          ch.postMessage({ t: "bye", id: myId } as StarMsg);
        } catch {
          /* ignore */
        }
        ch.close();
      }
      micRef.current?.dispose();
      sceneRef.current?.dispose();
      audioRef.current?.dispose();
    };
  }, []);

  // ── idle / start screen ───────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center"
        style={{ background: "#0a0814" }}>
        {/* preview: two stars reaching toward each other */}
        <div className="flex items-center gap-10" aria-hidden="true">
          <span style={{ fontSize: 56, filter: "drop-shadow(0 0 16px #8a6cf8)" }}>⭐</span>
          <span className="text-2xl text-muted-foreground">✨</span>
          <span style={{ fontSize: 56, filter: "drop-shadow(0 0 16px #5ad6f0)" }}>⭐</span>
        </div>

        <div>
          <h1 className="mb-3 text-3xl font-bold text-foreground">Star Pair</h1>
          <p className="mx-auto max-w-md text-base leading-relaxed text-muted-foreground">
            Two friends, two stars. Slide your <span className="text-violet-300">violet star</span>{" "}
            up and down until it sings in tune with your friend&apos;s{" "}
            <span style={{ color: "#5ad6f0" }}>cyan star</span> — and a{" "}
            <span className="text-foreground">beam of light</span> links them. ✨
          </p>
        </div>

        {micError && <p className="text-base text-violet-300">{micError}</p>}

        <button
          onClick={handleStart}
          className="min-h-[64px] rounded-2xl px-10 py-4 text-xl font-bold transition-transform active:scale-95"
          style={{ background: "linear-gradient(90deg,#8a6cf8,#5ad6f0)", color: "#0a0814" }}
        >
          Play together ▸
        </button>

        <p className="text-base text-muted-foreground">
          drag your star · or hum · find the beam ✨
        </p>

        <Link href="/dream" className="text-base text-muted-foreground transition-colors hover:text-foreground">
          ← dream lab
        </Link>
      </div>
    );
  }

  // ── play screen ───────────────────────────────────────────────────────────
  return (
    <div className="relative w-full overflow-hidden" style={{ height: "100dvh", background: "#0a0814" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* tiny caption + friend/robot badge (top) */}
      <div className="pointer-events-none absolute left-0 right-0 top-3 z-10 flex flex-col items-center gap-2">
        <p className="rounded-xl bg-black/40 px-4 py-1.5 text-base text-muted-foreground">
          slide your <span className="text-violet-300">star</span> until the beam lights up ✨
        </p>
        <span
          className="rounded-full px-3 py-1 text-base font-bold"
          style={
            hasPeer
              ? { background: "rgba(138,108,248,0.25)", color: "#c9b8ff" }
              : { background: "rgba(245,180,60,0.18)", color: "#f5c542" }
          }
        >
          {hasPeer ? "friend 👫" : "robot 🤖"}
        </span>
      </div>

      {/* error notices — rose, never dimmed */}
      {(glError || micError) && (
        <div className="pointer-events-none absolute bottom-12 left-0 right-0 z-10 flex flex-col items-center gap-1 px-4 text-center">
          {glError && <p className="rounded-lg bg-black/60 px-3 py-1.5 text-base text-violet-300">{glError}</p>}
          {micError && <p className="rounded-lg bg-black/60 px-3 py-1.5 text-base text-violet-300">{micError}</p>}
        </div>
      )}

      <Link
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/341-kids-star-pair/README.md"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute bottom-3 right-3 z-10 text-muted-foreground transition-colors hover:text-foreground"
        style={{ fontSize: 13 }}
      >
        Read the design notes
      </Link>
    </div>
  );
}
