"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

/* ─────────────────────────────────────────────────────────────────────────
   632 · POLYMETER LOOM
   Interlocking Euclidean rhythms woven into a hypnotic groove. Voices run on
   differing step-counts (polymeter) that only realign after their LCM, and a
   pair of phasing voices drift in and out of unison à la Steve Reich.
   Subsystems: Bjorklund Euclidean generator · phasing clock · multi-voice
   FM/pluck percussion synth · three.js loom visual.
   ───────────────────────────────────────────────────────────────────────── */

/* ── Bjorklund / Euclidean rhythm generator ──────────────────────────────
   E(k, n): distribute k onsets as evenly as possible across n steps. Returns
   a boolean array of length n where true = onset. (Toussaint 2005.) */
function bjorklundEuclid(k: number, n: number): boolean[] {
  if (n <= 0) return [];
  k = Math.max(0, Math.min(k, n));
  if (k === 0) return new Array(n).fill(false);
  if (k === n) return new Array(n).fill(true);

  // Bjorklund: repeatedly merge the "remainder" sequences into the "group"
  // sequences until at most one remainder pool is left. Result is the maximally
  // even distribution of k onsets across n steps.
  let groups: boolean[][] = [];
  for (let i = 0; i < k; i++) groups.push([true]);
  let remainders: boolean[][] = [];
  for (let i = 0; i < n - k; i++) remainders.push([false]);

  while (remainders.length > 1) {
    const count = Math.min(groups.length, remainders.length);
    const merged: boolean[][] = [];
    for (let i = 0; i < count; i++) merged.push([...groups[i], ...remainders[i]]);
    const leftoverGroups = groups.slice(count);
    const leftoverRem = remainders.slice(count);
    groups = merged;
    remainders = leftoverGroups.length ? leftoverGroups : leftoverRem;
  }

  const flat: boolean[] = [];
  for (const g of groups) flat.push(...g);
  for (const r of remainders) flat.push(...r);
  return flat.slice(0, n);
}

/* ── Voice definitions ───────────────────────────────────────────────────
   Warm pitched percussion on a C Dorian-ish / pentatonic palette. */
type VoiceKind = "kick" | "bass" | "marimba" | "bell" | "shaker";

interface VoiceDef {
  id: number;
  name: string;
  kind: VoiceKind;
  k: number; // onsets
  n: number; // steps (polymeter)
  freq: number; // base pitch (Hz)
  color: string; // hex for three.js
  phasing: boolean; // part of the Reich phasing pair
  hint: string; // keyboard hint
}

const C2 = 65.41;
const C3 = 130.81;

const INITIAL_VOICES: VoiceDef[] = [
  { id: 0, name: "kick", kind: "kick", k: 4, n: 16, freq: C2 * 0.75, color: "#fda4af", phasing: false, hint: "1" },
  { id: 1, name: "bass", kind: "bass", k: 3, n: 8, freq: C2 * 1.5, color: "#c4b5fd", phasing: false, hint: "2" },
  { id: 2, name: "marimba", kind: "marimba", k: 5, n: 16, freq: C3 * 1.5, color: "#6ee7b7", phasing: true, hint: "3" },
  { id: 3, name: "bell", kind: "bell", k: 5, n: 16, freq: C3 * 2.0, color: "#fcd34d", phasing: true, hint: "4" },
  { id: 4, name: "shaker", kind: "shaker", k: 7, n: 12, freq: 7000, color: "#a5b4fc", phasing: false, hint: "5" },
];

/* ── Synth voices (Web Audio) ────────────────────────────────────────────── */
function makeNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function triggerKick(ctx: AudioContext, out: GainNode, t: number, freq: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 2.2, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.9, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + 0.36);
}

function triggerBass(ctx: AudioContext, out: GainNode, t: number, freq: number) {
  const osc = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const g = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(220, t + 0.2);
  osc.type = "sawtooth";
  sub.type = "sine";
  osc.frequency.setValueAtTime(freq, t);
  sub.frequency.setValueAtTime(freq / 2, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(lp);
  sub.connect(lp);
  lp.connect(g).connect(out);
  osc.start(t);
  sub.start(t);
  osc.stop(t + 0.34);
  sub.stop(t + 0.34);
}

function triggerMarimba(ctx: AudioContext, out: GainNode, t: number, freq: number) {
  // FM-ish warm pluck
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const g = ctx.createGain();
  car.type = "triangle";
  mod.type = "sine";
  car.frequency.setValueAtTime(freq, t);
  mod.frequency.setValueAtTime(freq * 3.0, t);
  modGain.gain.setValueAtTime(freq * 1.4, t);
  modGain.gain.exponentialRampToValueAtTime(0.5, t + 0.18);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.45, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  mod.connect(modGain).connect(car.frequency);
  car.connect(g).connect(out);
  car.start(t);
  mod.start(t);
  car.stop(t + 0.54);
  mod.stop(t + 0.54);
}

function triggerBell(ctx: AudioContext, out: GainNode, t: number, freq: number) {
  // FM bell with inharmonic ratio
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const modGain = ctx.createGain();
  const g = ctx.createGain();
  car.type = "sine";
  mod.type = "sine";
  car.frequency.setValueAtTime(freq, t);
  mod.frequency.setValueAtTime(freq * 2.41, t);
  modGain.gain.setValueAtTime(freq * 2.6, t);
  modGain.gain.exponentialRampToValueAtTime(0.5, t + 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  mod.connect(modGain).connect(car.frequency);
  car.connect(g).connect(out);
  car.start(t);
  mod.start(t);
  car.stop(t + 1.45);
  mod.stop(t + 1.45);
}

function triggerShaker(ctx: AudioContext, out: GainNode, t: number, noise: AudioBuffer) {
  const src = ctx.createBufferSource();
  const hp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  src.buffer = noise;
  hp.type = "highpass";
  hp.frequency.value = 5500;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  src.connect(hp).connect(g).connect(out);
  src.start(t);
  src.stop(t + 0.1);
}

function triggerVoice(
  ctx: AudioContext,
  out: GainNode,
  noise: AudioBuffer,
  v: VoiceDef,
  t: number,
) {
  switch (v.kind) {
    case "kick": return triggerKick(ctx, out, t, v.freq);
    case "bass": return triggerBass(ctx, out, t, v.freq);
    case "marimba": return triggerMarimba(ctx, out, t, v.freq);
    case "bell": return triggerBell(ctx, out, t, v.freq);
    case "shaker": return triggerShaker(ctx, out, t, noise);
  }
}

/* ── Per-voice scheduler state ───────────────────────────────────────────── */
interface VoiceRT {
  pattern: boolean[];
  step: number; // next step index
  nextTime: number; // audio time of next step
  phaseOffset: number; // accumulated phasing drift (0..1 of a step), visual
}

const LOOKAHEAD = 0.1; // s — schedule window
const TICK_MS = 25; // scheduler poll
const PHASE_RATIO = 1.012; // phasing voice runs 1.2% faster

export default function PolymeterLoomPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [voices, setVoices] = useState<VoiceDef[]>(INITIAL_VOICES);
  const [enabled, setEnabled] = useState<boolean[]>(INITIAL_VOICES.map(() => true));
  const [bpm, setBpm] = useState(112);
  const [phasingOn, setPhasingOn] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);

  // Audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const noiseRef = useRef<AudioBuffer | null>(null);
  const rtRef = useRef<VoiceRT[]>([]);
  const schedTimerRef = useRef<number | null>(null);

  // Live mirrors so the scheduler/closure see fresh values without re-subscribing
  const voicesRef = useRef(voices);
  const enabledRef = useRef(enabled);
  const bpmRef = useRef(bpm);
  const phasingRef = useRef(phasingOn);
  voicesRef.current = voices;
  enabledRef.current = enabled;
  bpmRef.current = bpm;
  phasingRef.current = phasingOn;

  // Visual flash registry: voiceId -> {stepIndex -> flash energy 0..1}
  const flashRef = useRef<Record<number, number[]>>({});
  // accumulated phase drift per voice (revolutions) for the loom
  const driftRef = useRef<number[]>(INITIAL_VOICES.map(() => 0));

  /* ── Audio scheduler ─────────────────────────────────────────────────── */
  const runScheduler = useCallback(() => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    const noise = noiseRef.current;
    if (!ctx || !master || !noise) return;

    const now = ctx.currentTime;
    const beatSec = 60 / bpmRef.current;
    const stepSec = beatSec / 4; // 16th-note grid baseline
    const vs = voicesRef.current;
    const en = enabledRef.current;

    rtRef.current.forEach((rt, i) => {
      const v = vs[i];
      if (!v) return;
      // phasing voices step a hair faster when drift is on
      const ratio = phasingRef.current && v.phasing ? PHASE_RATIO : 1;
      const myStepSec = stepSec / ratio;

      while (rt.nextTime < now + LOOKAHEAD) {
        const onset = rt.pattern[rt.step];
        if (onset && en[i]) {
          triggerVoice(ctx, master, noise, v, rt.nextTime);
          // register a visual flash for this step
          if (!flashRef.current[v.id]) flashRef.current[v.id] = [];
          flashRef.current[v.id][rt.step] = 1;
        }
        rt.step = (rt.step + 1) % rt.pattern.length;
        rt.nextTime += myStepSec;
      }
      // track phase drift (revolutions of a full step) for visuals
      driftRef.current[i] = (ratio - 1) * (now / myStepSec);
    });
  }, []);

  const startSchedulerLoop = useCallback(() => {
    if (schedTimerRef.current !== null) return;
    const tick = () => {
      runScheduler();
      schedTimerRef.current = window.setTimeout(tick, TICK_MS);
    };
    tick();
  }, [runScheduler]);

  /* ── Build / rebuild RT patterns when voice k/n changes ──────────────── */
  const rebuildRT = useCallback((vs: VoiceDef[]) => {
    const ctx = ctxRef.current;
    const startAt = ctx ? ctx.currentTime + 0.06 : 0;
    rtRef.current = vs.map((v, i) => {
      const prev = rtRef.current[i];
      return {
        pattern: bjorklundEuclid(v.k, v.n),
        step: prev ? prev.step % v.n : 0,
        nextTime: prev ? prev.nextTime : startAt,
        phaseOffset: 0,
      };
    });
  }, []);

  useEffect(() => {
    rebuildRT(voices);
  }, [voices, rebuildRT]);

  /* ── Start audio on user gesture ─────────────────────────────────────── */
  const startAudio = useCallback(async () => {
    if (ctxRef.current) {
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      setRunning(true);
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) {
        setAudioError("Web Audio is unavailable in this browser — visuals only.");
        return;
      }
      const ctx = new AC();
      await ctx.resume();
      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.gain.linearRampToValueAtTime(0.85, ctx.currentTime + 0.4);
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
      ctxRef.current = ctx;
      masterRef.current = master;
      noiseRef.current = makeNoiseBuffer(ctx);
      rebuildRT(voicesRef.current);
      const base = ctx.currentTime + 0.12;
      rtRef.current.forEach((rt) => (rt.nextTime = base));
      startSchedulerLoop();
      setRunning(true);
    } catch {
      setAudioError("Could not start the audio engine — visuals only.");
    }
  }, [rebuildRT, startSchedulerLoop]);

  const stopAudio = useCallback(() => {
    const master = masterRef.current;
    const ctx = ctxRef.current;
    if (master && ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    }
    if (schedTimerRef.current !== null) {
      clearTimeout(schedTimerRef.current);
      schedTimerRef.current = null;
    }
    setRunning(false);
  }, []);

  /* ── Voice controls ──────────────────────────────────────────────────── */
  const toggleVoice = useCallback((i: number) => {
    setEnabled((prev) => prev.map((v, j) => (j === i ? !v : v)));
  }, []);

  const nudgeK = useCallback((i: number, d: number) => {
    setVoices((prev) =>
      prev.map((v, j) => {
        if (j !== i) return v;
        const k = Math.max(0, Math.min(v.n, v.k + d));
        return { ...v, k };
      }),
    );
  }, []);

  /* ── Keyboard input ──────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key;
      if (key === " ") {
        e.preventDefault();
        if (!ctxRef.current) { startAudio(); return; }
        setPhasingOn((p) => !p);
        return;
      }
      if (key >= "1" && key <= "5") {
        const i = parseInt(key, 10) - 1;
        if (i < voicesRef.current.length) {
          if (!ctxRef.current) startAudio();
          toggleVoice(i);
        }
        return;
      }
      // q/a..  nudge k for voices 1..5 :  q/a, w/s, e/d, r/f, t/g
      const upMap: Record<string, number> = { q: 0, w: 1, e: 2, r: 3, t: 4 };
      const dnMap: Record<string, number> = { a: 0, s: 1, d: 2, f: 3, g: 4 };
      if (key in upMap) { nudgeK(upMap[key], +1); return; }
      if (key in dnMap) { nudgeK(dnMap[key], -1); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [startAudio, toggleVoice, nudgeK]);

  /* ── three.js loom ───────────────────────────────────────────────────── */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setGlError("WebGL is unavailable — audio still works once started.");
      return;
    }
    const w = mount.clientWidth || 720;
    const h = mount.clientHeight || 520;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 5.4, 7.2);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0x223044, 1.2));
    const key = new THREE.PointLight(0x99aaff, 40, 40);
    key.position.set(4, 8, 6);
    scene.add(key);

    const group = new THREE.Group();
    scene.add(group);

    const disposables: Array<THREE.BufferGeometry | THREE.Material> = [];

    // Per-voice ring of bead meshes. Ring radius scales by voice index.
    interface RingViz {
      voiceId: number;
      beads: THREE.Mesh[];
      mats: THREE.MeshStandardMaterial[];
      ringMesh: THREE.Mesh;
      ringGroup: THREE.Group;
      radius: number;
      n: number;
      color: THREE.Color;
    }
    let rings: RingViz[] = [];

    const beadGeo = new THREE.SphereGeometry(0.13, 16, 16);
    disposables.push(beadGeo);

    const buildRings = (vs: VoiceDef[]) => {
      // clear old
      rings.forEach((r) => {
        r.beads.forEach((b) => group.remove(b));
        group.remove(r.ringGroup);
      });
      rings = [];
      vs.forEach((v, i) => {
        const radius = 1.1 + i * 0.78;
        const ringGroup = new THREE.Group();
        const color = new THREE.Color(v.color);

        // faint guide ring
        const ringGeo = new THREE.TorusGeometry(radius, 0.012, 8, 96);
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        disposables.push(ringGeo, ringMat);
        ringGroup.add(ringMesh);

        const pattern = bjorklundEuclid(v.k, v.n);
        const beads: THREE.Mesh[] = [];
        const mats: THREE.MeshStandardMaterial[] = [];
        for (let s = 0; s < v.n; s++) {
          const ang = (s / v.n) * Math.PI * 2 - Math.PI / 2;
          const onset = pattern[s];
          const mat = new THREE.MeshStandardMaterial({
            color: onset ? color : new THREE.Color("#1b2430"),
            emissive: color,
            emissiveIntensity: onset ? 0.25 : 0.0,
            roughness: 0.4,
            metalness: 0.2,
          });
          const mesh = new THREE.Mesh(beadGeo, mat);
          mesh.scale.setScalar(onset ? 1 : 0.55);
          mesh.position.set(Math.cos(ang) * radius, 0, Math.sin(ang) * radius);
          mesh.userData = { onset, baseAng: ang };
          ringGroup.add(mesh);
          beads.push(mesh);
          mats.push(mat);
          disposables.push(mat);
        }
        group.add(ringGroup);
        rings.push({ voiceId: v.id, beads, mats, ringMesh, ringGroup, radius, n: v.n, color });
      });
    };

    buildRings(voicesRef.current);
    let builtSignature = voicesRef.current.map((v) => `${v.k}/${v.n}`).join(",");

    // a slow playhead sweep line for ambient life
    const sweepGeo = new THREE.BufferGeometry();
    const sweepPositions = new Float32Array(6);
    sweepGeo.setAttribute("position", new THREE.BufferAttribute(sweepPositions, 3));
    const sweepMat = new THREE.LineBasicMaterial({ color: 0x8899ff, transparent: true, opacity: 0.35 });
    const sweep = new THREE.Line(sweepGeo, sweepMat);
    group.add(sweep);
    disposables.push(sweepGeo, sweepMat);

    let raf = 0;
    const clock = new THREE.Clock();
    const tmpColor = new THREE.Color();

    const render = () => {
      const t = clock.getElapsedTime();

      // rebuild if a voice's k/n changed
      const sig = voicesRef.current.map((v) => `${v.k}/${v.n}`).join(",");
      if (sig !== builtSignature) {
        buildRings(voicesRef.current);
        builtSignature = sig;
      }

      // idle auto-demo: whole loom slowly rotates + breathes
      group.rotation.y = t * 0.12;
      const breathe = 1 + Math.sin(t * 0.6) * 0.02;
      group.scale.setScalar(breathe);
      camera.position.x = Math.sin(t * 0.05) * 0.6;
      camera.lookAt(0, 0, 0);

      const vs = voicesRef.current;
      const en = enabledRef.current;
      const phaseDriftOn = phasingRef.current;

      rings.forEach((ring, i) => {
        const v = vs[i];
        if (!v) return;
        const on = en[i];
        // phasing voices visibly rotate relative to the rest (the weave)
        const isPhasing = v.phasing && phaseDriftOn;
        // base drift from audio if running, else gentle idle drift for the demo
        const audioDrift = driftRef.current[i] || 0;
        const idleDrift = isPhasing ? t * 0.10 : 0;
        ring.ringGroup.rotation.y = (audioDrift * Math.PI * 2) + idleDrift;

        ring.beads.forEach((bead, s) => {
          const mat = ring.mats[s];
          const onset = bead.userData.onset as boolean;
          // decay any active flash
          const flashArr = flashRef.current[v.id];
          let flash = flashArr ? flashArr[s] || 0 : 0;
          if (flash > 0) {
            flash -= 0.06;
            if (flash < 0) flash = 0;
            if (flashArr) flashArr[s] = flash;
          }
          if (onset) {
            const baseEmis = on ? 0.35 : 0.08;
            mat.emissiveIntensity = baseEmis + flash * 2.4;
            const sc = (on ? 1 : 0.7) + flash * 0.8;
            bead.scale.setScalar(sc);
            tmpColor.copy(ring.color);
            if (!on) tmpColor.multiplyScalar(0.35);
            mat.color.copy(tmpColor);
          } else {
            mat.emissiveIntensity = 0.0;
            mat.color.setHex(0x1b2430);
            bead.scale.setScalar(0.5);
          }
        });
        // dim disabled ring guide
        (ring.ringMesh.material as THREE.MeshBasicMaterial).opacity = on ? 0.2 : 0.06;
      });

      // sweep line rotating across the loom
      const ang = t * 0.5;
      const R = 5.4;
      sweepPositions[0] = 0; sweepPositions[1] = 0; sweepPositions[2] = 0;
      sweepPositions[3] = Math.cos(ang) * R; sweepPositions[4] = 0; sweepPositions[5] = Math.sin(ang) * R;
      (sweepGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    const onResize = () => {
      const nw = mount.clientWidth || 720;
      const nh = mount.clientHeight || 520;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // built once on mount; reads live state via refs, rebuilds rings inside the
    // render loop when k/n changes, so no reactive deps are needed here.
  }, []);

  /* ── Cleanup audio on unmount ────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (schedTimerRef.current !== null) clearTimeout(schedTimerRef.current);
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close();
    };
  }, []);

  const lcmAll = lcmOfSteps(voices.map((v) => v.n));

  return (
    <main className="min-h-screen bg-[#070a10] text-foreground">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Polymeter Loom
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Interlocking Euclidean rhythms woven into a hypnotic groove — voices on
            different step-counts drift apart and back together, Reich-style.
          </p>
        </header>

        {/* Loom viewport */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-black/60">
          <div ref={mountRef} className="h-[clamp(300px,52vh,560px)] w-full" />
          {glError && (
            <div className="absolute inset-x-0 top-0 p-4 text-base text-violet-300">{glError}</div>
          )}
          {!running && !audioError && (
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-black/70 px-4 py-2 text-sm text-muted-foreground">
              idle demo — press Weave for sound
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-xl bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-violet-400"
            >
              ▶ Weave
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="min-h-[44px] rounded-xl border border-border bg-muted px-4 py-2.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
            >
              ⏸ Pause
            </button>
          )}

          <button
            onClick={() => setPhasingOn((p) => !p)}
            className={`min-h-[44px] rounded-xl border px-4 py-2.5 text-base font-medium transition-colors ${
              phasingOn
                ? "border-violet-400/40 bg-violet-500/15 text-violet-300/95"
                : "border-border bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            phasing {phasingOn ? "on" : "off"}
          </button>

          <label className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-muted px-4 py-2.5">
            <span className="font-mono text-sm text-muted-foreground">tempo</span>
            <input
              type="range"
              min={70}
              max={150}
              value={bpm}
              onChange={(e) => setBpm(parseInt(e.target.value, 10))}
              className="w-32 accent-violet-400"
            />
            <span className="w-16 font-mono text-base text-violet-300/95">{bpm} bpm</span>
          </label>
        </div>

        {/* Per-voice state */}
        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {voices.map((v, i) => {
            const on = enabled[i];
            return (
              <div
                key={v.id}
                className={`rounded-xl border px-4 py-3 transition-colors ${
                  on ? "border-border bg-muted" : "border-border bg-muted"
                }`}
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => { if (!ctxRef.current) startAudio(); toggleVoice(i); }}
                    className="flex min-h-[44px] items-center gap-2.5 text-left"
                  >
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full"
                      style={{ background: v.color, opacity: on ? 1 : 0.3 }}
                    />
                    <span className={`text-base font-medium ${on ? "text-foreground" : "text-muted-foreground"}`}>
                      {v.name}
                    </span>
                    {v.phasing && (
                      <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-xs text-violet-300/95">
                        phase
                      </span>
                    )}
                  </button>
                  <span className="font-mono text-sm text-muted-foreground">[{v.hint}]</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="font-mono text-base text-violet-300">
                    E({v.k},{v.n})
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => nudgeK(i, -1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-base text-muted-foreground hover:bg-accent"
                      aria-label={`fewer onsets on ${v.name}`}
                    >
                      −
                    </button>
                    <button
                      onClick={() => nudgeK(i, +1)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-base text-muted-foreground hover:bg-accent"
                      aria-label={`more onsets on ${v.name}`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <PatternStrip k={v.k} n={v.n} color={v.color} dim={!on} />
              </div>
            );
          })}
        </div>

        {/* status line */}
        <p className="mt-4 font-mono text-sm text-muted-foreground">
          {voices.filter((_, i) => enabled[i]).length} voices weaving · combined loop realigns every{" "}
          <span className="text-violet-300/95">{lcmAll}</span> steps
          {phasingOn && <span className="text-violet-300/95"> · phasing drift active</span>}
        </p>

        {audioError && (
          <p className="mt-3 text-base text-violet-300">{audioError}</p>
        )}

        {/* Keyboard hints */}
        <p className="mt-3 text-sm text-muted-foreground">
          Keys: <span className="font-mono text-muted-foreground">1–5</span> toggle voices ·{" "}
          <span className="font-mono text-muted-foreground">q/a w/s e/d r/f t/g</span> nudge onsets ·{" "}
          <span className="font-mono text-muted-foreground">space</span> toggle phasing
        </p>

        {/* Design notes */}
        <div className="mt-6 rounded-xl border border-border bg-muted">
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="flex min-h-[44px] w-full items-center justify-between px-4 py-2.5 text-left"
          >
            <span className="text-xl font-medium text-foreground">Design notes</span>
            <span className="font-mono text-base text-muted-foreground">{showNotes ? "−" : "+"}</span>
          </button>
          {showNotes && (
            <div className="space-y-3 px-4 pb-5 text-base text-muted-foreground">
              <p>
                Each voice plays a <span className="text-violet-300">Euclidean rhythm</span>{" "}
                E(k,n): k onsets spread as evenly as possible over n steps, computed with the{" "}
                <span className="font-mono text-muted-foreground">Bjorklund</span> algorithm.
              </p>
              <p>
                Voices use <em>different</em> n (16, 8, 16, 16, 12), so the combined groove is{" "}
                <span className="text-violet-300/95">polymetric</span> — it only realigns after
                the least common multiple of all step-counts, a long evolving loop.
              </p>
              <p>
                The <span className="text-violet-300/95">marimba</span> and{" "}
                <span className="text-violet-300/95">bell</span> share a pattern but one runs{" "}
                {((PHASE_RATIO - 1) * 100).toFixed(1)}% faster — Steve Reich phasing. They slide
                out of unison and slowly back, so minute 2 sounds unlike minute 0.
              </p>
              <p className="text-muted-foreground">
                References: <span className="text-muted-foreground">Steve Reich</span> — phasing
                (<em>Music for 18 Musicians</em>, <em>Clapping Music</em>) ·{" "}
                <span className="text-muted-foreground">Godfried Toussaint</span> —{" "}
                <em>The Euclidean Algorithm Generates Traditional Musical Rhythms</em> (2005).
                Subsystems: Euclidean generator · phasing clock · multi-voice FM/pluck synth ·
                three.js loom. See README.md.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ── Tiny inline pattern strip (SVG, not the main viz) ───────────────────── */
function PatternStrip({ k, n, color, dim }: { k: number; n: number; color: string; dim: boolean }) {
  const pattern = bjorklundEuclid(k, n);
  return (
    <div className="mt-2.5 flex flex-wrap gap-1" aria-hidden>
      {pattern.map((on, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-[3px]"
          style={{
            background: on ? color : "#1b2430",
            opacity: dim ? 0.4 : on ? 0.95 : 0.6,
          }}
        />
      ))}
    </div>
  );
}

/* ── math helpers ────────────────────────────────────────────────────────── */
function gcdTwo(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}
function lcmOfSteps(ns: number[]): number {
  return ns.reduce((acc, n) => (acc * n) / gcdTwo(acc, n), 1);
}
