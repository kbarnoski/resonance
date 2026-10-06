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
import { isVideoActive, inBoundarySettle, onClipEnded } from "@/lib/journeys/video-activity";
import { setParticlePresent } from "@/lib/journeys/particle-presence";
import { createParticleEngine, type ParticleEngine } from "@/lib/particles/particle-engine";
import { SpectrumProcessor } from "@/lib/particles/spectrum";
import { lerpPalette, type ParticlePalette } from "@/lib/particles/souls";
import { dissolveAllowed, morphGuard, particlePaletteFrom, type ParticleLeadCast } from "@/lib/journeys/particle-lead";
import { presenceAt, colorAt } from "@/lib/journeys/particle-casting";
import type { JourneyFrame } from "@/lib/journeys/types";

const TIER_BUDGET = {
  // Measured headless on the kiosk's M4 Pro, Lantern in pack mode (journey
  // alone, 3 shaders: 99 fps): 410k @ DPR 2 → 65 fps · 410k @ 1.5 → 74 ·
  // 262k @ 1.5 → 109 fps, p95 16.7 ms (one supporting shader). DPR matches
  // the shader stack's 1.5× ceiling (visualizer.tsx).
  high: { count: 262_144, dpr: 1.5, trailScale: 1 },
  medium: { count: 131_072, dpr: 1.25, trailScale: 1 },
  low: { count: 65_536, dpr: 1, trailScale: 0 },
} as const;

export function ParticleLeadLayer({
  cast,
  journeyId,
  frame,
  analyser,
  imageSrc = null,
  paused = false,
}: {
  cast: ParticleLeadCast;
  journeyId: string;
  frame: JourneyFrame | null;
  analyser: AnalyserLike | null;
  /** The still that just entered the collage (dissolve trigger). */
  imageSrc?: string | null;
  paused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const contrastRef = useRef<HTMLDivElement | null>(null);
  // emergence after a travel morph: [startT, endT] in track seconds
  const emergeRef = useRef<{ start: number; end: number } | null>(null);
  const contrastK = useRef(0.35);
  const engineRef = useRef<ParticleEngine | null>(null);
  const analyserRef = useRef<AnalyserLike | null>(analyser);
  const pausedRef = useRef(paused);
  const paletteTarget = useRef<ParticlePalette | null>(null);
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tier = getDeviceTier();
    const budget = TIER_BUDGET[tier] ?? TIER_BUDGET.medium;
    const proc = new SpectrumProcessor({ bins: 96, source: "kinetic" });
    let bytes = new Uint8Array(128);
    let engine: ParticleEngine;
    try {
      engine = createParticleEngine(canvas, {
        // mastered journeys carry the heaviest imagery stacks (Ghost's flashes,
        // Snowflake's pinned takes) and keep their full shader stack — the
        // particle layer takes half the budget there
        count: cast.mastered ? Math.round(budget.count / 2) : budget.count,
        // …and a lighter DPR (they keep their full shader stack)
        dpr: cast.mastered ? Math.min(budget.dpr, 1.25) : budget.dpr,
        trailScale: budget.trailScale,
        transparent: true,
        // v3 overlay: smaller, denser, brighter-cored forms that read over imagery
        gain: (cast.gain ?? 1) * 1.7,
        camScale: 1.35,
        maxSpeed: 2.2,
        soul: cast.windows[0]?.soul ?? cast.souls.transition,
        onContextLost: () => setFailed(true),
        audio: (dt) => {
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
        },
      });
    } catch {
      setFailed(true); // no WebGL2 float targets — the journey plays without its lead
      return;
    }
    engineRef.current = engine;
    engine.setMotion(cast.motion);
    engine.setForm(cast.form);
    engine.setHueSpread(cast.hueSpread);
    // RULE (Karel v3): particles EMERGE at the end of every travel morph and
    // overlay the next sequence — a gathering form for ~18 s
    const offClip = onClipEnded((e) => {
      if (!e.travel) return;
      const t = useAudioStore.getState().currentTime || 0;
      emergeRef.current = { start: t, end: t + 18 };
      counters.current.emergences++;
    });
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);

    let running = false;
    let absentSince = performance.now();
    let current: ParticlePalette | null = null;
    let lastSoul = "";
    let lastOnsets = 0;
    const onsetTimes: number[] = [];
    let lastScatter = -1e9;

    let wasVisible = false;
    let presentFlag = false;
    const tick = () => {
      const now = performance.now();
      const t = useAudioStore.getState().currentTime || 0;
      const pr0 = presenceAt(cast, t);
      // emergence window after a travel morph (3 s gather in, 3 s out)
      const em = emergeRef.current;
      let emP = 0;
      if (em) {
        const x = Math.min((t - em.start) / 3, (em.end - t) / 3);
        emP = x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
        if (t > em.end + 1 || t < em.start - 1) emergeRef.current = null;
      }
      const phaseIdx = (cast.phaseBounds ?? []).filter((x) => x <= t + 0.5).length;
      const emSoul = cast.morphSouls[Math.min(phaseIdx, cast.morphSouls.length - 1)] ?? cast.souls.transition;
      const useEm = emP > pr0.presence;
      const pr = useEm
        ? { presence: emP, window: null, breakVeil: 0, density: 0.5 }
        : pr0;
      // look-ahead: wake the field 3 s before a window so it has formed by the fade-in
      const next = cast.windows.find((w) => w.start > t && w.start - t < 3);
      const w = useEm ? { soul: emSoul, density: 0.5 } : pr.window ?? next ?? null;
      windowRef.current = pr.window ? { kind: pr.window.kind, start: pr.window.start } : null;

      // every entrance GATHERS: scatter wide while invisible, then the form
      // pulls together with the speed cap ramping up — never a burst
      const visibleSoon = pr.presence > 0 || !!next;
      if (visibleSoon && !wasVisible) {
        engine.enter();
        counters.current.entries++;
      }
      wasVisible = visibleSoon;

      if (w) {
        if (w.soul !== lastSoul) {
          engine.setSoul(w.soul, pr.presence > 0.05 ? 8 : 0.5); // flows when visible, forms quietly when not
          lastSoul = w.soul;
        }
        // sparse → form: density grows with presence (the gather)
        const target = pr.window ? pr.density : w.density;
        engine.setDensity(Math.min(cast.mastered ? 0.8 : 1, target) * (0.25 + 0.75 * pr.presence));
      }
      const dissolving = engine.dissolveTime() !== null;
      const wantRun = pr.presence > 0 || !!next || dissolving;
      if (wantRun && !running) { engine.start(); running = true; }
      if (!wantRun) {
        if (running && now - absentSince > 2500) { engine.stop(); running = false; }
      } else absentSince = now;

      // a held still: start the dissolve once the guard clears (same window)
      if (pr.window?.kind === "transition" && heldInWindow.current === pr.window.start && dissolvedWindow.current !== pr.window.start) {
        const nextPb = (cast.phaseBounds ?? []).find((x) => x > t);
        if (dissolveAllowed({
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

      // presence + break veil (CSS opacity with long transitions)
      const presence = Math.max(pr.presence, dissolving ? 1 : 0);
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
      const veil = guard ? 0 : pr.breakVeil;
      if (veilRef.current) veilRef.current.style.opacity = veil.toFixed(3);

      // colour: harmony per section + a drift on swells (hue/sat only — luma-safe)
      const st = engine.stats();
      const c = colorAt(cast, t);
      engine.setHue(c.hue + 0.18 * st.swell, c.sat * (1 + 0.12 * st.swell));
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
      engine.dispose();
      engineRef.current = null;
      delete (window as unknown as Record<string, unknown>).__resonanceParticleLead;
    };
  }, [cast, journeyId]);

  // palette target follows the phase palette (theme)
  useEffect(() => {
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
        const ok = dissolveAllowed({
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
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 3,
          pointerEvents: "none",
          // premultiplied transparent canvas composited NORMALLY: black is
          // see-through, light lays over — no blend group over the whole
          // imagery stack (a full-screen plus-lighter cost Ghost ~7 ms p95)
          opacity: 0,
          transition: "opacity 0.6s linear",
        }}
      />
    </>
  );
}
