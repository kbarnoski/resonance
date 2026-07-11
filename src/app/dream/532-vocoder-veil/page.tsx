'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NUM_BANDS,
  buildVocoderGraph,
  buildSynthCarrier,
  buildDemoModulator,
  fetchPianoBuffer,
  vowelBandEnvelopes,
  makeBandFreqs,
  VOWELS,
  type VocoderGraph,
  type DemoModulator,
} from './audio';

// ─── Types ─────────────────────────────────────────────────────────────────────

type CarrierMode = 'piano' | 'synth';
type ModulatorMode = 'demo' | 'mic';

interface EngineState {
  ctx: AudioContext | null;
  graph: VocoderGraph | null;
  demoMod: DemoModulator | null;
  pianoSrc: AudioBufferSourceNode | null;
  micStream: MediaStream | null;
  micSrc: MediaStreamAudioSourceNode | null;
  micGain: GainNode | null;
  synthCarrier: AudioNode | null;
  masterGain: GainNode | null;
  bandLevels: Float32Array;
  vowelIdx: number;
  vowelPhase: number; // 0..1 smooth interpolation between vowels
}

// ─── WebGL2 band-ladder visualizer ────────────────────────────────────────────

function tryInitGL(
  canvas: HTMLCanvasElement,
): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2');
}

function drawLadder2D(
  ctx2d: CanvasRenderingContext2D,
  levels: Float32Array,
  w: number,
  h: number,
) {
  ctx2d.fillStyle = '#030108';
  ctx2d.fillRect(0, 0, w, h);

  const pad = 4;
  const barW = (w - pad * (NUM_BANDS + 1)) / NUM_BANDS;

  for (let i = 0; i < NUM_BANDS; i++) {
    const lv = Math.max(0, Math.min(1, levels[i]));
    const x = pad + i * (barW + pad);
    const barH = lv * (h - 2 * pad);
    const y = h - pad - barH;

    const bandT = i / (NUM_BANDS - 1);
    const r = Math.round(120 + bandT * 130);
    const gv = Math.round(20 + bandT * 60);
    const bv = Math.round(200 - bandT * 80);
    const alpha = 0.2 + lv * 0.8;

    ctx2d.fillStyle = `rgba(${r},${gv},${bv},${alpha})`;
    ctx2d.fillRect(x, y, barW, barH);

    // glow cap
    if (lv > 0.04) {
      ctx2d.fillStyle = `rgba(255,205,100,${lv * 0.95})`;
      ctx2d.fillRect(x, y, barW, 3);
    }
  }
}

// Fullscreen-quad vertex shader (no attribute buffers needed — uses gl_VertexID)
const VERT_SRC = `#version 300 es
void main() {
  vec2 pos[6] = vec2[6](
    vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(1.0,1.0),
    vec2(-1.0,-1.0), vec2(1.0,1.0),  vec2(-1.0,1.0)
  );
  gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
}`;

// Fragment shader: draws N vertical bars from band-level uniforms.
// uResolution = vec2(canvasWidth, canvasHeight) in physical pixels.
const FRAG_SRC = `#version 300 es
precision mediump float;
uniform float uLevels[${NUM_BANDS}];
uniform vec2 uResolution;
out vec4 fragColor;

void main() {
  float xScale = float(${NUM_BANDS}) / uResolution.x;
  int band = clamp(int(gl_FragCoord.x * xScale), 0, ${NUM_BANDS - 1});

  float lv = uLevels[band];
  float bandT = float(band) / float(${NUM_BANDS - 1});

  // Warm violet (low) → amber (high)
  vec3 loColor = vec3(0.42, 0.10, 0.76);
  vec3 hiColor = vec3(0.95, 0.56, 0.06);
  vec3 baseColor = mix(loColor, hiColor, bandT);

  // gl_FragCoord.y: 0=bottom in GL. Bar fills from bottom up to lv*height.
  float yNorm = gl_FragCoord.y / uResolution.y;
  float inBar = step(yNorm, lv);

  float capThick = 4.0 / uResolution.y;
  float inCap = step(lv - capThick, yNorm) * step(yNorm, lv + 0.001);

  vec3 bgColor = vec3(0.010, 0.005, 0.022);
  vec3 barColor = baseColor * (0.18 + lv * 0.92);
  vec3 capColor = vec3(1.0, 0.84, 0.38) * clamp(lv * 1.4, 0.0, 1.0);

  vec3 color = mix(bgColor, barColor, inBar);
  color = mix(color, capColor, inCap * inBar);

  // Inter-band gap: darken the rightmost 6% of each band
  float bandFrac = fract(gl_FragCoord.x * xScale);
  float gap = step(bandFrac, 0.94);
  color *= mix(0.25, 1.0, gap);

  fragColor = vec4(color, 1.0);
}`;

interface GLProgram {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uLevels: WebGLUniformLocation;
  uResolution: WebGLUniformLocation;
}

function buildGLProgram(gl: WebGL2RenderingContext): GLProgram | null {
  const compileShader = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('Shader compile error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };

  const vs = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  const fs = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }

  const uLevels = gl.getUniformLocation(program, 'uLevels');
  const uResolution = gl.getUniformLocation(program, 'uResolution');
  if (!uLevels || !uResolution) return null;

  return { gl, program, uLevels, uResolution };
}

function drawLadderGL(glp: GLProgram, levels: Float32Array) {
  const { gl, program, uLevels, uResolution } = glp;
  const w = gl.canvas.width;
  const h = gl.canvas.height;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0.010, 0.005, 0.022, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.uniform1fv(uLevels, levels);
  gl.uniform2f(uResolution, w, h);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function VocoderVeilPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<EngineState>({
    ctx: null,
    graph: null,
    demoMod: null,
    pianoSrc: null,
    micStream: null,
    micSrc: null,
    micGain: null,
    synthCarrier: null,
    masterGain: null,
    bandLevels: new Float32Array(NUM_BANDS),
    vowelIdx: 0,
    vowelPhase: 0,
  });
  const glProgramRef = useRef<GLProgram | null>(null);
  const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
  const freqsRef = useRef<number[]>(makeBandFreqs());
  // Smoothed levels used only by the visualizer, in a ref to avoid React renders
  const smoothedLevelsRef = useRef<Float32Array>(new Float32Array(NUM_BANDS));

  const [started, setStarted] = useState(false);
  const [carrierMode, setCarrierMode] = useState<CarrierMode>('piano');
  const [modulatorMode, setModulatorMode] = useState<ModulatorMode>('demo');
  const [micError, setMicError] = useState<string | null>(null);
  const [carrierError, setCarrierError] = useState<string | null>(null);
  const [webglFallback, setWebglFallback] = useState(false);
  const [intensity, setIntensity] = useState(0.8);
  const [carrierPitch, setCarrierPitch] = useState(0); // semitones -12..+12
  // Active vowel index for UI indicator
  const [activeVowel, setActiveVowel] = useState(0);
  // Ref for carrier pitch to avoid stale closure in buildEngine
  const carrierPitchRef = useRef(0);

  // ── Visualizer init (runs once after mount) ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = tryInitGL(canvas);
    if (gl) {
      const built = buildGLProgram(gl);
      if (built) {
        glProgramRef.current = built;
      } else {
        setWebglFallback(true);
        ctx2dRef.current = canvas.getContext('2d');
      }
    } else {
      setWebglFallback(true);
      ctx2dRef.current = canvas.getContext('2d');
    }
  }, []);

  // ── Canvas resize ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const applySize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Continuous animation loop ────────────────────────────────────────────────
  useEffect(() => {
    let rafId = 0;
    let t = 0;
    let lastVowelUpdate = 0;
    const analyserBuf = new Uint8Array(128);

    const tick = (now: number) => {
      rafId = requestAnimationFrame(tick);
      t += 0.016;

      const eng = engineRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const sl = smoothedLevelsRef.current;

      // ── Read band levels from Web Audio analyser nodes ────────────────────
      if (eng.graph && eng.ctx && eng.ctx.state === 'running') {
        for (let i = 0; i < NUM_BANDS; i++) {
          const analyser = eng.graph.analysers[i];
          analyser.getByteTimeDomainData(analyserBuf);
          let rms = 0;
          for (let j = 0; j < analyserBuf.length; j++) {
            const s = (analyserBuf[j] - 128) / 128;
            rms += s * s;
          }
          const level = Math.sqrt(rms / analyserBuf.length);
          // Smooth: fast attack, slow decay
          const target = level * 12;
          sl[i] = sl[i] < target
            ? sl[i] * 0.5 + target * 0.5
            : sl[i] * 0.88 + target * 0.12;
          sl[i] = Math.min(1, sl[i]);
        }
      } else {
        // Pre-start or paused: animate a vowel-cycle preview
        const vIdx = eng.vowelIdx;
        const v0 = VOWELS[vIdx % VOWELS.length];
        const v1 = VOWELS[(vIdx + 1) % VOWELS.length];
        const phase = eng.vowelPhase;
        const f1 = v0.f1 + (v1.f1 - v0.f1) * phase;
        const f2 = v0.f2 + (v1.f2 - v0.f2) * phase;
        const envs = vowelBandEnvelopes(f1, f2, freqsRef.current);
        const pulse = 0.45 + 0.45 * Math.sin(t * 3.2);
        for (let i = 0; i < NUM_BANDS; i++) {
          const target = envs[i] * pulse * 0.65;
          sl[i] = sl[i] * 0.85 + target * 0.15;
        }
        eng.vowelPhase += 0.007;
        if (eng.vowelPhase >= 1) {
          eng.vowelPhase = 0;
          eng.vowelIdx = (eng.vowelIdx + 1) % VOWELS.length;
        }
        // Throttle vowel UI update
        if (now - lastVowelUpdate > 300) {
          lastVowelUpdate = now;
          setActiveVowel(eng.vowelIdx);
        }
      }

      // Copy to eng.bandLevels for any external reads
      for (let i = 0; i < NUM_BANDS; i++) {
        eng.bandLevels[i] = sl[i];
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      const glp = glProgramRef.current;
      const ctx2d = ctx2dRef.current;
      const W = canvas.width;
      const H = canvas.height;

      if (glp) {
        drawLadderGL(glp, sl);
      } else if (ctx2d) {
        drawLadder2D(ctx2d, sl, W, H);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []); // runs once; reads engine via refs

  // ── Build audio engine (called on first user gesture) ────────────────────────
  const buildEngine = useCallback(async () => {
    const eng = engineRef.current;
    if (eng.ctx) return; // already built

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    eng.ctx = ctx;

    // Master chain: vocoderOutput → masterGain → LP → limiter → destination
    const masterGain = ctx.createGain();
    masterGain.gain.value = intensity * 0.9;
    eng.masterGain = masterGain;

    const outputLP = ctx.createBiquadFilter();
    outputLP.type = 'lowpass';
    outputLP.frequency.value = 7500;
    outputLP.Q.value = 0.5;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 16;
    limiter.knee.value = 3;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;

    masterGain.connect(outputLP);
    outputLP.connect(limiter);
    limiter.connect(ctx.destination);

    // Build vocoder graph
    const graph = buildVocoderGraph(ctx);
    eng.graph = graph;
    graph.output.connect(masterGain);

    // Start demo modulator (always active initially)
    const demoMod = buildDemoModulator(ctx);
    eng.demoMod = demoMod;
    demoMod.output.connect(graph.modulatorInput);

    // Load carrier: try Karel's piano first, fall back to synth
    setCarrierError(null);
    const pianoBuf = await fetchPianoBuffer(ctx);
    if (pianoBuf) {
      const src = ctx.createBufferSource();
      src.buffer = pianoBuf;
      src.loop = true;
      src.detune.value = carrierPitchRef.current * 100;
      src.connect(graph.carrierInput);
      src.start();
      eng.pianoSrc = src;
      setCarrierMode('piano');
    } else {
      const synthNode = buildSynthCarrier(ctx);
      synthNode.connect(graph.carrierInput);
      eng.synthCarrier = synthNode;
      setCarrierMode('synth');
      setCarrierError('Piano audio unavailable — using synth carrier');
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    setStarted(true);
    setModulatorMode('demo');
  }, [intensity]); // intensity used for initial masterGain value

  // ── Switch to mic modulator ──────────────────────────────────────────────────
  const switchToMic = useCallback(async () => {
    const eng = engineRef.current;
    const ctx = eng.ctx;
    const graph = eng.graph;
    if (!ctx || !graph) return;

    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      eng.micStream = stream;
      const micSrc = ctx.createMediaStreamSource(stream);
      const micGain = ctx.createGain();
      micGain.gain.value = 3.0;
      micSrc.connect(micGain);
      micGain.connect(graph.modulatorInput);
      eng.micSrc = micSrc;
      eng.micGain = micGain;

      // Stop demo modulator
      if (eng.demoMod) {
        eng.demoMod.stop();
        try { eng.demoMod.output.disconnect(); } catch { /* noop */ }
        eng.demoMod = null;
      }

      setModulatorMode('mic');
    } catch (err) {
      setMicError(
        err instanceof Error
          ? `Mic denied: ${err.message} — auto-demo keeps running`
          : 'Microphone permission denied — auto-demo keeps running',
      );
    }
  }, []);

  // ── Switch back to demo modulator ────────────────────────────────────────────
  const switchToDemo = useCallback(() => {
    const eng = engineRef.current;
    const ctx = eng.ctx;
    const graph = eng.graph;
    if (!ctx || !graph) return;

    if (eng.micSrc) {
      try { eng.micSrc.disconnect(); } catch { /* noop */ }
      eng.micSrc = null;
    }
    if (eng.micGain) {
      try { eng.micGain.disconnect(); } catch { /* noop */ }
      eng.micGain = null;
    }
    if (eng.micStream) {
      eng.micStream.getTracks().forEach(t => t.stop());
      eng.micStream = null;
    }

    const demoMod = buildDemoModulator(ctx);
    eng.demoMod = demoMod;
    demoMod.output.connect(graph.modulatorInput);

    setModulatorMode('demo');
    setMicError(null);
  }, []);

  // ── Live carrier pitch update ────────────────────────────────────────────────
  useEffect(() => {
    carrierPitchRef.current = carrierPitch;
    const eng = engineRef.current;
    if (eng.pianoSrc && eng.ctx) {
      eng.pianoSrc.detune.setTargetAtTime(carrierPitch * 100, eng.ctx.currentTime, 0.08);
    }
  }, [carrierPitch]);

  // ── Live intensity update ────────────────────────────────────────────────────
  useEffect(() => {
    const eng = engineRef.current;
    if (eng.masterGain && eng.ctx) {
      eng.masterGain.gain.setTargetAtTime(intensity * 0.9, eng.ctx.currentTime, 0.05);
    }
  }, [intensity]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const eng = engineRef.current;
      try { eng.demoMod?.stop(); } catch { /* noop */ }
      try { eng.pianoSrc?.stop(); } catch { /* noop */ }
      eng.micStream?.getTracks().forEach(t => t.stop());
      if (eng.ctx && eng.ctx.state !== 'closed') {
        eng.ctx.close().catch(() => { /* noop */ });
      }
    };
  }, []);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#050208] text-foreground flex flex-col select-none">
      {/* Header */}
      <div className="px-5 pt-6 pb-3 flex items-start justify-between max-w-2xl mx-auto w-full">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-wide">
            Vocoder Veil
          </h1>
          <p className="text-base text-muted-foreground mt-1 leading-snug">
            Speak or sing — your voice becomes the shape,{' '}
            <span className="text-muted-foreground">Karel&apos;s piano becomes the voice.</span>
          </p>
        </div>
        <a
          href="#notes"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1 shrink-0 ml-4"
        >
          design notes ↓
        </a>
      </div>

      {/* Visualization canvas */}
      <div className="mx-auto w-full max-w-2xl px-4">
        <div
          className="relative rounded-2xl overflow-hidden"
          style={{ height: 220, background: '#030108' }}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
          />
          {/* Band freq labels */}
          <div className="absolute bottom-2 inset-x-0 flex justify-between px-3 pointer-events-none">
            <span className="font-mono text-[10px] text-muted-foreground/70">120 Hz</span>
            <span className="font-mono text-[10px] text-muted-foreground/70">~1 kHz</span>
            <span className="font-mono text-[10px] text-muted-foreground/70">7 kHz</span>
          </div>
          {/* Status badge */}
          <div className="absolute top-3 right-3 flex items-center gap-1.5">
            {started ? (
              <>
                <span
                  className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    modulatorMode === 'mic' ? 'bg-violet-400' : 'bg-violet-400'
                  }`}
                />
                <span className="text-xs text-muted-foreground font-mono">
                  {modulatorMode === 'mic' ? 'mic live' : 'auto-demo'}
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-violet-500/50" />
                <span className="text-xs text-muted-foreground/70 font-mono">idle</span>
              </>
            )}
          </div>
          {webglFallback && (
            <div className="absolute top-3 left-3">
              <span className="text-[10px] text-violet-300/70 font-mono">canvas2d fallback</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mx-auto w-full max-w-2xl px-4 mt-5 space-y-4 pb-12">
        {/* Start button / modulator toggle */}
        {!started ? (
          <div className="space-y-2">
            <button
              onClick={() => { void buildEngine(); }}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl text-base font-medium bg-violet-600 hover:bg-violet-500 text-foreground transition-colors"
            >
              ▶ &thinsp;Wake the Vocoder
            </button>
            <p className="text-sm text-muted-foreground text-center">
              Plays instantly in auto-demo mode — no mic needed.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {modulatorMode === 'demo' ? (
              <button
                onClick={() => { void switchToMic(); }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-base font-medium bg-violet-700 hover:bg-violet-600 text-foreground transition-colors"
              >
                🎤 &thinsp;Use my voice
              </button>
            ) : (
              <button
                onClick={switchToDemo}
                className="min-h-[44px] px-4 py-2.5 rounded-xl text-base font-medium bg-violet-800 hover:bg-violet-700 text-foreground transition-colors"
              >
                ← &thinsp;Auto-demo
              </button>
            )}
            <div className="flex items-center gap-2 bg-muted rounded-xl px-3 min-h-[44px]">
              <span className="text-sm text-muted-foreground shrink-0">carrier:</span>
              <span
                className={`text-sm font-mono ${
                  carrierMode === 'piano' ? 'text-violet-300/95' : 'text-muted-foreground'
                }`}
              >
                {carrierMode === 'piano' ? 'piano ♩' : 'synth ~'}
              </span>
            </div>
          </div>
        )}

        {/* Error / status messages */}
        {micError && (
          <p className="text-base text-violet-300 leading-snug">{micError}</p>
        )}
        {carrierError && (
          <p className="text-base text-violet-300/95 leading-snug">{carrierError}</p>
        )}

        {/* Sliders */}
        {started && (
          <div className="space-y-4 pt-1">
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm text-muted-foreground">Vocoder intensity</label>
                <span className="font-mono text-sm text-muted-foreground">{Math.round(intensity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.01}
                value={intensity}
                onChange={e => setIntensity(Number(e.target.value))}
                className="w-full accent-violet-400"
              />
            </div>

            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-sm text-muted-foreground">Carrier pitch shift</label>
                <span className="font-mono text-sm text-muted-foreground">
                  {carrierPitch > 0 ? '+' : ''}{carrierPitch} st
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={carrierPitch}
                onChange={e => setCarrierPitch(Number(e.target.value))}
                className="w-full accent-violet-400"
              />
            </div>
          </div>
        )}

        {/* Vowel indicator (demo mode) */}
        {modulatorMode === 'demo' && (
          <div className="flex gap-2 justify-center pt-1">
            {VOWELS.map((v, i) => (
              <span
                key={v.name}
                className={`font-mono text-sm px-2 py-1 rounded transition-all duration-300 ${
                  activeVowel === i
                    ? 'bg-violet-500/40 text-foreground'
                    : 'text-muted-foreground/70'
                }`}
              >
                {v.name}
              </span>
            ))}
          </div>
        )}

        {/* Explainer */}
        <div className="border border-border rounded-xl px-4 py-3 space-y-2 mt-2">
          <p className="text-base text-muted-foreground leading-relaxed">
            A <strong className="text-foreground">channel vocoder</strong> splits both your voice and
            the piano into {NUM_BANDS} frequency bands. Your voice&apos;s energy in each band controls
            how much of the corresponding piano band comes through — so the piano speaks in your
            formants.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Classic sibilance fix: broadband noise mixes into the carrier so &ldquo;s&rdquo; and
            &ldquo;sh&rdquo; sounds pass clearly. Tap the visualization bars = the live filterbank.
          </p>
        </div>

        {/* Notes anchor + link */}
        <div id="notes" className="pt-2">
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            Technique refs: Homer Dudley — Bell Labs Vocoder (1939) · Wendy Carlos &amp; Robert Moog
            (vocoder on <em>A Clockwork Orange</em>) · Imogen Heap — &ldquo;Hide and Seek&rdquo;.{' '}
            <a
              href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/532-vocoder-veil/README.md"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
            >
              Read the full design notes →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
