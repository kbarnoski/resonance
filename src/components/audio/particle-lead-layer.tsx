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
import { isCenteredShader, PARTICLE_LIKE_SHADERS } from "@/lib/journeys/particle-motifs";
import type { ParticleEngine } from "@/lib/particles/particle-engine";
import { acquireSharedParticleEngine, onParticlesDisabled, particlesDisabledReason } from "@/lib/particles/shared-engine";
import { SpectrumProcessor } from "@/lib/particles/spectrum";
import type { SoulId } from "@/lib/particles/souls";
import { lerpPalette, type ParticlePalette } from "@/lib/particles/souls";
import { JOURNEY_IMAGE_PALETTES } from "@/lib/particles/journey-palettes.generated";
import { particlePaletteFromImage, particlePaletteFire } from "@/lib/journeys/particle-lead";
import { MAX_DISSOLVES_PER_JOURNEY, dissolveAllowed, morphGuard, particlePaletteFrom, type ParticleLeadCast } from "@/lib/journeys/particle-lead";
import { presenceAt, colorAt } from "@/lib/journeys/particle-casting";
import type { JourneyFrame } from "@/lib/journeys/types";

const budgetFor = () => TIER_BUDGET[getDeviceTier()] ?? TIER_BUDGET.medium;

const TIER_BUDGET = {
  // Measured headless on the kiosk's M4 Pro, Lantern in pack mode (journey
  // alone, 3 shaders: 99 fps): 410k @ DPR 2 → 65 fps · 410k @ 1.5 → 74 ·
  // 262k @ 1.5 → 109 fps, p95 16.7 ms (one supporting shader). DPR matches
  // the shader stack's 1.5× ceiling (visualizer.tsx).
  high: { count: 262_144, dpr: 1.5, trailScale: 1 },
  medium: { count: 131_072, dpr: 1.25, trailScale: 1 },
  low: { count: 65_536, dpr: 1, trailScale: 0 },
} as const;

/** Souls this journey will show, in the order it will show them (intro, the
 *  conducted windows, each travel morph's form) — pre-compiled at journey start. */
/** Particles stay this long after a morph video ends (Karel: "present when
 *  morph videos end … extending after"). 18 s held Snowflake at ~90 %
 *  presence (morphs every ~30 s); 10 s keeps the law and lands near 60 %. */
const MORPH_TAIL_SEC = 10;

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
    const tier = getDeviceTier();
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
    // compile + warm everything this journey will show NOW, invisibly
    engine.prepare(soulSequence(cast));
    engine.setGain((cast.gain ?? 1) * 1.7);
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
    const ANGEL_SEC = 22;
    const signatureAt = (t: number) => {
      const pbs = cast.phaseBounds ?? [];
      const idx = pbs.filter((x) => x <= t).length;
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
    let current: ParticlePalette | null = null;
    let lastOnsets = 0;
    const onsetTimes: number[] = [];
    let lastScatter = -1e9;

    let wasVisible = false;
    let warmTick = 0;
    let presentFlag = false;
    // SMOOTH FADES ONLY (Karel 2026-10-05: "the particles always need to
    // smoothly fade out not drop out"): what is shown is slew-limited —
    // ≥1.5 s to fade in, ≥3.5 s to fade out, whatever the conductor asks
    let shown = 0;
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
      const kLo = quietImaging ? 0.9 : 0.45;
      const k = Math.exp(Math.log(kLo) + rand01(1) * (Math.log(2.3) - Math.log(kLo)));
      dollyFrom = k;
      dollyTo = k * (0.62 + 0.85 * rand01(4));
      dollyAt = performance.now();
      densK = quietImaging ? 0.22 + 0.4 * rand01(2) : 0.3 + 0.7 * rand01(2);
      // forms HOLD (Karel 2026-10-06: "change should be smooth and not jump
      // between shapes quickly")
      formDur = 20_000 + 14_000 * rand01(3);
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
      engine.setSizeScale(0.6 + 1.4 * rand01(9));
    };
    // the forms THIS phase's imagery calls for (vision-tagged) — else the cycle
    const phaseIdxAt = (t: number) => (cast.phaseBounds ?? []).filter((b) => b <= t).length;
    const charAt = (t: number) => cast.phaseChars?.[Math.min(phaseIdxAt(t), (cast.phaseChars?.length ?? 1) - 1)];
    const formsNow = (t: number): SoulId[] => { const f = charAt(t)?.forms; return f && f.length ? f : cast.formCycle; };
    const switchForm = (soul: SoulId, t: number) => {
      const quiet = shown < 0.05;
      engine.setSoul(soul, quiet ? 0.5 : 12);
      engine.setShape(shapeSeed(soul, t + appearN * 11), quiet);
      currentSoul = soul;
      formAt = performance.now();
      appearance();
      glitchRecord("particle-form", `${soul}${quiet ? " (quiet)" : ""}`);
    };
    let wasShown = false;
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
    let flashLoaded = false;
    // ambient presence (Karel 2026-10-06: "on average particles should be
    // part of the journey around 60% of the time"): between conducted
    // windows the field returns for 12–22 s after 12–20 s away (measured
    // ~80 % with longer returns — tuned toward 60 %)
    let ambientUntil = -1;
    let onSec = 0;
    let outSince = 0;
    let ambientGap = 12 + 8 * rand01(21);
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
      const pr0 = presenceAt(cast, t);
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
      const useEm = emP > pr0.presence;
      const pr = useEm
        ? { presence: emP, window: null, breakVeil: 0, density: 0.5 }
        : pr0;
      // look-ahead: wake the field 3 s before a window so it has formed by the fade-in
      const next = cast.windows.find((w) => w.start > t && w.start - t < 3);
      const w = useEm ? { soul: emSoul, density: 0.5 } : pr.window ?? next ?? null;
      windowRef.current = pr.window ? { kind: pr.window.kind, start: pr.window.start } : null;

      // ── Ghost's angel flash: gather into the angel, wear it, dissipate ──
      const fl = flashRef.current;
      const fa = fl?.approach ?? 0;
      const fi = fl?.impulse ?? 0;
      const gather = fa <= 0.45 ? 0 : fa >= 0.9 ? 1 : ((fa - 0.45) / 0.45) ** 2 * (3 - 2 * ((fa - 0.45) / 0.45));
      const flashNow = Math.max(gather, fi);
      if (flashNow > 0.02 && !flashLoaded) {
        const img = keyedFlashAngel(1);
        if (img) { engine.loadFormImage(img, img.width / Math.max(1, img.height)); flashLoaded = true; glitchRecord("particle-flash", "gather"); }
      }
      flashTail = Math.max(flashTail - tickDt / 3.2, flashNow);
      // the angel signature: gather 4 s, hold (breathing), dissipate over 6 s
      let angelForm = 0, angelShow = 0;
      if (angelAt >= 0) {
        const a = t - angelAt;
        const ssf = (e0: number, e1: number, x: number) => { const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
        angelForm = ssf(0, 4, a) * (1 - ssf(ANGEL_SEC - 8, ANGEL_SEC - 3, a)) * (0.9 + 0.1 * Math.sin(a * 0.8));
        angelShow = ssf(0.5, 4.5, a) * (1 - ssf(ANGEL_SEC - 5, ANGEL_SEC, a));
        if (a > ANGEL_SEC) angelAt = -1;
        if ((angelForm > 0.02 || angelShow > 0.02) && !flashLoaded) {
          const img = keyedFlashAngel(1);
          if (img) { engine.loadFormImage(img, img.width / Math.max(1, img.height)); flashLoaded = true; glitchRecord("particle-flash", "angel signature"); }
        }
      }
      const flashing = flashNow > 0.02 || flashTail > 0.02;
      if (flashLoaded) {
        // a flash is centred (it matches the flash image); the signature angel
        // is smaller and sits off-centre
        engine.setImageScale(flashing ? 1 : 0.62);
        // a TAD less literal (Karel 2026-10-06): never fully snapped to the
        // image — the field keeps a little drift and shimmer as it forms it
        engine.setImageForm(Math.max(flashNow, angelForm) * 0.84, Math.max(flashTail, angelShow));
      }
      if (flashLoaded && flashTail < 0.01 && fa < 0.3 && angelForm < 0.01 && angelShow < 0.01) { flashLoaded = false; engine.setImageForm(0, 0); }
      const flashP = flashLoaded ? Math.max(flashTail, angelShow) : 0;

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
        if (w.soul !== lastAsked) { lastAsked = w.soul; switchForm(w.soul, t); }
        // sparse → form: density grows with what is SHOWN (never ahead of the fade)
        const target = pr.window ? pr.density : w.density;
        engine.setDensity(Math.min(cast.mastered ? 0.8 : 1, target) * densKS * (0.3 + 0.7 * densP));
      }
      // evolve while visible: a new form (or the same form, a new figure),
      // morphing over ~7 s — never a cut
      if (shown > 0.6 && !dissolving && flashP < 0.05 && performance.now() - formAt > formDur && cast.formCycle?.length) {
        cycleIdx++;
        if (cycleIdx % 3 === 0 && currentSoul) {
          engine.setShape(shapeSeed(currentSoul, t + cycleIdx * 7), false);
          formAt = performance.now();
          appearance();
          glitchRecord("particle-form", `${currentSoul} refigure`);
        } else {
          const fl = formsNow(t);
          let nxt = fl[cycleIdx % fl.length];
          if (nxt === currentSoul) nxt = fl[(cycleIdx + 1) % fl.length];
          switchForm(nxt, t);
        }
      }
      // the track's last seconds: everything has already faded (no drop at the handoff)
      const dur = useAudioStore.getState().duration || 0;
      const endFade = dur > 10 ? Math.max(0, Math.min(1, (dur - 1.5 - t) / 5)) : 1;
      // ambient: return between windows so the field is present ~60 % overall
      if (pr.presence <= 0 && flashP <= 0 && !next) {
        if (shown < 0.01) outSince += tickDt; else outSince = 0;
        // only where this journey is running UNDER budget (few morphs)
        if (ambientUntil < t && outSince > ambientGap && t > 30 && onSec / Math.max(1, t) < 0.5) {
          ambientUntil = t + 12 + 10 * rand01(22 + appearN);
          ambientGap = 12 + 8 * rand01(23 + appearN);
          const fl = formsNow(t);
          const nxt = fl[(++cycleIdx) % Math.max(1, fl.length)];
          if (nxt) { lastAsked = nxt; switchForm(nxt, t); engine.setDensity(densK * 0.6 * 0.3); }
          glitchRecord("particle-ambient", `${Math.round(ambientUntil - t)}s`);
        }
      } else outSince = 0;
      const ambientP = ambientUntil > t ? Math.min(1, (ambientUntil - t) / 3) : 0;
      if (ambientP > 0 && pr.presence <= 0) engine.setDensity(Math.min(cast.mastered ? 0.8 : 1, 0.6) * densKS * (0.3 + 0.7 * densP));
      const targetPresence = Math.max(pr.presence, dissolving ? 1 : 0, flashP, ambientP) * endFade;
      shown = slew(shown, targetPresence, tickDt);
      if (shown > 0.3) onSec += tickDt;
      if (shown >= densP || shown < 0.005) densP = shown; // rise with the gather, hold through the fade
      densKS += (densK - densKS) * (1 - Math.exp(-tickDt / 6));
      // dynamics: the dolly glides through each appearance; placement holds
      // its third (a flash centres itself to meet the flash image)
      {
        const prog = Math.min(1, (performance.now() - dollyAt) / Math.max(4000, formDur * 1.6));
        engine.setCamScale(dollyFrom + (dollyTo - dollyFrom) * prog);
        // a CENTRED shader (suns, portals, mandalas…) pins the field to its
        // exact centre point (Karel 2026-10-06)
        const mode = frameRef.current?.shaderMode;
        const pinCentre = flashing || isCenteredShader(mode);
        engine.setOffset(pinCentre ? 0 : offX, pinCentre ? 0 : offY);
        // the imagery's movement sets the pace (flicker livelier, drift calmer)
        engine.setMotion(cast.motion * (charAt(t)?.motion ?? 1));
        // a shader with its own moving particles: follow + trail them
        if (mode && PARTICLE_LIKE_SHADERS.has(mode) && shown > 0.2) sampleFollow(mode);
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
        canvasRef.current.style.opacity = presence.toFixed(3);
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
      engine.setReact(1.15 + 1.6 * veil);

      // colour: harmony per section + a drift on swells (hue/sat only — luma-safe)
      const st = engine.stats();
      const c = colorAt(cast, t);
      engine.setHue(c.hue + 0.06 * st.swell, c.sat * (1 + 0.1 * st.swell));
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
      const vf = c.voice + t / 11;
      const v0 = Math.floor(vf) % 4;
      const vfr = vf - Math.floor(vf);
      const vk = ipPhase ? `img:${phaseIdx}:${v0}:${fire}` : pp ? `${pp.primary}${pp.secondary}${pp.accent}${pp.glow}:${v0}` : "";
      if (vk && vk !== palVoiceKey) {
        const mk = (v: number) => (fire ? particlePaletteFire(ipPhase, v) : ipPhase ? particlePaletteFromImage(ipPhase, v) : particlePaletteFrom(pp, v));
        palPair = [mk(v0), mk((v0 + 1) % 4)];
        palVoiceKey = vk;
      }
      if (palPair[0] && palPair[1]) paletteTarget.current = lerpPalette(palPair[0], palPair[1], vfr * vfr * (3 - 2 * vfr));
      const target = paletteTarget.current;
      if (target) {
        current = current ? lerpPalette(current, target, 0.06) : target;
        engine.setPalette(current);
      }

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
      // keep the shared engine + context for the next journey; just detach
      engine.stop();
      sh.hooks.audio = null;
      offStart();
      offDisable();
      sh.canvas.style.visibility = "hidden";
      sh.canvas.style.opacity = "0";
      if (sh.canvas.parentElement === host) host.removeChild(sh.canvas);
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
        const c2 = cv.getContext("2d");
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
          engineRef.current?.setGain((cast.gain ?? 1) * 1.7 * (1 + 2.2 * Math.max(0, Math.min(0.4, L - 0.06))));
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
