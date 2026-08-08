"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { createSim, N, S, type Sim } from "./sim";
import { createAudioEngine, type AudioEngine } from "./audio";
import {
  breedMatrices,
  cellColor,
  clampCell,
  makeRandomMatrix,
  mulberry32,
  SPECIES_NOTE,
  SPECIES_RGB,
} from "./matrix";

const DT = 0.014;
const SEED = 0x8200;
const MAX_POOL = 6;

type Gene = { id: number; m: number[] };

export default function Rulesmith() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const [started, setStarted] = useState(false);
  const [supported, setSupported] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  // the score: an S×S authored ruleset
  const initial = useMemo(() => makeRandomMatrix(mulberry32(SEED)), []);
  const [matrix, setMatrix] = useState<number[]>(() => Array.from(initial));
  const matrixRef = useRef<Float32Array>(initial);

  const [cursor, setCursor] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [genePool, setGenePool] = useState<Gene[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [auto, setAuto] = useState(true);
  const [world, setWorld] = useState(1);

  // refs mirroring state for the rAF loop / keyboard handler
  const simRef = useRef<Sim | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const autoRef = useRef(true);
  const rngRef = useRef<() => number>(mulberry32(SEED));
  const genePoolRef = useRef<Gene[]>(genePool);
  const selectedRef = useRef<number[]>(selected);
  const smoothRef = useRef<Float32Array>(new Float32Array(S));
  const idRef = useRef(0);
  const dragRef = useRef<{ r: number; c: number } | null>(null);
  const cursorRef = useRef(cursor);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    autoRef.current = auto;
  }, [auto]);
  useEffect(() => {
    genePoolRef.current = genePool;
  }, [genePool]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // keep the sim's live matrix in sync with the authored score
  useEffect(() => {
    const r = matrixRef.current;
    for (let i = 0; i < S * S; i++) r[i] = matrix[i];
  }, [matrix]);

  // hand control to the user the moment they author anything
  const handover = useCallback(() => {
    if (autoRef.current) {
      autoRef.current = false;
      setAuto(false);
    }
  }, []);

  const setCell = useCallback((r: number, c: number, val: number) => {
    setMatrix((prev) => {
      const nx = prev.slice();
      nx[r * S + c] = clampCell(val);
      return nx;
    });
  }, []);

  // ── audio start (inside user gesture) ──────────────────────────────────────
  const start = useCallback(() => {
    if (audioRef.current) return;
    const eng = createAudioEngine();
    if (eng) {
      audioRef.current = eng;
      if (eng.ctx.state === "suspended") void eng.ctx.resume();
    }
    setStarted(true); // visuals run regardless of audio success
  }, []);

  // ── virtual author (self-demo): keeps the world alive with zero input ──────
  useEffect(() => {
    const id = window.setInterval(() => {
      if (!autoRef.current) return;
      const rng = rngRef.current;
      const roll = rng();
      if (roll < 0.05 && simRef.current) {
        simRef.current.reseedPositions(mulberry32((rng() * 1e9) >>> 0));
      }
      if (roll < 0.12) {
        // occasional multi-cell mutation
        setMatrix((prev) => {
          const nx = prev.slice();
          const k = 2 + Math.floor(rng() * 3);
          for (let t = 0; t < k; t++) {
            const i = Math.floor(rng() * S * S);
            nx[i] = clampCell(nx[i] + (rng() * 2 - 1) * 0.4);
          }
          return nx;
        });
      } else {
        // nudge a single cell and show the cursor there
        const r = Math.floor(rng() * S);
        const c = Math.floor(rng() * S);
        setCursor({ r, c });
        setMatrix((prev) => {
          const nx = prev.slice();
          nx[r * S + c] = clampCell(nx[r * S + c] + (rng() * 2 - 1) * 0.28);
          return nx;
        });
      }
    }, 430);
    return () => window.clearInterval(id);
  }, []);

  // ── keyboard: the authoring + breeding verbs ───────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const authoring =
        k === "ArrowUp" ||
        k === "ArrowDown" ||
        k === "ArrowLeft" ||
        k === "ArrowRight" ||
        k === "[" ||
        k === "]" ||
        k === "-" ||
        k === "=" ||
        k === "s" ||
        k === "S" ||
        k === "b" ||
        k === "B" ||
        k === "n" ||
        k === "N" ||
        (k >= "1" && k <= "6");

      if (k === "Escape") {
        setShowNotes(false);
        return;
      }
      if (!authoring) return;
      e.preventDefault();
      handover();

      if (k === "ArrowUp") setCursor((p) => ({ ...p, r: Math.max(0, p.r - 1) }));
      else if (k === "ArrowDown") setCursor((p) => ({ ...p, r: Math.min(S - 1, p.r + 1) }));
      else if (k === "ArrowLeft") setCursor((p) => ({ ...p, c: Math.max(0, p.c - 1) }));
      else if (k === "ArrowRight") setCursor((p) => ({ ...p, c: Math.min(S - 1, p.c + 1) }));
      else if (k === "[" || k === "-") {
        const p = cursorRef.current;
        setCell(p.r, p.c, matrixRef.current[p.r * S + p.c] - 0.1);
      } else if (k === "]" || k === "=") {
        const p = cursorRef.current;
        setCell(p.r, p.c, matrixRef.current[p.r * S + p.c] + 0.1);
      } else if (k === "s" || k === "S") {
        setGenePool((prev) => {
          const entry: Gene = { id: ++idRef.current, m: Array.from(matrixRef.current) };
          return [...prev, entry].slice(-MAX_POOL);
        });
      } else if (k === "b" || k === "B") {
        const pool = genePoolRef.current;
        const sel = selectedRef.current;
        let a: number[] | undefined;
        let b: number[] | undefined;
        if (sel.length === 2) {
          a = pool[sel[0]]?.m;
          b = pool[sel[1]]?.m;
        } else if (pool.length >= 2) {
          a = pool[pool.length - 2].m;
          b = pool[pool.length - 1].m;
        }
        if (a && b) {
          const child = breedMatrices(
            Float32Array.from(a),
            Float32Array.from(b),
            mulberry32((Math.random() * 1e9) >>> 0),
          );
          setMatrix(Array.from(child));
          simRef.current?.reseedPositions(mulberry32((Math.random() * 1e9) >>> 0));
          setWorld((w) => w + 1);
        }
      } else if (k === "n" || k === "N") {
        const rng = mulberry32((Math.random() * 1e9) >>> 0);
        const m = makeRandomMatrix(rng);
        setMatrix(Array.from(m));
        simRef.current?.reseedPositions(rng);
        setWorld((w) => w + 1);
      } else if (k >= "1" && k <= "6") {
        const idx = Number(k) - 1;
        setSelected((prev) => {
          if (idx >= genePoolRef.current.length) return prev;
          if (prev.includes(idx)) return prev.filter((x) => x !== idx);
          if (prev.length >= 2) return [prev[1], idx];
          return [...prev, idx];
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handover, setCell]);

  // ── pointer convenience: drag a cell vertically to set its value ───────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setCell(d.r, d.c, matrixRef.current[d.r * S + d.c] - e.movementY * 0.012);
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [setCell]);

  const onCellDown = useCallback(
    (r: number, c: number) => {
      handover();
      setCursor({ r, c });
      dragRef.current = { r, c };
    },
    [handover],
  );

  const toggleSelect = useCallback((idx: number) => {
    setSelected((prev) => {
      if (prev.includes(idx)) return prev.filter((x) => x !== idx);
      if (prev.length >= 2) return [prev[1], idx];
      return [...prev, idx];
    });
  }, []);

  // ── three.js + simulation lifecycle ────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      if (!renderer.getContext()) throw new Error("no gl");
    } catch {
      setSupported(false);
      return;
    }

    const sim = createSim(mulberry32(SEED));
    simRef.current = sim;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeAlpha = reduced ? 0.5 : 0.12;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.autoClear = false;
    renderer.setClearColor(0x08070d, 1);
    mount.appendChild(renderer.domElement);
    renderer.clear();

    const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, -1, 1);

    // trail layer: a translucent background quad darkens old frames
    const fadeScene = new THREE.Scene();
    const fadeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x08070d),
      transparent: true,
      opacity: fadeAlpha,
      depthWrite: false,
      depthTest: false,
    });
    const fadeMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), fadeMat);
    fadeScene.add(fadeMesh);

    // particle layer
    const scene = new THREE.Scene();
    const geom = new THREE.BufferGeometry();
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: dpr } },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        varying vec3 vColor;
        uniform float uPx;
        void main() {
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 3.4 * uPx;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          float a = smoothstep(0.25, 0.0, r);
          gl_FragColor = vec4(vColor, a);
        }
      `,
    });
    const points = new THREE.Points(geom, material);
    scene.add(points);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      if (aspect >= 1) {
        camera.left = -1.05 * aspect;
        camera.right = 1.05 * aspect;
        camera.top = 1.05;
        camera.bottom = -1.05;
      } else {
        camera.left = -1.05;
        camera.right = 1.05;
        camera.top = 1.05 / aspect;
        camera.bottom = -1.05 / aspect;
      }
      camera.updateProjectionMatrix();
      renderer.clear();
    };
    resize();
    window.addEventListener("resize", resize);

    const smooth = smoothRef.current;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      sim.step(DT, matrixRef.current);

      for (let s = 0; s < S; s++) {
        smooth[s] += (sim.clustering[s] - smooth[s]) * 0.06;
      }

      const pos = sim.pos;
      const type = sim.type;
      for (let i = 0; i < N; i++) {
        positions[i * 3] = pos[i * 2];
        positions[i * 3 + 1] = pos[i * 2 + 1];
        positions[i * 3 + 2] = 0;
        const t = type[i];
        const cc = SPECIES_RGB[t];
        const b = 0.5 + 0.95 * smooth[t]; // luminance blooms with clustering
        colors[i * 3] = cc[0] * b;
        colors[i * 3 + 1] = cc[1] * b;
        colors[i * 3 + 2] = cc[2] * b;
      }
      geom.attributes.position.needsUpdate = true;
      geom.attributes.color.needsUpdate = true;

      renderer.render(fadeScene, camera); // darken trails
      renderer.render(scene, camera); // additive particles

      audioRef.current?.setLevels(smooth);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      geom.dispose();
      material.dispose();
      fadeMat.dispose();
      fadeMesh.geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      simRef.current = null;
    };
  }, []);

  // ── teardown audio on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.close();
      audioRef.current = null;
    };
  }, []);

  const active = cursor.r * S + cursor.c;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {!supported && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            WebGL is unavailable in this browser, so the particle field cannot
            render. Try a recent desktop browser with hardware acceleration
            enabled.
          </p>
        </div>
      )}

      {/* title + intro + primary action */}
      <div className="pointer-events-none absolute left-0 top-0 z-10 max-w-md p-5 sm:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 8200
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Rulesmith
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          The rules of a particle-life world are a score you compose by hand.
          Sculpt the species-force matrix, hear the emergent clusters re-voice,
          save the worlds you love, and breed two into offspring.
        </p>

        <div className="pointer-events-auto mt-4 flex flex-wrap items-center gap-2">
          {!started ? (
            <button
              onClick={start}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              World #{world} · sounding
            </span>
          )}
          <button
            onClick={() => setAuto((a) => !a)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Auto {auto ? "on" : "off"}
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          Arrows move the cursor · <span className="font-mono">[</span>{" "}
          <span className="font-mono">]</span> change a cell ·{" "}
          <span className="font-mono">S</span> save ·{" "}
          <span className="font-mono">1–6</span> pick two ·{" "}
          <span className="font-mono">B</span> breed ·{" "}
          <span className="font-mono">N</span> new world.
        </p>
      </div>

      {/* matrix editor + gene pool */}
      <div className="pointer-events-auto absolute right-4 top-4 z-10 w-[19rem] max-w-[85vw] rounded-lg border border-border bg-background/80 p-4 backdrop-blur-sm sm:right-6 sm:top-6">
        <div className="flex items-baseline justify-between">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Force matrix — the score
          </p>
        </div>

        {/* column headers */}
        <div className="mt-3 grid grid-cols-[1.25rem_repeat(5,1fr)] gap-1">
          <span />
          {SPECIES_RGB.map((cc, j) => (
            <span
              key={j}
              className="mx-auto h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: `rgb(${cc[0] * 255},${cc[1] * 255},${cc[2] * 255})` }}
            />
          ))}
        </div>

        <div ref={gridRef} className="mt-1 grid grid-cols-[1.25rem_repeat(5,1fr)] gap-1">
          {Array.from({ length: S }).map((_, r) => (
            <div key={r} className="contents">
              <span
                className="my-auto h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: `rgb(${SPECIES_RGB[r][0] * 255},${SPECIES_RGB[r][1] * 255},${SPECIES_RGB[r][2] * 255})`,
                }}
              />
              {Array.from({ length: S }).map((__, c) => {
                const idx = r * S + c;
                const v = matrix[idx];
                const isActive = idx === active;
                return (
                  <button
                    key={c}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onCellDown(r, c);
                    }}
                    className={`flex aspect-square items-center justify-center rounded-md font-mono text-[0.6rem] text-foreground transition-shadow ${
                      isActive ? "ring-2 ring-primary" : "ring-1 ring-border/60"
                    }`}
                    style={{ backgroundColor: cellColor(v) }}
                    title={`${SPECIES_NOTE[r]} → ${SPECIES_NOTE[c]}: ${v.toFixed(2)}`}
                  >
                    {v.toFixed(1)}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Row feels · column felt-toward. Violet attracts, red repels.
        </p>

        {/* gene pool */}
        <div className="mt-4 flex items-center justify-between">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Gene pool
          </p>
          <span className="font-mono text-xs text-muted-foreground">
            {genePool.length}/{MAX_POOL}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {genePool.length === 0 && (
            <span className="text-sm text-muted-foreground">
              Press <span className="font-mono">S</span> to save this world.
            </span>
          )}
          {genePool.map((g, i) => (
            <button
              key={g.id}
              onClick={() => toggleSelect(i)}
              className={`rounded-md border p-1 transition-colors ${
                selected.includes(i)
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background/60 hover:bg-accent"
              }`}
              title={`World gene ${i + 1}`}
            >
              <div className="grid grid-cols-5 gap-px">
                {g.m.map((v, k) => (
                  <span
                    key={k}
                    className="h-1.5 w-1.5 rounded-[1px]"
                    style={{ backgroundColor: cellColor(v) }}
                  />
                ))}
              </div>
              <span className="mt-1 block text-center font-mono text-[0.6rem] text-muted-foreground">
                {i + 1}
              </span>
            </button>
          ))}
        </div>
        {genePool.length >= 2 && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Pick two ({selected.length}/2), then press{" "}
            <span className="font-mono">B</span> to breed offspring.
          </p>
        )}
      </div>

      {/* species legend */}
      <div className="pointer-events-none absolute bottom-5 left-5 z-10 flex flex-col gap-1">
        {SPECIES_RGB.map((cc, i) => (
          <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: `rgb(${cc[0] * 255},${cc[1] * 255},${cc[2] * 255})` }}
            />
            <span className="font-mono text-xs">{SPECIES_NOTE[i]}</span>
          </div>
        ))}
      </div>

      {/* design notes link */}
      <button
        onClick={() => setShowNotes(true)}
        className="pointer-events-auto absolute bottom-5 right-6 z-10 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Rulesmith — design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                What if the RULES of a particle-life world were a musical score
                you compose by hand? The asymmetric 5×5 attraction matrix is the
                instrument: each cell M[i][j] is the force species i feels toward
                species j. Sculpt a cell and the swarm re-organizes within a
                second.
              </p>
              <p>
                Each species owns one voice on a C-major pentatonic (C D E G A).
                As a species condenses into tight clusters, its voice blooms
                brighter and louder; when it disperses, it fades. The emergent
                structure is what you hear — and the particles glow with the same
                clustering, so the world stays alive even on a muted phone.
              </p>
              <p>
                The technique: Particle Life (Ventrella&apos;s <em>Clusters</em>,
                CodeParade&apos;s tent force curve) with an O(N) spatial-hash
                grid; per-species clustering drives both voice and luminance; and
                a genetic <em>crossover + mutation</em> breeder in the spirit of
                Dawkins&apos; <em>Biomorphs</em> and Karl Sims&apos; evolved
                virtual creatures — you keep the rulesets you like and breed them.
              </p>
              <p>
                It deepens the loved <span className="font-mono">236-particle-life-song</span>,
                which only reseeds a random matrix, by making the matrix
                player-authored and breedable — the score is now yours.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
