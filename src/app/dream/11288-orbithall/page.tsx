"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11288 · orbit•hall — SEE your own binaural spatialisation in 3-D.
//
//   ONE QUESTION
//   What if you could SEE your own binaural spatialisation in 3-D — watch your
//   listener-body move through a room of voices while a live tether to each
//   source shows, at a glance, how dry-and-near vs wet-and-far it sounds?
//
//   This deepens 10808-orbitroom (a flat top-down binaural map) into a real 3-D
//   room seen from a slowly ORBITING third-person camera. You see a dark hall
//   (floor grid + faint bounding walls), a bright listener avatar with a
//   forward tick, and five ambient voices placed at varied distances.
//
//   THE LEGIBILITY MOVE. A live tether runs from the avatar to each source and
//   encodes that source's Direct-to-Reverberant Ratio (DRR) — the room cue that
//   governs distance perception (survey arXiv:2503.12948). Near / high-DRR / dry
//   → a bright, thin, taut cyan tether. Far / low-DRR / wet → a dim, thick,
//   washed-out tether with a soft haze around the far source. So you can SEE
//   which voices are near-and-dry vs far-and-wet — a read a flat map can't give.
//
//   THE AUDIO. Each voice's DRY path is a PannerNode (HRTF) — genuine binaural.
//   Its WET path feeds a shared FEEDBACK-DELAY-NETWORK room (a ring of four
//   damped delay lines — a recirculating reverberator, deliberately NOT a
//   convolver). Each frame dry gain falls with distance, wet-send rises, a
//   per-source lowpass darkens far sources; the DRR falls with distance. See
//   audio.ts.
//
//   INPUT. Front camera → model-free silhouette centroid + area (no MediaPipe /
//   TensorFlow / network). Centroid-X → avatar X (mirrored); area → depth Z.
//   FALLBACK. A seeded virtual walker drifts the avatar on a Lissajous path so a
//   muted phone sees the hall + tethers within ~1 s; "Enable camera" hands over.
//
//   REF. HRTF PannerNode binaural spatialisation (Web Audio) + Google Omnitone /
//   Resonance-Audio — the living web-spatial-audio technique — with a front
//   camera standing in for a headset IMU as the pose source.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  makeHallAudio,
  sourceLayout,
  hallDistance,
  drrFromDistance,
  type HallAudio,
  type SourceView,
} from "./audio";
import {
  startSilhouette,
  makeVirtualRig,
  type SilhouetteRig,
  type SilhouetteMode,
} from "./silhouette";

const WALKER_SEED = 0x11288;

// Room + travel extents (metres). Everything lives on one plane so the DRR read
// stays legible from the orbiting camera.
const ROOM_HALF = 4;
const FLOOR_Y = 0;
const BODY_Y = 0.6;
const LISTENER_X = 1.8;
const LISTENER_Z = 1.6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// Cool endpoints for the tether's DRR encoding.
const COL_DRY = new THREE.Color().setHSL(190 / 360, 0.85, 0.62); // near/dry
const COL_WET = new THREE.Color().setHSL(205 / 360, 0.22, 0.36); // far/wet

// Scratch objects reused each frame (no per-frame allocation).
const scFrom = new THREE.Vector3();
const scTo = new THREE.Vector3();
const scMid = new THREE.Vector3();
const scDir = new THREE.Vector3();
const scUp = new THREE.Vector3(0, 1, 0);
const scQuat = new THREE.Quaternion();

interface SourceMeshes {
  core: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  haze: THREE.Mesh;
  hazeMat: THREE.MeshBasicMaterial;
  tether: THREE.Mesh;
  tetherMat: THREE.MeshBasicMaterial;
}

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  avatar: THREE.Group;
  sources: SourceMeshes[];
  // shared geometries to dispose
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
}

// Orient + stretch a unit cylinder (radius 1, height 1, along +Y) into a tether
// running from `a` to `b` with the given radius.
function applyTether(
  mesh: THREE.Mesh,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
) {
  scDir.subVectors(b, a);
  const len = scDir.length();
  if (len < 1e-4) {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;
  scDir.normalize();
  scMid.addVectors(a, b).multiplyScalar(0.5);
  mesh.position.copy(scMid);
  scQuat.setFromUnitVectors(scUp, scDir);
  mesh.quaternion.copy(scQuat);
  mesh.scale.set(radius, len, radius);
}

type Phase = "idle" | "running" | "failed";

export default function OrbitHallPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<SceneRefs | null>(null);

  const rigRef = useRef<SilhouetteRig | null>(null);
  const audioRef = useRef<HallAudio | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);

  const rafRef = useRef(0);
  const lastRef = useRef(0);
  const clockRef = useRef(0);
  const orbitRef = useRef(0);
  const reducedRef = useRef(false);

  // smoothed avatar position (metres)
  const lxRef = useRef(0);
  const lzRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<SilhouetteMode>("virtual");
  const [audioOn, setAudioOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── build the three.js hall ────────────────────────────────────────────────
  const buildScene = useCallback((): SceneRefs | null => {
    const mount = mountRef.current;
    if (!mount) return null;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError(true);
      return null;
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x03080c, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03080c, 0.05);

    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
    camera.position.set(0, 5.4, 10);
    camera.lookAt(0, BODY_Y, 0.4);

    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    // floor grid — deep teal
    const grid = new THREE.GridHelper(
      ROOM_HALF * 2,
      16,
      0x1c3a44,
      0x0e2028,
    );
    grid.position.y = FLOOR_Y;
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.5;
    scene.add(grid);
    geos.push(grid.geometry as THREE.BufferGeometry);
    mats.push(gridMat);

    // faint bounding walls (wireframe box)
    const boxGeo = new THREE.BoxGeometry(ROOM_HALF * 2, 2.6, ROOM_HALF * 2);
    const edges = new THREE.EdgesGeometry(boxGeo);
    const wallMat = new THREE.LineBasicMaterial({
      color: 0x2a5460,
      transparent: true,
      opacity: 0.28,
    });
    const walls = new THREE.LineSegments(edges, wallMat);
    walls.position.y = 1.3;
    scene.add(walls);
    boxGeo.dispose();
    geos.push(edges);
    mats.push(wallMat);

    // shared geometries
    const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const coreGeo = new THREE.SphereGeometry(0.24, 20, 20);
    const hazeGeo = new THREE.SphereGeometry(0.5, 16, 16);
    geos.push(cylGeo, coreGeo, hazeGeo);

    const layout = sourceLayout();
    const sources: SourceMeshes[] = layout.map((s) => {
      const tetherMat = new THREE.MeshBasicMaterial({
        color: COL_DRY.clone(),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const tether = new THREE.Mesh(cylGeo, tetherMat);
      scene.add(tether);

      const coreMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(s.hue / 360, 0.6, 0.55),
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(s.x, BODY_Y, s.z);
      scene.add(core);

      const hazeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(s.hue / 360, 0.35, 0.42),
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const haze = new THREE.Mesh(hazeGeo, hazeMat);
      haze.position.set(s.x, BODY_Y, s.z);
      scene.add(haze);

      mats.push(tetherMat, coreMat, hazeMat);
      return { core, coreMat, haze, hazeMat, tether, tetherMat };
    });

    // listener avatar — pale-cyan orb + forward tick (faces −Z)
    const avatar = new THREE.Group();
    const orbGeo = new THREE.SphereGeometry(0.26, 24, 24);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xd7f2fb });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    avatar.add(orb);

    const haloGeo = new THREE.SphereGeometry(0.44, 20, 20);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x9fd8ea,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    avatar.add(halo);

    const tickGeo = new THREE.ConeGeometry(0.11, 0.42, 14);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0xeaf9ff });
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.rotation.x = -Math.PI / 2; // point −Z (forward)
    tick.position.set(0, 0, -0.42);
    avatar.add(tick);

    avatar.position.set(0, BODY_Y, 0);
    scene.add(avatar);
    geos.push(orbGeo, haloGeo, tickGeo);
    mats.push(orbMat, haloMat, tickMat);

    return { renderer, scene, camera, avatar, sources, geos, mats };
  }, []);

  // ── the single loop — self-demos the virtual walker on mount ────────────────
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    rigRef.current = makeVirtualRig(WALKER_SEED);

    const refs = buildScene();
    if (!refs) return; // glError already set — chrome still renders
    sceneRef.current = refs;

    const resize = () => {
      const mount = mountRef.current;
      const s = sceneRef.current;
      if (!mount || !s) return;
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      s.renderer.setSize(w, h);
      s.camera.aspect = w / h;
      s.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);

    lastRef.current = performance.now();
    const layout = sourceLayout();

    const loop = () => {
      const now = performance.now();
      let dt = (now - lastRef.current) / 1000;
      lastRef.current = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 0;
      dt = Math.min(dt, 0.05);
      const slow = reducedRef.current ? 0.5 : 1;
      clockRef.current += dt * slow;

      const rig = rigRef.current;
      const reading = rig ? rig.read(dt * slow) : { x: 0.5, y: 0.5, area: 0.3 };

      // body centroid → avatar position (metres)
      const targetX = (reading.x - 0.5) * 2 * LISTENER_X;
      const targetZ = -clamp((reading.area - 0.3) * 5.2, -1, 1) * LISTENER_Z;
      const k = 1 - Math.exp(-dt / 0.14);
      lxRef.current += (targetX - lxRef.current) * k;
      lzRef.current += (targetZ - lzRef.current) * k;
      const lx = lxRef.current;
      const lz = lzRef.current;

      // audio (once begun) computes DRR; otherwise derive it from geometry so
      // the tethers are alive before "Begin".
      const audio = audioRef.current;
      let views: SourceView[];
      if (audio) {
        audio.setListener(lx, 0, lz);
        audio.step(dt);
        views = audio.sources;
      } else {
        views = layout.map((s, i) => {
          const d = hallDistance(lx, lz, s.x, s.z);
          const level =
            0.4 +
            0.6 * (0.5 + 0.5 * Math.sin(clockRef.current * 0.2 + i * 1.3));
          return { x: s.x, z: s.z, hue: s.hue, level, d, drr01: drrFromDistance(d) };
        });
      }

      // ── update meshes ────────────────────────────────────────────────────
      const s = sceneRef.current;
      if (s) {
        s.avatar.position.set(lx, BODY_Y, lz);

        scFrom.set(lx, BODY_Y, lz);
        for (let i = 0; i < s.sources.length; i++) {
          const sm = s.sources[i];
          const v = views[i];
          scTo.set(v.x, BODY_Y, v.z);

          // tether encodes DRR: near/dry = thin, bright, taut cyan;
          // far/wet = thick, dim, washed steel.
          const radius = 0.014 + (1 - v.drr01) * 0.05;
          applyTether(sm.tether, scFrom, scTo, radius);
          sm.tetherMat.color.lerpColors(COL_WET, COL_DRY, v.drr01);
          sm.tetherMat.opacity = 0.16 + v.drr01 * 0.58;

          // source core breathes with level; brightness tracks DRR
          const coreScale = 0.8 + v.level * 0.5;
          sm.core.scale.setScalar(coreScale);
          sm.coreMat.color.setHSL(
            v.hue / 360,
            0.55,
            0.34 + v.drr01 * 0.26 + v.level * 0.08,
          );

          // haze swells for FAR / wet sources — the reverberant halo
          const wetness = 1 - v.drr01;
          const hazeScale = 0.7 + wetness * 1.9;
          sm.haze.scale.setScalar(hazeScale);
          sm.hazeMat.opacity = 0.05 + wetness * 0.2;
        }

        // slow third-person orbit (sub-1 Hz; calmer under reduced-motion)
        const orbitSpeed = reducedRef.current ? 0.03 : 0.14;
        orbitRef.current += dt * orbitSpeed;
        const rad = 10;
        s.camera.position.set(
          Math.sin(orbitRef.current) * rad,
          5.4,
          Math.cos(orbitRef.current) * rad,
        );
        s.camera.lookAt(0, BODY_Y, 0.4);

        s.renderer.render(s.scene, s.camera);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      rigRef.current?.stop();
      rigRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;

      const s = sceneRef.current;
      if (s) {
        for (const g of s.geos) g.dispose();
        for (const m of s.mats) m.dispose();
        s.renderer.dispose();
        if (s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
        sceneRef.current = null;
      }

      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        window.setTimeout(() => {
          if (ctx.state !== "closed") void ctx.close();
        }, 900);
      }
    };
  }, [buildScene]);

  // ── begin: build audio inside the gesture, then try the camera ──────────────
  const begin = useCallback(async () => {
    if (audioOn || phase === "running") return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) {
        setPhase("failed");
        setNotice("Web Audio is unavailable — the hall still animates.");
        return;
      }
      const ctx = new Ctor();
      if (ctx.state === "suspended") await ctx.resume();
      const master = createSafeMaster(ctx, { gain: 0.5 });
      const audio = makeHallAudio(ctx, master.input);
      ctxRef.current = ctx;
      masterRef.current = master;
      audioRef.current = audio;
      setAudioOn(true);
      setPhase("running");
    } catch {
      setPhase("failed");
      setNotice("Audio failed to start — the hall still animates.");
    }
  }, [audioOn, phase]);

  // ── enable camera: swap the virtual walker for the live silhouette ──────────
  const enableCamera = useCallback(async () => {
    try {
      const { rig, fallbackReason } = await startSilhouette(WALKER_SEED);
      rigRef.current?.stop();
      rigRef.current = rig;
      setMode(rig.mode);
      setNotice(fallbackReason);
    } catch {
      setNotice("Camera not available — the virtual walker keeps orbiting.");
    }
  }, []);

  const secondaryBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0" aria-hidden />

      {glError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-8">
          <p className="max-w-sm text-center text-base leading-relaxed text-destructive">
            WebGL isn&apos;t available in this browser, so the 3-D hall can&apos;t
            render. The spatialisation still works on headphones — this view needs
            a WebGL-capable browser.
          </p>
        </div>
      )}

      {/* header / chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="pointer-events-auto max-w-md">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              11288 · orbit•hall
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              See your binaural spatialisation in 3-D.
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Move through a 3-D hall of voices, watched by a slowly orbiting
              camera. A live tether to each source draws its{" "}
              <span className="text-foreground">
                direct-to-reverberant ratio
              </span>
              : near &amp; dry sources get a thin, bright, taut cyan line; far
              &amp; wet ones get a dim, thick, hazy one. Use headphones — the
              spatial layout is drawn even where a speaker can&apos;t render
              binaural.
            </p>
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
            ) : (
              <span className="flex min-h-[44px] items-center rounded-md border border-border bg-background/60 px-4 text-sm text-primary">
                {mode === "camera" ? "● live silhouette" : "● virtual walker"}
              </span>
            )}
            <button
              type="button"
              onClick={enableCamera}
              className={secondaryBtn}
            >
              Enable camera
            </button>
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className={secondaryBtn}
            >
              Design notes
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {!audioOn && (
            <span className="text-muted-foreground/80">
              muted · virtual walker orbiting — press Begin
            </span>
          )}
          {notice && (
            <span className="normal-case tracking-normal text-destructive">
              {notice}
            </span>
          )}
        </div>
      </div>

      {/* design notes overlay */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/50 px-6 py-16 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                How orbit•hall works
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className={secondaryBtn}
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                <span className="text-foreground">The question.</span> What if you
                could SEE your own binaural spatialisation in 3-D — watch your
                listener-body move through a room of voices while a live tether to
                each source shows how dry-and-near vs wet-and-far it sounds?
              </p>
              <p>
                <span className="text-foreground">The science.</span> In a room,
                distance is judged mostly by the{" "}
                <span className="text-foreground">
                  Direct-to-Reverberant Ratio (DRR)
                </span>{" "}
                — direct sound level over reverberant level (survey
                arXiv:2503.12948). Near = high DRR (loud, bright, little reverb);
                far = low DRR (quiet, dark, lots of reverb). Each tether draws
                that ratio: thin/bright/taut cyan for high DRR, thick/dim/hazy for
                low DRR.
              </p>
              <p>
                <span className="text-foreground">The audio.</span> Each voice
                splits into a DRY path — a{" "}
                <span className="text-foreground">PannerNode (HRTF)</span>, genuine
                binaural — and a WET path into a shared{" "}
                <span className="text-foreground">feedback-delay-network</span>{" "}
                room: a ring of four damped delay lines that recirculate into a
                diffuse tail (deliberately not a convolver). Each frame dry gain
                falls with distance, wet-send rises, a per-source lowpass darkens
                far sources; setters glide over ~50 ms so nothing zippers.
              </p>
              <p>
                <span className="text-foreground">Body sensing.</span> Model-free —
                no MediaPipe, no TensorFlow, no network. The front camera is
                grabbed to a 160×120 canvas; a slow running background mean is kept
                per pixel, then <span className="text-foreground">|luma − mean|</span>{" "}
                is thresholded into a foreground mask whose centroid and area give
                your horizontal position and closeness. Centroid-X → avatar X
                (mirrored); area → depth Z.
              </p>
              <p>
                <span className="text-foreground">Fallback &amp; safety.</span> With
                no camera a deterministic seeded walker drifts along a slow
                Lissajous orbit, so the hall is never blank (muted until Begin). No
                strobing — every change is a slow (&lt;1 Hz) drift and the camera
                orbit is sub-1 Hz; reduced-motion is honoured. The camera is read
                only in your browser — nothing is recorded or sent anywhere.
              </p>
              <p className="text-muted-foreground/80">
                Reference: HRTF PannerNode binaural spatialisation (Web Audio) +
                Google Omnitone / Resonance-Audio ambisonic panning — the living
                web-spatial-audio technique — with a front camera standing in for a
                headset IMU as the pose source.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["11288-orbithall"]} />
    </main>
  );
}
