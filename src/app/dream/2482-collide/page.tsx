"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { VIOLET } from "../_shared/palette";
import {
  MATERIALS,
  MATERIAL_KEYS,
  BOWL,
  bowlFloorY,
  createBody,
  stepWorld,
  shakeBodies,
  resetSim,
  mulberry32,
  R_MIN,
  R_MAX,
  MAX_BODIES,
  ModalSynth,
  type Body,
  type Strike,
  type MaterialKey,
} from "./modal";

const SEED = 0x2482;
const DROP_Y = 3.4; // height objects fall from

// ── one collision playpen, driven entirely through refs so the hot loop never
// re-renders React ─────────────────────────────────────────────────────────
export default function CollidePage() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [started, setStarted] = useState(false);
  const [material, setMaterial] = useState<MaterialKey>("glass");
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  // mutable engine state
  const startedRef = useRef(false);
  const materialRef = useRef<MaterialKey>("glass");
  const synthRef = useRef<ModalSynth | null>(null);
  const bodiesRef = useRef<Body[]>([]);
  const userActiveRef = useRef(false);

  useEffect(() => {
    materialRef.current = material;
  }, [material]);

  const startAudio = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);
    userActiveRef.current = true;
    if (typeof window === "undefined") return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return; // visuals continue silently
      const ctx = new Ctor();
      void ctx.resume();
      synthRef.current = new ModalSynth(ctx, mulberry32(SEED ^ 0x9e3779b9));
    } catch {
      // No AudioContext — degrade to silent visuals.
      synthRef.current = null;
    }
  };

  // ── main effect: build renderer + physics loop, tear it all down on unmount ─
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || typeof window === "undefined") return;

    const rng = mulberry32(SEED);
    resetSim();
    const bodies = bodiesRef.current;
    bodies.length = 0;

    const consumeStrikes = (strikes: Strike[]) => {
      const synth = synthRef.current;
      if (synth && startedRef.current) {
        for (const s of strikes) {
          const vel = Math.min(1, Math.max(0, (s.speed - 0.42) / 5.5));
          synth.strike(s.fund, s.mat, vel);
        }
      }
      strikes.length = 0;
    };

    // deterministic auto-demo: drop objects on a fixed schedule so a silent
    // screenshot already shows the sculpture composing + looping.
    let demoTimer = 0;
    let demoDropped = 0;
    const DEMO_INTERVAL = 1.9;
    const DEMO_MAX = 11;
    const DEMO_HOLD = 5.5; // linger, then clear + replay
    let demoHold = 0;

    const spawnObject = (
      mat: MaterialKey,
      x: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
    ) => {
      if (bodies.length >= MAX_BODIES) bodies.shift();
      const r = R_MIN + rng() * (R_MAX - R_MIN);
      bodies.push(createBody(mat, x, DROP_Y, z, vx, vy, vz, r, rng));
      setCount(bodies.length);
    };

    const stepDemo = (dt: number) => {
      if (userActiveRef.current) return; // user has taken over
      demoTimer += dt;
      if (demoDropped < DEMO_MAX && demoTimer >= DEMO_INTERVAL) {
        demoTimer = 0;
        const mat = MATERIAL_KEYS[Math.floor(rng() * MATERIAL_KEYS.length)];
        const ang = rng() * Math.PI * 2;
        const rad = rng() * BOWL.rim * 0.5;
        spawnObject(
          mat,
          Math.cos(ang) * rad,
          Math.sin(ang) * rad,
          (rng() - 0.5) * 1.5,
          0,
          (rng() - 0.5) * 1.5,
        );
        demoDropped++;
      } else if (demoDropped >= DEMO_MAX) {
        demoHold += dt;
        if (demoHold >= DEMO_HOLD) {
          bodies.length = 0;
          setCount(0);
          demoDropped = 0;
          demoHold = 0;
          demoTimer = 0;
        }
      }
    };

    const strikes: Strike[] = [];
    let last = performance.now();

    // ── try WebGL; fall back to Canvas2D ─────────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      renderer = null;
    }

    if (renderer) {
      const teardown = startWebGL(
        renderer,
        mount,
        bodies,
        () => {
          const now = performance.now();
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          stepDemo(dt);
          stepWorld(bodies, dt, strikes);
          consumeStrikes(strikes);
          return dt;
        },
      );
      const drop = makeDropHandler(renderer.domElement, spawnObject, () => {
        userActiveRef.current = true;
      }, () => materialRef.current, rng);
      renderer.domElement.addEventListener("pointerdown", drop.down);
      renderer.domElement.addEventListener("pointermove", drop.move);
      window.addEventListener("pointerup", drop.up);

      return () => {
        renderer?.domElement.removeEventListener("pointerdown", drop.down);
        renderer?.domElement.removeEventListener("pointermove", drop.move);
        window.removeEventListener("pointerup", drop.up);
        teardown();
        synthRef.current?.dispose();
        synthRef.current = null;
      };
    }

    // Canvas2D fallback
    setErr(
      "WebGL is unavailable here — showing a top-down 2D view. The bowl still collides and rings.",
    );
    const teardown2d = startCanvas2D(mount, bodies, () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      stepDemo(dt);
      stepWorld(bodies, dt, strikes);
      consumeStrikes(strikes);
      return dt;
    }, spawnObject, () => {
      userActiveRef.current = true;
    }, () => materialRef.current, rng);

    return () => {
      teardown2d();
      synthRef.current?.dispose();
      synthRef.current = null;
    };
    // Effect owns the whole lifecycle; live values are carried in via refs.
  }, []);

  const shake = () => {
    userActiveRef.current = true;
    shakeBodies(bodiesRef.current, mulberry32(SEED ^ (bodiesRef.current.length + 7)));
  };

  const dropCenter = () => {
    userActiveRef.current = true;
    const bodies = bodiesRef.current;
    if (bodies.length >= MAX_BODIES) bodies.shift();
    const rng = mulberry32(SEED ^ (bodies.length * 131 + 3));
    const r = R_MIN + rng() * (R_MAX - R_MIN);
    bodies.push(
      createBody(
        materialRef.current,
        (rng() - 0.5) * 1.2,
        DROP_Y,
        (rng() - 0.5) * 1.2,
        (rng() - 0.5) * 1.2,
        0,
        (rng() - 0.5) * 1.2,
        r,
        rng,
      ),
    );
    setCount(bodies.length);
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0" aria-hidden />

      {/* top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-5">
        <div className="max-w-lg">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            dream lab · 2482
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Collide — a bowl that composes itself
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Drop glass, wood, metal and stone into the bowl. Every impact strikes
            a physical modal ring at the collision speed — a self-playing
            percussion sculpture.
          </p>
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto min-h-[44px] shrink-0 rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ← lab
        </Link>
      </div>

      {/* bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-5">
        {err && <p className="text-base text-destructive">{err}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {!started ? (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start / enable sound
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              live · {count} objects
            </span>
          )}

          {/* material picker */}
          <div className="flex overflow-hidden rounded-md border border-border">
            {MATERIAL_KEYS.map((k) => (
              <button
                key={k}
                onClick={() => setMaterial(k)}
                className={`min-h-[44px] px-4 text-sm transition-colors ${
                  material === k
                    ? "bg-primary text-primary-foreground"
                    : "bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {MATERIALS[k].label}
              </button>
            ))}
          </div>

          <button
            onClick={dropCenter}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            drop
          </button>
          <button
            onClick={shake}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            shake
          </button>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "hide notes" : "read the design notes"}
          </button>
        </div>

        <p className="max-w-2xl font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          click-drag-release on the bowl to throw · flick harder for a harder
          strike
        </p>

        {showNotes && (
          <div className="max-w-2xl rounded-md border border-border bg-background/80 p-4 text-base text-muted-foreground backdrop-blur">
            <p>
              Each object is a bank of exponentially-decaying sinusoidal modes.
              Glass rings long and inharmonic; a marimba-bar wood is warm with a
              stretched 3.9× overtone and a fast decay; metal shimmers with dense
              partials; stone is a dull thunk. Object size picks a
              just-intonation fundamental (base 174.6 Hz), so random collisions
              stay consonant. Impact velocity scales both loudness and brightness
              — a harder hit is brighter. Physics is a small owned impulse solver:
              gravity, sphere–sphere and paraboloid-bowl collisions resolved along
              the contact normal with restitution. See{" "}
              <span className="text-foreground">README.md</span> for the full
              model and references.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ── WebGL scene ─────────────────────────────────────────────────────────────
type Frame = () => number;

interface BodyView {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  id: number;
}

function startWebGL(
  renderer: THREE.WebGLRenderer,
  mount: HTMLDivElement,
  bodies: Body[],
  frame: Frame,
): () => void {
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(new THREE.Color(VIOLET[950]), 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.style.cursor = "grab";
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VIOLET[950]);
  scene.fog = new THREE.Fog(new THREE.Color(VIOLET[950]), 9, 18);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);

  // lighting: soft hemisphere fill + a shadow-casting key + a violet accent
  const hemi = new THREE.HemisphereLight(0xc4b5fd, 0x0b0713, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(4, 8, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  scene.add(key);
  const accent = new THREE.PointLight(0x8b5cf6, 22, 20, 2);
  accent.position.set(-3, 4, -2);
  scene.add(accent);

  // the bowl itself: a lathed paraboloid profile
  const profile: THREE.Vector2[] = [];
  const segs = 40;
  for (let i = 0; i <= segs; i++) {
    const s = (i / segs) * BOWL.rim;
    profile.push(new THREE.Vector2(s, bowlFloorY(s, 0)));
  }
  const bowlGeom = new THREE.LatheGeometry(profile, 96);
  const bowlMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(VIOLET[800]),
    roughness: 0.85,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });
  const bowlMesh = new THREE.Mesh(bowlGeom, bowlMat);
  bowlMesh.receiveShadow = true;
  scene.add(bowlMesh);

  // ground plane to catch the soft shadow
  const groundGeom = new THREE.CircleGeometry(BOWL.rim * 2.4, 64);
  const groundMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(VIOLET[900]),
    roughness: 1,
    metalness: 0,
  });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // pooled body meshes keyed by body id
  const views: BodyView[] = [];
  const geomCache = new Map<string, THREE.BufferGeometry>();

  const geomFor = (mat: MaterialKey, r: number): THREE.BufferGeometry => {
    const kind = MATERIALS[mat].geom;
    const key2 = `${kind}:${r.toFixed(3)}`;
    const hit = geomCache.get(key2);
    if (hit) return hit;
    let g: THREE.BufferGeometry;
    if (kind === "ico") g = new THREE.IcosahedronGeometry(r, 0);
    else if (kind === "bar") g = new THREE.BoxGeometry(r * 2.1, r * 1.05, r * 1.05);
    else if (kind === "sphere") g = new THREE.SphereGeometry(r, 24, 18);
    else g = new THREE.DodecahedronGeometry(r, 0);
    geomCache.set(key2, g);
    return g;
  };

  const syncViews = () => {
    // add meshes for new bodies
    for (const b of bodies) {
      if (!views.find((v) => v.id === b.id)) {
        const preset = MATERIALS[b.mat];
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(preset.color),
          metalness: preset.metalness,
          roughness: preset.roughness,
          emissive: new THREE.Color(preset.color),
          emissiveIntensity: 0,
        });
        const mesh = new THREE.Mesh(geomFor(b.mat, b.r), mat);
        mesh.castShadow = true;
        mesh.rotation.set(b.spin, b.spin * 0.7, 0);
        scene.add(mesh);
        views.push({ mesh, id: b.id });
      }
    }
    // remove meshes whose body is gone
    for (let i = views.length - 1; i >= 0; i--) {
      const v = views[i];
      if (!bodies.find((b) => b.id === v.id)) {
        scene.remove(v.mesh);
        v.mesh.material.dispose();
        views.splice(i, 1);
      }
    }
  };

  let ro: ResizeObserver | null = null;
  const resize = () => {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(resize);
    ro.observe(mount);
  }

  let raf = 0;
  let orbit = 0.6;
  const tmp = new THREE.Vector3();

  const loop = () => {
    const dt = frame();
    syncViews();
    // gently orbiting camera
    orbit += dt * 0.13;
    camera.position.set(
      Math.cos(orbit) * 8.2,
      5.2 + Math.sin(orbit * 0.6) * 0.6,
      Math.sin(orbit) * 8.2,
    );
    camera.lookAt(0, 0.6, 0);

    for (const v of views) {
      const b = bodies.find((bb) => bb.id === v.id);
      if (!b) continue;
      v.mesh.position.set(b.x, b.y, b.z);
      const s = 1 + b.glow * 0.14;
      v.mesh.scale.setScalar(s);
      v.mesh.material.emissiveIntensity = b.glow * 1.4;
      // roll a touch with horizontal velocity for life
      tmp.set(b.vz, 0, -b.vx);
      v.mesh.rotateOnAxis(
        tmp.lengthSq() > 1e-4 ? tmp.normalize() : new THREE.Vector3(0, 1, 0),
        Math.min(0.3, tmp.length() * dt),
      );
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
    for (const v of views) {
      scene.remove(v.mesh);
      v.mesh.material.dispose();
    }
    views.length = 0;
    for (const g of geomCache.values()) g.dispose();
    geomCache.clear();
    bowlGeom.dispose();
    bowlMat.dispose();
    groundGeom.dispose();
    groundMat.dispose();
    renderer.dispose();
    if (renderer.domElement.parentNode === mount) {
      mount.removeChild(renderer.domElement);
    }
  };
}

// ── pointer → throw, shared by mapping the ray to the drop plane ─────────────
function makeDropHandler(
  el: HTMLElement,
  spawnObject: (
    mat: MaterialKey,
    x: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
  ) => void,
  markActive: () => void,
  getMat: () => MaterialKey,
  rng: () => number,
) {
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DROP_Y);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let downX = 0;
  let downZ = 0;
  let lastX = 0;
  let lastZ = 0;
  let lastT = 0;
  let velX = 0;
  let velZ = 0;
  let dragging = false;

  // reproject a pointer event to bowl-plane world coords
  const project = (e: PointerEvent): boolean => {
    const rect = el.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    // reconstruct the same camera the loop uses would be ideal; instead use a
    // fixed overhead-ish ray good enough for aiming the drop.
    ray.ray.origin.set(ndc.x * 6, 12, -ndc.y * 6);
    ray.ray.direction.set(0, -1, 0);
    return ray.ray.intersectPlane(plane, hit) !== null;
  };

  const down = (e: PointerEvent) => {
    markActive();
    if (!project(e)) return;
    dragging = true;
    downX = lastX = hit.x;
    downZ = lastZ = hit.z;
    lastT = performance.now();
    velX = 0;
    velZ = 0;
    el.style.cursor = "grabbing";
  };
  const move = (e: PointerEvent) => {
    if (!dragging || !project(e)) return;
    const now = performance.now();
    const dt = Math.max(0.008, (now - lastT) / 1000);
    velX = (hit.x - lastX) / dt;
    velZ = (hit.z - lastZ) / dt;
    lastX = hit.x;
    lastZ = hit.z;
    lastT = now;
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = "grab";
    const throwScale = 0.55;
    const jitter = (rng() - 0.5) * 0.4;
    spawnObject(
      getMat(),
      downX + jitter,
      downZ + jitter,
      THREE.MathUtils.clamp(velX * throwScale, -6, 6),
      0,
      THREE.MathUtils.clamp(velZ * throwScale, -6, 6),
    );
  };
  return { down, move, up };
}

// ── Canvas2D fallback: top-down physics view, still colliding + ringing ─────
function startCanvas2D(
  mount: HTMLDivElement,
  bodies: Body[],
  frame: Frame,
  spawnObject: (
    mat: MaterialKey,
    x: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
  ) => void,
  markActive: () => void,
  getMat: () => MaterialKey,
  rng: () => number,
): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.cursor = "crosshair";
  mount.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const toHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

  let raf = 0;
  let ro: ResizeObserver | null = null;
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, mount.clientWidth * dpr);
    canvas.height = Math.max(1, mount.clientHeight * dpr);
  };
  resize();
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(resize);
    ro.observe(mount);
  }

  const drawFrame = () => {
    frame();
    if (ctx) {
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) / (BOWL.rim * 2.4);
      ctx.fillStyle = VIOLET[950];
      ctx.fillRect(0, 0, w, h);
      // bowl rim
      ctx.strokeStyle = VIOLET[700];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, BOWL.rim * scale, 0, Math.PI * 2);
      ctx.stroke();
      for (const b of bodies) {
        const px = cx + b.x * scale;
        const py = cy + b.z * scale;
        const pr = b.r * scale;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = toHex(MATERIALS[b.mat].color);
        ctx.globalAlpha = 0.85;
        ctx.fill();
        if (b.glow > 0.01) {
          ctx.globalAlpha = Math.min(1, b.glow);
          ctx.strokeStyle = VIOLET[200];
          ctx.lineWidth = 2 + b.glow * 6;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }
    raf = requestAnimationFrame(drawFrame);
  };
  raf = requestAnimationFrame(drawFrame);

  const onDown = (e: PointerEvent) => {
    markActive();
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width, rect.height) / (BOWL.rim * 2.4);
    const x = (e.clientX - rect.left - rect.width / 2) / scale;
    const z = (e.clientY - rect.top - rect.height / 2) / scale;
    spawnObject(
      getMat(),
      THREE.MathUtils.clamp(x, -BOWL.rim, BOWL.rim),
      THREE.MathUtils.clamp(z, -BOWL.rim, BOWL.rim),
      (rng() - 0.5) * 2,
      0,
      (rng() - 0.5) * 2,
    );
  };
  canvas.addEventListener("pointerdown", onDown);

  return () => {
    cancelAnimationFrame(raf);
    ro?.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    if (canvas.parentNode === mount) mount.removeChild(canvas);
  };
}
