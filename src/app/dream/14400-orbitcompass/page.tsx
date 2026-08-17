"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14400-orbitcompass — "What if your whole catalog were arranged in a 360° ring
// around you in 3D space, and you turned — with your phone's compass or the arrow
// keys — to face and draw forward each recording?"
//
//   THE SCENE — you stand at the centre of a warm dawn horizon rendered in
//   three.js. Every one of Karel's real recordings hangs as a glowing amber orb
//   on a horizontal ring around you, equally spaced in azimuth (16 tracks →
//   22.5° apart). A faint gold orbit line threads them; a deep indigo-to-amber
//   sky dome wraps the whole world.
//
//   THE INSTRUMENT — your HEADING chooses which recording you face. On a phone,
//   the device-orientation compass turns the world as you physically turn your
//   body. On a desktop, A/D or ←/→ rotate the view. The recording nearest your
//   facing azimuth is loudest, brightest and open; others fall off with a cosine
//   (equal-power) curve as they slide off-axis, and get progressively lowpassed
//   the further they sit behind you — so turning your body live-MIXES the catalog.
//
//   AUDIO — Karel's real catalog ONLY (13 Welcome Home + 3 Snowflake), each track
//   an infinitely looping BufferSource. Per track:
//     source → StereoPanner (pan = sin Δazimuth) → gain (cosine focus) →
//     lowpass (cutoff rises with focus) → shared ear-safety master.
//   Tracks load progressively, nearest-your-heading first, and fade in as they
//   arrive, so the first sound lands a second or two after you press Enter.
//
//   REFERENCE — "A Scene Representation for Online Spatial Sonification"
//   (arXiv:2412.05486): a 360° circular rasterisation of a 3D scene onto a ring
//   of sound cues. This is the musical inverse — each recording is a fixed point
//   on the ring, and the listener's heading rasterises the ring into a live mix.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

// ── ring layout ──────────────────────────────────────────────────────────────
const TRACKS = REAL_TRACKS;
const N = TRACKS.length; // 16
const RING_RADIUS = 13;
const ORB_Y = 1.2; // orbs ring the horizon at ~eye level
const EYE_Y = 1.4;

// ── control dynamics ─────────────────────────────────────────────────────────
const TURN_SPEED = 1.7; // rad/s for keyboard rotation
const IDLE_DRIFT = 0.11; // rad/s gentle auto-rotate when idle (demo)
const IDLE_AFTER_MS = 3200;
const COMPASS_FRESH_MS = 1400;

// ── audio falloff ────────────────────────────────────────────────────────────
const FOCUS_POW = 1.35; // sharpen the cosine focus lobe
const CUT_MIN = 300; // Hz, cutoff when a track is straight behind you
const CUT_MAX = 14000; // Hz, cutoff when a track is dead ahead
const TRACK_GAIN = 0.92;

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

/** Wrap an angle to (-π, π]. */
function wrapPi(a: number): number {
  a = ((a + Math.PI) % TAU + TAU) % TAU;
  return a - Math.PI;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

type InputMode = "auto" | "compass" | "keys";

interface Orb {
  track: (typeof TRACKS)[number];
  azimuth: number;
  // visuals
  core: THREE.Mesh;
  halo: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
  // audio (attached lazily once the buffer decodes)
  src: AudioBufferSourceNode | null;
  panner: StereoPannerNode | null;
  gain: GainNode | null;
  lowpass: BiquadFilterNode | null;
  analyser: AnalyserNode | null;
  data: Uint8Array<ArrayBuffer> | null;
  loaded: boolean;
  amp: number; // smoothed per-track amplitude
  focus: number; // last computed facing focus 0..1
}

export default function OrbitCompassPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const enteredRef = useRef(false);

  // scene state shared with the render loop
  const orbsRef = useRef<Orb[]>([]);
  const rafRef = useRef(0);
  const headingRef = useRef(0); // smoothed heading (radians, unbounded)
  const compassTargetRef = useRef(0);
  const lastCompassRef = useRef(0);
  const lastKeyRef = useRef(0);
  const keyRef = useRef({ left: false, right: false });
  const modeRef = useRef<InputMode>("auto");

  // discrete UI state
  const [started, setStarted] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [facing, setFacing] = useState<string>("");
  const [mode, setMode] = useState<InputMode>("auto");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [glError, setGlError] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // ── enter: unlock audio, request compass, load catalog nearest-first ─────────
  const enter = useCallback(async () => {
    if (enteredRef.current) return;

    // ── AudioContext + safe master ────────────────────────────────────────────
    let ctx = ctxRef.current;
    if (!ctx) {
      try {
        const Ctor: typeof AudioContext =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctor) {
          setAudioError("Web Audio is unavailable — visuals only.");
          setStarted(true);
          return;
        }
        ctx = new Ctor();
        ctxRef.current = ctx;
      } catch {
        setAudioError("Audio failed to start — visuals continue silently.");
        setStarted(true);
        return;
      }
    }
    try {
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      /* the gesture should have covered this */
    }

    let safe = safeRef.current;
    if (!safe) {
      safe = createSafeMaster(ctx);
      safeRef.current = safe;
    }

    enteredRef.current = true;
    setStarted(true);
    setAudioOn(true);

    // ── iOS 13+ compass permission (must run inside this gesture) ──────────────
    try {
      const doe = window.DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (doe && typeof doe.requestPermission === "function") {
        const res = await doe.requestPermission();
        if (res !== "granted") {
          setNotice("Compass denied — A / D or ← / → arrow keys steer instead.");
        }
      }
    } catch {
      /* non-iOS or already granted — keys always work as a fallback */
    }

    // ── progressive load: nearest the current heading first ────────────────────
    const orbs = orbsRef.current;
    const order = orbs
      .map((_, i) => i)
      .sort(
        (a, b) =>
          Math.abs(wrapPi(orbs[a].azimuth - headingRef.current)) -
          Math.abs(wrapPi(orbs[b].azimuth - headingRef.current)),
      );

    let anyOk = false;
    let anyFail = false;
    for (const i of order) {
      if (!ctxRef.current || ctxRef.current.state === "closed") break;
      if (!enteredRef.current) break;
      const orb = orbs[i];
      try {
        const { buffer } = await loadRealTrackBuffer(ctx, orb.track.id);
        if (!enteredRef.current || !ctxRef.current) break;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        const panner = ctx.createStereoPanner();
        const gain = ctx.createGain();
        gain.gain.value = 0.0001;
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.value = CUT_MIN;
        lowpass.Q.value = 0.5;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.85;

        // source → panner → gain → lowpass → safe master ; passive analyser tap
        src.connect(panner);
        panner.connect(gain);
        gain.connect(lowpass);
        lowpass.connect(safe.input);
        src.connect(analyser);

        // offset each loop start a little so 16 loops don't phase-lock
        src.start(ctx.currentTime, (i * 3.1) % Math.max(1, buffer.duration));

        orb.src = src;
        orb.panner = panner;
        orb.gain = gain;
        orb.lowpass = lowpass;
        orb.analyser = analyser;
        orb.data = new Uint8Array(analyser.frequencyBinCount);
        orb.loaded = true;
        anyOk = true;
        setLoadedCount((c) => c + 1);
      } catch {
        anyFail = true;
      }
    }

    if (!anyOk) {
      setAudioError(
        "None of the recordings could load right now. Check your connection and press Enter again.",
      );
    } else if (anyFail) {
      setNotice((n) =>
        n ?? "Some recordings couldn't load and were skipped — the rest are singing.",
      );
    }
  }, []);

  // ── tear the audio graph down ────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    enteredRef.current = false;
    for (const orb of orbsRef.current) {
      try {
        orb.src?.stop();
      } catch {
        /* already stopped */
      }
      orb.src = null;
      orb.panner = null;
      orb.gain = null;
      orb.lowpass = null;
      orb.analyser = null;
      orb.data = null;
      orb.loaded = false;
    }
    try {
      safeRef.current?.disconnect();
    } catch {
      /* closing */
    }
    const ctx = ctxRef.current;
    safeRef.current = null;
    ctxRef.current = null;
    if (ctx) void ctx.close();
    setAudioOn(false);
    setLoadedCount(0);
  }, []);

  // ── build + run the three.js world ────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setGlError(true);
      return;
    }

    const reduced = prefersReducedMotion();

    let w = mount.clientWidth || window.innerWidth;
    let h = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(66, w / h, 0.1, 200);
    camera.position.set(0, EYE_Y, 0);

    // ── dawn sky dome (deep indigo up → amber-gold at the horizon) ─────────────
    const skyGeo = new THREE.SphereGeometry(90, 40, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x1c1440) }, // deep indigo
        horizonColor: { value: new THREE.Color(0xff9c4a) }, // amber-gold
        bottomColor: { value: new THREE.Color(0x0c0a1c) }, // deep warm night
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        varying vec3 vDir;
        void main() {
          float y = clamp(vDir.y, -1.0, 1.0);
          vec3 col;
          if (y > 0.0) {
            col = mix(horizonColor, topColor, pow(y, 0.55));
          } else {
            col = mix(horizonColor, bottomColor, pow(-y, 0.7));
          }
          // warm glow band hugging the horizon line
          float band = exp(-abs(y) * 9.0);
          col += horizonColor * band * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // ── faint gold orbit line the recordings hang from ─────────────────────────
    const ringGeo = new THREE.RingGeometry(RING_RADIUS - 0.06, RING_RADIUS + 0.06, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffb86b,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = ORB_Y;
    scene.add(ring);

    // ── the orbs: one warm sphere + additive halo per recording ────────────────
    const coreGeo = new THREE.SphereGeometry(0.42, 24, 18);
    const haloGeo = new THREE.SphereGeometry(0.42, 20, 14);
    const orbs: Orb[] = [];
    for (let i = 0; i < N; i++) {
      const az = (i / N) * TAU;
      const px = Math.sin(az) * RING_RADIUS;
      const pz = -Math.cos(az) * RING_RADIUS;

      const coreMat = new THREE.MeshBasicMaterial({ color: 0xffb367 });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.set(px, ORB_Y, pz);
      scene.add(core);

      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xffcf8f,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(px, ORB_Y, pz);
      scene.add(halo);

      orbs.push({
        track: TRACKS[i],
        azimuth: az,
        core,
        halo,
        coreMat,
        haloMat,
        src: null,
        panner: null,
        gain: null,
        lowpass: null,
        analyser: null,
        data: null,
        loaded: false,
        amp: 0,
        focus: 0,
      });
    }
    orbsRef.current = orbs;

    // reusable scratch
    const tmpColor = new THREE.Color();
    const forward = new THREE.Vector3();

    let prev = performance.now();
    // seed idle timers so the demo drifts immediately until the first input
    lastKeyRef.current = prev - IDLE_AFTER_MS - 1000;
    lastCompassRef.current = prev - COMPASS_FRESH_MS - 1000;
    let uiThrottle = 0;

    const frame = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - prev) / 1000));
      prev = ts;

      // ── choose input source + advance heading ─────────────────────────────────
      const compassFresh = ts - lastCompassRef.current < COMPASS_FRESH_MS;
      let nextMode: InputMode;
      if (compassFresh) {
        // shortest-angle chase toward the compass reading
        const delta = wrapPi(compassTargetRef.current - headingRef.current);
        headingRef.current += delta * (1 - Math.exp(-dt / 0.18));
        nextMode = "compass";
      } else {
        const k = keyRef.current;
        const turn = (k.right ? 1 : 0) - (k.left ? 1 : 0);
        if (turn !== 0) {
          headingRef.current += turn * TURN_SPEED * dt;
          lastKeyRef.current = ts;
          nextMode = "keys";
        } else if (ts - lastKeyRef.current > IDLE_AFTER_MS) {
          if (!reduced) headingRef.current += IDLE_DRIFT * dt;
          nextMode = "auto";
        } else {
          nextMode = "keys";
        }
      }
      if (nextMode !== modeRef.current) {
        modeRef.current = nextMode;
        setMode(nextMode);
      }

      const heading = headingRef.current;

      // ── aim the camera along the heading ──────────────────────────────────────
      forward.set(Math.sin(heading), 0, -Math.cos(heading));
      camera.lookAt(
        forward.x * 10,
        ORB_Y, // look level so the horizon stays flat
        forward.z * 10,
      );

      // ── per-orb spatial mix + visual response ─────────────────────────────────
      let bestFocus = -1;
      let bestIdx = 0;
      const ctx = ctxRef.current;
      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        const rel = wrapPi(orb.azimuth - heading); // 0 = dead ahead
        // cosine (equal-power) focus lobe: 1 ahead → 0 behind
        const focus = Math.pow(0.5 * (1 + Math.cos(rel)), FOCUS_POW);
        orb.focus = focus;
        if (focus > bestFocus) {
          bestFocus = focus;
          bestIdx = i;
        }

        // per-track amplitude from its own analyser (drives the glow pulse)
        if (orb.analyser && orb.data) {
          orb.analyser.getByteTimeDomainData(orb.data);
          let sum = 0;
          for (let j = 0; j < orb.data.length; j++) {
            const v = (orb.data[j] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / orb.data.length);
          orb.amp += (rms - orb.amp) * 0.2;
        }

        // audio: pan by sin(Δ), gain by focus, cutoff rises with focus
        if (ctx && orb.gain && orb.panner && orb.lowpass) {
          const t = ctx.currentTime;
          orb.panner.pan.setTargetAtTime(clamp(Math.sin(rel), -1, 1), t, 0.06);
          orb.gain.gain.setTargetAtTime(focus * TRACK_GAIN, t, 0.06);
          const cut = CUT_MIN * Math.pow(CUT_MAX / CUT_MIN, focus);
          orb.lowpass.frequency.setTargetAtTime(cut, t, 0.08);
        }

        // visuals: focused orbs bloom warm; distant orbs recede toward the sky
        const lit = 0.28 + focus * 0.5 + orb.amp * 0.35;
        tmpColor.setHSL(0.085 - focus * 0.01, 0.85, clamp(lit, 0.12, 0.85));
        orb.coreMat.color.copy(tmpColor);
        const scale = 0.55 + focus * 1.15 + orb.amp * focus * 0.9;
        orb.core.scale.setScalar(scale);
        orb.halo.scale.setScalar(scale * 2.3);
        orb.haloMat.opacity = 0.12 + focus * 0.55 + orb.amp * focus * 0.4;
      }

      // throttled chrome updates (facing title)
      uiThrottle += dt;
      if (uiThrottle > 0.12) {
        uiThrottle = 0;
        setFacing(orbs[bestIdx].track.title);
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    // ── resize ────────────────────────────────────────────────────────────────
    const onResize = () => {
      w = mount.clientWidth || window.innerWidth;
      h = mount.clientHeight || window.innerHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── device compass ──────────────────────────────────────────────────────────
    const onOrient = (e: DeviceOrientationEvent) => {
      // iOS exposes a true compass heading; elsewhere alpha is the z-rotation.
      const compass = (e as unknown as { webkitCompassHeading?: number })
        .webkitCompassHeading;
      let deg: number | null = null;
      if (typeof compass === "number" && !Number.isNaN(compass)) {
        deg = compass; // clockwise from north
      } else if (e.alpha !== null && e.alpha !== undefined) {
        deg = 360 - e.alpha; // alpha grows counter-clockwise
      }
      if (deg === null) return;
      compassTargetRef.current = (deg * Math.PI) / 180;
      lastCompassRef.current = performance.now();
    };
    window.addEventListener("deviceorientation", onOrient);

    // ── keyboard fallback (A/D + arrows) ────────────────────────────────────────
    const setKey = (key: string, on: boolean): boolean => {
      const k = keyRef.current;
      switch (key) {
        case "ArrowLeft":
        case "a":
        case "A":
          k.left = on;
          return true;
        case "ArrowRight":
        case "d":
        case "D":
          k.right = on;
          return true;
        default:
          return false;
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (setKey(e.key, true)) {
        e.preventDefault();
        lastKeyRef.current = performance.now();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (setKey(e.key, false)) e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    // ── teardown ────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);

      for (const orb of orbs) {
        orb.coreMat.dispose();
        orb.haloMat.dispose();
      }
      coreGeo.dispose();
      haloGeo.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── full audio teardown on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      enteredRef.current = false;
      for (const orb of orbsRef.current) {
        try {
          orb.src?.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        safeRef.current?.disconnect();
      } catch {
        /* closing */
      }
      const ctx = ctxRef.current;
      safeRef.current = null;
      ctxRef.current = null;
      if (ctx) void ctx.close();
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* three.js world */}
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none select-none"
        aria-hidden
      />

      {glError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-8">
          <div className="max-w-md space-y-3 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              webgl unavailable
            </p>
            <p className="text-base text-muted-foreground">
              This spatial compass needs WebGL, which is not available in this
              browser. Try a different browser to see the ring of recordings.
            </p>
          </div>
        </div>
      )}

      {/* chrome — semantic tokens only */}
      <div
        data-chrome
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-3 p-5 sm:p-7"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="pointer-events-auto max-w-md">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Orbit Compass
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              Karel&rsquo;s whole catalog rings you at the centre of a dawn
              horizon. Turn — with your phone&rsquo;s compass or the arrow keys —
              to face and draw each recording forward.
            </p>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={enter}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {started ? "Enter again" : "Enter the ring"}
              </button>
            ) : (
              <button
                type="button"
                onClick={stopAudio}
                className="min-h-[44px] rounded-md border border-border bg-muted px-5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Mute
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>input · {mode === "compass" ? "compass" : mode === "keys" ? "keys" : "auto-turn"}</span>
          {audioOn && (
            <span>
              loaded · {loadedCount} / {N}
            </span>
          )}
          {audioOn && facing && (
            <span className="text-foreground">facing · {facing}</span>
          )}
          {mode === "auto" && audioOn && (
            <span className="text-muted-foreground/80">
              turning slowly — press A / D or ← / → to steer
            </span>
          )}
          {notice && <span className="text-muted-foreground/80">{notice}</span>}
          {audioError && <span className="text-destructive">{audioError}</span>}
        </div>
      </div>

      {!started && (
        <div
          data-chrome
          className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex justify-center px-6"
        >
          <p className="max-w-md text-center text-base text-muted-foreground">
            Press <span className="text-foreground">Enter the ring</span> — the
            recordings load nearest-first and fade in as you turn to face them.
          </p>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          data-chrome
          className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg space-y-3 rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              design notes
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              A catalog you turn to face
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              You stand at the centre of a ring. All {N} of Karel&rsquo;s real
              recordings (13 Welcome Home + 3 Snowflake) hang as warm orbs spaced
              equally around you in azimuth. Your heading picks which one you
              face: the nearest recording is loudest, brightest and fully open;
              the others fall off along a cosine (equal-power) curve as they
              slide off-axis and get progressively lowpassed the further they sit
              behind you. Turning your body live-mixes the whole catalog.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Input is your <span className="text-foreground">heading</span>: the
              device-orientation compass on a phone (turn your body), or A / D and
              the ← / → arrow keys on a desktop. Each recording loops forever
              through its own StereoPanner, gain and lowpass into the shared
              ear-safety master. Tracks load nearest-your-heading first and fade
              in as they arrive.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              After &ldquo;A Scene Representation for Online Spatial
              Sonification&rdquo; (arXiv:2412.05486), which rasterises a 3D scene
              onto a 360° ring of sound cues — here inverted, so each recording is
              a fixed point and your heading rasterises the ring into a live mix.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["14400-orbitcompass"]} />
    </main>
  );
}
