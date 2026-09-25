"use client";

import { useEffect, useRef, useState } from "react";
import { getDeviceTier } from "@/lib/audio/device-tier";

/**
 * Depth-parallax layer (Wave 2c, 2026-09-25) — the 3D Ken Burns. Each
 * pack still gets a precomputed Depth Anything V2 map; this layer renders
 * the current still through a WebGL displacement shader while a slow
 * lissajous camera drifts THROUGH the picture — nearer material slides
 * more than far material, so a photograph becomes a place.
 *
 * Sits under the 2D collage canvas (same z, earlier in DOM); the collage,
 * clones, video layers and post all composite above. Crossfades between
 * consecutive stills internally (A/B textures). High tier only.
 *
 * Fed by CustomEvent "resonance:pack-still" {src, depthSrc} dispatched by
 * AiImageLayer whenever a pack still is pushed. If the journey has no
 * depth coverage (manifest miss / 404), the layer stays empty — zero cost.
 */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uImgA; uniform sampler2D uDepthA;
uniform sampler2D uImgB; uniform sampler2D uDepthB;
uniform float uMix;
uniform vec2 uCam;
uniform float uStrength;
uniform vec2 uScaleA; uniform vec2 uOffA;
uniform vec2 uScaleB; uniform vec2 uOffB;

vec3 sampleLayer(sampler2D img, sampler2D dep, vec2 scale, vec2 off) {
  vec2 uv = vUv * scale + off;
  float d = texture2D(dep, uv).r;
  vec2 duv = uCam * (d - 0.5) * uStrength;
  return texture2D(img, uv + duv).rgb;
}

void main() {
  vec3 a = sampleLayer(uImgA, uDepthA, uScaleA, uOffA);
  vec3 b = sampleLayer(uImgB, uDepthB, uScaleB, uOffB);
  gl_FragColor = vec4(mix(a, b, uMix), 1.0);
}`;

interface Slot {
  img: WebGLTexture | null;
  depth: WebGLTexture | null;
  aspect: number;
}

function loadTex(gl: WebGLRenderingContext, url: string): Promise<{ tex: WebGLTexture; aspect: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const tex = gl.createTexture();
      if (!tex) return reject(new Error("no tex"));
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      resolve({ tex, aspect: img.naturalWidth / Math.max(1, img.naturalHeight) });
    };
    img.onerror = () => reject(new Error("load failed"));
    img.src = url;
  });
}

export function DepthParallaxLayer({ journeyId }: { journeyId?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [covered, setCovered] = useState(false);

  // Depth coverage manifest — only journeys with full depth harvests run.
  useEffect(() => {
    setCovered(false);
    if (!journeyId) return;
    fetch("/tramokyo-pack/local-depth.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { if (m?.[journeyId]) setCovered(true); })
      .catch(() => { /* no pack — stay dark */ });
  }, [journeyId]);

  useEffect(() => {
    if (!covered || getDeviceTier() !== "high") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: false });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      imgA: U("uImgA"), depA: U("uDepthA"), imgB: U("uImgB"), depB: U("uDepthB"),
      mix: U("uMix"), cam: U("uCam"), strength: U("uStrength"),
      scaleA: U("uScaleA"), offA: U("uOffA"), scaleB: U("uScaleB"), offB: U("uOffB"),
    };

    let slotA: Slot | null = null;
    let slotB: Slot | null = null;
    let mixStart = 0;
    const MIX_MS = 2600;
    let disposed = false;
    let loadSeq = 0;

    const onStill = (e: Event) => {
      const { src, depthSrc } = (e as CustomEvent).detail ?? {};
      if (!src || !depthSrc) return;
      const seq = ++loadSeq;
      Promise.all([loadTex(gl, src), loadTex(gl, depthSrc)])
        .then(([img, dep]) => {
          if (disposed || seq !== loadSeq) return;
          // retire the outgoing A if a fade already finished
          if (slotB) {
            if (slotA) { gl.deleteTexture(slotA.img); gl.deleteTexture(slotA.depth); }
            slotA = slotB;
          }
          slotB = { img: img.tex, depth: dep.tex, aspect: img.aspect };
          if (!slotA) slotA = slotB;
          mixStart = performance.now();
        })
        .catch(() => { /* missing depth — hold current */ });
    };
    window.addEventListener("resonance:pack-still", onStill);

    const coverFit = (aspect: number, cw: number, ch: number): [number, number, number, number] => {
      const ca = cw / Math.max(1, ch);
      if (aspect > ca) {
        const sx = ca / aspect;
        return [sx, 1, (1 - sx) / 2, 0];
      }
      const sy = aspect / ca;
      return [1, sy, 0, (1 - sy) / 2];
    };

    let raf = 0;
    let last = 0;
    const FPS_MS = 1000 / 30;
    const t0 = performance.now();
    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (now - last < FPS_MS || !slotA || !slotB) return;
      last = now;
      const w = Math.max(1, Math.round(canvas.clientWidth));
      const h = Math.max(1, Math.round(canvas.clientHeight));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      const t = (now - t0) / 1000;
      // Slow volumetric drift — lissajous, ~25s and ~34s periods.
      const camX = Math.sin(t * (Math.PI * 2) / 25) * 0.018;
      const camY = Math.cos(t * (Math.PI * 2) / 34) * 0.014;
      const m = Math.min(1, (now - mixStart) / MIX_MS);

      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, slotA.img); gl.uniform1i(u.imgA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, slotA.depth); gl.uniform1i(u.depA, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, slotB.img); gl.uniform1i(u.imgB, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, slotB.depth); gl.uniform1i(u.depB, 3);
      gl.uniform1f(u.mix, m);
      gl.uniform2f(u.cam, camX, camY);
      gl.uniform1f(u.strength, 0.045);
      const [sax, say, oax, oay] = coverFit(slotA.aspect, w, h);
      gl.uniform2f(u.scaleA, sax, say); gl.uniform2f(u.offA, oax, oay);
      const [sbx, sby, obx, oby] = coverFit(slotB.aspect, w, h);
      gl.uniform2f(u.scaleB, sbx, sby); gl.uniform2f(u.offB, obx, oby);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resonance:pack-still", onStill);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    };
  }, [covered, journeyId]);

  if (!covered) return null;
  return (
    <canvas
      ref={canvasRef}
      data-trail-src="1"
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 2 }}
    />
  );
}
