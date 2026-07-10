"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSim,
  addAttractor,
  removeAttractor,
  stepSim,
  SCALE_HZ,
  SCALE_LABEL,
  SHELL_R,
  MAX_ATTRACTORS,
  type SimState,
} from "./sim";
import { createAudio, type AudioEngine, type VoiceTelemetry } from "./audio";

const MOTE_COUNT = 24000;

// cosmic pitch palette — a hue per scale degree, indigo → violet → cyan
const PITCH_HUES = [0.72, 0.68, 0.63, 0.58, 0.52, 0.47, 0.5];

// a soft radial glow sprite for the attractor cores (generated, no asset)
function drawGlowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.3, "rgba(210,225,255,0.7)");
    grd.addColorStop(1, "rgba(120,140,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

interface AttractorView {
  id: number;
  pitchIndex: number;
  selected: boolean;
}

export default function GravityChoirPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const simRef = useRef<SimState | null>(null);
  const selectedRef = useRef<number>(-1);
  const runningRef = useRef(false);
  const frozenRef = useRef(false);
  const pitchCycleRef = useRef(0);
  // page → scene bridge: the mount effect registers callbacks here
  const placeRef = useRef<((clientX: number, clientY: number) => void) | null>(null);
  const setPitchRef = useRef<((k: number) => void) | null>(null);

  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [views, setViews] = useState<AttractorView[]>([]);

  const syncViews = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    setViews(
      sim.attractors.map((a) => ({
        id: a.id,
        pitchIndex: a.pitchIndex,
        selected: a.id === selectedRef.current,
      }))
    );
  }, []);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        audioRef.current = createAudio();
      } catch {
        // audio unavailable — the swarm still orbits in silence
      }
    }
    try {
      await audioRef.current?.resume();
    } catch {
      // ignore resume failure
    }
    runningRef.current = true;
    frozenRef.current = false;
    setStarted(true);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    frozenRef.current = true; // halt the swarm's motion
    audioRef.current?.stop();
    audioRef.current = null;
    setStarted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const onPickPitch = useCallback(
    (k: number) => {
      setPitchRef.current?.(k);
      syncViews();
    },
    [syncViews]
  );

  const onClearSelected = useCallback(() => {
    const sim = simRef.current;
    if (!sim || selectedRef.current < 0) return;
    removeAttractor(sim, selectedRef.current);
    selectedRef.current = sim.attractors.length ? sim.attractors[sim.attractors.length - 1].id : -1;
    syncViews();
  }, [syncViews]);

  // keyboard: 1–7 assign the selected attractor's pitch
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 7) {
        onPickPitch(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPickPitch]);

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

    const sim = createSim(MOTE_COUNT);
    simRef.current = sim;

    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05030f, 0.012);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    camera.position.set(0, 4, 30);
    camera.lookAt(0, 0, 0);

    let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const setSize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      moteMat.uniforms.uPixelRatio.value = pixelRatio;
    };

    // ── the mote point-cloud ────────────────────────────────────────────────
    const moteGeom = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(new Float32Array(sim.count * 3), 3);
    const spdAttr = new THREE.BufferAttribute(new Float32Array(sim.count), 1);
    posAttr.setUsage(THREE.DynamicDrawUsage);
    spdAttr.setUsage(THREE.DynamicDrawUsage);
    moteGeom.setAttribute("position", posAttr);
    moteGeom.setAttribute("aSpeed", spdAttr);
    moteGeom.setDrawRange(0, sim.count);
    moteGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);

    const moteMat = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 190 },
        uPixelRatio: { value: pixelRatio },
        uColSlow: { value: new THREE.Color(0x6d4bff) }, // violet (slow, far)
        uColFast: { value: new THREE.Color(0x53e6ff) }, // cyan (fast, near periapsis)
      },
      vertexShader: `
        attribute float aSpeed;
        varying float vSpeed;
        uniform float uSize;
        uniform float uPixelRatio;
        void main() {
          vSpeed = aSpeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float sz = uSize * uPixelRatio / max(-mv.z, 1.0);
          gl_PointSize = clamp(sz, 1.0, 9.0);
        }
      `,
      fragmentShader: `
        varying float vSpeed;
        uniform vec3 uColSlow;
        uniform vec3 uColFast;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c);
          if (d > 0.25) discard;
          float a = smoothstep(0.25, 0.02, d);
          vec3 col = mix(uColSlow, uColFast, clamp(vSpeed, 0.0, 1.0));
          gl_FragColor = vec4(col, a * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const motes = new THREE.Points(moteGeom, moteMat);
    motes.frustumCulled = false;
    scene.add(motes);

    // ── attractor cores (a small glowing star each) ─────────────────────────
    const glowTex = drawGlowTexture();
    const coreGeom = new THREE.BufferGeometry();
    const corePos = new THREE.BufferAttribute(new Float32Array(MAX_ATTRACTORS * 3), 3);
    const coreCol = new THREE.BufferAttribute(new Float32Array(MAX_ATTRACTORS * 3), 3);
    corePos.setUsage(THREE.DynamicDrawUsage);
    coreCol.setUsage(THREE.DynamicDrawUsage);
    coreGeom.setAttribute("position", corePos);
    coreGeom.setAttribute("color", coreCol);
    coreGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60);
    const coreMat = new THREE.PointsMaterial({
      size: 2.6,
      map: glowTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const cores = new THREE.Points(coreGeom, coreMat);
    cores.frustumCulled = false;
    scene.add(cores);

    // ── periapsis "resonance shell" rings (one per attractor) ───────────────
    const RING_SEG = 96;
    const ringGeom = new THREE.BufferGeometry();
    const rp = new Float32Array((RING_SEG + 1) * 3);
    for (let i = 0; i <= RING_SEG; i++) {
      const a = (i / RING_SEG) * Math.PI * 2;
      rp[i * 3] = Math.cos(a) * SHELL_R;
      rp[i * 3 + 1] = Math.sin(a) * SHELL_R;
      rp[i * 3 + 2] = 0;
    }
    ringGeom.setAttribute("position", new THREE.BufferAttribute(rp, 3));
    const rings: THREE.LineLoop[] = [];
    const ringMats: THREE.LineBasicMaterial[] = [];
    for (let i = 0; i < MAX_ATTRACTORS; i++) {
      const m = new THREE.LineBasicMaterial({
        color: 0x8a7bff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const loop = new THREE.LineLoop(ringGeom, m);
      loop.visible = false;
      scene.add(loop);
      rings.push(loop);
      ringMats.push(m);
    }

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "crosshair";
    mount.appendChild(renderer.domElement);
    setSize();

    // seed the sky with two singing bodies so Start is instantly alive
    const a0 = addAttractor(sim, -6, 1.5, 0, 0);
    const a1 = addAttractor(sim, 6, -2, 0, 4);
    selectedRef.current = a1 ? a1.id : a0 ? a0.id : -1;
    syncViews();

    // ── interaction: place / select an attractor on the z=0 plane ───────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    const proj = new THREE.Vector3();

    placeRef.current = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return;

      // select an existing attractor if the click landed near its screen position
      let bestId = -1;
      let bestPix = 34; // px threshold
      for (const a of sim.attractors) {
        proj.set(a.x, a.y, a.z).project(camera);
        const sx = ((proj.x + 1) / 2) * rect.width;
        const sy = ((1 - proj.y) / 2) * rect.height;
        const dpx = Math.hypot(sx - (clientX - rect.left), sy - (clientY - rect.top));
        if (dpx < bestPix) {
          bestPix = dpx;
          bestId = a.id;
        }
      }
      if (bestId >= 0) {
        selectedRef.current = bestId;
        syncViews();
        return;
      }
      // otherwise place a new one (cycling its default pitch)
      const pitch = pitchCycleRef.current % SCALE_HZ.length;
      pitchCycleRef.current++;
      const a = addAttractor(sim, hit.x, hit.y, 0, pitch);
      if (a) {
        selectedRef.current = a.id;
        syncViews();
      }
    };

    setPitchRef.current = (k: number) => {
      const a = sim.attractors.find((x) => x.id === selectedRef.current);
      if (a) a.pitchIndex = k;
    };

    const onDown = (e: PointerEvent) => {
      placeRef.current?.(e.clientX, e.clientY);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);

    // ── graceful context-loss handling ──────────────────────────────────────
    let contextLost = false;
    const onLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
    };
    const onRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost as EventListener);
    renderer.domElement.addEventListener("webglcontextrestored", onRestored as EventListener);

    const onResize = () => setSize();
    window.addEventListener("resize", onResize);

    // ── loop ────────────────────────────────────────────────────────────────
    const tele: VoiceTelemetry[] = [];
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const camAmp = reduceMotion ? 2 : 6;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (contextLost) return;
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp after tab-switch stalls
      t += dt;

      // frozen (after Stop) → halt the swarm, but keep rendering the last frame
      if (!frozenRef.current) {
        stepSim(sim, dt);

        // push positions + speeds into the point-cloud
        const pa = posAttr.array as Float32Array;
        const sa = spdAttr.array as Float32Array;
        const { px, py, pz, speed } = sim;
        for (let i = 0; i < sim.count; i++) {
          pa[i * 3] = px[i];
          pa[i * 3 + 1] = py[i];
          pa[i * 3 + 2] = pz[i];
          sa[i] = speed[i];
        }
        posAttr.needsUpdate = true;
        spdAttr.needsUpdate = true;
      }

      // update cores + rings, and build audio telemetry from the geometry
      const cp = corePos.array as Float32Array;
      const cc = coreCol.array as Float32Array;
      const col = new THREE.Color();
      tele.length = 0;
      for (let i = 0; i < sim.attractors.length; i++) {
        const a = sim.attractors[i];
        cp[i * 3] = a.x;
        cp[i * 3 + 1] = a.y;
        cp[i * 3 + 2] = a.z;
        const hue = PITCH_HUES[a.pitchIndex] ?? 0.6;
        const bright = 0.45 + Math.min(0.4, a.density / 500) * 0.5;
        const sel = a.id === selectedRef.current;
        col.setHSL(hue, 0.75, sel ? Math.min(0.85, bright + 0.18) : bright);
        cc[i * 3] = col.r;
        cc[i * 3 + 1] = col.g;
        cc[i * 3 + 2] = col.b;

        const ring = rings[i];
        ring.visible = true;
        ring.position.set(a.x, a.y, a.z);
        ringMats[i].color.setHSL(hue, 0.8, 0.6);
        ringMats[i].opacity = 0.14 + Math.min(0.3, a.density / 420) + (sel ? 0.12 : 0);

        proj.set(a.x, a.y, a.z).project(camera);
        tele.push({
          id: a.id,
          freq: SCALE_HZ[a.pitchIndex],
          density: a.density,
          meanSpeed: a.meanSpeed,
          grains: a.grains,
          pan: Math.max(-1, Math.min(1, proj.x)),
        });
      }
      for (let i = sim.attractors.length; i < MAX_ATTRACTORS; i++) rings[i].visible = false;
      corePos.needsUpdate = true;
      coreCol.needsUpdate = true;
      coreGeom.setDrawRange(0, sim.attractors.length);

      if (runningRef.current && audioRef.current) audioRef.current.render(tele);

      // slow, boundless camera drift
      camera.position.x = Math.sin(t * 0.06) * camAmp;
      camera.position.y = 4 + Math.sin(t * 0.043) * camAmp * 0.5;
      camera.position.z = 30 + Math.cos(t * 0.05) * camAmp * 0.6;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("webglcontextlost", onLost as EventListener);
      renderer.domElement.removeEventListener("webglcontextrestored", onRestored as EventListener);
      placeRef.current = null;
      setPitchRef.current = null;
      moteGeom.dispose();
      moteMat.dispose();
      coreGeom.dispose();
      coreMat.dispose();
      ringGeom.dispose();
      for (const m of ringMats) m.dispose();
      glowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      simRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncViews]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden text-white">
      {/* deep star-void backdrop — always present, so it's never blank */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 100% at 50% 20%, #170b3a 0%, #0c0726 40%, #060314 72%, #010008 100%)",
        }}
      />
      <div ref={mountRef} className="absolute inset-0" />

      {err && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">{err}</p>
        </div>
      )}

      {/* title + one-sentence description */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white/95 sm:text-3xl">
          Gravity Choir
        </h1>
        <p className="max-w-xl text-base text-white/75">
          A swarm that doesn&apos;t react to music — it <span className="text-violet-300">makes</span>{" "}
          it. Tens of thousands of motes fall into orbit around the stars you place, and their
          orbital motion <span className="text-violet-300">is</span> the sound.
        </p>
      </div>

      {/* notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-white/15 bg-black/40 px-4 py-2.5 text-base font-medium text-white/80 backdrop-blur-md transition-colors hover:bg-black/60"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {/* controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3 p-5 sm:p-7">
        {started && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
            {SCALE_LABEL.map((lbl, i) => (
              <button
                key={lbl}
                onClick={() => onPickPitch(i)}
                className="min-h-[44px] rounded-lg bg-white/5 px-3 py-2.5 text-base text-white/75 ring-1 ring-white/10 transition hover:bg-violet-500/20 hover:text-white"
                title={`Set the selected star to ${lbl}`}
              >
                <span className="mr-1 font-mono text-white/45">{i + 1}</span>
                {lbl}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {!started ? (
              <button
                onClick={begin}
                className="min-h-[44px] rounded-full bg-violet-500/25 px-6 py-2.5 text-base font-medium text-violet-100 ring-1 ring-violet-300/40 transition hover:bg-violet-500/35"
              >
                Start the choir
              </button>
            ) : (
              <>
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base text-white/90 ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  Stop
                </button>
                <button
                  onClick={toggleMute}
                  className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base text-white/90 ring-1 ring-white/15 transition hover:bg-white/15"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
                {views.length < MAX_ATTRACTORS && (
                  <span className="min-h-[44px] rounded-full bg-white/5 px-4 py-2.5 text-base text-white/55 ring-1 ring-white/10">
                    Click the void to place a star
                  </span>
                )}
                {selectedRef.current >= 0 && views.length > 1 && (
                  <button
                    onClick={onClearSelected}
                    className="min-h-[44px] rounded-full bg-white/5 px-4 py-2.5 text-base text-rose-200/80 ring-1 ring-white/10 transition hover:bg-rose-500/15"
                  >
                    Remove star
                  </button>
                )}
              </>
            )}
          </div>
          {started && (
            <p className="pointer-events-none text-base text-white/55">
              {views.length} star{views.length === 1 ? "" : "s"} singing · click to place or select ·
              keys 1–7 tune the selected one
            </p>
          )}
        </div>
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-x-0 top-20 z-20 mx-auto max-h-[76dvh] max-w-xl overflow-y-auto rounded-2xl bg-black/70 p-5 text-base text-white/75 ring-1 ring-white/10 backdrop-blur sm:top-24">
          <p className="mb-3 text-white/95">
            Almost every particle piece is <em>audio-reactive</em>: sound comes first and the visuals
            dance to it. <span className="text-violet-300">Gravity Choir inverts that.</span> Here the
            geometry comes first — the swarm sonifies its own orbital motion.
          </p>
          <p className="mb-3">
            Each star is an attractor tuned to a pitch. A <span className="text-violet-300">THREE.Points</span>{" "}
            cloud of {MOTE_COUNT.toLocaleString()} motes is integrated on the CPU each frame under
            softened inverse-square gravity, a faint bounding spring, and a little drag. Every frame we
            measure, per star, how many motes are streaming through its periapsis{" "}
            <span className="text-violet-300">resonance shell</span> and how fast. Density blooms the
            star&apos;s sustained additive tone; mean speed opens a gentle filter; and each mote
            crossing <em>into</em> the shell fires a soft grain. The rhythm you hear is emergent —
            written by the orbital periods, not a sequencer.
          </p>
          <p className="mb-3 text-white/75">
            <span className="text-white/95">Controls:</span> Start · click the void to place a star (or
            click an existing one to select it) · number keys 1–7 pick the selected star&apos;s pitch
            from an A-minor-pentatonic set · Remove star · Mute · Stop ramps everything to silence.
          </p>
          <p className="mb-3 text-white/75">
            <span className="text-white/95">References &amp; divergence:</span> kin to{" "}
            <em>Party</em> (2026, a WebGPU particle-physics playground) and Robert Borghesi&apos;s{" "}
            <em>ASTRODITHER</em> (2026, Three.js WebGPU/TSL audio-reactive particles). Both are
            gorgeous GPU swarms driven <em>by</em> audio. This one runs on plain WebGL for broad
            device support and reverses the arrow: the swarm is the instrument, not the visualiser.
          </p>
          <p className="mb-3 text-white/60">
            <span className="text-white/95">Honest novelty:</span> GPU/point-cloud particle fields have
            deep lab prior art, and CPU n-body toys are old. The fresh part is narrow but real — a
            gravitational swarm that plays <em>itself</em>, its music emerging from orbital dynamics
            rather than reacting to a track.
          </p>
          <Link href="/dream" className="text-violet-300 underline-offset-4 hover:underline">
            ← back to the lab
          </Link>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
