"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { VortexSim, N_PTS, MAX_FILAMENTS, R_BOX } from "./filaments";
import { createAudio, type AudioEngine } from "./audio";

const BETA = 0.42; // LIA induction coefficient
const STEP_DT = 0.34; // per-frame scaled time
const GLINT_POOL = 20;

// soft radial-gradient sprite for additive glow (generated, no external asset)
function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.3, "rgba(180,235,255,0.7)");
  grd.addColorStop(1, "rgba(120,200,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

interface FilamentGfx {
  geom: THREE.BufferGeometry;
  posAttr: THREE.BufferAttribute;
  lineMat: THREE.LineBasicMaterial;
  line: THREE.LineLoop;
  glowMat: THREE.PointsMaterial;
  glow: THREE.Points;
}

export default function VortexFilamentsPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // keep latest UI flags available to the animation loop without re-subscribing
  const startedRef = useRef(false);
  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        audioRef.current = createAudio();
      } catch {
        // audio unavailable — visuals still run
      }
    }
    try {
      await audioRef.current?.resume();
    } catch {
      // ignore resume failures
    }
    setStarted(true);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // graceful WebGL check
    if (typeof window === "undefined" || !window.WebGLRenderingContext) {
      setErr("This piece needs WebGL, which this browser does not provide.");
      return;
    }

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setErr("Could not start the WebGL renderer on this device.");
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03040a);
    scene.fog = new THREE.FogExp2(0x03040a, 0.085);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const setSize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);
    setSize();

    // faint containment sphere so the "box" reads
    const cage = new THREE.Mesh(
      new THREE.SphereGeometry(R_BOX + 0.05, 32, 24),
      new THREE.MeshBasicMaterial({
        color: 0x0a2a44,
        wireframe: true,
        transparent: true,
        opacity: 0.08,
      }),
    );
    scene.add(cage);

    const glowTex = makeGlowTexture();
    const sim = new VortexSim();

    // per-filament visuals
    const gfx: FilamentGfx[] = [];
    for (let s = 0; s < MAX_FILAMENTS; s++) {
      const geom = new THREE.BufferGeometry();
      const arr = new Float32Array(N_PTS * 3);
      const posAttr = new THREE.BufferAttribute(arr, 3);
      geom.setAttribute("position", posAttr);
      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(0x7af0ff),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.LineLoop(geom, lineMat);
      const glowMat = new THREE.PointsMaterial({
        color: new THREE.Color(0x8fd4ff),
        map: glowTex,
        size: 0.34,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Points(geom, glowMat);
      line.visible = false;
      glow.visible = false;
      scene.add(glow);
      scene.add(line);
      gfx.push({ geom, posAttr, lineMat, line, glowMat, glow });
    }

    // reconnection glint pool (small localized additive flashes)
    const glints: { sprite: THREE.Sprite; life: number; max: number }[] = [];
    for (let i = 0; i < GLINT_POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.scale.setScalar(0.001);
      sp.visible = false;
      scene.add(sp);
      glints.push({ sprite: sp, life: 0, max: 1 });
    }
    let glintCursor = 0;
    const fireGlint = (pos: THREE.Vector3, energy: number) => {
      const g = glints[glintCursor];
      glintCursor = (glintCursor + 1) % GLINT_POOL;
      g.sprite.position.copy(pos);
      g.max = 0.35 + energy * 0.4; // scale ≤ ~0.75 — small, localized
      g.life = 1;
      g.sprite.visible = true;
    };

    // ── pointer stir ─────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const dragPlane = new THREE.Plane();
    const lastWorld = new THREE.Vector3();
    const curWorld = new THREE.Vector3();
    let dragging = false;
    let haveLast = false;
    let strokeDist = 0;

    const screenToWorld = (clientX: number, clientY: number, out: THREE.Vector3): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      // plane through origin facing the camera
      const n = camera.getWorldDirection(new THREE.Vector3()).negate();
      dragPlane.setFromNormalAndCoplanarPoint(n, new THREE.Vector3(0, 0, 0));
      const hit = raycaster.ray.intersectPlane(dragPlane, out);
      return hit !== null;
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      haveLast = false;
      strokeDist = 0;
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      if (!screenToWorld(e.clientX, e.clientY, curWorld)) return;
      // clamp the stir point into the box
      if (curWorld.length() > R_BOX) curWorld.setLength(R_BOX);
      if (haveLast) {
        const dir = new THREE.Vector3().subVectors(curWorld, lastWorld);
        const speed = dir.length();
        strokeDist += speed;
        if (speed > 1e-4) {
          sim.stirKick(curWorld, dir, Math.min(1.6, speed * 6));
          // every so often, a fast stroke births a fresh vortex ring
          if (strokeDist > 1.1) {
            strokeDist = 0;
            const axis = dir.clone().normalize();
            sim.spawnRing(curWorld.clone(), axis, 0.55 + Math.random() * 0.3, Math.min(1, speed * 5));
          }
        }
      }
      lastWorld.copy(curWorld);
      haveLast = true;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      haveLast = false;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be gone
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    // ── animation loop ───────────────────────────────────────────────────
    const camSpeed = reduceMotion ? 0.04 : 0.12;
    const stepDt = reduceMotion ? STEP_DT * 0.55 : STEP_DT;
    let camAngle = 0;
    let raf = 0;
    let last = performance.now();
    const tmpColor = new THREE.Color();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // physics
      const events = sim.step(stepDt, BETA);
      if (startedRef.current && audioRef.current) {
        for (const ev of events) audioRef.current.reconnection(ev.energy);
      }
      for (const ev of events) fireGlint(ev.pos, ev.energy);

      // push geometry
      for (let s = 0; s < MAX_FILAMENTS; s++) {
        const f = sim.filaments[s];
        const g = gfx[s];
        if (!f.active) {
          g.line.visible = false;
          g.glow.visible = false;
          continue;
        }
        g.line.visible = true;
        g.glow.visible = true;
        const arr = g.posAttr.array as Float32Array;
        for (let i = 0; i < N_PTS; i++) {
          const p = f.points[i];
          arr[i * 3] = p.x;
          arr[i * 3 + 1] = p.y;
          arr[i * 3 + 2] = p.z;
        }
        g.posAttr.needsUpdate = true;
        g.geom.computeBoundingSphere();
        // colour: cyan base warming to white with flash (reconnection glint)
        const flash = f.flash;
        tmpColor.setHSL(0.52 - f.hue * 0.04, 0.9 - flash * 0.7, 0.6 + flash * 0.35);
        g.lineMat.color.copy(tmpColor);
        g.lineMat.opacity = 0.78 + flash * 0.22;
        g.glowMat.opacity = 0.42 + flash * 0.3;
      }

      // glints fade + shrink (localized, gentle — no full-frame flashing)
      for (const gl of glints) {
        if (!gl.sprite.visible) continue;
        gl.life -= dt * 3.2;
        if (gl.life <= 0) {
          gl.sprite.visible = false;
          (gl.sprite.material as THREE.SpriteMaterial).opacity = 0;
          continue;
        }
        const sc = gl.max * (1.15 - gl.life * 0.4);
        gl.sprite.scale.setScalar(sc);
        (gl.sprite.material as THREE.SpriteMaterial).opacity = gl.life * 0.85;
      }

      // slow auto-orbit camera
      camAngle += camSpeed * dt;
      const rCam = 5.2;
      camera.position.set(
        Math.sin(camAngle) * rCam,
        Math.sin(camAngle * 0.6) * 1.1,
        Math.cos(camAngle) * rCam,
      );
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => setSize();
    window.addEventListener("resize", onResize);

    // ── cleanup ──────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      for (const g of gfx) {
        g.geom.dispose();
        g.lineMat.dispose();
        g.glowMat.dispose();
      }
      for (const gl of glints) (gl.sprite.material as THREE.SpriteMaterial).dispose();
      cage.geometry.dispose();
      (cage.material as THREE.Material).dispose();
      glowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#03040a] text-foreground">
      <div ref={mountRef} className="absolute inset-0" />

      {/* header / controls */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-5 sm:p-7">
        <h1 className="font-serif text-2xl text-foreground sm:text-3xl">Vortex Filaments</h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Stir a superfluid and watch its quantized vortices tangle, ripple with Kelvin waves, and
          hear each reconnection fire.
        </p>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-5 sm:p-7">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {!started && (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-full bg-violet-500/20 px-5 py-2.5 text-base font-medium text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
            >
              Stir the superfluid
            </button>
          )}
          {started && (
            <button
              onClick={toggleMute}
              className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground ring-1 ring-border transition hover:bg-accent"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
          <button
            onClick={() => setShowNotes((v) => !v)}
            className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-muted-foreground ring-1 ring-border transition hover:bg-accent"
          >
            {showNotes ? "Hide notes" : "Design notes"}
          </button>
        </div>
        {started && (
          <p className="pointer-events-none text-sm text-muted-foreground">
            Drag anywhere to stir — fast strokes birth new rings.
          </p>
        )}
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-x-0 top-24 z-20 mx-auto max-w-xl rounded-2xl bg-black/70 p-5 text-base text-foreground ring-1 ring-border backdrop-blur sm:top-28">
          <p className="mb-2 text-foreground">
            A superfluid can&apos;t rotate as ordinary fluid does — its vorticity is quantized into
            thin <span className="text-violet-300">vortex filaments</span> (Feynman, 1955).
          </p>
          <p className="mb-2">
            Each loop moves under the <span className="text-violet-300">Local Induction
            Approximation</span> (Da Rios 1906 / Arms–Hama): every point drifts along its binormal
            at a speed set by local curvature. Rings translate; helical{" "}
            <span className="text-violet-300">Kelvin waves</span> (Lord Kelvin, 1880) propagate.
          </p>
          <p className="mb-2">
            When two strands cross they <span className="text-violet-300">reconnect</span> — and, per
            the 2025 universal-asymmetry law, they recoil <em>faster than they approached</em>,
            firing an energy burst. Each burst rings a fast-decay bell whose brightness tracks that
            energy.
          </p>
          <p className="text-muted-foreground">
            See the full README for references, including arXiv 2607.00821 (2026).
          </p>
        </div>
      )}

      {/* error / no-WebGL notice */}
      {err && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">{err}</p>
        </div>
      )}

      <Link
        href="/dream"
        className="pointer-events-auto absolute right-5 top-5 z-10 text-sm text-muted-foreground transition hover:text-foreground sm:right-7 sm:top-7"
      >
        ← gallery
      </Link>
    </main>
  );
}
