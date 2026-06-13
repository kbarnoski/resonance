// render.ts — the living aurora sky.
//
// Primary path: raw WebGL2 GLSL aurora/field (NO three.js). It drifts and breathes
// from frame ONE — a silent glance shows a living sky. Each generative note and each
// child touch "blooms" into the field, so a silent glance also reads "this is music".
// Fallback path: Canvas2D field that still drifts + blooms if WebGL2 is unavailable.

import type { Sky } from "./weather";
import type { NoteEvent } from "./audio";

// A bloom is a transient glow seeded by a scheduled note or a child touch.
interface Bloom {
  x: number;     // 0..1
  y: number;     // 0..1
  born: number;  // ms timestamp
  life: number;  // ms duration
  hue: number;   // 0..1
  source: 0 | 1; // 0 generative, 1 touch
  size: number;  // 0..1
}

// Visual tuning derived from the live weather (colours, motion, haze).
interface SkyVisual {
  hueA: number;
  hueB: number;
  drift: number;   // aurora horizontal drift speed
  haze: number;    // 0..1 cloud cover veil
  warmth: number;  // 0..1 from temperature
  night: number;   // 0..1 (1 = night)
  bands: number;   // aurora band count-ish
}

function makeVisual(sky: Sky): SkyVisual {
  const night = sky.isDay ? 0 : 1;
  const haze = Math.max(0, Math.min(1, sky.cloudCover / 100));
  const warmth = Math.max(0, Math.min(1, (sky.tempC + 10) / 45));
  const drift = 0.04 + Math.max(0, Math.min(40, sky.windSpeed)) / 40 * 0.22;
  let hueA = 0.55, hueB = 0.78;
  switch (sky.condition) {
    case "clear":   hueA = sky.isDay ? 0.10 : 0.62; hueB = sky.isDay ? 0.50 : 0.82; break;
    case "partly":  hueA = sky.isDay ? 0.13 : 0.60; hueB = sky.isDay ? 0.52 : 0.80; break;
    case "overcast":hueA = 0.55; hueB = 0.66; break;
    case "fog":     hueA = 0.54; hueB = 0.60; break;
    case "rain":    hueA = 0.50; hueB = 0.72; break;
    case "snow":    hueA = 0.54; hueB = 0.96; break;
    case "showers": hueA = 0.52; hueB = 0.70; break;
    case "thunder": hueA = 0.62; hueB = 0.76; break;
  }
  // warmth nudges toward amber
  hueA = hueA * (1 - warmth * 0.3) + 0.08 * warmth * 0.3;
  return { hueA, hueB, drift, haze, warmth, night, bands: 3 + Math.round(haze * 2) };
}

// ── GLSL ────────────────────────────────────────────────────────────────────

const VERT = `#version 300 es
out vec2 vUv;
void main(){
  vec2 p;
  if(gl_VertexID==0) p=vec2(-1.0,-1.0);
  else if(gl_VertexID==1) p=vec2( 3.0,-1.0);
  else p=vec2(-1.0, 3.0);
  vUv = p*0.5+0.5;
  gl_Position = vec4(p,0.0,1.0);
}`;

const MAX_BLOOMS = 24;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_time;
uniform float u_hueA;
uniform float u_hueB;
uniform float u_drift;
uniform float u_haze;
uniform float u_warmth;
uniform float u_night;
uniform float u_energy;          // global breath from recent notes
uniform int   u_nblooms;
uniform vec4  u_blooms[${MAX_BLOOMS}]; // xy=pos(0..1), z=age(0..1), w=src*0.5+size
uniform float u_bloomHue[${MAX_BLOOMS}];

vec3 hsl2rgb(vec3 c){
  vec3 rgb = clamp(abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
  rgb = rgb*rgb*(3.0-2.0*rgb);
  return c.z + c.y*(rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i=floor(p); vec2 f=fract(p);
  vec2 u=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1.0,0.0));
  float c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
float fbm(vec2 p){
  float v=0.0, amp=0.5;
  for(int i=0;i<5;i++){ v+=amp*vnoise(p); p*=2.0; amp*=0.5; }
  return v;
}

void main(){
  vec2 uv = vUv;
  float asp = u_res.x/max(u_res.y,1.0);
  vec2 p = uv; p.x *= asp;
  float t = u_time;

  // ── base sky gradient (warm/dreamy), darker at night ───────────────────
  float topL  = mix(0.10, 0.04, u_night);
  float botL  = mix(0.20, 0.07, u_night);
  float baseL = mix(botL, topL, uv.y);
  vec3 col = hsl2rgb(vec3(mix(u_hueA,u_hueB,uv.y*0.6), 0.45, baseL));

  // warm horizon glow
  float horizon = smoothstep(0.0,0.45,uv.y);
  col += hsl2rgb(vec3(0.07,0.6,0.12))*(1.0-horizon)*(0.35*(0.5+u_warmth));

  // ── aurora bands: layered drifting fbm curtains ────────────────────────
  float aurora = 0.0;
  for(int b=0;b<3;b++){
    float fb = float(b);
    float yC = 0.42 + fb*0.16 + 0.05*sin(t*0.2+fb);
    float warp = fbm(vec2(p.x*1.6 + t*u_drift*(1.0+fb*0.3), t*0.08+fb))*0.18;
    float band = uv.y - (yC + warp);
    float width = 0.10 + 0.05*sin(t*0.15+fb*1.7);
    float glow = exp(-band*band/(2.0*width*width));
    // ripple across the band so it shimmers
    float shimmer = 0.6+0.4*sin(p.x*8.0 - t*1.2 + fb*2.0 + warp*10.0);
    aurora += glow*shimmer*(0.6 - fb*0.12);
  }
  aurora *= (1.0 - u_haze*0.35);                 // clouds veil the aurora a bit
  aurora *= (0.8 + u_energy*0.8);                // the music makes it breathe
  float aHue = mix(u_hueA, u_hueB, 0.5+0.5*sin(t*0.1));
  col += hsl2rgb(vec3(aHue, 0.7, 0.55))*aurora*0.9;

  // ── soft cloud veil from cloud cover ───────────────────────────────────
  float clouds = fbm(vec2(p.x*1.4 - t*u_drift*0.4, uv.y*2.0 + t*0.03));
  float veil = smoothstep(0.4,0.9,clouds)*u_haze;
  col = mix(col, hsl2rgb(vec3(u_hueA,0.2, mix(0.25,0.12,u_night))), veil*0.5);

  // ── drifting stars at night ────────────────────────────────────────────
  if(u_night>0.5){
    vec2 sg = floor(p*vec2(60.0,60.0));
    float s = hash(sg);
    if(s>0.985){
      vec2 f = fract(p*vec2(60.0,60.0))-0.5;
      float tw = 0.5+0.5*sin(t*2.0 + s*30.0);
      col += vec3(0.9,0.95,1.0)*exp(-dot(f,f)*60.0)*tw*0.8;
    }
  }

  // ── note blooms: each scheduled note + each touch glows ─────────────────
  for(int i=0;i<${MAX_BLOOMS};i++){
    if(i>=u_nblooms) break;
    vec4 bd = u_blooms[i];
    vec2 bp = bd.xy; bp.x *= asp;
    float age = bd.z;                 // 0 new -> 1 dead
    float src = step(0.25, bd.w);     // touch?
    float size = fract(bd.w*2.0)*0.5+0.04;
    float d = length(p - bp);
    float r = size*(0.4 + age*1.4);   // expands outward
    float ring = exp(-pow((d-r)/ (0.03+size*0.2),2.0));
    float core = exp(-d*d/(size*size*0.5));
    float fade = (1.0-age);
    float amt = (core*0.9 + ring*0.6)*fade;
    amt *= (src>0.5)? 1.6 : 0.9;       // child voices glow brighter
    col += hsl2rgb(vec3(u_bloomHue[i], 0.8, 0.6))*amt;
  }

  // gentle vignette + tonemap
  float vig = 1.0 - smoothstep(0.45,1.05,length(uv-0.5));
  col *= mix(0.75,1.0,vig);
  col = col/(col+vec3(0.85));
  col = pow(col, vec3(0.92));
  fragColor = vec4(col,1.0);
}`;

// ── Renderer ─────────────────────────────────────────────────────────────────

export class SkyRenderer {
  readonly usingWebGL: boolean;
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private prog: WebGLProgram | null = null;
  private uni: Record<string, WebGLUniformLocation | null> = {};
  private vis: SkyVisual;
  private blooms: Bloom[] = [];
  private W = 1;
  private H = 1;
  private dpr = 1;
  private raf = 0;
  private start = performance.now();
  private energy = 0;
  // sampler that returns AudioContext time + drains note events
  private sampler: (() => { now: number; events: NoteEvent[] }) | null = null;

  constructor(canvas: HTMLCanvasElement, sky: Sky) {
    this.canvas = canvas;
    this.vis = makeVisual(sky);
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, premultipliedAlpha: false });
    if (gl && this.initGL(gl)) {
      this.gl = gl;
      this.usingWebGL = true;
    } else {
      this.ctx2d = canvas.getContext("2d");
      this.usingWebGL = false;
    }
    this.resize();
  }

  setSky(sky: Sky): void {
    this.vis = makeVisual(sky);
  }

  // give the renderer a way to pull audio time + pending blooms each frame
  setSampler(fn: () => { now: number; events: NoteEvent[] }): void {
    this.sampler = fn;
  }

  private initGL(gl: WebGL2RenderingContext): boolean {
    const vs = this.compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = this.compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    this.prog = prog;
    gl.useProgram(prog);
    for (const name of [
      "u_res", "u_time", "u_hueA", "u_hueB", "u_drift", "u_haze",
      "u_warmth", "u_night", "u_energy", "u_nblooms", "u_blooms", "u_bloomHue",
    ]) {
      this.uni[name] = gl.getUniformLocation(prog, name);
    }
    return true;
  }

  private compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = this.canvas.clientWidth || this.canvas.offsetWidth || 1;
    this.H = this.canvas.clientHeight || this.canvas.offsetHeight || 1;
    this.canvas.width = Math.max(1, Math.floor(this.W * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.H * this.dpr));
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  // add a bloom from a note event; weather hue tints generative ones
  private addBloom(ev: NoteEvent): void {
    const hue = ev.source === 1
      ? this.vis.hueB
      : this.vis.hueA * 0.5 + this.vis.hueB * 0.5;
    const x = ev.x ?? Math.random();
    const y = ev.y ?? (1 - ev.height) * 0.7 + 0.15;
    this.blooms.push({
      x, y,
      born: performance.now(),
      life: ev.source === 1 ? 1700 : 1100,
      hue: (hue + (Math.random() - 0.5) * 0.06 + 1) % 1,
      source: ev.source,
      size: ev.source === 1 ? 0.5 : 0.25 + Math.random() * 0.2,
    });
    if (this.blooms.length > MAX_BLOOMS) this.blooms.shift();
    this.energy = Math.min(1.4, this.energy + (ev.source === 1 ? 0.5 : 0.22));
  }

  // a direct touch ripple even before audio (instant <50ms response)
  addTouchRipple(x: number, y: number): void {
    this.blooms.push({
      x, y, born: performance.now(), life: 1700,
      hue: this.vis.hueB, source: 1, size: 0.55,
    });
    if (this.blooms.length > MAX_BLOOMS) this.blooms.shift();
    this.energy = Math.min(1.4, this.energy + 0.5);
  }

  begin(): void {
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private frame(): void {
    // pull audio time + new note events into blooms
    if (this.sampler) {
      const { events } = this.sampler();
      for (const ev of events) this.addBloom(ev);
    }
    this.energy *= 0.94; // decay the global breath
    const now = performance.now();
    this.blooms = this.blooms.filter((b) => now - b.born < b.life);
    if (this.gl && this.prog) this.drawGL(now);
    else if (this.ctx2d) this.draw2D(now);
  }

  private drawGL(now: number): void {
    const gl = this.gl!;
    const t = (now - this.start) / 1000;
    gl.useProgram(this.prog);
    gl.uniform2f(this.uni.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uni.u_time, t);
    gl.uniform1f(this.uni.u_hueA, this.vis.hueA);
    gl.uniform1f(this.uni.u_hueB, this.vis.hueB);
    gl.uniform1f(this.uni.u_drift, this.vis.drift);
    gl.uniform1f(this.uni.u_haze, this.vis.haze);
    gl.uniform1f(this.uni.u_warmth, this.vis.warmth);
    gl.uniform1f(this.uni.u_night, this.vis.night);
    gl.uniform1f(this.uni.u_energy, this.energy);
    const n = Math.min(this.blooms.length, MAX_BLOOMS);
    gl.uniform1i(this.uni.u_nblooms, n);
    const data = new Float32Array(MAX_BLOOMS * 4);
    const hues = new Float32Array(MAX_BLOOMS);
    for (let i = 0; i < n; i++) {
      const b = this.blooms[i];
      const age = Math.max(0, Math.min(1, (now - b.born) / b.life));
      data[i * 4 + 0] = b.x;
      data[i * 4 + 1] = 1 - b.y; // flip: GL y up
      data[i * 4 + 2] = age;
      data[i * 4 + 3] = (b.source === 1 ? 0.5 : 0.0) + b.size * 0.5;
      hues[i] = b.hue;
    }
    gl.uniform4fv(this.uni.u_blooms, data);
    gl.uniform1fv(this.uni.u_bloomHue, hues);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Canvas2D fallback — still a living, drifting, blooming sky.
  private draw2D(now: number): void {
    const ctx = this.ctx2d!;
    const t = (now - this.start) / 1000;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.save();
    ctx.scale(1, 1);
    // base gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    const night = this.vis.night > 0.5;
    grad.addColorStop(0, hsl(this.vis.hueA, 0.45, night ? 0.05 : 0.12));
    grad.addColorStop(1, hsl(this.vis.hueB, 0.45, night ? 0.08 : 0.2));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // drifting aurora bands
    ctx.globalCompositeOperation = "lighter";
    for (let b = 0; b < 3; b++) {
      const yC = (0.4 + b * 0.16) * H + Math.sin(t * 0.2 + b) * 0.04 * H;
      const grd = ctx.createLinearGradient(0, yC - H * 0.14, 0, yC + H * 0.14);
      const hue = this.vis.hueA + (this.vis.hueB - this.vis.hueA) * (0.4 + 0.3 * Math.sin(t * 0.1 + b));
      const a = (0.18 - b * 0.04) * (0.8 + this.energy * 0.6) * (1 - this.vis.haze * 0.3);
      grd.addColorStop(0, hsla(hue, 0.7, 0.55, 0));
      grd.addColorStop(0.5, hsla(hue, 0.7, 0.6, a));
      grd.addColorStop(1, hsla(hue, 0.7, 0.55, 0));
      ctx.fillStyle = grd;
      const wob = Math.sin(t * this.vis.drift * 6 + b) * 0.03 * H;
      ctx.fillRect(0, yC - H * 0.14 + wob, W, H * 0.28);
    }
    // blooms
    for (const bl of this.blooms) {
      const age = Math.max(0, Math.min(1, (now - bl.born) / bl.life));
      const r = (bl.size * (0.06 + age * 0.18)) * Math.min(W, H);
      const x = bl.x * W, y = bl.y * H;
      const fade = (1 - age) * (bl.source === 1 ? 1.0 : 0.7);
      const g2 = ctx.createRadialGradient(x, y, 0, x, y, r);
      g2.addColorStop(0, hsla(bl.hue, 0.85, 0.65, 0.8 * fade));
      g2.addColorStop(1, hsla(bl.hue, 0.85, 0.6, 0));
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
  }
}

// hsl helpers for the Canvas2D fallback (h in 0..1)
function hsl(h: number, s: number, l: number): string {
  return `hsl(${(((h % 1) + 1) % 1) * 360} ${s * 100}% ${l * 100}%)`;
}
function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${(((h % 1) + 1) % 1) * 360} ${s * 100}% ${l * 100}% / ${a})`;
}
