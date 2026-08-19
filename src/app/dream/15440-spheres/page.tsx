"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15440 · spheres — a music of the spheres conducted by the real, current sky.
//
//   "What if the real, current sky conducted Karel's own piano — the true
//    positions of the planets right now layering his recordings into an
//    ever-different music of the spheres?"
//
//   You float in a slow cosmic drift around a glowing sun. The six classical
//   planets orbit at their TRUE heliocentric ecliptic longitudes, computed from
//   the clock (JPL / Standish low-precision formulae, no network). Each planet is
//   a voice made of one of Karel's real recordings. When two planets form a real
//   aspect — conjunction 0°, sextile 60°, square 90°, trine 120°, opposition 180°,
//   within a ±6° orb — a luminous harmony line brightens between them AND their
//   two piano voices swell together. Consonant aspects (0/60/120) swell in tune;
//   tense aspects (90/180) swell with a subtle detune. The harmony you hear IS
//   the geometry of the heavens.
//
//   A secondary "time flow" slider advances a simulated clock so the sky drifts
//   and aspects form within seconds; "now" snaps back to the real moment.
//
//   AUDIO: Karel's catalog ONLY — zero synthesis. Every voice is a looping real
//   recording through the shared ear-safety master. REFS: Kepler, Harmonices
//   Mundi (1619); Holst, The Planets; JPL / Standish low-precision formulae.
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  computePlanets,
  computeAspects,
  type Aspect,
} from "./ephemeris";

// ── voice assignment: Sun bed + one recording per classical planet ───────────
// All IDs verified in _shared/welcomeHome (Welcome Home + Snowflake only).
const SUN_TRACK = "8dafed88-4761-4dd3-a0f4-93f310441093"; // "Welcome Home"
const PLANET_TRACKS: { name: string; id: string; color: number }[] = [
  { name: "Mercury", id: "d57cfae6-f234-4d24-85fe-72a8ad93a44a", color: 0xcfc3a6 }, // Interplay — pale grey-gold
  { name: "Venus", id: "eba95845-cdbf-41d8-9c5d-8679686811ad", color: 0xf3c96b }, // Bath — warm gold
  { name: "Earth", id: "1f0a541e-df60-44a9-b839-5dc69a007d9f", color: 0x5cb59a }, // 2019 — blue-green
  { name: "Mars", id: "aaaa7e9a-a3ac-4cad-9390-6720555f00a7", color: 0xd6552f }, // The Knife — red
  { name: "Jupiter", id: "d2eeee58-832b-4872-a4be-8fbf030b981d", color: 0xe0a85a }, // Rolling — amber
  { name: "Saturn", id: "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", color: 0xc98a3c }, // Isolation — ochre
];

const DEG = Math.PI / 180;
const N = PLANET_TRACKS.length;
const MAX_LINES = (N * (N - 1)) / 2; // 15 unordered pairs

// Screen radius from true heliocentric distance — compresses Saturn on-screen
// while keeping the TRUE ecliptic angle.
function screenRadius(r: number): number {
  return 3 + 9 * Math.log2(1 + r);
}

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  baseRate: number;
  title: string;
}

interface AudioEngine {
  ctx: AudioContext;
  master: SafeMaster;
  voices: Voice[]; // one per PLANET_TRACKS entry (some may be missing on load fail)
  present: boolean[]; // whether voice[i] loaded
  sunGain: GainNode | null;
  sunSource: AudioBufferSourceNode | null;
  freq: Uint8Array<ArrayBuffer>;
}

type Phase = "idle" | "loading" | "running" | "error";

export default function SpheresPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState(0);
  const [webglFailed, setWebglFailed] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [flow, setFlow] = useState(200000); // ~a few days per real second
  const [simLabel, setSimLabel] = useState("");

  const audioRef = useRef<AudioEngine | null>(null);
  const flowRef = useRef(flow);
  const simTimeRef = useRef<number>(Date.now());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    flowRef.current = flow;
  }, [flow]);

  // ── audio teardown (also runs on unmount) ──────────────────────────────────
  const teardownAudio = useCallback(() => {
    const eng = audioRef.current;
    audioRef.current = null;
    if (!eng) return;
    try {
      eng.sunSource?.stop();
    } catch {
      /* already stopped */
    }
    for (const v of eng.voices) {
      try {
        v.source.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.source.disconnect();
        v.gain.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      eng.sunSource?.disconnect();
      eng.sunGain?.disconnect();
    } catch {
      /* noop */
    }
    eng.master.disconnect();
    void eng.ctx.close().catch(() => {});
  }, []);

  useEffect(() => teardownAudio, [teardownAudio]);

  // ── enter: gesture-gated audio boot ─────────────────────────────────────────
  const enter = useCallback(async () => {
    if (phase === "loading" || phase === "running") return;
    setPhase("loading");
    setErrorMsg(null);
    setLoadedCount(0);

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
      /* resume may already be running */
    }
    const master = createSafeMaster(ctx);
    master.setGain(0.85);

    // Load every buffer up front; degrade past any that fail.
    const wanted = [SUN_TRACK, ...PLANET_TRACKS.map((p) => p.id)];
    const results = await Promise.allSettled(
      wanted.map((id) => loadRealTrackBuffer(ctx, id)),
    );

    const sunRes = results[0];
    const planetRes = results.slice(1);

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

    const now = ctx.currentTime + 0.06; // start everyone together

    // Sun bed — steady low gain.
    let sunGain: GainNode | null = null;
    let sunSource: AudioBufferSourceNode | null = null;
    if (sunRes.status === "fulfilled") {
      sunGain = ctx.createGain();
      sunGain.gain.value = 0.0001;
      sunSource = ctx.createBufferSource();
      sunSource.buffer = sunRes.value.buffer;
      sunSource.loop = true;
      sunSource.connect(sunGain);
      sunGain.connect(master.input);
      sunSource.start(now);
      sunGain.gain.setTargetAtTime(0.18, now, 1.2);
    }

    // Planet voices.
    const voices: Voice[] = [];
    const present: boolean[] = [];
    planetRes.forEach((res, i) => {
      if (res.status !== "fulfilled") {
        present.push(false);
        // placeholder voice keeps indices aligned; muted, never started.
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const source = ctx.createBufferSource();
        voices.push({ source, gain, baseRate: 1, title: PLANET_TRACKS[i].name });
        return;
      }
      present.push(true);
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const source = ctx.createBufferSource();
      source.buffer = res.value.buffer;
      source.loop = true;
      // Faint orbital-resonance flavour: inner planets a hair brighter.
      const baseRate = 1 + (N / 2 - i) * 0.006; // ~0.99 .. 1.02
      source.playbackRate.value = baseRate;
      source.connect(gain);
      gain.connect(master.input);
      source.start(now);
      gain.gain.setTargetAtTime(0.06, now, 1.2);
      voices.push({ source, gain, baseRate, title: res.value.title });
    });

    setLoadedCount(results.filter((r) => r.status === "fulfilled").length);

    audioRef.current = {
      ctx,
      master,
      voices,
      present,
      sunGain,
      sunSource,
      freq: new Uint8Array(new ArrayBuffer(master.analyser.frequencyBinCount)),
    };
    simTimeRef.current = Date.now();
    setPhase("running");
  }, [phase]);

  // ── three.js scene + animation (built once audio is running) ────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Renderer — degrade gracefully if WebGL is unavailable.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
      });
    } catch {
      setWebglFailed(true);
      return; // audio keeps playing; visuals show an on-brand notice
    }

    const getSize = () => ({
      w: canvas.clientWidth || window.innerWidth,
      h: canvas.clientHeight || window.innerHeight,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    let { w, h } = getSize();
    renderer.setSize(w, h, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07050c);
    scene.fog = new THREE.FogExp2(0x0a0713, 0.0065);

    const camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 600);

    // ── warm-violet radial backdrop plane far behind everything ───────────────
    const bgTex = makeRadialTexture([
      [0, "rgba(46,26,64,0.9)"],
      [0.4, "rgba(24,14,36,0.7)"],
      [1, "rgba(6,4,11,0)"],
    ]);
    const bgSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: bgTex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    bgSprite.scale.set(320, 320, 1);
    bgSprite.position.set(0, 0, 0);
    bgSprite.renderOrder = -10;
    scene.add(bgSprite);

    // ── star field ────────────────────────────────────────────────────────────
    const STAR_COUNT = 1400;
    const starPos = new Float32Array(STAR_COUNT * 3);
    const starCol = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      // spherical shell
      const rr = 140 + Math.random() * 180;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = rr * Math.sin(ph) * Math.cos(th);
      starPos[i * 3 + 1] = rr * Math.cos(ph) * 0.6;
      starPos[i * 3 + 2] = rr * Math.sin(ph) * Math.sin(th);
      const warm = 0.7 + Math.random() * 0.3;
      starCol[i * 3] = warm;
      starCol[i * 3 + 1] = warm * (0.82 + Math.random() * 0.16);
      starCol[i * 3 + 2] = warm * (0.68 + Math.random() * 0.22);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({
      size: 1.1,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── lighting ──────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x30243a, 1.0));
    const sunLight = new THREE.PointLight(0xffddaa, 2.4, 0, 1.2);
    sunLight.position.set(0, 0, 0);
    scene.add(sunLight);

    // ── sun ───────────────────────────────────────────────────────────────────
    const sunGeo = new THREE.SphereGeometry(2.4, 48, 48);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe4a3 });
    const sun = new THREE.Mesh(sunGeo, sunMat);
    scene.add(sun);

    const sunGlowTex = makeRadialTexture([
      [0, "rgba(255,236,190,0.95)"],
      [0.25, "rgba(255,196,110,0.55)"],
      [0.6, "rgba(255,150,70,0.18)"],
      [1, "rgba(255,120,40,0)"],
    ]);
    const sunGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunGlowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sunGlow.scale.set(20, 20, 1);
    scene.add(sunGlow);

    // ── orbit rings + planets ──────────────────────────────────────────────────
    const snapshot0 = computePlanets(simTimeRef.current);
    const orbitMat = new THREE.LineBasicMaterial({
      color: 0x6b4a7a,
      transparent: true,
      opacity: 0.22,
    });
    const planetMeshes: THREE.Mesh[] = [];
    const planetMats: THREE.MeshStandardMaterial[] = [];
    const planetGeos: THREE.BufferGeometry[] = [];
    const ringGeos: THREE.BufferGeometry[] = [];

    PLANET_TRACKS.forEach((p, i) => {
      const sr = screenRadius(snapshot0[i].r);
      // orbit ring
      const seg = 128;
      const ringPos = new Float32Array((seg + 1) * 3);
      for (let s = 0; s <= seg; s++) {
        const a = (s / seg) * Math.PI * 2;
        ringPos[s * 3] = sr * Math.cos(a);
        ringPos[s * 3 + 1] = 0;
        ringPos[s * 3 + 2] = sr * Math.sin(a);
      }
      const ringGeo = new THREE.BufferGeometry();
      ringGeo.setAttribute("position", new THREE.BufferAttribute(ringPos, 3));
      ringGeos.push(ringGeo);
      scene.add(new THREE.LineLoop(ringGeo, orbitMat));

      // planet
      const size = 0.55 + 0.12 * Math.log2(1 + snapshot0[i].r);
      const geo = new THREE.SphereGeometry(size, 28, 28);
      const col = new THREE.Color(p.color);
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        emissive: col,
        emissiveIntensity: 0.25,
        roughness: 0.75,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      planetMeshes.push(mesh);
      planetMats.push(mat);
      planetGeos.push(geo);
    });

    // ── aspect harmony line pool ────────────────────────────────────────────────
    const lineObjs: THREE.Line[] = [];
    const lineMats: THREE.LineBasicMaterial[] = [];
    const lineGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < MAX_LINES; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      lineObjs.push(line);
      lineMats.push(m);
      lineGeos.push(g);
    }

    // ── camera drift + optional pointer look ────────────────────────────────────
    let autoAz = 0;
    let userAz = 0;
    let userEl = 0;
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
      userAz += (e.clientX - lastX) * 0.005;
      userEl = Math.max(-0.9, Math.min(0.9, userEl + (e.clientY - lastY) * 0.004));
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    const onResize = () => {
      const s = getSize();
      w = s.w;
      h = s.h;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── animation loop ──────────────────────────────────────────────────────────
    const driftSpeed = prefersReduced ? 0.012 : 0.045; // rad/s
    let raf = 0;
    let last = performance.now();
    let labelAccum = 0;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dtMs = Math.min(64, t - last);
      last = t;
      const dt = dtMs / 1000;

      // advance the simulated sky clock
      simTimeRef.current += flowRef.current * dtMs;
      const planets = computePlanets(simTimeRef.current);
      const aspects: Aspect[] = computeAspects(planets);

      const eng = audioRef.current;

      // per-planet target gain from aspect involvement
      const gainTarget = new Array(N).fill(0.06);
      const tenseFlag = new Array(N).fill(0);
      for (const asp of aspects) {
        const add = asp.tightness * 0.5;
        gainTarget[asp.a] += add;
        gainTarget[asp.b] += add;
        if (!asp.consonant) {
          tenseFlag[asp.a] = Math.max(tenseFlag[asp.a], asp.tightness);
          tenseFlag[asp.b] = Math.max(tenseFlag[asp.b], asp.tightness);
        }
      }

      // move planets on screen (true angle, compressed radius) + drive audio
      for (let i = 0; i < N; i++) {
        const sr = screenRadius(planets[i].r);
        const lr = planets[i].lambdaDeg * DEG;
        planetMeshes[i].position.set(sr * Math.cos(lr), 0, sr * Math.sin(lr));

        const g = Math.min(0.9, gainTarget[i]);
        // emissive brightness rises with total voice gain → you SEE who sings
        planetMats[i].emissiveIntensity = 0.2 + (g - 0.06) * 1.9;

        if (eng && eng.present[i]) {
          const v = eng.voices[i];
          v.gain.gain.setTargetAtTime(g, eng.ctx.currentTime, 0.4);
          // subtle detune on tense aspects, in tune otherwise
          const detune = tenseFlag[i] > 0 ? tenseFlag[i] * 0.03 : 0;
          const rate = Math.max(
            0.8,
            Math.min(1.25, v.baseRate + (i % 2 === 0 ? detune : -detune)),
          );
          v.source.playbackRate.setTargetAtTime(rate, eng.ctx.currentTime, 0.4);
        }
      }

      // aspect harmony lines
      for (let li = 0; li < MAX_LINES; li++) {
        if (li < aspects.length) {
          const asp = aspects[li];
          const pa = planetMeshes[asp.a].position;
          const pb = planetMeshes[asp.b].position;
          const arr = (lineGeos[li].getAttribute("position") as THREE.BufferAttribute)
            .array as Float32Array;
          arr[0] = pa.x;
          arr[1] = pa.y;
          arr[2] = pa.z;
          arr[3] = pb.x;
          arr[4] = pb.y;
          arr[5] = pb.z;
          lineGeos[li].getAttribute("position").needsUpdate = true;
          lineMats[li].color.set(asp.consonant ? 0xffd28a : 0xd08fb0);
          lineMats[li].opacity = asp.tightness * (asp.consonant ? 0.9 : 0.5);
          lineObjs[li].visible = true;
        } else if (lineObjs[li].visible) {
          lineObjs[li].visible = false;
        }
      }

      // sun pulse from low-band audio energy
      let lowEnergy = 0;
      if (eng) {
        eng.master.analyser.getByteFrequencyData(eng.freq);
        const bands = Math.max(1, Math.floor(eng.freq.length * 0.12));
        let sum = 0;
        for (let b = 0; b < bands; b++) sum += eng.freq[b];
        lowEnergy = sum / (bands * 255);
      }
      const pulse = 1 + lowEnergy * 0.35;
      sun.scale.setScalar(pulse);
      sunGlow.scale.setScalar(20 + lowEnergy * 10);
      sunLight.intensity = 2.2 + lowEnergy * 1.4;

      // gentle rotation of the star field for parallax life
      stars.rotation.y += dt * 0.006;

      // camera drift (self-propelling), plus optional pointer look
      autoAz += dt * driftSpeed;
      const az = autoAz + userAz;
      const el = 0.32 + userEl + Math.sin(autoAz * 0.6) * 0.08;
      const camR = 66;
      camera.position.set(
        Math.cos(az) * camR * Math.cos(el),
        Math.sin(el) * camR,
        Math.sin(az) * camR * Math.cos(el),
      );
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);

      // throttle the sim-date readout
      labelAccum += dtMs;
      if (labelAccum > 400) {
        labelAccum = 0;
        setSimLabel(
          new Date(simTimeRef.current).toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
      }
    };
    raf = requestAnimationFrame(frame);

    // ── teardown ────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      starGeo.dispose();
      starMat.dispose();
      sunGeo.dispose();
      sunMat.dispose();
      sunGlowTex.dispose();
      (sunGlow.material as THREE.SpriteMaterial).dispose();
      bgTex.dispose();
      (bgSprite.material as THREE.SpriteMaterial).dispose();
      orbitMat.dispose();
      for (const g of planetGeos) g.dispose();
      for (const m of planetMats) m.dispose();
      for (const g of ringGeos) g.dispose();
      for (const g of lineGeos) g.dispose();
      for (const m of lineMats) m.dispose();
      renderer.dispose();
    };
  }, [phase]);

  const resetNow = useCallback(() => {
    simTimeRef.current = Date.now();
  }, []);

  // ── flow slider is logarithmic: ×1 (frozen) … ×5,000,000 (years/second) ──────
  const FLOW_MIN = 1;
  const FLOW_MAX = 5_000_000;
  const sliderPos = Math.log10(flow) / Math.log10(FLOW_MAX); // 0..1
  const onSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pos = Number(e.target.value) / 1000; // 0..1
    const val = Math.round(Math.pow(FLOW_MAX, pos));
    setFlow(Math.max(FLOW_MIN, val));
  };

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* three.js canvas */}
      {phase === "running" && !webglFailed && (
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
      )}

      {/* Idle / loading / error curtain */}
      {phase !== "running" && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-xl text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-primary">
              music of the spheres
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              spheres
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              The real, current sky conducts Karel&apos;s own piano — the true
              positions of the planets right now layer his recordings into an
              ever-different music of the spheres.
            </p>

            {phase === "error" && (
              <p className="mt-6 text-sm text-destructive">{errorMsg}</p>
            )}

            <button
              onClick={enter}
              disabled={phase === "loading"}
              className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Loading the sky…" : "Enter the spheres"}
            </button>

            <p className="mt-6 font-mono text-[11px] leading-relaxed text-muted-foreground/70">
              headphones recommended · six planets, six of Karel&apos;s recordings
              · harmony is the geometry of the heavens
            </p>
          </div>
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <>
          {webglFailed && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="max-w-md text-center">
                <p className="text-base text-muted-foreground">
                  Your device could not open a 3D view, so the orrery is hidden —
                  but the spheres are still singing. Karel&apos;s recordings swell
                  and settle as the planets drift through their real aspects.
                </p>
              </div>
            </div>
          )}

          {/* top-left readout */}
          <div className="pointer-events-none absolute left-4 top-4 select-none font-mono text-[11px] leading-relaxed text-muted-foreground">
            <div className="text-foreground">sky · {simLabel}</div>
            <div>
              flow ×{flow >= 1000 ? `${Math.round(flow / 1000)}k` : flow}
            </div>
            <div className="text-muted-foreground/60">
              {loadedCount}/{PLANET_TRACKS.length + 1} voices loaded
            </div>
          </div>

          {/* time-flow controls */}
          <div className="absolute bottom-16 left-1/2 w-[min(92vw,440px)] -translate-x-1/2 rounded-md border border-border bg-background/70 p-3 backdrop-blur-md">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span>time flow</span>
              <button
                onClick={resetNow}
                className="min-h-[28px] rounded-md border border-border px-3 text-[10px] tracking-[0.14em] text-foreground transition-colors hover:bg-accent"
              >
                now
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(sliderPos * 1000)}
              onChange={onSlider}
              aria-label="Time flow: how fast the simulated sky advances"
              className="h-2 w-full cursor-pointer appearance-none rounded-md bg-primary/20 accent-primary"
            />
            <div className="mt-1 flex justify-between font-mono text-[9px] text-muted-foreground/60">
              <span>real-time</span>
              <span>days/s</span>
              <span>years/s</span>
            </div>
          </div>

          {/* design-notes affordance */}
          <button
            onClick={() => setNotesOpen(true)}
            className="absolute right-4 top-4 min-h-[36px] rounded-md border border-border bg-background/60 px-3 text-xs text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground"
          >
            Read the design notes
          </button>
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
              <h2 className="text-lg font-semibold tracking-tight">
                spheres — design notes
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
                One question: <em>what if the real, current sky conducted
                Karel&apos;s own piano</em> — the true positions of the planets
                right now layering his recordings into an ever-different music of
                the spheres?
              </p>
              <p>
                Six planets orbit the sun at their true heliocentric ecliptic
                longitudes, computed from the clock with the JPL / Standish
                low-precision formulae (no network). Each planet is a voice made
                of one of Karel&apos;s recordings, always faintly present.
              </p>
              <p>
                When two planets fall within a ±6° orb of a real aspect —
                conjunction 0°, sextile 60°, square 90°, trine 120°, opposition
                180° — a luminous line brightens between them and their two piano
                voices swell together. Consonant aspects (0/60/120) swell in tune;
                tense aspects (90/180) swell with a subtle detune. The harmony you
                hear is literally the geometry of the heavens.
              </p>
              <p>
                The time-flow slider advances a simulated clock so the sky drifts
                and aspects form within seconds; &quot;now&quot; snaps back to the
                real moment. Drag to look around — but it runs entirely hands-off.
              </p>
              <p className="text-muted-foreground/70">
                After Kepler, <em>Harmonices Mundi</em> (1619); Holst,{" "}
                <em>The Planets</em>; the JPL / Standish low-precision planetary
                formulae. Audio is Karel&apos;s catalog only — no synthesis.
              </p>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15440-spheres"]} />
    </main>
  );
}

// ── a soft radial gradient as a canvas texture (for glows / backdrop) ─────────
function makeRadialTexture(
  stops: [number, string][],
): THREE.CanvasTexture {
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
