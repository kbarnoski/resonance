"use client";

/**
 * 440 — Kids Comet Gather
 *
 * Sweep a phone through a 3-D night sky to scoop up drifting glowing motes
 * into a growing constellation — each mote adds a new voice to a slowly
 * evolving generative lullaby.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import {
  buildAudio,
  startAmbientPad,
  startMoteVoice,
  playGatherChime,
  MOTE_FREQS,
  type LullabyAudio,
  type PadHandle,
  type MoteVoice,
} from "./audio";
import {
  buildScene,
  stepMoteDrift,
  stepGatheredMote,
  updateMoteScreenPos,
  computeAimProximity,
  positionReticle,
  assignConstellationTargets,
  rebuildConstellationLines,
  updateConstellationLines,
  handleResize,
  type SceneState,
  type Mote,
} from "./scene";

// ── Types ──────────────────────────────────────────────────────────────────────

type Phase = "idle" | "playing";

interface GatheredVoice {
  moteId: number;
  voice: MoteVoice;
  birthS: number; // audio.elapsedSeconds() at time of gather
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Seconds held over a mote before it's scooped */
const SCOOP_HOLD_S = 0.9;
/** Seconds of no gyro before auto-demo resumes */
const AUTO_RESUME_S = 3.0;
/** Total max motes that can be gathered */
const MAX_GATHERED = 20;

// ── Auto-demo camera path (slow sweeping arc) ─────────────────────────────────
// Returns a target euler (yaw/pitch in radians) at time t (seconds)
function autoDemoTarget(t: number): { yaw: number; pitch: number } {
  // Slow figure-8 / lemniscate-like sweep
  const yaw   = Math.sin(t * 0.12) * 1.8  + Math.sin(t * 0.07) * 0.9;
  const pitch = Math.cos(t * 0.09) * 0.45 + Math.sin(t * 0.14) * 0.18;
  return { yaw, pitch };
}

// ── Gyro smoothing ────────────────────────────────────────────────────────────

const GYRO_ALPHA = 0.12; // low-pass: lower = smoother but more lag

function lowPass(current: number, target: number): number {
  return current + GYRO_ALPHA * (target - current);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function KidsCometGather() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [noWebGL, setNoWebGL]   = useState(false);
  const [gyroNote, setGyroNote] = useState<string>(""); // "" | "drag" | "granted"
  const [gatheredCount, setGatheredCount] = useState(0);

  // Persistent refs (not state — no re-render needed per-frame)
  const phaseRef        = useRef<Phase>("idle");
  const rafRef          = useRef(0);
  const sceneRef        = useRef<SceneState | null>(null);
  const audioRef        = useRef<LullabyAudio | null>(null);
  const padRef          = useRef<PadHandle | null>(null);
  const voicesRef       = useRef<GatheredVoice[]>([]);
  const gatheredCountRef = useRef(0);

  // Camera control
  const smoothYawRef    = useRef(0);
  const smoothPitchRef  = useRef(0);
  const gyroYawRef      = useRef(0);
  const gyroPitchRef    = useRef(0);
  const hasGyroRef      = useRef(false);
  const lastGyroMs      = useRef(0);
  const usingDragRef    = useRef(false);
  const dragYawRef      = useRef(0);
  const dragPitchRef    = useRef(0);
  const dragLastRef     = useRef<{ x: number; y: number } | null>(null);

  // Scoop state: track how long a mote is being aimed at
  const scoopTargetRef  = useRef<number | null>(null); // mote id
  const scoopHoldRef    = useRef(0); // seconds

  // Auto-demo
  const autoDemoTRef    = useRef(0);
  const autoActiveRef   = useRef(true);
  const startWallRef    = useRef(0); // performance.now() at start

  // Cleanup refs for event listeners
  const boundOrientRef  = useRef<((e: DeviceOrientationEvent) => void) | null>(null);
  const boundPointerRef = useRef<{
    down: (e: PointerEvent) => void;
    move: (e: PointerEvent) => void;
    up: () => void;
  } | null>(null);

  // Tick timer for audio/pad updates (every ~1s)
  const lastTickRef = useRef(0);

  // ── Device orientation handler ─────────────────────────────────────────────

  const handleOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    // alpha: compass heading 0-360, beta: front-back tilt -180..180, gamma: left-right -90..90
    // Map to yaw (left/right look) and pitch (up/down look)
    const yaw   = (e.alpha / 180) * Math.PI; // 0..2π
    const pitch = (e.beta  / 90)  * (Math.PI / 2) * 0.6; // ±π/3 approx
    gyroYawRef.current   = yaw;
    gyroPitchRef.current = pitch;
    hasGyroRef.current   = true;
    lastGyroMs.current   = performance.now();
    autoActiveRef.current = false;
  }, []);

  // ── Drag fallback handlers ─────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (phaseRef.current !== "playing") return;
    dragLastRef.current = { x: e.clientX, y: e.clientY };
    usingDragRef.current = true;
    autoActiveRef.current = false;
    lastGyroMs.current = performance.now();
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (phaseRef.current !== "playing") return;
    if (!dragLastRef.current) return;
    if (!(e.buttons & 1)) return;
    const dx = e.clientX - dragLastRef.current.x;
    const dy = e.clientY - dragLastRef.current.y;
    dragLastRef.current = { x: e.clientX, y: e.clientY };
    dragYawRef.current   += dx * 0.004;
    dragPitchRef.current += dy * 0.003;
    dragPitchRef.current  = Math.max(-1.2, Math.min(1.2, dragPitchRef.current));
    autoActiveRef.current  = false;
    lastGyroMs.current     = performance.now();
  }, []);

  const handlePointerUp = useCallback(() => {
    dragLastRef.current  = null;
    usingDragRef.current = false;
    lastGyroMs.current   = performance.now();
  }, []);

  // ── Start handler (runs inside gesture for iOS audio + permission) ─────────

  const handleStart = useCallback(async () => {
    if (phaseRef.current === "playing") return;
    phaseRef.current = "playing";
    setPhase("playing");

    // 1. AudioContext inside gesture
    const CtorRaw = window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const audio = buildAudio();
    audioRef.current = audio;
    await audio.ctx.resume().catch(() => {});

    // 2. Ambient pad
    const pad = startAmbientPad(audio);
    padRef.current = pad;

    // 3. iOS DeviceOrientation permission
    const DOE = window.DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    if (DOE && typeof DOE.requestPermission === "function") {
      try {
        const result = await DOE.requestPermission();
        if (result === "granted") {
          const handler = handleOrientation;
          boundOrientRef.current = handler;
          window.addEventListener("deviceorientation", handler);
          setGyroNote("granted");
        } else {
          setGyroNote("drag");
        }
      } catch {
        setGyroNote("drag");
      }
    } else if ("DeviceOrientationEvent" in window) {
      const handler = handleOrientation;
      boundOrientRef.current = handler;
      window.addEventListener("deviceorientation", handler);
      // If no events arrive in 1.5s, switch to drag note
      setTimeout(() => {
        if (!hasGyroRef.current) setGyroNote("drag");
      }, 1500);
    } else {
      setGyroNote("drag");
    }

    // 4. Pointer drag fallback (always available)
    const canvas = canvasRef.current;
    if (canvas) {
      const down = handlePointerDown;
      const move = handlePointerMove;
      const up   = handlePointerUp;
      boundPointerRef.current = { down, move, up };
      canvas.addEventListener("pointerdown", down);
      canvas.addEventListener("pointermove", move);
      canvas.addEventListener("pointerup",   up);
      canvas.addEventListener("pointercancel", up);
    }

    // 5. Mark start time
    startWallRef.current = performance.now();
    autoDemoTRef.current = 0;
    autoActiveRef.current = true;

    void CtorRaw; // suppress unused warning
  }, [handleOrientation, handlePointerDown, handlePointerMove, handlePointerUp]);

  // ── Main render loop ───────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Build Three.js scene
    let sceneState: SceneState | null = null;
    try {
      sceneState = buildScene(canvas);
    } catch {
      setNoWebGL(true);
      return;
    }
    sceneRef.current = sceneState;

    const { scene, camera, renderer, motes, constellationLines } = sceneState;

    // Resize observer
    const ro = new ResizeObserver(() => {
      if (sceneState) handleResize(renderer, camera, canvas);
    });
    ro.observe(canvas);
    handleResize(renderer, camera, canvas);

    let lastMs   = performance.now();
    let autoScoopT = 0; // timer for auto-demo auto-gather

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      const now = performance.now();
      let dt    = (now - lastMs) / 1000;
      lastMs = now;
      if (dt > 0.05) dt = 0.05;

      // ── Auto-demo / gyro hand-off ──────────────────────────────────────────
      const idleSecs = (now - lastGyroMs.current) / 1000;
      if (!autoActiveRef.current && idleSecs > AUTO_RESUME_S) {
        autoActiveRef.current = true;
      }

      let targetYaw: number;
      let targetPitch: number;

      if (autoActiveRef.current) {
        autoDemoTRef.current += dt;
        const demo = autoDemoTarget(autoDemoTRef.current);
        targetYaw   = demo.yaw;
        targetPitch = demo.pitch;
      } else if (hasGyroRef.current && !usingDragRef.current) {
        targetYaw   = gyroYawRef.current;
        targetPitch = gyroPitchRef.current;
      } else {
        targetYaw   = dragYawRef.current;
        targetPitch = dragPitchRef.current;
      }

      // Smooth camera rotation
      smoothYawRef.current   = lowPass(smoothYawRef.current,   targetYaw);
      smoothPitchRef.current = lowPass(smoothPitchRef.current, targetPitch);

      // Apply to camera (yaw = rotation about Y, pitch = rotation about X)
      const euler = new THREE.Euler(
        smoothPitchRef.current,
        smoothYawRef.current,
        0,
        "YXZ"
      );
      camera.quaternion.setFromEuler(euler);

      // ── Drift all free motes ───────────────────────────────────────────────
      motes.forEach(m => {
        if (!m.gathered) stepMoteDrift(m, dt);
        else stepGatheredMote(m, dt, now);
      });

      // ── Update constellation lines ─────────────────────────────────────────
      updateConstellationLines(constellationLines, motes);

      // ── Screen-space positions + aim proximity ────────────────────────────
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      let maxProximity = 0;
      let closestMoteId: number | null = null;
      let closestProx  = 0;

      motes.forEach(m => {
        updateMoteScreenPos(m, camera, W, H);
        if (m.gathered) return;
        const prox = computeAimProximity(m, W, H);
        if (prox > maxProximity) maxProximity = prox;
        if (prox > closestProx) { closestProx = prox; closestMoteId = m.id; }

        // Highlight: pulsing opacity when aimed at
        const mat = m.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = 0.65 + prox * 0.35 + 0.15 * Math.sin(now * 0.003 + m.id);
      });

      // ── Scoop logic ────────────────────────────────────────────────────────
      if (gatheredCountRef.current < MAX_GATHERED) {
        if (closestMoteId !== null && closestProx > 0.25) {
          if (scoopTargetRef.current === closestMoteId) {
            scoopHoldRef.current += dt;
            if (scoopHoldRef.current >= SCOOP_HOLD_S) {
              // GATHER!
              gatherMote(closestMoteId, motes, camera);
              scoopTargetRef.current = null;
              scoopHoldRef.current   = 0;
            }
          } else {
            scoopTargetRef.current = closestMoteId;
            scoopHoldRef.current   = 0;
          }
        } else {
          scoopTargetRef.current = null;
          scoopHoldRef.current   = 0;
        }
      }

      // ── Auto-demo: auto-gather a few motes while demo running ────────────
      if (autoActiveRef.current && gatheredCountRef.current < 4) {
        autoScoopT += dt;
        if (autoScoopT > 4.5) {
          autoScoopT = 0;
          // Find nearest free mote to camera view direction
          const freeNearby = motes
            .filter(m => !m.gathered)
            .sort((a, b) => computeAimProximity(b, W, H) - computeAimProximity(a, W, H));
          if (freeNearby.length > 0) {
            gatherMote(freeNearby[0].id, motes, camera);
          }
        }
      }

      // ── Reticle ────────────────────────────────────────────────────────────
      positionReticle(
        sceneState.reticle,
        sceneState.reticleAura,
        camera,
        maxProximity
      );

      // ── Audio tick (every ~1 sec) ──────────────────────────────────────────
      const audio = audioRef.current;
      if (audio) {
        const elapsed = audio.elapsedSeconds();
        if (elapsed - lastTickRef.current > 1.0) {
          lastTickRef.current = elapsed;
          padRef.current?.tick(elapsed);
          voicesRef.current.forEach(v => {
            v.voice.tick(elapsed, v.birthS);
          });
          // Update spatial pan for each voice based on current screen position
          voicesRef.current.forEach(v => {
            const mote = motes.find(m => m.id === v.moteId);
            if (!mote) return;
            const pan = mote.screenZ > 1
              ? 0
              : (mote.screenX / W) * 2 - 1; // -1..1
            v.voice.setPan(pan);
          });
        }
      }

      renderer.render(scene, camera);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      sceneState?.dispose();
      sceneRef.current = null;
    };
  }, [phase]); // phase is the only dep that should re-run this effect

  // ── Gather a mote (called from render loop — needs stable fn) ─────────────
  // We use a ref-based closure to avoid stale closures in rAF

  const gatherMote = (
    moteId: number,
    motes: Mote[],
    camera: THREE.Camera
  ) => {
    const mote = motes.find(m => m.id === moteId);
    if (!mote || mote.gathered) return;
    if (gatheredCountRef.current >= MAX_GATHERED) return;

    mote.gathered   = true;
    mote.gatherTime = performance.now();

    // Assign constellation positions
    assignConstellationTargets(motes, camera);

    // Rebuild constellation lines
    if (sceneRef.current) {
      rebuildConstellationLines(
        sceneRef.current.scene,
        sceneRef.current.constellationLines,
        motes
      );
    }

    gatheredCountRef.current += 1;
    setGatheredCount(gatheredCountRef.current);

    // Play gather chime + start sustained voice
    const audio = audioRef.current;
    if (audio) {
      const freq   = MOTE_FREQS[mote.freqIndex] ?? 293.66;
      const W      = canvasRef.current?.clientWidth  ?? 400;
      const pan    = mote.screenZ > 1 ? 0 : (mote.screenX / W) * 2 - 1;

      playGatherChime(audio, freq, pan);

      const voice = startMoteVoice(audio, freq, pan);
      voicesRef.current.push({
        moteId,
        voice,
        birthS: audio.elapsedSeconds(),
      });
    }
  };

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    const capturedCanvas = canvasRef.current;
    return () => {
      cancelAnimationFrame(rafRef.current);

      // Remove gyro listener
      if (boundOrientRef.current) {
        window.removeEventListener("deviceorientation", boundOrientRef.current);
      }
      // Remove pointer listeners (use captured ref, not canvasRef.current)
      if (capturedCanvas && boundPointerRef.current) {
        const { down, move, up } = boundPointerRef.current;
        capturedCanvas.removeEventListener("pointerdown", down);
        capturedCanvas.removeEventListener("pointermove", move);
        capturedCanvas.removeEventListener("pointerup",   up);
        capturedCanvas.removeEventListener("pointercancel", up);
      }
      // Stop all voices
      voicesRef.current.forEach(v => v.voice.stop());
      voicesRef.current = [];
      // Stop pad
      padRef.current?.stop();
      // Suspend audio context
      audioRef.current?.suspend();
      // Scene dispose is in the loop effect cleanup
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (noWebGL) {
    return (
      <div className="min-h-screen bg-[#04020f] flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <p className="text-2xl font-semibold text-foreground mb-3">
            WebGL not available
          </p>
          <p className="text-base text-muted-foreground">
            This prototype needs WebGL to render the night sky.
            Try a different browser or device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-[#04020f] overflow-hidden select-none touch-none">
      {/* Three.js canvas — always present */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none" }}
      />

      {/* HUD — gathered count (only while playing) */}
      {phase === "playing" && (
        <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 bg-muted backdrop-blur-sm rounded-full px-4 py-2">
            <span className="text-base text-muted-foreground font-mono">
              {gatheredCount === 0
                ? "sweep to scoop motes"
                : `${gatheredCount} mote${gatheredCount !== 1 ? "s" : ""} gathered`}
            </span>
          </div>
        </div>
      )}

      {/* Input note */}
      {phase === "playing" && gyroNote === "drag" && (
        <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-base text-muted-foreground font-mono px-4 text-center">
            drag to look around
          </p>
        </div>
      )}

      {/* Begin overlay */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center
                        bg-[#04020f]/90 backdrop-blur-sm p-6 text-center">
          {/* Decorative star cluster */}
          <div className="mb-6 relative w-24 h-24 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-violet-500/15 animate-pulse" />
            <div className="absolute inset-3 rounded-full bg-violet-400/20 animate-pulse"
                 style={{ animationDelay: "0.3s" }} />
            <span className="text-5xl relative z-10">✦</span>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-3 tracking-tight">
            Comet Gather
          </h1>

          <p className="text-base text-muted-foreground mb-2 max-w-xs leading-relaxed">
            Hold up your phone and sweep it through the night sky.
          </p>
          <p className="text-base text-muted-foreground mb-8 max-w-xs leading-relaxed">
            Each mote you scoop up sings a new lullaby note.
          </p>

          <button
            onClick={() => { void handleStart(); }}
            className="
              min-h-[64px] min-w-[200px] px-8 py-4
              bg-violet-600 hover:bg-violet-500 active:bg-violet-700
              text-foreground text-xl font-bold rounded-2xl
              transition-colors duration-150
              shadow-lg shadow-violet-900/40
            "
          >
            Begin ✦
          </button>

          <p className="mt-6 text-base text-muted-foreground max-w-xs">
            Sound on for the full experience
          </p>
        </div>
      )}
    </div>
  );
}
