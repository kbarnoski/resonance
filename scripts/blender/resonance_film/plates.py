"""Still -> plate preparation (numpy only; IO lives in scene.py).

A plate is a pack still turned into a 2.5D card:
  * `exclude` ellipses are inpainted first (push-pull diffusion) - used to
    remove the tiny figure from Ghost's cosmos stills (no literal figures);
  * `crop` keeps a figure-free region (image fractions, y down);
  * a feathered alpha (rounded-rect falloff + optional ellipse) so no plate
    ever shows a rectangle - it dissolves into the dark;
  * a blurred twin - the focus pull mixes sharp <-> blurred by the plate's
    distance from the focal plane (deterministic, noise-free depth of field);
  * a depth map for displacement (white = near): the bundle's Depth-Anything
    map, or a synthetic profile ('radial' tunnel, 'ground', 'dome') for Ghost,
    which has none.
Colours are stored PREMULTIPLIED by alpha.
"""
import numpy as np


def box_blur(img, r):
    """Separable box blur, radius r px, edge-clamped; img HxW or HxWxC."""
    if r < 1:
        return img
    r = int(r)
    out = img.astype(np.float32)
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (r + 1, r)
        p = np.pad(out, pad, mode="edge")
        c = np.cumsum(p, axis=axis, dtype=np.float64)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return out


def gauss_blur(img, sigma):
    """~Gaussian = three box blurs."""
    if sigma < 0.5:
        return img
    r = max(1, int(round(np.sqrt(12 * sigma * sigma / 3 + 1) / 2)))
    out = img
    for _ in range(3):
        out = box_blur(out, r)
    return out


def inpaint(img, mask, iters=6):
    """Fill mask==1 pixels from their surroundings (multi-scale normalised blur)."""
    H, W = mask.shape
    keep = (1.0 - mask).astype(np.float32)
    out = img.copy()
    fill = np.zeros_like(img)
    have = np.zeros((H, W), np.float32)
    for k in range(iters, -1, -1):
        sigma = 1.5 * (2 ** k)
        num = gauss_blur(img * keep[..., None], sigma)
        den = gauss_blur(keep, sigma)[..., None]
        est = num / np.maximum(den, 1e-4)
        w = np.clip(den[..., 0] * 4, 0, 1)
        fill = fill * (1 - w[..., None]) + est * w[..., None] if k < iters else est
        have = np.maximum(have, w)
    m = gauss_blur(mask.astype(np.float32), 2.0)[..., None]
    out = img * (1 - m) + fill * m
    return out


def ellipse_mask(H, W, cx, cy, rx, ry):
    yy, xx = np.mgrid[0:H, 0:W]
    u = ((xx + 0.5) / W - cx) / rx
    v = ((yy + 0.5) / H - cy) / ry
    return (u * u + v * v <= 1.0).astype(np.float32)


def feather_alpha(h, w, feather=0.12, ellipse=0.0):
    """Rounded-rect falloff (feather = fraction of the shorter side) times an
    optional elliptical vignette (0 = none, 1 = full ellipse)."""
    yy, xx = np.mgrid[0:h, 0:w]
    fx = (xx + 0.5) / w
    fy = (yy + 0.5) / h
    m = min(h, w)
    fpx = max(1.0, feather * m)
    dx = np.minimum(xx + 0.5, w - xx - 0.5) / fpx
    dy = np.minimum(yy + 0.5, h - yy - 0.5) / fpx
    a = _ss(np.clip(dx, 0, 1)) * _ss(np.clip(dy, 0, 1))
    if ellipse > 0:
        r = np.sqrt(((fx - 0.5) / 0.5) ** 2 + ((fy - 0.5) / 0.5) ** 2)
        e = 1.0 - _ss(np.clip((r - 0.55) / 0.45, 0, 1))
        a = a * (1 - ellipse + ellipse * e)
    return a.astype(np.float32)


def _ss(u):
    return u * u * (3 - 2 * u)


def crop_px(img, crop):
    H, W = img.shape[:2]
    x0, y0, x1, y1 = crop
    return img[int(round(y0 * H)):int(round(y1 * H)), int(round(x0 * W)):int(round(x1 * W))]


def synth_depth(h, w, mode):
    yy, xx = np.mgrid[0:h, 0:w]
    fx = (xx + 0.5) / w
    fy = (yy + 0.5) / h
    if mode == "radial":   # a tunnel: the centre is far, the walls are near
        r = np.sqrt(((fx - 0.5) / 0.5) ** 2 + ((fy - 0.5) / 0.5) ** 2)
        d = _ss(np.clip((r - 0.08) / 0.85, 0, 1))
    elif mode == "ground":  # a floor / pool: the bottom is near
        d = np.clip(fy, 0, 1) ** 1.6
    elif mode == "dome":    # a form: the centre is near
        r = np.sqrt(((fx - 0.5) / 0.5) ** 2 + ((fy - 0.5) / 0.5) ** 2)
        d = 1 - _ss(np.clip(r, 0, 1))
    else:
        d = np.zeros((h, w))
    return d.astype(np.float32)


def prepare(rgba, spec, depth=None):
    """rgba: HxWx4 float (row 0 = top). depth: HxW float or None.
    Returns dict(col, blur, depth, aspect) - col/blur premultiplied RGBA."""
    img = rgba[..., :3].astype(np.float32)
    H, W = img.shape[:2]
    for ex in spec.get("exclude", []):
        img = inpaint(img, ellipse_mask(H, W, *ex))
    crop = spec.get("crop", [0, 0, 1, 1])
    img = crop_px(img, crop)
    h, w = img.shape[:2]
    a = feather_alpha(h, w, float(spec.get("feather", 0.12)), float(spec.get("ellipse", 0.0)))
    if spec.get("lumaKey"):
        # luminous subjects on black: alpha follows light, so black never occludes
        lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        a = a * np.clip((lum - 0.02) / 0.18, 0, 1) ** 0.8
    col = np.concatenate([img * a[..., None], a[..., None]], axis=2)
    sig = float(spec.get("blurSigma", 0.014)) * max(h, w)
    blur = gauss_blur(col, sig)
    dmode = spec.get("depth")
    if depth is not None:
        d = crop_px(depth, crop)
        d = np.clip(d, 0, 1) ** float(spec.get("depthPower", 1.5))
    elif isinstance(dmode, str) and dmode in ("radial", "ground", "dome"):
        d = synth_depth(h, w, dmode)
    else:
        d = None
    if d is not None:
        d = gauss_blur(d.astype(np.float32), max(1.0, 0.006 * max(h, w)))
    return {"col": col, "blur": blur, "depth": d, "aspect": w / h}
