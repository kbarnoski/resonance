"use client";

/// <reference path="../_shared/webgpu.d.ts" />

import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// "Pulse before sound" — an entrainment duet rendered as a WAVE-INTERFERENCE
// field. Two players are two Kuramoto-style oscillators (a phase θ + a rate ω).
// Each is one wave SOURCE on a full-screen moiré surface:
//
//     field = sin(kA·d1 − θself) + sin(kB·d2 − θpartner)
//
// While the two phases beat, the moiré CRAWLS. As the two oscillators ENTRAIN
// (phases + spatial frequencies converge) the interference FREEZES into a crisp
// standing pattern — the visual signature of lock — and a consonant chord layer
// that NEITHER makes alone blooms, dissolving as they drift apart again.
//
// Transport is control-state only (BroadcastChannel, "pulse before sound": we
// send phase/rate, never audio — each tab synthesizes locally). With no partner
// a deterministic seeded ghost performs the full find→reach→lock→bloom→drift
// arc so the whole idea reads in one silent tab.
// ─────────────────────────────────────────────────────────────────────────────

// ── deterministic RNG (NO Math.random) ──────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

const TAU = Math.PI * 2;
const CHANNEL = "entrain-7912";

// oscillator + field constants (kept slow → the beating is a shimmer, never a strobe)
const BASE_OMEGA = 0.9; // rad/s  ≈ 0.14 Hz carrier — safe, sub-strobe
const BASE_K = 28; // spatial frequency of a source's rings
const K_OFFSET = 11; // ghost's natural spatial detuning
const MAX_DETUNE = 2.4; // rad/s max temporal detuning when unlocked
const K_RATE = 1.6; // spatial-frequency convergence speed
const REACH_K = 1.9; // coupling strength added when "reaching"
const BASE_COUPLE = 0.15; // resting coupling
const GHOST_LOOP = 10.5; // seconds for one solo arc
const PARTNER_TIMEOUT = 1500; // ms without a message → partner considered gone

// ── shared wave-interference fragment, expressed once per backend ────────────
const WGSL = /* wgsl */ `
struct U {
  res: vec2<f32>, time: f32, R: f32,
  posA: vec2<f32>, kA: f32, thetaA: f32,
  posB: vec2<f32>, kB: f32, thetaB: f32,
  lock: f32, bloom: f32, reduce: f32, pad: f32,
};
@group(0) @binding(0) var<uniform> u: U;

struct V { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32> };
@vertex fn vs(@builtin(vertex_index) i: u32) -> V {
  var c = array<vec2<f32>,4>(vec2<f32>(-1.,-1.), vec2<f32>(1.,-1.), vec2<f32>(-1.,1.), vec2<f32>(1.,1.));
  let xy = c[i];
  return V(vec4<f32>(xy, 0., 1.), xy);
}

fn ramp(t: f32) -> vec3<f32> {
  let a = vec3<f32>(0.02, 0.010, 0.055);
  let b = vec3<f32>(0.22, 0.09, 0.46);
  let c = vec3<f32>(0.55, 0.36, 0.97);
  let d = vec3<f32>(0.90, 0.86, 1.0);
  let x = clamp(t, 0.0, 1.0);
  if (x < 0.4) { return mix(a, b, smoothstep(0.0, 0.4, x)); }
  if (x < 0.75) { return mix(b, c, smoothstep(0.4, 0.75, x)); }
  return mix(c, d, smoothstep(0.75, 1.0, x));
}

@fragment fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let aspect = u.res.x / u.res.y;
  var p = vec2<f32>(uv.x * aspect, uv.y);
  let d1 = distance(p, u.posA);
  let d2 = distance(p, u.posB);
  let w1 = sin(u.kA * d1 - u.thetaA);
  let w2 = sin(u.kB * d2 - u.thetaB);
  let f = (w1 + w2) * 0.5;
  var bri = 0.5 + 0.5 * f;
  // at lock the fringes snap crisp
  bri = mix(bri, smoothstep(0.30, 0.70, bri), u.lock * 0.8);
  // source glow so the two "singers" are legible
  bri = bri + (exp(-d1 * d1 * 7.0) + exp(-d2 * d2 * 7.0)) * 0.16;
  // lock bloom + gentle vignette
  let vign = 1.0 - 0.55 * length(p * vec2<f32>(0.68, 1.0));
  bri = bri * mix(0.72, 1.16, u.bloom) * clamp(vign, 0.0, 1.2);
  return vec4<f32>(ramp(clamp(bri, 0.0, 1.0)), 1.0);
}
`;

const GLSL_VERT = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const GLSL_FRAG = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 res; uniform float R, lock, bloom, reduce;
uniform vec2 posA, posB; uniform float kA, kB, thetaA, thetaB;
vec3 ramp(float t){
  vec3 a=vec3(0.02,0.010,0.055), b=vec3(0.22,0.09,0.46), c=vec3(0.55,0.36,0.97), d=vec3(0.90,0.86,1.0);
  float x=clamp(t,0.0,1.0);
  if(x<0.4) return mix(a,b,smoothstep(0.0,0.4,x));
  if(x<0.75) return mix(b,c,smoothstep(0.4,0.75,x));
  return mix(c,d,smoothstep(0.75,1.0,x));
}
void main(){
  vec2 uv = (gl_FragCoord.xy / res) * 2.0 - 1.0;
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x*aspect, uv.y);
  float d1 = distance(p, posA);
  float d2 = distance(p, posB);
  float w1 = sin(kA*d1 - thetaA);
  float w2 = sin(kB*d2 - thetaB);
  float f = (w1+w2)*0.5;
  float bri = 0.5 + 0.5*f;
  bri = mix(bri, smoothstep(0.30,0.70,bri), lock*0.8);
  bri = bri + (exp(-d1*d1*7.0) + exp(-d2*d2*7.0))*0.16;
  float vign = 1.0 - 0.55*length(p*vec2(0.68,1.0));
  bri = bri * mix(0.72,1.16,bloom) * clamp(vign,0.0,1.2);
  o = vec4(ramp(clamp(bri,0.0,1.0)), 1.0);
}`;

type RenderMode = "webgpu" | "webgl2" | "css";

// ── oscillator state ─────────────────────────────────────────────────────────
interface Osc {
  x: number; // normalized, center origin, y up
  y: number;
  theta: number;
  omega: number;
  k: number;
  reach: number; // 0..1 coupling intent
}

interface PartnerMsg {
  peer: string;
  x: number;
  y: number;
  theta: number;
  omega: number;
  k: number;
  reach: number;
}

export default function Page() {
  const [entered, setEntered] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [mode, setMode] = useState<RenderMode>("webgpu");
  const [hasPartner, setHasPartner] = useState(false);
  const [locked, setLocked] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cssARef = useRef<HTMLDivElement | null>(null);
  const cssBRef = useRef<HTMLDivElement | null>(null);
  const rMeterRef = useRef<HTMLDivElement | null>(null);

  const startEngine = useCallback(() => {
    setEntered(true);
  }, []);

  useEffect(() => {
    if (!entered) return;
    const canvasMaybe = canvasRef.current;
    if (!canvasMaybe) return;
    const canvas: HTMLCanvasElement = canvasMaybe;

    // ── live simulation state ─────────────────────────────────────────────
    const self: Osc = { x: 0, y: 0, theta: 0, omega: BASE_OMEGA, k: BASE_K, reach: 0 };
    const ghost: Osc = { x: 0.6, y: 0.3, theta: 1.7, omega: BASE_OMEGA, k: BASE_K + K_OFFSET, reach: 0 };
    const partner = { x: 0, y: 0, theta: 0, k: BASE_K, reach: 0, active: false, lastSeen: -1 };
    const rng = mulberry32(0x7912);
    // seed a stable ghost personality
    const ghostSeedA = rng() * TAU;
    const ghostSeedB = 0.35 + rng() * 0.35;
    const ghostEdgeAngle = rng() * TAU;
    const selfDriftA = rng() * TAU;
    const selfDriftB = rng() * TAU;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const timeScale = reduce ? 0.45 : 1;

    let pointerX = 0;
    let pointerY = 0;
    let pointerActive = false;
    let pressing = false;

    // ── transport ─────────────────────────────────────────────────────────
    const peerId = crypto.randomUUID();
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (ev: MessageEvent) => {
        const m = ev.data as PartnerMsg;
        if (!m || m.peer === peerId) return;
        partner.x = m.x;
        partner.y = m.y;
        partner.theta = m.theta;
        partner.k = m.k;
        partner.reach = m.reach;
        partner.active = true;
        partner.lastSeen = performance.now();
      };
    } catch {
      bc = null;
    }

    // ── audio (synthesized locally; starts on first gesture) ───────────────
    interface Audio {
      ctx: AudioContext;
      master: GainNode;
      oscA: OscillatorNode;
      oscB: OscillatorNode;
      amA: GainNode;
      amB: GainNode;
      chord: OscillatorNode[];
      chordGain: GainNode;
    }
    let audio: Audio | null = null;
    const F_A = 196; // G3
    function runAudioStart() {
      if (audio) {
        if (audio.ctx.state === "suspended") void audio.ctx.resume();
        return;
      }
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(ctx.destination);
      master.gain.setTargetAtTime(0.12, ctx.currentTime, 0.4);

      const mk = (freq: number, level: number) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const am = ctx.createGain();
        am.gain.value = level;
        osc.connect(am);
        am.connect(master);
        osc.start();
        return { osc, am };
      };
      const a = mk(F_A, 0.5);
      const b = mk(F_A, 0.5);

      // emergent just-intonation triad (root · 5/4 · 3/2), the reward at lock
      const chordGain = ctx.createGain();
      chordGain.gain.value = 0.0001;
      chordGain.connect(master);
      const root = F_A / 2; // G2
      const chord = [root, root * 1.25, root * 1.5].map((f) => {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.28;
        o.connect(g);
        g.connect(chordGain);
        o.start();
        return o;
      });

      audio = { ctx, master, oscA: a.osc, oscB: b.osc, amA: a.am, amB: b.am, chord, chordGain };
    }

    // ── render backends ───────────────────────────────────────────────────
    let renderMode: RenderMode = "css";
    let dpr = 1;

    // WebGPU handles
    let gpuDevice: GPUDevice | null = null;
    let gpuCtx: GPUCanvasContext | null = null;
    let gpuPipe: GPURenderPipeline | null = null;
    let gpuUniform: GPUBuffer | null = null;
    let gpuBind: GPUBindGroup | null = null;
    const ubo = new Float32Array(16);

    // WebGL2 handles
    let gl: WebGL2RenderingContext | null = null;
    let glProg: WebGLProgram | null = null;
    let glVao: WebGLVertexArrayObject | null = null;
    const glLoc: Record<string, WebGLUniformLocation | null> = {};

    function applyResize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(window.innerWidth * dpr));
      const h = Math.max(1, Math.floor(window.innerHeight * dpr));
      if (canvas) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    async function runInitGpu(): Promise<boolean> {
      if (!navigator.gpu) return false;
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return false;
        const device = await adapter.requestDevice();
        const ctx = canvas.getContext("webgpu") as GPUCanvasContext | null;
        if (!ctx) return false;
        const fmt = navigator.gpu.getPreferredCanvasFormat();
        ctx.configure({ device, format: fmt, alphaMode: "opaque" });
        const mod = device.createShaderModule({ code: WGSL });
        const pipe = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: mod, entryPoint: "vs" },
          fragment: { module: mod, entryPoint: "fs", targets: [{ format: fmt }] },
          primitive: { topology: "triangle-strip" },
        });
        const uniform = device.createBuffer({
          size: 64,
          usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        const bind = device.createBindGroup({
          layout: pipe.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniform } }],
        });
        gpuDevice = device;
        gpuCtx = ctx;
        gpuPipe = pipe;
        gpuUniform = uniform;
        gpuBind = bind;
        return true;
      } catch {
        return false;
      }
    }

    function runInitGl(): boolean {
      try {
        const context = canvas.getContext("webgl2");
        if (!context) return false;
        const compile = (type: number, src: string) => {
          const sh = context.createShader(type);
          if (!sh) return null;
          context.shaderSource(sh, src);
          context.compileShader(sh);
          if (!context.getShaderParameter(sh, context.COMPILE_STATUS)) return null;
          return sh;
        };
        const vs = compile(context.VERTEX_SHADER, GLSL_VERT);
        const fs = compile(context.FRAGMENT_SHADER, GLSL_FRAG);
        if (!vs || !fs) return false;
        const prog = context.createProgram();
        if (!prog) return false;
        context.attachShader(prog, vs);
        context.attachShader(prog, fs);
        context.linkProgram(prog);
        if (!context.getProgramParameter(prog, context.LINK_STATUS)) return false;
        const vao = context.createVertexArray();
        context.bindVertexArray(vao);
        const buf = context.createBuffer();
        context.bindBuffer(context.ARRAY_BUFFER, buf);
        context.bufferData(
          context.ARRAY_BUFFER,
          new Float32Array([-1, -1, 3, -1, -1, 3]),
          context.STATIC_DRAW,
        );
        const loc = context.getAttribLocation(prog, "a");
        context.enableVertexAttribArray(loc);
        context.vertexAttribPointer(loc, 2, context.FLOAT, false, 0, 0);
        for (const name of [
          "res", "R", "lock", "bloom", "reduce",
          "posA", "posB", "kA", "kB", "thetaA", "thetaB",
        ]) {
          glLoc[name] = context.getUniformLocation(prog, name);
        }
        gl = context;
        glProg = prog;
        glVao = vao;
        return true;
      } catch {
        return false;
      }
    }

    // ── per-frame draw ────────────────────────────────────────────────────
    function drawGpu(R: number, lock: number, bloom: number) {
      if (!gpuDevice || !gpuCtx || !gpuPipe || !gpuUniform || !gpuBind || !canvas) return;
      ubo[0] = canvas.width;
      ubo[1] = canvas.height;
      ubo[2] = 0;
      ubo[3] = R;
      ubo[4] = self.x;
      ubo[5] = self.y;
      ubo[6] = self.k;
      ubo[7] = self.theta;
      const bx = partner.active ? partner.x : ghost.x;
      const by = partner.active ? partner.y : ghost.y;
      const bk = partner.active ? partner.k : ghost.k;
      const bt = partner.active ? partner.theta : ghost.theta;
      ubo[8] = bx;
      ubo[9] = by;
      ubo[10] = bk;
      ubo[11] = bt;
      ubo[12] = lock;
      ubo[13] = bloom;
      ubo[14] = reduce ? 1 : 0;
      ubo[15] = 0;
      // kA/kB (~40) sum with distances (~0..2.5) to draw the interference rings
      gpuDevice.queue.writeBuffer(gpuUniform, 0, ubo);
      const enc = gpuDevice.createCommandEncoder();
      const view = gpuCtx.getCurrentTexture().createView();
      const pass = enc.beginRenderPass({
        colorAttachments: [
          { view, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" },
        ],
      });
      pass.setPipeline(gpuPipe);
      pass.setBindGroup(0, gpuBind);
      pass.draw(4);
      pass.end();
      gpuDevice.queue.submit([enc.finish()]);
    }

    function drawGl(R: number, lock: number, bloom: number) {
      if (!gl || !glProg || !canvas) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(glProg);
      gl.bindVertexArray(glVao);
      gl.uniform2f(glLoc.res, canvas.width, canvas.height);
      gl.uniform1f(glLoc.R, R);
      gl.uniform1f(glLoc.lock, lock);
      gl.uniform1f(glLoc.bloom, bloom);
      gl.uniform1f(glLoc.reduce, reduce ? 1 : 0);
      gl.uniform2f(glLoc.posA, self.x, self.y);
      gl.uniform1f(glLoc.kA, self.k);
      gl.uniform1f(glLoc.thetaA, self.theta);
      const bx = partner.active ? partner.x : ghost.x;
      const by = partner.active ? partner.y : ghost.y;
      const bk = partner.active ? partner.k : ghost.k;
      const bt = partner.active ? partner.theta : ghost.theta;
      gl.uniform2f(glLoc.posB, bx, by);
      gl.uniform1f(glLoc.kB, bk);
      gl.uniform1f(glLoc.thetaB, bt);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function drawCss(lock: number, bloom: number) {
      const a = cssARef.current;
      const b = cssBRef.current;
      if (!a || !b) return;
      const bx = partner.active ? partner.x : ghost.x;
      const bk = partner.active ? partner.k : ghost.k;
      const bt = partner.active ? partner.theta : ghost.theta;
      // two repeating-gradient layers whose offset+angle beat, then freeze at lock
      const spA = clamp(220 - self.k, 40, 220);
      const spB = clamp(220 - bk, 40, 220);
      const offA = ((self.theta / TAU) * spA) % spA;
      const offB = ((bt / TAU) * spB + self.x * 60 - bx * 60) % spB;
      const angA = 62 + self.x * 24;
      const angB = 118 - bx * 24;
      a.style.backgroundImage = `repeating-linear-gradient(${angA}deg, rgba(139,92,246,0.0) 0px, rgba(196,181,253,${0.5 + bloom * 0.35}) ${spA * 0.25}px, rgba(139,92,246,0.0) ${spA * 0.5}px)`;
      a.style.backgroundPosition = `${offA}px 0`;
      b.style.backgroundImage = `repeating-linear-gradient(${angB}deg, rgba(91,46,201,0.0) 0px, rgba(167,139,250,${0.5 + bloom * 0.35}) ${spB * 0.25}px, rgba(91,46,201,0.0) ${spB * 0.5}px)`;
      b.style.backgroundPosition = `${offB}px 0`;
      const sharp = 0.65 + lock * 0.55;
      a.style.filter = `contrast(${sharp}) saturate(1.1)`;
      b.style.filter = `contrast(${sharp}) saturate(1.1)`;
    }

    // ── audio update ──────────────────────────────────────────────────────
    function applyAudio(R: number, lock: number) {
      if (!audio) return;
      const t = audio.ctx.currentTime;
      // each source pulses (AM) at its own phase — "pulse before sound"
      const pulseA = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(self.theta));
      const bt = partner.active ? partner.theta : ghost.theta;
      const pulseB = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(bt));
      audio.amA.gain.setTargetAtTime(0.5 * pulseA, t, 0.05);
      audio.amB.gain.setTargetAtTime(0.5 * pulseB, t, 0.05);
      // beat you HEAR: detuning shrinks to unison as they lock
      audio.oscB.frequency.setTargetAtTime(F_A + (1 - R) * 6.5, t, 0.08);
      // emergent chord blooms only at strong lock
      const chordLevel = smooth(0.55, 0.9, lock);
      audio.chordGain.gain.setTargetAtTime(chordLevel, t, 0.18);
    }

    // ── the loop ──────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let lastBroadcast = 0;
    let lockS = 0; // smoothed lock amount
    let bloomS = 0;
    let lockedFlag = false;

    function frame(now: number) {
      const dtRaw = (now - last) / 1000;
      last = now;
      const dt = clamp(dtRaw, 0, 0.05) * timeScale;

      // partner liveness
      if (partner.active && now - partner.lastSeen > PARTNER_TIMEOUT) {
        partner.active = false;
      }

      // self position + reach source
      if (pointerActive) {
        self.x += (pointerX - self.x) * clamp(dt * 9, 0, 1);
        self.y += (pointerY - self.y) * clamp(dt * 9, 0, 1);
        self.reach += ((pressing ? 1 : 0.15) - self.reach) * clamp(dt * 4, 0, 1);
      }

      let bosc: Osc; // the other oscillator we couple with
      if (partner.active) {
        // real partner: gentle self drift only if idle
        if (!pointerActive) {
          self.x = 0.35 * Math.sin(now * 0.00018 + selfDriftA);
          self.y = 0.28 * Math.sin(now * 0.00013 + selfDriftB);
          self.reach += (0.15 - self.reach) * clamp(dt * 2, 0, 1);
        }
        bosc = { x: partner.x, y: partner.y, theta: partner.theta, omega: BASE_OMEGA, k: partner.k, reach: partner.reach };
        // self couples toward partner
        const kc = BASE_COUPLE + REACH_K * self.reach * partner.reach;
        self.theta += (self.omega + kc * Math.sin(partner.theta - self.theta)) * dt;
        // spatial-frequency convergence when reaching
        const kt = lerp(BASE_K, partner.k, self.reach);
        self.k += (kt - self.k) * clamp(K_RATE * dt, 0, 1);
      } else {
        // ── solo: seeded ghost drives the whole arc ──────────────────────
        const pp = ((now / 1000) % GHOST_LOOP) / GHOST_LOOP;
        // approach envelope: come in, hold at lock, drift back out
        const approach = smooth(0.14, 0.42, pp) * (1 - smooth(0.72, 0.98, pp));
        // lock plateau: omega matches only in the middle of the arc
        const lockEnv = smooth(0.42, 0.55, pp) * (1 - smooth(0.70, 0.82, pp));
        ghost.reach = approach;
        // in a silent no-input tab, self auto-reaches with the ghost
        if (!pointerActive) {
          self.reach += (approach - self.reach) * clamp(dt * 3, 0, 1);
          self.x = 0.22 * Math.sin(now * 0.00021 + selfDriftA);
          self.y = 0.18 * Math.cos(now * 0.00016 + selfDriftB);
        }
        // ghost swings in from a seeded edge toward the self, then back
        const ex = 0.95 * Math.cos(ghostEdgeAngle);
        const ey = 0.8 * Math.sin(ghostEdgeAngle);
        const nearx = self.x + 0.28 * Math.cos(ghostSeedA);
        const neary = self.y + 0.24 * Math.sin(ghostSeedA);
        ghost.x = lerp(ex, nearx, approach);
        ghost.y = lerp(ey, neary, approach);
        // ghost natural rate: detuned except in the lock plateau
        const detune = (1 - lockEnv) * MAX_DETUNE * ghostSeedB;
        ghost.omega = BASE_OMEGA + detune;
        // ghost spatial freq relaxes to its natural offset, pulled to self when reaching
        const gkTarget = lerp(BASE_K + K_OFFSET, self.k, ghost.reach);
        ghost.k += (gkTarget - ghost.k) * clamp(K_RATE * dt, 0, 1);
        // self spatial freq pulled toward ghost when reaching
        const skTarget = lerp(BASE_K, ghost.k, self.reach);
        self.k += (skTarget - self.k) * clamp(K_RATE * dt, 0, 1);
        // mutual Kuramoto coupling
        const kc = BASE_COUPLE + REACH_K * self.reach;
        const gc = BASE_COUPLE + REACH_K * ghost.reach;
        self.theta += (self.omega + kc * Math.sin(ghost.theta - self.theta)) * dt;
        ghost.theta += (ghost.omega + gc * Math.sin(self.theta - ghost.theta)) * dt;
        bosc = ghost;
      }

      // wrap phases to keep floats bounded
      self.theta = ((self.theta % TAU) + TAU) % TAU;
      ghost.theta = ((ghost.theta % TAU) + TAU) % TAU;

      // order parameter R = |cos(Δφ/2)|  and frequency match
      const R = Math.abs(Math.cos((bosc.theta - self.theta) / 2));
      const kSpan = K_OFFSET;
      const freqMatch = 1 - clamp(Math.abs(self.k - bosc.k) / kSpan, 0, 1);
      const lockTarget = R * freqMatch;
      lockS += (lockTarget - lockS) * clamp(dt * 3.5, 0, 1);
      const bloomTarget = smooth(0.5, 0.92, lockS);
      bloomS += (bloomTarget - bloomS) * clamp(dt * 2.5, 0, 1);

      // draw
      if (renderMode === "webgpu") drawGpu(R, lockS, bloomS);
      else if (renderMode === "webgl2") drawGl(R, lockS, bloomS);
      else drawCss(lockS, bloomS);

      applyAudio(R, lockS);

      // HUD (imperative to avoid per-frame React churn)
      if (rMeterRef.current) {
        rMeterRef.current.style.transform = `scaleX(${clamp(R, 0, 1)})`;
      }
      const nowLocked = lockS > 0.8;
      if (nowLocked !== lockedFlag) {
        lockedFlag = nowLocked;
        setLocked(nowLocked);
      }

      // broadcast our control state at ~20 Hz
      if (now - lastBroadcast > 50) {
        lastBroadcast = now;
        bc?.postMessage({
          peer: peerId,
          x: self.x,
          y: self.y,
          theta: self.theta,
          omega: self.omega,
          k: self.k,
          reach: self.reach,
        } satisfies PartnerMsg);
      }
      setHasPartnerRef(partner.active);

      raf = requestAnimationFrame(frame);
    }

    // throttle React partner flag
    let lastPartnerState = false;
    function setHasPartnerRef(v: boolean) {
      if (v !== lastPartnerState) {
        lastPartnerState = v;
        setHasPartner(v);
      }
    }

    // ── pointer ───────────────────────────────────────────────────────────
    function toField(clientX: number, clientY: number) {
      const aspect = window.innerWidth / window.innerHeight;
      const nx = (clientX / window.innerWidth) * 2 - 1;
      const ny = 1 - (clientY / window.innerHeight) * 2;
      pointerX = nx * aspect;
      pointerY = ny;
    }
    const onMove = (e: PointerEvent) => {
      pointerActive = true;
      toField(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      runAudioStart();
      pointerActive = true;
      pressing = true;
      toField(e.clientX, e.clientY);
    };
    const onUp = () => {
      pressing = false;
    };
    const onLeave = () => {
      pointerActive = false;
      pressing = false;
    };

    // ── boot ──────────────────────────────────────────────────────────────
    let cancelled = false;
    (async () => {
      applyResize();
      if (await runInitGpu()) renderMode = "webgpu";
      else if (runInitGl()) renderMode = "webgl2";
      else renderMode = "css";
      if (cancelled) return;
      setMode(renderMode);
      window.addEventListener("resize", applyResize);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointerleave", onLeave);
      last = performance.now();
      raf = requestAnimationFrame(frame);
    })();

    // ── teardown ────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", applyResize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      bc?.close();
      if (audio) {
        try {
          audio.oscA.stop();
          audio.oscB.stop();
          audio.chord.forEach((o) => o.stop());
        } catch {
          /* already stopped */
        }
        audio.master.disconnect();
        void audio.ctx.close();
        audio = null;
      }
      if (gl && glProg) {
        gl.deleteProgram(glProg);
        if (glVao) gl.deleteVertexArray(glVao);
      }
      if (gpuUniform) gpuUniform.destroy();
      if (gpuDevice) gpuDevice.destroy();
      gpuDevice = null;
      gpuCtx = null;
    };
  }, [entered]);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* render surfaces */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: mode === "css" ? "none" : "block" }}
      />
      {mode === "css" && (
        <div className="absolute inset-0 bg-background">
          <div ref={cssARef} className="absolute inset-0 mix-blend-screen" />
          <div ref={cssBRef} className="absolute inset-0 mix-blend-screen" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,var(--background)_120%)]" />
        </div>
      )}

      {/* pre-enter hero */}
      {!entered && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-background/80 px-6 text-center backdrop-blur-sm">
          <div className="max-w-xl">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Pulse before sound
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              Two people, two oscillators, one wave-interference field. Neither
              can complete the sound alone — it blooms only when your phases
              entrain and the moiré freezes into lock.
            </p>
          </div>
          <button
            type="button"
            onClick={startEngine}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Enter the field
          </button>
          <p className="text-sm text-muted-foreground">
            Open in a second tab to duet. Move to steer your wave; hold to reach.
          </p>
        </div>
      )}

      {/* HUD */}
      {entered && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 p-4">
          <div className="flex flex-col gap-2">
            <div className="text-sm text-muted-foreground">
              {hasPartner ? "Partner present — entrain together" : "Ghost partner drifting — hold to reach"}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">lock</span>
              <div className="h-1.5 w-32 overflow-hidden rounded-md bg-muted">
                <div
                  ref={rMeterRef}
                  className="h-full w-full origin-left rounded-md bg-primary"
                  style={{ transform: "scaleX(0)" }}
                />
              </div>
              {locked && <span className="text-sm font-medium text-primary">bloom</span>}
            </div>
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {mode !== "webgpu" && (
              <span className="rounded-md border border-border bg-background/60 px-3 py-1 text-sm text-muted-foreground">
                WebGPU unavailable — showing lightweight interference
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Design notes
            </button>
          </div>
        </div>
      )}

      {/* design notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Each player is a Kuramoto-style oscillator: a phase θ and a rate
                ω. Each is one wave source on a full-screen moiré surface, and
                the fragment shader sums their live superposition,{" "}
                <span className="text-foreground">
                  sin(kA·d₁ − θself) + sin(kB·d₂ − θpartner)
                </span>
                . Two independent phases make the interference crawl and shimmer
                — the beating you also hear.
              </p>
              <p>
                Holding &ldquo;reaches&rdquo; — it turns up the coupling so your
                phase and spatial frequency bend toward your partner&apos;s.
                When the order parameter R = |cos(Δφ/2)| climbs and the
                frequencies match, the crawl freezes into a crisp standing
                pattern and a just-intonation triad blooms: the emergent third
                neither of you can summon alone. Drift apart and it dissolves.
              </p>
              <p>
                Rendered with a WebGPU render pipeline; it falls back to a
                WebGL2 fragment shader, then to an animated CSS moiré, so the
                same physics survives on a phone. Transport is control-state
                only over BroadcastChannel — &ldquo;pulse before sound&rdquo;: we
                send phase and rate, never audio, and each tab synthesizes
                locally. With no partner a seeded ghost performs the full
                find → reach → lock → bloom → drift arc.
              </p>
              <p className="text-xs">
                After: &ldquo;Pulse Before Sound&rdquo; telematic-music model
                (JoNMA 2026); coupled-oscillator / Kuramoto model of joint
                musical timing.
              </p>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
