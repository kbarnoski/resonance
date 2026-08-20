"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import { loadRealTrackBuffer } from "../_shared/welcomeHome";

// ─────────────────────────────────────────────────────────────────────────────
// 15536-antiphon · "Walk between his takes and stand inside his own counterpoint."
//
//   Five/six of Karel's REAL recordings are scattered across a dark cathedral
//   nave as distinct voices — two facing choir stalls (left / right), one at the
//   far altar, one behind you at the narthex. Each loops its own buffer forever,
//   HRTF-spatialized by its own PannerNode at a fixed 3D coordinate. You NAVIGATE
//   (WASD / arrow keys to walk, Q·E / ←→ to turn; a touch d-pad too) and the mix
//   is nothing but where you're standing: step toward a stall and its take
//   dominates; cross the nave and it recedes behind you.
//
//   Over that spatial field runs a slow ANTIPHONAL cycle — a call passes
//   left → right → altar → back → narthex, one voice swelling into the "call"
//   (bone→amber) while the take just behind it lingers as the "answer" in
//   oxblood. So as you move you literally walk into whoever is speaking. The
//   catalog as a corpus conversing with itself across the stone.
//
//   ZERO synthesis — every voice is one real looping recording. All audio routes
//   through the shared ear-safety master; nothing touches ctx.destination direct.
// ─────────────────────────────────────────────────────────────────────────────

// ── the six voices, in the physical order the antiphonal call travels ──────────
// (id + title comments are the VERIFIED anon-servable Welcome Home / catalog ids)
interface VoiceDef {
  id: string;
  title: string;
  where: string; // human label for the station
  pos: [number, number, number];
}
const VOICES: readonly VoiceDef[] = [
  {
    id: "d57cfae6-f234-4d24-85fe-72a8ad93a44a", // Interplay
    title: "Interplay",
    where: "left stall · front",
    pos: [-6, 2.2, -6],
  },
  {
    id: "eba95845-cdbf-41d8-9c5d-8679686811ad", // Bath
    title: "Bath",
    where: "right stall · front",
    pos: [6, 2.2, -6],
  },
  {
    id: "1f0a541e-df60-44a9-b839-5dc69a007d9f", // 2019
    title: "2019",
    where: "the altar",
    pos: [0, 3.0, -15],
  },
  {
    id: "d2eeee58-832b-4872-a4be-8fbf030b981d", // Rolling
    title: "Rolling",
    where: "right stall · rear",
    pos: [6, 2.2, 3],
  },
  {
    id: "8dafed88-4761-4dd3-a0f4-93f310441093", // Welcome Home
    title: "Welcome Home",
    where: "left stall · rear",
    pos: [-6, 2.2, 3],
  },
  {
    id: "dad56bd6-8e53-442f-bb19-75ce4cc3e11c", // Isolation
    title: "Isolation",
    where: "the narthex (behind)",
    pos: [0, 2.4, 10],
  },
] as const;
const LEN = VOICES.length;

// ── antiphonal scheduler ──────────────────────────────────────────────────────
const STEP = 5.0; // seconds the "call" dwells on each station (full loop ~30 s)
const W_AHEAD = 0.85; // how early a voice starts warming as the call approaches
const W_BEHIND = 1.7; // the answer lingers longer than the approach (call & response overlap)
const BED = 0.1; // quiet floor so the whole field is faintly alive
const CALL_PEAK = 0.88; // clamp ≤ 0.9 — the swell ceiling
const SWELL_TC = 0.4; // glacial gain time-constant (photosensitivity-safe)

// ── audio distance field (inverse model → strong proximity, whisper floor) ─────
const REF_DIST = 3.5;
const ROLLOFF = 1.1;
const MAX_DIST = 60;

// ── the nave (walk clamp + geometry) ──────────────────────────────────────────
const EYE_Y = 1.7;
const NAVE_X = 6.6; // half-width the listener may roam
const NAVE_Z_NEAR = 11;
const NAVE_Z_FAR = -13;
const ACCEL = 26; // m/s² toward input (inertial)
const DAMP = 4.2; // velocity damping per second
const MAX_SPEED = 7.5;
const TURN_RATE = 1.9; // rad/s

// ── art palette (raw hex — bone-white + oxblood on near-black warm stone) ──────
const OXBLOOD: [number, number, number] = [0.5, 0.08, 0.1];
const BONE: [number, number, number] = [0.96, 0.9, 0.78];
const AMBER: [number, number, number] = [1.0, 0.68, 0.32];
const STONE_BG = 0x0a0806;

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, k: number) {
  return a + (b - a) * k;
}
function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  k: number,
): [number, number, number] {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
// circular signed distance of j from moving pointer P, wrapped to [-LEN/2, LEN/2)
function wrapDelta(d: number) {
  let x = ((d % LEN) + LEN) % LEN;
  if (x > LEN / 2) x -= LEN;
  return x;
}

// per-voice antiphonal envelope at continuous pointer position P.
// returns { act: 0..1 loudness, warm: 0 (oxblood answer) .. 1 (bone call) }
function antiphon(j: number, P: number) {
  const delta = wrapDelta(j - P);
  const ahead = delta >= 0;
  const x = ahead ? delta / W_AHEAD : -delta / W_BEHIND;
  const act = x < 1 ? 0.5 * (1 + Math.cos(Math.PI * x)) : 0;
  const warm = clamp((delta + 0.6) / 1.0, 0, 1);
  return { act, warm };
}

// soft radial glow sprite
function drawGlowTexture(): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.5)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

interface Voice {
  def: VoiceDef;
  pos: THREE.Vector3;
  node: THREE.Mesh; // glowing sphere
  glow: THREE.Sprite;
  // audio (attached on Enter)
  src: AudioBufferSourceNode | null;
  panner: PannerNode | null;
  gain: GainNode | null;
  analyser: AnalyserNode | null;
  data: Uint8Array | null;
  amp: number;
  loaded: boolean;
  act: number; // smoothed activation for visuals + fallback map
  warm: number;
}

type Phase = "idle" | "loading" | "walking";

export default function AntiphonPage() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [webglOk, setWebglOk] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [isTouch, setIsTouch] = useState(false);
  const [hud, setHud] = useState<{ calling: string; loaded: number }>({
    calling: "—",
    loaded: 0,
  });

  // three.js
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const markerRef = useRef<THREE.Group | null>(null);
  const voicesRef = useRef<Voice[]>([]);
  const disposablesRef = useRef<{ dispose: () => void }[]>([]);

  // audio
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const enteredRef = useRef(false);

  // navigation state
  const keysRef = useRef<Set<string>>(new Set());
  const padRef = useRef<Set<string>>(new Set()); // touch d-pad
  const yawRef = useRef(0);
  const posRef = useRef(new THREE.Vector3(0, EYE_Y, 8));
  const velRef = useRef(new THREE.Vector3(0, 0, 0));

  const rafRef = useRef(0);
  const lastTsRef = useRef(0);
  const hudTickRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const reduceMotionRef = useRef(false);

  // fallback top-down map imperative handles
  const mapVoiceRefs = useRef<(SVGCircleElement | null)[]>([]);
  const mapMarkerRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      setIsTouch(window.matchMedia("(pointer: coarse)").matches);
      reduceMotionRef.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    }
  }, []);

  // ── build the cathedral (mount; alive before any audio) ─────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglOk(false);
    }

    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;

    if (renderer) {
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(STONE_BG, 1);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.touchAction = "none";
      rendererRef.current = renderer;

      scene = new THREE.Scene();
      scene.background = new THREE.Color(STONE_BG);
      scene.fog = new THREE.Fog(STONE_BG, 10, 46);
      sceneRef.current = scene;

      camera = new THREE.PerspectiveCamera(
        68,
        mount.clientWidth / mount.clientHeight,
        0.1,
        220,
      );
      camera.rotation.order = "YXZ";
      cameraRef.current = camera;

      // warm candle-light ambience; emissive nodes carry the glow
      const hemi = new THREE.HemisphereLight(0x2a1a12, 0x050302, 0.5);
      scene.add(hemi);
      const key = new THREE.PointLight(0xffb457, 0.6, 60, 2);
      key.position.set(0, 9, -14); // faint amber wash from the altar
      scene.add(key);

      // floor: dark stone plane + receding grid to a vanishing point
      const floorGeo = new THREE.PlaneGeometry(60, 90);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0d0a07,
        roughness: 0.95,
        metalness: 0.0,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0, -6);
      scene.add(floor);
      disposablesRef.current.push(floorGeo, floorMat);

      const grid = new THREE.GridHelper(80, 64, 0x4a2c1a, 0x1a120c);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.5;
      grid.position.set(0, 0.02, -6);
      scene.add(grid);
      disposablesRef.current.push(grid.geometry, grid.material as THREE.Material);

      // tall column silhouettes lining the two sides of the nave
      const colGeo = new THREE.CylinderGeometry(0.55, 0.62, 11, 12);
      const colMat = new THREE.MeshStandardMaterial({
        color: 0x140f0a,
        emissive: 0x1a120b,
        emissiveIntensity: 0.35,
        roughness: 1.0,
        metalness: 0.0,
      });
      disposablesRef.current.push(colGeo, colMat);
      for (let side = -1; side <= 1; side += 2) {
        for (let z = -16; z <= 10; z += 4) {
          const col = new THREE.Mesh(colGeo, colMat);
          col.position.set(side * 8.5, 5.5, z);
          scene.add(col);
        }
      }

      // altar slab suggested at the far end
      const altarGeo = new THREE.BoxGeometry(5, 1.1, 2.2);
      const altarMat = new THREE.MeshStandardMaterial({
        color: 0x1a1109,
        emissive: 0x2a1608,
        emissiveIntensity: 0.4,
        roughness: 0.9,
      });
      const altar = new THREE.Mesh(altarGeo, altarMat);
      altar.position.set(0, 0.55, -16.5);
      scene.add(altar);
      disposablesRef.current.push(altarGeo, altarMat);

      // "you are here" marker + facing indicator (arrow on the floor)
      const marker = new THREE.Group();
      const ringGeo = new THREE.RingGeometry(0.55, 0.75, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xf3e9d2,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      marker.add(ring);
      const arrowGeo = new THREE.ConeGeometry(0.35, 1.1, 3);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: 0xffb457,
        transparent: true,
        opacity: 0.9,
      });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.rotation.x = Math.PI / 2; // point along -Z (forward) after group yaw
      arrow.position.set(0, 0.05, -1.1);
      marker.add(arrow);
      marker.position.set(0, 0.06, 8);
      scene.add(marker);
      markerRef.current = marker;
      disposablesRef.current.push(ringGeo, ringMat, arrowGeo, arrowMat);

      // glowing voice nodes
      const glowTex = drawGlowTexture();
      disposablesRef.current.push(glowTex);
      const nodeGeo = new THREE.SphereGeometry(0.55, 20, 20);
      disposablesRef.current.push(nodeGeo);

      const voices: Voice[] = VOICES.map((def) => {
        const pos = new THREE.Vector3(...def.pos);
        const nodeMat = new THREE.MeshStandardMaterial({
          color: 0x0a0605,
          emissive: new THREE.Color(OXBLOOD[0], OXBLOOD[1], OXBLOOD[2]),
          emissiveIntensity: 0.5,
          roughness: 0.6,
          metalness: 0.1,
        });
        const node = new THREE.Mesh(nodeGeo, nodeMat);
        node.position.copy(pos);
        scene!.add(node);
        disposablesRef.current.push(nodeMat);

        const glowMat = new THREE.SpriteMaterial({
          map: glowTex,
          color: new THREE.Color(OXBLOOD[0], OXBLOOD[1], OXBLOOD[2]),
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glow = new THREE.Sprite(glowMat);
        glow.scale.set(6, 6, 1);
        glow.position.copy(pos);
        scene!.add(glow);
        disposablesRef.current.push(glowMat);

        return {
          def,
          pos,
          node,
          glow,
          src: null,
          panner: null,
          gain: null,
          analyser: null,
          data: null,
          amp: 0,
          loaded: false,
          act: 0,
          warm: 0,
        };
      });
      voicesRef.current = voices;
    } else {
      // no WebGL — still build logical voices for the fallback map + audio
      voicesRef.current = VOICES.map((def) => ({
        def,
        pos: new THREE.Vector3(...def.pos),
        node: null as unknown as THREE.Mesh,
        glow: null as unknown as THREE.Sprite,
        src: null,
        panner: null,
        gain: null,
        analyser: null,
        data: null,
        amp: 0,
        loaded: false,
        act: 0,
        warm: 0,
      }));
    }

    const onResize = () => {
      if (!renderer || !camera || !mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── the navigate / antiphon / render loop ─────────────────────────────────
    const fwd = new THREE.Vector3();
    const right = new THREE.Vector3();
    const tmp = new THREE.Vector3();

    const frame = (tsMs: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const ts = tsMs / 1000;
      if (lastTsRef.current === 0) lastTsRef.current = ts;
      let dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (!(dt > 0) || dt > 0.05) dt = 0.016;

      // 1) gather navigation input (keyboard + touch d-pad)
      const keys = keysRef.current;
      const pad = padRef.current;
      const held = (a: string, b?: string) =>
        keys.has(a) || (b !== undefined && keys.has(b));
      let mf = 0; // forward/back
      let mr = 0; // strafe
      let turn = 0;
      if (held("w", "arrowup") || pad.has("fwd")) mf += 1;
      if (held("s", "arrowdown") || pad.has("back")) mf -= 1;
      if (held("d")) mr += 1;
      if (held("a")) mr -= 1;
      if (held("q", "arrowleft") || pad.has("left")) turn += 1;
      if (held("e", "arrowright") || pad.has("right")) turn -= 1;

      // 2) turn (yaw) + inertial move
      yawRef.current += turn * TURN_RATE * dt;
      const yaw = yawRef.current;
      // forward = (sin yaw, 0, -cos yaw): yaw 0 faces the altar (-Z)
      fwd.set(Math.sin(yaw), 0, -Math.cos(yaw));
      right.set(Math.cos(yaw), 0, Math.sin(yaw));

      const vel = velRef.current;
      const acc = tmp
        .set(0, 0, 0)
        .addScaledVector(fwd, mf)
        .addScaledVector(right, mr);
      if (acc.lengthSq() > 1) acc.normalize();
      vel.addScaledVector(acc, ACCEL * dt);
      // damping
      const d = Math.exp(-DAMP * dt);
      vel.multiplyScalar(d);
      if (vel.length() > MAX_SPEED) vel.setLength(MAX_SPEED);

      const p = posRef.current;
      p.addScaledVector(vel, dt);
      // clamp inside the nave walls
      p.x = clamp(p.x, -NAVE_X, NAVE_X);
      p.z = clamp(p.z, NAVE_Z_FAR, NAVE_Z_NEAR);
      p.y = EYE_Y;

      // 3) drive the AudioListener from the walking point + facing
      const ctx = ctxRef.current;
      if (ctx && enteredRef.current) {
        const l = ctx.listener;
        const now = ctx.currentTime;
        if (l.positionX) {
          l.positionX.setTargetAtTime(p.x, now, 0.02);
          l.positionY.setTargetAtTime(p.y, now, 0.02);
          l.positionZ.setTargetAtTime(p.z, now, 0.02);
          l.forwardX.setTargetAtTime(fwd.x, now, 0.02);
          l.forwardY.setTargetAtTime(fwd.y, now, 0.02);
          l.forwardZ.setTargetAtTime(fwd.z, now, 0.02);
          l.upX.setTargetAtTime(0, now, 0.02);
          l.upY.setTargetAtTime(1, now, 0.02);
          l.upZ.setTargetAtTime(0, now, 0.02);
        } else {
          const ld = l as unknown as {
            setPosition(x: number, y: number, z: number): void;
            setOrientation(
              fx: number,
              fy: number,
              fz: number,
              ux: number,
              uy: number,
              uz: number,
            ): void;
          };
          ld.setPosition(p.x, p.y, p.z);
          ld.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
        }
      }

      // 4) antiphonal scheduler → per-voice gain swell + glow colour
      const P = ctx && enteredRef.current ? ctx.currentTime / STEP : ts / STEP;
      let callIdx = 0;
      let callBest = -1;
      const voices = voicesRef.current;
      for (let j = 0; j < voices.length; j++) {
        const v = voices[j];
        const { act, warm } = antiphon(j, P);

        // own-amplitude shimmer from the real buffer (subtle life on top)
        if (v.analyser && v.data) {
          v.analyser.getByteFrequencyData(v.data as Uint8Array<ArrayBuffer>);
          let sum = 0;
          for (let i = 0; i < v.data.length; i++) sum += v.data[i];
          v.amp = lerp(v.amp, sum / (v.data.length * 255), clamp(dt * 5, 0, 1));
        }
        v.act = lerp(v.act, act, clamp(dt * 4, 0, 1));
        v.warm = lerp(v.warm, warm, clamp(dt * 4, 0, 1));

        // antiphonal gain (the swell) — glacial time-constant, clamped ≤ 0.9
        if (v.gain && ctx) {
          const target = clamp(BED + act * (CALL_PEAK - BED), 0, 0.9);
          v.gain.gain.setTargetAtTime(target, ctx.currentTime, SWELL_TC);
        }

        if (act > callBest) {
          callBest = act;
          callIdx = j;
        }

        // visuals (skip if no WebGL)
        if (v.node && v.glow) {
          const callC = lerp3(BONE, AMBER, clamp(v.act * 0.7, 0, 1));
          const col = lerp3(OXBLOOD, callC, v.warm);
          const lit = 0.14 + v.act * 1.9 + v.amp * 0.3;
          const nm = v.node.material as THREE.MeshStandardMaterial;
          nm.emissive.setRGB(col[0], col[1], col[2]);
          nm.emissiveIntensity = lit;
          const gm = v.glow.material as THREE.SpriteMaterial;
          gm.color.setRGB(col[0], col[1], col[2]);
          gm.opacity = 0.22 + v.act * 0.75;
          const gs = 5 + v.act * 5.5 + v.amp * 1.5;
          v.glow.scale.set(gs, gs, 1);
          const s = 1 + v.act * 0.28;
          v.node.scale.setScalar(s);
        }

        // fallback map circle
        const mc = mapVoiceRefs.current[j];
        if (mc) {
          const callC = lerp3(BONE, AMBER, clamp(v.act * 0.7, 0, 1));
          const col = lerp3(OXBLOOD, callC, v.warm);
          const to255 = (x: number) => Math.round(clamp(x, 0, 1) * 255);
          mc.setAttribute(
            "fill",
            `rgb(${to255(col[0])},${to255(col[1])},${to255(col[2])})`,
          );
          mc.setAttribute("r", `${5 + v.act * 7}`);
          mc.setAttribute("opacity", `${0.35 + v.act * 0.6}`);
        }
      }

      // 5) third-person raised camera that follows the walking point
      if (renderer && scene && camera) {
        const bob = reduceMotionRef.current
          ? 0
          : Math.sin(ts * 0.5) * 0.12;
        camera.position.set(
          p.x - fwd.x * 5.2,
          EYE_Y + 3.4 + bob,
          p.z - fwd.z * 5.2,
        );
        camera.lookAt(p.x + fwd.x * 4, EYE_Y + 0.4, p.z + fwd.z * 4);

        // marker follows + faces forward
        const marker = markerRef.current;
        if (marker) {
          marker.position.set(p.x, 0.06, p.z);
          marker.rotation.y = yaw;
        }
        renderer.render(scene, camera);
      } else {
        // fallback: move the top-down marker imperatively
        const g = mapMarkerRef.current;
        if (g) {
          const mx = ((p.x + 9) / 18) * 240 + 10;
          const my = ((p.z - NAVE_Z_FAR + 3) / 30) * 300 + 10;
          g.setAttribute(
            "transform",
            `translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${(
              (yaw * 180) /
              Math.PI
            ).toFixed(1)})`,
          );
        }
      }

      // 6) throttled HUD
      hudTickRef.current++;
      if (hudTickRef.current % 15 === 0) {
        let loadedN = 0;
        for (const v of voices) if (v.loaded) loadedN++;
        setHud({ calling: voices[callIdx]?.def.title ?? "—", loaded: loadedN });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const dsp of disposablesRef.current) {
        try {
          dsp.dispose();
        } catch {
          /* noop */
        }
      }
      disposablesRef.current = [];
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      markerRef.current = null;
      voicesRef.current = [];
    };
  }, []);

  // ── keyboard navigation ─────────────────────────────────────────────────────
  useEffect(() => {
    const nav = new Set([
      "w",
      "a",
      "s",
      "d",
      "q",
      "e",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ]);
    const down = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      if (nav.has(k)) {
        keysRef.current.add(k);
        if (phaseRef.current === "walking") ev.preventDefault();
      }
    };
    const up = (ev: KeyboardEvent) => {
      keysRef.current.delete(ev.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ── touch d-pad (press & hold) ──────────────────────────────────────────────
  const padHandlers = useCallback((dir: string) => {
    const onDown = (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      padRef.current.add(dir);
    };
    const clear = (e: React.PointerEvent) => {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      padRef.current.delete(dir);
    };
    return {
      onPointerDown: onDown,
      onPointerUp: clear,
      onPointerCancel: clear,
      onPointerLeave: clear,
    };
  }, []);

  // ── Enter: start audio, load the takes, attach panners & swell gains ────────
  const enter = useCallback(async () => {
    if (phaseRef.current === "loading" || phaseRef.current === "walking") return;
    setError(null);
    setNotice(null);
    setPhase("loading");
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      let safe = safeRef.current;
      if (!safe) {
        safe = createSafeMaster(ctx);
        safeRef.current = safe;
      }
      enteredRef.current = true;
      setPhase("walking");

      let anyOk = false;
      let anyFail = false;
      for (const v of voicesRef.current) {
        if (!ctxRef.current || ctxRef.current.state === "closed") break;
        if (!enteredRef.current) break;
        try {
          const { buffer } = await loadRealTrackBuffer(ctx, v.def.id);
          if (!enteredRef.current) break;

          const src = ctx.createBufferSource();
          src.buffer = buffer;
          src.loop = true;

          const panner = ctx.createPanner();
          try {
            panner.panningModel = "HRTF";
          } catch {
            panner.panningModel = "equalpower";
          }
          panner.distanceModel = "inverse";
          panner.refDistance = REF_DIST;
          panner.rolloffFactor = ROLLOFF;
          panner.maxDistance = MAX_DIST;
          if (panner.positionX) {
            panner.positionX.value = v.pos.x;
            panner.positionY.value = v.pos.y;
            panner.positionZ.value = v.pos.z;
          } else {
            (
              panner as unknown as {
                setPosition(x: number, y: number, z: number): void;
              }
            ).setPosition(v.pos.x, v.pos.y, v.pos.z);
          }

          // per-voice antiphonal swell gain
          const gain = ctx.createGain();
          gain.gain.value = 0.0001;

          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          analyser.smoothingTimeConstant = 0.85;

          // src → panner → gain → safeMaster.input ; src → analyser (passive tap)
          src.connect(panner);
          panner.connect(gain);
          gain.connect(safe.input);
          src.connect(analyser);

          src.start();

          v.src = src;
          v.panner = panner;
          v.gain = gain;
          v.analyser = analyser;
          v.data = new Uint8Array(analyser.frequencyBinCount);
          v.loaded = true;
          anyOk = true;
        } catch {
          anyFail = true;
        }
      }

      if (!anyOk) {
        enteredRef.current = false;
        setError(
          "None of Karel's takes could load right now. Check your connection and try entering again.",
        );
        setPhase("idle");
        return;
      }
      if (anyFail) {
        setNotice(
          "Some takes couldn't load and were skipped — the rest of the choir is answering.",
        );
      }
    } catch (err) {
      enteredRef.current = false;
      setError(
        err instanceof Error
          ? `The cathedral could not open (${err.message}). Try again.`
          : "The cathedral could not open. Try again.",
      );
      setPhase("idle");
    }
  }, []);

  // ── full teardown on unmount ────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      enteredRef.current = false;
      for (const v of voicesRef.current) {
        try {
          v.src?.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.src?.disconnect();
          v.gain?.disconnect();
          v.panner?.disconnect();
          v.analyser?.disconnect();
        } catch {
          /* ctx closing */
        }
      }
      safeRef.current?.disconnect();
      safeRef.current = null;
      const ac = ctxRef.current;
      ctxRef.current = null;
      if (ac && ac.state !== "closed") void ac.close();
    };
  }, []);

  const walking = phase === "walking";

  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      {/* the 3D cathedral */}
      <div ref={mountRef} className="absolute inset-0 touch-none" />

      {/* WebGL-off fallback: DOM top-down nave map (audio + navigate stay live) */}
      {!webglOk && (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg
            width={260}
            height={320}
            viewBox="0 0 260 320"
            className="rounded-lg border border-border bg-black/60"
          >
            <rect
              x={10}
              y={10}
              width={240}
              height={300}
              fill="none"
              stroke="#4a2c1a"
              strokeWidth={1.5}
            />
            {VOICES.map((v, j) => {
              const cx = ((v.pos[0] + 9) / 18) * 240 + 10;
              const cy = ((v.pos[2] - NAVE_Z_FAR + 3) / 30) * 300 + 10;
              return (
                <g key={v.id}>
                  <circle
                    ref={(el) => {
                      mapVoiceRefs.current[j] = el;
                    }}
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill="#7a1420"
                    opacity={0.5}
                  />
                  <text
                    x={cx}
                    y={cy - 12}
                    fill="#f3e9d2"
                    fontSize={9}
                    textAnchor="middle"
                    opacity={0.7}
                  >
                    {v.title}
                  </text>
                </g>
              );
            })}
            <g ref={mapMarkerRef}>
              <circle r={5} fill="none" stroke="#f3e9d2" strokeWidth={1.5} />
              <line x1={0} y1={0} x2={0} y2={-11} stroke="#ffb457" strokeWidth={2} />
            </g>
          </svg>
        </div>
      )}

      {/* header / title */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-6">
        <header className="max-w-xl space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            15536 · antiphon · spatial call &amp; response
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Walk inside his counterpoint
          </h1>
          <p className="text-base text-muted-foreground">
            Six of Karel&apos;s real takes stand scattered across a dark
            cathedral, calling and answering each other antiphonally. Navigate
            the nave — the mix is nothing but where you&apos;re standing.
          </p>
          {walking && (
            <p className="text-sm text-primary">
              Calling now · {hud.calling} · {hud.loaded}/{LEN} takes sounding
            </p>
          )}
        </header>
      </div>

      {/* top-right: design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-6 z-30 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
      >
        Read the design notes
      </button>

      {/* bottom controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 pb-16">
        {error && <p className="max-w-2xl text-sm text-destructive">{error}</p>}
        {notice && !error && (
          <p className="max-w-2xl text-sm text-muted-foreground">{notice}</p>
        )}
        {!walking && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isTouch
              ? "Use the d-pad to walk the nave and turn toward whoever is calling."
              : "WASD or arrows to walk · Q / E (or ← →) to turn and swing the antiphony around your head."}
          </p>
        )}

        <div className="pointer-events-auto flex flex-wrap items-center gap-3">
          {!walking && (
            <button
              onClick={() => void enter()}
              disabled={phase === "loading"}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {phase === "loading" ? "Opening the doors…" : "Enter the cathedral"}
            </button>
          )}
        </div>
      </div>

      {/* touch d-pad */}
      {isTouch && walking && (
        <div className="pointer-events-auto absolute bottom-20 right-6 z-20 grid grid-cols-3 grid-rows-2 gap-1.5">
          <span />
          <button
            {...padHandlers("fwd")}
            className="flex h-12 w-12 touch-none items-center justify-center rounded-md border border-border bg-background/60 text-lg text-muted-foreground"
            aria-label="walk forward"
          >
            ↑
          </button>
          <span />
          <button
            {...padHandlers("left")}
            className="flex h-12 w-12 touch-none items-center justify-center rounded-md border border-border bg-background/60 text-lg text-muted-foreground"
            aria-label="turn left"
          >
            ↺
          </button>
          <button
            {...padHandlers("back")}
            className="flex h-12 w-12 touch-none items-center justify-center rounded-md border border-border bg-background/60 text-lg text-muted-foreground"
            aria-label="walk back"
          >
            ↓
          </button>
          <button
            {...padHandlers("right")}
            className="flex h-12 w-12 touch-none items-center justify-center rounded-md border border-border bg-background/60 text-lg text-muted-foreground"
            aria-label="turn right"
          >
            ↻
          </button>
        </div>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Six of Karel&apos;s real recordings are placed at fixed points in
                a cathedral nave — two facing choir stalls, the altar, and the
                narthex behind you. Each loops its own buffer forever, HRTF-
                spatialized by its own <code>PannerNode</code> with an inverse
                distance model. An <code>AudioListener</code> is your body:
                walking (WASD / arrows) and turning (Q·E / ← →) re-mixes his
                whole catalog in 3D around your head. Where you stand IS the mix.
              </p>
              <p>
                Over that spatial field runs a slow antiphonal cycle. A call
                passes left → right → altar → back → narthex; the leading voice
                swells (bone → amber) while the take just behind it lingers as
                the answer in oxblood, so at any moment one or two voices are
                calling and the others respond a few seconds later. The catalog
                becomes a corpus conversing with itself across the stone — not
                one take through a transform, but five-plus genuine takes in
                simultaneous relationship.
              </p>
              <p>
                Lineage: the 2026 Spatial Sound Forum (Berlin) framing of spatial
                sound as &ldquo;shaped by bodies, rooms and shared attention —
                sound as an environment, not a fixed event&rdquo;; the antiphonal
                / <em>cori spezzati</em> practice of Giovanni Gabrieli at San
                Marco in Venice (spatially separated choirs answering across the
                basilica); and Janet Cardiff&apos;s <em>The Forty Part Motet</em>,
                where each voice is its own point in space you walk among.
              </p>
              <p>
                Every voice is one of Karel&apos;s real takes — zero synthesis.
                All audio routes through the shared ear-safety master; nothing
                touches the speakers directly. Swells are glacial and luminance
                drifts slowly (no flicker), and camera bob respects
                reduced-motion.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["15536-antiphon"]} />
    </main>
  );
}
