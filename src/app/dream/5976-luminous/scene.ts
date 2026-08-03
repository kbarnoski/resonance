// scene.ts — the three.js world you fly through.
//
// A perspective camera glides FORWARD along the tunnel axis (positions handed
// in by journey.ts each frame). Exponential fog + a clear colour taken from the
// same fog colour give real depth; a layered stack of warm additive sprites is
// the "being of light" that grows ahead and finally floods the field. There is
// no post-processing — the bloom is just overlapping additive sprites.
//
// Renderer creation is guarded three ways (capability probe, constructor
// try/catch, context null-check); createLuminousScene returns null on failure
// so the page can fall back to an on-brand notice and audio-only.

import * as THREE from "three";
import { LIGHT_POS, type Journey } from "./journey";
import { makeMotes, makeSpriteTexture, type MoteField } from "./motes";

export interface SceneHandle {
  /** Render one frame from the journey state; returns ring-crossing bells. */
  update(dt: number, j: Journey): number;
  resize(): void;
  dispose(): void;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

// The central radiance is three nested sprites: a hot core, a warm mid, and a
// broad outer haze. Each layer's scale and opacity ride the journey light.
const LAYER_SCALE = [1.0, 2.3, 4.6];
const LAYER_OPACITY = [1.0, 0.62, 0.34];
const LAYER_COLOR = [
  new THREE.Color(1.0, 0.96, 0.86),
  new THREE.Color(1.0, 0.8, 0.46),
  new THREE.Color(1.0, 0.62, 0.32),
];

export function createLuminousScene(
  mount: HTMLElement,
  rng: () => number,
): SceneHandle | null {
  if (!hasWebGL()) return null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  if (!renderer.getContext()) {
    renderer.dispose();
    return null;
  }

  const width = mount.clientWidth || window.innerWidth;
  const height = mount.clientHeight || window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const fog = new THREE.FogExp2(0x05040f, 0.0016);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(72, width / height, 0.1, 4000);
  camera.position.set(0, 0, 0);

  const sprite = makeSpriteTexture();
  const motes: MoteField = makeMotes(scene, sprite, rng);

  // ---- the being of light: nested additive sprites ----
  const glowMats: THREE.SpriteMaterial[] = [];
  const glowSprites: THREE.Sprite[] = [];
  for (let k = 0; k < LAYER_SCALE.length; k++) {
    const mat = new THREE.SpriteMaterial({
      map: sprite,
      color: LAYER_COLOR[k],
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(LIGHT_POS);
    s.frustumCulled = false;
    scene.add(s);
    glowMats.push(mat);
    glowSprites.push(s);
  }

  return {
    update(dt: number, j: Journey): number {
      camera.position.copy(j.camPos);
      // A gentle roll comes from tilting the up-vector before lookAt.
      camera.up.set(Math.sin(j.roll), Math.cos(j.roll), 0);
      camera.lookAt(j.lookAt);

      fog.density = j.fogDensity;
      fog.color.copy(j.fogColor);
      renderer.setClearColor(j.fogColor, 1);

      for (let k = 0; k < glowSprites.length; k++) {
        const size = j.lightSize * LAYER_SCALE[k];
        glowSprites[k].scale.set(size, size, 1);
        glowMats[k].opacity = j.lightIntensity * LAYER_OPACITY[k];
      }

      const bells = motes.update(j, dt);
      renderer.render(scene, camera);
      return bells;
    },

    resize(): void {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },

    dispose(): void {
      motes.dispose();
      for (const m of glowMats) m.dispose();
      sprite.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    },
  };
}
