"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import * as THREE from "three";

/* ============================================================
   645 · KIDS PIANO CREATURES
   "What if a 4-year-old could PLAY a real keyboard and instantly
    sound like a musician — every note blooms a living creature,
    and an invisible band plays along so there are no wrong notes?"

   INPUT  : Web MIDI (primary) + computer keyboard (fallback) + on-screen pads
   OUTPUT : three.js glowing note-creatures in a 3D garden
   ENGINE : scale-snap (no wrong notes) + look-ahead scheduler driving
            an auto-harmony pad, walking bass, and a growing groove bed.
   ============================================================ */

// ---- Musical material -------------------------------------------------
// C major pentatonic, two octaves. MIDI -> nearest pentatonic degree.
// Pitch classes present: C(0) D(2) E(4) G(7) A(9)
const PENTA_PCS = [0, 2, 4, 7, 9];

// Frequency for any midi note.
function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Snap an incoming midi note to the nearest pentatonic note (same-ish register).
function snapToPenta(m: number): number {
  const octave = Math.floor(m / 12);
  const pc = m - octave * 12;
  let best = PENTA_PCS[0];
  let bestD = 99;
  for (const p of PENTA_PCS) {
    const d = Math.abs(p - pc);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return octave * 12 + best;
}

// Pitch class (0-11) -> friendly saturated glow color.
const PC_COLORS: Record<number, string> = {
  0: "#a78bfa", // C  violet
  2: "#60a5fa", // D  blue
  4: "#34d399", // E  emerald
  7: "#fbbf24", // G  amber
  9: "#f472b6", // A  rose
};
function pcColor(m: number): string {
  const pc = ((m % 12) + 12) % 12;
  return PC_COLORS[pc] ?? "#fcd34d";
}

// ---- Computer-keyboard layout (no reading required: just bash) --------
// Upper row = higher octave, lower row = lower octave. Mapped onto pentatonic.
const KEY_MAP: Record<string, number> = {
  // lower octave (C3 region)
  z: 48, x: 50, c: 52, v: 55, b: 57, n: 60, m: 62,
  // upper octave (C4-C5 region)
  a: 60, w: 62, s: 64, e: 67, d: 69, f: 72, t: 74, g: 76, y: 79, h: 81, u: 84, j: 86, k: 88,
};

// On-screen pads (last-resort): one per pentatonic note across ~1.5 octaves.
const PAD_NOTES = [60, 62, 64, 67, 69, 72, 74, 76];

// ---- Accompaniment chord progression (advances over time) -------------
// Each chord = root midi + pad pitch classes (relative to C). Diatonic to C major,
// always consonant under the pentatonic melody.
interface Chord {
  name: string;
  bass: number; // midi root for bass
  pad: number[]; // midi notes for the pad
}
const PROGRESSION: Chord[] = [
  { name: "C", bass: 36, pad: [60, 64, 67] }, // C  E  G
  { name: "Am", bass: 33, pad: [57, 60, 64] }, // A  C  E
  { name: "F", bass: 29, pad: [57, 60, 65] }, // F  A  C
  { name: "G", bass: 31, pad: [55, 59, 62] }, // G  B  D
  { name: "C", bass: 36, pad: [60, 64, 67] },
  { name: "F", bass: 29, pad: [57, 60, 65] },
  { name: "Am", bass: 33, pad: [57, 60, 64] },
  { name: "G", bass: 31, pad: [55, 59, 62] },
];

// ---- Types ------------------------------------------------------------
interface CreatureSpec {
  midi: number;
  color: string;
}

export default function KidsPianoCreaturesPage() {
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [vol, setVol] = useState(0.55);
  const [midiStatus, setMidiStatus] = useState<"none" | "ok" | "denied">("none");
  const [webglOk, setWebglOk] = useState(true);
  const [showPads, setShowPads] = useState(false);
  const [ghostActive, setGhostActive] = useState(true);
  const [energyUi, setEnergyUi] = useState(0);

  // Audio graph refs
  const acRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);

  // Scheduler state
  const schedTimerRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const stepRef = useRef(0); // 16th-note step counter
  const chordIdxRef = useRef(0);
  const energyRef = useRef(0); // 0..1 child activity level
  const lastInputRef = useRef(0); // performance.now of last real input
  const recentNotesRef = useRef<number[]>([]);

  // Visual bridge: queue of creatures to spawn/pulse, read by three loop
  const spawnQueueRef = useRef<CreatureSpec[]>([]);
  const threeApiRef = useRef<{
    setEnergy: (e: number) => void;
  } | null>(null);

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const heldKeysRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------
  // VOICE: warm marimba/bell pluck for child notes
  // ---------------------------------------------------------------
  const playVoice = useCallback((midi: number, velocity = 0.8) => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    const snapped = snapToPenta(midi);
    const hz = midiToHz(snapped);

    const now = ac.currentTime;
    const g = ac.createGain();
    const v = Math.min(0.5, 0.18 + velocity * 0.22);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(v, now + 0.012); // soft attack
    g.gain.exponentialRampToValueAtTime(0.0008, now + 1.6);

    // two partials -> bell-ish warmth
    const o1 = ac.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = hz;
    const o2 = ac.createOscillator();
    o2.type = "sine";
    o2.frequency.value = hz * 2.01;
    const g2 = ac.createGain();
    g2.gain.value = 0.25;

    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(master);
    o1.start(now);
    o2.start(now);
    o1.stop(now + 1.7);
    o2.stop(now + 1.7);

    // visual + activity bookkeeping
    spawnQueueRef.current.push({ midi: snapped, color: pcColor(snapped) });
    recentNotesRef.current.push(snapped);
    if (recentNotesRef.current.length > 12) recentNotesRef.current.shift();
  }, []);

  // Called for ANY real input (hands control from ghost to child)
  const onRealInput = useCallback((midi: number, velocity = 0.85) => {
    lastInputRef.current = performance.now();
    if (ghostActive) setGhostActive(false);
    energyRef.current = Math.min(1, energyRef.current + 0.22);
    playVoice(midi, velocity);
  }, [ghostActive, playVoice]);

  // ---------------------------------------------------------------
  // ACCOMPANIMENT VOICES (pad / bass / drums) — scheduled ahead
  // ---------------------------------------------------------------
  const playPadNote = useCallback((midi: number, t: number, dur: number, gain: number) => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = midiToHz(midi);
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1100;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.25); // very soft swell
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f);
    f.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }, []);

  const playBassNote = useCallback((midi: number, t: number, dur: number, gain: number) => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = midiToHz(midi);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }, []);

  const playDrum = useCallback((t: number, kind: "kick" | "hat", gain: number) => {
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    if (kind === "kick") {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
      const g = ac.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.18);
    } else {
      // soft noise hat
      const len = Math.floor(ac.sampleRate * 0.05);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = 6000;
      const g = ac.createGain();
      g.gain.value = gain;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
    }
  }, []);

  // ---------------------------------------------------------------
  // LOOK-AHEAD SCHEDULER (Chris Wilson pattern)
  // ---------------------------------------------------------------
  const BPM = 96;
  const secPerStep = 60 / BPM / 4; // 16th note

  const scheduleStep = useCallback((step: number, t: number) => {
    const energy = energyRef.current;
    const beat = step % 16; // 16 steps per bar

    // advance chord every bar
    if (beat === 0) {
      chordIdxRef.current = (chordIdxRef.current + 1) % PROGRESSION.length;
    }
    const chord = PROGRESSION[chordIdxRef.current];

    // (a) PAD — sustained chord, swells once per bar; louder with energy
    if (beat === 0) {
      const padGain = 0.05 + energy * 0.05;
      chord.pad.forEach((m, i) => {
        playPadNote(m, t + i * 0.01, secPerStep * 16 * 1.05, padGain);
      });
    }

    // (b) BASS — walking root/fifth, every quarter note
    if (beat % 4 === 0) {
      const pattern = [0, 7, 12, 7]; // root, fifth, octave, fifth
      const idx = (beat / 4) % 4;
      const bn = chord.bass + pattern[idx];
      playBassNote(bn, t, secPerStep * 4 * 0.9, 0.12 + energy * 0.05);
    }

    // (c) GROOVE BED — grows with energy
    // kick on 0 and 8 always; extra kick & hats appear with energy
    if (beat === 0 || beat === 8) playDrum(t, "kick", 0.28 + energy * 0.12);
    if (energy > 0.35 && beat === 10) playDrum(t, "kick", 0.22);
    // hats: sparse when calm, busier when energetic
    const hatGain = 0.04 + energy * 0.06;
    if (energy > 0.15 && beat % 4 === 2) playDrum(t, "hat", hatGain);
    if (energy > 0.55 && beat % 2 === 1) playDrum(t, "hat", hatGain * 0.8);
  }, [playPadNote, playBassNote, playDrum, secPerStep]);

  // Ghost player: auto-plays a gentle evolving melody when idle
  const ghostPhraseRef = useRef(0);
  const maybeGhost = useCallback((step: number, t: number) => {
    const idle = performance.now() - lastInputRef.current > 2500;
    if (!idle) return;
    // play on a sparse, musical subdivision
    const beat = step % 16;
    const ghostSteps = [0, 3, 6, 8, 11, 14];
    if (!ghostSteps.includes(beat)) return;
    // pentatonic melody notes drifting upward then resetting
    const melody = [60, 64, 67, 69, 72, 69, 67, 64, 72, 76, 74, 72];
    const note = melody[ghostPhraseRef.current % melody.length];
    ghostPhraseRef.current++;
    // schedule the ghost voice at t (slightly future) using setTimeout-free path:
    // queue a creature + a voice played now-ish. Use a scaled gain via playVoice.
    const ac = acRef.current;
    const master = masterRef.current;
    if (!ac || !master) return;
    const snapped = snapToPenta(note);
    const o1 = ac.createOscillator();
    o1.type = "triangle";
    o1.frequency.value = midiToHz(snapped);
    const o2 = ac.createOscillator();
    o2.type = "sine";
    o2.frequency.value = midiToHz(snapped) * 2.01;
    const g2 = ac.createGain();
    g2.gain.value = 0.22;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.4);
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(master);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 1.5);
    o2.stop(t + 1.5);
    // visual: spawn on the beat (queue for three loop)
    spawnQueueRef.current.push({ midi: snapped, color: pcColor(snapped) });
    // gentle energy so the band keeps grooving softly during demo
    energyRef.current = Math.max(energyRef.current, 0.3);
  }, []);

  const schedulerTick = useCallback(() => {
    const ac = acRef.current;
    if (!ac) return;
    const lookAhead = 0.12; // schedule 120ms ahead
    while (nextNoteTimeRef.current < ac.currentTime + lookAhead) {
      const t = nextNoteTimeRef.current;
      const step = stepRef.current;
      scheduleStep(step, t);
      maybeGhost(step, t);
      // energy decay over time (band thins when child rests)
      energyRef.current = Math.max(0, energyRef.current - 0.012);
      nextNoteTimeRef.current += secPerStep;
      stepRef.current = step + 1;
    }
    schedTimerRef.current = window.setTimeout(schedulerTick, 25); // 25ms poll
  }, [scheduleStep, maybeGhost, secPerStep]);

  // Mirror energy to UI + three at a relaxed cadence
  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => {
      setEnergyUi(energyRef.current);
      threeApiRef.current?.setEnergy(energyRef.current);
    }, 120);
    return () => window.clearInterval(id);
  }, [started]);

  // ---------------------------------------------------------------
  // MASTER CHAIN + START (inside user gesture for iOS)
  // ---------------------------------------------------------------
  const buildAudio = useCallback(() => {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctor();
    const master = ac.createGain();
    master.gain.value = vol;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7500; // kid-safe brightness cap
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 6;
    comp.knee.value = 12;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;

    master.connect(lp);
    lp.connect(comp);
    comp.connect(ac.destination);

    // a never-silent gentle bed hum under everything
    const bed = ac.createGain();
    bed.gain.value = 0.025;
    const bo = ac.createOscillator();
    bo.type = "sine";
    bo.frequency.value = midiToHz(36); // low C drone
    const bo2 = ac.createOscillator();
    bo2.type = "sine";
    bo2.frequency.value = midiToHz(43);
    const bg2 = ac.createGain();
    bg2.gain.value = 0.5;
    bo.connect(bed);
    bo2.connect(bg2);
    bg2.connect(bed);
    bed.connect(master);
    bo.start();
    bo2.start();

    acRef.current = ac;
    masterRef.current = master;
    return ac;
  }, [vol]);

  const handleStart = useCallback(async () => {
    if (started) return;
    const ac = buildAudio();
    if (ac.state === "suspended") {
      try { await ac.resume(); } catch { /* ignore */ }
    }
    // start scheduler
    nextNoteTimeRef.current = ac.currentTime + 0.08;
    stepRef.current = 0;
    chordIdxRef.current = 0;
    lastInputRef.current = performance.now() - 3000; // start in ghost mode
    setGhostActive(true);
    schedulerTick();
    setStarted(true);

    // Web MIDI (feature-detected; types from the DOM lib when present)
    const navMidi = navigator as Navigator & {
      requestMIDIAccess?: () => Promise<MIDIAccess>;
    };
    if (navMidi.requestMIDIAccess) {
      try {
        const access = await navMidi.requestMIDIAccess();
        const wire = () => {
          let any = false;
          access.inputs.forEach((input) => {
            any = true;
            input.onmidimessage = (e: MIDIMessageEvent) => {
              const data = e.data;
              if (!data || data.length < 3) return;
              const [status, note, vel] = data;
              const cmd = status & 0xf0;
              if (cmd === 0x90 && vel > 0) {
                onRealInput(note, vel / 127);
              }
            };
          });
          setMidiStatus(any ? "ok" : "none");
        };
        wire();
        access.onstatechange = wire; // hot-plug
      } catch {
        setMidiStatus("denied");
      }
    } else {
      setMidiStatus("none");
    }

    // show pads if touch device with no MIDI
    const isTouch = typeof window !== "undefined" && "ontouchstart" in window;
    if (isTouch) setShowPads(true);
  }, [started, buildAudio, schedulerTick, onRealInput]);

  // ---------------------------------------------------------------
  // COMPUTER KEYBOARD
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!started) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (heldKeysRef.current.has(k)) return; // no auto-repeat
      const m = KEY_MAP[k];
      if (m === undefined) return;
      heldKeysRef.current.add(k);
      e.preventDefault();
      onRealInput(m, 0.85);
    };
    const up = (e: KeyboardEvent) => {
      heldKeysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [started, onRealInput]);

  // ---------------------------------------------------------------
  // VOLUME / MUTE
  // ---------------------------------------------------------------
  useEffect(() => {
    const m = masterRef.current;
    const ac = acRef.current;
    if (!m || !ac) return;
    const target = muted ? 0 : vol;
    m.gain.setTargetAtTime(target, ac.currentTime, 0.03);
  }, [muted, vol, started]);

  // ---------------------------------------------------------------
  // THREE.JS GARDEN
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!started) return;
    const mount = canvasMountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglOk(false);
      return;
    }
    const testGl = renderer.getContext();
    if (!testGl) {
      setWebglOk(false);
      renderer.dispose();
      return;
    }

    const w = mount.clientWidth;
    const h = mount.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x05060f, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060f, 0.035);
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
    camera.position.set(0, 1.5, 11);

    const amb = new THREE.AmbientLight(0x334466, 0.6);
    scene.add(amb);

    // floor grid of faint dots
    const floorGeo = new THREE.PlaneGeometry(40, 40, 1, 1);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x0a0c1c });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.2;
    scene.add(floor);

    // Creature pool
    interface Creature {
      group: THREE.Group;
      core: THREE.Mesh;
      glow: THREE.Mesh;
      mat: THREE.MeshStandardMaterial;
      glowMat: THREE.MeshBasicMaterial;
      light: THREE.PointLight;
      midi: number;
      level: number; // 0..1 pulse
      baseScale: number;
      orbitR: number;
      orbitA: number; // angle
      orbitSpeed: number;
      yPhase: number;
      alive: boolean;
    }
    const creatures: Creature[] = [];
    const MAX_CREATURES = 24;
    const coreGeo = new THREE.SphereGeometry(0.42, 20, 20);
    const glowGeo = new THREE.SphereGeometry(0.62, 16, 16);

    const findCreature = (midi: number): Creature | undefined =>
      creatures.find((c) => c.alive && c.midi === midi);

    const spawnOrPulse = (midi: number, colorHex: string) => {
      const existing = findCreature(midi);
      if (existing) {
        existing.level = 1;
        return;
      }
      const color = new THREE.Color(colorHex);
      let c: Creature | undefined = creatures.find((cc) => !cc.alive);
      if (!c && creatures.length < MAX_CREATURES) {
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 1.4,
          roughness: 0.35,
          metalness: 0.1,
        });
        const core = new THREE.Mesh(coreGeo, mat);
        const glowMat = new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        const light = new THREE.PointLight(color, 1.5, 8);
        group.add(core);
        group.add(glow);
        group.add(light);
        scene.add(group);
        c = {
          group, core, glow, mat, glowMat, light,
          midi, level: 1, baseScale: 1, orbitR: 0, orbitA: 0,
          orbitSpeed: 0, yPhase: 0, alive: true,
        };
        creatures.push(c);
      }
      if (!c) {
        // reuse oldest
        c = creatures.reduce((a, b) => (a.level < b.level ? a : b));
      }
      // configure
      c.alive = true;
      c.midi = midi;
      c.level = 1;
      c.mat.color = color;
      c.mat.emissive = color;
      c.glowMat.color = color;
      c.light.color = color;
      // position by pitch: higher notes orbit higher & wider
      const reg = (midi - 48) / 40; // ~0..1
      c.orbitR = 3 + reg * 4 + Math.random() * 0.6;
      c.orbitA = Math.random() * Math.PI * 2;
      c.orbitSpeed = 0.12 + Math.random() * 0.18 + reg * 0.1;
      c.baseScale = 0.7 + reg * 0.8;
      c.yPhase = Math.random() * Math.PI * 2;
      c.group.position.y = (reg - 0.5) * 4;
    };

    let energy = 0;
    let raf = 0;
    const clock = new THREE.Clock();

    const onResize = () => {
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      const tt = clock.elapsedTime;

      // drain spawn queue
      const q = spawnQueueRef.current;
      while (q.length) {
        const s = q.shift();
        if (s) spawnOrPulse(s.midi, s.color);
      }

      for (const c of creatures) {
        if (!c.alive) continue;
        c.orbitA += c.orbitSpeed * dt * (0.6 + energy * 0.8);
        const x = Math.cos(c.orbitA) * c.orbitR;
        const z = Math.sin(c.orbitA) * c.orbitR;
        const yb = c.group.position.y;
        c.group.position.set(x, yb + Math.sin(tt * 0.8 + c.yPhase) * 0.3, z);
        // pulse decays
        c.level *= 0.94;
        const pulse = 1 + c.level * 0.9;
        const s = c.baseScale * pulse;
        c.core.scale.setScalar(s);
        c.glow.scale.setScalar(s * (1.1 + c.level * 0.6));
        c.mat.emissiveIntensity = 1.0 + c.level * 2.2;
        c.glowMat.opacity = 0.18 + c.level * 0.4;
        c.light.intensity = 0.6 + c.level * 2.5;
        c.core.rotation.y += dt * 0.6;
        c.core.rotation.x += dt * 0.3;
      }

      // scene breathes with energy: camera gentle bob + bg lift
      camera.position.y = 1.5 + Math.sin(tt * 0.5) * 0.4 + energy * 0.3;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    };
    animate();

    threeApiRef.current = {
      setEnergy: (e) => { energy = e; },
    };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      creatures.forEach((c) => {
        c.group.removeFromParent();
      });
      coreGeo.dispose();
      glowGeo.dispose();
      creatures.forEach((c) => {
        c.mat.dispose();
        c.glowMat.dispose();
      });
      floorGeo.dispose();
      floorMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      threeApiRef.current = null;
    };
  }, [started]);

  // ---------------------------------------------------------------
  // CLEANUP scheduler + audio on unmount
  // ---------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (schedTimerRef.current) window.clearTimeout(schedTimerRef.current);
      const ac = acRef.current;
      if (ac && ac.state !== "closed") {
        ac.close().catch(() => {});
      }
    };
  }, []);

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#05060f] text-white/95 font-sans select-none">
      {/* three canvas */}
      <div ref={canvasMountRef} className="absolute inset-0" />

      {!webglOk && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20 rounded-lg bg-black/60 px-4 py-2.5">
          <p className="text-base text-rose-300">
            Graphics could not start — but the music still plays! Press keys to hear it.
          </p>
        </div>
      )}

      {/* Title + instructions */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 p-5">
        <h1 className="text-2xl font-semibold text-white/95 drop-shadow">
          Piano Creatures
        </h1>
        {started && (
          <p className="mt-1 max-w-sm text-base text-white/75">
            {midiStatus === "ok"
              ? "Play your keyboard — every note grows a creature!"
              : "Press letter keys (A W S E D F...) to play!"}
          </p>
        )}
      </div>

      {/* MIDI status one-liner */}
      {started && midiStatus !== "ok" && (
        <p className="absolute left-5 top-24 z-10 max-w-sm text-base text-rose-300">
          No MIDI keyboard found — press letter keys to play!
        </p>
      )}

      {/* Energy / band meter */}
      {started && (
        <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
          <span className="text-base text-white/75">Band</span>
          <div className="h-2.5 w-28 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400 transition-[width] duration-150"
              style={{ width: `${Math.round(energyUi * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 bg-black/55 px-6 text-center backdrop-blur-sm">
          <h2 className="text-2xl font-semibold text-white/95">
            Play a keyboard. Make a band appear.
          </h2>
          <p className="max-w-md text-base text-white/75">
            Plug in a MIDI piano, or just press the letter keys on your computer.
            Every note you play blooms a glowing creature — and an invisible band
            plays along, so there are no wrong notes.
          </p>
          <button
            onClick={handleStart}
            className="rounded-2xl bg-amber-400 px-8 py-4 text-2xl font-bold text-black shadow-lg transition active:scale-95"
            style={{ minWidth: 200, minHeight: 64 }}
          >
            Begin
          </button>
        </div>
      )}

      {/* Bottom controls */}
      {started && (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex flex-col gap-3 p-4">
          {showPads && (
            <div className="flex justify-center gap-2">
              {PAD_NOTES.map((m) => (
                <button
                  key={m}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onRealInput(m, 0.9);
                  }}
                  className="rounded-xl active:scale-95"
                  style={{
                    width: 64,
                    height: 64,
                    background: pcColor(m),
                    boxShadow: `0 0 18px ${pcColor(m)}`,
                  }}
                  aria-label={`note ${m}`}
                />
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMuted((m) => !m)}
                className="rounded-xl bg-white/15 px-4 py-2.5 text-base text-white/95 active:scale-95"
                style={{ minHeight: 44 }}
              >
                {muted ? "Unmute" : "Mute"}
              </button>
              <input
                type="range"
                min={0}
                max={0.55}
                step={0.01}
                value={vol}
                onChange={(e) => setVol(parseFloat(e.target.value))}
                aria-label="volume"
                className="w-32 accent-amber-400"
              />
              {ghostActive && (
                <span className="text-base text-white/75">band is playing… your turn!</span>
              )}
            </div>
            <Link
              href="#"
              onClick={(e) => e.preventDefault()}
              title="Design notes are in README.md"
              className="text-base text-white/75 underline decoration-dotted underline-offset-4 hover:text-white/95"
            >
              Read the design notes
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
