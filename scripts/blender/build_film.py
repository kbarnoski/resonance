"""Resonance cinematic films in Blender (headless).

  Blender -b --factory-startup -P scripts/blender/build_film.py -- \
      --bundle=~/Documents/Resonance/unreal-bundles/yellow-bird \
      --cut=scripts/blender/cuts/yellow-bird.json \
      --out=~/Documents/Resonance/films/yellow-bird \
      [--res=1920x1080|3840x2160] [--fps=60] [--preview] [--samples=N]
      [--range=a:b]          film seconds to render (default: all)
      [--stills=t1,t2,...]   render single frames (film seconds) as PNGs and stop
      [--chunk=300]          frames per encoded chunk (resumable)
      [--engine=eevee|cycles] [--name=<file stem>] [--keep-frames]

Everything is built procedurally from the bundle (curves.csv, events.json,
palette.json, images/, audio/) and the cut JSON. See docs/blender-films.md.
"""
import json
import os
import shutil
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from resonance_film.timeline import Bundle, load_cut  # noqa: E402
from resonance_film.director import Director  # noqa: E402

FFMPEG = os.path.join(os.path.dirname(os.path.dirname(HERE)), "node_modules", "ffmpeg-static", "ffmpeg")
if not os.path.exists(FFMPEG):
    FFMPEG = "/Users/karelbarnoski/my-app/node_modules/ffmpeg-static/ffmpeg"


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    a = {}
    for x in argv:
        if x.startswith("--"):
            k, _, v = x[2:].partition("=")
            a[k] = v if v else True
    return a


def log(*m):
    print("[film]", *m, flush=True)


def run(cmd):
    log(" ".join(str(c) for c in cmd[:6]), "...")
    r = subprocess.run(["nice", "-n", "10"] + [str(c) for c in cmd], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-3000:])
    return r


def build_audio(tl, bundle, out_path, fade_in, fade_out):
    """The music edit: segments joined by equal-power (qsin) crossfades, eased in/out with the picture."""
    segs = tl.segs
    parts = []
    for k, s in enumerate(segs):
        parts.append(f"[0:a]atrim=start={s['a']:.4f}:end={s['b']:.4f},asetpts=PTS-STARTPTS[s{k}]")
    cur = "s0"
    for k in range(1, len(segs)):
        nxt = f"m{k}"
        parts.append(f"[{cur}][s{k}]acrossfade=d={segs[k]['x']:.4f}:c1=qsin:c2=qsin[{nxt}]")
        cur = nxt
    dur = tl.duration
    # the audio rides the picture's master fade (gentler: it never starts on silence-cut)
    parts.append(f"[{cur}]afade=t=in:st=0:d={min(1.0, fade_in):.3f},afade=t=out:st={dur - fade_out:.4f}:d={fade_out:.3f},"
                 f"atrim=end={dur:.4f}[aout]")
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", bundle.audio_wav(),
         "-filter_complex", ";".join(parts), "-map", "[aout]", "-c:a", "pcm_s24le", "-ar", "48000", out_path])


def encode_chunk(frames_dir, start, count, fps, out_path, crf):
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-framerate", fps, "-start_number", start,
         "-i", os.path.join(frames_dir, "f_%06d.png"), "-frames:v", count,
         "-c:v", "libx265", "-preset", "medium", "-crf", crf, "-pix_fmt", "yuv420p10le",
         "-x265-params", "aq-mode=3:no-sao=1:log-level=error", "-tag:v", "hvc1",
         "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
         out_path])


def main():
    a = parse_args()
    import bpy  # noqa: F401  (Blender only)
    from resonance_film.scene import FilmScene, load_rgba

    bundle = Bundle(a["bundle"])
    cut = load_cut(a["cut"])
    preview = bool(a.get("preview"))
    res = tuple(int(x) for x in str(a.get("res", "640x360" if preview else "1920x1080")).split("x"))
    fps = int(a.get("fps", 30 if preview else 60))
    samples = int(a.get("samples", 8 if preview else 48))
    out = os.path.abspath(os.path.expanduser(a.get("out", f"~/Documents/Resonance/films/{bundle.slug}")))
    os.makedirs(out, exist_ok=True)
    engine = "CYCLES" if a.get("engine") == "cycles" else "BLENDER_EEVEE_NEXT"
    name = a.get("name") or f"{bundle.slug}-{cut.get('name', 'cut')}-{res[1]}p{fps}"

    cache = {}

    def image_loader(rel):
        if rel not in cache:
            cache[rel] = load_rgba(bundle.path(rel))
        return cache[rel]

    t0 = time.time()
    d = Director(bundle, cut, fps, res, image_loader)
    tl = d.tl
    log(f"cut '{cut.get('name')}' {tl.duration:.2f}s = {tl.n} frames @ {fps} | motes {d.n_motes} | plates {len(d.plates)}")
    log("segments:", [(round(s['a'], 2), round(s['b'], 2), round(s['F'], 2)) for s in tl.segs])
    fs = FilmScene(d, res, samples=samples, preview=preview, engine=engine)
    log(f"scene built in {time.time() - t0:.1f}s")

    if a.get("stills"):
        sdir = os.path.join(out, "stills")
        os.makedirs(sdir, exist_ok=True)
        for x in str(a["stills"]).split(","):
            ts = float(x)
            i = min(tl.n - 1, int(round(ts * fps)))
            fs.apply(d.frame(i))
            p = os.path.join(sdir, f"{name}_t{ts:07.2f}.png")
            t1 = time.time()
            fs.render(p)
            log(f"still {ts:.2f}s -> {p} ({time.time() - t1:.2f}s)")
        if a.get("save-blend"):
            bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f"{name}.blend"))
        return

    lo, hi = 0, tl.n
    if a.get("range"):
        r0, r1 = str(a["range"]).split(":")
        lo = max(0, int(round(float(r0) * fps)))
        hi = min(tl.n, int(round(float(r1) * fps)))
        name = f"{name}_{float(r0):.1f}-{float(r1):.1f}"
    chunk = int(a.get("chunk", 300))
    crf = str(a.get("crf", 14))
    work = os.path.join(out, f".work-{name}")
    frames_dir = os.path.join(work, "frames")
    os.makedirs(frames_dir, exist_ok=True)
    chunks = []
    t_render = time.time()
    rendered = 0
    for c0 in range(lo, hi, chunk):
        c1 = min(hi, c0 + chunk)
        cpath = os.path.join(work, f"chunk_{c0:06d}.mp4")
        chunks.append(cpath)
        if os.path.exists(cpath):
            log(f"chunk {c0}-{c1} exists, skipping")
            continue
        for i in range(c0, c1):
            p = os.path.join(frames_dir, f"f_{i:06d}.png")
            if os.path.exists(p):
                continue
            fs.apply(d.frame(i))
            fs.render(p)
            rendered += 1
            if rendered % 30 == 0:
                el = time.time() - t_render
                log(f"frame {i}/{hi} | {el / rendered:.2f}s/frame | elapsed {el / 60:.1f} min")
        encode_chunk(frames_dir, c0, c1 - c0, fps, cpath, crf)
        if not a.get("keep-frames"):
            for i in range(c0, c1):
                try:
                    os.remove(os.path.join(frames_dir, f"f_{i:06d}.png"))
                except FileNotFoundError:
                    pass
    render_sec = time.time() - t_render
    # concat + the music edit
    lst = os.path.join(work, "chunks.txt")
    with open(lst, "w") as f:
        for c in chunks:
            f.write(f"file '{c}'\n")
    wav = os.path.join(work, "audio.wav")
    build_audio(tl, bundle, wav, d.fade_in, d.fade_out)
    final = os.path.join(out, f"{name}.mp4")
    a_start = lo / fps
    a_dur = (hi - lo) / fps
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst,
         "-ss", f"{a_start:.4f}", "-t", f"{a_dur:.4f}", "-i", wav,
         "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k",
         "-movflags", "+faststart", "-shortest", final])
    meta = {"name": name, "bundle": bundle.dir, "cut": os.path.abspath(a["cut"]), "res": res, "fps": fps,
            "samples": samples, "frames": hi - lo, "render_seconds": round(render_sec, 1),
            "sec_per_frame": round(render_sec / max(1, rendered), 3), "segments": tl.segs,
            "duration": tl.duration}
    with open(os.path.join(out, f"{name}.json"), "w") as f:
        json.dump(meta, f, indent=1)
    if not a.get("keep-frames"):
        shutil.rmtree(work, ignore_errors=True)
    log(f"DONE {final} | render {render_sec / 60:.1f} min ({meta['sec_per_frame']} s/frame)")


if __name__ == "__main__":
    main()
