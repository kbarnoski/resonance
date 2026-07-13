"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSim,
  seedConfig,
  stepSim,
  detectLocks,
  dropBody,
  mergeBodies,
  audioFreq,
  type Sim,
  type Body,
  type Lock,
} from "./orbits";
import {
  createAudio,
  type AudioEngine,
  type BodyVoiceT,
  type LockVoiceT,
} from "./audio";

const TRAIL_LEN = 130;
const MAX_BODIES = 9;
const MAX_BONDS = 12;

// warm star glow sprite (generated — no asset, no network)
function glowTexture(): THREE.Texture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, "rgba(255,250,235,1)");
    grd.addColorStop(0.28, "rgba(255,214,150,0.72)");
    grd.addColorStop(1, "rgba(255,170,90,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.Texture(c);
  tex.needsUpdate = true;
  return tex;
}

interface BodyGfx {
  core: THREE.Mesh;
  glow: THREE.Sprite;
  trail: THREE.Line;
  trailPos: Float32Array;
  trailCol: Float32Array;
  head: number;
  filled: number;
  baseColor: THREE.Color;
}

interface HudLock {
  key: string;
  label: string;
  strength: number;
}

export default function OrbitalConsonancePage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const labelLayerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const simRef = useRef<Sim | null>(null);
  const runningRef = useRef(false);
  const frozenRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hudLocks, setHudLocks] = useState<HudLock[]>([]);
  const [bodyCount, setBodyCount] = useState(0);

  const begin = useCallback(async () => {
    if (!audioRef.current) {
      try {
        audioRef.current = createAudio();
      } catch {
        // audio unavailable — the cosmos still turns in silence
      }
    }
    try {
      await audioRef.current?.resume();
    } catch {
      /* ignore resume failure */
    }
    runningRef.current = true;
    frozenRef.current = false;
    setStarted(true);
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    frozenRef.current = true;
    audioRef.current?.stop();
    audioRef.current = null;
    setStarted(false);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      audioRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const reseed = useCallback(() => {
    const sim = simRef.current;
    if (sim) seedConfig(sim);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    const labelLayer = labelLayerRef.current;
    if (!mount || !labelLayer) return;

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

    const sim = createSim();
    seedConfig(sim);
    simRef.current = sim;

    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060f, 0.006);

    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    camera.position.set(0, 0, 40);
    camera.lookAt(0, 0, 0);

    const setSize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    // ── distant starfield (static, seeded) ─────────────────────────────────
    const STAR_COUNT = 520;
    const starGeom = new THREE.BufferGeometry();
    const sp = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 60 + sim.rand() * 120;
      const th = sim.rand() * Math.PI * 2;
      const ph = (sim.rand() - 0.5) * 0.9;
      sp[i * 3] = Math.cos(th) * r;
      sp[i * 3 + 1] = Math.sin(th) * r;
      sp[i * 3 + 2] = -40 - sim.rand() * 80 + ph * 10;
    }
    starGeom.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xfff2d8,
      size: 0.55,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    const starfield = new THREE.Points(starGeom, starMat);
    scene.add(starfield);

    // ── shared resources ───────────────────────────────────────────────────
    const glowTex = glowTexture();
    const sphereGeom = new THREE.SphereGeometry(1, 24, 16);

    // central star (anchored at origin)
    const centralColor = new THREE.Color(0xfff0cf);
    const centralCore = new THREE.Mesh(
      sphereGeom,
      new THREE.MeshBasicMaterial({ color: centralColor }),
    );
    centralCore.scale.setScalar(2.1);
    scene.add(centralCore);
    const centralGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffdca0,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    centralGlow.scale.setScalar(13);
    scene.add(centralGlow);

    // per-body graphics, keyed by body id
    const gfx = new Map<number, BodyGfx>();

    const makeBodyGfx = (b: Body): BodyGfx => {
      const baseColor = new THREE.Color().setHSL(b.hue, 0.85, 0.62);
      const core = new THREE.Mesh(
        sphereGeom,
        new THREE.MeshBasicMaterial({ color: baseColor.clone() }),
      );
      scene.add(core);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: baseColor.clone(),
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      scene.add(glow);

      const trailPos = new Float32Array(TRAIL_LEN * 3);
      const trailCol = new Float32Array(TRAIL_LEN * 3);
      const tg = new THREE.BufferGeometry();
      const pAttr = new THREE.BufferAttribute(trailPos, 3);
      const cAttr = new THREE.BufferAttribute(trailCol, 3);
      pAttr.setUsage(THREE.DynamicDrawUsage);
      cAttr.setUsage(THREE.DynamicDrawUsage);
      tg.setAttribute("position", pAttr);
      tg.setAttribute("color", cAttr);
      tg.setDrawRange(0, 0);
      const trail = new THREE.Line(
        tg,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      trail.frustumCulled = false;
      scene.add(trail);

      return {
        core,
        glow,
        trail,
        trailPos,
        trailCol,
        head: 0,
        filled: 0,
        baseColor,
      };
    };

    const disposeBodyGfx = (g: BodyGfx) => {
      scene.remove(g.core, g.glow, g.trail);
      (g.core.material as THREE.Material).dispose();
      (g.glow.material as THREE.Material).dispose();
      g.trail.geometry.dispose();
      (g.trail.material as THREE.Material).dispose();
    };

    // ── resonance bond lines (pooled) ──────────────────────────────────────
    const bonds: THREE.Line[] = [];
    const bondMats: THREE.LineBasicMaterial[] = [];
    for (let i = 0; i < MAX_BONDS; i++) {
      const bg = new THREE.BufferGeometry();
      const bp = new THREE.BufferAttribute(new Float32Array(2 * 3), 3);
      bp.setUsage(THREE.DynamicDrawUsage);
      bg.setAttribute("position", bp);
      const bm = new THREE.LineBasicMaterial({
        color: 0xffe6b0,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(bg, bm);
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      bonds.push(line);
      bondMats.push(bm);
    }

    // ── DOM resonance labels (pooled) ──────────────────────────────────────
    const labels: HTMLDivElement[] = [];
    for (let i = 0; i < MAX_BONDS; i++) {
      const d = document.createElement("div");
      d.style.position = "absolute";
      d.style.left = "0";
      d.style.top = "0";
      d.style.transform = "translate(-9999px,-9999px)";
      d.style.padding = "3px 10px";
      d.style.borderRadius = "9999px";
      d.style.fontSize = "16px";
      d.style.lineHeight = "1.2";
      d.style.fontWeight = "600";
      d.style.whiteSpace = "nowrap";
      d.style.pointerEvents = "none";
      d.style.color = "#fde68a"; // amber-200
      d.style.background = "rgba(8,10,22,0.62)";
      d.style.border = "1px solid rgba(253,230,138,0.35)";
      d.style.textShadow = "0 1px 6px rgba(0,0,0,0.85)";
      d.style.backdropFilter = "blur(2px)";
      d.style.opacity = "0";
      labelLayer.appendChild(d);
      labels.push(d);
    }

    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";
    mount.appendChild(renderer.domElement);
    setSize();

    // ── pointer interaction: fling / drop / merge ──────────────────────────
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hit = new THREE.Vector3();
    const proj = new THREE.Vector3();

    const worldFromPointer = (clientX: number, clientY: number): boolean => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(plane, hit) !== null;
    };

    const screenOf = (x: number, y: number, z: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      proj.set(x, y, z).project(camera);
      return {
        sx: ((proj.x + 1) / 2) * rect.width,
        sy: ((1 - proj.y) / 2) * rect.height,
        rect,
      };
    };

    const pickBody = (clientX: number, clientY: number): Body | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      let best: Body | null = null;
      let bestPix = 999;
      for (const b of sim.bodies) {
        const { sx, sy } = screenOf(b.x, b.y, 0);
        const dpx = Math.hypot(sx - px, sy - py);
        const thresh = Math.max(30, b.vr * 8 + 16);
        if (dpx < thresh && dpx < bestPix) {
          bestPix = dpx;
          best = b;
        }
      }
      return best;
    };

    let dragId = -1;
    let dragVX = 0;
    let dragVY = 0;
    let preDragVX = 0;
    let preDragVY = 0;
    let lastWX = 0;
    let lastWY = 0;
    let lastT = 0;
    let downX = 0;
    let downY = 0;
    let movedPix = 0;
    let pendingDrop = false;

    const onDown = (e: PointerEvent) => {
      if (!worldFromPointer(e.clientX, e.clientY)) return;
      renderer.domElement.setPointerCapture?.(e.pointerId);
      downX = e.clientX;
      downY = e.clientY;
      movedPix = 0;
      const b = pickBody(e.clientX, e.clientY);
      if (b) {
        dragId = b.id;
        b.held = true;
        preDragVX = b.vx;
        preDragVY = b.vy;
        dragVX = 0;
        dragVY = 0;
        lastWX = hit.x;
        lastWY = hit.y;
        lastT = performance.now();
        renderer.domElement.style.cursor = "grabbing";
      } else {
        pendingDrop = true;
      }
    };

    const onMove = (e: PointerEvent) => {
      movedPix = Math.max(movedPix, Math.hypot(e.clientX - downX, e.clientY - downY));
      if (dragId < 0) return;
      if (!worldFromPointer(e.clientX, e.clientY)) return;
      const b = sim.bodies.find((x) => x.id === dragId);
      if (!b) {
        dragId = -1;
        return;
      }
      const now = performance.now();
      const dt = Math.max(0.008, (now - lastT) / 1000);
      const ivx = (hit.x - lastWX) / dt;
      const ivy = (hit.y - lastWY) / dt;
      // smooth the pointer-derived velocity so a fling reads cleanly
      dragVX = dragVX * 0.6 + ivx * 0.4;
      dragVY = dragVY * 0.6 + ivy * 0.4;
      b.x = hit.x;
      b.y = hit.y;
      lastWX = hit.x;
      lastWY = hit.y;
      lastT = now;
    };

    const finishDrag = () => {
      if (dragId < 0) return;
      const b = sim.bodies.find((x) => x.id === dragId);
      renderer.domElement.style.cursor = "grab";
      if (!b) {
        dragId = -1;
        return;
      }
      b.held = false;
      // merge if released on top of another body
      let target: Body | null = null;
      let bestD = Infinity;
      for (const o of sim.bodies) {
        if (o.id === b.id) continue;
        const d = Math.hypot(o.x - b.x, o.y - b.y);
        if (d < o.vr + b.vr + 1.4 && d < bestD) {
          bestD = d;
          target = o;
        }
      }
      if (target) {
        const keep = target.mass >= b.mass ? target.id : b.id;
        const drop = keep === target.id ? b.id : target.id;
        mergeBodies(sim, keep, drop);
        dragId = -1;
        return;
      }
      if (movedPix < 6) {
        // a tap on a body → leave its orbit untouched
        b.vx = preDragVX;
        b.vy = preDragVY;
      } else {
        // fling: the drag velocity becomes the body's new velocity
        const s = 1.0;
        let vx = dragVX * s;
        let vy = dragVY * s;
        const sp = Math.hypot(vx, vy);
        if (sp > sim.vMax) {
          vx *= sim.vMax / sp;
          vy *= sim.vMax / sp;
        }
        b.vx = vx;
        b.vy = vy;
      }
      dragId = -1;
    };

    const onUp = (e: PointerEvent) => {
      renderer.domElement.releasePointerCapture?.(e.pointerId);
      if (dragId >= 0) {
        finishDrag();
      } else if (pendingDrop && movedPix < 6) {
        if (sim.bodies.length < MAX_BODIES && worldFromPointer(e.clientX, e.clientY)) {
          if (Math.hypot(hit.x, hit.y) > 3.5) dropBody(sim, hit.x, hit.y);
        }
      }
      pendingDrop = false;
    };

    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointercancel", onUp);

    // ── graceful context-loss handling ─────────────────────────────────────
    let contextLost = false;
    const onLost = (ev: Event) => {
      ev.preventDefault();
      contextLost = true;
    };
    const onRestored = () => {
      contextLost = false;
    };
    renderer.domElement.addEventListener("webglcontextlost", onLost as EventListener);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      onRestored as EventListener,
    );

    const onResize = () => setSize();
    window.addEventListener("resize", onResize);

    // ── main loop ──────────────────────────────────────────────────────────
    const prevLockKeys = new Set<string>();
    const pulse = new Map<string, number>(); // lock key → remaining pulse (s)
    const bodyTele: BodyVoiceT[] = [];
    const lockTele: LockVoiceT[] = [];
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let hudAccum = 0;
    let countAccum = -1;
    const camAmp = reduceMotion ? 0 : 1.6;
    const tmpColor = new THREE.Color();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (contextLost) return;
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      t += dt;

      if (!frozenRef.current) stepSim(sim, dt);

      // decay pulses
      for (const [k, v] of pulse) {
        const nv = v - dt;
        if (nv <= 0) pulse.delete(k);
        else pulse.set(k, nv);
      }

      const locks: Lock[] = detectLocks(sim);
      // detect fresh locks → onset pulse
      const curKeys = new Set<string>();
      for (const lk of locks) {
        curKeys.add(lk.key);
        if (!prevLockKeys.has(lk.key)) pulse.set(lk.key, reduceMotion ? 0.5 : 0.9);
      }
      prevLockKeys.clear();
      for (const k of curKeys) prevLockKeys.add(k);

      // which bodies are participating in a lock (for glow boost)
      const lockedBodies = new Map<number, number>(); // id → max strength
      for (const lk of locks) {
        const boost = lk.strength + (pulse.get(lk.key) ?? 0);
        lockedBodies.set(
          lk.outerId,
          Math.max(lockedBodies.get(lk.outerId) ?? 0, boost),
        );
        lockedBodies.set(
          lk.innerId,
          Math.max(lockedBodies.get(lk.innerId) ?? 0, boost),
        );
      }

      // ── sync body graphics ──────────────────────────────────────────────
      const alive = new Set<number>();
      for (const b of sim.bodies) {
        alive.add(b.id);
        let g = gfx.get(b.id);
        if (!g) {
          g = makeBodyGfx(b);
          gfx.set(b.id, g);
        }
        const boost = lockedBodies.get(b.id) ?? 0;
        const scaleP = b.vr * (1 + Math.min(0.5, boost * 0.35));
        g.core.position.set(b.x, b.y, 0);
        g.core.scale.setScalar(b.vr);
        g.glow.position.set(b.x, b.y, 0);
        g.glow.scale.setScalar(scaleP * 6.4 + 2);
        const glowMat = g.glow.material as THREE.SpriteMaterial;
        glowMat.opacity = 0.62 + Math.min(0.35, boost * 0.3);
        // brighten the core toward white when locked
        (g.core.material as THREE.MeshBasicMaterial).color
          .copy(g.baseColor)
          .lerp(tmpColor.set(0xffffff), Math.min(0.6, boost * 0.5));

        // advance the trail ring buffer (only while simulating)
        if (!frozenRef.current) {
          g.trailPos[g.head * 3] = b.x;
          g.trailPos[g.head * 3 + 1] = b.y;
          g.trailPos[g.head * 3 + 2] = 0;
          g.head = (g.head + 1) % TRAIL_LEN;
          if (g.filled < TRAIL_LEN) g.filled++;
        }
        // rebuild ordered trail (oldest→newest) with fading vertex colors
        const tg = g.trail.geometry as THREE.BufferGeometry;
        const posAttr = tg.getAttribute("position") as THREE.BufferAttribute;
        const colAttr = tg.getAttribute("color") as THREE.BufferAttribute;
        const pa = posAttr.array as Float32Array;
        const ca = colAttr.array as Float32Array;
        for (let k = 0; k < g.filled; k++) {
          const src = (g.head - g.filled + k + TRAIL_LEN * 2) % TRAIL_LEN;
          pa[k * 3] = g.trailPos[src * 3];
          pa[k * 3 + 1] = g.trailPos[src * 3 + 1];
          pa[k * 3 + 2] = 0;
          const a = (k / Math.max(1, g.filled - 1)) * 0.7; // tail dark → head bright
          ca[k * 3] = g.baseColor.r * a;
          ca[k * 3 + 1] = g.baseColor.g * a;
          ca[k * 3 + 2] = g.baseColor.b * a;
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        tg.setDrawRange(0, g.filled);
      }
      // dispose graphics for removed bodies
      for (const [id, g] of gfx) {
        if (!alive.has(id)) {
          disposeBodyGfx(g);
          gfx.delete(id);
        }
      }

      // ── bonds + labels ──────────────────────────────────────────────────
      const shown = Math.min(locks.length, MAX_BONDS);
      // strongest locks first so the pool always shows the clearest ones
      locks.sort((a, b) => b.strength - a.strength);
      for (let i = 0; i < MAX_BONDS; i++) {
        const line = bonds[i];
        const mat = bondMats[i];
        const label = labels[i];
        if (i < shown) {
          const lk = locks[i];
          const outer = sim.bodies.find((b) => b.id === lk.outerId);
          const inner = sim.bodies.find((b) => b.id === lk.innerId);
          if (!outer || !inner) {
            line.visible = false;
            label.style.opacity = "0";
            label.style.transform = "translate(-9999px,-9999px)";
            continue;
          }
          const bp = (line.geometry.getAttribute("position") as THREE.BufferAttribute)
            .array as Float32Array;
          bp[0] = outer.x;
          bp[1] = outer.y;
          bp[2] = 0;
          bp[3] = inner.x;
          bp[4] = inner.y;
          bp[5] = 0;
          (line.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
            true;
          line.visible = true;
          const pl = pulse.get(lk.key) ?? 0;
          mat.opacity = 0.2 + lk.strength * 0.5 + pl * 0.4;

          // label at the midpoint
          const mx = (outer.x + inner.x) / 2;
          const my = (outer.y + inner.y) / 2;
          const { sx, sy } = screenOf(mx, my, 0);
          label.textContent = `${lk.p}:${lk.q} · ${lk.name}`;
          label.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%)`;
          label.style.opacity = String(0.78 + lk.strength * 0.22);
          // pulse briefly tints the label toward warm white
          label.style.color = pl > 0.4 ? "#fff7e6" : "#fde68a";
        } else {
          line.visible = false;
          label.style.opacity = "0";
          label.style.transform = "translate(-9999px,-9999px)";
        }
      }

      // central star breathing glow (kept well under 3 Hz)
      const pulseSum = Array.from(pulse.values()).reduce((s, v) => s + v, 0);
      const breath = 0.9 + Math.sin(t * 0.7) * 0.06 + Math.min(0.3, pulseSum * 0.12);
      centralGlow.scale.setScalar(13 * breath);

      // ── audio telemetry ─────────────────────────────────────────────────
      if (runningRef.current && audioRef.current) {
        bodyTele.length = 0;
        for (const b of sim.bodies) {
          bodyTele.push({
            id: b.id,
            freq: audioFreq(b.period),
            gain: Math.min(1, b.mass / 3.5),
            pan: Math.max(-1, Math.min(1, b.x / (sim.rMax * 0.9))),
          });
        }
        lockTele.length = 0;
        for (const lk of locks) {
          const outer = sim.bodies.find((b) => b.id === lk.outerId);
          lockTele.push({
            key: lk.key,
            rootFreq: lk.rootFreq,
            ratio: lk.p / lk.q,
            strength: lk.strength,
            pan: outer ? Math.max(-1, Math.min(1, outer.x / (sim.rMax * 0.9))) : 0,
            fresh: (pulse.get(lk.key) ?? 0) > (reduceMotion ? 0.45 : 0.85),
          });
        }
        audioRef.current.render({ bodies: bodyTele, locks: lockTele });
      }

      // throttled HUD updates (~5 Hz) to avoid React churn
      hudAccum += dt;
      if (hudAccum > 0.2) {
        hudAccum = 0;
        setHudLocks(
          locks
            .slice(0, 6)
            .map((lk) => ({
              key: lk.key,
              label: `${lk.p}:${lk.q} · ${lk.name}`,
              strength: lk.strength,
            })),
        );
      }
      if (countAccum !== sim.bodies.length) {
        countAccum = sim.bodies.length;
        setBodyCount(sim.bodies.length);
      }

      // gentle camera drift for depth (skipped under reduced motion)
      if (camAmp > 0) {
        camera.position.x = Math.sin(t * 0.05) * camAmp;
        camera.position.y = Math.cos(t * 0.041) * camAmp * 0.7;
        camera.lookAt(0, 0, 0);
      }

      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointercancel", onUp);
      renderer.domElement.removeEventListener("webglcontextlost", onLost as EventListener);
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        onRestored as EventListener,
      );
      for (const g of gfx.values()) disposeBodyGfx(g);
      gfx.clear();
      for (const l of bonds) {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      }
      for (const d of labels) {
        if (d.parentNode === labelLayer) labelLayer.removeChild(d);
      }
      starGeom.dispose();
      starMat.dispose();
      sphereGeom.dispose();
      (centralCore.material as THREE.Material).dispose();
      (centralGlow.material as THREE.Material).dispose();
      glowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount)
        mount.removeChild(renderer.domElement);
      simRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden text-white">
      {/* deep-space backdrop — always present, so it's never blank */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(130% 100% at 50% 32%, #12142c 0%, #0a0b1c 42%, #05060f 74%, #01010a 100%)",
        }}
      />
      <div ref={mountRef} className="absolute inset-0" />
      {/* DOM label layer for the just-intonation interval names */}
      <div ref={labelLayerRef} className="pointer-events-none absolute inset-0 z-10" />

      {err && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-violet-300">{err}</p>
        </div>
      )}

      {/* title + one-sentence description */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col gap-2 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Orbital Consonance
        </h1>
        <p className="max-w-xl text-base text-white/80">
          Fling stars into orbit and, when two of them fall into a small-integer{" "}
          <span className="text-amber-300/95">period resonance</span>, hear that lock
          ring out as an exact just-intonation chord — gravity becoming{" "}
          <span className="text-amber-300/95">harmony</span>.
        </p>
      </div>

      {/* notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-4 z-30 min-h-[44px] rounded-full border border-white/15 bg-black/40 px-4 py-2.5 text-base font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-black/60"
      >
        {showNotes ? "Close notes" : "Design notes"}
      </button>

      {/* live consonance readout */}
      {started && hudLocks.length > 0 && (
        <div className="pointer-events-none absolute left-5 top-28 z-20 flex flex-col gap-1.5 sm:top-32">
          <p className="text-base font-medium text-white/75">Ringing now</p>
          {hudLocks.map((l) => (
            <p key={l.key} className="text-base font-semibold text-amber-300/95">
              {l.label}
              <span className="ml-2 text-base font-normal text-white/55">
                {Math.round(l.strength * 100)}% locked
              </span>
            </p>
          ))}
        </div>
      )}

      {/* controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-5 sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {!started ? (
              <button
                onClick={begin}
                className="min-h-[44px] rounded-full bg-amber-400/25 px-6 py-2.5 text-base font-semibold text-amber-100 ring-1 ring-amber-300/40 transition hover:bg-amber-400/35"
              >
                Start the cosmos
              </button>
            ) : (
              <>
                <button
                  onClick={stop}
                  className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base text-white/90 ring-1 ring-white/15 transition hover:bg-white/20"
                >
                  Stop
                </button>
                <button
                  onClick={toggleMute}
                  className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base text-white/90 ring-1 ring-white/15 transition hover:bg-white/20"
                >
                  {muted ? "Unmute" : "Mute"}
                </button>
                <button
                  onClick={reseed}
                  className="min-h-[44px] rounded-full bg-white/10 px-4 py-2.5 text-base text-amber-200/90 ring-1 ring-white/15 transition hover:bg-amber-400/15"
                >
                  Reset orbits
                </button>
                <span className="min-h-[44px] rounded-full bg-white/5 px-4 py-2.5 text-base text-white/70 ring-1 ring-white/10">
                  Drag a star to fling · tap empty space to add · drop one star on
                  another to merge
                </span>
              </>
            )}
          </div>
          {started && (
            <p className="pointer-events-none text-base text-white/70">
              {bodyCount} bodies orbiting
            </p>
          )}
        </div>
      </div>

      {/* design notes panel */}
      {showNotes && (
        <div className="pointer-events-auto absolute inset-x-0 top-20 z-30 mx-auto max-h-[76dvh] max-w-xl overflow-y-auto rounded-2xl bg-black/75 p-5 text-base text-white/80 ring-1 ring-white/12 backdrop-blur sm:top-24">
          <p className="mb-3 text-white/95">
            Kepler dreamed the planets sounded chords —{" "}
            <em>Harmonices Mundi</em> (1619). Here that dream is literal: a handful of
            masses orbit a central star under softened Newtonian gravity, and whenever
            two of their <span className="text-amber-300/95">orbital periods</span>{" "}
            settle near a small-integer ratio, the pair is &ldquo;locked&rdquo; and
            rings out the matching{" "}
            <span className="text-amber-300/95">just-intonation interval</span>.
          </p>
          <p className="mb-3">
            Each body&apos;s period is estimated every frame from its orbital energy
            (vis-viva → semi-major axis → Kepler&apos;s third law{" "}
            <span className="text-violet-300">T&nbsp;∝&nbsp;a^(3/2)</span>). Pitch is
            tied to orbital frequency, so a <span className="text-amber-300/95">3:2</span>{" "}
            period ratio maps to an exact 3:2 frequency ratio — a perfect fifth — with no
            extra tuning. On lock we snap the ringing dyad to the pure ratio, so you hear
            the wobble resolve into consonance.
          </p>
          <p className="mb-3 text-white/80">
            <span className="text-white">Controls:</span> Start · drag a star to fling it
            into a new orbit · tap empty space to drop a new body (it enters near-circular)
            · drop one star onto another to merge them · Reset orbits · Mute · Stop.
          </p>
          <p className="mb-3 text-white/80">
            <span className="text-white">References:</span> Kepler,{" "}
            <em>Harmonices Mundi</em> (1619) &amp; the third law; the{" "}
            <span className="text-amber-300/95">Laplace resonance</span> of Io–Europa–
            Ganymede (period ratios 4:2:1); Barnes &amp; Hut, &ldquo;A hierarchical
            O(N log N) force-calculation algorithm&rdquo; (<em>Nature</em>, 1986) for
            N-body context; and just-intonation ratios (2:1, 3:2, 4:3, 5:4 …). The seeded
            opening is a Laplace-style 2:3:4 chain, so Start rings a fifth within seconds
            unattended.
          </p>
          <p className="mb-3 text-white/80">
            <span className="text-white">Honest floor:</span> N-body toys and JI
            synths each have deep prior art. The narrow-but-real novelty is the tight
            see-hear weld — measured orbital-period ratios driving live just-intonation
            locks — with three coupled subsystems (Verlet gravity sim · period-ratio
            resonance detector · JI audio engine), a named lineage, and multi-minute
            evolution as orbits precess in and out of lock.
          </p>
          <Link
            href="/dream"
            className="text-violet-300 underline-offset-4 hover:underline"
          >
            ← back to the lab
          </Link>
        </div>
      )}

      <PrototypeNav slugs={["1608-orbital-consonance"]} />
    </main>
  );
}
