"use client";

/* ── 4808 · Effigy ─────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if your whole moving body were the resonator — 33
 *  full-body pose landmarks tuning a live chord and igniting a visionary
 *  particle-body — a drug-free embodiment toward an ecstatic, altered state?
 *
 *  INPUT: MediaPipe PoseLandmarker (33 full-body landmarks, CDN-loaded).
 *  OUTPUT: a three.js particle-body (~15k additive points that gather to the
 *  skeleton and melt with motion, smeared into afterimage trails) + a
 *  continuous resonant FM chord synth. Motion energy is the master intensity
 *  driving BOTH the melt of the light and the swell of the sound.
 *
 *  Inverts DiscoForcing (arXiv:2605.28491, audio→body): here the body writes
 *  the audio. See README.md for the full writeup + references.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  createLandmarker,
  createPoseTracker,
  BONES,
  LANDMARK_COUNT,
  type Landmark,
  type PoseLandmarkerInst,
  type PoseTracker,
} from "./pose";
import { createSyntheticDancer, type SyntheticDancer } from "./demo";
import { makeEffigySynth, type EffigySynth } from "./synth";
import { buildParticleBody, type ParticleBody } from "./particles";

const BACKDROP = 0x0b0713;
const HUD_VIOLET = "hsl(268 85% 74%)";

type Driver = "self-demo" | "you";
type CamState = "idle" | "starting" | "on" | "failed";

interface Engine {
  startAudioFn: () => void;
  stopAudioFn: () => void;
  startCameraFn: () => Promise<void>;
}

export default function EffigyPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const [soundOn, setSoundOn] = useState(false);
  const [camState, setCamState] = useState<CamState>("idle");
  const [driver, setDriver] = useState<Driver>("self-demo");
  const [webglOk, setWebglOk] = useState(true);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [camNotice, setCamNotice] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  const barRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);

  // ── Everything lives in one effect; buttons reach it through engineRef ──────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── three.js renderer / scenes (WebGL optional) ───────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    let particleBody: ParticleBody | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let fadeScene: THREE.Scene | null = null;
    let fadeCam: THREE.OrthographicCamera | null = null;
    let fadeMat: THREE.MeshBasicMaterial | null = null;
    let fadeGeo: THREE.PlaneGeometry | null = null;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      if (!renderer.getContext()) throw new Error("no webgl context");
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(BACKDROP, 1);
      renderer.autoClear = false;
      renderer.clear();
      mount.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(BACKDROP, 0.16);
      camera = new THREE.PerspectiveCamera(
        52,
        mount.clientWidth / Math.max(1, mount.clientHeight),
        0.1,
        100,
      );
      camera.position.set(0, 0.05, 3.4);
      camera.lookAt(0, 0.05, 0);

      particleBody = buildParticleBody(reduce ? 9000 : 15000, 0x4808);
      scene.add(particleBody.points);

      // fade quad → afterimage trails (draw over previous frame, no clear)
      fadeScene = new THREE.Scene();
      fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      fadeGeo = new THREE.PlaneGeometry(2, 2);
      fadeMat = new THREE.MeshBasicMaterial({
        color: BACKDROP,
        transparent: true,
        opacity: 0.2,
        depthTest: false,
        depthWrite: false,
      });
      fadeScene.add(new THREE.Mesh(fadeGeo, fadeMat));
    } catch {
      setWebglOk(false);
      if (renderer) {
        try {
          renderer.dispose();
        } catch {
          /* ignore */
        }
      }
      renderer = null;
      particleBody = null;
    }

    // ── pose + demo + audio state ─────────────────────────────────────────────
    const tracker: PoseTracker = createPoseTracker();
    const dancer: SyntheticDancer = createSyntheticDancer();

    let ac: AudioContext | null = null;
    let synth: EffigySynth | null = null;
    let landmarker: PoseLandmarkerInst | null = null;
    let stream: MediaStream | null = null;
    let sawRealBody = false;
    let lastLandmarks: Landmark[] | null = null;

    function startAudio() {
      if (ac) return;
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ac = new AC();
        void ac.resume();
        synth = makeEffigySynth(ac, 0.2);
        setAudioNotice(null);
      } catch {
        ac = null;
        synth = null;
        setAudioNotice(
          "Web Audio is unavailable in this browser, so the chord can't sound — the particle-body still dances.",
        );
      }
    }

    function stopAudio() {
      if (synth) {
        synth.dispose();
        synth = null;
      }
      const dead = ac;
      ac = null;
      if (dead && dead.state !== "closed") {
        window.setTimeout(() => {
          if (dead.state !== "closed") void dead.close();
        }, 350);
      }
    }

    async function startCamera() {
      setCamState("starting");
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamState("failed");
        setCamNotice(
          "No camera here — the seeded dancer keeps driving the whole instrument so the idea reads with zero devices.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
      } catch {
        setCamState("failed");
        setCamNotice(
          "Camera off or blocked — the seeded dancer keeps driving the instrument on its own.",
        );
        return;
      }
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          /* ignore */
        }
      }
      try {
        landmarker = await createLandmarker();
        setCamState("on");
        setCamNotice(null);
      } catch {
        setCamState("failed");
        setCamNotice(
          "Body-tracking model couldn't load (offline?) — the seeded dancer keeps driving the instrument.",
        );
      }
    }

    engineRef.current = {
      startAudioFn: startAudio,
      stopAudioFn: stopAudio,
      startCameraFn: startCamera,
    };

    // ── HUD skeleton (a small inset when WebGL runs; full-bleed if it doesn't) ─
    function drawHud(w: number, h: number) {
      const canvas = hudRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const sk = lastLandmarks;
      if (!sk || sk.length < LANDMARK_COUNT) return;
      ctx.strokeStyle = HUD_VIOLET;
      ctx.fillStyle = HUD_VIOLET;
      ctx.lineWidth = webglOk ? 1.5 : 2.5;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (const [a, b] of BONES) {
        ctx.moveTo(sk[a].x * w, sk[a].y * h);
        ctx.lineTo(sk[b].x * w, sk[b].y * h);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      const r = webglOk ? 1.8 : 3;
      for (const p of sk) {
        ctx.beginPath();
        ctx.arc(p.x * w, p.y * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── main loop ─────────────────────────────────────────────────────────────
    let raf = 0;
    let lastMs = performance.now();
    const t0 = lastMs;
    let readoutAccum = 0;

    function loop(nowMs: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const time = (nowMs - t0) / 1000;

      // ── read the body: real camera if it has ever seen one, else the dancer ──
      let lm: Landmark[] | null = null;
      let real = false;
      const video = videoRef.current;
      if (landmarker && stream && video && video.readyState >= 2) {
        try {
          const res = landmarker.detectForVideo(video, nowMs);
          if (res && res.landmarks && res.landmarks.length > 0) {
            lm = res.landmarks[0].map((p) => ({ x: 1 - p.x, y: p.y, z: p.z, visibility: p.visibility }));
            real = true;
            if (!sawRealBody) {
              sawRealBody = true;
              setDriver("you");
            }
          } else if (sawRealBody) {
            lm = null; // body genuinely left frame → let it dissolve
            real = true;
          }
        } catch {
          /* transient detect error — fall through to the dancer this frame */
        }
      }
      if (!real) lm = dancer.sample(nowMs);
      lastLandmarks = lm;

      const { frame, world } = tracker.update(lm, dt);
      if (synth) synth.setFrame(frame, nowMs);

      // ── visuals ──
      if (renderer && particleBody && scene && camera && fadeScene && fadeCam && fadeMat) {
        particleBody.update(world, frame.motion, frame.openness, frame.present, dt, time, reduce);
        const fade = reduce
          ? 0.34
          : Math.max(0.1, Math.min(0.4, 0.1 + (1 - frame.motion) * 0.15));
        fadeMat.opacity = fade;
        renderer.render(fadeScene, fadeCam);
        renderer.render(scene, camera);
      }

      const hud = hudRef.current;
      if (hud) drawHud(hud.clientWidth, hud.clientHeight);

      readoutAccum += dt;
      if (readoutAccum > 0.1) {
        readoutAccum = 0;
        if (barRef.current) barRef.current.style.width = `${Math.round(frame.motion * 100)}%`;
        if (labelRef.current) {
          labelRef.current.textContent = !frame.present
            ? "no body — the effigy dissolves"
            : frame.motion < 0.15
              ? "stillness — the effigy gathers"
              : frame.motion < 0.45
                ? "moving — the light stirs"
                : frame.motion < 0.75
                  ? "dancing — the chord blooms"
                  : "ecstatic — liquid light";
        }
      }
    }
    raf = requestAnimationFrame(loop);

    // ── resize ────────────────────────────────────────────────────────────────
    function onResize() {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (renderer && camera) {
        renderer.setSize(w, h);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
        renderer.clear();
      }
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── full teardown ─────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
      if (landmarker) {
        try {
          landmarker.close();
        } catch {
          /* ignore */
        }
      }
      if (synth) synth.dispose();
      if (ac && ac.state !== "closed") {
        const dead = ac;
        window.setTimeout(() => {
          if (dead.state !== "closed") void dead.close();
        }, 350);
      }
      if (particleBody) particleBody.dispose();
      if (fadeGeo) fadeGeo.dispose();
      if (fadeMat) fadeMat.dispose();
      if (renderer) {
        renderer.dispose();
        try {
          renderer.forceContextLoss();
        } catch {
          /* ignore */
        }
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      }
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // built once; buttons drive it through engineRef

  const handleStartSound = useCallback(() => {
    engineRef.current?.startAudioFn();
    setSoundOn(true);
  }, []);
  const handleStopSound = useCallback(() => {
    engineRef.current?.stopAudioFn();
    setSoundOn(false);
  }, []);
  const handleCamera = useCallback(() => {
    void engineRef.current?.startCameraFn();
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* hidden video feeds MediaPipe only; never shown */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* full-bleed WebGL particle-body */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* skeleton overlay — small inset when WebGL runs, full-bleed fallback if not */}
      <canvas
        ref={hudRef}
        className={
          webglOk
            ? "pointer-events-none absolute bottom-4 right-4 z-10 h-[24%] w-[24%] rounded-md border border-border bg-black/30"
            : "pointer-events-none absolute inset-0 z-10 h-full w-full bg-black"
        }
      />

      {/* design-notes button */}
      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* hero + controls */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-5 sm:p-7">
        <header className="max-w-xl">
          <Link
            href="/dream"
            className="pointer-events-auto text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            ← back to the dream lab
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Effigy</h1>
          <p className="mt-2 max-w-lg text-base leading-relaxed text-foreground">
            Your whole moving body is the resonator. Thirty-three pose landmarks
            tune a live chord and ignite a particle-body of light — stand still
            and it gathers into a luminous effigy; dance and it melts into liquid
            light as the chord swells. Drug-free embodiment toward the ecstatic.
          </p>
        </header>

        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            {audioNotice && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                {audioNotice}
              </p>
            )}
            {camNotice && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-muted-foreground">
                {camNotice}
              </p>
            )}
            {!webglOk && (
              <p className="pointer-events-auto max-w-md text-base leading-relaxed text-destructive">
                WebGL isn&apos;t available here, so the particle-body can&apos;t render — the seeded
                dancer still drives the skeleton and (once started) the full chord, so the idea
                still reads.
              </p>
            )}

            <div className="pointer-events-auto flex flex-wrap items-center gap-3">
              {!soundOn ? (
                <button
                  type="button"
                  onClick={handleStartSound}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Start sound
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopSound}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop sound
                </button>
              )}
              {camState !== "on" && (
                <button
                  type="button"
                  onClick={handleCamera}
                  disabled={camState === "starting"}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                >
                  {camState === "starting"
                    ? "Enabling camera…"
                    : camState === "failed"
                      ? "Retry camera"
                      : "Enable camera — become the effigy"}
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>
                driving: <span className="text-primary">{driver === "you" ? "you" : "seeded dancer"}</span>
              </span>
              <span>sound: {soundOn ? "on" : "off"}</span>
            </div>

            {/* intensity (motion energy) meter */}
            <div className="w-64 max-w-full">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  intensity
                </span>
                <span
                  ref={labelRef}
                  className="font-mono text-xs uppercase tracking-[0.18em] text-primary"
                >
                  stillness — the effigy gathers
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  ref={barRef}
                  className="h-full bg-primary transition-[width]"
                  style={{ width: "0%" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* design notes modal */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              4808 · effigy
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The one question:</span> what if your whole
                moving body were the resonator — 33 full-body pose landmarks tuning a live chord
                and igniting a visionary particle-body, a drug-free embodiment toward an
                ecstatic, altered state?
              </p>
              <p>
                Input is MediaPipe <span className="text-foreground">PoseLandmarker</span> (33
                whole-body landmarks, loaded from a pinned CDN at runtime — not per-finger, not
                the face; the whole dancing figure). Each frame the pose is reduced to a few
                continuous scalars: <span className="text-foreground">posture</span> (raised arms
                + tall stance), <span className="text-foreground">spread</span> (limb span),{" "}
                <span className="text-foreground">verticality</span>,{" "}
                <span className="text-foreground">lean</span>, and — the master —{" "}
                <span className="text-foreground">motion energy</span> (smoothed frame-to-frame
                landmark velocity).
              </p>
              <p>
                Those scalars write a <span className="text-foreground">continuous resonant
                chord</span>: whole-body posture picks the root frequency (a plain exponential
                glide, never snapped to a scale) and the chord&apos;s quality (arms down slide the
                third minor → major); limb spread blooms the upper extensions in; verticality
                opens a lowpass; and motion energy is the intensity that climbs the FM index,
                swells the whole mix, reinforces a sub and opens an ecstatic &ldquo;breath&rdquo;
                band. It is a 6-partial 2-operator-FM voicing through a soft limiter.
              </p>
              <p>
                The same scalars sculpt the <span className="text-foreground">particle-body</span>:
                ~15k additive three.js points, each permanently bound to one bone of the skeleton
                (or free as ambient dust). Points spring toward their bone with a stiffness that
                falls as motion rises, while a curl-ish flow field pushes them out with a force
                that rises with motion — so a still body gathers the cloud into a luminous effigy
                and a dancing one melts it into liquid light. Afterimage trails come from not
                clearing the buffer (a translucent violet fade quad), lengthening with motion.
              </p>
              <p>
                <span className="text-foreground">Degrades gracefully.</span> Sound starts on your
                gesture; the camera is a separate explicit opt-in. With no camera / denied
                permission / model-load failure / no WebGL, a{" "}
                <span className="text-foreground">seeded deterministic dancer</span> (mulberry32,
                seed <code>0x4808</code>, on a <code>performance.now()</code> clock) drives the
                exact same synth + particle pipeline — a calm sway that sweeps into an overhead
                ecstatic peak and back — so the whole idea reads with zero devices. The first real
                detected body flips the badge from <em>seeded dancer</em> to <em>you</em>. No
                Math.random / Date.now anywhere.
              </p>
              <p>
                <span className="text-foreground">Safety.</span> Luminance drift is slow and
                smooth (a ~0.22 Hz breath + smoothed motion), never a strobe;{" "}
                <code>prefers-reduced-motion</code> lowers particle count, turbulence and trail
                length.
              </p>
              <p>
                <span className="text-foreground">References:</span> inverts{" "}
                <em>DiscoForcing</em> (arXiv:2605.28491, 2026 — real-time audio→body motion
                synthesis; here the mapping is reversed, body→audio); Marco Donnarumma,{" "}
                <em>Corpus Nil</em> (the body as instrument); Daniel Rozin&apos;s mechanical
                mirrors (your silhouette becomes the medium). Full writeup in README.md.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
