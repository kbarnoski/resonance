"use client";

/**
 * Ember Keeper — a glowing creature that lives in the device, remembers every
 * visit, and grows a genuinely BIGGER, DIFFERENT body each new day. It never
 * resets to zero. Cross-day persistence (localStorage) + day-aware procedural
 * morphology (seeded PRNG regrows the whole body from a saved genome).
 *
 * INPUT: microphone (hum/sing) feeds + grows it; tap-to-pet as secondary.
 * OUTPUT: three.js (WebGL).
 * VIBE: companion / relationship / growth.
 *
 * References (see README): Tamagotchi (Maita/Bandai 1996), Steve Grand's
 * Creatures (1996), D'Arcy Thompson, On Growth and Form (1917).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { bootAudio, type AudioEngine } from "./audio";
import {
  advanceOneDay,
  feedHum,
  freqToDegree,
  type Genome,
  type GrowthToken,
  loadAndVisit,
  makeRng,
  petGrow,
} from "./genome";
import { detectPitch } from "./pitch";

/* ── Morphology: regrow the whole body from the genome (D'Arcy Thompson) ─────── */

type LimbVisual = {
  mesh: THREE.Mesh;
  baseScale: number;
  basePos: THREE.Vector3;
  spin: number;
  kind: GrowthToken["kind"];
};

/** Warm pentatonic-degree → saturated colour (bold for little eyes). */
function degreeToColor(degree: number): THREE.Color {
  const hues = [0.06, 0.09, 0.12, 0.0, 0.83, 0.55, 0.33, 0.5, 0.78, 0.95, 0.15];
  const h = hues[Math.max(0, Math.min(hues.length - 1, degree))];
  const c = new THREE.Color();
  c.setHSL(h, 0.9, 0.58);
  return c;
}

/**
 * Build the creature body deterministically from the genome's growth tokens.
 * Every "day" token is a big limb sphere on a spiralling phyllotaxis arm; every
 * "hum" token is a small frond. The same genome always regrows the same body.
 */
function makeBody(genome: Genome): { group: THREE.Group; core: THREE.Mesh; limbs: LimbVisual[] } {
  const group = new THREE.Group();
  const limbs: LimbVisual[] = [];

  // Core ember body — grows with total history so it visibly fattens over days.
  const coreR = 0.6 + Math.min(genome.tokens.length, 30) * 0.02;
  const coreGeo = new THREE.IcosahedronGeometry(coreR, 3);
  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.07, 0.95, 0.55),
    emissive: new THREE.Color().setHSL(0.08, 0.95, 0.35),
    emissiveIntensity: 1.4,
    roughness: 0.35,
    metalness: 0.0,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  // Golden-angle phyllotaxis placement — limbs spiral around the core (growth & form).
  const golden = Math.PI * (3 - Math.sqrt(5));
  let dayIndex = 0;
  let humIndex = 0;

  genome.tokens.forEach((tok, i) => {
    const rng = makeRng(tok.id * 2654435761 + tok.degree + 7);
    const color = degreeToColor(tok.degree);

    if (tok.kind === "day") {
      // A big limb: a glowing node on the end of an arm spiralling outward/up.
      const angle = dayIndex * golden;
      const radius = coreR + 0.5 + dayIndex * 0.16;
      const y = -0.2 + dayIndex * 0.22 + rng() * 0.3;
      const limbR = 0.28 + rng() * 0.22;
      const geo = new THREE.IcosahedronGeometry(limbR, 2);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.5),
        emissiveIntensity: 1.1,
        roughness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        y,
        Math.sin(angle) * radius,
      );
      mesh.position.copy(pos);
      group.add(mesh);
      limbs.push({
        mesh,
        baseScale: 1,
        basePos: pos.clone(),
        spin: (rng() - 0.5) * 0.6,
        kind: "day",
      });
      dayIndex++;
    } else {
      // A small frond: a thin glowing spike clustered near the core surface.
      const angle = humIndex * golden + 1.3;
      const radius = coreR + 0.15 + rng() * 0.35;
      const frondR = 0.07 + rng() * 0.06;
      const geo = new THREE.ConeGeometry(frondR, 0.35 + rng() * 0.3, 6);
      const mat = new THREE.MeshStandardMaterial({
        color,
        emissive: color.clone().multiplyScalar(0.6),
        emissiveIntensity: 1.0,
        roughness: 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        (rng() - 0.5) * 1.4,
        Math.sin(angle) * radius,
      );
      mesh.position.copy(pos);
      mesh.lookAt(pos.clone().multiplyScalar(2));
      group.add(mesh);
      limbs.push({
        mesh,
        baseScale: 1,
        basePos: pos.clone(),
        spin: (rng() - 0.5) * 1.2,
        kind: "hum",
      });
      humIndex++;
    }
    void i;
  });

  return { group, core, limbs };
}

/* ── The page ────────────────────────────────────────────────────────────────── */

type Phase = "idle" | "awake";

export default function EmberKeeperPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [genome, setGenome] = useState<Genome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [webglOk, setWebglOk] = useState(true);
  const [humLevel, setHumLevel] = useState(0); // 0..1 for the DOM fallback glow

  // Mutable refs for the render/audio loop (avoid re-running effects).
  const engineRef = useRef<AudioEngine | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    root: THREE.Group;
    core: THREE.Mesh;
    limbs: LimbVisual[];
    raf: number;
  } | null>(null);
  const genomeRef = useRef<Genome | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sparkleRef = useRef<{ id: number; until: number } | null>(null);
  const humAccumRef = useRef<{ seconds: number; lastDegree: number; lastFedAt: number }>({
    seconds: 0,
    lastDegree: -1,
    lastFedAt: 0,
  });

  /* Load the genome immediately on mount (regrows the saved creature). */
  useEffect(() => {
    const today = new Date().toDateString();
    const res = loadAndVisit(today);
    genomeRef.current = res.genome;
    setGenome(res.genome);
    if (res.seededDemo) {
      setNotice("Meet your keeper — it has been growing while you were away.");
    } else if (res.grewToday) {
      setNotice("It grew a new part overnight!");
    }
  }, []);

  /* Rebuild the three.js body whenever the genome changes (and after mount). */
  const rebuildBody = useCallback((g: Genome, sparkleTokenId?: number) => {
    const s = sceneRef.current;
    if (!s) return;
    // Remove old body.
    s.scene.remove(s.root);
    s.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    const built = makeBody(g);
    s.scene.add(built.group);
    s.root = built.group;
    s.core = built.core;
    s.limbs = built.limbs;
    if (sparkleTokenId !== undefined) {
      sparkleRef.current = { id: sparkleTokenId, until: performance.now() + 2600 };
    }
  }, []);

  /* Set up three.js once the scene container exists (after Start). */
  useEffect(() => {
    if (phase !== "awake") return;
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setWebglOk(false);
      setNotice("This screen can't draw the keeper, but it's still here — tap to play.");
      return;
    }
    if (!renderer.getContext()) {
      setWebglOk(false);
      return;
    }

    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || 480;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(0, 0.6, 6.5);
    camera.lookAt(0, 0.4, 0);

    scene.add(new THREE.AmbientLight(0x332211, 1.2));
    const key = new THREE.PointLight(0xffcaa0, 2.2, 50);
    key.position.set(3, 4, 5);
    scene.add(key);
    const warm = new THREE.PointLight(0xff7a3c, 1.6, 40);
    warm.position.set(-3, -1, 3);
    scene.add(warm);

    const g = genomeRef.current!;
    const built = makeBody(g);
    scene.add(built.group);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      root: built.group,
      core: built.core,
      limbs: built.limbs,
      raf: 0,
    };

    const pitchBuf = new Float32Array(2048);
    const start = performance.now();

    const animate = () => {
      const s = sceneRef.current;
      if (!s) return;
      const now = performance.now();
      const t = (now - start) / 1000;

      // Live mic feeding (analysis-only).
      let live = 0;
      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getFloatTimeDomainData(pitchBuf);
        let rms = 0;
        for (let i = 0; i < pitchBuf.length; i++) rms += pitchBuf[i] * pitchBuf[i];
        rms = Math.sqrt(rms / pitchBuf.length);
        live = Math.min(1, rms * 8);
        const freq = detectPitch(pitchBuf, engineRef.current?.ctx.sampleRate ?? 44100);
        if (freq > 0) {
          const degree = freqToDegree(freq);
          const acc = humAccumRef.current;
          acc.seconds += 1 / 60;
          // Echo the child's note back, gently, and grow a frond on a new note held.
          if (degree !== acc.lastDegree && now - acc.lastFedAt > 700) {
            acc.lastDegree = degree;
            acc.lastFedAt = now;
            engineRef.current?.sing(degree, undefined, 0.4);
            const cur = genomeRef.current!;
            const fed = feedHum(cur, degree, Math.max(1, Math.round(acc.seconds)));
            acc.seconds = 0;
            genomeRef.current = fed.genome;
            setGenome(fed.genome);
            rebuildBody(fed.genome, fed.newTokenId);
          }
        }
      }
      setHumLevel((p) => p + (live - p) * 0.2);

      // Breathing core (alive from frame one).
      const breathe = 1 + Math.sin(t * 1.1) * 0.05 + live * 0.25;
      s.core.scale.setScalar(breathe);
      const cm = s.core.material as THREE.MeshStandardMaterial;
      cm.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.2 + live * 1.5;

      // Slow turn so all the limbs read.
      s.root.rotation.y = t * 0.25;

      // Limbs sway; the freshly-grown part sparkles into place.
      const sparkle = sparkleRef.current;
      s.limbs.forEach((limb, idx) => {
        const sway = limb.kind === "hum" ? 0.18 : 0.08;
        limb.mesh.position.y = limb.basePos.y + Math.sin(t * (1 + limb.spin) + idx) * sway;
        limb.mesh.rotation.z += limb.spin * 0.01;
        const lm = limb.mesh.material as THREE.MeshStandardMaterial;
        lm.emissiveIntensity = 0.9 + Math.sin(t * 2 + idx) * 0.2 + live * 0.8;
        limb.mesh.scale.setScalar(1);
      });
      // Sparkle the newest limb (last one) when a part just grew.
      if (sparkle && now < sparkle.until && s.limbs.length) {
        const fresh = s.limbs[s.limbs.length - 1];
        const k = (sparkle.until - now) / 2600;
        const pop = 1 + Math.sin(now * 0.03) * 0.5 * k + k * 0.6;
        fresh.mesh.scale.setScalar(pop);
        (fresh.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.5 + k * 3;
      } else if (sparkle && now >= sparkle.until) {
        sparkleRef.current = null;
      }

      s.renderer.render(s.scene, s.camera);
      s.raf = requestAnimationFrame(animate);
    };
    sceneRef.current.raf = requestAnimationFrame(animate);

    const onResize = () => {
      const s = sceneRef.current;
      if (!s || !mount) return;
      const nw = mount.clientWidth || window.innerWidth;
      const nh = mount.clientHeight || 480;
      s.camera.aspect = nw / nh;
      s.camera.updateProjectionMatrix();
      s.renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      const s = sceneRef.current;
      if (s) {
        cancelAnimationFrame(s.raf);
        s.scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            (o.material as THREE.Material).dispose();
          }
        });
        s.renderer.dispose();
        if (s.renderer.domElement.parentNode) {
          s.renderer.domElement.parentNode.removeChild(s.renderer.domElement);
        }
      }
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* Cleanup audio on unmount. */
  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  /* Wake: create AudioContext inside the gesture (iOS unlock), greet, attach mic. */
  const handleWake = useCallback(async () => {
    setPhase("awake");
    try {
      const engine = await bootAudio();
      engineRef.current = engine;
      // Greet from the learned palette as soon as it wakes.
      const g = genomeRef.current;
      if (g) setTimeout(() => engine.greet(g.palette), 250);

      try {
        const analyser = await engine.attachMic();
        analyserRef.current = analyser;
        setMicOk(true);
      } catch {
        setMicOk(false);
        setNotice("No microphone — that's okay! Tap the keeper to pet and grow it.");
      }
    } catch {
      setMicOk(false);
      setNotice("Sound is napping — tap the keeper to pet and grow it.");
    }
  }, []);

  /* Tap-to-pet: works with or without a mic, with or without WebGL. */
  const handlePet = useCallback(() => {
    const cur = genomeRef.current;
    if (!cur) return;
    const res = petGrow(cur);
    genomeRef.current = res.genome;
    setGenome(res.genome);
    const degree = res.genome.palette[res.genome.palette.length - 1] ?? 0;
    engineRef.current?.growChime(degree);
    if (webglOk) rebuildBody(res.genome, res.newTokenId);
    setHumLevel(1);
  }, [rebuildBody, webglOk]);

  /* Time-travel: the reviewer's "🌙 next day" affordance — grows a big new part. */
  const handleNextDay = useCallback(() => {
    const cur = genomeRef.current;
    if (!cur) return;
    const res = advanceOneDay(cur);
    genomeRef.current = res.genome;
    setGenome(res.genome);
    const lastDay = [...res.genome.tokens].reverse().find((tk) => tk.kind === "day");
    engineRef.current?.growChime(lastDay?.degree ?? 0);
    setNotice("A new day — the keeper grew a brand-new part!");
    if (webglOk) rebuildBody(res.genome, res.newTokenId);
  }, [rebuildBody, webglOk]);

  const dayCount = genome?.distinctDays ?? 0;
  const partCount = genome?.tokens.length ?? 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0b0608] text-white">
      {/* warm ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(60% 50% at 50% 42%, rgba(255,${90 + Math.round(humLevel * 120)},40,${0.16 + humLevel * 0.25}), rgba(11,6,8,0) 70%)`,
          transition: "background 120ms linear",
        }}
      />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col gap-4 px-5 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Ember Keeper
          </h1>
          <p className="text-base text-white/75">
            A glowing creature that lives in here, remembers your visits, and grows a
            bigger body every day you come back.
          </p>
          <a
            href="./README.md"
            className="font-mono text-base text-amber-300/90 underline decoration-amber-300/40 underline-offset-4 hover:text-amber-200"
          >
            Read the design notes
          </a>
        </header>

        {/* Stage */}
        <div className="relative rounded-3xl border border-white/10 bg-black/40 p-2">
          {/* three.js mount */}
          {webglOk ? (
            <div
              ref={mountRef}
              onClick={phase === "awake" ? handlePet : undefined}
              className="h-[440px] w-full cursor-pointer rounded-2xl"
              role="button"
              tabIndex={0}
              aria-label="Pet the keeper"
            />
          ) : (
            /* DOM/CSS fallback creature — still glows, still tappable, still sings. */
            <div
              onClick={phase === "awake" ? handlePet : undefined}
              className="flex h-[440px] w-full cursor-pointer items-center justify-center rounded-2xl"
              role="button"
              tabIndex={0}
              aria-label="Pet the keeper"
            >
              <div className="relative flex items-center justify-center">
                <div
                  className="h-40 w-40 rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle at 40% 35%, #ffd28a, #ff8a3c 45%, #c23a1a 80%)",
                    boxShadow: `0 0 ${60 + humLevel * 120}px ${20 + humLevel * 40}px rgba(255,140,60,${0.5 + humLevel * 0.4})`,
                    transform: `scale(${1 + humLevel * 0.18})`,
                    transition: "transform 100ms linear, box-shadow 120ms linear",
                  }}
                />
                {/* one petal per growth part, so the fallback also reads "bigger" */}
                {genome?.tokens.map((tok, i) => {
                  const ang = i * 137.5 * (Math.PI / 180);
                  const r = 90 + (tok.kind === "day" ? 24 : 0);
                  const size = tok.kind === "day" ? 28 : 14;
                  const col = degreeToColor(tok.degree).getStyle();
                  return (
                    <span
                      key={tok.id}
                      className="absolute rounded-full"
                      style={{
                        width: size,
                        height: size,
                        left: `calc(50% + ${Math.cos(ang) * r}px - ${size / 2}px)`,
                        top: `calc(50% + ${Math.sin(ang) * r}px - ${size / 2}px)`,
                        background: col,
                        boxShadow: `0 0 12px ${col}`,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* idle veil + primary action */}
          {phase === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-black/55 backdrop-blur-[2px]">
              <p className="text-base text-white/75">
                Your keeper has been growing while you were away.
              </p>
              <button
                onClick={handleWake}
                className="min-h-[64px] min-w-[64px] rounded-full bg-amber-400 px-10 py-4 text-xl font-bold text-[#3a1a06] shadow-lg shadow-amber-500/30 transition-transform active:scale-95"
              >
                Wake the keeper
              </button>
            </div>
          )}
        </div>

        {/* Status row — readable, kid-friendly, no reading required to PLAY */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 font-mono text-base text-white/75">
            <span aria-label="days returned">days {dayCount}</span>
            <span aria-label="body parts">parts {partCount}</span>
          </div>
          {/* clearly-secondary time-travel control */}
          {phase === "awake" && (
            <button
              onClick={handleNextDay}
              className="min-h-[44px] rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 font-mono text-base text-white/75 transition-colors hover:bg-white/[0.12] hover:text-white"
              aria-label="Let another day pass"
            >
              🌙 next day
            </button>
          )}
        </div>

        {/* notices */}
        {notice && phase === "awake" && (
          <p className="text-base text-amber-200/90">{notice}</p>
        )}
        {micOk === false && (
          <p className="text-base text-rose-300">
            Microphone is off — humming is paused, but petting still feeds and grows
            your keeper.
          </p>
        )}
        {!webglOk && (
          <p className="text-base text-rose-300">
            This screen can&apos;t draw 3D, so here&apos;s a simpler keeper — it still
            glows, grows, and sings.
          </p>
        )}
        {phase === "awake" && micOk && (
          <p className="text-base text-white/75">
            Hum or sing to feed it. Tap it to pet it. Its mic listens only — nothing is
            ever recorded.
          </p>
        )}
      </div>
    </main>
  );
}
