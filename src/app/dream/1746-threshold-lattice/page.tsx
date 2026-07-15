"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { VERT, FRAG } from "./shader";
import { ThresholdAudio } from "./audio";
import { PrototypeNav } from "../_shared/prototype-nav";

// ─────────────────────────────────────────────────────────────────────────────
// 1746-threshold-lattice
//   state: hypnagogic sleep-onset descent · pole: dream
//
// The stillness of your room is the interface. Keep the space quiet and still
// and you sink, over ~12–15 s, through a honeycomb phosphene form-constant
// lattice toward the threshold of dream imagery. Any sound throws you back up.
//
// Determinism: an integer frame counter drives every state, audio and visual
// decision; fixed-seed mulberry32 PRNGs supply all "randomness". No
// Math.random / Date.now / new Date / performance.now anywhere in those paths.
// ─────────────────────────────────────────────────────────────────────────────

const GOLDEN_ANGLE = 2.399963229728653; // rad — myoclonic-jerk direction stepping
const MIC_SCALE = 6.0; // room RMS is tiny; scale into a usable 0..1 loudness
const RISE_TAU = 13.0; // s — slow reward rise when the room stays quiet
const FALL_TAU = 0.4; // s — fast fall on any sound (asymmetric envelope)

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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [meter, setMeter] = useState({ still: 0, depth: 0 });

  const audioRef = useRef<ThresholdAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(false);

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
    setMeter({ still: 0, depth: 0 });
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = useCallback(async () => {
    if (running) return;
    const mount = mountRef.current;
    if (!mount) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // ── audio + mic share one AudioContext (mic → analyser only, never dest) ──
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
    const audio = new ThresholdAudio(ctx);
    audioRef.current = audio;
    audio.setMuted(mutedRef.current);
    audio.start();

    // mic — deterministic ghost runs if this fails or is denied
    let analyser: AnalyserNode | null = null;
    let timeBuf: Uint8Array<ArrayBuffer> | null = null;
    let micStream: MediaStream | null = null;
    let micOk = false;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const src = ctx.createMediaStreamSource(micStream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.3;
      timeBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      src.connect(analyser); // NOT connected to destination — no feedback loop
      micOk = true;
      setMicDenied(false);
    } catch {
      micOk = false;
      setMicDenied(true);
    }

    setRunning(true);

    // ── WebGL / three.js fullscreen quad ─────────────────────────────────────
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      renderer = null;
    }
    if (!renderer) {
      setWebglFailed(true);
      // still run audio + state so the piece is alive; just no visuals
    } else {
      setWebglFailed(false);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(new THREE.Color(0x05040a), 1);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
    }

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cam.position.z = 1;

    const uniforms = {
      uTime: { value: 0 },
      uDepth: { value: 0 },
      uStill: { value: 0 },
      uJerkAmp: { value: 0 },
      uJerkDir: { value: new THREE.Vector2(1, 0) },
      uAspect: { value: new THREE.Vector2(1, 1) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
    });
    const geo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geo, mat);
    scene.add(quad);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer?.setSize(w, h, false);
      if (w >= h) uniforms.uAspect.value.set(w / h, 1);
      else uniforms.uAspect.value.set(1, h / w);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── deterministic state (all integer-frame driven) ───────────────────────
    let frame = 0;
    let loudFast = 0; // smoothed room loudness
    let still = 0; // fast stillness channel (uStill)
    let depth = 0; // slow reward channel

    // myoclonic-jerk state machine
    const jerkPrng = makeMulberry32(0x2f6a1b3c);
    let jerkIndex = 0;
    let nextJerkFrame = 300; // first possible jerk ~5 s in
    let jerkStartFrame = -1;
    let jerkDirX = 1;
    let jerkDirY = 0;
    const jerkMag = reduced ? 0.05 : 0.13;
    const jerkTau = reduced ? 0.16 : 0.28;
    const jerkFreq = 3.2;

    // deterministic ghost (no-mic) scheduler
    const ghostPrng = makeMulberry32(0x77aa33cc);
    let ghostNextBurst = 480; // first synthetic "sound" ~8 s in
    let ghostBurstStart = -1;
    let ghostBurstDur = 0;

    const ghostLoudness = (f: number): number => {
      const t = f / 60;
      // faint breathing so depth gently undulates even between bursts
      const breath = 0.06 * (0.5 + 0.5 * Math.sin(t * 0.05 * Math.PI * 2));
      // scheduled disturbance bursts knock the sleeper back up
      if (f >= ghostNextBurst && ghostBurstStart < 0) {
        ghostBurstStart = f;
        ghostBurstDur = 60 + Math.round(ghostPrng() * 60); // 1–2 s
        const gapSec = 7 + ghostPrng() * 6; // 7–13 s of quiet after it
        ghostNextBurst = f + ghostBurstDur + Math.round(gapSec * 60);
      }
      let burst = 0;
      if (ghostBurstStart >= 0) {
        const k = (f - ghostBurstStart) / ghostBurstDur; // 0..1
        if (k >= 1) {
          ghostBurstStart = -1;
        } else {
          // quick attack, slower decay envelope, peaking near 0.9
          const env = Math.sin(Math.min(1, k) * Math.PI);
          burst = 0.9 * env;
        }
      }
      return Math.min(1, Math.max(breath, burst));
    };

    let hudAccum = 0;
    const loop = () => {
      const audioEng = audioRef.current;
      if (!audioEng) return;
      const f = frame++;
      const t = f / 60;
      const dt = 1 / 60;

      // 1. room loudness (mic RMS, or deterministic ghost)
      let loud: number;
      if (micOk && analyser && timeBuf) {
        analyser.getByteTimeDomainData(timeBuf);
        let sum = 0;
        for (let i = 0; i < timeBuf.length; i++) {
          const d = (timeBuf[i] - 128) / 128;
          sum += d * d;
        }
        const rms = Math.sqrt(sum / timeBuf.length);
        loud = Math.min(1, rms * MIC_SCALE);
      } else {
        loud = ghostLoudness(f);
      }

      // 2. fast stillness channel — legible cause→effect in < 5 s
      loudFast += (loud - loudFast) * 0.18;
      const stillTarget = clamp01(1 - loudFast);
      still += (stillTarget - still) * 0.2;

      // 3. slow reward channel — asymmetric: slow rise, fast fall
      const target = still;
      if (target > depth) depth += (target - depth) * (dt / RISE_TAU);
      else depth += (target - depth) * (dt / FALL_TAU);
      depth = clamp01(depth);

      // 4. myoclonic-jerk state machine (depth-modulated cadence)
      if (f >= nextJerkFrame && depth > 0.25) {
        jerkStartFrame = f;
        const a = GOLDEN_ANGLE * jerkIndex;
        jerkDirX = Math.cos(a);
        jerkDirY = Math.sin(a);
        jerkIndex += 1;
        audioEng.thud(depth);
        // deeper → jerks a little more often (near the threshold of sleep)
        const baseSec = 9 - depth * 5.5; // ~9 s shallow → ~3.5 s deep
        const jit = (jerkPrng() - 0.5) * 3.0;
        nextJerkFrame = f + Math.max(120, Math.round((baseSec + jit) * 60));
      }
      let jerkAmp = 0;
      if (jerkStartFrame >= 0) {
        const te = (f - jerkStartFrame) / 60;
        if (te > jerkTau * 6) jerkStartFrame = -1;
        else jerkAmp = jerkMag * Math.exp(-te / jerkTau) * Math.cos(2 * Math.PI * jerkFreq * te);
      }

      // 5. audio bed follows the descent
      audioEng.step(f, depth, still);

      // 6. uniforms
      uniforms.uTime.value = t;
      uniforms.uDepth.value = depth;
      uniforms.uStill.value = still;
      uniforms.uJerkAmp.value = jerkAmp;
      uniforms.uJerkDir.value.set(jerkDirX, jerkDirY);

      if (renderer) renderer.render(scene, cam);

      // 7. HUD (throttled ~10 Hz)
      hudAccum += 1;
      if (hudAccum >= 6) {
        hudAccum = 0;
        setMeter({ still, depth });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // ── teardown ─────────────────────────────────────────────────────────────
    teardownRef.current = () => {
      ro.disconnect();
      scene.remove(quad);
      geo.dispose();
      mat.dispose();
      micStream?.getTracks().forEach((tr) => tr.stop());
      void ctx.close();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === mount)
          mount.removeChild(renderer.domElement);
      }
      setWebglFailed(false);
      setMicDenied(false);
    };
  }, [running]);

  const depthPct = Math.round(meter.depth * 100);
  const stillPct = Math.round(meter.still * 100);
  const phase =
    meter.depth < 0.2
      ? "surface · eyes open"
      : meter.depth < 0.5
        ? "drifting · phosphenes forming"
        : meter.depth < 0.8
          ? "sinking · lattice tightening"
          : "threshold · fragmentary images";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            hypnagogic sleep-onset descent · dream
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Threshold Lattice</h1>
          <p className="text-base text-muted-foreground">
            The stillness of your room is the interface. Keep the space quiet and
            still and you sink through a honeycomb phosphene lattice toward the
            threshold of dream — any sound throws you back up.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {webglFailed && (
            <p className="text-base text-destructive">
              WebGL is unavailable — the visuals are off, but the descent and its
              audio are still running.
            </p>
          )}
          {micDenied && running && (
            <p className="text-base text-destructive">
              No microphone — running the autonomous ghost descent (a
              deterministic rise-and-fall) so you can still see and hear it.
            </p>
          )}

          {running && (
            <div className="max-w-sm space-y-2">
              {/* fast stillness meter — real-time room level, legible in seconds */}
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <span>stillness</span>
                  <span>{stillPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-md bg-accent">
                  <div
                    className="h-full rounded-md bg-primary transition-[width] duration-100"
                    style={{ width: `${stillPct}%` }}
                  />
                </div>
              </div>
              {/* slow depth reward */}
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <span>descent</span>
                  <span>{depthPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-md bg-accent">
                  <div
                    className="h-full rounded-md bg-primary/70 transition-[width] duration-300"
                    style={{ width: `${depthPct}%` }}
                  />
                </div>
              </div>
              <p className="text-base text-muted-foreground">{phase}</p>
            </div>
          )}

          <div className="pointer-events-auto flex items-center gap-3">
            {!running ? (
              <button
                onClick={start}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enter the descent
              </button>
            ) : (
              <>
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Rise
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
              Design notes
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
            <div className="space-y-3 text-base text-muted-foreground">
              <p>
                A hypnagogic sleep-onset descent where the <em>room itself</em> is
                the sensor. Ambient microphone RMS is mapped <em>inversely</em>:
                the quieter and stiller you keep the space, the deeper you sink.
              </p>
              <p>
                Two channels read the room. A fast <strong>stillness</strong>{" "}
                channel drives a center-sink glow and the live meter, so the
                cause→effect link is legible in seconds. A slow{" "}
                <strong>descent</strong> channel rises over ~12–15 s of quiet and
                falls fast on any sound — it drives the lattice density, warp,
                tint and vignette.
              </p>
              <p>
                The honeycomb is Klüver&apos;s lattice form-constant, drawn in
                cortical space and seen through the inverse log-polar (retina→V1)
                warp, so it streams inward as you sink. Peripheral spirals hint at
                the &quot;fragmentary half-images&quot; of hypnagogia near the
                threshold. A myoclonic-jerk (sleep-start) state machine fires a
                gentle damped spring-back lurch plus a soft thud at a
                depth-modulated cadence.
              </p>
              <p>
                References: Klüver&apos;s form constants (1926); Andreas Mavromatis,
                <em> Hypnagogia</em> (1987); the sleep-start / hypnic-jerk
                myoclonus literature; and MIT Media Lab&apos;s <em>Dormio</em> /
                Targeted Dream Incubation — which this piece inverts by making the
                room the sensor rather than a wearable.
              </p>
              <p>
                Safety: no strobe or flicker — slow luminance drift only, phosphene
                tint clamped ≤ 0.7, and <code>prefers-reduced-motion</code> softens
                and shortens the jerk.
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

      <PrototypeNav slugs={["1746-threshold-lattice"]} />
    </main>
  );
}
