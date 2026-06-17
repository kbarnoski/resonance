"use client";

// ── Presence Field ───────────────────────────────────────────────────────────
// "What if your whole body, tracked as a luminous skeleton, conducted a SPATIAL
//  ensemble — each limb a voice placed in 3D around you?"
//
// INPUT  : webcam full-body pose (MediaPipe Pose, CDN at runtime)
// OUTPUT : three.js — a glowing body-constellation in a dark 3D room
// CORE   : pose landmarks → Web-Audio HRTF PannerNodes (spatialization IS the
//          instrument). Moving the body sweeps voices around the listener.
// VIBE   : adult, meditative, installation, awe (Anadol-like, luminous).

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";
import {
  PresenceEngine,
  VOICES,
  type PositionMap,
  type VoiceSpec,
} from "./audio";
import {
  createLandmarker,
  bodyFromLandmarks,
  demoBody,
  BONES,
  LM,
  type Body,
  type PoseLandmarkerInst,
} from "./pose";

type Phase = "idle" | "running";

// Which landmark drives each audio voice region.
const REGION_LM: Record<VoiceSpec["region"], number> = {
  head: LM.nose,
  leftWrist: LM.leftWrist,
  rightWrist: LM.rightWrist,
  leftElbow: LM.leftElbow,
  rightElbow: LM.rightElbow,
  torso: LM.leftShoulder, // approximated below as shoulder midpoint
  hips: LM.leftHip, // approximated below as hip midpoint
};

// Build the per-voice 3D position+level map from a Body.
function positionsFromBody(body: Body): PositionMap {
  const out: PositionMap = {};
  for (const v of VOICES) {
    const region = v.region;
    let pt: { x: number; y: number; z: number; v: number } | undefined;
    if (region === "torso") {
      const a = body.pts[LM.leftShoulder];
      const b = body.pts[LM.rightShoulder];
      if (a && b)
        pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: 1 };
    } else if (region === "hips") {
      const a = body.pts[LM.leftHip];
      const b = body.pts[LM.rightHip];
      if (a && b)
        pt = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, v: 1 };
    } else {
      pt = body.pts[REGION_LM[region]];
    }
    if (pt && pt.v > 0.2) {
      out[region] = {
        x: pt.x,
        y: pt.y,
        z: pt.z,
        level: 0.5 + body.feat.brightness * 0.5,
      };
    }
  }
  return out;
}

// Mutable per-frame state, kept out of React.
interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  jointGeo: THREE.SphereGeometry;
  jointMat: THREE.MeshBasicMaterial;
  joints: Map<number, THREE.Mesh>;
  bones: THREE.LineSegments;
  bonePositions: Float32Array;
  voiceMarkers: Map<VoiceSpec["region"], THREE.Mesh>;
  group: THREE.Group;
}

const VOICE_HUES: Record<VoiceSpec["region"], number> = {
  head: 0.58,
  leftWrist: 0.72,
  rightWrist: 0.5,
  leftElbow: 0.78,
  rightElbow: 0.46,
  torso: 0.62,
  hips: 0.68,
};

export default function PresenceFieldPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const engineRef = useRef<PresenceEngine | null>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const landmarkerRef = useRef<PoseLandmarkerInst | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const prevCentreRef = useRef<[number, number]>([0, 0]);
  const lastPoseAtRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const demoActiveRef = useRef<boolean>(false);
  const smoothBodyRef = useRef<Body | null>(null);

  // ── three.js scene construction ──
  const buildScene = useCallback((): boolean => {
    const mount = mountRef.current;
    if (!mount) return false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError(true);
      return false;
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x05060a, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060a, 0.045);

    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    camera.position.set(0, 0.3, 7.5);
    camera.lookAt(0, 0, -2);

    const group = new THREE.Group();
    scene.add(group);

    // Faint room: a grid floor + back wall so spatial placement reads.
    const grid = new THREE.GridHelper(24, 24, 0x1b2740, 0x0e1626);
    grid.position.y = -3.2;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    scene.add(grid);

    // Joint spheres (shared geom/mat, additive glow).
    const jointGeo = new THREE.SphereGeometry(0.13, 16, 16);
    const jointMat = new THREE.MeshBasicMaterial({
      color: 0x9fd4ff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const joints = new Map<number, THREE.Mesh>();
    const allLm = new Set<number>();
    for (const [a, b] of BONES) {
      allLm.add(a);
      allLm.add(b);
    }
    for (const idx of allLm) {
      const m = new THREE.Mesh(jointGeo, jointMat);
      group.add(m);
      joints.set(idx, m);
    }

    // Skeleton bone lines.
    const bonePositions = new Float32Array(BONES.length * 2 * 3);
    const boneGeo = new THREE.BufferGeometry();
    boneGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(bonePositions, 3),
    );
    const boneMat = new THREE.LineBasicMaterial({
      color: 0x6fb4ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
    });
    const bones = new THREE.LineSegments(boneGeo, boneMat);
    group.add(bones);

    // A glowing marker at each voice's spatial position.
    const voiceMarkers = new Map<VoiceSpec["region"], THREE.Mesh>();
    for (const v of VOICES) {
      const geo = new THREE.SphereGeometry(0.22, 20, 20);
      const col = new THREE.Color().setHSL(VOICE_HUES[v.region], 0.7, 0.6);
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      });
      const m = new THREE.Mesh(geo, mat);
      group.add(m);
      voiceMarkers.set(v.region, m);
    }

    sceneRef.current = {
      renderer,
      scene,
      camera,
      jointGeo,
      jointMat,
      joints,
      bones,
      bonePositions,
      voiceMarkers,
      group,
    };
    return true;
  }, []);

  // Map a normalized body point ([-1,1] x/y, 0..1 depth) into world space.
  const toWorld = useCallback(
    (x: number, y: number, z: number): THREE.Vector3 => {
      return new THREE.Vector3(x * 4.0, y * 2.6, -1.4 - (1 - z) * 3.5);
    },
    [],
  );

  // ── render + audio frame ──
  const renderFrame = useCallback(
    (body: Body, isDemo: boolean) => {
      const s = sceneRef.current;
      if (!s) return;

      // Low-pass smooth the body for liquid motion.
      const prev = smoothBodyRef.current;
      const a = isDemo ? 1 : 0.35;
      let cur = body;
      if (prev) {
        const merged: Body["pts"] = {};
        for (const k of Object.keys(body.pts)) {
          const idx = Number(k);
          const np = body.pts[idx];
          const pp = prev.pts[idx] ?? np;
          merged[idx] = {
            x: pp.x + (np.x - pp.x) * a,
            y: pp.y + (np.y - pp.y) * a,
            z: pp.z + (np.z - pp.z) * a,
            v: np.v,
          };
        }
        cur = { pts: merged, feat: body.feat };
      }
      smoothBodyRef.current = cur;

      // Joints.
      for (const [idx, mesh] of s.joints) {
        const p = cur.pts[idx];
        if (p && p.v > 0.2) {
          const w = toWorld(p.x, p.y, p.z);
          mesh.position.copy(w);
          mesh.visible = true;
          const sc = 1 + cur.feat.brightness * 0.8;
          mesh.scale.setScalar(sc);
        } else {
          mesh.visible = false;
        }
      }

      // Bones.
      const bp = s.bonePositions;
      let oi = 0;
      for (const [ai, bi] of BONES) {
        const pa = cur.pts[ai];
        const pb = cur.pts[bi];
        if (pa && pb) {
          const wa = toWorld(pa.x, pa.y, pa.z);
          const wb = toWorld(pb.x, pb.y, pb.z);
          bp[oi++] = wa.x;
          bp[oi++] = wa.y;
          bp[oi++] = wa.z;
          bp[oi++] = wb.x;
          bp[oi++] = wb.y;
          bp[oi++] = wb.z;
        } else {
          for (let k = 0; k < 6; k++) bp[oi++] = 0;
        }
      }
      s.bones.geometry.attributes.position.needsUpdate = true;

      // Voice positions → audio engine + marker meshes.
      const positions = positionsFromBody(cur);
      for (const v of VOICES) {
        const marker = s.voiceMarkers.get(v.region);
        const pos = positions[v.region];
        if (marker) {
          if (pos) {
            const w = toWorld(pos.x, pos.y, pos.z);
            marker.position.copy(w);
            marker.visible = true;
            const mat = marker.material as THREE.MeshBasicMaterial;
            mat.opacity = 0.35 + pos.level * 0.45;
            marker.scale.setScalar(0.8 + pos.level * 0.8);
          } else {
            marker.visible = false;
          }
        }
      }

      const engine = engineRef.current;
      if (engine) {
        if (cur.feat.motion < 0.04 && !isDemo) {
          engine.settle();
        } else {
          engine.update(positions, cur.feat.spread, cur.feat.brightness);
        }
      }

      // Slow auto-rotate of the constellation for installation feel.
      s.group.rotation.y = Math.sin(performance.now() * 0.00007) * 0.18;
      s.renderer.render(s.scene, s.camera);
    },
    [toWorld],
  );

  // ── main loop ──
  const loop = useCallback(() => {
    rafRef.current = requestAnimationFrame(loop);
    const now = performance.now();
    const lm = landmarkerRef.current;
    const video = videoRef.current;

    let got = false;
    if (lm && video && video.readyState >= 2) {
      try {
        const res = lm.detectForVideo(video, now);
        const p = res.landmarks?.[0];
        if (p && p.length > 24) {
          const { body, centre } = bodyFromLandmarks(p, prevCentreRef.current);
          prevCentreRef.current = centre;
          lastPoseAtRef.current = now;
          demoActiveRef.current = false;
          if (demoMode) setDemoMode(false);
          renderFrame(body, false);
          got = true;
        }
      } catch {
        /* detection hiccup — fall through to demo */
      }
    }

    // No live pose for ~2.5s (or no camera/model at all) → self-playing demo.
    if (!got) {
      const idle = now - lastPoseAtRef.current > 2500 || lastPoseAtRef.current === 0;
      if (idle) {
        if (!demoActiveRef.current) {
          demoActiveRef.current = true;
          setDemoMode(true);
        }
        const t = (now - startedAtRef.current) / 1000;
        renderFrame(demoBody(t), true);
      }
    }
  }, [demoMode, renderFrame]);

  // ── camera + landmarker (best-effort) ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      try {
        landmarkerRef.current = await createLandmarker();
        setNotice(null);
      } catch {
        setNotice(
          "Body tracking couldn't load — playing the auto-demo so you can still hear the spatial ensemble.",
        );
      }
    } catch {
      setNotice(
        "No camera available — the auto-demo is conducting the ensemble for you.",
      );
    }
  }, []);

  // ── primary action: Start (AudioContext inside the gesture for iOS) ──
  const start = useCallback(async () => {
    if (phase !== "idle") return;
    setPhase("running");
    startedAtRef.current = performance.now();
    lastPoseAtRef.current = 0;

    const engine = new PresenceEngine();
    engineRef.current = engine;
    try {
      await engine.start();
    } catch {
      setNotice("Audio could not start in this browser.");
    }

    if (!sceneRef.current && !glError) buildScene();
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(loop);
    startCamera();
  }, [phase, glError, buildScene, loop, startCamera]);

  // Build scene early so it animates BEFORE audio unlocks.
  useEffect(() => {
    if (!buildScene()) return;
    // Idle preview: run the demo body before Start is pressed.
    startedAtRef.current = performance.now();
    const preview = () => {
      rafRef.current = requestAnimationFrame(preview);
      const t = (performance.now() - startedAtRef.current) / 1000;
      renderFrame(demoBody(t), true);
    };
    rafRef.current = requestAnimationFrame(preview);

    const onResize = () => {
      const s = sceneRef.current;
      const mount = mountRef.current;
      if (!s || !mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
      s.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When Start is pressed we want the real loop, not the preview. Swap rAF.
  useEffect(() => {
    if (phase !== "running") return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [phase, loop]);

  // ── full teardown on unmount ──
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;

      const lm = landmarkerRef.current;
      if (lm) {
        try {
          lm.close();
        } catch {
          /* ignore */
        }
        landmarkerRef.current = null;
      }

      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const engine = engineRef.current;
      if (engine) {
        engine.stop();
        engineRef.current = null;
      }

      const s = sceneRef.current;
      if (s) {
        s.jointGeo.dispose();
        s.jointMat.dispose();
        (s.bones.geometry as THREE.BufferGeometry).dispose();
        (s.bones.material as THREE.Material).dispose();
        for (const m of s.voiceMarkers.values()) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
        s.renderer.dispose();
        if (s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
        sceneRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05060a] text-white">
      {/* three.js canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* hidden video element feeding MediaPipe */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {glError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">
            WebGL is unavailable in this browser, so the 3D room can&apos;t
            render. The spatial ensemble still plays when you press Start.
          </p>
        </div>
      )}

      {/* top-left: title + description */}
      <div className="pointer-events-none absolute left-0 top-0 p-5 sm:p-7">
        <h1 className="font-mono text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Presence Field
        </h1>
        <p className="mt-2 max-w-sm text-base leading-snug text-white/80">
          Your body becomes a spatial ensemble. Each limb is a voice placed in
          3D around you — spread your arms and the music sweeps through the
          room.
        </p>
        <p className="mt-2 max-w-sm font-mono text-base text-white/75">
          Camera stays on-device. Nothing is stored or sent.
        </p>
      </div>

      {/* status line */}
      {phase === "running" && (
        <div className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 p-5 sm:p-7">
          {demoMode && (
            <p className="font-mono text-base text-cyan-200/80">
              auto-demo — a virtual body is conducting the ensemble
            </p>
          )}
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 w-[min(90vw,40rem)] -translate-x-1/2 p-4 text-center">
          <p className="text-base text-rose-300">{notice}</p>
        </div>
      )}

      {/* Start button */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex items-end justify-center pb-16 sm:items-center sm:pb-0">
          <button
            onClick={start}
            className="pointer-events-auto min-h-[44px] rounded-full border border-white/25 bg-white/10 px-4 py-2.5 font-mono text-base font-medium text-white backdrop-blur-md transition-colors hover:bg-white/20"
          >
            ▶ Start — step into the field
          </button>
        </div>
      )}

      {/* corner: design notes */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="pointer-events-auto absolute bottom-4 right-4 min-h-[44px] rounded-full border border-white/15 bg-black/50 px-4 py-2.5 font-mono text-base text-white/75 backdrop-blur-md transition-colors hover:text-white"
      >
        Design notes
      </button>

      {showNotes && (
        <div className="absolute bottom-20 right-4 w-[min(92vw,30rem)] rounded-xl border border-white/15 bg-black/85 p-5 backdrop-blur-md">
          <h2 className="font-mono text-xl font-semibold text-white">
            Design notes
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/80">
            Each tracked joint drives a sustained voice through its own
            HRTF-spatialized PannerNode. The body&apos;s position becomes the
            sound&apos;s position in 3D — spatialization is the instrument.
            Harmony is a slow drifting chord in D Dorian. See the README for
            references: arXiv:2601.22082 (spatialization → presence),
            &quot;Sounding Bodies&quot; (arXiv:2311.06285), and Krueger&apos;s
            Videoplace (1974).
          </p>
          <Link
            href="/dream/677-presence-field"
            className="mt-3 inline-block font-mono text-base text-cyan-300 hover:text-cyan-200"
          >
            README →
          </Link>
        </div>
      )}
    </main>
  );
}
