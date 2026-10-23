"use client";

/* ── 24360 · Duet ───────────────────────────────────────────────────────────
 *
 *  ONE QUESTION: what if TWO people in one camera frame could conduct ONE of
 *  Karel's piano takes TOGETHER — and their *togetherness* (gesture sync) is the
 *  reward?
 *
 *  INPUT  : MediaPipe PoseLandmarker for UP TO TWO people (createPoseTracker(2)),
 *           seated / waist-up. We read ONLY shoulders + wrists (never hips /
 *           ankles). Per person: horizontal centre (where their light-field
 *           lives), hand height (presence / gain), arm span (brightness), and a
 *           short rolling history of hand height (for the coherence correlation).
 *           The two detected poses are assigned to slots by screen-x so the left
 *           person always drives the rose field and the right person the amber.
 *  TECHNIQUE: dual-pose gesture COHERENCE COUPLING. ONE take is split off a single
 *           BufferSource into TWO voices — a warm low band (lowpass ~700 Hz,
 *           person 1) and a bright high band (highpass ~700 Hz, person 2). Each
 *           voice has its own brightness tilt, gain, and PannerNode. A coherence
 *           signal is computed between the two bodies: Pearson correlation of
 *           their hand-height histories, blended with arm-span match and
 *           hand-height match. As coherence RISES the two panners converge toward
 *           centre, a shared convolver-reverb swell (derived from his own buffer)
 *           opens, and the two light-fields bloom into ONE warm core. As they
 *           DIVERGE the voices separate hard L/R and the field splits in two.
 *  OUTPUT : a raw-WebGL2 fragment shader (NOT three.js, NOT Canvas2D) — two warm
 *           radial light-fields (dusk-rose + amber-gold) that attract and merge
 *           into a single warm-gold core, with a soft coherence halo ring. Idle
 *           state drifts and breathes; no grain, no strobe. Canvas2D degrade only
 *           if WebGL2 is unavailable.
 *
 *  MANDATORY hands-free fallback: person 2 is ALWAYS an autonomous, LABELLED
 *  "ghost partner" that drifts on its own. Person 1 is the live camera body when
 *  present, else pointer + arrow keys, else an autonomous drift whose phase slowly
 *  sweeps through the ghost's — so even fully untouched the two periodically sync,
 *  swell, and part. A solo user feels the convergence against the ghost.
 * ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { REAL_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";
import {
  createPoseTracker,
  startCamera,
  POSE_LM,
  type PoseLandmarkerInst,
  type Landmark,
} from "../_shared/cameraTracking";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";

const SPLIT_HZ = 700; // the crossover: warm low band ↔ bright high band
const HIST = 64; // coherence correlation window (~1s at 60fps)

type P1Source = "live" | "pointer" | "auto";

interface Readout {
  camState: "idle" | "starting" | "on" | "failed";
  peopleTracked: number; // live poses seen this frame (0,1,2)
  p1Source: P1Source;
  coherence: number;
  loaded: boolean;
  title: string;
}

interface Engine {
  startAudio: () => void;
  stopAudio: () => void;
  startCam: () => Promise<void>;
  setTrack: (id: string) => void;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

// ── one pose → the seated-safe features we read (shoulders + wrists only) ─────
interface Person {
  present: boolean;
  sx: number; // shoulder-centre x in video space (0..1, NOT mirrored)
  height: number; // hand height 0 (down) … 1 (raised high)
  span: number; // arm span 0 (closed) … 1 (wide)
}

function readPerson(lm: Landmark[]): Person {
  const ls = lm[POSE_LM.leftShoulder];
  const rs = lm[POSE_LM.rightShoulder];
  if (!ls || !rs) return { present: false, sx: 0.5, height: 0.4, span: 0.4 };
  const vis = ((ls.visibility ?? 1) + (rs.visibility ?? 1)) / 2;
  if (vis < 0.4) return { present: false, sx: 0.5, height: 0.4, span: 0.4 };

  const sx = (ls.x + rs.x) / 2;
  const sy = (ls.y + rs.y) / 2;
  const shoulderW = Math.max(0.05, Math.abs(ls.x - rs.x));

  const lw = lm[POSE_LM.leftWrist];
  const rw = lm[POSE_LM.rightWrist];
  const lwOk = lw && (lw.visibility ?? 0) > 0.3;
  const rwOk = rw && (rw.visibility ?? 0) > 0.3;

  let wy: number;
  let wSpan: number;
  if (lwOk && rwOk) {
    wy = (lw.y + rw.y) / 2;
    wSpan = Math.abs(lw.x - rw.x);
  } else if (lwOk) {
    wy = lw.y;
    wSpan = Math.abs(lw.x - sx) * 2;
  } else if (rwOk) {
    wy = rw.y;
    wSpan = Math.abs(rw.x - sx) * 2;
  } else {
    // hands not seen → read as lowered, closed
    wy = sy + 0.3;
    wSpan = shoulderW;
  }

  // wrists above shoulders read as "high"; at shoulder level reads mid.
  const height = clamp01((sy - wy) / 0.45 + 0.4);
  const span = clamp01((wSpan / shoulderW - 0.8) / (3.0 - 0.8));
  return { present: true, sx, height, span };
}

// Pearson correlation of two equal-length series → mapped to 0..1.
function computeCorr(a: Float32Array, b: Float32Array, n: number): number {
  if (n < 8) return 0.5;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  if (den < 1e-6) return 0.5;
  return clamp01((num / den) * 0.5 + 0.5);
}

export default function DuetPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const engineRef = useRef<Engine | null>(null);

  const { immersive, toggle } = useImmersive();

  const [soundOn, setSoundOn] = useState(false);
  const [trackId, setTrackId] = useState<string>(REAL_TRACKS[0].id);
  const [notice, setNotice] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({
    camState: "idle",
    peopleTracked: 0,
    p1Source: "auto",
    coherence: 0.0,
    loaded: false,
    title: REAL_TRACKS[0].title,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── live coupling signals (written by the loop, read by audio + visuals) ──
    // per-person smoothed state: x (screen 0..1, mirrored), height, span, gain
    const p = [
      { x: 0.3, y: 0.45, gain: 0.5, span: 0.4 },
      { x: 0.7, y: 0.45, gain: 0.5, span: 0.4 },
    ];
    let coherence = 0.0;
    let level = 0.0; // audio RMS 0..1
    let p2IsGhost = true; // true unless a real 2nd pose is tracked

    // rolling hand-height histories for the coherence correlation
    const hist1 = new Float32Array(HIST);
    const hist2 = new Float32Array(HIST);
    let histN = 0;
    let histHead = 0;

    let selectedTrack = trackId;

    // ── pointer + arrow-key fallback for person 1 ────────────────────────────
    let ptrActive = false;
    let ptrX = 0.3;
    let ptrHeight = 0.6;
    function onPointer(e: PointerEvent) {
      ptrActive = true;
      ptrX = clamp01(e.clientX / window.innerWidth);
      ptrHeight = clamp01(1 - e.clientY / window.innerHeight);
    }
    function onKey(e: KeyboardEvent) {
      let used = true;
      if (e.key === "ArrowLeft") ptrX = clamp01(ptrX - 0.05);
      else if (e.key === "ArrowRight") ptrX = clamp01(ptrX + 0.05);
      else if (e.key === "ArrowUp") ptrHeight = clamp01(ptrHeight + 0.06);
      else if (e.key === "ArrowDown") ptrHeight = clamp01(ptrHeight - 0.06);
      else used = false;
      if (used) {
        ptrActive = true;
        e.preventDefault();
      }
    }
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("keydown", onKey);

    // ════════════════════════════════════════════════════════════════════════
    //  AUDIO — one take, split into two spatial voices, coupled by coherence
    // ════════════════════════════════════════════════════════════════════════
    let ctx: AudioContext | null = null;
    let master: SafeMaster | null = null;
    let src: AudioBufferSourceNode | null = null;
    let started = false;

    // fixed chain (built once), source re-attached on track swap
    let lowFilter: BiquadFilterNode | null = null;
    let highFilter: BiquadFilterNode | null = null;
    let tilt1: BiquadFilterNode | null = null;
    let tilt2: BiquadFilterNode | null = null;
    let gain1: GainNode | null = null;
    let gain2: GainNode | null = null;
    let panner1: PannerNode | null = null;
    let panner2: PannerNode | null = null;
    let send1: GainNode | null = null;
    let send2: GainNode | null = null;
    const bufferCache = new Map<string, AudioBuffer>();

    function makeImpulse(ac: AudioContext): AudioBuffer {
      const len = Math.floor(ac.sampleRate * 2.6);
      const ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
        }
      }
      return ir;
    }

    function setPannerX(pan: PannerNode | null, x: number, t: number) {
      if (!pan) return;
      if (pan.positionX) {
        pan.positionX.setTargetAtTime(x, t, 0.12);
      } else {
        // Safari legacy
        (pan as unknown as { setPosition: (a: number, b: number, c: number) => void }).setPosition(x, 0, -1);
      }
    }

    async function ensureBuffer(id: string): Promise<AudioBuffer | null> {
      const cached = bufferCache.get(id);
      if (cached) return cached;
      try {
        const r = await loadRealTrackBuffer(ctx!, id);
        bufferCache.set(id, r.buffer);
        return r.buffer;
      } catch {
        setNotice(
          "Couldn't load Karel's recording — check your connection and reload.",
        );
        return null;
      }
    }

    function attachSource(buffer: AudioBuffer) {
      if (!ctx || !lowFilter || !highFilter) return;
      try {
        src?.stop();
      } catch {
        /* already stopped */
      }
      src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(lowFilter);
      src.connect(highFilter);
      src.start();
    }

    async function buildAudio() {
      if (ctx) return;
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      ctx = new AC();
      master = createSafeMaster(ctx, { gain: 0.9 });

      // listener at origin (PannerNode spatialisation hangs off this)
      const L = ctx.listener;
      if (L.positionX) {
        L.positionX.value = 0;
        L.positionY.value = 0;
        L.positionZ.value = 0;
      } else {
        (L as unknown as { setPosition: (a: number, b: number, c: number) => void }).setPosition(0, 0, 0);
      }

      // two bands off the same source
      lowFilter = ctx.createBiquadFilter();
      lowFilter.type = "lowpass";
      lowFilter.frequency.value = SPLIT_HZ;
      lowFilter.Q.value = 0.5;
      highFilter = ctx.createBiquadFilter();
      highFilter.type = "highpass";
      highFilter.frequency.value = SPLIT_HZ;
      highFilter.Q.value = 0.5;

      // per-voice brightness tilt (driven by arm span)
      tilt1 = ctx.createBiquadFilter();
      tilt1.type = "highshelf";
      tilt1.frequency.value = 1600;
      tilt1.gain.value = 0;
      tilt2 = ctx.createBiquadFilter();
      tilt2.type = "highshelf";
      tilt2.frequency.value = 2400;
      tilt2.gain.value = 0;

      gain1 = ctx.createGain();
      gain1.gain.value = 0.5;
      gain2 = ctx.createGain();
      gain2.gain.value = 0.5;

      panner1 = ctx.createPanner();
      panner1.panningModel = "equalpower";
      panner1.rolloffFactor = 0; // azimuth only — convergence must not change loudness
      panner2 = ctx.createPanner();
      panner2.panningModel = "equalpower";
      panner2.rolloffFactor = 0;
      setPannerX(panner1, -1.4, ctx.currentTime);
      setPannerX(panner2, 1.4, ctx.currentTime);
      if (panner1.positionZ) panner1.positionZ.value = -1;
      if (panner2.positionZ) panner2.positionZ.value = -1;

      // shared unifying reverb (the "togetherness swell"), derived from HIS audio
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx);
      const revWarm = ctx.createBiquadFilter();
      revWarm.type = "lowpass";
      revWarm.frequency.value = 2600;
      const revReturn = ctx.createGain();
      revReturn.gain.value = 0.9;
      send1 = ctx.createGain();
      send1.gain.value = 0;
      send2 = ctx.createGain();
      send2.gain.value = 0;

      // wiring: band → tilt → gain → [panner → master] and [send → reverb]
      lowFilter.connect(tilt1);
      tilt1.connect(gain1);
      gain1.connect(panner1);
      gain1.connect(send1);
      panner1.connect(master.input);

      highFilter.connect(tilt2);
      tilt2.connect(gain2);
      gain2.connect(panner2);
      gain2.connect(send2);
      panner2.connect(master.input);

      send1.connect(convolver);
      send2.connect(convolver);
      convolver.connect(revWarm);
      revWarm.connect(revReturn);
      revReturn.connect(master.input);

      const buf = await ensureBuffer(selectedTrack);
      if (!buf) return;
      attachSource(buf);
      setReadout((r) => ({ ...r, loaded: true }));
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
        src?.stop();
      } catch {
        /* already stopped */
      }
      src = null;
      master?.disconnect();
      void ctx?.close();
      ctx = null;
      master = null;
      lowFilter = highFilter = null;
      tilt1 = tilt2 = null;
      gain1 = gain2 = null;
      panner1 = panner2 = null;
      send1 = send2 = null;
      setReadout((r) => ({ ...r, loaded: false }));
    }

    function setTrack(id: string) {
      selectedTrack = id;
      const title = REAL_TRACKS.find((t) => t.id === id)?.title ?? "";
      setReadout((r) => ({ ...r, title }));
      if (!ctx) return;
      setReadout((r) => ({ ...r, loaded: false }));
      void (async () => {
        const buf = await ensureBuffer(id);
        if (buf) {
          attachSource(buf);
          setReadout((r) => ({ ...r, loaded: true }));
        }
      })();
    }

    function applyAudio() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const tau = 0.13;
      // presence → gain; keep a floor so a voice never fully vanishes
      gain1?.gain.setTargetAtTime(0.28 + p[0].gain * 0.72, t, tau);
      gain2?.gain.setTargetAtTime(0.28 + p[1].gain * 0.72, t, tau);
      // arm span → brightness tilt (dB)
      tilt1?.gain.setTargetAtTime((p[0].span - 0.5) * 2 * 7, t, tau);
      tilt2?.gain.setTargetAtTime((p[1].span - 0.5) * 2 * 9, t, tau);
      // spatial convergence: screen-x → azimuth, pulled to centre by coherence
      const ax1 = (p[0].x - 0.5) * 2 * 1.8;
      const ax2 = (p[1].x - 0.5) * 2 * 1.8;
      setPannerX(panner1, ax1, t);
      setPannerX(panner2, ax2, t);
      // togetherness swell: reverb send opens with coherence
      const sw = Math.pow(coherence, 1.3) * 0.7;
      send1?.gain.setTargetAtTime(sw, t, tau);
      send2?.gain.setTargetAtTime(sw, t, tau);
    }

    // audio level for the visual pulse (time-domain RMS off the safe bus)
    let timeBuf: Uint8Array<ArrayBuffer> | null = null;
    function readLevel() {
      if (!master) {
        level *= 0.92;
        return;
      }
      const an = master.analyser;
      if (!timeBuf || timeBuf.length !== an.fftSize) {
        timeBuf = new Uint8Array(new ArrayBuffer(an.fftSize));
      }
      an.getByteTimeDomainData(timeBuf);
      let s = 0;
      for (let i = 0; i < timeBuf.length; i++) {
        const v = (timeBuf[i] - 128) / 128;
        s += v * v;
      }
      const rms = Math.sqrt(s / timeBuf.length);
      level += (clamp01(rms * 3.2) - level) * 0.25;
    }

    // ════════════════════════════════════════════════════════════════════════
    //  VISUALS — raw WebGL2 fragment shader (Canvas2D degrade)
    // ════════════════════════════════════════════════════════════════════════
    let gl: WebGL2RenderingContext | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    let disposeGL: (() => void) | null = null;
    let renderRef: ((t: number) => void) | null = null;

    function sizeCanvas(): boolean {
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

    function compile(g: WebGL2RenderingContext, type: number, srcStr: string): WebGLShader {
      const sh = g.createShader(type)!;
      g.shaderSource(sh, srcStr);
      g.compileShader(sh);
      if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) {
        const log = g.getShaderInfoLog(sh);
        g.deleteShader(sh);
        throw new Error("shader: " + log);
      }
      return sh;
    }

    const QUAD_VS = `#version 300 es
    precision highp float;
    layout(location=0) in vec2 aPos;
    void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const FIELD_FS = `#version 300 es
    precision highp float;
    out vec4 o;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uP1, uP2;       // field centres, screen 0..1
    uniform float uG1, uG2;      // intensities
    uniform float uS1, uS2;      // sizes (arm span)
    uniform float uCoh;          // coherence 0..1
    uniform float uLevel;        // audio level 0..1
    uniform float uGhost;        // 1 if person 2 is the ghost partner

    const vec3 ROSE  = vec3(0.910, 0.627, 0.722); // dusk-rose  #e8a0b8
    const vec3 AMBER = vec3(0.941, 0.690, 0.376); // amber-gold #f0b060

    float fieldAmt(vec2 uv, vec2 c, float size, float seed){
      vec2 d = uv - c;
      d += 0.018 * vec2(sin(uTime*0.6 + seed), cos(uTime*0.5 + seed*1.7));
      float r = length(d);
      float s = 0.17 * size;
      return exp(-(r*r)/(s*s));
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      float aspect = uRes.x / uRes.y;
      vec2 a  = vec2(uv.x*aspect, uv.y);
      vec2 p1 = vec2(uP1.x*aspect, uP1.y);
      vec2 p2 = vec2(uP2.x*aspect, uP2.y);

      float pulse = 0.82 + 0.34*uLevel;

      float f1 = fieldAmt(a, p1, 0.65 + uS1*0.85, 1.0) * uG1 * pulse;
      float f2 = fieldAmt(a, p2, 0.65 + uS2*0.85, 7.0) * uG2 * pulse;
      // ghost reads with a faint non-human breathing so it isn't mistaken for a person
      f2 *= mix(1.0, 0.82 + 0.18*sin(uTime*2.7), uGhost);

      // merged warm core at the midpoint, strength from coherence
      vec2 mid = mix(p1, p2, 0.5);
      float core = fieldAmt(a, mid, 0.75 + 0.55*uCoh, 3.3);
      core = core * uCoh * (0.55 + uLevel*0.9);
      vec3 warm = mix(ROSE, AMBER, 0.5)*1.35 + vec3(0.16, 0.09, 0.02);

      // individual fields recede a touch as they merge
      float indiv = 1.0 - 0.42*uCoh;
      vec3 col = ROSE*f1*indiv + AMBER*f2*indiv + warm*core;

      // coherence halo — a soft ring showing how unified they are
      float rc = length(a - mid);
      float ringR = 0.11 + 0.30*uCoh;
      float ring = exp(-pow((rc - ringR)/0.028, 2.0)) * uCoh * 0.55;
      col += mix(ROSE, AMBER, 0.5) * ring;

      // warm dark ground, slow breathing so idle is alive
      vec3 bg = vec3(0.052, 0.030, 0.040) * (1.0 + 0.18*sin(uTime*0.3));
      col += bg;

      // soft tonemap (no grain, no strobe)
      col = col / (col + 0.82);
      col = pow(col, vec3(0.85));
      o = vec4(col, 1.0);
    }`;

    function initGL(): boolean {
      try {
        gl = canvas!.getContext("webgl2", {
          antialias: false,
          alpha: false,
          preserveDrawingBuffer: false,
        });
      } catch {
        gl = null;
      }
      if (!gl) return false;
      const g = gl;
      sizeCanvas();

      const prog = g.createProgram()!;
      g.attachShader(prog, compile(g, g.VERTEX_SHADER, QUAD_VS));
      g.attachShader(prog, compile(g, g.FRAGMENT_SHADER, FIELD_FS));
      g.linkProgram(prog);
      if (!g.getProgramParameter(prog, g.LINK_STATUS)) {
        throw new Error("link: " + g.getProgramInfoLog(prog));
      }

      const quad = new Float32Array([-1, -1, 3, -1, -1, 3]);
      const vao = g.createVertexArray();
      g.bindVertexArray(vao);
      const vb = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, vb);
      g.bufferData(g.ARRAY_BUFFER, quad, g.STATIC_DRAW);
      g.enableVertexAttribArray(0);
      g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      g.bindVertexArray(null);

      const u = {
        res: g.getUniformLocation(prog, "uRes"),
        time: g.getUniformLocation(prog, "uTime"),
        p1: g.getUniformLocation(prog, "uP1"),
        p2: g.getUniformLocation(prog, "uP2"),
        g1: g.getUniformLocation(prog, "uG1"),
        g2: g.getUniformLocation(prog, "uG2"),
        s1: g.getUniformLocation(prog, "uS1"),
        s2: g.getUniformLocation(prog, "uS2"),
        coh: g.getUniformLocation(prog, "uCoh"),
        level: g.getUniformLocation(prog, "uLevel"),
        ghost: g.getUniformLocation(prog, "uGhost"),
      };

      renderRef = (tSec: number) => {
        sizeCanvas();
        g.viewport(0, 0, canvas!.width, canvas!.height);
        g.useProgram(prog);
        g.uniform2f(u.res, canvas!.width, canvas!.height);
        g.uniform1f(u.time, tSec);
        g.uniform2f(u.p1, p[0].x, p[0].y);
        g.uniform2f(u.p2, p[1].x, p[1].y);
        g.uniform1f(u.g1, 0.5 + p[0].gain * 0.9);
        g.uniform1f(u.g2, 0.5 + p[1].gain * 0.9);
        g.uniform1f(u.s1, p[0].span);
        g.uniform1f(u.s2, p[1].span);
        g.uniform1f(u.coh, coherence);
        g.uniform1f(u.level, level);
        g.uniform1f(u.ghost, p2IsGhost ? 1 : 0);
        g.bindVertexArray(vao);
        g.drawArrays(g.TRIANGLES, 0, 3);
        g.bindVertexArray(null);
      };

      disposeGL = () => {
        try {
          g.deleteProgram(prog);
          g.getExtension("WEBGL_lose_context")?.loseContext();
        } catch {
          /* already gone */
        }
      };
      return true;
    }

    // Canvas2D degrade: two radial glows + a coherence core (audio unaffected)
    function initCanvas2D() {
      ctx2d = canvas!.getContext("2d");
      if (!ctx2d) return;
      sizeCanvas();
      renderRef = () => {
        const c = ctx2d!;
        sizeCanvas();
        const W = canvas!.width;
        const H = canvas!.height;
        c.fillStyle = "#0d0709";
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = "lighter";
        const glow = (x: number, y: number, rad: number, col: string, amt: number) => {
          const gr = c.createRadialGradient(x, y, 0, x, y, rad);
          gr.addColorStop(0, col.replace("A", (0.7 * amt).toFixed(3)));
          gr.addColorStop(1, col.replace("A", "0"));
          c.fillStyle = gr;
          c.fillRect(0, 0, W, H);
        };
        const r = Math.min(W, H) * 0.42;
        glow(p[0].x * W, p[0].y * H, r * (0.6 + p[0].span * 0.6), "rgba(232,160,184,A)", 0.5 + p[0].gain * 0.6);
        glow(p[1].x * W, p[1].y * H, r * (0.6 + p[1].span * 0.6), "rgba(240,176,96,A)", 0.5 + p[1].gain * 0.6);
        const mx = ((p[0].x + p[1].x) / 2) * W;
        const my = ((p[0].y + p[1].y) / 2) * H;
        glow(mx, my, r * (0.5 + coherence * 0.9), "rgba(248,210,150,A)", coherence);
        c.globalCompositeOperation = "source-over";
      };
    }

    if (!initGL()) {
      setNotice(
        "WebGL2 unavailable — showing a reduced light-field view. The duet audio is unaffected.",
      );
      initCanvas2D();
    }

    // ════════════════════════════════════════════════════════════════════════
    //  CAMERA — two-person pose (optional, degrades to pointer / autonomous)
    // ════════════════════════════════════════════════════════════════════════
    let landmarker: PoseLandmarkerInst | null = null;
    let stream: MediaStream | null = null;
    let camActive = false;

    async function startCam() {
      if (camActive) return;
      setReadout((r) => ({ ...r, camState: "starting" }));
      try {
        landmarker = await createPoseTracker(2);
        const video = videoRef.current!;
        stream = await startCamera(video);
        camActive = true;
        setReadout((r) => ({ ...r, camState: "on" }));
      } catch {
        setReadout((r) => ({ ...r, camState: "failed" }));
        setNotice(
          "Camera or pose model unavailable — pointer, arrow keys and the ghost partner still drive the duet.",
        );
      }
    }

    // read up to two live poses, assigned to slots by mirrored screen-x
    function readLive(nowMs: number): Person[] | null {
      const video = videoRef.current;
      if (!landmarker || !stream || !video || video.readyState < 2) return null;
      let res;
      try {
        res = landmarker.detectForVideo(video, nowMs);
      } catch {
        return null;
      }
      const sets = res?.landmarks ?? [];
      const people: Person[] = [];
      for (const lm of sets) {
        const person = readPerson(lm);
        if (person.present) people.push(person);
      }
      // left person on screen (mirrored) drives the rose field (slot 0)
      people.sort((x, y) => 1 - x.sx - (1 - y.sx));
      return people;
    }

    // ── autonomous drives ────────────────────────────────────────────────────
    // ghost (person 2): a self-contained slow drift
    function ghostAt(tSec: number): Person {
      return {
        present: true,
        sx: 0.28 + 0.14 * Math.sin(tSec * 0.3), // (sx is video-space; mirrored later)
        height: clamp01(0.52 + 0.36 * Math.sin(tSec * 0.5)),
        span: clamp01(0.5 + 0.32 * Math.sin(tSec * 0.37 + 1.0)),
      };
    }
    // untouched person 1: drifts with a phase that slowly sweeps THROUGH the
    // ghost's, so the two periodically sync (coherence swells) and part.
    function autoP1At(tSec: number): Person {
      const off = 1.3 * Math.sin(tSec * 0.055);
      return {
        present: true,
        sx: 0.72 - 0.14 * Math.sin(tSec * 0.3 + off * 0.5),
        height: clamp01(0.52 + 0.36 * Math.sin(tSec * 0.5 + off)),
        span: clamp01(0.5 + 0.32 * Math.sin(tSec * 0.37 + 1.0 + off)),
      };
    }

    // ── the one loop ──────────────────────────────────────────────────────────
    let raf = 0;
    let lastMs = performance.now();
    let uiAccum = 0;

    function loop(nowMs: number) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.06, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const nowS = nowMs / 1000;

      const live = readLive(nowMs);
      let tracked = 0;
      let p1Source: P1Source = "auto";

      // target features for the two slots this frame
      let f1: Person;
      let f2: Person;

      if (live && live.length >= 2) {
        // two real people — full duet
        tracked = 2;
        f1 = live[0];
        f2 = live[1];
        p2IsGhost = false;
        p1Source = "live";
      } else if (live && live.length === 1) {
        // one real person + ghost partner
        tracked = 1;
        f1 = live[0];
        f2 = ghostAt(nowS);
        p2IsGhost = true;
        p1Source = "live";
      } else {
        // no live person: pointer/keys or autonomous for person 1; ghost for 2
        p2IsGhost = true;
        f2 = ghostAt(nowS);
        if (ptrActive) {
          f1 = { present: true, sx: 1 - ptrX, height: ptrHeight, span: 0.5 + ptrHeight * 0.3 };
          p1Source = "pointer";
        } else {
          f1 = autoP1At(nowS);
          p1Source = "auto";
        }
      }

      // mirror to screen space for the visuals / panners
      const sx1 = 1 - f1.sx;
      const sx2 = 1 - f2.sx;
      const ty1 = 0.32 + f1.height * 0.36;
      const ty2 = 0.32 + f2.height * 0.36;

      // push hand heights into the correlation histories
      hist1[histHead] = f1.height;
      hist2[histHead] = f2.height;
      histHead = (histHead + 1) % HIST;
      if (histN < HIST) histN++;

      // coherence = correlation(hand-height) + span match + height match
      const lin1 = new Float32Array(histN);
      const lin2 = new Float32Array(histN);
      for (let i = 0; i < histN; i++) {
        const idx = (histHead - histN + i + HIST * 2) % HIST;
        lin1[i] = hist1[idx];
        lin2[i] = hist2[idx];
      }
      const corr = computeCorr(lin1, lin2, histN);
      const spanMatch = 1 - Math.abs(f1.span - f2.span);
      const heightMatch = 1 - Math.abs(f1.height - f2.height);
      const cohTarget = clamp01(0.5 * corr + 0.25 * spanMatch + 0.25 * heightMatch);
      // immediate + rewarding: rise fast, relax a little slower
      const kc = cohTarget > coherence ? Math.min(1, dt / 0.25) : Math.min(1, dt / 0.6);
      coherence += (cohTarget - coherence) * kc;

      // ease per-person state (audio params smooth further)
      const k = Math.min(1, dt / 0.13);
      p[0].x += (sx1 - p[0].x) * k;
      p[0].y += (ty1 - p[0].y) * k;
      p[0].gain += (f1.height - p[0].gain) * k;
      p[0].span += (f1.span - p[0].span) * k;
      p[1].x += (sx2 - p[1].x) * k;
      p[1].y += (ty2 - p[1].y) * k;
      p[1].gain += (f2.height - p[1].gain) * k;
      p[1].span += (f2.span - p[1].span) * k;

      // extra convergence pull on the VISUAL centres as coherence rises
      const pull = coherence * 0.55;
      const mx = (p[0].x + p[1].x) / 2;
      const my = (p[0].y + p[1].y) / 2;
      p[0].x += (mx - p[0].x) * pull;
      p[1].x += (mx - p[1].x) * pull;
      p[0].y += (my - p[0].y) * pull;
      p[1].y += (my - p[1].y) * pull;

      applyAudio();
      readLevel();
      if (renderRef) renderRef(nowS);

      uiAccum += dt;
      if (uiAccum > 0.14) {
        uiAccum = 0;
        setReadout((r) =>
          r.peopleTracked === tracked &&
          r.p1Source === p1Source &&
          Math.abs(r.coherence - coherence) < 0.02
            ? r
            : { ...r, peopleTracked: tracked, p1Source, coherence },
        );
      }
    }
    raf = requestAnimationFrame(loop);

    engineRef.current = { startAudio, stopAudio, startCam, setTrack };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("keydown", onKey);
      try {
        landmarker?.close();
      } catch {
        /* noop */
      }
      stream?.getTracks().forEach((tk) => tk.stop());
      try {
        src?.stop();
      } catch {
        /* noop */
      }
      master?.disconnect();
      void ctx?.close();
      disposeGL?.();
      engineRef.current = null;
    };
    // built once; trackId is read via selectedTrack and driven through setTrack.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── UI handlers ─────────────────────────────────────────────────────────────
  const onStart = useCallback(() => engineRef.current?.startAudio(), []);
  const onStop = useCallback(() => engineRef.current?.stopAudio(), []);
  const onCam = useCallback(() => void engineRef.current?.startCam(), []);
  const onTrack = useCallback((id: string) => {
    setTrackId(id);
    engineRef.current?.setTrack(id);
  }, []);

  // ── derived status line ──────────────────────────────────────────────────────
  const camOn = readout.camState === "on";
  const lost = camOn && readout.peopleTracked === 0;
  let statusText: string;
  if (camOn) {
    if (readout.peopleTracked >= 2) statusText = "2 people · tracking";
    else if (readout.peopleTracked === 1) statusText = "1 person + ghost partner";
    else statusText = "tracking lost — sit back, shoulders in frame";
  } else if (readout.p1Source === "pointer") {
    statusText = "pointer + ghost partner";
  } else {
    statusText = "autonomous duet + ghost partner";
  }

  const cohPct = Math.round(readout.coherence * 100);

  const howTo = [
    "Press Play — one of Karel's piano takes begins, split into a warm low voice and a bright high voice.",
    "Allow the camera, then sit waist-up so your shoulders (and hands) are in frame. Bring a second person into the frame for the real duet.",
    "The left person shapes the rose low voice; the right person the amber high voice. Raise your hands to swell your voice, spread your arms to brighten it.",
    "Move TOGETHER — raise and lower your hands in time. As your gestures sync, the voices drift to centre, a warm reverb swell opens, and the two lights merge into one core.",
    "Solo? A ghost partner drifts on its own — match it. No camera? Move the mouse or use the arrow keys, or just watch the autonomous duet find itself.",
  ];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <video
        ref={videoRef}
        className="pointer-events-none absolute h-px w-px opacity-0"
        playsInline
        muted
      />

      {/* tracking status line — visible whenever the piece is running */}
      {soundOn && (
        <div className="pointer-events-none absolute left-4 top-4 z-30 flex flex-col gap-1">
          <span
            className={`font-mono text-xs uppercase tracking-[0.18em] ${
              lost ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {statusText}
          </span>
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
            togetherness {cohPct}%
          </span>
          {!readout.loaded && (
            <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground/70">
              loading take…
            </span>
          )}
        </div>
      )}

      {/* write-up chrome — hidden in immersive mode */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-gradient-to-t from-background/90 via-background/55 to-transparent p-6 pt-16">
          <div className="pointer-events-auto flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Duet
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
                Two people in one frame conduct one of Karel&apos;s piano takes
                together — one shapes the warm low voice, the other the bright
                high voice. Move in sync and your togetherness is the reward: the
                voices converge, a warm swell opens, and two lights merge into one
                core.
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
                disabled={readout.camState === "on" || readout.camState === "starting"}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {readout.camState === "on"
                  ? "Camera on"
                  : readout.camState === "starting"
                    ? "Starting camera…"
                    : "Conduct with camera"}
              </button>

              <label className="flex min-h-[44px] items-center gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  take
                </span>
                <select
                  value={trackId}
                  onChange={(e) => onTrack(e.target.value)}
                  className="min-h-[44px] rounded-md border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {REAL_TRACKS.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.title}
                    </option>
                  ))}
                </select>
              </label>

              <Link
                href="/dream/24360-duet/README.md"
                className="min-h-[44px] rounded-md px-3 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Read the design notes
              </Link>
            </div>

            {notice && (
              <p className="max-w-2xl text-sm leading-relaxed text-destructive">
                {notice}
              </p>
            )}
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground/70">
              Best on headphones, with two people. The camera path is control-only
              — it never records or transmits. Press F for fullscreen.
            </p>
          </div>
        </div>
      )}

      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Duet"
        description="Two people conduct one of Karel's piano takes together — one shapes a warm low voice, the other a bright high voice. A coherence signal between their gestures (hand-height correlation, arm-span and height match) converges the two spatial voices, opens a unifying reverb swell, and merges two warm light-fields into one core. Solo users duet with an autonomous, labelled ghost partner."
        howTo={howTo}
      />
    </div>
  );
}
