"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2366-solar-wind — "the drone tuned to the real Sun–Earth connection".
//
// Live NOAA SWPC solar-wind + geomagnetic data drives an additive/subtractive
// drone AND a WebGL auroral-curtain shader, through FIVE INDEPENDENT channels
// (speed, density, Bz, Bt, Kp) — never a single master knob. A time-scrub replays
// the Sun's last ~24 hours. Silent until "Begin"; renders beautifully with zero
// network via a bundled fallback snapshot. See README.md.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PrototypeNav } from "../_shared/prototype-nav";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  deriveChannels,
  describeSky,
  fetchSolar,
  FALLBACK_SNAPSHOT,
  VOICE_CONSONANT,
  VOICE_TENSE,
  type Channels,
  type SolarSnapshot,
} from "./solarWind";

const VOICE_COUNT = 7;
const TREM_VOICES = [5, 6]; // top partials carry the Kp shimmer
const SLEW = 0.9; // audio setTargetAtTime time-constant (≈2–3s settle)
const MASTER = 0.2;

interface Voice {
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  gain: GainNode;
  lfo?: OscillatorNode;
  depth?: GainNode;
}

const CHANNEL_KEYS: (keyof Channels)[] = [
  "speedNorm",
  "densityNorm",
  "bzTension",
  "bzSigned",
  "btNorm",
  "kpNorm",
  "auroraNorm",
];

const ZERO_CH: Channels = {
  speedNorm: 0,
  densityNorm: 0,
  bzTension: 0,
  bzSigned: 0,
  btNorm: 0,
  kpNorm: 0,
  auroraNorm: 0,
};

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime, uSpeed, uDensity, uTension, uBz, uBt, uKp, uAurora, uReduced;
  uniform vec2 uRes;

  float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, amp = 0.5;
    for(int i=0;i<5;i++){ v += amp*noise(p); p *= 2.0; amp *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = vUv;
    float aspect = uRes.x / max(uRes.y, 1.0);
    float x = uv.x * aspect;
    float y = uv.y;
    float slow = (uReduced > 0.5) ? 0.3 : 1.0;
    float t = uTime * (0.03 + uKp*0.05) * slow;

    // deep night gradient
    vec3 col = vec3(0.010, 0.013, 0.030) * mix(1.25, 0.45, y);

    // starfield with gentle twinkle (< ~0.5 Hz)
    vec2 sgrid = uv * vec2(aspect, 1.0) * 220.0;
    float sh = hash(floor(sgrid));
    if (sh > 0.985) {
      float tw = 0.5 + 0.5*sin(uTime*(1.0+sh*2.0)+sh*30.0);
      vec2 fp = fract(sgrid) - 0.5;
      float star = smoothstep(0.5, 0.0, length(fp)) * (0.4+0.6*tw) * (sh-0.985)/0.015;
      col += vec3(star);
    }

    // ---- auroral curtains ----
    float wx = x*2.2 + t*0.8;
    float warp = fbm(vec2(wx*0.6, t*0.5));
    float curtain = fbm(vec2(wx + warp*0.9, y*1.4 + t*0.4));
    float stri = 0.5 + 0.5*sin(x*46.0 + warp*7.0 + fbm(vec2(wx*2.0, t))*10.0);
    stri = pow(stri, 1.6);

    float energy = clamp(0.25 + uAurora*0.7 + uSpeed*0.15, 0.0, 1.0);
    float top = 0.15 + energy*0.7;
    float band = smoothstep(0.05, 0.11, y) * (1.0 - smoothstep(top*0.55, top, y));
    float amt = band * smoothstep(0.35, 0.75, curtain) * (0.55 + 0.45*stri);

    // agitation shimmer, hard-clamped <= 3 Hz (safeFlicker ethos)
    float shHz = min(3.0, 0.2 + uKp*2.8);
    amt *= 0.88 + 0.12*sin(6.2831853*shHz*uTime + curtain*6.0);

    // real auroral emission-line palette
    vec3 green   = vec3(0.25, 0.96, 0.60); // O I 557.7 nm
    vec3 red     = vec3(1.00, 0.30, 0.42); // O I 630.0 nm
    vec3 magenta = vec3(0.76, 0.36, 1.00); // N2+ blue/violet fringe

    vec3 ac = green;
    float storm = clamp(uKp*0.7 + uTension*0.6, 0.0, 1.0);
    ac = mix(ac, red, clamp(smoothstep(top*0.35, top, y) * storm, 0.0, 1.0));
    ac = mix(ac, magenta, clamp(stri * smoothstep(0.45, 0.9, uKp) * 0.7, 0.0, 1.0));

    col += ac * amt * (0.9 + uSpeed*0.5);

    // faint low airglow so a calm sky is never truly dead
    float glow = (1.0 - smoothstep(0.0, 0.28, y)) * 0.05 * (0.6 + uBt*0.8);
    col += green * glow;

    // gentle tonemap
    col = col / (col + vec3(0.7));
    col = pow(col, vec3(0.85));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function formatAgo(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 90) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

function formatUtc(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

function fallbackGradient(c: Channels): string {
  const g = "#3ff59a";
  const r = "#ff4d6d";
  const mgt = "#c04dff";
  const tip = c.kpNorm > 0.5 ? mgt : c.bzTension > 0.4 ? r : g;
  const h = Math.round(30 + c.auroraNorm * 45);
  return `linear-gradient(0deg, #04060f 0%, ${g} ${h * 0.4}%, ${tip} ${h}%, #04060f ${Math.min(
    100,
    h + 25,
  )}%)`;
}

export default function SolarWindPage() {
  const [started, setStarted] = useState(false);
  const [glFailed, setGlFailed] = useState(false);
  const [dataMode, setDataMode] = useState<"loading" | "live" | "snapshot">(
    "loading",
  );
  const [asOf, setAsOf] = useState<string>("");
  const [scrubIdx, setScrubIdx] = useState<number | null>(null); // null = live/now
  const [timelineLen, setTimelineLen] = useState(0);
  const [snap, setSnap] = useState<SolarSnapshot>(FALLBACK_SNAPSHOT);
  const [ch, setCh] = useState<Channels>(() => deriveChannels(FALLBACK_SNAPSHOT));
  const [showNotes, setShowNotes] = useState(false);
  const [fbBg, setFbBg] = useState<string>(() =>
    fallbackGradient(deriveChannels(FALLBACK_SNAPSHOT)),
  );

  // visual refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const rafRef = useRef<number>(0);
  const clockRef = useRef<number>(0);
  const targetChRef = useRef<Channels>(deriveChannels(FALLBACK_SNAPSHOT));
  const smoothChRef = useRef<Channels>({ ...ZERO_CH });
  const reducedRef = useRef<boolean>(false);

  // audio refs
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const subOscRef = useRef<OscillatorNode | null>(null);
  const subGainRef = useRef<GainNode | null>(null);
  const voicesRef = useRef<Voice[]>([]);

  // data refs
  const liveNowRef = useRef<SolarSnapshot>(FALLBACK_SNAPSHOT);
  const timelineRef = useRef<SolarSnapshot[] | null>(null);
  const scrubIdxRef = useRef<number | null>(null);

  /* ── push a snapshot into audio + shader targets + UI ─────────────────── */
  const applyTuning = useCallback((s: SolarSnapshot) => {
    const c = deriveChannels(s);
    targetChRef.current = c;
    setCh(c);
    setSnap(s);
    setAsOf(s.timeTag);
    setFbBg(fallbackGradient(c));

    const ctx = ctxRef.current;
    const filter = filterRef.current;
    if (!ctx || !filter) return;
    const now = ctx.currentTime;

    const root = 42 + c.speedNorm * 24; // 42–66 Hz base
    const cutoff = 320 * Math.pow(2600 / 320, c.speedNorm); // speed → brightness
    filter.frequency.setTargetAtTime(cutoff, now, SLEW);

    if (subOscRef.current && subGainRef.current) {
      subOscRef.current.frequency.setTargetAtTime(root, now, SLEW);
      subGainRef.current.gain.setTargetAtTime(0.22 + c.btNorm * 0.5, now, SLEW); // Bt → weight
    }

    const activeCount = 2 + Math.round(c.densityNorm * 5); // density → partials 2–7
    const lfoRate = 0.2 + c.kpNorm * 2.8; // Kp → shimmer rate (<=3 Hz)

    voicesRef.current.forEach((v, i) => {
      const ratio =
        VOICE_CONSONANT[i] + (VOICE_TENSE[i] - VOICE_CONSONANT[i]) * c.bzTension; // Bz → consonance↔tension
      v.oscA.frequency.setTargetAtTime(root * ratio, now, SLEW);
      v.oscB.frequency.setTargetAtTime(root * ratio, now, SLEW);
      const on = i < activeCount ? 1 : 0;
      v.gain.gain.setTargetAtTime(on * (0.42 / ratio), now, SLEW);
      if (v.lfo && v.depth) {
        v.lfo.frequency.setTargetAtTime(lfoRate, now, 0.5);
        v.depth.gain.setTargetAtTime(on * c.kpNorm * 0.18, now, SLEW);
      }
    });
  }, []);

  /* ── build the drone graph on the Begin gesture ───────────────────────── */
  const buildAudio = useCallback(() => {
    if (ctxRef.current) return;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    masterRef.current = master;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.9;
    filter.connect(master);
    filterRef.current = filter;

    // sub oscillator for Bt weight
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = 52;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.0001;
    subOsc.connect(subGain);
    subGain.connect(filter);
    subOsc.start();
    subOscRef.current = subOsc;
    subGainRef.current = subGain;

    const voices: Voice[] = [];
    for (let i = 0; i < VOICE_COUNT; i++) {
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      oscA.type = i < 2 ? "sine" : "triangle";
      oscB.type = oscA.type;
      oscA.detune.value = -6;
      oscB.detune.value = 6; // slow chorus beat
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      oscA.connect(gain);
      oscB.connect(gain);
      gain.connect(filter);
      oscA.start();
      oscB.start();
      const v: Voice = { oscA, oscB, gain };
      if (TREM_VOICES.includes(i)) {
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.5;
        const depth = ctx.createGain();
        depth.gain.value = 0;
        lfo.connect(depth);
        depth.connect(gain.gain); // AM shimmer added to base gain
        lfo.start();
        v.lfo = lfo;
        v.depth = depth;
      }
      voices.push(v);
    }
    voicesRef.current = voices;
  }, []);

  const onBegin = useCallback(() => {
    if (started) return;
    buildAudio();
    const ctx = ctxRef.current;
    const master = masterRef.current;
    if (!ctx || !master) return;
    void ctx.resume();
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(MASTER, now + 1.0); // 1 s fade-in
    setStarted(true);
    // apply whatever we're currently showing (live or scrubbed)
    const cur =
      scrubIdxRef.current != null && timelineRef.current
        ? timelineRef.current[scrubIdxRef.current]
        : liveNowRef.current;
    applyTuning(cur);
  }, [started, buildAudio, applyTuning]);

  /* ── WebGL setup + render loop (visual runs pre-Begin as a soft preview) ─ */
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    } catch {
      setGlFailed(true);
      return;
    }
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uRes: { value: new THREE.Vector2(1, 1) },
        uSpeed: { value: 0 },
        uDensity: { value: 0 },
        uTension: { value: 0 },
        uBz: { value: 0 },
        uBt: { value: 0 },
        uKp: { value: 0 },
        uAurora: { value: 0 },
        uReduced: { value: reducedRef.current ? 1 : 0 },
      },
    });
    materialRef.current = material;
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      material.uniforms.uRes.value.set(w * dpr, h * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    const loop = () => {
      const t = performance.now();
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      clockRef.current += dt;

      // ease shader channels toward target (slow, matches audio slew)
      const s = smoothChRef.current;
      const tgt = targetChRef.current;
      for (const k of CHANNEL_KEYS) s[k] += (tgt[k] - s[k]) * Math.min(1, dt * 0.6);

      const u = material.uniforms;
      u.uTime.value = clockRef.current;
      u.uSpeed.value = s.speedNorm;
      u.uDensity.value = s.densityNorm;
      u.uTension.value = s.bzTension;
      u.uBz.value = s.bzSigned;
      u.uBt.value = s.btNorm;
      u.uKp.value = s.kpNorm;
      u.uAurora.value = s.auroraNorm;

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
      material.dispose();
      renderer.dispose();
      rendererRef.current = null;
      materialRef.current = null;
    };
  }, []);

  /* ── initial fetch + 60 s poll ────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { now, timeline } = await fetchSolar();
      if (cancelled) return;
      if (timeline && timeline.length) {
        timelineRef.current = timeline;
        setTimelineLen(timeline.length);
      }
      if (now) {
        liveNowRef.current = now;
        setDataMode("live");
        if (scrubIdxRef.current == null) applyTuning(now);
      } else {
        setDataMode((m) => (m === "live" ? "live" : "snapshot"));
        if (scrubIdxRef.current == null && timelineRef.current == null) {
          applyTuning(FALLBACK_SNAPSHOT);
        }
      }
    };
    // render the fallback immediately so nothing is ever blank
    applyTuning(FALLBACK_SNAPSHOT);
    void load();
    const id = window.setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [applyTuning]);

  /* ── teardown audio on unmount ────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      voicesRef.current.forEach((v) => {
        try {
          v.oscA.stop();
          v.oscB.stop();
          v.lfo?.stop();
        } catch {
          /* already stopped */
        }
      });
      try {
        subOscRef.current?.stop();
      } catch {
        /* already stopped */
      }
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctxRef.current = null;
    };
  }, []);

  /* ── scrub handler ────────────────────────────────────────────────────── */
  const onScrub = useCallback(
    (raw: number) => {
      const tl = timelineRef.current;
      if (!tl || !tl.length) return;
      const maxIdx = tl.length - 1;
      const idx = Math.max(0, Math.min(maxIdx, raw));
      if (idx >= maxIdx) {
        // snapped to the newest sample → back to LIVE
        scrubIdxRef.current = null;
        setScrubIdx(null);
        applyTuning(liveNowRef.current);
      } else {
        scrubIdxRef.current = idx;
        setScrubIdx(idx);
        applyTuning(tl[idx]);
      }
    },
    [applyTuning],
  );

  const goLive = useCallback(() => {
    scrubIdxRef.current = null;
    setScrubIdx(null);
    applyTuning(liveNowRef.current);
  }, [applyTuning]);

  const isLive = scrubIdx == null;
  const sliderMax = Math.max(1, timelineLen - 1);
  const sliderVal = scrubIdx == null ? sliderMax : scrubIdx;

  /* ── render ───────────────────────────────────────────────────────────── */
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* WebGL canvas (or animated CSS fallback) */}
      {!glFailed ? (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      ) : (
        <div
          className="absolute inset-0 h-full w-full solar-fallback"
          style={{ backgroundImage: fbBg, backgroundSize: "160% 220%" }}
          aria-hidden
        />
      )}
      <style>{`
        @keyframes solarDrift { 0%{background-position:0% 100%} 50%{background-position:100% 60%} 100%{background-position:0% 100%} }
        .solar-fallback { animation: solarDrift 26s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce){ .solar-fallback{ animation-duration: 90s; } }
      `}</style>

      {/* legibility scrims */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent" />

      {/* title + live badge */}
      <div className="absolute left-0 top-0 max-w-xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Solar Wind
          </h1>
          {dataMode === "live" && isLive ? (
            <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs uppercase tracking-[0.18em] text-primary">
              ● live · {formatUtc(asOf)}
            </span>
          ) : dataMode === "snapshot" ? (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              recent snapshot — live feed unavailable
            </span>
          ) : dataMode === "loading" ? (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              reaching the spacecraft…
            </span>
          ) : (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              scrubbed · {formatUtc(asOf)}
            </span>
          )}
        </div>
        <p className="mt-2 text-base text-muted-foreground">
          A drone tuned, right now, to the real solar wind and magnetic field
          between the Sun and the Earth. The sky above does the work.
        </p>
      </div>

      {/* Begin overlay */}
      {!started && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/40 backdrop-blur-[2px]">
          <p className="max-w-md px-6 text-center text-base text-muted-foreground">
            Sound begins on tap. Stand inside the field and listen to what the
            Sun is doing this minute.
          </p>
          <button
            onClick={onBegin}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Begin
          </button>
        </div>
      )}

      {/* bottom control panel */}
      {started && (
        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-16 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-lg border border-border bg-background/60 p-4 backdrop-blur-md">
            {/* live readouts */}
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                the sky is
              </span>
              <span className="text-base text-foreground">{describeSky(ch)}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1 text-sm text-muted-foreground sm:grid-cols-5">
              <Readout label="speed" value={`${Math.round(snap.speed)} km/s`} />
              <Readout label="density" value={`${snap.density.toFixed(1)} p/cc`} />
              <Readout
                label="Bz"
                value={`${snap.bz > 0 ? "+" : ""}${snap.bz.toFixed(1)} nT`}
                hint={snap.bz < 0 ? "south · tense" : "north · open"}
              />
              <Readout label="Bt" value={`${snap.bt.toFixed(1)} nT`} />
              <Readout label="Kp" value={snap.kp.toFixed(1)} />
            </div>

            {/* time-scrub */}
            <div className="mt-4 flex items-center gap-3">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                scrub 24h
              </span>
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={1}
                value={sliderVal}
                disabled={timelineLen === 0}
                onChange={(e) => onScrub(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-primary disabled:opacity-40"
                aria-label="Scrub back through the last 24 hours of solar-wind data"
              />
              <button
                onClick={goLive}
                disabled={isLive}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                {isLive ? "now" : "→ now"}
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {isLive
                ? "showing the live front of the solar wind"
                : `replaying ${formatUtc(asOf)} · ${formatAgo(snap.timeMs)}`}
              {glFailed && " · WebGL unavailable — animated fallback"}
            </p>

            <button
              onClick={() => setShowNotes((s) => !s)}
              className="mt-3 text-sm text-primary underline underline-offset-4 hover:text-primary/80"
            >
              {showNotes ? "hide the design notes" : "how this is tuned"}
            </button>
            {showNotes && (
              <div className="mt-3 space-y-2 rounded-md border border-border bg-background/50 p-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  Five INDEPENDENT channels drive the piece — there is no single
                  calm→peak knob. Wind{" "}
                  <span className="text-foreground">speed</span> sets brightness
                  and base pitch; <span className="text-foreground">density</span>{" "}
                  fills the chord with more partials;{" "}
                  <span className="text-foreground">Bz</span> morphs the harmony
                  between open fifths (northward) and a tense tritone/minor-second
                  shimmer (southward, storm-coupling);{" "}
                  <span className="text-foreground">Bt</span> adds sub-bass weight;
                  and <span className="text-foreground">Kp</span> stirs the aurora
                  and the top-voice tremolo. Because they are independent, the sky
                  can be bright-but-tense or dim-but-calm.
                </p>
                <p>
                  Curtain colours are the real auroral emission lines: oxygen green
                  (557.7 nm) at rest, oxygen red (630 nm) tips and N2+ blue/magenta
                  fringes only under storm energy. Full mapping table and sources
                  in <span className="text-foreground">README.md</span>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <PrototypeNav slugs={["2366-solar-wind"]} />
    </main>
  );
}

function Readout({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span className="text-base text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
