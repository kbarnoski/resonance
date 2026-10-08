"use client";

/**
 * ParticleLeadLayer — the GPU particle LANGUAGE in a journey (opt-in per
 * journey: src/lib/journeys/particle-lead.ts; renders nothing — and costs
 * nothing — for every journey that isn't cast).
 *
 * CONDUCTED, not always-on (Karel 2026-10-05): presence follows the cast's
 * windows from the v2 deep analysis (particle-casting.ts `presenceAt`) —
 * chosen section-change transitions, builds, the summit, the coda — and
 * rests otherwise (the engine is paused while absent). During a BREAK a
 * black veil fades imagery + shaders out and only the particles play.
 *
 * Compositing: veils (black, z 3) then a transparent premultiplied WebGL2
 * canvas (z 3, NORMAL compositing — a full-screen plus-lighter blend group
 * cost Ghost ~7 ms p95) — above imagery (z 2), overlay clones and shaders (z ≤1),
 * below post-processing (z 3, later in the DOM). Both ride CSS opacity with
 * long transitions — never a cut. Opacity follows presence only (not the
 * shader opacity), with a radial contrast veil under the form.
 *
 * Audio: the SAME analyser node the shader stack reads (JourneyCompositor
 * prop), kinetic band split. Colour: luma-preserving hue/sat from the
 * harmony per section (+ a drift on swells). Playfulness (cast) gates
 * scatter-and-regroup on runs of fast notes, bouncing on a steady pulse and a
 * melody follower — serene pieces stay calm. Motion scales with tempo/feel.
 *
 * Image dissolve ↔ reform: once per conducted transition window, on the first
 * still change inside it — never within MORPH_GUARD_SEC of a phase change
 * (travel morphs) or during the journey handoff. Breaks honour the same guard.
 *
 * Perf (device tier): high 262k @ DPR ≤1.5 · medium 131k @ DPR ≤1.25 ·
 * low 65k @ DPR 1, no trails · mastered: half the count, DPR ≤1.25. While it leads, the caller strips the
 * dual/tertiary shaders (withParticleLeadSupports) — one supporting shader.
 *
 * Probe: window.__resonanceParticleLead.
 */
import { useEffect, useRef, useState } from "react";
import type { AnalyserLike } from "@/lib/audio/audio-engine";
import { useAudioStore } from "@/lib/audio/audio-store";
import { getDeviceTier } from "@/lib/audio/device-tier";
import { isVideoActive, inBoundarySettle, onClipEnded, onClipStarted } from "@/lib/journeys/video-activity";
import { setParticlePresent } from "@/lib/journeys/particle-presence";
import { glitchRecord } from "@/lib/journeys/glitch-recorder";
import { keyedFlashAngel } from "./flash-angel";
import { FIELD_FORMS, SPECTRUM_FORMS, isCenteredShader, PARTICLE_LIKE_SHADERS } from "@/lib/journeys/particle-motifs";
import type { ParticleEngine } from "@/lib/particles/particle-engine";
import { acquireSharedParticleEngine, onParticlesDisabled, particlesDisabledReason, releaseSharedParticleEngineWithFade } from "@/lib/particles/shared-engine";
import { SpectrumProcessor } from "@/lib/particles/spectrum";
import type { SoulId } from "@/lib/particles/souls";
import { lerpPalette, type ParticlePalette } from "@/lib/particles/souls";
/** Ghost's imagery is dim (stone, water, shadow): its colours voiced VIVID —
 *  saturation pushed away from grey and lifted, so the particles carry the
 *  phase's hue (teal water, gold dawn, violet cosmos) instead of washing white. */
function vivid(p: ParticlePalette | null): ParticlePalette | null {
  if (!p) return null;
  const v = (c: [number, number, number], lift: number): [number, number, number] => {
    const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const sat = c.map((x) => Math.max(0, l + (x - l) * 2.2));
    const m = Math.max(1e-3, ...sat);
    const k = Math.max(1, lift / m);
    return sat.map((x) => Math.min(1, x * k)) as [number, number, number];
  };
  return { ...p, low: v(p.low as [number, number, number], 0.45), mid: v(p.mid as [number, number, number], 0.8), high: v(p.high as [number, number, number], 0.95) };
}
import { JOURNEY_IMAGE_PALETTES } from "@/lib/particles/journey-palettes.generated";
import { particlePaletteFromImage, particlePaletteFire, particlePaletteGhost, particlePaletteDawn, JOURNEY_THEMES } from "@/lib/journeys/particle-lead";
import { MAX_DISSOLVES_PER_JOURNEY, dissolveAllowed, morphGuard, particlePaletteFrom, type ParticleLeadCast } from "@/lib/journeys/particle-lead";
import { presenceAt, colorAt } from "@/lib/journeys/particle-casting";
import type { JourneyFrame } from "@/lib/journeys/types";

const budgetFor = () => TIER_BUDGET[getDeviceTier()] ?? TIER_BUDGET.medium;

const TIER_BUDGET = {
  // Measured headless on the kiosk's M4 Pro, Lantern in pack mode (journey
  // alone, 3 shaders: 99 fps): 410k @ DPR 2 → 65 fps · 410k @ 1.5 → 74 ·
  // 262k @ 1.5 → 109 fps, p95 16.7 ms (one supporting shader). DPR matches
  // the shader stack's 1.5× ceiling (visualizer.tsx).
  high: { count: 160_000, dpr: 1.0, trailScale: 1 }, // 262k → 160k (2026-10-06 kiosk freeze guard)
  medium: { count: 131_072, dpr: 1.25, trailScale: 1 },
  low: { count: 65_536, dpr: 1, trailScale: 0 },
} as const;

/** Souls this journey will show, in the order it will show them (intro, the
 *  conducted windows, each travel morph's form) — pre-compiled at journey start. */
/** Particles stay this long after a morph video ends (Karel: "present when
 *  morph videos end … extending after"). 18 s held Snowflake at ~90 %
 *  presence (morphs every ~30 s); 10 s keeps the law and lands near 60 %. */
const MORPH_TAIL_SEC = 10;

/** Following a particle-like shader (see sampleFollow) — off: kiosk stalls. */
const FOLLOW_ENABLED = false;

/** Build + warm EVERY soul's program once per session while the screen is
 *  black (the installation loop's intro / title card) — after this no
 *  particle pipeline is ever built mid-journey (2026-10-06 zero-glitch). */
let warmStarted = false;
export function warmParticleSouls(souls: SoulId[]): void {
  if (warmStarted || typeof window === "undefined") return;
  warmStarted = true;
  const sh = acquireSharedParticleEngine({ count: budgetFor().count, dpr: budgetFor().dpr, trailScale: budgetFor().trailScale });
  if (!sh) return;
  sh.engine.prepare(souls);
  const t0 = performance.now();
  // compiles run in parallel (KHR_parallel_shader_compile); warm ONE compiled
  // program per step until all are warm. PERF (2026-10-07 audit): the old
  // burst (up to 80 per call, every 400 ms) built ~19 GPU pipelines inside one
  // or two frames — 150-190 ms long frames on the cold open, which now ANIMATES
  // (the particle logo gathering). One per 120 ms: ~19 small frames, all warm
  // in ~2.5 s, long before the first journey.
  const iv = window.setInterval(() => {
    const done = sh.engine.warmBurst(1);
    if (done || performance.now() - t0 > 25_000) {
      window.clearInterval(iv);
      glitchRecord("particle-warm", `${souls.length} souls ${done ? "warm" : "partial"} in ${Math.round(performance.now() - t0)} ms`);
    }
  }, 120);
}

type EmblemSource = HTMLCanvasElement | "@angel" | "@angel-outline";

// ── importance-sampled image coordinates (crisp image forms) ──────────────
const SAMPLE_N = (() => { const sd = Math.max(64, Math.min(1024, Math.round(Math.sqrt(160_000)))); return sd * sd; })();
const uvCache = new WeakMap<object, Float32Array>();
function computeUv(src: HTMLCanvasElement, n: number): Float32Array | undefined {
  const W = Math.min(256, src.width), H = Math.max(1, Math.round((src.height * W) / Math.max(1, src.width)));
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(src, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const cdf = new Float64Array(W * H);
  let acc = 0;
  for (let i = 0; i < W * H; i++) {
    const L = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
    acc += L < 0.06 ? 0 : Math.pow(L, 1.4) * (d[i * 4 + 3] / 255);
    cdf[i] = acc;
  }
  if (acc <= 0) return undefined;
  const out = new Float32Array(n * 2);
  const perm = new Uint32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  for (let i = n - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  // PERF (2026-10-07 audit): the stratified targets are SORTED, so one linear
  // sweep of the CDF replaces 160k binary searches — clean ~7 -> ~5 ms (worst 24 -> 6 ms) per
  // arriving still (it runs in an uninterruptible idle callback). Identical
  // samples.
  const last = W * H - 1;
  let lo = 0;
  for (let k = 0; k < n; k++) {
    const target = ((k + Math.random()) / n) * acc;
    while (lo < last && cdf[lo] < target) lo++;
    const x = lo % W, y = (lo - x) / W;
    const j = perm[k];
    out[j * 2] = (x + Math.random()) / W;
    out[j * 2 + 1] = 1 - (y + Math.random()) / H; // textures upload flipped (bottom-left origin)
  }
  return out;
}
/** Sampled coordinates for an image (cached); computed in idle time when warmed. */
function uvFor(src: HTMLCanvasElement | HTMLImageElement | null, n: number): Float32Array | undefined {
  if (!src || !(src instanceof HTMLCanvasElement)) return undefined;
  const hit = uvCache.get(src);
  if (hit && hit.length === n * 2) return hit;
  const uv = computeUv(src, n);
  if (uv) uvCache.set(src, uv);
  return uv;
}
function warmUv(src: HTMLCanvasElement): void {
  if (uvCache.has(src)) return;
  const run = () => { if (!uvCache.has(src)) { const uv = computeUv(src, SAMPLE_N); if (uv) uvCache.set(src, uv); } };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(run, { timeout: 4000 }); else setTimeout(run, 50);
}
let angelOutline: HTMLCanvasElement | null = null;
/** "@angel" → the keyed flash angel; "@angel-outline" → the angel traced as
 *  lines of light (luminance edges), so particles DRAW it rather than fill it. */
function resolveEmblem(src: EmblemSource | null): HTMLCanvasElement | null {
  if (!src) return null;
  if (src === "@angel") return keyedFlashAngel(1);
  if (src === "@angel-outline") {
    if (angelOutline) return angelOutline;
    const a = keyedFlashAngel(1);
    if (!a) return null;
    const k = Math.min(1, 512 / Math.max(a.width, a.height));
    const w = Math.round(a.width * k), h = Math.round(a.height * k);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return a;
    ctx.drawImage(a, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    const L = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) L[i] = (0.3 * d.data[i * 4] + 0.59 * d.data[i * 4 + 1] + 0.11 * d.data[i * 4 + 2]) / 255;
    const o = ctx.createImageData(w, h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = L[i + 1] - L[i - 1] + 0.5 * (L[i - w + 1] - L[i - w - 1] + L[i + w + 1] - L[i + w - 1]);
      const gy = L[i + w] - L[i - w] + 0.5 * (L[i + w - 1] - L[i - w - 1] + L[i + w + 1] - L[i - w + 1]);
      const e = Math.min(1, Math.hypot(gx, gy) * 3.2);
      o.data[i * 4] = 255 * e; o.data[i * 4 + 1] = 240 * e; o.data[i * 4 + 2] = 248 * e; o.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(o, 0, 0);
    angelOutline = c;
    warmUv(c);
    return c;
  }
  return src;
}

let motifMap: Promise<Record<string, string[]>> | null = null;
const motifCanvas = new Map<string, HTMLCanvasElement>();
/** Imagery-family motif designs (pack: motif-forms.json), decoded + shrunk once. */
function loadMotifLibrary(): Promise<Record<string, string[]>> {
  motifMap ??= fetch("/tramokyo-pack/motif-forms.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return motifMap;
}
function motifImage(src: string): HTMLCanvasElement | null {
  const hit = motifCanvas.get(src);
  if (hit) return hit;
  if (motifCanvas.has(src + "#loading")) return null;
  motifCanvas.set(src + "#loading", document.createElement("canvas"));
  const img = new Image();
  // decode OFF the main thread first (2026-10-07 perf audit: drawImage of an
  // undecoded JPEG in onload decoded it synchronously on the frame)
  img.src = src;
  void img.decode().catch(() => undefined).then(() => {
    if (!img.naturalWidth) return; // failed load
    const k = Math.min(1, 512 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0, c.width, c.height);
    motifCanvas.set(src, c);
    warmUv(c);
  });
  return null;
}

let emblemMap: Promise<Record<string, string | string[]>> | null = null;
/** Journey → emblem image (offline pack; empty where the pack has none). */
function loadEmblemMap(): Promise<Record<string, string | string[]>> {
  emblemMap ??= fetch("/tramokyo-pack/local-emblems.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return emblemMap;
}

function soulSequence(cast: ParticleLeadCast): SoulId[] {
  const ev: [number, SoulId][] = [[3, cast.morphSouls[0] ?? cast.souls.transition]];
  for (const w of cast.windows) ev.push([w.start, w.soul]);
  (cast.formCycle ?? []).forEach((id, i) => ev.push([1e6 + i, id])); // the evolving forms (one union program)
  (cast.phaseBounds ?? []).forEach((b, i) => ev.push([b, cast.morphSouls[Math.min(i + 1, cast.morphSouls.length - 1)] ?? cast.souls.transition]));
  return ev.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}

export function ParticleLeadLayer({
  cast,
  journeyId,
  frame,
  analyser,
  imageSrc = null,
  paused = false,
  flash = null,
}: {
  cast: ParticleLeadCast;
  journeyId: string;
  frame: JourneyFrame | null;
  analyser: AnalyserLike | null;
  /** The still that just entered the collage (dissolve trigger). */
  imageSrc?: string | null;
  paused?: boolean;
  /** Ghost's angel flash (approach ramp + hit impulse): the field gathers
   *  INTO the angel, wears it, then dissipates (Karel 2026-10-06). */
  flash?: { approach: number; impulse: number } | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const contrastRef = useRef<HTMLDivElement | null>(null);
  // emergence windows (track seconds): the intro gathering, and every travel
  // morph — from the moment it starts, past its end (Karel: "always
  // overlapping with the morph videos and extending after")
  const emergeRef = useRef<{ start: number; end: number; soul: SoulId } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const contrastK = useRef(0.35);
  const engineRef = useRef<ParticleEngine | null>(null);
  const analyserRef = useRef<AnalyserLike | null>(analyser);
  const pausedRef = useRef(paused);
  const flashRef = useRef(flash);
  flashRef.current = flash;
  const frameRef = useRef(frame);
  frameRef.current = frame;
  // the journey's EMBLEM image (pack: local-emblems.json) — "@angel" = Ghost's angel
  // (an array = variants: each appearance shows a different one — Snowflake)
  // entries are images, or tokens: "@angel" (the flash angel), "@angel-outline"
  // (the angel traced as lines of light) — Ghost rotates through treatments
  const emblemRef = useRef<EmblemSource[] | null>(null);
  useEffect(() => {
    emblemRef.current = null;
    let cancelled = false;
    void loadEmblemMap().then((map) => {
      const src = map[journeyId];
      if (cancelled || !src) return;
      const list = Array.isArray(src) ? src : [src];
      const imgs: EmblemSource[] = list.filter((u) => u.startsWith("@")) as EmblemSource[];
      if (imgs.length) emblemRef.current = [...imgs];
      for (const u of list) {
        if (u.startsWith("@")) continue;
        const img = new Image();
        // decoded + shrunk to ≤512 px NOW, so forming it later uploads a small
        // texture (a full 1024² JPEG upload hitched ~230 ms on a visible frame)
        // decode OFF the main thread first (2026-10-07 perf audit: drawImage of an
        // undecoded JPEG in onload decoded it synchronously on the frame)
        img.src = u;
        void img.decode().catch(() => undefined).then(() => {
          if (!img.naturalWidth) return; // failed load
          if (cancelled) return;
          const k = Math.min(1, 512 / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0, c.width, c.height);
          imgs.push(c);
          emblemRef.current = [...imgs];
          warmUv(c);
        });
      }
    });
    return () => { cancelled = true; };
  }, [journeyId]);
  // IMAGE ECHO (Karel 2026-10-07: "particles image aware always and interplay
  // with the images"): each arriving still is decoded small and sampled in idle
  // time; the tick may have the field trace its bright structure over it
  const echoRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!imageSrc) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    // decode OFF the main thread first (2026-10-07 perf audit: drawImage of an
    // undecoded JPEG in onload decoded it synchronously on the frame)
    img.src = imageSrc;
    void img.decode().catch(() => undefined).then(() => {
      if (!img.naturalWidth) return; // failed load
      if (cancelled) return;
      const k = Math.min(1, 320 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      try { c.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0, c.width, c.height); } catch { return; }
      warmUv(c);
      echoRef.current = c;
    });
    return () => { cancelled = true; };
  }, [imageSrc]);
  // timed moment images (decoded + shrunk at mount, like emblems)
  const momentImgs = useRef<HTMLCanvasElement[]>([]);
  useEffect(() => {
    momentImgs.current = [];
    let cancelled = false;
    for (const m of cast.signatureMoments ?? []) for (const u of m.images) {
      const img = new Image();
      // decode OFF the main thread first (2026-10-07 perf audit: drawImage of an
      // undecoded JPEG in onload decoded it synchronously on the frame)
      img.src = u;
      void img.decode().catch(() => undefined).then(() => {
        if (!img.naturalWidth) return; // failed load
        if (cancelled) return;
        const k = Math.min(1, 640 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d", { willReadFrequently: true })?.drawImage(img, 0, 0, c.width, c.height);
        momentImgs.current = [...momentImgs.current, c];
        warmUv(c);
      });
    }
    return () => { cancelled = true; };
  }, [cast]);
  const paletteTarget = useRef<ParticlePalette | null>(null);
  const palRef = useRef<JourneyFrame["palette"] | null>(null);
  const phaseRef = useRef<{ phase: string | undefined; at: number }>({ phase: undefined, at: 0 });
  const windowRef = useRef<{ kind: string; start: number } | null>(null);
  const dissolvedWindow = useRef<number | null>(null);
  // a still that arrived while the morph guard held it — dissolve once clear
  const heldInWindow = useRef<number | null>(null);
  const counters = useRef({ dissolves: 0, stills: 0, gate: "", scatters: 0, bounces: 0, emergences: 0, entries: 0 });
  const [failed, setFailed] = useState(false);
  analyserRef.current = analyser;
  pausedRef.current = paused;
  if (frame?.phase !== phaseRef.current.phase) phaseRef.current = { phase: frame?.phase, at: performance.now() };

  const pal = frame?.palette;
  const palKey = pal ? `${pal.primary}${pal.accent}${pal.glow}` : "";

  // ── engine + conductor ────────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const sh = acquireSharedParticleEngine({ count: budgetFor().count, dpr: budgetFor().dpr, trailScale: budgetFor().trailScale });
    if (!sh) { setFailed(true); return; }
    // failsafe: veils fade on their own CSS transitions; unmount after
    const offDisable = onParticlesDisabled(() => {
      if (veilRef.current) veilRef.current.style.opacity = "0";
      if (contrastRef.current) contrastRef.current.style.opacity = "0";
      window.setTimeout(() => setFailed(true), 2200);
    });
    const engine = sh.engine;
    // velocity jump tripwire: diagnostic runs only (localStorage
    // resonance-particle-tripwire=1) — journeys never read back by default
    try { engine.setTripwire(window.localStorage.getItem("resonance-particle-tripwire") === "1"); } catch { /* storage blocked */ }
    let lastRetargetLogged = "";
    const tier = getDeviceTier();
    // continuity: a field still fading from the previous journey carries over
    // from its current opacity (never a cut at the handoff)
    const carry = Math.max(0, Math.min(1, Number(sh.canvas.style.opacity || "0") || 0));
    host.appendChild(sh.canvas);
    canvasRef.current = sh.canvas;
    engine.resize();
    const proc = new SpectrumProcessor({ bins: 96, source: "kinetic" });
    let bytes = new Uint8Array(128);
    sh.hooks.audio = (dt) => {
      const a = analyserRef.current;
      if (!a || pausedRef.current) proc.ingestBytes(null);
      else {
        if (bytes.length !== a.frequencyBinCount) bytes = new Uint8Array(a.frequencyBinCount);
        try {
          a.getByteFrequencyData(bytes as Uint8Array<ArrayBuffer>);
          proc.ingestBytes(bytes);
        } catch {
          proc.ingestBytes(null);
        }
      }
      proc.step(dt);
      return proc.frame();
    };
    // a fresh journey: no leftover image form / variant / field from the last one
    engine.setImageForm(0, 0);
    engine.setImageVariant(false, 0);
    engine.setInstances(1, 0);
    // queue this journey's souls (normally already warm: warmParticleSouls at the loop's intro)
    engine.prepare(soulSequence(cast));
    // integrate, not dominate (Karel 2026-10-07): a touch less energy
    engine.setGain((cast.gain ?? 1) * 1.45);
    engineRef.current = engine;
    engine.setMotion(cast.motion);
    engine.setForm(cast.form);
    engine.setHueSpread(cast.hueSpread);
    // RULE (Karel v3): particles gather just after the intro, and OVERLAP
    // every travel morph from its start, extending ~18 s past its end
    const morphSoulAt = (t: number) =>
      cast.morphSouls[Math.min((cast.phaseBounds ?? []).filter((x) => x <= t + 1).length, cast.morphSouls.length - 1)] ?? cast.souls.transition;
    emergeRef.current = { start: 3, end: 20, soul: cast.morphSouls[0] ?? cast.souls.transition };
    const offStart = onClipStarted((e) => {
      if (!e.travel) return;
      const t = useAudioStore.getState().currentTime || 0;
      const dur = Number.isFinite(e.duration) && e.duration > 0 ? e.duration : 6;
      const prev = emergeRef.current;
      emergeRef.current = prev && prev.end > t
        ? { ...prev, end: Math.max(prev.end, t + dur + MORPH_TAIL_SEC) }
        : { start: t, end: t + dur + MORPH_TAIL_SEC, soul: morphSoulAt(t + 1.5) };
      counters.current.emergences++;
    });
    const offClip = onClipEnded((e) => {
      if (!e.travel) return;
      const t = useAudioStore.getState().currentTime || 0;
      const em = emergeRef.current;
      if (em && t < em.end + 1) em.end = Math.max(em.end, t + MORPH_TAIL_SEC);
      else emergeRef.current = { start: t, end: t + MORPH_TAIL_SEC, soul: morphSoulAt(t) };
    });
    // signature phases: their entry always raises the journey's own form,
    // travel clip or not (Ghost's spirit — some boundaries are crossfades)
    let lastPhaseIdx = -1;
    let angelAt = -1;
    let momentAt = -1, momentDur = 16, momentN = 0;
    // MOTIF FORMS (Karel 2026-10-06: "particle systems reflect the imaging and
    // theme" — an intricate flame for Realized, ghostly angels/wings for Ghost …)
    let motifAt = -1, motifDur = 16, motifN = 0, motifSrc = "";
    let motifLib: Record<string, string[]> = {};
    let motifTimer = 0;
    let disposed = false;
    void loadMotifLibrary().then((m) => {
      motifLib = m;
      // TRICKLE, not a flood (2026-10-07 perf audit: all 54 designs decoded +
      // drawn at once at the first journey's mount = ~430 ms of long frames
      // under the opening title). One design per idle slot, after the opening
      // emblem has formed; motifs are first needed after a full form hold.
      const queue = Object.keys(m).flatMap((f) => (m[f] ?? []).filter(Boolean));
      const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      const next = () => {
        if (disposed || !queue.length) return;
        const u = queue.shift()!;
        if (!motifCanvas.has(u) && !motifCanvas.has(u + "#loading")) motifImage(u);
        motifTimer = window.setTimeout(() => (ric ? ric(next, { timeout: 2000 }) : next()), 160);
      };
      motifTimer = window.setTimeout(next, 6000);
    });
    const motifRecent: string[] = [];
    const startMotif = (t: number): boolean => {
      const fam = charAt(t)?.family ?? "geo";
      const list = (motifLib[fam] ?? []).filter((u) => u && motifCanvas.has(u) && !motifRecent.includes(u));
      if (!list.length) return false;
      motifSrc = list[Math.floor(rand01(51 + appearN) * list.length)];
      motifRecent.unshift(motifSrc);
      if (motifRecent.length > 3) motifRecent.length = 3;
      motifAt = t;
      motifDur = Math.max(10, formDur / 1000 + 2);
      motifN++;
      formAt = performance.now();
      glitchRecord("particle-motif", `${fam} ${motifSrc.split("/").pop()}`);
      return true;
    };
    // 2-D designs are accents now (Ghost keeps its angels / wings / blossoms)
    const theme = JOURNEY_THEMES[journeyId];
    // Ghost's ghostly motifs: occasional, not every form (Karel 2026-10-07: "keep changing forms")
    const THIN_LINE_FORMS = new Set<SoulId>(["spirograph", "rose", "lissajous", "harmonics", "rings", "arcs", "orbitals", "knot", "helix", "superformula", "mandala", "girih", "medallion", "kaleido", "threads"]);
    const pMotif = theme ? theme.motif : cast.signatureImage === "angel" ? 0.3 : 0.35;
    const ANGEL_SEC = 22;
    const signatureAt = (t: number) => {
      const pbs = cast.phaseBounds ?? [];
      const idx = pbs.filter((x) => x <= t).length;
      const mo = cast.signatureMoments?.find((m) => m.phase === idx);
      if (lastPhaseIdx >= 0 && idx === lastPhaseIdx + 1 && mo) { momentAt = t + mo.at; momentDur = mo.dur; momentN++; }
      if (lastPhaseIdx >= 0 && idx === lastPhaseIdx + 1 && cast.signatureMorphs?.includes(idx) && cast.signatureImage === "angel") {
        angelAt = t; // the field forms the angel (real image), off-centre
        counters.current.emergences++;
      }
      lastPhaseIdx = idx;
    };
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    let running = false;
    let absentSince = performance.now();
    let lastOnsets = 0;
    const onsetTimes: number[] = [];
    let lastScatter = -1e9;

    let wasVisible = false;
    let warmTick = 0;
    let presentFlag = false;
    // SMOOTH FADES ONLY (Karel 2026-10-05: "the particles always need to
    // smoothly fade out not drop out"): what is shown is slew-limited —
    // ≥1.5 s to fade in, ≥3.5 s to fade out, whatever the conductor asks
    let shown = carry;
    let veilShown = 0;
    // density GATHERS on the way in but HOLDS on the way out — thinning while
    // fading turned the field into a few big, bright motes popping out one by
    // one ("drop frames and disappear", Karel 2026-10-06); only opacity fades
    let densP = 0;
    let zeroSince = 0;
    // variety (Karel 2026-10-06: "limited amount of shapes … always the same
    // amount and the same distance"): forms evolve while visible, and every
    // appearance draws its own figure, distance and density
    let lastAsked = "";
    let currentSoul = "";
    let formAt = performance.now();
    let formDur = 14_000;
    let cycleIdx = 0;
    let densK = 0.7;
    let densKS = 0.7;
    let appearN = 0;
    // CALM — Snowflake + Ghost (Karel 2026-10-07: "in snowflake the particle form is constantly
    // changing and now very distracting"): Snowflake holds each form ~25-32 s,
    // breathes slowly, no image echo, sections never cut a form short, gentle dolly
    // Realized too (Karel 2026-10-07: "changing too much all the time. needs to not make me dizzy")
    const calm = journeyId === "first-snow" || journeyId === "ghost" || journeyId === "inferno";
    // dolly + placement (Karel 2026-10-06: "they always land in a shape at
    // same distance away … always hover dead center … i need dynamics")
    let dollyFrom = 1, dollyTo = 1, dollyAt = performance.now();
    let offX = 0.3, offY = 0.1;
    const rand01 = (k: number) => { let x = Math.imul((appearN + 1) * 0x9e3779b9 ^ k * 0x85ebca6b ^ journeyId.length * 0xc2b2ae35, 2246822519); x ^= x >>> 15; x = Math.imul(x, 3266489917); x ^= x >>> 13; return (x >>> 0) / 4294967296; };
    const appearance = () => {
      appearN++;
      // distance: log-uniform from close & large (0.45) to far & small (2.3),
      // then a slow dolly in or out across the appearance
      // Ghost: never over-obscure the imaging — further, sparser, off to a side
      const quietImaging = journeyId === "ghost";
      const kLo = quietImaging ? 0.9 : calm ? 0.8 : 0.45;
      // expansive presence (Realized's "good presence and dynamics"): never far
      // and tiny — 0.45 (close, large) … 1.6
      const k = Math.exp(Math.log(kLo) + rand01(1) * (Math.log(1.6) - Math.log(kLo)));
      dollyFrom = k;
      dollyTo = k * (calm ? 0.88 + 0.24 * rand01(4) : 0.62 + 0.85 * rand01(4));
      // BIG IS BRIEF (Karel 2026-10-07: "nice for a brief time this big but
      // over done if it stays this size"): a close, large arrival always
      // recedes to mid-distance across its appearance
      if (k < 0.9) dollyTo = Math.max(dollyTo, 1.05 + 0.3 * rand01(10));
      dollyAt = performance.now();
      densK = quietImaging ? 0.22 + 0.4 * rand01(2) : 0.3 + 0.7 * rand01(2);
      // forms HOLD (Karel 2026-10-06: "change should be smooth and not jump
      // between shapes quickly")
      // smooth, but never lingering (Karel 2026-10-06: Realized's flame "went
      // on and on" — numerous forms, none lasting too long)
      // ("you also kept shifting it fast between different shapes"): forms hold
      // ~10 s per form (Karel 2026-10-07: "10 secs is a rule of thumb … within
      // that time it should have detailed changes just not those big ones")
      // calm: 14-18 s (Karel 2026-10-07: 25-32 s "sat too long and too big")
      // … then LONGER everywhere (same day: "you still change the particles form
      // a bit too much overall so you create a shape and i go to look and you
      // change again"): 16-20 s, calm 17-21 s
      formDur = calm ? 17_000 + 4_000 * rand01(3) : 16_000 + 4_000 * rand01(3);
      // placement (Karel 2026-10-06: "in general centered, but needs
      // variety especially in ghost"): centred about half the time, else a
      // gentle shift to a side; Ghost mostly sits beside the imagery
      const side = rand01(5) < 0.5 ? -1 : 1;
      // Karel 2026-10-06: every journey but Snowflake + Ghost is CENTRED 75 %
      // of the time, with a little variation away to keep it interesting
      const keepOwn = journeyId === "first-snow" || quietImaging;
      const centred = rand01(6) < (quietImaging ? 0.2 : keepOwn ? 0.5 : 0.75);
      offX = centred ? 0 : side * (quietImaging ? 0.25 + 0.25 * rand01(7) : keepOwn ? 0.1 + 0.2 * rand01(7) : 0.08 + 0.14 * rand01(7));
      offY = centred ? 0 : (rand01(8) - 0.5) * (quietImaging ? 0.4 : keepOwn ? 0.25 : 0.16);
      // THIN LINES NEED PRESENCE (Karel 2026-10-07: "the thin shapes even
      // mandalas get lost over imaging … the super thin line designs are tough
      // to see"): line-drawn forms wear bigger, denser motes
      const thin = THIN_LINE_FORMS.has(currentSoul as SoulId);
      engine.setSizeScale(thin ? 1.5 + 0.7 * rand01(9) : 0.6 + 1.4 * rand01(9));
      if (thin) densK = Math.max(densK, 0.85);
    };
    // the forms THIS phase's imagery calls for (vision-tagged) — else the cycle
    const phaseIdxAt = (t: number) => (cast.phaseBounds ?? []).filter((b) => b <= t).length;
    const charAt = (t: number) => cast.phaseChars?.[Math.min(phaseIdxAt(t), (cast.phaseChars?.length ?? 1) - 1)];
    const formsNow = (t: number): SoulId[] => { const f = charAt(t)?.forms; return f && f.length ? f : cast.formCycle; };
    const switchForm = (soul: SoulId, t: number) => {
      const quiet = shown < 0.05;
      engine.setSoul(soul, quiet ? 0.5 : calm ? 8 : 5);
      lastShape = shapeSeed(soul, t + appearN * 11);
      engine.setShape(lastShape, quiet);
      // flower imagery: the blossom unfolds INFINITELY (layers grow from the centre)
      engine.setUnfold(soul === "blossom" && !!charAt(t)?.floral);
      microAt = performance.now();
      // FIELD mode: sometimes many smaller copies instead of one form (Ghost's
      // blossoms most of all)
      const floralNow = !!charAt(t)?.floral;
      // FIELDS are rare and few + large (Karel 2026-10-06: "when you make little
      // tiny shapes … and they repeat its boring") — expansive single forms lead.
      // The layout only changes while INVISIBLE: switching it on a visible field
      // made every mote jump at once ("drops in abrupt … when multiple")
      if (quiet) {
        const pField = FIELD_FORMS.has(soul) ? (floralNow && soul === "blossom" ? 0.3 : 0.12) : 0;
        const nInst = rand01(31 + appearN) < pField ? 3 + Math.floor(rand01(32 + appearN) * 2) : 1;
        engine.setInstances(nInst, rand01(33 + appearN));
      }
      // colour honours the journey first (Karel 2026-10-06: "the journey needs to
      // have its images and themes honored by shapes and color too. def keep some
      // rainbow on most though mixed in … keep some rainbow … in snowflake … dont
      // bring that into ghost"): spectrum forms go FULL rainbow on ~1 in 3
      // appearances (Snowflake: most), a moderate palette drift otherwise;
      // Ghost never
      const ghostJ = cast.signatureImage === "angel";
      const snowJ = journeyId === "first-snow";
      // ("you way over did rainbow particle in snowflake"): an accent now
      // ("bring back more of the rainbow intense colors a bit more but dont over do it")
      // Snowflake (Karel 2026-10-07: "i wanted the return of some of those bright
      // rainbow color themed forms"): ~60 % of its (now long-held) forms, any shape
      // …and "just a bit more of this coloring in all" (Image #2: a multi-hue bloom):
      // spectrum forms ~1 in 2, any other form ~1 in 5
      const rainbow = !ghostJ && rand01(71 + appearN) < (snowJ ? 0.6 : SPECTRUM_FORMS.has(soul) ? 0.5 : 0.2);
      engine.setHueSpread(ghostJ ? Math.min(0.5, Math.max(0.3, cast.hueSpread)) : rainbow ? 2.6 : SPECTRUM_FORMS.has(soul) ? 0.8 : cast.hueSpread);
      spectrumNow = rainbow;
      recent.unshift(soul);
      if (recent.length > 4) recent.length = 4;
      currentSoul = soul;
      formAt = performance.now();
      appearance();
      // a blossom GROWS as it opens: it arrives further away and drifts in
      if (soul === "blossom") { dollyFrom = Math.max(dollyFrom, 1.3); dollyTo = Math.min(dollyFrom * 0.55, 0.75); dollyAt = performance.now(); }
      glitchRecord("particle-form", `${soul}${quiet ? " (quiet)" : ""}`);
    };
    let wasShown = false;
    // detailed changes WITHIN a form ("it needs to breathe"): every ~3 s the
    // continuous shape parameters drift a little (petal counts etc. never jump)
    let lastShape: [number, number, number, number] = [0, 0.3, 0.5, 0.5];
    let microAt = performance.now();
    let spectrumNow = false;
    const recent: SoulId[] = [];
    /** next form for this phase: not one of the last two shown */
    const nextForm = (t: number): SoulId | undefined => {
      const fl = formsNow(t);
      for (let i = 1; i <= fl.length; i++) {
        const c = fl[(cycleIdx + i) % fl.length];
        if (!recent.includes(c)) { cycleIdx += i; return c; }
      }
      return fl[(++cycleIdx) % Math.max(1, fl.length)];
    };
    // ── follow a particle-like shader: 4×/s, a 32×18 snapshot of its canvas
    // (async createImageBitmap — no synchronous read-back), the centroid of
    // what MOVED between snapshots becomes a target a stream chases ──
    let followOn = false;
    let followBusy = false;
    let followAt = 0;
    let prevLum: Float32Array | null = null;
    const fctx = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(32, 18).getContext("2d", { willReadFrequently: true }) : null;
    const sampleFollow = (mode: string) => {
      const nowMs = performance.now();
      if (followBusy || !fctx || nowMs - followAt < 250) return;
      const cvs = [...document.querySelectorAll<HTMLCanvasElement>(`canvas[data-shader-mode="${mode}"]`)].pop();
      if (!cvs || !cvs.width) return;
      followBusy = true;
      followAt = nowMs;
      createImageBitmap(cvs, { resizeWidth: 32, resizeHeight: 18, resizeQuality: "low" })
        .then((bm) => {
          fctx.clearRect(0, 0, 32, 18);
          fctx.drawImage(bm, 0, 0);
          bm.close();
          const d = fctx.getImageData(0, 0, 32, 18).data;
          const lum = new Float32Array(32 * 18);
          for (let i = 0; i < lum.length; i++) lum[i] = (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
          if (prevLum) {
            let wx = 0, wy = 0, ws = 0;
            for (let y = 0; y < 18; y++) for (let x = 0; x < 32; x++) {
              const i = y * 32 + x;
              const w = Math.max(0, lum[i] - prevLum[i]) * lum[i];
              wx += w * x; wy += w * y; ws += w;
            }
            if (ws > 0.02) {
              engine.setFollow((wx / ws / 31) * 2 - 1, 1 - (wy / ws / 17) * 2, 1);
              if (!followOn) glitchRecord("particle-follow", mode);
              followOn = true;
            } else if (followOn) { engine.setFollow(0, 0, 0); followOn = false; }
          }
          prevLum = lum;
        })
        .catch(() => { /* canvas not readable — no follow */ })
        .finally(() => { followBusy = false; });
    };
    // flash form (Ghost)
    let flashTail = 0;
    let imgLoaded: "angel" | "emblem" | "moment" | "motif" | "echo" | null = null;
    let angelUvWarm = false;
    let echoAt = -1, echoN = 0;
    let echoUsed: HTMLCanvasElement | null = null;
    let treatN = 0;
    let imgKey: string | null = null;
    let imgReleasing = false, imgReleaseAt = 0;
    let jumpRecAt = 0;
    let imgVar = { mirror: false, tilt: 0, scale: 1, literal: 0.84 };
    let emblemOn = false;
    // ambient presence (Karel 2026-10-06: "on average particles should be
    // part of the journey around 60% of the time"): between conducted
    // windows the field returns for 12–22 s after 12–20 s away (measured
    // ~80 % with longer returns — tuned toward 60 %)
    let ambientUntil = -1;
    let minHoldUntil = -1;
    let onSec = 0;
    let outSince = 0;
    // NEVER >10 s WITHOUT PARTICLES (Karel 2026-10-07, all journeys): the field
    // returns 6-9 s after it has gone (plus its ~1.5 s fade-in)
    let ambientGap = 3.5 + 2 * rand01(21); // + fade tails ≈ 7-9 s visible gap (pass1: 6-9 s measured 11-12 s)
    let lastTick = performance.now();
    let palVoiceKey = "";
    let palPair: [ParticlePalette | null, ParticlePalette | null] = [null, null];
    // Karel 2026-10-06 (again): "fade out smoothly not drop out" — longer,
    // and EASED on screen (smoothstep of the slewed value), so the last
    // stretch of a fade never reads as a cut
    const FADE_IN_SEC = 2.5;
    const FADE_OUT_SEC = 6;
    const slew = (cur: number, target: number, dt: number) =>
      target > cur ? Math.min(target, cur + dt / FADE_IN_SEC) : Math.max(target, cur - dt / FADE_OUT_SEC);
    // per-appearance shape seed: the same soul never repeats its exact figure
    const shapeSeed = (soul: string, t: number): [number, number, number, number] => {
      let h = 2166136261;
      for (const ch of `${journeyId}:${soul}:${Math.floor(t / 7)}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
      const r = (k: number) => { let x = Math.imul(h ^ (k * 0x9e3779b9), 2246822519); x ^= x >>> 13; x = Math.imul(x, 3266489917); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
      return [r(1), r(2), r(3), r(4)];
    };
    const tick = () => {
      if (particlesDisabledReason()) { window.clearInterval(iv); return; } // failsafe tripped: stand down
      const now = performance.now();
      const tickDt = Math.min(0.5, (now - lastTick) / 1000);
      lastTick = now;
      const t = useAudioStore.getState().currentTime || 0;
      signatureAt(t);
      // MORPH LAW (Karel 2026-10-06: "particle system always overlaps the
      // morph and is present when morph videos end in all cases ever"):
      // travel morphs ride the phase boundaries, which are known — arm the
      // emergence 4 s AHEAD so the field is already up as the morph begins
      // (the clip-start event alone left it fading in late)
      {
        const pb = (cast.phaseBounds ?? []).find((b) => b > t && b - t < 4);
        if (pb !== undefined) {
          const em = emergeRef.current;
          const soul = morphSoulAt(pb + 1);
          // armed through the boundary; a travel clip then extends it to its end + MORPH_TAIL_SEC
          if (!em || em.end < pb + 8) emergeRef.current = { start: Math.min(em?.start ?? t, t), end: pb + 12, soul: em && em.end > t ? em.soul : soul };
        }
      }
      // GHOST OPENING HUSH (Karel 2026-10-07: "in ghost the particle dominate
      // the entire first minute and keep changing forms"): after the opening
      // angel the field rests until 1:00 — the imaging carries the opening
      // (lifted the same day — "you removed it too much from first section of ghost dude"; calm + the 10 s rule now carry Ghost's opening)
      const hush = false;
      const pr0h = presenceAt(cast, t);
      const pr0 = hush ? { ...pr0h, presence: 0, window: null } : pr0h;
      // emergence window after a travel morph (3 s gather in, 3 s out)
      const em = emergeRef.current;
      let emP = 0;
      if (em) {
        const x = Math.min((t - em.start) / 3, (em.end - t) / 3);
        emP = x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
        // drop only once it has ended (the intro window is armed at t = 0,
        // before it begins — dropping "early" windows lost the intro)
        if (t > em.end + 1) emergeRef.current = null;
      }
      const emSoul = em?.soul ?? cast.souls.transition;
      const useEm = !hush && emP > pr0.presence;
      const pr = useEm
        ? { presence: emP, window: null, breakVeil: 0, density: 0.5 }
        : pr0;
      // look-ahead: wake the field 3 s before a window so it has formed by the fade-in
      const next = hush ? undefined : cast.windows.find((w) => w.start > t && w.start - t < 3);
      const w = useEm ? { soul: emSoul, density: 0.5 } : pr.window ?? next ?? null;
      windowRef.current = pr.window ? { kind: pr.window.kind, start: pr.window.start } : null;

      // ── IMAGE FORMS: the field gathers into an image, wears it, dissipates ──
      // (Ghost's angel flash, Ghost's angel signature, every journey's EMBLEM)
      const ssf = (e0: number, e1: number, x: number) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
      const fl = flashRef.current;
      if (fl && !angelUvWarm) { const a = keyedFlashAngel(1); if (a) { warmUv(a); angelUvWarm = true; } }
      const fa = fl?.approach ?? 0;
      const fi = fl?.impulse ?? 0;
      const gather = fa <= 0.45 ? 0 : fa >= 0.9 ? 1 : ((fa - 0.45) / 0.45) ** 2 * (3 - 2 * ((fa - 0.45) / 0.45));
      const flashNow = Math.max(gather, fi);
      flashTail = Math.max(flashTail - tickDt / 3.2, flashNow);
      // the angel signature: gather 4 s, hold (breathing), dissipate over 6 s
      let angelForm = 0, angelShow = 0;
      if (angelAt >= 0) {
        const a = t - angelAt;
        angelForm = ssf(0, 4, a) * (1 - ssf(ANGEL_SEC - 8, ANGEL_SEC - 3, a)) * (0.9 + 0.1 * Math.sin(a * 0.8));
        angelShow = ssf(0.5, 4.5, a) * (1 - ssf(ANGEL_SEC - 5, ANGEL_SEC, a));
        if (a > ANGEL_SEC) angelAt = -1;
      }
      // the EMBLEM (Karel 2026-10-06): under the title at the start, again at
      // the end, and once mid-journey in long pieces — the form that SAYS the
      // journey (Yellow Bird → a yellow bird, Snowflake → a snowflake …)
      let emForm = 0, emShow = 0;
      let emOcc = 0; // 0 = opening, 1 = mid, 2 = closing
      let emAge = ssf(4, 11, t); // the emblem eases smaller while held (big is brief)
      if (emblemRef.current) {
        const D = useAudioStore.getState().duration || 0;
        emForm = ssf(0.8, 3.8, t) * (1 - ssf(11, 15, t));
        emShow = ssf(1.0, 4.0, t) * (1 - ssf(12, 16, t));
        if (D > 40 && t > D - 17) {
          const e = t - (D - 17);
          emForm = Math.max(emForm, ssf(0, 3.5, e));
          emShow = Math.max(emShow, ssf(0.3, 4, e));
          emOcc = 2;
          emAge = ssf(4, 11, e);
        }
        if (D > 200 && t > D * 0.5 && t < D * 0.5 + 15) {
          const m = t - D * 0.5;
          emForm = Math.max(emForm, ssf(0, 3.5, m) * (1 - ssf(9, 13, m)));
          emShow = Math.max(emShow, ssf(0.3, 4, m) * (1 - ssf(10, 14, m)));
          emOcc = 1;
          emAge = ssf(4, 10, m);
        }
      }
      // timed MOMENT (Ghost's blossom cloud): gather 4 s, hold breathing, dissipate
      let moForm = 0, moShow = 0;
      if (momentAt >= 0 && t >= momentAt) {
        const a = t - momentAt;
        moForm = ssf(0, 4, a) * (1 - ssf(momentDur - 6, momentDur - 2, a)) * (0.92 + 0.08 * Math.sin(a * 0.7));
        moShow = ssf(0.5, 4.5, a) * (1 - ssf(momentDur - 4, momentDur, a));
        if (a > momentDur) momentAt = -1;
      }
      let mfForm = 0, mfShow = 0;
      if (motifAt >= 0) {
        const a = t - motifAt;
        mfForm = ssf(0, 4, a) * (1 - ssf(motifDur - 5, motifDur - 1, a)) * (0.92 + 0.08 * Math.sin(a * 0.5));
        mfShow = ssf(0.5, 4.5, a) * (1 - ssf(motifDur - 4, motifDur, a));
        if (a > motifDur || a < 0) { motifAt = -1; formAt = performance.now(); }
      }
      // the echo: trace the arriving still's light, then flow back into the form
      const ec = echoRef.current;
      // an echo is a FORM change: only once the current form has had its full hold
      // (review rig 2026-10-07: echoes began 0.1-7 s after a switch, then again 7-13 s later)
      if (ec && ec !== echoUsed && uvCache.has(ec) && echoAt < 0 && shown > 0.3 && !imgLoaded && performance.now() - formAt > formDur) {
        echoUsed = ec;
        // the echo IS this form change: restart the hold so nothing else changes in
        // the same tick (review pass1: echo + section form / echo + motif fired together)
        if (rand01(81 + echoN) < (calm ? 0.25 : 0.4)) { echoAt = t; echoN++; formAt = performance.now(); glitchRecord("particle-echo", "still"); }
      }
      let ecForm = 0, ecShow = 0;
      if (echoAt >= 0) {
        const a = t - echoAt;
        ecForm = ssf(0, 2.5, a) * (1 - ssf(4.5, 6.5, a)) * 0.65;
        ecShow = ssf(0.3, 2.5, a) * (1 - ssf(5, 7, a)) * 0.55;
        if (a > 7) { echoAt = -1; formAt = performance.now(); } // an echo IS a form: the next change waits a full formDur
      }
      const flashing = flashNow > 0.02 || flashTail > 0.02;
      const momentOn = !flashing && (moForm > 0.02 || moShow > 0.02);
      const angelOn = flashing || angelForm > 0.02 || angelShow > 0.02;
      const want: "angel" | "emblem" | "moment" | "motif" | "echo" | null = flashing ? "angel" : momentOn ? "moment" : angelOn ? "angel" : emForm > 0.02 || emShow > 0.02 ? "emblem" : ecForm > 0.02 || ecShow > 0.02 ? "echo" : mfForm > 0.02 || mfShow > 0.02 ? "motif" : null;
      const wantKey = want === "emblem" ? `emblem:${emOcc}` : want === "moment" ? `moment:${momentN}` : want === "motif" ? `motif:${motifN}` : want === "echo" ? `echo:${echoN}` : want;
      // IMAGE → IMAGE never retargets in place (zero-glitch audit 2026-10-07:
      // loadFormImage overwrote the image + its UVs while the field was still
      // wearing the old one — every mote re-aimed and its colour popped in one
      // frame): the old image releases to the procedural form first (~1.4 s),
      // THEN the new one loads and the field glides onto it
      if (want && wantKey !== imgKey && imgLoaded && !imgReleasing) { imgReleasing = true; imgReleaseAt = performance.now(); glitchRecord("particle-image-release", `${imgKey} -> ${wantKey}`); }
      if (imgReleasing && performance.now() - imgReleaseAt > 1400) { imgReleasing = false; imgLoaded = null; imgKey = null; }
      if (want && wantKey !== imgKey && !imgLoaded) {
        const em = emblemRef.current;
        // the flash itself is always the exact angel; every OTHER angel moment
        // (signature, emblem) takes the next treatment — angel, wings, outline …
        const pickFrom = em && em.length ? em[(treatN + emOcc) % em.length] : null;
        const img: HTMLCanvasElement | HTMLImageElement | null = flashing
          ? keyedFlashAngel(1)
          : want === "echo"
            ? echoUsed
            : want === "motif"
            ? motifCanvas.get(motifSrc) ?? null
            : want === "moment"
            ? (momentImgs.current.length ? momentImgs.current[momentN % momentImgs.current.length] : null)
            : resolveEmblem(want === "angel" && !(em && em.some((x) => typeof x === "string")) ? "@angel" : pickFrom);
        if (img) {
          engine.loadFormImage(img, img.width / Math.max(1, img.height), uvFor(img, engine.imageSampleCount()), !flashing);
          imgLoaded = want;
          imgKey = wantKey;
          if (!flashing) treatN++;
          // never the same twice (Karel 2026-10-06): mirror, tilt, size, how
          // literally it forms — the flash alone stays exact (it meets the flash image)
          const r1 = rand01(41 + appearN * 3 + emOcc), r2 = rand01(42 + appearN * 3 + emOcc), r3 = rand01(43 + appearN * 3 + emOcc);
          // EMBLEMS must read clearly (Karel 2026-10-06: "unclear stuff including the
          // first form"): larger, near-literal; angel moments keep their variety
          imgVar = want === "echo"
            ? { mirror: false, tilt: 0, scale: 1, literal: 1 }
            : want === "motif"
            ? { mirror: r1 < 0.5, tilt: (r2 - 0.5) * 0.6, scale: 0.8 + 0.25 * r3, literal: 0.82 }
            : want === "moment"
            ? { mirror: r1 < 0.5, tilt: 0, scale: 1.1, literal: 0.9 }
            : want === "emblem" && !(emblemRef.current?.some((x) => typeof x === "string"))
            ? { mirror: false, tilt: 0, scale: 1.05 + 0.1 * r3, literal: 0.97 }
            : { mirror: r1 < 0.5, tilt: (r2 - 0.5) * 0.3, scale: 0.85 + 0.3 * r3, literal: 0.7 + 0.2 * r2 };
          engine.setImageVariant(!flashing && imgVar.mirror, flashing || want === "echo" ? 0 : imgVar.tilt);
          // motif designs take the journey's palette; angel / emblem / blossom moment keep their own colours
          engine.setImageTint(want === "motif" ? 1 : 0);
          // (no setInstances here: re-laying a visible FIELD at once was a jump;
          // the image force dominates the instanced form while it is worn)
          appearN++;
          glitchRecord("particle-flash", want === "angel" ? (flashing ? "gather" : "angel signature") : want === "motif" ? "motif" : want === "moment" ? "blossom moment" : want === "echo" ? "echo" : `emblem ${emOcc}`);
        }
      }
      emblemOn = (imgLoaded === "emblem" && (emForm > 0.02 || emShow > 0.02)) || (imgLoaded === "moment" && momentOn);
      if (imgLoaded) {
        // a flash is full-frame (it matches the flash image); the emblem is
        // centred and generous; the signature angel smaller, off-centre
        // emblems smaller (Karel 2026-10-07: "a bit too big"); an ECHO aligns with the still (full frame)
        engine.setImageScale(flashing || imgLoaded === "echo" ? 1 : (imgLoaded === "emblem" ? 0.5 - 0.14 * emAge : imgLoaded === "moment" ? 0.95 : imgLoaded === "motif" ? 0.72 : 0.62) * imgVar.scale);
        // a motif design turns slowly while it is held
        if (imgLoaded === "motif" && motifAt >= 0) engine.setImageVariant(imgVar.mirror, imgVar.tilt + 0.35 * Math.sin((t - motifAt) * 0.09));
        // a TAD less literal (Karel 2026-10-06): never fully snapped to the
        // image — the field keeps a little drift and shimmer as it forms it
        const useEm = imgLoaded === "emblem";
        const useMo = imgLoaded === "moment";
        const useMf = imgLoaded === "motif";
        const useEc = imgLoaded === "echo";
        if (imgReleasing) engine.setImageForm(0, 0);
        else engine.setImageForm(Math.max(flashNow * 0.84, Math.max(angelForm, useEm ? emForm : 0, useMo ? moForm : 0, useMf ? mfForm : 0, useEc ? ecForm : 0) * imgVar.literal), Math.max(flashTail, angelShow, useEm ? emShow : 0, useMo ? moShow : 0, useMf ? mfShow : 0, useEc ? ecShow : 0));
      }
      if (imgLoaded && flashTail < 0.01 && fa < 0.3 && angelForm < 0.01 && angelShow < 0.01 && emForm < 0.01 && emShow < 0.01 && moForm < 0.01 && moShow < 0.01 && mfForm < 0.01 && mfShow < 0.01 && ecForm < 0.01 && ecShow < 0.01) { imgLoaded = null; imgKey = null; imgReleasing = false; engine.setImageForm(0, 0); engine.setImageVariant(false, 0); }
      const flashP = imgLoaded ? Math.max(flashTail, angelShow, imgLoaded === "emblem" ? emShow : 0, imgLoaded === "moment" ? moShow : 0) : 0;

      // every entrance GATHERS: scatter wide ONLY while truly invisible, then
      // the form pulls together — dispersing a visible form was the "drop out"
      // glitch Karel saw (the whole shape vanished in one frame)
      const visibleSoon = pr.presence > 0 || !!next || flashP > 0;
      if (visibleSoon && !wasVisible) {
        if (shown < 0.02) { engine.enter(); counters.current.entries++; }
      }
      wasVisible = visibleSoon;

      const dissolving = engine.dissolveTime() !== null;
      if (w) {
        if (w.soul !== lastAsked && (shown < 0.05 || (performance.now() - formAt > formDur && echoAt < 0 && motifAt < 0 && !imgLoaded))) { lastAsked = w.soul; switchForm(w.soul, t); }
        // sparse → form: density grows with what is SHOWN (never ahead of the fade)
        const target = pr.window ? pr.density : w.density;
        // an image form (emblem / angel) needs every mote to read clearly
        engine.setDensity(imgLoaded && !flashing ? 1 : Math.min(cast.mastered ? 0.8 : 1, target) * densKS * (0.3 + 0.7 * densP));
      }
      // evolve while visible: a new form (or the same form, a new figure),
      // morphing over ~7 s — never a cut
      if (shown > 0.5 && !imgLoaded && performance.now() - microAt > 8000) {
        microAt = performance.now();
        const j = (k: number) => (rand01(91 + k + Math.floor(microAt / 1000)) - 0.5) * 0.07;
        // a breath, never a new figure: z only drifts inside its discrete step
        // (the souls floor() it) — a crossing would re-aim the whole form
        const z = Math.max(0, Math.min(0.999, lastShape[2] + j(1)));
        let zOk = true;
        for (let n = 2; n <= 17 && zOk; n++) if (Math.floor(z * n) !== Math.floor(lastShape[2] * n)) zOk = false;
        lastShape = [lastShape[0], lastShape[1], zOk ? z : lastShape[2], Math.max(0, Math.min(0.999, lastShape[3] + j(2)))];
        engine.setShape(lastShape, false);
      }
      if (shown > 0.6 && !dissolving && !imgLoaded && echoAt < 0 && flashP < 0.05 && motifAt < 0 && performance.now() - formAt > formDur && rand01(61 + cycleIdx) < pMotif && startMotif(t)) {
        cycleIdx++;
      } else if (shown > 0.6 && !dissolving && !imgLoaded && echoAt < 0 && flashP < 0.05 && motifAt < 0 && performance.now() - formAt > formDur && cast.formCycle?.length) {
        cycleIdx++;
        if (cycleIdx % 3 === 0 && currentSoul) {
          engine.setShape(shapeSeed(currentSoul, t + cycleIdx * 7), false);
          formAt = performance.now();
          // (no appearance(): a refigure re-dollied + re-sized a visible form at once)
          glitchRecord("particle-form", `${currentSoul} refigure`);
        } else {
          const nxt = nextForm(t);
          if (nxt) switchForm(nxt, t);
        }
      }
      // the track's last seconds: everything has already faded (no drop at the handoff)
      const dur = useAudioStore.getState().duration || 0;
      const endFade = dur > 10 ? Math.max(0, Math.min(1, (dur - 1.5 - t) / 5)) : 1;
      // ambient: return between windows so the field is present ~60 % overall
      if (pr.presence <= 0 && flashP <= 0 && !next) {
        if (shown < 0.01) outSince += tickDt; else outSince = 0;
        // only where this journey is running UNDER budget (few morphs)
        if (!hush && ambientUntil < t && outSince > ambientGap && t > 4) {
          ambientUntil = t + 12 + 10 * rand01(22 + appearN);
          ambientGap = 3.5 + 2 * rand01(23 + appearN);
          const nxt = nextForm(t);
          if (nxt) { lastAsked = nxt; switchForm(nxt, t); engine.setDensity(densK * 0.6 * 0.3); }
          glitchRecord("particle-ambient", `${Math.round(ambientUntil - t)}s`);
        }
      } else outSince = 0;
      const ambientP = ambientUntil > t ? Math.min(1, (ambientUntil - t) / 3) : 0;
      if (ambientP > 0 && pr.presence <= 0) engine.setDensity(Math.min(cast.mastered ? 0.8 : 1, 0.6) * densKS * (0.3 + 0.7 * densP));
      // ≥5 s TO ABSORB (Karel 2026-10-07: "dont have particles come in only
      // to go away a second or two later … 5 seconds minimum"): once the
      // field arrives it holds ≥6 s before any fade-out begins
      if (shown > 0.15 && minHoldUntil < 0) minHoldUntil = t + 6;
      if (shown < 0.02) minHoldUntil = -1;
      const minHold = minHoldUntil > t ? 1 : 0;
      const targetPresence = Math.max(pr.presence, dissolving ? 1 : 0, flashP, ambientP, minHold) * endFade;
      shown = slew(shown, targetPresence, tickDt);
      if (shown > 0.3) onSec += tickDt;
      if (shown >= densP || shown < 0.005) densP = shown; // rise with the gather, hold through the fade
      densKS += (densK - densKS) * (1 - Math.exp(-tickDt / 6));
      // dynamics: the dolly glides through each appearance; placement holds
      // its third (a flash centres itself to meet the flash image)
      {
        const prog = Math.min(1, (performance.now() - dollyAt) / (dollyFrom < 0.9 ? 7000 : Math.max(4000, formDur * 1.6)));
        engine.setCamScale(dollyFrom + (dollyTo - dollyFrom) * prog);
        // a CENTRED shader (suns, portals, mandalas…) pins the field to its
        // exact centre point (Karel 2026-10-06)
        const mode = frameRef.current?.shaderMode;
        const pinCentre = flashing || emblemOn || imgLoaded === "echo" || isCenteredShader(mode);
        engine.setOffset(pinCentre ? 0 : offX, pinCentre ? 0 : offY);
        // First Light: a sun design RISES up the screen as it forms
        if (theme?.rising && imgLoaded === "motif" && motifAt >= 0) {
          const prog = Math.max(0, Math.min(1, (t - motifAt) / Math.max(6, motifDur)));
          engine.setOffset(offX * 0.3, 0.38 - 0.55 * prog);
        }
        // the imagery's movement sets the pace (flicker livelier, drift calmer)
        engine.setMotion(cast.motion * (charAt(t)?.motion ?? 1));
        // a shader with its own moving particles: follow + trail them
        // OFF until a non-blocking read exists: snapshotting the WebGL1 shader
        // canvas cost ~90 ms per sample on the kiosk (murmuration, 2026-10-06)
        // and saw nothing — the next step is motion measured INSIDE the
        // shader renderer (tiny FBO + async read), proven on the kiosk first
        if (FOLLOW_ENABLED && mode && PARTICLE_LIKE_SHADERS.has(mode) && shown > 0.2) sampleFollow(mode);
        else if (followOn) { engine.setFollow(0, 0, 0); followOn = false; }
      }
      if (!wasShown && shown > 0.05) { wasShown = true; glitchRecord("particle-in", `${currentSoul} t=${t.toFixed(1)}`); }
      else if (wasShown && shown < 0.01) { wasShown = false; glitchRecord("particle-out", `t=${t.toFixed(1)}`); }
      const wantRun = targetPresence > 0 || !!next || dissolving || shown > 0;
      // compile/warm while invisible — at most one warm draw per 400 ms, and
      // never while a clip is decoding (a warm draw builds a GPU pipeline)
      if (!running && warmTick++ % 4 === 0 && !isVideoActive()) engine.prewarm();
      if (wantRun && !running) { engine.start(); running = true; }
      if (!wantRun) {
        if (running && now - absentSince > 2500) { engine.stop(); running = false; }
      } else absentSince = now;

      // a held still: start the dissolve once the guard clears (same window)
      if (pr.window?.kind === "transition" && heldInWindow.current === pr.window.start && dissolvedWindow.current !== pr.window.start) {
        const nextPb = (cast.phaseBounds ?? []).find((x) => x > t);
        if (counters.current.dissolves < MAX_DISSOLVES_PER_JOURNEY && dissolveAllowed({
          inTransitionWindow: true,
          windowAlreadyDissolved: false,
          sincePhaseChange: (now - phaseRef.current.at) / 1000,
          boundarySettle: inBoundarySettle(),
          untilPhaseChange: nextPb === undefined ? Infinity : nextPb - t,
        }) && engine.startDissolve()) { // presence holds while it runs
          dissolvedWindow.current = pr.window.start;
          counters.current.dissolves++;
          counters.current.gate = "open (deferred)";
        }
      }

      // presence + break veil (CSS opacity): slew-limited above, eased here
      const presence = shown * shown * (3 - 2 * shown);
      // presence alone — NOT --shader-opacity: phases that favour imagery turn
      // the shaders down, and the particles were fading out with them (Karel
      // v3: "they often times get lost over the imaging")
      if (canvasRef.current) {
        canvasRef.current.style.opacity = (presence * 0.85).toFixed(3);
        // out of the compositor only after a full second at zero (the CSS
        // opacity transition must finish first — hiding early popped)
        if (presence > 0 || dissolving) zeroSince = now;
        canvasRef.current.style.visibility = now - zeroSince < 1000 ? "visible" : "hidden";
      }
      // a soft radial contrast veil under the form — never a full-frame wash
      if (contrastRef.current) {
        contrastRef.current.style.opacity = (presence * contrastK.current).toFixed(3);
        contrastRef.current.style.visibility = presence > 0 ? "visible" : "hidden";
      }
      // shader stack drops its supports only while particles actually lead
      if (!presentFlag && presence > 0.3) { presentFlag = true; setParticlePresent(true); }
      else if (presentFlag && presence < 0.05) { presentFlag = false; setParticlePresent(false); }
      // never veil a travel morph (they ride phase changes / the handoff)
      const guard = morphGuard((now - phaseRef.current.at) / 1000, inBoundarySettle());
      veilShown = slew(veilShown, (guard ? 0 : pr.breakVeil) * endFade, tickDt);
      const veil = veilShown;
      if (veilRef.current) veilRef.current.style.opacity = veil.toFixed(3);
      // alone on black, the field answers the music strongly (Karel 2026-10-06)
      // much more responsive (Karel 2026-10-06): 2.2× always, up to 3.8× alone on black
      engine.setReact(2.2 + 1.6 * veil);

      // colour: harmony per section + a drift on swells (hue/sat only — luma-safe)
      const st = engine.stats();
      // JUMP TRIPWIRE (zero-glitch law): a visible field where most sampled
      // motes rush near the speed cap = a form jump — logged with its trigger
      const mo = st.motion;
      // permanent CPU-side tripwire: every re-aim of a VISIBLE field is logged
      // with its trigger (each one now glides — this shows how often and why)
      {
        const lr = engine.lastRetarget();
        const key = `${lr.event}@${lr.at.toFixed(3)}`;
        if (lr.event && lr.ago < 1 && key !== lastRetargetLogged && shown > 0.3) {
          lastRetargetLogged = key;
          glitchRecord("particle-retarget", `${lr.event} soul=${currentSoul} img=${imgLoaded ?? "-"} shown=${shown.toFixed(2)}`);
        }
      }
      if (shown > 0.3 && mo.fastFrac > 0.45 && now - jumpRecAt > 4000) {
        jumpRecAt = now;
        glitchRecord("particle-jump", `${mo.meanSpeed.toFixed(2)}u/s fast=${(mo.fastFrac * 100).toFixed(0)}% glide=${mo.glide.toFixed(2)} after=${mo.lastEvent}@${mo.lastEventAgo.toFixed(1)}s soul=${currentSoul} img=${imgLoaded ?? "-"}`);
      }
      const c = colorAt(cast, t);
      // spectrum forms carry vivid full-spectrum colour
      const satK = spectrumNow ? 1.45 : 1;
      engine.setHue(c.hue + 0.06 * st.swell, c.sat * satK * (1 + 0.1 * st.swell));
      // colour = the journey's IMAGE palette (this phase's stills), voiced for
      // the section; the theme palette only where no image palette exists
      const pbs = cast.phaseBounds ?? [];
      const phaseIdx = pbs.filter((b) => b <= t).length;
      const ip = JOURNEY_IMAGE_PALETTES[journeyId];
      const ipPhase = ip ? (ip.phases[phaseIdx] ?? ip) : null;
      const pp = palRef.current;
      // ALWAYS changing (Karel 2026-10-06: "the colors need to always be
      // changing and reflecting the palette not static"): a continuous glide
      // through the palette's voicings (~11 s per step), led by the section
      const fire = !!charAt(t)?.fire;
      const floral = !fire && !!charAt(t)?.floral;
      // colours keep moving everywhere (Karel 2026-10-07: Realized's changing colours "do everywhere")
      const vf = c.voice + t / (charAt(t)?.fire ? 7 : 8);
      const v0 = Math.floor(vf) % 4;
      const vfr = vf - Math.floor(vf);
      const vk = ipPhase ? `img:${phaseIdx}:${v0}:${fire}:${floral}` : pp ? `${pp.primary}${pp.secondary}${pp.accent}${pp.glow}:${v0}` : "";
      if (vk && vk !== palVoiceKey) {
        const ghost = cast.signatureImage === "angel";
        // every journey's particles wear ITS palette (Karel 2026-10-06: "pink in
        // vespers … dont match the palette"): pink flowers are Ghost's alone
        // Ghost (Karel 2026-10-07: "why are they always white? pink perfect for flowers
        // but should … echo the imaging and vibe and be diverse"): its phase imagery,
        // voiced vivid; the white/pink ghost palette only where flowers are seen
        const mk = (v: number) => (theme?.palette === "dawn" ? particlePaletteDawn(v) : ghost && (floral || !ipPhase) ? particlePaletteGhost(floral, v) : ghost ? vivid(particlePaletteFromImage(ipPhase, v)) ?? particlePaletteGhost(floral, v) : fire ? particlePaletteFire(ipPhase, v) : ipPhase ? particlePaletteFromImage(ipPhase, v) : particlePaletteFrom(pp, v));
        palPair = [mk(v0), mk((v0 + 1) % 4)];
        palVoiceKey = vk;
      }
      if (palPair[0] && palPair[1]) paletteTarget.current = lerpPalette(palPair[0], palPair[1], vfr * vfr * (3 - 2 * vfr));
      const target = paletteTarget.current;
      // the engine glides every colour change per frame (critically damped, ~5 s)
      if (target) engine.setPalette(target);

      // playfulness: scatter on runs of fast notes, bounce on a steady pulse,
      // a few motes follow the melody — serene pieces stay calm
      if (running && pr.presence > 0.3 && cast.playfulness >= 0.45) {
        if (st.onsets > lastOnsets) {
          for (let i = lastOnsets; i < st.onsets; i++) onsetTimes.push(now);
          if (cast.rhythmic) { engine.impulse("bounce", 0.18 + 0.2 * cast.playfulness); counters.current.bounces++; }
        }
        while (onsetTimes.length && now - onsetTimes[0] > 2000) onsetTimes.shift();
        if (onsetTimes.length >= 3 && now - lastScatter > 10_000) {
          engine.impulse("scatter", 0.35 + 0.45 * cast.playfulness);
          lastScatter = now;
          counters.current.scatters++;
        }
        const mid = proc.levels.slice(32, 96);
        let wsum = 0, csum = 0;
        for (let i = 0; i < mid.length; i++) { wsum += mid[i]; csum += mid[i] * i; }
        const pitch = wsum > 1e-3 ? csum / wsum / mid.length : 0.5;
        engine.setMelody([Math.sin(now / 2900) * 1.6, -1.2 + 2.4 * pitch, Math.cos(now / 3700) * 0.8], 0.5 * cast.playfulness * Math.min(1, wsum / 12));
      } else engine.setMelody(null);
      lastOnsets = st.onsets;

      (window as unknown as Record<string, unknown>).__resonanceParticleLead = {
        journeyId,
        name: cast.name,
        jumpScore: { meanSpeed: +st.motion.meanSpeed.toFixed(3), fastFrac: +st.motion.fastFrac.toFixed(3), glide: +st.motion.glide.toFixed(2), lastEvent: st.motion.lastEvent },
        t,
        presence: +presence.toFixed(3),
        veil: +veil.toFixed(3),
        morph: isVideoActive(),
        window: useEm ? `morph@${em?.start.toFixed(0)}` : pr.window ? `${pr.window.kind}@${pr.window.start.toFixed(0)}` : null,
        contrastK: contrastK.current,
        programs: st.programs,
        warmLog: st.warmLog,
        maxSpeed: +st.state.maxSpeed.toFixed(3),
        running,
        soul: st.soul,
        transition: st.transition,
        density: st.density,
        dissolve: st.dissolve,
        hue: +st.hue.toFixed(3),
        sat: +st.sat.toFixed(3),
        scatter: +st.scatter.toFixed(3),
        ...counters.current,
        fps: st.fps,
        fpsLow: st.fpsLow,
        count: st.count,
        dpr: st.dpr,
        tier,
        bands: st.bands,
        swell: st.swell,
        meanLum: st.meanLum,
        maxLumStep: st.maxLumStep,
        state: st.state,
        stamp: Date.now(),
      };
    };
    const iv = window.setInterval(tick, 100);
    tick();

    return () => {
      window.clearInterval(iv);
      offClip();
      setParticlePresent(false);
      window.removeEventListener("resize", onResize);
      sh.hooks.audio = null;
      offStart();
      offDisable();
      // keep the shared engine + context for the next journey; a VISIBLE field
      // fades out over 1.5 s (jump / skip) instead of vanishing in one frame
      disposed = true;
      window.clearTimeout(motifTimer);
      releaseSharedParticleEngineWithFade();
      engineRef.current = null;
      delete (window as unknown as Record<string, unknown>).__resonanceParticleLead;
    };
  }, [cast, journeyId]);

  // palette follows the phase palette (theme); the tick picks the section's
  // voicing of it (which palette colours sit on low / mid / high)
  useEffect(() => {
    palRef.current = pal ?? null;
    paletteTarget.current = particlePaletteFrom(pal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palKey]);

  // ── image dissolve ↔ reform: once per conducted transition window ─────────
  useEffect(() => {
    if (!cast.dissolve || !imageSrc) return;
    counters.current.stills++;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img
      .decode()
      .then(() => {
        const engine = engineRef.current;
        if (cancelled || !engine || !img.naturalWidth) return;
        const w = 384;
        const h = Math.max(1, Math.round((w * img.naturalHeight) / img.naturalWidth));
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const c2 = cv.getContext("2d", { willReadFrequently: true }); // CPU-backed: getImageData never reads back from the GPU
        if (!c2) return;
        c2.drawImage(img, 0, 0, w, h);
        // the still's brightness sets how much the contrast veil lifts the form
        try {
          const d = c2.getImageData(0, 0, w, h).data;
          let L = 0, n = 0;
          for (let i = 0; i < d.length; i += 64) { L += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; n++; }
          L /= Math.max(1, n);
          // bright, busy stills get a deeper veil AND brighter particles (measured
          // headless: forms vanished over Snowflake's ice / Stir Crazy's amber)
          contrastK.current = Math.max(0.25, Math.min(0.78, 0.25 + (L - 0.08) * 2.4));
          engineRef.current?.setGain((cast.gain ?? 1) * 1.45 * (1 + 2.2 * Math.max(0, Math.min(0.4, L - 0.06))));
        } catch { /* tainted canvas — keep the last strength */ }
        const win = windowRef.current;
        const ok = counters.current.dissolves < MAX_DISSOLVES_PER_JOURNEY && dissolveAllowed({
          inTransitionWindow: win?.kind === "transition",
          windowAlreadyDissolved: !!win && dissolvedWindow.current === win.start,
          sincePhaseChange: (performance.now() - phaseRef.current.at) / 1000,
          boundarySettle: inBoundarySettle(),
          untilPhaseChange: (() => {
            const t = useAudioStore.getState().currentTime || 0;
            const nxt = (cast.phaseBounds ?? []).find((x) => x > t);
            return nxt === undefined ? Infinity : nxt - t;
          })(),
        });
        counters.current.gate = ok ? "open" : win?.kind === "transition" ? "held" : "rest";
        if (!ok && win?.kind === "transition" && dissolvedWindow.current !== win.start) heldInWindow.current = win.start;
        if (engine.dissolveTo(cv, img.naturalWidth / img.naturalHeight, ok)) {
          dissolvedWindow.current = win?.start ?? null;
          counters.current.dissolves++;
        }
      })
      .catch(() => {
        /* a still that can't be sampled just doesn't dissolve */
      });
    return () => {
      cancelled = true;
    };
  }, [imageSrc, cast.dissolve, cast.phaseBounds, cast.gain]);

  if (failed) return null;
  return (
    <>
      <div
        ref={veilRef}
        aria-hidden
        style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none", background: "#000", opacity: 0, transition: "opacity 1.5s linear" }}
      />
      <div
        ref={contrastRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 3,
          pointerEvents: "none",
          background: "radial-gradient(ellipse 48% 54% at 50% 50%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.65) 50%, rgba(0,0,0,0) 100%)",
          opacity: 0,
          transition: "opacity 1.2s linear",
        }}
      />
      {/* the shared particle canvas is re-parented in here (one context per session) */}
      <div ref={hostRef} aria-hidden style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }} />
    </>
  );
}
