"""Bundle loading, the music edit (film time <-> source time), curve blending,
clocks and easing. Pure numpy (no bpy) so it can be tested with system python.

Film time  = time in the rendered film (0 .. duration).
Source time = time in the bundle's track (curves.csv / events.json).

A cut is a list of source segments joined by equal-power audio crossfades.
During a crossfade the curves blend linearly (they are already slewed), so
everything they drive stays continuous across the music edit.
"""
import csv
import json
import math
import os

import numpy as np


# ── easing ──────────────────────────────────────────────────────────────────

def smoothstep(e0, e1, x):
    u = np.clip((np.asarray(x, dtype=float) - e0) / max(1e-9, (e1 - e0)), 0.0, 1.0)
    return u * u * (3.0 - 2.0 * u)


def smootherstep(e0, e1, x):
    u = np.clip((np.asarray(x, dtype=float) - e0) / max(1e-9, (e1 - e0)), 0.0, 1.0)
    return u * u * u * (u * (u * 6.0 - 15.0) + 10.0)


def envelope(t, t_in, t_out, fade_in, fade_out):
    """1 inside [t_in + fade_in, t_out - fade_out], eased (smootherstep) to 0 at t_in / t_out."""
    return smootherstep(t_in, t_in + fade_in, t) * (1.0 - smootherstep(t_out - fade_out, t_out, t))


def pchip(xk, yk, x):
    """Monotone cubic (Fritsch-Carlson) through keys with ZERO end slopes:
    no overshoot, starts and ends at rest. yk may be (K,) or (K, D)."""
    xk = np.asarray(xk, dtype=float)
    yk = np.asarray(yk, dtype=float)
    x = np.asarray(x, dtype=float)
    if yk.ndim == 1:
        return _pchip1(xk, yk, x)
    return np.stack([_pchip1(xk, yk[:, j], x) for j in range(yk.shape[1])], axis=-1)


def _pchip1(xk, yk, x):
    n = len(xk)
    if n == 1:
        return np.full_like(x, yk[0], dtype=float)
    h = np.diff(xk)
    d = np.diff(yk) / h
    m = np.zeros(n)
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1 = 2 * h[i] + h[i - 1]
            w2 = h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    xc = np.clip(x, xk[0], xk[-1])
    i = np.clip(np.searchsorted(xk, xc, side="right") - 1, 0, n - 2)
    hh = h[i]
    s = (xc - xk[i]) / hh
    h00 = (1 + 2 * s) * (1 - s) ** 2
    h10 = s * (1 - s) ** 2
    h01 = s * s * (3 - 2 * s)
    h11 = s * s * (s - 1)
    return h00 * yk[i] + h10 * hh * m[i] + h01 * yk[i + 1] + h11 * hh * m[i + 1]


def hex_rgb(h):
    """'#rrggbb' -> linear RGB (Blender emission colours are linear)."""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def luminance(rgb):
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]


# ── the bundle ──────────────────────────────────────────────────────────────

class Bundle:
    def __init__(self, path):
        self.dir = os.path.abspath(os.path.expanduser(path))
        self.events = json.load(open(os.path.join(self.dir, "events.json")))
        self.palette = json.load(open(os.path.join(self.dir, "palette.json")))
        self.slug = self.events["journey"]["slug"]
        self.duration = float(self.events["duration"])
        with open(os.path.join(self.dir, "curves.csv")) as f:
            rows = list(csv.reader(f))
        header = rows[0]
        data = np.array([[float(v) for v in r[1:]] for r in rows[1:]], dtype=float)
        self.cols = {name: data[:, i] for i, name in enumerate(header[1:])}
        self.t = self.cols["Time"]
        self.rate = 1.0 / (self.t[1] - self.t[0])

    def curve(self, name, src_t):
        return np.interp(src_t, self.t, self.cols[name])

    def path(self, rel):
        return os.path.join(self.dir, rel)

    def audio_wav(self):
        return os.path.join(self.dir, "audio", f"{self.slug}.wav")

    # palette ---------------------------------------------------------------
    def phase_colors(self):
        """Per phase: mote colour (the brightest sampled image colour, lifted),
        light colour (theme glow) and fog tint (the image key, very dark)."""
        out = []
        for ph in self.palette["phases"]:
            cols = [hex_rgb(c["hex"]) for c in ph["image"]["colors"]]
            mote = max(cols, key=luminance)
            # lift the mote colour to a luminous version of the same hue
            peak = max(mote) or 1.0
            mote = [c / peak for c in mote]
            glow = hex_rgb(ph["theme"]["glow"]["hex"])
            key = hex_rgb(ph["image"]["key"]["hex"])
            out.append({"start": ph["start"], "end": ph["end"], "mote": mote, "glow": glow, "key": key})
        return out


# ── the cut ─────────────────────────────────────────────────────────────────

class Timeline:
    """Maps film frames to (weighted) source times and evaluates curves."""

    def __init__(self, bundle, cut, fps):
        self.bundle = bundle
        self.cut = cut
        self.fps = fps
        segs = []
        prev_end = 0.0
        for k, s in enumerate(cut["segments"]):
            a, b = float(s["src"][0]), float(s["src"][1])
            b = min(b, bundle.duration)
            x = float(s.get("xfade", 0.0)) if k > 0 else 0.0
            F = 0.0 if k == 0 else prev_end - x
            segs.append({"a": a, "b": b, "F": F, "x": x, "len": b - a})
            prev_end = F + (b - a)
        self.segs = segs
        self.duration = prev_end
        self.n = int(math.floor(self.duration * fps + 1e-6))
        self.t = np.arange(self.n) / fps
        K = len(segs)
        W = np.zeros((K, self.n))
        S = np.zeros((K, self.n))
        for k, s in enumerate(segs):
            local = self.t - s["F"]
            inside = (local >= -1e-9) & (local <= s["len"] + 1e-9)
            w = inside.astype(float)
            if k > 0 and s["x"] > 0:
                w *= np.clip(local / s["x"], 0, 1)
            if k + 1 < K and segs[k + 1]["x"] > 0:
                w *= np.clip((s["len"] - local) / segs[k + 1]["x"], 0, 1)
            W[k] = w
            S[k] = np.clip(s["a"] + local, s["a"], s["b"])
        tot = W.sum(axis=0)
        tot[tot == 0] = 1
        self.W = W / tot
        self.S = S
        self._cache = {}

    def curve(self, name):
        if name not in self._cache:
            v = np.zeros(self.n)
            for k in range(len(self.segs)):
                v += self.W[k] * self.bundle.curve(name, self.S[k])
            self._cache[name] = v
        return self._cache[name]

    def src_primary(self):
        """The dominant source time per frame (for phase look-ups)."""
        k = np.argmax(self.W, axis=0)
        return self.S[k, np.arange(self.n)]

    def film_time(self, src):
        """Film time of a source time (first segment that contains it), or None."""
        for s in self.segs:
            if s["a"] - 1e-6 <= src <= s["b"] + 1e-6:
                return s["F"] + (src - s["a"])
        return None

    def resolve(self, v):
        """Authoring helper: a number is film time; 'src:41' is the film time of source 41 s;
        'end' / 'end-4' is relative to the film's end."""
        if isinstance(v, (int, float)):
            return float(v)
        v = str(v).strip()
        if v.startswith("src:"):
            ft = self.film_time(float(v[4:]))
            if ft is None:
                raise ValueError(f"source time {v} is not in the cut")
            return ft
        if v.startswith("end"):
            rest = v[3:]
            return self.duration + (float(rest) if rest else 0.0)
        return float(v)

    def film_events(self, src_times):
        out = []
        for st in src_times:
            ft = self.film_time(st)
            if ft is not None:
                out.append(ft)
        return out

    def onsets(self, min_strength=0.0):
        """Onsets that are audible in the film: (film_t, strength * segment weight, pitch)."""
        out = []
        for o in self.bundle.events["onsets"]:
            if o["strength"] < min_strength:
                continue
            for k, s in enumerate(self.segs):
                if s["a"] <= o["t"] <= s["b"]:
                    ft = s["F"] + (o["t"] - s["a"])
                    i = min(self.n - 1, max(0, int(round(ft * self.fps))))
                    w = self.W[k, i]
                    if w > 0.25:
                        out.append((ft, o["strength"] * w, o["pitch"]))
        out.sort()
        return out

    def clock(self, rate):
        """Integral of a per-frame rate (units per second) -> per-frame phase."""
        rate = np.asarray(rate, dtype=float)
        return np.concatenate([[0.0], np.cumsum(rate[:-1])]) / self.fps

    def palette_track(self, smooth_sec=4.0):
        """Per-frame palette colours from the source phase, eased over >= smooth_sec."""
        phases = self.bundle.phase_colors()
        src = self.src_primary()
        idx = np.zeros(self.n, dtype=int)
        for i, ph in enumerate(phases):
            idx[src >= ph["start"] - 1e-6] = i
        out = {}
        for key in ("mote", "glow", "key"):
            raw = np.array([phases[j][key] for j in idx])
            out[key] = gaussian_smooth(raw, sigma=smooth_sec * self.fps / 2.5)
        return out


def gaussian_smooth(x, sigma):
    """Edge-padded gaussian smoothing along axis 0."""
    if sigma <= 0:
        return x
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    pad = np.concatenate([np.repeat(x[:1], r, axis=0), x, np.repeat(x[-1:], r, axis=0)], axis=0)
    if x.ndim == 1:
        return np.convolve(pad, k, mode="valid")
    return np.stack([np.convolve(pad[:, j], k, mode="valid") for j in range(x.shape[1])], axis=1)


def load_cut(path):
    with open(path) as f:
        return json.load(f)
