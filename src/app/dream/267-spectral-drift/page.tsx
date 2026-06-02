"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Spectral Drift — your music as a flowing river of light you drift through.
//
// Reframe (NSTR, arXiv 2511.18384, Nov 2025): a spectrum is not a frozen wall
// of bins but a *frequency field that transports through space*. So instead of
// a static spectrogram we EMIT a fresh sheet of glowing particles every frame
// at the far end of a corridor — each particle born carrying its bin's hue and
// energy — and then ADVECT them forward toward the camera while a cheap
// curl-like flow field makes the streams meander and braid. You fly through a
// living current of your own song. Ikeda data-flow meets Anadol nebula.
//
// References (see README): NSTR 2511.18384 (frequency-transport reframe);
// Ryoji Ikeda data-stream aesthetic; Refik Anadol data-as-particle nebulas.
// ─────────────────────────────────────────────────────────────────────────────

// ── tunables ─────────────────────────────────────────────────────────────────
const POOL = 24000; // total particles in the pool
const SHEETS = 200; // emission slices in the ring buffer
const PER_SHEET = Math.floor(POOL / SHEETS); // particles emitted per frame-ish
const BINS = 160; // perceptual bins folded from the FFT
const CORRIDOR_FAR = -120; // z where particles are born
const CORRIDOR_NEAR = 8; // z past which they recycle
const SPREAD_X = 34; // lateral half-width of the corridor
const SPREAD_Y = 20; // vertical half-width
const BASE_SPEED = 26; // forward advection speed (units/sec)

type Mode = "idle" | "running";

export default function SpectralDriftPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [status, setStatus] = useState("Drop a track, load one by ID, or just press Start.");
  const [error, setError] = useState<string | null>(null);
  const [noWebGL, setNoWebGL] = useState(false);
  const [trackId, setTrackId] = useState("");
  const [bpm, setBpm] = useState<number | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");

  // audio refs (per-frame data lives in refs, never state)
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const srcNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const demoStopRef = useRef<(() => void) | null>(null);

  // engine refs
  const rafRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // ── audio plumbing ─────────────────────────────────────────────────────────

  function makeAnalyser(ctx: AudioContext): AnalyserNode {
    const a = ctx.createAnalyser();
    a.fftSize = 4096;
    a.smoothingTimeConstant = 0.72;
    analyserRef.current = a;
    freqRef.current = new Uint8Array(a.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    return a;
  }

  function playBuffer(ctx: AudioContext, buf: AudioBuffer) {
    // stop any prior real source
    if (srcNodeRef.current) {
      try {
        srcNodeRef.current.stop();
      } catch {
        /* already stopped */
      }
      srcNodeRef.current.disconnect();
    }
    const analyser = analyserRef.current ?? makeAnalyser(ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(analyser);
    analyser.connect(ctx.destination);
    src.start();
    srcNodeRef.current = src;
  }

  // Synthesized demo: a slow pad drone + periodic plucked pentatonic notes so
  // onsets fire and the river never sits silent for a reviewer who just clicks.
  function runDemo(ctx: AudioContext) {
    const analyser = analyserRef.current ?? makeAnalyser(ctx);
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(analyser);
    analyser.connect(ctx.destination);

    // pad drone (two slightly detuned saws through a slow lowpass)
    const pad = ctx.createGain();
    pad.gain.value = 0.14;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    pad.connect(lp);
    lp.connect(master);
    const padOscs: OscillatorNode[] = [];
    [110, 110.6, 164.81].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.connect(pad);
      o.start();
      padOscs.push(o);
    });
    // slow swell on the pad lowpass
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 400;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    // fade master in
    master.gain.linearRampToValueAtTime(0.0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2.0);

    // pentatonic pluck scheduler — these transients trigger spectral-flux onsets
    const penta = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    let stopped = false;
    function pluck() {
      if (stopped) return;
      const ctxNow = ctx.currentTime;
      const f = penta[Math.floor(Math.random() * penta.length)] * (Math.random() < 0.3 ? 2 : 1);
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctxNow);
      g.gain.exponentialRampToValueAtTime(0.5, ctxNow + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctxNow + 0.9);
      o.connect(g);
      g.connect(master);
      o.start(ctxNow);
      o.stop(ctxNow + 1.0);
      const next = 380 + Math.random() * 520; // ~0.38–0.9s -> lively onsets
      window.setTimeout(pluck, next);
    }
    window.setTimeout(pluck, 600);

    demoStopRef.current = () => {
      stopped = true;
      try {
        padOscs.forEach((o) => o.stop());
        lfo.stop();
      } catch {
        /* noop */
      }
    };
  }

  async function decodeAndPlay(ctx: AudioContext, data: ArrayBuffer) {
    const buf = await ctx.decodeAudioData(data);
    playBuffer(ctx, buf);
  }

  // ── input handlers ───────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setError(null);
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      await ctx.resume();
      makeAnalyser(ctx);
      const data = await file.arrayBuffer();
      await decodeAndPlay(ctx, data);
      // silence the demo if it was running
      demoStopRef.current?.();
      demoStopRef.current = null;
      setSourceLabel(`file · ${file.name}`);
      setStatus("Flying through your file.");
      if (mode === "idle") startEngine();
    } catch {
      setError("Could not decode that audio file. Try a WAV/MP3/OGG.");
    }
  }

  async function loadById() {
    const id = trackId.trim();
    if (!id) return;
    setError(null);
    setStatus(`Loading track ${id}…`);
    try {
      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      await ctx.resume();
      makeAnalyser(ctx);

      const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const ctype = res.headers.get("content-type") || "";

      let data: ArrayBuffer;
      if (ctype.includes("application/json")) {
        const json = (await res.json()) as { url?: string };
        if (!json.url) throw new Error("no url in JSON");
        const audioRes = await fetch(json.url);
        if (!audioRes.ok) throw new Error(`audio status ${audioRes.status}`);
        data = await audioRes.arrayBuffer();
      } else {
        data = await res.arrayBuffer();
      }
      await decodeAndPlay(ctx, data);
      demoStopRef.current?.();
      demoStopRef.current = null;
      setSourceLabel(`track · ${id}`);
      setStatus(`Flying through track ${id}.`);
      if (mode === "idle") startEngine();
    } catch {
      setError(`Could not load track "${id}". Keeping the demo current flowing.`);
      // ensure SOMETHING is playing
      const ctx = ctxRef.current;
      if (ctx && !srcNodeRef.current && !demoStopRef.current) runDemo(ctx);
      if (mode === "idle") startEngine();
    }
  }

  function start() {
    setError(null);
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume();
    if (!analyserRef.current) makeAnalyser(ctx);
    // zero-input fallback: synthesized motif
    if (!srcNodeRef.current && !demoStopRef.current) {
      runDemo(ctx);
      setSourceLabel("synthesized demo");
      setStatus("Synthesized demo current — drop a file or load a track any time.");
    }
    startEngine();
  }

  // ── the three.js particle engine (allocate once; rewrite slices per frame) ───

  function startEngine() {
    if (mode === "running") return;
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
      // probe for context
      if (!renderer.getContext()) throw new Error("no gl");
    } catch {
      setNoWebGL(true);
      setMode("running"); // audio still runs
      return;
    }
    rendererRef.current = renderer;
    setMode("running");

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x05040a, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05040a, 0.012);

    const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 400);
    camera.position.set(0, 0, 14);

    // ── geometry: allocate ONCE ────────────────────────────────────────────────
    const positions = new Float32Array(POOL * 3);
    const colors = new Float32Array(POOL * 3); // rgb premultiplied by brightness
    const sizes = new Float32Array(POOL);
    const velX = new Float32Array(POOL); // lateral drift velocity
    const velY = new Float32Array(POOL);

    // start everything off-screen / dark
    for (let i = 0; i < POOL; i++) {
      positions[i * 3 + 2] = CORRIDOR_FAR - 50; // parked far behind
      sizes[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uPixelRatio: { value: renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying vec3 vColor;
        uniform float uPixelRatio;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // perspective size attenuation
          gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
          gl_PointSize = clamp(gl_PointSize, 0.0, 64.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          // soft round sprite
          vec2 d = gl_PointCoord - vec2(0.5);
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.0, r);
          a = a * a;
          gl_FragColor = vec4(vColor, 1.0) * a;
        }
      `,
    });
    mat.vertexColors = true;

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const posAttr = geo.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = geo.getAttribute("color") as THREE.BufferAttribute;
    const sizeAttr = geo.getAttribute("aSize") as THREE.BufferAttribute;

    // ── per-frame state ──────────────────────────────────────────────────────
    let writeSheet = 0; // ring-buffer cursor over emission sheets
    let prevMag: Float32Array | null = null;
    const fluxHist: number[] = [];
    let lastOnset = -1e9;
    const onsetTimes: number[] = [];
    let speedBoost = 0; // decays after onset
    let shake = 0;
    let smoothCentroid = 0.4;
    let turbulence = 0.5;

    const tmpColor = new THREE.Color();
    const start = performance.now();
    let last = start;

    function powBin(i: number, n: number, len: number): number {
      // power-law fold so bass gets resolution: index into FFT array
      const t = i / n;
      const idx = Math.floor(Math.pow(t, 2.0) * len);
      return Math.min(len - 1, idx);
    }

    function frame(now: number) {
      rafRef.current = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;

      const analyser = analyserRef.current;
      const freq = freqRef.current;
      let centroidNorm = 0.4;
      let totalEnergy = 0;

      // perceptual bins folded from FFT
      const binVals = new Float32Array(BINS);
      if (analyser && freq) {
        analyser.getByteFrequencyData(freq);
        const len = freq.length;
        let weightedSum = 0;
        let magSum = 0;
        for (let b = 0; b < BINS; b++) {
          const lo = powBin(b, BINS, len);
          const hi = Math.max(lo + 1, powBin(b + 1, BINS, len));
          let acc = 0;
          for (let k = lo; k < hi; k++) acc += freq[k];
          const v = acc / (hi - lo) / 255;
          binVals[b] = v;
          weightedSum += v * b;
          magSum += v;
          totalEnergy += v;
        }
        centroidNorm = magSum > 0.001 ? weightedSum / magSum / BINS : 0.4;
      }
      totalEnergy /= BINS;

      // ── spectral-flux onset detection ───────────────────────────────────────
      let flux = 0;
      if (prevMag) {
        for (let b = 0; b < BINS; b++) {
          const d = binVals[b] - prevMag[b];
          if (d > 0) flux += d;
        }
      }
      prevMag = binVals.slice();
      fluxHist.push(flux);
      if (fluxHist.length > 43) fluxHist.shift(); // ~0.7s window @ 60fps
      const mean = fluxHist.reduce((a, c) => a + c, 0) / fluxHist.length;
      const variance =
        fluxHist.reduce((a, c) => a + (c - mean) * (c - mean), 0) / fluxHist.length;
      const std = Math.sqrt(variance);
      const thresh = mean + 1.5 * std;
      let onset = false;
      if (flux > thresh && flux > 0.4 && now - lastOnset > 100) {
        onset = true;
        lastOnset = now;
        onsetTimes.push(now);
        if (onsetTimes.length > 24) onsetTimes.shift();
        speedBoost = 1.0;
        shake = 1.0;
        // BPM from median inter-onset interval, folded to 60–180
        if (onsetTimes.length > 4) {
          const iois: number[] = [];
          for (let i = 1; i < onsetTimes.length; i++) iois.push(onsetTimes[i] - onsetTimes[i - 1]);
          iois.sort((a, b) => a - b);
          const med = iois[Math.floor(iois.length / 2)];
          let b = 60000 / med;
          while (b < 60) b *= 2;
          while (b > 180) b /= 2;
          setBpm(Math.round(b));
        }
      }

      // ── smooth global drivers ─────────────────────────────────────────────
      smoothCentroid += (centroidNorm - smoothCentroid) * 0.05;
      const targetTurb = 0.35 + totalEnergy * 2.2;
      turbulence += (targetTurb - turbulence) * 0.04;
      speedBoost *= 0.9;
      shake *= 0.86;

      // ── EMISSION: write one fresh sheet at the far end ───────────────────────
      const sheetStart = writeSheet * PER_SHEET;
      for (let p = 0; p < PER_SHEET; p++) {
        const idx = sheetStart + p;
        if (idx >= POOL) break;
        const b = Math.floor((p / PER_SHEET) * BINS);
        const e = binVals[b]; // 0..1 energy of this bin
        // quiet bins emit nearly nothing -> silence reads as empty space
        if (e < 0.06 + Math.random() * 0.05) {
          sizeAttr.array[idx] = 0;
          posAttr.array[idx * 3 + 2] = CORRIDOR_FAR - 60; // park dark
          continue;
        }
        // bin -> lateral X position (low freq left/center, spread out by bin)
        const bx = (b / BINS) * 2 - 1; // -1..1
        const x = bx * SPREAD_X + (Math.random() - 0.5) * 3;
        const y = (Math.random() - 0.5) * SPREAD_Y * 2;
        const z = CORRIDOR_FAR - Math.random() * 8;

        posAttr.array[idx * 3] = x;
        posAttr.array[idx * 3 + 1] = y;
        posAttr.array[idx * 3 + 2] = z;
        velX[idx] = (Math.random() - 0.5) * 1.5;
        velY[idx] = (Math.random() - 0.5) * 1.5;

        // hue: bin position shifted by centroid temperature.
        // bass-heavy (low centroid) -> deep violet/indigo; bright -> cyan->rose
        const hue =
          (0.74 - smoothCentroid * 0.55 + (b / BINS) * 0.18 + (onset ? 0.05 : 0)) % 1;
        const sat = 0.85;
        const baseLight = 0.5 + e * 0.35 + (onset ? 0.25 : 0);
        tmpColor.setHSL((hue + 1) % 1, sat, Math.min(0.85, baseLight));
        const bright = (0.35 + e * 1.4 + (onset ? 1.0 : 0));
        colAttr.array[idx * 3] = tmpColor.r * bright;
        colAttr.array[idx * 3 + 1] = tmpColor.g * bright;
        colAttr.array[idx * 3 + 2] = tmpColor.b * bright;

        sizeAttr.array[idx] = (0.5 + e * 2.6 + (onset ? 1.8 : 0)) * (0.8 + Math.random() * 0.5);
      }
      writeSheet = (writeSheet + 1) % SHEETS;

      // ── ADVECTION: drift every particle forward + curl-like lateral meander ──
      const speed = BASE_SPEED * (1 + speedBoost * 1.3);
      const k = 0.9 * turbulence;
      const pos = posAttr.array as Float32Array;
      for (let i = 0; i < POOL; i++) {
        const o = i * 3;
        let z = pos[o + 2];
        if (z < CORRIDOR_FAR - 40) continue; // parked-dark, skip
        const x = pos[o];
        const y = pos[o + 1];
        // cheap curl-like flow field
        velX[i] += Math.sin(y * 0.07 + t * 0.3 + z * 0.02) * k * dt;
        velY[i] += Math.cos(x * 0.06 - t * 0.25 + z * 0.02) * k * dt;
        velX[i] *= 0.985;
        velY[i] *= 0.985;
        pos[o] = x + velX[i] * dt;
        pos[o + 1] = y + velY[i] * dt;
        z += speed * dt;
        // recycle to far end once past the camera
        if (z > CORRIDOR_NEAR) {
          z = CORRIDOR_FAR - Math.random() * 6;
          pos[o] = (pos[o]) * 0.3 + (Math.random() - 0.5) * SPREAD_X * 0.6;
          pos[o + 1] = (Math.random() - 0.5) * SPREAD_Y * 2;
          sizeAttr.array[i] *= 0.5; // dim recycled ghosts so they don't pile up
        }
        pos[o + 2] = z;
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;

      // ── camera: slow forward sway + onset shake ──────────────────────────────
      camera.position.x = Math.sin(t * 0.13) * 2.5 + (Math.random() - 0.5) * shake * 1.2;
      camera.position.y = Math.cos(t * 0.11) * 1.6 + (Math.random() - 0.5) * shake * 1.2;
      camera.lookAt(0, 0, CORRIDOR_FAR * 0.4);

      renderer.render(scene, camera);
    }
    rafRef.current = requestAnimationFrame(frame);

    const mountEl = mount;
    function onResize() {
      const w = mountEl.clientWidth || window.innerWidth;
      const h = mountEl.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // ── teardown ──────────────────────────────────────────────────────────────
    cleanupRef.current = () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }

  // ── unmount teardown ─────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      demoStopRef.current?.();
      if (srcNodeRef.current) {
        try {
          srcNodeRef.current.stop();
        } catch {
          /* noop */
        }
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  // ── drag & drop ──────────────────────────────────────────────────────────────
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-[#05040a] text-white"
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div ref={mountRef} className="absolute inset-0" />

      {/* corner design-notes link */}
      <Link
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/267-spectral-drift/README.md"
        className="absolute right-4 top-4 z-20 font-mono text-base text-white/55 underline decoration-white/30 hover:text-white/80"
      >
        Read the design notes
      </Link>

      {/* HUD while running */}
      {mode === "running" && (
        <div className="pointer-events-none absolute bottom-4 left-4 z-20 font-mono text-base text-white/75">
          <div className="text-violet-300">spectral drift</div>
          {sourceLabel && <div className="text-white/55">{sourceLabel}</div>}
          {bpm !== null && (
            <div className="text-emerald-300/95">~{bpm} bpm · {BINS} streams</div>
          )}
          {noWebGL && (
            <div className="text-amber-300/95">
              audio is flowing — but this browser has no WebGL, so the visuals are hidden.
            </div>
          )}
        </div>
      )}

      {/* control panel */}
      {mode === "idle" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-xl rounded-2xl border border-white/10 bg-black/55 p-7 backdrop-blur-md">
            <h1 className="font-serif text-3xl text-white/95">Spectral Drift</h1>
            <p className="mt-3 text-base leading-relaxed text-white/80">
              Your music becomes a flowing river of light you drift through. Each
              frequency is a stream of glowing particles that advects forward and
              meanders as the song plays — a living current, not a frozen wall.
            </p>
            <p className="mt-2 text-base leading-relaxed text-white/55">
              Drop an audio file below, load a Resonance track by ID, or just press
              Start for a synthesized demo current.
            </p>

            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={start}
                className="min-h-[44px] rounded-xl bg-violet-500/20 px-4 py-2.5 text-base font-medium text-violet-300 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
              >
                ▶ Start
              </button>

              <div className="flex gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-base text-white/80 ring-1 ring-white/15 transition hover:bg-white/10"
                >
                  Choose audio file
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  placeholder="Resonance track ID"
                  className="min-h-[44px] flex-1 rounded-xl bg-white/5 px-4 py-2.5 font-mono text-base text-white/90 ring-1 ring-white/15 placeholder:text-white/40 focus:outline-none focus:ring-violet-400/50"
                />
                <button
                  onClick={() => void loadById()}
                  className="min-h-[44px] rounded-xl bg-white/5 px-4 py-2.5 text-base text-white/80 ring-1 ring-white/15 transition hover:bg-white/10"
                >
                  Load
                </button>
              </div>
            </div>

            <p className="mt-4 text-base text-white/55">{status}</p>
            {error && <p className="mt-2 text-base text-rose-300">{error}</p>}
          </div>
        </div>
      )}

      {/* running-state overlay for late file drops / errors */}
      {mode === "running" && error && (
        <div className="absolute right-4 top-14 z-20 max-w-sm rounded-xl border border-rose-400/30 bg-black/60 p-3 font-mono text-base text-rose-300 backdrop-blur">
          {error}
        </div>
      )}
    </div>
  );
}
