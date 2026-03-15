"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ─── Audio data hook — reads analyser every frame ───

interface AudioData {
  bass: number;
  mid: number;
  treble: number;
  amplitude: number;
}

function useAudioData(
  analyser: AnalyserNode,
  dataArray: Uint8Array<ArrayBuffer>
): React.MutableRefObject<AudioData> {
  const ref = useRef<AudioData>({ bass: 0, mid: 0, treble: 0, amplitude: 0 });
  const smoothing = 0.15;

  useFrame(() => {
    analyser.getByteFrequencyData(dataArray);

    let bassSum = 0, midSum = 0, trebleSum = 0, totalSum = 0;
    const len = dataArray.length;
    for (let i = 0; i < len; i++) {
      const v = dataArray[i];
      totalSum += v;
      if (i <= 5) bassSum += v;
      else if (i <= 30) midSum += v;
      else if (i <= 63) trebleSum += v;
    }

    const raw = {
      bass: bassSum / (6 * 255),
      mid: midSum / (25 * 255),
      treble: trebleSum / (33 * 255),
      amplitude: totalSum / (len * 255),
    };

    const s = ref.current;
    s.bass += (raw.bass - s.bass) * smoothing;
    s.mid += (raw.mid - s.mid) * smoothing;
    s.treble += (raw.treble - s.treble) * smoothing;
    s.amplitude += (raw.amplitude - s.amplitude) * smoothing;
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

function OrbScene({ analyser, dataArray }: { analyser: AnalyserNode; dataArray: Uint8Array<ArrayBuffer> }) {
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

function FieldScene({ analyser, dataArray }: { analyser: AnalyserNode; dataArray: Uint8Array<ArrayBuffer> }) {
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

// ─── Rings scene — concentric audio-reactive rings ───

function RingsScene({ analyser, dataArray }: { analyser: AnalyserNode; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const groupRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Mesh[]>([]);

  const RING_COUNT = 12;

  const ringData = useMemo(() => {
    return Array.from({ length: RING_COUNT }, (_, i) => ({
      radius: 0.6 + i * 0.35,
      rotSpeed: (i % 2 === 0 ? 1 : -1) * (0.15 + i * 0.03),
      tiltAxis: new THREE.Vector3(
        Math.sin(i * 0.8) * 0.5,
        1,
        Math.cos(i * 0.8) * 0.5,
      ).normalize(),
      hue: i / RING_COUNT,
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.03;
    }

    ringsRef.current.forEach((mesh, i) => {
      if (!mesh) return;
      const d = ringData[i];

      // Each ring tilts and rotates independently
      const tiltAngle = t * d.rotSpeed + Math.sin(t * 0.2 + i) * 0.3;
      mesh.rotation.set(0, 0, 0);
      mesh.rotateOnWorldAxis(d.tiltAxis, tiltAngle);

      // Audio-reactive scale: bass for inner rings, treble for outer
      const blend = i / (RING_COUNT - 1);
      const audioScale = 1 + (a.bass * (1 - blend) + a.treble * blend) * 0.4;
      mesh.scale.setScalar(audioScale);

      // Pulse opacity with amplitude
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.3 + a.amplitude * 0.4 + Math.sin(t * 1.5 + i * 0.5) * 0.1;

      // Color shift
      const hue = (d.hue + t * 0.02 + a.mid * 0.1) % 1;
      mat.color.setHSL(hue, 0.6, 0.35 + a.amplitude * 0.2);
    });
  });

  return (
    <>
      <group ref={groupRef}>
        {ringData.map((d, i) => (
          <mesh
            key={i}
            ref={(el) => { if (el) ringsRef.current[i] = el; }}
          >
            <torusGeometry args={[d.radius, 0.015 + (i % 3) * 0.005, 16, 128]} />
            <meshBasicMaterial transparent depthWrite={false} />
          </mesh>
        ))}
      </group>
      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={2.0} />
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

function AuroraScene({ analyser, dataArray }: { analyser: AnalyserNode; dataArray: Uint8Array<ArrayBuffer> }) {
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

// ─── Totem scene — stacked rotating polyhedra ───

function TotemScene({ analyser, dataArray }: { analyser: AnalyserNode; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const groupRef = useRef<THREE.Group>(null);
  const meshRefs = useRef<THREE.Mesh[]>([]);

  const FORMS = [
    { geo: "octahedron", y: -1.8, scale: 0.6, rotSpeed: 0.3 },
    { geo: "icosahedron", y: -0.6, scale: 0.5, rotSpeed: -0.25 },
    { geo: "dodecahedron", y: 0.6, scale: 0.55, rotSpeed: 0.2 },
    { geo: "octahedron", y: 1.8, scale: 0.45, rotSpeed: -0.35 },
  ];

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.05;
    }

    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const form = FORMS[i];
      mesh.rotation.x = t * form.rotSpeed;
      mesh.rotation.z = t * form.rotSpeed * 0.7;

      const pulse = 1 + a.bass * 0.3 * Math.sin(t * 2 + i * 1.5);
      mesh.scale.setScalar(form.scale * pulse);

      const mat = mesh.material as THREE.MeshBasicMaterial;
      const hue = ((i * 0.25 + t * 0.03 + a.mid * 0.1) % 1);
      mat.color.setHSL(hue, 0.5, 0.3 + a.amplitude * 0.3);
    });
  });

  return (
    <>
      <group ref={groupRef}>
        {FORMS.map((form, i) => (
          <mesh
            key={i}
            position={[0, form.y, 0]}
            ref={(el) => { if (el) meshRefs.current[i] = el; }}
          >
            {form.geo === "octahedron" && <octahedronGeometry args={[1, 0]} />}
            {form.geo === "icosahedron" && <icosahedronGeometry args={[1, 0]} />}
            {form.geo === "dodecahedron" && <dodecahedronGeometry args={[1, 0]} />}
            <meshBasicMaterial wireframe transparent opacity={0.6} />
          </mesh>
        ))}
        {/* Energy beams between forms */}
        {FORMS.slice(0, -1).map((_, i) => (
          <mesh key={`beam-${i}`} position={[0, (FORMS[i].y + FORMS[i + 1].y) / 2, 0]}>
            <cylinderGeometry args={[0.01, 0.01, Math.abs(FORMS[i + 1].y - FORMS[i].y) * 0.6, 4]} />
            <meshBasicMaterial color="#4466ff" transparent opacity={0.3} />
          </mesh>
        ))}
      </group>
      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={2.5} />
      </EffectComposer>
    </>
  );
}

// ─── Wormhole scene — fly-through particle ring tunnel ───

function WormholeScene({ analyser, dataArray }: { analyser: AnalyserNode; dataArray: Uint8Array<ArrayBuffer> }) {
  const audio = useAudioData(analyser, dataArray);
  const groupRef = useRef<THREE.Group>(null);
  const materialsRef = useRef<THREE.MeshBasicMaterial[]>([]);

  const RING_COUNT = 30;

  const ringData = useMemo(() => {
    return Array.from({ length: RING_COUNT }, (_, i) => ({
      z: -i * 1.2,
      radius: 2.0 + Math.sin(i * 0.5) * 0.5,
      hue: (i / RING_COUNT) % 1,
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;
    const speed = 1.0 + a.bass * 2.0;

    if (groupRef.current) {
      // Advance through the tunnel
      groupRef.current.position.z = (t * speed) % (RING_COUNT * 1.2);
    }

    materialsRef.current.forEach((mat, i) => {
      if (!mat) return;
      const hue = (ringData[i].hue + t * 0.05 + a.mid * 0.15) % 1;
      mat.color.setHSL(hue, 0.6, 0.25 + a.amplitude * 0.3);
      mat.opacity = 0.4 + a.treble * 0.3 + Math.sin(t * 2 + i * 0.3) * 0.1;
    });
  });

  return (
    <>
      <group ref={groupRef}>
        {ringData.map((ring, i) => (
          <mesh
            key={i}
            position={[0, 0, ring.z]}
            rotation={[Math.PI / 2, 0, i * 0.15]}
          >
            <torusGeometry args={[ring.radius, 0.02, 8, 64]} />
            <meshBasicMaterial
              ref={(el) => { if (el) materialsRef.current[i] = el; }}
              transparent
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <EffectComposer>
        <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={2.0} />
      </EffectComposer>
    </>
  );
}

// ─── Mode type ───

export type Visualizer3DMode = "orb" | "field" | "rings" | "aurora" | "totem" | "wormhole";

// ─── Main 3D visualizer component ───

export function Visualizer3D({
  analyser,
  dataArray,
  mode,
}: {
  analyser: AnalyserNode;
  dataArray: Uint8Array<ArrayBuffer>;
  mode: Visualizer3DMode;
}) {
  return (
    <Canvas
      className="absolute inset-0 w-full h-full"
      camera={{ position: [0, 0, 5], fov: 60 }}
      gl={{ antialias: true, alpha: false }}
      style={{ background: "#000" }}
    >
      <color attach="background" args={["#000000"]} />
      {mode === "orb" && <OrbScene analyser={analyser} dataArray={dataArray} />}
      {mode === "field" && <FieldScene analyser={analyser} dataArray={dataArray} />}
      {mode === "rings" && <RingsScene analyser={analyser} dataArray={dataArray} />}
      {mode === "aurora" && <AuroraScene analyser={analyser} dataArray={dataArray} />}
      {mode === "totem" && <TotemScene analyser={analyser} dataArray={dataArray} />}
      {mode === "wormhole" && <WormholeScene analyser={analyser} dataArray={dataArray} />}
    </Canvas>
  );
}
