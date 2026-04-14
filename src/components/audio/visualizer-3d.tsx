"use client";

import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import {
  WaveScene, SeabedScene, CageScene,
} from "./visualizer-3d-extra";
import type { AnalyserLike } from "@/lib/audio/audio-engine";

// ─── Error boundary for WebGL context failures ───

class Canvas3DErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return <div className="absolute inset-0 bg-black" />;
    }
    return this.props.children;
  }
}

/** Create a WebGLRenderer with explicit context check to avoid Three.js null.alpha crash */
function createSafeRenderer(defaults: Record<string, unknown>): THREE.WebGLRenderer {
  const canvas = defaults.canvas as HTMLCanvasElement;
  const ctx = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!ctx) throw new Error("WebGL2 context unavailable");
  return new THREE.WebGLRenderer({ canvas, context: ctx as unknown as WebGLRenderingContext, antialias: true, alpha: false });
}

// ─── Audio data hook — reads analyser every frame ───

interface AudioData {
  bass: number;
  mid: number;
  treble: number;
  amplitude: number;
}

function useAudioData(
  _analyser: AnalyserLike,
  _dataArray: Uint8Array<ArrayBuffer>
): React.MutableRefObject<AudioData> {
  const ref = useRef<AudioData>({ bass: 0, mid: 0, treble: 0, amplitude: 0 });

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    const s = ref.current;
    s.bass = 0.3 + 0.12 * Math.sin(time * 0.13);
    s.mid = 0.25 + 0.1 * Math.sin(time * 0.17 + 1.0);
    s.treble = 0.2 + 0.08 * Math.sin(time * 0.23 + 2.0);
    s.amplitude = 0.28 + 0.1 * Math.sin(time * 0.11 + 0.5);
  });

  return ref;
}

// ─── Orb scene — audio-reactive sphere with displacement ───

const orbVertexShader = `
  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_treble;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vNormal = normal;
    float t = u_time * 0.3;
    float n1 = snoise(normal * 2.0 + t * 0.5) * (0.3 + u_bass * 1.2);
    float n2 = snoise(normal * 4.0 - t * 0.3) * (0.15 + u_mid * 0.6);
    float n3 = snoise(normal * 8.0 + t * 0.7) * (0.05 + u_treble * 0.3);
    float displacement = n1 + n2 + n3;
    vDisplacement = displacement;
    vec3 newPosition = position + normal * displacement;
    vPosition = newPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

const orbFragmentShader = `
  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_treble;
  uniform float u_amplitude;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying float vDisplacement;

  void main() {
    float t = u_time * 0.1;
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(cameraPosition - vPosition))), 2.0);
    vec3 baseColor = vec3(
      0.1 + 0.4 * sin(vDisplacement * 3.0 + t * 1.5),
      0.05 + 0.3 * sin(vDisplacement * 3.0 + t * 1.5 + 2.094),
      0.2 + 0.5 * sin(vDisplacement * 3.0 + t * 1.5 + 4.189)
    );
    vec3 glowColor = vec3(0.4 + u_bass * 0.6, 0.2 + u_mid * 0.4, 0.6 + u_treble * 0.4);
    vec3 color = mix(baseColor, glowColor, fresnel * 0.7);
    float emissive = u_amplitude * 0.5 + fresnel * 0.3;
    color += emissive * glowColor * 0.4;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function OrbScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_bass: { value: 0 }, u_mid: { value: 0 },
    u_treble: { value: 0 }, u_amplitude: { value: 0 },
  }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.u_time.value = t; u.u_bass.value = a.bass;
      u.u_mid.value = a.mid; u.u_treble.value = a.treble;
      u.u_amplitude.value = a.amplitude;
    }
    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.08;
      meshRef.current.rotation.x = Math.sin(t * 0.05) * 0.15;
      meshRef.current.scale.setScalar(1 + a.amplitude * 0.15);
    }
  });

  return (
    <>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.8, 64]} />
        <shaderMaterial ref={materialRef} vertexShader={orbVertexShader} fragmentShader={orbFragmentShader} uniforms={uniforms} />
      </mesh>
      <EffectComposer><Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.5} /></EffectComposer>
    </>
  );
}

// ─── Field scene — particle nebula (fixed: darker, less washed out) ───

function FieldScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const COUNT = 8000;

  const { positions, randoms } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33) * 6;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      rnd[i] = Math.random();
    }
    return { positions: pos, randoms: rnd };
  }, []);

  const fieldVertexShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_mid;
    uniform float u_treble;
    uniform float u_amplitude;
    attribute float aRandom;
    varying float vRandom;
    varying float vDistance;

    void main() {
      vRandom = aRandom;
      float t = u_time * 0.15;
      vec3 pos = position;
      float dist = length(pos);
      vDistance = dist;

      float angle = t * (0.2 + aRandom * 0.15) + aRandom * 6.28;
      float ca = cos(angle * 0.2);
      float sa = sin(angle * 0.2);
      pos.xz = mat2(ca, -sa, sa, ca) * pos.xz;

      float pulse = 1.0 + u_bass * 0.25 * sin(dist * 1.5 - t * 2.0);
      pos *= pulse;
      pos.y += sin(dist * 1.2 - t * 1.5 + aRandom * 6.28) * u_mid * 0.5;

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float size = (2.5 + u_amplitude * 3.0) * (0.4 + aRandom * 0.6);
      gl_PointSize = size * (250.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const fieldFragmentShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_mid;
    uniform float u_treble;
    varying float vRandom;
    varying float vDistance;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.15, d);

      float t = u_time * 0.1;

      // Deep, dark color palette — indigo/violet/teal
      vec3 innerColor = vec3(0.15 + u_bass * 0.25, 0.04, 0.35 + u_treble * 0.15);
      vec3 outerColor = vec3(0.02, 0.08 + u_mid * 0.12, 0.2);
      vec3 color = mix(innerColor, outerColor, smoothstep(0.0, 6.0, vDistance));

      float hueShift = sin(t + vRandom * 6.28) * 0.08;
      color = vec3(color.r + hueShift, color.g - hueShift * 0.3, color.b + hueShift * 0.2);

      // Moderate brightness — no washout
      color *= 0.5 + u_bass * 0.3;

      gl_FragColor = vec4(color, alpha * 0.7);
    }
  `;

  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_bass: { value: 0 }, u_mid: { value: 0 },
    u_treble: { value: 0 }, u_amplitude: { value: 0 },
  }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.u_time.value = t; u.u_bass.value = a.bass;
      u.u_mid.value = a.mid; u.u_treble.value = a.treble;
      u.u_amplitude.value = a.amplitude;
    }
    if (pointsRef.current) pointsRef.current.rotation.y = t * 0.02;
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={fieldVertexShader}
          fragmentShader={fieldFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <EffectComposer>
        <Bloom luminanceThreshold={0.25} luminanceSmoothing={0.9} intensity={1.0} />
      </EffectComposer>
    </>
  );
}

// ─── Aurora scene — flowing ribbon curtains ───

const auroraVertexShader = `
  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_treble;
  uniform float u_amplitude;
  uniform float u_ribbonIndex;
  varying vec2 vUv;
  varying float vWave;

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dot(hash(i), f),
                   dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
               mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                   dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vUv = uv;
    float t = u_time * 0.2;
    float ri = u_ribbonIndex;

    vec3 pos = position;

    // Flowing wave displacement driven by audio
    float wave1 = sin(pos.x * 1.5 + t * 2.0 + ri * 2.0) * (0.5 + u_bass * 1.5);
    float wave2 = sin(pos.x * 3.0 - t * 1.5 + ri * 1.5) * (0.2 + u_mid * 0.8);
    float wave3 = noise(vec2(pos.x * 2.0 + t, ri * 3.0)) * (0.3 + u_treble * 0.6);
    float totalWave = wave1 + wave2 + wave3;

    pos.y += totalWave;
    pos.z += sin(pos.x * 0.8 + t * 0.5 + ri * 1.2) * 0.5;

    // Vertical undulation
    pos.y += noise(vec2(pos.x * 0.5 + t * 0.3, ri)) * u_amplitude * 1.5;

    vWave = totalWave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const auroraFragmentShader = `
  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_treble;
  uniform float u_amplitude;
  uniform float u_ribbonIndex;
  varying vec2 vUv;
  varying float vWave;

  void main() {
    float t = u_time * 0.08;
    float ri = u_ribbonIndex;

    // Vertical fade — strongest in the middle of the ribbon
    float vertFade = smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);

    // Horizontal fade at edges
    float horzFade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);

    // Aurora colors — shifting greens, teals, purples
    float hue = fract(0.3 + ri * 0.15 + t * 0.1 + vWave * 0.05);
    float sat = 0.6 + u_mid * 0.2;

    vec3 color;
    // HSV to RGB inline
    float h6 = hue * 6.0;
    float f = fract(h6);
    float p = 1.0 - sat;
    float q = 1.0 - sat * f;
    float tt = 1.0 - sat * (1.0 - f);
    if (h6 < 1.0) color = vec3(1.0, tt, p);
    else if (h6 < 2.0) color = vec3(q, 1.0, p);
    else if (h6 < 3.0) color = vec3(p, 1.0, tt);
    else if (h6 < 4.0) color = vec3(p, q, 1.0);
    else if (h6 < 5.0) color = vec3(tt, p, 1.0);
    else color = vec3(1.0, p, q);

    // Brightness driven by audio
    float brightness = 0.15 + u_amplitude * 0.35 + abs(vWave) * 0.1;
    color *= brightness;

    float alpha = vertFade * horzFade * (0.25 + u_amplitude * 0.3);

    gl_FragColor = vec4(color, alpha);
  }
`;

function AuroraScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);

  const RIBBON_COUNT = 5;
  const materialsRef = useRef<THREE.ShaderMaterial[]>([]);

  const ribbonUniforms = useMemo(() => {
    return Array.from({ length: RIBBON_COUNT }, (_, i) => ({
      u_time: { value: 0 },
      u_bass: { value: 0 },
      u_mid: { value: 0 },
      u_treble: { value: 0 },
      u_amplitude: { value: 0 },
      u_ribbonIndex: { value: i },
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    materialsRef.current.forEach((mat) => {
      if (!mat) return;
      mat.uniforms.u_time.value = t;
      mat.uniforms.u_bass.value = a.bass;
      mat.uniforms.u_mid.value = a.mid;
      mat.uniforms.u_treble.value = a.treble;
      mat.uniforms.u_amplitude.value = a.amplitude;
    });
  });

  return (
    <>
      {Array.from({ length: RIBBON_COUNT }, (_, i) => (
        <mesh
          key={i}
          position={[0, -1.5 + i * 0.8, -2 - i * 0.5]}
          rotation={[0.1 + i * 0.05, 0, 0]}
        >
          <planeGeometry args={[12, 2.5, 128, 16]} />
          <shaderMaterial
            ref={(el) => { if (el) materialsRef.current[i] = el; }}
            vertexShader={auroraVertexShader}
            fragmentShader={auroraFragmentShader}
            uniforms={ribbonUniforms[i]}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      <EffectComposer>
        <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={1.8} />
      </EffectComposer>
    </>
  );
}

// ─── Galaxy scene — spiral galaxy of 10000 particles ───

function GalaxyScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const COUNT = 10000;

  const { positions, colors, randoms } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      const armIndex = i % 2; // Two spiral arms
      const t = Math.random(); // 0..1 along arm
      const radius = t * 5.0;
      const armAngle = armIndex * Math.PI + t * Math.PI * 3.0; // Spiral winding
      const scatter = (1 - t * 0.5) * 0.6; // More scatter near center

      const x = Math.cos(armAngle) * radius + (Math.random() - 0.5) * scatter * radius * 0.5;
      const z = Math.sin(armAngle) * radius + (Math.random() - 0.5) * scatter * radius * 0.5;
      const y = (Math.random() - 0.5) * 0.15 * (1 + radius * 0.1); // Thin disk

      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      // Color: inner = blue-white, outer = yellow-red
      const colorT = Math.min(radius / 5.0, 1.0);
      if (colorT < 0.3) {
        // Blue-white core
        col[i * 3] = 0.7 + Math.random() * 0.3;
        col[i * 3 + 1] = 0.7 + Math.random() * 0.3;
        col[i * 3 + 2] = 1.0;
      } else if (colorT < 0.6) {
        // Yellow mid
        col[i * 3] = 1.0;
        col[i * 3 + 1] = 0.8 + Math.random() * 0.2;
        col[i * 3 + 2] = 0.3 + Math.random() * 0.3;
      } else {
        // Red outer
        col[i * 3] = 0.8 + Math.random() * 0.2;
        col[i * 3 + 1] = 0.2 + Math.random() * 0.3;
        col[i * 3 + 2] = 0.1 + Math.random() * 0.1;
      }

      rnd[i] = Math.random();
    }
    return { positions: pos, colors: col, randoms: rnd };
  }, []);

  const galaxyVertexShader = `
    uniform float u_time;
    uniform float u_amplitude;
    attribute float aRandom;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying float vRandom;

    void main() {
      vColor = aColor;
      vRandom = aRandom;
      float t = u_time * 0.05;

      vec3 pos = position;
      float dist = length(pos.xz);
      float angle = t * (0.3 / (1.0 + dist * 0.3)) + aRandom * 0.1;
      float ca = cos(angle);
      float sa = sin(angle);
      pos.xz = mat2(ca, -sa, sa, ca) * pos.xz;

      // Subtle audio breathing
      pos *= 1.0 + u_amplitude * 0.08 * sin(dist * 0.5 + u_time * 0.3);

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float size = (1.5 + aRandom * 2.0) * (1.0 + u_amplitude * 0.3);
      gl_PointSize = size * (200.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const galaxyFragmentShader = `
    varying vec3 vColor;
    varying float vRandom;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.1, d);
      vec3 color = vColor * (0.3 + vRandom * 0.4);
      gl_FragColor = vec4(color, alpha * 0.8);
    }
  `;

  const uniforms = useMemo(() => ({
    u_time: { value: 0 },
    u_amplitude: { value: 0 },
  }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;
    if (materialRef.current) {
      materialRef.current.uniforms.u_time.value = t;
      materialRef.current.uniforms.u_amplitude.value = a.amplitude;
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y = t * 0.015;
      pointsRef.current.rotation.x = Math.sin(t * 0.02) * 0.1 + 0.5; // Tilted view
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
          <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={galaxyVertexShader}
          fragmentShader={galaxyFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.2} />
      </EffectComposer>
    </>
  );
}

// ─── Depths scene — deep underwater bioluminescent particles ───

function DepthsScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const COUNT = 3000;

  const { positions, randoms, sizes } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);
    const sz = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
      rnd[i] = Math.random();

      // Occasional larger "jellyfish" particles (5% chance)
      sz[i] = Math.random() < 0.05 ? 3.0 + Math.random() * 4.0 : 0.5 + Math.random() * 1.5;
    }
    return { positions: pos, randoms: rnd, sizes: sz };
  }, []);

  const depthsVertexShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_amplitude;
    attribute float aRandom;
    attribute float aSize;
    varying float vRandom;
    varying float vSize;

    void main() {
      vRandom = aRandom;
      vSize = aSize;
      float t = u_time * 0.08;

      vec3 pos = position;

      // Slow downward drift
      pos.y -= mod(t * (0.2 + aRandom * 0.3) + aRandom * 20.0, 10.0) - 5.0;

      // Gentle current — sideways sinusoidal drift
      pos.x += sin(t * 0.3 + pos.y * 0.4 + aRandom * 6.28) * 1.0;
      pos.z += cos(t * 0.2 + pos.y * 0.3 + aRandom * 3.14) * 0.8;

      // Audio: subtle sway
      pos.x += u_bass * 0.15 * sin(t * 0.5 + aRandom * 6.28);

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float size = aSize * (1.0 + u_amplitude * 0.4);
      gl_PointSize = size * (250.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const depthsFragmentShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_treble;
    varying float vRandom;
    varying float vSize;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.05, d);

      float t = u_time * 0.1;

      // Bioluminescent blue-green-cyan palette
      float pulse = 0.5 + 0.5 * sin(t * 2.0 + vRandom * 6.28);
      vec3 color;
      if (vSize > 2.0) {
        // Jellyfish: brighter teal-cyan
        color = vec3(0.0, 0.3 + pulse * 0.3, 0.4 + pulse * 0.4);
        alpha *= 0.6 + u_treble * 0.2;
      } else {
        // Regular particles: dim blue-green
        color = vec3(0.0, 0.08 + vRandom * 0.12, 0.15 + vRandom * 0.1);
        alpha *= 0.4 + u_bass * 0.15;
      }

      color *= 0.4 + pulse * 0.3;

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_bass: { value: 0 },
    u_treble: { value: 0 }, u_amplitude: { value: 0 },
  }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.u_time.value = t; u.u_bass.value = a.bass;
      u.u_treble.value = a.treble; u.u_amplitude.value = a.amplitude;
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y = t * 0.008;
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
          <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={depthsVertexShader}
          fragmentShader={depthsFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.95} intensity={1.8} />
      </EffectComposer>
    </>
  );
}

// ─── Bonfire scene — fire particle system ───

function BonfireScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const COUNT = 5000;

  const { positions, randoms, lifetimes } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);
    const life = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      // Start near base with slight spread
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.4;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = Math.random() * 4.0 - 1.5; // Vertical distribution
      pos[i * 3 + 2] = Math.sin(angle) * r;
      rnd[i] = Math.random();
      life[i] = Math.random(); // Phase offset for lifecycle
    }
    return { positions: pos, randoms: rnd, lifetimes: life };
  }, []);

  const bonfireVertexShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_amplitude;
    attribute float aRandom;
    attribute float aLifetime;
    varying float vHeight;
    varying float vRandom;

    void main() {
      vRandom = aRandom;
      float t = u_time;
      float cycleTime = 3.0 + aRandom * 2.0; // Each particle has its own cycle duration
      float phase = mod(t * 0.4 + aLifetime * cycleTime, cycleTime) / cycleTime; // 0..1 lifecycle

      vec3 pos = position;

      // Rise from center, expanding slightly
      float height = phase * 4.0 - 1.5;
      pos.y = height;
      float spread = phase * (0.8 + aRandom * 0.6);
      float angle = aRandom * 6.2831 + t * 0.2 * (aRandom - 0.5);
      pos.x = cos(angle) * spread * 0.5;
      pos.z = sin(angle) * spread * 0.5;

      // Horizontal drift (wind)
      pos.x += sin(t * 0.3 + aRandom * 6.28) * phase * 0.3;
      pos.z += cos(t * 0.25 + aRandom * 3.14) * phase * 0.2;

      // Audio: bass intensifies fire
      pos.y += u_bass * 0.3 * (1.0 - phase);

      vHeight = phase;

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float fade = smoothstep(0.0, 0.1, phase) * smoothstep(1.0, 0.6, phase);
      float size = (2.0 + aRandom * 2.5) * fade * (1.0 + u_amplitude * 0.4);
      gl_PointSize = size * (200.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const bonfireFragmentShader = `
    uniform float u_time;
    uniform float u_bass;
    varying float vHeight;
    varying float vRandom;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.05, d);

      // Color gradient: white-yellow base -> orange mid -> red top -> fade
      vec3 color;
      if (vHeight < 0.15) {
        // Hot white-yellow base
        color = vec3(1.0, 0.95, 0.7);
      } else if (vHeight < 0.4) {
        float t = (vHeight - 0.15) / 0.25;
        color = mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.5, 0.05), t);
      } else if (vHeight < 0.7) {
        float t = (vHeight - 0.4) / 0.3;
        color = mix(vec3(1.0, 0.5, 0.05), vec3(0.7, 0.1, 0.02), t);
      } else {
        float t = (vHeight - 0.7) / 0.3;
        color = mix(vec3(0.7, 0.1, 0.02), vec3(0.2, 0.02, 0.0), t);
      }

      // Bass intensifies brightness
      color *= 0.6 + u_bass * 0.4;

      float fadeOut = smoothstep(1.0, 0.5, vHeight);
      alpha *= fadeOut * 0.7;

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_bass: { value: 0 }, u_amplitude: { value: 0 },
  }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.u_time.value = t; u.u_bass.value = a.bass;
      u.u_amplitude.value = a.amplitude;
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
          <bufferAttribute attach="attributes-aLifetime" args={[lifetimes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={bonfireVertexShader}
          fragmentShader={bonfireFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.5} />
      </EffectComposer>
    </>
  );
}

// ─── Crystal scene — cluster of elongated crystal shapes ───

function CrystalScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<THREE.Mesh[]>([]);
  const wireRefs = useRef<THREE.Mesh[]>([]);

  const CRYSTAL_COUNT = 10;

  const crystalData = useMemo(() => {
    return Array.from({ length: CRYSTAL_COUNT }, (_, i) => {
      const angle = (i / CRYSTAL_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 0.3 + Math.random() * 1.0;
      return {
        position: [
          Math.cos(angle) * dist,
          (Math.random() - 0.5) * 0.8,
          Math.sin(angle) * dist,
        ] as [number, number, number],
        rotation: [
          (Math.random() - 0.5) * 0.6,
          Math.random() * Math.PI,
          (Math.random() - 0.5) * 0.3,
        ] as [number, number, number],
        scaleY: 1.5 + Math.random() * 2.0,
        scaleXZ: 0.15 + Math.random() * 0.2,
        hue: 0.7 + Math.random() * 0.2, // Amethyst to sapphire range (0.7 - 0.9)
      };
    });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.06;
      groupRef.current.rotation.x = Math.sin(t * 0.03) * 0.1;
    }

    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const cd = crystalData[i];
      const mat = mesh.material as THREE.MeshPhysicalMaterial;
      const hue = (cd.hue + Math.sin(t * 0.1 + i) * 0.05 + a.mid * 0.05) % 1;
      mat.color.setHSL(hue, 0.5, 0.3 + a.amplitude * 0.15);
      mat.emissive.setHSL(hue, 0.8, 0.05 + a.treble * 0.1);

      // Subtle crystal "breathing"
      const breathe = 1.0 + Math.sin(t * 0.5 + i * 0.8) * 0.03 + a.bass * 0.04;
      mesh.scale.set(cd.scaleXZ * breathe, cd.scaleY * breathe, cd.scaleXZ * breathe);
    });

    wireRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const cd = crystalData[i];
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const hue = (cd.hue + Math.sin(t * 0.1 + i) * 0.05) % 1;
      mat.color.setHSL(hue, 0.6, 0.4 + a.amplitude * 0.2);

      const breathe = 1.0 + Math.sin(t * 0.5 + i * 0.8) * 0.03 + a.bass * 0.04;
      mesh.scale.set(cd.scaleXZ * breathe, cd.scaleY * breathe, cd.scaleXZ * breathe);
    });
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[3, 3, 3]} intensity={1.5} color="#aaccff" />
      <pointLight position={[-2, -1, 2]} intensity={0.8} color="#ffaadd" />
      <group ref={groupRef}>
        {crystalData.map((cd, i) => (
          <group key={i} position={cd.position} rotation={cd.rotation}>
            {/* Solid crystal body */}
            <mesh ref={(el) => { if (el) meshRefs.current[i] = el; }}>
              <boxGeometry args={[1, 1, 1, 1, 1, 1]} />
              <meshPhysicalMaterial
                transparent
                opacity={0.35}
                roughness={0.1}
                metalness={0.2}
                clearcoat={1.0}
                clearcoatRoughness={0.05}
              />
            </mesh>
            {/* Wireframe overlay */}
            <mesh ref={(el) => { if (el) wireRefs.current[i] = el; }}>
              <boxGeometry args={[1, 1, 1, 1, 1, 1]} />
              <meshBasicMaterial wireframe transparent opacity={0.4} />
            </mesh>
          </group>
        ))}
      </group>
      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={2.0} />
      </EffectComposer>
    </>
  );
}

// ─── Swarm scene — murmuration of 6000 particles ───

function SwarmScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const COUNT = 6000;

  const { positions, randoms, phases } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);
    const phs = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.5) * 3.0;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      rnd[i] = Math.random();
      phs[i] = Math.random() * Math.PI * 2;
    }
    return { positions: pos, randoms: rnd, phases: phs };
  }, []);

  const swarmVertexShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_mid;
    uniform float u_amplitude;
    attribute float aRandom;
    attribute float aPhase;
    varying float vRandom;
    varying float vDensity;

    void main() {
      vRandom = aRandom;
      float t = u_time * 0.15;

      vec3 pos = position;
      float dist = length(pos);

      // Murmuration: smooth swirling paths
      // Multiple overlapping rotations create organic flocking motion
      float a1 = t * 0.6 + aPhase;
      float a2 = t * 0.4 + aPhase * 1.5;
      float a3 = t * 0.25 + aRandom * 6.28;

      // Rotate in XZ
      float ca1 = cos(a1 * 0.3); float sa1 = sin(a1 * 0.3);
      pos.xz = mat2(ca1, -sa1, sa1, ca1) * pos.xz;

      // Rotate in YZ
      float ca2 = cos(a2 * 0.2); float sa2 = sin(a2 * 0.2);
      pos.yz = mat2(ca2, -sa2, sa2, ca2) * pos.yz;

      // Condensing/expanding pulsation
      float breathe = 1.0 + sin(t * 1.5) * 0.3 + u_bass * 0.2;
      pos *= breathe;

      // Swirl toward/away from center
      float centerPull = sin(t * 0.8 + aRandom * 6.28) * 0.5;
      pos += normalize(pos + vec3(0.001)) * centerPull;

      // Shift the swarm center smoothly
      pos.x += sin(t * 0.4) * 1.5;
      pos.y += cos(t * 0.3) * 1.0;

      // Audio sway
      pos += vec3(u_mid * 0.15 * sin(a3), u_bass * 0.1 * cos(a3), 0.0);

      vDensity = 1.0 / (1.0 + length(pos) * 0.3);

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float size = (1.5 + aRandom * 1.0) * (1.0 + u_amplitude * 0.5);
      gl_PointSize = size * (200.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const swarmFragmentShader = `
    uniform float u_time;
    uniform float u_amplitude;
    varying float vRandom;
    varying float vDensity;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.1, d);

      // Warm amber-gold particles
      vec3 color = vec3(0.9, 0.6 + vRandom * 0.2, 0.15 + vRandom * 0.1);
      color *= 0.3 + vDensity * 0.5 + u_amplitude * 0.2;

      alpha *= 0.6 + vDensity * 0.3;

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_bass: { value: 0 },
    u_mid: { value: 0 }, u_amplitude: { value: 0 },
  }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.u_time.value = t; u.u_bass.value = a.bass;
      u.u_mid.value = a.mid; u.u_amplitude.value = a.amplitude;
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
          <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={swarmVertexShader}
          fragmentShader={swarmFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.3} />
      </EffectComposer>
    </>
  );
}

// ─── Lotus scene — blooming geometric flower ───

function LotusScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const groupRef = useRef<THREE.Group>(null);
  const petalRefs = useRef<THREE.Mesh[]>([]);

  const LAYERS = 5;
  const PETALS_PER_LAYER = 8;
  const TOTAL_PETALS = LAYERS * PETALS_PER_LAYER;

  const petalData = useMemo(() => {
    const data: Array<{
      layer: number;
      index: number;
      baseAngle: number;
      baseOpenAngle: number;
      hue: number;
      saturation: number;
      lightness: number;
    }> = [];

    for (let layer = 0; layer < LAYERS; layer++) {
      for (let j = 0; j < PETALS_PER_LAYER; j++) {
        const angle = (j / PETALS_PER_LAYER) * Math.PI * 2 + layer * 0.2;
        const openAngle = 0.3 + layer * 0.25; // Outer layers open more
        // Deep rose center -> pale pink outer
        const t = layer / (LAYERS - 1);
        data.push({
          layer,
          index: j,
          baseAngle: angle,
          baseOpenAngle: openAngle,
          hue: 0.93 + t * 0.04, // Rose-pink range
          saturation: 0.7 - t * 0.3,
          lightness: 0.25 + t * 0.2,
        });
      }
    }
    return data;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.04;
    }

    petalRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const pd = petalData[i];

      // Breathing open/close motion
      const breathe = Math.sin(t * 0.3 + pd.layer * 0.5) * 0.15;
      const openAngle = pd.baseOpenAngle + breathe + a.bass * 0.08;

      // Position petal
      const scale = 0.4 + pd.layer * 0.15;
      mesh.position.set(0, pd.layer * 0.08, 0);
      mesh.rotation.set(0, 0, 0);

      // Rotate to petal position
      mesh.rotation.y = pd.baseAngle + t * 0.02;
      // Tilt outward (opening)
      mesh.rotation.x = -openAngle;

      mesh.scale.set(scale, scale * 1.4, scale);

      const mat = mesh.material as THREE.MeshBasicMaterial;
      const hue = (pd.hue + Math.sin(t * 0.1 + i * 0.1) * 0.02) % 1;
      mat.color.setHSL(hue, pd.saturation, pd.lightness + a.amplitude * 0.1);
      mat.opacity = 0.5 + pd.layer * 0.05 + a.mid * 0.1;
    });
  });

  return (
    <>
      <group ref={groupRef}>
        {petalData.map((_, i) => (
          <mesh
            key={i}
            ref={(el) => { if (el) petalRefs.current[i] = el; }}
          >
            <planeGeometry args={[1, 1.5, 1, 1]} />
            <meshBasicMaterial
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        ))}
        {/* Center glow sphere */}
        <mesh>
          <sphereGeometry args={[0.15, 16, 16]} />
          <meshBasicMaterial color="#ffccdd" />
        </mesh>
      </group>
      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={1.8} />
      </EffectComposer>
    </>
  );
}

// ─── Cloud scene — volumetric cloud effect ───

function CloudScene({ analyser, dataArray }: { analyser: AnalyserLike; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const COUNT = 4000;

  const { positions, randoms, sizes } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);
    const sz = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      // Flattened ellipsoid distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.4) * 1.0;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 3.5; // Wide
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 1.2; // Flat
      pos[i * 3 + 2] = r * Math.cos(phi) * 2.5; // Medium depth
      rnd[i] = Math.random();
      sz[i] = 3.0 + Math.random() * 5.0; // Large, soft particles
    }
    return { positions: pos, randoms: rnd, sizes: sz };
  }, []);

  const cloudVertexShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_amplitude;
    attribute float aRandom;
    attribute float aSize;
    varying float vRandom;
    varying vec3 vWorldPos;

    void main() {
      vRandom = aRandom;
      float t = u_time * 0.06;

      vec3 pos = position;

      // Slow drift
      pos.x += sin(t * 0.5 + aRandom * 6.28) * 0.3;
      pos.y += cos(t * 0.4 + aRandom * 3.14) * 0.15;
      pos.z += sin(t * 0.3 + aRandom * 4.71) * 0.2;

      // Gentle overall drift
      pos.x += t * 0.3;

      // Audio: gentle expansion
      pos *= 1.0 + u_bass * 0.05;

      vWorldPos = pos;

      vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
      float size = aSize * (1.0 + u_amplitude * 0.2);
      gl_PointSize = size * (250.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const cloudFragmentShader = `
    uniform float u_time;
    uniform float u_amplitude;
    varying float vRandom;
    varying vec3 vWorldPos;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      // Very soft falloff for cloud effect
      float alpha = smoothstep(0.5, 0.0, d);
      alpha = alpha * alpha; // Extra soft

      // Lit from right side (warm) with cool shadow on left
      float lightDir = smoothstep(-3.0, 3.0, vWorldPos.x);

      vec3 warmLight = vec3(1.0, 0.9, 0.75); // Warm sunlit side
      vec3 coolShadow = vec3(0.4, 0.45, 0.6); // Cool shadow side
      vec3 color = mix(coolShadow, warmLight, lightDir);

      // Subtle internal luminance variation
      color *= 0.3 + vRandom * 0.15 + u_amplitude * 0.05;

      alpha *= 0.06; // Very low opacity for volumetric look

      gl_FragColor = vec4(color, alpha);
    }
  `;

  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_bass: { value: 0 }, u_amplitude: { value: 0 },
  }), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;
    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.u_time.value = t; u.u_bass.value = a.bass;
      u.u_amplitude.value = a.amplitude;
    }
    if (pointsRef.current) {
      pointsRef.current.rotation.y = t * 0.005;
    }
  });

  return (
    <>
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
          <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={cloudVertexShader}
          fragmentShader={cloudFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
        />
      </points>
      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.95} intensity={0.8} />
      </EffectComposer>
    </>
  );
}

// ─── Mode type ───

export type Visualizer3DMode =
  | "orb" | "field" | "aurora"
  | "galaxy" | "bonfire" | "crystal" | "swarm"
  | "lotus" | "cloud"
  | "wave" | "seabed" | "cage";

// ─── Main 3D visualizer component ───

/** Probe WebGL2 availability once — recheck after failures */
let _webgl2Available: boolean | null = null;
function isWebGL2Available(): boolean {
  if (_webgl2Available !== null) return _webgl2Available;
  try {
    const c = document.createElement("canvas");
    const ctx = c.getContext("webgl2");
    _webgl2Available = ctx !== null;
    if (ctx) {
      const ext = ctx.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    }
  } catch {
    _webgl2Available = false;
  }
  return _webgl2Available;
}

export function Visualizer3D({
  analyser,
  dataArray,
  mode,
}: {
  analyser: AnalyserLike;
  dataArray: Uint8Array<ArrayBuffer>;
  mode: Visualizer3DMode;
}) {
  if (!isWebGL2Available()) {
    return <div className="absolute inset-0 bg-black" />;
  }

  return (
    <Canvas3DErrorBoundary>
      <Canvas
        className="absolute inset-0 w-full h-full"
        camera={{ position: [0, 0, 5], fov: 60 }}
        gl={createSafeRenderer}
        style={{ background: "#000" }}
      >
        <color attach="background" args={["#000000"]} />
        {mode === "orb" && <OrbScene analyser={analyser} dataArray={dataArray} />}
        {mode === "field" && <FieldScene analyser={analyser} dataArray={dataArray} />}
        {mode === "aurora" && <AuroraScene analyser={analyser} dataArray={dataArray} />}
        {mode === "galaxy" && <GalaxyScene analyser={analyser} dataArray={dataArray} />}
        {mode === "bonfire" && <BonfireScene analyser={analyser} dataArray={dataArray} />}
        {mode === "crystal" && <CrystalScene analyser={analyser} dataArray={dataArray} />}
        {mode === "swarm" && <SwarmScene analyser={analyser} dataArray={dataArray} />}
        {mode === "lotus" && <LotusScene analyser={analyser} dataArray={dataArray} />}
        {mode === "cloud" && <CloudScene analyser={analyser} dataArray={dataArray} />}
        {mode === "wave" && <WaveScene analyser={analyser} dataArray={dataArray} />}
        {mode === "seabed" && <SeabedScene analyser={analyser} dataArray={dataArray} />}
        {mode === "cage" && <CageScene analyser={analyser} dataArray={dataArray} />}
      </Canvas>
    </Canvas3DErrorBoundary>
  );
}
