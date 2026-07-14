"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  createSim,
  stepSim,
  detectLocks,
  swarmAgitation,
  flingConductor,
  dropWell,
  WORLD,
  type Sim,
} from "./sim";
import { createAudio, type AudioEngine, type Telemetry } from "./audio";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── procedural glow shaders (no texture sprites, no Canvas2D surface) ─────────
const SWARM_VERT = `
attribute float aSpeed;
varying float vSpeed;
uniform float uSize;
uniform float uDpr;
void main() {
  vSpeed = aSpeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uDpr * (0.65 + vSpeed * 1.7);
}`;

const SWARM_FRAG = `
precision highp float;
varying float vSpeed;
uniform float uPulse;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float a = pow(max(0.0, 1.0 - r), 2.6);
  vec3 cold = vec3(0.30, 0.22, 0.66);   // off-violet deep space
  vec3 warm = vec3(1.00, 0.72, 0.30);   // gold where tidal shear heats it
  vec3 col = mix(cold, warm, clamp(vSpeed, 0.0, 1.0));
  float bright = 0.55 + 0.28 * uPulse;
  gl_FragColor = vec4(col * a * bright, a);
}`;

const COND_VERT = `
attribute vec3 aColor;
attribute float aPSize;
varying vec3 vColor;
uniform float uDpr;
uniform float uPulse;
void main() {
  vColor = aColor;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aPSize * uDpr * (1.0 + 0.16 * uPulse);
}`;

const COND_FRAG = `
precision highp float;
varying vec3 vColor;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r = length(d) * 2.0;
  float core = pow(max(0.0, 1.0 - r), 3.0);
  float halo = pow(max(0.0, 1.0 - r), 1.3) * 0.5;
  vec3 col = vColor * (core + halo) + vec3(1.0) * core * 0.55;
  float a = core + halo;
  gl_FragColor = vec4(col, a);
}`;

const COND_COLORS = [
  [1.0, 0.86, 0.5], // central sun — gold-white
  [0.62, 0.5, 1.0], // orbiter 1 — violet
  [0.45, 0.72, 1.0], // orbiter 2 — blue
  [0.85, 0.55, 0.95], // orbiter 3 — magenta-violet
];
const COND_SIZES = [40, 22, 20, 18];

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [lockLabel, setLockLabel] = useState("listening…");
  const [lockCount, setLockCount] = useState(0);

  const simRef = useRef<Sim | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(false);

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
    simRef.current = null;
    setRunning(false);
    setLockLabel("listening…");
    setLockCount(0);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    if (running) return;
    const mount = mountRef.current;
    if (!mount) return;

    // audio first (created inside the gesture) — survives even if WebGL fails
    let audio: AudioEngine;
    try {
      audio = createAudio();
      await audio.resume();
    } catch {
      return;
    }
    audioRef.current = audio;
    audio.setMuted(mutedRef.current);

    const sim = createSim(9000);
    simRef.current = sim;
    setRunning(true);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timeScale = reduced ? 0.55 : 0.9;

    // ── try WebGL ─────────────────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      renderer = null;
    }

    if (!renderer) {
      // audio-only fallback: keep the sim + audio alive, show a notice
      setWebglFailed(true);
      const audioOnly = () => {
        const s = simRef.current;
        const a = audioRef.current;
        if (!s || !a) return;
        stepSim(s, 0.016 * timeScale);
        pushTelemetry(s, a);
        rafRef.current = requestAnimationFrame(audioOnly);
      };
      rafRef.current = requestAnimationFrame(audioOnly);
      teardownRef.current = () => setWebglFailed(false);
      return;
    }

    setWebglFailed(false);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(new THREE.Color(0x07060f), 1); // off-violet deep space
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-WORLD, WORLD, WORLD, -WORLD, 0.1, 100);
    cam.position.z = 10;

    // faint background halo plane (adds depth without strobe)
    const haloGeo = new THREE.PlaneGeometry(WORLD * 4, WORLD * 4);
    const haloMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `precision highp float; varying vec2 vUv; void main(){ float d=distance(vUv,vec2(0.5)); float a=smoothstep(0.55,0.0,d)*0.10; gl_FragColor=vec4(vec3(0.18,0.14,0.34)*a, a);} `,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.z = -1;
    scene.add(halo);

    // ── swarm points ──────────────────────────────────────────────────────────
    const n = sim.n;
    const swarmPos = new Float32Array(n * 3);
    const swarmSpeed = new Float32Array(n);
    const swarmGeo = new THREE.BufferGeometry();
    swarmGeo.setAttribute("position", new THREE.BufferAttribute(swarmPos, 3));
    swarmGeo.setAttribute("aSpeed", new THREE.BufferAttribute(swarmSpeed, 1));
    const swarmMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uSize: { value: 2.2 },
        uDpr: { value: dpr },
        uPulse: { value: 0 },
      },
      vertexShader: SWARM_VERT,
      fragmentShader: SWARM_FRAG,
    });
    const swarm = new THREE.Points(swarmGeo, swarmMat);
    scene.add(swarm);

    // ── conductor points ─────────────────────────────────────────────────────
    const m = sim.conductors.length;
    const condPos = new Float32Array(m * 3);
    const condColor = new Float32Array(m * 3);
    const condSize = new Float32Array(m);
    for (let i = 0; i < m; i++) {
      const c = COND_COLORS[i] ?? COND_COLORS[COND_COLORS.length - 1];
      condColor[i * 3] = c[0];
      condColor[i * 3 + 1] = c[1];
      condColor[i * 3 + 2] = c[2];
      condSize[i] = COND_SIZES[i] ?? 18;
    }
    const condGeo = new THREE.BufferGeometry();
    condGeo.setAttribute("position", new THREE.BufferAttribute(condPos, 3));
    condGeo.setAttribute("aColor", new THREE.BufferAttribute(condColor, 3));
    condGeo.setAttribute("aPSize", new THREE.BufferAttribute(condSize, 1));
    const condMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uDpr: { value: dpr }, uPulse: { value: 0 } },
      vertexShader: COND_VERT,
      fragmentShader: COND_FRAG,
    });
    const cond = new THREE.Points(condGeo, condMat);
    scene.add(cond);

    // ── sizing ────────────────────────────────────────────────────────────────
    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer!.setSize(w, h, false);
      const aspect = w / h;
      if (aspect >= 1) {
        cam.top = WORLD;
        cam.bottom = -WORLD;
        cam.right = WORLD * aspect;
        cam.left = -WORLD * aspect;
      } else {
        cam.right = WORLD;
        cam.left = -WORLD;
        cam.top = WORLD / aspect;
        cam.bottom = -WORLD / aspect;
      }
      cam.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── pointer interaction ────────────────────────────────────────────────────
    const canvas = renderer.domElement;
    let downX = 0,
      downY = 0,
      downWX = 0,
      downWY = 0,
      pointerDown = false;
    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const nx = (clientX - rect.left) / rect.width;
      const ny = (clientY - rect.top) / rect.height;
      const wx = cam.left + nx * (cam.right - cam.left);
      const wy = cam.top - ny * (cam.top - cam.bottom);
      return { wx, wy };
    };
    const onDown = (e: PointerEvent) => {
      pointerDown = true;
      downX = e.clientX;
      downY = e.clientY;
      const w = toWorld(e.clientX, e.clientY);
      downWX = w.wx;
      downWY = w.wy;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onUp = (e: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      const s = simRef.current;
      if (!s) return;
      const dpx = e.clientX - downX;
      const dpy = e.clientY - downY;
      const dist = Math.hypot(dpx, dpy);
      const w = toWorld(e.clientX, e.clientY);
      if (dist > 12) {
        // fling nearest conductor → it runs off-lock and beats against neighbours
        flingConductor(s, downWX, downWY, w.wx - downWX, w.wy - downWY);
      } else {
        // tap → drop a transient well the swarm streams toward
        dropWell(s, w.wx, w.wy);
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ── main loop ──────────────────────────────────────────────────────────────
    let last = performance.now();
    let pulse = 0;
    let hudAccum = 0;
    const loop = () => {
      const s = simRef.current;
      const a = audioRef.current;
      if (!s || !a) return;
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp big gaps
      stepSim(s, dt * timeScale);

      // slow luminance drift (≤ 3 Hz, gentle) — no strobe
      const driftHz = reduced ? 0.05 : 0.14;
      pulse = 0.5 + 0.5 * Math.sin(now * 0.001 * Math.PI * 2 * driftHz);
      swarmMat.uniforms.uPulse.value = pulse;
      condMat.uniforms.uPulse.value = pulse;

      // update swarm buffers
      const refSpeed = 11;
      for (let i = 0; i < n; i++) {
        swarmPos[i * 3] = s.px[i];
        swarmPos[i * 3 + 1] = s.py[i];
        const sp = Math.hypot(s.pvx[i], s.pvy[i]) / refSpeed;
        swarmSpeed[i] = sp > 1 ? 1 : sp;
      }
      swarmGeo.attributes.position.needsUpdate = true;
      swarmGeo.attributes.aSpeed.needsUpdate = true;

      // update conductor buffers
      for (let i = 0; i < m; i++) {
        condPos[i * 3] = s.conductors[i].x;
        condPos[i * 3 + 1] = s.conductors[i].y;
      }
      condGeo.attributes.position.needsUpdate = true;

      pushTelemetry(s, a);

      // HUD (throttled ~8 Hz)
      hudAccum += dt;
      if (hudAccum > 0.12) {
        hudAccum = 0;
        const locks = detectLocks(s);
        if (locks.length) {
          let best = locks[0];
          for (const l of locks) if (l.strength > best.strength) best = l;
          setLockLabel(best.name);
          setLockCount(locks.length);
        } else {
          setLockLabel("off-lock · wobbling");
          setLockCount(0);
        }
      }

      renderer!.render(scene, cam);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── teardown ───────────────────────────────────────────────────────────────
    teardownRef.current = () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      scene.remove(swarm, cond, halo);
      swarmGeo.dispose();
      swarmMat.dispose();
      condGeo.dispose();
      condMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      renderer!.dispose();
      if (renderer!.domElement.parentElement === mount)
        mount.removeChild(renderer!.domElement);
    };
  }, [running]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* overlay chrome */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <header className="max-w-xl space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Tidal Canon</h1>
          <p className="text-base text-muted-foreground">
            A few massive conductor bodies orbit under real gravity and sculpt a
            swarm of thousands of stars — hear the moment two conductors lock into
            a pure just-intonation dyad, over the aggregate wash of the swarm
            being tidally stretched.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {webglFailed && (
            <p className="text-base text-destructive">
              WebGL is unavailable — the visuals are off, but the physics and
              audio are still running.
            </p>
          )}
          {running && (
            <div className="space-y-1">
              <p className="text-base text-foreground">
                resonance lock ·{" "}
                <span className="font-medium">{lockLabel}</span>
                {lockCount > 1 && (
                  <span className="text-muted-foreground">
                    {"  "}(+{lockCount - 1} more)
                  </span>
                )}
              </p>
              <p className="text-base text-muted-foreground">
                drag to fling a conductor off-lock · tap to drop a gravity well
                the swarm streams toward
              </p>
            </div>
          )}

          <div className="pointer-events-auto flex items-center gap-3">
            {!running ? (
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Begin the canon
              </button>
            ) : (
              <>
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Stop
                </button>
                <button
                  onClick={() => setMuted((v) => !v)}
                  className="min-h-[44px] rounded-md border border-muted-foreground/30 px-6 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <PrototypeNav slugs={["1622-tidal-canon"]} />
    </main>
  );
}

// ── telemetry: physics → audio ───────────────────────────────────────────────
function pushTelemetry(s: Sim, a: AudioEngine) {
  const rawFreqs: number[] = [];
  const rawPans: number[] = [];
  for (let i = 1; i < s.conductors.length; i++) {
    rawFreqs.push(s.conductors[i].freq);
    rawPans.push(Math.max(-1, Math.min(1, s.conductors[i].x / WORLD)));
  }
  const tel: Telemetry = {
    rawFreqs,
    rawPans,
    locks: detectLocks(s),
    agitation: swarmAgitation(s),
  };
  a.render(tel);
}
