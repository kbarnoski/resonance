"use client";

import { useEffect, useRef, useState } from "react";
import { getDeviceTier } from "@/lib/audio/device-tier";

/**
 * Depth-parallax layer (Wave 2c; rebuilt after the 2026-09-25 audits).
 * Each pack still has a precomputed Depth Anything V2 map; a WebGL
 * displacement shader drifts a slow lissajous camera THROUGH the picture
 * — near material slides more than far material.
 *
 * Audit fixes baked in:
 *  - #3/M1: slot swap no longer aliases/deletes live textures (the old
 *    code faded from BLACK on every still after the first)
 *  - #6: displacement was ~100× subpixel — now a real base pan + depth
 *    differential inside an overscan margin, actually visible
 *  - #7: composites in screen blend at the imagery budget (inverse of
 *    shaderOpacity) instead of opaquely covering the shader stack
 *  - #12: GL init keyed to a per-journey canvas (key={journeyId}) so a
 *    lost context is never re-fetched from the same element
 *  - #13/H1: allSettled + delete-on-drop — no texture leaks on 404s or
 *    superseded loads
 *  - M2: ResizeObserver size cache (no per-frame layout reads)
 *  - M3: the rAF loop only runs once textures exist
 *  - M4: manifest fetch is cancel-guarded; covered state survives
 *    between covered journeys (no double-blank)
 *  - L1: renders at up to 1.5× DPR like the shader stack
 *  - H5 note: deliberately NOT a trails source (WebGL readback is blank
 *    without preserveDrawingBuffer)
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
uniform vec2 uScaleA; uniform vec2 uOffA;
uniform vec2 uScaleB; uniform vec2 uOffB;

// 8% overscan gives the camera room to move without CLAMP_TO_EDGE smear.
const float OVERSCAN = 1.08;

vec3 sampleLayer(sampler2D img, sampler2D dep, vec2 scale, vec2 off) {
  vec2 uv0 = (vUv - 0.5) / OVERSCAN + 0.5;
  vec2 uv = uv0 * scale + off;
  // Base camera move + depth differential (near slides more than far).
  float d = texture2D(dep, uv + uCam * 0.5).r;
  vec2 duv = uCam * (0.55 + (d - 0.5) * 0.9);
  return texture2D(img, uv + duv).rgb;
}

void main() {
  vec3 a = sampleLayer(uImgA, uDepthA, uScaleA, uOffA);
  vec3 b = sampleLayer(uImgB, uDepthB, uScaleB, uOffB);
  gl_FragColor = vec4(mix(a, b, uMix), 1.0);
}`;

interface Slot {
  img: WebGLTexture;
  depth: WebGLTexture;
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

// Manifest cached module-level so journey changes between covered journeys
// never blank the layer waiting on a refetch.
let depthManifest: Record<string, boolean> | null | undefined;

export function DepthParallaxLayer({
  journeyId,
  imageryOpacity = 0.4,
  onCoveredChange,
}: {
  journeyId?: string;
  /** The imagery budget — pass 1 - shaderOpacity so this layer shares the
   *  collage's mix contract instead of occluding the shaders (#7). */
  imageryOpacity?: number;
  /** Fires when depth coverage resolves — the compositor uses it to split
   *  the imagery budget between this base and the collage (2026-09-26). */
  onCoveredChange?: (covered: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    if (!journeyId) { setCovered(false); return; }
    let cancelled = false;
    const apply = (m: Record<string, boolean> | null) => {
      if (cancelled) return;
      setCovered(!!m?.[journeyId]);
      onCoveredChange?.(!!m?.[journeyId]);
    };
    if (depthManifest !== undefined) {
      apply(depthManifest);
      return () => { cancelled = true; };
    }
    fetch("/tramokyo-pack/local-depth.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => { depthManifest = m; apply(m); })
      .catch(() => { depthManifest = null; apply(null); });
    return () => { cancelled = true; };
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
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[depth-parallax] shader compile failed:", gl.getShaderInfoLog(sh));
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[depth-parallax] link failed:", gl.getProgramInfoLog(prog));
      return;
    }
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
      mix: U("uMix"), cam: U("uCam"),
      scaleA: U("uScaleA"), offA: U("uOffA"), scaleB: U("uScaleB"), offB: U("uOffB"),
    };

    sizeRef.current = { w: canvas.clientWidth, h: canvas.clientHeight };
    const ro = new ResizeObserver((es) => {
      for (const e of es) sizeRef.current = { w: e.contentRect.width, h: e.contentRect.height };
    });
    ro.observe(canvas);

    let slotA: Slot | null = null;
    let slotB: Slot | null = null;
    let mixStart = 0;
    const MIX_MS = 2600;
    let disposed = false;
    let loadSeq = 0;
    let raf = 0;
    let running = false;
    let last = 0;
    const FPS_MS = 1000 / 30;
    const t0 = performance.now();

    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      if (disposed || now - last < FPS_MS || !slotA || !slotB) return;
      last = now;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.round(sizeRef.current.w * dpr));
      const h = Math.max(1, Math.round(sizeRef.current.h * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      const t = (now - t0) / 1000;
      const camX = Math.sin(t * (Math.PI * 2) / 25) * 0.022;
      const camY = Math.cos(t * (Math.PI * 2) / 34) * 0.016;
      const m = Math.min(1, (now - mixStart) / MIX_MS);

      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, slotA.img); gl.uniform1i(u.imgA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, slotA.depth); gl.uniform1i(u.depA, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, slotB.img); gl.uniform1i(u.imgB, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, slotB.depth); gl.uniform1i(u.depB, 3);
      gl.uniform1f(u.mix, m);
      gl.uniform2f(u.cam, camX, camY);
      const coverFit = (aspect: number): [number, number, number, number] => {
        const ca = w / Math.max(1, h);
        if (aspect > ca) { const sx = ca / aspect; return [sx, 1, (1 - sx) / 2, 0]; }
        const sy = aspect / ca; return [1, sy, 0, (1 - sy) / 2];
      };
      const [sax, say, oax, oay] = coverFit(slotA.aspect);
      gl.uniform2f(u.scaleA, sax, say); gl.uniform2f(u.offA, oax, oay);
      const [sbx, sby, obx, oby] = coverFit(slotB.aspect);
      gl.uniform2f(u.scaleB, sbx, sby); gl.uniform2f(u.offB, obx, oby);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const onStill = (e: Event) => {
      const { src, depthSrc } = (e as CustomEvent).detail ?? {};
      if (!src || !depthSrc) return;
      const seq = ++loadSeq;
      Promise.allSettled([loadTex(gl, src), loadTex(gl, depthSrc)]).then((rs) => {
        const ok = rs.every((r) => r.status === "fulfilled");
        if (!ok || disposed || seq !== loadSeq) {
          for (const r of rs) if (r.status === "fulfilled") gl.deleteTexture(r.value.tex);
          return;
        }
        const [img, dep] = rs.map((r) => (r as PromiseFulfilledResult<{ tex: WebGLTexture; aspect: number }>).value);
        const incoming: Slot = { img: img.tex, depth: dep.tex, aspect: img.aspect };
        if (!slotA || !slotB) {
          // First still seeds BOTH slots — one image is enough to draw.
          slotA = incoming;
          slotB = incoming;
          mixStart = performance.now() - MIX_MS;
        } else {
          const retiring = slotA;
          slotA = slotB;
          slotB = incoming;
          if (retiring !== slotA && retiring !== slotB) {
            gl.deleteTexture(retiring.img);
            gl.deleteTexture(retiring.depth);
          }
          mixStart = performance.now();
        }
        if (!running) { running = true; raf = requestAnimationFrame(render); }
      });
    };
    window.addEventListener("resonance:pack-still", onStill);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resonance:pack-still", onStill);
      const ext = gl.getExtension("WEBGL_lose_context");
      ext?.loseContext();
    };
  }, [covered, journeyId]);

  if (!covered) return null;
  return (
    <canvas
      key={journeyId}
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        zIndex: 2,
        mixBlendMode: "screen",
        opacity: Math.max(0.15, Math.min(0.6, imageryOpacity * 0.55)),
      }}
    />
  );
}
