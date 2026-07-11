"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

// ---- analysis shape shared rAF<->React ----
type Bands = {
  sub: number;
  bass: number;
  lowMid: number;
  highMid: number;
  high: number;
  rms: number;
  centroid: number; // 0..1 normalized spectral centroid
};

type SourceMode = "synth" | "file" | "mic" | "track";

const ZERO: Bands = {
  sub: 0,
  bass: 0,
  lowMid: 0,
  highMid: 0,
  high: 0,
  rms: 0,
  centroid: 0.4,
};

export default function PianoIsosurfacePage() {
  const mountRef = useRef<HTMLDivElement>(null);

  // engine refs (rAF reads these, never React state)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const fileSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const synthRef = useRef<{ stop: () => void } | null>(null);
  const bandsRef = useRef<Bands>({ ...ZERO });

  // UI state
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<SourceMode>("synth");
  const [status, setStatus] = useState("Idle — press Start to wake the surface.");
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Bands>({ ...ZERO });
  const [trackId, setTrackId] = useState("");
  const [webglOk, setWebglOk] = useState(true);

  // ---------- AUDIO ----------
  const ensureCtx = useCallback((): AudioContext | null => {
    if (audioCtxRef.current) return audioCtxRef.current;
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx = new Ctx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(analyser);
      master.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      masterGainRef.current = master;
      return ctx;
    } catch (e) {
      setError("Web Audio unavailable: " + String(e));
      return null;
    }
  }, []);

  // generative D-dorian pad fallback
  const startSynth = useCallback(() => {
    const ctx = ensureCtx();
    const master = masterGainRef.current;
    if (!ctx || !master) return;
    if (synthRef.current) return; // already running

    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(master);
    padGain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 2.5);

    // D dorian: D E F G A B C
    const scale = [146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66];
    const voices = [0, 1, 2].map((i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      const g = ctx.createGain();
      g.gain.value = 0.33;
      osc.connect(g);
      g.connect(padGain);
      osc.frequency.value = scale[2 + i];
      osc.detune.value = (i - 1) * 6; // slight spread
      osc.start();
      return { osc, g };
    });

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const step = () => {
      if (stopped) return;
      const now = ctx.currentTime;
      voices.forEach((v) => {
        const f = scale[Math.floor(Math.random() * scale.length)];
        v.osc.frequency.setTargetAtTime(f, now, 1.4);
      });
      timer = setTimeout(step, 3200 + Math.random() * 2200);
    };
    step();

    synthRef.current = {
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        try {
          padGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.4);
        } catch {
          /* noop */
        }
        voices.forEach((v) => {
          try {
            v.osc.stop(ctx.currentTime + 0.6);
          } catch {
            /* noop */
          }
        });
      },
    };
  }, [ensureCtx]);

  const stopFile = useCallback(() => {
    if (fileSourceRef.current) {
      try {
        fileSourceRef.current.stop();
      } catch {
        /* noop */
      }
      try {
        fileSourceRef.current.disconnect();
      } catch {
        /* noop */
      }
      fileSourceRef.current = null;
    }
  }, []);

  const stopMic = useCallback(() => {
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        /* noop */
      }
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  // decode an arraybuffer and play it looping into master
  const playBuffer = useCallback(
    async (data: ArrayBuffer) => {
      const ctx = ensureCtx();
      const master = masterGainRef.current;
      if (!ctx || !master) return;
      const audioBuf = await ctx.decodeAudioData(data.slice(0));
      stopFile();
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.loop = true;
      src.connect(master);
      src.start();
      fileSourceRef.current = src;
    },
    [ensureCtx, stopFile]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const ctx = ensureCtx();
        if (ctx && ctx.state === "suspended") await ctx.resume();
        const buf = await file.arrayBuffer();
        await playBuffer(buf);
        synthRef.current?.stop();
        synthRef.current = null;
        setMode("file");
        setStatus(`Playing file: ${file.name}`);
      } catch (e) {
        setError("Could not decode audio file. Synth pad keeps the surface alive.");
        setStatus("Decode failed — synth fallback running.");
        startSynth();
        console.warn(e);
      }
    },
    [ensureCtx, playBuffer, startSynth]
  );

  const handleMic = useCallback(async () => {
    setError(null);
    try {
      const ctx = ensureCtx();
      if (!ctx || !analyserRef.current) return;
      if (ctx.state === "suspended") await ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      // analysis only — DO NOT route mic to destination
      src.connect(analyserRef.current);
      micSourceRef.current = src;
      stopFile();
      synthRef.current?.stop();
      synthRef.current = null;
      setMode("mic");
      setStatus("Listening to microphone (analysis only).");
    } catch (e) {
      setError("Microphone denied — synth pad still drives the surface.");
      setStatus("Mic unavailable — synth fallback running.");
      startSynth();
      console.warn(e);
    }
  }, [ensureCtx, stopFile, startSynth]);

  const handleTrack = useCallback(async () => {
    const id = trackId.trim();
    if (!id) return;
    setError(null);
    setStatus(`Fetching track ${id}…`);
    try {
      const ctx = ensureCtx();
      if (ctx && ctx.state === "suspended") await ctx.resume();
      const res = await fetch(`/api/audio/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") ?? "";
      let data: ArrayBuffer;
      if (ct.includes("application/json")) {
        const json = (await res.json()) as { url?: string };
        if (!json.url) throw new Error("no url in response");
        const audioRes = await fetch(json.url);
        if (!audioRes.ok) throw new Error(`audio HTTP ${audioRes.status}`);
        data = await audioRes.arrayBuffer();
      } else {
        data = await res.arrayBuffer();
      }
      await playBuffer(data);
      synthRef.current?.stop();
      synthRef.current = null;
      setMode("track");
      setStatus(`Playing track ${id}.`);
    } catch (e) {
      setError(`Could not load track "${id}" — synth pad keeps playing.`);
      setStatus("Track load failed — synth fallback running.");
      startSynth();
      console.warn(e);
    }
  }, [trackId, ensureCtx, playBuffer, startSynth]);

  const handleStart = useCallback(async () => {
    const ctx = ensureCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume();
    startSynth();
    setStarted(true);
    setMode("synth");
    setStatus("Synth pad awake — drop a file, use mic, or load a track.");
  }, [ensureCtx, startSynth]);

  // ---------- THREE / MARCHING CUBES ENGINE ----------
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      if (!renderer.getContext()) throw new Error("no context");
    } catch {
      setWebglOk(false);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const sizeOf = () => ({
      w: mount.clientWidth || window.innerWidth,
      h: mount.clientHeight || window.innerHeight,
    });
    let { w, h } = sizeOf();
    renderer.setSize(w, h);
    renderer.setClearColor(0x05060a, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060a, 0.18);
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0, 4.4);

    // lights
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 3, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x6688ff, 0.8);
    fill.position.set(-3, -1, 1);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0x202840, 1.0));

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x335577),
      emissive: new THREE.Color(0x102035),
      emissiveIntensity: 0.9,
      roughness: 0.35,
      metalness: 0.1,
    });

    const resolution = 48;
    const mc = new MarchingCubes(resolution, material, true, true, 100000);
    mc.isolation = 80;

    const group = new THREE.Group();
    group.add(mc);
    scene.add(group);

    // pointer-drag orbit (hand-rolled)
    let dragging = false;
    let px = 0;
    let py = 0;
    let yaw = 0;
    let pitch = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      px = e.clientX;
      py = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      yaw += (e.clientX - px) * 0.006;
      pitch += (e.clientY - py) * 0.006;
      pitch = Math.max(-1.2, Math.min(1.2, pitch));
      px = e.clientX;
      py = e.clientY;
    };
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);

    const onResize = () => {
      const s = sizeOf();
      w = s.w;
      h = s.h;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // analysis buffers — Uint8Array<ArrayBuffer> typing trap handled here
    const binCount = 1024; // fftSize/2
    const freq: Uint8Array<ArrayBuffer> = new Uint8Array(binCount);
    const time: Uint8Array<ArrayBuffer> = new Uint8Array(binCount);

    const avg = (arr: Uint8Array<ArrayBuffer>, lo: number, hi: number) => {
      let s = 0;
      for (let i = lo; i < hi; i++) s += arr[i];
      return s / Math.max(1, hi - lo) / 255;
    };

    let raf = 0;
    let t = 0;
    let lastReadout = 0;
    const tmpColor = new THREE.Color();
    const tmpScale = new THREE.Vector3();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 0.016;

      const analyser = analyserRef.current;
      const b = bandsRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(time);
        b.sub = avg(freq, 0, 12);
        b.bass = avg(freq, 12, 48);
        b.lowMid = avg(freq, 48, 140);
        b.highMid = avg(freq, 140, 380);
        b.high = avg(freq, 380, 900);
        let sum = 0;
        for (let i = 0; i < binCount; i++) {
          const v = (time[i] - 128) / 128;
          sum += v * v;
        }
        b.rms = Math.sqrt(sum / binCount);
        let num = 0;
        let den = 0;
        for (let i = 0; i < binCount; i++) {
          num += i * freq[i];
          den += freq[i];
        }
        const c = den > 0 ? num / den / binCount : 0.4;
        b.centroid = b.centroid * 0.85 + c * 0.15;
      }

      // ---- drive the metaball field ----
      mc.reset();
      const sub = 12;

      // central bass ball — pulses with bass+sub
      const bassPulse = 0.18 + b.bass * 0.7 + b.sub * 0.5;
      mc.addBall(0.5, 0.5, 0.5, bassPulse, sub);

      // mid-radius orbiting balls driven by mids
      const midStr = 0.12 + (b.lowMid + b.highMid) * 0.45;
      for (let i = 0; i < 4; i++) {
        const a = t * 0.4 + (i * Math.PI) / 2;
        const r = 0.26 + 0.06 * Math.sin(t * 0.7 + i);
        const x = 0.5 + Math.cos(a) * r;
        const y = 0.5 + Math.sin(a * 1.3) * r * 0.8;
        const z = 0.5 + Math.sin(a) * r;
        mc.addBall(x, y, z, midStr, sub);
      }

      // small fast high-frequency flecks
      const highStr = 0.05 + b.high * 0.5;
      for (let i = 0; i < 3; i++) {
        const a = t * 1.6 + (i * Math.PI * 2) / 3;
        const r = 0.34 + 0.05 * Math.sin(t * 2.1 + i);
        const x = 0.5 + Math.cos(a) * r;
        const y = 0.5 + Math.cos(a * 0.7 + i) * r;
        const z = 0.5 + Math.sin(a) * r;
        mc.addBall(x, y, z, highStr, sub);
      }

      mc.update();

      // overall energy -> global scale & isolation
      const energy = Math.min(1, b.rms * 2.2 + b.bass * 0.6);
      const sc = 1.7 + energy * 0.9;
      tmpScale.set(sc, sc, sc);
      mc.scale.lerp(tmpScale, 0.1);
      mc.isolation = 70 + (1 - energy) * 40;

      // centroid -> hue (cool/deep when dark, warm/bright when brilliant)
      const hue = 0.62 - b.centroid * 0.5; // blue -> amber
      tmpColor.setHSL(hue, 0.6, 0.5);
      material.color.lerp(tmpColor, 0.08);
      material.emissive.setHSL(hue, 0.7, 0.18 + energy * 0.2);
      material.emissiveIntensity = 0.7 + energy * 0.8;

      // auto-rotate + pointer orbit
      group.rotation.y = yaw + t * 0.12;
      group.rotation.x = pitch + Math.sin(t * 0.2) * 0.08;

      renderer.render(scene, camera);

      if (t - lastReadout > 0.16) {
        lastReadout = t;
        setReadout({ ...b });
      }
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      scene.remove(group);
      mc.geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // teardown audio on unmount
  useEffect(() => {
    return () => {
      synthRef.current?.stop();
      synthRef.current = null;
      stopFile();
      stopMic();
      const ctx = audioCtxRef.current;
      if (ctx) {
        ctx.close().catch(() => {
          /* noop */
        });
        audioCtxRef.current = null;
      }
    };
  }, [stopFile, stopMic]);

  // ---------- RENDER ----------
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden bg-[#05060a] text-foreground"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div ref={mountRef} className="absolute inset-0" />

      {/* HUD */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5">
        <header className="pointer-events-auto max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Piano Isosurface
          </h1>
          <p className="mt-1 text-base text-foreground">
            A piano performance sculpts a living 3D isosurface in real time — sound
            becoming a breathing volumetric blob that folds, swells, and splits.
          </p>

          {!webglOk && (
            <p className="mt-3 text-base text-violet-300">
              WebGL is unavailable in this browser — the isosurface cannot render.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!started ? (
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-md bg-violet-500/90 px-4 py-2.5 text-base font-medium text-foreground hover:bg-violet-400"
              >
                Start
              </button>
            ) : (
              <>
                <label className="min-h-[44px] cursor-pointer rounded-md border border-border px-4 py-2.5 text-base text-foreground hover:bg-accent">
                  Drop / pick file
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </label>
                <button
                  onClick={handleMic}
                  className="min-h-[44px] rounded-md border border-border px-4 py-2.5 text-base text-foreground hover:bg-accent"
                >
                  Use mic
                </button>
              </>
            )}
          </div>

          {started && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
                placeholder="track id (Welcome Home recording)"
                className="min-h-[44px] flex-1 rounded-md border border-border bg-black/40 px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTrack();
                }}
              />
              <button
                onClick={handleTrack}
                className="min-h-[44px] rounded-md border border-border px-4 py-2.5 text-base text-foreground hover:bg-accent"
              >
                Load
              </button>
            </div>
          )}

          <p className="mt-3 text-base text-violet-300/95">
            <span className="text-muted-foreground">source:</span> {mode}
            <span className="ml-3 text-muted-foreground">status:</span>{" "}
            <span className="text-foreground">{status}</span>
          </p>
          {error && <p className="mt-1 text-base text-violet-300">{error}</p>}
        </header>

        <footer className="pointer-events-auto flex items-end justify-between gap-4">
          <div className="rounded-md bg-black/40 px-3 py-2 font-mono text-sm text-foreground">
            <div className="text-violet-300/95">bands</div>
            <div>
              sub {fmt(readout.sub)} · bass {fmt(readout.bass)} · lowMid{" "}
              {fmt(readout.lowMid)}
            </div>
            <div>
              hiMid {fmt(readout.highMid)} · high {fmt(readout.high)} · rms{" "}
              {fmt(readout.rms)}
            </div>
            <div className="text-violet-300">centroid {fmt(readout.centroid)}</div>
          </div>
          <a
            href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/283-piano-isosurface/README.md"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground underline hover:text-foreground"
          >
            Read the design notes
          </a>
        </footer>
      </div>
    </div>
  );
}
