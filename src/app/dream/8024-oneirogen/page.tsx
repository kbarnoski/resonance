"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 8024-oneirogen
//   state: reality-monitoring crossfade · perception ↔ hallucination
//   pole: dream · vibe: cosmic-ambient drift → the dream overtakes
//
// "What if you could FEEL the moment your perception flips into hallucination —
//  the point where the mind stops SEEING your sound and starts DREAMING it?"
//
// One hidden dial alpha ∈ [0,1] (the "oneirogen dial"):
//   • alpha low  → PERCEPTION (bottom-up): a THREE.Points field faithfully mirrors
//     your live mic spectrum; the audio you hear is a sonification of it.
//   • alpha high → HALLUCINATION (top-down): the field ignores live input and
//     regenerates autonomously from a learned running-statistics PRIOR (an EMA of
//     your last ~8 s); the audio is synthesized from that prior, not your sound.
//
// THE VERB — a tug-of-war, not a slider:
//   alpha drifts UPWARD on its own (the pull toward the dream). Feeding NOVEL sound
//   (fresh, changing, loud spectrum vs. the prior) pulls it back DOWN — holding
//   onto reality. But the pull-back is scaled by (1-alpha)^1.5, so past a threshold
//   the discriminator has failed and no sound you make can bring the field back.
//   A reality-monitoring meter (the C×G×D Discriminator) collapses toward 50% as
//   alpha → 1.
//
// Determinism: a seeded mulberry32(0x8024) PRNG builds the field and drives a silent
// "virtual voice" self-demo (whole arc reads in ~10 s with zero sensors). Time comes
// only from performance.now-free frame counting + AudioContext.currentTime. No
// Math.random / Date.now / new Date anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { VERT, FRAG } from "./shader";
import { OneirogenAudio } from "./audio";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/visionary/safeFlicker";

const PARTICLES = 16000;
const BAND_RANGES_HZ: ReadonlyArray<[number, number]> = [
  [20, 60],
  [60, 250],
  [250, 500],
  [500, 2000],
  [2000, 4000],
  [4000, 20000],
];

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

// Deterministic silent "virtual voice": returns per-band energy + amplitude for a
// given frame so the whole perception→drift→hallucination→pull-back arc reads with
// no mic and no audio. A ~12 s loop: busy/fresh (holds reality) → quiet (drifts up)
// → a fresh burst (a pull-back attempt) → quiet again.
function runVirtualVoice(frame: number, prng: () => number): {
  bands: number[];
  amp: number;
} {
  const vt = (frame % 720) / 60; // 0..12 s
  const bands = new Array(6).fill(0);
  let phase: "busy" | "quiet" | "burst";
  if (vt < 2.5) phase = "busy";
  else if (vt < 6.0) phase = "quiet";
  else if (vt < 7.5) phase = "burst";
  else phase = "quiet";

  for (let i = 0; i < 6; i++) {
    const sp = 1.3 + i * 0.7; // distinct per-band rates → real spectral flux
    const ph = i * 1.7;
    const wobble = 0.5 + 0.5 * Math.sin(vt * sp + ph);
    if (phase === "busy") {
      bands[i] = 0.25 + 0.55 * wobble; // rich, changing → novel → holds alpha low
    } else if (phase === "burst") {
      bands[i] = 0.35 + 0.5 * wobble; // fresh burst → a pull-back attempt
    } else {
      bands[i] = 0.04 + 0.05 * wobble; // near-silence → alpha drifts up
    }
  }
  // A touch of seeded jitter so the flux is not perfectly periodic.
  const j = (prng() - 0.5) * 0.06;
  const amp = clamp01(bands.reduce((s, b) => s + b, 0) / 6 + j);
  return { bands, amp };
}

function runBandsFromAnalyser(
  analyser: AnalyserNode,
  buf: Uint8Array,
  sampleRate: number,
): { bands: number[]; amp: number } {
  analyser.getByteFrequencyData(buf as unknown as Uint8Array<ArrayBuffer>);
  const binHz = sampleRate / analyser.fftSize;
  const bands = new Array(6).fill(0);
  let total = 0;
  for (let i = 0; i < BAND_RANGES_HZ.length; i++) {
    const [lo, hi] = BAND_RANGES_HZ[i];
    const loBin = Math.floor(lo / binHz);
    const hiBin = Math.min(buf.length, Math.ceil(hi / binHz));
    let sum = 0;
    let count = 0;
    for (let b = loBin; b < hiBin; b++) {
      sum += buf[b] / 255;
      count += 1;
    }
    const norm = count > 0 ? sum / count : 0;
    bands[i] = clamp01(norm * 1.4); // lift quiet rooms a little
    total += bands[i];
  }
  return { bands, amp: clamp01(total / 6) };
}

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [micDenied, setMicDenied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState({ alpha: 0, discrim: 1, novelty: 0 });

  // audio + mic
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<OneirogenAudio | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqBufRef = useRef<Uint8Array | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micActiveRef = useRef(false);

  // control flags read inside the loop
  const startedRef = useRef(false);
  const mutedRef = useRef(false);
  const surrenderRef = useRef(false);
  const pullBurstRef = useRef(0);

  const rafRef = useRef<number | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  // ── one-time setup: three.js field + the render/state loop (runs silently on
  //    load with the virtual voice; audio + mic are attached later on gesture) ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = prefersReducedMotion();
    const motion = reduced ? 0.45 : 1.0;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      renderer = null;
    }
    if (!renderer) {
      setWebglFailed(true);
      return;
    }
    setWebglFailed(false);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(new THREE.Color(0x05040a), 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 4.2);

    // ── build the point field deterministically ──────────────────────────────
    const prng = makeMulberry32(0x8024);
    const positions = new Float32Array(PARTICLES * 3);
    const seeds = new Float32Array(PARTICLES);
    const bandsAttr = new Float32Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      const u = prng() * 2 - 1;
      const theta = prng() * Math.PI * 2;
      const rad = 1.3 + prng() * 1.5;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      positions[i * 3] = s * Math.cos(theta) * rad;
      positions[i * 3 + 1] = u * rad;
      positions[i * 3 + 2] = s * Math.sin(theta) * rad;
      seeds[i] = prng();
      bandsAttr[i] = Math.floor(prng() * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute("aBand", new THREE.BufferAttribute(bandsAttr, 1));

    const uniforms = {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
      uAmpLive: { value: 0 },
      uAmpPrior: { value: 0 },
      uBandsLive: { value: new Array(6).fill(0) as number[] },
      uBandsPrior: { value: new Array(6).fill(0) as number[] },
      uPointScale: { value: 140 * dpr },
      uMotion: { value: motion },
      uLuma: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer?.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── state ────────────────────────────────────────────────────────────────
    const flicker = createSafeFlicker({ maxHz: 3, defaultHz: 0.5, floor: 0.62 });
    flicker.enable();
    const vvPrng = makeMulberry32(0x8024);

    let frame = 0;
    let alpha = 0;
    const liveSm = new Array(6).fill(0); // lightly smoothed live spectrum (perception)
    const priorFast = new Array(6).fill(0); // ~0.5 s memory (for novelty)
    const priorSlow = new Array(6).fill(0); // ~8 s memory (the generative prior)
    let ampSm = 0;
    let ampSlow = 0;
    let noveltySm = 0;
    let camAngle = 0;
    let hudAccum = 0;
    let atTopFrames = 0; // for the silent-demo auto-wake

    const loop = () => {
      const f = frame++;
      const t = f / 60;
      const dt = 1 / 60;

      // 1. raw input for this frame — live mic when active, else virtual voice
      let bandsRaw: number[];
      let ampRaw: number;
      if (micActiveRef.current && analyserRef.current && freqBufRef.current && ctxRef.current) {
        const r = runBandsFromAnalyser(
          analyserRef.current,
          freqBufRef.current,
          ctxRef.current.sampleRate,
        );
        bandsRaw = r.bands;
        ampRaw = r.amp;
      } else {
        const r = runVirtualVoice(f, vvPrng);
        bandsRaw = r.bands;
        ampRaw = r.amp;
      }

      // 2. update priors (the learned running statistics)
      let flux = 0;
      for (let i = 0; i < 6; i++) {
        priorFast[i] += (bandsRaw[i] - priorFast[i]) * 0.15;
        priorSlow[i] += (bandsRaw[i] - priorSlow[i]) * (dt / 8);
        liveSm[i] += (bandsRaw[i] - liveSm[i]) * 0.3;
        flux += Math.abs(bandsRaw[i] - priorFast[i]);
      }
      ampSm += (ampRaw - ampSm) * 0.3;
      ampSlow += (ampRaw - ampSlow) * (dt / 8);

      // 3. novelty — fresh, changing, loud input vs. the prior = "holding reality"
      const novelty = clamp01(flux * 1.6 + ampRaw * 0.25);
      noveltySm += (novelty - noveltySm) * 0.2;

      // manual "Pull back" injection behaves like a burst of novel sound
      let effNovelty = noveltySm;
      if (pullBurstRef.current > 0) {
        effNovelty = Math.max(effNovelty, pullBurstRef.current);
        pullBurstRef.current = Math.max(0, pullBurstRef.current - dt * 1.2);
      }

      // 4. the tug-of-war on alpha
      //    drift pulls UP; novelty pulls DOWN but its grip fails as alpha → 1.
      const driftTau = startedRef.current ? 22 : 7; // slower real arc, quick demo
      const driftUp = dt / driftTau;
      const pullDown = effNovelty * 1.8 * dt * Math.pow(1 - alpha, 1.5);
      alpha += driftUp - pullDown;
      if (surrenderRef.current) alpha += dt * 0.5; // "Surrender" lets go
      alpha = clamp01(alpha);

      // silent self-demo only: once fully dreaming, wake and replay the arc so
      // the whole concept keeps reading on a muted phone. Never auto-resets once
      // the player has started the real tug-of-war.
      if (!startedRef.current) {
        if (alpha > 0.985) atTopFrames++;
        else atTopFrames = 0;
        if (atTopFrames > 150) {
          alpha = 0.12;
          atTopFrames = 0;
        }
      }

      // 5. reality-monitoring — the Discriminator collapses toward 50%
      const discrim = 0.5 + 0.5 * Math.pow(1 - alpha, 1.5);

      // 6. drive the field
      const lum = flicker.value(t);
      flicker.setHz(0.25 + alpha * 1.4); // ≤ ~1.65 Hz, well under the safe ceiling
      const ub = uniforms.uBandsLive.value;
      const upr = uniforms.uBandsPrior.value;
      for (let i = 0; i < 6; i++) {
        ub[i] = liveSm[i];
        upr[i] = priorSlow[i];
      }
      uniforms.uTime.value = t;
      uniforms.uAlpha.value = alpha;
      uniforms.uAmpLive.value = ampSm;
      uniforms.uAmpPrior.value = ampSlow;
      uniforms.uLuma.value = lum;

      // 7. camera drifts more as the dream overtakes
      camAngle += dt * (0.04 + alpha * 0.14) * motion;
      const camR = 4.2 + alpha * 0.6 * Math.sin(t * 0.2);
      camera.position.set(
        Math.sin(camAngle) * camR,
        Math.sin(t * 0.11 * motion) * (0.4 + alpha * 0.6),
        Math.cos(camAngle) * camR,
      );
      camera.lookAt(0, 0, 0);

      // 8. audio (only present once the player has started)
      audioRef.current?.update(liveSm, priorSlow, alpha, ampSm);

      renderer?.render(scene, camera);

      // 9. HUD (~10 Hz)
      hudAccum += 1;
      if (hudAccum >= 6) {
        hudAccum = 0;
        setHud({ alpha, discrim, novelty: noveltySm });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    teardownRef.current = () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ro.disconnect();
      flicker.kill();
      scene.remove(points);
      geo.dispose();
      mat.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentElement === mount)
          mount.removeChild(renderer.domElement);
      }
    };

    return () => {
      teardownRef.current?.();
      teardownRef.current = null;
    };
  }, []);

  // ── audio + mic teardown (separate from the visual field) ──────────────────
  const stopAudio = useCallback(() => {
    audioRef.current?.stop();
    audioRef.current = null;
    micActiveRef.current = false;
    micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    micStreamRef.current = null;
    analyserRef.current = null;
    freqBufRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  // ── gesture: create the AudioContext, start the audio, try the mic ─────────
  const begin = useCallback(async () => {
    if (startedRef.current) return;

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
    ctxRef.current = ctx;
    const audio = new OneirogenAudio(ctx);
    audio.setMuted(mutedRef.current);
    audioRef.current = audio;

    // Try the mic. On denial/absence we keep the deterministic virtual voice, so
    // the tug-of-war still plays — just self-driven.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;
      freqBufRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      src.connect(analyser); // NOT connected to destination — no feedback loop
      micActiveRef.current = true;
      setMicDenied(false);
    } catch {
      micActiveRef.current = false;
      setMicDenied(true);
    }

    startedRef.current = true;
    setStarted(true);
  }, []);

  const surrender = useCallback(() => {
    surrenderRef.current = true;
    window.setTimeout(() => {
      surrenderRef.current = false;
    }, 1500);
  }, []);

  const pullBack = useCallback(() => {
    pullBurstRef.current = 1; // a manual jolt of "novel sound"
  }, []);

  const alphaPct = Math.round(hud.alpha * 100);
  const discrimPct = Math.round(hud.discrim * 100);
  const phase =
    hud.alpha < 0.25
      ? "perception · you are seeing your sound"
      : hud.alpha < 0.55
        ? "drifting · the pull toward the dream"
        : hud.alpha < 0.85
          ? "the discriminator is failing"
          : "hallucination · the field is dreaming you";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            reality-monitoring crossfade · dream
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Oneirogen
          </h1>
          <p className="text-base text-muted-foreground">
            Feel the moment perception flips into hallucination. Make fresh sound to
            hold the field to your voice — go quiet and it drifts into dreaming your
            sound-world back at you. Past a threshold, nothing you do can pull it
            back.
          </p>
        </header>

        <div className="flex flex-col gap-3">
          {webglFailed && (
            <p className="max-w-md text-base text-destructive">
              WebGL is unavailable, so the particle field can&apos;t render. This
              piece is the field — try a browser with WebGL enabled.
            </p>
          )}
          {micDenied && started && (
            <p className="max-w-md text-base text-destructive">
              No microphone — running the deterministic virtual voice, so the
              perception→dream tug-of-war still plays and sounds, just self-driven.
            </p>
          )}

          {!webglFailed && (
            <div className="max-w-sm space-y-2">
              {/* alpha: perception ↔ hallucination */}
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <span>perception → dream</span>
                  <span>{alphaPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-md bg-accent">
                  <div
                    className="h-full rounded-md bg-primary transition-[width] duration-100"
                    style={{ width: `${alphaPct}%` }}
                  />
                </div>
              </div>
              {/* discriminator / reality-monitoring */}
              <div className="space-y-1">
                <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  <span>reality monitor</span>
                  <span>{discrimPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-md bg-accent">
                  <div
                    className="h-full rounded-md bg-primary/60 transition-[width] duration-300"
                    style={{ width: `${discrimPct}%` }}
                  />
                </div>
              </div>
              <p className="text-base text-muted-foreground">{phase}</p>
            </div>
          )}

          <div className="pointer-events-auto flex flex-wrap items-center gap-3">
            {!started ? (
              <button
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enable mic &amp; enter
              </button>
            ) : (
              <>
                <button
                  onClick={pullBack}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Pull back
                </button>
                <button
                  onClick={surrender}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Surrender
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
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                A single 16k-point field is driven by one hidden dial,{" "}
                <em>alpha</em> ∈ [0,1] — the &quot;oneirogen dial.&quot; At low
                alpha the field is <strong>perception</strong>: it faithfully mirrors
                your live mic spectrum and the audio you hear is a sonification of
                it — what you hear is what you see. At high alpha it is{" "}
                <strong>hallucination</strong>: the field ignores new input and
                regenerates autonomously from a learned running-statistics{" "}
                <em>prior</em> (an EMA of your last ~8 s), swirling into a Klüver-ish
                spiral/cobweb form-constant; the audio too is synthesized from the
                prior, not your live sound.
              </p>
              <p>
                It is a <strong>tug-of-war</strong>, not a slider. Alpha drifts
                upward on its own (~22 s) — the pull toward the dream. Feeding{" "}
                <em>novel</em> sound (fresh, changing, loud spectrum vs. the prior)
                pulls it back down — holding onto reality. But the pull-back is
                scaled by (1−alpha)^1.5, so past a threshold the Discriminator has
                failed and nothing you do brings the field back. The reality-monitor
                meter is that Discriminator&apos;s confidence, collapsing toward 50%
                as alpha → 1.
              </p>
              <p>
                References: the eLife 2026 computational altered-states / oneirogen
                model (raising alpha shifts perception from bottom-up sensory
                inference to top-down generative replay); Frontiers in Psychology
                2026, <em>Beyond the reducing valve: computational
                neurophenomenology of altered states</em> — the C×G×D
                (Classifier / Generator / Discriminator) framework, where
                reality-monitoring is the Discriminator&apos;s job and the altered
                state is that Discriminator failing; and Klüver&apos;s form
                constants as an aesthetic nod.
              </p>
              <p>
                Safety: no strobe — a soft luminance drift capped ≤ ~1.65 Hz via the
                shared SafeFlicker engine, and <code>prefers-reduced-motion</code>{" "}
                slows the motion and drift. With no mic, a deterministic{" "}
                <code>mulberry32(0x8024)</code> virtual voice plays the whole arc.
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

      <PrototypeNav slugs={["8024-oneirogen"]} />
    </main>
  );
}
