"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  buildRack,
  arcPoint,
  pluck,
  shimmer,
  stepLine,
  modePhaseAmps,
  makeSinTable,
  NMODES,
  type FieldLine,
} from "./mhd-core";
import { createAudio, type AudioEngine } from "./additive-voice";

const TUBULAR = 54; // centerline samples per field line
const RADIAL = 6; // ring facets
const TUBE_R = 0.085;
const VIS_GAIN = 2.6; // amplify modal displacement for the eye only

// soft radial sprite for additive bloom (generated, no external asset)
function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(200,255,220,0.65)");
    grd.addColorStop(1, "rgba(120,180,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

interface LineGfx {
  line: FieldLine;
  geom: THREE.BufferGeometry;
  posAttr: THREE.BufferAttribute;
  mat: THREE.MeshBasicMaterial;
  mesh: THREE.Mesh;
  glowGeom: THREE.BufferGeometry;
  glowAttr: THREE.BufferAttribute;
  glowMat: THREE.PointsMaterial;
  glow: THREE.Points;
  center: THREE.Vector3[]; // live centerline (for picking)
}

export default function AlfvenPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [field, setField] = useState(1);

  const startedRef = useRef(false);
  const bScaleRef = useRef(1);
  useEffect(() => {
    startedRef.current = started;
  }, [started]);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        audioRef.current = createAudio();
      } catch {
        // audio unavailable — the field still rings visually
      }
    }
    try {
      await audioRef.current?.resume();
      audioRef.current?.setFieldScale(bScaleRef.current);
    } catch {
      // ignore resume failures
    }
    setStarted(true);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const onField = useCallback((v: number) => {
    setField(v);
    bScaleRef.current = v;
    audioRef.current?.setFieldScale(v);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    if (typeof window === "undefined" || !window.WebGLRenderingContext) {
      setErr("This piece needs WebGL, which this browser does not provide.");
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setErr("Could not start the WebGL renderer on this device.");
      return;
    }

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07031a, 0.03);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0.4, 9.2);

    const setSize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);
    setSize();

    const glowTex = makeGlowTexture();
    const sinTable = makeSinTable(TUBULAR);
    const rack = buildRack();

    // shared ring index buffer (tube topology is fixed)
    const ringIndex: number[] = [];
    for (let i = 0; i < TUBULAR; i++) {
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j;
        const b = a + (RADIAL + 1);
        ringIndex.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }

    const gfx: LineGfx[] = [];
    for (const line of rack) {
      const vCount = (TUBULAR + 1) * (RADIAL + 1);
      const geom = new THREE.BufferGeometry();
      const posArr = new Float32Array(vCount * 3);
      const posAttr = new THREE.BufferAttribute(posArr, 3);
      geom.setAttribute("position", posAttr);
      geom.setIndex(ringIndex);
      const col = new THREE.Color().setHSL(line.hue, 0.85, 0.55);
      const mat = new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);

      const glowGeom = new THREE.BufferGeometry();
      const glowArr = new Float32Array((TUBULAR + 1) * 3);
      const glowAttr = new THREE.BufferAttribute(glowArr, 3);
      glowGeom.setAttribute("position", glowAttr);
      const glowMat = new THREE.PointsMaterial({
        color: col.clone(),
        map: glowTex,
        size: 0.5,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Points(glowGeom, glowMat);
      scene.add(glow);

      const center: THREE.Vector3[] = [];
      for (let i = 0; i <= TUBULAR; i++) center.push(new THREE.Vector3());

      gfx.push({ line, geom, posAttr, mat, mesh, glowGeom, glowAttr, glowMat, glow, center });
    }

    // glowing footpoint anchors where the loops meet the surface
    const footMat = new THREE.MeshBasicMaterial({
      color: 0x8affc8,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const feet: THREE.Mesh[] = [];
    const footGeoms: THREE.BufferGeometry[] = [];
    for (const line of rack) {
      for (const u of [0, 1]) {
        const fg = new THREE.SphereGeometry(0.11, 12, 10);
        const fm = new THREE.Mesh(fg, footMat);
        const p = new THREE.Vector3();
        arcPoint(line, u, p);
        fm.position.copy(p);
        scene.add(fm);
        feet.push(fm);
        footGeoms.push(fg);
      }
    }

    // ── displacement scratch ────────────────────────────────────────────
    const E = new Float32Array(NMODES + 1);
    const tmpP = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const bin = new THREE.Vector3();
    const prevN = new THREE.Vector3();
    const ref = new THREE.Vector3(0, 0, 1);
    const off = new THREE.Vector3();
    const cosT = new Float32Array(RADIAL + 1);
    const sinT = new Float32Array(RADIAL + 1);
    for (let j = 0; j <= RADIAL; j++) {
      const a = (j / RADIAL) * Math.PI * 2;
      cosT[j] = Math.cos(a);
      sinT[j] = Math.sin(a);
    }

    const tri = (u: number, u0: number) => (u < u0 ? u / u0 : (1 - u) / (1 - u0));

    // grab / pluck state
    let grabIdx = -1;
    let grabU0 = 0.5;
    let holdDisp = 0;
    const grabStart = new THREE.Vector3();
    const dragPlane = new THREE.Plane();
    const hitWorld = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    const updateLine = (gf: LineGfx) => {
      const line = gf.line;
      const energy = modePhaseAmps(line, bScaleRef.current, E);
      const held = grabIdx === line.index ? holdDisp : 0;

      // 1) centerline
      for (let i = 0; i <= TUBULAR; i++) {
        arcPoint(line, i / TUBULAR, tmpP);
        let d = 0;
        for (let n = 1; n <= NMODES; n++) d += E[n] * sinTable[n][i];
        d *= VIS_GAIN;
        if (held !== 0) d += held * tri(i / TUBULAR, grabU0);
        tmpP.addScaledVector(line.normal, d);
        gf.center[i].copy(tmpP);
      }

      // 2) sweep a parallel-transported ring frame down the centerline
      const pos = gf.posAttr.array as Float32Array;
      const gpos = gf.glowAttr.array as Float32Array;
      for (let i = 0; i <= TUBULAR; i++) {
        const c = gf.center[i];
        if (i < TUBULAR) tan.subVectors(gf.center[i + 1], c);
        else tan.subVectors(c, gf.center[i - 1]);
        tan.normalize();
        if (i === 0) {
          nrm.copy(ref).addScaledVector(tan, -ref.dot(tan));
          if (nrm.lengthSq() < 1e-6) nrm.set(0, 1, 0).addScaledVector(tan, -tan.y);
          nrm.normalize();
        } else {
          nrm.copy(prevN).addScaledVector(tan, -prevN.dot(tan)).normalize();
        }
        bin.crossVectors(tan, nrm).normalize();
        prevN.copy(nrm);
        gpos[i * 3] = c.x;
        gpos[i * 3 + 1] = c.y;
        gpos[i * 3 + 2] = c.z;
        for (let j = 0; j <= RADIAL; j++) {
          off.copy(nrm).multiplyScalar(cosT[j] * TUBE_R).addScaledVector(bin, sinT[j] * TUBE_R);
          const idx = (i * (RADIAL + 1) + j) * 3;
          pos[idx] = c.x + off.x;
          pos[idx + 1] = c.y + off.y;
          pos[idx + 2] = c.z + off.z;
        }
      }
      gf.posAttr.needsUpdate = true;
      gf.glowAttr.needsUpdate = true;
      gf.geom.computeBoundingSphere();

      // 3) colour: aurora hue, brightening with ring energy; flash → magenta
      const bright = Math.min(0.45, energy * VIS_GAIN * 0.9);
      const f = line.flash;
      const hue = line.hue + (0.9 - line.hue) * f; // toward hot magenta
      gf.mat.color.setHSL(hue, 0.85, 0.5 + bright * 0.5 + f * 0.25);
      gf.mat.opacity = 0.5 + bright + f * 0.3;
      gf.glowMat.color.setHSL(hue, 0.8, 0.55 + f * 0.2);
      gf.glowMat.opacity = 0.28 + bright * 0.8 + f * 0.35;
    };

    // ── picking ──────────────────────────────────────────────────────────
    const pickLine = (clientX: number, clientY: number): number => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(gfx.map((g) => g.mesh), false);
      if (hits.length === 0) return -1;
      const mesh = hits[0].object;
      const gi = gfx.findIndex((g) => g.mesh === mesh);
      if (gi < 0) return -1;
      hitWorld.copy(hits[0].point);
      // nearest centerline sample → pluck parameter u0
      let best = 0;
      let bestD = Infinity;
      const gf = gfx[gi];
      for (let i = 0; i <= TUBULAR; i++) {
        const dd = gf.center[i].distanceToSquared(hitWorld);
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      grabU0 = Math.min(0.9, Math.max(0.1, best / TUBULAR));
      return gi;
    };

    const onDown = (e: PointerEvent) => {
      const gi = pickLine(e.clientX, e.clientY);
      if (gi < 0) return;
      grabIdx = gi;
      holdDisp = 0;
      grabStart.copy(hitWorld);
      // drag plane through the grab point, facing camera
      const n = camera.getWorldDirection(new THREE.Vector3()).negate();
      dragPlane.setFromNormalAndCoplanarPoint(n, grabStart);
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (grabIdx < 0) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, p)) {
        // component of the pull along the line's transverse polarisation
        const line = gfx[grabIdx].line;
        holdDisp = Math.max(-0.8, Math.min(0.8, p.clone().sub(grabStart).dot(line.normal)));
      }
    };
    const releaseGrab = (e?: PointerEvent) => {
      if (grabIdx < 0) return;
      const line = gfx[grabIdx].line;
      const strength = Math.min(0.62, 0.12 + Math.abs(holdDisp) * 0.55);
      const coeffs = pluck(line, grabU0, strength);
      if (startedRef.current && audioRef.current) {
        const pan = Math.max(-1, Math.min(1, line.center.x / 4.5));
        audioRef.current.pluck(line.f1Ref, coeffs, Math.min(1, 0.3 + strength), pan);
      }
      grabIdx = -1;
      holdDisp = 0;
      if (e) {
        try {
          renderer.domElement.releasePointerCapture(e.pointerId);
        } catch {
          // capture already released
        }
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", releaseGrab);
    window.addEventListener("pointercancel", releaseGrab);

    // ── idle shimmer ───────────────────────────────────────────────────────
    let shimmerCd = 0.6;

    // ── loop ───────────────────────────────────────────────────────────────
    const orbitAmp = reduceMotion ? 0.12 : 0.4;
    let raf = 0;
    let last = performance.now();
    let t = 0;

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      shimmerCd -= dt;
      if (shimmerCd <= 0) {
        shimmerCd = (reduceMotion ? 1.4 : 0.5) + Math.random() * 0.9;
        const line = rack[(Math.random() * rack.length) | 0];
        const coeffs = shimmer(line);
        if (startedRef.current && audioRef.current && Math.random() < 0.5) {
          const pan = Math.max(-1, Math.min(1, line.center.x / 4.5));
          audioRef.current.pluck(line.f1Ref, coeffs, 0.14, pan);
        }
      }

      for (const gf of gfx) {
        stepLine(gf.line, dt);
        updateLine(gf);
      }

      camera.position.x = Math.sin(t * 0.14) * orbitAmp;
      camera.position.y = 0.4 + Math.sin(t * 0.11) * orbitAmp * 0.4;
      camera.lookAt(0, -0.2, 0);

      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => setSize();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointerup", releaseGrab);
      window.removeEventListener("pointercancel", releaseGrab);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      for (const gf of gfx) {
        gf.geom.dispose();
        gf.mat.dispose();
        gf.glowGeom.dispose();
        gf.glowMat.dispose();
      }
      for (const fgeom of footGeoms) fgeom.dispose();
      footMat.dispose();
      glowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden text-foreground">
      {/* deep indigo → near-black backdrop (chiaroscuro) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 18%, #150a34 0%, #0b0622 42%, #050310 74%, #020106 100%)",
        }}
      />
      <div ref={mountRef} className="absolute inset-0" />

      {err && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">{err}</p>
        </div>
      )}

      {/* title + description */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-5 sm:p-7">
        <h1 className="font-serif text-2xl text-foreground sm:text-3xl">Alfvén Rack</h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Pluck a magnetic field line like a string and hear the plasma sing — each glowing loop
          rings in the standing Alfvén modes that set its pitch.
        </p>
      </div>

      {/* notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-full border border-border bg-black/40 px-4 py-2.5 text-base font-medium text-foreground backdrop-blur-md transition-colors hover:bg-black/60"
      >
        {showNotes ? "Close notes" : "Read the design notes"}
      </button>

      {/* controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-3 p-5 sm:p-7">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {!started && (
            <button
              onClick={begin}
              className="min-h-[44px] rounded-full bg-violet-400/20 px-5 py-2.5 text-base font-medium text-violet-200 ring-1 ring-violet-300/40 transition hover:bg-violet-400/30"
            >
              Energize the field
            </button>
          )}
          {started && (
            <button
              onClick={toggleMute}
              className="min-h-[44px] rounded-full bg-muted px-4 py-2.5 text-base text-foreground ring-1 ring-border transition hover:bg-accent"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          )}
          <label className="flex min-h-[44px] items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-base text-muted-foreground ring-1 ring-border">
            <span className="text-violet-200">Field&nbsp;B</span>
            <input
              type="range"
              min={0.6}
              max={1.8}
              step={0.01}
              value={field}
              onChange={(e) => onField(parseFloat(e.target.value))}
              className="h-1 w-28 cursor-pointer accent-violet-300"
              aria-label="Global magnetic field strength"
            />
          </label>
        </div>
        {started && (
          <p className="pointer-events-none text-base text-muted-foreground">
            Grab a loop, pull, and release to pluck it — raise Field B to tune the whole rack up.
          </p>
        )}
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-x-0 top-20 z-20 mx-auto max-h-[76dvh] max-w-xl overflow-y-auto rounded-2xl bg-black/70 p-5 text-base text-muted-foreground ring-1 ring-border backdrop-blur sm:top-24">
          <p className="mb-3 text-foreground">
            A magnetic field line threading a plasma behaves like a string under tension.
            Transverse <span className="text-violet-300">Alfvén waves</span> travel along it at the
            Alfvén speed <span className="text-violet-200">v_A = B / √(μ₀ρ)</span>, reflect at the
            anchored footpoints, and ring in standing modes: fundamental{" "}
            <span className="text-violet-200">f₁ = v_A / 2L</span> and harmonics{" "}
            <span className="text-violet-200">fₙ = n·f₁</span>.
          </p>
          <p className="mb-3">
            Each loop is modelled by modal superposition of those standing harmonics. The{" "}
            <em>same</em> modal amplitudes whip the tube and voice the sound, so seeing and hearing
            are one model — a plucked line rings as a sum of its partials (additive resynthesis),
            higher harmonics decaying faster, just as a real string does. Pitch is set physically by
            length and field: the loop lengths L are tuned so the rack lands on a pentatonic set, and
            raising <span className="text-violet-300">Field B</span> lifts every pitch at once. (The
            visible shimmer is time-dilated to a few Hz; the audio rings at the true fₙ.)
          </p>
          <p className="mb-3 text-muted-foreground">
            <span className="text-foreground">Palette:</span> aurora green ↔ violet on deep indigo,
            with a hot-magenta flash at the pluck.
          </p>
          <p className="mb-3 text-muted-foreground">
            <span className="text-foreground">References:</span> Hannes Alfvén predicted
            magnetohydrodynamic (Alfvén) waves in 1942 (Nobel Prize in Physics, 1970); coronal-loop
            &ldquo;seismology&rdquo; of transverse loop oscillations (Nakariakov et al.); and the
            plucked-string lineage of Chladni and Helmholtz.
          </p>
          <Link href="/dream" className="text-violet-300 underline-offset-4 hover:underline">
            ← back to the lab
          </Link>
        </div>
      )}

      <PrototypeNav slugs={[]} />
    </main>
  );
}
