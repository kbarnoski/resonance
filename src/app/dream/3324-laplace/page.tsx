"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { VIOLET, MAGENTA } from "../_shared/palette";
import {
  createSim,
  stepSim,
  retuneWorld,
  snapToResonance,
  periodRatios,
  worldRadius,
  undertoneHz,
  NWORLDS,
  type SimState,
} from "./physics";
import { createAudio, type AudioEngine } from "./audio";

const WORLD_HEX = [VIOLET[200], VIOLET[500], MAGENTA] as const;
const WORLD_SIZE = [0.17, 0.21, 0.27] as const;
const TRAIL_LEN = 90;

interface HudState {
  periods: [number, number, number];
  ratios: [number, number];
  proximity: number;
  phiLdeg: number;
  released: boolean;
  instability: number;
  ejected: number;
}

function makeGlowTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.3, "rgba(220,214,254,0.7)");
    grd.addColorStop(1, "rgba(120,90,220,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

export default function LaplacePage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const simRef = useRef<SimState | null>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [released, setReleased] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hud, setHud] = useState<HudState | null>(null);

  const startedRef = useRef(false);
  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        audioRef.current = createAudio();
      } catch {
        // audio unavailable — the chain still orbits visually
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

  const toggleRelease = useCallback(() => {
    setReleased((r) => {
      const next = !r;
      if (simRef.current) simRef.current.releaseTarget = next ? 1 : 0;
      return next;
    });
  }, []);

  const doSnap = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    const wasEjected = sim.ejectedIndex;
    snapToResonance(sim);
    if (wasEjected >= 0) audioRef.current?.restoreVoice(wasEjected);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (typeof window === "undefined" || !window.WebGLRenderingContext) {
      setErr("This piece needs WebGL, which this browser does not provide.");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setErr("Could not start the WebGL renderer on this device.");
      return;
    }

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sim = createSim();
    simRef.current = sim;

    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05030f, 0.028);

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 2.4, 7.4);
    camera.lookAt(0, 0, 0);

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

    const glowTex = makeGlowTexture();
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(o: T): T => {
      disposables.push(o);
      return o;
    };

    // ── star ────────────────────────────────────────────────────────────────
    const starGeom = track(new THREE.SphereGeometry(0.42, 32, 24));
    const starMat = track(
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe6bf") }),
    );
    const star = new THREE.Mesh(starGeom, starMat);
    scene.add(star);
    const starGlowMat = track(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color("#ffdca8"),
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const starGlow = new THREE.Sprite(starGlowMat);
    starGlow.scale.setScalar(3.2);
    scene.add(starGlow);
    // violet halo behind the warm core
    const haloMat = track(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: new THREE.Color(VIOLET[600]),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(5.5);
    scene.add(halo);

    // ── perihelion reference line (where worlds strike) along +X ─────────────
    const periGeom = track(new THREE.BufferGeometry());
    periGeom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0.4, 0, 0, 7, 0, 0], 3),
    );
    const periMat = track(
      new THREE.LineBasicMaterial({
        color: new THREE.Color(VIOLET[400]),
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(new THREE.Line(periGeom, periMat));

    // ── per-world visuals ────────────────────────────────────────────────────
    interface WorldGfx {
      mesh: THREE.Mesh;
      glow: THREE.Sprite;
      ring: THREE.Line;
      ringMat: THREE.LineBasicMaterial;
      trail: THREE.Line;
      trailPos: Float32Array;
      trailAttr: THREE.BufferAttribute;
      glowMat: THREE.SpriteMaterial;
      baseSize: number;
    }
    const gfx: WorldGfx[] = [];
    const circlePts: number[] = [];
    const SEG = 128;
    for (let i = 0; i <= SEG; i++) {
      const t = (i / SEG) * Math.PI * 2;
      circlePts.push(Math.cos(t), 0, Math.sin(t));
    }
    for (let i = 0; i < NWORLDS; i++) {
      const col = new THREE.Color(WORLD_HEX[i]);
      const mesh = new THREE.Mesh(
        track(new THREE.SphereGeometry(WORLD_SIZE[i], 24, 18)),
        track(new THREE.MeshBasicMaterial({ color: col.clone() })),
      );
      scene.add(mesh);

      const glowMat = track(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: col.clone(),
          transparent: true,
          opacity: 0.7,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(WORLD_SIZE[i] * 7);
      scene.add(glow);

      const ringGeom = track(new THREE.BufferGeometry());
      ringGeom.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(circlePts.slice(), 3),
      );
      const ringMat = track(
        new THREE.LineBasicMaterial({
          color: col.clone(),
          transparent: true,
          opacity: 0.18,
          blending: THREE.AdditiveBlending,
        }),
      );
      const ring = new THREE.Line(ringGeom, ringMat);
      scene.add(ring);

      // fading trail (head bright → tail dark, additive so dark ≈ invisible)
      const trailPos = new Float32Array(TRAIL_LEN * 3);
      const trailCol = new Float32Array(TRAIL_LEN * 3);
      for (let k = 0; k < TRAIL_LEN; k++) {
        const f = 1 - k / TRAIL_LEN;
        trailCol[k * 3] = col.r * f;
        trailCol[k * 3 + 1] = col.g * f;
        trailCol[k * 3 + 2] = col.b * f;
      }
      const trailGeom = track(new THREE.BufferGeometry());
      const trailAttr = new THREE.BufferAttribute(trailPos, 3);
      trailGeom.setAttribute("position", trailAttr);
      trailGeom.setAttribute(
        "color",
        new THREE.BufferAttribute(trailCol, 3),
      );
      const trailMat = track(
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      const trail = new THREE.Line(trailGeom, trailMat);
      scene.add(trail);

      gfx.push({
        mesh,
        glow,
        ring,
        ringMat,
        trail,
        trailPos,
        trailAttr,
        glowMat,
        baseSize: WORLD_SIZE[i],
      });
    }

    // ── φ_L dial (needle that circulates unlocked / librates when locked) ────
    const dial = new THREE.Group();
    dial.position.set(0, 3.15, 0.2);
    dial.rotation.x = -0.32;
    scene.add(dial);
    const dialRingGeom = track(new THREE.TorusGeometry(0.95, 0.022, 8, 96));
    const dialRingMat = track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(VIOLET[700]),
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    dial.add(new THREE.Mesh(dialRingGeom, dialRingMat));
    // 180° marker (libration centre) at angle π → (−0.95, 0)
    const markGeom = track(new THREE.SphereGeometry(0.07, 12, 10));
    const markMat = track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(VIOLET[300]),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const mark = new THREE.Mesh(markGeom, markMat);
    mark.position.set(-0.95, 0, 0);
    dial.add(mark);
    // needle: pivot group rotated by φ_L, a bar reaching out to the ring
    const needlePivot = new THREE.Group();
    dial.add(needlePivot);
    const needleGeom = track(new THREE.BoxGeometry(0.9, 0.03, 0.03));
    const needleMat = track(
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(VIOLET[400]),
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    const needle = new THREE.Mesh(needleGeom, needleMat);
    needle.position.set(0.45, 0, 0); // extends from centre outward
    needlePivot.add(needle);
    const hubGeom = track(new THREE.SphereGeometry(0.06, 12, 10));
    dial.add(new THREE.Mesh(hubGeom, needleMat));

    // ── interaction: grab a world, drag radially to retune ────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    let grab = -1;

    const setNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };
    const onDown = (e: PointerEvent) => {
      setNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(
        gfx.map((g) => g.mesh),
        false,
      );
      if (hits.length === 0) return;
      grab = gfx.findIndex((g) => g.mesh === hits[0].object);
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (grab < 0) return;
      setNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        const r = Math.hypot(hit.x, hit.z);
        const wasEjected = sim.worlds[grab].ejected;
        retuneWorld(sim, grab, r);
        if (wasEjected) audioRef.current?.restoreVoice(grab);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (grab < 0) return;
      grab = -1;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    // ── loop ─────────────────────────────────────────────────────────────────
    const flashes = [0, 0, 0];
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let hudAcc = 0;
    const orbitAmp = reduceMotion ? 0.15 : 0.55;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      t += dt;

      const res = stepSim(sim, dt);

      // audio: strikes + continuous undertones
      const eng = audioRef.current;
      if (startedRef.current && eng) {
        for (const idx of res.strikes) {
          const w = sim.worlds[idx];
          if (w.ejected) continue;
          const strikeHz = undertoneHz(w.T) * 2;
          const intensity = 0.35 + sim.proximity * 0.5;
          eng.strike(idx, strikeHz, intensity);
          flashes[idx] = 1;
        }
        if (res.justEjected >= 0) {
          const w = sim.worlds[res.justEjected];
          eng.ejectVoice(res.justEjected, undertoneHz(w.T));
        }
        for (let i = 0; i < NWORLDS; i++) {
          const w = sim.worlds[i];
          if (w.ejected) continue;
          const level = 0.045 + sim.proximity * 0.035;
          eng.setPad(i, undertoneHz(w.T), level);
        }
      } else {
        for (const idx of res.strikes) flashes[idx] = 1;
      }

      // update world graphics
      for (let i = 0; i < NWORLDS; i++) {
        const w = sim.worlds[i];
        const g = gfx[i];
        const r = worldRadius(w);
        const x = Math.cos(w.theta) * r;
        const z = Math.sin(w.theta) * r;
        g.mesh.position.set(x, 0, z);
        g.glow.position.set(x, 0, z);

        flashes[i] *= Math.exp(-dt * 5);
        const fl = flashes[i];
        const scl = g.baseSize * (1 + fl * 1.1);
        g.mesh.scale.setScalar(scl / g.baseSize);
        g.glowMat.opacity = (w.ejected ? 0.3 : 0.55) + fl * 0.6;
        g.glow.scale.setScalar(g.baseSize * 7 * (1 + fl * 0.5));

        // orbit ring follows the (possibly drifting) radius
        g.ring.scale.setScalar(w.ejected ? 0.001 : r);
        g.ringMat.opacity = w.ejected ? 0 : 0.12 + sim.proximity * 0.14;

        // trail ring-buffer: shift down, new head at 0
        const tp = g.trailPos;
        tp.copyWithin(3, 0, (TRAIL_LEN - 1) * 3);
        tp[0] = x;
        tp[1] = 0;
        tp[2] = z;
        g.trailAttr.needsUpdate = true;
        (g.trail.material as THREE.LineBasicMaterial).opacity = w.ejected
          ? 0.35
          : 0.8;
      }

      // dial: needle at φ_L, colour warms toward locked violet with proximity
      needlePivot.rotation.z = sim.phiL;
      const lockCol = new THREE.Color(VIOLET[300]);
      const freeCol = new THREE.Color("#4a3d8a");
      needleMat.color.copy(freeCol).lerp(lockCol, sim.proximity);
      needleMat.opacity = 0.7 + sim.proximity * 0.3;
      markMat.opacity = 0.5 + sim.proximity * 0.45;
      dialRingMat.opacity = 0.4 + sim.proximity * 0.4;

      // star pulse: brighten subtly on the outer-world downbeat feel
      const pulse = 1 + flashes[2] * 0.25;
      starGlow.scale.setScalar(3.2 * pulse);
      haloMat.opacity = 0.4 + sim.proximity * 0.25;

      // slow cinematic camera drift
      camera.position.x = Math.sin(t * 0.11) * orbitAmp;
      camera.position.y = 2.4 + Math.sin(t * 0.09) * orbitAmp * 0.3;
      camera.lookAt(0, 0.2, 0);
      dial.lookAt(camera.position.x, camera.position.y, camera.position.z + 2);
      dial.rotateX(-0.15);

      renderer.render(scene, camera);

      // throttled HUD update (~10 Hz)
      hudAcc += dt;
      if (hudAcc >= 0.1) {
        hudAcc = 0;
        const [r12, r23] = periodRatios(sim.worlds);
        setHud({
          periods: [sim.worlds[0].T, sim.worlds[1].T, sim.worlds[2].T],
          ratios: [r12, r23],
          proximity: sim.proximity,
          phiLdeg: (sim.phiL * 180) / Math.PI,
          released: sim.release > 0.5,
          instability: sim.instability,
          ejected: sim.ejectedIndex,
        });
      }
    };
    loop();

    const onResize = () => setSize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      for (const d of disposables) d.dispose();
      glowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount)
        mount.removeChild(renderer.domElement);
      audioRef.current?.dispose();
      audioRef.current = null;
      simRef.current = null;
    };
  }, []);

  const locked = (hud?.proximity ?? 0) > 0.6;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden text-foreground">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 95% at 50% 30%, #180c34 0%, #0c0622 44%, #060312 76%, #020106 100%)",
        }}
      />
      <div ref={mountRef} className="absolute inset-0" />

      {err && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            {err}
          </p>
        </div>
      )}

      {/* hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Laplace Groove
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Three worlds strike a drum at perihelion. Tune their orbits into the
          4:2:1 Laplace chain and the hits interlock into a self-sustaining
          polyrhythm — then release real gravity and watch a wrong tuning tear
          itself apart.
        </p>
      </div>

      {/* notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {/* HUD */}
      {started && hud && (
        <div className="pointer-events-none absolute right-4 top-20 z-10 w-60 rounded-lg border border-border bg-background/70 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              chain
            </span>
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-xs uppercase tracking-[0.18em] ${
                locked
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {locked ? "locked" : "unlocked"}
            </span>
          </div>
          {(["Io", "Europa", "Ganymede"] as const).map((name, i) => (
            <div
              key={name}
              className="flex items-center justify-between py-0.5 text-sm text-foreground"
            >
              <span className="text-muted-foreground">{name}</span>
              <span className="font-mono text-xs">
                T {hud.periods[i].toFixed(2)}s
                {hud.ejected === i ? " · ejected" : ""}
              </span>
            </div>
          ))}
          <div className="mt-2 border-t border-border pt-2 font-mono text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>ratio 2:1</span>
              <span
                className={
                  Math.abs(hud.ratios[0] - 2) < 0.12 ? "text-primary" : ""
                }
              >
                {hud.ratios[0].toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>ratio 2:1</span>
              <span
                className={
                  Math.abs(hud.ratios[1] - 2) < 0.12 ? "text-primary" : ""
                }
              >
                {hud.ratios[1].toFixed(2)}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span>φ_L</span>
              <span className={locked ? "text-primary" : ""}>
                {locked ? "librating" : "circulating"}
              </span>
            </div>
            <div className="flex justify-between">
              <span>φ_L angle</span>
              <span>{hud.phiLdeg.toFixed(0)}°</span>
            </div>
            {hud.released && (
              <div className="mt-1 flex justify-between">
                <span>strain</span>
                <span className={hud.instability > 0.5 ? "text-destructive" : ""}>
                  {(hud.instability * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-5 sm:p-7">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {!started ? (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          ) : (
            <>
              <button
                onClick={doSnap}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Snap to 4:2:1
              </button>
              <button
                onClick={toggleRelease}
                className={`min-h-[44px] rounded-md px-6 text-sm font-medium transition-colors ${
                  released
                    ? "bg-primary/20 text-primary ring-1 ring-primary/50 hover:bg-primary/30"
                    : "border border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {released ? "Gravity live" : "Release gravity"}
              </button>
              <button
                onClick={toggleMute}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            </>
          )}
        </div>
        {started && (
          <p className="pointer-events-none max-w-xs text-sm text-muted-foreground">
            Drag a world in or out to tune its period. Watch the dial: it spins
            when unlocked, rocks when locked.
          </p>
        )}
      </div>

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              The Laplace resonance, heard as rhythm
            </h2>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              Jupiter&apos;s moons Io, Europa and Ganymede are locked in a 4:2:1
              chain: for every one Ganymede orbit, Europa completes two and Io
              four. The lock is enforced by the{" "}
              <span className="text-foreground">Laplace argument</span>{" "}
              φ_L = θ₁ − 3·θ₂ + 2·θ₃, built from the three mean longitudes. In a
              true resonance φ_L does not drift — it{" "}
              <span className="text-foreground">librates</span> around 180°,
              rocking back and forth in a potential well. Mistune the chain and
              φ_L instead <span className="text-foreground">circulates</span>,
              running freely through every angle.
            </p>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              Here each world strikes a percussive voice at perihelion, so the
              4:2:1 period lock becomes a nested polyrhythm — four hits to two
              hits to one, interlocking into a hypnotic groove. Each world also
              holds a sustained undertone whose pitch is read continuously from
              its orbital frequency (log-period → pitch, never quantized), so the
              chord you hear is literally the geometry.
            </p>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">Release gravity</span> ramps up a
              first-order three-body torque distributed along the (1, −3, 2)
              weights. A near-locked tuning is captured into exact resonance and
              holds — this is why the real Laplace chain is stable. A mistuned
              tuning has no restoring force, so a secular divergence grows, φ_L
              spins faster, strain accumulates, and the least-stable world is
              ejected: its voice bends up, screeches and dies.
            </p>
            <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
              The idea of hearing orbital resonances as music is central to{" "}
              <span className="text-foreground">
                Matt Russo and SYSTEM Sounds
              </span>
              , whose sonifications of the Galilean moons and the seven-world
              TRAPPIST-1 resonant chain turn celestial mechanics into rhythm and
              harmony. This piece is a playable homage to that idea.
            </p>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              <span className="text-foreground">Next cycle:</span> real eccentric
              orbits and true perihelion timing; a second and third resonant
              chain (TRAPPIST-1&apos;s full 8:5:3:2 ladder); libration amplitude
              driving reverb depth; and a proper resonance-argument phase
              portrait beside the dial.
            </p>
            <Link
              href="/dream"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              ← back to the lab
            </Link>
          </div>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
