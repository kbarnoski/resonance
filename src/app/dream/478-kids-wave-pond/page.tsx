"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";

// ── FDTD grid constants ──────────────────────────────────────────────────────
// 64×64 node 2-D Digital Waveguide Mesh.
// Van Duyne & Smith, "Physical Modeling with the 2-D Digital Waveguide Mesh," ICMC 1993.
const GRID = 64;
const GRID_TOTAL = GRID * GRID;

// Courant number c (stable iff c ≤ 1/√2 ≈ 0.707 for 2-D FDTD with Δt=Δx=1).
// c = 0.35 → clean propagation with safe margin and good visual wave speed.
const C_WAVE = 0.35;
const C2 = C_WAVE * C_WAVE;

// Per-step damping (very light → waves ring for several seconds, settling gently).
const DAMP = 0.0015;

// Pickup cell — off-centre to avoid modal nulls.
const PICKUP_I = 27;
const PICKUP_J = 38;

// C-major pentatonic: C4 D4 E4 G4 A4 for tonal pickup synthesis.
const PENTA_HZ = [261.63, 293.66, 329.63, 392.0, 440.0];

// Ambient pad root — C3 (Lydian warmth above).
const AMBIENT_ROOT_HZ = 130.815;

// Three.js world size of the pond plane.
const PLANE_SIZE = 4.0;

// Auto-demo ripple schedule: {t seconds, normI/J 0..1, amp}.
const AUTO_DEMO_SCHEDULE: Array<{ t: number; ni: number; nj: number; amp: number }> = [
  { t: 0.4,  ni: 0.35, nj: 0.40, amp: 0.55 },
  { t: 1.1,  ni: 0.65, nj: 0.60, amp: 0.48 },
  { t: 1.9,  ni: 0.50, nj: 0.25, amp: 0.42 },
  { t: 2.6,  ni: 0.30, nj: 0.70, amp: 0.52 },
];

// ── Inline AudioWorklet source ───────────────────────────────────────────────
// The worklet owns the 64×64 FDTD grid, steps it at audio rate, reads the
// pickup cell as the output sample, and posts the field to main thread ~30×/s.
const WORKLET_SRC = `
const GRID = 64;
const G2   = GRID * GRID;
const C2   = 0.35 * 0.35;
const DAMP = 0.0015;
const PI   = 27; // PICKUP_I
const PJ   = 38; // PICKUP_J
const PIDX = PI * GRID + PJ;

class WaveMeshProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._u    = new Float32Array(G2);
    this._uPrv = new Float32Array(G2);
    this._uNxt = new Float32Array(G2);
    this._inj  = [];
    this._fc   = 0;
    this._post = Math.round((sampleRate || 44100) / 30);
    this.port.onmessage = (e) => {
      if (e.data.type === 'inj') this._inj.push(e.data);
    };
  }

  process(_ins, outs, _params) {
    const out = outs[0][0];
    if (!out) return true;
    const n = out.length;
    const u = this._u, p = this._uPrv, x = this._uNxt;

    while (this._inj.length) {
      const q  = this._inj.shift();
      const ci = q.ci | 0, cj = q.cj | 0;
      const amp = q.amp, r = q.r | 0, r2 = r * r;
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          const ni = ci + di, nj = cj + dj;
          if (ni < 1 || ni >= GRID-1 || nj < 1 || nj >= GRID-1) continue;
          const d2 = di*di + dj*dj;
          if (d2 > r2) continue;
          const w = amp * Math.exp(-3*d2/r2);
          const idx = ni*GRID + nj;
          u[idx] += w;
          p[idx] += w * 0.5;
        }
      }
    }

    for (let s = 0; s < n; s++) {
      for (let i = 1; i < GRID-1; i++) {
        const row = i * GRID;
        for (let j = 1; j < GRID-1; j++) {
          const k = row + j;
          const lap = u[k+GRID] + u[k-GRID] + u[k+1] + u[k-1] - 4*u[k];
          x[k] = (2 - DAMP)*u[k] - (1 - DAMP)*p[k] + C2*lap;
        }
      }
      p.set(u); u.set(x);
      const raw = u[PIDX];
      out[s] = (raw > 1 ? 1 : raw < -1 ? -1 : raw) * 0.6;
      this._fc++;
    }

    if ((this._fc % this._post) < n) {
      this.port.postMessage({ type:'field', buf: u.slice(0) });
    }
    return true;
  }
}
registerProcessor('wave-mesh-proc', WaveMeshProcessor);
`;

// ── ScriptProcessor fallback (identical FDTD, runs on main thread) ───────────
type InjectFn = (ci: number, cj: number, amp: number, r: number) => void;

interface FallbackNode {
  node: ScriptProcessorNode;
  inject: InjectFn;
}

function buildScriptFallback(ctx: AudioContext, onField: (f: Float32Array<ArrayBufferLike>) => void): FallbackNode {
  const u    = new Float32Array(GRID_TOTAL);
  const uPrv = new Float32Array(GRID_TOTAL);
  const uNxt = new Float32Array(GRID_TOTAL);
  const pending: Array<{ ci: number; cj: number; amp: number; r: number }> = [];
  let fc = 0;
  const postEvery = Math.round(ctx.sampleRate / 30);

  const node = ctx.createScriptProcessor(2048, 0, 1);
  node.onaudioprocess = (e) => {
    const out = e.outputBuffer.getChannelData(0);
    const n   = out.length;
    const todo = pending.splice(0);
    for (const q of todo) {
      const { ci, cj, amp, r } = q;
      const r2 = r * r;
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          const ni = ci + di, nj = cj + dj;
          if (ni < 1 || ni >= GRID - 1 || nj < 1 || nj >= GRID - 1) continue;
          const d2 = di * di + dj * dj;
          if (d2 > r2) continue;
          const w = amp * Math.exp((-3 * d2) / r2);
          const idx = ni * GRID + nj;
          u[idx]    += w;
          uPrv[idx] += w * 0.5;
        }
      }
    }
    for (let s = 0; s < n; s++) {
      for (let i = 1; i < GRID - 1; i++) {
        const row = i * GRID;
        for (let j = 1; j < GRID - 1; j++) {
          const k = row + j;
          const lap = u[k + GRID] + u[k - GRID] + u[k + 1] + u[k - 1] - 4 * u[k];
          uNxt[k] = (2 - DAMP) * u[k] - (1 - DAMP) * uPrv[k] + C2 * lap;
        }
      }
      uPrv.set(u);
      u.set(uNxt);
      const raw = u[PICKUP_I * GRID + PICKUP_J];
      out[s] = (raw > 1 ? 1 : raw < -1 ? -1 : raw) * 0.6;
      fc++;
    }
    if ((fc % postEvery) < n) onField(u.slice(0));
  };

  return {
    node,
    inject: (ci, cj, amp, r) => pending.push({ ci, cj, amp, r }),
  };
}

// ── Ambient pad ──────────────────────────────────────────────────────────────
function buildPad(ctx: AudioContext, dst: GainNode): void {
  // Lydian-tinged pad: C3 E3 G3 B3 C4 — warm, consonant, never scary.
  const freqs  = [1.0, 1.25, 1.5, 1.875, 2.0].map((r) => AMBIENT_ROOT_HZ * r);
  const levels = [0.030, 0.020, 0.022, 0.014, 0.010];
  freqs.forEach((f, k) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(levels[k], ctx.currentTime, 1.5);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08 + k * 0.02;
    const lg = ctx.createGain();
    lg.gain.value = f * 0.003;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    osc.connect(g).connect(dst);
    osc.start();
    lfo.start();
  });
}

// ── Pickup tone synth ────────────────────────────────────────────────────────
interface ToneSynth {
  osc: OscillatorNode;
  env: GainNode;
}
function buildToneSynth(ctx: AudioContext, dst: GainNode): ToneSynth {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = PENTA_HZ[0];
  const env = ctx.createGain();
  env.gain.value = 0;
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 3200;
  osc.connect(env).connect(lpf).connect(dst);
  osc.start();
  return { osc, env };
}

// ── Displacement → luminous water color ─────────────────────────────────────
function dispToColor(d: number, out: THREE.Color): void {
  const t = ((d > 1 ? 1 : d < -1 ? -1 : d) + 1) * 0.5; // 0=trough 1=crest
  if (t > 0.5) {
    const u = (t - 0.5) * 2;
    out.setRGB(0.06 + u * 0.84, 0.12 + u * 0.78, 0.35 + u * 0.55);
  } else {
    const u = t * 2;
    out.setRGB(0.04 + u * 0.02, 0.0 + u * 0.12, 0.18 + u * 0.17);
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function KidsWavePond() {
  const mountRef    = useRef<HTMLDivElement>(null);
  const [started,   setStarted]   = useState(false);
  const [glFailed,  setGlFailed]  = useState(false);
  const [fallback,  setFallback]  = useState(false);
  const cleanupRef  = useRef<(() => void) | null>(null);
  const injectRef   = useRef<((normI: number, normJ: number, amp?: number) => void) | null>(null);
  // Store AudioContext in a ref so the useEffect can access it after React re-render
  const actxRef     = useRef<AudioContext | null>(null);
  // Ref to stopAutoDemo — set by async setup, called by pointer handlers
  const stopDemoRef = useRef<(() => void) | null>(null);

  // Step 1: user gesture handler — create AudioContext here (iOS unlock).
  const handleStart = useCallback(async () => {
    if (started) return;
    const Ctor = (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ) as typeof AudioContext;
    const actx = new Ctor();
    if (actx.state === "suspended") await actx.resume();
    actxRef.current = actx;
    setStarted(true); // triggers re-render → mount div appears → useEffect runs
  }, [started]);

  // Step 2: after DOM renders the mount div, set up Three.js + FDTD.
  useEffect(() => {
    if (!started) return;
    const mount = mountRef.current;
    const actx  = actxRef.current;
    if (!mount || !actx) return;

    // ── Audio master chain ─────────────────────────────────────────────────
    const masterGain = actx.createGain();
    masterGain.gain.value = 0;
    masterGain.gain.setTargetAtTime(0.75, actx.currentTime, 0.3);

    const lpf9k = actx.createBiquadFilter();
    lpf9k.type = "lowpass";
    lpf9k.frequency.value = 9000; // kids-safe high-frequency roll-off
    lpf9k.Q.value = 0.5;

    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 8;
    comp.ratio.value = 10;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;

    masterGain.connect(lpf9k);
    lpf9k.connect(comp);
    comp.connect(actx.destination);

    buildPad(actx, masterGain);
    const { osc: toneOsc, env: toneEnv } = buildToneSynth(actx, masterGain);

    // ── Shared field (written by audio thread, read by render loop) ─────────
    let sharedField: Float32Array<ArrayBufferLike> = new Float32Array(GRID_TOTAL);
    let fieldDirty  = false;

    const onField = (f: Float32Array<ArrayBufferLike>) => {
      sharedField = f;
      fieldDirty  = true;

      // Drive pentatonic tone from pickup-area energy
      let energy = 0, cnt = 0;
      const PR = 4;
      for (let di = -PR; di <= PR; di++) {
        for (let dj = -PR; dj <= PR; dj++) {
          const ni = PICKUP_I + di, nj = PICKUP_J + dj;
          if (ni < 0 || ni >= GRID || nj < 0 || nj >= GRID) continue;
          energy += Math.abs(f[ni * GRID + nj]);
          cnt++;
        }
      }
      energy /= Math.max(1, cnt);
      const fi   = Math.min(PENTA_HZ.length - 1, Math.floor(energy * PENTA_HZ.length * 2));
      const freq = PENTA_HZ[fi];
      toneOsc.frequency.setTargetAtTime(freq, actx.currentTime, 0.05);
      toneEnv.gain.setTargetAtTime(Math.min(0.18, energy * 0.5), actx.currentTime, 0.03);
    };

    // ── FDTD audio node (worklet → fallback) ──────────────────────────────
    let rawInject: InjectFn = () => { /* overwritten in asyncSetup */ };
    let fdtdNode: AudioNode | null = null;

    const tryWorklet = async () => {
      const blob = new Blob([WORKLET_SRC], { type: "application/javascript" });
      const url  = URL.createObjectURL(blob);
      try {
        await actx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const wn = new AudioWorkletNode(actx, "wave-mesh-proc", {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
      });
      wn.port.onmessage = (e) => {
        if (e.data.type === "field") onField(e.data.buf as Float32Array<ArrayBufferLike>);
      };
      rawInject = (ci, cj, amp, r) =>
        wn.port.postMessage({ type: "inj", ci, cj, amp, r });
      return wn as AudioNode;
    };

    let setupDone = false;
    const asyncSetup = async () => {
      try {
        fdtdNode = await tryWorklet();
      } catch {
        setFallback(true);
        const fb = buildScriptFallback(actx, onField);
        fdtdNode = fb.node;
        rawInject = fb.inject;
      }
      if (!fdtdNode) return; // should never happen
      fdtdNode.connect(masterGain);

      // Wire up the public inject ref
      injectRef.current = (normI: number, normJ: number, amp = 0.6) => {
        const ci = Math.max(1, Math.min(GRID - 2, Math.round(1 + normI * (GRID - 2))));
        const cj = Math.max(1, Math.min(GRID - 2, Math.round(1 + normJ * (GRID - 2))));
        rawInject(ci, cj, amp, 3);
      };
      setupDone = true;

      // Kick off auto-demo
      const ids: ReturnType<typeof setTimeout>[] = [];
      let demoDone = false;
      const stopDemo = () => {
        if (!demoDone) { demoDone = true; ids.forEach(clearTimeout); }
      };
      stopDemoRef.current = stopDemo;
      for (const { t, ni, nj, amp } of AUTO_DEMO_SCHEDULE) {
        const id = setTimeout(() => {
          if (!demoDone && injectRef.current) injectRef.current(ni, nj, amp);
        }, t * 1000);
        ids.push(id);
      }
      ids.push(setTimeout(stopDemo, 3200));
    };

    void asyncSetup();

    // ── Three.js renderer ─────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false, alpha: false, powerPreference: "high-performance",
      });
    } catch {
      setGlFailed(true);
      return;
    }
    if (!renderer.getContext()) { setGlFailed(true); renderer.dispose(); return; }

    const SZ = Math.min(mount.clientWidth, mount.clientHeight);
    const rendSize = SZ > 0 ? SZ : Math.min(window.innerWidth, window.innerHeight) * 0.88;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(rendSize, rendSize);
    renderer.setClearColor(0x07050e, 1);
    mount.appendChild(renderer.domElement);

    // Orthographic top-down camera
    const HALF = PLANE_SIZE * 0.55;
    const cam  = new THREE.OrthographicCamera(-HALF, HALF, HALF, -HALF, 0.01, 20);
    cam.position.set(0, 8, 0);
    cam.lookAt(0, 0, 0);
    cam.up.set(0, 0, -1);

    const scene = new THREE.Scene();

    // Pond plane: GRID×GRID vertices, vertex-colored, updated each frame
    const planeGeo  = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, GRID - 1, GRID - 1);
    planeGeo.rotateX(-Math.PI / 2);

    const colArr  = new Float32Array(GRID * GRID * 3);
    const colAttr = new THREE.BufferAttribute(colArr, 3);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    planeGeo.setAttribute("color", colAttr);

    const posAttr = planeGeo.attributes.position as THREE.BufferAttribute;
    posAttr.setUsage(THREE.DynamicDrawUsage);

    const planeMat  = new THREE.MeshBasicMaterial({ vertexColors: true });
    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    scene.add(planeMesh);

    // Glowing rim ring
    const rimGeo = new THREE.RingGeometry(PLANE_SIZE * 0.5 - 0.03, PLANE_SIZE * 0.5 + 0.14, 128);
    rimGeo.rotateX(-Math.PI / 2);
    const rimMat  = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.3, 0.55, 0.95), transparent: true, opacity: 0.55,
      side: THREE.DoubleSide,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.01;
    scene.add(rimMesh);

    // Small amber dot marking the pickup cell
    const puGeo = new THREE.CircleGeometry(0.045, 24);
    puGeo.rotateX(-Math.PI / 2);
    const puMat  = new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, 0.78, 0.2), transparent: true, opacity: 0.75,
    });
    const puDot = new THREE.Mesh(puGeo, puMat);
    puDot.position.set(
      ((PICKUP_J / (GRID - 1)) - 0.5) * PLANE_SIZE,
      0.02,
      ((PICKUP_I / (GRID - 1)) - 0.5) * PLANE_SIZE
    );
    scene.add(puDot);

    // ── Vertex color update ─────────────────────────────────────────────────
    const tmpCol = new THREE.Color();
    const applyField = (field: Float32Array<ArrayBufferLike>) => {
      const cols = colAttr.array as Float32Array;
      const pos  = posAttr.array as Float32Array;
      for (let vi = 0; vi < GRID; vi++) {
        for (let vj = 0; vj < GRID; vj++) {
          const fi  = vi * GRID + vj;
          const d   = field[fi];
          dispToColor(d, tmpCol);
          cols[fi * 3]     = tmpCol.r;
          cols[fi * 3 + 1] = tmpCol.g;
          cols[fi * 3 + 2] = tmpCol.b;
          // Subtle height for depth cue
          pos[fi * 3 + 1]  = d * 0.03;
        }
      }
      colAttr.needsUpdate = true;
      posAttr.needsUpdate = true;
    };

    // ── Pointer / touch → inject ─────────────────────────────────────────────
    const domEl = renderer.domElement;
    const toNorm = (cx: number, cy: number) => {
      const r  = domEl.getBoundingClientRect();
      const nx = (cx - r.left) / r.width;
      const ny = (cy - r.top)  / r.height;
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
      return { ni: ny, nj: nx };
    };

    const onPtrDown = (e: PointerEvent) => {
      stopDemoRef.current?.();
      const p = toNorm(e.clientX, e.clientY);
      if (p && setupDone && injectRef.current) injectRef.current(p.ni, p.nj, 0.7);
    };
    const onPtrMove = (e: PointerEvent) => {
      if (e.buttons === 0) return;
      const p = toNorm(e.clientX, e.clientY);
      if (p && setupDone && injectRef.current) injectRef.current(p.ni, p.nj, 0.28);
    };
    const onTchStart = (e: TouchEvent) => {
      stopDemoRef.current?.();
      for (let k = 0; k < e.changedTouches.length; k++) {
        const t = e.changedTouches[k];
        const p = toNorm(t.clientX, t.clientY);
        if (p && setupDone && injectRef.current) injectRef.current(p.ni, p.nj, 0.7);
      }
    };
    const onTchMove = (e: TouchEvent) => {
      e.preventDefault();
      for (let k = 0; k < e.changedTouches.length; k++) {
        const t = e.changedTouches[k];
        const p = toNorm(t.clientX, t.clientY);
        if (p && setupDone && injectRef.current) injectRef.current(p.ni, p.nj, 0.24);
      }
    };
    domEl.addEventListener("pointerdown", onPtrDown);
    domEl.addEventListener("pointermove", onPtrMove);
    domEl.addEventListener("touchstart", onTchStart, { passive: false });
    domEl.addEventListener("touchmove",  onTchMove,  { passive: false });

    // ── Resize ───────────────────────────────────────────────────────────────
    const onResize = () => {
      const s = Math.min(
        mount.clientWidth  || window.innerWidth,
        mount.clientHeight || window.innerHeight
      );
      renderer.setSize(s, s);
    };
    window.addEventListener("resize", onResize);

    // ── Render loop ──────────────────────────────────────────────────────────
    let rafId   = 0;
    let rimPhase = 0;
    const renderLoop = () => {
      rafId = requestAnimationFrame(renderLoop);
      if (fieldDirty) { applyField(sharedField); fieldDirty = false; }
      rimPhase = (rimPhase + 0.022) % (Math.PI * 2);
      const pv = Math.abs(sharedField[PICKUP_I * GRID + PICKUP_J]);
      rimMat.opacity = 0.38 + 0.38 * pv + 0.1 * Math.sin(rimPhase);
      puMat.opacity  = 0.40 + 0.55 * Math.min(1, pv * 3);
      renderer.render(scene, cam);
    };
    renderLoop();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      stopDemoRef.current?.();
      domEl.removeEventListener("pointerdown", onPtrDown);
      domEl.removeEventListener("pointermove", onPtrMove);
      domEl.removeEventListener("touchstart",  onTchStart);
      domEl.removeEventListener("touchmove",   onTchMove);
      window.removeEventListener("resize", onResize);
      planeGeo.dispose(); planeMat.dispose();
      rimGeo.dispose();   rimMat.dispose();
      puGeo.dispose();    puMat.dispose();
      renderer.dispose();
      if (mount.contains(domEl)) mount.removeChild(domEl);
      toneOsc.stop();
      void actx.close();
    };

    return () => { if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; } };
  }, [started]); // re-run only when started flips to true

  return (
    <div
      className="min-h-screen flex flex-col items-center"
      style={{ background: "#0a0514" }}
    >
      {/* ── Header ── */}
      <div className="w-full max-w-2xl px-6 pt-8 pb-3 text-center">
        <h1 className="text-3xl font-bold text-foreground tracking-tight mb-2">
          Wave Pond
        </h1>
        <p className="text-foreground text-base leading-relaxed">
          Tap the glowing pond — real waves spread, bounce off the edge, and
          cross through each other. The golden dot listens and plays what it hears.
        </p>
      </div>

      {/* ── Status badges ── */}
      {fallback && (
        <p className="text-muted-foreground text-sm mb-1">
          (AudioWorklet unavailable — using fallback engine)
        </p>
      )}
      {glFailed && (
        <div
          className="rounded-xl px-6 py-4 mx-6 mb-4 text-center"
          style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.3)" }}
        >
          <p className="text-violet-300 text-base font-semibold">
            WebGL unavailable on this device
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            The wave-field audio is still running — you can hear it.
          </p>
        </div>
      )}

      {/* ── Start button (user gesture for iOS AudioContext unlock) ── */}
      {!started && (
        <div className="flex flex-col items-center mt-8">
          <button
            onClick={handleStart}
            className="px-10 py-5 rounded-2xl text-2xl font-semibold text-foreground
                       transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 100%)",
              boxShadow: "0 0 40px rgba(79,70,229,0.55)",
              minWidth: "220px",
              minHeight: "64px",
            }}
          >
            Touch the Pond
          </button>
          <p className="text-muted-foreground text-sm mt-4">
            Multi-touch works — try two taps at once.
          </p>
        </div>
      )}

      {/* ── Pond canvas (always in DOM once started so mountRef is valid) ── */}
      {started && (
        <div className="flex flex-col items-center w-full">
          <div
            ref={mountRef}
            className="relative rounded-full overflow-hidden mt-4"
            style={{
              width:     "min(88vw, 72vh)",
              height:    "min(88vw, 72vh)",
              boxShadow: "0 0 70px rgba(56,189,248,0.22), 0 0 140px rgba(79,70,229,0.18)",
              cursor:    "crosshair",
              touchAction: "none",
            }}
          />
          {!glFailed && (
            <p className="text-muted-foreground text-sm mt-4 text-center max-w-sm px-4">
              Drag to trail ripples · multi-touch for interfering waves ·
              the amber dot reads out what you hear
            </p>
          )}
        </div>
      )}

      {/* ── Design notes link ── */}
      <div className="mt-8 pb-6">
        <a
          href="#notes"
          className="text-muted-foreground text-sm underline underline-offset-4
                     hover:text-foreground transition-colors"
        >
          Read the design notes ↓
        </a>
      </div>

      {/* ── Design notes ── */}
      <section
        id="notes"
        className="w-full max-w-2xl px-6 pb-20 mt-2"
      >
        <div
          className="rounded-2xl p-6 space-y-4"
          style={{
            background: "rgba(255,255,255,0.04)",
            border:     "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <h2 className="text-xl font-semibold text-foreground">Design Notes</h2>
          <div className="space-y-3 text-muted-foreground text-sm leading-relaxed">
            <p>
              <span className="text-foreground font-medium">Core technique — FDTD wave mesh.</span>{" "}
              Every tap injects a Gaussian displacement pulse into a 64×64 grid of coupled
              cells. Each cell is updated by the discrete 2-D wave equation:{" "}
              <code className="font-mono text-violet-300 text-xs bg-muted px-1 py-0.5 rounded">
                u_next[i,j] = 2·u[i,j] − u_prev[i,j] + c²·(u[i+1,j] + u[i-1,j] + u[i,j+1] + u[i,j-1] − 4·u[i,j])
              </code>{" "}
              with Dirichlet (fixed) boundaries at the rim. Waves propagate, reflect, and
              interfere exactly as they would on a physical membrane — this is the Van Duyne
              &amp; Smith 2-D Digital Waveguide Mesh (ICMC 1993).
            </p>
            <p>
              <span className="text-foreground font-medium">Audio.</span>{" "}
              The grid runs inside an AudioWorklet at audio rate (ScriptProcessor on older
              browsers). A single &ldquo;pickup&rdquo; cell reads its displacement value as the output
              sample — you are literally hearing the field. A pentatonic tone synth tracks
              pickup energy for musical warmth; a Lydian ambient pad keeps the space alive.
              All audio passes through a 9 kHz lowpass and brick-wall dynamics compressor
              (kids-safe: no sudden loudness, no harsh transients).
            </p>
            <p>
              <span className="text-foreground font-medium">Renderer.</span>{" "}
              Three.js with a top-down OrthographicCamera. The 64×64 field array updates
              the vertex colors of a PlaneGeometry each frame — no Canvas 2D, no raw
              WebGL2, no compute shaders. Deep-indigo rest, cyan/white crests, violet
              troughs.
            </p>
            <p>
              <span className="text-foreground font-medium">Reference.</span>{" "}
              Dana C. Van Duyne &amp; Julius O. Smith III, &ldquo;Physical Modeling with the
              2-D Digital Waveguide Mesh,&rdquo; Proceedings of the International Computer Music
              Conference, 1993.
            </p>
            <p className="text-muted-foreground text-xs">
              Caveats: audio-rate grid stepping at 64×64 on a single AudioWorklet thread
              is CPU-intensive on mobile; the fallback ScriptProcessor runs on the main
              thread and may cause frame drops. Reflection boundary and damping are correct
              but untested against a physical reference membrane. Pentatonic tuning is
              approximate.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
