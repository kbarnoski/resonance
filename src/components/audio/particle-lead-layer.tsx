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
import type { ParticleEngine } from "@/lib/particles/particle-engine";
import { acquireSharedParticleEngine, onParticlesDisabled, particlesDisabledReason } from "@/lib/particles/shared-engine";
import { SpectrumProcessor } from "@/lib/particles/spectrum";
import type { SoulId } from "@/lib/particles/souls";
import { lerpPalette, type ParticlePalette } from "@/lib/particles/souls";
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
      emergeRef.current = { start: t, end: t + dur + 18, soul: morphSoulAt(t + 1.5) };
      counters.current.emergences++;
    });
    const offClip = onClipEnded((e) => {
      if (!e.travel) return;
      const t = useAudioStore.getState().currentTime || 0;
      const em = emergeRef.current;
      if (em && t < em.end + 1) em.end = Math.max(em.end, t + 18);
      else emergeRef.current = { start: t, end: t + 18, soul: morphSoulAt(t) };
    });
    // signature phases: their entry always raises the journey's own form,
    // travel clip or not (Ghost's spirit — some boundaries are crossfades)
    let lastPhaseIdx = -1;
    const signatureAt = (t: number) => {
      const pbs = cast.phaseBounds ?? [];
      const idx = pbs.filter((x) => x <= t).length;
      if (lastPhaseIdx >= 0 && idx === lastPhaseIdx + 1 && cast.signatureMorphs?.includes(idx)) {
        const em = emergeRef.current;
        const soul = cast.morphSouls[Math.min(idx, cast.morphSouls.length - 1)] ?? cast.souls.transition;
        if (!em || t > em.end - 3 || em.soul !== soul) emergeRef.current = { start: t, end: t + 26, soul };
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
    // variety (Karel 2026-10-06: "limited amount of shapes … always the same
    // amount and the same distance"): forms evolve while visible, and every
    // appearance draws its own figure, distance and density
    let lastAsked = "";
    let currentSoul = "";
    let formAt = performance.now();
    let formDur = 14_000;
    let cycleIdx = 0;
    let densK = 0.7;
    let appearN = 0;
    const rand01 = (k: number) => { let x = Math.imul((appearN + 1) * 0x9e3779b9 ^ k * 0x85ebca6b ^ journeyId.length * 0xc2b2ae35, 2246822519); x ^= x >>> 15; x = Math.imul(x, 3266489917); x ^= x >>> 13; return (x >>> 0) / 4294967296; };
    const appearance = () => {
      appearN++;
      // near & large ↔ far & small: weighted toward NEAR (the field is the
      // closest element — depth is its gift)
      const r = rand01(1);
      engine.setCamScale(0.58 + 0.95 * r * r);
      densK = 0.3 + 0.7 * rand01(2);
      formDur = 10_000 + 9_000 * rand01(3);
    };
    const switchForm = (soul: SoulId, t: number) => {
      const quiet = shown < 0.05;
      engine.setSoul(soul, quiet ? 0.5 : 7);
      engine.setShape(shapeSeed(soul, t + appearN * 11), quiet);
      currentSoul = soul;
      formAt = performance.now();
      appearance();
      glitchRecord("particle-form", `${soul}${quiet ? " (quiet)" : ""}`);
    };
    let wasShown = false;
    // flash form (Ghost)
    let flashTail = 0;
    let flashLoaded = false;
    let lastTick = performance.now();
    let palVoiceKey = "";
    const FADE_IN_SEC = 1.5;
    const FADE_OUT_SEC = 3.5;
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
      if (flashLoaded) engine.setImageForm(flashNow, flashTail);
      if (flashLoaded && flashTail < 0.01 && fa < 0.3) { flashLoaded = false; engine.setImageForm(0, 0); }
      const flashP = flashLoaded ? flashTail : 0;

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
        engine.setDensity(Math.min(cast.mastered ? 0.8 : 1, target) * densK * (0.3 + 0.7 * shown));
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
          let nxt = cast.formCycle[cycleIdx % cast.formCycle.length];
          if (nxt === currentSoul) nxt = cast.formCycle[(cycleIdx + 1) % cast.formCycle.length];
          switchForm(nxt, t);
        }
      }
      // the track's last seconds: everything has already faded (no drop at the handoff)
      const dur = useAudioStore.getState().duration || 0;
      const endFade = dur > 10 ? Math.max(0, Math.min(1, (dur - 1.5 - t) / 5)) : 1;
      const targetPresence = Math.max(pr.presence, dissolving ? 1 : 0, flashP) * endFade;
      shown = slew(shown, targetPresence, tickDt);
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

      // presence + break veil (CSS opacity), slew-limited above
      const presence = shown;
      // presence alone — NOT --shader-opacity: phases that favour imagery turn
      // the shaders down, and the particles were fading out with them (Karel
      // v3: "they often times get lost over the imaging")
      if (canvasRef.current) {
        canvasRef.current.style.opacity = presence.toFixed(3);
        // out of the compositor entirely while absent
        canvasRef.current.style.visibility = presence > 0 || dissolving ? "visible" : "hidden";
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

      // colour: harmony per section + a drift on swells (hue/sat only — luma-safe)
      const st = engine.stats();
      const c = colorAt(cast, t);
      engine.setHue(c.hue + 0.06 * st.swell, c.sat * (1 + 0.1 * st.swell));
      // the journey's palette, voiced for this section
      const pp = palRef.current;
      const vk = pp ? `${pp.primary}${pp.secondary}${pp.accent}${pp.glow}:${c.voice}` : "";
      if (pp && vk !== palVoiceKey) { paletteTarget.current = particlePaletteFrom(pp, c.voice); palVoiceKey = vk; }
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
