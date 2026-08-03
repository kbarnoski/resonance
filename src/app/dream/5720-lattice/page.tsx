"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  buildNodes,
  pickNodeIndex,
  pcColor,
  noteName,
  type SpiralNode,
} from "./spiral";
import { NoteSynth } from "./audio";
import { buildDemo } from "./demo";
import { detectPitch, freqToMidi } from "./pitch";

// ─────────────────────────────────────────────────────────────────────────────
// 5720-lattice — the harmonic space your playing moves through.
//
// A rotating crystal built on Elaine Chew's Spiral Array: pitch classes wound up
// a helix so perfect fifths are adjacent and a triad's three notes form a
// compact triangle. Every sounded note lights a node; successive notes trace a
// fading voice-leading path; three-or-more together draw a translucent polygon
// whose shape reveals the chord's tension; and a bright center-of-effect marker
// (Chew's weighted-centroid tonal-analysis device) glides through the crystal to
// show what tonal region you're in.
//
// Input: Web MIDI (primary) · microphone-pitch fallback · seeded self-playing
// demo. Determinism: all demo randomness comes from mulberry32(0x5720); clocks
// are used for timing only.
// ─────────────────────────────────────────────────────────────────────────────

const CE_TAU = 1.1; // s — center-of-effect exponential memory (~2 s window)
const ACT_TAU = 0.42; // s — node activation decay
const VOICE_MAX = 48; // voice-leading path point cap
const VOICE_AGE = 5.0; // s — oldest visible path point
const ROT_SPEED = 0.11; // rad/s — gentle auto-rotation (~6°/s)
const BG = new THREE.Color(0x0b0713); // deep violet backdrop (palette 950)

type InputMode = "demo" | "midi" | "mic";

interface Readout {
  region: string;
  sounding: string;
  shape: string;
  mode: string;
}

interface TriggerFns {
  trigger: (midi: number, velocity: number) => void;
  release: (midi: number) => void;
}

function makeLabelSprite(text: string, color: THREE.Color): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 72;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, c.width, c.height);
  g.font = "600 44px ui-sans-serif, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = `#${color.getHexString()}`;
  g.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 2;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.34, 0.19, 1);
  return s;
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("demo");
  const [midiSupported, setMidiSupported] = useState(true);
  const [micDenied, setMicDenied] = useState(false);
  const [readout, setReadout] = useState<Readout>({
    region: "—",
    sounding: "—",
    shape: "—",
    mode: "self-playing demo",
  });

  // Long-lived engine handles (populated in start(), torn down in stop()).
  const ctxRef = useRef<AudioContext | null>(null);
  const synthRef = useRef<NoteSynth | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const triggerRef = useRef<TriggerFns | null>(null);
  const mutedRef = useRef(false);

  // Input sources.
  const demoEnabledRef = useRef(true);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const midiNameRef = useRef<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micBufRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
    synthRef.current?.setMuted(muted);
  }, [muted]);

  useEffect(() => {
    setMidiSupported(
      typeof navigator !== "undefined" && "requestMIDIAccess" in navigator
    );
  }, []);

  // Idle preview: a gently rotating crystal shown before Start (and after Stop),
  // so the visuals are never blank. No audio — that waits for the user gesture.
  useEffect(() => {
    if (running) return;
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(BG, 1);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.AmbientLight(0x2a1f4a, 1.2));
    const key = new THREE.PointLight(0xb9a6ff, 10, 30, 2);
    key.position.set(3, 4, 5);
    scene.add(key);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.4, 5.4);
    camera.lookAt(0, 0, 0);

    const nodes = buildNodes();
    const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
    const junk: { dispose: () => void }[] = [sphereGeo];

    const threadGeo = new THREE.BufferGeometry().setFromPoints(
      nodes.map((n) => n.pos)
    );
    junk.push(threadGeo);
    const threadMat = new THREE.LineBasicMaterial({
      color: 0x3a1d78,
      transparent: true,
      opacity: 0.5,
    });
    junk.push(threadMat);
    group.add(new THREE.Line(threadGeo, threadMat));

    for (const n of nodes) {
      const col = pcColor(n.pc);
      const coreMat = new THREE.MeshStandardMaterial({
        color: col.clone().multiplyScalar(0.35),
        emissive: col,
        emissiveIntensity: 0.35,
        roughness: 0.35,
        metalness: 0.1,
      });
      junk.push(coreMat);
      const core = new THREE.Mesh(sphereGeo, coreMat);
      core.position.copy(n.pos);
      core.scale.setScalar(0.05);
      group.add(core);

      const glowMat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.08,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      junk.push(glowMat);
      const glow = new THREE.Mesh(sphereGeo, glowMat);
      glow.position.copy(n.pos);
      glow.scale.setScalar(0.13);
      group.add(glow);
    }

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer!.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    let prev = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      group.rotation.y += (reduced ? ROT_SPEED * 0.35 : ROT_SPEED) * dt;
      renderer!.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      const el = renderer!.domElement;
      renderer!.dispose();
      if (el.parentElement === mount) mount.removeChild(el);
      junk.forEach((d) => d.dispose());
      scene.clear();
      group.clear();
    };
  }, [running]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    teardownRef.current?.();
    teardownRef.current = null;
    triggerRef.current = null;

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    micBufRef.current = null;
    if (midiAccessRef.current) {
      midiAccessRef.current.inputs.forEach((i) => (i.onmidimessage = null));
      midiAccessRef.current.onstatechange = null;
      midiAccessRef.current = null;
    }

    synthRef.current?.dispose();
    synthRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;

    demoEnabledRef.current = true;
    setInputMode("demo");
    midiNameRef.current = null;
    setMicDenied(false);
    setRunning(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    if (running) return;
    const mount = mountRef.current;
    if (!mount) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // ── audio context (user gesture unlocks it) ──────────────────────────────
    let ctx: AudioContext;
    try {
      const Ctor: typeof AudioContext =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext;
      ctx = new Ctor();
      await ctx.resume();
    } catch {
      return;
    }
    ctxRef.current = ctx;
    const synth = new NoteSynth(ctx);
    synth.setMuted(mutedRef.current);
    synthRef.current = synth;

    // ── three.js scene (degrade gracefully if WebGL is missing) ──────────────
    const nodes: SpiralNode[] = buildNodes();
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      renderer = null;
    }

    const disposables: { dispose: () => void }[] = [];
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    scene.add(group);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.4, 5.4);
    camera.lookAt(0, 0, 0);

    // Per-node visuals.
    const sphereGeo = new THREE.SphereGeometry(1, 20, 20);
    disposables.push(sphereGeo);
    interface NodeVis {
      core: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
      glow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
      label: THREE.Sprite;
      activation: number;
    }
    const vis: NodeVis[] = [];

    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(BG, 1);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      renderer.domElement.style.touchAction = "none";

      scene.add(new THREE.AmbientLight(0x2a1f4a, 1.2));
      const key = new THREE.PointLight(0xb9a6ff, 12, 30, 2);
      key.position.set(3, 4, 5);
      scene.add(key);

      // Faint helix thread so the spiral reads as a spiral.
      const threadPts = nodes.map((n) => n.pos);
      const threadGeo = new THREE.BufferGeometry().setFromPoints(threadPts);
      disposables.push(threadGeo);
      const threadMat = new THREE.LineBasicMaterial({
        color: 0x3a1d78,
        transparent: true,
        opacity: 0.5,
      });
      disposables.push(threadMat);
      group.add(new THREE.Line(threadGeo, threadMat));

      for (const n of nodes) {
        const col = pcColor(n.pc);
        const coreMat = new THREE.MeshStandardMaterial({
          color: col.clone().multiplyScalar(0.35),
          emissive: col,
          emissiveIntensity: 0.15,
          roughness: 0.35,
          metalness: 0.1,
        });
        disposables.push(coreMat);
        const core = new THREE.Mesh(sphereGeo, coreMat);
        core.position.copy(n.pos);
        core.scale.setScalar(0.05);
        group.add(core);

        const glowMat = new THREE.MeshBasicMaterial({
          color: col,
          transparent: true,
          opacity: 0.04,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        disposables.push(glowMat);
        const glow = new THREE.Mesh(sphereGeo, glowMat);
        glow.position.copy(n.pos);
        glow.scale.setScalar(0.13);
        group.add(glow);

        const label = makeLabelSprite(noteName(n.pc), col.clone().lerp(new THREE.Color(0xffffff), 0.35));
        const outward = new THREE.Vector3(n.pos.x, 0, n.pos.z)
          .normalize()
          .multiplyScalar(0.22);
        label.position.copy(n.pos).add(outward).add(new THREE.Vector3(0, 0.02, 0));
        disposables.push(label.material);
        if (label.material.map) disposables.push(label.material.map);
        group.add(label);

        vis.push({ core, glow, label, activation: 0 });
      }

      // Center-of-effect marker: bright near-white violet core + additive halo.
      const ceCol = new THREE.Color(0.86, 0.8, 1.0);
      const ceCoreMat = new THREE.MeshBasicMaterial({ color: ceCol });
      disposables.push(ceCoreMat);
      const ceCore = new THREE.Mesh(sphereGeo, ceCoreMat);
      ceCore.scale.setScalar(0.075);
      group.add(ceCore);
      const ceGlowMat = new THREE.MeshBasicMaterial({
        color: ceCol,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(ceGlowMat);
      const ceGlow = new THREE.Mesh(sphereGeo, ceGlowMat);
      ceGlow.scale.setScalar(0.24);
      group.add(ceGlow);
      const ceLight = new THREE.PointLight(0xd9ccff, 6, 8, 2);
      group.add(ceLight);

      // Voice-leading polyline (rebuilt each frame).
      const voicePos = new Float32Array(VOICE_MAX * 3);
      const voiceCol = new Float32Array(VOICE_MAX * 3);
      const voiceGeo = new THREE.BufferGeometry();
      voiceGeo.setAttribute("position", new THREE.BufferAttribute(voicePos, 3));
      voiceGeo.setAttribute("color", new THREE.BufferAttribute(voiceCol, 3));
      disposables.push(voiceGeo);
      const voiceMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(voiceMat);
      const voiceLine = new THREE.Line(voiceGeo, voiceMat);
      voiceLine.frustumCulled = false;
      group.add(voiceLine);

      // Chord polygon fill + outline (rebuilt each frame).
      const chordGeo = new THREE.BufferGeometry();
      chordGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(3 * 3 * 16), 3)
      );
      disposables.push(chordGeo);
      const chordMat = new THREE.MeshBasicMaterial({
        color: 0xa78bfa,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      disposables.push(chordMat);
      const chordMesh = new THREE.Mesh(chordGeo, chordMat);
      chordMesh.frustumCulled = false;
      chordMesh.visible = false;
      group.add(chordMesh);

      const outlineGeo = new THREE.BufferGeometry();
      outlineGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(3 * 16), 3)
      );
      disposables.push(outlineGeo);
      const outlineMat = new THREE.LineBasicMaterial({
        color: 0xc4b5fd,
        transparent: true,
        opacity: 0.75,
      });
      disposables.push(outlineMat);
      const outline = new THREE.LineLoop(outlineGeo, outlineMat);
      outline.frustumCulled = false;
      outline.visible = false;
      group.add(outline);

      // Stash frame-mutated handles on the group's userData for the loop.
      group.userData = {
        ceCore,
        ceGlow,
        ceLight,
        voiceGeo,
        voicePos,
        voiceCol,
        voiceLine,
        chordMesh,
        chordGeo,
        outline,
        outlineGeo,
      };
    } else {
      setWebglFailed(true);
    }

    // ── shared harmonic state ────────────────────────────────────────────────
    const ceNum = new THREE.Vector3();
    let ceDen = 0;
    const ceSmoothed = new THREE.Vector3(0, 0, 0);
    const ceTarget = new THREE.Vector3(0, 0, 0);
    interface VoicePt {
      pos: THREE.Vector3;
      t: number;
      col: THREE.Color;
    }
    const voiceHistory: VoicePt[] = [];
    const activeNotes = new Map<number, { idx: number; k: number; pc: number }>();

    const trigger = (midi: number, velocity: number) => {
      const pc = (((midi % 12) + 12) % 12);
      const idx = pickNodeIndex(pc, ceSmoothed.y);
      if (idx < 0) return;
      const v = Math.max(0.15, Math.min(1, velocity));
      if (vis[idx]) vis[idx].activation = Math.min(1.7, vis[idx].activation + v * 1.2 + 0.4);
      const pos = nodes[idx].pos;
      const now = performance.now() / 1000;
      voiceHistory.push({ pos: pos.clone(), t: now, col: pcColor(pc) });
      if (voiceHistory.length > VOICE_MAX) voiceHistory.shift();
      ceNum.addScaledVector(pos, v);
      ceDen += v;
      activeNotes.set(midi, { idx, k: nodes[idx].k, pc });
      synth.play(midi, v);
    };
    const release = (midi: number) => {
      activeNotes.delete(midi);
    };
    triggerRef.current = { trigger, release };

    // ── seeded demo scheduler ────────────────────────────────────────────────
    const demo = buildDemo();
    let loopBase = performance.now() / 1000;
    let cursor = 0;
    interface PendingOff {
      midi: number;
      at: number;
    }
    let pendingOffs: PendingOff[] = [];

    // ── mic polling state ────────────────────────────────────────────────────
    let micHeld = -1;
    let micLastAt = 0;
    let lastMicPoll = 0;

    let lastReadout = 0;
    let prevMs = performance.now();
    let autoYaw = 0;
    let userYaw = 0;
    let userPitch = 0;

    const frame = () => {
      const nowMs = performance.now();
      const dt = Math.min(0.05, (nowMs - prevMs) / 1000);
      prevMs = nowMs;
      const nowS = nowMs / 1000;

      // demo events
      if (demoEnabledRef.current) {
        const t = nowS - loopBase;
        while (cursor < demo.notes.length && demo.notes[cursor].t <= t) {
          const ev = demo.notes[cursor];
          trigger(ev.midi, ev.velocity);
          pendingOffs.push({ midi: ev.midi, at: ev.t + ev.dur });
          cursor++;
        }
        pendingOffs = pendingOffs.filter((o) => {
          if (o.at <= t) {
            release(o.midi);
            return false;
          }
          return true;
        });
        if (t >= demo.loopLength) {
          loopBase += demo.loopLength;
          cursor = 0;
          pendingOffs.forEach((o) => release(o.midi));
          pendingOffs = [];
        }
      }

      // mic polling (~13 Hz)
      const analyser = micAnalyserRef.current;
      const buf = micBufRef.current;
      if (analyser && buf && nowMs - lastMicPoll > 75) {
        lastMicPoll = nowMs;
        analyser.getFloatTimeDomainData(
          buf as unknown as Float32Array<ArrayBuffer>
        );
        const freq = detectPitch(buf, ctx.sampleRate);
        if (freq != null) {
          const midi = freqToMidi(freq);
          if (midi !== micHeld) {
            if (micHeld >= 0) release(micHeld);
            trigger(midi, 0.7);
            micHeld = midi;
          }
          micLastAt = nowMs;
        } else if (micHeld >= 0 && nowMs - micLastAt > 220) {
          release(micHeld);
          micHeld = -1;
        }
      }

      // center of effect (decaying weighted centroid — Chew's CE device)
      const f = Math.exp(-dt / CE_TAU);
      ceNum.multiplyScalar(f);
      ceDen *= f;
      if (ceDen > 1e-3) ceTarget.copy(ceNum).multiplyScalar(1 / ceDen);
      ceSmoothed.lerp(ceTarget, 1 - Math.exp(-dt / 0.16));

      // auto-rotation (+ optional user drag offset)
      autoYaw += (reduced ? ROT_SPEED * 0.35 : ROT_SPEED) * dt;
      group.rotation.y = autoYaw + userYaw;
      group.rotation.x = userPitch;

      // node activation decay + visual update
      const decay = Math.exp(-dt / ACT_TAU);
      for (const nv of vis) {
        nv.activation *= decay;
        const a = nv.activation;
        nv.core.material.emissiveIntensity = 0.15 + a * 2.3;
        nv.core.scale.setScalar(0.05 * (1 + a * 0.7));
        nv.glow.material.opacity = 0.04 + Math.min(0.7, a * 0.6);
        nv.glow.scale.setScalar(0.13 * (1 + a * 1.1));
        (nv.label.material as THREE.SpriteMaterial).opacity = 0.42 + Math.min(0.55, a * 0.6);
      }

      if (renderer) {
        const ud = group.userData as {
          ceCore: THREE.Mesh;
          ceGlow: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
          ceLight: THREE.PointLight;
          voiceGeo: THREE.BufferGeometry;
          voicePos: Float32Array;
          voiceCol: Float32Array;
          voiceLine: THREE.Line;
          chordMesh: THREE.Mesh;
          chordGeo: THREE.BufferGeometry;
          outline: THREE.LineLoop;
          outlineGeo: THREE.BufferGeometry;
        };

        ud.ceCore.position.copy(ceSmoothed);
        ud.ceGlow.position.copy(ceSmoothed);
        ud.ceLight.position.copy(ceSmoothed);
        const pulse = 1 + 0.12 * Math.sin(nowS * 2.4);
        ud.ceGlow.scale.setScalar(0.24 * pulse);
        ud.ceGlow.material.opacity = ceDen > 1e-3 ? 0.4 : 0.16;

        // voice-leading polyline (recent → bright pc color, old → fade to BG)
        while (voiceHistory.length && nowS - voiceHistory[0].t > VOICE_AGE)
          voiceHistory.shift();
        const count = voiceHistory.length;
        for (let i = 0; i < count; i++) {
          const vp = voiceHistory[i];
          const age = (nowS - vp.t) / VOICE_AGE; // 0 new … 1 old
          const fade = Math.max(0, 1 - age);
          const c = vp.col.clone().lerp(BG, 1 - fade * fade);
          ud.voicePos[i * 3] = vp.pos.x;
          ud.voicePos[i * 3 + 1] = vp.pos.y;
          ud.voicePos[i * 3 + 2] = vp.pos.z;
          ud.voiceCol[i * 3] = c.r;
          ud.voiceCol[i * 3 + 1] = c.g;
          ud.voiceCol[i * 3 + 2] = c.b;
        }
        ud.voiceGeo.setDrawRange(0, count);
        (ud.voiceGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        (ud.voiceGeo.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;

        // chord polygon: fan the active-note positions from their centroid
        const act = [...activeNotes.values()];
        if (act.length >= 3) {
          const verts = act.slice(0, 12).map((a) => nodes[a.idx].pos);
          const centroid = new THREE.Vector3();
          verts.forEach((p) => centroid.add(p));
          centroid.multiplyScalar(1 / verts.length);
          // order vertices by angle around the centroid in the view-ish plane
          const ordered = [...verts].sort(
            (p, q) =>
              Math.atan2(p.y - centroid.y, p.x - centroid.x) -
              Math.atan2(q.y - centroid.y, q.x - centroid.x)
          );
          const fillAttr = ud.chordGeo.getAttribute("position") as THREE.BufferAttribute;
          const fillArr = fillAttr.array as Float32Array;
          let vi = 0;
          for (let i = 0; i < ordered.length; i++) {
            const p0 = ordered[i];
            const p1 = ordered[(i + 1) % ordered.length];
            const tri = [centroid, p0, p1];
            for (const p of tri) {
              fillArr[vi++] = p.x;
              fillArr[vi++] = p.y;
              fillArr[vi++] = p.z;
            }
          }
          ud.chordGeo.setDrawRange(0, ordered.length * 3);
          fillAttr.needsUpdate = true;
          ud.chordMesh.visible = true;

          const outAttr = ud.outlineGeo.getAttribute("position") as THREE.BufferAttribute;
          const outArr = outAttr.array as Float32Array;
          for (let i = 0; i < ordered.length; i++) {
            outArr[i * 3] = ordered[i].x;
            outArr[i * 3 + 1] = ordered[i].y;
            outArr[i * 3 + 2] = ordered[i].z;
          }
          ud.outlineGeo.setDrawRange(0, ordered.length);
          outAttr.needsUpdate = true;
          ud.outline.visible = true;
        } else {
          ud.chordMesh.visible = false;
          ud.outline.visible = false;
        }

        renderer.render(scene, camera);
      }

      // throttled UI readout
      if (nowMs - lastReadout > 110) {
        lastReadout = nowMs;
        // nearest node to CE → estimated tonal center
        let bestPc = -1;
        let bestD = Infinity;
        for (let i = 0; i < nodes.length; i++) {
          const d = nodes[i].pos.distanceToSquared(ceSmoothed);
          if (d < bestD) {
            bestD = d;
            bestPc = nodes[i].pc;
          }
        }
        const act = [...activeNotes.values()];
        const pcs = [...new Set(act.map((a) => a.pc))].sort((x, y) => x - y);
        const sounding = pcs.length ? pcs.map(noteName).join(" · ") : "—";
        let shape = "—";
        if (act.length >= 3) {
          const ks = act.map((a) => a.k);
          const span = Math.max(...ks) - Math.min(...ks);
          shape =
            span <= 4
              ? "compact triad"
              : span <= 7
                ? "extended chord"
                : "spread cluster";
        }
        const modeLabel = demoEnabledRef.current
          ? "self-playing demo"
          : micAnalyserRef.current
            ? "microphone pitch"
            : midiNameRef.current
              ? `MIDI · ${midiNameRef.current}`
              : "live input";
        setReadout({
          region: bestPc >= 0 ? `${noteName(bestPc)} region` : "—",
          sounding,
          shape,
          mode: modeLabel,
        });
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    // ── pointer-drag orbit (a legible-without-it nicety) ─────────────────────
    // Drag adds a persistent yaw/pitch offset on top of the auto-rotation; the
    // frame loop composes them into group.rotation.
    let dragging = false;
    let px = 0;
    let py = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      px = e.clientX;
      py = e.clientY;
      (e.target as Element).setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      userYaw += (e.clientX - px) * 0.005;
      userPitch = Math.max(-0.7, Math.min(0.7, userPitch + (e.clientY - py) * 0.004));
      px = e.clientX;
      py = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    if (renderer) {
      const el = renderer.domElement;
      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }

    // ── resize ───────────────────────────────────────────────────────────────
    const resize = () => {
      if (!renderer) return;
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── go ───────────────────────────────────────────────────────────────────
    setRunning(true);
    demoEnabledRef.current = true;
    setInputMode("demo");
    prevMs = performance.now();
    loopBase = performance.now() / 1000;
    rafRef.current = requestAnimationFrame(frame);

    teardownRef.current = () => {
      ro.disconnect();
      if (renderer) {
        const el = renderer.domElement;
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        renderer.dispose();
        if (el.parentElement === mount) mount.removeChild(el);
      }
      disposables.forEach((d) => d.dispose());
      scene.clear();
      group.clear();
    };
  }, [running]);

  const enableMidi = useCallback(async () => {
    if (!running) return;
    if (typeof navigator === "undefined" || !("requestMIDIAccess" in navigator)) {
      setMidiSupported(false);
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess();
      midiAccessRef.current = access;
      const onMidi = (e: MIDIMessageEvent) => {
        const data = e.data;
        if (!data || data.length < 3) return;
        const status = data[0] & 0xf0;
        const note = data[1];
        const velo = data[2];
        if (status === 0x90 && velo > 0) triggerRef.current?.trigger(note, velo / 127);
        else if (status === 0x80 || (status === 0x90 && velo === 0))
          triggerRef.current?.release(note);
      };
      const attach = () => {
        let name = "";
        access.inputs.forEach((inp) => {
          inp.onmidimessage = onMidi;
          if (!name && inp.name) name = inp.name;
        });
        midiNameRef.current = name || "MIDI device";
      };
      attach();
      access.onstatechange = attach;
      demoEnabledRef.current = false;
      setInputMode("midi");
    } catch {
      setMidiSupported(false);
    }
  }, [running]);

  const enableMic = useCallback(async () => {
    const ctx = ctxRef.current;
    if (!running || !ctx) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser); // NOT to destination — no feedback
      micAnalyserRef.current = analyser;
      micBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      demoEnabledRef.current = false;
      setInputMode("mic");
      setMicDenied(false);
    } catch {
      setMicDenied(true);
    }
  }, [running]);

  const resumeDemo = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    micBufRef.current = null;
    demoEnabledRef.current = true;
    setInputMode("demo");
    setMicDenied(false);
  }, []);

  const secondaryBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";
  const primaryBtn =
    "min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90";
  const labelCls =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      {/* three.js mount — fills the viewport, sits behind the chrome */}
      <div ref={mountRef} className="absolute inset-0" aria-hidden />

      {/* top-left: title + description + controls */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <div className="max-w-xl space-y-4">
          <header className="space-y-2">
            <p className={labelCls}>5720 · spiral array</p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Lattice
            </h1>
            <p className="text-base text-muted-foreground">
              See the harmonic space your playing moves through — a rotating
              crystal where every note lights a point in pitch-space, chords snap
              into solid shapes, and your melody traces a glowing path through
              tonal space.
            </p>
          </header>

          <div className="pointer-events-auto flex flex-col gap-3">
            {webglFailed && (
              <p className="text-base text-destructive">
                WebGL is unavailable — the crystal is off, but the demo and its
                audio are still playing.
              </p>
            )}
            {micDenied && (
              <p className="text-base text-destructive">
                Microphone unavailable — check permissions. The self-playing demo
                keeps running so you can still see and hear the lattice.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3">
              {!running ? (
                <button onClick={start} className={primaryBtn}>
                  Start
                </button>
              ) : (
                <>
                  <button onClick={stop} className={primaryBtn}>
                    Stop
                  </button>
                  <button onClick={() => setMuted((v) => !v)} className={secondaryBtn}>
                    {muted ? "Unmute" : "Mute"}
                  </button>
                  {midiSupported && inputMode !== "midi" && (
                    <button onClick={enableMidi} className={secondaryBtn}>
                      Connect MIDI
                    </button>
                  )}
                  {inputMode !== "mic" ? (
                    <button onClick={enableMic} className={secondaryBtn}>
                      Use microphone
                    </button>
                  ) : (
                    <button onClick={resumeDemo} className={secondaryBtn}>
                      Back to demo
                    </button>
                  )}
                </>
              )}
            </div>

            {running && (
              <dl className="grid max-w-md grid-cols-2 gap-x-6 gap-y-2 pt-1">
                <div className="space-y-0.5">
                  <dt className={labelCls}>input</dt>
                  <dd className="text-base text-foreground">{readout.mode}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className={labelCls}>center of effect</dt>
                  <dd className="text-base text-primary">{readout.region}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className={labelCls}>sounding</dt>
                  <dd className="font-mono text-base text-foreground">{readout.sounding}</dd>
                </div>
                <div className="space-y-0.5">
                  <dt className={labelCls}>chord shape</dt>
                  <dd className="text-base text-foreground">{readout.shape}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>
      </div>

      {/* bottom-right: design-notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute bottom-6 right-6 text-sm text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg space-y-4 rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The question:</strong> what if
                you could <em>see</em> the harmonic space your playing moves
                through — a crystal where every note lights a point, chords snap
                into shapes, and your melody traces a path through tonal space?
              </p>
              <p>
                The crystal is Elaine Chew&apos;s <strong>Spiral Array</strong>.
                Pitches are wound up a helix along the line of fifths, so stepping
                by one node moves a perfect fifth and every four steps completes a
                turn. The winding is what makes harmony visible: a major triad&apos;s
                root, fifth and third land at k, k+1 and k+4 — a small compact
                triangle — while a dissonant cluster spreads its vertices into a
                stretched polygon.
              </p>
              <p>
                The bright drifting marker is Chew&apos;s{" "}
                <strong>center of effect</strong>: the weighted centroid of the
                pitches sounding over the last ~2 seconds, with older notes
                decaying exponentially. Its position is a tonal-analysis device —
                where it settles estimates the key you&apos;re in.
              </p>
              <p>
                <strong className="text-foreground">Input:</strong> Web MIDI
                (primary), a microphone-pitch fallback (autocorrelation → nearest
                note), and a seeded self-playing demo — a ii–V–I in C under a
                walking melody, driven by a fixed mulberry32(0x5720) so it&apos;s
                identical every run. Drag to reorient the crystal; it reads fine
                untouched.
              </p>
              <p>
                <strong className="text-foreground">Reference:</strong> Elaine
                Chew, <em>Mathematical and Computational Modeling of Tonality:
                Theory and Applications</em> (Springer, 2014).
              </p>
              <p>
                <strong className="text-foreground">Rough edges:</strong> mic pitch
                is monophonic and octave-jumpy on noisy input; a note is drawn at
                the helix representation nearest the current center of effect, so a
                lone repeated pitch can settle onto a different node as context
                shifts; and key estimation is a nearest-node heuristic, not full
                Chew key-finding.
              </p>
            </div>
            <button onClick={() => setShowNotes(false)} className={primaryBtn}>
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
