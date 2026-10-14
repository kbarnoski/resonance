import { describe, it, expect } from "vitest";
import {
  parseArgs, buildUrl, planFrames, onGrid, defaultOut, encodeArgs, muxArgs, decodeArgs,
  parseFrameMd5, parsePsnrStats, compareRuns, fmtDuration, DEFAULTS,
} from "./plan.mjs";

describe("export CLI parsing", () => {
  it("defaults: lab port 3100, 4K, 60 fps, h264", () => {
    const { opts, errors } = parseArgs(["--journey=ghost"]);
    expect(errors).toEqual([]);
    expect(opts).toMatchObject({ journey: "ghost", port: 3100, res: "3840x2160", fps: 60, codec: "h264", from: 0, to: null, set: "tramokyo-mix" });
  });

  it("never defaults to the kiosk and refuses --port=3000", () => {
    expect(DEFAULTS.port).not.toBe(3000);
    const { errors } = parseArgs(["--journey=ghost", "--port=3000"]);
    expect(errors.join(" ")).toMatch(/LIVE KIOSK/);
    expect(parseArgs(["--journey=ghost", "--port=3000", "--i-know-3000-is-the-live-kiosk"]).errors).toEqual([]);
  });

  it("parses numbers, booleans, --to=end and the full option set", () => {
    const { opts, errors } = parseArgs(["--journey=x", "--from=10", "--to=70.5", "--fps=30", "--codec=prores", "--prores=422", "--headed", "--keep-intermediate", "--settle-ms=2000", "--params=a=1&b=2"]);
    expect(errors).toEqual([]);
    expect(opts).toMatchObject({ from: 10, to: 70.5, fps: 30, codec: "prores", prores: "422", headed: true, keepIntermediate: true, settleMs: 2000, extraParams: "a=1&b=2" });
    expect(parseArgs(["--journey=x", "--to=end"]).opts.to).toBe(null);
  });

  it("fails loudly on bad input", () => {
    const bad = (args, re) => expect(parseArgs(args).errors.join(" | ")).toMatch(re);
    bad([], /--journey/);
    bad(["--journey=x", "--res=4k"], /WxH/);
    bad(["--journey=x", "--res=3840x2160", "--dpr=7"], /divisible/);
    bad(["--journey=x", "--from=10", "--to=5"], /greater/);
    bad(["--journey=x", "--codec=vp9"], /codec/);
    bad(["--journey=x", "--bogus=1"], /unknown option/);
    bad(["--journey=x", "--fps=abc"], /not a number/);
    bad(["--journey=x", "positional"], /unexpected/);
  });

  it("builds the installation URL on the lab with the export gate", () => {
    const { opts } = parseArgs(["--journey=ghost"]);
    const u = new URL(buildUrl(opts));
    expect(u.host).toBe("localhost:3100");
    expect(u.pathname).toBe("/room/installation");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ loop: "1", start: "ghost@tramokyo-mix", tier: "high", lab: "1", export: "1", fpscap: "0" });
    const plain = new URL(buildUrl({ ...opts, set: "none", extraParams: "cine=1" }));
    expect(plain.searchParams.get("start")).toBe("ghost");
    expect(plain.searchParams.get("cine")).toBe("1");
  });
});

describe("frame plan", () => {
  it("frames on the 1/fps grid of track time", () => {
    const p = planFrames({ from: 10, to: 13, fps: 60, duration: 200 });
    expect(p).toMatchObject({ startFrame: 600, endFrame: 780, count: 180, startTime: 10, durationS: 3 });
    expect(p.timeOf(0)).toBe(10);
    expect(p.timeOf(179)).toBeCloseTo(12.9833333, 6);
  });

  it("to=null → end of track; clamps past the end; rounds from to the grid", () => {
    expect(planFrames({ from: 0, to: null, fps: 60, duration: 10.5 }).count).toBe(630);
    expect(planFrames({ from: 0, to: 99, fps: 60, duration: 2 }).count).toBe(120);
    expect(planFrames({ from: 1.009, to: 2, fps: 60, duration: 5 }).startFrame).toBe(61);
    expect(() => planFrames({ from: 5, to: null, fps: 60, duration: 5 })).toThrow(/empty/);
  });

  it("onGrid tolerates a quarter frame", () => {
    expect(onGrid(1 + 1 / 300, 1, 60)).toBe(true);
    expect(onGrid(1 + 1 / 100, 1, 60)).toBe(false);
  });

  it("default output name", () => {
    expect(defaultOut({ ...DEFAULTS, journey: "ghost", from: 0, to: 60 })).toBe("exports/ghost-0-60-3840x2160-60fps.mp4");
    expect(defaultOut({ ...DEFAULTS, journey: "ghost", codec: "prores" })).toMatch(/end-3840x2160-60fps\.mov$/);
  });
});

describe("ffmpeg arguments", () => {
  const base = { ...DEFAULTS, journey: "x" };
  it("h264: PNG pipe in, x264 high, bt709 tags", () => {
    const a = encodeArgs({ ...base, capture: "png" }, { width: 3840, height: 2160, fps: 60, durationS: 10, out: "o.mkv" });
    const s = a.join(" ");
    expect(s).toMatch(/-f image2pipe -framerate 60 -c:v png -i pipe:0/);
    expect(s).toMatch(/libx264 .*-crf 14/);
    expect(s).toMatch(/format=yuv420p/);
    expect(s).toMatch(/-colorspace bt709/);
    expect(a[a.length - 1]).toBe("o.mkv");
  });

  it("prores: prores_ks 422 HQ (profile 3) / 422 (profile 2), 10-bit 4:2:2", () => {
    const hq = encodeArgs({ ...base, codec: "prores" }, { width: 3840, height: 2160, fps: 60, durationS: 10, out: "o.mkv" }).join(" ");
    expect(hq).toMatch(/prores_ks -profile:v 3/);
    expect(hq).toMatch(/yuv422p10le/);
    expect(encodeArgs({ ...base, codec: "prores", prores: "422" }, { width: 3840, height: 2160, fps: 60, durationS: 10, out: "o" }).join(" ")).toMatch(/-profile:v 2/);
  });

  it("fades and the lossless verify path", () => {
    const f = encodeArgs({ ...base, fade: 1 }, { width: 8, height: 8, fps: 60, durationS: 10, out: "o" }).join(" ");
    expect(f).toMatch(/fade=t=in:st=0:d=1,fade=t=out:st=9\.000000:d=1/);
    expect(encodeArgs(base, { width: 8, height: 8, fps: 60, durationS: 1, out: "o", lossless: true }).join(" ")).toMatch(/ffv1 .*bgr0/);
    expect(encodeArgs({ ...base, capture: "jpeg" }, { width: 8, height: 8, fps: 60, durationS: 1, out: "o" }).join(" ")).toMatch(/-c:v mjpeg -i pipe:0/);
  });

  it("mux cuts the track at the first frame's time for the exact duration", () => {
    const s = muxArgs(base, { video: "v.mkv", audio: "a.m4a", audioStart: 12.5, durationS: 3, out: "o.mp4" }).join(" ");
    expect(s).toMatch(/-i v\.mkv -ss 12\.500000 -t 3\.000000 -i a\.m4a/);
    expect(s).toMatch(/-c:v copy/);
    expect(s).toMatch(/-c:a aac/);
    expect(muxArgs({ ...base, codec: "prores", fade: 0.5 }, { video: "v", audio: "a", audioStart: 0, durationS: 3, out: "o.mov" }).join(" ")).toMatch(/afade=t=in.*pcm_s24le/);
  });

  it("decode to float32 stereo at the context rate", () => {
    expect(decodeArgs("t.m4a", 44100).join(" ")).toMatch(/-f f32le -acodec pcm_f32le -ac 2 -ar 44100 pipe:1/);
  });
});

describe("determinism verdict", () => {
  it("parses framemd5 and psnr stats", () => {
    const md5 = "#format: frame checksums\n#tb 0: 1/60\n0,          0,          0,        1, 33177600, abc\n0,          1,          1,        1, 33177600, def\n";
    expect(parseFrameMd5(md5)).toEqual(["abc", "def"]);
    expect(parsePsnrStats("n:1 mse_avg:0.00 psnr_avg:inf\nn:2 mse_avg:0.01 psnr_avg:58.20\n")).toEqual([Infinity, 58.2]);
  });

  it("IDENTICAL / NEAR-IDENTICAL / FAIL", () => {
    expect(compareRuns(["a", "b"], ["a", "b"], [], 50).verdict).toBe("IDENTICAL");
    const near = compareRuns(["a", "b"], ["a", "x"], [Infinity, 55], 50);
    expect(near).toMatchObject({ verdict: "NEAR-IDENTICAL", differing: 1, worstPsnr: 55, worstFrame: 1 });
    expect(compareRuns(["a", "b"], ["a", "x"], [Infinity, 30], 50).verdict).toBe("FAIL");
    expect(compareRuns(["a"], ["a", "b"], [], 50).verdict).toBe("FAIL");
  });

  it("fmtDuration", () => {
    expect(fmtDuration(42)).toBe("42s");
    expect(fmtDuration(125)).toBe("2m05s");
    expect(fmtDuration(7322)).toBe("2h02m");
  });
});
