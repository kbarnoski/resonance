"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15488 · vigil-chord — VIGIL. Karel's music only lives while you sustain it.
//
//   "His whole ensemble exists only at the peak of an unbroken vigil; the
//    instant you let go, it forgets."
//
//   Six of Karel's real recordings are mapped to six keys — A S D F G H — and to
//   six Messiaen colour-chord panes of a stained-glass window. Every recording
//   loops continuously and in sync, but each voice is HELD AT SILENCE. A voice
//   only sounds while its key is physically held down; release it and that voice
//   dies immediately (fast fade), and its pane darkens. To hear Karel's full
//   six-voice ensemble in unison — and to see the "cité céleste" fully lit in
//   gold, red, violet, green and blue — the visitor must hold all six keys AT
//   ONCE, unbroken. They keep his chord alive with their own sustained chord.
//   The instant they lift their hands, the ensemble collapses to silence. You
//   sustain to sustain: the listener's endurance is the true cost of hearing.
//
//   INPUT: sustained multi-key / multi-touch HOLD (load-bearing; a partial hold
//   is a partial window). OUTPUT: three.js stained-glass light-field. AUDIO:
//   Karel's catalog ONLY — six looping real recordings, each gated by its
//   key-held state; zero synthesis. REFS: Olivier Messiaen, chord-colour
//   synesthesia & Couleurs de la cité céleste (1963); Sound Scene 2026,
//   Hirshhorn Museum — Failed Future Bodies, where sustaining IS the instrument.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { loadRealTrackBuffer } from "../_shared/welcomeHome";

// ── voice assignment: one held key = one recording = one Messiaen colour ──────
// All IDs verified anon-servable in _shared/welcomeHome (Welcome Home + Snowflake).
// Colours reach a full chromatic chord WITH INTENT: gold, amber, red, violet,
// green, blue — Messiaen's Sainte-Chapelle window ("gold and blue, red and
// violet"), never grayscale, never a cool cyan/teal/indigo wash.
interface VoiceDef {
  key: string; // physical key (lowercase)
  id: string; // recording id
  title: string;
  hex: number; // pane colour
  cssHex: string; // same colour for the DOM key row
}

const VOICES: VoiceDef[] = [
  { key: "a", id: "d57cfae6-f234-4d24-85fe-72a8ad93a44a", title: "Interplay", hex: 0xffcf4d, cssHex: "#ffcf4d" }, // gold
  { key: "s", id: "eba95845-cdbf-41d8-9c5d-8679686811ad", title: "Bath", hex: 0xff8a3d, cssHex: "#ff8a3d" }, // amber
  { key: "d", id: "8dafed88-4761-4dd3-a0f4-93f310441093", title: "Welcome Home", hex: 0xe5322b, cssHex: "#e5322b" }, // red
  { key: "f", id: "1f0a541e-df60-44a9-b839-5dc69a007d9f", title: "2019", hex: 0x8b46e0, cssHex: "#8b46e0" }, // violet
  { key: "g", id: "d2eeee58-832b-4872-a4be-8fbf030b981d", title: "Rolling", hex: 0x3fbf6b, cssHex: "#3fbf6b" }, // green
  { key: "h", id: "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", title: "Isolation", hex: 0x2f6ef0, cssHex: "#2f6ef0" }, // blue
];

const N = VOICES.length;
const PER_VOICE_GAIN = 0.4; // safeMaster limits the summed peak
const KEY_INDEX: Record<string, number> = Object.fromEntries(
  VOICES.map((v, i) => [v.key, i]),
);

interface Voice {
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  present: boolean;
}

interface AudioEngine {
  ctx: AudioContext;
  master: SafeMaster;
  voices: Voice[];
  freq: Uint8Array<ArrayBuffer>;
}

type Phase = "idle" | "loading" | "running" | "error";

export default function VigilChordPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Which voices are currently sounding — drives the DOM key row highlight.
  const [onState, setOnState] = useState<boolean[]>(() =>
    new Array(N).fill(false),
  );

  const audioRef = useRef<AudioEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Ref mirror of on/off so the render loop reads it without re-subscribing.
  const onStateRef = useRef<boolean[]>(new Array(N).fill(false));
  // Separate held-sources so a pane held by BOTH keyboard and pointer stays lit
  // until released by both.
  const heldByKey = useRef<Set<number>>(new Set());
  const heldByPointer = useRef<Set<number>>(new Set());

  // ── the single load-bearing action: gate one voice on the held state ─────────
  const refreshVoice = useCallback((i: number) => {
    const on = heldByKey.current.has(i) || heldByPointer.current.has(i);
    if (onStateRef.current[i] === on) return;
    onStateRef.current[i] = on;

    const eng = audioRef.current;
    if (eng && eng.voices[i].present && eng.voices[i].gain) {
      const g = eng.voices[i].gain!;
      const now = eng.ctx.currentTime;
      // Fast attack (~40ms) when the key goes down; faster release (~80ms) when
      // it lifts — so the voice dies almost the instant the vigil breaks.
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(on ? PER_VOICE_GAIN : 0, now, on ? 0.018 : 0.03);
    }

    setOnState((prev) => {
      const next = prev.slice();
      next[i] = on;
      return next;
    });
  }, []);

  const setKeyHeld = useCallback(
    (i: number, held: boolean) => {
      if (held) heldByKey.current.add(i);
      else heldByKey.current.delete(i);
      refreshVoice(i);
    },
    [refreshVoice],
  );

  const setPointerHeld = useCallback(
    (i: number, held: boolean) => {
      if (held) heldByPointer.current.add(i);
      else heldByPointer.current.delete(i);
      refreshVoice(i);
    },
    [refreshVoice],
  );

  // ── audio teardown (also runs on unmount) ────────────────────────────────────
  const teardownAudio = useCallback(() => {
    const eng = audioRef.current;
    audioRef.current = null;
    if (!eng) return;
    for (const v of eng.voices) {
      try {
        v.source?.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.source?.disconnect();
        v.gain?.disconnect();
      } catch {
        /* noop */
      }
    }
    eng.master.disconnect();
    void eng.ctx.close().catch(() => {});
  }, []);

  useEffect(() => teardownAudio, [teardownAudio]);

  // ── enter: gesture-gated audio boot ──────────────────────────────────────────
  const enter = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrorMsg(null);
    setLoadedCount(0);
    heldByKey.current.clear();
    heldByPointer.current.clear();
    onStateRef.current = new Array(N).fill(false);
    setOnState(new Array(N).fill(false));

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      setErrorMsg("This browser has no Web Audio support.");
      setPhase("error");
      return;
    }
    const ctx = new AC();
    try {
      await ctx.resume();
    } catch {
      /* may already be running */
    }
    const master = createSafeMaster(ctx);
    master.setGain(0.9);

    const results = await Promise.allSettled(
      VOICES.map((v) => loadRealTrackBuffer(ctx, v.id)),
    );

    const anyLoaded = results.some((r) => r.status === "fulfilled");
    if (!anyLoaded) {
      master.disconnect();
      void ctx.close().catch(() => {});
      setErrorMsg(
        "None of Karel's recordings could be reached right now. Please try again.",
      );
      setPhase("error");
      return;
    }

    // All sources start together at gain 0 and loop forever, staying phase-
    // locked so a held chord layers cleanly.
    const startAt = ctx.currentTime + 0.08;
    const voices: Voice[] = results.map((res) => {
      if (res.status !== "fulfilled") {
        return { source: null, gain: null, present: false };
      }
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const source = ctx.createBufferSource();
      source.buffer = res.value.buffer;
      source.loop = true;
      source.connect(gain);
      gain.connect(master.input);
      source.start(startAt);
      return { source, gain, present: true };
    });

    setLoadedCount(results.filter((r) => r.status === "fulfilled").length);

    audioRef.current = {
      ctx,
      master,
      voices,
      freq: new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount)),
    };
    setPhase("running");
  }, [phase]);

  // ── keyboard: hold to sustain, release to let a voice die ────────────────────
  useEffect(() => {
    if (phase !== "running") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // ignore auto-repeat so a hold is one continuous act
      const i = KEY_INDEX[e.key.toLowerCase()];
      if (i === undefined) return;
      e.preventDefault();
      setKeyHeld(i, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const i = KEY_INDEX[e.key.toLowerCase()];
      if (i === undefined) return;
      e.preventDefault();
      setKeyHeld(i, false);
    };
    // Losing focus (tab away, cmd-tab) must break the vigil — you cannot sustain
    // what your hands have left.
    const onBlur = () => {
      for (let i = 0; i < N; i++) setKeyHeld(i, false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [phase, setKeyHeld]);

  // ── three.js stained-glass window ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      });
    } catch {
      setWebglFailed(true);
      return; // audio + the DOM key row still work
    }

    const getSize = () => ({
      w: canvas.clientWidth || window.innerWidth,
      h: canvas.clientHeight || window.innerHeight,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    let { w, h } = getSize();
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080510); // stone shadow, near-black violet

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);

    // ── window layout ──────────────────────────────────────────────────────────
    const PW = 1.5; // pane width
    const GAP = 0.32;
    const PH = 5.4; // pane body height
    const ARCH = 0.9; // pointed-arch height above the body
    const totalW = N * PW + (N - 1) * GAP;
    const x0 = -totalW / 2 + PW / 2;
    const baseY = -0.3;

    // Fit the whole window (with the oculus above) into view on any aspect.
    const HALF_W = totalW / 2 + 0.6;
    const HALF_H = PH / 2 + ARCH + 2.6; // include oculus headroom
    const fitCamera = () => {
      const tan = Math.tan((camera.fov * Math.PI) / 360);
      const aspect = w / h;
      const distH = HALF_H / tan;
      const distW = HALF_W / (tan * aspect);
      camera.position.set(0, baseY + 0.6, Math.max(distH, distW) + 0.6);
      camera.lookAt(0, baseY + 0.6, 0);
    };

    // A tinted radial glow behind each pane — additive, so neighbouring colours
    // bleed together into a chromatic field as more of the chord is sustained.
    const glowTex = makeRadialTexture([
      [0, "rgba(255,255,255,0.95)"],
      [0.35, "rgba(255,255,255,0.5)"],
      [0.7, "rgba(255,255,255,0.14)"],
      [1, "rgba(255,255,255,0)"],
    ]);

    // Pointed-lancet pane shape.
    const makeLancet = () => {
      const hw = PW / 2;
      const hh = PH / 2;
      const s = new THREE.Shape();
      s.moveTo(-hw, -hh);
      s.lineTo(hw, -hh);
      s.lineTo(hw, hh);
      s.quadraticCurveTo(hw * 0.55, hh + ARCH * 0.55, 0, hh + ARCH);
      s.quadraticCurveTo(-hw * 0.55, hh + ARCH * 0.55, -hw, hh);
      s.lineTo(-hw, -hh);
      return new THREE.ShapeGeometry(s);
    };

    const paneMats: THREE.MeshBasicMaterial[] = [];
    const paneGeos: THREE.BufferGeometry[] = [];
    const glowMats: THREE.SpriteMaterial[] = [];
    const leadGeos: THREE.BufferGeometry[] = [];
    const leadMats: THREE.MeshBasicMaterial[] = [];

    VOICES.forEach((v, i) => {
      const cx = x0 + i * (PW + GAP);
      const col = new THREE.Color(v.hex);

      // Dark leading: a slightly larger black lancet just behind the glass.
      const leadGeo = makeLancet();
      leadGeo.scale(1.14, 1.06, 1);
      const leadMat = new THREE.MeshBasicMaterial({ color: 0x05030a });
      const lead = new THREE.Mesh(leadGeo, leadMat);
      lead.position.set(cx, baseY, -0.06);
      scene.add(lead);
      leadGeos.push(leadGeo);
      leadMats.push(leadMat);

      // Glass pane — opacity rises with the held level; faint when released.
      const geo = makeLancet();
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, baseY, 0);
      scene.add(mesh);
      paneMats.push(mat);
      paneGeos.push(geo);

      // Additive glow behind the pane.
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: col,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(PW * 3.0, PH * 1.25, 1);
      glow.position.set(cx, baseY + 0.2, -0.3);
      scene.add(glow);
      glowMats.push(glowMat);
    });

    // ── oculus / rose: the "cité céleste", fully lit only at the peak of the vigil
    const oculusY = baseY + PH / 2 + ARCH + 1.35;
    const oculusGeo = new THREE.CircleGeometry(0.95, 48);
    const oculusMat = new THREE.MeshBasicMaterial({
      color: 0xfff0c4,
      transparent: true,
      opacity: 0,
    });
    const oculus = new THREE.Mesh(oculusGeo, oculusMat);
    oculus.position.set(0, oculusY, 0.02);
    scene.add(oculus);

    const oculusGlowMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffe6a6,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const oculusGlow = new THREE.Sprite(oculusGlowMat);
    oculusGlow.scale.set(5.5, 5.5, 1);
    oculusGlow.position.set(0, oculusY, -0.2);
    scene.add(oculusGlow);

    // A warm full-window wash that only blooms as the whole chord is sustained.
    const washMat = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffd98a,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const wash = new THREE.Sprite(washMat);
    wash.scale.set(totalW * 2.4, (PH + ARCH) * 2.0, 1);
    wash.position.set(0, baseY + 0.4, -0.5);
    scene.add(wash);

    fitCamera();

    const onResize = () => {
      const s = getSize();
      w = s.w;
      h = s.h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      fitCamera();
    };
    window.addEventListener("resize", onResize);

    // ── animation loop ───────────────────────────────────────────────────────────
    const levels = new Array(N).fill(0); // smoothed visual level per pane
    let raf = 0;
    let last = performance.now();

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.064, (t - last) / 1000);
      last = t;

      // overall audio energy → gentle luminance shimmer (slow, no flicker)
      let pulse = 0;
      const eng = audioRef.current;
      if (eng) {
        eng.master.analyser.getByteFrequencyData(eng.freq);
        const bins = Math.max(1, Math.floor(eng.freq.length * 0.5));
        let sum = 0;
        for (let b = 0; b < bins; b++) sum += eng.freq[b];
        pulse = sum / (bins * 255);
      }

      // smooth each pane toward its held target — bloom in gently, fade out a
      // touch slower for a stained-glass afterglow (SAFETY: no strobe).
      let avg = 0;
      for (let i = 0; i < N; i++) {
        const target = onStateRef.current[i] ? 1 : 0;
        const tau = target > levels[i] ? 0.08 : 0.16;
        levels[i] += (target - levels[i]) * (1 - Math.exp(-dt / tau));
        avg += levels[i];

        const lit = levels[i];
        const shimmer = 0.88 + 0.12 * pulse * lit;
        paneMats[i].opacity = (0.1 + lit * 0.9) * shimmer;
        glowMats[i].opacity = lit * 0.7 * (0.85 + 0.15 * pulse);
      }
      avg /= N;

      // The cité céleste rewards the FULL, unbroken hold: its brightness rises
      // steeply with the average, so a partial chord is only a partial window.
      const fullness = Math.pow(avg, 2.4);
      oculusMat.opacity = Math.min(1, fullness * 1.15);
      oculusGlowMat.opacity = fullness * 0.9;
      const og = 1 + 0.06 * pulse * fullness;
      oculusGlow.scale.set(5.5 * og, 5.5 * og, 1);
      washMat.opacity = fullness * 0.55;

      // A slow, safe breathing drift on the whole window (skip if reduced-motion).
      if (!prefersReduced) {
        const drift = Math.sin(t * 0.00035) * 0.03;
        scene.rotation.y = drift;
      }

      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      glowTex.dispose();
      for (const g of paneGeos) g.dispose();
      for (const m of paneMats) m.dispose();
      for (const g of leadGeos) g.dispose();
      for (const m of leadMats) m.dispose();
      for (const m of glowMats) m.dispose();
      oculusGeo.dispose();
      oculusMat.dispose();
      oculusGlowMat.dispose();
      washMat.dispose();
      renderer.dispose();
    };
  }, [phase]);

  const heldCount = onState.filter(Boolean).length;

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* three.js canvas */}
      {phase === "running" && !webglFailed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full"
        />
      )}

      {/* Idle / loading / error curtain */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl text-center">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
              vigil
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Vigil — a held chord
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Karel&apos;s ensemble lives only while you sustain it. Hold the keys
              to keep his chord alive; the instant you let go, it forgets.
            </p>

            {phase === "error" && (
              <p className="mt-6 text-sm text-destructive">{errorMsg}</p>
            )}

            <button
              onClick={enter}
              disabled={phase === "loading"}
              className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Lighting the glass…" : "Begin the vigil"}
            </button>

            <p className="mt-6 font-mono text-xs leading-relaxed text-muted-foreground/70">
              hold A S D F G H together · six recordings, six colours · release and
              they die
            </p>
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <>
          {webglFailed && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md text-center">
                <p className="text-base text-muted-foreground">
                  Your device could not open a 3D view, so the window is hidden —
                  but the vigil still holds. Press and hold the panes below to keep
                  Karel&apos;s voices alive.
                </p>
              </div>
            </div>
          )}

          {/* top-left readout */}
          <div className="pointer-events-none absolute left-4 top-4 select-none font-mono text-xs leading-relaxed text-muted-foreground">
            <div className="text-foreground">
              {heldCount} / {N} voices sustained
            </div>
            <div className="text-muted-foreground/60">
              {heldCount === N
                ? "the cité céleste is fully lit"
                : heldCount === 0
                  ? "silence — nothing is held"
                  : "a partial window"}
            </div>
            <div className="text-muted-foreground/50">
              {loadedCount}/{N} recordings loaded
            </div>
          </div>

          {/* design-notes affordance */}
          <button
            onClick={() => setNotesOpen(true)}
            className="absolute right-4 top-4 min-h-[36px] rounded-md border border-border bg-background/60 px-3 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
          >
            Read the design notes
          </button>

          {/* labeled key / pane row — also the press-and-hold touch input */}
          <div className="absolute inset-x-0 bottom-16 flex justify-center px-3">
            <div className="flex w-full max-w-3xl items-stretch gap-1.5 sm:gap-2">
              {VOICES.map((v, i) => {
                const lit = onState[i];
                const dead = audioRef.current
                  ? !audioRef.current.voices[i]?.present
                  : false;
                return (
                  <button
                    key={v.key}
                    type="button"
                    disabled={dead}
                    aria-pressed={lit}
                    aria-label={`Hold to sustain ${v.title} (key ${v.key.toUpperCase()})`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.currentTarget as HTMLElement).setPointerCapture?.(
                        e.pointerId,
                      );
                      setPointerHeld(i, true);
                    }}
                    onPointerUp={(e) => {
                      e.preventDefault();
                      setPointerHeld(i, false);
                    }}
                    onPointerCancel={() => setPointerHeld(i, false)}
                    onPointerLeave={() => setPointerHeld(i, false)}
                    onContextMenu={(e) => e.preventDefault()}
                    className="flex min-h-[76px] flex-1 touch-none select-none flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 transition-all disabled:opacity-30"
                    style={{
                      borderColor: lit ? v.cssHex : "var(--border)",
                      background: lit ? `${v.cssHex}26` : "rgba(8,5,16,0.62)",
                      boxShadow: lit ? `0 0 22px 0 ${v.cssHex}80` : "none",
                    }}
                  >
                    <span
                      className="font-mono text-sm font-semibold"
                      style={{ color: lit ? v.cssHex : undefined }}
                    >
                      {v.key.toUpperCase()}
                    </span>
                    <span className="text-center text-[11px] leading-tight text-muted-foreground">
                      {v.title}
                    </span>
                    <span
                      className="mt-0.5 h-1.5 w-full rounded-full transition-opacity"
                      style={{
                        background: v.cssHex,
                        opacity: lit ? 1 : 0.22,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* design-notes overlay */}
      {notesOpen && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">
                Vigil — design notes
              </h2>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[32px] rounded-md border border-border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question: <em>what does it cost to keep his music alive?</em>{" "}
                Here the cost is your own sustained presence. Karel&apos;s ensemble
                exists only at the peak of an unbroken vigil.
              </p>
              <p>
                Six of his real recordings loop continuously and in sync, but each
                voice is held at silence. A voice only sounds while its key —{" "}
                <span className="font-mono">A&nbsp;S&nbsp;D&nbsp;F&nbsp;G&nbsp;H</span>{" "}
                — is physically held down. Release the key and that voice dies
                immediately, and its stained-glass pane darkens. To hear his full
                six-voice ensemble in unison you must hold all six keys at once,
                unbroken: you sustain to sustain, keeping his chord alive with your
                own.
              </p>
              <p>
                Each key is one of Messiaen&apos;s colour-chords — gold, amber,
                red, violet, green, blue. Hold the whole chord and the panes bleed
                into a single luminous field and the oculus, the{" "}
                <em>cité céleste</em>, lights fully. Let a finger slip and the
                window falls back to a partial state. Holding all six is genuinely
                demanding — that difficulty is the point.
              </p>
              <p className="text-muted-foreground/70">
                After Olivier Messiaen — chord-colour synesthesia and the
                Sainte-Chapelle stained glass (&ldquo;gold and blue, red and
                violet&rdquo;), where in <em>Couleurs de la cité céleste</em>{" "}
                (1963) &ldquo;the form of the work depends entirely on
                colours.&rdquo; And after <em>Failed Future Bodies</em>, Sound
                Scene 2026 at the Hirshhorn Museum, where sustaining — and failing
                to sustain — is itself the instrument. Audio is Karel&apos;s
                catalog only; no synthesis.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15488-vigil-chord"]} />
    </main>
  );
}

// ── a soft radial gradient as a canvas texture (for glows) ────────────────────
function makeRadialTexture(stops: [number, string][]): THREE.CanvasTexture {
  const size = 256;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const g = cv.getContext("2d")!;
  const grad = g.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  for (const [pos, col] of stops) grad.addColorStop(pos, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}
