"use client";

/**
 * 243 · Spectral Cloud
 * "What if MY OWN MUSIC became a VOLUMETRIC CLOUD OF LIGHT I could orbit?"
 *
 * A volumetric THREE.Points nebula of the music's spectral history.
 * Spectrum -> 3D deposition (angle/radius = frequency bin, height = time),
 * ring-buffered into a rolling few-second memory. Onset shockwaves + spectral
 * centroid steer the sculpture's color, dispersion and bloom.
 *
 * Self-contained: implements its own gentle auto-orbit + drag controls so it
 * never depends on an external controls module. Edits live only in this folder.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ----- spectral / geometry config -------------------------------------------
const BINS = 192; // frequency bins sampled per frame (radial resolution)
const RINGS = 96; // history depth (time rings) — the ring buffer length
const POINTS = BINS * RINGS; // total points in the cloud
const SHELL_POINTS = 2200; // shockwave shell points
const CLOUD_RADIUS = 22; // outer radius of the spectral disk
const RING_GAP = 0.42; // vertical spacing between time rings

type Status = "idle" | "running";

export default function SpectralCloudPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [bpm, setBpm] = useState<number>(0);
  const [onsetFlash, setOnsetFlash] = useState(false);
  const [source, setSource] = useState<"pad" | "file">("pad");

  // audio graph refs
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const padNodesRef = useRef<{ stop: () => void } | null>(null);
  const fileSrcRef = useRef<AudioBufferSourceNode | null>(null);

  // three refs
  const rafRef = useRef<number | null>(null);
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    cloud: THREE.Points;
    shell: THREE.Points;
    dispose: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ------------------------------------------------------------------ audio
  const ensureAudio = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    analyser.connect(master);
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    masterRef.current = master;
    return ctx;
  }, []);

  // Built-in generative C-major-pentatonic ambient pad.
  const startPad = useCallback(() => {
    const ctx = ensureAudio();
    const analyser = analyserRef.current!;
    // C major pentatonic across two octaves
    const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.6);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.8;
    filter.connect(padGain);
    padGain.connect(analyser);

    const oscs: OscillatorNode[] = [];
    const voiceGains: GainNode[] = [];
    const voices = 4;
    for (let i = 0; i < voices; i++) {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = "sine";
      o2.type = "triangle";
      const f = scale[(i * 2) % scale.length];
      o1.frequency.value = f;
      o2.frequency.value = f * 1.005; // gentle detune
      const vg = ctx.createGain();
      vg.gain.value = 0.18;
      o1.connect(vg);
      o2.connect(vg);
      vg.connect(filter);
      o1.start();
      o2.start();
      oscs.push(o1, o2);
      voiceGains.push(vg);
    }

    // slow LFO drifting the filter — gives the cloud something to breathe with
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 700;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // wandering melody plucks so onsets actually fire on the fallback
    let melodyTimer = 0;
    const scheduleNote = () => {
      const t = ctx.currentTime;
      const note = scale[Math.floor(Math.random() * scale.length)] * 2;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = note;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      osc.connect(g);
      g.connect(analyser);
      osc.start(t);
      osc.stop(t + 1.0);
      melodyTimer = window.setTimeout(scheduleNote, 700 + Math.random() * 1200);
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

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const ctx = ensureAudio();
      if (ctx.state === "suspended") await ctx.resume();
      try {
        const buf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(buf);
        // swap pad out, file in
        padNodesRef.current?.stop();
        padNodesRef.current = null;
        stopFile();
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.loop = true;
        src.connect(analyserRef.current!);
        src.start();
        fileSrcRef.current = src;
        setSource("file");
        if (status !== "running") setStatus("running");
      } catch {
        setError("Could not decode that file — keeping the ambient pad alive. Try a WAV/MP3/OGG.");
        // ensure something is still audible
        if (!padNodesRef.current && !fileSrcRef.current) startPad();
      }
    },
    [ensureAudio, startPad, status, stopFile],
  );

  // ------------------------------------------------------------------ three
  const initThree = useCallback(() => {
    if (!mountRef.current || threeRef.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setGlError("WebGL isn't available in this browser, so the cloud can't render. Audio still works.");
      return;
    }
    const mount = mountRef.current;
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x05060d, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060d, 0.012);
    const camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 400);
    camera.position.set(0, 14, 52);
    camera.lookAt(0, 0, 0);

    // ---- soft round sprite for additive points ----
    const sprite = (() => {
      const size = 64;
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      const c = cv.getContext("2d")!;
      const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.35, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(cv);
      tex.needsUpdate = true;
      return tex;
    })();

    // ---- main cloud geometry (ring-buffered, allocated ONCE) ----
    const positions = new Float32Array(POINTS * 3);
    const colors = new Float32Array(POINTS * 3);
    const sizes = new Float32Array(POINTS);
    // lay out the static lattice: each ring is a disk, bins fan around it
    for (let r = 0; r < RINGS; r++) {
      const y = (r - RINGS / 2) * RING_GAP;
      for (let b = 0; b < BINS; b++) {
        const idx = r * BINS + b;
        const angle = (b / BINS) * Math.PI * 2;
        // radius grows with bin so bass sits in the core, highs at the rim
        const rad = 2 + (b / BINS) * CLOUD_RADIUS;
        positions[idx * 3] = Math.cos(angle) * rad;
        positions[idx * 3 + 1] = y;
        positions[idx * 3 + 2] = Math.sin(angle) * rad;
        sizes[idx] = 0.0;
        colors[idx * 3] = 0;
        colors[idx * 3 + 1] = 0;
        colors[idx * 3 + 2] = 0;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const cloudMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: sprite },
        uScale: { value: 1.0 },
        uBloom: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform float uBloom;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          if (t.a < 0.02) discard;
          vec3 col = vColor * (1.0 + uBloom);
          gl_FragColor = vec4(col, t.a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexColors: true,
    });
    const cloud = new THREE.Points(geo, cloudMat);
    scene.add(cloud);

    // ---- onset shockwave shell ----
    const shellPos = new Float32Array(SHELL_POINTS * 3);
    const shellDir = new Float32Array(SHELL_POINTS * 3);
    const shellCol = new Float32Array(SHELL_POINTS * 3);
    const shellSize = new Float32Array(SHELL_POINTS);
    for (let i = 0; i < SHELL_POINTS; i++) {
      // random point on unit sphere
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const dx = s * Math.cos(th);
      const dy = u;
      const dz = s * Math.sin(th);
      shellDir[i * 3] = dx;
      shellDir[i * 3 + 1] = dy;
      shellDir[i * 3 + 2] = dz;
      shellPos[i * 3] = 0;
      shellPos[i * 3 + 1] = 0;
      shellPos[i * 3 + 2] = 0;
      shellSize[i] = 0;
    }
    const shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute("position", new THREE.BufferAttribute(shellPos, 3));
    shellGeo.setAttribute("color", new THREE.BufferAttribute(shellCol, 3));
    shellGeo.setAttribute("aSize", new THREE.BufferAttribute(shellSize, 1));
    const shell = new THREE.Points(shellGeo, cloudMat.clone());
    (shell.material as THREE.ShaderMaterial).uniforms.uTex.value = sprite;
    scene.add(shell);

    threeRef.current = {
      renderer,
      scene,
      camera,
      cloud,
      shell,
      dispose: () => {
        geo.dispose();
        shellGeo.dispose();
        cloudMat.dispose();
        (shell.material as THREE.ShaderMaterial).dispose();
        sprite.dispose();
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
    const analyser = analyserRef.current;
    if (!T || !analyser) return;

    const freq = new Uint8Array(analyser.frequencyBinCount);
    const cloudGeo = T.cloud.geometry;
    const colAttr = cloudGeo.getAttribute("color") as THREE.BufferAttribute;
    const sizeAttr = cloudGeo.getAttribute("aSize") as THREE.BufferAttribute;
    const cloudMat = T.cloud.material as THREE.ShaderMaterial;

    const shellGeo = T.shell.geometry;
    const shellPosAttr = shellGeo.getAttribute("position") as THREE.BufferAttribute;
    const shellColAttr = shellGeo.getAttribute("color") as THREE.BufferAttribute;
    const shellSizeAttr = shellGeo.getAttribute("aSize") as THREE.BufferAttribute;
    // outward unit directions for each shell point (kept off-geometry)
    const shellDir = new Float32Array(SHELL_POINTS * 3);
    for (let i = 0; i < SHELL_POINTS; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      shellDir[i * 3] = s * Math.cos(th);
      shellDir[i * 3 + 1] = u;
      shellDir[i * 3 + 2] = s * Math.sin(th);
    }

    let writeRing = 0; // ring-buffer head
    let prevFlux = 0;
    let fluxEnv = 0;
    const prevSpectrum = new Float32Array(BINS);
    let lastOnset = -1;
    let shellLife = 0; // 0..1 active shell animation
    let shellEnergy = 0;
    const onsetTimes: number[] = [];
    let bpmEst = 0;

    // auto-orbit + drag state
    let theta = 0;
    let phi = 0.28;
    let autoOrbit = true;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let dist = 52;
    let dollyOffset = 0; // onset camera punch

    const el = T.renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      autoOrbit = false;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.005;
      phi = Math.max(-1.2, Math.min(1.2, phi - (e.clientY - lastY) * 0.005));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      window.setTimeout(() => {
        if (!dragging) autoOrbit = true;
      }, 2600);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      dist = Math.max(26, Math.min(110, dist + e.deltaY * 0.05));
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      T.renderer.setSize(w, h);
      T.camera.aspect = w / h;
      T.camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const tmpColor = new THREE.Color();
    const start = performance.now();

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const now = performance.now();
      const t = (now - start) / 1000;
      analyser.getByteFrequencyData(freq);
      const nyqBins = freq.length;

      // ---- spectral features ----
      let flux = 0;
      let energySum = 0;
      let centroidNum = 0;
      let centroidDen = 0;
      // write the newest frame into ring `writeRing`
      const ringBase = writeRing * BINS;
      for (let b = 0; b < BINS; b++) {
        // map bin b -> a slice of the fft (log-ish weighting toward lows)
        const f0 = Math.floor(Math.pow(b / BINS, 1.6) * nyqBins);
        const f1 = Math.max(f0 + 1, Math.floor(Math.pow((b + 1) / BINS, 1.6) * nyqBins));
        let v = 0;
        for (let k = f0; k < f1 && k < nyqBins; k++) v = Math.max(v, freq[k]);
        const e = v / 255;
        energySum += e;
        centroidNum += e * b;
        centroidDen += e;
        const d = e - prevSpectrum[b];
        if (d > 0) flux += d;
        prevSpectrum[b] = e;

        // color: hue from frequency (violet->cyan->rose/amber), bright from energy
        const hue = 0.78 - (b / BINS) * 0.78; // 0.78 violet ... 0.0 red
        const idx = ringBase + b;
        tmpColor.setHSL(((hue % 1) + 1) % 1, 0.85, 0.16 + e * 0.5);
        const bright = e * e; // emphasize loud bins
        colAttr.array[idx * 3] = tmpColor.r * (0.25 + bright * 1.8);
        colAttr.array[idx * 3 + 1] = tmpColor.g * (0.25 + bright * 1.8);
        colAttr.array[idx * 3 + 2] = tmpColor.b * (0.25 + bright * 1.8);
        sizeAttr.array[idx] = 0.6 + e * 9.0;
      }
      const avgEnergy = energySum / BINS;
      const centroid = centroidDen > 0 ? centroidNum / centroidDen / BINS : 0.3; // 0..1

      // fade older rings slightly so trailing history dims (rolling memory)
      // (we only just wrote the head; the lattice keeps prior frames as-is)
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      writeRing = (writeRing + 1) % RINGS;

      // ---- onset detection (energy flux) ----
      fluxEnv = fluxEnv * 0.9 + flux * 0.1;
      const threshold = fluxEnv * 1.6 + 0.8;
      let onset = false;
      if (flux > threshold && prevFlux <= threshold && now - lastOnset > 180) {
        onset = true;
        lastOnset = now;
        onsetTimes.push(now);
        if (onsetTimes.length > 8) onsetTimes.shift();
        if (onsetTimes.length >= 4) {
          let sum = 0;
          for (let i = 1; i < onsetTimes.length; i++) sum += onsetTimes[i] - onsetTimes[i - 1];
          const avgMs = sum / (onsetTimes.length - 1);
          const raw = 60000 / avgMs;
          bpmEst = bpmEst ? bpmEst * 0.7 + raw * 0.3 : raw;
          setBpm(Math.round(Math.max(40, Math.min(220, bpmEst))));
        }
      }
      prevFlux = flux;

      if (onset) {
        shellLife = 1;
        shellEnergy = Math.min(1, avgEnergy * 2.4 + 0.3);
        dollyOffset = -6 * shellEnergy; // quick dolly in
        setOnsetFlash(true);
        window.setTimeout(() => setOnsetFlash(false), 120);
      }

      // ---- shell shockwave animation ----
      if (shellLife > 0) {
        shellLife = Math.max(0, shellLife - 0.022);
        const expand = (1 - shellLife) * (CLOUD_RADIUS + 14) * (0.6 + shellEnergy);
        const fade = shellLife;
        tmpColor.setHSL(0.0 + 0.12 * (1 - shellLife), 0.9, 0.55 * fade + 0.1);
        for (let i = 0; i < SHELL_POINTS; i++) {
          shellPosAttr.array[i * 3] = shellDir[i * 3] * expand;
          shellPosAttr.array[i * 3 + 1] = shellDir[i * 3 + 1] * expand * 0.6;
          shellPosAttr.array[i * 3 + 2] = shellDir[i * 3 + 2] * expand;
          shellColAttr.array[i * 3] = tmpColor.r;
          shellColAttr.array[i * 3 + 1] = tmpColor.g;
          shellColAttr.array[i * 3 + 2] = tmpColor.b;
          shellSizeAttr.array[i] = 3.5 * fade * (0.5 + shellEnergy);
        }
        shellPosAttr.needsUpdate = true;
        shellColAttr.needsUpdate = true;
        shellSizeAttr.needsUpdate = true;
      } else if (shellSizeAttr.array[0] !== 0) {
        for (let i = 0; i < SHELL_POINTS; i++) shellSizeAttr.array[i] = 0;
        shellSizeAttr.needsUpdate = true;
      }

      // ---- centroid -> global dispersion + hue bias + bloom ----
      // bright music (high centroid) blooms wider & sparklier; dark condenses
      const targetScale = 0.8 + centroid * 1.1; // overall point size
      cloudMat.uniforms.uScale.value += (targetScale - cloudMat.uniforms.uScale.value) * 0.05;
      const targetSpread = 0.85 + centroid * 0.5;
      T.cloud.scale.x += (targetSpread - T.cloud.scale.x) * 0.04;
      T.cloud.scale.z += (targetSpread - T.cloud.scale.z) * 0.04;
      T.cloud.scale.y += (1 + centroid * 0.3 - T.cloud.scale.y) * 0.04;
      const bloomTarget = shellLife * 0.9 + avgEnergy * 0.6;
      cloudMat.uniforms.uBloom.value += (bloomTarget - cloudMat.uniforms.uBloom.value) * 0.12;

      // slow self-rotation of the whole cloud
      T.cloud.rotation.y = t * 0.06;
      T.shell.rotation.y = t * 0.06;

      // ---- camera: auto-orbit + drag + onset dolly ----
      if (autoOrbit) theta += 0.0016;
      dollyOffset *= 0.9;
      const camDist = dist + dollyOffset;
      T.camera.position.x = Math.sin(theta) * Math.cos(phi) * camDist;
      T.camera.position.z = Math.cos(theta) * Math.cos(phi) * camDist;
      T.camera.position.y = Math.sin(phi) * camDist + 2;
      T.camera.lookAt(0, 0, 0);

      T.renderer.render(T.scene, T.camera);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, [status, initThree]);

  // ------------------------------------------------------------------ start
  const handleStart = useCallback(async () => {
    setError(null);
    const ctx = ensureAudio();
    if (ctx.state === "suspended") await ctx.resume();
    if (!padNodesRef.current && !fileSrcRef.current) startPad();
    setStatus("running");
  }, [ensureAudio, startPad]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      padNodesRef.current?.stop();
      if (fileSrcRef.current) {
        try {
          fileSrcRef.current.stop();
        } catch {
          /* noop */
        }
      }
      threeRef.current?.dispose();
      threeRef.current = null;
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#05060d] text-white">
      {/* canvas mount */}
      <div ref={mountRef} className="absolute inset-0 z-0 h-screen w-full" aria-hidden />

      {/* gradient veil for legibility */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/55 via-transparent to-black/65" />

      {/* HUD */}
      <div className="relative z-20 flex min-h-screen flex-col justify-between p-6 sm:p-10">
        <header className="max-w-2xl">
          <p className="text-base font-medium uppercase tracking-[0.3em] text-violet-300">Resonance · Dream 243</p>
          <h1 className="mt-2 text-4xl font-semibold text-white sm:text-5xl">Spectral Cloud</h1>
          <p className="mt-3 max-w-xl text-base text-white/75 sm:text-lg">
            What if your own music became a volumetric cloud of light you could orbit? Each frame of the spectrum is
            deposited into a slowly rotating nebula — a rolling few-second memory you drift through.
          </p>

          {glError && <p className="mt-3 text-base text-rose-300">{glError}</p>}
          {error && <p className="mt-3 text-base text-rose-300">{error}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {status === "idle" ? (
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-full bg-violet-500 px-6 py-2.5 text-base font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:bg-violet-400"
              >
                Start the cloud
              </button>
            ) : (
              <span className="min-h-[44px] rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-base text-white/75">
                {source === "file" ? "Playing your track" : "Ambient pad live"}
              </span>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="min-h-[44px] rounded-full border border-white/25 bg-white/5 px-5 py-2.5 text-base font-medium text-white/95 transition hover:bg-white/10"
            >
              Drop a track
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />

            <Link
              href="/dream/243-spectral-cloud/README.md"
              className="min-h-[44px] self-center px-2 py-2.5 text-base text-violet-300 underline-offset-4 hover:underline"
            >
              Read the design notes
            </Link>
          </div>
        </header>

        <footer className="flex flex-wrap items-end justify-between gap-4">
          <p className="max-w-md text-base text-white/55">
            Drag to orbit · scroll to dolly · auto-orbit resumes when you let go. Drop a piano recording to sculpt it in
            light.
          </p>
          <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-base backdrop-blur">
            <span
              className={`inline-block h-3 w-3 rounded-full transition ${
                onsetFlash ? "scale-150 bg-rose-300" : "bg-white/30"
              }`}
              aria-hidden
            />
            <span className="text-white/75">onset</span>
            <span className="ml-2 tabular-nums text-white/95">{bpm > 0 ? `${bpm} BPM` : "— BPM"}</span>
          </div>
        </footer>
      </div>
    </main>
  );
}
