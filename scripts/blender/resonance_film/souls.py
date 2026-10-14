"""The Resonance souls as stateless particle fields (numpy, no bpy).

Every soul returns, for one film frame, CAMERA-SPACE mote positions (x right,
y up, z = -depth), a radius (m), an alpha and a linear RGB colour. Positions
are pure functions of film time + integrated clocks, so any frame renders on
its own (chunked, resumable renders) and identically every time.

The music moves things, never their brightness (Karel's motion law):
  bass / mid      -> flow speed, turbulence, swell of spread  (motion)
  onsets          -> gentle local swirls, firefly darts       (motion)
  swell / breath  -> spread, density                          (motion)
Alpha only changes through presence envelopes eased over >= 2 s.
"""
import math

import numpy as np

from .timeline import envelope, pchip, smootherstep, smoothstep, hex_rgb


class FrameCtx:
    """What a soul may read for one frame."""

    def __init__(self, **kw):
        self.__dict__.update(kw)
    # i, t, tanH, tanV, travel, focus, cv (dict curve->float), clk (dict clock->float),
    # pal (dict 'mote','glow' -> rgb), swirls (list of (cx, cy, angle, radius))


def apply_swirls(p, swirls, gain=1.0):
    """Screen-space swirls: each onset turns the field gently about a point on
    screen (rises ~0.6 s, settles over ~2.5 s). p is (N,3) camera space."""
    if not swirls or gain <= 0:
        return p
    d = np.maximum(0.05, -p[:, 2])
    qx = p[:, 0] / d
    qy = p[:, 1] / d
    for cx, cy, ang, rad in swirls:
        dx = qx - cx
        dy = qy - cy
        w = np.exp(-(dx * dx + dy * dy) / (rad * rad)) * ang * gain
        c = np.cos(w)
        s = np.sin(w)
        qx = cx + dx * c - dy * s
        qy = cy + dx * s + dy * c
    out = p.copy()
    out[:, 0] = qx * d
    out[:, 1] = qy * d
    return out


class Soul:
    def __init__(self, spec, seed, tl):
        self.spec = spec
        self.kind = spec["kind"]
        self.count = int(spec.get("count", 1000))
        self.rng = np.random.default_rng(seed)
        self.t_in = tl.resolve(spec.get("in", 0))
        self.t_out = tl.resolve(spec.get("out", "end"))
        self.fade_in = float(spec.get("fade_in", spec.get("fade", 3.0)))
        self.fade_out = float(spec.get("fade_out", spec.get("fade", 3.0)))
        self.size = float(spec.get("size", 0.012))
        self.alpha = float(spec.get("alpha", 0.6))
        self.swirl = float(spec.get("swirl", 1.0))
        col = spec.get("color", "phase")
        self.color_mode = col
        n = self.count
        self.size_var = self.rng.uniform(0.6, 1.4, n)
        self.alpha_var = self.rng.uniform(0.45, 1.0, n)

    def presence(self, t):
        return float(envelope(t, self.t_in, self.t_out, self.fade_in, self.fade_out))

    def colors(self, ctx):
        c = self.color_mode
        if c == "phase":
            rgb = ctx.pal["mote"]
        elif c == "glow":
            rgb = ctx.pal["glow"]
        elif isinstance(c, str) and c.startswith("#"):
            rgb = hex_rgb(c)
        else:
            rgb = c
        return np.tile(np.asarray(rgb, dtype=float), (self.count, 1))

    def prepare(self, tl, director):
        pass

    def frame(self, ctx):
        raise NotImplementedError


class DriftSoul(Soul):
    """Pollen, dust, fireflies, petals, star dust: motes anchored in the world
    around the camera path (true parallax as the camera dollies), wrapping
    softly (fade) at the near/far and top/bottom edges of their box."""

    def __init__(self, spec, seed, tl):
        super().__init__(spec, seed, tl)
        n = self.count
        r = self.rng
        self.near = float(spec.get("near", 1.5))
        self.far = float(spec.get("far", 14.0))
        sx, sy = spec.get("spread", [1.2, 1.0])
        mid = 0.5 * (self.near + self.far)
        self.hx = sx * mid * tl.tanH
        self.hy = sy * mid * tl.tanV
        self.x0 = r.uniform(-1, 1, n) * self.hx
        self.y0 = r.uniform(-1, 1, n) * self.hy
        self.d0 = r.uniform(0, 1, n)
        self.rise = float(spec.get("rise", 0.02))          # m per flow unit (negative = fall)
        self.wander = float(spec.get("wander", 0.12))      # m
        self.flutter = float(spec.get("flutter", 0.0))     # m, petals
        self.fwd = float(spec.get("forward", 0.0))         # m per flow unit toward camera
        self.freq = r.uniform(0.25, 0.7, (n, 3))
        self.ph = r.uniform(0, 2 * math.pi, (n, 3))
        self.dart = float(spec.get("dart", 0.0))
        self.dart_dirs = None
        self.lift = float(spec.get("lift", 0.0))           # m, shifts the whole field up/down

    def prepare(self, tl, director):
        if self.dart > 0:
            ons = [o for o in director.onsets if o[2] >= float(self.spec.get("dart_pitch", 0.45))]
            self.dart_t = np.array([o[0] for o in ons]) if ons else np.zeros(0)
            self.dart_s = np.array([o[1] for o in ons]) if ons else np.zeros(0)
            k = len(self.dart_t)
            d = self.rng.normal(size=(self.count, max(1, k), 3))
            d[..., 2] *= 0.3
            d /= np.linalg.norm(d, axis=2, keepdims=True) + 1e-9
            self.dart_dirs = d

    def frame(self, ctx):
        n = self.count
        flow = ctx.clk["flow"]
        L = self.far - self.near
        depth = self.near + np.mod(self.d0 * L - ctx.travel - self.fwd * flow, L)
        ybox = 2 * self.hy
        y = -self.hy + np.mod(self.y0 + self.hy + self.rise * flow, ybox)
        w = self.wander * (0.7 + 0.6 * ctx.cv["MidKinetic"])
        x = self.x0 + w * np.sin(self.freq[:, 0] * flow + self.ph[:, 0])
        y = y + w * 0.6 * np.sin(self.freq[:, 1] * flow + self.ph[:, 1]) + self.lift
        z = -depth + w * 0.5 * np.sin(self.freq[:, 2] * flow + self.ph[:, 2])
        if self.flutter > 0:
            x = x + self.flutter * np.sin(2.2 * self.freq[:, 1] * ctx.t + self.ph[:, 2])
        p = np.stack([x, y, z], axis=1)
        if self.dart_dirs is not None and len(self.dart_t):
            tau = ctx.t - self.dart_t
            act = (tau > 0) & (tau < 12)
            if act.any():
                g = smoothstep(0, 0.9, tau[act]) * np.exp(-np.maximum(tau[act], 0) / 3.0) * self.dart_s[act]
                p += self.dart * np.einsum("k,nkd->nd", g, self.dart_dirs[:, act, :])
        p = apply_swirls(p, ctx.swirls, self.swirl)
        # soft wrap: fade at the box edges so nothing pops
        a = smoothstep(self.near, self.near + 0.18 * L, depth) * (1 - smoothstep(self.far - 0.18 * L, self.far, depth))
        yy = (y - self.lift - (-self.hy)) / ybox
        a = a * smoothstep(0.0, 0.12, yy) * (1 - smoothstep(0.88, 1.0, yy))
        alpha = self.alpha * self.alpha_var * a * self.presence(ctx.t)
        size = self.size * self.size_var
        return p, size, alpha, self.colors(ctx)


class FlockSoul(Soul):
    """Murmuration: a flock of light folding through the dark. Its centre wanders
    on a STEADY clock (never the beat); it folds between a cloud and a ribbon;
    mids stir its turbulence, the phrase swell and breath open its spread."""

    def __init__(self, spec, seed, tl):
        super().__init__(spec, seed, tl)
        n = self.count
        r = self.rng
        self.depth = float(spec.get("depth", 7.0))
        self.center = spec.get("center", [0.0, 0.1])
        self.radii = np.array(spec.get("radii", [2.2, 0.8, 1.4]))
        self.wander = spec.get("wanderAmp", [0.25, 0.12])
        u = r.normal(size=(n, 3))
        u /= np.linalg.norm(u, axis=1, keepdims=True)
        rad = r.uniform(0, 1, n) ** 0.55
        self.p0 = u * rad[:, None] * self.radii
        xs = self.p0[:, 0] / self.radii[0]
        self.p1 = np.stack([
            self.p0[:, 0] * 1.35,
            self.radii[1] * 0.45 * np.sin(xs * 2.4 + 0.6) + self.p0[:, 1] * 0.18,
            self.p0[:, 2] * 0.5 + self.radii[2] * 0.35 * np.cos(xs * 1.7),
        ], axis=1)
        self.ph = r.uniform(0, 2 * math.pi, (n, 3))
        self.turb = float(spec.get("turbulence", 0.18))
        self.rot = float(spec.get("rotate", 0.08))
        self.fold_period = float(spec.get("foldPeriod", 38.0))
        tilt = math.radians(15)
        self.axis = np.array([math.sin(tilt), math.cos(tilt), 0.0])

    def frame(self, ctx):
        t = ctx.t
        flow = ctx.clk["flow"]
        fold = 0.5 - 0.5 * math.cos(2 * math.pi * t / self.fold_period)
        shape = self.p0 * (1 - fold) + self.p1 * fold
        spread = ctx.cv["SwellSize"] * (1 + 0.05 * ctx.cv["BreathPhase"]) * (1 + 0.08 * ctx.cv["Bass"])
        shape = shape * spread
        ang = self.rot * flow + 0.25 * ctx.cv["CurrentTension"]
        shape = rotate_axis(shape, self.axis, ang)
        amp = self.turb * (0.5 + 1.3 * ctx.cv["MidKinetic"])
        s = self.p0 / self.radii.max()
        shape = shape + amp * np.stack([
            np.sin(2.1 * s[:, 1] + 0.9 * flow + self.ph[:, 0]),
            np.sin(1.7 * s[:, 2] + 0.7 * flow + self.ph[:, 1]),
            np.sin(2.6 * s[:, 0] + 0.8 * flow + self.ph[:, 2]),
        ], axis=1)
        cx = (self.center[0] + self.wander[0] * math.sin(2 * math.pi * 0.03 * t)) * self.depth * ctx.tanH
        cy = (self.center[1] + self.wander[1] * math.sin(2 * math.pi * 0.05 * t + 1.0)) * self.depth * ctx.tanV
        p = shape.copy()
        p[:, 0] += cx
        p[:, 1] += cy
        p[:, 2] += -self.depth
        p = apply_swirls(p, ctx.swirls, self.swirl)
        alpha = self.alpha * self.alpha_var * self.presence(t)
        return p, self.size * self.size_var, alpha, self.colors(ctx)


class VortexSoul(Soul):
    """A slow spiral of motes (the peak soul): differential rotation on the
    flow clock, arms like the pack's galaxy stills; swell opens its radius."""

    def __init__(self, spec, seed, tl):
        super().__init__(spec, seed, tl)
        n = self.count
        r = self.rng
        self.depth = float(spec.get("depth", 8.0))
        self.center = spec.get("center", [0.0, 0.0])
        self.R = float(spec.get("radius", 3.0))
        arms = int(spec.get("arms", 3))
        self.rr = self.R * r.uniform(0.04, 1.0, n) ** 0.7
        arm = r.integers(0, arms, n)
        self.th0 = arm * 2 * math.pi / arms + 2.6 * self.rr / self.R + r.normal(0, 0.28, n)
        self.h = r.normal(0, 0.06 * self.R, n) * (1 - 0.6 * self.rr / self.R)
        self.speed = float(spec.get("speed", 0.22))
        self.tilt = math.radians(float(spec.get("tilt", 62)))

    def frame(self, ctx):
        flow = ctx.clk["flow"]
        k = self.rr / self.R
        th = self.th0 + self.speed * flow * (0.35 + 0.65 / (0.35 + k))
        rr = self.rr * ctx.cv["SwellSize"] * (1 + 0.04 * ctx.cv["Bass"])
        x = rr * np.cos(th)
        yd = rr * np.sin(th)
        h = self.h
        c, s = math.cos(self.tilt), math.sin(self.tilt)
        y = yd * c - h * s
        z = yd * s + h * c
        p = np.stack([
            x + self.center[0] * self.depth * ctx.tanH,
            y + self.center[1] * self.depth * ctx.tanV,
            z - self.depth,
        ], axis=1)
        p = apply_swirls(p, ctx.swirls, self.swirl)
        core = 0.55 + 0.45 * smoothstep(0.0, 0.25, k)  # the heart never brightens
        alpha = self.alpha * self.alpha_var * core * self.presence(ctx.t)
        return p, self.size * self.size_var, alpha, self.colors(ctx)


class EmblemSoul(Soul):
    """An image formed of motes (the kiosk's emblem moment). Optionally flies
    (the Yellow Bird's flap-bounding songbird, from the bundle's Flight/Wing
    curves). Release: 'scatter' (back into a drifting cloud) or 'fall'
    (petals falling from the formed image)."""

    def __init__(self, spec, seed, tl, image_loader):
        super().__init__(spec, seed, tl)
        n = self.count
        r = self.rng
        img = image_loader(spec["image"])  # HxWx4, row 0 = top, sRGB 0..1
        H, W = img.shape[:2]
        lum = 0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]
        thr = float(spec.get("threshold", 0.12))
        wgt = np.clip(lum - thr, 0, None) ** float(spec.get("gamma", 1.2))
        flat = wgt.ravel()
        flat = flat / flat.sum()
        idx = r.choice(flat.size, size=n, p=flat)
        py, px = np.divmod(idx, W)
        u = (px + r.uniform(0, 1, n)) / W
        v = (py + r.uniform(0, 1, n)) / H
        self.u, self.v = u, v
        self.q = np.stack([(u - 0.5) * (W / H), 0.5 - v], axis=1)
        srgb = img[py, px, :3]
        lin = np.where(srgb <= 0.04045, srgb / 12.92, ((srgb + 0.055) / 1.055) ** 2.4)
        # keep the picture's relative light (motes are already denser where it is bright)
        peak = max(1e-3, float(np.percentile(lin.max(axis=1), 95)))
        self.col = np.clip(lin / peak, 0, 1.2) ** 0.85 * float(spec.get("colorGain", 1.0))
        self.col_mix = float(spec.get("tint", 0.0))
        self.depth = float(spec.get("depth", 5.0))
        self.center = spec.get("center", [0.0, 0.0])
        self.S = float(spec.get("scale", 2.0))  # metres per image height
        self.scatter_r = float(spec.get("scatter", 2.5))
        sc = r.normal(size=(n, 3))
        sc /= np.linalg.norm(sc, axis=1, keepdims=True)
        self.scatter = sc * (r.uniform(0.2, 1.0, n) ** 0.5)[:, None] * self.scatter_r
        self.stagger = r.uniform(0, 1, n)
        self.ph = r.uniform(0, 2 * math.pi, (n, 3))
        self.freq = r.uniform(0.3, 0.8, (n, 3))
        self.fly = bool(spec.get("flight", False))
        self.release = spec.get("release", "scatter")
        self.fall_v = r.uniform(0.15, 0.65, n)
        self.alpha_var = r.uniform(0.6, 1.0, n)
        self.wingframe = None
        if self.fly:
            self.wingframe = wing_frame(spec["wing"], W / H)

    def prepare(self, tl, director):
        n = tl.n
        if "form" in self.spec and self.spec["form"] != "curve":
            keys = [(tl.resolve(a), b) for a, b in self.spec["form"]]
            form = pchip([k[0] for k in keys], [k[1] for k in keys], tl.t)
        else:
            form = tl.curve("EmblemForm").copy()
        vis = np.ones(n)
        pose = np.zeros((n, 4))  # x, y, scale, pitch
        pose[:, 2] = 1.0
        rel_t = np.full(n, -1.0)
        if self.fly:
            fa = tl.curve("FlightActive")
            fx, fy, fs, fp = (tl.curve(c) for c in ("FlightX", "FlightY", "FlightScale", "FlightPitch"))
            active = fa > 0.5
            held = None
            fe = None
            for i in range(n):
                if active[i]:
                    pose[i] = (fx[i], fy[i], fs[i], fp[i])
                    form[i] = 1.0
                    held = pose[i].copy()
                    fe = None
                elif held is not None:
                    if fe is None:
                        fe = tl.t[i]
                    pose[i] = held
                    vis[i] = 1.0 - smootherstep(fe, fe + 1.5, tl.t[i])
                    if vis[i] <= 0 and form[i] < 0.02:
                        held = None  # released; the next window forms afresh
                        vis[i] = 0.0
                    form[i] = 1.0
                    if vis[i] <= 0:
                        form[i] = 0.0
        if self.release == "fall":
            # the release starts where the formed image begins to let go
            peak_seen = False
            t_rel = None
            for i in range(n):
                if form[i] >= 0.985:
                    peak_seen = True
                    t_rel = None
                elif peak_seen and t_rel is None and form[i] < 0.985:
                    t_rel = tl.t[i]
                rel_t[i] = -1.0 if t_rel is None else tl.t[i] - t_rel
        self.form = np.clip(form, 0, 1)
        self.vis = vis
        self.pose = pose
        self.rel = rel_t
        self.wing_cols = {c: tl.curve(c) for c in ("WingRoot", "WingTip", "WingFlex", "WingFold", "WingSweep", "WingBob", "TailSpread")} if self.fly else None

    def frame(self, ctx):
        i = ctx.i
        t = ctx.t
        form = self.form[i]
        pres = self.presence(t) * self.vis[i]
        n = self.count
        if pres <= 0.0005 or (form <= 0.0005 and self.release != "fall"):
            return np.zeros((n, 3)), np.zeros(n), np.zeros(n), np.zeros((n, 3))
        q = self.q.copy()
        dz = np.zeros(n)
        proj = 1.0
        if self.fly:
            w = {k: v[i] for k, v in self.wing_cols.items()}
            dx, dy, dzz, proj = wing_displacement(q, self.wingframe, w)
            q[:, 0] += dx
            q[:, 1] += dy
            dz = dzz
        px, py, sc, pitch = self.pose[i]
        c, s = math.cos(pitch), math.sin(pitch)
        qx = q[:, 0] * c - q[:, 1] * s
        qy = q[:, 0] * s + q[:, 1] * c
        S = self.S * sc
        D = self.depth
        cx = (self.center[0] + px) * D * ctx.tanH
        cy = (self.center[1] + py) * D * ctx.tanV
        img = np.stack([cx + qx * S, cy + qy * S, -D + dz * S], axis=1)
        flow = ctx.clk["flow"]
        drift = 0.18 * np.stack([np.sin(self.freq[:, k] * flow + self.ph[:, k]) for k in range(3)], axis=1)
        cloud = np.array([cx, cy, -D]) + self.scatter * (1 + 0.1 * ctx.cv["BreathPhase"]) + drift
        if self.release == "fall" and self.rel[i] > 0:
            tau = self.rel[i]
            fall = img.copy()
            fall[:, 1] -= self.fall_v * tau + 0.012 * tau * tau
            spread = smoothstep(0, 3, tau)
            fall[:, 0] += (0.35 * np.sin(0.9 * tau * self.freq[:, 0] + self.ph[:, 0]) + 0.6 * np.sin(self.ph[:, 1]) * tau * 0.12) * spread
            fall[:, 2] += (0.2 * np.sin(0.7 * tau * self.freq[:, 2] + self.ph[:, 2]) + 0.4 * np.cos(self.ph[:, 0]) * tau * 0.1) * spread
            base = fall
            fade = 1.0 - smoothstep(2.5, 6.5, tau + 1.5 * self.stagger)
        else:
            base = cloud
            fade = 1.0
        f = smootherstep(0, 1, np.clip((form - 0.45 * self.stagger) / 0.55, 0, 1))
        # an arc on the way in (motes stream, they don't slide)
        arc = np.sin(math.pi * f)[:, None] * 0.25 * self.scatter_r * np.stack(
            [np.sin(self.ph[:, 0]), np.cos(self.ph[:, 1]), 0.3 * np.sin(self.ph[:, 2])], axis=1)
        p = base * (1 - f[:, None]) + img * f[:, None] + arc
        if not self.fly:
            p = apply_swirls(p, ctx.swirls, self.swirl * (1 - 0.8 * form))
        if self.release == "fall":
            a_unformed = 0.25 if self.rel[i] < 0 else 1.0
        else:
            a_unformed = 0.25
        alpha = self.alpha * self.alpha_var * (a_unformed + (1 - a_unformed) * f) * pres * fade
        alpha = alpha * (1 - f + f * proj)
        col = self.col
        if self.col_mix > 0:
            col = col * (1 - self.col_mix) + np.asarray(ctx.pal["mote"])[None, :] * self.col_mix
        return p, self.size * self.size_var, alpha, col


def rotate_axis(p, axis, ang):
    k = axis / np.linalg.norm(axis)
    c, s = math.cos(ang), math.sin(ang)
    return p * c + np.cross(k, p) * s + np.outer(p @ k, k) * (1 - c)


# ── the songbird's wing (a port of src/lib/particles/signature-flight.ts) ───

FLIGHT = {"FLEX": 0.55, "FLEX_SWEEP": 0.35, "SWEEP_FWD": 0.12, "FOLD_R": 0.12, "FOLD_A": 0.5,
          "TAIL_SPREAD": 0.6, "WRIST": 0.45}


def _ss(e0, e1, x):
    u = np.clip((x - e0) / (e1 - e0), 0, 1)
    return u * u * (3 - 2 * u)


def wing_frame(w, aspect=1.0):
    def toQ(p):
        return np.array([(p[0] - 0.5) * aspect, 0.5 - p[1]])
    h, a, b, t, tt = toQ(w["shoulder"]), toQ(w["head"]), toQ(w["tail"]), toQ(w["tip"]), toQ(w["tailTip"])
    ax = b - a
    ax /= np.linalg.norm(ax)
    nrm = np.array([-ax[1], ax[0]])
    if np.dot(t - h, nrm) < 0:
        nrm = -nrm
    rmax = max(0.05, float(np.dot(t - h, nrm)))
    tl = np.linalg.norm(tt - b) or 1.0
    return {"hinge": h, "axis": ax, "normal": nrm, "aMin": w["aMin"], "aMax": w["aMax"], "rMax": rmax,
            "soft": w["soft"], "tailBase": b, "tailDir": (tt - b) / tl, "tailLen": tl}


def wing_displacement(q, fr, w):
    """Vectorised wingDisplacement(): returns dx, dy (picture plane, y up) and dz (toward the viewer)."""
    rx = q[:, 0] - fr["hinge"][0]
    ry = q[:, 1] - fr["hinge"][1]
    a = rx * fr["axis"][0] + ry * fr["axis"][1]
    r = rx * fr["normal"][0] + ry * fr["normal"][1]
    inw = _ss(0, fr["soft"], r) * _ss(fr["aMin"] - 0.04, fr["aMin"], a) * (1 - _ss(fr["aMax"], fr["aMax"] + 0.04, a))
    hand = np.maximum(0, r - FLIGHT["WRIST"] * fr["rMax"])
    rr = r - hand * FLIGHT["FLEX"] * w["WingFlex"]
    aa = a + hand * FLIGHT["FLEX_SWEEP"] * w["WingFlex"] - FLIGHT["SWEEP_FWD"] * r * w["WingSweep"]
    rr = rr + (FLIGHT["FOLD_R"] * r - rr) * w["WingFold"]
    aa = aa + FLIGHT["FOLD_A"] * r * w["WingFold"]
    th = w["WingRoot"] + (w["WingTip"] - w["WingRoot"]) * _ss(0, 1, r / fr["rMax"])
    da = (aa - a) * inw
    dr = (rr * np.cos(th) - r) * inw
    dx = fr["axis"][0] * da + fr["normal"][0] * dr
    dy = fr["axis"][1] * da + fr["normal"][1] * dr
    dz = rr * np.sin(th) * inw
    # projected-area factor: a wing turned edge-on packs its motes together; dim
    # them by the same factor so the wing's light stays constant (no 2 Hz hotspot)
    proj = 1.0 - inw * (1.0 - np.maximum(0.3, np.abs(np.cos(th))))
    if w["TailSpread"] > 0:
        tx = q[:, 0] - fr["tailBase"][0]
        ty = q[:, 1] - fr["tailBase"][1]
        tt = (tx * fr["tailDir"][0] + ty * fr["tailDir"][1]) / fr["tailLen"]
        pp = -tx * fr["tailDir"][1] + ty * fr["tailDir"][0]
        wt = _ss(-0.05, 0.15, tt) * (1 - _ss(1.0, 1.15, tt)) * (1 - _ss(0.08, 0.14, np.abs(pp)))
        k = pp * FLIGHT["TAIL_SPREAD"] * w["TailSpread"] * np.maximum(0, tt) * wt
        dx = dx - fr["tailDir"][1] * k
        dy = dy + fr["tailDir"][0] * k
    dy = dy + w["WingBob"]
    return dx, dy, dz, proj


SOUL_KINDS = {"drift": DriftSoul, "flock": FlockSoul, "vortex": VortexSoul}


def make_soul(spec, seed, tl, image_loader):
    if spec["kind"] == "emblem":
        return EmblemSoul(spec, seed, tl, image_loader)
    return SOUL_KINDS[spec["kind"]](spec, seed, tl)
