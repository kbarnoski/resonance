"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  makeWorld,
  makeCreature,
  stepWorld,
  applyPoke,
  enforceCap,
  type World,
  type Creature,
} from "./pbd";
import { JellyAudio } from "./audio";

const CAP = 36; // max creatures on screen for perf

// HSL -> THREE.Color helper (bold, saturated kid colors).
function makeColor(hue: number, light = 0.58): THREE.Color {
  const c = new THREE.Color();
  c.setHSL(hue, 0.95, light);
  return c;
}

// Build a flat triangle-fan geometry (center + ring) for one creature.
// We update positions in place each frame, so we only allocate once.
function makeBlobGeometry(ringN: number): THREE.BufferGeometry {
  const verts = ringN + 1; // center + ring
  const pos = new Float32Array(verts * 3);
  const idx: number[] = [];
  for (let i = 0; i < ringN; i++) {
    idx.push(0, 1 + i, 1 + ((i + 1) % ringN));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

type Blob = {
  group: THREE.Group;
  fill: THREE.Mesh;
  glow: THREE.Mesh;
  geom: THREE.BufferGeometry;
  glowGeom: THREE.BufferGeometry;
  fillMat: THREE.MeshBasicMaterial;
  glowMat: THREE.MeshBasicMaterial;
  ringN: number;
};

// Push current particle positions into a blob's geometry buffers.
function applyBlobGeometry(blob: Blob, c: Creature): void {
  const pos = blob.geom.getAttribute("position") as THREE.BufferAttribute;
  const arr = pos.array as Float32Array;
  // center
  arr[0] = c.parts[0].x;
  arr[1] = c.parts[0].y;
  arr[2] = 0;
  for (let i = 0; i < c.ring.length; i++) {
    const p = c.parts[c.ring[i]];
    const o = (i + 1) * 3;
    arr[o] = p.x;
    arr[o + 1] = p.y;
    arr[o + 2] = 0;
  }
  pos.needsUpdate = true;

  // glow ring = same shape pushed slightly outward from center
  const gpos = blob.glowGeom.getAttribute("position") as THREE.BufferAttribute;
  const garr = gpos.array as Float32Array;
  const cx = c.parts[0].x;
  const cy = c.parts[0].y;
  garr[0] = cx;
  garr[1] = cy;
  garr[2] = 0;
  const swell = 1.28 + c.squish * 0.4;
  for (let i = 0; i < c.ring.length; i++) {
    const p = c.parts[c.ring[i]];
    const o = (i + 1) * 3;
    garr[o] = cx + (p.x - cx) * swell;
    garr[o + 1] = cy + (p.y - cy) * swell;
    garr[o + 2] = 0;
  }
  gpos.needsUpdate = true;
}

export default function JellyStormPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [energyUi, setEnergyUi] = useState(0);

  // refs the start gesture / render loop share
  const audioRef = useRef<JellyAudio | null>(null);
  const startedRef = useRef(false);
  const lastInteractRef = useRef(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── three.js setup (graceful WebGL fallback) ─────────────────────────
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglOk(false);
      return;
    }
    let W = mount.clientWidth || window.innerWidth;
    let H = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H);
    renderer.setClearColor(0x0a0418, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // pixel-space orthographic camera: (0,0) top-left, (W,H) bottom-right
    const camera = new THREE.OrthographicCamera(0, W, 0, H, -10, 10);
    camera.position.z = 5;

    // dark playful gradient backdrop (full-screen quad)
    const bgGeom = new THREE.PlaneGeometry(2, 2);
    const bgMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { uEnergy: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        uniform float uEnergy;
        uniform float uTime;
        void main(){
          vec2 p = vUv - 0.5;
          float r = length(p);
          vec3 top = mix(vec3(0.04,0.02,0.10), vec3(0.10,0.03,0.22), uEnergy);
          vec3 bot = mix(vec3(0.02,0.01,0.06), vec3(0.18,0.05,0.10), uEnergy);
          vec3 col = mix(top, bot, vUv.y);
          // soft excited glow from center that pulses with energy
          float pulse = 0.5 + 0.5 * sin(uTime * 2.2);
          col += (0.10 + uEnergy * 0.28) * (0.6 + 0.4*pulse) * smoothstep(0.75, 0.0, r) * vec3(0.5,0.2,0.7);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const bgMesh = new THREE.Mesh(bgGeom, bgMat);
    bgMesh.frustumCulled = false;
    bgMesh.renderOrder = -1;
    const bgScene = new THREE.Scene();
    bgScene.add(bgMesh);
    const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ── physics world ────────────────────────────────────────────────────
    const world: World = makeWorld(W, H);
    const blobs = new Map<number, Blob>();

    function makeBlobFor(c: Creature): Blob {
      const ringN = c.ring.length;
      const geom = makeBlobGeometry(ringN);
      const glowGeom = makeBlobGeometry(ringN);
      const col = makeColor(c.hue);
      const fillMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.96,
      });
      const glowMat = new THREE.MeshBasicMaterial({
        color: makeColor(c.hue, 0.7),
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(glowGeom, glowMat);
      glow.renderOrder = 0;
      const fill = new THREE.Mesh(geom, fillMat);
      fill.renderOrder = 1;
      const group = new THREE.Group();
      group.add(glow);
      group.add(fill);
      scene.add(group);
      return {
        group,
        fill,
        glow,
        geom,
        glowGeom,
        fillMat,
        glowMat,
        ringN,
      };
    }

    function dropBlobFor(c: Creature) {
      const b = makeBlobFor(c);
      blobs.set(c.id, b);
    }

    function disposeBlob(b: Blob) {
      scene.remove(b.group);
      b.geom.dispose();
      b.glowGeom.dispose();
      b.fillMat.dispose();
      b.glowMat.dispose();
    }

    // ── interaction: tap to spawn + poke, drag to fling ──────────────────
    let dragLast: { x: number; y: number; t: number } | null = null;

    function toLocal(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function spawnAt(x: number, y: number, vx = 0, vy = 0) {
      const now = performance.now() / 1000;
      const r = 26 + Math.random() * 20;
      makeCreature(world, x, y, r, vx, vy, now);
      enforceCap(world, CAP);
      // poke nearby so existing jelly reacts (squish + scatter)
      applyPoke(world, x, y, 320, vx * 0.2, vy * 0.2);
      audioRef.current?.noteOn(world.kinetic, 0.6, Math.random());
      lastInteractRef.current = now;
    }

    function onPointerDown(e: PointerEvent) {
      const { x, y } = toLocal(e.clientX, e.clientY);
      spawnAt(x, y - 40, (Math.random() - 0.5) * 120, 60);
      dragLast = { x, y, t: performance.now() };
    }
    function onPointerMove(e: PointerEvent) {
      if (!dragLast) return;
      const { x, y } = toLocal(e.clientX, e.clientY);
      const now = performance.now();
      const dt = Math.max(8, now - dragLast.t);
      const vx = ((x - dragLast.x) / dt) * 1000;
      const vy = ((y - dragLast.y) / dt) * 1000;
      applyPoke(world, x, y, 260, vx * 0.25, vy * 0.25);
      dragLast = { x, y, t: now };
      lastInteractRef.current = now / 1000;
    }
    function onPointerUp() {
      dragLast = null;
    }

    const el = renderer.domElement;
    el.style.touchAction = "none";
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);

    // ── shake (DeviceMotion) → rain a burst of jelly ─────────────────────
    function onMotion(e: DeviceMotionEvent) {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0);
      if (mag > 22) {
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          spawnAt(
            40 + Math.random() * (world.width - 80),
            -20 - Math.random() * 40,
            (Math.random() - 0.5) * 200,
            120
          );
        }
      }
    }
    window.addEventListener("devicemotion", onMotion);

    // ── resize ───────────────────────────────────────────────────────────
    function onResize() {
      W = mount!.clientWidth || window.innerWidth;
      H = mount!.clientHeight || window.innerHeight;
      renderer.setSize(W, H);
      camera.right = W;
      camera.bottom = H;
      camera.updateProjectionMatrix();
      world.width = W;
      world.height = H;
    }
    window.addEventListener("resize", onResize);

    // ── render loop ──────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let autoTimer = 0;
    const startWall = performance.now() / 1000;
    lastInteractRef.current = startWall;

    function frame() {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const nowSec = now / 1000;

      // AUTO-DEMO: if no interaction for ~3.2s, rain jelly on its own so the
      // piece is alive in sight + sound hands-free (build-and-resolve loop).
      const idle = nowSec - lastInteractRef.current;
      if (idle > 3.2) {
        autoTimer -= dt;
        if (autoTimer <= 0) {
          // rain faster while the screen is sparse, pause to let it resolve
          const sparse = world.creatures.length < 14;
          if (sparse) {
            spawnAuto();
            autoTimer = 0.22 + Math.random() * 0.25;
          } else {
            // let it calm so the music can RESOLVE, then start again
            autoTimer = 2.4;
            // clear so the next cycle starts fresh and re-escalates
            world.creatures.length = 0;
          }
          // spawnAuto sets lastInteract; reset so auto-demo keeps running
          lastInteractRef.current = nowSec - 3.3;
        }
      }

      stepWorld(world, dt, nowSec);

      // sync blobs to creatures (add new, drop removed)
      const live = new Set<number>();
      for (const c of world.creatures) {
        live.add(c.id);
        let b = blobs.get(c.id);
        if (!b) {
          dropBlobFor(c);
          b = blobs.get(c.id)!;
        }
        applyBlobGeometry(b, c);
        // glow brightens with squish + energy (squish = visible bounce)
        b.glowMat.opacity = 0.22 + c.squish * 0.5 + world.kinetic * 0.18;
        b.fillMat.color.setHSL(
          c.hue,
          0.95,
          0.52 + c.squish * 0.18 + world.kinetic * 0.06
        );
        // spawn pop scale, applied around the creature's own center so it
        // bulges in place rather than sliding across the screen
        const age = nowSec - c.spawnT;
        const pop = age < 0.3 ? 0.5 + (age / 0.3) * 0.5 : 1;
        const cx = c.parts[0].x;
        const cy = c.parts[0].y;
        b.group.scale.set(pop, pop, 1);
        b.group.position.set(cx * (1 - pop), cy * (1 - pop), 0);
      }
      for (const [id, b] of blobs) {
        if (!live.has(id)) {
          disposeBlob(b);
          blobs.delete(id);
        }
      }

      // feed audio (energy → intensity → resolve)
      const impacts = world.lastImpacts.splice(0, world.lastImpacts.length);
      audioRef.current?.update(dt, world.kinetic, world.spawnPulse, impacts);

      // background reacts to energy
      bgMat.uniforms.uEnergy.value = world.kinetic;
      bgMat.uniforms.uTime.value = nowSec;

      // cheap UI energy readout (throttled)
      if (Math.floor(nowSec * 6) % 2 === 0) {
        setEnergyUi(world.kinetic);
      }

      renderer.autoClear = true;
      renderer.render(bgScene, bgCam);
      renderer.autoClear = false;
      renderer.render(scene, camera);
    }

    function spawnAuto() {
      const x = 40 + Math.random() * (world.width - 80);
      const r = 26 + Math.random() * 20;
      const now = performance.now() / 1000;
      makeCreature(world, x, -20, r, (Math.random() - 0.5) * 160, 120, now);
      enforceCap(world, CAP);
      audioRef.current?.noteOn(world.kinetic, 0.55, Math.random());
    }

    // seed a couple so it's alive the instant the canvas appears
    spawnAuto();
    spawnAuto();
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("devicemotion", onMotion);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      for (const [, b] of blobs) disposeBlob(b);
      blobs.clear();
      bgGeom.dispose();
      bgMat.dispose();
      renderer.dispose();
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);

  // Start gesture: create/resume audio + request DeviceMotion (iOS).
  async function handleStart() {
    if (startedRef.current) return;
    startedRef.current = true;
    const audio = new JellyAudio();
    audioRef.current = audio;
    try {
      await audio.start();
    } catch {
      // audio failed — visuals still run
    }
    // iOS 13+ requires a permission request inside a user gesture
    type MotionCtor = {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const DM = window.DeviceMotionEvent as unknown as MotionCtor | undefined;
    if (DM && typeof DM.requestPermission === "function") {
      try {
        await DM.requestPermission();
      } catch {
        // denied — tapping still rains jelly
      }
    }
    lastInteractRef.current = performance.now() / 1000;
    setStarted(true);
  }

  return (
    <div className="fixed inset-0 top-12 overflow-hidden bg-[#0a0418] select-none">
      <div ref={mountRef} className="absolute inset-0" />

      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-xl text-white/95">
            This jelly storm needs WebGL, which your browser or device
            doesn&apos;t support right now. Try a recent Chrome, Safari, or
            Firefox to play!
          </p>
        </div>
      )}

      {/* energy meter — a fun "MORE!" bar, no reading required */}
      {started && webglOk && (
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2">
          <div className="h-3 w-40 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-yellow-300 to-lime-300 transition-[width] duration-150"
              style={{ width: `${Math.round(energyUi * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Start overlay (creates AudioContext inside the gesture) */}
      {!started && webglOk && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/55 backdrop-blur-sm p-6">
          <h1 className="text-center text-2xl font-black tracking-tight text-white sm:text-4xl">
            JELLY STORM
          </h1>
          <p className="max-w-sm text-center text-base text-white/75">
            Tap, drag, and shake to make squishy jelly RAIN. The more chaos,
            the bigger the music gets!
          </p>
          <button
            onClick={handleStart}
            className="min-h-[64px] min-w-[64px] rounded-3xl bg-gradient-to-br from-fuchsia-500 to-yellow-400 px-10 py-5 text-2xl font-black text-white shadow-2xl shadow-fuchsia-500/40 active:scale-95 transition-transform"
          >
            TAP TO PLAY!
          </button>
        </div>
      )}

      {/* Design notes affordance (outside the play area) */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-16 right-4 z-30 rounded-full border border-white/20 bg-black/60 px-3 py-2 text-base text-white/75 backdrop-blur hover:text-white"
      >
        Design notes
      </button>
      {showNotes && (
        <div className="absolute bottom-28 right-4 z-30 max-w-xs rounded-2xl border border-white/15 bg-black/85 p-4 text-base text-white/85 backdrop-blur">
          <p className="mb-2 text-white/95">
            Each creature is a Position-Based-Dynamics soft body: a ring of
            particles held by distance + area constraints, so it really
            squishes and bounces.
          </p>
          <p className="mb-2">
            More chaos = louder, faster, climbing major-key mallets. When it
            calms, the music resolves to a big happy chord.
          </p>
          <Link
            href="/dream/451-kids-jelly-storm/README.md"
            className="text-fuchsia-300 underline"
          >
            Read the README
          </Link>
        </div>
      )}
    </div>
  );
}
