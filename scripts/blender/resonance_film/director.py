"""The director: every frame's state as a pure function of film time.

Camera (dolly keys through a monotone spline, a steady-clock sway), focus
pulls that land ON cadences / section starts, plate opacities (eased >= 2 s,
plus a proximity fade as the camera passes through a plate), the souls,
light energies (keyed, eased), the fog tint (palette, eased over >= 4 s) and
the master fade from / to black. numpy only - scene.py applies it in Blender.
"""
import math

import numpy as np

from .souls import FrameCtx, make_soul
from .timeline import Timeline, envelope, hex_rgb, pchip, smootherstep, smoothstep

CURVES = ["Bass", "Mid", "BassKinetic", "MidKinetic", "OnsetEnv", "SwellSize", "SwellDensity",
          "BreathPhase", "BreathAmount", "CurrentTension", "Intensity", "EmblemForm"]


def euler_matrix(rx, ry, rz):
    """Blender XYZ euler -> 3x3 (R = Rz @ Ry @ Rx)."""
    cx, sx = math.cos(rx), math.sin(rx)
    cy, sy = math.cos(ry), math.sin(ry)
    cz, sz = math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


class Director:
    def __init__(self, bundle, cut, fps, res, image_loader):
        self.bundle = bundle
        self.cut = cut
        self.fps = fps
        self.res = res
        tl = Timeline(bundle, cut, fps)
        self.tl = tl
        n = tl.n
        t = tl.t
        cam = cut["camera"]
        self.lens = float(cam.get("lens", 40))
        tl.tanH = 18.0 / self.lens            # 36 mm sensor, horizontal fit
        tl.tanV = tl.tanH * res[1] / res[0]
        self.tanH, self.tanV = tl.tanH, tl.tanV

        # ── camera ───────────────────────────────────────────────────────
        keys = cam["keys"]
        kt = [tl.resolve(k[0]) for k in keys]
        kp = [k[1] for k in keys]
        kr = [k[2] if len(k) > 2 else [0, 0, 0] for k in keys]
        self.cam_pos = pchip(kt, kp, t)
        rot = pchip(kt, kr, t)  # pitch, yaw, roll (degrees)
        sway = cam.get("sway", {})
        rot[:, 1] += float(sway.get("yaw", 0.0)) * np.sin(2 * np.pi * 0.071 * t + 0.4)
        rot[:, 2] += float(sway.get("roll", 0.0)) * np.sin(2 * np.pi * 0.053 * t + 1.3)
        rot[:, 0] += float(sway.get("pitch", 0.0)) * np.sin(2 * np.pi * 0.047 * t + 2.1)
        self.cam_rot_deg = rot
        self.cam_euler = np.stack([np.radians(90 + rot[:, 0]), np.radians(rot[:, 2]), np.radians(rot[:, 1])], axis=1)
        step = np.linalg.norm(np.diff(self.cam_pos, axis=0), axis=1)
        self.travel = np.concatenate([[0], np.cumsum(step)])
        self.cam_speed = np.concatenate([[0], step * fps])

        # ── curves, clocks, onsets, swirls ───────────────────────────────
        self.cv = {c: tl.curve(c) for c in CURVES}
        fl = cut.get("flow", {})
        rate = (float(fl.get("base", 0.4)) + float(fl.get("bass", 1.2)) * self.cv["BassKinetic"]
                + float(fl.get("mid", 0.6)) * self.cv["MidKinetic"])
        self.clk = {"flow": tl.clock(rate)}
        self.onsets = tl.onsets()
        sw = cut.get("swirls", {})
        self.sw_min = float(sw.get("minStrength", 0.6))
        self.sw_angle = float(sw.get("angle", 0.4))
        self.sw_radius = float(sw.get("radius", 0.13))
        self.sw_rise = float(sw.get("rise", 0.6))
        self.sw_decay = float(sw.get("decay", 2.4))
        self.swirl_events = []
        for k, (ft, s, p) in enumerate(self.onsets):
            if s >= self.sw_min:
                g1 = (k * 0.6180339887) % 1.0
                g2 = (k * 0.7548776662) % 1.0
                cx = (g1 * 2 - 1) * 0.75 * self.tanH
                cy = (g2 * 2 - 1) * 0.6 * self.tanV
                sign = 1 if k % 2 == 0 else -1
                self.swirl_events.append((ft, s, cx, cy, sign))

        # ── palette ──────────────────────────────────────────────────────
        self.pal = tl.palette_track(float(cut.get("paletteEase", 4.0)))

        # ── plates ───────────────────────────────────────────────────────
        self.plates = []
        for spec in cut.get("plates", []):
            p = dict(spec)
            p["t_in"] = tl.resolve(spec["in"])
            p["t_out"] = tl.resolve(spec["out"])
            p["fade_in"] = float(spec.get("fade_in", spec.get("fade", 3.0)))
            p["fade_out"] = float(spec.get("fade_out", spec.get("fade", 3.0)))
            at = tl.resolve(spec.get("at", spec["in"]))
            ia = min(n - 1, max(0, int(round(at * fps))))
            c = self.cam_pos[ia]
            dist = float(spec.get("dist", 6.0))
            off = spec.get("offset", [0.0, 0.0])
            p["pos"] = [c[0] + off[0], c[1] + dist, c[2] + off[1]]
            p["dist_at"] = dist
            self.plates.append(p)

        # ── souls ────────────────────────────────────────────────────────
        self.souls = []
        for k, spec in enumerate(cut.get("souls", [])):
            if spec.get("wing") == "bundle":
                spec = dict(spec, wing=bundle.events["emblems"]["signatureFlight"]["wing"])
            s = make_soul(spec, 1000 + 17 * k, tl, image_loader)
            s.id = spec.get("id", f"soul{k}")
            s.prepare(tl, self)
            self.souls.append(s)
        self.n_motes = sum(s.count for s in self.souls)

        # ── lights ───────────────────────────────────────────────────────
        self.lights = []
        for spec in cut.get("lights", []):
            ek = spec["energy"]
            et = [tl.resolve(a) for a, _ in ek]
            ev = [b for _, b in ek]
            L = dict(spec)
            L["energy_track"] = pchip(et, ev, t) if len(et) > 1 else np.full(n, ev[0])
            self.lights.append(L)

        # ── focus ────────────────────────────────────────────────────────
        self.focus_keys = []
        for k in cut.get("focus", [[0, 6.0]]):
            land = tl.resolve(k[0])
            pull = float(k[2]) if len(k) > 2 else float(cut.get("focusPull", 1.8))
            self.focus_keys.append((land, k[1], pull))
        self.focus_keys.sort(key=lambda x: x[0])
        dof = cut.get("dof", {})
        self.dof_range = float(dof.get("range", 0.45))
        self.aperture = float(dof.get("aperture", 0.03))

        # ── look ─────────────────────────────────────────────────────────
        look = cut.get("look", {})
        self.look = look
        self.fade_in = float(cut.get("fadeIn", 3.5))
        self.fade_out = float(cut.get("fadeOut", 4.5))
        self.master = envelope(t, 0.0, tl.duration, self.fade_in, self.fade_out)
        fk = look.get("fogKeys")
        if fk:
            self.fog = pchip([tl.resolve(a) for a, _ in fk], [b for _, b in fk], t)
        else:
            self.fog = np.full(n, float(look.get("fog", 0.01)))

    # ------------------------------------------------------------------
    def forward(self, i):
        R = euler_matrix(*self.cam_euler[i])
        return R, R @ np.array([0.0, 0.0, -1.0])

    def target_distance(self, target, i):
        if isinstance(target, (int, float)):
            return float(target)
        kind, _, name = str(target).partition(":")
        R, fwd = self.forward(i)
        if kind == "plate":
            for p in self.plates:
                if p["id"] == name:
                    return max(0.3, float(np.dot(np.array(p["pos"]) - self.cam_pos[i], fwd)))
        if kind == "soul":
            for s in self.souls:
                if s.id == name:
                    return float(getattr(s, "depth", 6.0))
        raise ValueError(f"unknown focus target {target}")

    def focus_at(self, i):
        t = self.tl.t[i]
        keys = self.focus_keys
        cur = 0
        for k, (land, _, pull) in enumerate(keys):
            if land - pull <= t:
                cur = k
        land, tgt, pull = keys[cur]
        d_new = self.target_distance(tgt, i)
        if cur == 0 or t >= land:
            return d_new
        d_old = self.target_distance(keys[cur - 1][1], i)
        u = float(smootherstep(land - pull, land, t))
        # pull in dioptres (1/d) - how a focus puller's ring feels
        return 1.0 / ((1 - u) / d_old + u / d_new)

    def swirls_at(self, t):
        out = []
        for ft, s, cx, cy, sign in self.swirl_events:
            tau = t - ft
            if tau <= 0 or tau > self.sw_decay * 4 + self.sw_rise:
                continue
            a = float(smoothstep(0, self.sw_rise, tau)) * math.exp(-max(0.0, tau - self.sw_rise) / self.sw_decay)
            out.append((cx, cy, sign * self.sw_angle * s * a, self.sw_radius))
        return out

    def frame(self, i):
        tl = self.tl
        t = float(tl.t[i])
        R, fwd = self.forward(i)
        cam = self.cam_pos[i]
        focus = self.focus_at(i)
        pal = {k: v[i] for k, v in self.pal.items()}
        cv = {k: float(v[i]) for k, v in self.cv.items()}
        ctx = FrameCtx(i=i, t=t, tanH=self.tanH, tanV=self.tanV, travel=float(self.travel[i]),
                       focus=focus, cv=cv, clk={k: float(v[i]) for k, v in self.clk.items()},
                       pal=pal, swirls=self.swirls_at(t))
        # plates
        plates = []
        for p in self.plates:
            d = float(np.dot(np.array(p["pos"]) - cam, fwd))
            op = float(envelope(t, p["t_in"], p["t_out"], p["fade_in"], p["fade_out"]))
            if p.get("through", True):
                op *= float(smoothstep(0.5, 2.2, d))
            elif d < 0.3:
                op = 0.0
            blur = min(1.0, abs(d - focus) / max(0.2, self.dof_range * focus)) ** 0.8 if d > 0 else 1.0
            plates.append({"op": op * float(p.get("gain", 1.0)), "blur": blur, "dist": d})
        # souls
        P, S, A, C = [], [], [], []
        for s in self.souls:
            p, sz, a, c = s.frame(ctx)
            P.append(p)
            S.append(sz)
            A.append(a)
            C.append(c)
        if P:
            p = np.concatenate(P)
            size = np.concatenate(S)
            alpha = np.concatenate(A)
            col = np.concatenate(C)
            depth = np.maximum(0.05, -p[:, 2])
            rb = self.aperture * np.abs(depth - focus) / focus
            seff = np.minimum(np.sqrt(size * size + rb * rb), 0.22)
            alpha = alpha * (size / np.maximum(seff, 1e-6)) ** 2
            alpha *= smoothstep(0.35, 1.0, depth)  # never a mote in the lens
            world = cam[None, :] + p @ R.T
            motes = {"pos": world.astype(np.float32), "size": seff.astype(np.float32),
                     "alpha": np.clip(alpha, 0, 1).astype(np.float32), "col": col.astype(np.float32)}
        else:
            motes = None
        lights = []
        for L in self.lights:
            col = L.get("color", "glow")
            rgb = pal["glow"] if col == "glow" else (pal["mote"] if col == "phase" else hex_rgb(col))
            lights.append({"energy": float(L["energy_track"][i]), "color": list(rgb)})
        fogc = self.look.get("fogColor", "key")
        if fogc == "key":
            fog_rgb = np.asarray(pal["key"])
            fog_rgb = fog_rgb / max(1e-3, fog_rgb.max()) * 0.6
        else:
            fog_rgb = np.asarray(hex_rgb(fogc))
        return {"t": t, "cam_pos": cam.tolist(), "cam_euler": self.cam_euler[i].tolist(), "focus": focus,
                "plates": plates, "motes": motes, "lights": lights, "fog": float(self.fog[i]),
                "fog_color": fog_rgb.tolist(), "master": float(self.master[i])}
