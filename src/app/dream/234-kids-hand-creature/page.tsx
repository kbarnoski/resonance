"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// 234 · Kids Hand Creature
//
// "What if a 4-year-old could grow and play a glowing 3D creature just by moving
// their hands in front of the iPad — no touching the screen?"
//
// A friendly blobby creature (icosahedron displaced in the vertex shader by 3D
// simplex noise). A webcam + MediaPipe HandLandmarker conduct it:
//   hand HEIGHT   → size / inflation (uGrow) + pentatonic pitch
//   hand OPENNESS → spikiness (noise amplitude) + brightness
//   two hands     → a second smaller satellite blob orbits
// Raising a hand across a threshold band rings a soft pentatonic note. A quiet
// pad always loops so it is never silent.
//
// References:
//  · Derivative — "Hand Tracking Master Class in TouchDesigner with MediaPipe"
//    (hand landmarks conducting visuals).
//  · spite / clicktorelease — "Vertex displacement with a noise function using
//    GLSL and three.js" (the blob shader).
// ─────────────────────────────────────────────────────────────────────────────

// ── GLSL: 3D simplex-noise vertex displacement (Ashima / Stefan Gustavson) ───
const NOISE_GLSL = /* glsl */ `
  vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
`;

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uGrow;   // 0..1 inflation
  uniform float uSpike;  // 0..1 noise amplitude
  varying float vDisp;
  varying vec3  vViewNormal;

  ${NOISE_GLSL}

  void main() {
    vec3 n = normalize(normal);
    // breathing baseline + grow inflation
    float base = 1.0 + uGrow * 0.55 + sin(uTime * 1.2) * 0.03;
    // layered noise; amplitude rises with openness
    float amp = 0.10 + uSpike * 0.55;
    float t = uTime * 0.5;
    float d  = snoise(n * 1.6 + vec3(0.0, t, 0.0)) * amp;
    d       += snoise(n * 3.4 + vec3(t * 0.7, 0.0, t * 0.4)) * amp * 0.45;
    vDisp = d;
    vViewNormal = normalize(normalMatrix * normal);
    vec3 newPos = position * base + n * d;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float uHue;     // 0..1 base hue
  uniform float uBright;  // 0..1 brightness
  varying float vDisp;
  varying vec3  vViewNormal;

  vec3 hsl2rgb(float h, float s, float l){
    float c  = (1.0 - abs(2.0*l - 1.0)) * s;
    float hp = mod(h*6.0, 6.0);
    float x  = c * (1.0 - abs(mod(hp,2.0) - 1.0));
    vec3 rgb;
    if      (hp < 1.0) rgb = vec3(c,x,0.0);
    else if (hp < 2.0) rgb = vec3(x,c,0.0);
    else if (hp < 3.0) rgb = vec3(0.0,c,x);
    else if (hp < 4.0) rgb = vec3(0.0,x,c);
    else if (hp < 5.0) rgb = vec3(x,0.0,c);
    else               rgb = vec3(c,0.0,x);
    return rgb + (l - c*0.5);
  }

  void main(){
    float glow = clamp(vDisp * 1.4 + 0.5, 0.0, 1.0);
    float luma = 0.28 + uBright * 0.40 + glow * 0.18;
    float sat  = 0.85;
    vec3 col = hsl2rgb(uHue, sat, luma);

    // rim light for a soft jelly glow
    float edge = 1.0 - abs(vViewNormal.z);
    col += hsl2rgb(uHue + 0.06, 1.0, 0.5) * pow(edge, 2.0) * 0.55;

    col = col / (col + 0.35);
    col = pow(col, vec3(0.85));
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ── C major pentatonic, low→high ─────────────────────────────────────────────
const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25]; // C4 D4 E4 G4 A4 C5
// hue per step: low = deep violet (0.74) → high = warm rose/amber (0.04)
const HUE_FOR_STEP = [0.74, 0.66, 0.54, 0.16, 0.08, 0.03];

// ── live state the render loop reads (refs, no React re-render per frame) ────
interface Live {
  grow: number;   // 0..1 target inflation (hand height)
  spike: number;  // 0..1 target openness
  hue: number;    // 0..1 target hue
  bright: number; // 0..1 target brightness
  twoHands: number; // 0..1 satellite presence
  satX: number;
  satY: number;
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

// ── audio rig: pad + plucked pentatonic voices with soft delay reverb ────────
interface Rig {
  ac: AudioContext;
  master: GainNode;
  fx: GainNode;       // send target for plucks (delay)
  padGain: GainNode;
}

function makeRig(): Rig | null {
  const ACtx =
    window.AudioContext ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).webkitAudioContext as typeof AudioContext | undefined);
  if (!ACtx) return null;
  const ac = new ACtx();

  const master = ac.createGain();
  master.gain.value = 0.85;
  // gentle limiter so nothing is ever harsh (kids rule: safe sounds)
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.attack.value = 0.02;
  comp.release.value = 0.4;
  master.connect(comp);
  comp.connect(ac.destination);

  // soft feedback delay = pseudo-reverb shimmer
  const delay = ac.createDelay(1.0);
  delay.delayTime.value = 0.33;
  const fb = ac.createGain();
  fb.gain.value = 0.34;
  const fxLow = ac.createBiquadFilter();
  fxLow.type = "lowpass";
  fxLow.frequency.value = 2200;
  const fx = ac.createGain();
  fx.gain.value = 0.5;
  fx.connect(delay);
  delay.connect(fxLow);
  fxLow.connect(fb);
  fb.connect(delay);
  fxLow.connect(master);

  // always-on ambient pad (two detuned sines, slow tremolo)
  const padGain = ac.createGain();
  padGain.gain.value = 0.0;
  padGain.connect(master);
  padGain.gain.setTargetAtTime(0.06, ac.currentTime, 1.5);
  const padFilt = ac.createBiquadFilter();
  padFilt.type = "lowpass";
  padFilt.frequency.value = 700;
  padFilt.connect(padGain);
  [130.81, 196.0, 261.63].forEach((f, i) => {
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = f * (i === 1 ? 1.003 : 1.0);
    const g = ac.createGain();
    g.gain.value = 0.5;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.03;
    const lfoG = ac.createGain();
    lfoG.gain.value = 0.3;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    o.connect(g);
    g.connect(padFilt);
    o.start();
    lfo.start();
  });

  return { ac, master, fx, padGain };
}

// one soft pentatonic note — sine/triangle blend, gentle attack/release
function ringNote(rig: Rig, step: number, velocity = 0.8) {
  const { ac, master, fx } = rig;
  const now = ac.currentTime;
  const freq = PENTA[Math.max(0, Math.min(PENTA.length - 1, step))];
  const peak = 0.18 * velocity;

  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.06); // soft attack
  g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6); // gentle release

  const o1 = ac.createOscillator();
  o1.type = "sine";
  o1.frequency.value = freq;
  const o2 = ac.createOscillator();
  o2.type = "triangle";
  o2.frequency.value = freq * 2.0;
  const o2g = ac.createGain();
  o2g.gain.value = 0.25;

  o1.connect(g);
  o2.connect(o2g);
  o2g.connect(g);
  g.connect(master);
  g.connect(fx);

  o1.start(now); o1.stop(now + 1.8);
  o2.start(now); o2.stop(now + 1.8);
}

export default function KidsHandCreature() {
  const [phase, setPhase] = useState<"idle" | "live" | "fallback">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rigRef = useRef<Rig | null>(null);
  const liveRef = useRef<Live>({
    grow: 0.2, spike: 0.1, hue: 0.74, bright: 0.3,
    twoHands: 0, satX: 0, satY: 0,
  });

  // three.js refs kept for disposal
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    geo: THREE.IcosahedronGeometry;
    mat: THREE.ShaderMaterial;
    satMat: THREE.ShaderMaterial;
    mesh: THREE.Mesh;
    satMesh: THREE.Mesh;
    raf: number;
  } | null>(null);

  const detectorRef = useRef<unknown>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectActiveRef = useRef(false);

  // last note step + threshold latch for note triggering
  const lastStepRef = useRef(-1);
  const aboveRef = useRef(false);
  const demoPhraseRef = useRef(0);
  const demoClockRef = useRef(0);

  // ── set up the three.js scene once on mount ────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    const geo = new THREE.IcosahedronGeometry(1.0, 24);
    geo.computeVertexNormals();

    const mkMat = () => new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uGrow: { value: 0.2 },
        uSpike: { value: 0.1 },
        uHue: { value: 0.74 },
        uBright: { value: 0.3 },
      },
    });

    const mat = mkMat();
    const satMat = mkMat();

    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const satMesh = new THREE.Mesh(geo, satMat);
    satMesh.scale.setScalar(0.42);
    satMesh.visible = false;
    scene.add(satMesh);

    threeRef.current = { renderer, scene, camera, geo, mat, satMat, mesh, satMesh, raf: 0 };

    const onResize = () => {
      const nw = mount.clientWidth || window.innerWidth;
      const nh = mount.clientHeight || window.innerHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let smGrow = 0.2, smSpike = 0.1, smHue = 0.74, smBright = 0.3, smTwo = 0;

    const tick = () => {
      const t = clock.getElapsedTime();
      const dt = Math.min(clock.getDelta(), 0.05);
      const L = liveRef.current;

      // demo / fallback auto-phrase keeps it alive without hands
      if (phaseRef.current !== "live") {
        demoClockRef.current += dt;
        const breath = (Math.sin(t * 0.6) + 1) / 2;
        L.grow = 0.25 + breath * 0.45;
        L.spike = 0.15 + (Math.sin(t * 0.31) + 1) / 2 * 0.25;
        const step = Math.floor(breath * (PENTA.length - 1));
        L.hue = HUE_FOR_STEP[step];
        L.bright = 0.35 + breath * 0.3;
        if (phaseRef.current === "fallback" && demoClockRef.current > 1.9) {
          demoClockRef.current = 0;
          const rig = rigRef.current;
          if (rig) {
            const seq = [0, 2, 4, 2, 1, 3, 5, 3];
            ringNote(rig, seq[demoPhraseRef.current % seq.length], 0.6);
            demoPhraseRef.current++;
          }
        }
      }

      // smooth toward targets for buttery motion (immediate-feel but no jitter)
      const k = 1 - Math.pow(0.001, dt);
      smGrow += (L.grow - smGrow) * k;
      smSpike += (L.spike - smSpike) * k;
      smHue += (shortestHue(smHue, L.hue)) * k;
      smHue = (smHue + 1) % 1;
      smBright += (L.bright - smBright) * k;
      smTwo += (L.twoHands - smTwo) * k;

      const tr = threeRef.current;
      if (tr) {
        const u = tr.mat.uniforms;
        u.uTime.value = t;
        u.uGrow.value = smGrow;
        u.uSpike.value = smSpike;
        u.uHue.value = smHue;
        u.uBright.value = smBright;
        tr.mesh.rotation.y = t * 0.18;
        tr.mesh.rotation.x = Math.sin(t * 0.12) * 0.2;

        // satellite blob for two hands
        tr.satMesh.visible = smTwo > 0.02;
        const su = tr.satMat.uniforms;
        su.uTime.value = t * 1.3;
        su.uGrow.value = smGrow * 0.7;
        su.uSpike.value = Math.min(1, smSpike + 0.2);
        su.uHue.value = (smHue + 0.45) % 1;
        su.uBright.value = smBright;
        tr.satMesh.scale.setScalar(0.42 * smTwo + 0.001);
        const orbit = t * 0.8;
        tr.satMesh.position.set(
          Math.cos(orbit) * 2.0 + L.satX * 0.5,
          Math.sin(orbit * 0.7) * 1.2 - L.satY * 0.5,
          Math.sin(orbit) * 0.8,
        );

        tr.renderer.render(tr.scene, tr.camera);
        tr.raf = requestAnimationFrame(tick);
      }
    };
    tick();

    return () => {
      window.removeEventListener("resize", onResize);
      const tr = threeRef.current;
      if (tr) {
        cancelAnimationFrame(tr.raf);
        tr.geo.dispose();
        tr.mat.dispose();
        tr.satMat.dispose();
        tr.renderer.dispose();
        if (tr.renderer.domElement.parentNode === mount) {
          mount.removeChild(tr.renderer.domElement);
        }
      }
      threeRef.current = null;
    };
  }, []);

  // phaseRef mirrors phase so the rAF closure reads the current value
  const phaseRef = useRef<"idle" | "live" | "fallback">("idle");
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // map landmarks → live targets + note triggering
  const applyHands = useCallback((hands: Array<Array<{ x: number; y: number; z: number }>>) => {
    const L = liveRef.current;
    if (!hands.length) {
      // hands gone: relax toward sleepy idle
      L.grow += (0.2 - L.grow) * 0.05;
      L.spike += (0.1 - L.spike) * 0.05;
      L.bright += (0.3 - L.bright) * 0.05;
      L.twoHands += (0 - L.twoHands) * 0.05;
      aboveRef.current = false;
      return;
    }

    // primary hand = the one highest on screen
    let best = hands[0];
    let bestY = 1;
    for (const h of hands) {
      const wristY = h[0].y;
      if (wristY < bestY) { bestY = wristY; best = h; }
    }

    // height: wrist y is 0 at top → invert to 0(bottom)..1(top)
    const height = clamp01(1 - best[0].y);
    L.grow = height;

    // pitch step from height
    const step = Math.min(PENTA.length - 1, Math.floor(height * PENTA.length));
    L.hue = HUE_FOR_STEP[step];
    L.bright = 0.3 + height * 0.5;

    // openness: average fingertip distance from palm centre, normalized by hand span
    const tips = [4, 8, 12, 16, 20];
    const palm = best[0];
    const mid = best[9]; // middle-finger MCP — stable hand-size reference
    const span = Math.hypot(mid.x - palm.x, mid.y - palm.y) || 0.001;
    let spread = 0;
    for (const ti of tips) spread += Math.hypot(best[ti].x - palm.x, best[ti].y - palm.y);
    spread /= tips.length;
    const openness = clamp01((spread / span - 1.4) / 1.6);
    L.spike = openness;

    // two hands → satellite
    L.twoHands = hands.length > 1 ? 1 : 0;
    if (hands.length > 1) {
      const other = hands.find((h) => h !== best) ?? best;
      L.satX = (other[0].x - 0.5) * 2;
      L.satY = (other[0].y - 0.5) * 2;
    }

    // threshold band: crossing up past 0.6 rings the note for the current step
    const above = height > 0.6;
    if (above && !aboveRef.current) {
      const rig = rigRef.current;
      if (rig) ringNote(rig, step, 0.6 + openness * 0.4);
      lastStepRef.current = step;
    }
    // also ring when sliding to a new step while up high (so it plays as a scale)
    else if (above && step !== lastStepRef.current) {
      const rig = rigRef.current;
      if (rig) ringNote(rig, step, 0.5 + openness * 0.4);
      lastStepRef.current = step;
    }
    aboveRef.current = above;
  }, []);

  // ── hand-tracking detection loop ───────────────────────────────────────────
  const runDetection = useCallback(() => {
    const detector = detectorRef.current as
      | { detectForVideo: (v: HTMLVideoElement, t: number) => { landmarks?: Array<Array<{ x: number; y: number; z: number }>> } }
      | null;
    const video = videoRef.current;
    const loop = () => {
      if (!detectActiveRef.current || !detector || !video) return;
      if (video.readyState >= 2) {
        try {
          const res = detector.detectForVideo(video, performance.now());
          applyHands(res?.landmarks ?? []);
        } catch {
          /* transient detect error — keep looping */
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, [applyHands]);

  // ── wake: camera + audio + MediaPipe ───────────────────────────────────────
  const wake = useCallback(async () => {
    // audio first (needs the user gesture)
    if (!rigRef.current) rigRef.current = makeRig();
    void rigRef.current?.ac.resume();

    // try camera
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
    } catch {
      setMessage("No camera? No problem — the creature will play by itself. 🪼");
      setPhase("fallback");
      return;
    }
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => {});
    }

    // try MediaPipe
    try {
      // @ts-expect-error - runtime ESM import, no local types
      const vision: any = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/+esm"); // eslint-disable-line @typescript-eslint/no-explicit-any
      const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm");
      const handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
      });
      detectorRef.current = handLandmarker;
      detectActiveRef.current = true;
      setPhase("live");
      setMessage(null);
      runDetection();
    } catch {
      // MediaPipe failed (offline) — keep showing the mirror but auto-play
      setMessage("Can't reach the magic just now — the creature will play by itself. 🪼");
      setPhase("fallback");
    }
  }, [runDetection]);

  // tap the creature in fallback → bounce + ring (degradation-only input)
  const tapCreature = useCallback(() => {
    if (phaseRef.current !== "fallback") return;
    const rig = rigRef.current;
    const L = liveRef.current;
    L.grow = Math.min(1, L.grow + 0.4);
    L.spike = Math.min(1, L.spike + 0.3);
    const step = Math.floor(Math.random() * PENTA.length);
    L.hue = HUE_FOR_STEP[step];
    if (rig) ringNote(rig, step, 0.85);
  }, []);

  // cleanup camera + detector on unmount
  useEffect(() => () => {
    detectActiveRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    const d = detectorRef.current as { close?: () => void } | null;
    try { d?.close?.(); } catch { /* ignore */ }
    void rigRef.current?.ac.close();
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: "calc(100vh - 3rem)", background: "radial-gradient(ellipse at 50% 35%, #1a0f3a 0%, #0a0618 60%, #050211 100%)" }}
    >
      {/* mirrored webcam preview (small, corner) */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute bottom-4 left-4 w-32 h-24 rounded-xl object-cover opacity-70 border border-border"
        style={{ transform: "scaleX(-1)", display: phase === "live" ? "block" : "none" }}
      />

      {/* three.js canvas mount; tap-to-bounce in fallback */}
      <div ref={mountRef} onClick={tapCreature} className="absolute inset-0" />

      {/* idle splash */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3 drop-shadow-lg">
            Hand Creature
          </h1>
          <p className="text-xl text-foreground max-w-md leading-relaxed mb-8">
            Lift your hands in the air and grow a glowing creature. Open your hands to make it sparkle. No touching!
          </p>
          <button
            onClick={() => { void wake(); }}
            className="pointer-events-auto min-h-[64px] px-8 py-4 rounded-3xl text-2xl font-bold text-foreground bg-violet-500/40 border-2 border-violet-300/60 hover:bg-violet-500/55 active:scale-95 transition-all shadow-xl"
          >
            Wake the creature 🪼
          </button>
          <Link href="/dream" className="pointer-events-auto mt-10 text-base text-muted-foreground hover:text-foreground">
            ← dream
          </Link>
        </div>
      )}

      {/* live HUD */}
      {phase === "live" && (
        <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none px-4">
          <p className="text-xl text-foreground text-center max-w-lg drop-shadow">
            Raise your hands to grow it! Open wide to make it sparkle ✨
          </p>
        </div>
      )}

      {/* fallback / error message */}
      {phase === "fallback" && message && (
        <div className="absolute top-4 left-0 right-0 flex flex-col items-center pointer-events-none px-4 gap-2">
          <p className="text-xl text-violet-300 text-center max-w-lg drop-shadow">{message}</p>
          <p className="text-base text-muted-foreground text-center max-w-md">Tap the creature to bounce it!</p>
        </div>
      )}

      {/* back link (always available once running) */}
      {phase !== "idle" && (
        <Link
          href="/dream"
          className="absolute top-3 right-4 text-base text-muted-foreground hover:text-foreground z-10"
        >
          ← dream
        </Link>
      )}
    </div>
  );
}

// shortest signed distance between two hues on the 0..1 circle
function shortestHue(from: number, to: number): number {
  let d = to - from;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  return d;
}
