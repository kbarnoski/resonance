"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  createSwarm,
  reseed,
  stepSwarm,
  countClusters,
  MU_G_MIN,
  MU_G_MAX,
  MU_G_DEFAULT,
  type Swarm,
} from "./lenia";

const PARTICLE_COUNT = 340;
const SUBSTEPS = 2;
const SEED_SPREAD = 3.0;
const MAX_VOICES = 5;

// ---------------------------------------------------------------------------
// Granular / spectral self-playing drone. Consonant just-intonation chord bed
// whose voices bloom as the swarm splits, over a look-ahead grain cloud whose
// density and brightness track the field's reorganization energy.
// ---------------------------------------------------------------------------

interface Telemetry {
  meanRadius: number;
  kinetic: number;
  radiusStd: number;
  clusterCount: number;
}

// just-intonation stack: root, fifth, octave, twelfth, major-tenth
const VOICE_RATIOS = [1, 1.5, 2, 3, 2.5];
const GRAIN_RATIOS = [1, 1.5, 2, 2.5, 3, 4];

interface AudioEngine {
  start: () => void;
  update: (t: Telemetry, dt: number) => void;
  stop: () => void;
  dispose: () => void;
}

function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      data[i] = (Math.random() * 2 - 1) * decay;
    }
  }
  return buf;
}

function createAudioEngine(ctx: AudioContext): AudioEngine {
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 600;
  lowpass.Q.value = 0.4;

  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  const wet = ctx.createGain();
  wet.gain.value = 0.42;
  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 3.0);

  lowpass.connect(dry).connect(master);
  lowpass.connect(reverb).connect(wet).connect(master);

  const bus = ctx.createGain();
  bus.gain.value = 0.9;
  bus.connect(lowpass);

  // pad bank. Signal per voice: osc pair -> breathGain (slow tremolo) ->
  // voiceGain (the activation gate) -> bus. Breath multiplies the gate so an
  // inactive voice is truly silent.
  const voiceGains: GainNode[] = [];
  const oscA: OscillatorNode[] = [];
  const oscB: OscillatorNode[] = [];
  const lfos: OscillatorNode[] = [];
  const constants: ConstantSourceNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const vg = ctx.createGain();
    vg.gain.value = 0.0001; // gate: raised only when this voice is active
    vg.connect(bus);

    const breath = ctx.createGain();
    breath.gain.value = 0; // driven entirely by base ConstantSource + LFO below
    breath.connect(vg);

    const a = ctx.createOscillator();
    a.type = "sine";
    const b = ctx.createOscillator();
    b.type = "sine";
    b.detune.value = 7;
    a.connect(breath);
    b.connect(breath);

    // slow breathing modulates breath.gain around 0.7 (multiplies the gate)
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.017;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.3;
    const base = ctx.createConstantSource();
    base.offset.value = 0.7;
    lfo.connect(lfoGain).connect(breath.gain);
    base.connect(breath.gain);

    a.start();
    b.start();
    lfo.start();
    base.start();
    voiceGains.push(vg);
    oscA.push(a);
    oscB.push(b);
    lfos.push(lfo);
    constants.push(base);
  }

  // shimmer partial (membrane sharpness)
  const shimmer = ctx.createOscillator();
  shimmer.type = "triangle";
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.0001;
  shimmer.connect(shimmerGain).connect(bus);
  shimmer.start();

  let root = 90;
  let energy = 0;
  let sharp = 0;
  let voicesActive = 1;
  let nextGrain = 0;
  let stopped = false;
  let running = false;
  const liveGrains = new Set<OscillatorNode>();

  function scheduleGrains(now: number) {
    if (!running || stopped) return;
    const density = 2.5 + energy * 22; // grains / second
    const interval = 1 / density;
    const horizon = now + 0.16;
    while (nextGrain < horizon) {
      if (nextGrain < now) nextGrain = now;
      const ratio = GRAIN_RATIOS[(Math.random() * GRAIN_RATIOS.length) | 0];
      // brighter (higher octave) as the membrane sharpens / energy rises
      const octave = Math.random() < 0.25 + sharp * 0.5 ? 2 : 1;
      const freq = root * ratio * octave * (1 + (Math.random() - 0.5) * 0.01);
      const dur = 0.12 + Math.random() * 0.18;
      const g = ctx.createGain();
      const level = 0.05 + energy * 0.06;
      g.gain.setValueAtTime(0.0001, nextGrain);
      g.gain.exponentialRampToValueAtTime(level, nextGrain + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, nextGrain + dur);
      const o = ctx.createOscillator();
      o.type = octave > 1 ? "triangle" : "sine";
      o.frequency.value = freq;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 2 - 1;
      o.connect(g).connect(pan).connect(bus);
      o.start(nextGrain);
      o.stop(nextGrain + dur + 0.05);
      liveGrains.add(o);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
        pan.disconnect();
        liveGrains.delete(o);
      };
      nextGrain += interval * (0.7 + Math.random() * 0.6);
    }
  }

  return {
    start() {
      if (ctx.state === "suspended") void ctx.resume();
      running = true;
      nextGrain = ctx.currentTime + 0.1;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2.5);
    },
    update(t: Telemetry, dt: number) {
      if (!running || stopped) return;
      const now = ctx.currentTime;
      // smooth telemetry
      const targetRoot = Math.min(
        132,
        Math.max(46, 112 * Math.pow(2, -(t.meanRadius - 5) / 7)),
      );
      const targetEnergy = Math.min(1, Math.sqrt(Math.max(0, t.kinetic)) * 1.05);
      const targetSharp = Math.min(1, t.radiusStd / 2.2);
      root += (targetRoot - root) * Math.min(1, dt * 1.5);
      energy += (targetEnergy - energy) * Math.min(1, dt * 3);
      sharp += (targetSharp - sharp) * Math.min(1, dt * 2);
      voicesActive = Math.max(1, Math.min(MAX_VOICES, Math.round(t.clusterCount)));

      // pad
      for (let i = 0; i < MAX_VOICES; i++) {
        const f = root * VOICE_RATIOS[i];
        oscA[i].frequency.setTargetAtTime(f, now, 0.25);
        oscB[i].frequency.setTargetAtTime(f, now, 0.25);
        const level = i < voicesActive ? 0.14 : 0.0001;
        voiceGains[i].gain.setTargetAtTime(level, now, 1.4);
      }
      shimmer.frequency.setTargetAtTime(root * 8, now, 0.3);
      shimmerGain.gain.setTargetAtTime(0.0001 + sharp * 0.05, now, 0.6);

      lowpass.frequency.setTargetAtTime(320 + energy * 3800, now, 0.3);
      scheduleGrains(now);
    },
    stop() {
      running = false;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    },
    dispose() {
      stopped = true;
      running = false;
      try {
        for (const o of [...oscA, ...oscB, ...lfos, shimmer]) o.stop();
        for (const c of constants) c.stop();
        for (const o of liveGrains) o.stop();
      } catch {
        // already stopped
      }
    },
  };
}

// ---------------------------------------------------------------------------

const REGIMES = [
  { key: "1", label: "single cell", muG: 0.58, spread: 3.0 },
  { key: "2", label: "dividing colony", muG: 0.95, spread: 3.4 },
  { key: "3", label: "hollow vacuole", muG: 0.4, spread: 3.2 },
];

export default function MitosisPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState({ cells: 1, muG: MU_G_DEFAULT, regime: "single cell" });

  const engineRef = useRef<AudioEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const pausedRef = useRef(false);
  const muGTargetRef = useRef(MU_G_DEFAULT);
  const regimeRef = useRef("single cell");
  const swarmRef = useRef<Swarm | null>(null);
  const reseedRef = useRef<((spread: number) => void) | null>(null);

  const applyRegime = useCallback((muG: number, spread: number, label: string) => {
    muGTargetRef.current = muG;
    regimeRef.current = label;
    reseedRef.current?.(spread);
  }, []);

  const nudgeMuG = useCallback((delta: number) => {
    muGTargetRef.current = Math.min(
      MU_G_MAX,
      Math.max(MU_G_MIN, muGTargetRef.current + delta),
    );
    regimeRef.current = "morphing";
  }, []);

  const handleStart = useCallback(() => {
    if (started) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const engine = createAudioEngine(ctx);
      engine.start();
      engineRef.current = engine;
    } catch {
      // audio unavailable — visuals still run
    }
    setStarted(true);
  }, [started]);

  // three.js scene + simulation loop
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    } catch {
      setWebglError(true);
      return;
    }
    if (!renderer.getContext()) {
      setWebglError(true);
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    renderer.setClearColor(0x04010a, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    camera.position.set(0, 0, 10);

    const swarm = createSwarm(PARTICLE_COUNT, SEED_SPREAD, MU_G_DEFAULT);
    swarmRef.current = swarm;
    reseedRef.current = (spread: number) =>
      reseed(swarm, spread, muGTargetRef.current);

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const glows = new Float32Array(PARTICLE_COUNT);
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aGlow", new THREE.BufferAttribute(glows, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uSize: { value: 0.95 },
        uWorldToPixel: { value: 100 },
        uCool: { value: new THREE.Color(0.34, 0.11, 0.78) },
        uMid: { value: new THREE.Color(0.96, 0.24, 0.86) },
        uHot: { value: new THREE.Color(1.0, 0.86, 0.74) },
      },
      vertexShader: `
        uniform float uSize;
        uniform float uWorldToPixel;
        attribute float aGlow;
        varying float vGlow;
        void main() {
          vGlow = aGlow;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uSize * uWorldToPixel, 2.0, 90.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vGlow;
        uniform vec3 uCool;
        uniform vec3 uMid;
        uniform vec3 uHot;
        void main() {
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a = pow(a, 1.6);
          vec3 col = mix(uCool, uMid, smoothstep(0.0, 0.55, vGlow));
          col = mix(col, uHot, smoothstep(0.55, 1.0, vGlow));
          float core = smoothstep(0.16, 0.0, d) * vGlow;
          col += uHot * core * 0.7;
          gl_FragColor = vec4(col, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    scene.add(points);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.15, // strength
      0.6, // radius
      0.0, // threshold
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    let viewRadius = SEED_SPREAD * 2;

    function resize() {
      if (!mount) return;
      width = mount.clientWidth || window.innerWidth;
      height = mount.clientHeight || window.innerHeight;
      renderer.setSize(width, height);
      composer.setSize(width, height);
      bloom.setSize(width, height);
    }
    window.addEventListener("resize", resize);
    resize();

    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const glowAttr = geometry.getAttribute("aGlow") as THREE.BufferAttribute;

    let raf = 0;
    let prev = performance.now();
    let frame = 0;

    function loop() {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      // ease live mu_g toward its target for smooth morphs
      swarm.muG += (muGTargetRef.current - swarm.muG) * Math.min(1, dt * 1.2);

      if (!pausedRef.current) {
        stepSwarm(swarm, SUBSTEPS);
        if (frame % 8 === 0) countClusters(swarm);
        frame++;
      }

      // upload positions (recentred on the swarm centroid) + glow
      const cx = swarm.centroidX;
      const cy = swarm.centroidY;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions[i * 3] = swarm.px[i] - cx;
        positions[i * 3 + 1] = swarm.py[i] - cy;
        positions[i * 3 + 2] = 0;
        glows[i] = swarm.glow[i];
      }
      posAttr.needsUpdate = true;
      glowAttr.needsUpdate = true;

      // frame the swarm
      const targetView = Math.min(24, Math.max(4.5, swarm.extent * 1.25));
      viewRadius += (targetView - viewRadius) * Math.min(1, dt * 1.5);
      const aspect = width / Math.max(1, height);
      const halfH = viewRadius;
      const halfW = viewRadius * aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
      material.uniforms.uWorldToPixel.value =
        renderer.domElement.height / (2 * viewRadius);

      composer.render();

      engineRef.current?.update(
        {
          meanRadius: swarm.meanRadius,
          kinetic: swarm.kinetic,
          radiusStd: swarm.radiusStd,
          clusterCount: swarm.clusterCount,
        },
        dt,
      );

      if (frame % 12 === 0) {
        setHud({
          cells: swarm.clusterCount,
          muG: swarm.muG,
          regime: regimeRef.current,
        });
      }
    }
    loop();

    function onKey(e: KeyboardEvent) {
      switch (e.key) {
        case " ":
          e.preventDefault();
          pausedRef.current = !pausedRef.current;
          break;
        case "r":
        case "R":
          reseedRef.current?.(SEED_SPREAD);
          regimeRef.current = "reborn";
          break;
        case "ArrowUp":
          e.preventDefault();
          nudgeMuG(0.04);
          break;
        case "ArrowDown":
          e.preventDefault();
          nudgeMuG(-0.04);
          break;
        case "1":
        case "2":
        case "3": {
          const r = REGIMES.find((x) => x.key === e.key);
          if (r) applyRegime(r.muG, r.spread, r.label);
          break;
        }
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      geometry.dispose();
      material.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      swarmRef.current = null;
      reseedRef.current = null;
    };
  }, [applyRegime, nudgeMuG]);

  // audio teardown on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current?.dispose();
      engineRef.current = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, []);

  if (webglError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8">
        <div className="max-w-md rounded-lg border border-border bg-background p-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Mitosis
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This piece needs WebGL to render its luminous protoplasm, and your
            browser could not provide a WebGL context. Try a hardware-accelerated
            browser to watch the cell divide.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <div ref={mountRef} className="absolute inset-0" />

      {/* top-right chrome */}
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* HUD + legend, shown once running */}
      {started && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 space-y-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>cells {hud.cells}</span>
            <span>mu_g {hud.muG.toFixed(2)}</span>
            <span>{hud.regime}</span>
          </div>
          <div className="font-mono text-xs text-muted-foreground/80">
            space pause · R rebirth · up/down split↔merge · 1 2 3 regimes
          </div>
        </div>
      )}

      {/* title card / start gate */}
      {!started && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
          <div className="max-w-lg rounded-lg border border-border bg-background/90 p-8 shadow-lg">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream lab · particle lenia
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Mitosis
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A swarm of continuous cellular automata organizes into a living cell
              membrane that pinches, divides and re-merges — sonified as a
              self-playing granular drone that swells a new voice each time it
              splits.
            </p>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Keys
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Space pause · R rebirth · ↑/↓ push between one blob and many cells ·
              1 / 2 / 3 regime jumps
            </p>
            <button
              onClick={handleStart}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start
            </button>
          </div>
        </div>
      )}

      {/* design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The swarm is <span className="text-foreground">Particle Lenia</span>{" "}
              (Alexander Mordvintsev, 2023) — a few hundred particles descending an
              energy field built from a long-range attraction kernel, a growth
              bell and short-range repulsion. Balanced, they crystallize into a
              hollow cell with a bright membrane.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              The growth centre <span className="font-mono text-xs">mu_g</span> is
              live: nudge it up and the membrane loses cohesion and buds into
              several small cells (mitosis); nudge it down and it swells into one
              big vacuole. The camera tracks the swarm centroid and{" "}
              <span className="text-foreground">UnrealBloom</span> gives it the
              volumetric glow.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Sound: cluster count sets how many just-intonation drone voices sing,
              field energy opens the filter and thickens the grain cloud, mean cell
              radius glides the root pitch, and membrane sharpness adds shimmer.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
