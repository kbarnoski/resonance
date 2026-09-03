// ─────────────────────────────────────────────────────────────────────────────
// 16752-chordnebula · scene.ts — three.js volumetric raymarched nebula.
//
//   A single fullscreen quad + a custom ShaderMaterial. The fragment shader
//   raymarches a 3D FBM density field lit FROM WITHIN by colored light-cores —
//   one per pitch-class of the chord currently sounding in Karel's recording.
//   The world flows toward the camera (the field drifts in +z, cores wrap with a
//   soft fade) so it reads as a slow voyage through cloud rather than a static
//   texture. No surface, no normals: this is genuine emission/absorption volume
//   integration (Beer–Lambert transmittance), front-to-back.
//
//   Technique after Íñigo Quílez's volumetric "Raymarching clouds"; the medium is
//   the Resonance violet brand ramp, blooming to warm cores — Refik-Anadol-style
//   latent nebula. Chord → colour mapping nods to "Chord Colourizer"
//   (arXiv 2510.10173): the root sets the hue anchor, the sounding pitch-classes
//   pick out light-cores, consonance opens luminous caverns, density darkens.
//
//   Everything is a pure function of the uniforms — no wall-clock, no RNG in the
//   shader — so a given (time, chord, energy) renders identically.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from "three";

/** Cheap capability probe — decides shader vs. on-brand fallback notice. */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
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

export interface NebulaFrame {
  /** Seconds since mount — drives the slow forward drift + evolution. */
  time: number;
  /** Overall FFT energy 0..1 — the nebula's breath (density + brightness swell). */
  energy: number;
  /** Low-band energy 0..1 — bass swells the whole medium. */
  bass: number;
  /** Mid-band energy 0..1 — body of the cloud. */
  mid: number;
  /** High-band energy 0..1 — fine sparkle detail in the FBM. */
  treble: number;
  /** Slow safe-luminance multiplier (≈1). Never a strobe. */
  bright: number;
  /** 0..1 — consonant chords carve open, luminous caverns. */
  consonance: number;
  /** 0..1 — dense/extended chords thicken + darken the medium. */
  densityBias: number;
  /** 0..1 — minor/diminished quality cools + dims the cores. */
  minor: number;
  /** 0..1 — chord-root hue anchor (offsets the whole core arc). */
  rootHue: number;
  /** 1 when a real chord is driving; 0 → neutral violet hue drift. */
  hasChord: number;
  /** Per pitch-class activation 0..1 (12), smoothed — lights the light-cores. */
  pcs: number[];
  /** Pointer / tilt look-around, radians-ish (x = yaw, y = pitch). */
  lookX: number;
  lookY: number;
}

const VERT = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec2  uRes;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uBright;
  uniform float uConsonance;
  uniform float uDensityBias;
  uniform float uMinor;
  uniform float uRootHue;
  uniform float uHasChord;
  uniform float uPc[12];
  uniform vec2  uLook;

  const int   STEPS   = 56;
  const float SPAN    = 9.0;   // march depth
  const float ABSORB  = 1.35;  // medium opacity
  const float TAU     = 6.28318530718;

  // ── value noise + FBM ──────────────────────────────────────────────────────
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  const mat3 M = mat3( 0.00, 0.80, 0.60,
                      -0.80, 0.36,-0.48,
                      -0.60,-0.48, 0.64);
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) {
      s += a * vnoise(p);
      p = M * p * 2.02;
      a *= 0.5;
    }
    return s;
  }

  // Cloud density at a world point. The field flows toward the camera in +z, so
  // the camera "drifts forward" without moving. Consonance raises the carving
  // threshold (open caverns); chord density lowers it (thick medium); the FFT
  // breath swells the whole field.
  float densityAt(vec3 p) {
    vec3 q = p + vec3(0.0, 0.0, uTime * 1.0);
    float base = fbm(q * 0.62);
    base += uTreble * 0.22 * fbm(q * 2.7 + uTime * 0.4);
    float thr = 0.50 + uConsonance * 0.14 - uDensityBias * 0.16 - uEnergy * 0.05;
    float d = smoothstep(thr, thr + 0.30, base);
    d *= 0.62 + uEnergy * 0.70 + uBass * 0.55;
    return clamp(d, 0.0, 1.0);
  }

  // Position of pitch-class core i, plus a soft window that fades it in at the far
  // end of the tunnel and back out as it passes the camera (kills pop-in).
  vec3 corePos(int i, out float win) {
    float fi = float(i);
    float ang = fi * 2.39996323 + uTime * 0.05;          // golden-angle spread
    float rad = 0.55 + 1.65 * fract(fi * 0.61803399);
    float dz  = mod(fi * 1.37 + uTime * 0.55, SPAN);      // 0..SPAN toward camera
    win = smoothstep(0.3, 2.0, dz) * (1.0 - smoothstep(SPAN - 2.2, SPAN - 0.3, dz));
    return vec3(cos(ang) * rad, sin(ang) * rad * 0.8, 0.6 - dz);
  }

  // Restricted "violet-forward, blooms to warm" ramp — no green / no full rainbow.
  vec3 corePalette(float t) {
    t = fract(t);
    vec3 a = vec3(0.28, 0.20, 0.78); // indigo
    vec3 b = vec3(0.60, 0.30, 0.96); // violet
    vec3 c = vec3(0.95, 0.34, 0.82); // magenta
    vec3 d = vec3(1.00, 0.74, 0.52); // warm light
    if (t < 0.34) return mix(a, b, t / 0.34);
    if (t < 0.67) return mix(b, c, (t - 0.34) / 0.33);
    return mix(c, d, (t - 0.67) / 0.33);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

    // Slow lateral camera drift so the voyage never sits still.
    vec3 ro = vec3(sin(uTime * 0.05) * 0.6, cos(uTime * 0.037) * 0.4, 4.2);

    // Ray, with pointer / tilt look-around.
    vec3 rd = normalize(vec3(uv, -1.4));
    float cy = cos(uLook.x), sy = sin(uLook.x);
    float cp = cos(uLook.y), sp = sin(uLook.y);
    rd.xz = mat2(cy, -sy, sy, cy) * rd.xz;
    rd.yz = mat2(cp, -sp, sp, cp) * rd.yz;

    float stepSize = SPAN / float(STEPS);
    float t = 0.2 + hash(vec3(gl_FragCoord.xy, uTime)) * stepSize; // dithered start
    float trans = 1.0;
    vec3 col = vec3(0.0);

    // Neutral hue anchor drifts slowly when there is no chord to read.
    float rootHue = mix(fract(uTime * 0.015), uRootHue, uHasChord);

    for (int s = 0; s < STEPS; s++) {
      vec3 p = ro + rd * t;
      float dens = densityAt(p);

      // Ambient in-scatter is a faint violet so the medium is never dead black.
      vec3 light = vec3(0.13, 0.09, 0.24) * (0.5 + uEnergy * 0.45);
      vec3 coreEmit = vec3(0.0);

      for (int i = 0; i < 12; i++) {
        float act = uPc[i];
        if (act < 0.004) continue;
        float win;
        vec3 cpos = corePos(i, win);
        float d2 = dot(p - cpos, p - cpos);
        float hue = fract(rootHue + float(i) / 12.0);
        vec3 cc = corePalette(hue) * mix(1.0, 0.68, uMinor);
        // wide glow lights the surrounding cloud; narrow glow is the visible core
        light    += cc * act * win * exp(-d2 * 1.3) * (1.9 + uBass * 1.4);
        coreEmit += cc * act * win * exp(-d2 * 5.5) * (2.4 + uEnergy * 1.6);
      }

      // Emission–absorption integration, front-to-back.
      vec3 emission = light * dens + coreEmit;
      col += trans * emission * stepSize;
      trans *= exp(-dens * ABSORB * stepSize);
      if (trans < 0.02) break;
      t += stepSize;
    }

    // Deep violet-black backdrop shows through wherever the cloud is thin.
    vec3 bg = mix(vec3(0.020, 0.012, 0.045), vec3(0.050, 0.028, 0.095),
                  smoothstep(-0.8, 0.9, uv.y)) * (0.7 + uEnergy * 0.4);
    col += trans * bg;

    // Slow luminance breath (safe: never a strobe), vignette, tone-map, gamma.
    col *= uBright;
    float vig = 1.0 - 0.30 * dot(uv, uv);
    col *= vig;
    col = col / (1.0 + col);
    col = pow(col, vec3(0.4545));

    gl_FragColor = vec4(col, 1.0);
  }
`;

type UniformTable = Record<string, THREE.IUniform>;

/** three.js fullscreen-quad volumetric nebula. One ShaderMaterial, one pass. */
export class NebulaScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private geometry: THREE.PlaneGeometry;
  private material: THREE.ShaderMaterial;
  private uniforms: UniformTable;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    // May throw if no GL context is available — caller catches.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
    });
    this.renderer.setClearColor(0x000000, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.uniforms = {
      uRes: { value: new THREE.Vector2(2, 2) },
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBright: { value: 1 },
      uConsonance: { value: 0.5 },
      uDensityBias: { value: 0 },
      uMinor: { value: 0 },
      uRootHue: { value: 0 },
      uHasChord: { value: 0 },
      uPc: { value: new Array<number>(12).fill(0) },
      uLook: { value: new THREE.Vector2(0, 0) },
    };

    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Size the drawing buffer. Downscaled + DPR-capped (long side ~760px) so an
   *  integrated GPU keeps 60fps; CSS stretches the canvas to fill. */
  resize(cssW: number, cssH: number, dpr: number): void {
    if (this.disposed) return;
    const scale = Math.min(1.35, dpr);
    let w = Math.max(2, Math.floor(cssW * scale));
    let h = Math.max(2, Math.floor(cssH * scale));
    const TARGET_LONG = 760;
    const long = Math.max(w, h);
    if (long > TARGET_LONG) {
      const k = TARGET_LONG / long;
      w = Math.max(2, Math.floor(w * k));
      h = Math.max(2, Math.floor(h * k));
    }
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    (this.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  render(f: NebulaFrame): void {
    if (this.disposed) return;
    const u = this.uniforms;
    u.uTime.value = f.time;
    u.uEnergy.value = f.energy;
    u.uBass.value = f.bass;
    u.uMid.value = f.mid;
    u.uTreble.value = f.treble;
    u.uBright.value = f.bright;
    u.uConsonance.value = f.consonance;
    u.uDensityBias.value = f.densityBias;
    u.uMinor.value = f.minor;
    u.uRootHue.value = f.rootHue;
    u.uHasChord.value = f.hasChord;
    u.uPc.value = f.pcs;
    (u.uLook.value as THREE.Vector2).set(f.lookX, f.lookY);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.geometry.dispose();
      this.material.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    } catch {
      /* ignore */
    }
  }
}
