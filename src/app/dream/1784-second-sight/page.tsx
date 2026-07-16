"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { VERT, FRAG_GROWTH, FRAG_DISPLAY } from "./shader";
import { SecondSightAudio } from "./audio";
import { Seer, SEER_RES } from "./seer";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 1784-second-sight  (HYBRID approach — a real, lightweight ML "seer")
//   state: predictive-processing reducing valve · pole: hallucination
//
// A real tfjs conv "seer" actually LOOKS at the live camera and segments it into
// coarse salience / edges / warm-skin fields. That machine perception then
// CONDITIONS a GPU hallucination-growth pipeline: eyes, faces and paisley
// form-constants literally grow out of the places the machine found meaningful,
// while the veridical world dissolves as the "dose" (reducing valve) opens.
//
// Determinism: an integer frame counter drives dose, audio and the procedural
// self-demo scene; a fixed-seed mulberry32 supplies the demo silhouettes. No
// Math.random / Date.now / performance.now anywhere in the render/audio path.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = 256; // offscreen source canvas resolution (square)
const GN = 5; // salience grid for audio wake-events (GN × GN cells)
const DOSE_FRAMES = 55 * 60; // ~55 s ramp to full breakthrough
const SEER_EVERY = 5; // run the ML seer every N frames (~12 Hz)
const WAKE_TH = 0.5;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Deterministic self-demo "scene" — a dim, drifting proto-face + warm blobs, so
// the seer has real structure to find and the piece self-demos with no camera.
function drawScene(g: CanvasRenderingContext2D, frame: number): void {
  const W = SRC;
  const H = SRC;
  const t = frame / 60;

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b0a14");
  bg.addColorStop(0.6, "#141019");
  bg.addColorStop(1, "#1c1418");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // warm drifting light blobs
  for (let i = 0; i < 3; i++) {
    const cx = W * (0.5 + 0.28 * Math.sin(t * 0.11 + i * 2.1));
    const cy = H * (0.45 + 0.22 * Math.cos(t * 0.09 + i * 1.3));
    const r = W * (0.16 + 0.05 * Math.sin(t * 0.2 + i));
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    rg.addColorStop(0, "rgba(150,96,84,0.55)");
    rg.addColorStop(1, "rgba(150,96,84,0)");
    g.fillStyle = rg;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }

  // a soft proto-face — warm skin oval with darker eyes + brow + mouth
  const fx = W * (0.5 + 0.14 * Math.sin(t * 0.07));
  const fy = H * (0.46 + 0.07 * Math.cos(t * 0.05));
  const rx = W * 0.17;
  const ry = H * 0.23;
  const fg = g.createRadialGradient(fx, fy - ry * 0.1, rx * 0.2, fx, fy, ry);
  fg.addColorStop(0, "rgba(186,132,112,0.92)");
  fg.addColorStop(0.7, "rgba(150,100,86,0.72)");
  fg.addColorStop(1, "rgba(120,78,70,0)");
  g.fillStyle = fg;
  g.beginPath();
  g.ellipse(fx, fy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();

  g.fillStyle = "rgba(30,20,24,0.85)";
  const ew = rx * 0.26;
  const eh = ry * 0.14;
  const eyY = fy - ry * 0.12;
  for (const sgn of [-1, 1]) {
    g.beginPath();
    g.ellipse(fx + sgn * rx * 0.42, eyY, ew, eh, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(40,26,30,0.6)";
  g.lineWidth = ry * 0.05;
  g.beginPath();
  g.moveTo(fx - rx * 0.6, fy + ry * 0.42);
  g.quadraticCurveTo(fx, fy + ry * 0.58, fx + rx * 0.6, fy + ry * 0.42);
  g.stroke();
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [source, setSource] = useState<"scene" | "camera">("scene");
  const [seerOn, setSeerOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [meter, setMeter] = useState({ dose: 0, density: 0 });

  const audioRef = useRef<SecondSightAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(false);
  const doseStartRef = useRef(0);
  const frameRef = useRef(0);
  const audioOnlyFrame = useRef(0);
  const seerOnRef = useRef(false);

  useEffect(() => {
    seerOnRef.current = seerOn;
  }, [seerOn]);

  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    teardownRef.current?.();
    teardownRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    setRunning(false);
    setSource("scene");
    setSeerOn(false);
    setMeter({ dose: 0, density: 0 });
  }, []);

  useEffect(() => () => stop(), [stop]);

  // Opt into the live camera (user-facing). Falls back silently to the scene.
  const enableCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      setCameraError(null);
      setSource("camera");
    } catch {
      setCameraError(
        "Camera unavailable or denied — the deterministic self-demo scene keeps the machine seeing.",
      );
      setSource("scene");
    }
  }, []);

  const start = useCallback(async () => {
    if (running) return;
    const mount = mountRef.current;
    if (!mount) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // ── audio ─────────────────────────────────────────────────────────────────
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
    const audio = new SecondSightAudio(ctx);
    audioRef.current = audio;
    audio.setMuted(mutedRef.current);
    audio.start();

    doseStartRef.current = 0;
    setRunning(true);

    // ── offscreen source canvas (feeds BOTH the seer and the GL) ───────────────
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = SRC;
    srcCanvas.height = SRC;
    const g2d = srcCanvas.getContext("2d", { willReadFrequently: true });

    // ── WebGL / three.js ───────────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    } catch {
      renderer = null;
    }
    if (!renderer) {
      setWebglFailed(true);
      // keep audio + state alive even with no visuals
      const audioOnly = () => {
        const eng = audioRef.current;
        if (!eng) return;
        audioOnlyFrame.current += 1;
        const f = audioOnlyFrame.current;
        const dose = clamp01((f / DOSE_FRAMES) * 0.94);
        eng.step(dose, 0.3);
        rafRef.current = requestAnimationFrame(audioOnly);
      };
      rafRef.current = requestAnimationFrame(audioOnly);
      teardownRef.current = () => {
        void ctx.close();
      };
      return;
    }
    setWebglFailed(false);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // source texture (canvas) + salience texture (ML seer output)
    const srcTex = new THREE.CanvasTexture(srcCanvas);
    srcTex.minFilter = THREE.LinearFilter;
    srcTex.magFilter = THREE.LinearFilter;
    srcTex.wrapS = THREE.ClampToEdgeWrapping;
    srcTex.wrapT = THREE.ClampToEdgeWrapping;

    const salBuf = new Uint8Array(SEER_RES * SEER_RES * 4);
    const salTex = new THREE.DataTexture(
      salBuf,
      SEER_RES,
      SEER_RES,
      THREE.RGBAFormat,
    );
    salTex.minFilter = THREE.LinearFilter;
    salTex.magFilter = THREE.LinearFilter;
    salTex.needsUpdate = true;

    const shared = {
      uSource: { value: srcTex as THREE.Texture },
      uSalience: { value: salTex as THREE.Texture },
      uSeerActive: { value: 0 },
      uDose: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: new THREE.Vector2(1, 1) },
      uReduced: { value: reduced ? 1 : 0 },
    };

    const growthMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG_GROWTH,
      uniforms: { ...shared, uPrev: { value: null as THREE.Texture | null } },
    });
    const displayMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG_DISPLAY,
      uniforms: { ...shared, uState: { value: null as THREE.Texture | null } },
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geo, growthMat);
    scene.add(quad);

    // ── ping-pong feedback targets ─────────────────────────────────────────────
    const rtOpts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    let rtA: THREE.WebGLRenderTarget;
    let rtB: THREE.WebGLRenderTarget;
    const makeTargets = () => {
      const w = Math.max(2, Math.floor((mount.clientWidth || 1) * 0.85));
      const h = Math.max(2, Math.floor((mount.clientHeight || 1) * 0.85));
      rtA?.dispose();
      rtB?.dispose();
      rtA = new THREE.WebGLRenderTarget(w, h, rtOpts);
      rtB = new THREE.WebGLRenderTarget(w, h, rtOpts);
      renderer!.setRenderTarget(rtA);
      renderer!.setClearColor(0x000000, 1);
      renderer!.clear();
      renderer!.setRenderTarget(rtB);
      renderer!.clear();
      renderer!.setRenderTarget(null);
    };

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer!.setSize(w, h, false);
      if (w >= h) shared.uAspect.value.set(w / h, 1);
      else shared.uAspect.value.set(1, h / w);
      makeTargets();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let read = rtA!;
    let write = rtB!;

    // ── ML seer (async init; falls back to shader salience on any failure) ─────
    const seer = new Seer();
    let seerReady = false;
    void seer.init().then((ok) => {
      seerReady = ok;
      setSeerOn(ok);
    });

    // ── deterministic state ────────────────────────────────────────────────────
    let frame = 0;
    const grid = new Float32Array(GN * GN);
    const prevGrid = new Float32Array(GN * GN);
    let densitySmooth = 0;
    let hudAccum = 0;

    // read latest source imageData once per seer tick (for the no-seer audio path)
    const runAudioSalience = (seerMap: Uint8Array | null) => {
      grid.fill(0);
      if (seerMap) {
        const cellPx = SEER_RES / GN;
        for (let gy = 0; gy < GN; gy++) {
          for (let gx = 0; gx < GN; gx++) {
            let sum = 0;
            let n = 0;
            const x0 = Math.floor(gx * cellPx);
            const x1 = Math.floor((gx + 1) * cellPx);
            const y0 = Math.floor(gy * cellPx);
            const y1 = Math.floor((gy + 1) * cellPx);
            for (let y = y0; y < y1; y++) {
              for (let x = x0; x < x1; x++) {
                sum += seerMap[(y * SEER_RES + x) * 4] / 255;
                n++;
              }
            }
            grid[gy * GN + gx] = n > 0 ? sum / n : 0;
          }
        }
      } else if (g2d) {
        // luminance-contrast salience proxy from the source canvas
        const img = g2d.getImageData(0, 0, SRC, SRC).data;
        const cellPx = SRC / GN;
        for (let gy = 0; gy < GN; gy++) {
          for (let gx = 0; gx < GN; gx++) {
            let mn = 1;
            let mx = 0;
            const x0 = Math.floor(gx * cellPx);
            const x1 = Math.floor((gx + 1) * cellPx);
            const y0 = Math.floor(gy * cellPx);
            const y1 = Math.floor((gy + 1) * cellPx);
            for (let y = y0; y < y1; y += 3) {
              for (let x = x0; x < x1; x += 3) {
                const i = (y * SRC + x) * 4;
                const l =
                  (0.299 * img[i] + 0.587 * img[i + 1] + 0.114 * img[i + 2]) /
                  255;
                if (l < mn) mn = l;
                if (l > mx) mx = l;
              }
            }
            grid[gy * GN + gx] = clamp01((mx - mn) * 1.4);
          }
        }
      }
    };

    const loop = () => {
      const eng = audioRef.current;
      if (!eng) return;
      const f = frame++;
      frameRef.current = f;
      const t = f / 60;

      // 1. draw the source frame (camera cover, or deterministic scene)
      const video = videoRef.current;
      const camLive =
        video && video.srcObject && video.readyState >= 2 ? video : null;
      if (g2d) {
        if (camLive) {
          // cover-fit + mirror so it reads like a reflection
          const vw = camLive.videoWidth || 640;
          const vh = camLive.videoHeight || 480;
          const scale = Math.max(SRC / vw, SRC / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          g2d.save();
          g2d.translate(SRC, 0);
          g2d.scale(-1, 1);
          g2d.drawImage(camLive, (SRC - dw) / 2, (SRC - dh) / 2, dw, dh);
          g2d.restore();
        } else {
          drawScene(g2d, f);
        }
      }
      srcTex.needsUpdate = true;

      // 2. throttled ML seer → salience texture + audio grid
      if (f % SEER_EVERY === 0) {
        let seerMap: Uint8Array | null = null;
        if (seerReady) {
          seerMap = seer.run(srcCanvas);
          if (seerMap) {
            salBuf.set(seerMap);
            salTex.needsUpdate = true;
            shared.uSeerActive.value = 1;
          } else {
            shared.uSeerActive.value = 0;
            if (seerOnRef.current) setSeerOn(false);
          }
        } else {
          shared.uSeerActive.value = 0;
        }
        runAudioSalience(seerMap);

        // density + wake-event detection (deterministic in self-demo)
        let sum = 0;
        let wakes = 0;
        for (let i = 0; i < grid.length; i++) {
          sum += grid[i];
          if (grid[i] > WAKE_TH && prevGrid[i] <= WAKE_TH && wakes < 2) {
            const doseNow = clamp01(
              ((f - doseStartRef.current) / DOSE_FRAMES) * 0.94,
            );
            eng.wake(grid[i], doseNow);
            wakes++;
          }
          prevGrid[i] = grid[i];
        }
        densitySmooth = sum / grid.length;
      }

      // 3. dose ramp (frame-based, slow) + gentle ≤0.02 Hz breathing near top
      const df = f - doseStartRef.current;
      const ramp = clamp01(df / DOSE_FRAMES);
      const dose = clamp01(
        ramp * 0.94 + 0.05 * ramp * Math.sin(2 * Math.PI * 0.02 * t),
      );

      // 4. audio follows dose + salience density
      eng.step(dose, densitySmooth);

      // 5. uniforms
      shared.uTime.value = t;
      shared.uDose.value = dose;

      // 6. render: growth (ping-pong) then display to screen
      growthMat.uniforms.uPrev.value = read.texture;
      quad.material = growthMat;
      renderer!.setRenderTarget(write);
      renderer!.render(scene, cam);
      renderer!.setRenderTarget(null);

      displayMat.uniforms.uState.value = write.texture;
      quad.material = displayMat;
      renderer!.render(scene, cam);

      const tmp = read;
      read = write;
      write = tmp;

      // 7. HUD (~8 Hz)
      hudAccum += 1;
      if (hudAccum >= 8) {
        hudAccum = 0;
        setMeter({ dose, density: densitySmooth });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── teardown ────────────────────────────────────────────────────────────────
    teardownRef.current = () => {
      ro.disconnect();
      seer.dispose();
      scene.remove(quad);
      geo.dispose();
      growthMat.dispose();
      displayMat.dispose();
      srcTex.dispose();
      salTex.dispose();
      rtA?.dispose();
      rtB?.dispose();
      const v = videoRef.current;
      const s = v?.srcObject as MediaStream | null;
      s?.getTracks().forEach((tr) => tr.stop());
      if (v) v.srcObject = null;
      void ctx.close();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === mount)
          mount.removeChild(renderer.domElement);
      }
      setWebglFailed(false);
    };
  }, [running]);

  const dosePct = Math.round(meter.dose * 100);
  const densityPct = Math.round(meter.density * 100);
  const phase =
    meter.dose < 0.15
      ? "valve open · veridical world"
      : meter.dose < 0.45
        ? "priors stirring · edges breathing"
        : meter.dose < 0.75
          ? "over-writing · eyes & paisley blooming"
          : "breakthrough · world dissolved into structure";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />
      <video ref={videoRef} className="hidden" playsInline muted autoPlay />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            predictive-processing reducing valve · hallucination
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Second Sight</h1>
          <p className="text-base text-muted-foreground">
            A real neural net looks at the world and finds its salient
            structure; that machine perception then decides where hallucinated
            eyes, faces and paisley grow as the &quot;dose&quot; over-writes
            reality.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {webglFailed && (
            <p className="text-base text-destructive">
              WebGL is unavailable — the visuals are off, but the dose and its
              audio bed are still running.
            </p>
          )}
          {cameraError && (
            <p className="text-base text-destructive">{cameraError}</p>
          )}

          {running && (
            <div className="max-w-sm space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <span>dose</span>
                  <span>{dosePct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-md bg-accent">
                  <div
                    className="h-full rounded-md bg-primary transition-[width] duration-200"
                    style={{ width: `${dosePct}%` }}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <span>salience density</span>
                  <span>{densityPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-md bg-accent">
                  <div
                    className="h-full rounded-md bg-primary/70 transition-[width] duration-200"
                    style={{ width: `${densityPct}%` }}
                  />
                </div>
              </div>
              <p className="text-base text-muted-foreground">{phase}</p>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                seer: {seerOn ? "tfjs conv net · live" : "shader salience · fallback"}
                {" · "}
                {source === "camera" ? "camera" : "self-demo scene"}
              </p>
            </div>
          )}

          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {!running ? (
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open the valve
              </button>
            ) : (
              <>
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Close the valve
                </button>
                {source !== "camera" && (
                  <button
                    onClick={enableCamera}
                    className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Start camera
                  </button>
                )}
                <button
                  onClick={() => {
                    doseStartRef.current = frameRef.current;
                  }}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Surface
                </button>
                <button
                  onClick={() => setMuted((v) => !v)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
              </>
            )}
            <button
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>
      </div>

      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg space-y-4 rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The predictive brain runs on strong generative priors and only
                lets a trickle of veridical signal through a &quot;reducing
                valve&quot; (Huxley; Carhart-Harris &amp; Friston&apos;s REBUS).
                Open the valve — raise the dose — and the priors progressively
                over-write reality until the world dissolves into eyes, faces and
                paisley form-constants.
              </p>
              <p>
                This is the engineered middle path. A genuinely{" "}
                <em>lightweight neural net</em> (TensorFlow.js, WebGL backend)
                actually looks at each frame: a small fixed-seed convolutional
                stack plus classic early-vision channels — center-surround
                contrast, oriented Sobel edges, and a warm-skin chroma proxy —
                produce a coarse salience map. That machine perception then{" "}
                <em>conditions</em> a GPU hallucination-growth pass, so the bloom
                follows real semantic salience rather than raw contrast.
              </p>
              <p>
                The growth is a ping-pong feedback field (decay &lt; 1, so
                nothing runs away): each frame advects and decays the previous
                state and adds motif emission where the seer found structure, so
                eyes and paisley literally grow over seconds. Display adds
                chromatic aberration, a cheap bloom and a slow (≤0.05 Hz)
                luminance drift.
              </p>
              <p>
                Sight and sound share one dose and one salience field. The audio
                bed slides from a calm near-sine room-tone into a detuned
                inharmonic shimmer; salience density opens a brightness filter;
                and each region that &quot;wakes up&quot; strikes a short
                iridescent tone.
              </p>
              <p>
                References: Suzuki, Roseboom, Schwartzman &amp; Seth,{" "}
                <em>
                  A Deep-Dream Virtual Reality Platform for Studying Altered
                  Perceptual Phenomenology
                </em>{" "}
                (the Hallucination Machine), Scientific Reports 2017; and{" "}
                <em>
                  Beyond the reducing valve: towards a computational
                  neurophenomenology of altered states via deep neural networks
                </em>{" "}
                (Frontiers in Psychology, 2026); REBUS (Carhart-Harris &amp;
                Friston).
              </p>
              <p>
                Safety: no strobe or full-screen flash — feedback decays,
                brightness is tone-mapped and clamped, and any pulsing is slow
                luminance drift only. <code>prefers-reduced-motion</code> softens
                the warp, trails and drift.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1784-second-sight"]} />
    </main>
  );
}
