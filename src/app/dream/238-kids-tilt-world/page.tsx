"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Tilt World — roll a glowing marble across a 3D musical hill-world by TILTING
// the iPad. No tapping. The marble rolls downhill in the tilt direction, rings
// soft pentatonic notes when it passes glowing pads, and the notes pan
// left/right to where the marble is on screen.
//
// INPUT  : DeviceOrientation (beta/gamma) → acceleration; pointer-drag fallback.
// OUTPUT : three.js 3D scene (undulating landscape + marble + bloom-ish glows).
// AUDIO  : C-major-pentatonic note pads + StereoPanner + a soft ambient drone.
//
// Reference: browser accelerometer marble games — "Inertia" (kikkupico WebGL
// accelerometer marble, 2026), classic tilt-labyrinth / LocoRoco tilt-physics;
// embodied music cognition (body movement shapes pitch — Reggio Emilia).
// ─────────────────────────────────────────────────────────────────────────────

// ── world shape ──────────────────────────────────────────────────────────────
// A smooth rolling height field made of a few sine bumps. Gentle so a 4-year-old
// can keep the marble in play.
const WORLD = 18; // half-extent of the play field in world units

function heightAt(x: number, z: number): number {
  return (
    1.1 * Math.sin(x * 0.32) * Math.cos(z * 0.28) +
    0.7 * Math.sin(x * 0.18 + 1.7) +
    0.6 * Math.cos(z * 0.22 + 0.5)
  );
}

// gradient of the height field → which way is "downhill"
function gradientAt(x: number, z: number): [number, number] {
  const e = 0.05;
  const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return [gx, gz];
}

// ── note pads (C major pentatonic; bigger pad = lower pitch, BANDIMAL rule) ──
interface Pad {
  x: number;
  z: number;
  freq: number;
  color: THREE.Color;
  size: number;
  cooldownUntil: number;
}

const PAD_DEFS: { x: number; z: number; freq: number; hex: number }[] = [
  { x: -8, z: -6, freq: 130.81, hex: 0xff8a5c }, // C3  (lowest → biggest pad)
  { x: 7, z: -8, freq: 164.81, hex: 0xffd166 }, // E3
  { x: -6, z: 7, freq: 196.0, hex: 0x9ad67a }, // G3
  { x: 9, z: 6, freq: 220.0, hex: 0x6ec6ff }, // A3
  { x: 0, z: 0, freq: 261.63, hex: 0xc792ea }, // C4  (highest → smallest pad)
];

type TiltMode = "tilt" | "drag" | "asking";

export default function TiltWorldPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<TiltMode>("asking");
  const [note, setNote] = useState<string>("");

  // ── audio (created lazily on first gesture) ───────────────────────────────
  const audioRef = useRef<{
    ctx: AudioContext;
    master: GainNode;
    droneGain: GainNode;
  } | null>(null);

  const ensureAudio = useCallback(() => {
    if (audioRef.current) {
      if (audioRef.current.ctx.state === "suspended") {
        void audioRef.current.ctx.resume();
      }
      return audioRef.current;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
    master.connect(ctx.destination);

    // soft ambient drone (never silent) — two detuned sines through a slow LFO.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    droneGain.gain.setTargetAtTime(0.06, ctx.currentTime, 1.2);
    droneGain.connect(master);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    lp.connect(droneGain);
    [65.41, 98.0].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = i === 0 ? -4 : 4;
      o.connect(lp);
      o.start();
    });
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.025;
    lfo.connect(lfoGain);
    lfoGain.connect(droneGain.gain);
    lfo.start();

    audioRef.current = { ctx, master, droneGain };
    return audioRef.current;
  }, []);

  // ring a soft bell-ish pentatonic note, panned by screen-x in [-1, 1].
  const ringNote = useCallback(
    (freq: number, pan: number, gain: number) => {
      const a = audioRef.current;
      if (!a) return;
      const { ctx, master } = a;
      const now = ctx.currentTime;

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      panner.connect(master);

      const env = ctx.createGain();
      env.gain.value = 0.0001;
      env.connect(panner);

      // fundamental (triangle) + a soft sine partial for a bell shimmer.
      const o1 = ctx.createOscillator();
      o1.type = "triangle";
      o1.frequency.value = freq;
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      o2.frequency.value = freq * 2.01;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.28;
      o1.connect(env);
      o2.connect(o2g);
      o2g.connect(env);

      // gentle attack, long decay — no harsh transient.
      const peak = 0.22 * gain;
      env.gain.setTargetAtTime(peak, now, 0.012);
      env.gain.setTargetAtTime(0.0001, now + 0.09, 0.55);

      o1.start(now);
      o2.start(now);
      o1.stop(now + 2.2);
      o2.stop(now + 2.2);
      o1.onended = () => {
        panner.disconnect();
        env.disconnect();
        o2g.disconnect();
      };
    },
    []
  );

  // ── main scene + physics loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x191033, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x191033, 0.018);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
    camera.position.set(0, 16, 18);
    camera.lookAt(0, 0, 0);

    // ── lights (warm, playful) ──
    scene.add(new THREE.AmbientLight(0xffe6c0, 0.55));
    const key = new THREE.DirectionalLight(0xffd9a0, 0.9);
    key.position.set(8, 18, 6);
    scene.add(key);
    const rim = new THREE.PointLight(0x8a6bff, 0.8, 80);
    rim.position.set(-12, 8, -10);
    scene.add(rim);

    // ── terrain mesh from the height field ──
    const SEG = 90;
    const geo = new THREE.PlaneGeometry(WORLD * 2, WORLD * 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const cLow = new THREE.Color(0x4e3a8c);
    const cHigh = new THREE.Color(0x7be0c8);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, y);
      const t = THREE.MathUtils.clamp((y + 2) / 4, 0, 1);
      const c = cLow.clone().lerp(cHigh, t);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const terrain = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.05,
        flatShading: false,
      })
    );
    scene.add(terrain);

    // soft glowing wireframe overlay for a toy-ish look
    const wire = new THREE.Mesh(
      geo.clone(),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        wireframe: true,
        transparent: true,
        opacity: 0.06,
      })
    );
    scene.add(wire);

    // ── note pads ──
    const padMeshes: { pad: Pad; ring: THREE.Mesh; glow: THREE.Mesh }[] = [];
    PAD_DEFS.forEach((d, i) => {
      // bigger pad = lower pitch: index 0 is lowest → largest radius
      const size = 2.3 - i * 0.28;
      const color = new THREE.Color(d.hex);
      const y = heightAt(d.x, d.z);

      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(size, size, 0.25, 40),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.5,
          roughness: 0.4,
        })
      );
      ring.position.set(d.x, y + 0.13, d.z);
      scene.add(ring);

      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.9, 24, 24),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.position.set(d.x, y + 0.6, d.z);
      scene.add(glow);

      const pad: Pad = {
        x: d.x,
        z: d.z,
        freq: d.freq,
        color,
        size,
        cooldownUntil: 0,
      };
      padMeshes.push({ pad, ring, glow });
    });

    // ── marble ──
    const marble = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0xfff3d6,
        emissive: 0xffd27a,
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.1,
      })
    );
    scene.add(marble);
    const marbleLight = new THREE.PointLight(0xffd27a, 1.2, 14);
    scene.add(marbleLight);

    // faint glowing trail (a ring buffer of fading points)
    const TRAIL = 60;
    const trailGeo = new THREE.BufferGeometry();
    const trailPos = new Float32Array(TRAIL * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trail = new THREE.Points(
      trailGeo,
      new THREE.PointsMaterial({
        color: 0xffe0a0,
        size: 0.5,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    scene.add(trail);
    let trailWrite = 0;

    // sparkle bursts when a pad rings
    interface Spark {
      mesh: THREE.Points;
      vel: Float32Array;
      life: number;
      max: number;
    }
    const sparks: Spark[] = [];
    function spawnSparkle(px: number, py: number, pz: number, color: THREE.Color) {
      const N = 26;
      const sgeo = new THREE.BufferGeometry();
      const sp = new Float32Array(N * 3);
      const vel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        sp[i * 3] = px;
        sp[i * 3 + 1] = py;
        sp[i * 3 + 2] = pz;
        const a = Math.random() * Math.PI * 2;
        const up = 0.6 + Math.random() * 1.6;
        const sp2 = 1.5 + Math.random() * 2.5;
        vel[i * 3] = Math.cos(a) * sp2;
        vel[i * 3 + 1] = up;
        vel[i * 3 + 2] = Math.sin(a) * sp2;
      }
      sgeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
      const mesh = new THREE.Points(
        sgeo,
        new THREE.PointsMaterial({
          color,
          size: 0.6,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      scene.add(mesh);
      sparks.push({ mesh, vel, life: 0, max: 0.9 });
    }

    // ── physics state ──
    const marblePos = new THREE.Vector2(-3, -2); // x, z on the field
    const marbleVel = new THREE.Vector2(0, 0);
    // tilt input as an acceleration vector in world XZ (set by listeners below)
    const tiltAccel = new THREE.Vector2(0, 0);

    // ── input: device orientation ──
    let usingTilt = false;
    const onOrient = (e: DeviceOrientationEvent) => {
      // beta = front/back tilt (deg), gamma = left/right tilt (deg)
      if (e.beta === null || e.gamma === null) return;
      usingTilt = true;
      const gamma = THREE.MathUtils.clamp(e.gamma, -35, 35); // L/R → world X
      const beta = THREE.MathUtils.clamp(e.beta - 35, -35, 35); // F/B → world Z
      tiltAccel.set((gamma / 35) * 9, (beta / 35) * 9);
    };

    // ── input: pointer drag fallback (force toward pointer) ──
    const dragAccel = new THREE.Vector2(0, 0);
    let dragging = false;
    const canvas = renderer.domElement;
    const ndc = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitPoint = new THREE.Vector3();

    function pointerToWorld(clientX: number, clientY: number): THREE.Vector2 | null {
      const r = canvas.getBoundingClientRect();
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        return new THREE.Vector2(hitPoint.x, hitPoint.z);
      }
      return null;
    }
    const onPointerDown = (ev: PointerEvent) => {
      dragging = true;
      const w = pointerToWorld(ev.clientX, ev.clientY);
      if (w) {
        const dir = w.clone().sub(marblePos);
        dragAccel.copy(dir).clampLength(0, 1).multiplyScalar(12);
      }
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (!dragging) return;
      const w = pointerToWorld(ev.clientX, ev.clientY);
      if (w) {
        const dir = w.clone().sub(marblePos);
        dragAccel.copy(dir).clampLength(0, 1).multiplyScalar(12);
      }
    };
    const onPointerUp = () => {
      dragging = false;
      dragAccel.set(0, 0);
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    if (mode === "tilt") {
      window.addEventListener("deviceorientation", onOrient);
    }

    // ── resize ──
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    // ── animation loop ──
    const clock = new THREE.Clock();
    let raf = 0;
    const camTarget = new THREE.Vector3();
    const project = new THREE.Vector3();

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // acceleration = tilt/drag input + downhill gravity along the surface.
      const [gx, gz] = gradientAt(marblePos.x, marblePos.y);
      const gravity = 7.0; // rolls downhill
      const ax =
        (mode === "tilt" ? tiltAccel.x : dragAccel.x) - gx * gravity;
      const az =
        (mode === "tilt" ? tiltAccel.y : dragAccel.y) - gz * gravity;

      marbleVel.x += ax * dt;
      marbleVel.y += az * dt;
      // rolling friction
      marbleVel.multiplyScalar(0.965);
      // clamp speed so it never flies off for a toddler
      marbleVel.clampLength(0, 11);

      marblePos.x += marbleVel.x * dt;
      marblePos.y += marbleVel.y * dt;

      // soft walls: bounce gently at the edges
      const lim = WORLD - 1;
      if (marblePos.x > lim) {
        marblePos.x = lim;
        marbleVel.x *= -0.4;
      }
      if (marblePos.x < -lim) {
        marblePos.x = -lim;
        marbleVel.x *= -0.4;
      }
      if (marblePos.y > lim) {
        marblePos.y = lim;
        marbleVel.y *= -0.4;
      }
      if (marblePos.y < -lim) {
        marblePos.y = -lim;
        marbleVel.y *= -0.4;
      }

      const my = heightAt(marblePos.x, marblePos.y);
      marble.position.set(marblePos.x, my + 0.7, marblePos.y);
      marbleLight.position.copy(marble.position);

      // rolling visual: spin about the axis perpendicular to motion
      const speed = marbleVel.length();
      if (speed > 0.001) {
        const axis = new THREE.Vector3(marbleVel.y, 0, -marbleVel.x).normalize();
        marble.rotateOnWorldAxis(axis, speed * dt * 1.4);
      }

      // trail
      trailPos[trailWrite * 3] = marble.position.x;
      trailPos[trailWrite * 3 + 1] = marble.position.y - 0.2;
      trailPos[trailWrite * 3 + 2] = marble.position.z;
      trailWrite = (trailWrite + 1) % TRAIL;
      trailGeo.attributes.position.needsUpdate = true;

      // screen-x of marble → stereo pan
      project.copy(marble.position).project(camera);
      const screenX = THREE.MathUtils.clamp(project.x, -1, 1);

      // pad checks
      const nowMs = performance.now();
      for (const pm of padMeshes) {
        const { pad, ring, glow } = pm;
        const dx = marblePos.x - pad.x;
        const dz = marblePos.y - pad.z;
        const dist = Math.hypot(dx, dz);
        const inside = dist < pad.size + 0.6;
        if (inside && nowMs > pad.cooldownUntil) {
          pad.cooldownUntil = nowMs + 520;
          const vol = 0.5 + Math.min(speed / 9, 1) * 0.5;
          ringNote(pad.freq, screenX, vol);
          spawnSparkle(ring.position.x, ring.position.y + 0.4, ring.position.z, pad.color);
        }
        // pad pulse: brighten when active / recently rung
        const since = pad.cooldownUntil - nowMs;
        const flash = since > 0 ? since / 520 : 0;
        const mat = ring.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.45 + flash * 1.6 + Math.sin(t * 2 + pad.x) * 0.1;
        ring.position.y =
          heightAt(pad.x, pad.z) + 0.13 + flash * 0.25;
        const gmat = glow.material as THREE.MeshBasicMaterial;
        gmat.opacity = flash * 0.5;
        glow.scale.setScalar(1 + flash * 0.8);
      }

      // sparkles update
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        const sp = s.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = sp.array as Float32Array;
        for (let j = 0; j < arr.length; j += 3) {
          s.vel[j + 1] -= 4.5 * dt; // gravity
          arr[j] += s.vel[j] * dt;
          arr[j + 1] += s.vel[j + 1] * dt;
          arr[j + 2] += s.vel[j + 2] * dt;
        }
        sp.needsUpdate = true;
        const m = s.mesh.material as THREE.PointsMaterial;
        m.opacity = Math.max(0, 1 - s.life / s.max);
        if (s.life >= s.max) {
          scene.remove(s.mesh);
          s.mesh.geometry.dispose();
          (s.mesh.material as THREE.Material).dispose();
          sparks.splice(i, 1);
        }
      }

      // gentle camera follow
      camTarget.set(
        marble.position.x * 0.5,
        16,
        marble.position.z * 0.5 + 18
      );
      camera.position.lerp(camTarget, 1 - Math.pow(0.001, dt));
      camera.lookAt(marble.position.x * 0.6, my, marble.position.z * 0.6);

      // marble pulse glow
      (marble.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.55 + Math.sin(t * 3) * 0.12 + Math.min(speed / 11, 1) * 0.4;

      renderer.render(scene, camera);
    };
    tick();

    // if tilt mode but no event arrives shortly, fall back to drag.
    let fallbackTimer = 0;
    if (mode === "tilt") {
      fallbackTimer = window.setTimeout(() => {
        if (!usingTilt) {
          window.removeEventListener("deviceorientation", onOrient);
          setMode("drag");
          setNote("No tilt detected — drag the marble with your finger instead.");
        }
      }, 1800);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      renderer.dispose();
      geo.dispose();
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        if (m.material) {
          const mat = m.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
          else mat.dispose();
        }
      });
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [started, mode, ringNote]);

  // ── start handlers ─────────────────────────────────────────────────────────
  const startTilt = useCallback(async () => {
    ensureAudio();
    type OrientCtor = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
    const D = window.DeviceOrientationEvent as OrientCtor | undefined;
    if (D && typeof D.requestPermission === "function") {
      try {
        const res = await D.requestPermission();
        if (res === "granted") {
          setMode("tilt");
          setNote("");
        } else {
          setMode("drag");
          setNote("Tilt permission denied — drag the marble with your finger.");
        }
      } catch {
        setMode("drag");
        setNote("Couldn't read tilt — drag the marble with your finger.");
      }
    } else if (D) {
      // Android / desktop with sensor: just listen.
      setMode("tilt");
      setNote("");
    } else {
      setMode("drag");
      setNote("No tilt sensor here — drag the marble with your finger.");
    }
    setStarted(true);
  }, [ensureAudio]);

  const startDrag = useCallback(() => {
    ensureAudio();
    setMode("drag");
    setNote("");
    setStarted(true);
  }, [ensureAudio]);

  // cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        void audioRef.current.ctx.close();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#191033] text-foreground">
      {/* 3D mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* Start overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#191033]/95 px-6 text-center">
          <h1 className="text-4xl font-bold text-foreground sm:text-5xl">
            Tilt World
          </h1>
          <p className="max-w-md text-base text-foreground sm:text-lg">
            Tilt the iPad to roll the glowing marble across the hills. Roll it
            onto the colored pads to ring the bells.
          </p>
          <button
            onClick={startTilt}
            className="min-h-[44px] rounded-2xl bg-violet-500/30 px-8 py-4 text-xl font-semibold text-foreground ring-1 ring-violet-300/40 transition hover:bg-violet-500/45 active:scale-95"
          >
            Tilt to play
          </button>
          <button
            onClick={startDrag}
            className="min-h-[44px] rounded-xl px-4 py-2.5 text-base text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            No tilt? Drag to play instead
          </button>
        </div>
      )}

      {/* status / fallback note */}
      {started && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex flex-col items-center gap-1 px-4 pt-4 text-center">
          <p className="text-base font-medium text-foreground">
            {mode === "tilt" ? "Tilt to roll the marble" : "Drag the marble"}
          </p>
          {note && (
            <p className="max-w-sm text-base text-violet-300">{note}</p>
          )}
        </div>
      )}

      {/* design notes affordance */}
      <p className="absolute bottom-3 right-4 z-10 text-base text-muted-foreground">
        238 · tilt world
      </p>
    </main>
  );
}
