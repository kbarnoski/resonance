// CLI parsing, frame planning and ffmpeg argument building for
// scripts/export-journey.mjs (pure — unit tested in plan.test.mjs).

export const KIOSK_PORT = 3000;

/** Stage-1 intermediate container (see encodeArgs). */
export const INTERMEDIATE_EXT = ".video.nut";

export const DEFAULTS = Object.freeze({
  journey: null,
  set: "tramokyo-mix",
  from: 0,
  to: null, // null = end of track
  res: "3840x2160",
  fps: 60,
  codec: "h264", // h264 | prores
  prores: "hq", // 422 | hq   (ProRes 422 / ProRes 422 HQ)
  crf: 14,
  preset: "slow",
  audioBitrate: "320k",
  port: 3100,
  host: "localhost",
  dpr: 2,
  tier: "high",
  seed: 1,
  epoch: "2026-10-13T20:00:00Z",
  // jpeg q95: 0.10 s/frame flat at 4K vs PNG's 0.1-1.0 s (Chrome's PNG encode
  // scales with content); 51 dB PSNR vs the PNG path after x264 (2026-10-13)
  capture: "jpeg", // jpeg | png
  jpegQuality: 95,
  warm: "simulate", // simulate (play from 0, capture from --from) | seek
  preroll: 3, // seconds simulated before --from in seek mode
  maxWaitStart: 180, // virtual seconds to wait for the track to start
  settleMs: 4000,
  fade: 0,
  headed: false,
  gl: "metal", // metal | swiftshader | default
  verify: false,
  verifySeconds: 3,
  verifyMinPsnr: 50,
  analyserLead: 0,
  allowLiveImagery: false,
  keepIntermediate: false,
  dryRun: false,
  audio: null, // dry-run: analyse this local audio file
  out: null,
  extraParams: "",
  allowKioskPort: false,
  workers: 1, // parallel browsers, each rendering a contiguous chunk
  expectName: null, // the journey title that must appear (wrong-journey guard)
});

const NUMERIC = new Set(["from", "fps", "crf", "port", "dpr", "seed", "jpegQuality", "preroll", "maxWaitStart", "settleMs", "fade", "verifySeconds", "verifyMinPsnr", "analyserLead", "workers"]);
const BOOLEAN = new Set(["headed", "verify", "allowLiveImagery", "keepIntermediate", "dryRun", "allowKioskPort"]);
const ALIASES = { "i-know-3000-is-the-live-kiosk": "allowKioskPort", params: "extraParams" };

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export const USAGE = `
Offline 4K export — deterministic, frame-perfect render of a Resonance journey.

  node scripts/export-journey.mjs --journey=<id> [options]

  --journey=<id>        journey id (required), e.g. ghost, first-snow
  --set=<program>       set/program for ?start=<id>@<set>   (default tramokyo-mix; --set=none → plain id)
  --from=<s> --to=<s>   track-time range in seconds          (default 0 → end of track)
  --res=WxH             output size                          (default 3840x2160)
  --dpr=<n>             device scale factor; viewport = res/dpr (default 2 → 1920x1080 CSS)
  --fps=<n>             frame rate                           (default 60)
  --codec=h264|prores   H.264 High (.mp4, AAC) or ProRes (.mov, PCM)   (default h264)
  --prores=422|hq       ProRes flavour                       (default hq)
  --crf=<n>             x264 quality                         (default 14)
  --port=<n>            server port — the LAB                (default 3100; 3000 = live kiosk, refused)
  --out=<file>          output path                          (default exports/<journey>-<from>-<to>.<ext>)
  --seed=<n>            Math.random / crypto seed            (default 1 — same take every run)
  --warm=simulate|seek  simulate: play from track start, capture from --from (faithful, default)
                        seek: jump to --from minus --preroll seconds (fast)
  --fade=<s>            fade video+audio in/out
  --capture=jpeg|png    frame grab format: jpeg q95 (default, ~5-10x faster) or png (lossless)
  --gl=metal|swiftshader|default                             (default metal — the real GPU)
  --headed              show the browser window (default headless)
  --verify              determinism check: render [from, from+3s] twice, compare frame hashes
  --dry-run             no browser: print the plan + commands; with --audio=<file> also
                        decode it and run the analyser math over the range
  --params=a=1&b=2      extra URL params for the installation page
  --expect-name=<name>  fail fast unless this journey title appears by 25 s of track time
  --workers=<n>         parallel browsers, each rendering a contiguous chunk (simulate mode;
                        seams are exact continuations), joined losslessly   (default 1)
`;

/** Parse argv → { opts, errors }. */
export function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  const errors = [];
  for (const raw of argv) {
    if (!raw.startsWith("--")) { errors.push(`unexpected argument: ${raw}`); continue; }
    const eq = raw.indexOf("=");
    const name = raw.slice(2, eq === -1 ? undefined : eq);
    const key = ALIASES[name] ?? camel(name);
    if (!(key in DEFAULTS)) { errors.push(`unknown option --${name}`); continue; }
    if (BOOLEAN.has(key)) {
      const v = eq === -1 ? "1" : raw.slice(eq + 1);
      opts[key] = !/^(0|false|no)$/i.test(v);
      continue;
    }
    if (eq === -1) { errors.push(`--${name} needs a value (--${name}=...)`); continue; }
    const v = raw.slice(eq + 1);
    if (NUMERIC.has(key)) {
      const n = Number(v);
      if (!Number.isFinite(n)) { errors.push(`--${name}: not a number: ${v}`); continue; }
      opts[key] = n;
    } else if (key === "to") {
      if (v === "end") opts.to = null;
      else {
        const n = Number(v);
        if (!Number.isFinite(n)) { errors.push(`--to: not a number: ${v}`); continue; }
        opts.to = n;
      }
    } else opts[key] = v;
  }
  validate(opts, errors);
  return { opts, errors };
}

export function parseRes(res) {
  const m = /^(\d+)x(\d+)$/.exec(String(res));
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

function validate(o, errors) {
  if (!o.journey && !o.dryRun) errors.push("--journey=<id> is required");
  const r = parseRes(o.res);
  if (!r) errors.push(`--res must be WxH, got ${o.res}`);
  else {
    if (r.width % 2 || r.height % 2) errors.push("--res width and height must be even (yuv420p)");
    if (!(o.dpr > 0)) errors.push("--dpr must be > 0");
    else if (!Number.isInteger(r.width / o.dpr) || !Number.isInteger(r.height / o.dpr)) {
      errors.push(`--res ${o.res} is not divisible by --dpr ${o.dpr} (viewport must be whole CSS pixels)`);
    }
  }
  if (!(o.fps > 0 && o.fps <= 240)) errors.push("--fps must be in (0, 240]");
  if (o.from < 0) errors.push("--from must be >= 0");
  if (o.to !== null && !(o.to > o.from)) errors.push("--to must be greater than --from");
  if (!["h264", "prores"].includes(o.codec)) errors.push("--codec must be h264 or prores");
  if (!["422", "hq"].includes(String(o.prores))) errors.push("--prores must be 422 or hq");
  if (!["png", "jpeg"].includes(o.capture)) errors.push("--capture must be png or jpeg");
  if (!["simulate", "seek"].includes(o.warm)) errors.push("--warm must be simulate or seek");
  if (!["metal", "swiftshader", "default"].includes(o.gl)) errors.push("--gl must be metal, swiftshader or default");
  if (!Number.isInteger(o.port) || o.port <= 0) errors.push("--port must be a port number");
  if (o.port === KIOSK_PORT && !o.allowKioskPort) {
    errors.push(`--port=${KIOSK_PORT} is the LIVE KIOSK. Export from the lab (--port=3100). ` +
      `(Override only on a non-kiosk machine: --i-know-3000-is-the-live-kiosk)`);
  }
  if (o.fade < 0) errors.push("--fade must be >= 0");
  if (!Number.isInteger(o.workers) || o.workers < 1 || o.workers > 8) errors.push("--workers must be an integer 1..8");
  if (o.workers > 1 && o.fade > 0) errors.push("--fade with --workers is not supported (each chunk would fade) — fade in an editor or use --workers=1");
  if (isNaN(Date.parse(o.epoch))) errors.push(`--epoch is not a date: ${o.epoch}`);
}

/** Page URL for the installation route. */
export function buildUrl(o) {
  const start = o.set && o.set !== "none" ? `${o.journey}@${o.set}` : o.journey;
  const p = new URLSearchParams();
  p.set("loop", "1");
  p.set("start", start);
  p.set("tier", o.tier);
  p.set("lab", "1");
  p.set("export", "1");
  p.set("fpscap", "0");
  if (o.extraParams) for (const [k, v] of new URLSearchParams(o.extraParams)) p.set(k, v);
  return `http://${o.host}:${o.port}/room/installation?${p.toString()}`;
}

/**
 * Frame plan for a track-time range. Frames sit on the 1/fps grid from
 * the start of the track: frame i of the export shows track time
 * (startFrame + i) / fps.
 */
export function planFrames({ from, to, fps, duration }) {
  let end = to ?? duration;
  if (end == null || !Number.isFinite(end)) throw new Error("planFrames: --to unknown and no track duration");
  if (Number.isFinite(duration) && end > duration) end = duration;
  const startFrame = Math.round(from * fps);
  const endFrame = Math.floor(end * fps + 1e-6);
  const count = endFrame - startFrame;
  if (count <= 0) throw new Error(`planFrames: empty range ${from}..${end}s`);
  return {
    startFrame,
    endFrame,
    count,
    startTime: startFrame / fps,
    durationS: count / fps,
    timeOf: (i) => (startFrame + i) / fps,
  };
}

/** Is the media time `t` the expected time of export frame i (within a quarter frame)? */
export function onGrid(t, expected, fps) {
  return Math.abs(t - expected) <= 0.25 / fps;
}

export function defaultOut(o) {
  const ext = o.codec === "prores" ? "mov" : "mp4";
  const to = o.to === null ? "end" : String(o.to);
  return `exports/${o.journey}-${o.from}-${to}-${o.res}-${o.fps}fps.${ext}`;
}

const fadeFilters = (fade, durationS, kind) => {
  if (!(fade > 0)) return [];
  const f = Math.min(fade, durationS / 2);
  const outStart = Math.max(0, durationS - f).toFixed(6);
  return kind === "video"
    ? [`fade=t=in:st=0:d=${f}`, `fade=t=out:st=${outStart}:d=${f}`]
    : [`afade=t=in:st=0:d=${f}`, `afade=t=out:st=${outStart}:d=${f}`];
};

/**
 * Stage 1: frames on stdin → video-only intermediate (NUT: exact 1/fps
 * timestamps — Matroska's 1 ms timebase jitters 60 fps — and it survives an
 * interrupted run). `lossless` = FFV1 RGB for the determinism check.
 */
export function encodeArgs(o, { width, height, fps, durationS, out, lossless }) {
  const inCodec = o.capture === "jpeg" ? "mjpeg" : "png";
  const a = ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", inCodec, "-i", "pipe:0"];
  const vf = [`scale=${width}:${height}:flags=lanczos`];
  if (lossless) {
    a.push("-vf", vf.join(","), "-c:v", "ffv1", "-level", "3", "-pix_fmt", "bgr0", out);
    return a;
  }
  vf.push(...fadeFilters(o.fade, durationS, "video"));
  if (o.codec === "prores") {
    vf.push("scale=out_color_matrix=bt709:out_range=tv", "format=yuv422p10le");
    a.push("-vf", vf.join(","), "-c:v", "prores_ks", "-profile:v", String(o.prores) === "422" ? "2" : "3", "-vendor", "apl0");
  } else {
    vf.push("scale=out_color_matrix=bt709:out_range=tv", "format=yuv420p");
    a.push("-vf", vf.join(","), "-c:v", "libx264", "-preset", o.preset, "-crf", String(o.crf), "-profile:v", "high",
      // aq-mode 3 spends bits in the dark (most of a Resonance frame) — less banding
      "-x264-params", "aq-mode=3");
  }
  a.push("-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", out);
  return a;
}

/** Stage 2: intermediate video + the track's audio range → final file. */
export function muxArgs(o, { video, audio, audioStart, durationS, out }) {
  const a = ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-ss", audioStart.toFixed(6), "-t", durationS.toFixed(6), "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
    // re-tag on copy (NUT drops the colour tags; ProRes has no VUI to carry them)
    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv"];
  const af = fadeFilters(o.fade, durationS, "audio");
  if (af.length) a.push("-af", af.join(","));
  if (o.codec === "prores") a.push("-c:a", "pcm_s24le");
  else a.push("-c:a", "aac", "-b:a", o.audioBitrate, "-movflags", "+faststart");
  a.push("-t", durationS.toFixed(6), out);
  return a;
}

/** ffmpeg decode of a track to interleaved float32 stereo at the AudioContext rate. */
export function decodeArgs(file, sampleRate) {
  return ["-hide_banner", "-loglevel", "error", "-i", file, "-vn", "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "2", "-ar", String(sampleRate), "pipe:1"];
}

/** Parse ffmpeg `-f framemd5` output → array of md5 per frame (stream 0). */
export function parseFrameMd5(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length >= 6 && parts[0] === "0") out.push(parts[5]);
  }
  return out;
}

/** Parse ffmpeg psnr filter stats_file → per-frame psnr_avg (Infinity for identical). */
export function parsePsnrStats(text) {
  const out = [];
  for (const line of String(text).split("\n")) {
    const m = /psnr_avg:(\S+)/.exec(line);
    if (!m) continue;
    out.push(m[1] === "inf" ? Infinity : Number(m[1]));
  }
  return out;
}

/** Compare two framemd5 lists + psnr list → verdict. */
export function compareRuns(a, b, psnr, minPsnr) {
  const n = Math.min(a.length, b.length);
  let identical = 0;
  const differing = [];
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) identical++;
    else differing.push(i);
  }
  let worst = Infinity;
  let worstFrame = -1;
  for (const i of differing) {
    const p = psnr[i] ?? -Infinity;
    if (p < worst) { worst = p; worstFrame = i; }
  }
  const lengthMismatch = a.length !== b.length;
  const verdict = lengthMismatch ? "FAIL" : differing.length === 0 ? "IDENTICAL" : worst >= minPsnr ? "NEAR-IDENTICAL" : "FAIL";
  return { frames: n, identical, differing: differing.length, worstPsnr: differing.length ? worst : Infinity, worstFrame, lengthMismatch, verdict };
}

/** Human duration. */
export function fmtDuration(s) {
  if (!Number.isFinite(s)) return "?";
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}m` : m ? `${m}m${String(sec).padStart(2, "0")}s` : `${sec}s`;
}
