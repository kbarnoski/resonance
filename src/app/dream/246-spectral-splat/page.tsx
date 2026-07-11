"use client";

/**
 * 246 · Spectral Splat
 * "What if your music were a soft volumetric cloud of light you could fly through?"
 *
 * Borrows the AESTHETIC of AudioGS (Spectrogram-Based Audio Gaussian Splatting,
 * arxiv 2604.08967, 2026): the spectrum is deposited as a field of soft, additive
 * Gaussian SPLATS — anisotropic glowing blobs with exp(-r*r) radial falloff — into
 * a rolling volumetric memory. Each analysis frame writes a row of splats; depth (Z)
 * advances with time so older frames recede. The camera flies FORWARD through the
 * accumulating nebula (dolly + gentle bob), so you travel into a luminous volume of
 * your own music. Splats, not dots: this reads as fog/nebula, not a hard point cloud.
 *
 * Self-contained. Edits live only in this folder. No external controls module.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ----- spectral / geometry config -------------------------------------------
const BINS = 160; // frequency bins sampled per frame (radial resolution of a slab)
const SLABS = 120; // history depth — number of time slabs in the ring buffer
const SPLATS = BINS * SLABS; // total Gaussian splats
const SHELL_SPLATS = 1400; // onset shockwave shell splats
const SLAB_GAP = 1.15; // Z-spacing between consecutive time slabs
const FIELD_RADIUS = 16; // outer radius bins fan out to

type Status = "idle" | "running";
type Source = "pad" | "file" | "mic";

export default function SpectralSplatPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number>(0);
  const [onsetFlash, setOnsetFlash] = useState(false);
  const [source, setSource] = useState<Source>("pad");
  const [showNotes, setShowNotes] = useState(false);

  // audio graph refs
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const padNodesRef = useRef<{ stop: () => void } | null>(null);
  const fileSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // three refs
  const rafRef = useRef<number | null>(null);
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    cloud: THREE.Points;
    cloudMat: THREE.ShaderMaterial;
    shell: THREE.Points;
    shellMat: THREE.ShaderMaterial;
    dispose: () => void;
  } | null>(null);

  // ------------------------------------------------------------------ audio
  const ensureAudio = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.7;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    analyser.connect(master);
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    masterRef.current = master;
    return ctx;
  }, []);

  // Built-in generative A-minor-pentatonic ambient pad + wandering plucks.
  const startPad = useCallback(() => {
    const ctx = ensureAudio();
    const analyser = analyserRef.current!;
    const scale = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0001;
    padGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.8);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 850;
    filter.Q.value = 0.8;
    filter.connect(padGain);
    padGain.connect(analyser);

    const oscs: OscillatorNode[] = [];
    const voices = 4;
    for (let i = 0; i < voices; i++) {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = "sine";
      o2.type = "triangle";
      const f = scale[(i * 2) % scale.length];
      o1.frequency.value = f;
      o2.frequency.value = f * 1.006; // gentle detune for shimmer
      const vg = ctx.createGain();
      vg.gain.value = 0.16;
      o1.connect(vg);
      o2.connect(vg);
      vg.connect(filter);
      o1.start();
      o2.start();
      oscs.push(o1, o2);
    }

    // slow LFO breathing the filter cutoff
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 650;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // wandering plucks so onsets actually fire on the fallback
    let melodyTimer = 0;
    const scheduleNote = () => {
      const t = ctx.currentTime;
      const note = scale[Math.floor(Math.random() * scale.length)] * 2;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = note;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.34, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(g);
      g.connect(analyser);
      osc.start(t);
      osc.stop(t + 1.0);
      melodyTimer = window.setTimeout(scheduleNote, 650 + Math.random() * 1100);
    };
    melodyTimer = window.setTimeout(scheduleNote, 600);

    padNodesRef.current = {
      stop: () => {
        window.clearTimeout(melodyTimer);
        const now = ctx.currentTime;
        padGain.gain.cancelScheduledValues(now);
        padGain.gain.setValueAtTime(padGain.gain.value, now);
        padGain.gain.linearRampToValueAtTime(0.0001, now + 0.3);
        oscs.forEach((o) => {
          try {
            o.stop(now + 0.35);
          } catch {
            /* already stopped */
          }
        });
        try {
          lfo.stop(now + 0.35);
        } catch {
          /* noop */
        }
      },
    };
  }, [ensureAudio]);

  const stopFile = useCallback(() => {
    if (fileSrcRef.current) {
      try {
        fileSrcRef.current.stop();
      } catch {
        /* noop */
      }
      fileSrcRef.current.disconnect();
      fileSrcRef.current = null;
    }
  }, []);

  const stopMic = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const ctx = ensureAudio();
      if (ctx.state === "suspended") await ctx.resume();
      try {
        const buf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        padNodesRef.current?.stop();
        padNodesRef.current = null;
        stopFile();
        stopMic();
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.loop = true;
        src.connect(analyserRef.current!);
        src.start();
        fileSrcRef.current = src;
        setSource("file");
        if (status !== "running") setStatus("running");
      } catch {
        setError(
          "Could not decode that file — keeping the ambient pad alive. Try a WAV / MP3 / OGG.",
        );
        if (!padNodesRef.current && !fileSrcRef.current) startPad();
      }
    },
    [ensureAudio, startPad, status, stopFile, stopMic],
  );

  // demo audio: synthesize a short looping pentatonic groove offline
  const loadDemo = useCallback(async () => {
    setError(null);
    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();
    const sr = ctx.sampleRate;
    const dur = 6;
    const off = new OfflineAudioContext(2, sr * dur, sr);
    const notes = [220, 261.63, 329.63, 392, 440, 587.33];
    const out = off.createGain();
    out.gain.value = 0.5;
    out.connect(off.destination);
    // pad chord
    [220, 329.63, 440].forEach((f) => {
      const o = off.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = off.createGain();
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(out);
      o.start(0);
      o.stop(dur);
    });
    // rhythmic plucks
    for (let t = 0; t < dur; t += 0.4) {
      const o = off.createOscillator();
      o.type = "triangle";
      o.frequency.value = notes[Math.floor(Math.random() * notes.length)] * 2;
      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.4);
    }
    const rendered = await off.startRendering();
    padNodesRef.current?.stop();
    padNodesRef.current = null;
    stopFile();
    stopMic();
    const src = ctx.createBufferSource();
    src.buffer = rendered;
    src.loop = true;
    src.connect(analyserRef.current!);
    src.start();
    fileSrcRef.current = src;
    setSource("file");
    if (status !== "running") setStatus("running");
  }, [ensureAudio, status, stopFile, stopMic]);

  const enableMic = useCallback(async () => {
    setMicNote(null);
    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicNote("No microphone API here — staying on the current source.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      padNodesRef.current?.stop();
      padNodesRef.current = null;
      stopFile();
      stopMic();
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      // mic -> analyser only (NOT master) to avoid feedback howl
      src.connect(analyserRef.current!);
      setSource("mic");
      if (status !== "running") setStatus("running");
    } catch {
      setMicNote("Mic denied or unavailable — staying on the current source.");
    }
  }, [ensureAudio, status, stopFile, stopMic]);

  // ------------------------------------------------------------------ three
  const initThree = useCallback(() => {
    if (!mountRef.current || threeRef.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError("WebGL isn't available in this browser, so the cloud can't render. Audio still works.");
      return;
    }
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x04050b, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04050b, 0.014);
    const camera = new THREE.PerspectiveCamera(64, w / h, 0.1, 600);
    camera.position.set(0, 0, 0);

    // ---- splat geometry (ring-buffered over Z slabs, allocated ONCE) ----
    // attributes: position (x,y,z), aColor (rgb), aSize (radius), aAniso (x stretch)
    const positions = new Float32Array(SPLATS * 3);
    const colors = new Float32Array(SPLATS * 3);
    const sizes = new Float32Array(SPLATS);
    const aniso = new Float32Array(SPLATS);
    for (let s = 0; s < SLABS; s++) {
      for (let b = 0; b < BINS; b++) {
        const idx = s * BINS + b;
        const angle = (b / BINS) * Math.PI * 2;
        const rad = 1.5 + (b / BINS) * FIELD_RADIUS;
        positions[idx * 3] = Math.cos(angle) * rad;
        positions[idx * 3 + 1] = Math.sin(angle) * rad;
        positions[idx * 3 + 2] = -s * SLAB_GAP; // slab 0 nearest, grows into -Z
        sizes[idx] = 0;
        aniso[idx] = 1;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute("aAniso", new THREE.BufferAttribute(aniso, 1));

    // Gaussian-splat shader: soft exp(-r*r) radial falloff, additive, anisotropic.
    const makeSplatMaterial = () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uScale: { value: 1.0 },
          uBloom: { value: 0.0 },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aColor;
          attribute float aSize;
          attribute float aAniso;
          varying vec3 vColor;
          varying float vAniso;
          uniform float uScale;
          void main() {
            vColor = aColor;
            vAniso = aAniso;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uScale * (420.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec3 vColor;
          varying float vAniso;
          uniform float uBloom;
          void main() {
            // anisotropic coords centred on the point sprite
            vec2 uv = (gl_PointCoord - 0.5) * 2.0;
            uv.x /= vAniso;          // stretch horizontally for an oriented blob
            float r2 = dot(uv, uv);
            // soft Gaussian falloff — the whole point of "splats" vs "dots"
            float a = exp(-r2 * 3.0);
            if (a < 0.01) discard;
            vec3 col = vColor * (1.0 + uBloom);
            gl_FragColor = vec4(col * a, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      });

    const cloudMat = makeSplatMaterial();
    const cloud = new THREE.Points(geo, cloudMat);
    cloud.frustumCulled = false;
    scene.add(cloud);

    // ---- onset shockwave shell (its own buffers, also allocated once) ----
    const shellPos = new Float32Array(SHELL_SPLATS * 3);
    const shellDir = new Float32Array(SHELL_SPLATS * 3);
    const shellCol = new Float32Array(SHELL_SPLATS * 3);
    const shellSize = new Float32Array(SHELL_SPLATS);
    const shellAniso = new Float32Array(SHELL_SPLATS);
    for (let i = 0; i < SHELL_SPLATS; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const ss = Math.sqrt(1 - u * u);
      shellDir[i * 3] = ss * Math.cos(th);
      shellDir[i * 3 + 1] = u;
      shellDir[i * 3 + 2] = ss * Math.sin(th);
      shellSize[i] = 0;
      shellAniso[i] = 1;
    }
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute("position", new THREE.BufferAttribute(shellPos, 3));
    shellGeo.setAttribute("aColor", new THREE.BufferAttribute(shellCol, 3));
    shellGeo.setAttribute("aSize", new THREE.BufferAttribute(shellSize, 1));
    shellGeo.setAttribute("aAniso", new THREE.BufferAttribute(shellAniso, 1));
    const shellMat = makeSplatMaterial();
    const shell = new THREE.Points(shellGeo, shellMat);
    shell.frustumCulled = false;
    scene.add(shell);

    const onResize = () => {
      if (!mountRef.current) return;
      const nw = mountRef.current.clientWidth;
      const nh = mountRef.current.clientHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    threeRef.current = {
      renderer,
      scene,
      camera,
      cloud,
      cloudMat,
      shell,
      shellMat,
      dispose: () => {
        window.removeEventListener("resize", onResize);
        geo.dispose();
        cloudMat.dispose();
        shellGeo.dispose();
        shellMat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentElement === mount) {
          mount.removeChild(renderer.domElement);
        }
      },
    };
    // store shell direction array on the geometry for the loop
    (shellGeo as unknown as { _dir: Float32Array })._dir = shellDir;
  }, []);

  // ------------------------------------------------------------------ loop
  // refs that the animation loop reads without re-subscribing the effect
  const writeSlabRef = useRef(0); // ring-buffer write head (slab index)
  const onsetRef = useRef({ prevFlux: 0, lastBeat: 0, intervals: [] as number[] });
  const camRef = useRef({ z: 0, bob: 0, surge: 0, hue: 0.6 });

  useEffect(() => {
    if (status !== "running") return;
    initThree();
    const three = threeRef.current;
    const analyser = analyserRef.current;
    if (!three || !analyser) return;

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const cloudGeo = three.cloud.geometry;
    const colorAttr = cloudGeo.getAttribute("aColor") as THREE.BufferAttribute;
    const sizeAttr = cloudGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const anisoAttr = cloudGeo.getAttribute("aAniso") as THREE.BufferAttribute;
    const posAttr = cloudGeo.getAttribute("position") as THREE.BufferAttribute;
    const colors = colorAttr.array as Float32Array;
    const sizes = sizeAttr.array as Float32Array;
    const anisos = anisoAttr.array as Float32Array;
    const positions = posAttr.array as Float32Array;

    const shellGeo = three.shell.geometry;
    const shellPosA = (shellGeo.getAttribute("position") as THREE.BufferAttribute)
      .array as Float32Array;
    const shellColA = (shellGeo.getAttribute("aColor") as THREE.BufferAttribute)
      .array as Float32Array;
    const shellSizeA = (shellGeo.getAttribute("aSize") as THREE.BufferAttribute)
      .array as Float32Array;
    const shellDir = (shellGeo as unknown as { _dir: Float32Array })._dir;
    let shellLife = 0; // 0..1, 0 = dormant
    let shellHue = 0.6;

    // HSV->RGB helper (writes into out triple)
    const hsv = (hh: number, ss: number, vv: number, out: [number, number, number]) => {
      const i = Math.floor(hh * 6);
      const f = hh * 6 - i;
      const p = vv * (1 - ss);
      const q = vv * (1 - f * ss);
      const t = vv * (1 - (1 - f) * ss);
      switch (i % 6) {
        case 0: out[0] = vv; out[1] = t; out[2] = p; break;
        case 1: out[0] = q; out[1] = vv; out[2] = p; break;
        case 2: out[0] = p; out[1] = vv; out[2] = t; break;
        case 3: out[0] = p; out[1] = q; out[2] = vv; break;
        case 4: out[0] = t; out[1] = p; out[2] = vv; break;
        default: out[0] = vv; out[1] = p; out[2] = q; break;
      }
    };

    const rgb: [number, number, number] = [0, 0, 0];
    let lastT = performance.now();
    let bpmFrame = 0;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      analyser.getByteFrequencyData(freq);
      const nBins = freq.length;

      // --- spectral features: energy, flux, centroid ---
      let energy = 0;
      let flux = 0;
      let centroidNum = 0;
      let centroidDen = 0;
      // we only sample the lower ~3/4 of bins (musical range) into BINS buckets
      const usable = Math.floor(nBins * 0.78);
      for (let b = 0; b < BINS; b++) {
        const lo = Math.floor((b / BINS) * usable);
        const hi = Math.max(lo + 1, Math.floor(((b + 1) / BINS) * usable));
        let m = 0;
        for (let k = lo; k < hi; k++) m += freq[k];
        m /= hi - lo;
        const v = m / 255;
        energy += v;
        centroidNum += v * b;
        centroidDen += v;
        // write this bucket's splat into the current slab
        const idx = writeSlabRef.current * BINS + b;
        const cen = centroidDen > 0 ? centroidNum / centroidDen / BINS : 0.5;
        // hue: frequency position blended with spectral centroid
        const hue = (0.58 + b / BINS * 0.42 + cen * 0.25) % 1;
        const bright = Math.pow(v, 0.7);
        hsv(hue, 0.55 + v * 0.4, 0.25 + bright * 0.95, rgb);
        colors[idx * 3] = rgb[0];
        colors[idx * 3 + 1] = rgb[1];
        colors[idx * 3 + 2] = rgb[2];
        // splat radius from magnitude; anisotropy from frequency (highs streak)
        sizes[idx] = 0.6 + v * 6.5;
        anisos[idx] = 1.0 + (b / BINS) * 1.6 + v * 0.8;
        // dispersion: nudge radius outward with energy so loud frames bloom open
        const angle = (b / BINS) * Math.PI * 2;
        const baseRad = 1.5 + (b / BINS) * FIELD_RADIUS;
        const disp = baseRad * (1 + v * 0.35);
        positions[idx * 3] = Math.cos(angle) * disp;
        positions[idx * 3 + 1] = Math.sin(angle) * disp;
      }
      energy /= BINS;
      const centroid = centroidDen > 0 ? centroidNum / centroidDen / BINS : 0.5;

      // recompute flux against previous frame energy (simple energy flux)
      flux = Math.max(0, energy - onsetRef.current.prevFlux);
      onsetRef.current.prevFlux = energy;

      // place the freshly written slab at the camera's leading edge, then advance head
      const slabZ = camRef.current.z - 2; // just in front of camera
      const wHead = writeSlabRef.current;
      for (let b = 0; b < BINS; b++) {
        positions[(wHead * BINS + b) * 3 + 2] = slabZ;
      }
      writeSlabRef.current = (writeSlabRef.current + 1) % SLABS;

      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      anisoAttr.needsUpdate = true;

      // --- onset detection -> shockwave + surge + bpm ---
      const onset = flux > 0.045 && now - onsetRef.current.lastBeat > 180;
      if (onset) {
        const interval = now - onsetRef.current.lastBeat;
        onsetRef.current.lastBeat = now;
        if (interval > 250 && interval < 1500) {
          const arr = onsetRef.current.intervals;
          arr.push(interval);
          if (arr.length > 8) arr.shift();
        }
        // fire the shell at the camera's current position
        shellLife = 1;
        shellHue = (0.55 + centroid * 0.4) % 1;
        camRef.current.surge = Math.min(1.4, camRef.current.surge + 0.9);
        setOnsetFlash(true);
        window.setTimeout(() => setOnsetFlash(false), 130);
      }

      // bpm readout (throttled)
      bpmFrame++;
      if (bpmFrame % 30 === 0) {
        const arr = onsetRef.current.intervals;
        if (arr.length >= 3) {
          const avg = arr.reduce((a, c) => a + c, 0) / arr.length;
          setBpm(Math.round(60000 / avg));
        }
      }

      // --- shell update ---
      if (shellLife > 0) {
        shellLife = Math.max(0, shellLife - dt * 1.4);
        const radius = (1 - shellLife) * 30;
        hsv(shellHue, 0.6, shellLife, rgb);
        const cz = camRef.current.z - 4;
        for (let i = 0; i < SHELL_SPLATS; i++) {
          shellPosA[i * 3] = shellDir[i * 3] * radius;
          shellPosA[i * 3 + 1] = shellDir[i * 3 + 1] * radius;
          shellPosA[i * 3 + 2] = cz + shellDir[i * 3 + 2] * radius;
          shellColA[i * 3] = rgb[0];
          shellColA[i * 3 + 1] = rgb[1];
          shellColA[i * 3 + 2] = rgb[2];
          shellSizeA[i] = 2.5 * shellLife;
        }
        (shellGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
        (shellGeo.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
        (shellGeo.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
      }

      // --- camera flight: forward dolly + bob, centroid steers global hue ---
      camRef.current.surge *= 0.92;
      const speed = (4.5 + camRef.current.surge * 14) * dt;
      camRef.current.z -= speed;
      camRef.current.bob += dt;
      // global hue drift from spectral centroid -> bloom uniform tint amount
      camRef.current.hue += (centroid - camRef.current.hue) * 0.04;

      const cam = three.camera;
      cam.position.z = camRef.current.z;
      cam.position.x = Math.sin(camRef.current.bob * 0.5) * 1.6;
      cam.position.y = Math.cos(camRef.current.bob * 0.37) * 1.1;
      cam.lookAt(
        Math.sin(camRef.current.bob * 0.5 + 0.4) * 1.2,
        Math.cos(camRef.current.bob * 0.37 + 0.4) * 0.8,
        camRef.current.z - 12,
      );
      cam.rotation.z = Math.sin(camRef.current.bob * 0.3) * 0.04;

      // bloom uniform pulses with energy + onset surge for the additive glow
      const bloom = energy * 0.6 + camRef.current.surge * 0.5;
      three.cloudMat.uniforms.uBloom.value = bloom;
      three.shellMat.uniforms.uBloom.value = bloom;
      three.cloudMat.uniforms.uScale.value = 1.0 + camRef.current.surge * 0.15;

      three.renderer.render(three.scene, three.camera);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [status, initThree]);

  // unmount cleanup
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      padNodesRef.current?.stop();
      stopFile();
      stopMic();
      threeRef.current?.dispose();
      threeRef.current = null;
      ctxRef.current?.close().catch(() => {});
    };
  }, [stopFile, stopMic]);

  // ------------------------------------------------------------------ start
  const start = useCallback(async () => {
    setError(null);
    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();
    if (!fileSrcRef.current && !micStreamRef.current && !padNodesRef.current) {
      startPad();
      setSource("pad");
    }
    setStatus("running");
  }, [ensureAudio, startPad]);

  // file drop handlers
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const sourceLabel =
    source === "pad" ? "generative pad" : source === "file" ? "your audio" : "microphone";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#04050b] text-foreground">
      {/* canvas */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* onset flash overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-150"
        style={{
          opacity: onsetFlash ? 0.18 : 0,
          background:
            "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.9), transparent 60%)",
        }}
      />

      {/* idle / start panel */}
      {status === "idle" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
          <div className="max-w-2xl rounded-2xl border border-border bg-black/70 p-8 backdrop-blur-md">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.3em] text-violet-300">
              Resonance · 246
            </p>
            <h1 className="font-semibold text-4xl leading-tight sm:text-5xl">Spectral Splat</h1>
            <p className="mt-4 text-base text-foreground">
              What if your music were a soft volumetric cloud of light you could fly through?
              Your spectrum is deposited as a rolling field of glowing Gaussian splats, and the
              camera dives forward into the nebula of your own sound.
            </p>
            {glError && <p className="mt-4 text-base text-violet-300">{glError}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={start}
                className="min-h-[44px] rounded-full bg-violet-500/20 px-6 py-2.5 text-base font-medium text-violet-200 ring-1 ring-violet-400/40 transition-colors hover:bg-violet-500/30"
              >
                Start — fly into the cloud
              </button>
              <button
                onClick={loadDemo}
                className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground ring-1 ring-border transition-colors hover:bg-accent"
              >
                Load demo audio
              </button>
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="min-h-[44px] px-4 py-2.5 text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Read the design notes
              </button>
            </div>
            <p className="mt-4 text-base text-muted-foreground">
              Starts with a built-in generative pad — no input needed. Drop an audio file or use
              your mic any time.
            </p>
          </div>
        </div>
      )}

      {/* running HUD */}
      {status === "running" && (
        <>
          {/* top-left readouts */}
          <div className="pointer-events-none absolute left-4 top-4 z-20 font-mono text-sm">
            <p className="text-foreground">
              <span className="text-violet-300">●</span> {sourceLabel}
            </p>
            <p className="text-muted-foreground">bpm ~ {bpm > 0 ? bpm : "—"}</p>
            <p className={onsetFlash ? "text-violet-200" : "text-muted-foreground"}>
              onset {onsetFlash ? "▮▮▮" : "·"}
            </p>
          </div>

          {/* top-right title + controls */}
          <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
            <h1 className="font-semibold text-2xl text-foreground">Spectral Splat</h1>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground ring-1 ring-border transition-colors hover:bg-accent"
              >
                Drop / load file
              </button>
              <button
                onClick={loadDemo}
                className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground ring-1 ring-border transition-colors hover:bg-accent"
              >
                Demo
              </button>
              <button
                onClick={enableMic}
                className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground ring-1 ring-border transition-colors hover:bg-accent"
              >
                Use mic
              </button>
              <button
                onClick={() => setShowNotes((v) => !v)}
                className="min-h-[44px] rounded-full bg-violet-500/20 px-4 py-2.5 text-base text-violet-200 ring-1 ring-violet-400/40 transition-colors hover:bg-violet-500/30"
              >
                Design notes
              </button>
            </div>
            {error && <p className="max-w-xs text-right text-base text-violet-300">{error}</p>}
            {micNote && <p className="max-w-xs text-right text-base text-violet-300">{micNote}</p>}
          </div>

          {/* invisible full-area drop target */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            className="absolute inset-0 z-[5]"
          />
        </>
      )}

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {/* design notes drawer */}
      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-6">
          <div className="max-h-[85vh] max-w-2xl overflow-y-auto rounded-2xl border border-border bg-black/85 p-8 backdrop-blur-md">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-semibold text-3xl">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground hover:bg-accent"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4 text-base leading-relaxed text-foreground">
              <p>
                <span className="text-violet-300">The idea.</span> Most spectrum visualisers draw
                hard points or bars. Here the spectrum is deposited as soft, additive{" "}
                <span className="text-foreground">Gaussian splats</span> — anisotropic glowing blobs
                with an <code className="font-mono text-violet-300">exp(-r*r)</code> falloff — so the
                accumulating history reads as luminous fog you fly through, not dots.
              </p>
              <p>
                <span className="text-violet-300">The technique.</span> Each frame the FFT
                magnitudes are bucketed into {BINS} bins and written as one slab of splats into a
                ring buffer of {SLABS} time slabs. Angle &amp; radius come from the frequency bin,
                depth (Z) advances with time so older frames recede, splat size from magnitude, hue
                from frequency blended with the spectral centroid, brightness from energy. The
                camera dollies forward with a gentle bob so you travel into the volume. Geometry is
                allocated once; only typed-array attributes are rewritten per frame.
              </p>
              <p>
                <span className="text-violet-300">Reactive mapping.</span> Spectral centroid steers
                global hue and cloud dispersion; an energy-flux onset fires a coloured shockwave
                shell, a brightness bloom and a short forward speed surge. A rough BPM and onset
                readout sit in the corner.
              </p>
              <p>
                <span className="text-violet-300">Why splats, not points.</span> Inspired by{" "}
                <span className="text-foreground">AudioGS — &ldquo;Spectrogram-Based Audio Gaussian
                Splatting for Sound Field Reconstruction&rdquo;</span> (arXiv 2604.08967, 2026),
                which represents a sound field as a set of audio Gaussians derived from spectrograms.
                We borrow the aesthetic, not the math: soft Gaussians give a continuous volumetric
                glow that a point cloud can&apos;t. Visual lineage: Refik Anadol&apos;s{" "}
                <em>Machine Hallucinations</em> and Ryoji Ikeda&apos;s data aesthetics.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* bottom-left back link */}
      <Link
        href="/dream"
        className="absolute bottom-4 left-4 z-20 font-mono text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← all prototypes
      </Link>
    </main>
  );
}
