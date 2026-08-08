"use client";

// ── Shruti Loom ───────────────────────────────────────────────────────────────
// "What if singing a sustained pitch strung a SYMPATHETIC STRING across the
//  space — and JI-related strings physically resonate each other, so the drone
//  you build is a woven loom of coupled strings that hum in sympathy, like a
//  tanpura's jawari?"
//
// DO-VERB : Hold a steady sung pitch ~0.7s → it commits, quantized to a just-
//           intonation lattice over a fixed tonic, stringing a glowing line
//           across a 3D loom and starting a tanpura-like plucked drone that
//           rings for tens of seconds.
// SOUL    : Sympathetic coupling. Committing (or re-singing) a JI-consonant
//           string transfers energy into the strings it shares low harmonics
//           with — older strings swell and shimmer on their own, audibly and
//           visibly, and faint filaments trace the transfer.
// LONG-FORM: The lattice accumulates and its coupling graph densifies, so
//           minute 8 is a shimmering woven web of cross-talk, not minute 1's
//           lone string.
//
// INPUT  : Mic → own NSDF/MPM monophonic f0 detector (pitch.ts).
// OUTPUT : three.js woven loom of standing-wave strings + Web Audio drone bank.
// See README.md for references (tanpura jawari, La Monte Young Dream House,
// arXiv:2606.13640, sitar tarab / Hardanger fiddle sympathetic strings).

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { LoomAudio } from "./audio";
import { detectPitch } from "./pitch";
import {
  JI_RATIOS,
  OCTAVES,
  TONIC,
  cents,
  couplingWeight,
  mulberry32,
  noteLabel,
  pitchHue,
  quantizeToJI,
} from "./loom";

const SEG = 48; // segments per string (standing-wave resolution)
const HOLD_MS = 700; // sustain time before a pitch commits
const CENTS_WINDOW = 38; // steadiness window for "held"
const MAX_PAIRS = 91; // C(14,2)

interface VStr {
  id: number;
  freq: number;
  height: number;
  hue: number;
  mode: number;
  phase: number;
  omega: number;
  ax: THREE.Vector3;
  base: Float32Array;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  positions: Float32Array;
  geom: THREE.BufferGeometry;
  mat: THREE.LineBasicMaterial;
  line: THREE.Line;
  nodeA: THREE.Mesh;
  nodeB: THREE.Mesh;
  color: THREE.Color;
  energy: number; // smoothed display energy
}

interface Readout {
  note: string;
  target: string | null;
  count: number;
  elapsed: number;
}

type Phase = "idle" | "listening";

// Full lattice of concrete frequencies (degree × octave), for the virtual player.
const LATTICE: number[] = [];
for (const oct of OCTAVES) {
  for (const r of JI_RATIOS) {
    LATTICE.push(TONIC * r.ratio * Math.pow(2, oct));
  }
}

function endpoints(
  degree: number,
  octave: number,
  height: number,
): { A: THREE.Vector3; B: THREE.Vector3 } {
  const R = 3.35;
  const a1 = (degree / 12) * Math.PI * 2 + octave * 0.9;
  const a2 = a1 + Math.PI + 0.7 + degree * 0.05;
  const yA = (height - 0.5) * 3.6 + 0.55;
  const yB = (height - 0.5) * 3.6 - 0.55;
  const rA = Math.sqrt(Math.max(0.25, R * R - yA * yA));
  const rB = Math.sqrt(Math.max(0.25, R * R - yB * yB));
  return {
    A: new THREE.Vector3(rA * Math.cos(a1), yA, rA * Math.sin(a1)),
    B: new THREE.Vector3(rB * Math.cos(a2), yB, rB * Math.sin(a2)),
  };
}

export default function ShrutiLoomPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    note: "—",
    target: null,
    count: 0,
    elapsed: 0,
  });

  const mountRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const stringsRef = useRef<VStr[]>([]);
  const visMapRef = useRef<Map<number, VStr>>(new Map());
  const nodeGeoRef = useRef<THREE.IcosahedronGeometry | null>(null);
  const filamentRef = useRef<{
    geom: THREE.BufferGeometry;
    line: THREE.LineSegments;
    positions: Float32Array;
  } | null>(null);
  const starsRef = useRef<THREE.Points | null>(null);

  const audioRef = useRef<LoomAudio | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const timeBufRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  const reducedRef = useRef(false);
  const micActiveRef = useRef(false);
  const orbitRef = useRef({ az: 0.5, el: 0.32, drag: false, px: 0, py: 0 });

  // Sustain tracker + readout scratch.
  const holdRef = useRef({ hz: -1, since: 0, committed: false });
  const detRef = useRef({ hz: -1, target: null as string | null });
  const lastExciteRef = useRef(0);
  const startTimeRef = useRef(0);

  // Virtual player (seeded self-demo).
  const vpRef = useRef({ nextAt: 0, rng: mulberry32(0x8312) });

  // ── Commit a frequency: create audio voice + visual string (dedup by id) ──
  const ensureVisual = useCallback((id: number, freq: number) => {
    if (id < 0 || visMapRef.current.has(id)) return;
    const scene = sceneRef.current;
    const nodeGeo = nodeGeoRef.current;
    if (!scene || !nodeGeo) return;

    const q = quantizeToJI(freq);
    const { A, B } = endpoints(q.degree, q.octave, q.height);
    const ax = new THREE.Vector3().subVectors(B, A).normalize();
    let p1 = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0));
    if (p1.lengthSq() < 1e-4) p1 = new THREE.Vector3(1, 0, 0);
    p1.normalize();
    const p2 = new THREE.Vector3().crossVectors(ax, p1).normalize();

    const n = SEG + 1;
    const base = new Float32Array(n * 3);
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const s = i / SEG;
      const x = A.x + (B.x - A.x) * s;
      const y = A.y + (B.y - A.y) * s;
      const z = A.z + (B.z - A.z) * s;
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const hue = pitchHue(q.height);
    const color = new THREE.Color();
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geom, mat);
    scene.add(line);

    const nodeMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const nodeA = new THREE.Mesh(nodeGeo, nodeMat);
    const nodeB = new THREE.Mesh(nodeGeo, nodeMat.clone());
    nodeA.position.copy(A);
    nodeB.position.copy(B);
    scene.add(nodeA);
    scene.add(nodeB);

    const v: VStr = {
      id,
      freq,
      height: q.height,
      hue,
      mode: 1 + (q.degree % 2),
      phase: (q.degree * 0.7 + q.octave) % (Math.PI * 2),
      omega: 0.45 + (q.degree % 5) * 0.14,
      ax,
      base,
      p1,
      p2,
      positions,
      geom,
      mat,
      line,
      nodeA,
      nodeB,
      color,
      energy: 1,
    };
    stringsRef.current.push(v);
    visMapRef.current.set(id, v);
  }, []);

  const commit = useCallback(
    (freq: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const id = audio.addString(freq);
      ensureVisual(id, freq);
    },
    [ensureVisual],
  );

  // ── Virtual player: seeded consonant weaving (self-demo) ──
  const runVirtualStep = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const rng = vpRef.current.rng;
    const snap = audio.snapshot();

    // Once the loom is full-ish, stop adding and instead re-excite consonant
    // strings so the sympathetic swells keep evolving over the long form.
    if (snap.length >= 9) {
      const s = snap[Math.floor(rng() * snap.length)];
      audio.excite(s.freq, 0.8 + rng() * 0.3);
      return;
    }

    if (snap.length === 0) {
      commit(TONIC);
      return;
    }

    // Candidate lattice freqs not already present.
    const present = snap.map((s) => s.freq);
    const cand = LATTICE.filter(
      (f) => !present.some((p) => Math.abs(cents(f, p)) < 8),
    );
    if (cand.length === 0) {
      const s = snap[Math.floor(rng() * snap.length)];
      audio.excite(s.freq, 0.9);
      return;
    }

    // Anchor on a random existing string; weight candidates by consonance so
    // the coupling is always visible/audible.
    const anchor = snap[Math.floor(rng() * snap.length)];
    let total = 0;
    const scored = cand.map((f) => {
      const w = Math.pow(couplingWeight(f, anchor.freq), 1.6) + 0.03;
      total += w;
      return { f, w };
    });
    let pick = scored[0].f;
    let acc = rng() * total;
    for (const s of scored) {
      acc -= s.w;
      if (acc <= 0) {
        pick = s.f;
        break;
      }
    }
    commit(pick);
  }, [commit]);

  // ── Main animation + physics loop ──
  const runLoop = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const audio = audioRef.current;
    if (!renderer || !scene || !camera || !audio) return;

    let last = performance.now();

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;

      // ── Mic pitch detection → sustain tracker → commit ──
      const analyser = analyserRef.current;
      const buf = timeBufRef.current;
      if (micActiveRef.current && analyser && buf) {
        analyser.getFloatTimeDomainData(buf);
        const pr = detectPitch(buf, analyser.context.sampleRate);
        const hold = holdRef.current;
        detRef.current.hz = pr.hz;
        if (pr.hz > 0 && pr.clarity > 0.9 && pr.rms > 0.01) {
          if (hold.hz > 0 && Math.abs(cents(pr.hz, hold.hz)) < CENTS_WINDOW) {
            hold.hz = hold.hz * 0.8 + pr.hz * 0.2; // smooth
          } else {
            hold.hz = pr.hz;
            hold.since = now;
            hold.committed = false;
          }
          const q = quantizeToJI(hold.hz);
          detRef.current.target = `${q.name} · ${
            q.centsOff >= 0 ? "+" : ""
          }${q.centsOff.toFixed(0)}¢`;

          // Live excitation: singing near a resting string swells it + kin.
          if (now - lastExciteRef.current > 170) {
            audio.excite(hold.hz, Math.min(1, pr.rms * 9));
            lastExciteRef.current = now;
          }
          // Commit once the pitch is held steady long enough.
          if (!hold.committed && now - hold.since > HOLD_MS) {
            commit(q.freq);
            hold.committed = true;
          }
        } else {
          hold.hz = -1;
          hold.committed = false;
          detRef.current.hz = -1;
          detRef.current.target = null;
        }
      } else {
        // ── Virtual player (self-demo) ──
        const vp = vpRef.current;
        if (now >= vp.nextAt) {
          runVirtualStep();
          const base = reducedRef.current ? 6200 : 3900;
          vp.nextAt = now + base + vpRef.current.rng() * 1400;
        }
      }

      // ── Physics ──
      audio.step(dt);
      const snap = audio.snapshot();
      const energyById = new Map<number, number>();
      for (const s of snap) energyById.set(s.id, s.energy);

      // Retire visuals whose audio voice was evicted.
      for (let i = stringsRef.current.length - 1; i >= 0; i--) {
        const v = stringsRef.current[i];
        if (!energyById.has(v.id)) {
          scene.remove(v.line);
          scene.remove(v.nodeA);
          scene.remove(v.nodeB);
          v.geom.dispose();
          v.mat.dispose();
          (v.nodeA.material as THREE.Material).dispose();
          (v.nodeB.material as THREE.Material).dispose();
          visMapRef.current.delete(v.id);
          stringsRef.current.splice(i, 1);
        }
      }

      // ── Update each string: standing-wave displacement + glow ──
      const ampScale = reducedRef.current ? 0.09 : 0.28;
      for (const v of stringsRef.current) {
        const target = energyById.get(v.id) ?? 0;
        v.energy += (target - v.energy) * Math.min(1, dt * 6);
        const e = v.energy;
        const amp = e * ampScale;
        const pos = v.positions;
        const p1 = v.p1;
        const p2 = v.p2;
        const wobble = 1 + 0.25 * Math.sin(t * v.omega);
        const n = SEG + 1;
        for (let i = 0; i < n; i++) {
          const s = i / SEG;
          const d1 = Math.sin(v.mode * Math.PI * s) * wobble;
          const d2 = Math.sin((v.mode + 1) * Math.PI * s + v.phase + t * 0.6);
          const ox = (p1.x * d1 * 0.72 + p2.x * d2 * 0.28) * amp;
          const oy = (p1.y * d1 * 0.72 + p2.y * d2 * 0.28) * amp;
          const oz = (p1.z * d1 * 0.72 + p2.z * d2 * 0.28) * amp;
          pos[i * 3] = v.base[i * 3] + ox;
          pos[i * 3 + 1] = v.base[i * 3 + 1] + oy;
          pos[i * 3 + 2] = v.base[i * 3 + 2] + oz;
        }
        v.geom.attributes.position.needsUpdate = true;

        const light = 0.34 + Math.min(0.46, e * 0.42);
        const bright = 0.35 + Math.min(1.05, e * 0.95);
        v.color.setHSL(v.hue / 360, 0.82, light).multiplyScalar(bright);
        v.mat.color.copy(v.color);
        v.mat.opacity = 0.5 + Math.min(0.5, e * 0.5);
        const ns = 0.05 + Math.min(0.16, e * 0.14);
        v.nodeA.scale.setScalar(ns);
        v.nodeB.scale.setScalar(ns);
        (v.nodeA.material as THREE.MeshBasicMaterial).color.copy(v.color);
        (v.nodeB.material as THREE.MeshBasicMaterial).color.copy(v.color);
      }

      // ── Sympathetic filaments between consonant, co-active strings ──
      const fil = filamentRef.current;
      if (fil) {
        const arr = stringsRef.current;
        let pc = 0;
        for (let i = 0; i < arr.length && pc < MAX_PAIRS; i++) {
          for (let j = i + 1; j < arr.length && pc < MAX_PAIRS; j++) {
            const a = arr[i];
            const b = arr[j];
            const w = couplingWeight(a.freq, b.freq);
            const activity = w * Math.min(a.energy, b.energy);
            if (w > 0.3 && activity > 0.08) {
              // midpoint of each string's base line
              const mid = SEG / 2;
              const ax = a.base[mid * 3];
              const ay = a.base[mid * 3 + 1];
              const az = a.base[mid * 3 + 2];
              const bx = b.base[mid * 3];
              const by = b.base[mid * 3 + 1];
              const bz = b.base[mid * 3 + 2];
              const o = pc * 6;
              fil.positions[o] = ax;
              fil.positions[o + 1] = ay;
              fil.positions[o + 2] = az;
              fil.positions[o + 3] = bx;
              fil.positions[o + 4] = by;
              fil.positions[o + 5] = bz;
              pc++;
            }
          }
        }
        fil.geom.setDrawRange(0, pc * 2);
        fil.geom.attributes.position.needsUpdate = true;
        (fil.line.material as THREE.LineBasicMaterial).opacity = 0.32;
      }

      // ── Camera slow auto-orbit ──
      const orbit = orbitRef.current;
      const speed = reducedRef.current ? 0.03 : 0.08;
      if (!orbit.drag) orbit.az += dt * speed;
      const rad = 8.6;
      const cy = 1.1 + Math.sin(orbit.el) * 2.2;
      camera.position.set(
        Math.cos(orbit.az) * rad * Math.cos(orbit.el),
        cy,
        Math.sin(orbit.az) * rad * Math.cos(orbit.el),
      );
      camera.lookAt(0, 0.2, 0);

      if (starsRef.current) starsRef.current.rotation.y += dt * 0.004;

      renderer.render(scene, camera);
    };
    tick();
  }, [commit, runVirtualStep]);

  // ── Boot: build the scene ──
  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const mount = mountRef.current;
    if (!mount) return;
    const visMap = visMapRef.current;
    const w = mount.clientWidth || 800;
    const h = mount.clientHeight || 600;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(w, h);
    renderer.setClearColor(0x03040a, 1);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03040a, 0.045);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(48, w / h, 0.1, 100);
    camera.position.set(0, 1.4, 8.6);
    camera.lookAt(0, 0.2, 0);
    cameraRef.current = camera;

    nodeGeoRef.current = new THREE.IcosahedronGeometry(1, 1);

    // Starfield (deterministic, cosmic backdrop).
    const starRng = mulberry32(0x8312 ^ 0x5151);
    const starN = 420;
    const starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      const th = starRng() * Math.PI * 2;
      const ph = Math.acos(2 * starRng() - 1);
      const r = 22 + starRng() * 20;
      starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = r * Math.cos(ph);
      starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const starGeom = new THREE.BufferGeometry();
    starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x6a6ab0,
      size: 0.14,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeom, starMat);
    scene.add(stars);
    starsRef.current = stars;

    // Filament pool (sympathetic transfer threads).
    const filPos = new Float32Array(MAX_PAIRS * 2 * 3);
    const filGeom = new THREE.BufferGeometry();
    filGeom.setAttribute("position", new THREE.BufferAttribute(filPos, 3));
    filGeom.setDrawRange(0, 0);
    const filMat = new THREE.LineBasicMaterial({
      color: 0xa78bfa,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const filLine = new THREE.LineSegments(filGeom, filMat);
    scene.add(filLine);
    filamentRef.current = { geom: filGeom, line: filLine, positions: filPos };

    // Audio: create context (starts suspended without a gesture; visuals still
    // weave). A one-time pointer resumes sound for unmuted viewers.
    const audio = new LoomAudio();
    audioRef.current = audio;
    audio.start().catch(() => {
      /* resumes on gesture */
    });
    const resume = () => {
      audioRef.current?.start().catch(() => {});
    };
    window.addEventListener("pointerdown", resume, { once: true });

    startTimeRef.current = performance.now();
    vpRef.current.nextAt = performance.now() + 400;

    const onResize = () => {
      const m = mountRef.current;
      const rd = rendererRef.current;
      const cam = cameraRef.current;
      if (!m || !rd || !cam) return;
      const nw = m.clientWidth || 800;
      const nh = m.clientHeight || 600;
      rd.setSize(nw, nh);
      cam.aspect = nw / nh;
      cam.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // Optional pointer-drag orbit.
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      const o = orbitRef.current;
      o.drag = true;
      o.px = e.clientX;
      o.py = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      const o = orbitRef.current;
      if (!o.drag) return;
      o.az += (e.clientX - o.px) * 0.005;
      o.el = Math.max(-0.5, Math.min(0.9, o.el + (e.clientY - o.py) * 0.003));
      o.px = e.clientX;
      o.py = e.clientY;
    };
    const onUp = () => {
      orbitRef.current.drag = false;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    runLoop();

    // Readout throttle (~7 Hz), avoids re-rendering every frame.
    const readoutIv = window.setInterval(() => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      setReadout({
        note:
          detRef.current.hz > 0 ? noteLabel(detRef.current.hz) : "—",
        target: detRef.current.target,
        count: stringsRef.current.length,
        elapsed,
      });
    }, 140);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.clearInterval(readoutIv);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointerdown", resume);
      el.removeEventListener("pointerdown", onDown);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((tr) => tr.stop());
        streamRef.current = null;
      }
      try {
        micSrcRef.current?.disconnect();
      } catch {
        /* ignore */
      }
      audioRef.current?.close();
      audioRef.current = null;

      for (const v of stringsRef.current) {
        v.geom.dispose();
        v.mat.dispose();
        (v.nodeA.material as THREE.Material).dispose();
        (v.nodeB.material as THREE.Material).dispose();
      }
      stringsRef.current = [];
      visMap.clear();
      nodeGeoRef.current?.dispose();
      filamentRef.current?.geom.dispose();
      (filamentRef.current?.line.material as THREE.Material | undefined)?.dispose();
      starsRef.current?.geometry.dispose();
      (starsRef.current?.material as THREE.Material | undefined)?.dispose();

      const rd = rendererRef.current;
      if (rd) {
        rd.dispose();
        rd.domElement.remove();
      }
      rendererRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CTA: request mic, hand control from the virtual player to the voice ──
  const startMic = useCallback(async () => {
    setMicError(null);
    const audio = audioRef.current;
    if (!audio) return;
    await audio.start();
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Microphone unsupported — the loom keeps weaving on its own.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      const ctx = audio.audioContext;
      if (!ctx) {
        setMicError("Audio unavailable — the loom keeps weaving on its own.");
        return;
      }
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      src.connect(analyser); // analysis only — never routed to output
      micSrcRef.current = src;
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(analyser.fftSize);
      micActiveRef.current = true;
      setPhase("listening");
    } catch {
      setMicError(
        "Microphone blocked — the loom keeps weaving on its own. Sing anyway once you allow it.",
      );
    }
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0" />

      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="max-w-md rounded-lg border border-border bg-background p-6 text-center shadow-lg">
            <p className="text-base text-foreground">
              This device could not start WebGL, so the loom cannot be drawn.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a browser with hardware acceleration enabled.
            </p>
          </div>
        </div>
      )}

      {/* Header + live readout */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-3 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Shruti Loom
            </h1>
            <p className="mt-1 max-w-md text-base text-muted-foreground">
              Sing and hold a pitch to string a sympathetic voice. Consonant
              strings resonate one another into a woven, humming drone.
            </p>
          </div>
          <div className="pointer-events-auto hidden shrink-0 flex-col items-end gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:flex">
            <span>note {readout.note}</span>
            {readout.target && <span>target {readout.target}</span>}
            <span>strings {readout.count}</span>
            <span>
              {Math.floor(readout.elapsed / 60)}:
              {String(Math.floor(readout.elapsed % 60)).padStart(2, "0")}
            </span>
          </div>
        </div>
        {micError && (
          <p className="max-w-md text-sm text-destructive">{micError}</p>
        )}
      </div>

      {/* Controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-7">
        <div className="pointer-events-auto flex items-center gap-3">
          <button
            type="button"
            onClick={startMic}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {phase === "listening" ? "Listening — sing a note" : "String a note"}
          </button>
          <button
            type="button"
            onClick={() => setNotesOpen((o) => !o)}
            className="min-h-[44px] rounded-md border border-border bg-background px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Design notes
          </button>
        </div>
        <div className="pointer-events-none flex flex-col items-end gap-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground sm:hidden">
          <span>note {readout.note}</span>
          <span>strings {readout.count}</span>
        </div>
      </div>

      {notesOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <button
            type="button"
            aria-label="Close design notes"
            onClick={() => setNotesOpen(false)}
            className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
          />
          <div className="relative max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                Each sustained pitch is quantized to a just-intonation lattice
                over a fixed tonic (~146.8 Hz) and strung across the loom as a
                glowing standing-wave line with a tanpura-like plucked drone.
              </p>
              <p>
                Any two strings couple in proportion to how many low harmonics
                they share — the physics behind a tanpura&apos;s jawari and a
                sitar&apos;s tarab strings. Add or re-sing a consonant string and
                its kin swell and shimmer on their own; violet filaments trace
                the transfer.
              </p>
              <p>
                On its own the loom weaves a seeded, consonant sequence so it is
                never blank. Grant the mic to take over with your voice.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["8312-shrutiloom"]} />
    </main>
  );
}
