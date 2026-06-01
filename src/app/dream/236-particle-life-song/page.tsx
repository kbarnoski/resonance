"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";

// ── Particle Life as a generative instrument ────────────────────────────────
//
// N particles in S color "species". An asymmetric S×S attraction matrix says
// how each species feels about every other. Short-range repulsion + matrix
// attraction within an interaction radius + friction → emergent life: cells,
// chasers, membranes, orbiting structures.
//
// The sonic twist: each species owns one pentatonic voice. As a species'
// particles clump (local clustering rises), its voice swells brighter/louder.
// Self-organization becomes audible. Music ABOUT emergence.
//
// Simulation is CPU (spatial-hash neighbor search) so the per-species
// clustering metric is exact and cheap; rendering is additive WebGL Points.

const N = 2400; // particles
const S = 5; // species
const WORLD = 1.0; // simulation lives in a [-WORLD, WORLD]^2 box (wraps)
const R_MAX = 0.11; // interaction radius
const R_MIN = 0.30; // repulsion zone as fraction of R_MAX
const FRICTION = 0.86;
const FORCE = 0.55;
const DT = 0.014;

// C major pentatonic across species (Hz): C4 D4 E4 G4 A4
const SPECIES_HZ = [261.63, 293.66, 329.63, 392.0, 440.0];

// organic-emergent palette — luminous but earthy
const SPECIES_RGB: [number, number, number][] = [
  [0.96, 0.42, 0.55], // rose
  [0.99, 0.74, 0.36], // amber
  [0.55, 0.92, 0.62], // emerald
  [0.46, 0.74, 0.99], // sky
  [0.78, 0.58, 0.99], // violet
];

function makeMatrix(rng: () => number): Float32Array {
  // asymmetric attraction matrix in [-1, 1]
  const m = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) m[i] = rng() * 2 - 1;
  return m;
}

// small seedable PRNG so "New world" is reproducible-ish per click
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Voice = {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  level: number; // smoothed clustering 0..1
};

export default function ParticleLifeSong() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [supported, setSupported] = useState(true);
  const [regime, setRegime] = useState(1);

  // simulation state held in refs so the rAF loop never re-binds
  const posRef = useRef(new Float32Array(N * 2));
  const velRef = useRef(new Float32Array(N * 2));
  const typeRef = useRef(new Uint8Array(N));
  const matrixRef = useRef<Float32Array>(makeMatrix(makeRng(1)));
  const seedRef = useRef(1);

  const audioRef = useRef<{
    ctx: AudioContext;
    master: GainNode;
    voices: Voice[];
  } | null>(null);

  const stirRef = useRef<{ x: number; y: number; active: boolean }>({
    x: 0,
    y: 0,
    active: false,
  });

  // ── reseed world (matrix + positions) ────────────────────────────────────
  const reseed = useCallback((seed: number) => {
    const rng = makeRng(seed);
    matrixRef.current = makeMatrix(rng);
    const pos = posRef.current;
    const vel = velRef.current;
    const type = typeRef.current;
    for (let i = 0; i < N; i++) {
      pos[i * 2] = rng() * 2 - 1;
      pos[i * 2 + 1] = rng() * 2 - 1;
      vel[i * 2] = 0;
      vel[i * 2 + 1] = 0;
      type[i] = Math.floor(rng() * S);
    }
  }, []);

  const newWorld = useCallback(() => {
    const seed = (Math.random() * 1e9) >>> 0;
    seedRef.current = seed;
    reseed(seed);
    setRegime((r) => r + 1);
  }, [reseed]);

  // ── start audio ───────────────────────────────────────────────────────────
  const start = useCallback(() => {
    if (audioRef.current) return;
    type WindowAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext || (window as WindowAudio).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();

    const master = ctx.createGain();
    master.gain.value = 0.0;
    // gentle feedback delay for an organic wash
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.33;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    master.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    master.connect(ctx.destination);
    wet.connect(ctx.destination);

    const voices: Voice[] = [];
    for (let s = 0; s < S; s++) {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = "triangle";
      oscB.type = "sine";
      oscA.frequency.value = SPECIES_HZ[s];
      oscB.frequency.value = SPECIES_HZ[s];
      oscB.detune.value = 7; // slight beating
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 400;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      oscA.start();
      oscB.start();
      voices.push({ oscA, oscB, filter, gain, level: 0 });
    }

    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.2);
    audioRef.current = { ctx, master, voices };
    setStarted(true);
  }, []);

  // ── three.js + simulation lifecycle ─────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setSupported(false);
      return;
    }
    if (!renderer.getContext()) {
      setSupported(false);
      return;
    }

    reseed(seedRef.current);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.setClearColor(0x05060a, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // orthographic camera covering [-1.05, 1.05]
    const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, -1, 1);

    // geometry: positions + per-particle color
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: dpr } },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uPx;
        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 3.2 * uPx;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = smoothstep(0.25, 0.0, r);
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });

    const points = new THREE.Points(geom, material);
    scene.add(points);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      // keep square world centered; widen the visible window on long axis
      if (aspect >= 1) {
        camera.left = -1.05 * aspect;
        camera.right = 1.05 * aspect;
        camera.top = 1.05;
        camera.bottom = -1.05;
      } else {
        camera.left = -1.05;
        camera.right = 1.05;
        camera.top = 1.05 / aspect;
        camera.bottom = -1.05 / aspect;
      }
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // ── spatial hash grid ─────────────────────────────────────────────────
    const cell = R_MAX;
    const gridDim = Math.ceil((2 * WORLD) / cell);
    const cellOf = (gx: number, gy: number) =>
      ((gx + gridDim) % gridDim) * gridDim + ((gy + gridDim) % gridDim);
    const heads = new Int32Array(gridDim * gridDim);
    const next = new Int32Array(N);

    const wrap = (v: number) => {
      if (v > WORLD) return v - 2 * WORLD;
      if (v < -WORLD) return v + 2 * WORLD;
      return v;
    };

    // per-species clustering accumulators (reused each frame)
    const speciesNeighbors = new Float32Array(S);
    const speciesCount = new Int32Array(S);

    let raf = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);

      const pos = posRef.current;
      const vel = velRef.current;
      const type = typeRef.current;
      const m = matrixRef.current;

      // build grid
      heads.fill(-1);
      for (let i = 0; i < N; i++) {
        const gx = Math.floor((pos[i * 2] + WORLD) / cell);
        const gy = Math.floor((pos[i * 2 + 1] + WORLD) / cell);
        const c = cellOf(gx, gy);
        next[i] = heads[c];
        heads[c] = i;
      }

      speciesNeighbors.fill(0);
      speciesCount.fill(0);

      const rMinAbs = R_MIN; // fraction
      // integrate forces
      for (let i = 0; i < N; i++) {
        const xi = pos[i * 2];
        const yi = pos[i * 2 + 1];
        const ti = type[i];
        let fx = 0;
        let fy = 0;
        let nearSame = 0;

        const gx = Math.floor((xi + WORLD) / cell);
        const gy = Math.floor((yi + WORLD) / cell);

        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            let j = heads[cellOf(gx + ox, gy + oy)];
            while (j !== -1) {
              if (j !== i) {
                let dx = pos[j * 2] - xi;
                let dy = pos[j * 2 + 1] - yi;
                // toroidal wrap on shortest path
                if (dx > WORLD) dx -= 2 * WORLD;
                else if (dx < -WORLD) dx += 2 * WORLD;
                if (dy > WORLD) dy -= 2 * WORLD;
                else if (dy < -WORLD) dy += 2 * WORLD;
                const d2 = dx * dx + dy * dy;
                if (d2 > 0 && d2 < R_MAX * R_MAX) {
                  const d = Math.sqrt(d2);
                  const rn = d / R_MAX;
                  let f: number;
                  if (rn < rMinAbs) {
                    // hard short-range repulsion (universal)
                    f = rn / rMinAbs - 1;
                  } else {
                    // attraction governed by asymmetric matrix
                    const a = m[ti * S + type[j]];
                    f = a * (1 - Math.abs(2 * rn - 1 - rMinAbs) / (1 - rMinAbs));
                  }
                  fx += (dx / d) * f;
                  fy += (dy / d) * f;
                  if (type[j] === ti) nearSame++;
                }
              }
              j = next[j];
            }
          }
        }

        // stir (light touch)
        const stir = stirRef.current;
        if (stir.active) {
          const sx = stir.x - xi;
          const sy = stir.y - yi;
          const sd2 = sx * sx + sy * sy;
          if (sd2 < 0.09) {
            const sd = Math.sqrt(sd2) + 1e-4;
            const sf = (1 - sd / 0.3) * 1.6;
            fx -= (sx / sd) * sf;
            fy -= (sy / sd) * sf;
          }
        }

        vel[i * 2] = vel[i * 2] * FRICTION + fx * FORCE * DT * R_MAX * 60;
        vel[i * 2 + 1] = vel[i * 2 + 1] * FRICTION + fy * FORCE * DT * R_MAX * 60;

        speciesNeighbors[ti] += nearSame;
        speciesCount[ti]++;
      }

      // apply velocity + wrap, write render buffers
      for (let i = 0; i < N; i++) {
        let x = pos[i * 2] + vel[i * 2] * DT;
        let y = pos[i * 2 + 1] + vel[i * 2 + 1] * DT;
        x = wrap(x);
        y = wrap(y);
        pos[i * 2] = x;
        pos[i * 2 + 1] = y;

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = 0;

        const t = type[i];
        const c = SPECIES_RGB[t];
        // brighten color of clustered species via audio level (set below, prev frame)
        const lvl = audioRef.current ? audioRef.current.voices[t].level : 0.3;
        const b = 0.45 + 0.85 * lvl;
        colors[i * 3] = c[0] * b;
        colors[i * 3 + 1] = c[1] * b;
        colors[i * 3 + 2] = c[2] * b;
      }
      geom.attributes.position.needsUpdate = true;
      geom.attributes.color.needsUpdate = true;

      // ── sonify: per-species clustering → voice ─────────────────────────────
      const audio = audioRef.current;
      if (audio) {
        const tNow = audio.ctx.currentTime;
        for (let s = 0; s < S; s++) {
          // average same-species neighbors per particle → normalized clustering
          const avg =
            speciesCount[s] > 0 ? speciesNeighbors[s] / speciesCount[s] : 0;
          // typical avg ranges ~0..8 when clumped; normalize
          const target = Math.min(1, avg / 6);
          const v = audio.voices[s];
          // exponential moving average so it breathes, not flickers
          v.level += (target - v.level) * 0.06;
          const lvl = v.level;
          const g = 0.0001 + lvl * lvl * 0.22; // squared → quiet when dispersed
          const cutoff = 220 + lvl * 2600;
          v.gain.gain.setTargetAtTime(g, tNow, 0.12);
          v.filter.frequency.setTargetAtTime(cutoff, tNow, 0.15);
        }
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);

    // ── pointer stir ─────────────────────────────────────────────────────────
    const el = renderer.domElement;
    const toWorld = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
      const aspect = rect.width / rect.height;
      stirRef.current.x = aspect >= 1 ? nx * 1.05 * aspect : nx * 1.05;
      stirRef.current.y = aspect >= 1 ? ny * 1.05 : (ny * 1.05) / aspect;
    };
    const onDown = (e: PointerEvent) => {
      stirRef.current.active = true;
      toWorld(e.clientX, e.clientY);
    };
    const onMove = (e: PointerEvent) => {
      if (stirRef.current.active) toWorld(e.clientX, e.clientY);
    };
    const onUp = () => {
      stirRef.current.active = false;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      geom.dispose();
      material.dispose();
      renderer.dispose();
      if (el.parentNode === mount) mount.removeChild(el);
    };
  }, [reseed]);

  // ── teardown audio on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        try {
          a.master.gain.cancelScheduledValues(a.ctx.currentTime);
          a.voices.forEach((v) => {
            v.oscA.stop();
            v.oscB.stop();
          });
          a.ctx.close();
        } catch {
          /* noop */
        }
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05060a] text-white">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {!supported && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-rose-300">
            WebGL is unavailable in this browser, so the particle field cannot
            render. Try a recent desktop browser with hardware acceleration
            enabled.
          </p>
        </div>
      )}

      {/* corner UI */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 max-w-md p-5 sm:p-6">
        <h1 className="font-serif text-2xl text-white/95">
          Particle Life Song
        </h1>
        <p className="mt-2 text-base text-white/75">
          Thousands of particles self-organize into living clusters. Each
          species has a voice that blooms as its swarm condenses — the music is
          the emergence.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2">
          {!started ? (
            <button
              onClick={start}
              className="rounded-lg bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-300 ring-1 ring-violet-400/40 transition-colors hover:bg-violet-500/30"
            >
              Start
            </button>
          ) : (
            <span className="rounded-lg bg-emerald-500/15 px-4 py-2.5 text-base text-emerald-300/95">
              Listening to world #{regime}
            </span>
          )}
          <button
            onClick={newWorld}
            className="rounded-lg bg-white/[0.06] px-4 py-2.5 text-base font-medium text-white/85 ring-1 ring-white/15 transition-colors hover:bg-white/[0.12]"
          >
            New world
          </button>
        </div>

        <p className="mt-3 text-sm text-white/55">
          Drag across the field to stir the particles.{" "}
          <Link
            href="/dream/236-particle-life-song/README.md"
            className="underline decoration-white/30 underline-offset-2 hover:text-white/75"
          >
            Read the design notes
          </Link>
        </p>
      </div>

      {/* species legend */}
      <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex flex-col gap-1">
        {SPECIES_RGB.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-white/55">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: `rgb(${c[0] * 255},${c[1] * 255},${c[2] * 255})`,
              }}
            />
            <span className="font-mono">
              {["C", "D", "E", "G", "A"][i]}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
