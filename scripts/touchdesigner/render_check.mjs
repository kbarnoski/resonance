#!/usr/bin/env node
// render_check.mjs — render the TD show's own shaders without TouchDesigner,
// then measure the result with the flicker meter.
//
// TouchDesigner needs a licence to run; this check does not. It takes the
// control track that test_show.py produces (the real BRAIN_CORE replaying the
// rehearsal OSC log, smoothed exactly like the Lag + Filter CHOPs) and runs the
// SAME GLSL as build_show.py (sim, pcol, sprite, trail, safe) in headless
// Chromium (WebGL2, RGBA32F/16F targets, instanced motes, additive blend), at a
// fixed 60 fps step, writes an MP4 and runs scripts/flicker-meter.mjs on it.
//
//   python3 scripts/touchdesigner/test_show.py --track /tmp/track.json
//   node scripts/touchdesigner/render_check.mjs /tmp/track.json --out /tmp/td-render.mp4
//        [--from 16 --seconds 20] [--w 1280 --h 720] [--res 128] [--stills dir]
//
// Respects the shared-machine GPU lock (~/Documents/Resonance/.gpu-measure.lock).

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const MAIN = process.env.RESONANCE_MAIN || path.join(os.homedir(), "my-app");
const require = createRequire(path.join(MAIN, "package.json"));
const { chromium } = require("playwright");
const FFMPEG = require("ffmpeg-static");

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const trackFile = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
if (!trackFile) { console.error("usage: render_check.mjs <track.json> [--out f.mp4] [--from s] [--seconds s]"); process.exit(2); }
const OUT = opt("--out", path.join(os.tmpdir(), "td-render.mp4"));
const FROM = Number(opt("--from", 0));
const SECONDS = Number(opt("--seconds", 0));
const W = Number(opt("--w", 1280)), H = Number(opt("--h", 720));
const RES = Number(opt("--res", 128));
const OW = 320, OH = 180; // capture size (the meter analyses at 256 px wide)
const STILLS = opt("--stills", null);

const LOCK = path.join(os.homedir(), "Documents/Resonance/.gpu-measure.lock");
async function waitLock() {
  while (existsSync(LOCK)) {
    console.log("[render_check] GPU lock held — waiting 60 s");
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

const track = JSON.parse(readFileSync(trackFile, "utf8"));
const fps = track.fps || 60;
const first = Math.floor(FROM * fps);
const last = SECONDS > 0 ? Math.min(track.frames.length, first + Math.round(SECONDS * fps)) : track.frames.length;

const PAGE = `<!doctype html><html><body style="margin:0;background:#000"><canvas id=c width=${OW} height=${OH}></canvas><script>
const W=${W},H=${H},RES=${RES},OW=${OW},OH=${OH};
const gl=document.getElementById('c').getContext('webgl2',{antialias:false,preserveDrawingBuffer:true});
if(!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float targets');
gl.getExtension('OES_texture_float_linear');
const VS_FS='#version 300 es\\nin vec2 aPos;out vec2 vUV;void main(){vUV=aPos*0.5+0.5;gl_Position=vec4(aPos,0.,1.);}';
const PRE='#version 300 es\\nprecision highp float;precision highp sampler2D;\\nin vec2 vUV;\\nuniform sampler2D sTD2DInputs[2];\\n';
function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o)+'\\n'+s.split('\\n').slice(0,12).join('\\n'));return o;}
function prog(vs,fs){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.bindAttribLocation(p,0,'aPos');gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
function tex(w,h,fmt){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);const f=fmt==='32'?[gl.RGBA32F,gl.FLOAT]:fmt==='8'?[gl.RGBA8,gl.UNSIGNED_BYTE]:[gl.RGBA16F,gl.HALF_FLOAT];gl.texImage2D(gl.TEXTURE_2D,0,f[0],w,h,0,gl.RGBA,f[1],null);const filt=fmt==='32'?gl.NEAREST:gl.LINEAR;gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filt);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filt);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);const fb=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);return {t,fb,w,h};}
const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
let P={},CH={},T=0,DT=1/60;
const PP={}; // ping-pong targets
function setup(shaders,channels){
  channels.forEach((c,i)=>CH[c]=i);
  for(const k of ['sim','pcol','sprite','trail','safe']) P[k]=prog(VS_FS,PRE+shaders[k]);
  P.blit=prog(VS_FS,'#version 300 es\\nprecision highp float;in vec2 vUV;uniform sampler2D s;uniform vec2 px;out vec4 o;void main(){vec4 a=vec4(0);for(int i=-2;i<2;i++)for(int j=-2;j<2;j++)a+=texture(s,vUV+(vec2(i,j)+0.5)*px);o=vec4(a.rgb/16.,1.);}');
  P.mote=prog('#version 300 es\\nprecision highp float;precision highp sampler2D;in vec2 aPos;uniform sampler2D uSim;uniform sampler2D uCol;uniform int uRes;uniform mat4 uVP;uniform float uScale;out vec2 vUV;out vec4 vCol;void main(){ivec2 c=ivec2(gl_InstanceID%uRes,gl_InstanceID/uRes);vec4 s=texelFetch(uSim,c,0);vCol=texelFetch(uCol,c,0);vec3 p=s.xyz+vec3(aPos*0.5*uScale,0.);vUV=aPos*0.5+0.5;gl_Position=s.a>0.?uVP*vec4(p,1.):vec4(2.,2.,2.,1.);}',
    '#version 300 es\\nprecision highp float;in vec2 vUV;in vec4 vCol;uniform sampler2D uSprite;out vec4 o;void main(){o=vCol*texture(uSprite,vUV);}');
  PP.sim=[tex(RES,RES,'32'),tex(RES,RES,'32')];PP.pcol=tex(RES,RES,'16');PP.sprite=tex(64,64,'8');PP.render=tex(W,H,'16');
  PP.trail=[tex(W,H,'16'),tex(W,H,'16')];PP.safe=[tex(W,H,'16'),tex(W,H,'16')];
  pass(P.sprite,PP.sprite,[],{});
}
function bindInputs(p,inputs){inputs.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t.t);});const l=gl.getUniformLocation(p,'sTD2DInputs');if(l)gl.uniform1iv(l,[0,1]);}
function pass(p,dst,inputs,u){gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fb);gl.viewport(0,0,dst.w,dst.h);gl.disable(gl.BLEND);bindInputs(p,inputs);for(const k in u){const l=gl.getUniformLocation(p,k);if(l)gl.uniform4fv(l,u[k]);}gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
function persp(fovx,aspect,n,f){const tx=1/Math.tan(fovx/2),ty=tx*aspect;return [tx,0,0,0,0,ty,0,0,0,0,(f+n)/(n-f),-1,0,0,2*f*n/(n-f),0];}
function mul(a,b){const o=new Array(16).fill(0);for(let i=0;i<4;i++)for(let j=0;j<4;j++)for(let k=0;k<4;k++)o[j*4+i]+=a[k*4+i]*b[j*4+k];return o;}
function view(t){const ry=2.5*Math.sin(t*0.021)*Math.PI/180,rx=1.5*Math.sin(t*0.017)*Math.PI/180;const cy=Math.cos(-ry),sy=Math.sin(-ry),cx=Math.cos(-rx),sx=Math.sin(-rx);
  const RY=[cy,0,-sy,0,0,1,0,0,sy,0,cy,0,0,0,0,1],RX=[1,0,0,0,0,cx,sx,0,0,-sx,cx,0,0,0,0,1],TZ=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,-5.5,1];return mul(TZ,mul(RX,RY));}
let si=0,ti=0,qi=0;
function frame(v){
  const c=k=>v[CH[k]];const t=T;
  const s0=PP.sim[si],s1=PP.sim[1-si];
  pass(P.sim,s1,[s0],{uA:[t,DT,c('speed'),c('turb')],uB:[c('emit'),c('breath'),c('presence'),c('onset')],uF:[c('form0'),c('form1'),c('form2'),c('form3')],uG:[c('form4'),c('size'),c('bass'),c('sparkle')]});si=1-si;
  const pal=i=>[c('pal'+i+'r'),c('pal'+i+'g'),c('pal'+i+'b'),1];
  pass(P.pcol,PP.pcol,[s1],{uP0:pal(0),uP1:pal(1),uP2:pal(2),uP3:pal(3),uP4:pal(4),uW:[c('warmth'),c('sparkle'),c('presence'),t]});
  // render motes
  gl.bindFramebuffer(gl.FRAMEBUFFER,PP.render.fb);gl.viewport(0,0,W,H);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(P.mote);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,s1.t);gl.uniform1i(gl.getUniformLocation(P.mote,'uSim'),0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,PP.pcol.t);gl.uniform1i(gl.getUniformLocation(P.mote,'uCol'),1);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,PP.sprite.t);gl.uniform1i(gl.getUniformLocation(P.mote,'uSprite'),2);
  gl.uniform1i(gl.getUniformLocation(P.mote,'uRes'),RES);gl.uniform1f(gl.getUniformLocation(P.mote,'uScale'),0.03*c('size'));
  gl.uniformMatrix4fv(gl.getUniformLocation(P.mote,'uVP'),false,new Float32Array(mul(persp(45*Math.PI/180,W/H,0.1,100),view(t))));
  gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,RES*RES);gl.disable(gl.BLEND);
  const tr0=PP.trail[ti],tr1=PP.trail[1-ti];pass(P.trail,tr1,[PP.render,tr0],{uT:[c('trail'),c('zoom'),c('swirl'),DT]});ti=1-ti;
  const q0=PP.safe[qi],q1=PP.safe[1-qi];pass(P.safe,q1,[tr1,q0],{uS:[c('master'),2.4,DT,0.8],uP0:pal(0),uP1:pal(1),uV:[c('presence'),c('breath'),t,0]});qi=1-qi;
  T+=DT; return q1;
}
const px=new Uint8Array(OW*OH*4);
function run(frames,capture){let out=capture?new Uint8Array(frames.length*OW*OH*4):null;frames.forEach((v,i)=>{const q=frame(v);if(capture){gl.useProgram(P.blit);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,OW,OH);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,q.t);gl.uniform1i(gl.getUniformLocation(P.blit,'s'),0);gl.uniform2f(gl.getUniformLocation(P.blit,'px'),1/W,1/H);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);gl.readPixels(0,0,OW,OH,gl.RGBA,gl.UNSIGNED_BYTE,px);out.set(px,i*OW*OH*4);}});
  if(!capture)return '';let s='';for(let i=0;i<out.length;i+=0x8000)s+=String.fromCharCode.apply(null,out.subarray(i,i+0x8000));return btoa(s);}
function still(){const q=PP.safe[qi];gl.bindFramebuffer(gl.FRAMEBUFFER,q.fb);const f=new Float32Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,f);const b=new Uint8Array(W*H*4);for(let i=0;i<f.length;i++)b[i]=Math.max(0,Math.min(255,Math.round(f[i]*255)));let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s);}
window.__api={setup,run,still};
</script></body></html>`;

function ffmpegWriter(file, w, h) {
  const ff = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(fps), "-i", "-", "-vf", "vflip", "-c:v", "libx264", "-crf", "10", "-pix_fmt", "yuv420p", file], { stdio: ["pipe", "inherit", "inherit"] });
  return { write: (buf) => new Promise((r) => (ff.stdin.write(buf) ? r() : ff.stdin.once("drain", r))), close: () => new Promise((r) => { ff.on("close", r); ff.stdin.end(); }) };
}

async function main() {
  await waitLock();
  const browser = await chromium.launch({ headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.setContent(PAGE);
    if (errs.length) throw new Error(errs.join("\n"));
    await page.evaluate(([s, c]) => window.__api.setup(s, c), [track.shaders, track.channels]);
    const writer = ffmpegWriter(OUT, OW, OH);
    const CH = 60;
    const t0 = Date.now();
    const stillsAt = STILLS ? new Set([first + 60, Math.floor((first + last) / 2), last - 1].map((x) => Math.min(last - 1, x))) : new Set();
    if (STILLS) mkdirSync(STILLS, { recursive: true });
    for (let f = 0; f < last; f += CH) {
      const n = Math.min(CH, last - f);
      const capture = f + n > first;
      const b64 = await page.evaluate(([a, b, cap]) => window.__api.run(a, cap), [track.frames.slice(f, f + n), n, capture]);
      if (capture) {
        const buf = Buffer.from(b64, "base64");
        const skip = Math.max(0, first - f);
        await writer.write(buf.subarray(skip * OW * OH * 4));
      }
      for (const s of stillsAt) {
        if (s >= f && s < f + n) {
          const raw = Buffer.from(await page.evaluate(() => window.__api.still()), "base64");
          const png = path.join(STILLS, `frame-${String(f + n).padStart(5, "0")}.png`);
          await new Promise((r) => { const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-i", "-", "-vf", "vflip", "-frames:v", "1", png]); p.on("close", r); p.stdin.end(raw); });
          console.log(`[render_check] still ${png}`);
        }
      }
    }
    await writer.close();
    console.log(`[render_check] ${last - first} frames (${((last - first) / fps).toFixed(1)} s) → ${OUT} in ${((Date.now() - t0) / 1000).toFixed(1)} s; errors: ${errs.length}`);
    if (errs.length) { console.error(errs.join("\n")); process.exitCode = 1; }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error("[render_check]", e.message); process.exit(1); });
