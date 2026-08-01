"use client";

// ════════════════════════════════════════════════════════════════════════════
// 4728 — rubato
// "What if an accompanist could breathe with your rubato — no score, no click,
//  no AI model — just an ensemble that follows the time you feel?"
//
// You tap/play a melody freely on the keyboard (or the pad). A hand-rolled
// ATTENDING OSCILLATOR (Large & Jones 1999) infers your felt beat from the
// *timing* of key events — NOT audio, NOT FFT, NO score, NO learned model —
// and a bass+chords+pad trio lays notes IN TIME with that inferred beat,
// speeding up when you rush and stretching when you hold. See README.md.
//
// References: Large & Jones (1999), "The Dynamics of Attending"; the
// ACCompanion (Cancino-Chacón et al., arXiv:2304.12939). It deliberately does
// the OPPOSITE of the 2026 frontier — "Real-Time Language Model Jamming"
// (arXiv:2606.11886) and "Rubato: Transcribing Piano Music with Timestamps"
// (arXiv:2605.24291): no model, no transcript, a hand-rolled oscillator
// following FREE rubato.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Ensemble, MELODY_MIDI } from "./audio";
import {
  applyOnset,
  computePhase,
  currentBpm,
  makeAttendingOsc,
  nextBeatAfter,
  type AttendingOsc,
} from "./tracker";
import { makeDemo, stepDemo, type Demo } from "./demo";

const SEED = 0x4728abcd;
const MELODY_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"];
const LOOK_AHEAD = 0.12;

// Brand-violet art palette (raw hex is allowed inside the three.js art only).
const C_BASS = new THREE.Color(0x6d28d9);
const C_CHORD = new THREE.Color(0x8b5cf6);
const C_PAD = new THREE.Color(0xa78bfa);
const C_RING = new THREE.Color(0x7c3aed);
const C_MARK = new THREE.Color(0xc4b5fd);

interface Body {
  pivot: THREE.Group;
  bob: THREE.Mesh;
  bobMat: THREE.MeshStandardMaterial;
  haloMat: THREE.MeshBasicMaterial;
  halo: THREE.Mesh;
  base: THREE.Color;
  offset: number; // swing phase offset
  every: number; // flashes on beats where beatIndex % every === 0
  rad: number; // resting bob radius scale (× the 0.44 base sphere)
  pulse: number;
}

interface Spark {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  vy: number;
}

interface Scene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  bodies: Body[];
  ringMat: THREE.MeshStandardMaterial;
  marker: THREE.Mesh;
  markerMat: THREE.MeshStandardMaterial;
  sparks: Spark[];
  sparkCursor: number;
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
}

interface SchedState {
  nextBeat: number; // perf seconds of the next predicted beat, 0 = uninit
  beatIndex: number;
  pending: { t: number; i: number }[]; // visual flashes waiting for their instant
}

const NOTES: { h: string; p: string }[] = [
  {
    h: "The one question",
    p: "What if an accompanist could breathe with your rubato — no score, no click, no AI model — just an ensemble that follows the time you feel? Play a melody freely on the keyboard (rush, drag, hold). A hand-rolled beat tracker infers your intended beat from the timing alone, and a bass+chords+pad trio lays notes in time with it — speeding up when you rush, stretching when you hold.",
  },
  {
    h: "The attending oscillator",
    p: "The tracker is a nonlinear attending oscillator after Large & Jones (1999), \"The Dynamics of Attending.\" It keeps a continuous phase φ and a period p. On every key onset it applies gated period coupling — a von-Mises-style focus gate pulls p toward the observed inter-onset interval, strong near an expected beat and weak off-beat, so it is stable yet responsive — and a phase reset that nudges the beat grid onto your onset. No audio spectrum, no FFT, no score, no learned model.",
  },
  {
    h: "The look-ahead scheduler",
    p: "Onsets are timed on performance.now(); a fixed perf→audio offset maps each predicted beat onto sample-accurate Web Audio time. Every frame the scheduler asks the oscillator for beats a short window into the future and schedules bass, chord stabs, and a soft pad from a small diatonic jazz turnaround — advancing on beats and bars. The 3D pendulum trio swings on the beat phase and pulses on each scheduled beat; the phase ring brightens as the lock tightens and dims when you disrupt the tempo.",
  },
  {
    h: "The opposite of the 2026 frontier",
    p: "This deliberately does the OPPOSITE of today's frontier accompanists — the ACCompanion (Cancino-Chacón et al., arXiv:2304.12939), \"Real-Time Language Model Jamming\" (arXiv:2606.11886, 2026), and \"Rubato: Transcribing Piano Music with Timestamps\" (arXiv:2605.24291, 2026). No score to align to, no transcript, no learned model — just a hand-rolled oscillator that follows your free rubato and cooperates rather than leads.",
  },
  {
    h: "Controls & honesty",
    p: "Keys a s d f g h j k play a C-major row and set the beat; space is a neutral tap; the big pad works on touch. A seeded scripted player demonstrates rush-and-hold hands-free until you take over. Honest limits: it tracks a single tactus (roughly one note per beat), can be fooled by very syncopated input, assumes a fixed key/progression, and the perf→audio clock mapping is a fixed offset, so audio may drift a few ms over long sessions.",
  },
];

export default function RubatoPage() {
  const [audioOn, setAudioOn] = useState(false);
  const [muted, setMuted] = useState(false);
  const [glError, setGlError] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [hud, setHud] = useState({ bpm: 0, chord: "—", lock: 0, you: false });

  const mountRef = useRef<HTMLDivElement>(null);
  const fallbackMarkRef = useRef<HTMLDivElement>(null);

  const oscRef = useRef<AttendingOsc>(makeAttendingOsc(0.5));
  const ensembleRef = useRef<Ensemble>(new Ensemble());
  const demoRef = useRef<Demo>(makeDemo(SEED));
  const sceneRef = useRef<Scene | null>(null);
  const schedRef = useRef<SchedState>({ nextBeat: 0, beatIndex: 0, pending: [] });

  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const userTookOverRef = useRef(false);
  const lastPhaseRef = useRef(0);
  const lastHudRef = useRef(0);
  const tapDegreeRef = useRef(0);
  const glErrRef = useRef(false);

  // ── register one onset (from the demo, a key, or a tap) ──────────────────
  const fireOnset = useCallback((at: number, degree: number, sound: boolean) => {
    const osc = oscRef.current;
    applyOnset(osc, at);
    const scn = sceneRef.current;
    if (scn) {
      const s = scn.sparks[scn.sparkCursor % scn.sparks.length];
      scn.sparkCursor += 1;
      s.life = 1;
      s.vy = 2.4;
      s.mesh.position.set(-2.2 + (degree / 7) * 4.4, -1.1, 0.6);
      s.mesh.visible = true;
    }
    if (sound && ensembleRef.current.started) {
      ensembleRef.current.playMelody(
        440 * Math.pow(2, (MELODY_MIDI[degree] - 69) / 12)
      );
    }
  }, []);

  // ── a real user interaction: start audio + stop the demo ─────────────────
  const takeOver = useCallback(() => {
    userTookOverRef.current = true;
    const started = ensembleRef.current.ensureStarted();
    if (started) setAudioOn(true);
  }, []);

  // ── build the three.js scene ─────────────────────────────────────────────
  const buildScene = useCallback((): boolean => {
    const mount = mountRef.current;
    if (!mount) return false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return false;
    }
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || Math.max(window.innerHeight - 48, 320);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 100);
    camera.position.set(0, 0.5, 7.2);
    camera.lookAt(0, 0.1, 0);

    scene.add(new THREE.AmbientLight(0x5b4b8a, 1.4));
    const key = new THREE.PointLight(0xb9a3ff, 40, 40);
    key.position.set(0, 3.5, 5);
    scene.add(key);

    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    const rodGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.8, 8);
    const bobGeo = new THREE.SphereGeometry(0.44, 32, 24);
    const haloGeo = new THREE.SphereGeometry(0.6, 24, 18);
    geos.push(rodGeo, bobGeo, haloGeo);

    const specs: { x: number; base: THREE.Color; offset: number; every: number; r: number }[] = [
      { x: -2.5, base: C_BASS, offset: 0, every: 1, r: 0.52 },
      { x: 0, base: C_CHORD, offset: Math.PI, every: 2, r: 0.44 },
      { x: 2.5, base: C_PAD, offset: 0, every: 4, r: 0.38 },
    ];

    const bodies: Body[] = specs.map((sp) => {
      const pivot = new THREE.Group();
      pivot.position.set(sp.x, 2.0, 0);
      scene.add(pivot);

      const rodMat = new THREE.MeshStandardMaterial({
        color: 0x2a2340,
        emissive: sp.base,
        emissiveIntensity: 0.15,
        roughness: 0.6,
      });
      mats.push(rodMat);
      const rod = new THREE.Mesh(rodGeo, rodMat);
      rod.position.y = -0.9;
      pivot.add(rod);

      const bobMat = new THREE.MeshStandardMaterial({
        color: sp.base.clone().multiplyScalar(0.5),
        emissive: sp.base,
        emissiveIntensity: 0.6,
        roughness: 0.35,
        metalness: 0.1,
      });
      mats.push(bobMat);
      const bob = new THREE.Mesh(bobGeo, bobMat);
      bob.position.y = -1.8;
      bob.scale.setScalar(sp.r / 0.44);
      pivot.add(bob);

      const haloMat = new THREE.MeshBasicMaterial({
        color: sp.base,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      mats.push(haloMat);
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = -1.8;
      halo.scale.setScalar(sp.r / 0.44);
      pivot.add(halo);

      return {
        pivot,
        bob,
        bobMat,
        halo,
        haloMat,
        base: sp.base,
        offset: sp.offset,
        every: sp.every,
        rad: sp.r / 0.44,
        pulse: 0,
      };
    });

    // ── beat-phase ring + orbiting marker + quarter ticks ──
    const ringGeo = new THREE.TorusGeometry(1.5, 0.045, 16, 96);
    geos.push(ringGeo);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x241a3a,
      emissive: C_RING,
      emissiveIntensity: 0.4,
      roughness: 0.5,
    });
    mats.push(ringMat);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, -1.15, 0);
    scene.add(ring);

    const tickGeo = new THREE.SphereGeometry(0.06, 12, 10);
    geos.push(tickGeo);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0x6d5aa0 });
    mats.push(tickMat);
    for (let q = 0; q < 4; q++) {
      const a = (q / 4) * Math.PI * 2 + Math.PI / 2;
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.position.set(Math.cos(a) * 1.5, -1.15 + Math.sin(a) * 1.5, 0);
      scene.add(tick);
    }

    const markGeo = new THREE.SphereGeometry(0.16, 20, 16);
    geos.push(markGeo);
    const markerMat = new THREE.MeshStandardMaterial({
      color: C_MARK.clone().multiplyScalar(0.4),
      emissive: C_MARK,
      emissiveIntensity: 1.2,
      roughness: 0.3,
    });
    mats.push(markerMat);
    const marker = new THREE.Mesh(markGeo, markerMat);
    ring.add(marker);

    // ── melody sparks (reused pool) ──
    const sparkGeo = new THREE.SphereGeometry(0.09, 12, 10);
    geos.push(sparkGeo);
    const sparks: Spark[] = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: C_MARK,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      mats.push(mat);
      const mesh = new THREE.Mesh(sparkGeo, mat);
      mesh.visible = false;
      scene.add(mesh);
      sparks.push({ mesh, mat, life: 0, vy: 0 });
    }

    sceneRef.current = {
      renderer,
      scene,
      camera,
      bodies,
      ringMat,
      marker,
      markerMat,
      sparks,
      sparkCursor: 0,
      geos,
      mats,
    };
    return true;
  }, []);

  // ── main loop + full lifecycle ──────────────────────────────────────────
  useEffect(() => {
    const ok = buildScene();
    if (!ok) {
      glErrRef.current = true;
      setGlError(true);
    }
    const ensemble = ensembleRef.current;

    const onResize = () => {
      const scn = sceneRef.current;
      const mount = mountRef.current;
      if (!scn || !mount) return;
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || Math.max(window.innerHeight - 48, 320);
      scn.camera.aspect = w / h;
      scn.camera.updateProjectionMatrix();
      scn.renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const step = () => {
      const now = performance.now() / 1000;
      const dt =
        lastFrameRef.current > 0
          ? Math.min(0.05, now - lastFrameRef.current)
          : 0.016;
      lastFrameRef.current = now;

      const osc = oscRef.current;
      const sched = schedRef.current;

      // 1) seeded auto-demo feeds the tracker until the user takes over.
      if (!userTookOverRef.current) {
        const fired = stepDemo(demoRef.current, now);
        if (fired) fireOnset(fired.at, fired.onset.degree, true);
      }

      // 2) the felt beat phase, straight from the oscillator.
      const phase = osc.onsetCount >= 2 ? computePhase(osc, now) : 0;

      // 3) look-ahead scheduler: schedule beats a short window ahead, and
      //    queue a visual flash for each at its exact instant.
      if (osc.onsetCount >= 2) {
        if (sched.nextBeat === 0) {
          sched.nextBeat = nextBeatAfter(osc, now);
          sched.beatIndex = 0;
        }
        let guard = 0;
        while (sched.nextBeat < now + LOOK_AHEAD && guard < 8) {
          if (ensemble.started && sched.nextBeat > now - 0.04) {
            ensemble.scheduleBeat(sched.nextBeat, sched.beatIndex);
          }
          sched.pending.push({ t: sched.nextBeat, i: sched.beatIndex });
          sched.beatIndex += 1;
          sched.nextBeat = nextBeatAfter(osc, sched.nextBeat);
          guard += 1;
        }
      }
      lastPhaseRef.current = phase;

      // 4) fire visual flashes whose instant has arrived.
      const scn = sceneRef.current;
      let flashedChord = "—";
      while (sched.pending.length && sched.pending[0].t <= now) {
        const b = sched.pending.shift();
        if (!b) break;
        flashedChord = ensemble.chordName(b.i);
        if (scn) {
          for (const body of scn.bodies) {
            if (b.i % body.every === 0) body.pulse = 1;
          }
        }
      }

      // 5) render.
      if (scn) {
        const coh = osc.coherence;
        for (const body of scn.bodies) {
          body.pulse *= Math.exp(-dt / 0.16);
          const swing = (0.28 + 0.55 * coh) * Math.sin(phase * Math.PI * 2 + body.offset);
          body.pivot.rotation.z = swing;
          const s = 1 + body.pulse * 0.28;
          body.bob.scale.setScalar(s * body.rad);
          body.bobMat.emissiveIntensity = 0.5 + body.pulse * 2.2;
          body.haloMat.opacity = 0.12 + body.pulse * 0.55;
          body.halo.scale.setScalar((0.9 + body.pulse * 0.5) * body.rad);
        }
        // ring reflects lock confidence; marker orbits on the phase.
        scn.ringMat.emissiveIntensity = 0.25 + coh * 1.3;
        const a = -phase * Math.PI * 2 + Math.PI / 2;
        scn.marker.position.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0);
        const beatFlash = Math.exp(-((phase < 0.5 ? phase : 1 - phase) ** 2) / 0.01);
        scn.markerMat.emissiveIntensity = 0.9 + beatFlash * 1.8 + coh;

        for (const sp of scn.sparks) {
          if (sp.life <= 0) continue;
          sp.life -= dt / 1.1;
          sp.mesh.position.y += sp.vy * dt;
          sp.vy *= 0.96;
          sp.mat.opacity = Math.max(0, sp.life) * 0.8;
          sp.mesh.scale.setScalar(0.6 + (1 - sp.life) * 0.8);
          if (sp.life <= 0) sp.mesh.visible = false;
        }
        scn.renderer.render(scn.scene, scn.camera);
      }

      // 6) DOM fallback beat bar (only needed when WebGL failed).
      if (glErrRef.current && fallbackMarkRef.current) {
        fallbackMarkRef.current.style.left = `${phase * 100}%`;
        fallbackMarkRef.current.style.opacity = `${0.4 + osc.coherence * 0.6}`;
      }

      // 7) throttled HUD.
      if (now - lastHudRef.current > 0.12) {
        lastHudRef.current = now;
        setHud({
          bpm: osc.onsetCount >= 2 ? Math.round(currentBpm(osc)) : 0,
          chord: flashedChord !== "—" ? flashedChord : ensemble.chordName(sched.beatIndex),
          lock: Math.round(osc.coherence * 100),
          you: userTookOverRef.current,
        });
      }

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);

    // ── keyboard input ──
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const idx = MELODY_KEYS.indexOf(k);
      if (idx >= 0) {
        takeOver();
        fireOnset(performance.now() / 1000, idx, true);
      } else if (k === " ") {
        e.preventDefault();
        takeOver();
        const d = tapDegreeRef.current % MELODY_MIDI.length;
        tapDegreeRef.current += 2;
        fireOnset(performance.now() / 1000, d, true);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      const scn = sceneRef.current;
      if (scn) {
        for (const g of scn.geos) g.dispose();
        for (const m of scn.mats) m.dispose();
        scn.renderer.dispose();
        const el = scn.renderer.domElement;
        if (el.parentNode) el.parentNode.removeChild(el);
        sceneRef.current = null;
      }
      void ensemble.close();
    };
  }, [buildScene, fireOnset, takeOver]);

  // ── pad tap (touch/pointer) ──
  const onPad = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const frac = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
      const degree = Math.min(
        MELODY_MIDI.length - 1,
        Math.max(0, Math.floor(frac * MELODY_MIDI.length))
      );
      takeOver();
      fireOnset(performance.now() / 1000, degree, true);
    },
    [fireOnset, takeOver]
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nm = !m;
      ensembleRef.current.setMuted(nm);
      return nm;
    });
  }, []);

  const enableSound = useCallback(() => {
    const started = ensembleRef.current.ensureStarted();
    if (started) setAudioOn(true);
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* dark violet stage behind the canvas */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 18%, #17122b 0%, #0c0a16 55%, #08060f 100%)",
        }}
      />

      {/* three.js canvas mount, also the tap pad */}
      <div
        ref={mountRef}
        onPointerDown={onPad}
        className="absolute inset-0 touch-none"
        aria-label="Tap anywhere to play a note and set the beat"
      />

      {/* header / copy */}
      <div className="pointer-events-none relative z-10 px-5 pt-6 sm:px-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          rubato
        </h1>
        <p className="mt-1 max-w-xl text-base text-muted-foreground">
          An accompanist that breathes with your rubato. Play freely — it infers
          your beat from the timing alone and follows.
        </p>
      </div>

      {/* live readout */}
      <div className="pointer-events-none absolute left-5 top-32 z-10 space-y-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground sm:left-8">
        <div>
          following{" "}
          <span className="text-foreground">{hud.you ? "you" : "demo"}</span>
        </div>
        <div>
          tempo <span className="text-foreground">{hud.bpm || "—"}</span> bpm
        </div>
        <div>
          chord <span className="text-foreground">{hud.chord}</span>
        </div>
        <div>
          lock <span className="text-foreground">{hud.lock}%</span>
        </div>
      </div>

      {glError && (
        <div className="absolute inset-x-5 top-40 z-10 sm:inset-x-8">
          <p className="text-base text-destructive">
            WebGL is unavailable, so the 3D ensemble can&apos;t render — but the
            beat tracker and audio still run. The bar below shows the inferred
            beat phase.
          </p>
          <div className="relative mt-4 h-3 w-full overflow-hidden rounded-md border border-border bg-background/60">
            <div
              ref={fallbackMarkRef}
              className="absolute top-0 h-full w-1 -translate-x-1/2 rounded-sm bg-primary"
              style={{ left: "0%" }}
            />
          </div>
        </div>
      )}

      {/* controls */}
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-wrap items-center justify-center gap-3 px-5">
        {!audioOn ? (
          <button
            onClick={enableSound}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Play along — enable sound
          </button>
        ) : (
          <button
            onClick={toggleMute}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        )}
        <button
          onClick={() => setNotesOpen(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Design notes
        </button>
      </div>

      {/* key hint */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        keys a s d f g h j k · space taps · or tap the stage
      </div>

      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                4728 · rubato · design notes
              </span>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-4">
              {NOTES.map((n) => (
                <div key={n.h}>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    {n.h}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {n.p}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
