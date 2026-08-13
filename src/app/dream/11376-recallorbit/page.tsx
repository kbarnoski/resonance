"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 11376 · Recall Orbit — a melody you sang, seen as the orbit of a living mind.
//
//   ONE QUESTION
//   What if a melody became a shape you could see — a glowing orbit traced by a
//   living neural "mind" — and when the mind remembers perfectly the orbit is a
//   clean closed loop, but as memory loosens into dream the loop unwinds into a
//   wild, endless, never-repeating attractor?
//
//   A genuine Echo-State Network (Jaeger 2001) runs the "mind": state x ∈ R^180
//   under a fixed sparse recurrent matrix (spectral radius ρ), driven ONLY by a
//   phase clock. DEEPENING 10984-echofold — whose FIXED-RANDOM readouts could
//   only drift — here the readout is genuinely TRAINED by ridge / Tikhonov
//   regression (Lukoševičius & Jaeger 2009), so the reservoir reproduces the
//   taught phrase EXACTLY. See reservoir.ts.
//
//   THE READ: we project the reservoir's 180-D state to 3-D through a fixed
//   random projection and render the trajectory as a glowing phase-portrait
//   ribbon — memory AS geometry. At DREAM≈0 the state is a clean closed limit
//   cycle (exact recall, the melody's orbit). As DREAM→1 the clock's grip fades,
//   ρ pushes past the edge of chaos, and the loop unwinds into a wandering,
//   space-filling attractor that never returns.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RecallReservoir, makeSeedTarget, type TargetStep } from "./reservoir";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── Engine constants ──────────────────────────────────────────────────────────
const SEED = 11376;
const STEPS_PER_LOOP = 96;
const STEP_DT = 1 / 16; // seconds per reservoir step → ~6s per loop
const TRAIL = 384; // ribbon length in points (~4 loops)
const SWEEP_SECONDS = 40; // auto-sweep dream 0→1→0 period
const RECORD_SECONDS = 4;

// Art palette (raw hex is allowed inside the art — cool cyan/teal/aurora).
const HEX_BG = 0x02060a;
const COL_HEAD = new THREE.Color(0xeafcff); // ice white
const COL_BRIGHT = new THREE.Color(0x2ee6d6); // teal-cyan
const COL_DEEP = new THREE.Color(0x0e5f7a); // deep cyan (trail tail)
const COL_DREAM = new THREE.Color(0x39f0a0); // aurora green (dream tint)
const COL_UNIT = new THREE.Color(0x1f8fae); // point-cloud units

function pitchToFreq(pitch: number): number {
  // pitch ∈ [-1,1] → ±12 semitones around middle C.
  return 261.63 * Math.pow(2, pitch);
}

export default function RecallOrbitPage() {
  const [soundOn, setSoundOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [dream, setDream] = useState(0);
  const [autoSweep, setAutoSweep] = useState(true);
  const [recording, setRecording] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [hud, setHud] = useState({ notes: 11, energy: 0, mode: "closed-orbit" });

  // ── Refs the animation loop reads (never React state in the hot path) ─────────
  const mountRef = useRef<HTMLDivElement | null>(null);
  const reservoirRef = useRef<RecallReservoir | null>(null);
  const rafRef = useRef<number | null>(null);
  const dreamRef = useRef(0);
  const autoSweepRef = useRef(true);
  const soundOnRef = useRef(false);
  const recordingRef = useRef(false);

  // Audio refs.
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const droneRef = useRef<DroneBank | null>(null);
  const voicesRef = useRef<Set<OscillatorNode>>(new Set());

  // Mic recording buffers.
  const recordStartRef = useRef(0);
  const recCentroidRef = useRef<number[]>([]);
  const recOnsetRef = useRef<number[]>([]); // recorded onset step indices

  const mic = useMicAnalyser({ smoothing: 0.6 });
  // Keep a stable ref to getFrame so the rAF effect need not depend on it.
  const getFrameRef = useRef(mic.getFrame);
  getFrameRef.current = mic.getFrame;

  // ── One voice (glassy 2-op FM) ────────────────────────────────────────────────
  const playNote = useCallback((freq: number, vel: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const car = ctx.createOscillator();
    car.type = "sine";
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2.001;
    const mg = ctx.createGain();
    mg.gain.value = freq * 1.4 * (0.4 + vel);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.16 * (0.5 + vel), now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 1.6);
    car.connect(g);
    g.connect(master.input);
    car.start(now);
    mod.start(now);
    car.stop(now + 1.7);
    mod.stop(now + 1.7);
    voicesRef.current.add(car);
    voicesRef.current.add(mod);
    const drop = () => {
      voicesRef.current.delete(car);
      voicesRef.current.delete(mod);
    };
    car.onended = drop;
    mod.onended = drop;
  }, []);

  // ── Build a training target from a recorded phrase ────────────────────────────
  const buildRecordedTarget = useCallback((): TargetStep[] | null => {
    const centroids = recCentroidRef.current;
    const onsets = recOnsetRef.current;
    if (onsets.length < 2) return null;
    const target: TargetStep[] = Array.from({ length: STEPS_PER_LOOP }, () => ({
      pitch: 0,
      gate: 0,
    }));
    // Pitch contour: centroid (Hz) → semitone around 220 Hz → [-1,1].
    let held = 0;
    for (let s = 0; s < STEPS_PER_LOOP; s++) {
      const c = centroids[s];
      if (c && c > 40) held = Math.max(-1, Math.min(1, Math.log2(c / 220) / 1.25));
      target[s].pitch = held;
    }
    // Gate: raised-cosine bump around each recorded onset step.
    const pre = 2;
    const post = 3;
    for (const stepIdx of onsets) {
      for (let o = -pre; o <= post; o++) {
        const s = stepIdx + o;
        if (s < 0 || s >= STEPS_PER_LOOP) continue;
        const env = 0.5 + 0.5 * Math.cos((Math.PI * o) / (o <= 0 ? pre + 1 : post + 1));
        if (env > target[s].gate) target[s].gate = env;
      }
    }
    return target;
  }, []);

  // ── Start recording from the mic ──────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (recordingRef.current) return;
    setMicNote(null);
    await mic.start();
    // mic.start sets error state if it failed; check after a tick.
    if (mic.error) {
      setMicNote(mic.error);
      return;
    }
    recCentroidRef.current = new Array(STEPS_PER_LOOP).fill(0);
    recOnsetRef.current = [];
    recordStartRef.current = performance.now();
    recordingRef.current = true;
    setRecording(true);
  }, [mic]);

  // Reflect mic errors that surface after start().
  useEffect(() => {
    if (mic.error) {
      setMicNote(mic.error);
      recordingRef.current = false;
      setRecording(false);
    }
  }, [mic.error]);

  // ── Sound toggle ──────────────────────────────────────────────────────────────
  const toggleSound = useCallback(() => {
    if (soundOnRef.current) {
      soundOnRef.current = false;
      setSoundOn(false);
      droneRef.current?.stop();
      droneRef.current = null;
      voicesRef.current.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      voicesRef.current.clear();
      masterRef.current?.disconnect();
      masterRef.current = null;
      void ctxRef.current?.close();
      ctxRef.current = null;
      return;
    }
    // Create audio graph on this user gesture.
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const master = createSafeMaster(ctx, { gain: 0.5 });
      const drone = startDroneBank(ctx, master.input, {
        root: 98,
        ratios: [1, 3 / 2, 2, 3],
        peakGain: 0.1,
        cutoffLow: 180,
        cutoffHigh: 1400,
      });
      drone.setDrive(0.25);
      ctxRef.current = ctx;
      masterRef.current = master;
      droneRef.current = drone;
      soundOnRef.current = true;
      setSoundOn(true);
    } catch {
      setMicNote("Audio unavailable in this browser.");
    }
  }, []);

  // ── Dream slider (manual) ─────────────────────────────────────────────────────
  const onDreamInput = useCallback((v: number) => {
    autoSweepRef.current = false;
    setAutoSweep(false);
    dreamRef.current = v;
    setDream(v);
  }, []);

  const resumeAutoSweep = useCallback(() => {
    autoSweepRef.current = true;
    setAutoSweep(true);
  }, []);

  // ── Main effect: reservoir + three.js + animation loop ────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Build + train the reservoir immediately (self-demo, no interaction/mic).
    const res = new RecallReservoir(SEED, 180, STEPS_PER_LOOP, 0.12);
    res.setTarget(makeSeedTarget(STEPS_PER_LOOP, SEED));
    res.train();
    reservoirRef.current = res;
    let learnedNotes = res.target.filter((t) => t.gate >= 0.999).length;

    // ── three.js scene ──────────────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglOk(false);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    const sizeOf = () => {
      const w = mount.clientWidth || 640;
      const h = mount.clientHeight || 420;
      return { w, h };
    };
    let { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    renderer.setClearColor(HEX_BG, 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(HEX_BG, 0.06);
    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
    const camRadius = 6.2;
    camera.position.set(0, 0, camRadius);

    const SCALE = 1.7; // fit projected state (~±0.85) into view

    // Point cloud of the N units at fixed seeded 3-D positions.
    const N = res.N;
    const unitPos = new Float32Array(N * 3);
    {
      // Deterministic sphere-shell embedding (own tiny PRNG).
      let a = (SEED ^ 0x1234) >>> 0;
      const rnd = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      for (let i = 0; i < N; i++) {
        const u = rnd() * 2 - 1;
        const th = rnd() * Math.PI * 2;
        const r = 3.4 * Math.cbrt(rnd());
        const s = Math.sqrt(1 - u * u);
        unitPos[i * 3] = r * s * Math.cos(th);
        unitPos[i * 3 + 1] = r * s * Math.sin(th);
        unitPos[i * 3 + 2] = r * u;
      }
    }
    const unitGeo = new THREE.BufferGeometry();
    unitGeo.setAttribute("position", new THREE.BufferAttribute(unitPos, 3));
    const unitCol = new Float32Array(N * 3);
    unitGeo.setAttribute("color", new THREE.BufferAttribute(unitCol, 3));
    const unitMat = new THREE.PointsMaterial({
      size: 0.075,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const unitCloud = new THREE.Points(unitGeo, unitMat);
    scene.add(unitCloud);

    // The phase-portrait ribbon: an additive line with a fading, tinted color.
    const trailPos = new Float32Array(TRAIL * 3);
    const trailCol = new Float32Array(TRAIL * 3);
    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    ribbonGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
    const ribbonMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ribbon = new THREE.Line(ribbonGeo, ribbonMat);
    scene.add(ribbon);

    // A second, wider translucent pass for a soft glow around the ribbon.
    const glowMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Line(ribbonGeo, glowMat);
    glow.scale.setScalar(1.015);
    scene.add(glow);

    // Head bloom — a single additive point that flares on emitted notes.
    const headGeo = new THREE.BufferGeometry();
    headGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(3), 3),
    );
    const headMat = new THREE.PointsMaterial({
      size: 0.35,
      color: COL_HEAD,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const head = new THREE.Points(headGeo, headMat);
    scene.add(head);

    // ── Trail history buffer (JS side, rebuilt into geometry each frame) ─────────
    const history: number[][] = [];
    const p3 = new Float32Array(3);
    let headPulse = 0;

    // Seed the history so the ribbon is alive on the first frame.
    res.setDream(0);
    res.reset();
    for (let i = 0; i < TRAIL; i++) {
      res.stepGenerate();
      res.project3(p3);
      history.push([p3[0] * SCALE, p3[1] * SCALE, p3[2] * SCALE]);
    }

    // ── Timing ────────────────────────────────────────────────────────────────
    let last = performance.now();
    let acc = 0;
    let elapsed = 0;
    let hudTimer = 0;
    const dtStep = STEP_DT;

    const onResize = () => {
      const s = sizeOf();
      w = s.w;
      h = s.h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const stepReservoir = (nowMs: number) => {
      // Auto-sweep dream 0→1→0 (triangle) unless the user has taken control.
      if (autoSweepRef.current) {
        const phase = (elapsed % SWEEP_SECONDS) / SWEEP_SECONDS;
        const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
        dreamRef.current = tri;
      }
      res.setDream(dreamRef.current);

      const result = res.stepGenerate();

      // Mic recording: sample centroid/onset into per-step slots.
      if (recordingRef.current) {
        const t = (nowMs - recordStartRef.current) / 1000;
        const slot = Math.min(
          STEPS_PER_LOOP - 1,
          Math.floor((t / RECORD_SECONDS) * STEPS_PER_LOOP),
        );
        const frame = getFrameRef.current();
        if (frame) {
          recCentroidRef.current[slot] = frame.centroid;
          if (frame.onset) {
            const arr = recOnsetRef.current;
            if (arr[arr.length - 1] !== slot) arr.push(slot);
          }
        }
        if (t >= RECORD_SECONDS) {
          recordingRef.current = false;
          const tgt = buildRecordedTarget();
          if (tgt) {
            res.setTarget(tgt);
            res.train();
            learnedNotes = res.target.filter((x) => x.gate >= 0.999).length;
            setMicNote(`Learned your phrase — ${learnedNotes} notes. Singing it back.`);
          } else {
            setMicNote("Didn't catch a clear phrase — kept the seeded melody.");
          }
          mic.stop();
          autoSweepRef.current = true;
          setAutoSweep(true);
          setRecording(false);
        }
      }

      // Emit note.
      if (result.noteOn) {
        headPulse = 1;
        if (soundOnRef.current) {
          const vel = Math.min(1, Math.max(0.15, result.gate));
          playNote(pitchToFreq(result.pitch), vel);
        }
      }

      // Advance drone drive gently with dream for a swelling bed.
      droneRef.current?.setDrive(0.2 + 0.4 * dreamRef.current);

      // Append projected 3-D point to the ribbon history.
      res.project3(p3);
      history.push([p3[0] * SCALE, p3[1] * SCALE, p3[2] * SCALE]);
      if (history.length > TRAIL) history.shift();
    };

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      let frameDt = (now - last) / 1000;
      last = now;
      if (frameDt > 0.1) frameDt = 0.1; // clamp after tab-switch
      elapsed += frameDt;
      acc += frameDt;

      let steps = 0;
      while (acc >= dtStep && steps < 8) {
        acc -= dtStep;
        stepReservoir(now);
        steps++;
      }

      // Rebuild ribbon geometry (oldest → newest) with a fading, dream-tinted color.
      const dNow = dreamRef.current;
      const tail = COL_DEEP.clone();
      const bright = COL_BRIGHT.clone().lerp(COL_DREAM, dNow * 0.8);
      const len = history.length;
      for (let i = 0; i < TRAIL; i++) {
        const hi = i < len ? i : len - 1;
        const p = history[hi];
        trailPos[i * 3] = p[0];
        trailPos[i * 3 + 1] = p[1];
        trailPos[i * 3 + 2] = p[2];
        const f = len > 1 ? i / (len - 1) : 1; // 0 tail → 1 head
        const c = tail.clone().lerp(bright, Math.pow(f, 1.4));
        trailCol[i * 3] = c.r;
        trailCol[i * 3 + 1] = c.g;
        trailCol[i * 3 + 2] = c.b;
      }
      ribbonGeo.attributes.position.needsUpdate = true;
      ribbonGeo.attributes.color.needsUpdate = true;

      // Head position + bloom.
      const hp = history[len - 1];
      headGeo.attributes.position.setXYZ(0, hp[0], hp[1], hp[2]);
      headGeo.attributes.position.needsUpdate = true;
      headPulse *= 0.9;
      headMat.size = 0.28 + headPulse * 0.9;
      headMat.opacity = 0.55 + headPulse * 0.4;

      // Point-cloud units lit by |x_i|.
      const x = res.state;
      const uc = COL_UNIT;
      for (let i = 0; i < N; i++) {
        const a = Math.min(1, Math.abs(x[i]) * 1.6);
        unitCol[i * 3] = uc.r * a;
        unitCol[i * 3 + 1] = uc.g * a;
        unitCol[i * 3 + 2] = uc.b * a;
      }
      unitGeo.attributes.color.needsUpdate = true;

      // Slow auto-orbit camera (~0.02 Hz); stilled under reduced motion.
      const orbit = reduceMotion ? 0.0 : 0.02;
      const ang = elapsed * orbit * Math.PI * 2;
      camera.position.x = Math.sin(ang) * camRadius;
      camera.position.z = Math.cos(ang) * camRadius;
      camera.position.y = Math.sin(elapsed * 0.01 * Math.PI * 2) * 1.2;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);

      // Throttled HUD update.
      hudTimer += frameDt;
      if (hudTimer > 0.12) {
        hudTimer = 0;
        const d = dreamRef.current;
        setHud({
          notes: learnedNotes,
          energy: res.energy(),
          mode: d < 0.18 ? "closed-orbit" : d > 0.72 ? "dream / unwinding" : "unwinding",
        });
        if (autoSweepRef.current) setDream(d);
      }
    };
    rafRef.current = requestAnimationFrame(animate);

    // ── Teardown ────────────────────────────────────────────────────────────────
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      ribbonGeo.dispose();
      ribbonMat.dispose();
      glowMat.dispose();
      unitGeo.dispose();
      unitMat.dispose();
      headGeo.dispose();
      headMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      reservoirRef.current = null;
    };
    // Intentionally run once on mount; live values are read via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Audio + mic teardown on unmount (separate from the render effect).
  const micStop = mic.stop;
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      droneRef.current?.stop();
      voices.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      });
      voices.clear();
      masterRef.current?.disconnect();
      void ctxRef.current?.close();
      micStop();
    };
  }, [micStop]);

  // ── UI ────────────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Recall Orbit
        </h1>
        <p className="mt-1 max-w-2xl text-base text-muted-foreground">
          A melody, seen as the orbit of a living neural mind. A trained echo-state
          reservoir remembers a phrase exactly — a clean closed loop. Turn up{" "}
          <span className="text-foreground">dream</span> and the loop unwinds into a
          wandering attractor that never repeats.
        </p>
      </header>

      <div className="relative overflow-hidden rounded-lg border border-border">
        <div
          ref={mountRef}
          className="aspect-[16/10] w-full bg-background"
          aria-label="3-D phase-portrait ribbon of the reservoir state"
        />
        {!webglOk && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-base text-muted-foreground">
              This view needs WebGL, which is unavailable in this browser. The
              reservoir still runs — try a hardware-accelerated browser to see its
              orbit.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="absolute right-3 top-3 rounded-md border border-border bg-background/60 px-3 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* Controls */}
      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="dream"
              className="text-sm font-medium text-foreground"
            >
              memory <span className="text-muted-foreground">⟷</span> dream
            </label>
            <span className="text-sm tabular-nums text-muted-foreground">
              {dream.toFixed(2)} · {hud.mode}
            </span>
          </div>
          <input
            id="dream"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={dream}
            onChange={(e) => onDreamInput(parseFloat(e.target.value))}
            className="h-2 w-full cursor-pointer accent-primary"
          />
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span>notes learned: <span className="text-foreground tabular-nums">{hud.notes}</span></span>
            <span>·</span>
            <span>energy: <span className="text-foreground tabular-nums">{hud.energy.toFixed(3)}</span></span>
            {!autoSweep && (
              <button
                type="button"
                onClick={resumeAutoSweep}
                className="ml-auto rounded-md border border-border bg-background/60 px-3 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Resume auto-sweep
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={toggleSound}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {soundOn ? "Sound off" : "Sound on"}
          </button>
          <button
            type="button"
            onClick={startRecording}
            disabled={recording}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {recording ? "Listening…" : "Sing / play a phrase"}
          </button>
        </div>

        {micNote && (
          <p
            className={`text-sm ${
              mic.error ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {micNote}
          </p>
        )}
      </div>

      {/* Design notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A genuine <span className="text-foreground">Echo-State Network</span>{" "}
                (Jaeger 2001) runs the mind: 180 units under a fixed sparse recurrent
                matrix rescaled to spectral radius ρ, driven only by a phase clock.
                Its fading-memory dynamics turn that clock into a rich,
                high-dimensional limit cycle.
              </p>
              <p>
                Unlike the fixed-random readouts of its predecessor{" "}
                <span className="text-foreground">10984 · echofold</span> (which could
                only drift), the readout here is genuinely{" "}
                <span className="text-foreground">trained</span> by ridge / Tikhonov
                regression (Lukoševičius &amp; Jaeger 2009), solved with a Cholesky
                factorisation. So the reservoir reproduces the taught phrase{" "}
                <span className="text-foreground">exactly</span>.
              </p>
              <p>
                We project the 180-D state to 3-D through a fixed random projection and
                draw the trajectory as a glowing ribbon — memory as geometry. At
                dream ≈ 0 it is a clean closed orbit; as dream → 1 the clock&apos;s grip
                fades, ρ crosses the edge of chaos, and the loop unwinds into a
                wandering attractor that never returns.
              </p>
              <p>
                Sing a phrase and it retrains on your melody. On a muted screen it
                auto-sweeps dream 0→1→0 so the whole arc plays on its own.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
