// render.ts — Two constellations meeting. A three.js Points starfield where
// each triggered grain blooms a star: warm amber/rose for YOU (player 0), cool
// cyan/violet for THEM (player 1 / ghost). Degrades to a Canvas2D field if
// WebGL is unavailable; audio keeps working either way.

import * as THREE from "three";

export interface Bloom {
  /** Screen position, 0..1 (x left→right, y top→bottom). */
  x: number;
  y: number;
  /** 0 = you (warm), 1 = them (cool). */
  who: 0 | 1;
  /** Birth time (s). */
  born: number;
  /** Initial intensity 0..1 (from grain energy). */
  energy: number;
}

export interface Renderer {
  kind: "webgl" | "canvas2d";
  /** Register a bloom at a screen position. */
  bloom: (b: Bloom) => void;
  /** Advance + draw one frame. `t` is seconds. */
  frame: (t: number) => void;
  resize: (w: number, h: number) => void;
  destroy: () => void;
}

const MAX_STARS = 1400;
const LIFE = 2.6; // star lifetime, seconds

// Two palettes: warm (you) and cool (them).
const WARM = new THREE.Color(0xffb066); // amber
const WARM2 = new THREE.Color(0xff5d7e); // rose
const COOL = new THREE.Color(0x4fd6ff); // cyan
const COOL2 = new THREE.Color(0xa77bff); // violet

function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

/** Make a renderer over the canvas. Tries WebGL (three.js Points), else Canvas2D. */
export function makeRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): Renderer {
  if (detectWebGL()) {
    try {
      return makeWebglRenderer(canvas, width, height);
    } catch {
      return makeCanvas2dRenderer(canvas, width, height);
    }
  }
  return makeCanvas2dRenderer(canvas, width, height);
}

// ─── WebGL: three.js Points ──────────────────────────────────────────────────

function makeWebglRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): Renderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x05060c, 1);

  const scene = new THREE.Scene();
  // Orthographic camera mapping clip space to 0..1 screen coords.
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);

  // A quiet backdrop of faint static stars so the field is never empty.
  const bgCount = 260;
  const bgPos = new Float32Array(bgCount * 3);
  const bgCol = new Float32Array(bgCount * 3);
  for (let i = 0; i < bgCount; i++) {
    bgPos[i * 3] = Math.random();
    bgPos[i * 3 + 1] = Math.random();
    bgPos[i * 3 + 2] = -1;
    const c = 0.18 + Math.random() * 0.22;
    bgCol[i * 3] = c * 0.7;
    bgCol[i * 3 + 1] = c * 0.78;
    bgCol[i * 3 + 2] = c;
  }
  const bgGeo = new THREE.BufferGeometry();
  bgGeo.setAttribute("position", new THREE.BufferAttribute(bgPos, 3));
  bgGeo.setAttribute("color", new THREE.BufferAttribute(bgCol, 3));
  const bgMat = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const bgPoints = new THREE.Points(bgGeo, bgMat);
  scene.add(bgPoints);

  // Dynamic bloom stars.
  const positions = new Float32Array(MAX_STARS * 3);
  const colors = new Float32Array(MAX_STARS * 3);
  const sizes = new Float32Array(MAX_STARS);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

  // Soft round sprite via a custom shader (additive glow).
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {},
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vColor * a, a);
      }
    `,
  });
  // enable per-vertex colors for ShaderMaterial
  (mat as unknown as { vertexColors: boolean }).vertexColors = true;
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  const blooms: Bloom[] = [];
  let w = width;
  let h = height;

  return {
    kind: "webgl",
    bloom(b: Bloom) {
      blooms.push(b);
      if (blooms.length > MAX_STARS) blooms.shift();
    },
    frame(t: number) {
      // expire dead blooms from the front
      while (blooms.length && t - blooms[0].born > LIFE) blooms.shift();
      const n = Math.min(blooms.length, MAX_STARS);
      for (let i = 0; i < n; i++) {
        const b = blooms[i];
        const age = (t - b.born) / LIFE; // 0..1
        const life = Math.max(0, 1 - age);
        // gentle drift outward as it ages
        const drift = age * 0.04;
        positions[i * 3] = b.x + (b.who === 0 ? drift : -drift);
        positions[i * 3 + 1] = 1 - b.y - drift * 0.5;
        positions[i * 3 + 2] = 0;
        const fade = life * life;
        const base = b.who === 0 ? WARM : COOL;
        const accent = b.who === 0 ? WARM2 : COOL2;
        const mix = 0.5 + 0.5 * Math.sin((b.x + b.y) * 6.0);
        const r = (base.r * (1 - mix) + accent.r * mix) * (0.4 + 0.6 * fade);
        const g = (base.g * (1 - mix) + accent.g * mix) * (0.4 + 0.6 * fade);
        const bl = (base.b * (1 - mix) + accent.b * mix) * (0.4 + 0.6 * fade);
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = bl;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        sizes[i] = (6 + b.energy * 34) * (0.5 + 0.5 * fade) * dpr;
      }
      geo.setDrawRange(0, n);
      (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      (geo.attributes.size as THREE.BufferAttribute).needsUpdate = true;

      // twinkle the backdrop subtly
      bgMat.opacity = 0.4 + 0.18 * Math.sin(t * 0.6);
      renderer.render(scene, camera);
    },
    resize(nw: number, nh: number) {
      w = nw;
      h = nh;
      void w;
      void h;
      renderer.setSize(nw, nh, false);
    },
    destroy() {
      geo.dispose();
      mat.dispose();
      bgGeo.dispose();
      bgMat.dispose();
      renderer.dispose();
    },
  };
}

// ─── Canvas2D fallback ───────────────────────────────────────────────────────

function makeCanvas2dRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): Renderer {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // last-resort no-op so audio still runs
    return {
      kind: "canvas2d",
      bloom: () => {},
      frame: () => {},
      resize: () => {},
      destroy: () => {},
    };
  }
  let w = width;
  let h = height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // faint static backdrop
  const bg: Array<{ x: number; y: number; c: number }> = [];
  for (let i = 0; i < 200; i++) {
    bg.push({ x: Math.random(), y: Math.random(), c: 0.18 + Math.random() * 0.2 });
  }

  const blooms: Bloom[] = [];

  function hex(b: Bloom, fade: number): string {
    const base = b.who === 0 ? [255, 176, 102] : [79, 214, 255];
    const acc = b.who === 0 ? [255, 93, 126] : [167, 123, 255];
    const mix = 0.5 + 0.5 * Math.sin((b.x + b.y) * 6.0);
    const r = Math.round(base[0] * (1 - mix) + acc[0] * mix);
    const g = Math.round(base[1] * (1 - mix) + acc[1] * mix);
    const bl = Math.round(base[2] * (1 - mix) + acc[2] * mix);
    return `rgba(${r},${g},${bl},${fade})`;
  }

  return {
    kind: "canvas2d",
    bloom(b: Bloom) {
      blooms.push(b);
      if (blooms.length > MAX_STARS) blooms.shift();
    },
    frame(t: number) {
      ctx.fillStyle = "#05060c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // backdrop
      const tw = 0.4 + 0.18 * Math.sin(t * 0.6);
      for (const s of bg) {
        ctx.fillStyle = `rgba(${Math.round(s.c * 180)},${Math.round(
          s.c * 200,
        )},${Math.round(s.c * 255)},${tw})`;
        ctx.fillRect(s.x * canvas.width, s.y * canvas.height, 2 * dpr, 2 * dpr);
      }
      while (blooms.length && t - blooms[0].born > LIFE) blooms.shift();
      ctx.globalCompositeOperation = "lighter";
      for (const b of blooms) {
        const age = (t - b.born) / LIFE;
        const life = Math.max(0, 1 - age);
        const fade = life * life;
        const drift = age * 0.04;
        const px = (b.x + (b.who === 0 ? drift : -drift)) * canvas.width;
        const py = (b.y + drift * 0.5) * canvas.height;
        const rad = (5 + b.energy * 30) * (0.5 + 0.5 * fade) * dpr;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, rad);
        grad.addColorStop(0, hex(b, fade));
        grad.addColorStop(1, hex(b, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    },
    resize(nw: number, nh: number) {
      w = nw;
      h = nh;
      void w;
      void h;
    },
    destroy() {
      blooms.length = 0;
    },
  };
}
