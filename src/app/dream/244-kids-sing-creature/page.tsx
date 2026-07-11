"use client";

/**
 * 244 · Sing Creature
 * "What if a 4-year-old could SING to grow and shape a glowing 3D creature
 *  that sings their melody back?"
 *
 * A single glowing displaced-sphere creature floats center screen.
 *  - Mic autocorrelation pitch detection -> hue + nearest C-major-pentatonic note.
 *  - Loudness (RMS) -> surface displacement amplitude (it "inflates").
 *  - Sustained singing -> it grows (a well-fed creature) and wobbles.
 *  - A soft synth tracks the snapped pitch so the child hears themselves "in tune".
 *  - The last ~7 snapped notes are remembered; after ~2.5s of silence the creature
 *    SINGS THE MELODY BACK as a glowing pulse sequence (call-and-response).
 *  - Idle breathing + an autonomous ambient pad keep it alive immediately.
 *  - If the mic is denied, a "Tap to sing for it" fallback feeds it pentatonic notes.
 *
 * Self-contained: everything lives in this folder. Web Audio + three.js only.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ----- music config ---------------------------------------------------------
// C major pentatonic, C3..C5 (Hz). Heard pitch is snapped to the nearest of these.
const PENTATONIC: number[] = [
  130.81, // C3
  146.83, // D3
  164.81, // E3
  196.0, // G3
  220.0, // A3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  392.0, // G4
  440.0, // A4
  523.25, // C5
];
const MIN_HZ = PENTATONIC[0];
const MAX_HZ = PENTATONIC[PENTATONIC.length - 1];
const MELODY_LEN = 7; // notes remembered for playback
const SILENCE_MS = 2500; // quiet time before the creature sings back

type Status = "idle" | "running";
type InputMode = "mic" | "tap";

// snap a frequency to the nearest pentatonic note (so it always sounds right)
function snapToPentatonic(hz: number): number {
  let best = PENTATONIC[0];
  let bestDist = Infinity;
  for (const p of PENTATONIC) {
    // compare in log space so octaves are even
    const d = Math.abs(Math.log2(hz) - Math.log2(p));
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

// hue 0..1 from a frequency: low = deep violet (~0.75), high = cyan/rose (~0.5..0.95)
function hueForHz(hz: number): number {
  const t = Math.max(0, Math.min(1, (Math.log2(hz) - Math.log2(MIN_HZ)) / (Math.log2(MAX_HZ) - Math.log2(MIN_HZ))));
  // travel violet(0.74) -> blue(0.6) -> cyan(0.5) and a touch back toward rose at top
  return 0.74 - t * 0.34 + (t > 0.85 ? (t - 0.85) * 1.6 : 0);
}

// autocorrelation pitch detection. Returns Hz or -1 if no clear pitch.
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // too quiet to be a real pitch

  // trim silent edges
  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) r1 = i;
    else break;
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) r2 = SIZE - i;
    else break;
  }
  const trimmed = buf.subarray(r1, r2);
  const n = trimmed.length;
  if (n < 64) return -1;

  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }

  // find first dip then the highest peak after it
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxVal = -1;
  let maxLag = -1;
  for (let lag = d; lag < n; lag++) {
    if (c[lag] > maxVal) {
      maxVal = c[lag];
      maxLag = lag;
    }
  }
  if (maxLag <= 0) return -1;

  // parabolic interpolation around the peak for sub-sample accuracy
  let T0 = maxLag;
  const x1 = c[maxLag - 1] || 0;
  const x2 = c[maxLag];
  const x3 = c[maxLag + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  if (a) T0 = maxLag - b / (2 * a);

  const hz = sampleRate / T0;
  if (hz < 70 || hz > 1100) return -1; // outside a child's singing range
  return hz;
}

export default function SingCreaturePage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("mic");
  const [singingBack, setSingingBack] = useState(false);

  // audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const padStopRef = useRef<(() => void) | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // the live "follow" voice that tracks the child's snapped pitch
  const voiceOscRef = useRef<OscillatorNode | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);

  // shared real-time state read by both audio + render loops
  const liveRef = useRef({
    rms: 0, // smoothed loudness 0..1
    hz: 0, // snapped pitch currently sung (0 = none)
    hue: 0.7, // smoothed creature hue
    growth: 0.0, // 0..1 how "well fed" / big
    lastNoteAt: 0, // ms timestamp of last detected note
    melody: [] as number[], // recent snapped notes
    playbackPulse: 0, // 0..1 bloom pulse from a played-back note
  });

  // three refs
  const rafRef = useRef<number | null>(null);
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    glow: THREE.Mesh;
    glowMat: THREE.ShaderMaterial;
    dispose: () => void;
  } | null>(null);

  // ------------------------------------------------------------------ audio
  const ensureAudio = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.6);
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterRef.current = master;
    return ctx;
  }, []);

  // gentle autonomous ambient pad so it's never silent
  const startPad = useCallback(() => {
    const ctx = ensureAudio();
    const master = masterRef.current!;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.gain.setTargetAtTime(0.16, ctx.currentTime, 2.0);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;
    filter.Q.value = 0.6;
    filter.connect(padGain);
    padGain.connect(master);

    // soft drone on C + G (root + fifth), two octaves down-ish
    const oscs: OscillatorNode[] = [];
    [130.81, 196.0, 261.63].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.22;
      o.connect(g);
      g.connect(filter);
      o.start();
      oscs.push(o);
    });

    // slow breathing LFO on the filter
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 280;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    padStopRef.current = () => {
      const now = ctx.currentTime;
      padGain.gain.cancelScheduledValues(now);
      padGain.gain.setTargetAtTime(0.0001, now, 0.3);
      oscs.forEach((o) => {
        try {
          o.stop(now + 0.8);
        } catch {
          /* noop */
        }
      });
      try {
        lfo.stop(now + 0.8);
      } catch {
        /* noop */
      }
    };
  }, [ensureAudio]);

  // the live voice that tracks the child's snapped pitch (soft, in tune)
  const ensureVoice = useCallback(() => {
    if (voiceOscRef.current) return;
    const ctx = ctxRef.current!;
    const master = masterRef.current!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 261.63;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    // gentle low-pass so it's never harsh
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1600;
    osc.connect(g);
    g.connect(filt);
    filt.connect(master);
    osc.start();
    voiceOscRef.current = osc;
    voiceGainRef.current = g;
  }, []);

  // play one soft note (used for melody playback and the tap fallback)
  const runPlayNote = useCallback((hz: number, when: number, dur: number, peak: number) => {
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = "sine";
    osc2.type = "triangle";
    osc.frequency.value = hz;
    osc2.frequency.value = hz * 2.001; // shimmer octave
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.setTargetAtTime(peak, when, 0.04); // soft attack, no click
    g.gain.setTargetAtTime(0.0001, when + dur, 0.18); // soft release
    const g2 = ctx.createGain();
    g2.gain.value = 0.25;
    osc.connect(g);
    osc2.connect(g2);
    g2.connect(g);
    g.connect(filt);
    filt.connect(master);
    osc.start(when);
    osc2.start(when);
    osc.stop(when + dur + 0.8);
    osc2.stop(when + dur + 0.8);
  }, []);

  // sing the remembered melody back as a glowing pulse sequence
  const runSingBack = useCallback(() => {
    const ctx = ctxRef.current;
    const live = liveRef.current;
    if (!ctx || live.melody.length === 0) return;
    setSingingBack(true);
    const notes = [...live.melody];
    const step = 0.42; // seconds between notes
    const startAt = ctx.currentTime + 0.1;
    notes.forEach((hz, i) => {
      runPlayNote(hz, startAt + i * step, step * 0.7, 0.5);
      // schedule a visual bloom pulse aligned to the audio
      window.setTimeout(() => {
        liveRef.current.playbackPulse = 1;
        liveRef.current.hue = hueForHz(hz);
      }, (0.1 + i * step) * 1000);
    });
    const total = (0.1 + notes.length * step + 0.4) * 1000;
    window.setTimeout(() => setSingingBack(false), total);
  }, [runPlayNote]);

  // ------------------------------------------------------------------ mic
  const startMic = useCallback(async () => {
    const ctx = ensureAudio();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser); // analyser is a sink only — mic never reaches destination
      analyserRef.current = analyser;
      setInputMode("mic");
      setMicError(null);
    } catch {
      setMicError("No microphone — that's okay! Tap and hold the big circle below to sing for your creature.");
      setInputMode("tap");
    }
  }, [ensureAudio]);

  // ------------------------------------------------------------------ three
  const initThree = useCallback(() => {
    if (!mountRef.current || threeRef.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setGlError("This browser can't show 3D, but you can still sing and hear your creature.");
      return;
    }
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x0a0820, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0820, 0.02);
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0, 9);
    camera.lookAt(0, 0, 0);

    // ---- the creature: a high-res icosphere displaced by GLSL noise ----
    const geo = new THREE.IcosahedronGeometry(2, 48);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 0.05 }, // displacement amplitude (from loudness)
        uGrow: { value: 0.0 }, // 0..1 well-fed growth
        uHue: { value: 0.7 },
        uPulse: { value: 0.0 }, // playback bloom pulse
        uBreath: { value: 0.0 }, // idle breathing 0..1
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uAmp;
        uniform float uGrow;
        uniform float uBreath;
        varying float vDisp;
        varying vec3 vNormalW;

        // classic simplex-ish 3D noise (Ashima)
        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
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
          vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
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

        void main() {
          vNormalW = normal;
          // layered noise for an organic, jiggly surface
          float t = uTime * 0.5;
          float n1 = snoise(normal * 1.6 + vec3(t));
          float n2 = snoise(normal * 3.2 + vec3(-t * 0.7, t, t * 0.5));
          float n = n1 * 0.7 + n2 * 0.3;
          // breathing always adds a tiny pulse so it's alive at rest
          float breath = uBreath * 0.12;
          float disp = n * (uAmp + breath) + breath * 0.5;
          vDisp = disp;
          float scale = 1.0 + uGrow * 0.7; // well-fed grows
          vec3 pos = position * scale + normal * disp * scale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uHue;
        uniform float uPulse;
        varying float vDisp;
        varying vec3 vNormalW;

        vec3 hsl2rgb(float h, float s, float l){
          vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
          return l + s * (rgb-0.5) * (1.0 - abs(2.0*l-1.0));
        }

        void main() {
          // soft rim/fresnel for a glowing jelly look
          vec3 viewDir = vec3(0.0, 0.0, 1.0);
          float fres = pow(1.0 - max(dot(normalize(vNormalW), viewDir), 0.0), 2.0);
          float lit = 0.45 + vDisp * 1.2 + fres * 0.6 + uPulse * 0.5;
          float light = clamp(0.35 + vDisp * 0.6, 0.18, 0.85);
          vec3 col = hsl2rgb(fract(uHue), 0.7, light);
          col += fres * hsl2rgb(fract(uHue + 0.08), 0.8, 0.6) * 0.7;
          col *= lit;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geo, material);
    scene.add(mesh);

    // ---- a back-facing soft glow halo behind the creature ----
    const glowGeo = new THREE.SphereGeometry(2.6, 48, 48);
    const glowMat = new THREE.ShaderMaterial({
      uniforms: {
        uHue: { value: 0.7 },
        uIntensity: { value: 0.4 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vN;
        void main(){
          vN = normal;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uHue;
        uniform float uIntensity;
        varying vec3 vN;
        vec3 hsl2rgb(float h, float s, float l){
          vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
          return l + s * (rgb-0.5) * (1.0 - abs(2.0*l-1.0));
        }
        void main(){
          float edge = pow(1.0 - abs(vN.z), 2.0);
          vec3 col = hsl2rgb(fract(uHue + 0.04), 0.75, 0.55);
          gl_FragColor = vec4(col, edge * uIntensity);
        }
      `,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    scene.add(glow);

    // sprinkle of soft drifting star points so the bedtime sky feels alive
    const starN = 140;
    const starPos = new Float32Array(starN * 3);
    for (let i = 0; i < starN; i++) {
      starPos[i * 3] = (Math.random() - 0.5) * 30;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 18;
      starPos[i * 3 + 2] = -6 - Math.random() * 12;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x9f8fff,
      size: 0.08,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    threeRef.current = {
      renderer,
      scene,
      camera,
      mesh,
      material,
      glow,
      glowMat,
      dispose: () => {
        geo.dispose();
        material.dispose();
        glowGeo.dispose();
        glowMat.dispose();
        starGeo.dispose();
        starMat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) {
          mount.removeChild(renderer.domElement);
        }
      },
    };
  }, []);

  // ------------------------------------------------------------------ loop
  useEffect(() => {
    if (status !== "running") return;
    initThree();
    const T = threeRef.current;

    const pitchBuf = new Float32Array(2048);
    let lastPlaybackCheck = 0;

    const onResize = () => {
      if (!mountRef.current || !T) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      T.renderer.setSize(w, h);
      T.camera.aspect = w / h;
      T.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const start = performance.now();
    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const nowMs = performance.now();
      const t = (nowMs - start) / 1000;
      const live = liveRef.current;
      const ctx = ctxRef.current;

      // ---- read mic + detect pitch ----
      const analyser = analyserRef.current;
      let detectedHz = -1;
      let rms = 0;
      if (analyser && inputMode === "mic") {
        analyser.getFloatTimeDomainData(pitchBuf);
        for (let i = 0; i < pitchBuf.length; i++) rms += pitchBuf[i] * pitchBuf[i];
        rms = Math.sqrt(rms / pitchBuf.length);
        detectedHz = detectPitch(pitchBuf, ctx ? ctx.sampleRate : 44100);
      }

      // smooth loudness (also fed by the tap fallback via live.rms target)
      const targetRms = inputMode === "mic" ? Math.min(1, rms * 6) : live.rms;
      live.rms += (targetRms - live.rms) * 0.18;

      // a detected pitch with enough loudness -> snap + record
      if (detectedHz > 0 && live.rms > 0.06 && !singingBack) {
        const snapped = snapToPentatonic(detectedHz);
        live.hz = snapped;
        live.hue = live.hue + (hueForHz(snapped) - live.hue) * 0.15;
        // record into melody when the note changes
        const last = live.melody[live.melody.length - 1];
        if (last !== snapped) {
          live.melody.push(snapped);
          if (live.melody.length > MELODY_LEN) live.melody.shift();
        }
        live.lastNoteAt = nowMs;
        live.growth = Math.min(1, live.growth + 0.006); // sustained singing grows it
        // drive the live follow-voice
        if (ctx) {
          ensureVoice();
          const osc = voiceOscRef.current!;
          const g = voiceGainRef.current!;
          osc.frequency.setTargetAtTime(snapped, ctx.currentTime, 0.06);
          g.gain.setTargetAtTime(0.18 * Math.min(1, live.rms * 1.5), ctx.currentTime, 0.05);
        }
      } else {
        live.hz = 0;
        // fade the follow voice out softly when not singing
        if (ctx && voiceGainRef.current) {
          voiceGainRef.current.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
        }
        // creature slowly settles / un-fattens a touch when quiet
        live.growth = Math.max(0, live.growth - 0.0012);
      }

      // ---- after silence, sing the melody back (call & response) ----
      if (
        !singingBack &&
        live.melody.length >= 2 &&
        live.lastNoteAt > 0 &&
        nowMs - live.lastNoteAt > SILENCE_MS &&
        nowMs - lastPlaybackCheck > 500
      ) {
        lastPlaybackCheck = nowMs;
        runSingBack();
        // clear so it sings once per phrase, keeping growth
        live.lastNoteAt = nowMs + 100000; // park until new singing resets it
      }

      // decay the visual playback pulse
      live.playbackPulse *= 0.9;

      // ---- drive the creature visuals ----
      if (T) {
        const m = T.material;
        m.uniforms.uTime.value = t;
        // breathing: gentle when idle/quiet, recedes while actively singing
        const breath = 0.5 + 0.5 * Math.sin(t * 1.3);
        const idle = 1 - Math.min(1, live.rms * 3);
        m.uniforms.uBreath.value += (breath * idle - m.uniforms.uBreath.value) * 0.08;
        // displacement amplitude follows loudness + the playback pulse
        const ampTarget = 0.05 + live.rms * 0.85 + live.playbackPulse * 0.5;
        m.uniforms.uAmp.value += (ampTarget - m.uniforms.uAmp.value) * 0.15;
        m.uniforms.uGrow.value += (live.growth - m.uniforms.uGrow.value) * 0.05;
        m.uniforms.uHue.value += (live.hue - m.uniforms.uHue.value) * 0.08;
        m.uniforms.uPulse.value += (live.playbackPulse - m.uniforms.uPulse.value) * 0.3;

        // gentle wobble/jiggle of the whole creature
        T.mesh.rotation.y = t * 0.18;
        T.mesh.rotation.x = Math.sin(t * 0.5) * 0.15;
        const jiggle = 1 + live.rms * 0.06 * Math.sin(t * 9);
        T.mesh.scale.setScalar(jiggle);

        // glow tracks hue + intensity from loudness/growth/pulse
        T.glowMat.uniforms.uHue.value = m.uniforms.uHue.value;
        T.glowMat.uniforms.uIntensity.value =
          0.3 + live.rms * 0.5 + live.growth * 0.25 + live.playbackPulse * 0.4;
        T.glow.scale.setScalar((1 + live.growth * 0.7) * jiggle);
        T.glow.rotation.y = -t * 0.1;

        T.renderer.render(T.scene, T.camera);
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("resize", onResize);
    };
  }, [status, initThree, inputMode, singingBack, ensureVoice, runSingBack]);

  // ------------------------------------------------------------------ start
  const handleStart = useCallback(async () => {
    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();
    if (!padStopRef.current) startPad();
    await startMic();
    setStatus("running");
  }, [ensureAudio, startPad, startMic]);

  // ------------------------------------------------------------------ tap fallback
  // pressing the big circle feeds the creature a random rising pentatonic note
  const tapIdxRef = useRef(0);
  const tapHoldRef = useRef<number | null>(null);
  const beginTapSing = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || singingBack) return;
    const live = liveRef.current;
    // walk gently up/down the scale for a pleasing melody
    const hz = PENTATONIC[3 + (tapIdxRef.current % (PENTATONIC.length - 3))];
    tapIdxRef.current += 1;
    live.hz = hz;
    live.hue = hueForHz(hz);
    live.rms = 0.7; // visibly inflate
    live.growth = Math.min(1, live.growth + 0.05);
    const last = live.melody[live.melody.length - 1];
    if (last !== hz) {
      live.melody.push(hz);
      if (live.melody.length > MELODY_LEN) live.melody.shift();
    }
    live.lastNoteAt = performance.now();
    runPlayNote(hz, ctx.currentTime, 0.5, 0.45);
    // hold = keep it inflated until release
    if (tapHoldRef.current) window.clearInterval(tapHoldRef.current);
    tapHoldRef.current = window.setInterval(() => {
      liveRef.current.rms = 0.7;
      liveRef.current.lastNoteAt = performance.now();
    }, 120);
  }, [runPlayNote, singingBack]);

  const endTapSing = useCallback(() => {
    if (tapHoldRef.current) {
      window.clearInterval(tapHoldRef.current);
      tapHoldRef.current = null;
    }
    liveRef.current.rms = 0;
    liveRef.current.lastNoteAt = performance.now();
  }, []);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (tapHoldRef.current) window.clearInterval(tapHoldRef.current);
      padStopRef.current?.();
      try {
        voiceOscRef.current?.stop();
      } catch {
        /* noop */
      }
      // stop every mic track so the indicator turns off
      micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      micStreamRef.current = null;
      threeRef.current?.dispose();
      threeRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0820] text-foreground">
      {/* 3D creature mount */}
      <div ref={mountRef} className="absolute inset-0 z-0 h-screen w-full" aria-hidden />

      {/* legibility veil */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/45 via-transparent to-black/60" />

      <div className="relative z-20 flex min-h-screen flex-col justify-between p-6 sm:p-10">
        <header className="max-w-2xl">
          <p className="text-base font-medium uppercase tracking-[0.3em] text-violet-300">Resonance · Dream 244</p>
          <h1 className="mt-2 text-4xl font-semibold text-foreground sm:text-5xl">Sing Creature</h1>
          <p className="mt-3 max-w-xl text-base text-muted-foreground sm:text-lg">
            Hum or sing, and your glowing creature grows, changes color, and sings your little tune right back to you.
          </p>

          {glError && <p className="mt-3 text-base text-violet-300">{glError}</p>}
          {micError && <p className="mt-3 text-base text-violet-300">{micError}</p>}

          {status === "idle" && (
            <button
              onClick={handleStart}
              className="mt-5 min-h-[44px] rounded-full bg-violet-500 px-7 py-3 text-lg font-semibold text-foreground shadow-lg shadow-violet-900/40 transition hover:bg-violet-400"
            >
              Sing to it 🎤
            </button>
          )}

          {status === "running" && (
            <p className="mt-4 text-base text-violet-300">
              {singingBack
                ? "It's singing your tune back ✨"
                : inputMode === "mic"
                  ? "Listening… hum a tune to grow it 🎶"
                  : "Tap and hold the circle to feed it notes 🎶"}
            </p>
          )}
        </header>

        {/* tap-to-sing fallback target — always present, big & friendly */}
        {status === "running" && inputMode === "tap" && (
          <div className="flex items-center justify-center">
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                beginTapSing();
              }}
              onPointerUp={endTapSing}
              onPointerLeave={endTapSing}
              onPointerCancel={endTapSing}
              aria-label="Tap and hold to sing for your creature"
              className="h-40 w-40 touch-none select-none rounded-full bg-violet-500/25 text-5xl shadow-lg shadow-violet-900/40 backdrop-blur transition active:scale-95 active:bg-violet-500/40"
            >
              🎵
            </button>
          </div>
        )}

        <footer className="flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-md text-base text-muted-foreground">
            Low notes glow deep violet, high notes go bright. Keep singing and it gets bigger — then go quiet and listen.
          </p>
          <Link
            href="/dream/244-kids-sing-creature/README.md"
            className="min-h-[44px] self-center px-2 py-2.5 text-base text-violet-300 underline-offset-4 hover:underline"
          >
            Design notes
          </Link>
        </footer>
      </div>
    </main>
  );
}
