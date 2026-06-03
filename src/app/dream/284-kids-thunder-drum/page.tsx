"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ── modal physics constants ────────────────────────────────────────────────────
// Ideal circular-membrane eigenmode ratios (Bessel zeros, relative to f0).
// (0,1),(1,1),(2,1),(0,2),(3,1),(1,2),(4,1),(2,2)
const MODE_RATIOS = [1.0, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156, 3.5];

// Per-mode base decay time-constants (seconds). Higher modes decay FASTER —
// this is what makes it read as a struck skin and not a chime.
const MODE_DECAY = [0.85, 0.55, 0.4, 0.34, 0.27, 0.22, 0.18, 0.15];

// Drum zones tuned to a consonant-but-NON-pentatonic just-intonation spread.
// Ratios over a 110 Hz root: unison, just fourth (4/3), just fifth (3/2), octave (2/1).
// (Deliberately NOT C-major pentatonic — these are membrane fundamentals.)
const ROOT_HZ = 110;
const ZONES = [
  { f0: ROOT_HZ * 1.0, color: new THREE.Color("#ff4d6d") }, // rose
  { f0: ROOT_HZ * 1.3333, color: new THREE.Color("#ffb04d") }, // amber
  { f0: ROOT_HZ * 1.5, color: new THREE.Color("#4dd8ff") }, // cyan
  { f0: ROOT_HZ * 2.0, color: new THREE.Color("#b07bff") }, // violet
];

interface Ripple {
  cx: number; // strike pos in mesh local plane (-1..1)
  cy: number;
  t0: number; // start time (audioCtx.currentTime based on perf.now)
  strength: number;
  zoneColor: THREE.Color;
}

export default function ThunderDrumPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showHint, setShowHint] = useState(true);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── three.js setup ──────────────────────────────────────────────────────────
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglFailed(true);
      return;
    }
    if (!renderer.getContext()) {
      setWebglFailed(true);
      return;
    }

    let width = mount.clientWidth || window.innerWidth;
    let height = mount.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x07060a, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3.4, 4.6);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 5, 3);
    scene.add(key);
    const rim = new THREE.PointLight(0x4dd8ff, 0.6, 30);
    rim.position.set(-3, 2, -2);
    scene.add(rim);

    // Circular drum-skin mesh (a high-res disc we displace vertically).
    const SKIN_SEG = 96;
    const SKIN_RADIUS = 2.2;
    const skinGeo = new THREE.CircleGeometry(SKIN_RADIUS, SKIN_SEG, 0, Math.PI * 2);
    // store rest positions of each vertex (x,y in plane) for ripple math
    const posAttr = skinGeo.attributes.position as THREE.BufferAttribute;
    const restXY = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      restXY[i * 2] = posAttr.getX(i);
      restXY[i * 2 + 1] = posAttr.getY(i);
    }

    const skinMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1c2740"),
      emissive: new THREE.Color("#0a1224"),
      emissiveIntensity: 0.6,
      metalness: 0.35,
      roughness: 0.45,
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const skin = new THREE.Mesh(skinGeo, skinMat);
    skin.rotation.x = -Math.PI / 2; // lay flat, slight tilt via camera
    scene.add(skin);

    // Rim ring for a "drum shell" look.
    const ringGeo = new THREE.TorusGeometry(SKIN_RADIUS, 0.09, 16, 96);
    const ringMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#2a3350"),
      metalness: 0.6,
      roughness: 0.4,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);

    // Strike-flash sprites (expanding glow rings) pooled.
    const FLASH_POOL = 12;
    const flashes: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t0: number; active: boolean }[] = [];
    for (let i = 0; i < FLASH_POOL; i++) {
      const g = new THREE.RingGeometry(0.05, 0.18, 48);
      const m = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      flashes.push({ mesh, mat: m, t0: 0, active: false });
    }

    // ── audio engine (deferred unlock) ───────────────────────────────────────────
    let audioCtx: AudioContext | null = null;
    let master: GainNode | null = null;
    let limiter: DynamicsCompressorNode | null = null;
    let dronePartials: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode; lfoGain: GainNode }[] = [];

    function ensureAudio() {
      if (audioCtx) {
        if (audioCtx.state === "suspended") void audioCtx.resume();
        return;
      }
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();

      limiter = audioCtx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;

      master = audioCtx.createGain();
      master.gain.value = 0.0;
      master.gain.setTargetAtTime(0.85, audioCtx.currentTime, 0.4);

      master.connect(limiter);
      limiter.connect(audioCtx.destination);

      // Soft always-on ambient drone: two low partials a fifth apart, slowly beating.
      const droneNotes = [ROOT_HZ * 0.5, ROOT_HZ * 0.75];
      droneNotes.forEach((freq, idx) => {
        const osc = audioCtx!.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const gain = audioCtx!.createGain();
        gain.gain.value = 0.0;
        gain.gain.setTargetAtTime(idx === 0 ? 0.05 : 0.035, audioCtx!.currentTime, 1.2);
        // gentle vibrato so the pad breathes
        const lfo = audioCtx!.createOscillator();
        lfo.frequency.value = 0.07 + idx * 0.03;
        const lfoGain = audioCtx!.createGain();
        lfoGain.gain.value = freq * 0.004;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        osc.connect(gain);
        gain.connect(master!);
        osc.start();
        lfo.start();
        dronePartials.push({ osc, gain, lfo, lfoGain });
      });
    }

    // Strike one modal voice. radius 0=center..1=rim controls timbre;
    // velocity 0..1 controls the non-linear tension pitch-glide.
    function strikeVoice(f0: number, radius: number, velocity: number) {
      if (!audioCtx || !master) return;
      const ctx = audioCtx;
      const now = ctx.currentTime;

      // tension nonlinearity: detune ALL partials up at attack, relax to rest.
      const bend = 1 + 0.06 * velocity; // up to +6% sharp on a hard hit
      const glideTime = 0.12 + 0.14 * velocity; // 120..260 ms relax

      // per-strike voice bus for click-free overall envelope
      const voiceGain = ctx.createGain();
      voiceGain.gain.value = 0.0;
      const peak = 0.18 + 0.22 * velocity;
      voiceGain.gain.setTargetAtTime(peak, now, 0.004);
      voiceGain.connect(master);

      const oscs: OscillatorNode[] = [];
      let maxDecay = 0;
      MODE_RATIOS.forEach((ratio, i) => {
        const restFreq = f0 * ratio;
        if (restFreq > 16000) return;

        // strike-position → per-partial gain.
        // center (radius~0) → low axisymmetric modes loud; rim (radius~1) → highs loud.
        const modeBright = i / (MODE_RATIOS.length - 1); // 0 low .. 1 high
        const centerWeight = 1 - modeBright; // favored near center
        const rimWeight = 0.25 + 0.9 * modeBright; // favored near rim
        const posGain = centerWeight * (1 - radius) + rimWeight * radius;

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(restFreq * bend, now);
        osc.frequency.setTargetAtTime(restFreq, now + 0.001, glideTime / 3);

        const g = ctx.createGain();
        const amp = posGain / (1 + i * 0.5); // higher partials quieter overall
        g.gain.setValueAtTime(amp, now);
        const decay = MODE_DECAY[i] * (0.85 + 0.3 * (1 - velocity)); // soft hits ring a touch longer
        maxDecay = Math.max(maxDecay, decay);
        g.gain.setTargetAtTime(0.0001, now + 0.002, decay);

        osc.connect(g);
        g.connect(voiceGain);
        osc.start(now);
        oscs.push(osc);
      });

      const tail = now + maxDecay * 6 + 0.2;
      voiceGain.gain.setTargetAtTime(0.0001, now + maxDecay * 4, maxDecay);
      oscs.forEach((o) => o.stop(tail));
      // disconnect voice bus after it finishes
      window.setTimeout(() => {
        try {
          voiceGain.disconnect();
        } catch {
          /* already gone */
        }
      }, (tail - now) * 1000 + 100);
    }

    // ── strike timing for pseudo-velocity ─────────────────────────────────────────
    const pointerLast = new Map<number, number>();
    let lastStrikeTime = 0;

    // map a screen click to the drum plane → returns {hit, localX, localY, radius, zone}
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function strikeAtScreen(clientX: number, clientY: number, velocity: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(skin, false);
      if (hits.length === 0) return;
      const p = hits[0].point; // world space; skin is at y~0 centered at origin
      const lx = p.x / SKIN_RADIUS; // -1..1
      const ly = p.z / SKIN_RADIUS; // -1..1 (z because skin is rotated flat)
      const r = Math.min(1, Math.sqrt(lx * lx + ly * ly));

      // choose drum zone by angle quadrant (4 zones around the head)
      let angle = Math.atan2(ly, lx); // -PI..PI
      if (angle < 0) angle += Math.PI * 2;
      const zoneIdx = Math.floor((angle / (Math.PI * 2)) * ZONES.length) % ZONES.length;
      const zone = ZONES[zoneIdx];

      strikeVoice(zone.f0, r, velocity);

      // visual ripple + flash
      ripples.push({
        cx: lx,
        cy: ly,
        t0: performance.now() / 1000,
        strength: 0.18 + 0.32 * velocity,
        zoneColor: zone.color,
      });
      if (ripples.length > 18) ripples.shift();

      const flash = flashes.find((f) => !f.active) ?? flashes[0];
      flash.active = true;
      flash.t0 = performance.now() / 1000;
      flash.mat.color.copy(zone.color);
      flash.mesh.position.set(p.x, 0.02, p.z);
      flash.mesh.visible = true;
      flash.mesh.scale.setScalar(0.5 + velocity * 0.5);
    }

    const ripples: Ripple[] = [];

    function onPointerDown(e: PointerEvent) {
      ensureAudio();
      if (showHintRef.current) {
        showHintRef.current = false;
        setShowHint(false);
      }
      const tNow = performance.now();
      // pseudo-velocity from inter-tap interval (fast drum-roll = harder)
      const dt = tNow - lastStrikeTime;
      lastStrikeTime = tNow;
      let vel = 0.55;
      if (dt < 600) vel = Math.min(1, 0.55 + (600 - dt) / 700);
      pointerLast.set(e.pointerId, tNow);
      strikeAtScreen(e.clientX, e.clientY, vel);
    }

    function onPointerMove(e: PointerEvent) {
      if (!pointerLast.has(e.pointerId)) return;
      // dragging across the skin = continuous soft strikes (drum-roll feel)
      const tNow = performance.now();
      const prev = pointerLast.get(e.pointerId) ?? tNow;
      if (tNow - prev < 70) return;
      pointerLast.set(e.pointerId, tNow);
      strikeAtScreen(e.clientX, e.clientY, 0.35);
    }

    function onPointerUp(e: PointerEvent) {
      pointerLast.delete(e.pointerId);
    }

    const showHintRef = { current: true };

    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);

    // ── render loop ──────────────────────────────────────────────────────────────
    let raf = 0;
    const clock = new THREE.Clock();

    function applyRipples() {
      const t = performance.now() / 1000;
      const pos = skinGeo.attributes.position as THREE.BufferAttribute;
      const count = pos.count;
      // base "breathing" so it's alive at rest
      const breathe = Math.sin(t * 0.9) * 0.018;

      for (let i = 0; i < count; i++) {
        const rx = restXY[i * 2];
        const ry = restXY[i * 2 + 1];
        const rNorm = Math.sqrt(rx * rx + ry * ry) / SKIN_RADIUS;
        // membrane is pinned at the rim → displacement tapers to 0 at edge
        const pin = Math.cos((rNorm * Math.PI) / 2);
        let z = breathe * pin * (0.5 + 0.5 * Math.cos(rNorm * Math.PI));

        for (let k = 0; k < ripples.length; k++) {
          const rp = ripples[k];
          const age = t - rp.t0;
          if (age < 0 || age > 1.6) continue;
          const dx = rx - rp.cx * SKIN_RADIUS;
          const dy = ry - rp.cy * SKIN_RADIUS;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // travelling radial wave that decays in time and space
          const speed = 3.4;
          const phase = (dist - speed * age) * 5.0;
          const envT = Math.exp(-age * 2.4);
          const envR = Math.exp(-dist * 0.5);
          z += Math.cos(phase) * rp.strength * envT * envR * pin;
        }
        pos.setZ(i, z);
      }
      pos.needsUpdate = true;
      skinGeo.computeVertexNormals();

      // tint skin emissive toward most-recent active ripple color
      if (ripples.length) {
        const recent = ripples[ripples.length - 1];
        const age = t - recent.t0;
        const mix = Math.max(0, 1 - age * 1.5) * 0.5;
        skinMat.emissive.lerpColors(new THREE.Color("#0a1224"), recent.zoneColor, mix);
        skinMat.emissiveIntensity = 0.6 + mix * 1.4;
      }
    }

    function runFlashes() {
      const t = performance.now() / 1000;
      for (const f of flashes) {
        if (!f.active) continue;
        const age = t - f.t0;
        const life = 0.6;
        if (age > life) {
          f.active = false;
          f.mesh.visible = false;
          f.mat.opacity = 0;
          continue;
        }
        const k = age / life;
        f.mesh.scale.setScalar(0.4 + k * 3.2);
        f.mat.opacity = (1 - k) * 0.8;
      }
    }

    function animate() {
      raf = requestAnimationFrame(animate);
      clock.getDelta();
      applyRipples();
      runFlashes();
      skin.rotation.z += 0.0008; // very slow life
      renderer.render(scene, camera);
    }
    animate();

    // ── resize ───────────────────────────────────────────────────────────────────
    function onResize() {
      width = mount!.clientWidth || window.innerWidth;
      height = mount!.clientHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener("resize", onResize);

    // hint auto-fade
    const hintTimer = window.setTimeout(() => {
      showHintRef.current = false;
      setShowHint(false);
    }, 5000);

    // ── teardown ─────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(hintTimer);
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);

      if (audioCtx) {
        dronePartials.forEach(({ osc, lfo, gain, lfoGain }) => {
          try {
            osc.stop();
            lfo.stop();
            osc.disconnect();
            lfo.disconnect();
            gain.disconnect();
            lfoGain.disconnect();
          } catch {
            /* noop */
          }
        });
        dronePartials = [];
        master?.disconnect();
        limiter?.disconnect();
        void audioCtx.close();
        audioCtx = null;
      }

      skinGeo.dispose();
      skinMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      flashes.forEach((f) => {
        f.mesh.geometry.dispose();
        f.mat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#07060a] text-white">
      <div ref={mountRef} className="absolute inset-0" />

      {webglFailed && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base text-rose-300">
            This drum needs WebGL, which is not available in your browser. Try a recent
            desktop or mobile browser to play the thunder-drum.
          </p>
        </div>
      )}

      {!webglFailed && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-white/95 drop-shadow">
            Thunder Drum
          </h1>
          <p
            className={`font-mono text-base text-white/75 transition-opacity duration-1000 ${
              showHint ? "opacity-100" : "opacity-0"
            }`}
          >
            Hit the drum! 🥁 Hit the edge for a bright slap, the middle for a deep boom.
          </p>
        </div>
      )}

      <a
        href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/284-kids-thunder-drum/README.md"
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-3 right-3 z-10 text-xs text-white/55 hover:text-white/80"
      >
        design notes
      </a>
    </main>
  );
}
