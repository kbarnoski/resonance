"use client";

// ── 7960 · Origami — FOLD PAPER INTO MUSIC ────────────────────────────────────
// "What if you composed by folding paper — authoring a crease pattern of
//  mountain and valley folds, then folding it in 3D — and the geometry of your
//  folds became the music, with a flat-foldable vertex ringing consonant and one
//  that isn't clashing?"
//
// INPUT  : you AUTHOR a crease pattern (click grid edges → mountain / valley).
// OUTPUT : the sheet folds in 3D (three.js) via a driven spanning-tree hinge fold.
// RULE   : each interior vertex is judged by Kawasaki's + Maekawa's theorems;
//          flat-foldable → a clean just-tuned voice, otherwise it detunes/buzzes.
// You DISCOVER flat-foldable configurations by ear. The lab's first origami piece.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import Link from "next/link";
import {
  makeMesh,
  makeStarter,
  evalVertices,
  foldMesh,
  type CreaseMap,
  type MV,
  type StarterId,
} from "./origami";
import { OrigamiAudio, type VoiceState } from "./audio";
import { PrototypeNav } from "../_shared/prototype-nav";
import { VIOLET, INDIGO } from "../_shared/palette";

const N = 5;
const FOLD_PERIOD = 15000; // ms per fold/unfold loop — slow + seizure-safe

// Deterministic seeded RNG for the headless self-demo (no wall-clock, no global
// randomness — only performance.now drives timing elsewhere).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Crease colours (art layer — on the violet ramp): warm violet = mountain,
// cool periwinkle = valley.
const C_MOUNTAIN = VIOLET[400];
const C_VALLEY = INDIGO;

interface SceneRefs {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  spin: THREE.Group;
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshStandardMaterial;
  posArr: Float32Array;
  colArr: Float32Array;
  groundGeo: THREE.PlaneGeometry;
  groundMat: THREE.ShadowMaterial;
}

// Violet-ramp height colour for the folded surface.
function rampColor(t: number, out: THREE.Color): void {
  const c = Math.min(1, Math.max(0, t));
  const deep = [0.09, 0.05, 0.18];
  const ind = [0.388, 0.4, 0.945];
  const vio = [0.545, 0.361, 0.965];
  const mag = [0.69, 0.263, 0.878];
  const lit = [0.83, 0.78, 0.995];
  let a: number[], b: number[], f: number;
  if (c < 0.33) {
    a = deep;
    b = ind;
    f = c / 0.33;
  } else if (c < 0.6) {
    a = ind;
    b = vio;
    f = (c - 0.33) / 0.27;
  } else if (c < 0.82) {
    a = vio;
    b = mag;
    f = (c - 0.6) / 0.22;
  } else {
    a = mag;
    b = lit;
    f = (c - 0.82) / 0.18;
  }
  out.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

export default function OrigamiPage() {
  const mesh = useMemo(() => makeMesh(N), []);

  const [creases, setCreases] = useState<CreaseMap>(() => new Map());
  const [showNotes, setShowNotes] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [glError, setGlError] = useState(false);
  const [reduced, setReduced] = useState(false);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneRefs | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<OrigamiAudio | null>(null);

  const creasesRef = useRef<CreaseMap>(creases);
  const foldRef = useRef(0);
  const playingRef = useRef(playing);
  const reducedRef = useRef(reduced);
  const audioOnRef = useRef(audioOn);
  const userTookOverRef = useRef(false);
  const startRef = useRef(0);
  const lastAudioAtRef = useRef(0);

  const evals = useMemo(() => evalVertices(mesh, creases), [mesh, creases]);

  useEffect(() => {
    creasesRef.current = creases;
  }, [creases]);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useEffect(() => {
    audioOnRef.current = audioOn;
  }, [audioOn]);

  // Reduced-motion preference.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    if (mq.matches) setPlaying(false);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Self-demo: lay a deterministic starter pattern + one deliberate clash.
  useEffect(() => {
    const rng = mulberry32(0x7960);
    const starters: StarterId[] = ["miura", "fan", "bird"];
    const pick = starters[Math.floor(rng() * starters.length)];
    const map = makeStarter(mesh, pick);
    // Add one odd crease to force a non-flat-foldable (clashing) vertex.
    const vids = mesh.interiorVids;
    const vid = vids[Math.floor(rng() * vids.length)];
    const inc = mesh.incident.get(vid) ?? [];
    if (inc.length) {
      const e = inc[Math.floor(rng() * inc.length)];
      if (!map.has(e.key)) map.set(e.key, rng() < 0.5 ? 1 : -1);
    }
    startRef.current = performance.now();
    setCreases(map);
  }, [mesh]);

  // ── three.js scene ──
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setGlError(true);
      return;
    }
    const w = mount.clientWidth || 480;
    const h = mount.clientHeight || 420;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(46, w / h, 0.1, 100);
    camera.position.set(0, 1.35, 2.7);
    camera.lookAt(0, 0.05, 0);

    scene.add(new THREE.AmbientLight(0x8b7fd6, 0.55));
    const key = new THREE.DirectionalLight(0xd8ccff, 1.15);
    key.position.set(2.2, 3.4, 1.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x5b2ec9, 0.5);
    rim.position.set(-2.5, 1.2, -2);
    scene.add(rim);

    const spin = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.x = -Math.PI / 2; // flat sheet lies in the ground plane
    spin.add(tilt);
    scene.add(spin);

    const nTris = mesh.tris.length;
    const posArr = new Float32Array(nTris * 9);
    const colArr = new Float32Array(nTris * 9);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colArr, 3));
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.62,
      metalness: 0.02,
      flatShading: true,
    });
    const sheet = new THREE.Mesh(geo, mat);
    sheet.castShadow = true;
    sheet.scale.setScalar(1.7);
    tilt.add(sheet);

    const groundGeo = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.9;
    ground.receiveShadow = true;
    scene.add(ground);

    sceneRef.current = {
      renderer,
      scene,
      camera,
      spin,
      mesh: sheet,
      geo,
      mat,
      posArr,
      colArr,
      groundGeo,
      groundMat,
    };

    const onResize = () => {
      const cw = mount.clientWidth || w;
      const ch = mount.clientHeight || h;
      renderer.setSize(cw, ch);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      geo.dispose();
      mat.dispose();
      groundGeo.dispose();
      groundMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
  }, [mesh]);

  // ── animation loop ──
  useEffect(() => {
    const tmp = new THREE.Color();
    const step = () => {
      const now = performance.now();
      let param = foldRef.current;
      if (reducedRef.current) {
        param = 0.5;
      } else if (playingRef.current) {
        const phase = ((now - startRef.current) / FOLD_PERIOD) % 1;
        param = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      }
      foldRef.current = param;

      const s = sceneRef.current;
      if (s) {
        const fold = foldMesh(mesh, creasesRef.current, param);
        s.posArr.set(fold.positions);
        (s.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        // Colour by folded height (local z, the fold axis before tilt).
        for (let i = 0; i < fold.positions.length; i += 3) {
          const z = fold.positions[i + 2];
          rampColor(0.46 + z * 0.85, tmp);
          s.colArr[i] = tmp.r;
          s.colArr[i + 1] = tmp.g;
          s.colArr[i + 2] = tmp.b;
        }
        (s.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
        s.geo.computeVertexNormals();
        if (!reducedRef.current) s.spin.rotation.y += 0.0032;
        s.renderer.render(s.scene, s.camera);
      }

      const eng = audioRef.current;
      if (eng && audioOnRef.current && now - lastAudioAtRef.current > 90) {
        eng.setFold(param);
        lastAudioAtRef.current = now;
      }

      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [mesh]);

  // Push the live voice set to the audio engine whenever the pattern changes.
  useEffect(() => {
    const eng = audioRef.current;
    if (!eng || !audioOn) return;
    const voices: VoiceState[] = evals
      .filter((e) => e.active)
      .map((e) => ({
        id: `${e.i},${e.j}`,
        nx: e.nx,
        ny: e.ny,
        consonance: e.consonance,
        kawasakiError: e.kawasakiError,
        maekawaOk: e.maekawaOk,
      }));
    eng.setVoices(voices);
  }, [evals, audioOn]);

  // Full teardown.
  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, []);

  const startAudio = useCallback(async () => {
    if (audioRef.current) return;
    const eng = new OrigamiAudio();
    await eng.start();
    audioRef.current = eng;
    setAudioOn(true);
  }, []);

  const applyStarter = useCallback(
    (id: StarterId) => {
      userTookOverRef.current = true;
      setCreases(makeStarter(mesh, id));
    },
    [mesh],
  );

  const toggleEdge = useCallback((k: string) => {
    userTookOverRef.current = true;
    setCreases((prev) => {
      const next = new Map(prev);
      const cur = next.get(k);
      if (cur === undefined) next.set(k, 1);
      else if (cur === 1) next.set(k, -1 as MV);
      else next.delete(k);
      return next;
    });
  }, []);

  // ── 2D editor geometry (SVG coords) ──
  const VB = 100;
  const PAD = 9;
  const toXY = useCallback(
    (vid: number): [number, number] => {
      const px = mesh.pos[vid * 2];
      const py = mesh.pos[vid * 2 + 1];
      return [PAD + (px + 0.5) * (VB - 2 * PAD), PAD + (0.5 - py) * (VB - 2 * PAD)];
    },
    [mesh],
  );

  const editorEdges = useMemo(() => {
    return mesh.authorable.map((k) => {
      const [a, b] = mesh.edgeVerts.get(k)!;
      const [ax, ay] = toXY(a);
      const [bx, by] = toXY(b);
      return { key: k, ax, ay, bx, by };
    });
  }, [mesh, toXY]);

  const foldableCount = evals.filter((e) => e.active && e.consonance > 0.85).length;
  const activeCount = evals.filter((e) => e.active).length;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 7960 · crease-pattern composer
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Fold paper into music
        </h1>
        <p className="mt-2 max-w-2xl text-base text-muted-foreground">
          Author a crease pattern of mountain and valley folds, then fold the
          sheet in 3D. The geometry becomes the music: a{" "}
          <span className="text-foreground">flat-foldable</span> vertex rings
          consonant, one that can&apos;t flatten clashes. Discover valid patterns
          by ear.
        </p>

        {/* controls */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Starter
          </span>
          {(
            [
              ["miura", "Miura-ori"],
              ["fan", "Fan"],
              ["bird", "Bird base"],
              ["clear", "Clear"],
            ] as [StarterId, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => applyStarter(id)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => setPlaying((p) => !p)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {playing ? "Pause fold" : "Play fold"}
          </button>
          {!audioOn ? (
            <button
              onClick={startAudio}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              ▶ Sound on
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              sound live
            </span>
          )}
        </div>

        {/* studio */}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* editor */}
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Crease pattern — click an edge: none → mountain → valley
            </p>
            <svg
              viewBox={`0 0 ${VB} ${VB}`}
              className="w-full touch-none select-none rounded-md"
              style={{ aspectRatio: "1 / 1" }}
            >
              <rect
                x={PAD - 3}
                y={PAD - 3}
                width={VB - 2 * PAD + 6}
                height={VB - 2 * PAD + 6}
                rx={2}
                className="fill-muted/30 stroke-border"
                strokeWidth={0.4}
              />
              {/* faint base edges (where you can crease) */}
              {editorEdges.map((e) => {
                const mv = creases.get(e.key);
                if (mv !== undefined) return null;
                return (
                  <line
                    key={`b${e.key}`}
                    x1={e.ax}
                    y1={e.ay}
                    x2={e.bx}
                    y2={e.by}
                    className="stroke-border"
                    strokeWidth={0.35}
                    strokeOpacity={0.5}
                  />
                );
              })}
              {/* creased edges */}
              {editorEdges.map((e) => {
                const mv = creases.get(e.key);
                if (mv === undefined) return null;
                return (
                  <line
                    key={`c${e.key}`}
                    x1={e.ax}
                    y1={e.ay}
                    x2={e.bx}
                    y2={e.by}
                    stroke={mv === 1 ? C_MOUNTAIN : C_VALLEY}
                    strokeWidth={1.3}
                    strokeLinecap="round"
                    strokeDasharray={mv === -1 ? "2.4 1.8" : undefined}
                  />
                );
              })}
              {/* interior vertices, coloured by flat-foldability */}
              {evals.map((v) => {
                const [x, y] = toXY(v.vid);
                if (!v.active) {
                  return (
                    <circle
                      key={`v${v.vid}`}
                      cx={x}
                      cy={y}
                      r={0.9}
                      className="fill-muted-foreground/40"
                    />
                  );
                }
                const consonant = v.consonance > 0.85;
                return (
                  <circle
                    key={`v${v.vid}`}
                    cx={x}
                    cy={y}
                    r={2}
                    fill={consonant ? VIOLET[300] : "#ef4444"}
                    stroke={consonant ? VIOLET[100] : "#fca5a5"}
                    strokeWidth={0.5}
                  >
                    <title>{`vertex (${v.i},${v.j}) · Kawasaki err ${v.kawasakiError.toFixed(2)} · |M−V|=${v.maekawaDiff}${v.maekawaOk ? " (Maekawa ✓)" : ""}`}</title>
                  </circle>
                );
              })}
              {/* click targets */}
              {editorEdges.map((e) => (
                <line
                  key={`h${e.key}`}
                  x1={e.ax}
                  y1={e.ay}
                  x2={e.bx}
                  y2={e.by}
                  stroke="transparent"
                  strokeWidth={3.4}
                  className="cursor-pointer"
                  onClick={() => toggleEdge(e.key)}
                />
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
              <span>
                <span style={{ color: C_MOUNTAIN }}>—</span> mountain
              </span>
              <span>
                <span style={{ color: C_VALLEY }}>- -</span> valley
              </span>
              <span>
                <span style={{ color: VIOLET[300] }}>●</span> flat-foldable
              </span>
              <span>
                <span style={{ color: "#ef4444" }}>●</span> clashing
              </span>
            </div>
          </div>

          {/* 3D fold */}
          <div className="relative rounded-lg border border-border bg-background/40 p-3">
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Folded form
            </p>
            <div
              ref={mountRef}
              className="w-full overflow-hidden rounded-md bg-[#0b0713]"
              style={{ aspectRatio: "1 / 1" }}
            />
            {glError && (
              <p className="absolute inset-x-3 bottom-3 rounded-md bg-background/80 p-2 text-sm text-destructive">
                WebGL is unavailable — the 3D fold can&apos;t render here, but the
                crease editor and its consonance still work.
              </p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {activeCount === 0
                ? "No creases yet — pick a starter or draw your own."
                : `${activeCount} vertices sounding · ${foldableCount} flat-foldable (consonant).`}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNotes(true)}
          className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Design notes</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                You author a crease pattern on a square sheet — each edge is a{" "}
                <span style={{ color: C_MOUNTAIN }}>mountain</span> or{" "}
                <span style={{ color: C_VALLEY }}>valley</span> fold. Every
                interior vertex is a voice.
              </p>
              <p>
                <span className="text-foreground">Kawasaki&apos;s theorem:</span>{" "}
                a single-vertex pattern is flat-foldable iff the alternating sums
                of the angles between consecutive creases are equal (each 180°).
                We measure how far a vertex is from that and map low error → a
                clean just-tuned partial, high error → detune + beating.{" "}
                <span className="text-foreground">Maekawa&apos;s theorem</span>{" "}
                (mountains − valleys = ±2) adds a brightness bonus.
              </p>
              <p>
                The 3D fold is a <em>driven</em> hinge fold — panels rotate about
                shared crease lines along a spanning tree. It is deliberately{" "}
                <em>not</em> a rigorous rigid-origami solver (that is a research
                problem — see Robert Lang and Erik Demaine), so non-flat-foldable
                vertices visibly gap, which is honest: you can see the clash you
                hear.
              </p>
              <p className="text-foreground">
                References: Kawasaki, Maekawa, Miura-ori, Robert Lang
                (computational origami), Erik Demaine (folding).
              </p>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Link
                href="/dream/7960-origami/README.md"
                className="text-sm text-primary hover:underline"
              >
                Full README →
              </Link>
              <button
                onClick={() => setShowNotes(false)}
                className="ml-auto min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7960-origami"]} />
    </main>
  );
}
