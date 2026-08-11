"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10056 · Skyoculus — a James Turrell Skyspace, reduced to a single aperture.
//
//   "What if you lay back beneath a dark chamber and looked up through an oculus
//    at a plane of sky that a slow chromatic light-arc drives across the
//    luminosity threshold — until the aperture stops reading as a hole to the sky
//    and becomes a solid, self-luminous panel hovering just above you?"
//
//   You look UP at a crisp-edged opening in a dark ceiling. Inside it: a near-flat
//   sky-plane whose colour cycles pale-blue → silver → deep-slate → back over ~78s.
//   A hidden cove light shifts the chamber toward the OPPONENT of the sky so the
//   aperture's colour is exaggerated. As the sky's luminance climbs past a
//   threshold, the opening flips from a receding hole into an advancing, self-
//   luminous solid — light spilling outward onto the chamber walls to prove it.
//
//   Two drivers, both degrading gracefully: breath (mic RMS envelope; falls back
//   to a ~0.15 Hz auto-breath) dilates the aperture and nudges the sky toward the
//   threshold; gaze (device tilt; falls back to pointer drag + a slow auto drift)
//   looks further up into the oculus. The chromatic arc runs autonomously, so the
//   flip is guaranteed even with sound off and nobody touching it.
//
//   REFS  James Turrell · "Skyspace" / Ganzfeld-aperture works (the architectural
//         oculus + hidden opponent cove-light that flattens sky into solid);
//         Duay & Nagai, "The luminosity threshold", PLOS ONE 2026 (the luminance
//         boundary where a patch stops reading as illuminated surface and reads as
//         self-luminous). Deterministic: mulberry32 seed only; performance.now.
// ─────────────────────────────────────────────────────────────────────────────

import { Canvas, useFrame, type RootState } from "@react-three/fiber";
import { ScreenQuad } from "@react-three/drei";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { createVoidReverb } from "../_shared/visionary/convolutionVoid";
import { mulberry32 } from "../_shared/erosion/engine";

// ── the slow chromatic arc ───────────────────────────────────────────────────
// sRGB-ish keyframes. Luminances (Rec.709): paleBlue ≈ 0.53 (below threshold →
// reads as sky/hole), silver ≈ 0.89 (well above → self-luminous), slate ≈ 0.25
// (well below). The path crosses the 0.60 threshold on the way up and back down,
// so the flip happens at least twice per ~78 s cycle with zero input.
const ARC: { p: number; c: [number, number, number] }[] = [
  { p: 0.0, c: [0.42, 0.55, 0.72] }, // pale blue
  { p: 0.34, c: [0.86, 0.89, 0.93] }, // silver-white
  { p: 0.68, c: [0.2, 0.26, 0.34] }, // deep slate
  { p: 1.0, c: [0.42, 0.55, 0.72] }, // back to pale blue
];
const ARC_PERIOD = 78; // seconds for one full traverse
const THRESHOLD = 0.6; // luminosity-threshold (surface → self-luminous)
const CHAMBER: [number, number, number] = [0.055, 0.065, 0.085]; // deep slate stone

const lum = (r: number, g: number, b: number) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Sample the arc at phase p ∈ [0,1), with eased blends between keyframes. */
function sampleArc(p: number): [number, number, number] {
  const pp = ((p % 1) + 1) % 1;
  for (let i = 0; i < ARC.length - 1; i++) {
    const a = ARC[i];
    const b = ARC[i + 1];
    if (pp >= a.p && pp <= b.p) {
      const t = smoothstep(a.p, b.p, pp);
      return [
        a.c[0] + (b.c[0] - a.c[0]) * t,
        a.c[1] + (b.c[1] - a.c[1]) * t,
        a.c[2] + (b.c[2] - a.c[2]) * t,
      ];
    }
  }
  return ARC[0].c;
}

// ── inharmonic choral drone ──────────────────────────────────────────────────
const RATIOS = [1, 1.34, 1.79, 2.36, 3.03, 3.91, 4.87, 6.14];
const ROOT_HZ = 55;

interface Drone {
  update(breath: number, flip: number): void;
  stop(): void;
}

function startDrone(
  ctx: AudioContext,
  dest: AudioNode,
  rng: () => number,
): Drone {
  const oscs: OscillatorNode[] = [];
  const partialGains: GainNode[] = [];
  const baseWeights: number[] = [];

  RATIOS.forEach((ratio, k) => {
    const pg = ctx.createGain();
    pg.gain.value = 0; // ramp in from silence
    pg.connect(dest);
    partialGains.push(pg);
    // higher partials quieter, scaled down so the summed bank never slams master
    baseWeights.push((1 / (k * 0.9 + 1)) * 0.16);

    const voices = k < 4 ? 3 : 2;
    for (let v = 0; v < voices; v++) {
      const o = ctx.createOscillator();
      o.type = "sine";
      const cents = (rng() * 2 - 1) * (3 + rng() * 3); // ±3–6 cents detune
      o.frequency.value = ROOT_HZ * ratio * Math.pow(2, cents / 1200);
      const vg = ctx.createGain();
      vg.gain.value = 1 / voices;
      o.connect(vg);
      vg.connect(pg);
      o.start();
      oscs.push(o);
    }
  });

  return {
    update(breath: number, flip: number) {
      const now = ctx.currentTime;
      RATIOS.forEach((_, k) => {
        // the "flip" is audible: above threshold the spectrum OPENS upward,
        // re-weighting energy into the higher inharmonic partials.
        const open = 1 + flip * (k / 7) * 1.7;
        const g = baseWeights[k] * open * (0.35 + 0.65 * breath);
        partialGains[k].gain.setTargetAtTime(g, now, 0.35);
      });
    },
    stop() {
      oscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        o.disconnect();
      });
      partialGains.forEach((g) => g.disconnect());
    },
  };
}

// ── shared mutable engine state (read/written across the rAF frame) ──────────
interface EngineState {
  // inputs, set by listeners
  micAnalyser: AnalyserNode | null;
  micData: Float32Array<ArrayBuffer> | null;
  orientEnabled: boolean;
  orientGaze: number; // −1..1 from device tilt
  pointerGaze: number; // −1..1 from drag
  pointerActive: boolean;
  drone: Drone | null;
  // persistent per-frame state
  t: number;
  phase: number;
  breath: number;
  gaze: number;
  flip: number;
  hudAccum: number;
}

const VERTEX = /* glsl */ `
precision highp float;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform vec3 uSky;
uniform vec3 uChamber;
uniform float uFlip;
uniform float uBreath;
uniform float uGaze;
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 uv = vUv;

  // the oculus: looking up (gaze) draws it toward the viewer and enlarges it a touch
  float cy = 0.60 - uGaze * 0.16;
  vec2 d = uv - vec2(0.5, cy);
  d.x *= aspect;
  float r = length(d);
  float radius = 0.26 * (1.0 + uBreath * 0.06 + uGaze * 0.04);
  float aa = 1.5 / max(uResolution.y, 1.0);
  float ap = 1.0 - smoothstep(radius - aa, radius + aa, r);

  // sky-plane: near-flat. A faint vertical gradient reads as recessed depth when
  // BELOW threshold; it flattens to a solid panel as the flip completes.
  float gy = clamp((uv.y - (cy - radius)) / (2.0 * radius), 0.0, 1.0);
  float depthGrad = (1.0 - uFlip) * 0.09 * ((gy - 0.5) * 2.0);
  vec3 sky = uSky * (1.0 + depthGrad);

  // chamber: deep slate carrying a faint OPPONENT cove-light near the rim
  float cove = (1.0 - smoothstep(radius, radius + 0.16, r)) * (1.0 - ap);
  vec3 opp = vec3(1.0) - uSky;
  vec3 chamber = uChamber + opp * cove * 0.10 * (0.5 + 0.5 * uBreath);

  // self-luminous spill: above threshold the aperture ADVANCES, bleeding light
  // outward onto the walls. Below threshold there is no spill — it stays a hole.
  float halo = (1.0 - smoothstep(radius, radius + 0.30, r)) * (1.0 - ap);
  vec3 spill = uSky * halo * uFlip * 0.42;

  vec3 col = mix(chamber, sky, ap) + spill;

  // vignette seats the dark chamber around you
  float vig = smoothstep(1.25, 0.25, length((uv - 0.5) * vec2(aspect, 1.0)));
  col *= mix(0.6, 1.0, vig);

  // gentle dither kills banding on the near-flat field (no strobe, per-frame noise)
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

interface SceneProps {
  engineRef: MutableRefObject<EngineState>;
  onHud: (breath: number, flip: number, phase: number) => void;
}

function OculusScene({ engineRef, onHud }: SceneProps) {
  const material = useMemo(
    () =>
      new THREE.RawShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new THREE.Vector2(1, 1) },
          uSky: { value: new THREE.Vector3(0.42, 0.55, 0.72) },
          uChamber: {
            value: new THREE.Vector3(CHAMBER[0], CHAMBER[1], CHAMBER[2]),
          },
          uFlip: { value: 0 },
          uBreath: { value: 0 },
          uGaze: { value: 0 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        depthTest: false,
        depthWrite: false,
      }),
    [],
  );

  useEffect(() => () => material.dispose(), [material]);

  useFrame((state: RootState, delta: number) => {
    const e = engineRef.current;
    const dt = Math.min(0.05, delta);
    e.t += dt;
    const t = e.t;

    // ── breath envelope ──────────────────────────────────────────────────
    let breathTarget: number;
    if (e.micAnalyser && e.micData) {
      e.micAnalyser.getFloatTimeDomainData(e.micData);
      let sum = 0;
      for (let i = 0; i < e.micData.length; i++) sum += e.micData[i] * e.micData[i];
      const rms = Math.sqrt(sum / e.micData.length);
      breathTarget = smoothstep(0.006, 0.09, rms); // exhale → louder → toward 1
    } else {
      // no mic → self-demoing ~0.15 Hz auto-breath
      breathTarget = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.15 * t);
    }
    // slow follow (≤0.2 Hz feel), τ ≈ 1.6 s
    e.breath += (breathTarget - e.breath) * (1 - Math.exp(-dt / 1.6));

    // ── gaze ─────────────────────────────────────────────────────────────
    let gazeTarget: number;
    if (e.orientEnabled) gazeTarget = e.orientGaze;
    else if (e.pointerActive) gazeTarget = e.pointerGaze;
    else gazeTarget = 0.4 * Math.sin(2 * Math.PI * 0.02 * t); // slow auto drift
    e.gaze += (gazeTarget - e.gaze) * (1 - Math.exp(-dt / 0.9));

    // ── autonomous chromatic arc ─────────────────────────────────────────
    e.phase = (e.phase + dt / ARC_PERIOD) % 1;
    const base = sampleArc(e.phase);
    // breath nudges the plane toward the silver threshold-crosser
    const nudge = e.breath * 0.1;
    const sr = base[0] + (0.86 - base[0]) * nudge;
    const sg = base[1] + (0.89 - base[1]) * nudge;
    const sb = base[2] + (0.93 - base[2]) * nudge;
    e.flip = smoothstep(THRESHOLD - 0.09, THRESHOLD + 0.09, lum(sr, sg, sb));

    // ── push to uniforms ─────────────────────────────────────────────────
    const u = material.uniforms;
    u.uTime.value = t;
    (u.uResolution.value as THREE.Vector2).set(state.size.width, state.size.height);
    (u.uSky.value as THREE.Vector3).set(sr, sg, sb);
    u.uFlip.value = e.flip;
    u.uBreath.value = e.breath;
    u.uGaze.value = e.gaze;

    // ── drive audio with the SAME numbers ────────────────────────────────
    e.drone?.update(e.breath, e.flip);

    // ── throttled HUD ────────────────────────────────────────────────────
    e.hudAccum += dt;
    if (e.hudAccum > 0.12) {
      e.hudAccum = 0;
      onHud(e.breath, e.flip, e.phase);
    }
  });

  return (
    <ScreenQuad>
      <primitive object={material} attach="material" />
    </ScreenQuad>
  );
}

export default function SkyoculusPage() {
  const [begun, setBegun] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [hud, setHud] = useState({ breath: 0, flip: 0, phase: 0 });

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<ReturnType<typeof createSafeMaster> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const engineRef = useRef<EngineState>({
    micAnalyser: null,
    micData: null,
    orientEnabled: false,
    orientGaze: 0,
    pointerGaze: 0,
    pointerActive: false,
    drone: null,
    t: 0,
    phase: 0,
    breath: 0,
    gaze: 0,
    flip: 0,
    hudAccum: 0,
  });

  const onHud = useCallback((breath: number, flip: number, phase: number) => {
    setHud({ breath, flip, phase });
  }, []);

  // ── pointer-drag gaze fallback (attached to the chamber wrapper) ──────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const e = engineRef.current;
    const setFromClientY = (clientY: number) => {
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      e.pointerGaze = Math.max(-1, Math.min(1, (mid - clientY) / (rect.height / 2)));
    };
    const down = (ev: PointerEvent) => {
      e.pointerActive = true;
      setFromClientY(ev.clientY);
    };
    const move = (ev: PointerEvent) => {
      if (e.pointerActive) setFromClientY(ev.clientY);
    };
    const up = () => {
      e.pointerActive = false;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // ── device-orientation gaze (gated behind begin) ─────────────────────────
  const onOrient = useCallback((ev: DeviceOrientationEvent) => {
    if (ev.beta == null) return;
    const e = engineRef.current;
    e.orientEnabled = true;
    // tilt the phone up → look further up the oculus
    e.orientGaze = Math.max(-1, Math.min(1, (ev.beta - 40) / 45));
  }, []);

  useEffect(() => {
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
    };
  }, [onOrient]);

  // ── full teardown ────────────────────────────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current; // stable object; drone is set on it later
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      engine.drone?.stop();
      masterRef.current?.disconnect();
      micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, [onOrient]);

  const begin = useCallback(async () => {
    if (begun) return;
    setBegun(true);

    // 1) audio — inharmonic drone → void reverb → safe master
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) {
        setStatus("No Web Audio — the aperture still breathes and flips on its own.");
      } else {
        const ctx = new AC();
        await ctx.resume();
        const master = createSafeMaster(ctx, { gain: 0.16 });
        const reverb = createVoidReverb(ctx, { seconds: 5, decay: 3, wet: 0.35 });
        reverb.output.connect(master.input);
        const rng = mulberry32(0x10056);
        const drone = startDrone(ctx, reverb.input, rng);
        ctxRef.current = ctx;
        masterRef.current = master;
        engineRef.current.drone = drone;
      }
    } catch {
      setStatus("Audio could not start — the visual still runs on its own.");
    }

    // 2) mic — breath envelope (explicit gesture; auto-breath continues if denied)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = ctxRef.current;
      if (ctx) {
        micStreamRef.current = stream;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.7;
        src.connect(analyser); // analysis only — never routed to output
        engineRef.current.micAnalyser = analyser;
        engineRef.current.micData = new Float32Array(analyser.fftSize);
      } else {
        stream.getTracks().forEach((tr) => tr.stop());
      }
    } catch {
      // denied / unavailable → the ~0.15 Hz auto-breath keeps it alive
    }

    // 3) device orientation — gaze up (iOS needs an explicit permission request)
    try {
      const DOE = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (DOE && typeof DOE.requestPermission === "function") {
        const res = await DOE.requestPermission();
        if (res === "granted")
          window.addEventListener("deviceorientation", onOrient);
      } else if (typeof window.DeviceOrientationEvent !== "undefined") {
        window.addEventListener("deviceorientation", onOrient);
      }
    } catch {
      // unavailable → pointer drag + slow auto-drift cover the gaze verb
    }
  }, [begun, onOrient]);

  const reads = hud.flip > 0.5 ? "self-luminous solid" : "aperture to the sky";
  const pct = (v: number) => Math.round(v * 100);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-5 py-10 pb-24">
        <header className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            10056 · skyspace · luminosity threshold
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Skyoculus
          </h1>
          <p className="max-w-prose text-base text-muted-foreground">
            Lie back beneath a dark chamber and look up through an oculus at a
            plane of sky. A slow chromatic arc drives its luminance across a
            threshold until the opening stops reading as a hole to the sky and
            becomes a solid, self-luminous panel hovering just above you.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          {!begun ? (
            <button
              type="button"
              onClick={begin}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enter the chamber
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              reads as · {reads}
            </span>
          )}
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            breath {pct(hud.breath)}% · flip {pct(hud.flip)}%
          </span>
        </div>

        {status && <p className="text-base text-destructive">{status}</p>}

        <div
          ref={wrapRef}
          className="relative h-[62vh] min-h-[380px] w-full touch-none overflow-hidden rounded-lg border border-border bg-background"
        >
          <Canvas
            flat
            linear
            dpr={[1, 2]}
            gl={{ antialias: true }}
            camera={{ position: [0, 0, 1] }}
          >
            <OculusScene engineRef={engineRef} onHud={onHud} />
          </Canvas>
        </div>

        <p className="text-base text-muted-foreground">
          Exhale to dilate the oculus and push the sky toward the threshold; tilt
          the phone up (or drag upward) to look further into it. With no mic and
          no touch it self-demos — a ~0.15 Hz breath, a slow gaze drift, and an
          autonomous colour arc that crosses the flip on its own.
        </p>

        <section className="flex flex-col gap-2 border-t border-border pt-5">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            after Turrell · Duay &amp; Nagai
          </p>
          <p className="max-w-prose text-base text-muted-foreground">
            The hidden cove light shifts the chamber toward the opponent of the
            sky so the aperture&apos;s colour is exaggerated — Turrell&apos;s trick
            for making sky flatten into surface. The luminosity threshold is the
            luminance boundary where a patch stops reading as an illuminated
            surface and reads as self-luminous; here the eight-partial inharmonic
            drone opens its spectrum at the same moment the light does.
          </p>
        </section>
      </div>

      <PrototypeNav slugs={["10056-skyoculus"]} />
    </main>
  );
}
