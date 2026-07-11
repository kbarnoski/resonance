"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Kite Flyer — TILT the tablet to fly a glowing kite across a bright daytime
// sky, and the flight PLAYS music. The kite's HEIGHT is a melody (snapped to a
// major pentatonic so every height is in tune), the WIND is a rhythm (gusts
// trigger soft sparkle chimes), and the taut STRING hums a soft Aeolian drone
// that swells with tension — the Aeolian-harp idea: wind playing a string.
//
// INPUT  : DeviceOrientation (gamma = left/right, beta = front/back) steers the
//          kite. Pointer-drag + an auto "breeze" fallback keep it fully playable
//          and always sounding on desktop / permission-denied devices.
// OUTPUT : three.js 3D scene — gradient sky, smiling sun, fat clouds, green
//          hills, a glossy diamond kite with a wavy bow tail on a visible string.
// AUDIO  : warm pentatonic pad + altitude→bell melody + gust→sparkle rhythm +
//          string-tension→Aeolian sawtooth drone. Kid-safe master chain.
//
// References: the Aeolian harp (wind playing a taut string), LocoRoco (tilt the
// whole world to play), kite-flying as embodied play.
// ─────────────────────────────────────────────────────────────────────────────

// ── musical scale: C major pentatonic across a few octaves (Hz) ──────────────
// Higher kite = higher note. Every snap lands on a "right" note.
const PENTATONIC: number[] = [
  // C3  D3   E3   G3    A3
  130.81, 146.83, 164.81, 196.0, 220.0,
  // C4  D4    E4    G4    A4
  261.63, 293.66, 329.63, 392.0, 440.0,
  // C5  D5    E5    G5    A5
  523.25, 587.33, 659.25, 783.99, 880.0,
];

// Snap a 0..1 altitude to a scale index.
function noteForAltitude(alt: number): number {
  const i = Math.round(THREE.MathUtils.clamp(alt, 0, 1) * (PENTATONIC.length - 1));
  return PENTATONIC[i];
}

type FlyMode = "tilt" | "drag" | "asking";

interface AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  droneGain: GainNode; // Aeolian string drone level
  droneFilter: BiquadFilterNode; // brightens with tension
}

export default function KiteFlyerPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<FlyMode>("asking");
  const [note, setNote] = useState<string>("");
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  const audioRef = useRef<AudioEngine | null>(null);
  const voicesRef = useRef(0); // active melody/sparkle voice count (cap ~6)

  // ── kid-safe audio engine (created lazily inside the Start tap) ────────────
  const ensureAudio = useCallback((): AudioEngine | null => {
    if (audioRef.current) {
      if (audioRef.current.ctx.state === "suspended") {
        void audioRef.current.ctx.resume();
      }
      return audioRef.current;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();

    // master chain: gain ≤ 0.3 → lowpass ≤ 7500 → compressor → destination.
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.setTargetAtTime(0.28, ctx.currentTime, 0.6);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7000;
    lp.Q.value = 0.3;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 20;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;

    master.connect(lp);
    lp.connect(comp);
    comp.connect(ctx.destination);

    // ── always-on warm pentatonic pad (never silent / broken) ──
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0001;
    padGain.gain.setTargetAtTime(0.05, ctx.currentTime, 1.4);
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 900;
    padFilter.connect(padGain);
    padGain.connect(master);
    // C major triad-ish bed: C3, G3, E4 detuned sines.
    [130.81, 196.0, 329.63].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = (i - 1) * 3;
      o.connect(padFilter);
      o.start();
    });
    // slow LFO breathing on the pad so it feels alive.
    const padLfo = ctx.createOscillator();
    const padLfoGain = ctx.createGain();
    padLfo.frequency.value = 0.08;
    padLfoGain.gain.value = 0.02;
    padLfo.connect(padLfoGain);
    padLfoGain.connect(padGain.gain);
    padLfo.start();

    // ── Aeolian string drone: filtered sawtooths that swell with tension ──
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001; // driven by string tension in the loop
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 700; // opens up as the string tightens
    droneFilter.Q.value = 1.2;
    droneFilter.connect(droneGain);
    droneGain.connect(master);
    // two slightly-detuned saws a fifth apart — a soft, airy string hum.
    [98.0, 146.83].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = i === 0 ? -6 : 7;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(droneFilter);
      o.start();
    });
    // gentle shimmer LFO on the drone filter (the "wind in the string").
    const dLfo = ctx.createOscillator();
    const dLfoGain = ctx.createGain();
    dLfo.frequency.value = 0.21;
    dLfoGain.gain.value = 120;
    dLfo.connect(dLfoGain);
    dLfoGain.connect(droneFilter.frequency);
    dLfo.start();

    const eng: AudioEngine = { ctx, master, droneGain, droneFilter };
    audioRef.current = eng;
    return eng;
  }, []);

  // ring a clean bell/marimba note (altitude melody + gust sparkle accents).
  const ringNote = useCallback(
    (freq: number, pan: number, gain: number, bright: number) => {
      const eng = audioRef.current;
      if (!eng) return;
      if (voicesRef.current >= 6) return; // voice cap
      const { ctx, master } = eng;
      const now = ctx.currentTime;
      voicesRef.current += 1;

      const panner = ctx.createStereoPanner();
      panner.pan.value = THREE.MathUtils.clamp(pan, -1, 1);
      panner.connect(master);

      const env = ctx.createGain();
      env.gain.value = 0.0001;
      env.connect(panner);

      // triangle fundamental + a soft sine overtone = warm bell/marimba.
      const o1 = ctx.createOscillator();
      o1.type = "triangle";
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freq * 2.0;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.18 + bright * 0.18;
      o1.connect(env);
      o2.connect(o2g);
      o2g.connect(env);

      const peak = 0.2 * gain;
      env.gain.setTargetAtTime(peak, now, 0.01);
      env.gain.setTargetAtTime(0.0001, now + 0.08, 0.5);

      o1.start(now);
      o2.start(now);
      o1.stop(now + 2.0);
      o2.stop(now + 2.0);
      o1.onended = () => {
        panner.disconnect();
        env.disconnect();
        o2g.disconnect();
        voicesRef.current = Math.max(0, voicesRef.current - 1);
      };
    },
    []
  );

  // ── WebGL capability check (runs once, client-side) ──
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl =
        c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl");
      setWebglOk(!!gl);
    } catch {
      setWebglOk(false);
    }
  }, []);

  // ── main scene + physics + sonification loop ──────────────────────────────
  useEffect(() => {
    if (!started || !webglOk) return;
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglOk(false);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 400);
    camera.position.set(0, 6, 34);
    camera.lookAt(0, 9, 0);

    // ── bright daytime sky: vertical gradient (paler horizon, deeper zenith) ──
    const skyGeo = new THREE.SphereGeometry(200, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2f9bff) },
        bottomColor: { value: new THREE.Color(0xcdeeff) },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        void main() {
          float h = clamp((normalize(vWorld).y + 0.15) / 1.0, 0.0, 1.0);
          vec3 c = mix(bottomColor, topColor, pow(h, 0.8));
          gl_FragColor = vec4(c, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // ── lights (sunny, bright) ──
    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const sunLight = new THREE.DirectionalLight(0xfff3d0, 1.2);
    sunLight.position.set(-14, 24, 10);
    scene.add(sunLight);

    // ── smiling sun (a yellow disc with a simple drawn face) ──
    const sunGroup = new THREE.Group();
    sunGroup.position.set(-22, 22, -40);
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe14d })
    );
    sunGroup.add(sunDisc);
    const sunGlow = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshBasicMaterial({
        color: 0xfff2a0,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sunGlow.position.z = -0.1;
    sunGroup.add(sunGlow);
    // sun rays (thin triangles around the disc)
    for (let i = 0; i < 12; i++) {
      const ray = new THREE.Mesh(
        new THREE.PlaneGeometry(0.9, 4),
        new THREE.MeshBasicMaterial({ color: 0xffd84d })
      );
      const a = (i / 12) * Math.PI * 2;
      ray.position.set(Math.cos(a) * 8, Math.sin(a) * 8, -0.05);
      ray.rotation.z = a - Math.PI / 2;
      sunGroup.add(ray);
    }
    // face: two eyes + a smile (made from small dark meshes)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x4a3a00 });
    const eyeL = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), eyeMat);
    eyeL.position.set(-2, 1.4, 0.1);
    const eyeR = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), eyeMat);
    eyeR.position.set(2, 1.4, 0.1);
    sunGroup.add(eyeL, eyeR);
    const smileShape = new THREE.Shape();
    smileShape.absarc(0, 0, 3, Math.PI * 1.15, Math.PI * 1.85, false);
    const smileGeo = new THREE.BufferGeometry().setFromPoints(
      smileShape.getPoints(24)
    );
    const smile = new THREE.Line(
      smileGeo,
      new THREE.LineBasicMaterial({ color: 0x4a3a00 })
    );
    smile.position.set(0, 0.2, 0.1);
    sunGroup.add(smile);
    sunGroup.lookAt(camera.position.x, camera.position.y, camera.position.z + 10);
    scene.add(sunGroup);

    // ── fat fluffy clouds (clusters of white spheres) ──
    interface Cloud {
      group: THREE.Group;
      speed: number;
    }
    const clouds: Cloud[] = [];
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      emissive: 0xdfeeff,
      emissiveIntensity: 0.25,
    });
    const cloudDefs = [
      { x: 16, y: 18, z: -30, s: 2.6 },
      { x: -8, y: 24, z: -35, s: 2.0 },
      { x: 24, y: 12, z: -22, s: 2.2 },
      { x: -20, y: 15, z: -26, s: 1.8 },
    ];
    cloudDefs.forEach((d) => {
      const g = new THREE.Group();
      const puffs = [
        [0, 0, 0, 1],
        [1.5, -0.3, 0, 0.8],
        [-1.6, -0.2, 0, 0.85],
        [0.6, 0.7, 0.3, 0.7],
        [-0.7, 0.5, -0.3, 0.65],
      ];
      puffs.forEach((p) => {
        const sph = new THREE.Mesh(
          new THREE.SphereGeometry(d.s * (p[3] as number), 16, 12),
          cloudMat
        );
        sph.position.set(
          (p[0] as number) * d.s,
          (p[1] as number) * d.s,
          (p[2] as number) * d.s
        );
        g.add(sph);
      });
      g.position.set(d.x, d.y, d.z);
      scene.add(g);
      clouds.push({ group: g, speed: 0.4 + Math.random() * 0.5 });
    });

    // ── rolling green hills at the bottom ──
    const hillGeo = new THREE.PlaneGeometry(260, 80, 60, 18);
    hillGeo.rotateX(-Math.PI / 2);
    const hpos = hillGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < hpos.count; i++) {
      const x = hpos.getX(i);
      const z = hpos.getZ(i);
      const y =
        Math.sin(x * 0.06) * 2.2 +
        Math.cos(z * 0.09 + 1.0) * 1.6 +
        Math.sin(x * 0.15 + z * 0.05) * 0.8;
      hpos.setY(i, y);
    }
    hillGeo.computeVertexNormals();
    const hills = new THREE.Mesh(
      hillGeo,
      new THREE.MeshStandardMaterial({
        color: 0x6fcf57,
        roughness: 0.95,
        metalness: 0,
      })
    );
    hills.position.set(0, -10, -10);
    scene.add(hills);

    // ── the anchor (a little person/stake) near the bottom-center ──
    const anchorPos = new THREE.Vector3(0, -7.5, 4);
    const anchor = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 2.4, 12),
      new THREE.MeshStandardMaterial({ color: 0xff7043, roughness: 0.6 })
    );
    anchor.position.copy(anchorPos);
    scene.add(anchor);

    // ── the KITE: a bold glossy diamond made of two triangles ──
    const kiteGroup = new THREE.Group();
    // diamond outline points (local space, pointing up)
    const kShape = new THREE.Shape();
    kShape.moveTo(0, 2.4);
    kShape.lineTo(1.7, 0.2);
    kShape.lineTo(0, -2.8);
    kShape.lineTo(-1.7, 0.2);
    kShape.lineTo(0, 2.4);
    const kiteGeo = new THREE.ShapeGeometry(kShape);
    // vertex colors: top half red/yellow, bottom half cyan — bold primaries.
    const kpos = kiteGeo.attributes.position as THREE.BufferAttribute;
    const kColors: number[] = [];
    const cTop = new THREE.Color(0xff3b3b);
    const cMid = new THREE.Color(0xffd400);
    const cBot = new THREE.Color(0x1fb6ff);
    for (let i = 0; i < kpos.count; i++) {
      const y = kpos.getY(i);
      let c: THREE.Color;
      if (y > 0.2) c = cTop;
      else if (y > -1.0) c = cMid;
      else c = cBot;
      kColors.push(c.r, c.g, c.b);
    }
    kiteGeo.setAttribute("color", new THREE.Float32BufferAttribute(kColors, 3));
    const kiteFace = new THREE.Mesh(
      kiteGeo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.25,
        metalness: 0.15,
        emissive: 0xffffff,
        emissiveIntensity: 0.12,
        side: THREE.DoubleSide,
      })
    );
    kiteGroup.add(kiteFace);
    // cross spars (the kite frame) for a crafted look
    const sparMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const sparV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 5.0, 0.12), sparMat);
    sparV.position.z = 0.05;
    const sparH = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 0.12), sparMat);
    sparH.position.set(0, 0.2, 0.05);
    kiteGroup.add(sparV, sparH);
    scene.add(kiteGroup);

    // ── wavy bow tail (a chain of small colored bow meshes) ──
    const TAIL_BOWS = 9;
    const tailColors = [0xff3b3b, 0xffd400, 0x1fb6ff, 0x6fcf57, 0xff7feb];
    interface Bow {
      mesh: THREE.Mesh;
      offset: number;
    }
    const bows: Bow[] = [];
    for (let i = 0; i < TAIL_BOWS; i++) {
      const c = tailColors[i % tailColors.length];
      const bow = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.16, 8, 14),
        new THREE.MeshStandardMaterial({
          color: c,
          roughness: 0.4,
          emissive: c,
          emissiveIntensity: 0.15,
        })
      );
      bow.rotation.y = Math.PI / 2;
      scene.add(bow);
      bows.push({ mesh: bow, offset: (i + 1) * 0.9 });
    }

    // ── the visible STRING (a line from anchor to kite) ──
    const STRING_SEGS = 24;
    const stringPos = new Float32Array(STRING_SEGS * 3);
    const stringGeo = new THREE.BufferGeometry();
    stringGeo.setAttribute("position", new THREE.BufferAttribute(stringPos, 3));
    const stringLine = new THREE.Line(
      stringGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    scene.add(stringLine);

    // ── sparkle bursts (wind-gust rhythm accents) ──
    interface Spark {
      mesh: THREE.Points;
      vel: Float32Array;
      life: number;
      max: number;
    }
    const sparks: Spark[] = [];
    const spawnSparkle = (p: THREE.Vector3, hex: number) => {
      const N = 18;
      const sgeo = new THREE.BufferGeometry();
      const sp = new Float32Array(N * 3);
      const vel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        sp[i * 3] = p.x;
        sp[i * 3 + 1] = p.y;
        sp[i * 3 + 2] = p.z;
        const a = Math.random() * Math.PI * 2;
        const up = 0.4 + Math.random() * 1.4;
        const r = 1.0 + Math.random() * 2.2;
        vel[i * 3] = Math.cos(a) * r;
        vel[i * 3 + 1] = up;
        vel[i * 3 + 2] = Math.sin(a) * r;
      }
      sgeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      const mesh = new THREE.Points(
        sgeo,
        new THREE.PointsMaterial({
          color: hex,
          size: 0.55,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      scene.add(mesh);
      sparks.push({ mesh, vel, life: 0, max: 0.9 });
    };

    // ── play bounds for the kite (world units) ──
    const X_RANGE = 18; // horizontal reach
    const Y_MIN = 0; // lowest the kite drops to
    const Y_MAX = 24; // highest it climbs
    const Z_FIXED = -2;

    // ── physics state: target driven by input, position lags with a spring ──
    const target = new THREE.Vector2(0, 12); // x, y the kite wants to be at
    const pos = new THREE.Vector2(0, 11);
    const vel = new THREE.Vector2(0, 0);

    // tilt/drag input → a steering vector in [-1,1] each axis
    const steer = new THREE.Vector2(0, 0);
    let lastInputAt = performance.now();

    // ── input: device orientation ──
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      const g = THREE.MathUtils.clamp(e.gamma, -40, 40) / 40; // L/R
      const b = THREE.MathUtils.clamp(e.beta - 40, -40, 40) / 40; // F/B (tilt up to climb)
      steer.set(g, -b);
      lastInputAt = performance.now();
    };

    // ── input: pointer drag fallback (steer toward pointer) ──
    const canvas = renderer.domElement;
    let dragging = false;
    const applyPointer = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      const nx = ((clientX - r.left) / r.width) * 2 - 1; // -1..1
      const ny = -(((clientY - r.top) / r.height) * 2 - 1); // -1..1 (up positive)
      steer.set(THREE.MathUtils.clamp(nx * 1.4, -1, 1), THREE.MathUtils.clamp(ny * 1.4, -1, 1));
      lastInputAt = performance.now();
    };
    const onPointerDown = (ev: PointerEvent) => {
      dragging = true;
      applyPointer(ev.clientX, ev.clientY);
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging) return;
      applyPointer(ev.clientX, ev.clientY);
    };
    const onPointerUp = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    let usingTilt = false;
    const onOrientWrap = (e: DeviceOrientationEvent) => {
      usingTilt = true;
      onOrient(e);
    };
    if (mode === "tilt") {
      window.addEventListener("deviceorientation", onOrientWrap);
    }

    // ── resize ──
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── sonification state ──
    let lastNoteIdx = -1;
    let noteRefractoryUntil = 0;
    let gustRefractoryUntil = 0;
    const project = new THREE.Vector3();

    const clock = new THREE.Clock();
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const nowMs = performance.now();

      // ── ghost breeze: if no input ~2s, an auto wind keeps it swooping ──
      const idle = nowMs - lastInputAt > 2000;
      if (idle) {
        steer.set(
          Math.sin(t * 0.5) * 0.55 + Math.sin(t * 1.3) * 0.2,
          0.25 + Math.sin(t * 0.37) * 0.45
        );
      }

      // wind gust signal (smooth-ish pseudo-noise) drives oscillation + rhythm.
      const gust =
        Math.sin(t * 0.9) * 0.5 +
        Math.sin(t * 2.3 + 1.1) * 0.3 +
        Math.sin(t * 4.7 + 0.3) * 0.2;
      const windSway = gust * 2.2;

      // target from steering, mapped into world bounds.
      target.x = steer.x * X_RANGE + windSway;
      target.y = THREE.MathUtils.clamp(
        Y_MIN + (steer.y * 0.5 + 0.55) * (Y_MAX - Y_MIN) + gust * 1.2,
        Y_MIN,
        Y_MAX
      );
      target.x = THREE.MathUtils.clamp(target.x, -X_RANGE - 3, X_RANGE + 3);

      // spring toward target (kite swoops, with momentum + a little gravity).
      const k = 5.5; // spring stiffness
      const damp = 0.86; // velocity damping
      vel.x += (target.x - pos.x) * k * dt;
      vel.y += (target.y - pos.y) * k * dt;
      vel.y -= 3.2 * dt; // gentle gravity pulls down
      vel.multiplyScalar(Math.pow(damp, dt * 60));
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      pos.x = THREE.MathUtils.clamp(pos.x, -X_RANGE - 3, X_RANGE + 3);
      pos.y = THREE.MathUtils.clamp(pos.y, Y_MIN, Y_MAX);

      // place the kite; bank/roll into its motion for life.
      kiteGroup.position.set(pos.x, pos.y, Z_FIXED);
      const bank = THREE.MathUtils.clamp(-vel.x * 0.06, -0.6, 0.6);
      const pitch = THREE.MathUtils.clamp(vel.y * 0.03, -0.4, 0.4);
      kiteGroup.rotation.z = bank;
      kiteGroup.rotation.x = pitch;
      kiteGroup.rotation.y = Math.sin(t * 1.5) * 0.08;

      // ── string: curve from anchor up to the kite's bottom tip ──
      const kiteBottom = new THREE.Vector3(pos.x, pos.y - 2.8, Z_FIXED);
      // string tension grows with altitude and with how far it's stretched.
      const dist = kiteBottom.distanceTo(anchorPos);
      const slackLen = Y_MAX + 6;
      const tension = THREE.MathUtils.clamp(dist / slackLen, 0, 1);
      const sag = (1 - tension) * 5.0; // taut string = little sag
      for (let i = 0; i < STRING_SEGS; i++) {
        const u = i / (STRING_SEGS - 1);
        const x = THREE.MathUtils.lerp(anchorPos.x, kiteBottom.x, u);
        const y =
          THREE.MathUtils.lerp(anchorPos.y, kiteBottom.y, u) -
          Math.sin(u * Math.PI) * sag +
          Math.sin(t * 6 + u * 8) * tension * 0.18; // taut string shivers
        const z = THREE.MathUtils.lerp(anchorPos.z, kiteBottom.z, u);
        stringPos[i * 3] = x;
        stringPos[i * 3 + 1] = y;
        stringPos[i * 3 + 2] = z;
      }
      stringGeo.attributes.position.needsUpdate = true;
      (stringLine.material as THREE.LineBasicMaterial).opacity = 0.55 + tension * 0.4;

      // ── wavy tail: bows trail below the kite in a sine wave ──
      bows.forEach((bw, i) => {
        const drop = bw.offset;
        const tx = pos.x + Math.sin(t * 3 - i * 0.7) * (0.6 + i * 0.12) + bank * drop * 0.4;
        const ty = pos.y - 2.8 - drop;
        bw.mesh.position.set(tx, ty, Z_FIXED + 0.1);
        bw.mesh.rotation.z = t * 1.5 + i;
      });

      // clouds drift slowly and wrap around.
      clouds.forEach((cl) => {
        cl.group.position.x += cl.speed * dt;
        if (cl.group.position.x > 34) cl.group.position.x = -34;
      });

      // gentle camera follow (keeps the kite comfortably framed).
      camera.position.x += (pos.x * 0.25 - camera.position.x) * Math.min(1, dt * 2);
      camera.lookAt(pos.x * 0.3, 9 + pos.y * 0.15, 0);

      // ── screen-x of kite → stereo pan ──
      project.copy(kiteGroup.position).project(camera);
      const screenX = THREE.MathUtils.clamp(project.x, -1, 1);

      // ── AUDIO: altitude → pentatonic melody ──
      const alt = (pos.y - Y_MIN) / (Y_MAX - Y_MIN);
      const freq = noteForAltitude(alt);
      const idx = PENTATONIC.indexOf(freq);
      if (idx !== lastNoteIdx && nowMs > noteRefractoryUntil) {
        lastNoteIdx = idx;
        noteRefractoryUntil = nowMs + 130; // refractory so it never piles up
        const vol = 0.6 + Math.min(vel.length() / 14, 1) * 0.4;
        ringNote(freq, screenX, vol, alt);
      }

      // ── AUDIO: wind gusts → sparkle/chime rhythm accents ──
      if (gust > 0.85 && nowMs > gustRefractoryUntil) {
        gustRefractoryUntil = nowMs + 280;
        // a higher pentatonic chime, panned with the kite.
        const chime = PENTATONIC[10 + Math.floor(Math.random() * 5)];
        ringNote(chime, screenX, 0.5, 1);
        spawnSparkle(kiteGroup.position.clone(), 0xfff2a0);
      }

      // ── AUDIO: string tension → Aeolian drone swell ──
      const eng = audioRef.current;
      if (eng) {
        const targetDrone = 0.02 + tension * 0.1 + Math.max(0, gust) * 0.02;
        eng.droneGain.gain.setTargetAtTime(targetDrone, eng.ctx.currentTime, 0.2);
        eng.droneFilter.frequency.setTargetAtTime(
          500 + tension * 1400,
          eng.ctx.currentTime,
          0.25
        );
      }

      // ── kite glow pulse for liveliness ──
      (kiteFace.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.1 + Math.min(vel.length() / 16, 1) * 0.25 + Math.sin(t * 4) * 0.05;

      // ── sparkles update ──
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        const sp = s.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = sp.array as Float32Array;
        for (let j = 0; j < arr.length; j += 3) {
          s.vel[j + 1] -= 3.5 * dt;
          arr[j] += s.vel[j] * dt;
          arr[j + 1] += s.vel[j + 1] * dt;
          arr[j + 2] += s.vel[j + 2] * dt;
        }
        sp.needsUpdate = true;
        (s.mesh.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - s.life / s.max);
        if (s.life >= s.max) {
          scene.remove(s.mesh);
          s.mesh.geometry.dispose();
          (s.mesh.material as THREE.Material).dispose();
          sparks.splice(i, 1);
        }
      }

      renderer.render(scene, camera);
    };
    tick();

    // if tilt mode but no event arrives shortly, fall back to drag.
    let fallbackTimer = 0;
    if (mode === "tilt") {
      fallbackTimer = window.setTimeout(() => {
        if (!usingTilt) {
          window.removeEventListener("deviceorientation", onOrientWrap);
          setMode("drag");
          setNote("No tilt here — drag with your finger to fly the kite. The breeze flies it on its own too!");
        }
      }, 1800);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("deviceorientation", onOrientWrap);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      // dispose sparkles still in flight
      sparks.forEach((s) => {
        scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
      });
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [started, mode, webglOk, ringNote]);

  // ── start handlers ─────────────────────────────────────────────────────────
  const startTilt = useCallback(async () => {
    ensureAudio();
    type OrientCtor = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const D =
      typeof DeviceOrientationEvent !== "undefined"
        ? (DeviceOrientationEvent as OrientCtor)
        : undefined;
    if (D && typeof D.requestPermission === "function") {
      // iOS: MUST be called inside this user tap.
      try {
        const res = await D.requestPermission();
        if (res === "granted") {
          setMode("tilt");
          setNote("");
        } else {
          setMode("drag");
          setNote("Tilt is off — drag with your finger. The breeze flies it too!");
        }
      } catch {
        setMode("drag");
        setNote("Couldn't read tilt — drag with your finger. The breeze flies it too!");
      }
    } else if (D) {
      setMode("tilt");
      setNote("");
    } else {
      setMode("drag");
      setNote("No tilt sensor — drag with your finger. The breeze flies it too!");
    }
    setStarted(true);
  }, [ensureAudio]);

  // ── cleanup audio on unmount ──
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      if (a) {
        try {
          void a.ctx.close();
        } catch {
          /* already closed */
        }
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-slate-950 text-foreground">
      {/* the three.js canvas mounts here */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* ── start / intro overlay ── */}
      {!started && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-violet-400/30 to-slate-950/85 px-6 text-center backdrop-blur-sm">
          <h1 className="font-semibold text-4xl font-bold text-foreground drop-shadow sm:text-5xl">
            Kite Flyer
          </h1>
          <p className="max-w-md text-base text-foreground sm:text-lg">
            Tilt the tablet to fly a glowing kite across a sunny sky. The higher
            it climbs the higher it sings, the wind sparkles a rhythm, and the
            taut string hums along.
          </p>
          {!webglOk ? (
            <p className="max-w-md text-base text-violet-300">
              This device can&apos;t show 3D graphics, so the kite can&apos;t
              take off here. Try a newer browser or device.
            </p>
          ) : (
            <button
              type="button"
              onClick={startTilt}
              className="min-h-[64px] min-w-[64px] rounded-full bg-gradient-to-b from-violet-300 to-violet-400 px-10 py-4 text-2xl font-bold text-violet-950 shadow-lg transition active:scale-95"
            >
              Fly! 🪁
            </button>
          )}
          <p className="text-base text-muted-foreground">No reading needed — just tilt or drag.</p>
        </div>
      )}

      {/* ── in-play notice (fallback / tips) ── */}
      {started && note && (
        <div className="absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-2xl bg-slate-900/80 px-4 py-2.5 text-center text-base text-foreground shadow-lg backdrop-blur">
          {note}
        </div>
      )}

      {/* ── design notes toggle ── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-4 right-4 z-20 min-h-[44px] rounded-full bg-slate-900/70 px-4 py-2.5 font-mono text-base text-foreground shadow backdrop-blur transition active:scale-95"
      >
        {showNotes ? "close" : "notes"}
      </button>

      {showNotes && (
        <div className="absolute bottom-20 right-4 z-20 max-h-[70dvh] w-[min(92vw,28rem)] overflow-y-auto rounded-2xl bg-slate-900/90 p-5 text-base text-foreground shadow-2xl backdrop-blur">
          <h2 className="mb-2 font-semibold text-xl text-foreground">Design notes</h2>
          <p className="mb-3 text-foreground">
            <span className="font-semibold">The question:</span> what if a
            4-year-old could TILT the tablet to fly a glowing kite, and the
            kite&apos;s flight PLAYED music — its height a melody, the wind a
            rhythm, its taut string an Aeolian drone?
          </p>
          <p className="mb-3 text-foreground">
            <span className="font-semibold">How it plays:</span> tilt left/right
            steers the kite across the sky; tilt forward/back climbs or dives.
            Every height snaps to a major-pentatonic note, so there are no wrong
            notes — higher is higher. Wind gusts toss in sparkle chimes, and the
            taut string hums a soft, swelling drone the more it tightens.
          </p>
          <p className="mb-3 text-foreground">
            <span className="font-semibold">If there&apos;s no tilt</span> (a
            desktop, or permission denied) you drag the kite with a finger or
            mouse — and if nobody touches it, a gentle breeze keeps it swooping
            and singing on its own.
          </p>
          <p className="mb-1 font-semibold text-foreground">References</p>
          <ul className="mb-3 list-disc pl-5 text-foreground">
            <li>
              The <span className="italic">Aeolian harp</span> — an instrument
              the wind plays by vibrating a taut string (the humming drone here).
            </li>
            <li>
              <span className="italic">LocoRoco</span> — tilt the whole world to
              play.
            </li>
            <li>Kite-flying as embodied, whole-body play.</li>
          </ul>
          <p className="font-mono text-base text-muted-foreground">
            tilt · three.js 3D · pentatonic altitude · Aeolian string drone
          </p>
        </div>
      )}
    </main>
  );
}
