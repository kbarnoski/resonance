// three.js choir scene: 7 additive-glow creature-orbs in a warm arc, one per
// scale degree, color-coded by the pitch->hue palette. The actively-signed orb
// blooms (scale + brightness); hand height raises the glow. Fake bloom via
// additive halo shells (no UnrealBloomPass — build-robust).

import * as THREE from "three";
import { DEGREES, DEGREE_HUE, type Degree } from "./classify";

interface Orb {
  degree: Degree;
  core: THREE.Mesh;
  halo: THREE.Mesh;
  halo2: THREE.Mesh;
  coreMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
  halo2Mat: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
  bloom: number; // 0..1 current bloom
  phase: number;
  baseY: number;
}

export class ChoirScene {
  private renderer: THREE.WebGLRenderer;
  private sceneObj: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private orbs: Orb[] = [];
  private starField: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private starGeo: THREE.BufferGeometry;
  private t0 = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x070611, 1);

    this.sceneObj = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
    this.camera.position.set(0, 0, 9);
    this.camera.lookAt(0, 0, 0);

    // Build 7 orbs along a gentle upward arc.
    const sphere = new THREE.SphereGeometry(0.42, 24, 24);
    const haloGeo = new THREE.SphereGeometry(0.7, 20, 20);
    const halo2Geo = new THREE.SphereGeometry(1.15, 18, 18);

    const n = DEGREES.length;
    for (let i = 0; i < n; i++) {
      const degree = DEGREES[i];
      const tt = n === 1 ? 0.5 : i / (n - 1);
      const ang = (tt - 0.5) * Math.PI * 0.92; // spread across an arc
      const x = Math.sin(ang) * 5.2;
      const y = -Math.cos(ang) * 1.1 + 1.0 + tt * 0.6; // gentle smile-arc, rising
      const z = -Math.cos(ang) * 1.2;

      const hue = DEGREE_HUE[degree] / 360;
      const baseColor = new THREE.Color().setHSL(hue, 0.85, 0.6);

      const coreMat = new THREE.MeshBasicMaterial({
        color: baseColor.clone(),
        transparent: true,
        opacity: 0.95,
      });
      const haloMat = new THREE.MeshBasicMaterial({
        color: baseColor.clone(),
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo2Mat = new THREE.MeshBasicMaterial({
        color: baseColor.clone(),
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const core = new THREE.Mesh(sphere, coreMat);
      const halo = new THREE.Mesh(haloGeo, haloMat);
      const halo2 = new THREE.Mesh(halo2Geo, halo2Mat);
      core.position.set(x, y, z);
      halo.position.copy(core.position);
      halo2.position.copy(core.position);

      this.sceneObj.add(core, halo, halo2);
      this.orbs.push({
        degree,
        core,
        halo,
        halo2,
        coreMat,
        haloMat,
        halo2Mat,
        baseColor,
        bloom: 0,
        phase: Math.random() * Math.PI * 2,
        baseY: y,
      });
    }

    // Soft starfield shimmer so the scene is always breathing.
    const starCount = 220;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 22;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = -4 - Math.random() * 12;
    }
    this.starGeo = new THREE.BufferGeometry();
    this.starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0x8a7fff,
      size: 0.07,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.starField = new THREE.Points(this.starGeo, this.starMat);
    this.sceneObj.add(this.starField);
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h || 16 / 9;
    this.camera.updateProjectionMatrix();
  }

  // active: the degree currently ringing (or null). heightShift 0..1 raises glow.
  // audioLevel adds a subtle full-scene pulse.
  render(active: Degree | null, heightShift: number, audioLevel: number) {
    const t = (performance.now() - this.t0) / 1000;

    for (const orb of this.orbs) {
      const isActive = orb.degree === active;
      const target = isActive ? 1 : 0;
      orb.bloom += (target - orb.bloom) * 0.18;

      const breathe = 0.5 + 0.5 * Math.sin(t * 0.8 + orb.phase);
      const idleScale = 1 + breathe * 0.04;
      const lift = isActive ? heightShift * 1.4 : 0;
      const scale = idleScale + orb.bloom * 0.9;

      orb.core.scale.setScalar(scale);
      orb.halo.scale.setScalar(scale * (1 + orb.bloom * 0.3));
      orb.halo2.scale.setScalar(scale * (1 + orb.bloom * 0.5));

      orb.core.position.y = orb.baseY + lift + breathe * 0.05;
      orb.halo.position.y = orb.core.position.y;
      orb.halo2.position.y = orb.core.position.y;

      // Brighten via HSL lightness when blooming / lifted.
      const lightness = 0.45 + breathe * 0.06 + orb.bloom * 0.4 + lift * 0.05;
      const hsl = { h: 0, s: 0, l: 0 };
      orb.baseColor.getHSL(hsl);
      const c = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(0.95, lightness));
      orb.coreMat.color.copy(c);
      orb.haloMat.color.copy(c);
      orb.halo2Mat.color.copy(c);
      orb.haloMat.opacity = 0.16 + orb.bloom * 0.45 + audioLevel * 0.1;
      orb.halo2Mat.opacity = 0.06 + orb.bloom * 0.28;
    }

    this.starField.rotation.z = t * 0.02;
    this.starMat.opacity = 0.4 + 0.15 * Math.sin(t * 0.6) + audioLevel * 0.2;

    this.renderer.render(this.sceneObj, this.camera);
  }

  dispose() {
    for (const orb of this.orbs) {
      orb.core.geometry.dispose();
      orb.halo.geometry.dispose();
      orb.halo2.geometry.dispose();
      orb.coreMat.dispose();
      orb.haloMat.dispose();
      orb.halo2Mat.dispose();
    }
    this.starGeo.dispose();
    this.starMat.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
