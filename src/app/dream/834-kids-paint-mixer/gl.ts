// gl.ts — Raw WebGL2 paint-blob renderer with subtractive pigment mixing
//
// The canvas holds 3 big paint blobs (red/magenta, yellow, blue/cyan).
// Where blobs overlap, Kubelka-Munk mixing is computed per-pixel in a GLSL
// fragment shader. The shader converts each pigment's reflectance to K/S,
// mixes by weight, converts back to reflectance, then to sRGB.
//
// Render pipeline:
//   1. BlobPass: full-screen quad; reads blob positions/radii, computes
//      pigment weights from metaball SDF, mixes per-pixel in K/S space,
//      outputs mixed sRGB colour to a texture.
//   2. readPixels from that texture for audio mapping (~20 Hz throttle).
//
// All coordinates are in [0,1] (x right, y down), transformed to clip space.

// ── Vertex shader (shared by both passes) ────────────────────────────────────
const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// ── Fragment shader: Kubelka-Munk pigment mixing ─────────────────────────────
// We embed the same 36-sample K-M spectral reflectance curves as in pigment.ts,
// mix per-pixel, convert to XYZ then sRGB.
const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 o_color;

// Blob positions and radii (normalised [0,1])
uniform vec2  u_pos[3];     // [red, yellow, blue]
uniform float u_radius[3];
uniform float u_time;
uniform vec2  u_resolution;

// ── Kubelka-Munk spectral data (36 samples, 380-730 nm) ─────────────────────
// Red pigment (magenta-red / cadmium-like)
float KS_RED(int i) {
  float r[36];
  r[0]=0.40; r[1]=0.38; r[2]=0.35; r[3]=0.30; r[4]=0.25; r[5]=0.20;
  r[6]=0.15; r[7]=0.12; r[8]=0.10; r[9]=0.08; r[10]=0.07;r[11]=0.06;
  r[12]=0.06;r[13]=0.06;r[14]=0.07;r[15]=0.08;r[16]=0.10;r[17]=0.12;
  r[18]=0.14;r[19]=0.16;r[20]=0.18;r[21]=0.22;r[22]=0.32;r[23]=0.50;
  r[24]=0.72;r[25]=0.88;r[26]=0.95;r[27]=0.97;r[28]=0.97;r[29]=0.96;
  r[30]=0.96;r[31]=0.95;r[32]=0.95;r[33]=0.94;r[34]=0.94;r[35]=0.93;
  float rc = clamp(r[i], 0.001, 0.999);
  return (1.0 - rc)*(1.0 - rc)/(2.0*rc);
}
// Yellow pigment (process yellow)
float KS_YELLOW(int i) {
  float r[36];
  r[0]=0.05; r[1]=0.05; r[2]=0.06; r[3]=0.06; r[4]=0.07; r[5]=0.08;
  r[6]=0.10; r[7]=0.13; r[8]=0.17; r[9]=0.22; r[10]=0.30;r[11]=0.42;
  r[12]=0.60;r[13]=0.78;r[14]=0.90;r[15]=0.95;r[16]=0.96;r[17]=0.97;
  r[18]=0.97;r[19]=0.96;r[20]=0.95;r[21]=0.94;r[22]=0.93;r[23]=0.92;
  r[24]=0.91;r[25]=0.90;r[26]=0.89;r[27]=0.89;r[28]=0.89;r[29]=0.88;
  r[30]=0.88;r[31]=0.88;r[32]=0.88;r[33]=0.87;r[34]=0.87;r[35]=0.87;
  float rc = clamp(r[i], 0.001, 0.999);
  return (1.0 - rc)*(1.0 - rc)/(2.0*rc);
}
// Blue/cyan pigment (phthalocyanine blue)
float KS_BLUE(int i) {
  float r[36];
  r[0]=0.90; r[1]=0.91; r[2]=0.91; r[3]=0.90; r[4]=0.88; r[5]=0.82;
  r[6]=0.72; r[7]=0.60; r[8]=0.48; r[9]=0.36; r[10]=0.25;r[11]=0.16;
  r[12]=0.09;r[13]=0.05;r[14]=0.04;r[15]=0.04;r[16]=0.05;r[17]=0.07;
  r[18]=0.09;r[19]=0.11;r[20]=0.12;r[21]=0.11;r[22]=0.10;r[23]=0.08;
  r[24]=0.06;r[25]=0.05;r[26]=0.04;r[27]=0.04;r[28]=0.04;r[29]=0.04;
  r[30]=0.04;r[31]=0.04;r[32]=0.04;r[33]=0.04;r[34]=0.04;r[35]=0.04;
  float rc = clamp(r[i], 0.001, 0.999);
  return (1.0 - rc)*(1.0 - rc)/(2.0*rc);
}
// White
float KS_WHITE(int i) { float rc = 0.97; return (1.0-rc)*(1.0-rc)/(2.0*rc); }

// CIE 1931 XYZ colour-matching functions
float CMF_X(int i) {
  float x[36];
  x[0]=0.0014;x[1]=0.0042;x[2]=0.0143;x[3]=0.0435;x[4]=0.1344;x[5]=0.2839;
  x[6]=0.3483;x[7]=0.3362;x[8]=0.2908;x[9]=0.1954;x[10]=0.0956;x[11]=0.0320;
  x[12]=0.0049;x[13]=0.0093;x[14]=0.0633;x[15]=0.1655;x[16]=0.2904;x[17]=0.4334;
  x[18]=0.5945;x[19]=0.7621;x[20]=0.9163;x[21]=1.0263;x[22]=1.0622;x[23]=1.0026;
  x[24]=0.8544;x[25]=0.6424;x[26]=0.4479;x[27]=0.2835;x[28]=0.1649;x[29]=0.0874;
  x[30]=0.0468;x[31]=0.0227;x[32]=0.0114;x[33]=0.0058;x[34]=0.0029;x[35]=0.0014;
  return x[i];
}
float CMF_Y(int i) {
  float y[36];
  y[0]=0.0000;y[1]=0.0001;y[2]=0.0004;y[3]=0.0012;y[4]=0.0040;y[5]=0.0116;
  y[6]=0.0230;y[7]=0.0380;y[8]=0.0600;y[9]=0.0910;y[10]=0.1390;y[11]=0.2080;
  y[12]=0.3230;y[13]=0.5030;y[14]=0.7100;y[15]=0.8620;y[16]=0.9540;y[17]=0.9950;
  y[18]=0.9950;y[19]=0.9520;y[20]=0.8700;y[21]=0.7570;y[22]=0.6310;y[23]=0.5030;
  y[24]=0.3810;y[25]=0.2650;y[26]=0.1750;y[27]=0.1070;y[28]=0.0610;y[29]=0.0320;
  y[30]=0.0170;y[31]=0.0082;y[32]=0.0041;y[33]=0.0021;y[34]=0.0010;y[35]=0.0005;
  return y[i];
}
float CMF_Z(int i) {
  float z[36];
  z[0]=0.0065;z[1]=0.0201;z[2]=0.0679;z[3]=0.2074;z[4]=0.6456;z[5]=1.3856;
  z[6]=1.7471;z[7]=1.7721;z[8]=1.6692;z[9]=1.2876;z[10]=0.8130;z[11]=0.4652;
  z[12]=0.2720;z[13]=0.1582;z[14]=0.0782;z[15]=0.0422;z[16]=0.0203;z[17]=0.0087;
  z[18]=0.0037;z[19]=0.0021;z[20]=0.0017;z[21]=0.0011;z[22]=0.0008;z[23]=0.0003;
  z[24]=0.0002;z[25]=0.0000;z[26]=0.0000;z[27]=0.0000;z[28]=0.0000;z[29]=0.0000;
  z[30]=0.0000;z[31]=0.0000;z[32]=0.0000;z[33]=0.0000;z[34]=0.0000;z[35]=0.0000;
  return z[i];
}

// K/S → reflectance (Kubelka-Munk quadratic)
float ksToR(float ks) {
  return 1.0 + ks - sqrt(ks*ks + 2.0*ks);
}

// Gamma encode sRGB
float gammaEncode(float c) {
  c = clamp(c, 0.0, 1.0);
  return c <= 0.0031308 ? 12.92*c : 1.055*pow(c, 1.0/2.4) - 0.055;
}

// Full Kubelka-Munk mix: weights for [red, yellow, blue, white]
vec3 kmMix(float wr, float wy, float wb, float ww) {
  // Integrate over 36 spectral samples
  float X=0.0, Y=0.0, Z=0.0, Yn=0.0;
  for (int i = 0; i < 36; i++) {
    float ks = wr*KS_RED(i) + wy*KS_YELLOW(i) + wb*KS_BLUE(i) + ww*KS_WHITE(i);
    float r = ksToR(ks);
    X  += r * CMF_X(i);
    Y  += r * CMF_Y(i);
    Z  += r * CMF_Z(i);
    Yn += CMF_Y(i);
  }
  X /= Yn; Y /= Yn; Z /= Yn;
  // XYZ → linear sRGB
  float lr =  3.2406*X - 1.5372*Y - 0.4986*Z;
  float lg = -0.9689*X + 1.8758*Y + 0.0415*Z;
  float lb =  0.0557*X - 0.2040*Y + 1.0570*Z;
  return vec3(gammaEncode(lr), gammaEncode(lg), gammaEncode(lb));
}

// Domain warp for wet-paint smear
vec2 warp(vec2 uv) {
  float t = u_time * 0.12;
  float sx = sin(uv.y * 4.1 + t * 0.7) * 0.012 + sin(uv.x * 3.3 - t * 0.5) * 0.009;
  float sy = cos(uv.x * 3.7 + t * 0.6) * 0.012 + cos(uv.y * 2.9 + t * 0.4) * 0.009;
  return uv + vec2(sx, sy);
}

// Soft metaball weight for a blob at position p with radius r
float blobWeight(vec2 uv, vec2 p, float r) {
  float d = length(uv - p);
  // Smooth falloff with a little texture ring
  float base = 1.0 - smoothstep(0.0, r, d);
  base = pow(base, 1.6);
  return base;
}

void main() {
  // Canvas aspect-correct UV (y-flipped to match JS coords where y=0 is top)
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);

  // Apply domain warp for wet-paint feel
  vec2 wuv = warp(uv);

  // Blob weights (0=red/magenta, 1=yellow, 2=blue/cyan)
  float wR = blobWeight(wuv, u_pos[0], u_radius[0]);
  float wY = blobWeight(wuv, u_pos[1], u_radius[1]);
  float wB = blobWeight(wuv, u_pos[2], u_radius[2]);

  // Paper ground: soft cream
  vec3 paper = vec3(0.98, 0.96, 0.90);

  // If outside all blobs, draw paper
  float totalW = wR + wY + wB;
  if (totalW < 0.02) {
    o_color = vec4(paper, 1.0);
    return;
  }

  // Normalise so we always have unit pigment weights + white fill
  // Scale weights: more blob overlap → less white (denser paint)
  float density = clamp(totalW, 0.0, 1.0);
  float norm = max(totalW, 0.001);
  float wr = wR / norm * density;
  float wy = wY / norm * density;
  float wb = wB / norm * density;
  float ww = max(0.0, 1.0 - wr - wy - wb);

  // Kubelka-Munk mix
  vec3 paintColor = kmMix(wr, wy, wb, ww);

  // Glow effect: extra luminance at blob centres
  float glow = 0.0;
  for (int b = 0; b < 3; b++) {
    float d = length(wuv - u_pos[b]);
    glow += (1.0 - smoothstep(0.0, u_radius[b] * 0.3, d)) * 0.12;
  }
  paintColor = clamp(paintColor + glow, 0.0, 1.0);

  // Blend paint over paper at the edges
  float alpha = smoothstep(0.0, 0.15, density);
  vec3 col = mix(paper, paintColor, alpha);

  o_color = vec4(col, 1.0);
}
`

// ── GL helpers ────────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)
  if (!s) throw new Error('createShader failed')
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s) ?? 'unknown'
    gl.deleteShader(s)
    throw new Error('Shader compile error: ' + info)
  }
  return s
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const prog = gl.createProgram()
  if (!prog) throw new Error('createProgram failed')
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert)
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag)
  gl.attachShader(prog, vs)
  gl.attachShader(prog, fs)
  gl.linkProgram(prog)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog) ?? 'unknown'
    gl.deleteProgram(prog)
    throw new Error('Program link error: ' + info)
  }
  return prog
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface PaintBlob {
  x: number   // [0,1]
  y: number   // [0,1]
  r: number   // radius [0,1]
  vx: number  // velocity
  vy: number  // velocity
}

export interface GLRenderer {
  draw: (blobs: PaintBlob[], time: number) => void
  sampleColor: (x: number, y: number, size: number) => [number, number, number]
  destroy: () => void
}

// ── Create renderer ───────────────────────────────────────────────────────────

export function createGLRenderer(canvas: HTMLCanvasElement): GLRenderer {
  const glOrNull = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    preserveDrawingBuffer: true, // needed for readPixels
  })
  if (!glOrNull) throw new Error('WebGL2 not available')
  const gl: WebGL2RenderingContext = glOrNull

  const prog = linkProgram(gl, VERT_SRC, FRAG_SRC)

  // Full-screen quad
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  const vbo = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1,-1, 1,-1, -1,1, 1,1]),
    gl.STATIC_DRAW,
  )
  const aPos = gl.getAttribLocation(prog, 'a_pos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  gl.bindVertexArray(null)

  // Uniform locations
  const uPos  = gl.getUniformLocation(prog, 'u_pos')
  const uRad  = gl.getUniformLocation(prog, 'u_radius')
  const uTime = gl.getUniformLocation(prog, 'u_time')
  const uRes  = gl.getUniformLocation(prog, 'u_resolution')

  function draw(blobs: PaintBlob[], time: number) {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(prog)
    gl.bindVertexArray(vao)

    // Flatten blob positions for uniform upload
    const posArr = blobs.flatMap((b: PaintBlob) => [b.x, b.y])
    const radArr = blobs.map((b: PaintBlob) => b.r)

    gl.uniform2fv(uPos, posArr)
    gl.uniform1fv(uRad, radArr)
    gl.uniform1f(uTime, time)
    gl.uniform2f(uRes, canvas.width, canvas.height)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }

  // Read a region of the canvas and return average RGB [0-255]
  function sampleColor(
    x: number,  // normalised [0,1]
    y: number,  // normalised [0,1]
    size: number, // normalised radius
  ): [number, number, number] {
    const px = Math.round(x * canvas.width)
    const py = Math.round((1 - y) * canvas.height) // flip Y for WebGL
    const halfPx = Math.max(4, Math.round(size * Math.min(canvas.width, canvas.height)))
    const x0 = Math.max(0, px - halfPx)
    const y0 = Math.max(0, py - halfPx)
    const w = Math.min(canvas.width  - x0, halfPx * 2)
    const h = Math.min(canvas.height - y0, halfPx * 2)
    const buf = new Uint8Array(w * h * 4)
    gl.readPixels(x0, y0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
    let r = 0, g = 0, bc = 0
    const count = w * h
    for (let i = 0; i < count; i++) {
      r  += buf[i * 4]
      g  += buf[i * 4 + 1]
      bc += buf[i * 4 + 2]
    }
    return [r / count, g / count, bc / count]
  }

  function destroy() {
    gl.deleteProgram(prog)
    gl.deleteBuffer(vbo)
    gl.deleteVertexArray(vao)
    const ext = gl.getExtension('WEBGL_lose_context')
    ext?.loseContext()
  }

  return { draw, sampleColor, destroy }
}
