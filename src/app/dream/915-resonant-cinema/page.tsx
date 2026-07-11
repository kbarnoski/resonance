"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Resonant Cinema (915)
//
// THE ONE QUESTION: What if your playing could dream a short film of itself —
// your music distilled into a single still image, then bloomed into a living
// video, which your own live sound keeps animating?
//
// An AI-pipeline-CHAIN piece. A true two-model series: audio → image → video.
//   audio mood  →  flux-schnell (a still seed)  →  ltx-video (a living clip)
// The human plays; the AI only dreams the canvas. The live FFT is the ongoing
// ANIMATOR — it drives a fragment-shader pass over the AI video every frame.
//
// Cost safety: the FAL chain fires ONLY on an explicit "Dream the film" click.
// Page load, idle, and the "dreaming…" state all use a synthesized GPU nebula
// driven by the same audio — a hands-off glance is always a living, sounding
// scene. Reference: Refik Anadol's latent cinema (Machine Hallucinations).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ── Audio feature frame, read off the AnalyserNode every animation frame. ──
interface MoodFrame {
  energy: number; // RMS / loudness, 0–1
  centroid: number; // spectral brightness, 0–1
  flux: number; // frame-to-frame spectral motion, 0–1
  hue: number; // rough dominant hue, 0–1 (color only)
}

// ── Prompt-synthesis mapping. Mood → poetic cinematic phrase. ──
// Pitch is deliberately dumb (one drone root); the idea lives in texture/image.
function buildPrompt(m: MoodFrame): string {
  const bright = m.centroid > 0.5;
  const energetic = m.energy > 0.42;
  let base: string;
  if (bright && energetic) {
    base =
      "luminous cinematic, golden particulate light, soaring volumetric rays, " +
      "warm bloom, lens flares, vast bright sky";
  } else if (bright && !energetic) {
    base =
      "pale dawn haze, glassy reflections, soft pastel light, quiet shimmer, " +
      "delicate cinematic stillness";
  } else if (!bright && energetic) {
    base =
      "stormy crimson nebula, churning smoke, dramatic chiaroscuro, embers, " +
      "turbulent cinematic energy";
  } else {
    base =
      "deep indigo nebula, slow drift, glassy reflections, cold starlight, " +
      "cinematic, volumetric depth";
  }
  const hueDeg = Math.round(m.hue * 360);
  return `${base}, dominant hue ${hueDeg} degrees, 35mm film grain, ultra-detailed, atmospheric`;
}

// ── Hue from spectrum: weight bin index by magnitude → 0–1, smoothed. ──
function spectrumHue(freq: Uint8Array): number {
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < freq.length; i++) {
    const v = freq[i] / 255;
    weighted += i * v;
    total += v;
  }
  const norm = total > 0 ? weighted / total / freq.length : 0;
  // Map low→warm (red/orange ~0.05), high→cool (blue/violet ~0.7).
  return 0.05 + norm * 0.65;
}

// ── GLSL: live shader pass shared by nebula fallback and video compositing. ──
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Fallback nebula: a raymarched-ish layered shader cloud, audio-driven.
const NEBULA_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uCentroid;
  uniform float uFlux;
  uniform float uHue;
  uniform vec2 uRes;

  // hash / value noise
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i+vec2(0,0)), hash(i+vec2(1,0)), u.x),
               mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0; float a = 0.5;
    for(int i=0;i<6;i++){ v += a*noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }
  vec3 hsl2rgb(float h, float s, float l){
    vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
    return l + s*(rgb-0.5)*(1.0-abs(2.0*l-1.0));
  }
  void main(){
    vec2 uv = (vUv - 0.5) * vec2(uRes.x/uRes.y, 1.0);
    float t = uTime * (0.05 + uEnergy * 0.25);
    // drifting domain-warped cloud
    vec2 q = vec2(fbm(uv*2.0 + t), fbm(uv*2.0 - t + 5.2));
    float n = fbm(uv*3.0 + q*(1.5 + uFlux*3.0) + t*0.5);
    float density = smoothstep(0.2, 0.9, n);
    // radial vignette glow pulsing with energy
    float r = length(uv);
    float glow = exp(-r*r*(2.2 - uEnergy*1.4));
    float hueShift = uHue + n*0.15 + uCentroid*0.1;
    vec3 col = hsl2rgb(fract(hueShift), 0.6 + uCentroid*0.3, 0.18 + density*0.45);
    col += glow * (0.4 + uEnergy*0.8) * hsl2rgb(fract(hueShift+0.08), 0.7, 0.5);
    // sparkle field scaled by brightness
    float spark = pow(noise(uv*60.0 + t*4.0), 14.0) * (0.3 + uCentroid);
    col += spark;
    // exposure / bloom from centroid
    col *= 1.0 + uCentroid * 0.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Video compositing: sample the AI clip, then displace/bloom/RGB-split live.
const VIDEO_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uCentroid;
  uniform float uFlux;

  void main(){
    vec2 uv = vUv;
    // displacement / ripple amplitude  ∝ energy
    float amp = uEnergy * 0.035;
    uv.x += sin(uv.y * 24.0 + uTime * 2.0) * amp;
    uv.y += cos(uv.x * 20.0 + uTime * 1.6) * amp * 0.8;
    // chromatic aberration / RGB split  ∝ flux
    vec2 dir = uv - 0.5;
    float split = uFlux * 0.02 + 0.0015;
    float rC = texture2D(uTex, uv + dir * split).r;
    float gC = texture2D(uTex, uv).g;
    float bC = texture2D(uTex, uv - dir * split).b;
    vec3 col = vec3(rC, gC, bC);
    // bloom / exposure  ∝ centroid
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 bloom = col * smoothstep(0.55, 1.0, lum);
    col += bloom * (0.4 + uCentroid * 1.1);
    col *= 1.0 + uCentroid * 0.35;
    // subtle vignette for the cinematic frame
    float vig = smoothstep(1.3, 0.35, length(dir));
    col *= 0.55 + 0.45 * vig;
    gl_FragColor = vec4(col, 1.0);
  }
`;

type Phase = "intro" | "live" | "dreaming" | "film" | "error";

export default function ResonantCinema() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [started, setStarted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [moodLabel, setMoodLabel] = useState("listening…");
  const [webglOk, setWebglOk] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Audio graph refs.
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqRef = useRef<Uint8Array | null>(null);
  const prevSpectrumRef = useRef<Float32Array | null>(null);
  const padNodesRef = useRef<{ stop: () => void } | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const padGainRef = useRef<GainNode | null>(null);

  // Three.js refs.
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const nebulaMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const videoMatRef = useRef<THREE.ShaderMaterial | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const videoTexRef = useRef<THREE.VideoTexture | null>(null);
  const rafRef = useRef<number>(0);

  // Latest mood, smoothed — read by render loop and the prompt builder.
  const moodRef = useRef<MoodFrame>({
    energy: 0,
    centroid: 0.3,
    flux: 0,
    hue: 0.6,
  });

  // ── Build the generative ambient piano-pad bed (one fixed drone root). ──
  const buildPad = useCallback((ctx: AudioContext, dest: AudioNode) => {
    const root = 110; // A2 — one fixed drone root. Pitch is deliberately dumb.
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(dest);

    // Lowpass with a slow LFO.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.Q.value = 0.6;
    lp.connect(master);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.06;
    lfoGain.gain.value = 480;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    // Simple feedback-delay "reverb" send.
    const send = ctx.createGain();
    send.gain.value = 0.32;
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 0.33;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1800;
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(lp);
    send.connect(delay);

    // Detuned saw/triangle/sine stacks over the single root.
    const specs: Array<{ type: OscillatorType; mult: number; detune: number; g: number }> = [
      { type: "sine", mult: 0.5, detune: 0, g: 0.5 },
      { type: "triangle", mult: 1, detune: -6, g: 0.42 },
      { type: "sawtooth", mult: 1, detune: 7, g: 0.16 },
      { type: "triangle", mult: 2, detune: 4, g: 0.18 },
      { type: "sine", mult: 3, detune: -3, g: 0.1 },
    ];
    const oscs: OscillatorNode[] = [];
    for (const s of specs) {
      const o = ctx.createOscillator();
      o.type = s.type;
      o.frequency.value = root * s.mult;
      o.detune.value = s.detune;
      const g = ctx.createGain();
      g.gain.value = s.g;
      o.connect(g);
      g.connect(lp);
      g.connect(send);
      o.start();
      oscs.push(o);
    }

    padGainRef.current = master;
    // Fade the bed in.
    master.gain.setTargetAtTime(0.24, ctx.currentTime, 1.4);

    return {
      stop: () => {
        try {
          oscs.forEach((o) => o.stop());
          lfo.stop();
        } catch {
          /* already stopped */
        }
      },
    };
  }, []);

  // ── Read one analysis frame off the AnalyserNode. ──
  const readMood = useCallback((): MoodFrame => {
    const analyser = analyserRef.current;
    const freq = freqRef.current;
    if (!analyser || !freq) return moodRef.current;
    analyser.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>);

    const bins = freq.length;
    const sampleRate = ctxRef.current?.sampleRate ?? 44100;
    const binHz = sampleRate / analyser.fftSize;

    let sum = 0;
    let weighted = 0;
    let weight = 0;
    let flux = 0;
    const prev = prevSpectrumRef.current;
    for (let i = 0; i < bins; i++) {
      const v = freq[i] / 255;
      sum += v * v;
      weighted += i * binHz * v;
      weight += v;
      if (prev) {
        const d = v - prev[i];
        if (d > 0) flux += d;
        prev[i] = v;
      }
    }
    const rms = Math.sqrt(sum / bins);
    const centroidHz = weight > 0 ? weighted / weight : 0;

    // Normalize: brightness via log of centroid, flux per bin.
    const centroid = Math.max(0, Math.min(1, Math.log2(centroidHz / 110 + 1) / 7));
    const energy = Math.max(0, Math.min(1, rms * 2.4));
    const fluxN = Math.max(0, Math.min(1, flux / bins * 6));
    const hue = spectrumHue(freq);

    // Smooth (EMA) so visuals don't jitter.
    const m = moodRef.current;
    m.energy = m.energy * 0.85 + energy * 0.15;
    m.centroid = m.centroid * 0.85 + centroid * 0.15;
    m.flux = m.flux * 0.7 + fluxN * 0.3;
    m.hue = m.hue * 0.92 + hue * 0.08;
    return m;
  }, []);

  // ── three.js setup: orthographic fullscreen quad with two materials. ──
  const initThree = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setWebglOk(false);
      return false;
    }
    if (!renderer.getContext()) {
      setWebglOk(false);
      return false;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    sceneRef.current = scene;
    cameraRef.current = camera;

    const nebulaMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: NEBULA_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uCentroid: { value: 0.3 },
        uFlux: { value: 0 },
        uHue: { value: 0.6 },
        uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
    });
    const videoMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: VIDEO_FRAG,
      uniforms: {
        uTex: { value: null },
        uTime: { value: 0 },
        uEnergy: { value: 0 },
        uCentroid: { value: 0.3 },
        uFlux: { value: 0 },
      },
    });
    nebulaMatRef.current = nebulaMat;
    videoMatRef.current = videoMat;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), nebulaMat);
    meshRef.current = mesh;
    scene.add(mesh);
    return true;
  }, []);

  // ── The single render loop. Always runs once started. ──
  const renderLoop = useCallback(() => {
    rafRef.current = requestAnimationFrame(renderLoop);
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    const m = readMood();
    const t = performance.now() / 1000;

    const nMat = nebulaMatRef.current;
    if (nMat) {
      nMat.uniforms.uTime.value = t;
      nMat.uniforms.uEnergy.value = m.energy;
      nMat.uniforms.uCentroid.value = m.centroid;
      nMat.uniforms.uFlux.value = m.flux;
      nMat.uniforms.uHue.value = m.hue;
    }
    const vMat = videoMatRef.current;
    if (vMat) {
      vMat.uniforms.uTime.value = t;
      vMat.uniforms.uEnergy.value = m.energy;
      vMat.uniforms.uCentroid.value = m.centroid;
      vMat.uniforms.uFlux.value = m.flux;
    }
    if (videoTexRef.current) videoTexRef.current.needsUpdate = true;

    renderer.render(scene, camera);

    // Cheap mood label for the HUD, updated a few times a second.
    if (Math.random() < 0.04) {
      const bright = m.centroid > 0.5 ? "bright" : "dark";
      const drive = m.energy > 0.42 ? "energetic" : "calm";
      setMoodLabel(`${bright} · ${drive}`);
    }
  }, [readMood]);

  // ── Start everything from the user's first gesture (audio + GPU). ──
  const start = useCallback(async () => {
    if (started) return;
    const Ctx: typeof AudioContext =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;
    await ctx.resume();

    // Master limiter chain.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.26; // ≤ 0.26 master ceiling
    limiter.connect(masterGain);
    masterGain.connect(ctx.destination);

    // Analyser — fed by whatever source is active (pad or mic).
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    analyserRef.current = analyser;
    freqRef.current = new Uint8Array(
      new ArrayBuffer(analyser.frequencyBinCount)
    );
    prevSpectrumRef.current = new Float32Array(analyser.frequencyBinCount);

    // Pad bed → analyser + audible chain.
    const pad = buildPad(ctx, limiter);
    padNodesRef.current = pad;
    padGainRef.current?.connect(analyser);

    if (!initThree()) {
      // No WebGL — audio still plays; UI shows fallback note.
      setStarted(true);
      setPhase("live");
      return;
    }
    setStarted(true);
    setPhase("live");
    rafRef.current = requestAnimationFrame(renderLoop);
  }, [started, buildPad, initThree, renderLoop]);

  // ── Toggle mic as the analysis source (graceful fallback if denied). ──
  const toggleMic = useCallback(async () => {
    const ctx = ctxRef.current;
    const analyser = analyserRef.current;
    if (!ctx || !analyser) return;

    if (micOn) {
      micSourceRef.current?.disconnect();
      micSourceRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      padGainRef.current?.connect(analyser);
      setMicOn(false);
      setMicNote(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      const src = ctx.createMediaStreamSource(stream);
      micSourceRef.current = src;
      // Swap analysis source to live mic (not routed to destination → no feedback).
      padGainRef.current?.disconnect(analyser);
      src.connect(analyser);
      setMicOn(true);
      setMicNote("Live mic is now animating the canvas.");
    } catch {
      setMicNote("Microphone unavailable — staying with the ambient bed.");
      setMicOn(false);
    }
  }, [micOn]);

  // ── THE EXPLICIT, PAID ACTION. Two-model FAL chain. Click only. ──
  const dreamTheFilm = useCallback(async () => {
    if (phase === "dreaming") return; // disabled while in flight
    setErrorMsg(null);
    setPhase("dreaming");
    const prompt = buildPrompt(moodRef.current);
    try {
      const res = await fetch("/dream/915-resonant-cinema/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as {
        imageUrl?: string;
        videoUrl?: string;
        error?: string;
      };
      if (!res.ok || data.error || !data.videoUrl) {
        setErrorMsg(
          data.error ??
            "The dream did not return a film. Falling back to the live nebula."
        );
        setPhase("error");
        return;
      }

      // Load the AI video and bind it as a three.js texture.
      const video = document.createElement("video");
      video.src = data.videoUrl;
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.crossOrigin = "anonymous";
      video.autoplay = true;
      await video.play().catch(() => {
        /* autoplay may need the existing gesture; texture still updates */
      });
      videoElRef.current = video;

      const tex = new THREE.VideoTexture(video);
      tex.colorSpace = THREE.SRGBColorSpace;
      videoTexRef.current = tex;

      const vMat = videoMatRef.current;
      const mesh = meshRef.current;
      if (vMat && mesh) {
        vMat.uniforms.uTex.value = tex;
        mesh.material = vMat; // swap nebula → live-composited AI film
      }
      setPhase("film");
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("error");
    }
  }, [phase]);

  // ── Resize handling. ──
  useEffect(() => {
    function onResize() {
      const r = rendererRef.current;
      if (!r) return;
      r.setSize(window.innerWidth, window.innerHeight, false);
      const nMat = nebulaMatRef.current;
      if (nMat)
        (nMat.uniforms.uRes.value as THREE.Vector2).set(
          window.innerWidth,
          window.innerHeight
        );
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── Teardown. ──
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      padNodesRef.current?.stop();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      videoElRef.current?.pause();
      videoTexRef.current?.dispose();
      rendererRef.current?.dispose();
      void ctxRef.current?.close();
    };
  }, []);

  const dreaming = phase === "dreaming";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-foreground">
      {/* GPU canvas — always behind the UI once started. */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full"
        style={{ display: started && webglOk ? "block" : "none" }}
      />

      {/* Intro / start gate. */}
      {!started && (
        <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
          <h1 className="font-mono text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Resonant Cinema
          </h1>
          <p className="text-base leading-relaxed text-muted-foreground">
            Your playing dreams a short film of itself: your sound is distilled
            into a single still image, bloomed into a living video, and then
            kept moving — frame by frame — by your own live audio.
          </p>
          <button
            onClick={start}
            className="min-h-[44px] rounded-lg border border-border bg-muted px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:border-violet-300/70 hover:bg-accent"
          >
            Begin — start the ambient bed
          </button>
          <p className="text-base text-muted-foreground">
            A living nebula plays on load. Nothing is sent anywhere until you
            click <span className="text-violet-200/90">Dream the film</span>.
          </p>
        </div>
      )}

      {/* Live HUD once started. */}
      {started && (
        <div className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="pointer-events-auto max-w-md">
              <h1 className="font-mono text-xl font-semibold tracking-tight text-foreground drop-shadow">
                Resonant Cinema
              </h1>
              <p className="mt-1 text-base text-muted-foreground drop-shadow">
                {phase === "film"
                  ? "The AI film is live; your audio is animating it."
                  : "A synthesized nebula, driven by your sound."}
              </p>
            </div>
            <a
              href="#design-notes"
              className="pointer-events-auto font-mono text-base text-violet-200/80 underline underline-offset-4 transition-colors hover:text-violet-200"
            >
              Read the design notes
            </a>
          </div>

          <div className="pointer-events-auto flex flex-col items-center gap-3 pb-2">
            <div className="font-mono text-base text-muted-foreground drop-shadow">
              mood: <span className="text-foreground">{moodLabel}</span>
            </div>

            {errorMsg && (
              <p className="max-w-md text-center text-base text-violet-300 drop-shadow">
                {errorMsg}
              </p>
            )}
            {micNote && (
              <p className="max-w-md text-center text-base text-muted-foreground drop-shadow">
                {micNote}
              </p>
            )}
            {!webglOk && (
              <p className="max-w-md text-center text-base text-violet-300 drop-shadow">
                WebGL is unavailable on this device — the ambient bed still
                plays, but the visual canvas is disabled.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={dreamTheFilm}
                disabled={dreaming}
                className="min-h-[44px] rounded-lg border border-violet-300/50 bg-violet-300/10 px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:border-violet-300/80 hover:bg-violet-300/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {dreaming ? "dreaming the film…" : "Dream the film"}
              </button>
              <button
                onClick={toggleMic}
                className="min-h-[44px] rounded-lg border border-border bg-muted px-4 py-2.5 font-mono text-base text-foreground transition-colors hover:border-border hover:bg-accent"
              >
                {micOn ? "use ambient bed" : "use microphone"}
              </button>
            </div>
            <p className="max-w-md text-center text-base text-muted-foreground drop-shadow">
              Each dream calls a paid two-model AI chain
              (flux-schnell → LTX-Video). It fires only on your click.
            </p>
          </div>
        </div>
      )}

      {/* Anchor target for the in-corner design-notes link. */}
      <section
        id="design-notes"
        className="relative z-10 mx-auto max-w-2xl px-6 py-16 text-muted-foreground"
      >
        <h2 className="font-mono text-xl font-semibold text-foreground">
          Design notes
        </h2>
        <p className="mt-3 text-base leading-relaxed">
          A two-model AI pipeline chain: audio → image → video. Your live sound
          synthesizes a poetic prompt; flux-schnell dreams a still seed; LTX
          Video blooms that still into a short clip; then your ongoing FFT runs
          a fragment-shader pass over the clip every frame — ripple from energy,
          bloom from brightness, RGB-split from spectral flux. Before the first
          dream, and on any error, a synthesized GPU nebula keeps the scene
          alive. See <span className="font-mono text-violet-200/90">README.md</span>{" "}
          in this folder for the full write-up and references.
        </p>
      </section>
    </main>
  );
}
