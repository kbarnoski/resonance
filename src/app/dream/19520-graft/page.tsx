"use client";

/* ── 19520 · Graft ────────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if TWO of Karel's recordings became one living voice — one
 *  take lending its SHAPE (its chords, its dynamics) and the other lending its
 *  BODY (the piano you actually hear) — and my body decided whose voice it is and
 *  how deeply the two are grafted together?
 *
 *  INPUT  : MediaPipe PoseLandmarker (full body, shared loader). We read ONLY the
 *           two shoulders and the nose — what a seated desk webcam truly sees:
 *             · lateral   (mirrored shoulder/nose centre-x) → ROLE: whose voice is
 *               audible. Lean left you hear take A grafted with B's shape; lean
 *               right you hear take B grafted with A's shape.
 *             · approach  (shoulder WIDTH, a depth proxy)   → GRAFT depth: dry
 *               recording ↔ fully vocoded. Lean toward the camera to fuse them.
 *             · torso height                                → spectral TILT (warm
 *               ↔ bright).
 *  TECHNIQUE: a two-source CHANNEL VOCODER (cross-synthesis). Both takes loop.
 *           In each direction, the carrier take is split into 12 log-spaced
 *           bandpass bands; the modulator take is split into the same 12 bands,
 *           each rectified + lowpassed into an amplitude ENVELOPE that drives the
 *           carrier band's gain (the envelope signal is wired straight into the
 *           GainNode's `.gain` AudioParam — the modulator is pure control, it has
 *           ZERO path to the speakers). So the carrier piano only sounds where the
 *           modulator piano has energy: one take plays *through* the other. Both
 *           directions are built; ROLE equal-power-crossfades between them, GRAFT
 *           crossfades dry↔vocoded. The whole mix terminates in the shared
 *           safeMaster bus. This is the lab's first vocoder of one real take by
 *           ANOTHER real take (532-vocoder-veil vocoded a take with the live MIC).
 *  OUTPUT : a raw-WebGL2 GPU point field (160k points, flow-field advection in the
 *           vertex shader, persistence trails via an offscreen fade buffer) — a
 *           "heartwood" palette: umber ground, copper→gold for the carrier's own
 *           timbre, moss-green where the modulator's identity bleeds in. Each of
 *           12 bands drives a cohort of points; ROLE tints between the two takes'
 *           identities; GRAFT blooms the fusion. Rests the jury-banned three.js.
 *           Canvas2D band-bars fallback if WebGL2 is unavailable.
 *
 *  Research anchor: **Mix2Morph** (Chu et al., arXiv:2601.20426, ICASSP 2026) frames
 *  "sound infusion" — a dominant PRIMARY sound carries temporal/structural
 *  behaviour while a SECONDARY is infused throughout to enrich timbre. Graft is
 *  that idea done with a classic channel vocoder and, under ABSOLUTE rule 10, with
 *  Karel's REAL recordings on BOTH sides instead of a generative model. Named
 *  technique: Dudley's channel vocoder (Bell Labs). Recent practice anchor: the
 *  Oct-2026 WebGL2 GPGPU point-field-from-audio-spectra work circulating now.
 *
 *  Alive on load via an autonomous demo (a slow drift of role/graft/tilt) that
 *  drives the IDENTICAL body → parameter → audio+visual chain, so it breathes with
 *  no camera. See README.md.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadRealTrackBuffer } from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

// ── the two takes: A lends warmth, B lends atmosphere ────────────────────────
const TAKE_A = { id: "eba95845-cdbf-41d8-9c5d-8679686811ad", title: "Bath" };
const TAKE_B = { id: "549fc519-f7fc-4c38-a771-adaad2edbc81", title: "Ghost" };

// ── vocoder band plan: 12 log-spaced bands, ~110 Hz … 6 kHz ──────────────────
const NUM_BANDS = 12;
const F_LO = 110;
const F_HI = 6000;
const BAND_FREQS: number[] = Array.from({ length: NUM_BANDS }, (_, i) =>
  F_LO * Math.pow(F_HI / F_LO, i / (NUM_BANDS - 1)),
);

const N_POINTS = 160000;

type Driver = "live" | "pointer" | "demo";

interface Engine {
  startAudio: () => void;
  stopAudio: () => void;
  startCam: () => Promise<void>;
}

interface Readout {
  driver: Driver;
  lost: boolean;
  role: number;
  graft: number;
  loaded: number; // 0,1,2 tracks decoded
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ── body → three normalized signals. Gate on shoulders only (seated-safe). ───
function readBody(lm: Array<{ x: number; y: number; visibility?: number }>): {
  role: number;
  graft: number;
  tilt: number;
  present: boolean;
} {
  const ls = lm[POSE_LM.leftShoulder];
  const rs = lm[POSE_LM.rightShoulder];
  const nose = lm[POSE_LM.nose];
  if (!ls || !rs) return { role: 0.5, graft: 0.3, tilt: 0.5, present: false };
  const vis = ((ls.visibility ?? 1) + (rs.visibility ?? 1)) / 2;
  if (vis < 0.4) return { role: 0.5, graft: 0.3, tilt: 0.5, present: false };

  // centre x from shoulders (+nose when seen); mirror so leaning left reads left
  let cx = (ls.x + rs.x) / 2;
  if (nose && (nose.visibility ?? 1) > 0.4) cx = (cx * 2 + nose.x) / 3;
  const role = clamp01(1 - cx); // left → 0 (B voice), right → 1 (A voice)

  // depth proxy: normalized shoulder width (~0.16 far … ~0.42 near)
  const shoulderW = Math.abs(ls.x - rs.x);
  const graft = clamp01((shoulderW - 0.16) / (0.42 - 0.16));

  // torso height → spectral tilt
  const cy = (ls.y + rs.y) / 2;
  const tilt = clamp01(1 - (cy - 0.25) / 0.5);

  return { role, graft, tilt, present: true };
}

function runDemo(tSec: number): { role: number; graft: number; tilt: number } {
  return {
    role: 0.5 + Math.sin(tSec * 0.17) * 0.46,
    graft: 0.45 + Math.sin(tSec * 0.23 + 1.1) * 0.4,
    tilt: 0.5 + Math.sin(tSec * 0.13 + 2.0) * 0.32,
  };
}

export default function GraftPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const { immersive, toggle } = useImmersive();

  const [soundOn, setSoundOn] = useState(false);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "failed">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    driver: "demo",
    lost: false,
    role: 0.5,
    graft: 0.3,
    loaded: 0,
  });

  // ── build the whole engine once; React buttons reach it through engineRef ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // ── live-control signals (written by the loop, read by audio + visuals) ──
    let role = 0.5;
    let graft = 0.3;
    let tilt = 0.5;
    const bands = new Float32Array(NUM_BANDS); // visual band energies 0..1

    // ── pointer fallback ──────────────────────────────────────────────────────
    let ptrActive = false;
    let ptrRole = 0.5;
    let ptrGraft = 0.3;
    function onPointer(e: PointerEvent) {
      ptrActive = true;
      ptrRole = clamp01(e.clientX / window.innerWidth);
      ptrGraft = clamp01(1 - e.clientY / window.innerHeight);
    }
    window.addEventListener("pointermove", onPointer);

    // ════════════════════════════════════════════════════════════════════════
    //  AUDIO — two-direction channel vocoder of two real takes
    // ════════════════════════════════════════════════════════════════════════
    let ctx: AudioContext | null = null;
    let master: SafeMaster | null = null;
    let srcA: AudioBufferSourceNode | null = null;
    let srcB: AudioBufferSourceNode | null = null;
    let started = false;
    let loaded = 0;

    // crossfade gains we re-target each frame
    let dryA: GainNode | null = null;
    let dryB: GainNode | null = null;
    let wetAB: GainNode | null = null; // carrier A, modulator B
    let wetBA: GainNode | null = null; // carrier B, modulator A
    let dryMix: GainNode | null = null;
    let wetMix: GainNode | null = null;
    let tiltFilter: BiquadFilterNode | null = null;

    // abs-value rectifier curve for envelope followers
    const absCurve = new Float32Array(256);
    for (let i = 0; i < 256; i++) absCurve[i] = Math.abs((i / 255) * 2 - 1);

    function buildVocoderDirection(
      carrier: AudioBufferSourceNode,
      modulator: AudioBufferSourceNode,
      ac: AudioContext,
    ): GainNode {
      const sum = ac.createGain();
      sum.gain.value = 1;
      for (let i = 0; i < NUM_BANDS; i++) {
        const f = BAND_FREQS[i];
        // carrier band
        const cbp = ac.createBiquadFilter();
        cbp.type = "bandpass";
        cbp.frequency.value = f;
        cbp.Q.value = 5;
        const cgain = ac.createGain();
        cgain.gain.value = 0; // envelope is the only thing that opens it
        carrier.connect(cbp);
        cbp.connect(cgain);
        cgain.connect(sum);
        // modulator band → envelope follower → carrier band gain
        const mbp = ac.createBiquadFilter();
        mbp.type = "bandpass";
        mbp.frequency.value = f;
        mbp.Q.value = 5;
        const rect = ac.createWaveShaper();
        rect.curve = absCurve;
        const env = ac.createBiquadFilter();
        env.type = "lowpass";
        env.frequency.value = 14; // envelope smoothing
        const scale = ac.createGain();
        scale.gain.value = 2.4; // makeup for the narrow band
        modulator.connect(mbp);
        mbp.connect(rect);
        rect.connect(env);
        env.connect(scale);
        scale.connect(cgain.gain); // control signal, never reaches destination
      }
      return sum;
    }

    async function buildAudio() {
      if (ctx) return;
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = createSafeMaster(ctx, { gain: 0.9 });
      master.input.connect(ctx.destination);

      let bufA: AudioBuffer | null = null;
      let bufB: AudioBuffer | null = null;
      try {
        const a = await loadRealTrackBuffer(ctx, TAKE_A.id);
        bufA = a.buffer;
        loaded = 1;
        setReadout((r) => ({ ...r, loaded: 1 }));
        const b = await loadRealTrackBuffer(ctx, TAKE_B.id);
        bufB = b.buffer;
        loaded = 2;
        setReadout((r) => ({ ...r, loaded: 2 }));
      } catch {
        setNotice("Couldn't load Karel's recordings — check your connection and reload.");
        return;
      }
      if (!bufA || !bufB) return;

      srcA = ctx.createBufferSource();
      srcA.buffer = bufA;
      srcA.loop = true;
      srcB = ctx.createBufferSource();
      srcB.buffer = bufB;
      srcB.loop = true;

      // dry carriers
      dryA = ctx.createGain();
      dryA.gain.value = 0;
      dryB = ctx.createGain();
      dryB.gain.value = 0;
      srcA.connect(dryA);
      srcB.connect(dryB);

      // vocoded directions
      wetAB = buildVocoderDirection(srcA, srcB, ctx); // hear A, shaped by B
      wetBA = buildVocoderDirection(srcB, srcA, ctx); // hear B, shaped by A

      // buses
      dryMix = ctx.createGain();
      dryMix.gain.value = 1;
      wetMix = ctx.createGain();
      wetMix.gain.value = 0;
      tiltFilter = ctx.createBiquadFilter();
      tiltFilter.type = "highshelf";
      tiltFilter.frequency.value = 1400;
      tiltFilter.gain.value = 0;

      dryA.connect(dryMix);
      dryB.connect(dryMix);
      wetAB.connect(tiltFilter);
      wetBA.connect(tiltFilter);
      tiltFilter.connect(wetMix);
      dryMix.connect(master.input);
      wetMix.connect(master.input);

      srcA.start();
      srcB.start();
    }

    function startAudio() {
      if (started) return;
      started = true;
      setSoundOn(true);
      void (async () => {
        await buildAudio();
        if (ctx && ctx.state === "suspended") await ctx.resume();
      })();
    }
    function stopAudio() {
      started = false;
      setSoundOn(false);
      try {
        srcA?.stop();
        srcB?.stop();
      } catch {
        /* already stopped */
      }
      srcA = null;
      srcB = null;
      master?.disconnect();
      void ctx?.close();
      ctx = null;
      master = null;
    }

    // apply smoothed control params to the audio graph
    function applyAudio() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const tau = 0.12;
      // equal-power role crossfade: role=1 → take A voice, role=0 → take B voice
      const gA = Math.sin(role * Math.PI * 0.5);
      const gB = Math.cos(role * Math.PI * 0.5);
      dryA?.gain.setTargetAtTime(gA, t, tau);
      dryB?.gain.setTargetAtTime(gB, t, tau);
      wetAB?.gain.setTargetAtTime(gA, t, tau);
      wetBA?.gain.setTargetAtTime(gB, t, tau);
      // graft crossfade dry↔wet (equal power; wet gets makeup, limiter guards)
      const dG = Math.cos(graft * Math.PI * 0.5);
      const wG = Math.sin(graft * Math.PI * 0.5) * 1.5;
      dryMix?.gain.setTargetAtTime(dG, t, tau);
      wetMix?.gain.setTargetAtTime(wG, t, tau);
      // tilt: warm (−) ↔ bright (+)
      tiltFilter?.gain.setTargetAtTime((tilt - 0.5) * 2 * 9, t, tau);
    }

    // read 12 visual band energies from the safeMaster analyser
    let specBuf: Uint8Array<ArrayBuffer> | null = null;
    let binEdges: number[] | null = null;
    function readBands() {
      if (!master || !ctx) {
        for (let i = 0; i < NUM_BANDS; i++) bands[i] *= 0.9;
        return;
      }
      const an = master.analyser;
      if (!specBuf || specBuf.length !== an.frequencyBinCount) {
        specBuf = new Uint8Array(new ArrayBuffer(an.frequencyBinCount));
        const nyq = ctx.sampleRate / 2;
        binEdges = BAND_FREQS.map((f) => Math.min(an.frequencyBinCount - 1, Math.round((f / nyq) * an.frequencyBinCount)));
      }
      an.getByteFrequencyData(specBuf);
      for (let i = 0; i < NUM_BANDS; i++) {
        const lo = i === 0 ? 1 : binEdges![i - 1];
        const hi = Math.max(lo + 1, binEdges![i]);
        let s = 0;
        for (let b = lo; b < hi; b++) s += specBuf[b];
        const v = s / (hi - lo) / 255;
        bands[i] += (v - bands[i]) * 0.35; // smooth
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  VISUALS — raw WebGL2 GPU point field (Canvas2D fallback)
    // ════════════════════════════════════════════════════════════════════════
    let gl: WebGL2RenderingContext | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let disposeGL: (() => void) | null = null;
    let trailsOn = true;
    let renderRef: ((t: number) => void) | null = null;

    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(canvas!.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas!.clientHeight * dpr));
      if (canvas!.width !== w || canvas!.height !== h) {
        canvas!.width = w;
        canvas!.height = h;
        return true;
      }
      return false;
    }

    function compile(g: WebGL2RenderingContext, type: number, src: string): WebGLShader {
      const sh = g.createShader(type)!;
      g.shaderSource(sh, src);
      g.compileShader(sh);
      if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
        const log = g.getShaderInfoLog(sh);
        g.deleteShader(sh);
        throw new Error("shader: " + log);
      }
      return sh;
    }
    function program(g: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
      const p = g.createProgram()!;
      g.attachShader(p, compile(g, g.VERTEX_SHADER, vs));
      g.attachShader(p, compile(g, g.FRAGMENT_SHADER, fs));
      g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS)) {
        const log = g.getProgramInfoLog(p);
        throw new Error("link: " + log);
      }
      return p;
    }

    const POINT_VS = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aSeed;  // 0..1
    layout(location=1) in float aRand; // 0..1
    uniform float uTime, uRole, uGraft, uTilt, uAspect;
    uniform float uBands[${NUM_BANDS}];
    out vec3 vColor;
    out float vAlpha;
    float flowAngle(vec2 p, float t){
      float a = sin(p.x*1.7 + t*0.25 + cos(p.y*1.3 - t*0.21));
      a += 0.5*sin(p.y*2.3 - t*0.3 + sin(p.x*1.9 + t*0.11));
      a += 0.25*sin((p.x+p.y)*2.9 + t*0.4);
      return a*3.14159;
    }
    void main(){
      vec2 home = aSeed*2.0-1.0;
      vec2 base = home*0.94;
      int bi = int(min(float(${NUM_BANDS - 1}), floor(aRand*float(${NUM_BANDS}))));
      float e = uBands[bi];
      float ang = flowAngle(base*1.5 + aRand*0.7, uTime);
      vec2 dir = vec2(cos(ang), sin(ang));
      float swirl = (0.10 + uGraft*0.20) * (0.35 + e*2.6);
      vec2 pos = base + dir*swirl;
      vec2 rad = normalize(base + 1e-4);
      pos += rad * e * (0.04 + uGraft*0.16) * sin(uTime*0.5 + aRand*6.2831);
      pos.x /= uAspect;
      gl_Position = vec4(pos, 0.0, 1.0);
      gl_PointSize = clamp(1.0 + e*3.2 + uGraft*1.4, 1.0, 7.0);
      // heartwood palette
      vec3 cLow  = vec3(0.60, 0.30, 0.11); // copper/umber
      vec3 cHigh = vec3(0.96, 0.83, 0.47); // pale gold
      vec3 cMoss = vec3(0.34, 0.54, 0.29); // moss (modulator identity)
      float bf = float(bi)/float(${NUM_BANDS - 1});
      vec3 timbre = mix(cLow, cHigh, bf);
      // tilt warms (low) or brightens (high)
      timbre = mix(timbre, cHigh, clamp(uTilt-0.5,0.0,0.5)*0.9);
      timbre = mix(cLow, timbre, clamp(uTilt+0.5,0.5,1.0));
      vec3 ident = mix(cMoss, timbre, uRole);
      vec3 col = mix(ident, mix(ident, cHigh, 0.55), uGraft);
      float bright = 0.22 + e*1.7 + uGraft*0.28;
      vColor = col*bright;
      vAlpha = 0.045 + e*0.55;
    }`;

    const POINT_FS = `#version 300 es
    precision highp float;
    in vec3 vColor; in float vAlpha; out vec4 o;
    void main(){
      vec2 d = gl_PointCoord-0.5;
      float m = 1.0 - smoothstep(0.08, 0.5, length(d));
      if(m<=0.0) discard;
      o = vec4(vColor*m, vAlpha*m);
    }`;

    const QUAD_VS = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aPos;
    out vec2 vUv;
    void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

    const FADE_FS = `#version 300 es
    precision highp float;
    in vec2 vUv; out vec4 o;
    uniform float uFade;
    void main(){ o = vec4(0.020, 0.015, 0.011, uFade); }`;

    const BLIT_FS = `#version 300 es
    precision highp float;
    in vec2 vUv; out vec4 o;
    uniform sampler2D uTex;
    void main(){ o = vec4(texture(uTex, vUv).rgb, 1.0); }`;

    function initGL(): boolean {
      try {
        gl = canvas!.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false });
      } catch {
        gl = null;
      }
      if (!gl) return false;
      const g = gl;
      sizeCanvas();

      const pPoints = program(g, POINT_VS, POINT_FS);
      const pFade = program(g, QUAD_VS, FADE_FS);
      const pBlit = program(g, QUAD_VS, BLIT_FS);

      // point attributes
      const seeds = new Float32Array(N_POINTS * 2);
      const rnds = new Float32Array(N_POINTS);
      for (let i = 0; i < N_POINTS; i++) {
        // disc-biased seed for a rounder field
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random());
        seeds[i * 2] = 0.5 + Math.cos(a) * r * 0.5;
        seeds[i * 2 + 1] = 0.5 + Math.sin(a) * r * 0.5;
        rnds[i] = Math.random();
      }
      const vao = g.createVertexArray();
      g.bindVertexArray(vao);
      const sb = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, sb);
      g.bufferData(g.ARRAY_BUFFER, seeds, g.STATIC_DRAW);
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      const rb = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, rb);
      g.bufferData(g.ARRAY_BUFFER, rnds, g.STATIC_DRAW);
      g.enableVertexAttribArray(1);
      g.vertexAttribPointer(1, 1, g.FLOAT, false, 0, 0);
      g.bindVertexArray(null);

      // fullscreen quad
      const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
      const qvao = g.createVertexArray();
      g.bindVertexArray(qvao);
      const qb = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, qb);
      g.bufferData(g.ARRAY_BUFFER, quad, g.STATIC_DRAW);
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      g.bindVertexArray(null);

      // trail FBO (RGBA8 — universally supported)
      let tex: WebGLTexture | null = null;
      let fbo: WebGLFramebuffer | null = null;
      function allocTarget() {
        if (!trailsOn) return;
        tex = g.createTexture();
        g.bindTexture(g.TEXTURE_2D, tex);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, canvas!.width, canvas!.height, 0, g.RGBA, g.UNSIGNED_BYTE, null);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
        g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
        fbo = g.createFramebuffer();
        g.bindFramebuffer(g.FRAMEBUFFER, fbo);
        g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tex, 0);
        if (g.checkFramebufferStatus(g.FRAMEBUFFER) !== g.FRAMEBUFFER_COMPLETE) {
          trailsOn = false;
          tex = null;
          fbo = null;
        }
        g.bindFramebuffer(g.FRAMEBUFFER, null);
      }
      allocTarget();
      // clear trail buffer to bg once
      if (trailsOn && fbo) {
        g.bindFramebuffer(g.FRAMEBUFFER, fbo);
        g.clearColor(0.020, 0.015, 0.011, 1);
        g.clear(g.COLOR_BUFFER_BIT);
        g.bindFramebuffer(g.FRAMEBUFFER, null);
      }

      // cache uniform locations
      const uPt = {
        time: g.getUniformLocation(pPoints, "uTime"),
        role: g.getUniformLocation(pPoints, "uRole"),
        graft: g.getUniformLocation(pPoints, "uGraft"),
        tilt: g.getUniformLocation(pPoints, "uTilt"),
        aspect: g.getUniformLocation(pPoints, "uAspect"),
        bands: g.getUniformLocation(pPoints, "uBands"),
      };
      const uFade = g.getUniformLocation(pFade, "uFade");
      const uTex = g.getUniformLocation(pBlit, "uTex");

      function onResize() {
        if (sizeCanvas() && trailsOn) {
          if (tex) g.deleteTexture(tex);
          if (fbo) g.deleteFramebuffer(fbo);
          allocTarget();
          if (trailsOn && fbo) {
            g.bindFramebuffer(g.FRAMEBUFFER, fbo);
            g.clearColor(0.020, 0.015, 0.011, 1);
            g.clear(g.COLOR_BUFFER_BIT);
            g.bindFramebuffer(g.FRAMEBUFFER, null);
          }
        }
      }

      function renderGL(tSec: number) {
        onResize();
        const W = canvas!.width;
        const H = canvas!.height;
        const aspect = W / H;

        // 1) accumulate into trail buffer (or straight to screen without trails)
        if (trailsOn && fbo) g.bindFramebuffer(g.FRAMEBUFFER, fbo);
        g.viewport(0, 0, W, H);

        if (trailsOn) {
          // fade previous frame toward bg
          g.useProgram(pFade);
          g.uniform1f(uFade, reduce ? 0.3 : 0.11);
          g.enable(g.BLEND);
          g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
          g.bindVertexArray(qvao);
          g.drawArrays(g.TRIANGLES, 0, 3);
        } else {
          g.clearColor(0.020, 0.015, 0.011, 1);
          g.clear(g.COLOR_BUFFER_BIT);
          g.enable(g.BLEND);
        }

        // additive points
        g.useProgram(pPoints);
        g.uniform1f(uPt.time, tSec);
        g.uniform1f(uPt.role, role);
        g.uniform1f(uPt.graft, graft);
        g.uniform1f(uPt.tilt, tilt);
        g.uniform1f(uPt.aspect, aspect);
        g.uniform1fv(uPt.bands, bands);
        g.blendFunc(g.SRC_ALPHA, g.ONE);
        g.bindVertexArray(vao);
        g.drawArrays(g.POINTS, 0, N_POINTS);
        g.bindVertexArray(null);

        // 2) blit trail buffer to screen
        if (trailsOn && fbo) {
          g.bindFramebuffer(g.FRAMEBUFFER, null);
          g.viewport(0, 0, W, H);
          g.disable(g.BLEND);
          g.useProgram(pBlit);
          g.activeTexture(g.TEXTURE0);
          g.bindTexture(g.TEXTURE_2D, tex);
          g.uniform1i(uTex, 0);
          g.bindVertexArray(qvao);
          g.drawArrays(g.TRIANGLES, 0, 3);
          g.bindVertexArray(null);
        }
      }

      disposeGL = () => {
        try {
          g.deleteProgram(pPoints);
          g.deleteProgram(pFade);
          g.deleteProgram(pBlit);
          if (tex) g.deleteTexture(tex);
          if (fbo) g.deleteFramebuffer(fbo);
          const lose = g.getExtension("WEBGL_lose_context");
          lose?.loseContext();
        } catch {
          /* context already gone */
        }
      };

      renderRef = renderGL;
      return true;
    }

    // Canvas2D fallback: 12 reactive bars + a role/graft readout glow
    function initCanvas2D() {
      ctx2d = canvas!.getContext("2d");
      if (!ctx2d) return;
      sizeCanvas();
      renderRef = (tSec: number) => {
        const c = ctx2d!;
        sizeCanvas();
        const W = canvas!.width;
        const H = canvas!.height;
        c.fillStyle = "rgba(5,4,3,0.18)";
        c.fillRect(0, 0, W, H);
        const bw = W / NUM_BANDS;
        for (let i = 0; i < NUM_BANDS; i++) {
          const e = bands[i];
          const h = e * H * 0.8;
          const hue = 28 + (i / NUM_BANDS) * 18 + (1 - role) * 70; // copper→gold, moss as role falls
          const light = 30 + e * 50 + graft * 15;
          c.fillStyle = `hsl(${hue} 60% ${light}% / ${0.25 + e * 0.6})`;
          c.fillRect(i * bw + bw * 0.12, H - h, bw * 0.76, h);
        }
        void tSec;
      };
    }

    if (!initGL()) {
      setNotice("WebGL2 unavailable — showing a reduced spectral view. The grafted audio is unaffected.");
      initCanvas2D();
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CAMERA — pose tracking (optional, degrades to pointer/demo)
    // ════════════════════════════════════════════════════════════════════════
    let landmarker: PoseLandmarkerInst | null = null;
    let stream: MediaStream | null = null;
    let camActive = false;

    async function startCam() {
      if (camActive) return;
      setCamState("starting");
      try {
        landmarker = await createPoseTracker(1);
        const video = videoRef.current!;
        stream = await startCamera(video);
        camActive = true;
        setCamState("on");
      } catch {
        setCamState("failed");
        setNotice("Camera or pose model unavailable — pointer and the autonomous demo still drive it.");
      }
    }

    function readLive(nowMs: number): { role: number; graft: number; tilt: number; present: boolean } | null {
      const video = videoRef.current;
      if (!landmarker || !stream || !video || video.readyState < 2) return null;
      let res;
      try {
        res = landmarker.detectForVideo(video, nowMs);
      } catch {
        return null;
      }
      const lm = res?.landmarks?.[0];
      if (!lm) return { role: 0.5, graft: 0.3, tilt: 0.5, present: false };
      return readBody(lm);
    }

    // ── the one loop ──────────────────────────────────────────────────────────
    let raf = 0;
    let lastMs = performance.now();
    let sawReal = false;
    let uiAccum = 0;

    function loop(nowMs: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.06, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const nowS = nowMs / 1000;

      // choose body signal: live → pointer → demo
      let tRole: number, tGraft: number, tTilt: number;
      let driver: Driver = "demo";
      let lost = false;
      const live = readLive(nowMs);
      if (live) {
        if (live.present) {
          tRole = live.role;
          tGraft = live.graft;
          tTilt = live.tilt;
          driver = "live";
          sawReal = true;
        } else {
          lost = true;
          driver = sawReal ? "live" : "demo";
          const d = runDemo(nowS);
          tRole = d.role;
          tGraft = d.graft;
          tTilt = d.tilt;
        }
      } else if (ptrActive) {
        tRole = ptrRole;
        tGraft = ptrGraft;
        tTilt = 0.5;
        driver = "pointer";
      } else {
        const d = runDemo(nowS);
        tRole = d.role;
        tGraft = d.graft;
        tTilt = d.tilt;
        driver = "demo";
      }

      // ease (JS side; audio params smooth further)
      const k = Math.min(1, dt / 0.12);
      role += (tRole - role) * k;
      graft += (tGraft - graft) * k;
      tilt += (tTilt - tilt) * k;

      applyAudio();
      readBands();
      if (renderRef) renderRef(nowS);

      uiAccum += dt;
      if (uiAccum > 0.12) {
        uiAccum = 0;
        setReadout((r) =>
          r.driver === driver && r.lost === lost && Math.abs(r.role - role) < 0.02 && Math.abs(r.graft - graft) < 0.02 && r.loaded === loaded
            ? r
            : { driver, lost, role, graft, loaded },
        );
      }
    }
    raf = requestAnimationFrame(loop);

    engineRef.current = { startAudio, stopAudio, startCam };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      try {
        landmarker?.close();
      } catch {
        /* noop */
      }
      stream?.getTracks().forEach((t) => t.stop());
      try {
        srcA?.stop();
        srcB?.stop();
      } catch {
        /* noop */
      }
      master?.disconnect();
      void ctx?.close();
      disposeGL?.();
      engineRef.current = null;
    };
  }, []);

  // ── UI handlers ─────────────────────────────────────────────────────────────
  const onStart = useCallback(() => {
    engineRef.current?.startAudio();
  }, []);
  const onStop = useCallback(() => {
    engineRef.current?.stopAudio();
  }, []);
  const onCam = useCallback(() => {
    void engineRef.current?.startCam();
  }, []);

  const driverLabel =
    readout.driver === "live"
      ? readout.lost
        ? "tracking · lost"
        : "tracking · live"
      : readout.driver === "pointer"
        ? "pointer · move to conduct"
        : "demo · autonomous";

  const howTo = [
    "Press Play — two of Karel's recordings (Bath + Ghost) begin, one grafted onto the other.",
    "Allow the camera, then sit so your shoulders are in frame.",
    "Lean left or right to choose whose voice you hear (which take plays through the other).",
    "Lean toward the camera to deepen the graft — dry recording becomes fully vocoded.",
    "Sit tall or low to tilt the sound warm ↔ bright. No camera? Move the mouse, or just watch it drift.",
  ];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* viz-first: the field fills the viewport */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <video ref={videoRef} className="pointer-events-none absolute h-px w-px opacity-0" playsInline muted />

      {/* status line — always visible while running */}
      {soundOn && (
        <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-1">
          <span
            className={`font-mono text-xs uppercase tracking-[0.18em] ${
              readout.driver === "live" && readout.lost ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {readout.driver === "live" && readout.lost ? "tracking · lost — face the camera, shoulders in frame" : driverLabel}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            {readout.role >= 0.5 ? `voice · ${TAKE_A.title}` : `voice · ${TAKE_B.title}`} · graft {Math.round(readout.graft * 100)}%
          </span>
          {readout.loaded < 2 && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              loading takes · {readout.loaded}/2
            </span>
          )}
        </div>
      )}

      {/* write-up chrome — hidden in immersive mode */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/55 to-transparent p-6 pt-16">
          <div className="pointer-events-auto flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Graft</h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
                Two of Karel&apos;s recordings become one voice — one lends its chords and dynamics, the other lends the
                piano you hear. Your body decides whose voice it is and how deeply the two are grafted.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!soundOn ? (
                <button
                  type="button"
                  onClick={onStart}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Play
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStop}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Stop
                </button>
              )}
              <button
                type="button"
                onClick={onCam}
                disabled={camState === "on" || camState === "starting"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {camState === "on" ? "Camera on" : camState === "starting" ? "Starting camera…" : "Conduct with camera"}
              </button>
              <Link
                href="/dream/19520-graft/README.md"
                className="min-h-[44px] rounded-md px-3 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Read the design notes
              </Link>
            </div>

            {notice && <p className="max-w-2xl text-sm leading-relaxed text-destructive">{notice}</p>}
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground/70">
              Best on headphones. Camera path is control-only — it never records or transmits. Press F for fullscreen.
            </p>
          </div>
        </div>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Graft"
        description="A two-source channel vocoder of Karel's recordings: one take lends its spectral shape, the other the piano you hear. Full-body motion crossfades whose voice it is, how deeply the two are grafted, and the spectral tilt — rendered as a flowing GPU point field."
        howTo={howTo}
      />
    </div>
  );
}
