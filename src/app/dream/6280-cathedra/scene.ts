// ─────────────────────────────────────────────────────────────────────────────
// scene.ts — the architectural passage (three.js), driven by the tension curve.
//
//   Real geometry the camera flies FORWARD through: two instanced colonnades of
//   columns receding to a vanishing point, instanced arches overhead, a lit
//   floor-line leading the eye, and drifting dust motes. At the far end hangs
//   an APERTURE of light. The same Frame that shapes the music shapes the space:
//
//     corridorScale → column height, colonnade width, fog openness
//     warmth/ascent → colour temperature (cool indigo → gold → rose-violet)
//     lightIntensity→ aperture size & glare, bloom strength, key-light
//     cameraSpeed   → forward scroll of the whole world
//
//   The corridor is endless: columns wrap in z around the camera, so the world
//   streams past forever and the ~4-minute arc simply cycles. All luminance
//   change is slow drift (well under 3 Hz) — the Breakthrough brightens by ramp,
//   never a flash. Raw hex is used only inside these art materials.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { mulberry32, lerp, clamp } from "./prng";
import type { Frame } from "./engine";

const BAYS = 26; // colonnade bays receding down the passage
const BAY_SPACING = 3.4; // world units between bays
const CORRIDOR_LEN = BAYS * BAY_SPACING;

// palette (art-only raw hex): cool stone-indigo → warm gold → rose-violet
const COOL = new THREE.Color(0x2b3a86);
const GOLD = new THREE.Color(0xffb24d);
const ROSE = new THREE.Color(0xc78cff);
const STONE = new THREE.Color(0x141726); // unlit column body

export class PassageScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private columns: THREE.InstancedMesh;
  private arches: THREE.InstancedMesh;
  private colGeo: THREE.CylinderGeometry;
  private archGeo: THREE.TorusGeometry;
  private colMat: THREE.MeshStandardMaterial;
  private archMat: THREE.MeshStandardMaterial;

  private floorLine: THREE.Mesh;
  private floorMat: THREE.MeshBasicMaterial;

  private aperture: THREE.Mesh;
  private apertureMat: THREE.MeshBasicMaterial;
  private glow: THREE.Sprite;
  private glowTex: THREE.Texture;

  private motes: THREE.Points;
  private moteGeo: THREE.BufferGeometry;
  private moteMat: THREE.PointsMaterial;
  private moteZ: Float32Array;

  private keyLight: THREE.PointLight;
  private ambient: THREE.AmbientLight;
  private fog: THREE.FogExp2;

  private dummy = new THREE.Object3D();
  private tint = new THREE.Color();
  private scroll = 0;
  private reduced: boolean;
  private t = 0;

  constructor(canvas: HTMLCanvasElement, seed: number, reducedMotion: boolean) {
    this.reduced = reducedMotion;
    const rng = mulberry32(seed ^ 0x1b873593);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x05060d, 1);

    this.scene = new THREE.Scene();
    this.fog = new THREE.FogExp2(0x05060d, 0.045);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 400);
    this.camera.position.set(0, 0.2, 6);

    this.ambient = new THREE.AmbientLight(0x2a2f55, 0.5);
    this.scene.add(this.ambient);
    this.keyLight = new THREE.PointLight(0xffd9a0, 1.0, 0, 1.4);
    this.keyLight.position.set(0, 1.5, -CORRIDOR_LEN * 0.5);
    this.scene.add(this.keyLight);

    // ── columns (two colonnades, instanced) ──
    this.colGeo = new THREE.CylinderGeometry(0.34, 0.4, 1, 14, 1);
    this.colMat = new THREE.MeshStandardMaterial({
      color: STONE.clone(),
      emissive: COOL.clone(),
      emissiveIntensity: 0.4,
      roughness: 0.75,
      metalness: 0.05,
    });
    this.columns = new THREE.InstancedMesh(this.colGeo, this.colMat, BAYS * 2);
    this.columns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.columns);

    // ── arches overhead (half-torus per bay) ──
    this.archGeo = new THREE.TorusGeometry(1, 0.12, 8, 26, Math.PI);
    this.archMat = new THREE.MeshStandardMaterial({
      color: STONE.clone(),
      emissive: COOL.clone(),
      emissiveIntensity: 0.35,
      roughness: 0.8,
      metalness: 0.05,
    });
    this.arches = new THREE.InstancedMesh(this.archGeo, this.archMat, BAYS);
    this.arches.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.arches);

    // ── floor-line of light leading to the aperture ──
    const floorGeo = new THREE.PlaneGeometry(0.5, CORRIDOR_LEN + 40);
    this.floorMat = new THREE.MeshBasicMaterial({
      color: COOL.clone(),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.floorLine = new THREE.Mesh(floorGeo, this.floorMat);
    this.floorLine.rotation.x = -Math.PI / 2;
    this.floorLine.position.set(0, -2.5, -CORRIDOR_LEN * 0.4);
    this.scene.add(this.floorLine);

    // ── the aperture: a bright disc + additive glow far ahead ──
    this.apertureMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.aperture = new THREE.Mesh(new THREE.CircleGeometry(4, 48), this.apertureMat);
    this.aperture.position.set(0, 0.5, -CORRIDOR_LEN * 0.7);
    this.scene.add(this.aperture);

    this.glowTex = this.makeGlowTexture();
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.9,
      }),
    );
    this.glow.scale.set(24, 24, 1);
    this.glow.position.copy(this.aperture.position);
    this.scene.add(this.glow);

    // ── dust motes ──
    const MOTES = 500;
    const pos = new Float32Array(MOTES * 3);
    this.moteZ = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      pos[i * 3] = (rng() - 0.5) * 12;
      pos[i * 3 + 1] = (rng() - 0.5) * 8;
      const z = -rng() * CORRIDOR_LEN;
      pos[i * 3 + 2] = z;
      this.moteZ[i] = z;
    }
    this.moteGeo = new THREE.BufferGeometry();
    this.moteGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.moteMat = new THREE.PointsMaterial({
      color: 0xbcd0ff,
      size: 0.06,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.motes = new THREE.Points(this.moteGeo, this.moteMat);
    this.scene.add(this.motes);

    // ── post: bloom for the sacred glare ──
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.75, 0.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.setSize(w, h);

    this.layout(1, 0); // initial static layout so the first frame reads
  }

  private makeGlowTexture(): THREE.Texture {
    const s = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = s;
    const g = cv.getContext("2d")!;
    const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.2, "rgba(255,255,255,0.6)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.18)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    return tex;
  }

  /** Position every instanced column & arch for the given openness + scroll. */
  private layout(corridorScale: number, scroll: number): void {
    const halfWidth = lerp(2.0, 3.6, clamp((corridorScale - 0.7) / 0.9, 0, 1));
    const colHeight = 8 * corridorScale;
    const archY = -2.5 + colHeight;
    const d = this.dummy;

    for (let i = 0; i < BAYS; i++) {
      // wrap z so bays stream endlessly toward the camera; the seam sits at
      // z ≈ 8 (a couple of units BEHIND the camera at z=6), never in view
      const m = ((i * BAY_SPACING - scroll) % CORRIDOR_LEN + CORRIDOR_LEN) % CORRIDOR_LEN;
      const z = 8 - m;

      // left & right columns of the bay
      for (let s = 0; s < 2; s++) {
        const x = s === 0 ? -halfWidth : halfWidth;
        d.position.set(x, -2.5 + colHeight / 2, z);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, colHeight, 1);
        d.updateMatrix();
        this.columns.setMatrixAt(i * 2 + s, d.matrix);
      }

      // arch spanning the bay
      d.position.set(0, archY, z);
      d.rotation.set(0, 0, 0);
      d.scale.set(halfWidth + 0.4, colHeight * 0.28, 1);
      d.updateMatrix();
      this.arches.setMatrixAt(i, d.matrix);
    }
    this.columns.instanceMatrix.needsUpdate = true;
    this.arches.instanceMatrix.needsUpdate = true;
  }

  /** Advance one frame from the engine's state. */
  update(frame: Frame, dt: number): void {
    this.t += dt;
    const motion = this.reduced ? 0.35 : 1;

    // forward scroll of the world (endless corridor)
    this.scroll += frame.cameraSpeed * dt * 9 * (this.reduced ? 0.6 : 1);
    this.layout(frame.corridorScale, this.scroll);

    // ── colour temperature: cool → gold → rose-violet ──
    this.tint.copy(COOL).lerp(GOLD, clamp(frame.warmth, 0, 1));
    this.tint.lerp(ROSE, clamp(frame.ascentness * 0.7, 0, 1));

    const emiss = 0.3 + frame.lightIntensity * 0.9;
    this.colMat.emissive.copy(this.tint);
    this.colMat.emissiveIntensity = emiss;
    this.archMat.emissive.copy(this.tint);
    this.archMat.emissiveIntensity = emiss * 0.9;
    this.floorMat.color.copy(this.tint);
    this.floorMat.opacity = 0.3 + frame.lightIntensity * 0.5;

    // fog opens as the light grows, and warms with the palette
    this.fog.density = lerp(0.05, 0.014, frame.lightIntensity);
    this.fog.color.copy(this.tint).multiplyScalar(0.12);
    this.renderer.setClearColor(this.fog.color, 1);

    // ── the aperture: approaches at the Breakthrough, softens in the Ascent ──
    const apDist = lerp(CORRIDOR_LEN * 0.72, CORRIDOR_LEN * 0.26, frame.breakthroughness);
    this.aperture.position.z = this.camera.position.z - apDist;
    this.glow.position.copy(this.aperture.position);
    const apScale = lerp(3, 30, frame.lightIntensity) * lerp(0.9, 1.3, frame.corridorScale - 0.7);
    this.aperture.scale.set(apScale / 4, apScale / 4, 1);
    const apColor = this.tint.clone().lerp(new THREE.Color(0xffffff), frame.lightIntensity * 0.8);
    this.apertureMat.color.copy(apColor);
    this.apertureMat.opacity = 0.2 + frame.lightIntensity * 0.8;
    (this.glow.material as THREE.SpriteMaterial).color.copy(apColor);
    this.glow.scale.set(apScale * 1.6, apScale * 1.6, 1);
    (this.glow.material as THREE.SpriteMaterial).opacity = 0.25 + frame.lightIntensity * 0.7;

    this.keyLight.color.copy(apColor);
    this.keyLight.intensity = 0.4 + frame.lightIntensity * 3.2;
    this.keyLight.position.z = this.aperture.position.z;
    this.ambient.color.copy(this.tint).multiplyScalar(0.6);

    // ── dust motes drift with the scroll ──
    const mp = this.moteGeo.attributes.position as THREE.BufferAttribute;
    const arr = mp.array as Float32Array;
    for (let i = 0; i < this.moteZ.length; i++) {
      let z = arr[i * 3 + 2] + frame.cameraSpeed * dt * 9 * (this.reduced ? 0.6 : 1);
      if (z > 9) z -= CORRIDOR_LEN;
      arr[i * 3 + 2] = z;
      arr[i * 3 + 1] += Math.sin(this.t * 0.3 + i) * 0.002 * motion;
    }
    mp.needsUpdate = true;
    this.moteMat.color.copy(this.tint).lerp(new THREE.Color(0xffffff), 0.4);
    this.moteMat.opacity = 0.25 + frame.lightIntensity * 0.4;

    // ── camera: continuous forward drift + a subtle living sway ──
    const sway = motion;
    this.camera.position.x = Math.sin(this.t * 0.23) * 0.35 * sway;
    this.camera.position.y = 0.2 + Math.sin(this.t * 0.17 + 1.3) * 0.2 * sway;
    // always look toward the light ahead …
    this.camera.lookAt(
      Math.sin(this.t * 0.19) * 0.4 * sway,
      0.4 + Math.sin(this.t * 0.11) * 0.2 * sway,
      this.aperture.position.z,
    );
    // … then add a gentle roll on top (lookAt would otherwise overwrite it)
    this.camera.rotation.z += Math.sin(this.t * 0.13) * 0.012 * sway;

    // ── bloom tracks the aperture's glare (slow ramp, never a flash) ──
    this.bloom.strength = lerp(0.45, 2.0, frame.lightIntensity);
    this.bloom.radius = lerp(0.6, 0.95, frame.lightIntensity);

    this.composer.render();
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  dispose(): void {
    this.colGeo.dispose();
    this.archGeo.dispose();
    this.colMat.dispose();
    this.archMat.dispose();
    this.columns.dispose();
    this.arches.dispose();
    this.floorLine.geometry.dispose();
    this.floorMat.dispose();
    this.aperture.geometry.dispose();
    this.apertureMat.dispose();
    (this.glow.material as THREE.SpriteMaterial).dispose();
    this.glowTex.dispose();
    this.moteGeo.dispose();
    this.moteMat.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
