"use client";

// cortexbloom — watch your music grow a cortex.
//
// A Kohonen self-organizing map is fed a seeded corpus of timbre vectors. The
// 22×22 neural sheet is rendered as a living 3-D terrain: each neuron is a
// vertex, its HEIGHT is the U-matrix (ridges between dissimilar regions), its
// COLOR is its learned timbre (teal→violet by spectral centroid, bright by
// energy). As the SOM self-organises the flat sheet buckles into cortex-like
// gyri — and you hear the timbres it is filing away. Click a fold to play it.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { Som } from "./som";
import { buildCorpus } from "./corpus";
import { CortexAudio } from "./audio";

const G = 22; // grid side
const SPAN = 22; // world units the terrain spans
const HEIGHT_SCALE = 26; // U-matrix → world height
const STEPS_PER_FRAME = 320; // training steps per animation frame
const NOTE_INTERVAL_MS = 130; // throttle for training-time sonification

export default function CortexBloomPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [begun, setBegun] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const audioRef = useRef<CortexAudio | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // --- renderer with graceful WebGL degrade -------------------------------
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      // touch the context so a failure surfaces now
      if (!renderer.getContext()) throw new Error("no gl");
    } catch {
      setWebglError(true);
      return;
    }

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x04060a, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x04060a, 0.019);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    camera.position.set(0, 22, 30);

    // --- lighting: bioluminescent teal + violet ----------------------------
    scene.add(new THREE.AmbientLight(0x223344, 0.9));
    const violet = new THREE.PointLight(0x8a5cff, 90, 120);
    violet.position.set(-14, 20, 8);
    scene.add(violet);
    const teal = new THREE.PointLight(0x2fd6c8, 70, 120);
    teal.position.set(16, 16, -6);
    scene.add(teal);
    const cyan = new THREE.PointLight(0x9becff, 30, 120);
    cyan.position.set(0, 24, -18);
    scene.add(cyan);

    // --- terrain geometry: one vertex per SOM neuron -----------------------
    const N = G * G;
    const positions = new Float32Array(N * 3);
    const colors = new Float32Array(N * 3);
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const i = y * G + x;
        positions[i * 3] = (x / (G - 1) - 0.5) * SPAN;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = (y / (G - 1) - 0.5) * SPAN;
        colors[i * 3] = 0.1;
        colors[i * 3 + 1] = 0.3;
        colors[i * 3 + 2] = 0.4;
      }
    }
    const indices: number[] = [];
    for (let y = 0; y < G - 1; y++) {
      for (let x = 0; x < G - 1; x++) {
        const i = y * G + x;
        indices.push(i, i + 1, i + G);
        indices.push(i + 1, i + G + 1, i + G);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.15,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geom, material);
    scene.add(mesh);

    // faint wireframe overlay to read the neural lattice
    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geom),
      new THREE.LineBasicMaterial({ color: 0x2a4a5a, transparent: true, opacity: 0.14 }),
    );
    mesh.add(wire);

    // --- SOM + corpus + audio graph ----------------------------------------
    const som = new Som(G, 12, 6000);
    const corpus = buildCorpus(0x11048, 256);
    let corpusIdx = 0;
    const uBuf = new Float32Array(N);
    const targetH = new Float32Array(N); // smoothed height targets
    const targetC = new Float32Array(N * 3); // smoothed color targets

    let ctx: AudioContext | null = null;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
      audioRef.current = new CortexAudio(ctx);
    } catch {
      audioRef.current = null; // visuals still run
    }

    // teal→violet ramp for the generative art layer (raw color is allowed here)
    const tmpColor = new THREE.Color();
    function neuronColor(i: number, out: { r: number; g: number; b: number }) {
      const c = som.centroid(i); // 0..1 spectral centroid
      const e = som.energy(i); // ~0..1 energy
      const hue = (175 + c * 105) / 360; // cyan/teal → blue → violet
      const light = 0.22 + Math.min(0.55, e * 2.4) * 0.55;
      tmpColor.setHSL(hue, 0.62, light);
      out.r = tmpColor.r;
      out.g = tmpColor.g;
      out.b = tmpColor.b;
    }

    // --- interaction: click a fold to play its timbre ----------------------
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function onClick(ev: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (!hit) return;
      // map the hit point back to the nearest neuron via the grid mapping
      const gx = Math.round((hit.point.x / SPAN + 0.5) * (G - 1));
      const gz = Math.round((hit.point.z / SPAN + 0.5) * (G - 1));
      const cx = Math.max(0, Math.min(G - 1, gx));
      const cz = Math.max(0, Math.min(G - 1, gz));
      const idx = cz * G + cx;
      audioRef.current?.trigger(som.neuron(idx), 1.3, 0.2);
    }
    renderer.domElement.addEventListener("pointerdown", onClick);

    // --- resize ------------------------------------------------------------
    function onResize() {
      if (!mount) return;
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // --- animation loop ----------------------------------------------------
    let raf = 0;
    let lastNote = 0;
    let frameCount = 0;
    const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = geom.getAttribute("color") as THREE.BufferAttribute;
    const colOut = { r: 0, g: 0, b: 0 };

    function frame() {
      const now = performance.now();

      // --- train several hundred steps; keep the last BMU for sound --------
      let lastBmu = som.lastBmu;
      for (let s = 0; s < STEPS_PER_FRAME; s++) {
        lastBmu = som.step(corpus[corpusIdx]);
        corpusIdx = (corpusIdx + 1) % corpus.length;
      }

      // --- rate-limited sonification of the firing BMU --------------------
      if (audioRef.current?.running && now - lastNote > NOTE_INTERVAL_MS) {
        audioRef.current.trigger(som.neuron(lastBmu), 0.2, 0.14);
        lastNote = now;
      }

      // --- recompute U-matrix → height targets, timbre → color targets ----
      som.uMatrix(uBuf);
      for (let i = 0; i < N; i++) {
        targetH[i] = uBuf[i] * HEIGHT_SCALE;
        neuronColor(i, colOut);
        targetC[i * 3] = colOut.r;
        targetC[i * 3 + 1] = colOut.g;
        targetC[i * 3 + 2] = colOut.b;
      }

      // --- ease vertices toward targets (slow, no flashing) ---------------
      const kH = 0.06;
      const kC = 0.05;
      let dirty = false;
      for (let i = 0; i < N; i++) {
        const cur = posAttr.getY(i);
        const ny = cur + (targetH[i] - cur) * kH;
        posAttr.setY(i, ny);
        const r = colAttr.getX(i) + (targetC[i * 3] - colAttr.getX(i)) * kC;
        const g = colAttr.getY(i) + (targetC[i * 3 + 1] - colAttr.getY(i)) * kC;
        const b = colAttr.getZ(i) + (targetC[i * 3 + 2] - colAttr.getZ(i)) * kC;
        colAttr.setXYZ(i, r, g, b);
        dirty = true;
      }
      if (dirty) {
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        geom.computeVertexNormals();
        // rebuild the (static-snapshot) wireframe occasionally, not every frame
        if (frameCount % 12 === 0) {
          (wire.geometry as THREE.WireframeGeometry).dispose();
          wire.geometry = new THREE.WireframeGeometry(geom);
        }
      }
      frameCount++;

      // --- gentle auto-orbit (driven by performance.now) ------------------
      const ang = now * 0.00007;
      const R = 32;
      camera.position.set(Math.cos(ang) * R, 21 + Math.sin(now * 0.0002) * 3, Math.sin(ang) * R);
      camera.lookAt(0, 3.5, 0);

      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // --- teardown ----------------------------------------------------------
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onClick);
      audioRef.current?.dispose();
      audioRef.current = null;
      geom.dispose();
      material.dispose();
      (wire.geometry as THREE.WireframeGeometry).dispose();
      (wire.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  async function handleBegin() {
    await audioRef.current?.resume();
    setBegun(true);
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* the living cortex */}
      <div ref={mountRef} className="absolute inset-0" aria-hidden />

      {/* WebGL degrade notice */}
      {webglError && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="text-destructive text-base">
            WebGL is unavailable in this browser, so the living-cortex terrain cannot render.
            The SOM engine and sonification depend on it here.
          </p>
        </div>
      )}

      {/* corner back-nav */}
      <Link
        href="/dream"
        className="absolute left-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground inline-flex items-center"
      >
        ← dream
      </Link>

      {/* title + intent */}
      <div className="pointer-events-none absolute right-4 top-4 z-10 max-w-xs text-right">
        <h1 className="text-xl font-semibold tracking-tight">cortexbloom</h1>
        <p className="mt-1 text-base text-muted-foreground">
          Watch your music grow a cortex.
        </p>
      </div>

      {/* controls */}
      <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3">
        {!begun && !webglError && (
          <button
            type="button"
            onClick={handleBegin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
          >
            Begin
          </button>
        )}
        {begun && (
          <span className="min-h-[44px] inline-flex items-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground">
            Click a fold to play its timbre
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Read the design notes
        </button>
      </div>

      {/* design notes overlay */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight">cortexbloom — design notes</h2>
            <div className="mt-3 space-y-3 text-base text-muted-foreground">
              <p>
                A <span className="text-foreground">Kohonen self-organizing map</span> (Teuvo
                Kohonen, 1982) is fed a seeded corpus of 256 timbre vectors in R¹². The 22×22
                neural sheet re-arranges itself so that similar timbres sit next to one another —
                the same principle by which the auditory cortex forms its tonotopic map.
              </p>
              <p>
                You are seeing that map as a 3-D terrain. Each vertex is one neuron. Its{" "}
                <span className="text-foreground">height</span> is the U-matrix — the average
                distance to its neighbours — so ridges rise between dissimilar regions and valleys
                sit inside similar clusters. Its <span className="text-foreground">colour</span> is
                its learned timbre: teal→violet by spectral centroid, brighter with energy.
              </p>
              <p>
                As neurons fire during training you <span className="text-foreground">hear</span>{" "}
                the timbre they are filing away — 12 additive partials over a low C2. The texture
                settles as the sheet finds its order. Click any fold to sustain its voice.
              </p>
              <p className="text-sm">
                The sheet self-organises on mount with no input; press <em>Begin</em> only to let
                sound through (browsers block audio until a gesture).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
