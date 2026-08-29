"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 16448 · phosphene
//
//   "What if his music grew a living crystalline light-body you could turn in
//    your hands — an entoptic lattice of phosphene light whose whole structure
//    is carved by the harmony of his real take?"
//
//   One of Karel's real piano takes plays, looping, and from it grows a single
//   luminous crystal that floats in front of you: a few thousand additive-glow
//   points folded into kaleidoscopic (dihedral) symmetry, sheathed in a thin
//   silver icosahedral facet-cage. It is an OBJECT, not a room and not a flat
//   field — the camera ORBITS it, and you TURN it with your hands: drag + wheel
//   on desktop, device-tilt on a phone.
//
//   The crystal is carved by his HARMONY. The current chord (walked against
//   playback time from loadTrackAnalysis) retunes the fold order — so a chord
//   change visibly re-cuts the facets — shifts the single jewel-tone between a
//   deep amethyst and a cold teal, and shears the spiral twist. Note density
//   under the playhead sets point brightness. Loud onsets (from the master
//   analyser's energy) launch a bloom-pulse that travels outward through the
//   shells. Without analysis it degrades to the analyser alone and still lives.
//
//   AUDIO: Karel's catalog ONLY — zero synthesis, everything through the shared
//   ear-safety master. REF: Heinrich Kluver's form constants (1926) — the
//   lattice / honeycomb / spiral geometry of entoptic vision — and the
//   kaleidoscopic-instancing lineage in creative coding.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  REAL_TRACKS,
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import {
  loadTrackAnalysis,
  chordRoot,
  chordIsMinor,
  type TrackAnalysis,
} from "../_shared/trackAnalysis";
import { buildLattice, type PhospheneLattice } from "./lattice";

// The take the crystal is carved from — "Welcome Home", the title piece.
const TRACK_ID =
  WELCOME_HOME_TRACKS.find((t) => t.title === "Welcome Home")?.id ??
  REAL_TRACKS[0].id;

type Phase = "idle" | "loading" | "running" | "error";

interface AudioEngine {
  ctx: AudioContext;
  master: SafeMaster;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startTime: number;
  duration: number;
  title: string;
  freq: Uint8Array<ArrayBuffer>;
}

// ── amethyst ⇄ teal jewel tone from the chord ────────────────────────────────
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

export default function PhosphenePage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [tiltNote, setTiltNote] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [hud, setHud] = useState<{ title: string; chord: string; sym: number }>({
    title: "",
    chord: "—",
    sym: 6,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const analysisRef = useRef<TrackAnalysis | null>(null);
  const startedRef = useRef(false);

  // steering, read by the render loop
  const dragAzRef = useRef(0);
  const dragElRef = useRef(0);
  const camRadiusRef = useRef(8);
  const tiltAzVelRef = useRef(0);
  const tiltElRef = useRef(0);
  const tiltPushRef = useRef(0);

  // ── teardown (also on unmount) ──────────────────────────────────────────────
  const teardownAudio = useCallback(() => {
    const eng = engineRef.current;
    engineRef.current = null;
    if (!eng) return;
    try {
      eng.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      eng.source.disconnect();
      eng.gain.disconnect();
    } catch {
      /* noop */
    }
    eng.master.disconnect();
    void eng.ctx.close().catch(() => {});
  }, []);

  useEffect(() => teardownAudio, [teardownAudio]);

  // ── enter: gesture-gated audio boot + orientation permission ────────────────
  const enter = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setPhase("loading");
    setErrorMsg(null);

    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      startedRef.current = false;
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
    master.setGain(0.85);

    let loaded: { buffer: AudioBuffer; title: string };
    try {
      loaded = await loadRealTrackBuffer(ctx, TRACK_ID);
    } catch {
      master.disconnect();
      void ctx.close().catch(() => {});
      startedRef.current = false;
      setErrorMsg(
        "Karel's recording could not be reached right now. Please try again.",
      );
      setPhase("error");
      return;
    }

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const source = ctx.createBufferSource();
    source.buffer = loaded.buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(master.input);
    const startTime = ctx.currentTime + 0.06;
    source.start(startTime);
    gain.gain.setTargetAtTime(0.9, startTime, 1.4);

    engineRef.current = {
      ctx,
      master,
      source,
      gain,
      startTime,
      duration: loaded.buffer.duration,
      title: loaded.title,
      freq: new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount)),
    };
    setHud((h) => ({ ...h, title: loaded.title }));

    // harmony analysis loads in the background; the crystal grows either way.
    void loadTrackAnalysis(TRACK_ID).then((a) => {
      analysisRef.current = a;
    });

    // iOS 13+ gates motion behind a gesture-scoped permission request.
    try {
      const doe = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (doe && typeof doe.requestPermission === "function") {
        const res = await doe.requestPermission();
        if (res !== "granted") {
          setTiltNote("Tilt denied — drag and scroll still turn the crystal.");
        }
      }
    } catch {
      /* non-iOS, or already granted */
    }

    setPhase("running");
  }, []);

  // ── three.js scene: an orbited crystalline light-body ───────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    } catch {
      setWebglFailed(true);
      return; // audio keeps playing; an on-brand notice shows
    }

    const getSize = () => ({
      w: canvas.clientWidth || window.innerWidth,
      h: canvas.clientHeight || window.innerHeight,
    });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    let { w, h } = getSize();
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.FogExp2(0x05060a, 0.035);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);

    // faint cold backdrop so the jewel reads against depth (a backdrop, not a
    // full-screen generative field)
    const bgTex = makeRadialTexture([
      [0, "rgba(70,60,110,0.55)"],
      [0.45, "rgba(30,34,60,0.35)"],
      [1, "rgba(5,6,10,0)"],
    ]);
    const bg = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: bgTex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    bg.scale.set(70, 70, 1);
    bg.renderOrder = -10;
    scene.add(bg);

    const lattice: PhospheneLattice = buildLattice(prefersReduced ? 9000 : 15000);
    lattice.object3d.scale.setScalar(1);
    scene.add(lattice.object3d);
    // hand the shader the device pixel ratio for crisp point sizing
    const pointsMat = (lattice.object3d.children[0] as THREE.Points)
      .material as THREE.ShaderMaterial;
    pointsMat.uniforms.uDpr.value = dpr;

    // ── steering: pointer drag + wheel (desktop), device tilt (phone) ──────────
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      dragAzRef.current += (e.clientX - lastX) * 0.006;
      dragElRef.current = Math.max(
        -1.2,
        Math.min(1.2, dragElRef.current + (e.clientY - lastY) * 0.005),
      );
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camRadiusRef.current = Math.max(
        3.6,
        Math.min(15, camRadiusRef.current + e.deltaY * 0.01),
      );
    };
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.gamma === null && e.beta === null) return;
      const gamma = e.gamma ?? 0; // left/right ~[-90,90] → spin velocity
      const beta = e.beta ?? 0; // front/back ~[-180,180]
      tiltAzVelRef.current = Math.max(-1, Math.min(1, gamma / 45));
      tiltElRef.current = Math.max(-1, Math.min(1, (beta - 45) / 60));
      // a strong forward lean pushes into the crystal
      tiltPushRef.current = Math.max(0, Math.min(1, (beta - 70) / 40));
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("deviceorientation", onOrient);

    const onResize = () => {
      const s = getSize();
      w = s.w;
      h = s.h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── harmony walking + onset detection state ────────────────────────────────
    let energyAvg = 0;
    let onsetCooldown = 0;
    let hudAccum = 0;
    let autoAz = 0;
    let curSym = 6;
    let curChordLabel = "—";

    let raf = 0;
    let last = performance.now();

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dtMs = Math.min(64, t - last);
      last = t;
      const dt = dtMs / 1000;

      const eng = engineRef.current;

      // ── continuous shimmer + onset energy from the master analyser ───────────
      let audioLevel = 0;
      let onset = 0;
      if (eng) {
        eng.master.analyser.getByteFrequencyData(eng.freq);
        const bins = eng.freq.length;
        let sum = 0;
        const mid = Math.floor(bins * 0.6);
        for (let b = 0; b < mid; b++) sum += eng.freq[b];
        const energy = sum / (mid * 255); // 0..1
        audioLevel = energy;
        energyAvg += (energy - energyAvg) * 0.08;
        if (
          onsetCooldown <= 0 &&
          energy > energyAvg + 0.08 &&
          energy > 0.12
        ) {
          onset = Math.min(1, (energy - energyAvg) * 6);
          onsetCooldown = 0.14;
        }
        onsetCooldown -= dt;
      }
      if (onset > 0) lattice.pulse(onset);

      // ── carve the crystal from the current chord (or the analyser) ───────────
      const analysis = analysisRef.current;
      if (eng && analysis && analysis.chords.length) {
        const play = (eng.ctx.currentTime - eng.startTime) % eng.duration;
        // last chord whose onset is at/behind the playhead
        const chords = analysis.chords;
        let lo = 0;
        let hi = chords.length - 1;
        let idx = 0;
        while (lo <= hi) {
          const m = (lo + hi) >> 1;
          if (chords[m].time <= play) {
            idx = m;
            lo = m + 1;
          } else {
            hi = m - 1;
          }
        }
        const sym = chords[idx].chord;
        const root = chordRoot(sym);
        const minor = chordIsMinor(sym);
        const symmetry = root === null ? 6 : 3 + (root % 6); // 3..8
        // note density under the playhead → brightness
        let dens = 0;
        for (const n of analysis.notes) {
          if (n.time > play + 0.15) break;
          if (n.time > play - 0.45) dens++;
        }
        const brightness = 0.65 + Math.min(1, dens / 7) * 0.95;
        // jewel tone: minor leans deep amethyst, major leans cold teal;
        // the root nudges the hue a little within that arc
        const baseHue = minor ? 276 : 186;
        const hue = baseHue + (root === null ? 0 : (root - 5.5) * 3);
        const jewel = hslToRgb(hue, 0.68, minor ? 0.58 : 0.6);
        lattice.setHarmony({ symmetry, twist: minor ? 1.1 : 0.5, jewel, brightness });
        curSym = symmetry;
        curChordLabel = sym;
      } else if (eng) {
        // no analysis: drive hue + fold from the analyser spectrum alone
        const bins = eng.freq.length;
        let wsum = 0;
        let tot = 0;
        for (let b = 0; b < bins; b++) {
          wsum += b * eng.freq[b];
          tot += eng.freq[b];
        }
        const centroid = tot > 0 ? wsum / (tot * bins) : 0.4; // 0..1
        const hue = 186 + centroid * 90; // teal → violet
        const jewel = hslToRgb(hue, 0.66, 0.58);
        const symmetry = 4 + Math.round(centroid * 4);
        lattice.setHarmony({
          symmetry,
          twist: 0.4 + centroid * 0.9,
          jewel,
          brightness: 0.7 + audioLevel * 0.9,
        });
        curSym = symmetry;
        curChordLabel = "listening…";
      }

      lattice.update(dt, audioLevel);

      // ── camera ORBITS the crystal; hands steer, with a slow idle turn ────────
      autoAz += dt * (prefersReduced ? 0.03 : 0.08);
      tiltAzVelRef.current *= 0.94; // gentle decay when the phone is held still
      dragAzRef.current += tiltAzVelRef.current * dt * 1.4;
      // tilt push eases the radius inward
      if (tiltPushRef.current > 0.02) {
        camRadiusRef.current = Math.max(
          3.6,
          camRadiusRef.current - tiltPushRef.current * dt * 6,
        );
      }
      const az = autoAz + dragAzRef.current;
      const el = 0.28 + dragElRef.current + tiltElRef.current * 0.6;
      const clampedEl = Math.max(-1.3, Math.min(1.3, el));
      const camR = camRadiusRef.current;
      camera.position.set(
        Math.cos(az) * camR * Math.cos(clampedEl),
        Math.sin(clampedEl) * camR,
        Math.sin(az) * camR * Math.cos(clampedEl),
      );
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);

      // throttle HUD updates
      hudAccum += dtMs;
      if (hudAccum > 250) {
        hudAccum = 0;
        setHud((prev) =>
          prev.chord === curChordLabel && prev.sym === curSym
            ? prev
            : { ...prev, chord: curChordLabel, sym: curSym },
        );
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("deviceorientation", onOrient);
      lattice.dispose();
      bgTex.dispose();
      (bg.material as THREE.SpriteMaterial).dispose();
      renderer.dispose();
    };
  }, [phase]);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {phase === "running" && !webglFailed && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block h-full w-full touch-none"
        />
      )}

      {/* corner back-link */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-30 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        ← dream
      </Link>

      {/* idle / loading / error curtain */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
              entoptic light-body
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              phosphene
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              His take grows a single crystal of phosphene light, floating in
              front of you. Its whole faceted structure is carved by the harmony
              of the music — chords re-cut the symmetry and shift its jewel-tone;
              loud notes bloom outward through it. Turn it in your hands.
            </p>

            {phase === "error" && (
              <p className="mt-6 text-base text-destructive">{errorMsg}</p>
            )}

            <button
              onClick={enter}
              disabled={phase === "loading"}
              className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Growing the crystal…" : "Grow the crystal"}
            </button>

            <p className="mt-6 font-mono text-[11px] leading-relaxed text-muted-foreground/70">
              headphones recommended · drag + scroll to turn it · tilt your phone
            </p>
          </div>
        </div>
      )}

      {/* running HUD */}
      {phase === "running" && (
        <>
          {webglFailed && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md text-center">
                <p className="text-base text-muted-foreground">
                  Your device could not open a 3D view, so the crystal is hidden —
                  but Karel&apos;s take is still playing. Try a WebGL-capable
                  browser to turn the light-body in your hands.
                </p>
              </div>
            </div>
          )}

          <div className="pointer-events-none absolute right-4 top-4 select-none text-right font-mono text-[11px] leading-relaxed text-muted-foreground">
            <div className="text-foreground">{hud.title || "Karel — piano"}</div>
            <div>chord · {hud.chord}</div>
            <div className="text-muted-foreground/70">{hud.sym}-fold facets</div>
          </div>

          {tiltNote && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 text-center font-mono text-[11px] text-destructive">
              {tiltNote}
            </div>
          )}

          <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
            drag to turn · scroll to push in · tilt to steer
          </div>

          <button
            onClick={() => setNotesOpen(true)}
            className="absolute bottom-4 right-4 z-30 min-h-[36px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
          >
            Read the design notes
          </button>
        </>
      )}

      {/* design-notes modal */}
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
                phosphene — design notes
              </h2>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[32px] rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-base leading-relaxed text-muted-foreground">
              <p>
                One question: <em>what if his music grew a living crystalline
                light-body you could turn in your hands</em> — an entoptic lattice
                of phosphene light whose whole structure is carved by the harmony
                of his real take?
              </p>
              <p>
                A single luminous crystal floats in front of you: a few thousand
                additive-glow points folded into kaleidoscopic (dihedral) symmetry,
                sheathed in a thin silver icosahedral facet-cage. It is an object
                you orbit — not a room you stand in, and not a flat field you watch.
                Drag and scroll to turn and push into it; on a phone, tilt steers.
              </p>
              <p>
                Everything is carved by his harmony. The current chord — walked
                against playback time from the track analysis — sets the fold
                order, so a chord change visibly re-cuts the facets; it shifts the
                single jewel-tone between a deep amethyst (minor) and a cold teal
                (major) and shears the spiral twist. Note density under the playhead
                sets the point brightness. Loud onsets, read from the master
                analyser&apos;s energy, launch a bloom-pulse that travels outward
                through the shells. With no analysis it degrades to the analyser
                alone and still lives.
              </p>
              <p className="text-muted-foreground/70">
                After Heinrich Kluver&apos;s <em>form constants</em> (1926) — the
                lattice, honeycomb, tunnel and spiral geometry the visual cortex
                generates as entoptic phenomena — and the long kaleidoscopic-
                instancing lineage in creative coding. The lab has many three.js
                and instanced-geometry priors; this is one more, described plainly.
                Audio is Karel&apos;s catalog only — no synthesis, routed through
                the shared ear-safety master.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["16448-phosphene"]} />
    </main>
  );
}

// ── a soft radial gradient as a canvas texture (backdrop only) ────────────────
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
