"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import {
  buildMasterChain,
  startAmbientPad,
  playBell,
  runAutocorrelation,
  snapToPentatonic,
  type MasterChain,
} from "./audio";
import { GardenField, type GrowthSite } from "./garden";

type MicState = "idle" | "live" | "denied" | "fallback";

// Vertex shader: animate gentle breathing/sway in the GPU so thousands of
// points stay smooth. Per-point attributes carry size, color, sway phase.
const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute float aPulse;
  attribute vec3 aColor;
  uniform float uTime;
  uniform float uBreath;
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    vColor = aColor;
    vPulse = aPulse;
    vec3 p = position;
    // slow sway: each point drifts on a tiny circle, scaled by radius from center
    float r = length(p.xy);
    float sway = 0.012 * (0.3 + r);
    p.x += sin(uTime * 0.5 + aPhase) * sway;
    p.y += cos(uTime * 0.4 + aPhase * 1.3) * sway;
    // breathing: whole field gently inflates
    p.xy *= uBreath;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float pulseScale = 1.0 + aPulse * 1.8;
    gl_PointSize = aSize * pulseScale * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

// Fragment shader: soft round petal/pollen dot with a warm glow.
const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vPulse;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    float glow = soft * soft;
    vec3 col = vColor + vPulse * 0.6;
    float alpha = glow * (0.55 + vPulse * 0.45);
    gl_FragColor = vec4(col, alpha);
  }
`;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0), f(8), f(4)];
}

export default function KidsSingGarden() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [micState, setMicState] = useState<MicState>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [siteCount, setSiteCount] = useState(0);

  // refs that live across the session
  const actxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<MasterChain | null>(null);
  const stopPadRef = useRef<(() => void) | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const fieldRef = useRef<GardenField | null>(null);
  const rafRef = useRef<number>(0);
  const fallbackRef = useRef<boolean>(false);

  // three.js refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const geomRef = useRef<THREE.BufferGeometry | null>(null);
  const matRef = useRef<THREE.ShaderMaterial | null>(null);

  // Push one growth site's data into the geometry attributes.
  const writeSiteToGeom = useCallback((index: number, site: GrowthSite) => {
    const geom = geomRef.current;
    if (!geom) return;
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    const col = geom.getAttribute("aColor") as THREE.BufferAttribute;
    const size = geom.getAttribute("aSize") as THREE.BufferAttribute;
    const phase = geom.getAttribute("aPhase") as THREE.BufferAttribute;
    const pulse = geom.getAttribute("aPulse") as THREE.BufferAttribute;

    const x = Math.cos(site.angle) * site.radius;
    const y = Math.sin(site.angle) * site.radius;
    pos.setXYZ(index, x, y, 0);
    const [r, g, b] = hslToRgb(site.hue, 0.7, 0.55);
    col.setXYZ(index, r, g, b);
    size.setX(index, 6 + site.vigor * 18);
    phase.setX(index, site.seed);
    pulse.setX(index, site.pulse);
  }, []);

  const seedNote = useCallback(
    (freq: number, level: number) => {
      const field = fieldRef.current;
      const actx = actxRef.current;
      const master = masterRef.current;
      if (!field || !actx || !master) return;
      const snapped = snapToPentatonic(freq);
      // pitch normalized across our musical range (~65..1050 Hz)
      const pitchNorm = Math.min(
        1,
        Math.max(0, (Math.log2(snapped) - Math.log2(65.41)) / 4),
      );
      const now = actx.currentTime;
      const site = field.growSite(pitchNorm, level, snapped, now);
      if (site) {
        writeSiteToGeom(field.count - 1, site);
        const geom = geomRef.current;
        if (geom) geom.setDrawRange(0, field.count);
        playBell(actx, master.input, snapped, level);
      }
    },
    [writeSiteToGeom],
  );

  // Build three.js scene.
  const initThree = useCallback((mount: HTMLDivElement, field: GardenField) => {
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglOk(false);
      return null;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const aspect = mount.clientWidth / mount.clientHeight;
    const cam = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    cam.position.z = 2;

    const max = field.maxSites;
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geom.setAttribute("aColor", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geom.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(max), 1));
    geom.setAttribute("aPhase", new THREE.BufferAttribute(new Float32Array(max), 1));
    geom.setAttribute("aPulse", new THREE.BufferAttribute(new Float32Array(max), 1));
    geom.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uBreath: { value: 1 },
      },
    });

    const points = new THREE.Points(geom, mat);
    scene.add(points);

    rendererRef.current = renderer;
    geomRef.current = geom;
    matRef.current = mat;

    const onResize = () => {
      if (!mount) return;
      const a = mount.clientWidth / mount.clientHeight;
      cam.left = -a;
      cam.right = a;
      cam.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return { renderer, scene, cam, onResize };
  }, []);

  const start = useCallback(async () => {
    if (started) return;
    setStarted(true);

    // AudioContext inside the user gesture (iOS requirement).
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const actx = new Ctor();
    await actx.resume();
    actxRef.current = actx;

    const master = buildMasterChain(actx);
    masterRef.current = master;
    stopPadRef.current = startAmbientPad(actx, master.input);

    const field = new GardenField(4000);
    fieldRef.current = field;

    const mount = mountRef.current;
    let three: ReturnType<typeof initThree> = null;
    if (mount) three = initThree(mount, field);

    // Try mic.
    const analyser = actx.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      const src = actx.createMediaStreamSource(stream);
      // mic -> analyser ONLY (never to destination)
      src.connect(analyser);
      setMicState("live");
      fallbackRef.current = false;
    } catch {
      setMicState("denied");
      fallbackRef.current = true;
    }

    // Animation + analysis loop.
    const timeBuf = new Float32Array(analyser.fftSize);
    let lastT = performance.now();
    let noteCooldown = 0;
    let quietTimer = 0;
    let arpTimer = 0;
    let heldFreq = -1;
    let breath = 1;

    // ghost-hum fallback state (auto-singer when no mic)
    let ghostTimer = 0;
    let ghostIdx = 0;
    const ghostScale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const tNow = performance.now();
      const dt = Math.min(0.05, (tNow - lastT) / 1000);
      lastT = tNow;
      const nowSec = actx.currentTime;

      let level = 0;
      let detected = -1;

      if (!fallbackRef.current && analyserRef.current) {
        analyserRef.current.getFloatTimeDomainData(timeBuf);
        const res = runAutocorrelation(timeBuf, actx.sampleRate);
        level = Math.min(1, res.rms * 6);
        detected = res.freq;
      }

      const quiet = detected < 0;

      // Live note seeding with a small cooldown for distinct blooms.
      noteCooldown -= dt;
      if (detected > 0) {
        quietTimer = 0;
        heldFreq = detected;
        if (noteCooldown <= 0) {
          seedNote(detected, level);
          noteCooldown = 0.18;
        } else {
          // held note: accelerate growth of the current bloom
          field.feedHeld(level, dt);
        }
      } else {
        quietTimer += dt;
        heldFreq = -1;
      }

      // Ghost-hum fallback auto-singer so the garden grows without a mic.
      if (fallbackRef.current) {
        ghostTimer += dt;
        if (ghostTimer > 0.7) {
          ghostTimer = 0;
          const f = ghostScale[ghostIdx % ghostScale.length];
          ghostIdx++;
          seedNote(f, 0.45 + Math.random() * 0.3);
          quietTimer = 0;
        }
      }

      // Autonomous self-organizing growth + pulse decay.
      const spawned = field.step(dt, nowSec, quiet && !fallbackRef.current);
      if (spawned) {
        writeSiteToGeom(field.count - 1, spawned);
        const geom = geomRef.current;
        if (geom) geom.setDrawRange(0, field.count);
      }

      // Generative bell arpeggio from already-grown sites during long silence
      // (the garden sings itself back, softly).
      if (quiet && !fallbackRef.current && quietTimer > 2.5 && field.count > 4) {
        arpTimer += dt;
        if (arpTimer > 0.55) {
          arpTimer = 0;
          const s = field.sites[Math.floor(Math.random() * field.count)];
          if (masterRef.current) {
            playBell(actx, masterRef.current.input, s.freq, 0.12);
            s.pulse = Math.min(1, s.pulse + 0.6);
          }
        }
      }

      // Refresh the live pulse attribute (decays every frame on CPU side).
      const geom = geomRef.current;
      if (geom) {
        const pulseAttr = geom.getAttribute("aPulse") as THREE.BufferAttribute;
        const sizeAttr = geom.getAttribute("aSize") as THREE.BufferAttribute;
        const n = field.count;
        for (let i = 0; i < n; i++) {
          pulseAttr.setX(i, field.sites[i].pulse);
          sizeAttr.setX(i, 6 + field.sites[i].vigor * 18);
        }
        pulseAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
        (geom.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      }

      // Breathing: whole field gently inflates/deflates; held note swells it.
      const targetBreath = heldFreq > 0 ? 1.05 : 1.0;
      breath += (targetBreath - breath) * Math.min(1, dt * 2);
      const wobble = 1 + Math.sin(tNow / 1000 * 0.5) * 0.015;

      if (matRef.current) {
        matRef.current.uniforms.uTime.value = tNow / 1000;
        matRef.current.uniforms.uBreath.value = breath * wobble;
      }

      if (three) three.renderer.render(three.scene, three.cam);
      setSiteCount(field.count);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [started, initThree, seedNote, writeSiteToGeom]);

  // Tap-to-seed fallback (works without mic). Maps tap Y to pitch.
  const onCanvasTap = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!started || micState === "live") return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ny = 1 - (e.clientY - rect.top) / rect.height; // 0 bottom .. 1 top
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
      const idx = Math.min(scale.length - 1, Math.floor(ny * scale.length));
      seedNote(scale[idx], 0.6);
    },
    [started, micState, seedNote],
  );

  // Full teardown on unmount.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (stopPadRef.current) stopPadRef.current();
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        const el = rendererRef.current.domElement;
        el.parentNode?.removeChild(el);
      }
      if (geomRef.current) geomRef.current.dispose();
      if (matRef.current) matRef.current.dispose();
      const actx = actxRef.current;
      if (actx && actx.state !== "closed") {
        actx.close().catch(() => {});
      }
    };
  }, []);

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-sky-200 via-amber-50 to-emerald-100">
      {/* Garden canvas (warm daylight) */}
      <div
        ref={mountRef}
        onPointerDown={onCanvasTap}
        className="absolute inset-0 h-full w-full"
      />

      {/* Top chrome (dark, monospace accents) */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 flex w-full items-start justify-between p-4">
        <div className="pointer-events-auto rounded-xl bg-black/55 px-4 py-2 backdrop-blur">
          <h1 className="font-mono text-xl text-white sm:text-2xl">
            🌻 Sing the Garden
          </h1>
          <p className="mt-1 text-base text-white/80">
            Your voice grows a living spiral.
          </p>
        </div>
        <div className="pointer-events-auto rounded-xl bg-black/55 px-3 py-2 text-right backdrop-blur">
          <div className="font-mono text-base text-white/95">{siteCount} blooms</div>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="mt-1 font-mono text-base text-white/75 underline"
          >
            Design notes
          </button>
        </div>
      </div>

      {/* Mic-denied notice + fallback hint (must be visible, rose) */}
      {micState === "denied" && (
        <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-black/60 px-4 py-3 text-center backdrop-blur">
          <p className="text-base font-semibold text-rose-300">
            No microphone — the garden is auto-singing for you.
          </p>
          <p className="mt-1 text-base text-white/80">
            Tap anywhere on the garden to grow flowers (higher tap = higher note).
          </p>
        </div>
      )}

      {micState === "live" && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-black/50 px-4 py-2 backdrop-blur">
          <p className="text-base text-white/85">🎤 Hum or sing — watch it bloom!</p>
        </div>
      )}

      {!webglOk && (
        <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2 rounded-xl bg-black/60 px-4 py-3 text-center backdrop-blur">
          <p className="text-base font-semibold text-rose-300">
            WebGL is unavailable on this device — visuals can&apos;t render, but
            the music still plays.
          </p>
        </div>
      )}

      {/* Start gate */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-gradient-to-b from-sky-300/90 to-emerald-200/90 backdrop-blur-sm">
          <h2 className="px-6 text-center font-mono text-2xl font-bold text-emerald-950 sm:text-4xl">
            Sing and grow a flower garden
          </h2>
          <button
            onClick={start}
            className="min-h-[64px] rounded-3xl bg-emerald-600 px-10 py-5 text-2xl font-bold text-white shadow-xl transition active:scale-95"
          >
            🌱 Start singing
          </button>
          <p className="max-w-md px-6 text-center text-base text-emerald-950/80">
            Hum, sing, or say &quot;laaa&quot; — every sound plants a glowing
            flower. The spiral arranges itself, just like a real sunflower.
          </p>
        </div>
      )}

      {/* Design notes overlay */}
      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur">
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl bg-zinc-900 p-6 text-white/90">
            <h3 className="font-mono text-xl text-white">Design notes</h3>
            <p className="mt-3 text-base text-white/85">
              The garden is a three.js GPU point-field. Each sung note deposits a
              growth site in the <em>largest angular gap</em> on an expanding
              front, with a local inhibition rule — so the golden-angle spiral
              (~137.5°) <em>emerges</em> rather than being drawn. It keeps
              self-organizing and softly sings itself back when you go quiet.
            </p>
            <p className="mt-3 text-base text-white/75">
              Pitch → hue (low = warm gold, high = cool violet), snapped to a
              C-major pentatonic so there are no wrong notes. Loudness → bloom
              brightness and how fast the field grows.
            </p>
            <p className="mt-3 font-mono text-base text-white/70">
              Refs: arXiv 2509.06498 (phyllotaxis, Keller-Segel) · Vogel 1979 ·
              Mort Garson, Plantasia · Chris Wilson ACF pitch.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[48px] rounded-xl bg-emerald-600 px-6 py-2 text-base font-semibold text-white"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
