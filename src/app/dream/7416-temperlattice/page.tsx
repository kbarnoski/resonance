"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { FRAG_SRC, PRESENT_SRC, VERT_SRC } from "./shaders";
import { LatticeState, MAX_SITES } from "./lattice";
import { TemperAudio } from "./audio";
import {
  BASE_HZ,
  PRESETS,
  clonePreset,
  computeScale,
  computeSpectrum,
  mulberry32,
  nearestRatio,
  scaleDegrees,
  type Degree,
  type Preset,
} from "./dissonance";

/** Keyboard keys mapped to derived scale degrees, unison first, ascending. */
const KEYS = [
  "a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k",
] as const;

/* --------------------------------- GL rig ---------------------------------- */

interface SceneU {
  res: WebGLUniformLocation | null;
  time: WebGLUniformLocation | null;
  count: WebGLUniformLocation | null;
  morph: WebGLUniformLocation | null;
  reduce: WebGLUniformLocation | null;
  bondA: WebGLUniformLocation | null;
  bondB: WebGLUniformLocation | null;
  bondAmt: WebGLUniformLocation | null;
  sites: WebGLUniformLocation | null;
  prev: WebGLUniformLocation | null;
}

interface GLRig {
  gl: WebGL2RenderingContext;
  sceneProg: WebGLProgram;
  presentProg: WebGLProgram;
  sceneU: SceneU;
  presentU: { tex: WebGLUniformLocation | null; res: WebGLUniformLocation | null };
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  sitesTex: WebGLTexture;
  textures: [WebGLTexture, WebGLTexture];
  fbos: [WebGLFramebuffer, WebGLFramebuffer];
  fboW: number;
  fboH: number;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error("shader compile error:", gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function linkProgram(
  gl: WebGL2RenderingContext,
  vsSrc: string,
  fsSrc: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error("program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

function makeColorTexture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): WebGLTexture | null {
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function makeGLRig(canvas: HTMLCanvasElement): GLRig | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    powerPreference: "low-power",
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const sceneProg = linkProgram(gl, VERT_SRC, FRAG_SRC);
  const presentProg = linkProgram(gl, VERT_SRC, PRESENT_SRC);
  if (!sceneProg || !presentProg) return null;

  const vao = gl.createVertexArray();
  const buf = gl.createBuffer();
  if (!vao || !buf) return null;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const sceneLoc = gl.getAttribLocation(sceneProg, "a_pos");
  gl.enableVertexAttribArray(sceneLoc);
  gl.vertexAttribPointer(sceneLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Float data texture holding the live site array — SAMPLED only (core WebGL2).
  const sitesTex = gl.createTexture();
  if (!sitesTex) return null;
  gl.bindTexture(gl.TEXTURE_2D, sitesTex);
  gl.texImage2D(
    gl.TEXTURE_2D, 0, gl.RGBA32F, MAX_SITES, 1, 0, gl.RGBA, gl.FLOAT,
    new Float32Array(MAX_SITES * 4),
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fboW = Math.max(2, gl.drawingBufferWidth);
  const fboH = Math.max(2, gl.drawingBufferHeight);
  const texA = makeColorTexture(gl, fboW, fboH);
  const texB = makeColorTexture(gl, fboW, fboH);
  const fboA = gl.createFramebuffer();
  const fboB = gl.createFramebuffer();
  if (!texA || !texB || !fboA || !fboB) return null;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const sceneU: SceneU = {
    res: gl.getUniformLocation(sceneProg, "u_res"),
    time: gl.getUniformLocation(sceneProg, "u_time"),
    count: gl.getUniformLocation(sceneProg, "u_count"),
    morph: gl.getUniformLocation(sceneProg, "u_morph"),
    reduce: gl.getUniformLocation(sceneProg, "u_reduce"),
    bondA: gl.getUniformLocation(sceneProg, "u_bondA"),
    bondB: gl.getUniformLocation(sceneProg, "u_bondB"),
    bondAmt: gl.getUniformLocation(sceneProg, "u_bondAmt"),
    sites: gl.getUniformLocation(sceneProg, "u_sites"),
    prev: gl.getUniformLocation(sceneProg, "u_prev"),
  };
  const presentU = {
    tex: gl.getUniformLocation(presentProg, "u_tex"),
    res: gl.getUniformLocation(presentProg, "u_res"),
  };

  return {
    gl, sceneProg, presentProg, sceneU, presentU, vao, buf, sitesTex,
    textures: [texA, texB], fbos: [fboA, fboB], fboW, fboH,
  };
}

/* ------------------------------ timbre state ------------------------------- */

interface Readout {
  presetLabel: string;
  degreeCount: number;
  interval: string;
}

const rolloffFrom = (brightness: number) => 0.4 + 0.6 * brightness;

function computeAmps(baseAmps: number[], brightness: number): number[] {
  const r = rolloffFrom(brightness);
  return baseAmps.map((a, n) => a * Math.pow(r, n));
}

/** Fold an interval ratio into [1, 2). */
function foldRatio(r: number): number {
  let x = r;
  while (x < 1) x *= 2;
  while (x >= 2) x /= 2;
  return x;
}

/* --------------------------------- page ------------------------------------ */

export default function TemperlatticePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rigRef = useRef<GLRig | null>(null);
  const audioRef = useRef<TemperAudio | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const reduceRef = useRef<number>(0);

  // timbre source of truth (refs so the loop reads without re-subscribing)
  const baseAmpsRef = useRef<number[]>([...PRESETS[0].params.amps]);
  const stretchRef = useRef<number>(PRESETS[0].params.stretch);
  const inharmRef = useRef<number>(PRESETS[0].params.inharm);
  const brightRef = useRef<number>(1);

  // derived + visual
  const degreesRef = useRef<Degree[]>([]);
  const latticeRef = useRef<LatticeState>(new LatticeState());
  const siteBufRef = useRef<Float32Array>(new Float32Array(MAX_SITES * 4));
  const actRef = useRef<Float32Array>(new Float32Array(MAX_SITES));
  const morphRef = useRef<number>(0);
  const dirtyRef = useRef<boolean>(true);
  const prevStretchRef = useRef<number>(stretchRef.current);

  // played notes
  const heldRef = useRef<Map<string, { id: number; deg: number; order: number }>>(
    new Map(),
  );
  const orderRef = useRef<number>(0);
  const bondRef = useRef<{ a: number; b: number; amt: number }>({ a: -1, b: -1, amt: 0 });
  const pingRef = useRef<number>(0);

  // auto-demo
  const playingRef = useRef<boolean>(true);
  const demoPhaseRef = useRef<[number, number, number]>([0, 0, 0]);
  const demoSeqRef = useRef<number[]>([]);
  const demoNextRef = useRef<number>(0);
  const demoPtrRef = useRef<number>(0);

  const [status, setStatus] = useState<"ok" | "no-webgl">("ok");
  const [audioOn, setAudioOn] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [stretch, setStretch] = useState(PRESETS[0].params.stretch);
  const [inharm, setInharm] = useState(PRESETS[0].params.inharm);
  const [bright, setBright] = useState(1);
  const [readout, setReadout] = useState<Readout>({
    presetLabel: PRESETS[0].label,
    degreeCount: 0,
    interval: "—",
  });
  const [showNotes, setShowNotes] = useState(false);

  // ── derive the scale from the current timbre and re-lay-out the lattice ──
  const rederive = useCallback(() => {
    const amps = computeAmps(baseAmpsRef.current, brightRef.current);
    const spec = computeSpectrum({
      amps,
      stretch: stretchRef.current,
      inharm: inharmRef.current,
    });
    const scale = computeScale(spec);
    const degs = scaleDegrees(scale);
    degreesRef.current = degs;
    latticeRef.current.setTargets(degs);
    audioRef.current?.setSpectrum(spec);
    return degs;
  }, []);

  const rederiveRef = useRef(rederive);
  rederiveRef.current = rederive;

  // ── the render loop ──────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const rig = rigRef.current;
    if (!rig) return;
    const { gl } = rig;
    const now = performance.now();
    const time = (now - startRef.current) / 1000;
    frameRef.current += 1;
    const mo = reduceRef.current > 0.5 ? 0.5 : 1;

    // auto-demo: slowly morph the timbre so the crystal keeps re-crystallising
    if (playingRef.current) {
      const [p0, p1, p2] = demoPhaseRef.current;
      stretchRef.current = 2.02 + 0.14 * Math.sin(time * 0.11 * mo + p0);
      inharmRef.current = Math.max(0, 0.022 + 0.022 * Math.sin(time * 0.07 * mo + p1));
      brightRef.current = 0.62 + 0.22 * Math.sin(time * 0.09 * mo + p2);
      dirtyRef.current = true;
    }

    // re-derive on change (throttled) — cheap enough at ~12 Hz
    if (dirtyRef.current && frameRef.current % 5 === 0) {
      dirtyRef.current = false;
      const degs = rederiveRef.current();
      const ds = Math.abs(stretchRef.current - prevStretchRef.current);
      prevStretchRef.current = stretchRef.current;
      morphRef.current = Math.min(1, morphRef.current * 0.6 + ds * 40);
      setReadout((r) =>
        r.degreeCount === degs.length ? r : { ...r, degreeCount: degs.length },
      );
    }
    morphRef.current *= 0.94;

    // auto-demo phrase — lights sites (and plucks if audio is live)
    const degs = degreesRef.current;
    if (playingRef.current && degs.length > 0 && time >= demoNextRef.current) {
      demoNextRef.current = time + 0.5;
      const seq = demoSeqRef.current;
      const di = seq[demoPtrRef.current % seq.length] % degs.length;
      demoPtrRef.current += 1;
      actRef.current[di] = 1;
      const a = audioRef.current;
      if (a && a.running) a.pluck(BASE_HZ * degs[di].ratio, 0.6);
    }

    // activation: decay, then force held sites lit
    const act = actRef.current;
    for (let i = 0; i < MAX_SITES; i++) act[i] *= 0.92;
    const held = heldRef.current;
    for (const h of held.values()) if (h.deg < MAX_SITES) act[h.deg] = 1;

    // reconcile held voices that were pressed before audio finished resuming
    const au = audioRef.current;
    if (au && au.running) {
      for (const h of held.values()) {
        if (h.id < 0 && h.deg < degs.length) {
          h.id = au.noteOn(BASE_HZ * degs[h.deg].ratio, 0.9);
        }
      }
    }

    // ── adaptive JI: exactly two held → glide newer voice to a live valley ──
    const bond = bondRef.current;
    if (held.size === 2 && degs.length > 1) {
      const arr = [...held.values()].sort((x, y) => x.order - y.order);
      const older = arr[0];
      const newer = arr[1];
      const f0 = BASE_HZ * (degs[older.deg]?.ratio ?? 1);
      const f1 = BASE_HZ * (degs[newer.deg]?.ratio ?? 1);
      if (f0 > 0 && f1 > 0) {
        const folded = foldRatio(f1 / f0);
        const centsHeld = 1200 * Math.log2(folded);
        // nearest derived valley (skip the unison degree at index 0)
        let best = degs[1] ?? degs[0];
        let bd = Infinity;
        for (let i = 1; i < degs.length; i++) {
          const dd = Math.abs(degs[i].cents - centsHeld);
          if (dd < bd) { bd = dd; best = degs[i]; }
        }
        // choose the octave placement of the target nearest the original note
        let target = f0 * best.ratio;
        for (const k of [0.5, 2]) {
          if (Math.abs(target * k - f1) < Math.abs(target - f1)) target *= k;
        }
        audioRef.current?.glide(newer.id, target, 0.08);
        bond.a = older.deg;
        bond.b = newer.deg;
        bond.amt = Math.min(1, bond.amt + 0.05);
        setReadout((r) =>
          r.interval === `${best.nearest} · ${best.cents.toFixed(0)}¢`
            ? r
            : { ...r, interval: `${best.nearest} · ${best.cents.toFixed(0)}¢` },
        );
      }
    } else {
      bond.amt *= 0.9;
      if (bond.amt < 0.02) { bond.a = -1; bond.b = -1; bond.amt = 0; }
    }

    // step the lattice + upload the site data texture
    latticeRef.current.step(mo > 0.5 ? 0.06 : 0.035, act, siteBufRef.current);
    gl.bindTexture(gl.TEXTURE_2D, rig.sitesTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAX_SITES, 1, gl.RGBA, gl.FLOAT, siteBufRef.current);

    const src = pingRef.current;
    const dst = 1 - src;

    // pass 1: scene → dst FBO, sampling prev (src) + the site data texture
    gl.bindFramebuffer(gl.FRAMEBUFFER, rig.fbos[dst]);
    gl.viewport(0, 0, rig.fboW, rig.fboH);
    gl.useProgram(rig.sceneProg);
    gl.bindVertexArray(rig.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rig.textures[src]);
    gl.uniform1i(rig.sceneU.prev, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, rig.sitesTex);
    gl.uniform1i(rig.sceneU.sites, 1);
    gl.uniform2f(rig.sceneU.res, rig.fboW, rig.fboH);
    gl.uniform1f(rig.sceneU.time, time);
    gl.uniform1i(rig.sceneU.count, latticeRef.current.count);
    gl.uniform1f(rig.sceneU.morph, morphRef.current);
    gl.uniform1f(rig.sceneU.reduce, reduceRef.current);
    gl.uniform1i(rig.sceneU.bondA, bond.a);
    gl.uniform1i(rig.sceneU.bondB, bond.b);
    gl.uniform1f(rig.sceneU.bondAmt, bond.amt);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // pass 2: present dst → screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.useProgram(rig.presentProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, rig.textures[dst]);
    gl.uniform1i(rig.presentU.tex, 0);
    gl.uniform2f(rig.presentU.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    pingRef.current = dst;
    rafRef.current = requestAnimationFrame(renderFrame);
  }, []);

  // ── mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceRef.current = mq.matches ? 1 : 0;
    const onMq = () => (reduceRef.current = mq.matches ? 1 : 0);
    mq.addEventListener?.("change", onMq);

    // seed the deterministic demo (phases + phrase) from 0x7416
    const rng = mulberry32(0x7416);
    demoPhaseRef.current = [
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
      rng() * Math.PI * 2,
    ];
    demoSeqRef.current = Array.from({ length: 16 }, () => 1 + Math.floor(rng() * 6));

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      canvas.width = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      canvas.height = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    };
    resize();

    const rig = makeGLRig(canvas);
    if (!rig) {
      setStatus("no-webgl");
      mq.removeEventListener?.("change", onMq);
      return;
    }
    rigRef.current = rig;
    startRef.current = performance.now();

    // first derivation so the lattice + readout are populated on paint
    const degs = rederiveRef.current();
    setReadout((r) => ({ ...r, degreeCount: degs.length }));

    const onResize = () => {
      resize();
      const g = rig.gl;
      const w = Math.max(2, g.drawingBufferWidth);
      const h = Math.max(2, g.drawingBufferHeight);
      if (w === rig.fboW && h === rig.fboH) return;
      rig.fboW = w;
      rig.fboH = h;
      for (let i = 0; i < 2; i++) {
        g.bindTexture(g.TEXTURE_2D, rig.textures[i]);
        g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null);
      }
      g.bindTexture(g.TEXTURE_2D, null);
    };
    window.addEventListener("resize", onResize);

    rafRef.current = requestAnimationFrame(renderFrame);

    return () => {
      window.removeEventListener("resize", onResize);
      mq.removeEventListener?.("change", onMq);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.dispose();
      audioRef.current = null;
      const g = rig.gl;
      g.deleteProgram(rig.sceneProg);
      g.deleteProgram(rig.presentProg);
      g.deleteVertexArray(rig.vao);
      g.deleteBuffer(rig.buf);
      g.deleteTexture(rig.sitesTex);
      g.deleteTexture(rig.textures[0]);
      g.deleteTexture(rig.textures[1]);
      g.deleteFramebuffer(rig.fbos[0]);
      g.deleteFramebuffer(rig.fbos[1]);
      rigRef.current = null;
    };
  }, [renderFrame]);

  // ── audio start (needs a user gesture) ──────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) {
      const amps = computeAmps(baseAmpsRef.current, brightRef.current);
      audioRef.current = new TemperAudio(
        computeSpectrum({ amps, stretch: stretchRef.current, inharm: inharmRef.current }),
      );
    }
    await audioRef.current.start();
    setAudioOn(true);
  }, []);

  // pause the auto-demo whenever the player takes over the timbre or keys
  const pauseDemo = useCallback(() => {
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
    }
  }, []);

  // ── keyboard as an instrument (true held notes) ─────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const idx = KEYS.indexOf(k as (typeof KEYS)[number]);
      if (idx < 0) return;
      const degs = degreesRef.current;
      if (idx >= degs.length) return;
      if (heldRef.current.has(k)) return;
      e.preventDefault();
      pauseDemo();
      void ensureAudio();
      const a = audioRef.current;
      const id = a && a.running ? a.noteOn(BASE_HZ * degs[idx].ratio, 0.9) : -1;
      heldRef.current.set(k, { id, deg: idx, order: orderRef.current++ });
      actRef.current[idx] = 1;
      // one held note updates the last-interval readout to that degree
      if (heldRef.current.size === 1) {
        const d = degs[idx];
        const nr = nearestRatio(d.cents);
        setReadout((r) => ({ ...r, interval: `${nr.label} · ${d.cents.toFixed(0)}¢` }));
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const h = heldRef.current.get(k);
      if (!h) return;
      if (h.id >= 0) audioRef.current?.noteOff(h.id);
      heldRef.current.delete(k);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [ensureAudio, pauseDemo]);

  // ── timbre controls ──────────────────────────────────────────────────────
  const applyPreset = useCallback(
    (p: Preset) => {
      pauseDemo();
      const params = clonePreset(p);
      baseAmpsRef.current = params.amps;
      stretchRef.current = params.stretch;
      inharmRef.current = params.inharm;
      brightRef.current = 1;
      dirtyRef.current = true;
      setPresetId(p.id);
      setStretch(params.stretch);
      setInharm(params.inharm);
      setBright(1);
      setReadout((r) => ({ ...r, presetLabel: p.label }));
    },
    [pauseDemo],
  );

  const onStretch = useCallback(
    (v: number) => {
      pauseDemo();
      stretchRef.current = v;
      dirtyRef.current = true;
      setStretch(v);
    },
    [pauseDemo],
  );
  const onInharm = useCallback(
    (v: number) => {
      pauseDemo();
      inharmRef.current = v;
      dirtyRef.current = true;
      setInharm(v);
    },
    [pauseDemo],
  );
  const onBright = useCallback(
    (v: number) => {
      pauseDemo();
      brightRef.current = v;
      dirtyRef.current = true;
      setBright(v);
    },
    [pauseDemo],
  );

  const toggleDemo = useCallback(() => {
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
    if (next) void ensureAudio();
  }, [ensureAudio]);

  // reflect live demo values into the slider thumbs (light, throttled poll)
  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      setStretch(stretchRef.current);
      setInharm(inharmRef.current);
      setBright(brightRef.current);
    };
    const timer = window.setInterval(tick, 140);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [playing]);

  const labelCls =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        onClick={() => void ensureAudio()}
        className="absolute inset-0 h-full w-full"
        style={{ display: "block" }}
        aria-label="Living crystal lattice of the derived tuning"
      />

      {status === "no-webgl" && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <p className="max-w-md text-center text-base text-destructive">
            This piece needs WebGL2, which is unavailable in this browser. The
            crystal lattice cannot render here.
          </p>
        </div>
      )}

      {/* header + controls overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
        <div className="pointer-events-auto max-w-xl">
          <p className={labelCls}>Dream lab · 7416-temperlattice · cycle 3</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Temperlattice
          </h1>
          <p className="mt-2 max-w-md text-base text-muted-foreground">
            Watch your tuning re-crystallize as you reshape your instrument&apos;s
            timbre. The scale is not assumed — every degree is a valley of the
            live dissonance curve, and the crystal&apos;s sites migrate as you
            morph the spectrum.
          </p>
          {!audioOn && (
            <p className="mt-2 text-sm text-muted-foreground">
              Click anywhere, press a key, or hit Play to start audio — the
              lattice already drifts silently.
            </p>
          )}
        </div>

        <div className="pointer-events-auto w-full max-w-2xl space-y-4">
          {/* live readout */}
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className={labelCls}>
              preset · <span className="text-foreground">{readout.presetLabel}</span>
            </span>
            <span className={labelCls}>
              degrees · <span className="text-foreground">{readout.degreeCount}</span>
            </span>
            <span className={labelCls}>
              interval · <span className="text-foreground">{readout.interval}</span>
            </span>
          </div>

          {/* presets */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleDemo}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {playing ? "Pause" : "Play"}
            </button>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p)}
                className={`min-h-[44px] rounded-md border border-border px-4 text-sm transition-colors hover:bg-accent hover:text-foreground ${
                  presetId === p.id && !playing
                    ? "bg-accent text-foreground"
                    : "bg-background/60 text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* sliders */}
          <div className="grid gap-3 rounded-md border border-border bg-background/60 p-4 backdrop-blur-sm sm:grid-cols-3">
            <Slider
              id="inharm"
              label="inharmonicity B"
              min={0}
              max={0.06}
              step={0.001}
              value={inharm}
              display={inharm.toFixed(3)}
              onChange={onInharm}
            />
            <Slider
              id="stretch"
              label="octave stretch A"
              min={1.85}
              max={2.25}
              step={0.001}
              value={stretch}
              display={stretch.toFixed(3)}
              onChange={onStretch}
            />
            <Slider
              id="bright"
              label="brightness"
              min={0}
              max={1}
              step={0.001}
              value={bright}
              display={bright.toFixed(2)}
              onChange={onBright}
            />
          </div>

          <p className="text-sm text-muted-foreground">
            Play the crystal on{" "}
            <span className="font-mono text-foreground">a w s e d f t g y h u j k</span>{" "}
            (unison first, ascending). Hold exactly two keys to watch the
            adaptive-JI strut snap the newer voice into the live valley.
          </p>
        </div>
      </div>

      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-4 top-4 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question:{" "}
                <em>
                  can you SEE a tuning re-form as you reshape the timbre it comes
                  from?
                </em>
              </p>
              <p>
                The scale is derived, never assumed. A second copy of the live
                spectrum is swept across the octave; at each interval the pairwise
                Plomp–Levelt / Sethares sensory dissonance is summed. The local
                minima of that curve ARE the consonant steps for this timbre. Each
                valley becomes a lattice site — pitch-class angle around a spiral,
                brightness = valley depth.
              </p>
              <p>
                Morph the spectrum (inharmonicity, octave stretch, brightness) and
                the whole curve re-flows, so each degree&apos;s valley moves. The
                sites ease toward their new homes and the ping-pong feedback pass
                paints the comet-tail: you watch the crystal re-crystallize.
              </p>
              <p>
                The cycle-3 verb is <strong className="text-foreground">adaptive
                JI</strong>: hold exactly two keys and the newer voice glides
                toward the live curve&apos;s nearest valley to that interval, drawn
                as a bright strut snapping into place.
              </p>
              <p>
                Cycle 3 of the living-tuning line: 6728-commawalk (c1) →
                6808-spectrascale (c2) → 7416-temperlattice. Refs: Sethares,{" "}
                <em>Tuning Timbre Spectrum Scale</em>; Plomp &amp; Levelt (1965);
                Guillet, &ldquo;Elementary spectrum for the dissonance curve,&rdquo;{" "}
                <em>J. Mathematics and Music</em> (2026).
              </p>
              <p>
                No strobe: every luminance change is slow eased drift, and
                reduced-motion slows it further.
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7416-temperlattice"]} />
    </main>
  );
}

/* -------------------------------- slider ----------------------------------- */

function Slider(props: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (v: number) => void;
}) {
  const { id, label, min, max, step, value, display, onChange } = props;
  return (
    <div>
      <div className="flex items-center justify-between">
        <label
          htmlFor={id}
          className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground"
        >
          {label}
        </label>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 w-full accent-primary"
      />
    </div>
  );
}
