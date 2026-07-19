"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadDepthModel,
  downsampleToGrid,
  applyCameraProxy,
  applyFeatures,
  type DepthPipe,
} from "./depth";
import { runGhostField } from "./ghost";
import { Well, type Locus } from "./memory";
import { startWellAudio, freqForDepth, type WellAudio } from "./audio";
import {
  createFrameBuilder,
  cellToWorld,
  panForWorldX,
  runWebGPUCloud,
  runCanvas2DCloud,
  type Camera,
  type CloudRenderer,
} from "./cloud";
import { README_TEXT } from "./readme-text";

/*
 * 1960 · DEPTH WELL
 *
 * A room that remembers where your body was. Monocular depth (Depth-Anything-V2
 * via Transformers.js / WebGPU) renders you as a live 3D point cloud; holding
 * still DEPOSITS a durable, glowing memory-node that keeps sounding a just-
 * intonation partial you can walk back to and swell. A synthetic "wandering
 * presence" drives the whole pipeline from frame one, so it is alive with no
 * camera and no model. Graceful ladder: model+camera → real depth cloud;
 * camera only → crude brightness/motion pseudo-depth; no WebGPU → Canvas2D.
 */

const GW = 52;
const GH = 38;
const MAX_GLOW = 40;
const MODEL_W = 256;
const MODEL_H = 192;

type Source = "ghost" | "proxy" | "live";
type SensorState = "idle" | "loading" | "denied" | "unavailable";

export default function DepthWellPage() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const gridRef = useRef<Float32Array>(new Float32Array(GW * GH));
  const prevGridRef = useRef<Float32Array>(new Float32Array(GW * GH));
  const prevLumRef = useRef<Float32Array>(new Float32Array(GW * GH));
  const wellRef = useRef<Well>(new Well(panForWorldX));
  const audioRef = useRef<WellAudio | null>(null);
  const rendererRef = useRef<CloudRenderer | null>(null);
  const builderRef = useRef(createFrameBuilder(GW, GH, MAX_GLOW));
  const camRef = useRef<Camera>({ yaw: 0, pitch: 0.14, dist: 3.0, focal: 1.7 });

  const streamRef = useRef<MediaStream | null>(null);
  const depthPipeRef = useRef<DepthPipe | null>(null);
  const sourceRef = useRef<Source>("ghost");
  const procSmallRef = useRef<HTMLCanvasElement | null>(null);
  const procModelRef = useRef<HTMLCanvasElement | null>(null);

  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const lastInferRef = useRef<number>(0);
  const inferBusyRef = useRef<boolean>(false);
  const locusRef = useRef<Locus>({ x: 0, y: 0, z: 0, band: 0.5, level: 0 });

  const [started, setStarted] = useState(false);
  const [sensor, setSensor] = useState<SensorState>("idle");
  const [source, setSource] = useState<Source>("ghost");
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [nodeCount, setNodeCount] = useState(0);

  // ── live monocular depth inference (throttled ~6 fps) ──
  const runInference = useCallback((t: number) => {
    const pipe = depthPipeRef.current;
    const video = videoRef.current;
    const proc = procModelRef.current;
    if (!pipe || !video || !proc || inferBusyRef.current) return;
    if (t - lastInferRef.current < 0.16) return;
    if (video.readyState < 2 || video.videoWidth === 0) return;
    lastInferRef.current = t;
    inferBusyRef.current = true;
    const pctx = proc.getContext("2d", { willReadFrequently: true });
    if (!pctx) {
      inferBusyRef.current = false;
      return;
    }
    pctx.drawImage(video, 0, 0, MODEL_W, MODEL_H);
    (async () => {
      try {
        const bmp = await createImageBitmap(proc);
        const out = (await pipe(bmp)) as {
          depth?: { data?: Uint8Array | Float32Array; width: number; height: number };
        };
        bmp.close?.();
        const dmap = out?.depth;
        if (dmap?.data) {
          const isU8 = dmap.data instanceof Uint8Array;
          downsampleToGrid(
            dmap.data,
            dmap.width,
            dmap.height,
            gridRef.current,
            GW,
            GH,
            isU8,
          );
        }
      } catch {
        /* keep last grid on a single-frame failure */
      } finally {
        inferBusyRef.current = false;
      }
    })();
  }, []);

  const runProxy = useCallback(() => {
    const video = videoRef.current;
    const proc = procSmallRef.current;
    if (!video || !proc || video.readyState < 2 || video.videoWidth === 0) return;
    const pctx = proc.getContext("2d", { willReadFrequently: true });
    if (!pctx) return;
    pctx.drawImage(video, 0, 0, GW, GH);
    const img = pctx.getImageData(0, 0, GW, GH);
    applyCameraProxy(img.data, gridRef.current, prevLumRef.current, GW, GH);
  }, []);

  // ── the render + memory loop (runs from mount, silent until audio starts) ──
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const videoEl = videoRef.current;
    if (!wrap || !canvas) return;

    procSmallRef.current = document.createElement("canvas");
    procSmallRef.current.width = GW;
    procSmallRef.current.height = GH;
    procModelRef.current = document.createElement("canvas");
    procModelRef.current.width = MODEL_W;
    procModelRef.current.height = MODEL_H;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(wrap.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(wrap.clientHeight * dpr));
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);

    let disposed = false;
    let lastReadout = 0;

    const frame = (now: number) => {
      if (disposed) return;
      if (!startRef.current) startRef.current = now;
      const t = (now - startRef.current) / 1000;
      const dt = lastFrameRef.current
        ? Math.min(0.05, (now - lastFrameRef.current) / 1000)
        : 0.016;
      lastFrameRef.current = now;

      // 1. fill the depth grid from the active source
      const src = sourceRef.current;
      if (src === "live" && depthPipeRef.current) {
        runInference(t);
      } else if (src === "proxy") {
        runProxy();
      } else {
        runGhostField(gridRef.current, GW, GH, t);
      }

      // 2. features → live present locus (world space)
      const f = applyFeatures(gridRef.current, prevGridRef.current, GW, GH);
      prevGridRef.current.set(gridRef.current);
      const [lx, ly, lz] = cellToWorld(f.centroidX, f.centroidY, f.meanDepth);
      const locus = locusRef.current;
      locus.x = lx;
      locus.y = ly;
      locus.z = lz;
      // the meaningful near-region depth sits in ~[0.5,1]; expand it across the
      // whole two-octave scale so the deposited chord spans low → high.
      locus.band = Math.max(0, Math.min(1, (f.meanDepth - 0.5) / 0.5));
      locus.level = f.nearEnergy;

      // 3. spatial memory model
      const well = wellRef.current;
      const events = well.update(locus, dt, t);

      // 4. audio (only once the user has started it)
      const audio = audioRef.current;
      if (audio) {
        for (const e of events) {
          if (e.type === "add") audio.ensureNode(e.node.id, e.node.freq, e.node.pan);
          else if (e.type === "pluck") audio.pluckNode(e.node.id);
          else audio.removeNode(e.id);
        }
        for (const n of well.nodes) audio.updateNode(n.id, n.swell);
        const pf = freqForDepth(locus.band);
        audio.updatePresent(pf.freq, panForWorldX(locus.x), locus.level);
      }

      // 5. slow auto-orbit of the volume
      const cam = camRef.current;
      cam.yaw = 0.55 * Math.sin(t * 0.05);
      cam.pitch = 0.14 + 0.06 * Math.sin(t * 0.037);

      // 6. render
      const aspect = canvas.width / Math.max(1, canvas.height);
      const out = builderRef.current.build({
        grid: gridRef.current,
        gw: GW,
        gh: GH,
        nodes: well.nodes,
        locus,
        dwellProgress: well.dwellProgress,
        cam,
        aspect,
        t,
      });
      rendererRef.current?.render(out, aspect);

      if (t - lastReadout > 0.25) {
        lastReadout = t;
        setNodeCount(well.nodes.length);
      }

      rafRef.current = requestAnimationFrame(frame);
    };

    (async () => {
      let renderer: CloudRenderer | null = null;
      try {
        renderer = await runWebGPUCloud(canvas, GW * GH + MAX_GLOW);
      } catch {
        renderer = null;
      }
      if (disposed) {
        renderer?.dispose();
        return;
      }
      if (!renderer) renderer = runCanvas2DCloud(canvas);
      rendererRef.current = renderer;
      rafRef.current = requestAnimationFrame(frame);
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      audioRef.current?.stop();
      audioRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      const pipe = depthPipeRef.current as unknown as { dispose?: () => void } | null;
      try {
        pipe?.dispose?.();
      } catch {
        /* ignore */
      }
      depthPipeRef.current = null;
      if (videoEl) videoEl.srcObject = null;
    };
  }, [runInference, runProxy]);

  // ── begin (user gesture → AudioContext) ──
  const begin = useCallback(async () => {
    if (audioRef.current) return;
    try {
      const audio = await startWellAudio();
      // give voices to any memories the ghost already deposited
      for (const n of wellRef.current.nodes) audio.ensureNode(n.id, n.freq, n.pan);
      audioRef.current = audio;
      setStarted(true);
    } catch {
      setNotice("Audio could not start in this browser. Try tapping again or reloading.");
    }
  }, []);

  // ── go live: camera + depth model (fully degradable) ──
  const enableCamera = useCallback(async () => {
    if (sensor === "loading" || sourceRef.current !== "ghost") return;
    const video = videoRef.current;
    if (!video) return;
    setNotice(null);
    setSensor("loading");
    let gotCamera = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      gotCamera = true;
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setSensor("denied");
        setNotice("Camera denied — the wandering presence keeps composing. Allow the camera to author with your own body.");
      } else {
        setSensor("unavailable");
        setNotice("Camera unavailable here — the wandering presence keeps composing on its own.");
      }
      return;
    }
    if (!gotCamera) return;

    // live crude depth immediately; upgrade to the real model when it loads
    sourceRef.current = "proxy";
    setSource("proxy");
    setSensor("idle");
    try {
      const pipe = await loadDepthModel();
      depthPipeRef.current = pipe;
      sourceRef.current = "live";
      setSource("live");
    } catch {
      depthPipeRef.current = null;
      setNotice("Depth model / WebGPU unavailable — playing a crude brightness-and-motion depth proxy instead.");
    }
  }, [sensor]);

  const sourceLabel =
    source === "live" ? "live depth" : source === "proxy" ? "camera proxy" : "wandering presence";

  return (
    <div ref={wrapRef} className="relative h-dvh w-full overflow-hidden bg-[#04060f] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 block" />
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* header */}
      <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Depth Well</h1>
        <p className="mt-1 text-base text-muted-foreground">
          A room that remembers where your body was — dwell in a spot and it keeps sounding a tuned tone you can walk back to.
        </p>
      </div>

      {/* readout badge */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 text-right">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {sourceLabel}
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {nodeCount} memories
        </p>
      </div>

      {/* controls */}
      <div className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-3 px-4">
        {notice && (
          <p className="max-w-md text-center text-base text-destructive">{notice}</p>
        )}

        {!started ? (
          <button
            onClick={begin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tap to begin
          </button>
        ) : sourceRef.current === "ghost" ? (
          <button
            onClick={enableCamera}
            disabled={sensor === "loading"}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
          >
            {sensor === "loading" ? "Waking the camera…" : "Author with your own body (camera)"}
          </button>
        ) : (
          <p className="text-base text-muted-foreground">
            Hold still to deposit a memory · move back through one to swell it.
          </p>
        )}

        <button
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] px-4 text-sm text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[82dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Design notes
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Depth Well</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {README_TEXT.split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
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
    </div>
  );
}
