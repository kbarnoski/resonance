"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";

/* ───────────────────────────────────────────────────────────────────────────
 * 7320 — Fishtank
 *
 * The screen becomes a WINDOW into a small resonant room. Move your head and
 * both the 3D view AND the sound field turn with you — classic fish-tank VR
 * (Ware 1993) driven by off-axis / generalized-perspective projection
 * (Kooima 2008) from a head position we estimate with NO machine-learning
 * library: a cheap skin-tone-weighted centroid over a 64×48 downscale of the
 * front camera (Lee 2007 head-coupled parallax, hand-rolled). Each resonant
 * voice sits at a fixed world position and is spatialised by a Web Audio
 * PannerNode against an AudioListener pinned to the tracked eye, so leaning
 * left literally brings the left-of-room voice forward.
 *
 * Alive on load: a seeded mulberry32 auto-orbit flies the virtual eye from
 * first paint (no permissions needed). Camera denied → pointer (desktop) or
 * device-tilt (mobile) drive the eye, with the auto-orbit underneath when idle.
 *
 * Determinism: no nondeterministic RNG or wall-clock calls anywhere. All
 * "randomness" comes from mulberry32(0x7320); all time from performance.now(),
 * the audio clock, or the rAF timestamp. Full teardown on unmount.
 * ─────────────────────────────────────────────────────────────────────────── */

// ── deterministic PRNG ──────────────────────────────────────────────────────
function makeMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// ── the resonant voices (fixed world positions, D-dorian just intonation) ────
// fundamental D (146.83 Hz region); ratios drawn from a D-dorian JI scale.
const F0 = 146.83;
interface VoiceDef {
  note: string;
  freq: number;
  pos: [number, number, number];
  tremHz: number;
  gain: number;
}
const VOICES: VoiceDef[] = [
  { note: "D2", freq: F0 * 0.5, pos: [-0.8, -0.7, -6.0], tremHz: 0.048, gain: 0.30 },
  { note: "A2", freq: F0 * 0.5 * (3 / 2), pos: [-1.9, 0.2, -3.6], tremHz: 0.071, gain: 0.24 },
  { note: "F3", freq: F0 * (6 / 5), pos: [1.9, -0.3, -5.4], tremHz: 0.061, gain: 0.22 },
  { note: "A3", freq: F0 * (3 / 2), pos: [0.2, 1.0, -8.2], tremHz: 0.085, gain: 0.18 },
  { note: "E4", freq: F0 * 2 * (9 / 8), pos: [1.1, 0.6, -10.6], tremHz: 0.097, gain: 0.14 },
];
// bell pings ride the octave above, on the same JI degrees
const PING_FREQS = [F0 * 2, F0 * 2 * (6 / 5), F0 * 2 * (3 / 2), F0 * 4, F0 * 4 * (9 / 8)];

// eye envelope in world space (window is the z=0 plane, room is at z<0)
const EYE_Z0 = 2.4;
const EYE_X_RANGE = 1.6;
const EYE_Y_RANGE = 1.1;
const EYE_Z_NEAR = 1.7;
const EYE_Z_FAR = 3.15;

type Source = "auto" | "camera" | "pointer" | "tilt";

interface EyeState {
  x: number;
  y: number;
  z: number;
}

// mutable audio graph handle (built on the Begin gesture)
interface AudioEngine {
  ctx: AudioContext;
  bus: GainNode;
  out: GainNode;
  setListener: (e: EyeState) => void;
  levelOf: (i: number) => number; // 0..1 tremolo level for visuals
  pumpPings: () => void; // schedule/trigger due bell pings
  pingPulse: number[]; // decaying visual spike per voice
  setMuted: (m: boolean) => void;
  stop: () => void;
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [camNote, setCamNote] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [readout, setReadout] = useState({
    source: "auto" as Source,
    x: 0,
    y: 0,
    z: EYE_Z0,
    voice: "—",
    side: "",
  });

  // refs shared between the setup effect and the Begin gesture
  const audioRef = useRef<AudioEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(false);

  // live input sources (all normalized), each stamped with performance.now()
  const camRef = useRef({ x: 0, y: 0, z: EYE_Z0, t: -1e9, active: false });
  const pointerRef = useRef({ x: 0, y: 0, t: -1e9 });
  const tiltRef = useRef({ x: 0, y: 0, t: -1e9 });

  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  // ── tear down camera + audio (leaves the visual loop running) ──────────────
  const stopSensing = useCallback(() => {
    trackerRef.current?.();
    trackerRef.current = null;
    if (streamRef.current) {
      for (const tr of streamRef.current.getTracks()) tr.stop();
      streamRef.current = null;
    }
    audioRef.current?.stop();
    audioRef.current = null;
    camRef.current.active = false;
    setRunning(false);
  }, []);

  // ── main setup: three.js + rAF + passive fallbacks (runs on mount) ─────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const motion = reduced ? 0.4 : 1;

    // ---- renderer / scene ----
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglFailed(true);
      return;
    }
    if (!renderer.getContext()) {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    let width = mount.clientWidth || 640;
    let height = mount.clientHeight || 420;
    renderer.setSize(width, height, false);
    renderer.setClearColor(new THREE.Color(0x0b0713), 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0713, 0.085);

    // window plane (z=0) — its half-size follows the canvas aspect so the
    // world window stays the same proportion as the physical screen.
    const winHalfW = 1.85;
    let winHalfH = winHalfW / (width / height);

    // camera: pure translation view; projectionMatrix set by hand each frame.
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.12, 60);
    camera.up.set(0, 1, 0);

    // ---- room of thin violet struts (floor/ceiling grid + tunnel ribs) ----
    const disposables: { dispose: () => void }[] = [];
    const roomGroup = new THREE.Group();
    {
      const X = 3.0;
      const Y = 2.0;
      const Zmax = 14;
      const pts: number[] = [];
      const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
        pts.push(ax, ay, az, bx, by, bz);
      };
      // floor + ceiling grids
      for (let z = 0; z <= Zmax; z += 1) {
        seg(-X, -Y, -z, X, -Y, -z); // floor transverse
        if (z % 2 === 0) seg(-X, Y, -z, X, Y, -z); // ceiling transverse (sparser)
      }
      for (let ix = -3; ix <= 3; ix++) {
        const x = (ix / 3) * X;
        seg(x, -Y, 0, x, -Y, -Zmax); // floor longitudinal
        if (ix % 2 === 0) seg(x, Y, 0, x, Y, -Zmax); // ceiling longitudinal
      }
      // tunnel ribs (full rectangle) every 2 units
      for (let z = 0; z <= Zmax; z += 2) {
        seg(-X, -Y, -z, X, -Y, -z);
        seg(X, -Y, -z, X, Y, -z);
        seg(X, Y, -z, -X, Y, -z);
        seg(-X, Y, -z, -X, -Y, -z);
      }
      // side-wall longitudinal struts
      for (const sy of [-Y, Y]) {
        for (const sx of [-X, X]) seg(sx, sy, 0, sx, sy, -Zmax);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0x8b5cf6,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: true,
      });
      const lines = new THREE.LineSegments(geo, mat);
      roomGroup.add(lines);
      disposables.push(geo, mat);
    }
    scene.add(roomGroup);

    // ---- floating resonant bodies (core + additive halo per voice) ----
    interface Body {
      inner: THREE.Mesh;
      outerMat: THREE.MeshBasicMaterial;
      outer: THREE.Mesh;
    }
    const bodies: Body[] = [];
    const coreGeo = new THREE.IcosahedronGeometry(0.24, 0);
    const haloGeo = new THREE.IcosahedronGeometry(0.5, 0);
    disposables.push(coreGeo, haloGeo);
    VOICES.forEach((v) => {
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0xc4b5fd,
        transparent: true,
        opacity: 0.9,
        fog: true,
      });
      const inner = new THREE.Mesh(coreGeo, innerMat);
      inner.position.set(...v.pos);
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0x8b5cf6,
        transparent: true,
        opacity: 0.22,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
        fog: true,
      });
      const outer = new THREE.Mesh(haloGeo, outerMat);
      outer.position.set(...v.pos);
      scene.add(inner, outer);
      disposables.push(innerMat, outerMat);
      bodies.push({ inner, outer, outerMat });
    });

    // ---- passive fallback inputs (no permission needed) ----
    const onPointer = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
      pointerRef.current = { x: clamp(nx, -1, 1), y: clamp(ny, -1, 1), t: performance.now() };
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      const nx = clamp(e.gamma / 30, -1, 1); // left/right tilt
      const ny = clamp((e.beta - 15) / 30, -1, 1); // fore/aft tilt (offset for held phone)
      tiltRef.current = { x: nx, y: ny, t: performance.now() };
    };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("deviceorientation", onOrient, { passive: true });

    const onResize = () => {
      width = mount.clientWidth || width;
      height = mount.clientHeight || height;
      renderer.setSize(width, height, false);
      winHalfH = winHalfW / (width / height);
    };
    window.addEventListener("resize", onResize);

    // ---- seeded auto-orbit phases ----
    const rnd = makeMulberry32(0x7320);
    const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];

    // ---- animation loop ----
    const eye: EyeState = { x: 0, y: 0, z: EYE_Z0 };
    let raf = 0;
    let frame = 0;

    const tmp = new THREE.Vector3();

    const render = (nowMs: number) => {
      raf = requestAnimationFrame(render);
      frame++;

      // 1) auto-orbit (always computed; the idle floor)
      const s = nowMs * 0.00016 * motion;
      const autoX = clamp(Math.sin(s + ph[0]) * 0.9 + Math.sin(s * 0.37 + ph[1]) * 0.32, -1, 1) * EYE_X_RANGE;
      const autoY = Math.sin(s * 0.73 + ph[2]) * 0.5 * EYE_Y_RANGE;
      const autoZ = EYE_Z0 + Math.sin(s * 0.5 + ph[3]) * 0.4;

      // 2) pick the freshest live source, else fall back to auto
      let tx = autoX,
        ty = autoY,
        tz = autoZ;
      let src: Source = "auto";
      const cam = camRef.current;
      if (cam.active && nowMs - cam.t < 500) {
        tx = cam.x * EYE_X_RANGE;
        ty = cam.y * EYE_Y_RANGE;
        tz = cam.z;
        src = "camera";
      } else if (nowMs - pointerRef.current.t < 2500) {
        tx = pointerRef.current.x * EYE_X_RANGE;
        ty = pointerRef.current.y * EYE_Y_RANGE;
        tz = EYE_Z0 - pointerRef.current.y * 0.3;
        src = "pointer";
      } else if (nowMs - tiltRef.current.t < 2500) {
        tx = tiltRef.current.x * EYE_X_RANGE;
        ty = tiltRef.current.y * EYE_Y_RANGE;
        tz = EYE_Z0;
        src = "tilt";
      }
      tx = clamp(tx, -EYE_X_RANGE, EYE_X_RANGE);
      ty = clamp(ty, -EYE_Y_RANGE, EYE_Y_RANGE);
      tz = clamp(tz, EYE_Z_NEAR, EYE_Z_FAR);

      const k = 0.06 * (reduced ? 0.55 : 1);
      eye.x = lerp(eye.x, tx, k);
      eye.y = lerp(eye.y, ty, k);
      eye.z = lerp(eye.z, tz, k);

      // 3) off-axis (generalized-perspective) projection — Kooima 2008.
      // window basis is axis-aligned (vr=+x, vu=+y, vn=+z) so the view is a
      // pure translation by -eye; only the asymmetric frustum changes.
      const n = 0.12;
      const d = eye.z; // eye→window distance (window at z=0)
      const l = ((-winHalfW - eye.x) * n) / d;
      const r = ((winHalfW - eye.x) * n) / d;
      const b = ((-winHalfH - eye.y) * n) / d;
      const t = ((winHalfH - eye.y) * n) / d;
      camera.projectionMatrix.makePerspective(l, r, t, b, n, 60);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      camera.position.set(eye.x, eye.y, eye.z);
      camera.rotation.set(0, 0, 0);
      camera.updateMatrixWorld(true);

      // 4) drive the audio listener from the eye (head-tracked spatial audio)
      const eng = audioRef.current;
      if (eng) {
        eng.setListener(eye);
        eng.pumpPings();
      }

      // 5) pulse the bodies with their voice level (+ decaying ping spike)
      for (let i = 0; i < bodies.length; i++) {
        let level: number;
        if (eng) {
          level = clamp(eng.levelOf(i) + eng.pingPulse[i], 0, 1.3);
        } else {
          // silent-but-alive breathing before audio starts
          const tt = nowMs * 0.001 * motion;
          level = 0.5 + 0.5 * Math.sin(tt * (0.3 + i * 0.11) + i);
        }
        const bd = bodies[i];
        const sc = 1 + 0.28 * level;
        bd.outer.scale.setScalar(sc);
        bd.outerMat.opacity = 0.14 + 0.34 * clamp(level, 0, 1);
        bd.inner.rotation.x += 0.004 * motion;
        bd.inner.rotation.y += 0.006 * motion;
      }

      renderer.render(scene, camera);

      // 6) throttled UI readout + active-voice pick (smallest azimuth to front)
      if (frame % 12 === 0) {
        let bestIdx = 0;
        let bestAbs = Infinity;
        let bestSide = "";
        for (let i = 0; i < VOICES.length; i++) {
          const p = VOICES[i].pos;
          tmp.set(p[0] - eye.x, p[1] - eye.y, p[2] - eye.z);
          const az = Math.atan2(tmp.x, -tmp.z); // >0 = right of forward
          if (Math.abs(az) < bestAbs) {
            bestAbs = Math.abs(az);
            bestIdx = i;
            bestSide = az < -0.05 ? "left" : az > 0.05 ? "right" : "front";
          }
        }
        setReadout({
          source: src,
          x: eye.x,
          y: eye.y,
          z: eye.z,
          voice: VOICES[bestIdx].note,
          side: bestSide,
        });
      }
    };
    raf = requestAnimationFrame(render);

    // ---- teardown ----
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("resize", onResize);
      stopSensing();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [stopSensing]);

  // ── Begin: audio (needs a gesture) + camera tracker + iOS tilt permission ──
  const begin = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setCamNote(null);
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // iOS 13+ device-orientation permission (harmless elsewhere)
    try {
      const doe = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (doe && typeof doe.requestPermission === "function") {
        await doe.requestPermission();
      }
    } catch {
      /* ignore — pointer/auto fallbacks remain */
    }

    // ---- audio graph ----
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();

      const out = ctx.createGain();
      out.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      const bus = ctx.createGain();
      bus.gain.value = 0.7;
      bus.connect(comp);
      comp.connect(out);
      out.connect(ctx.destination);
      // slow fade-in to the 0.25 ceiling
      out.gain.setValueAtTime(0, ctx.currentTime);
      out.gain.linearRampToValueAtTime(mutedRef.current ? 0 : 0.25, ctx.currentTime + 1.6);

      const startT = ctx.currentTime;
      const oscs: OscillatorNode[] = [];

      // listener orientation (fixed forward -Z, up +Y); position tracks the eye
      const listener = ctx.listener as unknown as {
        positionX?: AudioParam;
        positionY?: AudioParam;
        positionZ?: AudioParam;
        forwardX?: AudioParam;
        forwardY?: AudioParam;
        forwardZ?: AudioParam;
        upX?: AudioParam;
        upY?: AudioParam;
        upZ?: AudioParam;
        setPosition?: (x: number, y: number, z: number) => void;
        setOrientation?: (
          fx: number, fy: number, fz: number,
          ux: number, uy: number, uz: number,
        ) => void;
      };
      if (listener.setOrientation) {
        listener.setOrientation(0, 0, -1, 0, 1, 0);
      } else if (listener.forwardZ) {
        listener.forwardX!.value = 0;
        listener.forwardY!.value = 0;
        listener.forwardZ.value = -1;
        listener.upX!.value = 0;
        listener.upY!.value = 1;
        listener.upZ!.value = 0;
      }

      const makePanner = (pos: [number, number, number]) => {
        const p = ctx.createPanner();
        p.panningModel = "HRTF";
        p.distanceModel = "inverse";
        p.refDistance = 2.5;
        p.maxDistance = 40;
        p.rolloffFactor = 0.8;
        if (p.positionX) {
          p.positionX.value = pos[0];
          p.positionY.value = pos[1];
          p.positionZ.value = pos[2];
        } else {
          (p as unknown as { setPosition: (x: number, y: number, z: number) => void })
            .setPosition(pos[0], pos[1], pos[2]);
        }
        return p;
      };

      // sustained voices
      VOICES.forEach((v) => {
        const g = ctx.createGain();
        g.gain.value = v.gain;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = v.tremHz;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = v.gain * 0.35;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        lfo.start();
        oscs.push(lfo);

        const o1 = ctx.createOscillator();
        o1.type = "sine";
        o1.frequency.value = v.freq;
        const o1g = ctx.createGain();
        o1g.gain.value = 0.62;
        const o2 = ctx.createOscillator();
        o2.type = "triangle";
        o2.frequency.value = v.freq * 1.0012; // gentle JI beating
        const o2g = ctx.createGain();
        o2g.gain.value = 0.22;
        o1.connect(o1g);
        o2.connect(o2g);
        o1g.connect(g);
        o2g.connect(g);
        const p = makePanner(v.pos);
        g.connect(p);
        p.connect(bus);
        o1.start();
        o2.start();
        oscs.push(o1, o2);
      });

      // bell pings — deterministic choices from mulberry32, timed off the clock
      const prng = makeMulberry32(0x7320 ^ 0x51ed);
      const pingPulse = new Array(VOICES.length).fill(0);
      const livePings = new Set<{ nodes: AudioNode[] }>();
      const nextInterval = () => (reduced ? 7 : 4) + prng() * 5;
      let nextPing = startT + 2.5;

      const triggerPing = () => {
        const idx = Math.floor(prng() * VOICES.length) % VOICES.length;
        const freq = PING_FREQS[idx];
        const t0 = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        const o2 = ctx.createOscillator();
        o2.type = "sine";
        o2.frequency.value = freq * 2.004; // shimmer partial
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.85, t0 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + 3.6);
        const g2 = ctx.createGain();
        g2.gain.setValueAtTime(0.0001, t0);
        g2.gain.linearRampToValueAtTime(0.28, t0 + 0.012);
        g2.gain.exponentialRampToValueAtTime(0.0004, t0 + 2.4);
        const p = makePanner(VOICES[idx].pos);
        o.connect(g);
        o2.connect(g2);
        g.connect(p);
        g2.connect(p);
        p.connect(bus);
        o.start(t0);
        o2.start(t0);
        o.stop(t0 + 3.7);
        o2.stop(t0 + 3.7);
        const handle = { nodes: [o, o2, g, g2, p] as AudioNode[] };
        livePings.add(handle);
        o.onended = () => {
          for (const nd of handle.nodes) nd.disconnect();
          livePings.delete(handle);
        };
        pingPulse[idx] = 0.6;
      };

      const engine: AudioEngine = {
        ctx,
        bus,
        out,
        pingPulse,
        setListener: (e) => {
          if (listener.positionX) {
            listener.positionX.value = e.x;
            listener.positionY!.value = e.y;
            listener.positionZ!.value = e.z;
          } else if (listener.setPosition) {
            listener.setPosition(e.x, e.y, e.z);
          }
        },
        levelOf: (i) => {
          const v = VOICES[i];
          const phase = 2 * Math.PI * v.tremHz * (ctx.currentTime - startT);
          return 0.5 + 0.5 * Math.sin(phase);
        },
        pumpPings: () => {
          // decay visual spikes
          for (let i = 0; i < pingPulse.length; i++) pingPulse[i] *= 0.94;
          let guard = 0;
          while (ctx.currentTime >= nextPing && guard < 4) {
            triggerPing();
            nextPing += nextInterval();
            guard++;
          }
        },
        setMuted: (m) => {
          out.gain.cancelScheduledValues(ctx.currentTime);
          out.gain.setTargetAtTime(m ? 0 : 0.25, ctx.currentTime, 0.08);
        },
        stop: () => {
          try {
            out.gain.cancelScheduledValues(ctx.currentTime);
            out.gain.setValueAtTime(out.gain.value, ctx.currentTime);
            out.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
          } catch {
            /* noop */
          }
          for (const o of oscs) {
            try {
              o.stop();
            } catch {
              /* already stopped */
            }
          }
          for (const h of livePings) for (const nd of h.nodes) nd.disconnect();
          livePings.clear();
          try {
            bus.disconnect();
            comp.disconnect();
            out.disconnect();
          } catch {
            /* noop */
          }
          window.setTimeout(() => {
            ctx.close().catch(() => {});
          }, 200);
        },
      };
      audioRef.current = engine;
    } catch {
      setCamNote("Audio could not start on this device.");
    }

    // ---- camera head tracker (no ML: skin-tone-weighted centroid) ----
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 320, height: 240 },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("no video element");
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      const off = document.createElement("canvas");
      off.width = 64;
      off.height = 48;
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) throw new Error("no 2d context");

      let smX = 0;
      let smY = 0;
      let smCov = 0.12;
      let alive = true;
      let tf = 0;

      const step = () => {
        if (!alive) return;
        tf++;
        if (tf % 2 === 0 && video.readyState >= 2) {
          octx.drawImage(video, 0, 0, 64, 48);
          const data = octx.getImageData(0, 0, 64, 48).data;
          let sx = 0;
          let sy = 0;
          let wsum = 0;
          let count = 0;
          for (let y = 0; y < 48; y++) {
            for (let x = 0; x < 64; x++) {
              const o = (y * 64 + x) * 4;
              const r = data[o];
              const g = data[o + 1];
              const b = data[o + 2];
              const mx = Math.max(r, g, b);
              const mn = Math.min(r, g, b);
              // cheap skin-likelihood test (RGB rule of thumb)
              if (
                r > 95 &&
                g > 40 &&
                b > 20 &&
                r > g &&
                r > b &&
                mx - mn > 15 &&
                Math.abs(r - g) > 12
              ) {
                sx += x;
                sy += y;
                wsum += 1;
                count++;
              }
            }
          }
          if (count > 24) {
            const cx = sx / wsum / 64; // 0..1
            const cy = sy / wsum / 48;
            const cov = count / (64 * 48);
            // mirror X so it feels like a mirror
            const nx = -(cx * 2 - 1);
            const ny = -(cy * 2 - 1); // up = positive
            smX = lerp(smX, nx, 0.28);
            smY = lerp(smY, ny, 0.28);
            smCov = lerp(smCov, cov, 0.16);
            const z = lerp(EYE_Z_FAR, EYE_Z_NEAR, smoothstep(0.03, 0.3, smCov));
            camRef.current = {
              x: clamp(smX, -1, 1),
              y: clamp(smY * 0.85, -1, 1),
              z,
              t: performance.now(),
              active: true,
            };
          }
        }
        trackerRaf = requestAnimationFrame(step);
      };
      let trackerRaf = requestAnimationFrame(step);
      trackerRef.current = () => {
        alive = false;
        cancelAnimationFrame(trackerRaf);
        if (video) video.srcObject = null;
      };
    } catch {
      setCamNote(
        "Camera unavailable — steering the window with your pointer / device tilt instead.",
      );
    }
  }, [running]);

  const fmt = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2);

  return (
    <main className="relative min-h-screen w-full bg-background text-foreground">
      <PrototypeNav slugs={["7320-fishtank"]} />

      {/* hidden tracker video */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* the window */}
      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
        <header className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            7320 · fishtank
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            A window into a resonant room
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            The screen is a window; move your head and both the view and the
            sound field turn with you. Off-axis fish-tank projection from a
            camera-tracked eye (no ML), with each resonant voice spatialised by
            its position in the room.
          </p>
        </header>

        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-[#0b0713]">
          <div ref={mountRef} className="absolute inset-0" />

          {webglFailed && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              <p className="text-base text-destructive">
                WebGL is unavailable in this browser, so the window can’t be
                rendered. Everything else about the piece needs a GPU canvas.
              </p>
            </div>
          )}

          {/* live readout overlay */}
          {!webglFailed && (
            <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-background/60 px-3 py-2 backdrop-blur-sm">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                eye · {readout.source}
              </p>
              <p className="mt-1 font-mono text-xs text-foreground">
                x {fmt(readout.x)}  y {fmt(readout.y)}  z {readout.z.toFixed(2)}
              </p>
              <p className="mt-0.5 font-mono text-xs text-primary">
                nearest voice · {readout.voice} {readout.side}
              </p>
            </div>
          )}
        </div>

        {/* controls */}
        <div className="flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Use my camera
            </button>
          ) : (
            <button
              onClick={stopSensing}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Stop camera + sound
            </button>
          )}
          {running && (
            <button
              onClick={() => setMuted((m) => !m)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
        </div>

        <p className="max-w-2xl text-sm text-muted-foreground">
          Sound only starts after you press the button (browser autoplay
          policy). The window is already alive on load — a seeded auto-orbit
          flies the eye so the parallax demos itself before any permission.
        </p>
        {camNote && <p className="max-w-2xl text-sm text-destructive">{camNote}</p>}
      </div>

      {/* design-notes dialog */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Fish-tank VR, hand-rolled
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A front-camera frame is downscaled to 64×48 and reduced to a
                skin-tone-weighted centroid — a cheap, dependency-free estimate
                of where your head is (Lee’s 2007 head-coupled parallax, without
                the Wii remote or any ML). Coverage stands in for depth: a nearer
                face fills more pixels.
              </p>
              <p>
                That eye position drives a generalized-perspective / off-axis
                frustum (Kooima 2008) so the four window corners stay pinned to
                the screen while the eye moves — the illusion Ware named
                “fish-tank virtual reality” in 1993. Objects near the glass shift
                strongly; deep ones reveal their sides.
              </p>
              <p>
                Each voice is a Web Audio PannerNode at a fixed room position; an
                AudioListener pinned to the tracked eye turns the whole sound
                field as you lean. A slow D-dorian just-intonation drone plus soft
                bell pings runs through a compressor/limiter at a 0.25 ceiling.
              </p>
              <p>
                Fallbacks: no camera → pointer (desktop) or device-tilt (mobile);
                idle → the seeded auto-orbit underneath. No WebGL → this notice,
                never a blank screen.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
