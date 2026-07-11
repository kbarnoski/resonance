"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Earth Pulse — the last 24 hours of global earthquakes, played as music.
//
// Live USGS GeoJSON feed (CORS-open, keyless) → each quake becomes a sounding
// event: magnitude → loudness + pitch (bigger = deeper boom), depth → timbre
// (shallow = bright crack, deep = muffled rumble), longitude → stereo pan. The
// 24h window is time-compressed into ~2.5 minutes; aftershock swarms become
// audible flurries. A wireframe globe pulses each quake as it sounds.
//
// First real-external-API sonification in the lab. Reference: the silent
// "Earthquake Pulse Map" WebGL globe — this adds the dimension it lacks: sound.
// Earth Grounding journey, sonified.
// ─────────────────────────────────────────────────────────────────────────────

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

interface Quake {
  t: number; // epoch ms
  mag: number;
  depth: number; // km
  lon: number;
  lat: number;
  place: string;
}

interface USGSFeature {
  properties: { mag: number | null; time: number; place: string | null };
  geometry: { coordinates: number[] };
}
interface USGSFeed { features: USGSFeature[] }

// ── data ─────────────────────────────────────────────────────────────────────

async function fetchQuakes(): Promise<Quake[]> {
  const res = await fetch(USGS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`USGS ${res.status}`);
  const json = (await res.json()) as USGSFeed;
  return json.features
    .map((f): Quake => ({
      t: f.properties.time,
      mag: f.properties.mag ?? 0,
      depth: f.geometry.coordinates[2] ?? 0,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      place: f.properties.place ?? "unknown region",
    }))
    .filter((q) => q.mag >= 0 && Number.isFinite(q.lon) && Number.isFinite(q.lat))
    .sort((a, b) => a.t - b.t);
}

// Deterministic fallback set (offline / CORS hiccup) — ~44 quakes over 24h.
function buildFallback(): Quake[] {
  const now = Date.now();
  let seed = 987654321;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const arr: Quake[] = [];
  for (let i = 0; i < 44; i++) {
    const frac = i / 44;
    const t = now - (1 - frac) * 24 * 3600 * 1000 - rnd() * 1.2e6;
    const mag = 0.7 + rnd() * rnd() * 6.1; // skewed toward small quakes (realistic)
    arr.push({
      t,
      mag,
      depth: rnd() * rnd() * 480,
      lon: rnd() * 360 - 180,
      lat: rnd() * 150 - 75,
      place: "sample region (offline)",
    });
  }
  return arr.sort((a, b) => a.t - b.t);
}

// ── audio ────────────────────────────────────────────────────────────────────

interface Buses { dry: GainNode; verb: ConvolverNode }
interface AudioRig { ac: AudioContext; buses: Buses; noise: AudioBuffer }

function buildImpulse(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 3.0);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
  }
  return buf;
}

function buildNoise(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 0.4);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function clamp(x: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, x)); }

// One earthquake → one sounding event.
function fireQuake(rig: AudioRig, q: Quake) {
  const { ac, buses, noise } = rig;
  const now = ac.currentTime;
  const mag = clamp(q.mag, 0, 8.5);
  const depthN = clamp(q.depth / 300, 0, 1);

  // bigger quake → lower fundamental (deep boom); small quake → high ping
  const freq = 320 * Math.pow(2, -mag / 2.1); // M2≈170Hz, M5≈60Hz, M7≈30Hz
  // shallow → bright (open filter); deep → muffled
  const cutoff = 240 + 2600 * Math.pow(0.3, depthN);
  const loud = clamp(0.05 + mag * 0.07, 0.05, 0.62);
  const dur = 0.5 + mag * 0.42;
  const pan = clamp(q.lon / 180, -1, 1);

  const filt = ac.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = cutoff;
  filt.Q.value = 0.9;

  const panner = ac.createStereoPanner();
  panner.pan.value = pan;

  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(loud, now + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.7, now);
  osc.frequency.exponentialRampToValueAtTime(freq, now + 0.16);

  const sub = ac.createOscillator();
  sub.type = "triangle";
  sub.frequency.setValueAtTime(freq * 0.5, now);

  // noise transient — the "crack", louder for shallow quakes
  const nb = ac.createBufferSource();
  nb.buffer = noise;
  const ng = ac.createGain();
  const crack = loud * 0.55 * (1 - depthN);
  ng.gain.setValueAtTime(crack, now);
  ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.connect(g);
  sub.connect(g);
  g.connect(filt);
  nb.connect(ng);
  ng.connect(filt);
  filt.connect(panner);
  panner.connect(buses.dry);
  panner.connect(buses.verb);

  osc.start(now); osc.stop(now + dur + 0.05);
  sub.start(now); sub.stop(now + dur + 0.05);
  nb.start(now); nb.stop(now + 0.4);
}

// ── globe geometry helpers ────────────────────────────────────────────────────

const R_GLOBE = 1.0;
const R_POINT = 1.012;

function llToVec3(lat: number, lon: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return [-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta)];
}

const POINT_VERT = /* glsl */ `
  attribute float aAct;
  attribute float aDepth;
  varying float vAct;
  varying float vDepth;
  void main() {
    vAct = aAct;
    vDepth = aDepth;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = (3.0 + aAct * 30.0) * (300.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const POINT_FRAG = /* glsl */ `
  varying float vAct;
  varying float vDepth;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.0, d);
    vec3 shallow = vec3(1.0, 0.46, 0.16);   // warm — near surface
    vec3 deep    = vec3(0.42, 0.32, 0.98);   // violet — deep
    vec3 col = mix(shallow, deep, vDepth);
    float bright = 0.16 + vAct * 1.9;
    float a = core * (0.22 + vAct * 0.95);
    gl_FragColor = vec4(col * bright, a);
  }
`;

interface TransportRefs {
  prog: React.MutableRefObject<number>;
  playing: React.MutableRefObject<boolean>;
  cursor: React.MutableRefObject<number>;
  dur: React.MutableRefObject<number>;
}

interface TickInfo { prog: number; dataTime: number; fired: number; last: Quake | null }

function GlobeScene({
  quakes, rigRef, transport, onTick,
}: {
  quakes: Quake[];
  rigRef: React.MutableRefObject<AudioRig | null>;
  transport: TransportRefs;
  onTick: (info: TickInfo) => void;
}) {
  const N = quakes.length;
  const tMin = quakes[0]?.t ?? 0;
  const tMax = quakes[N - 1]?.t ?? 1;

  const groupRef = useRef<THREE.Group>(null);
  const actRef = useRef<Float32Array>(new Float32Array(N));
  const lastRef = useRef<Quake | null>(null);
  const hudRef = useRef(0);

  const pointsGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const dep = new Float32Array(N);
    const act = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const [x, y, z] = llToVec3(quakes[i].lat, quakes[i].lon, R_POINT);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      dep[i] = clamp(quakes[i].depth / 300, 0, 1);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aDepth", new THREE.BufferAttribute(dep, 1));
    geo.setAttribute("aAct", new THREE.BufferAttribute(act, 1));
    actRef.current = act;
    return geo;
  }, [quakes, N]);

  const pointsMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  const wireMat = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x1b3366, wireframe: true, transparent: true, opacity: 0.18,
  }), []);
  const wireGeo = useMemo(() => new THREE.SphereGeometry(R_GLOBE, 48, 28), []);
  const coreGeo = useMemo(() => new THREE.SphereGeometry(R_GLOBE * 0.985, 48, 28), []);
  const coreMat = useMemo(() => new THREE.MeshBasicMaterial({ color: 0x05060f }), []);

  useEffect(() => () => {
    pointsGeo.dispose(); pointsMat.dispose();
    wireGeo.dispose(); wireMat.dispose(); coreGeo.dispose(); coreMat.dispose();
  }, [pointsGeo, pointsMat, wireGeo, wireMat, coreGeo, coreMat]);

  useFrame((_, deltaRaw) => {
    const delta = Math.min(deltaRaw, 0.05);
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.045;

    const act = actRef.current;
    const decay = Math.pow(0.12, delta); // ~exp decay, frame-rate independent
    for (let i = 0; i < N; i++) act[i] *= decay;

    if (transport.playing.current && N > 0) {
      transport.prog.current += delta / transport.dur.current;
      if (transport.prog.current >= 1) {
        transport.prog.current = 1;
        transport.playing.current = false;
      }
      const dataTime = tMin + transport.prog.current * (tMax - tMin);
      const rig = rigRef.current;
      while (transport.cursor.current < N && quakes[transport.cursor.current].t <= dataTime) {
        const i = transport.cursor.current;
        if (rig) fireQuake(rig, quakes[i]);
        act[i] = 1;
        lastRef.current = quakes[i];
        transport.cursor.current++;
      }
    }

    const aAttr = pointsGeo.getAttribute("aAct") as THREE.BufferAttribute;
    aAttr.needsUpdate = true;

    hudRef.current += delta;
    if (hudRef.current > 0.12) {
      hudRef.current = 0;
      onTick({
        prog: transport.prog.current,
        dataTime: tMin + transport.prog.current * (tMax - tMin),
        fired: transport.cursor.current,
        last: lastRef.current,
      });
    }
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={coreGeo} material={coreMat} />
      <mesh geometry={wireGeo} material={wireMat} />
      <points geometry={pointsGeo} material={pointsMat} />
    </group>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

type Speed = { label: string; secs: number };
const SPEEDS: Speed[] = [
  { label: "Slow", secs: 240 },
  { label: "Normal", secs: 150 },
  { label: "Fast", secs: 75 },
];

export default function EarthPulse() {
  const [quakes, setQuakes] = useState<Quake[]>([]);
  const [loading, setLoading] = useState(true);
  const [usedFallback, setUsedFallback] = useState(false);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [tick, setTick] = useState<TickInfo>({ prog: 0, dataTime: 0, fired: 0, last: null });

  const rigRef = useRef<AudioRig | null>(null);
  const progRef = useRef(0);
  const playingRef = useRef(false);
  const cursorRef = useRef(0);
  const durRef = useRef(SPEEDS[1].secs);

  const transport: TransportRefs = useMemo(() => ({
    prog: progRef, playing: playingRef, cursor: cursorRef, dur: durRef,
  }), []);

  // Fetch live feed on mount; fall back to a synthetic set if it fails.
  useEffect(() => {
    let cancelled = false;
    fetchQuakes()
      .then((q) => { if (!cancelled) { setQuakes(q.length ? q : buildFallback()); setUsedFallback(q.length === 0); } })
      .catch(() => { if (!cancelled) { setQuakes(buildFallback()); setUsedFallback(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { void rigRef.current?.ac.close(); }, []);

  const ensureRig = useCallback((): AudioRig | null => {
    if (rigRef.current) return rigRef.current;
    const ACtx =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).webkitAudioContext as typeof AudioContext | undefined);
    if (!ACtx) return null;
    const ac = new ACtx();
    const master = ac.createGain(); master.gain.value = 0.95;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.release.value = 0.3;
    master.connect(comp); comp.connect(ac.destination);
    const dry = ac.createGain(); dry.gain.value = 0.9; dry.connect(master);
    const verb = ac.createConvolver(); verb.buffer = buildImpulse(ac);
    const wet = ac.createGain(); wet.gain.value = 0.55; verb.connect(wet); wet.connect(master);
    const rig: AudioRig = { ac, buses: { dry, verb }, noise: buildNoise(ac) };
    rigRef.current = rig;
    return rig;
  }, []);

  const handlePlay = useCallback(() => {
    const rig = ensureRig();
    void rig?.ac.resume();
    if (progRef.current >= 1) { progRef.current = 0; cursorRef.current = 0; } // restart at end
    playingRef.current = true;
    setStarted(true);
    setPlaying(true);
  }, [ensureRig]);

  const handlePause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
  }, []);

  const handleRestart = useCallback(() => {
    progRef.current = 0;
    cursorRef.current = 0;
    playingRef.current = started ? true : false;
  }, [started]);

  const setSpeed = useCallback((i: number) => {
    setSpeedIdx(i);
    durRef.current = SPEEDS[i].secs;
  }, []);

  const onTick = useCallback((info: TickInfo) => {
    setTick(info);
    if (info.prog >= 1 && playingRef.current === false) setPlaying(false);
  }, []);

  // derived HUD values
  const hoursAgo = quakes.length
    ? Math.max(0, (Date.now() - tick.dataTime) / 3600000)
    : 0;
  const biggest = useMemo(
    () => quakes.reduce<Quake | null>((m, q) => (!m || q.mag > m.mag ? q : m), null),
    [quakes],
  );

  return (
    <div className="relative w-full bg-black" style={{ height: "calc(100vh - 3rem)" }}>
      <Canvas
        camera={{ position: [0, 0.4, 3.0], fov: 46, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: false }}
        style={{ position: "absolute", inset: 0 }}
      >
        <color attach="background" args={["#04060d"]} />
        {quakes.length > 0 && (
          <GlobeScene quakes={quakes} rigRef={rigRef} transport={transport} onTick={onTick} />
        )}
        <OrbitControls enablePan={false} enableZoom minDistance={1.6} maxDistance={6} />
        <EffectComposer>
          <Bloom intensity={1.25} luminanceThreshold={0.12} luminanceSmoothing={0.85} mipmapBlur />
        </EffectComposer>
      </Canvas>

      {/* ── intro overlay ─────────────────────────────────────────────────── */}
      {!started && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
          <h1 className="text-3xl md:text-4xl font-serif text-foreground mb-3 tracking-tight">Earth Pulse</h1>
          <p className="text-base text-foreground max-w-lg leading-relaxed mb-2">
            The last 24 hours of global earthquakes, played as music. Each quake sounds the moment
            it happened — <span className="text-violet-300/95">bigger = deeper boom</span>,{" "}
            <span className="text-violet-300">deeper = more muffled</span>, longitude sets the stereo position.
          </p>
          <p className="text-base text-muted-foreground max-w-lg leading-relaxed mb-6">
            A full day compressed into ~2.5 minutes. Aftershock swarms become flurries. Drag to orbit the globe.
          </p>
          {loading ? (
            <p className="text-base text-muted-foreground">Loading live USGS feed…</p>
          ) : (
            <div className="flex flex-col items-center gap-3 pointer-events-auto">
              <p className="text-base text-violet-300/95">
                {quakes.length} earthquakes in the last 24h
                {biggest && <span className="text-muted-foreground"> · strongest M{biggest.mag.toFixed(1)}</span>}
              </p>
              <button
                onClick={handlePlay}
                className="min-h-[44px] px-8 py-3 rounded-md bg-violet-500/25 border border-violet-400/40 text-foreground text-lg hover:bg-violet-500/35 transition-colors"
              >
                ▶ Play the day
              </button>
              {usedFallback && (
                <p className="text-base text-violet-300/95 max-w-sm">
                  Live feed unreachable — playing a synthetic sample set.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── transport HUD ─────────────────────────────────────────────────── */}
      {started && (
        <div className="absolute left-0 right-0 bottom-0 p-4 pointer-events-none">
          <div className="mx-auto max-w-3xl pointer-events-auto">
            {/* progress */}
            <div className="h-1.5 w-full rounded bg-muted overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-violet-400 to-violet-400"
                style={{ width: `${Math.round(tick.prog * 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={playing ? handlePause : handlePlay}
                  className="min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-md bg-muted border border-border text-foreground text-base hover:bg-accent transition-colors"
                >
                  {playing ? "❚❚ Pause" : "▶ Play"}
                </button>
                <button
                  onClick={handleRestart}
                  className="min-h-[44px] px-4 py-2.5 rounded-md bg-muted border border-border text-foreground text-base hover:bg-accent transition-colors"
                >
                  ↺ Restart
                </button>
                <div className="flex gap-1">
                  {SPEEDS.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => setSpeed(i)}
                      className={`min-h-[44px] px-3 py-2 rounded-md text-base border transition-colors ${
                        i === speedIdx
                          ? "bg-violet-500/30 border-violet-400/50 text-foreground"
                          : "bg-muted border-border text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <div className="text-base text-foreground font-mono">
                  {hoursAgo > 0.05 ? `${hoursAgo.toFixed(1)}h ago` : "now"} ·{" "}
                  <span className="text-violet-300/95">{tick.fired}</span>
                  <span className="text-muted-foreground">/{quakes.length} quakes</span>
                </div>
                {tick.last && (
                  <div className="text-base text-muted-foreground font-mono truncate max-w-[60vw] md:max-w-md">
                    M{tick.last.mag.toFixed(1)} · {Math.round(tick.last.depth)}km · {tick.last.place}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* design notes + back */}
      <div className="absolute top-3 right-4 flex gap-4 text-xs text-muted-foreground font-mono">
        <Link href="https://getresonance.vercel.app/dream/233-earth-pulse/README.md" target="_blank" rel="noreferrer" className="hover:text-foreground">
          design notes →
        </Link>
        <Link href="/dream" className="hover:text-foreground">← dream</Link>
      </div>
    </div>
  );
}
