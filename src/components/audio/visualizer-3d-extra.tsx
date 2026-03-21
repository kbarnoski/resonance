"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// ─── Audio data hook (self-contained copy — avoids coupling to main file internals) ───

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

// Props type shared by all scenes
interface SceneProps {
  analyser: AnalyserNode;
  dataArray: Uint8Array<ArrayBuffer>;
}

// ─── 1. Obelisk scene — tall monolith with glowing runes and orbiting particles ───

const obeliskVertexShader = `
  uniform float u_time;
  uniform float u_bass;
  uniform float u_amplitude;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  void main() {
    vPosition = position;
    vNormal = normal;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const obeliskFragmentShader = `
  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_treble;
  uniform float u_amplitude;
  varying vec3 vPosition;
  varying vec3 vNormal;
  varying vec2 vUv;

  float runePattern(vec2 p, float t) {
    float line1 = smoothstep(0.02, 0.0, abs(fract(p.y * 8.0) - 0.5) - 0.48) *
                  step(0.3, fract(p.x * 4.0 + t * 0.1)) *
                  step(fract(p.x * 4.0 + t * 0.1), 0.7);
    float line2 = smoothstep(0.02, 0.0, abs(fract(p.x * 6.0 + 0.25) - 0.5) - 0.48) *
                  step(0.2, fract(p.y * 5.0 - t * 0.08)) *
                  step(fract(p.y * 5.0 - t * 0.08), 0.6);
    float diag = smoothstep(0.025, 0.0, abs(fract(p.x * 3.0 + p.y * 3.0 + t * 0.05) - 0.5) - 0.48);
    return max(max(line1, line2), diag * 0.6);
  }

  void main() {
    float t = u_time;

    // Base obsidian color
    vec3 baseColor = vec3(0.02, 0.02, 0.03);

    // Rune energy — blue-white lines pulsing with audio
    float rune = runePattern(vUv, t);
    float pulse = 0.4 + 0.6 * sin(t * 0.8 + vUv.y * 6.0) * 0.5 + 0.5;
    pulse *= (0.5 + u_amplitude * 0.5);
    vec3 runeColor = mix(vec3(0.3, 0.5, 1.0), vec3(0.8, 0.9, 1.0), pulse);
    vec3 color = baseColor + rune * runeColor * pulse * (0.6 + u_bass * 0.8);

    // Fresnel edge glow
    float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 3.0);
    color += fresnel * vec3(0.15, 0.25, 0.6) * (0.3 + u_treble * 0.4);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export function ObeliskScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const particlesRef = useRef<THREE.Points>(null);

  const uniforms = useMemo(() => ({
    u_time: { value: 0 }, u_bass: { value: 0 }, u_mid: { value: 0 },
    u_treble: { value: 0 }, u_amplitude: { value: 0 },
  }), []);

  const PARTICLE_COUNT = 600;
  const particleData = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const angles = new Float32Array(PARTICLE_COUNT);
    const radii = new Float32Array(PARTICLE_COUNT);
    const speeds = new Float32Array(PARTICLE_COUNT);
    const heights = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      angles[i] = Math.random() * Math.PI * 2;
      radii[i] = 1.2 + Math.random() * 2.0;
      speeds[i] = 0.15 + Math.random() * 0.3;
      heights[i] = (Math.random() - 0.5) * 5.0;
      pos[i * 3] = 0;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = 0;
    }
    return { positions: pos, angles, radii, speeds, heights };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    if (materialRef.current) {
      const u = materialRef.current.uniforms;
      u.u_time.value = t;
      u.u_bass.value = a.bass;
      u.u_mid.value = a.mid;
      u.u_treble.value = a.treble;
      u.u_amplitude.value = a.amplitude;
    }

    if (meshRef.current) {
      meshRef.current.rotation.y = t * 0.06;
    }

    if (particlesRef.current) {
      const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = particleData.angles[i] + t * particleData.speeds[i];
        const r = particleData.radii[i] + Math.sin(t * 0.5 + i) * 0.2 * a.mid;
        positions[i * 3] = Math.cos(angle) * r;
        positions[i * 3 + 1] = particleData.heights[i] + Math.sin(t * 0.3 + i * 0.5) * 0.3;
        positions[i * 3 + 2] = Math.sin(angle) * r;
      }
      particlesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh ref={meshRef}>
        <boxGeometry args={[0.7, 4.5, 0.7]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={obeliskVertexShader}
          fragmentShader={obeliskFragmentShader}
          uniforms={uniforms}
        />
      </mesh>
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particleData.positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.04}
          color="#6688ff"
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} intensity={1.8} />
      </EffectComposer>
    </>
  );
}

// ─── 2. Wave scene — 3D ocean surface ───

export function WaveScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const meshRef = useRef<THREE.Mesh>(null);
  const geoRef = useRef<THREE.PlaneGeometry>(null);

  const SEG = 128;

  // Store original positions
  const basePositions = useMemo(() => {
    const geo = new THREE.PlaneGeometry(16, 16, SEG, SEG);
    return new Float32Array(geo.attributes.position.array);
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    if (!geoRef.current) return;
    const positions = geoRef.current.attributes.position.array as Float32Array;
    const colors = geoRef.current.attributes.color?.array as Float32Array | undefined;

    // Create color attribute if needed
    if (!geoRef.current.attributes.color) {
      const colorArr = new Float32Array(positions.length);
      geoRef.current.setAttribute("color", new THREE.BufferAttribute(colorArr, 3));
    }
    const colorArray = (geoRef.current.attributes.color.array as Float32Array);

    const vertCount = (SEG + 1) * (SEG + 1);
    for (let i = 0; i < vertCount; i++) {
      const bx = basePositions[i * 3];
      const by = basePositions[i * 3 + 1];

      // Layer multiple sine waves for ocean surface
      const wave1 = Math.sin(bx * 0.4 + t * 0.6) * 0.6;
      const wave2 = Math.sin(by * 0.3 + t * 0.45) * 0.4;
      const wave3 = Math.sin(bx * 0.8 - t * 0.7 + by * 0.5) * 0.25;
      const wave4 = Math.sin(bx * 1.5 + by * 1.2 + t * 1.0) * 0.1;

      // Subtle audio influence on wave height
      const audioMod = 1.0 + a.bass * 0.15 + a.mid * 0.08;
      const height = (wave1 + wave2 + wave3 + wave4) * audioMod;

      positions[i * 3 + 2] = height;

      // Color: deeper blue in troughs, white foam on crests
      const normalized = (height + 1.5) / 3.0; // roughly 0-1
      const foaminess = Math.max(0, (normalized - 0.6) * 2.5);
      colorArray[i * 3] = 0.02 + foaminess * 0.9;     // R
      colorArray[i * 3 + 1] = 0.08 + normalized * 0.25 + foaminess * 0.85; // G
      colorArray[i * 3 + 2] = 0.25 + normalized * 0.35 + foaminess * 0.6;  // B
    }

    geoRef.current.attributes.position.needsUpdate = true;
    geoRef.current.attributes.color.needsUpdate = true;
    geoRef.current.computeVertexNormals();
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 1.5, 3]} intensity={0.8} color="#ffe8cc" />
      <directionalLight position={[-3, 0.5, -2]} intensity={0.3} color="#4488ff" />
      <mesh ref={meshRef} rotation={[-Math.PI / 2.5, 0, 0]} position={[0, -1, 0]}>
        <planeGeometry ref={geoRef} args={[16, 16, SEG, SEG]} />
        <meshStandardMaterial
          vertexColors
          roughness={0.3}
          metalness={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>
      <EffectComposer>
        <Bloom luminanceThreshold={0.6} luminanceSmoothing={0.9} intensity={0.8} />
      </EffectComposer>
    </>
  );
}

// ─── 3. Silk scene — flowing translucent fabric ribbons ───

export function SilkScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);

  const RIBBON_COUNT = 5;
  const SEG_X = 80;
  const SEG_Y = 12;

  const ribbonConfigs = useMemo(() => [
    { color: new THREE.Color(0.7, 0.05, 0.15), yOffset: -1.5, phaseOffset: 0 },
    { color: new THREE.Color(0.05, 0.15, 0.65), yOffset: -0.5, phaseOffset: 1.3 },
    { color: new THREE.Color(0.05, 0.55, 0.2), yOffset: 0.5, phaseOffset: 2.5 },
    { color: new THREE.Color(0.7, 0.55, 0.05), yOffset: 1.3, phaseOffset: 3.8 },
    { color: new THREE.Color(0.5, 0.1, 0.55), yOffset: 0.0, phaseOffset: 5.0 },
  ], []);

  const geoRefs = useRef<(THREE.PlaneGeometry | null)[]>([]);
  const basePositions = useMemo(() => {
    return ribbonConfigs.map(() => {
      const geo = new THREE.PlaneGeometry(8, 1.5, SEG_X, SEG_Y);
      return new Float32Array(geo.attributes.position.array);
    });
  }, [ribbonConfigs]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    geoRefs.current.forEach((geo, ri) => {
      if (!geo) return;
      const positions = geo.attributes.position.array as Float32Array;
      const base = basePositions[ri];
      const cfg = ribbonConfigs[ri];
      const vertCount = (SEG_X + 1) * (SEG_Y + 1);

      for (let i = 0; i < vertCount; i++) {
        const bx = base[i * 3];
        const by = base[i * 3 + 1];

        // Flowing wave — primarily time-based
        const flow = Math.sin(bx * 0.8 + t * 0.5 + cfg.phaseOffset) * 0.6
          + Math.sin(bx * 1.5 - t * 0.35 + cfg.phaseOffset * 0.7) * 0.3
          + Math.cos(by * 2.0 + t * 0.4) * 0.15;

        // Z displacement — the "depth" undulation
        const zDisp = Math.sin(bx * 0.5 + t * 0.3 + cfg.phaseOffset) * 0.4
          + Math.cos(bx * 1.2 + by * 0.8 - t * 0.25) * 0.2;

        // Very subtle audio influence
        const audioScale = 1.0 + a.amplitude * 0.08 + a.bass * 0.04;

        positions[i * 3] = bx + Math.sin(t * 0.2 + cfg.phaseOffset) * 0.3;
        positions[i * 3 + 1] = by + cfg.yOffset + flow * audioScale;
        positions[i * 3 + 2] = zDisp * audioScale;
      }

      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    });
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[3, 3, 3]} intensity={0.6} color="#ffffff" />
      {ribbonConfigs.map((cfg, i) => (
        <mesh key={i} rotation={[0.15, 0, 0]}>
          <planeGeometry
            ref={(el) => { geoRefs.current[i] = el; }}
            args={[8, 1.5, SEG_X, SEG_Y]}
          />
          <meshStandardMaterial
            color={cfg.color}
            transparent
            opacity={0.45}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            roughness={0.8}
            metalness={0.2}
          />
        </mesh>
      ))}
      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={1.5} />
      </EffectComposer>
    </>
  );
}

// ─── 4. Orbit scene — solar system with trailing particles ───

export function OrbitScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const groupRef = useRef<THREE.Group>(null);
  const centerRef = useRef<THREE.Mesh>(null);
  const orbiterRefs = useRef<THREE.Mesh[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trailsRef = useRef<any[]>([]);

  const ORBITER_COUNT = 7;

  const orbiters = useMemo(() => {
    return Array.from({ length: ORBITER_COUNT }, (_, i) => ({
      semiMajor: 1.5 + i * 0.55,
      eccentricity: 0.1 + Math.random() * 0.2,
      speed: 0.3 - i * 0.03,
      inclination: (Math.random() - 0.5) * 0.6,
      phase: Math.random() * Math.PI * 2,
      size: 0.08 + Math.random() * 0.1,
      hue: 0.55 + i * 0.05, // cool blue-ish tones
    }));
  }, []);

  // Trail positions for each orbiter
  const TRAIL_LENGTH = 40;
  const trailPositions = useMemo(() => {
    return orbiters.map(() => new Float32Array(TRAIL_LENGTH * 3));
  }, [orbiters]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.02;
    }

    // Pulse the center sun
    if (centerRef.current) {
      const scale = 0.35 + a.bass * 0.08;
      centerRef.current.scale.setScalar(scale);
      const mat = centerRef.current.material as THREE.MeshBasicMaterial;
      const brightness = 0.6 + a.amplitude * 0.3;
      mat.color.setRGB(1.0 * brightness, 0.7 * brightness, 0.2 * brightness);
    }

    orbiters.forEach((orb, i) => {
      const mesh = orbiterRefs.current[i];
      if (!mesh) return;

      // Kepler-ish elliptical orbit
      const angle = t * orb.speed + orb.phase;
      const r = orb.semiMajor * (1 - orb.eccentricity * orb.eccentricity) /
        (1 + orb.eccentricity * Math.cos(angle));

      // Subtle audio speed modulation
      const audioAngle = angle + a.mid * 0.05;

      const x = Math.cos(audioAngle) * r;
      const z = Math.sin(audioAngle) * r;
      const y = Math.sin(audioAngle) * r * Math.sin(orb.inclination);

      mesh.position.set(x, y, z);

      // Update trail
      const trail = trailPositions[i];
      // Shift trail back
      for (let j = TRAIL_LENGTH - 1; j > 0; j--) {
        trail[j * 3] = trail[(j - 1) * 3];
        trail[j * 3 + 1] = trail[(j - 1) * 3 + 1];
        trail[j * 3 + 2] = trail[(j - 1) * 3 + 2];
      }
      trail[0] = x;
      trail[1] = y;
      trail[2] = z;

      const trailPts = trailsRef.current[i];
      if (trailPts) {
        trailPts.geometry.attributes.position.needsUpdate = true;
      }
    });
  });

  return (
    <>
      <group ref={groupRef}>
        {/* Central star */}
        <mesh ref={centerRef}>
          <sphereGeometry args={[0.35, 32, 32]} />
          <meshBasicMaterial color="#ffaa33" />
        </mesh>

        {/* Orbiters */}
        {orbiters.map((orb, i) => (
          <group key={i}>
            <mesh ref={(el) => { if (el) orbiterRefs.current[i] = el; }}>
              <sphereGeometry args={[orb.size, 16, 16]} />
              <meshBasicMaterial color={new THREE.Color().setHSL(orb.hue, 0.5, 0.5)} />
            </mesh>
            <points ref={(el) => { if (el) trailsRef.current[i] = el; }}>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[trailPositions[i], 3]} />
              </bufferGeometry>
              <pointsMaterial
                size={0.025}
                color={new THREE.Color().setHSL(orb.hue, 0.5, 0.4)}
                transparent
                opacity={0.4}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
              />
            </points>
          </group>
        ))}
      </group>
      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={1.5} />
      </EffectComposer>
    </>
  );
}

// ─── 5. Pillar scene — vertical columns of translucent light ───

export function PillarScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const pillarsRef = useRef<THREE.Mesh[]>([]);

  const PILLAR_COUNT = 7;

  const pillarData = useMemo(() => {
    return Array.from({ length: PILLAR_COUNT }, (_, i) => {
      const angle = (i / PILLAR_COUNT) * Math.PI * 2;
      const radius = 2.5;
      return {
        x: Math.cos(angle) * radius + (Math.random() - 0.5) * 0.5,
        z: Math.sin(angle) * radius + (Math.random() - 0.5) * 0.5,
        pulseSpeed: 0.3 + Math.random() * 0.4,
        pulsePhase: Math.random() * Math.PI * 2,
        height: 5 + Math.random() * 2,
        width: 0.15 + Math.random() * 0.12,
      };
    });
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    pillarsRef.current.forEach((mesh, i) => {
      if (!mesh) return;
      const d = pillarData[i];
      const mat = mesh.material as THREE.MeshBasicMaterial;

      // Gentle pulsing — primarily time driven
      const pulse = 0.5 + 0.5 * Math.sin(t * d.pulseSpeed + d.pulsePhase);
      const audioBoost = 1.0 + a.amplitude * 0.15;

      // Color cycling: warm white → amber → pale blue
      const colorPhase = (t * 0.06 + i * 0.14) % 1;
      let r: number, g: number, b: number;
      if (colorPhase < 0.33) {
        // Warm white to amber
        const f = colorPhase / 0.33;
        r = 0.9; g = 0.85 - f * 0.3; b = 0.75 - f * 0.5;
      } else if (colorPhase < 0.66) {
        // Amber to pale blue
        const f = (colorPhase - 0.33) / 0.33;
        r = 0.9 - f * 0.5; g = 0.55 + f * 0.2; b = 0.25 + f * 0.55;
      } else {
        // Pale blue to warm white
        const f = (colorPhase - 0.66) / 0.34;
        r = 0.4 + f * 0.5; g = 0.75 + f * 0.1; b = 0.8 - f * 0.05;
      }

      const brightness = (0.2 + pulse * 0.4) * audioBoost;
      mat.color.setRGB(r * brightness, g * brightness, b * brightness);
      mat.opacity = (0.15 + pulse * 0.25) * audioBoost;

      // Gentle scale breathing
      mesh.scale.x = 1.0 + Math.sin(t * 0.4 + i) * 0.1;
      mesh.scale.z = 1.0 + Math.cos(t * 0.35 + i * 0.7) * 0.1;
    });
  });

  return (
    <>
      {pillarData.map((d, i) => (
        <mesh
          key={i}
          position={[d.x, 0, d.z]}
          ref={(el) => { if (el) pillarsRef.current[i] = el; }}
        >
          <cylinderGeometry args={[d.width, d.width, d.height, 16, 1, true]} />
          <meshBasicMaterial
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}
      <EffectComposer>
        <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={2.0} />
      </EffectComposer>
    </>
  );
}

// ─── 6. Seabed scene — underwater floor with marine snow and plants ───

export function SeabedScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const terrainRef = useRef<THREE.Mesh>(null);
  const terrainGeoRef = useRef<THREE.PlaneGeometry>(null);
  const snowRef = useRef<THREE.Points>(null);
  const plantsRef = useRef<THREE.Group>(null);

  const TERRAIN_SEG = 64;
  const SNOW_COUNT = 1500;
  const PLANT_COUNT = 20;

  // Generate terrain heights
  const terrainHeights = useMemo(() => {
    const heights = new Float32Array((TERRAIN_SEG + 1) * (TERRAIN_SEG + 1));
    for (let j = 0; j <= TERRAIN_SEG; j++) {
      for (let i = 0; i <= TERRAIN_SEG; i++) {
        const x = (i / TERRAIN_SEG - 0.5) * 10;
        const z = (j / TERRAIN_SEG - 0.5) * 10;
        heights[j * (TERRAIN_SEG + 1) + i] =
          Math.sin(x * 0.5) * 0.4 +
          Math.sin(z * 0.7 + 1.0) * 0.3 +
          Math.sin(x * 1.3 + z * 0.9) * 0.15;
      }
    }
    return heights;
  }, []);

  // Marine snow particles
  const snowPositions = useMemo(() => {
    const pos = new Float32Array(SNOW_COUNT * 3);
    for (let i = 0; i < SNOW_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = Math.random() * 6 - 1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    return pos;
  }, []);

  // Plant data
  const plantData = useMemo(() => {
    return Array.from({ length: PLANT_COUNT }, () => ({
      x: (Math.random() - 0.5) * 8,
      z: (Math.random() - 0.5) * 8,
      height: 0.5 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      swaySpeed: 0.3 + Math.random() * 0.4,
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    // Animate terrain slightly
    if (terrainGeoRef.current) {
      const pos = terrainGeoRef.current.attributes.position.array as Float32Array;
      const count = (TERRAIN_SEG + 1) * (TERRAIN_SEG + 1);
      for (let i = 0; i < count; i++) {
        pos[i * 3 + 2] = terrainHeights[i] + Math.sin(t * 0.2 + i * 0.01) * 0.05;
      }
      terrainGeoRef.current.attributes.position.needsUpdate = true;
      terrainGeoRef.current.computeVertexNormals();
    }

    // Marine snow — slow drift
    if (snowRef.current) {
      const pos = snowRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < SNOW_COUNT; i++) {
        pos[i * 3 + 1] -= 0.003 + Math.sin(t * 0.1 + i) * 0.001;
        pos[i * 3] += Math.sin(t * 0.15 + i * 0.3) * 0.002;
        // Reset particles that fall too low
        if (pos[i * 3 + 1] < -1.5) {
          pos[i * 3 + 1] = 5;
        }
      }
      snowRef.current.geometry.attributes.position.needsUpdate = true;
    }

    // Sway plants
    if (plantsRef.current) {
      plantsRef.current.children.forEach((child, i) => {
        if (i >= plantData.length) return;
        const pd = plantData[i];
        const sway = Math.sin(t * pd.swaySpeed + pd.phase) * 0.15;
        const audioCurrent = a.mid * 0.05;
        child.rotation.z = sway + audioCurrent;
        child.rotation.x = Math.sin(t * pd.swaySpeed * 0.7 + pd.phase + 1) * 0.08;
      });
    }
  });

  return (
    <>
      {/* Atmospheric lighting */}
      <ambientLight intensity={0.12} color="#1a3a3a" />
      <directionalLight position={[2, 8, 1]} intensity={0.3} color="#88ccdd" />
      <pointLight position={[0, 3, 0]} intensity={0.2} color="#44aaaa" />

      {/* Fog for underwater feel */}
      <fog attach="fog" args={["#0a1a1a", 3, 14]} />

      {/* Terrain */}
      <mesh ref={terrainRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.5, 0]}>
        <planeGeometry ref={terrainGeoRef} args={[10, 10, TERRAIN_SEG, TERRAIN_SEG]} />
        <meshStandardMaterial color="#1a3328" roughness={0.9} />
      </mesh>

      {/* Marine snow */}
      <points ref={snowRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[snowPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.025}
          color="#aaddcc"
          transparent
          opacity={0.4}
          depthWrite={false}
        />
      </points>

      {/* Sea plants */}
      <group ref={plantsRef}>
        {plantData.map((pd, i) => (
          <mesh key={i} position={[pd.x, -2.3 + pd.height * 0.5, pd.z]}>
            <cylinderGeometry args={[0.005, 0.02, pd.height, 4]} />
            <meshBasicMaterial color={i % 3 === 0 ? "#33cc88" : "#22aa77"} transparent opacity={0.7} />
          </mesh>
        ))}
      </group>

      {/* Bioluminescent accent spots */}
      <pointLight position={[-2, -1.5, 1]} intensity={0.15} color="#ff8844" distance={3} />
      <pointLight position={[1.5, -1, -1.5]} intensity={0.1} color="#44ffaa" distance={2.5} />

      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={1.2} />
      </EffectComposer>
    </>
  );
}

// ─── 7. Molecule scene — 3D molecular structure ───

export function MoleculeScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const groupRef = useRef<THREE.Group>(null);

  // Generate a molecular graph
  const { atoms, bonds } = useMemo(() => {
    const atomList: { pos: THREE.Vector3; size: number; color: string }[] = [];
    const bondList: { from: number; to: number }[] = [];

    // Atom types with colors
    const atomTypes = [
      { color: "#ddeeff", size: 0.18 }, // H (white-blue)
      { color: "#4488ff", size: 0.22 }, // N (blue)
      { color: "#ff4444", size: 0.2 },  // O (red)
      { color: "#888888", size: 0.25 }, // C (grey)
    ];

    // Create 18 atoms in a loose 3D structure
    const COUNT = 18;
    for (let i = 0; i < COUNT; i++) {
      const theta = (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.2 + Math.random() * 1.5;
      const pos = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      const type = atomTypes[i % atomTypes.length];
      atomList.push({ pos, size: type.size, color: type.color });
    }

    // Create bonds between nearby atoms
    for (let i = 0; i < COUNT; i++) {
      for (let j = i + 1; j < COUNT; j++) {
        const dist = atomList[i].pos.distanceTo(atomList[j].pos);
        if (dist < 1.8) {
          bondList.push({ from: i, to: j });
        }
      }
    }

    return { atoms: atomList, bonds: bondList };
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    if (groupRef.current) {
      // Gentle tumbling
      groupRef.current.rotation.y = t * 0.08;
      groupRef.current.rotation.x = Math.sin(t * 0.05) * 0.3;
      groupRef.current.rotation.z = Math.cos(t * 0.06) * 0.15;

      // Very subtle audio breathing
      const scale = 1.0 + a.amplitude * 0.06;
      groupRef.current.scale.setScalar(scale);
    }
  });

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.7} />
      <directionalLight position={[-3, -2, -3]} intensity={0.3} color="#6688ff" />

      <group ref={groupRef}>
        {/* Atoms */}
        {atoms.map((atom, i) => (
          <mesh key={`atom-${i}`} position={atom.pos}>
            <sphereGeometry args={[atom.size, 16, 16]} />
            <meshStandardMaterial
              color={atom.color}
              roughness={0.3}
              metalness={0.4}
              emissive={atom.color}
              emissiveIntensity={0.1}
            />
          </mesh>
        ))}

        {/* Bonds — thin cylinders */}
        {bonds.map((bond, i) => {
          const from = atoms[bond.from].pos;
          const to = atoms[bond.to].pos;
          const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
          const dir = new THREE.Vector3().subVectors(to, from);
          const length = dir.length();
          // Quaternion to orient cylinder along bond
          const quat = new THREE.Quaternion();
          quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());

          return (
            <mesh key={`bond-${i}`} position={mid} quaternion={quat}>
              <cylinderGeometry args={[0.02, 0.02, length, 6]} />
              <meshStandardMaterial color="#556677" roughness={0.5} metalness={0.3} />
            </mesh>
          );
        })}
      </group>

      <EffectComposer>
        <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} intensity={0.8} />
      </EffectComposer>
    </>
  );
}

// ─── 8. Blackhole scene — accretion disk with spiraling particles ───

export function BlackholeScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const COUNT = 8000;

  const { positions, randoms, initialAngles, radii } = useMemo(() => {
    const pos = new Float32Array(COUNT * 3);
    const rnd = new Float32Array(COUNT);
    const angles = new Float32Array(COUNT);
    const rad = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Power distribution — more particles near center
      const r = 0.3 + Math.pow(Math.random(), 0.6) * 4.5;
      const diskThickness = 0.05 + r * 0.03; // Thinner near center
      const y = (Math.random() - 0.5) * diskThickness;

      angles[i] = angle;
      rad[i] = r;
      rnd[i] = Math.random();

      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.sin(angle) * r;
    }
    return { positions: pos, randoms: rnd, initialAngles: angles, radii: rad };
  }, []);

  const bhVertexShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_amplitude;
    attribute float aRandom;
    attribute float aRadius;
    varying float vRadius;
    varying float vRandom;

    void main() {
      vRadius = aRadius;
      vRandom = aRandom;
      vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
      float size = (1.5 + u_amplitude * 1.5) * (0.3 + (1.0 - smoothstep(0.3, 4.0, aRadius)) * 0.7);
      gl_PointSize = size * (250.0 / -mvPos.z);
      gl_Position = projectionMatrix * mvPos;
    }
  `;

  const bhFragmentShader = `
    uniform float u_time;
    uniform float u_bass;
    uniform float u_amplitude;
    varying float vRadius;
    varying float vRandom;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float alpha = smoothstep(0.5, 0.1, d);

      // Inner ring: orange-white hot. Outer: blue-shifted
      float innerBlend = smoothstep(2.5, 0.3, vRadius);
      vec3 innerColor = vec3(1.0, 0.7, 0.3); // orange-white
      vec3 outerColor = vec3(0.15, 0.2, 0.6); // blue-shifted
      vec3 color = mix(outerColor, innerColor, innerBlend);

      // Brighten close to center
      float brightness = 0.3 + innerBlend * 0.7;
      brightness *= (0.7 + u_amplitude * 0.3);
      color *= brightness;

      // Fade particles very close to center (event horizon)
      float centerFade = smoothstep(0.2, 0.6, vRadius);
      alpha *= centerFade * 0.8;

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
      materialRef.current.uniforms.u_time.value = t;
      materialRef.current.uniforms.u_bass.value = a.bass;
      materialRef.current.uniforms.u_amplitude.value = a.amplitude;
    }

    if (pointsRef.current) {
      const pos = pointsRef.current.geometry.attributes.position.array as Float32Array;

      for (let i = 0; i < COUNT; i++) {
        const r = radii[i];
        // Kepler: inner particles orbit faster (roughly 1/r^1.5)
        const orbitalSpeed = 0.6 / Math.pow(r * 0.3, 1.2);
        const angle = initialAngles[i] + t * orbitalSpeed;

        // Slight spiral inward — very slow
        const spiralR = r - Math.sin(t * 0.05 + randoms[i] * 6.28) * 0.05 * a.bass;

        const diskThickness = 0.05 + spiralR * 0.03;
        const y = Math.sin(t * 0.3 + randoms[i] * 6.28) * diskThickness;

        pos[i * 3] = Math.cos(angle) * spiralR;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = Math.sin(angle) * spiralR;
      }

      pointsRef.current.geometry.attributes.position.needsUpdate = true;
      pointsRef.current.rotation.x = 0.5; // Tilt the disk
    }
  });

  return (
    <>
      {/* Central void — black sphere */}
      <mesh>
        <sphereGeometry args={[0.25, 32, 32]} />
        <meshBasicMaterial color="#000000" />
      </mesh>

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
          <bufferAttribute attach="attributes-aRadius" args={[radii, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={bhVertexShader}
          fragmentShader={bhFragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <EffectComposer>
        <Bloom luminanceThreshold={0.15} luminanceSmoothing={0.9} intensity={2.0} />
      </EffectComposer>
    </>
  );
}

// ─── 9. Cage scene — nested wireframe platonic solids ───

export function CageScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const meshRefs = useRef<THREE.Mesh[]>([]);

  // Outer to inner: icosahedron, dodecahedron, cube, tetrahedron
  const cages = useMemo(() => [
    { type: "icosahedron" as const, scale: 2.2, rotAxis: new THREE.Vector3(0, 1, 0), speed: 0.06 },
    { type: "dodecahedron" as const, scale: 1.6, rotAxis: new THREE.Vector3(1, 0, 0.3).normalize(), speed: -0.08 },
    { type: "box" as const, scale: 1.1, rotAxis: new THREE.Vector3(0.3, 1, 0.5).normalize(), speed: 0.1 },
    { type: "tetrahedron" as const, scale: 0.65, rotAxis: new THREE.Vector3(0.5, 0.3, 1).normalize(), speed: -0.13 },
  ], []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    meshRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      const cage = cages[i];

      // Rotate on its own axis
      mesh.rotateOnWorldAxis(cage.rotAxis, cage.speed * 0.016); // per-frame

      // Subtle audio breathing on scale
      const breathe = 1.0 + Math.sin(t * 0.3 + i * 1.2) * 0.03 + a.amplitude * 0.04;
      mesh.scale.setScalar(cage.scale * breathe);

      // Color: cool blue-white with subtle shift
      const mat = mesh.material as THREE.MeshBasicMaterial;
      const brightness = 0.25 + a.amplitude * 0.15 + Math.sin(t * 0.4 + i * 0.8) * 0.05;
      const hue = 0.58 + i * 0.03 + Math.sin(t * 0.05) * 0.02;
      mat.color.setHSL(hue, 0.3, brightness);
    });
  });

  return (
    <>
      {cages.map((cage, i) => (
        <mesh key={i} ref={(el) => { if (el) meshRefs.current[i] = el; }}>
          {cage.type === "icosahedron" && <icosahedronGeometry args={[1, 0]} />}
          {cage.type === "dodecahedron" && <dodecahedronGeometry args={[1, 0]} />}
          {cage.type === "box" && <boxGeometry args={[1.4, 1.4, 1.4]} />}
          {cage.type === "tetrahedron" && <tetrahedronGeometry args={[1, 0]} />}
          <meshBasicMaterial
            wireframe
            transparent
            opacity={0.6}
            depthWrite={false}
          />
        </mesh>
      ))}
      <EffectComposer>
        <Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={2.5} />
      </EffectComposer>
    </>
  );
}

// ─── 10. Pendulum scene — wave pendulum with trailing positions ───

export function PendulumScene({ analyser, dataArray }: SceneProps) {
  const audio = useAudioData(analyser, dataArray);
  const bobRefs = useRef<THREE.Mesh[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trailsRef = useRef<any[]>([]);

  const PENDULUM_COUNT = 15;
  const TRAIL_LENGTH = 50;

  const pendulumData = useMemo(() => {
    return Array.from({ length: PENDULUM_COUNT }, (_, i) => ({
      // Each pendulum has a slightly different period
      period: 2.5 + i * 0.12,
      x: (i - (PENDULUM_COUNT - 1) / 2) * 0.4,
      stringLength: 3.5,
      // Warm metallic hue
      hue: 0.06 + i * 0.015,
    }));
  }, []);

  // Trail buffers
  const trailBuffers = useMemo(() => {
    return pendulumData.map(() => new Float32Array(TRAIL_LENGTH * 3));
  }, [pendulumData]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = audio.current;

    pendulumData.forEach((pd, i) => {
      const mesh = bobRefs.current[i];
      if (!mesh) return;

      // Pendulum angle — sinusoidal with unique period
      const angle = Math.sin((t * Math.PI * 2) / pd.period) * 0.8;
      // Subtle audio nudge
      const audioNudge = a.bass * 0.03;

      const swingAngle = angle + audioNudge;
      const y = 1.5 - Math.cos(swingAngle) * pd.stringLength;
      const z = Math.sin(swingAngle) * pd.stringLength;

      mesh.position.set(pd.x, y, z);

      // Color: warm metallic
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const brightness = 0.5 + a.amplitude * 0.15;
      mat.color.setHSL(pd.hue, 0.6, brightness);
      mat.emissive.setHSL(pd.hue, 0.6, 0.1 + a.amplitude * 0.05);

      // Update trail
      const trail = trailBuffers[i];
      for (let j = TRAIL_LENGTH - 1; j > 0; j--) {
        trail[j * 3] = trail[(j - 1) * 3];
        trail[j * 3 + 1] = trail[(j - 1) * 3 + 1];
        trail[j * 3 + 2] = trail[(j - 1) * 3 + 2];
      }
      trail[0] = pd.x;
      trail[1] = y;
      trail[2] = z;

      const trailPts = trailsRef.current[i];
      if (trailPts) {
        trailPts.geometry.attributes.position.needsUpdate = true;
      }
    });
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <directionalLight position={[3, 5, 3]} intensity={0.6} />
      <pointLight position={[0, -1, 2]} intensity={0.3} color="#ffaa66" />

      {/* Pendulum mount bar */}
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[(PENDULUM_COUNT - 1) * 0.4 + 0.5, 0.05, 0.05]} />
        <meshStandardMaterial color="#333333" metalness={0.8} roughness={0.2} />
      </mesh>

      {pendulumData.map((pd, i) => (
        <group key={i}>
          {/* Bob */}
          <mesh ref={(el) => { if (el) bobRefs.current[i] = el; }}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial roughness={0.3} metalness={0.7} />
          </mesh>

          {/* Trail */}
          <points ref={(el) => { if (el) trailsRef.current[i] = el; }}>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[trailBuffers[i], 3]} />
            </bufferGeometry>
            <pointsMaterial
              size={0.03}
              color={new THREE.Color().setHSL(pd.hue, 0.5, 0.4)}
              transparent
              opacity={0.3}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </points>
        </group>
      ))}

      <EffectComposer>
        <Bloom luminanceThreshold={0.3} luminanceSmoothing={0.9} intensity={1.2} />
      </EffectComposer>
    </>
  );
}
