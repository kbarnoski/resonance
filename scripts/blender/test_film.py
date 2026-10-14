"""Law + regression tests for the Blender film pipeline (no Blender needed).

  python3 scripts/blender/test_film.py            (numpy; Pillow for emblem images)

Skips the bundle-backed tests when ~/Documents/Resonance/unreal-bundles/<slug>
is absent. Checks Karel's laws on the CUTS (the director's numbers), before
anything renders: motion limits, eased changes, music-led joins, the Ghost arc
order and the no-figure law. The rendered films are gated separately by
scripts/flicker-meter.mjs.
"""
import json
import os
import sys
import unittest
import warnings

import numpy as np

warnings.simplefilter("ignore")  # numpy 2 + Accelerate emits spurious matmul warnings on macOS
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from resonance_film.timeline import Bundle, Timeline, envelope, load_cut, pchip  # noqa: E402
from resonance_film.souls import wing_displacement, wing_frame  # noqa: E402
from resonance_film import plates as P  # noqa: E402

BUNDLES = os.path.expanduser(os.environ.get("RESONANCE_BUNDLES", "~/Documents/Resonance/unreal-bundles"))
CUTS = os.path.join(HERE, "cuts")


def have(slug):
    return os.path.exists(os.path.join(BUNDLES, slug, "curves.csv"))


def loader_for(bundle):
    def load(rel):
        try:
            from PIL import Image
            return np.asarray(Image.open(bundle.path(rel)).convert("RGBA"), dtype=np.float32) / 255
        except ImportError:
            img = np.zeros((64, 64, 4), np.float32)
            img[16:48, 16:48] = 1
            return img
    return load


class Pure(unittest.TestCase):
    def test_pchip_no_overshoot_and_rest_ends(self):
        x = np.linspace(0, 10, 1001)
        y = pchip([0, 4, 6, 10], [0, 1, 1, 3], x)
        self.assertGreaterEqual(y.min(), -1e-9)
        self.assertLessEqual(y.max(), 3 + 1e-9)
        self.assertTrue(np.all(np.abs(y[(x > 4) & (x < 6)] - 1) < 1e-9))  # flat keys stay flat
        self.assertLess(abs(y[1] - y[0]), 1e-4)  # starts at rest

    def test_envelope_eases(self):
        t = np.linspace(0, 10, 10001)
        e = envelope(t, 1, 9, 3, 3)
        self.assertEqual(e[0], 0)
        self.assertAlmostEqual(float(e[5000]), 1.0)
        self.assertLess(np.abs(np.diff(e)).max() / (t[1] - t[0]), 0.7)  # <= 1.875/3 per second

    def test_wing_rest_pose_is_identity(self):
        w = {"view": "side", "head": [0.41, 0.45], "tail": [0.64, 0.61], "tailTip": [0.79, 0.7],
             "shoulder": [0.51, 0.465], "tip": [0.79, 0.21], "aMin": -0.1, "aMax": 0.2, "soft": 0.035}
        fr = wing_frame(w)
        q = np.random.default_rng(1).uniform(-0.5, 0.5, (500, 2))
        pose = dict(WingRoot=0, WingTip=0, WingFlex=0, WingFold=0, WingSweep=0, WingBob=0, TailSpread=0)
        dx, dy, dz, proj = wing_displacement(q, fr, pose)
        self.assertLess(np.abs(dx).max() + np.abs(dy).max() + np.abs(dz).max(), 1e-9)
        self.assertTrue(np.allclose(proj, 1.0))
        # a downstroke moves wing motes out of the picture plane, and dims them (energy-conserving)
        pose["WingRoot"] = pose["WingTip"] = 1.2
        dx, dy, dz, proj = wing_displacement(q, fr, pose)
        self.assertGreater(np.abs(dz).max(), 0.01)
        self.assertLess(proj.min(), 0.99)

    def test_plate_prep_feathers_and_inpaints(self):
        img = np.zeros((64, 64, 4), np.float32)
        img[..., :3] = 0.5
        img[28:36, 28:36, :3] = 1.0  # a bright "figure"
        out = P.prepare(img, {"exclude": [[0.5, 0.5, 0.12, 0.12]], "feather": 0.2})
        col = out["col"]
        self.assertLess(col[0, 0, 3], 0.05)          # feathered corner
        self.assertGreater(col[32, 32, 3], 0.99)     # opaque centre
        self.assertLess(abs(col[32, 32, 0] - 0.5), 0.05)  # the figure is gone (filled from its surroundings)


class CutLaws(unittest.TestCase):
    """Every cut must obey the laws before a frame is rendered."""

    def _director(self, slug, fps=30):
        from resonance_film.director import Director
        b = Bundle(os.path.join(BUNDLES, slug))
        cut = load_cut(os.path.join(CUTS, f"{slug}.json"))
        return b, cut, Director(b, cut, fps, (640, 360), loader_for(b))

    def _check_common(self, slug):
        b, cut, d = self._director(slug)
        tl = d.tl
        # camera: slow dollies (<= 0.5 m/s), and it starts/ends at rest
        self.assertLessEqual(d.cam_speed.max(), 0.5, f"{slug}: camera faster than 0.5 m/s")
        # rotation never whips (deg/s incl. sway)
        rot_rate = np.abs(np.diff(d.cam_rot_deg, axis=0)).max() * tl.fps
        self.assertLess(rot_rate, 3.0, f"{slug}: camera turns {rot_rate:.2f} deg/s")
        # every plate / soul fade >= 2 s (emblems may release in 0.5 s at the film's end, under the master fade)
        for p in d.plates:
            self.assertGreaterEqual(p["fade_in"], 2.0, f"{slug}: plate {p['id']} fades in too fast")
            if p["t_out"] < tl.duration - 0.01:
                self.assertGreaterEqual(p["fade_out"], 2.0, f"{slug}: plate {p['id']} fades out too fast")
        for s in d.souls:
            if s.kind != "emblem":
                self.assertGreaterEqual(s.fade_in, 2.0, f"{slug}: soul {s.id}")
        # master fade from / to black >= 2 s; lights change at <= 50 % of their peak per second
        self.assertGreaterEqual(d.fade_in, 2.0)
        self.assertGreaterEqual(d.fade_out, 2.0)
        for L in d.lights:
            e = L["energy_track"]
            if e.max() > 0:
                rate = np.abs(np.diff(e)).max() * tl.fps / e.max()
                self.assertLessEqual(rate, 0.5, f"{slug}: light {L.get('id')} changes {rate:.2f}x/s")
        # total plate opacity never bumps (complementary dissolves; <= 1.25 summed for additive plates)
        expo = [float(p.get("exposure", 1.0)) for p in d.plates]
        tot = np.array([d.master[i] * sum(q["op"] * e for q, e in zip(d.frame(i)["plates"], expo))
                        for i in range(0, tl.n, 3)])  # what reaches the screen (master fade included)
        self.assertLessEqual(tot.max(), 1.45, f"{slug}: plates stack to {tot.max():.2f} (a wash)")
        self.assertLess(np.abs(np.diff(tot)).max() * tl.fps / 3, 0.6, f"{slug}: plate light changes too fast")
        # the music edit: every join's centre sits within 1.5 s after a cadence or a section start
        marks = [c["t"] for c in b.events["analysis"]["cadences"]] + [s["start"] for s in b.events["analysis"]["sections"]]
        marks += [m["t"] for m in b.events["harmonicCurrents"]["marks"]]
        for k in range(1, len(tl.segs)):
            s0, s1 = tl.segs[k - 1], tl.segs[k]
            out_centre = s0["b"] - s1["x"] / 2
            gap = min(out_centre - m for m in marks if m <= out_centre + 0.2) if any(m <= out_centre + 0.2 for m in marks) else 99
            self.assertLessEqual(gap, 1.5, f"{slug}: join {k} at source {out_centre:.2f} is not on a cadence")
            self.assertGreaterEqual(s1["x"], 1.0, f"{slug}: join {k} crossfade shorter than 1 s")
        # curves stay continuous through the joins (no step the eye could see)
        for c in ("Bass", "MidKinetic", "SwellSize", "BreathPhase"):
            v = tl.curve(c)
            self.assertLess(np.abs(np.diff(v)).max(), 0.2, f"{slug}: {c} jumps")
        # focus pulls land on time and never snap
        f = np.array([d.focus_at(i) for i in range(0, tl.n, 1)])
        self.assertLess(np.abs(np.diff(1 / f)).max() * tl.fps, 0.25, f"{slug}: focus snaps")
        return b, cut, d

    @unittest.skipUnless(have("yellow-bird"), "no yellow-bird bundle")
    def test_yellow_bird(self):
        b, cut, d = self._check_common("yellow-bird")
        # both flights and the climax are in the cut
        for st in (8.0, 126.95, 99.0):
            self.assertIsNotNone(d.tl.film_time(st), f"source {st} missing from the cut")
        self.assertTrue(70 <= d.tl.duration <= 95)

    @unittest.skipUnless(have("ghost"), "no ghost bundle")
    def test_ghost_arc_and_no_figures(self):
        b, cut, d = self._check_common("ghost")
        idx = json.load(open(b.path("images/index.json")))["stills"]
        stage = {s["file"]: s.get("arcStage") for s in idx}
        seq = sorted(d.plates, key=lambda p: (p["t_in"], p["t_out"]))
        stages = [stage[p["image"]] for p in seq if p["image"] in stage]
        self.assertEqual(stages, sorted(stages), f"Ghost arc runs backwards: {stages}")
        self.assertEqual(stages[0], 1)
        self.assertEqual(stages[-1], 8)
        self.assertIn(8, [stage[p["image"]] for p in d.plates if p["t_out"] >= d.tl.duration - 0.01])
        for p in d.plates:
            full = list(p.get("crop", [0, 0, 1, 1])) == [0, 0, 1, 1]
            self.assertFalse(full and not p.get("exclude"),
                             f"Ghost plate {p['id']} shows a whole still (the figure) - crop or exclude it")
        self.assertTrue(85 <= d.tl.duration <= 105)

    @unittest.skipUnless(have("yellow-bird"), "no yellow-bird bundle")
    def test_deterministic(self):
        _, _, d1 = self._director("yellow-bird")
        _, _, d2 = self._director("yellow-bird")
        for i in (0, 300, 1200, 2400):
            a, b = d1.frame(i), d2.frame(i)
            self.assertTrue(np.array_equal(a["motes"]["pos"], b["motes"]["pos"]))
            self.assertEqual(a["plates"], b["plates"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
