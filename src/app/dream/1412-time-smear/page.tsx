"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// 1412-time-smear — a live-camera slit-scan (chronophotography) instrument.
//
//   THE QUESTION: what if you could *play TIME itself*? Instead of showing the
//   live camera frame, each animation tick samples only a single thin slice of
//   the current frame and scrolls the accumulated slices across a WebGL2 ring
//   buffer — so one screen axis becomes TIME. A person moving in front of the
//   webcam is stretched into a flowing chronophotographic ribbon.
//
//   And it SINGS: the vertical luminance profile of the newest slice is split
//   into 16 bands, each driving one voice of an inharmonic (spectral, stretched,
//   drone-anchored) additive bank — so your motion paints an evolving timbre.
//
//   References: Golan Levin (slit-scan works / The Manual Input Sessions),
//   Zbigniew Rybczyński (Fourth Dimension). See README.md.
//
//   Everything is client-side. AudioContext is gesture-gated, master ≤ 0.20 with
//   a limiter, and full teardown stops oscillators, closes the context, cancels
//   the RAF, and stops every camera MediaStream track on unmount.
// ─────────────────────────────────────────────────────────────────────────────

const HIST_W = 512; // ring-buffer resolution along the TIME axis (horizontal scan)
const HIST_H = 512; // ring-buffer resolution along the TIME axis (vertical scan)
const BANDS = 16;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// ── shared GLSL: the "source" — camera OR a synthetic drifting blob ───────────
const GLSL_SOURCE = /* glsl */ `
uniform sampler2D uVideo;
uniform float uHasVideo;
uniform float uSynthMix;
uniform float uTime;
uniform float uPointerActive;
uniform vec2  uPointer;

float synthBlob(vec2 uv){
  vec2 c = (uPointerActive > 0.5)
    ? uPointer
    : vec2(0.5 + 0.28*sin(uTime*0.83 + 1.7), 0.5 + 0.33*sin(uTime*0.6));
  float d = distance(uv, c);
  float b = exp(-d*d*20.0);
  b += 0.5 * exp(-pow((uv.y - c.y)*5.0, 2.0)); // a soft horizontal band of glow
  return clamp(b, 0.0, 1.0);
}

vec3 sourceColor(vec2 uv){
  vec3 vid = (uHasVideo > 0.5) ? texture(uVideo, vec2(1.0 - uv.x, uv.y)).rgb : vec3(0.0);
  float blob = synthBlob(uv) * uSynthMix;
  vec3 blobCol = blob * vec3(0.95, 0.55, 1.05);
  return max(vid, blobCol);
}
`;

const VERT = /* glsl */ `#version 300 es
// fullscreen triangle, no attributes
void main(){
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const WRITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
${GLSL_SOURCE}
uniform float uOrient;   // 0 = horizontal scan, 1 = vertical scan
uniform float uHistW;
uniform float uHistH;
out vec4 fragColor;
void main(){
  // position ALONG the slit (perpendicular to the time axis)
  float p = (uOrient < 0.5) ? (gl_FragCoord.y / uHistH) : (gl_FragCoord.x / uHistW);
  vec2 uv = (uOrient < 0.5) ? vec2(0.5, p) : vec2(p, 0.5);
  fragColor = vec4(sourceColor(uv), 1.0);
}
`;

const ANALYSIS_FRAG = /* glsl */ `#version 300 es
precision highp float;
${GLSL_SOURCE}
uniform float uBands;
out vec4 fragColor;
void main(){
  float p = (gl_FragCoord.y) / uBands; // band centre along the vertical slit
  float l = 0.0;
  for(int k = -1; k <= 1; k++){
    float pp = clamp(p + float(k)*0.012, 0.0, 1.0);
    vec3 c = sourceColor(vec2(0.5, pp));
    l += dot(c, vec3(0.299, 0.587, 0.114));
  }
  l /= 3.0;
  fragColor = vec4(vec3(l), 1.0);
}
`;

const DISPLAY_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uHist;
uniform vec2  uResolution;
uniform float uHead;     // normalized head position 0..1
uniform float uOrient;
uniform float uFlicker;  // safe luminance multiplier
out vec4 fragColor;

vec3 pal(float t){
  // dark violet -> magenta -> amber -> pale gold (hypnagogic / uncanny)
  return 0.5 + 0.5*cos(6.28318*(vec3(1.0,1.0,1.0)*t + vec3(0.03,0.30,0.62)));
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 s = (uOrient < 0.5)
    ? vec2(fract(uHead - 1.0 + uv.x), uv.y)
    : vec2(uv.x, fract(uHead - 1.0 + uv.y));
  vec3 c = texture(uHist, s).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 col = pal(pow(l, 0.82));
  col = mix(col, c*1.25, 0.22);        // let a little real chroma through
  float vg = smoothstep(1.35, 0.25, length(uv - 0.5));
  col *= (0.5 + 0.5*vg);               // gentle vignette
  col *= uFlicker;
  // a faint leading-edge highlight so "now" is legible
  float edge = (uOrient < 0.5) ? uv.x : uv.y;
  col += vec3(0.10, 0.06, 0.14) * smoothstep(0.985, 1.0, edge);
  col = max(col, vec3(0.03, 0.015, 0.05)); // never pure black
  fragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile failed: " + log);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, fragSrc: string): WebGLProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("link failed: " + gl.getProgramInfoLog(p));
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

type Mode = "camera" | "pointer";

export default function TimeSmearPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // live controls (read inside the RAF via refs)
  const reduced = useRef(false);
  const [scrollSpeed, setScrollSpeed] = useState(1.4);
  const [orient, setOrient] = useState<0 | 1>(0); // 0 horizontal, 1 vertical
  const [flickerOn, setFlickerOn] = useState(false);
  const scrollRef = useRef(scrollSpeed);
  const orientRef = useRef<0 | 1>(orient);
  const flickerRef = useRef(flickerOn);
  scrollRef.current = scrollSpeed;
  orientRef.current = orient;
  flickerRef.current = flickerOn;

  const pointerRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    reduced.current = prefersReducedMotion();
    if (reduced.current) setScrollSpeed((s) => Math.min(s, 0.8));
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    pointerRef.current = {
      x: (e.clientX - r.left) / Math.max(1, r.width),
      y: 1 - (e.clientY - r.top) / Math.max(1, r.height), // flip to GL v-up
    };
  }, []);

  // ── the session: everything lives + dies inside this effect ────────────────
  useEffect(() => {
    if (!mode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setGlError("This browser can't open a WebGL2 context, so the slit-scan can't run.");
      return;
    }

    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    const hasVideo = { v: false };

    // ── GL resources ────────────────────────────────────────────────────────
    let progWrite: WebGLProgram;
    let progAnalysis: WebGLProgram;
    let progDisplay: WebGLProgram;
    try {
      progWrite = program(gl, WRITE_FRAG);
      progAnalysis = program(gl, ANALYSIS_FRAG);
      progDisplay = program(gl, DISPLAY_FRAG);
    } catch (err) {
      setGlError("The WebGL2 shaders failed to compile on this device.");
      console.error(err);
      return;
    }

    const vao = gl.createVertexArray(); // empty VAO for attribute-less draws
    gl.bindVertexArray(vao);

    const mkTex = (w: number, h: number, data: ArrayBufferView | null) => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      return t;
    };

    const HMAX = Math.max(HIST_W, HIST_H);
    const histTex = mkTex(HMAX, HMAX, null);
    const histFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, histFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, histTex, 0);

    const anTex = mkTex(1, BANDS, null);
    const anFBO = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, anFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, anTex, 0);

    const videoTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    const uni = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
    const uW = {
      video: uni(progWrite, "uVideo"), hasVideo: uni(progWrite, "uHasVideo"),
      synthMix: uni(progWrite, "uSynthMix"), time: uni(progWrite, "uTime"),
      pointerActive: uni(progWrite, "uPointerActive"), pointer: uni(progWrite, "uPointer"),
      orient: uni(progWrite, "uOrient"), histW: uni(progWrite, "uHistW"), histH: uni(progWrite, "uHistH"),
    };
    const uA = {
      video: uni(progAnalysis, "uVideo"), hasVideo: uni(progAnalysis, "uHasVideo"),
      synthMix: uni(progAnalysis, "uSynthMix"), time: uni(progAnalysis, "uTime"),
      pointerActive: uni(progAnalysis, "uPointerActive"), pointer: uni(progAnalysis, "uPointer"),
      bands: uni(progAnalysis, "uBands"),
    };
    const uD = {
      hist: uni(progDisplay, "uHist"), resolution: uni(progDisplay, "uResolution"),
      head: uni(progDisplay, "uHead"), orient: uni(progDisplay, "uOrient"),
      flicker: uni(progDisplay, "uFlicker"),
    };

    // clear the history buffer to the dark-violet floor
    gl.bindFramebuffer(gl.FRAMEBUFFER, histFBO);
    gl.viewport(0, 0, HMAX, HMAX);
    gl.clearColor(0.03, 0.015, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // ── AUDIO: inharmonic spectral additive bank + low drone anchor ───────────
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.knee.value = 12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 2.2); // ≤ 0.20
    master.connect(limiter);

    // motion opens this filter so movement brings brightness / teeth
    const voiceBus = ctx.createBiquadFilter();
    voiceBus.type = "lowpass";
    voiceBus.frequency.value = 520;
    voiceBus.Q.value = 0.9;
    voiceBus.connect(master);

    const oscs: OscillatorNode[] = [];
    const bandGains: GainNode[] = [];
    // inharmonic / stretched partial set (NOT a diatonic scale)
    const jitter = [1.0, 1.03, 0.99, 1.05, 1.01, 0.97, 1.04, 1.02, 0.98, 1.06, 1.0, 1.03, 0.99, 1.05, 1.02, 0.985];
    for (let i = 0; i < BANDS; i++) {
      const oct = (i / BANDS) * 3.3; // ~3.3 octaves of spread
      const f = 68 * Math.pow(2, oct) * (1 + 0.028 * i) * jitter[i]; // Railsback-like stretch + detune
      const osc = ctx.createOscillator();
      osc.type = i < 4 ? "sine" : i < 11 ? "triangle" : "sine";
      osc.frequency.value = f;
      osc.detune.value = (i % 2 === 0 ? -3 : 3) + (i - 8);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      osc.connect(g);
      g.connect(voiceBus);
      osc.start();
      oscs.push(osc);
      bandGains.push(g);
    }

    // low drone anchor — a calm bed under the spectral bank
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    droneGain.gain.setTargetAtTime(0.09, ctx.currentTime + 0.3, 0.8);
    droneGain.connect(master);
    for (const f of [34, 68, 68 * 1.498]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = f > 60 ? 4 : 0;
      o.connect(droneGain);
      o.start();
      oscs.push(o);
    }

    // ── camera acquisition (only in camera mode; graceful fallback) ───────────
    if (mode === "camera") {
      navigator.mediaDevices
        ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          stream = s;
          video.srcObject = s;
          return video.play();
        })
        .then(() => {
          if (!cancelled && stream) hasVideo.v = true;
        })
        .catch((err) => {
          if (cancelled) return;
          setCamError(
            "Camera unavailable or permission denied — running the synthetic self-demo instead. Move your pointer over the ribbon to paint into it.",
          );
          console.warn("getUserMedia failed:", err);
        });
    }

    // ── loop state ────────────────────────────────────────────────────────────
    let head = 0; // integer column/row position in the ring
    let advAccum = 0;
    let synthMix = mode === "pointer" ? 1 : 0.6; // start visible immediately
    let idleFrames = 0;
    const prevBands = new Float32Array(BANDS);
    const readBuf = new Uint8Array(BANDS * 4);
    let curOrient: 0 | 1 = orientRef.current;
    const t0 = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const drawTri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

    const frame = () => {
      if (cancelled) return;
      raf = requestAnimationFrame(frame);
      resize();
      const time = (performance.now() - t0) / 1000;
      const o = orientRef.current;
      const size = o === 0 ? HIST_W : HIST_H;

      // orientation flip → wipe history so the axes don't smear together
      if (o !== curOrient) {
        curOrient = o;
        head = 0;
        advAccum = 0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, histFBO);
        gl.viewport(0, 0, HMAX, HMAX);
        gl.clearColor(0.03, 0.015, 0.05, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }

      // upload the freshest camera frame
      if (hasVideo.v && video.readyState >= 2) {
        gl.bindTexture(gl.TEXTURE_2D, videoTex);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        } catch {
          /* frame not ready */
        }
      }

      const pa = mode === "pointer" ? 1 : 0;
      const pt = pointerRef.current;

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTex);

      // ── 1) ANALYSIS: render the current vertical slit into a 1×BANDS FBO ────
      gl.useProgram(progAnalysis);
      gl.bindFramebuffer(gl.FRAMEBUFFER, anFBO);
      gl.viewport(0, 0, 1, BANDS);
      gl.uniform1i(uA.video, 0);
      gl.uniform1f(uA.hasVideo, hasVideo.v ? 1 : 0);
      gl.uniform1f(uA.synthMix, synthMix);
      gl.uniform1f(uA.time, time);
      gl.uniform1f(uA.pointerActive, pa);
      gl.uniform2f(uA.pointer, pt.x, pt.y);
      gl.uniform1f(uA.bands, BANDS);
      drawTri();
      gl.readPixels(0, 0, 1, BANDS, gl.RGBA, gl.UNSIGNED_BYTE, readBuf);

      // luminance per band → drive voices; frame-diff → motion energy
      let motion = 0;
      const now = ctx.currentTime;
      for (let i = 0; i < BANDS; i++) {
        const l = readBuf[i * 4] / 255;
        motion += Math.abs(l - prevBands[i]);
        prevBands[i] = l;
        // brightness in a band swells its partial (perceptual-ish curve)
        const amp = Math.pow(l, 1.6) * 0.085;
        bandGains[i].gain.setTargetAtTime(amp, now, 0.07);
      }
      motion = Math.min(1, motion / (BANDS * 0.25));

      // motion opens the bus filter and brightens the master a touch
      voiceBus.frequency.setTargetAtTime(520 + motion * 4200, now, 0.12);
      voiceBus.Q.setTargetAtTime(0.9 + motion * 3.5, now, 0.15);

      // ── idle self-demo: no motion for a while → summon synthetic drift ──────
      if (mode === "pointer" || !hasVideo.v) {
        synthMix += (1 - synthMix) * 0.06;
      } else {
        if (motion < 0.04) idleFrames++;
        else idleFrames = 0;
        const target = idleFrames > 180 ? 0.8 : 0; // ~3s at 60fps
        synthMix += (target - synthMix) * 0.04;
      }

      // ── 2) WRITE: scroll the ring, stamp the newest slice(s) ────────────────
      let speed = scrollRef.current;
      if (reduced.current) speed = Math.min(speed, 0.8);
      advAccum += speed;
      let steps = Math.floor(advAccum);
      advAccum -= steps;
      steps = Math.min(steps, 6);

      if (steps > 0) {
        gl.useProgram(progWrite);
        gl.bindFramebuffer(gl.FRAMEBUFFER, histFBO);
        gl.uniform1i(uW.video, 0);
        gl.uniform1f(uW.hasVideo, hasVideo.v ? 1 : 0);
        gl.uniform1f(uW.synthMix, synthMix);
        gl.uniform1f(uW.time, time);
        gl.uniform1f(uW.pointerActive, pa);
        gl.uniform2f(uW.pointer, pt.x, pt.y);
        gl.uniform1f(uW.orient, o);
        gl.uniform1f(uW.histW, HIST_W);
        gl.uniform1f(uW.histH, HIST_H);
        for (let k = 0; k < steps; k++) {
          head = (head + 1) % size;
          if (o === 0) gl.viewport(head, 0, 1, HIST_H);
          else gl.viewport(0, head, HIST_W, 1);
          drawTri();
        }
      }

      // ── 3) DISPLAY: unwrap the ring to the screen with color grading ────────
      const flick = flickerRef.current && !reduced.current
        ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(6.28318 * 2.5 * time)) // ≤ 3 Hz soft
        : 1.0;
      gl.useProgram(progDisplay);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, histTex);
      gl.uniform1i(uD.hist, 0);
      gl.uniform2f(uD.resolution, canvas.width, canvas.height);
      gl.uniform1f(uD.head, (head + 0.5) / size);
      gl.uniform1f(uD.orient, o);
      gl.uniform1f(uD.flicker, flick);
      drawTri();
    };
    raf = requestAnimationFrame(frame);

    // ── teardown ──────────────────────────────────────────────────────────────
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      for (const o of oscs) {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
      } catch {
        /* closing */
      }
      ctx.close().catch(() => {});
      if (stream) stream.getTracks().forEach((t) => t.stop());
      try {
        video.pause();
        video.srcObject = null;
      } catch {
        /* noop */
      }
      gl.deleteFramebuffer(histFBO);
      gl.deleteFramebuffer(anFBO);
      gl.deleteTexture(histTex);
      gl.deleteTexture(anTex);
      gl.deleteTexture(videoTex);
      gl.deleteProgram(progWrite);
      gl.deleteProgram(progAnalysis);
      gl.deleteProgram(progDisplay);
      gl.deleteVertexArray(vao);
    };
  }, [mode]);

  const started = mode !== null;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0510] text-white">
      <canvas
        ref={canvasRef}
        onPointerMove={onPointerMove}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: started ? "block" : "none" }}
      />

      {/* faint floor so the page is never a flat black rectangle pre-start */}
      {!started && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 30%, rgba(120,60,150,0.28), rgba(10,5,16,0) 60%), linear-gradient(180deg, #140820, #0a0510)",
          }}
        />
      )}

      {/* ── intro / start panel ── */}
      {!started && (
        <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.32em] text-white/75">
            dream · 1412 · slit-scan chronophotography
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Time Smear
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80">
            Perform in front of your webcam and watch your motion get smeared into a flowing
            chronophotographic ribbon that sings. The screen shows only one thin slice of each
            frame, scrolled sideways — so the horizontal axis becomes <em>time</em>. Move, and
            you are stretched into liquid time. The brightness of your slice drives an inharmonic
            spectral drone.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => {
                setCamError(null);
                setMode("camera");
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-violet-500 px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-violet-400"
            >
              Start camera
            </button>
            <button
              onClick={() => {
                setCamError(null);
                setMode("pointer");
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-white/20 bg-white/[0.04] px-4 py-2.5 text-base font-medium text-white/95 transition-colors hover:bg-white/[0.1]"
            >
              No camera — use pointer
            </button>
          </div>
          <p className="mt-4 text-base text-white/75">
            Sound and motion begin the instant you press a button. Master volume stays gentle
            (≤ 0.20) behind a limiter.
          </p>
        </div>
      )}

      {/* ── live controls ── */}
      {started && (
        <div className="absolute left-3 top-3 z-20 w-[min(92vw,320px)] rounded-xl border border-white/10 bg-black/55 p-3.5 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-white">Time Smear</h2>
            <button
              onClick={() => setMode(null)}
              className="rounded-md border border-white/15 px-2.5 py-1 font-mono text-xs text-white/80 hover:bg-white/10"
            >
              stop
            </button>
          </div>
          <p className="mt-1 text-base leading-snug text-white/75">
            {mode === "camera"
              ? "Move in front of the camera — you become a ribbon of time."
              : "Drag across the ribbon to paint bright time-slices."}
          </p>

          {camError && (
            <p className="mt-2 rounded-md bg-rose-500/10 px-2.5 py-2 text-base leading-snug text-rose-300">
              {camError}
            </p>
          )}
          {glError && (
            <p className="mt-2 rounded-md bg-rose-500/10 px-2.5 py-2 text-base leading-snug text-rose-300">
              {glError}
            </p>
          )}

          <label className="mt-3 block text-base text-white/80">
            <span className="flex justify-between">
              <span>Scroll speed</span>
              <span className="font-mono text-white/60">{scrollSpeed.toFixed(1)}×</span>
            </span>
            <input
              type="range"
              min={0.2}
              max={4}
              step={0.1}
              value={scrollSpeed}
              onChange={(e) => setScrollSpeed(parseFloat(e.target.value))}
              className="mt-1 w-full accent-violet-400"
            />
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setOrient((o) => (o === 0 ? 1 : 0))}
              className="min-h-[44px] flex-1 rounded-lg border border-white/15 bg-white/[0.04] px-4 py-2.5 text-base text-white/95 hover:bg-white/[0.1]"
            >
              Scan: {orient === 0 ? "horizontal ↔" : "vertical ↕"}
            </button>
            <button
              onClick={() => setFlickerOn((f) => !f)}
              className={`min-h-[44px] rounded-lg border px-4 py-2.5 text-base ${
                flickerOn
                  ? "border-amber-300/40 bg-amber-400/15 text-amber-200"
                  : "border-white/15 bg-white/[0.04] text-white/80 hover:bg-white/[0.1]"
              }`}
              title="Opt-in slow luminance drift (≤ 3 Hz). Tap again to stop instantly."
            >
              {flickerOn ? "flicker on" : "flicker"}
            </button>
          </div>
        </div>
      )}

      {/* ── design notes corner link + toggle ── */}
      <button
        onClick={() => setShowNotes((s) => !s)}
        className="absolute bottom-3 right-3 z-20 rounded-full border border-white/12 bg-black/55 px-3 py-1.5 font-mono text-xs text-white/75 backdrop-blur-md hover:bg-white/10 hover:text-white"
      >
        Read the design notes
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm">
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/12 bg-[#120a1c] p-6">
            <h2 className="text-2xl font-semibold text-white">Design notes</h2>
            <p className="mt-3 text-base leading-relaxed text-white/80">
              This is a <strong>slit-scan</strong> instrument (a.k.a. chronophotography /
              time-smear). Each tick it samples a single thin slice of the live camera and scrolls
              the accumulated slices across a WebGL2 ring buffer, so one screen axis becomes{" "}
              <em>time</em>. A moving body is stretched into an eerie liquid ribbon.
            </p>
            <p className="mt-3 text-base leading-relaxed text-white/80">
              <strong>It sings:</strong> the vertical luminance profile of the newest slice is split
              into 16 bands; each drives one voice of a stretched, inharmonic, drone-anchored
              additive bank. Frame-to-frame motion opens a filter for brightness.
            </p>
            <p className="mt-3 text-base leading-relaxed text-white/75">
              Lineage: <strong>Golan Levin</strong> (slit-scan works / <em>The Manual Input
              Sessions</em>) and <strong>Zbigniew Rybczyński</strong> (<em>Fourth Dimension</em>).
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Link
                href="/dream/1412-time-smear/README.md"
                className="text-base text-violet-300 underline underline-offset-4 hover:text-violet-200"
              >
                Full README
              </Link>
              <button
                onClick={() => setShowNotes(false)}
                className="ml-auto min-h-[44px] rounded-lg border border-white/15 px-4 py-2.5 text-base text-white/90 hover:bg-white/10"
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
