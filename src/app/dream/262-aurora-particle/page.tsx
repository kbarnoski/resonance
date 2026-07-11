"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// ─────────────────────────────────────────────────────────────────────────────
// Aurora Particle — live solar wind is the score.
//
// On Start we fetch real-time NOAA SWPC space-weather feeds (plasma, mag, Kp),
// CORS-open and keyless, re-polling every ~60s. The solar wind hitting Earth
// right now drives BOTH a generative ambient drone (Web Audio) AND a flowing
// aurora built from thousands of additive THREE.Points curtains. Because the
// Sun writes the data live, every session sounds and looks different.
//
// Reference: sibling 233-earth-pulse (first live-API sonification in the lab);
// the silent NOAA SWPC ovation/aurora dashboards (this adds sound + sculpture);
// and Refik Anadol's "Machine Hallucinations" data-as-glowing-particle language.
// ─────────────────────────────────────────────────────────────────────────────

const PLASMA_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json";
const MAG_URL =
  "https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json";
const KP_URL =
  "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json";

// ── data model ───────────────────────────────────────────────────────────────

interface SolarWind {
  speed: number; // km/s ~300-800
  density: number; // p/cm^3 ~0-20
  bz: number; // nT ~ -20..+20
  bt: number; // nT ~ 0..30
  kp: number; // 0-9
}

const DEFAULT_WIND: SolarWind = {
  speed: 420,
  density: 4,
  bz: -2,
  bt: 5,
  kp: 2,
};

// ── NOAA fetch + parse ───────────────────────────────────────────────────────

type Row = string[];

function lastFinite(rows: Row[], idx: number): number | null {
  for (let i = rows.length - 1; i >= 1; i--) {
    const v = parseFloat(rows[i]?.[idx]);
    if (Number.isFinite(v)) return v;
  }
  return null;
}

// returns the last row (scanned from end) where ALL given indices are finite
function lastFiniteRow(rows: Row[], idxs: number[]): number[] | null {
  for (let i = rows.length - 1; i >= 1; i--) {
    const vals = idxs.map((c) => parseFloat(rows[i]?.[c]));
    if (vals.every((v) => Number.isFinite(v))) return vals;
  }
  return null;
}

async function fetchJsonRows(url: string): Promise<Row[]> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) throw new Error("unexpected shape");
  return json as Row[];
}

// Fetch all three feeds; merge whatever succeeds onto a base reading so one
// dead feed never blanks the others.
async function runFetchWind(base: SolarWind): Promise<SolarWind> {
  const next: SolarWind = { ...base };
  const [plasma, mag, kp] = await Promise.allSettled([
    fetchJsonRows(PLASMA_URL),
    fetchJsonRows(MAG_URL),
    fetchJsonRows(KP_URL),
  ]);

  let anyOk = false;

  if (plasma.status === "fulfilled") {
    // header: time_tag, density, speed, temperature
    const row = lastFiniteRow(plasma.value, [1, 2]);
    if (row) {
      next.density = row[0];
      next.speed = row[1];
      anyOk = true;
    }
  }
  if (mag.status === "fulfilled") {
    // header: time_tag, bx, by, bz_gsm(3), lon, lat, bt(6)
    const bz = lastFinite(mag.value, 3);
    const bt = lastFinite(mag.value, 6);
    if (bz !== null) {
      next.bz = bz;
      anyOk = true;
    }
    if (bt !== null) {
      next.bt = bt;
      anyOk = true;
    }
  }
  if (kp.status === "fulfilled") {
    // header: time_tag, Kp(1), a_running, station_count
    const k = lastFinite(kp.value, 1);
    if (k !== null) {
      next.kp = k;
      anyOk = true;
    }
  }

  if (!anyOk) throw new Error("all feeds failed");
  return next;
}

// ── simulated fallback (bounded random walk) ──────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function runSimStep(w: SolarWind): SolarWind {
  const wob = (cur: number, lo: number, hi: number, step: number) =>
    clamp(cur + (Math.random() - 0.5) * 2 * step, lo, hi);
  return {
    speed: wob(w.speed, 300, 700, 30),
    density: wob(w.density, 1, 12, 1.2),
    bz: wob(w.bz, -10, 10, 2),
    bt: wob(w.bt, 2, 15, 1.2),
    kp: wob(w.kp, 0, 6, 0.6),
  };
}

// ── mapping helpers ──────────────────────────────────────────────────────────

const norm = (v: number, lo: number, hi: number) =>
  clamp((v - lo) / (hi - lo), 0, 1);

// speed -> hue base. slow (green ~0.33) -> fast (violet ~0.78)
function speedToHue(speed: number) {
  return 0.33 + norm(speed, 300, 800) * 0.45;
}

// kp -> discrete state
type WindState = "CALM" | "UNSETTLED" | "ACTIVE" | "STORM";
function kpState(kp: number): WindState {
  if (kp < 3) return "CALM";
  if (kp < 5) return "UNSETTLED";
  if (kp < 7) return "ACTIVE";
  return "STORM";
}
function kpCurtains(kp: number) {
  return clamp(Math.round(1 + kp * 0.7), 1, 7); // 1-2 calm, 5+ storm
}

// pentatonic minor / major intervals (semitones from root)
const PENTA_MINOR = [0, 3, 5, 7, 10];
const PENTA_MAJOR = [0, 2, 4, 7, 9];
function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// ── Web Audio sonification engine ────────────────────────────────────────────

class AuroraAudio {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  lowpass: BiquadFilterNode;
  reverb: ConvolverNode;
  delay: DelayNode;
  feedback: GainNode;
  oscBank: { osc: OscillatorNode; gain: GainNode }[] = [];
  arpTimer: number | null = null;
  // smoothed (EMA) targets
  s: SolarWind = { ...DEFAULT_WIND };
  arpNextAt = 0;

  constructor() {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.0001;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.ratio.value = 12;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.25;

    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 900;
    this.lowpass.Q.value = 0.6;

    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.2, 2.4);

    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.45;
    this.feedback = this.ctx.createGain();
    this.feedback.gain.value = 0.35;

    // routing: bank -> lowpass -> [dry + delay/feedback] -> reverb -> master -> comp -> out
    this.delay.connect(this.feedback);
    this.feedback.connect(this.delay);

    this.lowpass.connect(this.reverb);
    this.lowpass.connect(this.delay);
    this.delay.connect(this.reverb);

    this.reverb.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    this.buildOscBank(3);

    // gentle fade-in to avoid a transient
    this.master.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.2);

    this.scheduleArp();
  }

  // synthesize an exponentially-decaying noise impulse response
  makeImpulse(seconds: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return buf;
  }

  buildOscBank(count: number) {
    // tear down existing
    for (const v of this.oscBank) {
      try {
        v.osc.stop();
      } catch {
        /* already stopped */
      }
      v.osc.disconnect();
      v.gain.disconnect();
    }
    this.oscBank = [];
    const root = this.rootFreq();
    for (let i = 0; i < count; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i % 2 === 0 ? "sawtooth" : "triangle";
      osc.frequency.value = root * (1 + i * 0.5); // partials
      osc.detune.value = (i - count / 2) * 7; // gentle detune spread
      const g = this.ctx.createGain();
      g.gain.value = 0.18 / Math.sqrt(count);
      osc.connect(g);
      g.connect(this.lowpass);
      osc.start();
      this.oscBank.push({ osc, gain: g });
    }
  }

  rootFreq(): number {
    // wind speed -> root pitch in the C2..C3 region (MIDI 36..48)
    const m = 36 + norm(this.s.speed, 300, 800) * 12;
    return midiToFreq(m);
  }

  // called frequently with EMA-smoothed values
  apply(target: SolarWind) {
    // EMA toward target
    const a = 0.06;
    this.s.speed += (target.speed - this.s.speed) * a;
    this.s.density += (target.density - this.s.density) * a;
    this.s.bz += (target.bz - this.s.bz) * a;
    this.s.bt += (target.bt - this.s.bt) * a;
    this.s.kp += (target.kp - this.s.kp) * a;

    const now = this.ctx.currentTime;

    // density -> partial count (2..5); rebuild only when integer count changes
    const wantCount = clamp(Math.round(2 + norm(this.s.density, 0, 18) * 3), 2, 5);
    if (wantCount !== this.oscBank.length) this.buildOscBank(wantCount);

    // glide partial freqs from current root
    const root = this.rootFreq();
    this.oscBank.forEach((v, i) => {
      v.osc.frequency.setTargetAtTime(root * (1 + i * 0.5), now, 0.6);
    });

    // Kp -> lowpass cutoff (calm dark -> storm bright) + voice loudness
    const cutoff = 500 + norm(this.s.kp, 0, 9) * 3200;
    this.lowpass.frequency.setTargetAtTime(cutoff, now, 0.8);

    // Bt -> master amplitude
    const amp = 0.32 + norm(this.s.bt, 2, 20) * 0.4;
    this.master.gain.setTargetAtTime(amp, now, 0.8);
  }

  scheduleArp() {
    const tick = () => {
      this.playBell();
      // wind speed -> tempo: fast wind = faster arp (0.45s .. 1.8s)
      const period = 1800 - norm(this.s.speed, 300, 800) * 1350;
      this.arpTimer = window.setTimeout(tick, clamp(period, 350, 2000));
    };
    this.arpTimer = window.setTimeout(tick, 600);
  }

  playBell() {
    const now = this.ctx.currentTime;
    const minor = this.s.bz < 0; // negative Bz -> storm coupling -> minor
    const scale = minor ? PENTA_MINOR : PENTA_MAJOR;
    // root one or two octaves above drone root
    const rootMidi = 36 + norm(this.s.speed, 300, 800) * 12 + 24;
    const deg = scale[Math.floor(Math.random() * scale.length)];
    const oct = Math.random() < 0.4 ? 12 : 0;
    const freq = midiToFreq(rootMidi + deg + oct);

    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    const peak = 0.12 + norm(this.s.bt, 2, 20) * 0.08;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    osc.connect(g);
    g.connect(this.lowpass);
    osc.start(now);
    osc.stop(now + 2.5);
  }

  async dispose() {
    if (this.arpTimer !== null) window.clearTimeout(this.arpTimer);
    for (const v of this.oscBank) {
      try {
        v.osc.stop();
      } catch {
        /* noop */
      }
      v.osc.disconnect();
    }
    try {
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
      await this.ctx.close();
    } catch {
      /* noop */
    }
  }
}

// ── three.js particle aurora ─────────────────────────────────────────────────

const PARTICLES_PER_CURTAIN = 1400;
const MAX_CURTAINS = 7;
const TOTAL = PARTICLES_PER_CURTAIN * MAX_CURTAINS;

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uHue;
  uniform float uHeight;     // curtain height scale (Bz)
  uniform float uAgitation;  // sway intensity (Bz/storm)
  uniform float uShimmer;    // Kp shimmer
  uniform float uBright;     // Bt brightness
  uniform float uActive;     // how many curtains are "on" (0..MAX)

  attribute float aCurtain;  // which curtain index
  attribute float aSeed;     // per-point random
  attribute float aX;        // base x within curtain
  attribute float aY;        // base y 0..1 up the curtain

  varying vec3 vColor;
  varying float vAlpha;

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
  }

  void main() {
    float on = step(aCurtain, uActive - 0.5);

    // curtain horizontal placement
    float cx = (aCurtain - (uActive-1.0)*0.5) * 3.4;
    float y01 = aY;

    // vertical drift (rising particles)
    float rise = mod(y01 + uTime*0.06 + aSeed*0.7, 1.0);
    float wy = (rise - 0.5) * (5.0 + uHeight*7.0);

    // horizontal sway — a flowing curtain
    float sway = sin(uTime*0.6 + aCurtain*1.3 + rise*6.2831*1.5) * (0.6 + uAgitation*1.6);
    sway += sin(uTime*1.7 + aSeed*9.0) * uShimmer * 0.5;
    float wx = cx + aX*2.2 + sway;

    float wz = sin(uTime*0.3 + aCurtain*2.1)*1.2 + aSeed*0.6;

    vec3 pos = vec3(wx, wy, wz);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // point size: bigger near base of curtain, twinkle with shimmer
    float tw = 0.7 + 0.3*sin(uTime*3.0 + aSeed*20.0)*uShimmer;
    float sz = (1.6 + (1.0-rise)*2.0) * tw;
    gl_PointSize = sz * (160.0 / -mv.z);

    // color: hue base + a little vertical gradient toward magenta at top
    float hue = uHue + rise*0.06;
    float light = 0.5 + uBright*0.18;
    vColor = hsl2rgb(vec3(hue, 0.85, clamp(light,0.35,0.75)));

    // fade at the vertical extremes for a soft curtain edge
    float edge = smoothstep(0.0,0.12,rise) * smoothstep(1.0,0.78,rise);
    vAlpha = on * edge * (0.35 + uBright*0.05);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d);
    if (r > 0.5) discard;
    float fall = smoothstep(0.5, 0.0, r); // soft round falloff
    gl_FragColor = vec4(vColor, vAlpha * fall);
  }
`;

interface AuroraHandle {
  setWind: (w: SolarWind) => void;
}

function AuroraField({ handleRef }: { handleRef: React.MutableRefObject<AuroraHandle | null> }) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const smoothed = useRef<SolarWind>({ ...DEFAULT_WIND });
  const target = useRef<SolarWind>({ ...DEFAULT_WIND });

  useEffect(() => {
    handleRef.current = {
      setWind: (w) => {
        target.current = w;
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef]);

  const { geometry, uniforms } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(TOTAL * 3); // placeholder (shader computes real pos)
    const aCurtain = new Float32Array(TOTAL);
    const aSeed = new Float32Array(TOTAL);
    const aX = new Float32Array(TOTAL);
    const aY = new Float32Array(TOTAL);
    let p = 0;
    for (let c = 0; c < MAX_CURTAINS; c++) {
      for (let i = 0; i < PARTICLES_PER_CURTAIN; i++) {
        aCurtain[p] = c;
        aSeed[p] = Math.random();
        aX[p] = Math.random() - 0.5;
        aY[p] = Math.random();
        p++;
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aCurtain", new THREE.BufferAttribute(aCurtain, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geo.setAttribute("aX", new THREE.BufferAttribute(aX, 1));
    geo.setAttribute("aY", new THREE.BufferAttribute(aY, 1));

    const u = {
      uTime: { value: 0 },
      uHue: { value: speedToHue(DEFAULT_WIND.speed) },
      uHeight: { value: 0.5 },
      uAgitation: { value: 0.3 },
      uShimmer: { value: 0.2 },
      uBright: { value: 1.0 },
      uActive: { value: kpCurtains(DEFAULT_WIND.kp) },
    };
    return { geometry: geo, uniforms: u };
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame((_, delta) => {
    const mat = matRef.current;
    if (!mat) return;
    // EMA toward live target so visuals glide
    const a = 0.05;
    const s = smoothed.current;
    const t = target.current;
    s.speed += (t.speed - s.speed) * a;
    s.density += (t.density - s.density) * a;
    s.bz += (t.bz - s.bz) * a;
    s.bt += (t.bt - s.bt) * a;
    s.kp += (t.kp - s.kp) * a;

    const u = mat.uniforms;
    u.uTime.value += delta;
    u.uHue.value = speedToHue(s.speed);
    // negative Bz -> taller + more agitated
    const stormCouple = norm(-s.bz, -10, 20); // 0..1, higher when bz more negative
    u.uHeight.value = 0.3 + stormCouple * 1.0;
    u.uAgitation.value = 0.2 + stormCouple * 1.2;
    u.uShimmer.value = norm(s.kp, 0, 9);
    u.uBright.value = norm(s.bt, 2, 22) * 4.0;
    u.uActive.value = kpCurtains(s.kp);
  });

  return (
    <points geometry={geometry}>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={VERT}
        fragmentShader={FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// faint star field — a second, static Points cloud
function StarField() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const N = 800;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = (Math.random() - 0.2) * 30;
      pos[i * 3 + 2] = -10 - Math.random() * 25;
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points geometry={geo}>
      <pointsMaterial
        size={0.08}
        color="#aab6d8"
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </points>
  );
}

// deep night gradient backdrop
function NightSky() {
  const { scene } = useThree();
  useEffect(() => {
    const prev = scene.background;
    scene.background = new THREE.Color("#03040c");
    return () => {
      scene.background = prev;
    };
  }, [scene]);
  return null;
}

// ── main page ────────────────────────────────────────────────────────────────

export default function Page() {
  const [started, setStarted] = useState(false);
  const [wind, setWind] = useState<SolarWind>(DEFAULT_WIND);
  const [simulating, setSimulating] = useState(false);
  const [webglOk, setWebglOk] = useState(true);

  const audioRef = useRef<AuroraAudio | null>(null);
  const auroraRef = useRef<AuroraHandle | null>(null);
  const windRef = useRef<SolarWind>(DEFAULT_WIND);
  const pollRef = useRef<number | null>(null);
  const applyRef = useRef<number | null>(null);

  // WebGL capability check
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl =
        c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) setWebglOk(false);
    } catch {
      setWebglOk(false);
    }
  }, []);

  const pushWind = useCallback((w: SolarWind) => {
    windRef.current = w;
    setWind(w);
    auroraRef.current?.setWind(w);
  }, []);

  // poll loop: try live, else simulate
  const runPoll = useCallback(async () => {
    try {
      const next = await runFetchWind(windRef.current);
      setSimulating(false);
      pushWind(next);
    } catch {
      // fall back to a simulated step
      setSimulating(true);
      pushWind(runSimStep(windRef.current));
    }
  }, [pushWind]);

  const start = useCallback(async () => {
    if (started) return;
    setStarted(true);
    // audio first so it is alive the instant Start is pressed
    try {
      audioRef.current = new AuroraAudio();
      await audioRef.current.ctx.resume();
    } catch {
      /* audio may be blocked; visuals still run */
    }
    // immediate fetch, then 60s poll
    await runPoll();
    pollRef.current = window.setInterval(runPoll, 60000);
    // feed smoothed targets to the audio engine ~20x/s
    applyRef.current = window.setInterval(() => {
      audioRef.current?.apply(windRef.current);
    }, 50);
  }, [started, runPoll]);

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
      if (applyRef.current !== null) window.clearInterval(applyRef.current);
      void audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  const state = kpState(wind.kp);
  const stateColor =
    state === "CALM"
      ? "text-violet-300"
      : state === "UNSETTLED"
        ? "text-violet-300"
        : "text-violet-300";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#03040c] text-foreground">
      {/* canvas layer */}
      {started && webglOk && (
        <div className="absolute inset-0">
          <Canvas
            camera={{ position: [0, 1.5, 16], fov: 55 }}
            gl={{ antialias: true, powerPreference: "high-performance" }}
          >
            <NightSky />
            <StarField />
            <AuroraField handleRef={auroraRef} />
            <EffectComposer>
              <Bloom
                intensity={0.9}
                luminanceThreshold={0.1}
                luminanceSmoothing={0.4}
                mipmapBlur
              />
            </EffectComposer>
          </Canvas>
        </div>
      )}

      {/* top: title + description */}
      <div className="pointer-events-none relative z-10 px-6 pt-8 sm:px-10">
        <h1 className="font-serif text-2xl text-foreground sm:text-3xl">
          Aurora Particle
        </h1>
        <p className="mt-2 max-w-2xl text-base text-foreground">
          Live solar wind is the score: NOAA reads the plasma, magnetic field and
          Kp index hitting Earth right now, and the Sun writes both a drone and a
          flowing aurora.
        </p>

        {simulating && (
          <p className="mt-3 font-mono text-base text-violet-300">
            Live feed unavailable — simulating solar wind.
          </p>
        )}
        {!webglOk && (
          <p className="mt-1 font-mono text-base text-violet-300">
            WebGL unavailable — visuals disabled; the drone still plays.
          </p>
        )}
      </div>

      {/* start button */}
      {!started && (
        <div className="relative z-10 mt-10 px-6 sm:px-10">
          <button
            onClick={start}
            className="min-h-[44px] rounded-md border border-border bg-muted px-4 py-2.5 text-base text-foreground backdrop-blur transition hover:bg-accent"
          >
            Start — let the Sun play
          </button>
          <p className="mt-3 max-w-xl text-base text-muted-foreground">
            Tap to fetch real-time space weather and begin. Headphones
            recommended.
          </p>
        </div>
      )}

      {/* live HUD */}
      {started && (
        <div className="pointer-events-none absolute bottom-6 left-6 z-10 sm:left-10">
          <div className="rounded-lg border border-border bg-black/40 p-4 font-mono text-base text-foreground backdrop-blur">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <span>
                <span className="text-muted-foreground">SPEED</span> {wind.speed.toFixed(0)} km/s
              </span>
              <span>
                <span className="text-muted-foreground">DENSITY</span> {wind.density.toFixed(1)} p/cm³
              </span>
              <span>
                <span className="text-muted-foreground">Bz</span> {wind.bz.toFixed(1)} nT
              </span>
              <span>
                <span className="text-muted-foreground">Bt</span> {wind.bt.toFixed(1)} nT
              </span>
              <span>
                <span className="text-muted-foreground">Kp</span> {wind.kp.toFixed(1)}
              </span>
            </div>
            <div className="mt-2">
              <span
                className={`rounded border border-current px-2 py-0.5 text-sm font-semibold ${stateColor}`}
              >
                {state}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* design notes link */}
      <div className="absolute bottom-6 right-6 z-10 sm:right-10">
        <Link
          href="/dream/262-aurora-particle/README.md"
          className="font-mono text-base text-muted-foreground underline decoration-muted-foreground underline-offset-4 hover:text-foreground"
        >
          Read the design notes
        </Link>
      </div>
    </main>
  );
}
