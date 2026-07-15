"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { VERT, FRAG } from "./shader";
import { VoidAudio } from "./audio";
import {
  STRUCTURES,
  DRIFT_SPEED,
  relPositions,
  makeRelBuffer,
} from "./scene";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

// ─────────────────────────────────────────────────────────────────────────────
// 1762-nde-void
//   state: ketamine k-hole / near-death "in-between" · pole: dissociative
//
// Tilt your phone to gaze around a vast, cold, sparse architectural VOID while
// your body drifts forward on rails. Each distant luminous structure is HRTF-
// spatialised from its TRUE 3-D position, so passing one sweeps its cold bell-
// tone front → across-your-head → behind. Sight and sound read ONE geometry
// table (scene.ts), so they can never come apart.
//
// Determinism: an integer frame counter drives drift, gaze-ghost, visuals and
// audio. No Math.random / Date.now / new Date / performance.now in those paths —
// so the self-driving ghost sweep runs identically on a headless box.
// ─────────────────────────────────────────────────────────────────────────────

const DT = 1 / 60;
const YAW_RANGE = 1.25; // rad — how far the gaze can swing left/right
const PITCH_RANGE = 0.7; // rad — up/down
const EASE = 0.055; // gaze inertia (weightless drift toward target)

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [gyroDenied, setGyroDenied] = useState(false); // hard error → destructive
  const [gyroMode, setGyroMode] = useState<"gyro" | "pointer" | "pending">(
    "pending",
  );
  const [showNotes, setShowNotes] = useState(false);

  const audioRef = useRef<VoidAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(false);

  // live input channels (written by listeners, read by the loop)
  const gyro = useRef({ active: false, yaw: 0, pitch: 0 });
  const pointer = useRef({ active: false, yaw: 0, pitch: 0 });

  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    teardownRef.current?.();
    teardownRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    setRunning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    if (running) return;
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = prefersReducedMotion();

    // ── AudioContext (must be created inside the Begin gesture) ───────────────
    let ctx: AudioContext;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctx = new Ctor();
      await ctx.resume();
    } catch {
      return;
    }
    const audio = new VoidAudio(ctx);
    audioRef.current = audio;
    audio.setMuted(mutedRef.current);
    audio.start();
    setRunning(true);

    // ── device-orientation (gyro) permission, requested inside the gesture ───
    gyro.current.active = false;
    pointer.current.active = false;
    setGyroDenied(false);
    setGyroMode("pending");

    const onOrient = (e: DeviceOrientationEvent) => {
      // gamma (left/right tilt) → yaw · beta (front/back tilt) → pitch
      const g = e.gamma ?? 0;
      const b = e.beta ?? 0;
      gyro.current.yaw = clamp(g / 45, -1, 1) * YAW_RANGE;
      gyro.current.pitch = clamp((b - 45) / 45, -1, 1) * PITCH_RANGE;
      gyro.current.active = true;
      setGyroMode("gyro");
    };
    let orientAttached = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DOE = window.DeviceOrientationEvent as any;
      if (DOE && typeof DOE.requestPermission === "function") {
        const res: string = await DOE.requestPermission();
        if (res === "granted") {
          window.addEventListener("deviceorientation", onOrient);
          orientAttached = true;
        } else {
          setGyroDenied(true);
          setGyroMode("pointer");
        }
      } else if ("DeviceOrientationEvent" in window) {
        window.addEventListener("deviceorientation", onOrient);
        orientAttached = true;
        // if no gyro events ever arrive (desktop), pointer/ghost take over
        setGyroMode("pointer");
      } else {
        setGyroMode("pointer");
      }
    } catch {
      setGyroDenied(true);
      setGyroMode("pointer");
    }

    // ── pointer fallback (desktop): move over the scene to steer the gaze ─────
    const onPointer = (e: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const px = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const py = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
      pointer.current.yaw = -px * YAW_RANGE;
      pointer.current.pitch = -py * PITCH_RANGE;
      pointer.current.active = true;
      if (!gyro.current.active) setGyroMode("pointer");
    };
    mount.addEventListener("pointermove", onPointer);

    // ── three.js full-viewport ShaderMaterial ────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    } catch {
      renderer = null;
    }
    if (!renderer) {
      setWebglFailed(true); // audio still runs — the void is never silent
    } else {
      setWebglFailed(false);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.setPixelRatio(dpr * 0.6); // ~0.6× res → headroom for 60fps
      renderer.setClearColor(new THREE.Color(0x030208), 1);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";
    }

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cam.position.z = 1;

    const structPos = STRUCTURES.map(() => new THREE.Vector3());
    const uniforms = {
      uTime: { value: 0 },
      uAspect: { value: new THREE.Vector2(1, 1) },
      uGaze: { value: new THREE.Matrix3() },
      uReduce: { value: reduced ? 1 : 0 },
      uStructPos: { value: structPos },
      uStructKind: { value: STRUCTURES.map((s) => s.kind as number) },
      uStructSize: { value: STRUCTURES.map((s) => s.size) },
      uStructHue: { value: STRUCTURES.map((s) => s.hue) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geo, mat);
    scene.add(quad);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer?.setSize(w, h, false);
      // fov-correct aspect: widen the longer axis
      if (w >= h) uniforms.uAspect.value.set(w / h, 1);
      else uniforms.uAspect.value.set(1, h / w);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── shared geometry buffer + reusable gaze math ──────────────────────────
    const rel = makeRelBuffer();
    const gazeM4 = new THREE.Matrix4();
    const rotY = new THREE.Matrix4();
    const rotX = new THREE.Matrix4();
    const fwd = new THREE.Vector3();
    const up = new THREE.Vector3();
    const F0 = new THREE.Vector3(0, 0, -1);
    const U0 = new THREE.Vector3(0, 1, 0);

    let frame = 0;
    let curYaw = 0;
    let curPitch = 0;
    const driftScale = reduced ? 0.5 : 1.0; // slower fall under reduced-motion
    const ghostScale = reduced ? 0.4 : 1.0;

    const loop = () => {
      const eng = audioRef.current;
      if (!eng) return;
      const f = frame++;
      const t = f * DT;

      // 1. gaze target: gyro > pointer > always-on ghost sweep
      const gt = t * ghostScale;
      const ghY =
        (Math.sin(gt * 0.11 * 6.2831853) * 0.9 +
          Math.sin(gt * 0.037 * 6.2831853) * 0.4) *
        YAW_RANGE *
        0.7;
      const ghP =
        Math.sin(gt * 0.083 * 6.2831853 + 1.3) * PITCH_RANGE * 0.55;
      let tgtYaw: number;
      let tgtPitch: number;
      if (gyro.current.active) {
        tgtYaw = gyro.current.yaw + ghY * 0.08;
        tgtPitch = gyro.current.pitch + ghP * 0.08;
      } else if (pointer.current.active) {
        tgtYaw = pointer.current.yaw + ghY * 0.08;
        tgtPitch = pointer.current.pitch + ghP * 0.08;
      } else {
        tgtYaw = ghY;
        tgtPitch = ghP;
      }
      // weightless inertia toward the target
      curYaw += (tgtYaw - curYaw) * EASE;
      curPitch += (tgtPitch - curPitch) * EASE;

      // 2. gaze basis (eye→world). uGaze rotates ray dirs; fwd/up drive listener
      rotY.makeRotationY(curYaw);
      rotX.makeRotationX(curPitch);
      gazeM4.multiplyMatrices(rotY, rotX);
      uniforms.uGaze.value.setFromMatrix4(gazeM4);
      fwd.copy(F0).applyMatrix4(gazeM4).normalize();
      up.copy(U0).applyMatrix4(gazeM4).normalize();

      // 3. THE SHARED GEOMETRY — one computation for both eye and ear
      const drift = t * DRIFT_SPEED * driftScale;
      relPositions(drift, rel);
      for (let i = 0; i < rel.length; i++) {
        structPos[i].set(rel[i].rx, rel[i].ry, rel[i].rz);
      }
      uniforms.uTime.value = t;

      // 4. audio reads the identical rel positions + gaze basis
      eng.update(f, rel, fwd, up);

      if (renderer) renderer.render(scene, cam);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── teardown ─────────────────────────────────────────────────────────────
    teardownRef.current = () => {
      ro.disconnect();
      if (orientAttached)
        window.removeEventListener("deviceorientation", onOrient);
      mount.removeEventListener("pointermove", onPointer);
      scene.remove(quad);
      geo.dispose();
      mat.dispose();
      void ctx.close();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === mount)
          mount.removeChild(renderer.domElement);
      }
      setWebglFailed(false);
    };
  }, [running]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            ketamine k-hole · near-death in-between · dissociative
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">NDE Void</h1>
          <p className="text-base text-muted-foreground">
            Tilt your phone to gaze around a vast, cold, sparse architecture as
            you drift forward through the in-between. Each luminous structure
            sings from its true position in 3-D — passing one sweeps its bell
            from in front of you, across your head, to behind.
          </p>
          <p className="text-sm text-muted-foreground">
            Best with headphones — the spatial audio is binaural (HRTF).
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {webglFailed && (
            <p className="max-w-xl text-base text-destructive">
              WebGL is unavailable, so the visuals are off — but the spatialised
              void is still playing. Put on headphones and listen for the
              structures moving around you.
            </p>
          )}
          {running && gyroDenied && (
            <p className="max-w-xl text-base text-destructive">
              Motion access was blocked. Steer the gaze with your pointer
              instead — the autonomous drift keeps the void alive either way.
            </p>
          )}
          {running && !gyroDenied && gyroMode === "pointer" && (
            <p className="max-w-xl text-sm text-muted-foreground">
              No gyroscope detected — move your pointer over the scene to look
              around, or just watch: an autonomous drift is always sweeping the
              gaze.
            </p>
          )}

          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin the drift
              </button>
            ) : (
              <>
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Return
                </button>
                <button
                  onClick={() => setMuted((v) => !v)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
              </>
            )}
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85dvh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">
              NDE Void — design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A dissociative (ketamine k-hole / near-death &quot;in-between&quot;)
                piece. Your body drifts forward on rails through a cold,
                architectural void while your <em>gaze</em> roams independently —
                the split between a falling body and a free-floating attention is
                the dissociative feel.
              </p>
              <p>
                The defining move is <strong>one geometry, two senses</strong>.
                A single table (<code>scene.ts</code>) returns each structure&apos;s
                camera-relative position every frame. That exact array feeds{" "}
                <em>both</em> the raymarched shader (as uniforms) <em>and</em> one{" "}
                <code>PannerNode</code> per structure (HRTF, inverse distance). So
                passing a structure genuinely relocates its cold, inharmonic bell
                to wherever its glow now is — they cannot drift apart.
              </p>
              <p>
                Four subsystems: (1) tilt/gyro gaze with inertia and an always-on
                autonomous ghost sweep; (2) a volumetric sphere-traced SDF scene of
                seven sparse luminous structures — portal tori, box-frame mullions,
                hyperbolic-paraboloid saddles, arches — glow-accumulated with{" "}
                <code>exp(−d·k)</code>, no lighting; (3) per-structure HRTF panners
                whose positions and the listener orientation are written from the
                shared geometry; (4) a cavern convolution reverb plus a near-silent
                sub.
              </p>
              <p>
                References: Pim van Lommel&apos;s NDE tunnel / &quot;in-between&quot;
                phenomenology; the ketamine k-hole / ego-dissolution literature
                (e.g. Frontiers, &quot;ketamine ego dissolution&quot;);
                Kl&uuml;ver&apos;s tunnel/cone form-constant (1926); Web Audio
                HRTF/KEMAR binaural rendering and the 2025–26 spatial-audio surge
                (e.g. the ASAudio survey, arXiv:2508.10924, and HRTFformer,
                arXiv:2510.01891); and Inigo Quilez / Shadertoy volumetric-SDF
                sphere tracing.
              </p>
              <p>
                Honest limitations: raymarching and HRTF both already exist in the
                lab — the novelty here is the combination, a{" "}
                <em>steerable spatial dissociative void</em>, not a new technique.
                The binaural payoff needs headphones; on laptop speakers it
                collapses toward stereo (still audibly directional). This evokes a
                phenomenology; it is not a medical claim about NDEs or ketamine.
              </p>
              <p>
                Safety: luminance changes are slow drifts (well under 0.3 Hz),
                brightness is tone-mapped and hard-clamped ≤ 0.7 (no white-out or
                strobe), and <code>prefers-reduced-motion</code> slows the drift,
                rotation and gaze-ghost.
              </p>
              <p className="text-xs">
                Next-cycle deepening: a richer SDF vocabulary (vaults, colonnades,
                interference lattices), a true head-tracked listener driven from
                the camera, and per-structure timbre keyed to form.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
