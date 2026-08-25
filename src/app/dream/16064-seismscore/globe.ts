// ─────────────────────────────────────────────────────────────────────────────
// globe.ts — raw WebGL2 renderer for 16064-seismscore (NO three.js).
//
// An analytic globe: a fullscreen quad whose fragment shader reconstructs a
// slowly auto-rotating sphere — near-black ground, bone-white lat/lon graticule,
// a thin bone rim + faint cold halo at the limb. Epicenters are projected onto
// the FRONT hemisphere and drawn as expanding additive rings (one instanced
// draw). A bottom seismogram strip is driven by the master analyser's
// time-domain data. Ikeda palette: black + bone-white, red reserved for the
// biggest/most-recent quakes and the seismogram peaks only.
// ─────────────────────────────────────────────────────────────────────────────

export interface GlobeHandle {
  /** Project a quake onto the sphere and spawn an expanding ring. */
  spawnRing(lon: number, lat: number, mag: number, red: boolean): void;
  /** Draw one frame. `time` is analyser byte time-domain data (or null). */
  render(nowMs: number, rotate: boolean, time: Uint8Array | null): void;
  resize(cssW: number, cssH: number, dpr: number): void;
  dispose(): void;
}

interface Ring {
  lon: number;
  lat: number;
  mag: number;
  red: boolean;
  born: number;
}

const R_SPHERE = 0.72; // sphere radius in aspect-space units
const TILT = 0.38; // fixed axial tilt (radians)
const ROT_SPEED = 0.055; // rad/s auto-rotation
const MAX_RINGS = 600;
const SEIS_N = 256;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("shader compile: " + log);
  }
  return sh;
}

function makeProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("program link: " + gl.getProgramInfoLog(p));
  }
  return p;
}

// geo(lat,lon) → unit vector, matching the shader's inverse (lat=asin(y),
// lon=atan(x,z)).
function geoUnit(latRad: number, lonRad: number): [number, number, number] {
  const cl = Math.cos(latRad);
  return [cl * Math.sin(lonRad), Math.sin(latRad), cl * Math.cos(lonRad)];
}

// forward transform geo → view:  view = rotX(TILT) * rotY(theta) * geo
function toView(
  v: [number, number, number],
  theta: number,
): [number, number, number] {
  const cy = Math.cos(theta),
    sy = Math.sin(theta);
  // rotY: (c*x + s*z, y, -s*x + c*z)
  const x1 = cy * v[0] + sy * v[2];
  const y1 = v[1];
  const z1 = -sy * v[0] + cy * v[2];
  const cx = Math.cos(TILT),
    sx = Math.sin(TILT);
  // rotX: (x, c*y - s*z, s*y + c*z)
  return [x1, cx * y1 - sx * z1, sx * y1 + cx * z1];
}

const GLOBE_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const GLOBE_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
uniform float uAspect;
uniform float uTheta;
uniform float uR;
const float PI = 3.14159265;
const float TILT = ${TILT.toFixed(4)};
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
float gridLine(float coord, float spacing){
  float f = coord / spacing;
  float d = abs(fract(f + 0.5) - 0.5);
  float w = fwidth(f) * 1.5;
  return 1.0 - smoothstep(0.0, w, d);
}
void main(){
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float R = uR;
  float r2 = dot(p, p);
  float d = sqrt(r2);
  vec3 col = vec3(0.012, 0.012, 0.018); // near-black ground
  if (r2 <= R*R){
    float z = sqrt(max(0.0, R*R - r2));
    vec3 view = vec3(p, z) / R;
    vec3 g = rotY(-uTheta) * rotX(-TILT) * view;
    float lat = asin(clamp(g.y, -1.0, 1.0));
    float lon = atan(g.x, g.z);
    float latDeg = lat * 180.0 / PI;
    float lonDeg = lon * 180.0 / PI;
    float grat = max(gridLine(latDeg, 15.0), gridLine(lonDeg, 15.0));
    float facing = view.z;
    grat *= smoothstep(0.0, 0.32, facing);
    // equator + prime meridian a touch brighter
    float major = max(gridLine(latDeg, 90.0), gridLine(lonDeg, 90.0));
    major *= smoothstep(0.0, 0.32, facing);
    vec3 ground = vec3(0.028, 0.030, 0.040) * (0.45 + 0.55 * facing);
    vec3 bone = vec3(0.80, 0.84, 0.92);
    col = mix(ground, bone, clamp(grat * 0.85 + major * 0.35, 0.0, 1.0));
  }
  // thin bone rim exactly at the limb
  float rim = exp(-pow((d - R) / 0.010, 2.0));
  col += vec3(0.48, 0.53, 0.62) * rim * 0.55;
  // faint cold halo just outside the disk
  float outer = d > R ? smoothstep(R + 0.13, R, d) : 0.0;
  col += vec3(0.10, 0.13, 0.20) * outer * 0.6;
  frag = vec4(col, 1.0);
}`;

const RING_VS = `#version 300 es
in vec2 aQuad;
in vec2 aCenter;
in float aRadius;
in float aBright;
in float aRed;
uniform float uAspect;
out vec2 vLocal;
out float vBright;
out float vRed;
void main(){
  vec2 world = aCenter + aQuad * aRadius;
  gl_Position = vec4(world.x / uAspect, world.y, 0.0, 1.0);
  vLocal = aQuad; vBright = aBright; vRed = aRed;
}`;

const RING_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vBright;
in float vRed;
out vec4 frag;
void main(){
  float r = length(vLocal);
  float ring = exp(-pow((r - 0.82) / 0.10, 2.0));
  float core = exp(-pow(r / 0.13, 2.0));
  float a = (ring + core * 0.75) * vBright;
  vec3 white = vec3(0.85, 0.88, 0.96);
  vec3 red = vec3(0.78, 0.05, 0.09);
  vec3 c = mix(white, red, vRed);
  frag = vec4(c * a, a);
}`;

const SEIS_VS = `#version 300 es
in vec2 aPos;
in float aPeak;
out float vPeak;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); vPeak = aPeak; }`;

const SEIS_FS = `#version 300 es
precision highp float;
in float vPeak;
out vec4 frag;
void main(){
  vec3 white = vec3(0.78, 0.82, 0.90);
  vec3 red = vec3(0.82, 0.06, 0.10);
  frag = vec4(mix(white, red, vPeak), 0.9);
}`;

export function makeGlobe(gl: WebGL2RenderingContext): GlobeHandle {
  const globeProg = makeProgram(gl, GLOBE_VS, GLOBE_FS);
  const ringProg = makeProgram(gl, RING_VS, RING_FS);
  const seisProg = makeProgram(gl, SEIS_VS, SEIS_FS);

  const uGlobeAspect = gl.getUniformLocation(globeProg, "uAspect");
  const uGlobeTheta = gl.getUniformLocation(globeProg, "uTheta");
  const uGlobeR = gl.getUniformLocation(globeProg, "uR");
  const uRingAspect = gl.getUniformLocation(ringProg, "uAspect");

  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

  // ── globe VAO ──
  const globeVAO = gl.createVertexArray()!;
  gl.bindVertexArray(globeVAO);
  const globeQuadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, globeQuadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  {
    const loc = gl.getAttribLocation(globeProg, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  // ── ring VAO (instanced) ──
  const ringVAO = gl.createVertexArray()!;
  gl.bindVertexArray(ringVAO);
  const ringQuadBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, ringQuadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  {
    const loc = gl.getAttribLocation(ringProg, "aQuad");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  // interleaved instance buffer: center.xy, radius, bright, red = 5 floats
  const STRIDE = 5 * 4;
  const instData = new Float32Array(MAX_RINGS * 5);
  const ringInstBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, ringInstBuf);
  gl.bufferData(gl.ARRAY_BUFFER, instData.byteLength, gl.DYNAMIC_DRAW);
  {
    const cLoc = gl.getAttribLocation(ringProg, "aCenter");
    gl.enableVertexAttribArray(cLoc);
    gl.vertexAttribPointer(cLoc, 2, gl.FLOAT, false, STRIDE, 0);
    gl.vertexAttribDivisor(cLoc, 1);
    const rLoc = gl.getAttribLocation(ringProg, "aRadius");
    gl.enableVertexAttribArray(rLoc);
    gl.vertexAttribPointer(rLoc, 1, gl.FLOAT, false, STRIDE, 8);
    gl.vertexAttribDivisor(rLoc, 1);
    const bLoc = gl.getAttribLocation(ringProg, "aBright");
    gl.enableVertexAttribArray(bLoc);
    gl.vertexAttribPointer(bLoc, 1, gl.FLOAT, false, STRIDE, 12);
    gl.vertexAttribDivisor(bLoc, 1);
    const dLoc = gl.getAttribLocation(ringProg, "aRed");
    gl.enableVertexAttribArray(dLoc);
    gl.vertexAttribPointer(dLoc, 1, gl.FLOAT, false, STRIDE, 16);
    gl.vertexAttribDivisor(dLoc, 1);
  }

  // ── seismogram VAO ──
  const seisVAO = gl.createVertexArray()!;
  gl.bindVertexArray(seisVAO);
  const seisPos = new Float32Array(SEIS_N * 2);
  const seisPeak = new Float32Array(SEIS_N);
  const seisPosBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, seisPosBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seisPos.byteLength, gl.DYNAMIC_DRAW);
  {
    const loc = gl.getAttribLocation(seisProg, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  const seisPeakBuf = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, seisPeakBuf);
  gl.bufferData(gl.ARRAY_BUFFER, seisPeak.byteLength, gl.DYNAMIC_DRAW);
  {
    const loc = gl.getAttribLocation(seisProg, "aPeak");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 1, gl.FLOAT, false, 0, 0);
  }
  gl.bindVertexArray(null);

  const rings: Ring[] = [];
  let theta = 0;
  let lastNow = 0;
  let aspect = 1;

  function ringLife(mag: number) {
    return 2.4 + mag * 0.45;
  }

  return {
    spawnRing(lon, lat, mag, red) {
      if (rings.length >= MAX_RINGS) rings.shift();
      rings.push({ lon, lat, mag, red, born: performance.now() });
    },

    resize(cssW, cssH, dpr) {
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      const canvas = gl.canvas as HTMLCanvasElement;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      aspect = w / h;
    },

    render(nowMs, rotate, time) {
      if (lastNow === 0) lastNow = nowMs;
      const dt = (nowMs - lastNow) / 1000;
      lastNow = nowMs;
      if (rotate) theta += dt * ROT_SPEED;

      gl.clearColor(0.008, 0.008, 0.012, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.BLEND);

      // globe
      gl.useProgram(globeProg);
      gl.uniform1f(uGlobeAspect, aspect);
      gl.uniform1f(uGlobeTheta, theta);
      gl.uniform1f(uGlobeR, R_SPHERE);
      gl.bindVertexArray(globeVAO);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // rings — build instance data (only front-hemisphere, live ones)
      let count = 0;
      const now = performance.now();
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        const age = (now - rg.born) / 1000;
        const life = ringLife(rg.mag);
        if (age > life) {
          rings.splice(i, 1);
          continue;
        }
        const [vx, vy, vz] = toView(
          geoUnit((rg.lat * Math.PI) / 180, (rg.lon * Math.PI) / 180),
          theta,
        );
        if (vz <= 0.02) continue; // back hemisphere — hidden
        const t = age / life;
        const radius = (0.02 + t * (0.11 + rg.mag * 0.018)) * (0.6 + vz * 0.4);
        const bright = (1.0 - t) * (0.35 + Math.min(rg.mag, 7) * 0.11);
        const o = count * 5;
        instData[o] = vx * R_SPHERE;
        instData[o + 1] = vy * R_SPHERE;
        instData[o + 2] = radius;
        instData[o + 3] = bright;
        instData[o + 4] = rg.red ? 1 : 0;
        count++;
        if (count >= MAX_RINGS) break;
      }
      if (count > 0) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE); // additive
        gl.useProgram(ringProg);
        gl.uniform1f(uRingAspect, aspect);
        gl.bindVertexArray(ringVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, ringInstBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, instData, 0, count * 5);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      }

      // seismogram strip
      const yBase = -0.86;
      const amp = 0.11;
      for (let i = 0; i < SEIS_N; i++) {
        const x = -0.97 + (1.94 * i) / (SEIS_N - 1);
        let v = 0;
        if (time && time.length > 0) {
          const idx = Math.floor((i / (SEIS_N - 1)) * (time.length - 1));
          v = (time[idx] - 128) / 128;
        }
        seisPos[i * 2] = x;
        seisPos[i * 2 + 1] = yBase + v * amp;
        seisPeak[i] = Math.min(1, Math.max(0, (Math.abs(v) - 0.28) * 3.0));
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(seisProg);
      gl.bindVertexArray(seisVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, seisPosBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, seisPos);
      gl.bindBuffer(gl.ARRAY_BUFFER, seisPeakBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, seisPeak);
      gl.drawArrays(gl.LINE_STRIP, 0, SEIS_N);

      gl.bindVertexArray(null);
    },

    dispose() {
      try {
        gl.deleteProgram(globeProg);
        gl.deleteProgram(ringProg);
        gl.deleteProgram(seisProg);
        gl.deleteBuffer(globeQuadBuf);
        gl.deleteBuffer(ringQuadBuf);
        gl.deleteBuffer(ringInstBuf);
        gl.deleteBuffer(seisPosBuf);
        gl.deleteBuffer(seisPeakBuf);
        gl.deleteVertexArray(globeVAO);
        gl.deleteVertexArray(ringVAO);
        gl.deleteVertexArray(seisVAO);
      } catch {
        /* context lost */
      }
    },
  };
}
